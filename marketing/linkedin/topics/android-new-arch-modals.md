# Topic: My modals were opening invisibly on Android

## Working titles
- *"The drawer was opening on Android. I just couldn't see it."*
- *"`FullWindowOverlay` on Android = a no-op + a warning"*
- *"The Android New Architecture broke my UI silently"*

## What actually happened

User report: "the drawer doesn't open on Android."

I tried it on Android. They were right — tap the hamburger, nothing visible happens. Tap again, nothing. Tap outside, nothing.

Except… tapping the area where the drawer's backdrop *should* be was closing it. The drawer was opening. It just wasn't rendering anything visible.

I'd been using `FullWindowOverlay` from `react-native-screens` to render the drawer above my floating tab bar. iOS worked fine. On Expo SDK 56 with the New Architecture enabled, `FullWindowOverlay` is a no-op on Android — it renders nothing, prints one warning to Logcat that I'd been ignoring as a deprecation notice.

The fix:
```tsx
<Modal
  visible={open}
  transparent
  statusBarTranslucent
  hardwareAccelerated     // ← the thing that actually makes it work
  animationType="none"
  onRequestClose={dismiss}
>
  <View style={StyleSheet.absoluteFill}>
    {/* ...sheet content... */}
  </View>
</Modal>
```

`hardwareAccelerated` does nothing on iOS. On Android with the New Architecture, it's the difference between "the modal renders" and "the modal silently fails to render on certain devices."

Three sheets had the same bug: the drawer, the notification sheet, the "How it works" modal. None of them threw an error. None of them broke on iOS. Only Android Logcat hinted at the cause.

## The takeaway

Cross-platform components silently degrade. If something only breaks on one OS, search the docs of the platform that's *failing* — not the one that works. The platform that works is hiding the bug from you.

Sub-lesson: read your platform warnings. The "X is a no-op" line had been in my Logcat for weeks. I'd treated it as deprecation noise. It was the answer.

## What NOT to over-claim
- This is documented if you look. The point isn't that the fix is hidden. It's that it's *easy to miss* because iOS keeps working.

## Final post
*(Add final version here.)*
