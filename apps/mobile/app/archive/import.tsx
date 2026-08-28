import { useMemo, useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import {
  annotateDuplicates,
  parseCollection,
  type ImportIssue,
  type ImportPreview,
} from '@frequencylab/dsp-core';
import { Screen, ScreenHeader, SectionHeader } from '../../src/design/components/Screen';
import { InstrumentPanel, PanelRow } from '../../src/design/components/InstrumentPanel';
import { HardwareButton } from '../../src/design/components/HardwareButton';
import { formatHz } from '../../src/design/components/ArchiveCard';
import { Label, Text } from '../../src/design/components/Text';
import { colors, radius, space } from '../../src/design/tokens';
import { useArchive } from '../../src/state/archive';
import { notify } from '../../src/design/dialogs';

/**
 * Importing a frequency collection (§17).
 *
 * This is the archive's main supply route, and it is a review step rather than
 * a file drop. Before anything is written the user sees every row that was
 * parsed, every row that was not, every value that collides with something
 * already held, and every row carrying treatment language.
 *
 * Three rules the screen enforces and cannot be talked out of: values are
 * stored exactly as the file gave them, nothing imports as anything other than
 * unverified, and rows with medical language are kept — quoted and answered —
 * rather than discarded. Deleting them would be a quieter kind of dishonesty
 * than labelling them.
 */
export default function ArchiveImportScreen() {
  const router = useRouter();
  const [raw, setRaw] = useState('');
  const [filename, setFilename] = useState('Pasted text');
  const [title, setTitle] = useState('');
  const [author, setAuthor] = useState('');
  const [year, setYear] = useState('');
  const [context, setContext] = useState('');
  const [busy, setBusy] = useState(false);

  const entries = useArchive((state) => state.all)();
  const commitImport = useArchive((state) => state.commitImport);

  const preview: ImportPreview | null = useMemo(() => {
    if (raw.trim().length === 0) return null;
    return annotateDuplicates(parseCollection(raw, filename), entries);
  }, [entries, filename, raw]);

  const errors = preview?.issues.filter((issue) => issue.severity === 'error') ?? [];
  const warnings = preview?.issues.filter((issue) => issue.severity === 'warning') ?? [];

  const pickFile = async () => {
    const result = await DocumentPicker.getDocumentAsync({
      type: ['text/*', 'application/json', 'text/csv'],
      copyToCacheDirectory: true,
    });
    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];
    try {
      const text = new File(asset.uri).textSync();
      setRaw(text);
      setFilename(asset.name ?? 'Imported file');
      if (!title) setTitle(asset.name ?? 'Imported collection');
    } catch {
      notify('Could not read that file', 'Open it in a text editor and paste the contents instead.');
    }
  };

  const commit = async () => {
    if (!preview || preview.acceptedCount === 0) return;
    setBusy(true);
    try {
      const collection = await commitImport(preview, {
        sourceTitle: title.trim() || filename,
        sourceAuthor: author.trim() || undefined,
        sourceYear: year.trim() ? Number.parseInt(year, 10) : null,
        originalContext: context.trim() || undefined,
        now: new Date().toISOString(),
      });
      router.replace(`/archive/set/${collection.id}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <ScreenHeader
        eyebrow="Archive"
        title="Import a frequency list"
        subtitle="Your list, kept with an honest record of where you got it."
      />

      <InstrumentPanel tone="recessed" label="What import does and does not do">
        <Text variant="bodySm" tone="secondary">
          Every row is stored at exactly the value your file gives, marked unverified, and
          attributed to this file and today&apos;s date. Import never upgrades a claim: a list asserting
          its own validity is not evidence of it, so nothing here can arrive labelled as
          scientifically established.
        </Text>
      </InstrumentPanel>

      <View style={styles.actions}>
        <HardwareButton label="Choose a file" onPress={() => void pickFile()} style={styles.action} />
        <HardwareButton
          label="Clear"
          variant="ghost"
          onPress={() => {
            setRaw('');
            setFilename('Pasted text');
          }}
          style={styles.action}
        />
      </View>

      <SectionHeader label="Or paste the list" />
      <InstrumentPanel tone="recessed" bare>
        <TextInput
          value={raw}
          onChangeText={(text) => {
            setRaw(text);
            if (filename !== 'Pasted text') setFilename('Pasted text');
          }}
          multiline
          autoCapitalize="none"
          autoCorrect={false}
          placeholder={'Name, 2128\nName, 727\n…  or JSON, or one number per line'}
          placeholderTextColor={colors.textDisabled}
          accessibilityLabel="Paste a frequency list"
          style={styles.paste}
        />
      </InstrumentPanel>

      {preview ? (
        <>
          <SectionHeader label="Review" />
          <InstrumentPanel tone="flat">
            <PanelRow label="Source" value={preview.sourceName} />
            <PanelRow label="Rows parsed" value={String(preview.rows.length)} />
            <PanelRow label="Will import" value={String(preview.acceptedCount)} />
            <PanelRow label="Unreadable" value={String(errors.length)} />
            <PanelRow label="Already held" value={String(preview.duplicateRows.length)} />
            <PanelRow label="Close to existing" value={String(preview.nearDuplicateRows.length)} />
            <PanelRow label="Medical language" value={String(preview.medicalRows.length)} />
          </InstrumentPanel>

          {preview.medicalRows.length > 0 ? (
            <View style={styles.notice}>
              <Label tone="limit">Treatment language found</Label>
              <Text variant="bodySm" tone="secondary" style={styles.noticeBody}>
                {preview.medicalRows.length} row
                {preview.medicalRows.length === 1 ? '' : 's'} in this file associate a frequency
                with a medical condition or outcome. Those rows will be imported — the text is
                preserved as a quotation of what your source said — and each one is paired with a
                statement that no reliable evidence establishes such an effect. They are never
                shown as instructions.
              </Text>
            </View>
          ) : null}

          {preview.duplicateRows.length > 0 || preview.nearDuplicateRows.length > 0 ? (
            <View style={styles.notice}>
              <Label tone="warning">Collisions with what you already hold</Label>
              <Text variant="bodySm" tone="secondary" style={styles.noticeBody}>
                Matching and near-matching values are flagged, not merged. Two sources listing the
                same number is a fact worth keeping, and two values a hair apart may be
                transcription drift or may be genuinely different records — the archive cannot tell
                which, so it keeps both and shows you the conflict.
              </Text>
            </View>
          ) : null}

          {errors.length > 0 ? (
            <>
              <SectionHeader
                label={`${errors.length} ${errors.length === 1 ? 'row' : 'rows'} could not be read`}
              />
              <Text variant="caption" tone="tertiary">
                These are reported rather than guessed at. A row the parser cannot resolve into a
                frequency is left out, and you can fix it in the file and import again.
              </Text>
              {errors.slice(0, 12).map((issue, index) => (
                <IssueRow key={index} issue={issue} />
              ))}
            </>
          ) : null}

          {warnings.length > 0 ? (
            <>
              <SectionHeader
                label={`${warnings.length} ${warnings.length === 1 ? 'row' : 'rows'} flagged`}
              />
              {warnings.slice(0, 20).map((issue, index) => (
                <IssueRow key={index} issue={issue} />
              ))}
            </>
          ) : null}

          <SectionHeader label={`Rows to import (${preview.acceptedCount})`} />
          {preview.rows.slice(0, 40).map((row) => {
            const flagged = preview.medicalRows.includes(row.line);
            const duplicate = preview.duplicateRows.includes(row.line);
            return (
              <View key={row.line} style={styles.row}>
                <Text variant="readoutSm" style={styles.rowValue}>
                  {formatHz(row.frequency)}
                </Text>
                <View style={styles.rowText}>
                  <Text variant="bodySm" numberOfLines={2}>
                    {row.name}
                  </Text>
                  {row.extra ? (
                    <Label tone="tertiary">{row.extra}</Label>
                  ) : null}
                </View>
                {flagged ? <Label tone="limit">Claim</Label> : null}
                {duplicate ? <Label tone="warning">Held</Label> : null}
              </View>
            );
          })}
          {preview.rows.length > 40 ? (
            <Text variant="caption" tone="tertiary">
              Showing the first 40 of {preview.rows.length}. All of them import.
            </Text>
          ) : null}

          <SectionHeader label="Where did this list come from?" />
          <Text variant="caption" tone="tertiary">
            Whatever you can say honestly. If you do not know, leave it blank — an empty field is
            an accurate record, and a guess written in here would become provenance the archive
            then repeats back to you.
          </Text>
          <Field label="Title" value={title} onChange={setTitle} placeholder={filename} />
          <Field
            label="Author or compiler"
            value={author}
            onChange={setAuthor}
            placeholder="Unknown"
          />
          <Field label="Year" value={year} onChange={setYear} placeholder="Unknown" numeric />
          <Field
            label="How you obtained it"
            value={context}
            onChange={setContext}
            placeholder="e.g. downloaded from a forum in 2019"
            multiline
          />

          <HardwareButton
            label={`Import ${preview.acceptedCount} frequencies as unverified`}
            variant="primary"
            size="lg"
            loading={busy}
            disabled={preview.acceptedCount === 0}
            onPress={() => void commit()}
          />
        </>
      ) : null}
    </Screen>
  );
}

function IssueRow({ issue }: { issue: ImportIssue }) {
  return (
    <View style={styles.issue}>
      <Label tone={issue.severity === 'error' ? 'limit' : 'warning'}>
        Line {issue.line} · {issue.code.replace(/-/g, ' ')}
      </Label>
      <Text variant="caption" tone="secondary">
        {issue.message}
      </Text>
    </View>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  numeric,
  multiline,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  numeric?: boolean;
  multiline?: boolean;
}) {
  return (
    <View style={styles.field}>
      <Label>{label}</Label>
      <InstrumentPanel tone="recessed" bare>
        <TextInput
          value={value}
          onChangeText={onChange}
          placeholder={placeholder}
          placeholderTextColor={colors.textDisabled}
          keyboardType={numeric ? 'number-pad' : 'default'}
          multiline={multiline}
          accessibilityLabel={label}
          style={[styles.fieldInput, multiline ? styles.fieldInputTall : null]}
        />
      </InstrumentPanel>
    </View>
  );
}

const styles = StyleSheet.create({
  actions: { flexDirection: 'row', gap: space.sm },
  action: { flex: 1 },
  paste: {
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    color: colors.text,
    fontFamily: 'IBMPlexMono_400Regular',
    fontSize: 13,
    minHeight: 132,
    textAlignVertical: 'top',
  },
  notice: {
    padding: space.lg,
    gap: space.xxs,
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    borderLeftWidth: 2,
    borderLeftColor: colors.warning,
  },
  noticeBody: { marginTop: space.xxs },
  issue: {
    gap: 2,
    paddingLeft: space.md,
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderLeftColor: colors.hairlineStrong,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingHorizontal: space.lg,
    paddingVertical: space.sm,
    borderRadius: radius.control,
    backgroundColor: colors.surface,
    minHeight: 48,
  },
  rowValue: { minWidth: 64 },
  rowText: { flex: 1, gap: 2 },
  field: { gap: space.xs },
  fieldInput: {
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    color: colors.text,
    fontFamily: 'Inter_400Regular',
    fontSize: 15,
    minHeight: 48,
  },
  fieldInputTall: { minHeight: 80, textAlignVertical: 'top' },
});
