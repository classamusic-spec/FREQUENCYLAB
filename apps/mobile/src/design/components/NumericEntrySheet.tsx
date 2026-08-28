import { useMemo, useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import {
  DEFAULT_REFERENCE_HZ,
  FLAT_NAMES,
  MAX_OCTAVE,
  MIN_OCTAVE,
  SHARP_NAMES,
  clamp,
  formatNote,
  frequencyToNote,
  noteToFrequency,
} from '@frequencylab/dsp-core';
import { colors, MIN_TOUCH_TARGET, radius, shadows, space, type } from '../tokens';
import * as haptics from '../haptics';
import { HardwareButton } from './HardwareButton';
import { SegmentSelector } from './SegmentSelector';
import { Label, Text } from './Text';

export interface NumericEntrySheetProps {
  title: string;
  value: number;
  min: number;
  max: number;
  unit?: string;
  precision?: number;
  /**
   * Offers note-name entry beside the number.
   *
   * Opt-in, and only correct where the value is an audible pitch: a beat rate,
   * a modulation rate and a duration have no note, and offering one would be
   * inviting the user to type an answer the control cannot hold.
   */
  notes?: boolean;
  /** Frequency of A4 the note names are read against. */
  referenceHz?: number;
  /** Lets the sheet change the reference pitch. Omit and it is fixed. */
  onChangeReferenceHz?: (hz: number) => void;
  onSubmit: (value: number) => void;
  onCancel: () => void;
}

type EntryMode = 'number' | 'note';

/**
 * Numeric entry.
 *
 * This is the alternative to every rotary control (§50) and the fast path for
 * anyone who already knows the number they want. The keypad is deliberately its
 * own surface rather than the system keyboard: the values are always numeric,
 * the targets can be large, and the range is stated where it is being violated.
 *
 * With `notes` set the sheet gains a second mode rather than a second sheet,
 * because "440" and "A4" are two spellings of one answer to one question. Two
 * sheets would make the user choose the language before opening — and would
 * duplicate the range rule, the clamping and the actions, which is exactly how
 * the two paths would eventually start disagreeing.
 */
export function NumericEntrySheet({
  title,
  value,
  min,
  max,
  unit = 'Hz',
  precision = 3,
  notes,
  referenceHz = DEFAULT_REFERENCE_HZ,
  onChangeReferenceHz,
  onSubmit,
  onCancel,
}: NumericEntrySheetProps) {
  const [mode, setMode] = useState<EntryMode>('number');
  const [noteFocused, setNoteFocused] = useState(false);
  const [draft, setDraft] = useState(() => trimTrailingZeros(value.toFixed(precision)));
  const [noteDraft, setNoteDraft] = useState(() => {
    const match = frequencyToNote(value, { referenceHz });
    return match ? formatNote(match) : '';
  });

  const parsed = Number.parseFloat(draft);
  const valid = Number.isFinite(parsed) && parsed >= min && parsed <= max;

  // What the typed note resolves to. Everything the note mode shows — the
  // frequency, the canonical spelling, the error — comes from this one parse,
  // so the sheet can never claim a note it would not actually set.
  const noteHz = noteToFrequency(noteDraft, { referenceHz });
  const noteInRange = noteHz !== null && noteHz >= min && noteHz <= max;
  const resolved = noteHz === null ? null : frequencyToNote(noteHz, { referenceHz });

  // The half of a partly typed note the keys should preserve, and the octave
  // they should write into. Derived rather than held in state: the text field
  // is the single source of truth, so typing and tapping cannot drift apart.
  const split = useMemo(() => splitDraft(noteDraft), [noteDraft]);
  const here = useMemo(() => frequencyToNote(value, { referenceHz }), [referenceHz, value]);
  const octave = split.octave ?? here?.octave ?? 4;

  const press = (key: string) => {
    haptics.detent();
    setDraft((current) => {
      if (key === 'del') return current.length <= 1 ? '' : current.slice(0, -1);
      if (key === '.') return current.includes('.') ? current : `${current || '0'}.`;
      const next = `${current}${key}`;
      // Cap the string length rather than the value: a partially typed number
      // is often temporarily out of range and should not be blocked mid-entry.
      return next.length > 9 ? current : next;
    });
  };

  const pressPitch = (pitch: string) => {
    haptics.detent();
    setNoteDraft(`${pitch}${octave}`);
  };

  const stepOctave = (direction: number) => {
    const next = clamp(octave + direction, MIN_OCTAVE, MAX_OCTAVE);
    if (next === octave) return;
    haptics.detent();
    setNoteDraft(`${split.pitch ?? here?.name ?? 'A'}${next}`);
  };

  const noteMode = !!notes && mode === 'note';
  const message = noteMessage(noteDraft, noteHz, noteInRange, min, max, unit);

  return (
    <Modal transparent animationType="fade" onRequestClose={onCancel}>
      <Pressable style={styles.scrim} onPress={onCancel} accessibilityLabel="Dismiss" />
      {/* The note field is the one place this sheet accepts letters, so it is
          the one place a system keyboard can appear. Anchoring the sheet inside
          a keyboard-aware container lifts it clear instead of letting the
          keyboard cover the very field being typed into. */}
      <KeyboardAvoidingView
        style={styles.anchor}
        pointerEvents="box-none"
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.sheet}>
          <Label>{title}</Label>

          {notes ? (
            <SegmentSelector
              size="sm"
              accessibilityLabel="Entry mode"
              options={[
                { value: 'number', label: 'Number' },
                { value: 'note', label: 'Note' },
              ]}
              value={mode}
              onChange={(next) => setMode(next as EntryMode)}
            />
          ) : null}

          {noteMode ? (
            <>
              <View style={styles.display}>
                <TextInput
                  value={noteDraft}
                  onChangeText={setNoteDraft}
                  onFocus={() => setNoteFocused(true)}
                  onBlur={() => setNoteFocused(false)}
                  placeholder="A4"
                  placeholderTextColor={colors.textDisabled}
                  // Never auto-capitalised: a lowercase `b` is the flat sign, so
                  // "Db5" would be corrected into "DB5", which is not a note.
                  autoCapitalize="none"
                  autoCorrect={false}
                  spellCheck={false}
                  maxLength={5}
                  accessibilityLabel="Note name"
                  style={[
                    styles.noteInput,
                    noteFocused ? styles.noteInputFocused : null,
                    noteHz === null && noteDraft.trim() ? styles.noteInvalid : null,
                  ]}
                />
                <Text variant="readout" tone="tertiary" numberOfLines={1}>
                  {noteInRange ? `= ${noteHz!.toFixed(2)} ${unit}` : ''}
                </Text>
              </View>
              <Text
                variant="caption"
                tone={message ? 'limit' : 'tertiary'}
              >
                {message ??
                  (resolved
                    ? `${formatNote(resolved)}, with A4 at ${referenceHz} ${unit}.`
                    : `Type a note, or tap one below. ${min} – ${max} ${unit}.`)}
              </Text>

              <View style={styles.keypad}>
                {SHARP_NAMES.map((pitch, index) => {
                  const selected = split.pitch !== null && samePitch(split.pitch, pitch, index);
                  const flat = FLAT_NAMES[index];
                  return (
                    <Pressable
                      key={pitch}
                      accessibilityRole="button"
                      accessibilityState={{ selected }}
                      accessibilityLabel={`${spellPitch(pitch)} ${octave}`}
                      onPress={() => pressPitch(pitch)}
                      style={[styles.key, styles.pitchKey, selected ? styles.keySelected : null]}
                    >
                      <Text variant="readout" tone={selected ? 'signal' : 'secondary'}>
                        {glyph(pitch)}
                      </Text>
                      {flat !== pitch ? (
                        <Text variant="readoutXs" tone="tertiary">
                          {glyph(flat)}
                        </Text>
                      ) : null}
                    </Pressable>
                  );
                })}
              </View>

              <View style={styles.octaveRow}>
                <Label>Octave</Label>
                <View style={styles.stepper}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Octave down"
                    disabled={octave <= MIN_OCTAVE}
                    onPress={() => stepOctave(-1)}
                    style={styles.stepperKey}
                  >
                    <Text variant="readoutLg" tone={octave <= MIN_OCTAVE ? 'disabled' : 'secondary'}>
                      −
                    </Text>
                  </Pressable>
                  <Text variant="readout" tone="primary" style={styles.stepperValue}>
                    {octave}
                  </Text>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Octave up"
                    disabled={octave >= MAX_OCTAVE}
                    onPress={() => stepOctave(1)}
                    style={styles.stepperKey}
                  >
                    <Text variant="readoutLg" tone={octave >= MAX_OCTAVE ? 'disabled' : 'secondary'}>
                      +
                    </Text>
                  </Pressable>
                </View>
              </View>

              {/* A reference pitch is a naming convention and nothing else: it
                  changes which note a frequency is called, never what the
                  instrument generates. The caption says so, because this is the
                  one control on the screen people arrive with a belief about. */}
              {onChangeReferenceHz ? (
                <View style={styles.referenceRow}>
                  <Label>Reference A4</Label>
                  <SegmentSelector
                    size="sm"
                    style={styles.referenceSelector}
                    accessibilityLabel="Reference pitch for note names"
                    options={[
                      { value: '440', label: '440 Hz' },
                      { value: '432', label: '432 Hz' },
                    ]}
                    value={referenceHz === 432 ? '432' : '440'}
                    onChange={(next) => onChangeReferenceHz(Number.parseInt(next, 10))}
                  />
                </View>
              ) : null}
            </>
          ) : (
            <>
              <View style={styles.display}>
                <Text variant="readoutXl" tone={valid || draft === '' ? 'primary' : 'limit'}>
                  {draft || '0'}
                </Text>
                <Text variant="readout" tone="tertiary">
                  {unit}
                </Text>
              </View>
              <Text variant="caption" tone={valid || draft === '' ? 'tertiary' : 'limit'}>
                Range {min} – {max} {unit}
              </Text>

              <View style={styles.keypad}>
                {['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', 'del'].map((key) => (
                  <Pressable
                    key={key}
                    accessibilityRole="button"
                    accessibilityLabel={key === 'del' ? 'Delete' : key}
                    onPress={() => press(key)}
                    style={styles.key}
                  >
                    <Text variant="readoutLg" tone="secondary">
                      {key === 'del' ? '⌫' : key}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </>
          )}

          <View style={styles.actions}>
            <HardwareButton label="Cancel" variant="ghost" style={styles.action} onPress={onCancel} />
            <HardwareButton
              label="Set"
              variant="primary"
              style={styles.action}
              disabled={noteMode ? !noteInRange : !valid}
              onPress={() =>
                onSubmit(noteMode ? clamp(noteHz!, min, max) : clamp(parsed, min, max))
              }
            />
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

/**
 * The one thing the note mode refuses to do silently.
 *
 * Returns the message for a draft that cannot be set, or null when there is
 * nothing wrong. An empty field is not an error — it is a field nobody has
 * typed in yet — so it falls through to the hint.
 */
function noteMessage(
  draft: string,
  hz: number | null,
  inRange: boolean,
  min: number,
  max: number,
  unit: string,
): string | null {
  if (draft.trim() === '') return null;
  if (hz === null) return 'Not a note. Try A4, C#3 or Db5.';
  if (!inRange) return `That is ${hz.toFixed(2)} ${unit}, outside ${min} – ${max} ${unit}.`;
  return null;
}

/** One letter, at most one accidental, and an optional octave — partly typed. */
const DRAFT_PATTERN = /^\s*([A-Ga-g])([#♯b♭]?)\s*(-?\d{1,2})?\s*$/;

/**
 * Splits a draft into the halves the keys act on, best effort.
 *
 * Deliberately more forgiving than the parser in `theory.ts`: the pitch keys
 * and the octave stepper have to keep working while the field holds something
 * incomplete like "C#", which is not yet a note. Anything it cannot read at all
 * comes back as two nulls and the next key press simply replaces the draft.
 */
function splitDraft(draft: string): { pitch: string | null; octave: number | null } {
  const match = DRAFT_PATTERN.exec(draft);
  if (!match) return { pitch: null, octave: null };
  const [, letter, accidental, octaveText] = match;
  const sign = accidental === '♯' ? '#' : accidental === '♭' ? 'b' : accidental;
  return {
    pitch: `${letter.toUpperCase()}${sign}`,
    octave: octaveText === undefined ? null : Number.parseInt(octaveText, 10),
  };
}

/** True when a typed pitch names the same key as a table entry, either spelling. */
function samePitch(typed: string, sharp: string, index: number): boolean {
  return typed === sharp || typed === FLAT_NAMES[index];
}

/** `C#` printed as `C♯` — the engraved glyph, never the ASCII stand-in. */
function glyph(name: string): string {
  return name.replace('#', '♯').replace('b', '♭');
}

/** `C#` said aloud, for the key's accessibility label (§50). */
function spellPitch(name: string): string {
  return name.length > 1 ? `${name[0]} sharp` : name;
}

function trimTrailingZeros(text: string): string {
  return text.includes('.') ? text.replace(/0+$/, '').replace(/\.$/, '') : text;
}

const styles = StyleSheet.create({
  scrim: { position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0, backgroundColor: colors.scrim },
  anchor: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.sheet,
    borderTopRightRadius: radius.sheet,
    padding: space.xl,
    paddingBottom: space.huge,
    gap: space.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.edgeLight,
    ...(shadows.sheet as object),
  },
  display: { flexDirection: 'row', alignItems: 'baseline', gap: space.sm },
  noteInput: {
    ...type.readoutXl,
    color: colors.text,
    width: 148,
    minHeight: MIN_TOUCH_TARGET,
    // The one editable field in the design system, so it carries the only
    // underline: a milled slot in the panel that text is written into. The
    // browser's own focus ring is suppressed and replaced below, rather than
    // simply removed — a keyboard user still has to be able to see where they
    // are (§50).
    borderBottomWidth: 1,
    borderBottomColor: colors.hairlineStrong,
    paddingBottom: space.xxs,
    outlineWidth: 0,
  },
  noteInputFocused: { borderBottomColor: colors.signal },
  noteInvalid: { color: colors.limit, borderBottomColor: colors.limit },
  keypad: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.sm,
    marginTop: space.sm,
  },
  key: {
    flexBasis: '31%',
    flexGrow: 1,
    minHeight: MIN_TOUCH_TARGET + 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.control,
    backgroundColor: colors.surfaceRaised,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.edgeLight,
  },
  pitchKey: { flexBasis: '22%' },
  keySelected: {
    backgroundColor: colors.surfaceRecessed,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.signalDim,
  },
  octaveRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.md,
  },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  stepperKey: {
    minWidth: MIN_TOUCH_TARGET,
    minHeight: MIN_TOUCH_TARGET,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.control,
    backgroundColor: colors.surfaceRaised,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.edgeLight,
  },
  stepperValue: { minWidth: 28, textAlign: 'center' },
  referenceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.md,
  },
  referenceSelector: { flex: 1, maxWidth: 200 },
  actions: { flexDirection: 'row', gap: space.sm, marginTop: space.sm },
  action: { flex: 1 },
});
