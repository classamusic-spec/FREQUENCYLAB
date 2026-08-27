import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

/**
 * Haptics.
 *
 * The rule that matters is the rate limit. A rotary encoder that fires a tick
 * on every value change becomes a buzzing nuisance within one gesture, so
 * detents are throttled and the *first* detent of a gesture always fires
 * (§31, §35). Haptics are a global preference and are skipped entirely when off.
 */

const MIN_DETENT_INTERVAL_MS = 45;

let enabled = true;
let lastDetentAt = 0;

export function setHapticsEnabled(value: boolean): void {
  enabled = value;
}

export function hapticsEnabled(): boolean {
  return enabled;
}

function supported(): boolean {
  return enabled && (Platform.OS === 'ios' || Platform.OS === 'android');
}

/** One encoder detent. Rate limited; safe to call from a gesture handler. */
export function detent(): void {
  if (!supported()) return;
  const now = Date.now();
  if (now - lastDetentAt < MIN_DETENT_INTERVAL_MS) return;
  lastDetentAt = now;
  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
}

/** A stronger detent for a meaningful boundary — a band edge, a snap point. */
export function boundary(): void {
  if (!supported()) return;
  lastDetentAt = Date.now();
  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
}

/** A control being engaged: button press, segment change. */
export function engage(): void {
  if (!supported()) return;
  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Rigid);
}

/** Session start, protocol saved — a completed, deliberate action. */
export function confirm(): void {
  if (!supported()) return;
  void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
}

/** Session complete. */
export function complete(): void {
  if (!supported()) return;
  void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
}

export function warn(): void {
  if (!supported()) return;
  void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
}

/** Resets the throttle, so the next detent of a new gesture always fires. */
export function beginGesture(): void {
  lastDetentAt = 0;
}
