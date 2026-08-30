import { type ExperienceLevel } from '@frequencylab/dsp-core';
import { usePreferences } from '../state/preferences';
import { type Capability, levelCanSee, levelOpensRoute } from './tierCapabilities';

/**
 * The tier, as the app consults it.
 *
 * The rules themselves — which level sees what, and the plain words that stand
 * in for the vocabulary a level hides — are in `tierCapabilities`, which is
 * plain TypeScript so the contract can be tested. This file is the one line of
 * that which needs React: reading the level out of the preferences store.
 *
 * Re-exported wholesale, so a screen imports `features/tier` for all of it and
 * does not have to know the split exists.
 */
export * from './tierCapabilities';

/**
 * The tier the user is at, and what it lets them see.
 *
 * `canSee` rather than the raw level, so a screen states the reason it is
 * hiding something. Read the level directly only where the *level itself* is
 * the subject — the Profile control that changes it, and the prompt that offers
 * an upgrade.
 */
export function useTier(): {
  level: ExperienceLevel;
  canSee: (capability: Capability) => boolean;
  /**
   * Whether a route opens at this level, or meets a door.
   *
   * Asked at both ends of the same link: by the screen behind the door before
   * it renders itself, and by any screen that would otherwise offer a tap into
   * it. Those two used to be separate judgements, and the Library tab spent a
   * release offering Simple eleven links into doors because of it.
   */
  opensRoute: (route: string) => boolean;
  isSimple: boolean;
} {
  const level = usePreferences((state) => state.preferences.experienceLevel);
  return {
    level,
    canSee: (capability) => levelCanSee(level, capability),
    opensRoute: (route) => levelOpensRoute(level, route),
    isSimple: level === 'simple',
  };
}

