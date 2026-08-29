import { useCallback, useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import {
  DEFAULT_ACOUSTIC_MIX,
  MIXER_GROUPS,
  MIXER_GROUP_LABELS,
  MIXER_MIN_DB,
  isDefaultMix,
  mixerDb,
  mixerGain,
  mixerGroupForInstrument,
  withGroupLevel,
  withSpace,
  type AcousticMix,
  type MixerGroup,
} from '@frequencylab/dsp-core';
import { Screen, ScreenHeader } from '../src/design/components/Screen';
import { InstrumentPanel, PanelRow } from '../src/design/components/InstrumentPanel';
import { HardwareButton } from '../src/design/components/HardwareButton';
import { AcousticMixer, type MixerGroupRow } from '../src/design/components/AcousticMixer';
import { Text } from '../src/design/components/Text';
import { space } from '../src/design/tokens';
import { usePlayer } from '../src/state/player';
import { usePreferences } from '../src/state/preferences';
import { useTier } from '../src/features/tier';
import { sessionController } from '../src/audio/sessionController';
import { organicRegistry } from '../src/audio/organic/program';

/**
 * The acoustic mixer (§31).
 *
 * Per-instrument levels for the sound bath, the room it plays in, and the level
 * of the core signal it plays over. Everything here is wired: a fader moves a
 * gain node that already stands between a group of voices and the organic bus,
 * so it changes what is ringing now as well as what the look-ahead has not
 * committed yet.
 *
 * ## What decides which faders appear
 *
 * §92, applied literally. A strip is drawn only where there is material behind
 * it — while a sound bath is playing that means the groups its plan actually
 * contains, and while nothing is playing it means the groups the library has
 * recordings for, because the mix is what the next session will start at. In
 * both cases the caption under a fader states the real count it came from, so
 * the difference between "this instrument is quiet" and "this instrument is not
 * in this session" is on screen rather than left to be inferred.
 *
 * ## Where the values live
 *
 * The acoustic mix belongs to the session controller, which holds it across
 * stops, backend restarts and route changes and hands it to every organic layer
 * it builds. This screen mirrors it into local state on mount and writes
 * through on every change; the controller is the single source of truth, not
 * this component.
 *
 * The core level is deliberately *not* part of that mix. It is the comfortable
 * output level calibration sets and every session starts from, and it already
 * has one home in `UserPreferences`. A second copy here would be a second
 * source of truth free to disagree with the first — so the fader ramps the live
 * renderer as it moves and writes the preference once the fader has settled.
 */
export default function MixerScreen() {
  const router = useRouter();
  const { canSee } = useTier();
  const snapshot = usePlayer((state) => state.snapshot);
  const soundBath = usePlayer((state) => state.soundBath);
  const setMasterGain = usePlayer((state) => state.setMasterGain);
  const preferences = usePreferences((state) => state.preferences);
  const updatePreferences = usePreferences((state) => state.update);

  const [mix, setMix] = useState<AcousticMix>(() => sessionController.currentAcousticMix);
  // Mirrored for the same reason the mix is: dragging must not wait on a disk
  // write, so the fader reads from here and the preference is written behind it.
  const [coreDb, setCoreDb] = useState(() => mixerDb(preferences.comfortableOutputLevel));
  /** Nothing is written until the fader has actually been moved. */
  const [coreTouched, setCoreTouched] = useState(false);

  const organic = snapshot.organic;
  const sounding = snapshot.state === 'playing' || snapshot.state === 'finishing';
  const live = sounding && !!organic;

  /**
   * The strips, and the real numbers under them.
   *
   * While a plan is running the counts come from the plan; otherwise from the
   * library the next plan will be drawn out of. Nothing is invented for a group
   * with neither.
   */
  const groups: MixerGroupRow[] = useMemo(() => {
    if (organic && organic.groups.length > 0) {
      return organic.groups.map((state) => ({
        group: state.group,
        label: MIXER_GROUP_LABELS[state.group],
        detail:
          state.scheduled > 0
            ? `${state.planned} events this session · ${state.scheduled} started`
            : `${state.planned} events this session`,
      }));
    }
    const counts = organicRegistry().instrumentCounts();
    const byGroup = new Map<MixerGroup, number>();
    for (const [instrument, count] of counts) {
      const group = mixerGroupForInstrument(instrument);
      byGroup.set(group, (byGroup.get(group) ?? 0) + count);
    }
    return MIXER_GROUPS.filter((group) => (byGroup.get(group) ?? 0) > 0).map((group) => ({
      group,
      label: MIXER_GROUP_LABELS[group],
      detail: `${byGroup.get(group)} recordings in the library`,
    }));
  }, [organic]);

  const applyMix = useCallback((next: AcousticMix) => {
    setMix(next);
    sessionController.setAcousticMix(next);
  }, []);

  const onChangeGroup = useCallback(
    (group: MixerGroup, db: number) => applyMix(withGroupLevel(mix, group, db)),
    [applyMix, mix],
  );

  const onChangeSpace = useCallback((db: number) => applyMix(withSpace(mix, db)), [applyMix, mix]);

  const onChangeCore = useCallback(
    (db: number) => {
      setCoreDb(db);
      setCoreTouched(true);
      // Straight to the renderer's master gain, which smooths it over about
      // thirty milliseconds — the same path the session screen's intensity
      // control takes, so the two can never disagree about what is playing.
      setMasterGain(mixerGain(db));
    },
    [setMasterGain],
  );

  /*
   * The one value on this screen that reaches disk.
   *
   * Written from an effect rather than from the fader's own gesture, and not
   * until the fader has been still for a moment. A gesture callback that fires
   * at the end of an interaction reports the value from before it — the handler
   * was built a render ago — so the level that got stored was always one move
   * behind the one on screen. An effect reads the state that is actually
   * rendered, and debouncing it means a drag is one write rather than fifty.
   */
  useEffect(() => {
    if (!coreTouched) return;
    const timer = setTimeout(() => {
      void updatePreferences({ comfortableOutputLevel: mixerGain(coreDb) });
    }, CORE_WRITE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [coreDb, coreTouched, updatePreferences]);

  const leave = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace('/');
  }, [router]);

  if (!canSee('mixer')) {
    return (
      <Screen>
        <ScreenHeader
          eyebrow="Acoustic layer"
          title="Mixer"
          subtitle="Per-instrument levels for the sound bath."
        />
        <InstrumentPanel tone="raised" label="Not at this level">
          <Text variant="bodySm" tone="secondary">
            The mixer is part of Explorer and Lab. At Simple the acoustic layer plays at the levels
            its preset was written with, which is what those presets were balanced for.
          </Text>
        </InstrumentPanel>
        <View style={styles.actions}>
          <HardwareButton label="Done" variant="secondary" onPress={leave} />
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <ScreenHeader
        eyebrow="Acoustic layer"
        title="Mixer"
        subtitle="Per-instrument levels for the sound bath, and the level of the signal underneath it."
      />

      <InstrumentPanel tone="display" label="Attached to">
        <PanelRow
          label="State"
          value={live ? 'Playing' : sounding ? 'Playing, no acoustic layer' : 'Not playing'}
        />
        <PanelRow label="Sound bath" value={soundBath?.name ?? 'None'} />
        <PanelRow
          label="Voices"
          value={organic ? `${organic.voices.active} of ${organic.voices.cap}` : '—'}
        />
        <PanelRow label="Output" value={snapshot.backend.audible ? snapshot.backend.name : 'Silent'} />
      </InstrumentPanel>

      <Text variant="caption" tone="tertiary">
        {live
          ? 'These faders are on the running session. Each one is a gain stage between its instrument and the acoustic bus, so a change reaches sounds that are already ringing.'
          : snapshot.organicUnavailable
            ? `No acoustic layer right now — ${lowerFirst(snapshot.organicUnavailable)} These faders apply to the next sound bath.`
            : 'Nothing is playing, so these faders are the levels the next sound bath will start at.'}
      </Text>

      <AcousticMixer
        mix={mix}
        groups={groups}
        onChangeGroup={onChangeGroup}
        onChangeSpace={onChangeSpace}
        coreDb={coreDb}
        onChangeCore={onChangeCore}
        spaceDetail={
          mix.spaceDb <= MIXER_MIN_DB
            ? 'Off. The acoustic layer plays dry, which is how every preset has always sounded.'
            : 'Scales the reverb send each layer of the sound bath asks for. Turning an instrument down takes its reflections with it.'
        }
        coreDetail={
          live || sounding
            ? 'Live. Every session starts at this level.'
            : 'Every session starts at this level.'
        }
        onReset={() => applyMix(DEFAULT_ACOUSTIC_MIX)}
        resetDisabled={isDefaultMix(mix)}
      />

      <Text variant="caption" tone="tertiary">
        The acoustic layer places recorded strikes in time and produces no modulation of its own.
        Any beat in a session comes from the core signal underneath, which runs whether this layer
        is playing or silent.
      </Text>

      <View style={styles.actions}>
        <HardwareButton label="Done" variant="secondary" onPress={leave} />
      </View>
    </Screen>
  );
}

/** Joins a sentence from the controller onto one of ours without shouting. */
function lowerFirst(sentence: string): string {
  return sentence.charAt(0).toLowerCase() + sentence.slice(1);
}

/** Long enough that a drag is one write, short enough to survive leaving. */
const CORE_WRITE_DELAY_MS = 400;

const styles = StyleSheet.create({
  actions: { marginTop: space.sm },
});
