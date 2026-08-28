import { useState } from 'react';
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
  PROTOCOL_DESCRIPTION_MAX_LENGTH,
  PROTOCOL_NAME_MAX_LENGTH,
  normaliseProtocolName,
  protocolNameIssue,
} from '@frequencylab/dsp-core';
import { colors, MIN_TOUCH_TARGET, radius, shadows, space } from '../tokens';
import { HardwareButton } from './HardwareButton';
import { Recessed } from './Surface';
import { Label, Text } from './Text';

/**
 * The answer to the question renaming always raises.
 *
 * It is a single string because three screens ask it and they must not drift
 * apart, and it is worded this precisely because it is exactly true: the
 * canonical form excludes name and description, so the fingerprint — and the
 * share code derived from it — comes out identical. `dsp-core`'s
 * `test/rename.test.ts` asserts both, against the real encoder.
 *
 * Note the wording is "share code", not "everything you send". The full DNA
 * *file* serialises the whole protocol document and does carry the name, so
 * that string does change — though the fingerprint inside it does not. Claiming
 * more than that here would be a nice sentence and a false one.
 */
export const RENAME_FOOTNOTE =
  'The name is yours; the fingerprint is the experiment. Renaming changes nothing about how this sounds, and its share code stays exactly the same.';

export interface NameEntrySheetProps {
  /** Engraved title across the top of the sheet. */
  title: string;
  name: string;
  /**
   * Starting description. Omit to hide the description field entirely — some
   * places a name is set have no room for a second thought.
   */
  description?: string;
  namePlaceholder?: string;
  descriptionPlaceholder?: string;
  /**
   * The other names already in the library. Used only to say, without blocking
   * anything, that this one is taken.
   */
  existingNames?: string[];
  /** A line of context under the fields — what this rename does and does not do. */
  footnote?: string;
  submitLabel?: string;
  onSubmit: (name: string, description?: string) => void;
  onCancel: () => void;
}

/**
 * Text entry.
 *
 * The sibling of `NumericEntrySheet`, for the one thing on a protocol that is
 * words rather than a number: what the user calls it. It uses the system
 * keyboard rather than a bespoke one — unlike a frequency, a name has no range
 * to state and no keypad that would beat the one the user already knows.
 *
 * Two rules govern the copy. Duplicates are reported, never refused: two
 * protocols may reasonably be called the same thing, so the note is a fact
 * rather than an error and the Save button stays live. And the footnote exists
 * because the obvious worry about renaming — "does this break the code I sent
 * someone?" — deserves an answer on the screen rather than an experiment;
 * `dsp-core/test/rename.test.ts` is what makes that answer true.
 */
export function NameEntrySheet({
  title,
  name,
  description,
  namePlaceholder = 'Evening wind-down',
  descriptionPlaceholder = 'What you use this one for',
  existingNames,
  footnote,
  submitLabel = 'Save',
  onSubmit,
  onCancel,
}: NameEntrySheetProps) {
  const [draftName, setDraftName] = useState(name);
  const [draftDescription, setDraftDescription] = useState(description ?? '');

  const issue = protocolNameIssue(draftName);
  const tidied = normaliseProtocolName(draftName);
  // Compared case-insensitively against the tidied form, so "evening " and
  // "Evening" are recognised as the same name a person would read.
  const duplicate =
    tidied.length > 0 &&
    (existingNames ?? []).some(
      (existing) => normaliseProtocolName(existing).toLowerCase() === tidied.toLowerCase(),
    );

  const submit = () => {
    if (issue) return;
    onSubmit(tidied, description === undefined ? undefined : draftDescription);
  };

  return (
    <Modal transparent animationType="fade" onRequestClose={onCancel}>
      <Pressable style={styles.scrim} onPress={onCancel} accessibilityLabel="Dismiss" />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.lift}
        pointerEvents="box-none"
      >
        <View style={styles.sheet}>
          <Label>{title}</Label>

          <View style={styles.field}>
            <Label>Name</Label>
            <Recessed cornerRadius={radius.control}>
              <TextInput
                value={draftName}
                onChangeText={setDraftName}
                placeholder={namePlaceholder}
                placeholderTextColor={colors.textDisabled}
                maxLength={PROTOCOL_NAME_MAX_LENGTH}
                autoFocus
                autoCorrect={false}
                selectTextOnFocus
                returnKeyType={description === undefined ? 'done' : 'next'}
                onSubmitEditing={description === undefined ? submit : undefined}
                accessibilityLabel="Protocol name"
                style={styles.input}
              />
            </Recessed>
            {duplicate ? (
              <Text variant="caption" tone="tertiary">
                You already have a protocol with this name. That is allowed — they stay separate.
              </Text>
            ) : null}
          </View>

          {description !== undefined ? (
            <View style={styles.field}>
              <Label>Description — optional</Label>
              <Recessed cornerRadius={radius.control}>
                <TextInput
                  value={draftDescription}
                  onChangeText={setDraftDescription}
                  placeholder={descriptionPlaceholder}
                  placeholderTextColor={colors.textDisabled}
                  maxLength={PROTOCOL_DESCRIPTION_MAX_LENGTH}
                  autoCorrect={false}
                  returnKeyType="done"
                  onSubmitEditing={submit}
                  accessibilityLabel="Protocol description"
                  style={styles.input}
                />
              </Recessed>
            </View>
          ) : null}

          {footnote ? (
            <Text variant="caption" tone="tertiary">
              {footnote}
            </Text>
          ) : null}

          <View style={styles.actions}>
            <HardwareButton label="Cancel" variant="ghost" style={styles.action} onPress={onCancel} />
            <HardwareButton
              label={submitLabel}
              variant="primary"
              style={styles.action}
              disabled={issue !== null}
              accessibilityHint={issue ?? undefined}
              onPress={submit}
            />
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.scrim,
  },
  // The sheet is bottom-anchored inside this, so the keyboard lifts the whole
  // form rather than pushing the fields off the top of it.
  lift: { position: 'absolute', left: 0, right: 0, bottom: 0 },
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
  field: { gap: space.xs },
  input: {
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    minHeight: MIN_TOUCH_TARGET + 4,
    color: colors.text,
    fontFamily: 'Inter_400Regular',
    fontSize: 16,
  },
  actions: { flexDirection: 'row', gap: space.sm, marginTop: space.sm },
  action: { flex: 1 },
});
