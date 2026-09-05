import { useCallback, useState } from 'react';
import { Alert, Linking } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { supabase } from '@/lib/supabase';
import { useAI } from '@/features/pro';
import { haptic } from '@/lib/haptics';
import { analytics } from '@/lib/analytics';

/** One food identified in the photo. Mirrors the edge function's response. */
export interface PhotoItem {
  item:       string;
  portion:    string;
  calories:   number;
  protein:    number;
  carbs:      number;
  fat:        number;
  fibre:      number;
  sugar:      number;
  sodium:     number;
  sat_fat:    number;
  confidence: number;
}

export interface PhotoTotals {
  calories: number;
  protein:  number;
  carbs:    number;
  fat:      number;
  fibre:    number;
  sugar:    number;
  sodium:   number;
  sat_fat:  number;
}

export interface PhotoResult {
  items:          PhotoItem[];
  total:          PhotoTotals;
  meal_name:      string | null;
  notes:          string | null;
  avg_confidence?: number;
  /** Local file URI of the captured photo, for immediate preview. */
  localUri:       string;
  /** Downscaled JPEG bytes, reused for upload so the file isn't re-read. */
  base64:         string;
}

export type PhotoStage = 'idle' | 'capturing' | 'preparing' | 'analyzing';

// The vision model is called with detail:"low", which downsamples to roughly
// 512px anyway. Sending more than this costs upload time on a mobile network
// and buys no accuracy.
const MAX_EDGE = 1024;
const JPEG_QUALITY = 0.7;

export function usePhotoLog() {
  const [stage,  setStage]  = useState<PhotoStage>('idle');
  const [result, setResult] = useState<PhotoResult | null>(null);
  const [error,  setError]  = useState<string | null>(null);
  const invoke = useAI();

  const reset = useCallback(() => {
    setResult(null);
    setError(null);
    setStage('idle');
  }, []);

  /**
   * Capture (or pick) a photo, downscale it, and ask the edge function what's
   * on the plate. Returns the parsed result, or null if the user cancelled or
   * something failed — `error` holds the message in the failure case.
   */
  const capture = useCallback(async (source: 'camera' | 'library' = 'camera') => {
    setError(null);
    setResult(null);

    try {
      // ── Permission ────────────────────────────────────────────────────
      const perm = source === 'camera'
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();

      if (!perm.granted) {
        // canAskAgain === false means the user has permanently denied it, so
        // re-prompting does nothing and Settings is the only way back.
        if (perm.canAskAgain === false) {
          Alert.alert(
            source === 'camera' ? 'Camera access needed' : 'Photo access needed',
            `Nourish needs ${source === 'camera' ? 'camera' : 'photo'} access to log meals from a picture.`,
            [
              { text: 'Not now', style: 'cancel' },
              { text: 'Open settings', onPress: () => Linking.openSettings() },
            ],
          );
        }
        setStage('idle');
        return null;
      }

      // ── Capture ───────────────────────────────────────────────────────
      setStage('capturing');
      const picked = source === 'camera'
        ? await ImagePicker.launchCameraAsync({
            mediaTypes: ['images'],
            quality: 1,
            exif: false,
          })
        : await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ['images'],
            quality: 1,
            exif: false,
          });

      if (picked.canceled || !picked.assets?.[0]) {
        setStage('idle');
        return null;
      }

      const asset = picked.assets[0];
      haptic.light();

      // ── Downscale ─────────────────────────────────────────────────────
      // Fewer bytes over the wire and fewer image tokens. Resizing by the
      // longer edge preserves the aspect ratio either way round.
      setStage('preparing');
      const longEdge = Math.max(asset.width ?? 0, asset.height ?? 0);
      const resizeTo = longEdge > MAX_EDGE
        ? (asset.width >= asset.height ? { width: MAX_EDGE } : { height: MAX_EDGE })
        : null;

      // SDK 56 object-oriented API; manipulateAsync is deprecated.
      const ctx = ImageManipulator.manipulate(asset.uri);
      if (resizeTo) ctx.resize(resizeTo);
      const rendered = await ctx.renderAsync();
      const manipulated = await rendered.saveAsync({
        compress: JPEG_QUALITY,
        format:   SaveFormat.JPEG,
        base64:   true,
      });

      const base64 = manipulated.base64;
      if (!base64) throw new Error('Could not read that photo');

      // ── Analyze ───────────────────────────────────────────────────────
      setStage('analyzing');
      const data = await invoke<Omit<PhotoResult, 'localUri'>>('lookup-nutrition-photo', {
        image_base64: base64,
        mime_type:    'image/jpeg',
      });

      const full: PhotoResult = { ...data, localUri: manipulated.uri, base64 };

      if (!data.items || data.items.length === 0) {
        // Not an error — the model looked and found no food. Surface its note.
        haptic.warning();
        setError(data.notes ?? "We couldn't spot any food in that photo.");
        setStage('idle');
        return null;
      }

      haptic.success();
      analytics.photoLogged({
        items:      data.items.length,
        calories:   data.total?.calories ?? 0,
        confidence: data.avg_confidence ?? 0,
      });
      setResult(full);
      setStage('idle');
      return full;
    } catch (e) {
      // useAI() already surfaces rate-limit (429) toasts, so anything landing
      // here is unexpected — show the message rather than swallowing it.
      const msg = e instanceof Error ? e.message : 'Something went wrong';
      setError(msg);
      setStage('idle');
      haptic.warning();
      return null;
    }
  }, [invoke]);

  /**
   * Persist the photo to Storage under the user's own folder.
   * Takes the base64 produced during capture, so the file is never re-read.
   * Best-effort: a failed upload must never block logging the meal, so this
   * returns null instead of throwing.
   */
  const uploadPhoto = useCallback(async (base64: string, userId: string): Promise<string | null> => {
    try {
      // Storage policies check that the first path segment is the caller's uid.
      const path = `${userId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;
      const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));

      const { error: upErr } = await supabase.storage
        .from('meal-photos')
        .upload(path, bytes, { contentType: 'image/jpeg', upsert: false });

      if (upErr) return null;
      return path;
    } catch {
      return null;
    }
  }, []);

  return { stage, result, error, capture, uploadPhoto, reset, setResult };
}
