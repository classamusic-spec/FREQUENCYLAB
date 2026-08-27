import { useMemo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { formatClock, type Session } from '@frequencylab/dsp-core';
import { EmptyState, Screen, ScreenHeader } from '../src/design/components/Screen';
import { InstrumentPanel } from '../src/design/components/InstrumentPanel';
import { DnaChip } from '../src/design/components/Badges';
import { Label, Text } from '../src/design/components/Text';
import { colors, space } from '../src/design/tokens';
import { useHistory } from '../src/state/history';

/**
 * Session history.
 *
 * Grouped by day, and every row carries the DNA of what actually ran — so a
 * session from three months ago can still be reproduced exactly, even if the
 * protocol it came from has been edited since.
 */
export default function HistoryScreen() {
  const router = useRouter();
  const sessions = useHistory((state) => state.sessions);

  const grouped = useMemo(() => groupByDay(sessions), [sessions]);

  return (
    <Screen>
      <ScreenHeader
        eyebrow="History"
        title="Every session"
        subtitle={`${sessions.length} session${sessions.length === 1 ? '' : 's'} on this device.`}
      />

      {sessions.length === 0 ? (
        <EmptyState
          title="Nothing recorded yet"
          message="Sessions shorter than thirty seconds are not recorded, so an accidental start never becomes data."
        />
      ) : null}

      {grouped.map(([day, entries]) => (
        <View key={day} style={styles.group}>
          <Label>{day}</Label>
          {entries.map((session) => (
            <Pressable
              key={session.id}
              onPress={() => router.push(`/rate/${session.id}`)}
              accessibilityRole="button"
              accessibilityLabel={`${session.protocolName}, ${formatClock(session.metrics.playedSec)}`}
            >
              <InstrumentPanel tone="flat">
                <View style={styles.row}>
                  <View style={styles.rowText}>
                    <Text variant="heading" numberOfLines={1}>
                      {session.protocolName}
                    </Text>
                    <Label>
                      {new Date(session.startedAt).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                      {' · '}
                      {formatClock(session.metrics.playedSec)}
                      {' · '}
                      {Math.round(session.metrics.adherence * 100)}%
                    </Label>
                  </View>
                  {session.ratings.length > 0 ? (
                    <View style={styles.ratings}>
                      {session.ratings.slice(0, 2).map((rating) => (
                        <Text key={rating.metric} variant="readoutSm" tone="signal">
                          {rating.value.toFixed(1)}
                        </Text>
                      ))}
                    </View>
                  ) : (
                    <Label tone="tertiary">Unrated</Label>
                  )}
                </View>
                <DnaChip human={session.humanDna} fingerprint={session.protocolFingerprint} />
              </InstrumentPanel>
            </Pressable>
          ))}
        </View>
      ))}
    </Screen>
  );
}

function groupByDay(sessions: readonly Session[]): Array<[string, Session[]]> {
  const map = new Map<string, Session[]>();
  for (const session of sessions) {
    const day = new Date(session.startedAt).toLocaleDateString(undefined, {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    });
    const list = map.get(day) ?? [];
    list.push(session);
    map.set(day, list);
  }
  return [...map.entries()];
}

const styles = StyleSheet.create({
  group: { gap: space.sm },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.md },
  rowText: { flex: 1, gap: 2 },
  ratings: { flexDirection: 'row', gap: space.sm },
});
