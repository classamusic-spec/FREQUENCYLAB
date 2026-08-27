import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';
import { usePreferences } from '../state/preferences';

/**
 * True when animation should be suppressed.
 *
 * Two sources, either of which wins: the OS accessibility setting, and the
 * in-app preference. Reduced motion here means state changes are instant rather
 * than merely faster — a shortened animation is still animation (§34).
 */
export function useReducedMotion(): boolean {
  const preference = usePreferences((state) => state.preferences.reducedMotion);
  const [systemSetting, setSystemSetting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((value) => {
        if (!cancelled) setSystemSetting(value);
      })
      .catch(() => undefined);
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setSystemSetting);
    return () => {
      cancelled = true;
      subscription.remove();
    };
  }, []);

  return preference || systemSetting;
}
