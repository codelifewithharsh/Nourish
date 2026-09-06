import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { ActionSheetIOS, Alert, Platform } from 'react-native';
import { supabase } from '@/lib/supabase';
import { haptic } from '@/lib/haptics';
import { analytics } from '@/lib/analytics';
import { todayStr } from '@/lib/date';
import { usePhotoLog, type PhotoItem } from './usePhotoLog';
import { PhotoResultSheet, type MealType } from './components/PhotoResultSheet';

interface StartOptions {
  /** Pre-selects the meal type, so scanning from a dinner card logs as dinner. */
  mealType?: MealType;
  /**
   * Where the photo comes from. 'ask' offers the choice first — the OS camera
   * has no gallery affordance of its own, so a user photographing a meal they
   * already have a picture of would otherwise be stuck retaking it.
   */
  source?:   'camera' | 'library' | 'ask';
}

interface PhotoLogContext {
  /** Opens the camera (or library) and runs the whole capture → review → log flow. */
  start:   (opts?: StartOptions) => void;
  /** True while a photo is being captured, prepared or analysed. */
  busy:    boolean;
  /** Registers a callback fired after rows are written, so screens can refetch. */
  onLogged: (fn: () => void) => () => void;
}

const Ctx = createContext<PhotoLogContext | null>(null);

function currentMealType(): MealType {
  const h = new Date().getHours();
  if (h < 11) return 'breakfast';
  if (h < 15) return 'lunch';
  if (h < 18) return 'snack';
  return 'dinner';
}

/**
 * Owns photo logging for the whole app.
 *
 * Capture used to live inside the Scan tab, which meant reaching it was a
 * navigation. Logging a meal is an action, not a destination, so the flow
 * lives here instead: the tab bar's camera button and every meal card's
 * "Scan" button call the same `start()`, and the review sheet renders above
 * whatever screen the user was already on.
 */
export function PhotoLogProvider({ children }: { children: ReactNode }) {
  const photo = usePhotoLog();
  const [mealType, setMealType] = useState<MealType>(currentMealType());
  const [saving, setSaving]     = useState(false);
  const [listeners] = useState(() => new Set<() => void>());

  useEffect(() => {
    if (photo.error) {
      Alert.alert('Photo logging', photo.error);
      photo.reset();
    }
  }, [photo.error]);

  const onLogged = useCallback((fn: () => void) => {
    listeners.add(fn);
    return () => { listeners.delete(fn); };
  }, [listeners]);

  const start = useCallback((opts?: StartOptions) => {
    setMealType(opts?.mealType ?? currentMealType());
    const source = opts?.source ?? 'camera';

    if (source !== 'ask') {
      photo.capture(source);
      return;
    }

    // Native chooser rather than a custom sheet: it's one tap either way, and
    // it's the interaction people already know from every other app.
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: ['Cancel', 'Take a photo', 'Choose from gallery'],
          cancelButtonIndex: 0,
        },
        (i) => {
          if (i === 1) photo.capture('camera');
          if (i === 2) photo.capture('library');
        },
      );
      return;
    }

    Alert.alert('Log this meal', 'Where should we get the photo from?', [
      { text: 'Take a photo',        onPress: () => photo.capture('camera') },
      { text: 'Choose from gallery', onPress: () => photo.capture('library') },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }, [photo.capture]);

  // One row per identified item, so the timeline shows "Roti" and "Dal"
  // separately rather than one opaque blob. They share a photo_path, which is
  // what lets the UI group them back together later.
  const handleConfirm = useCallback(async (items: PhotoItem[]) => {
    if (!photo.result) return;
    setSaving(true);
    haptic.success();
    try {
      // Resolved here rather than held in state: a confirm that lands before
      // the auth lookup resolves would otherwise silently drop the meal.
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { Alert.alert('Could not save', 'Please sign in again.'); return; }
      const userId = user.id;

      const photoPath = await photo.uploadPhoto(photo.result.base64, userId);
      const rows = items.map((it) => ({
        user_id:    userId,
        date:       todayStr(),
        meal_type:  mealType,
        meal_name:  it.item,
        calories:   it.calories,
        protein:    it.protein,
        carbs:      it.carbs,
        fat:        it.fat,
        fibre:      it.fibre,
        sugar:      it.sugar,
        sodium:     it.sodium,
        sat_fat:    it.sat_fat,
        source:     'photo',
        photo_path: photoPath,
      }));

      const { error } = await supabase.from('daily_logs').insert(rows);
      if (error) {
        Alert.alert('Could not save', 'Please try again.');
        return;
      }

      analytics.logEntryAdded({
        meal_type: mealType,
        calories:  items.reduce((n, i) => n + i.calories, 0),
        protein:   items.reduce((n, i) => n + i.protein, 0),
      });

      photo.reset();
      listeners.forEach((fn) => fn());
    } finally {
      setSaving(false);
    }
  }, [photo, mealType, listeners]);

  const busy = photo.stage !== 'idle';

  return (
    <Ctx.Provider value={{ start, busy, onLogged }}>
      {children}
      <PhotoResultSheet
        visible={photo.result !== null}
        result={photo.result}
        saving={saving}
        mealType={mealType}
        onChangeMealType={setMealType}
        onConfirm={handleConfirm}
        onRetake={() => {
          // Offer the same source the last attempt used — reset() clears
          // photo.result, so the source has to be read before that fires or
          // a gallery pick would always fall through to "camera" instead.
          const source = photo.result?.source ?? 'camera';
          photo.reset();
          photo.capture(source);
        }}
        onClose={photo.reset}
      />
    </Ctx.Provider>
  );
}

export function usePhotoLogger(): PhotoLogContext {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('usePhotoLogger must be used inside PhotoLogProvider');
  return ctx;
}
