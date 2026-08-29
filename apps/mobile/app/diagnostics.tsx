import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import {
  DEFAULT_BLOCK_SIZE,
  DSP_VERSION,
  PROTOCOL_SCHEMA_VERSION,
  SUPPORTED_SAMPLE_RATES,
  formatClock,
} from '@frequencylab/dsp-core';
import { Screen, ScreenHeader, SectionHeader } from '../src/design/components/Screen';
import { InstrumentPanel, PanelDivider, PanelRow } from '../src/design/components/InstrumentPanel';
import { HardwareButton } from '../src/design/components/HardwareButton';
import { SegmentSelector } from '../src/design/components/SegmentSelector';
import { SignalMeter } from '../src/design/components/SignalMeter';
import { Oscilloscope, SpectrumAnalyzer, StereoVectorScope } from '../src/design/components/Visualizers';
import { Text } from '../src/design/components/Text';
import { space } from '../src/design/tokens';
import { usePlayer, useScopeCapture } from '../src/state/player';
import { sessionController, type ControllerSnapshot } from '../src/audio/sessionController';
import { detectOutputRoute, describeRoute } from '../src/audio/route';
import { organicAssetDelivery } from '../src/audio/organic/delivery';

const BUFFER_SIZES = [512, 1024, 2048, 4096];
const QUEUE_DEPTHS = [3, 4, 6, 8];

/**
 * DSP debug mode (§67).
 *
 * An engineering surface, reachable from Profile → Audio → Diagnostics and
 * never surfaced in the normal consumer path. Buffer size and queue depth are
 * adjustable here because the right values differ by device, and the only way
 * to find them is to change them and watch the underrun counter.
 */
export default function DiagnosticsScreen() {
  const router = useRouter();
  const snapshot = usePlayer((state) => state.snapshot);
  const capture = useScopeCapture(20, snapshot.state === 'playing');
  const [bufferFrames, setBufferFrames] = useState(2048);
  const [queueDepth, setQueueDepth] = useState(6);
  const [route, setRoute] = useState(snapshot.route);

  useEffect(() => {
    void detectOutputRoute().then(setRoute);
  }, []);

  const telemetry = snapshot.telemetry;
  const stats = snapshot.backend.stats;
  const latencyMs = Math.round(stats.outputLatencySec * 1000);

  return (
    <Screen>
      <ScreenHeader
        eyebrow="Engineering"
        title="DSP diagnostics"
        subtitle="Live engine state. Not part of the normal interface."
      />

      <InstrumentPanel tone="recessed" label="Engine">
        <PanelRow label="DSP version" value={DSP_VERSION} />
        <PanelRow label="Protocol schema" value={`v${PROTOCOL_SCHEMA_VERSION}`} />
        <PanelRow label="Backend" value={snapshot.backend.name} />
        <PanelRow label="Audible" value={snapshot.backend.audible ? 'Yes' : 'No'} />
        <PanelRow label="State" value={snapshot.state} />
        <PanelRow label="Sample rate" value={`${telemetry?.sampleRate ?? SUPPORTED_SAMPLE_RATES[1]} Hz`} />
        <PanelRow label="Block size" value={String(telemetry?.blockSize ?? DEFAULT_BLOCK_SIZE)} />
        <PanelRow label="Channels" value="2" />
        <PanelRow label="Output route" value={describeRoute(route)} />
        <PanelRow label="Route reliable" value={route.reliable ? 'Yes' : 'No'} />
      </InstrumentPanel>

      <InstrumentPanel tone="recessed" label="Load">
        <PanelRow label="Buffers rendered" value={String(stats.buffersRendered)} />
        <PanelRow label="Underruns" value={String(stats.underruns)} />
        <PanelRow label="Render time" value={`${stats.renderMsAverage.toFixed(2)} ms avg`} />
        <PanelRow label="DSP load" value={`${Math.round(stats.load * 100)}%`} />
        <PanelRow label="Queued audio" value={`${(stats.bufferedSec * 1000).toFixed(0)} ms`} />
        <PanelRow label="Output latency" value={`${latencyMs} ms`} />
        <PanelDivider />
        <Text variant="caption" tone={stats.load > 0.6 ? 'warning' : 'tertiary'}>
          {stats.load > 0.6
            ? 'Render time is approaching the buffer duration. Increase the buffer size or reduce the number of active modules.'
            : 'Rendering comfortably ahead of real time.'}
        </Text>
      </InstrumentPanel>

      <InstrumentPanel tone="recessed" label="Levels">
        <SignalMeter
          peakL={telemetry?.level.peakL ?? 0}
          peakR={telemetry?.level.peakR ?? 0}
          peakDbL={telemetry?.level.peakDbL}
          peakDbR={telemetry?.level.peakDbR}
          gainReductionDb={telemetry?.gainReductionDb ?? 0}
        />
        <PanelDivider />
        <PanelRow label="RMS L" value={`${(telemetry?.level.rmsDbL ?? -Infinity).toFixed(1)} dBFS`} />
        <PanelRow label="RMS R" value={`${(telemetry?.level.rmsDbR ?? -Infinity).toFixed(1)} dBFS`} />
        <PanelRow label="Correlation" value={(telemetry?.level.correlation ?? 0).toFixed(3)} />
        <PanelRow label="Limiter clip events" value={String(snapshot.backend.stats.underruns)} />
      </InstrumentPanel>

      <InstrumentPanel tone="recessed" label="Protocol clock">
        <PanelRow label="Position" value={formatClock(telemetry?.positionSec ?? 0)} />
        <PanelRow label="Duration" value={formatClock(telemetry?.durationSec ?? 0)} />
        <PanelRow label="Stage" value={`${(telemetry?.stageIndex ?? 0) + 1} · ${telemetry?.stageName ?? '—'}`} />
        <PanelRow label="Stage position" value={formatClock(telemetry?.stagePositionSec ?? 0)} />
        <PanelRow label="Cross-fading" value={telemetry?.crossfading ? 'Yes' : 'No'} />
        <PanelRow label="Active nodes" value={String(telemetry?.activeNodes ?? 0)} />
      </InstrumentPanel>

      {telemetry && Object.keys(telemetry.readouts).length > 0 ? (
        <InstrumentPanel tone="recessed" label="Live parameters">
          {Object.entries(telemetry.readouts).map(([address, value]) => (
            <PanelRow key={address} label={address} value={value.toFixed(4)} />
          ))}
        </InstrumentPanel>
      ) : null}

      <OrganicPanel snapshot={snapshot} />

      <SectionHeader label="Signal views" />
      <View style={styles.scopes}>
        <Oscilloscope samples={capture?.left ?? null} samplesRight={capture?.right ?? null} height={90} />
        <SpectrumAnalyzer bins={capture?.spectrum ?? null} sampleRate={capture?.sampleRate} height={110} />
        <View style={styles.vectorRow}>
          <StereoVectorScope
            left={capture?.left ?? null}
            right={capture?.right ?? null}
            correlation={telemetry?.level.correlation ?? 0}
          />
        </View>
      </View>

      <SectionHeader label="Buffer configuration" />
      <InstrumentPanel tone="flat">
        <Text variant="bodySm" tone="secondary">
          Applies the next time playback starts. Smaller buffers reduce the delay between turning a
          control and hearing it; larger ones tolerate a busier JS thread.
        </Text>
        <SegmentSelector
          style={styles.selector}
          accessibilityLabel="Buffer size in frames"
          options={BUFFER_SIZES.map((value) => ({ value: String(value), label: String(value) }))}
          value={String(bufferFrames)}
          onChange={(value) => {
            const next = Number.parseInt(value, 10);
            setBufferFrames(next);
            sessionController.configureBackend({ bufferFrames: next });
          }}
        />
        <SegmentSelector
          style={styles.selector}
          accessibilityLabel="Queue depth"
          options={QUEUE_DEPTHS.map((value) => ({ value: String(value), label: `${value} deep` }))}
          value={String(queueDepth)}
          onChange={(value) => {
            const next = Number.parseInt(value, 10);
            setQueueDepth(next);
            sessionController.configureBackend({ queueDepth: next });
          }}
        />
        <Text variant="caption" tone="tertiary">
          Predicted latency: {Math.round(((bufferFrames * queueDepth) / 48000) * 1000)} ms
        </Text>
      </InstrumentPanel>

      <HardwareButton label="Close" variant="ghost" onPress={() => router.back()} />
    </Screen>
  );
}

/**
 * What the organic acoustic layer is doing, and — today — why it is not.
 *
 * This panel exists because "no sound bath is playing" has several very
 * different causes and a listener deserves to know which one they have: no
 * plan was loaded, the backend has no organic bus, or the assets cannot be
 * obtained by any build of this app. §65's rule is that nothing may look like
 * it is working when it is not, and the corollary is that nothing may be
 * silently missing either.
 */
function OrganicPanel({ snapshot }: { snapshot: ControllerSnapshot }) {
  const delivery = organicAssetDelivery();
  const organic = snapshot.organic;

  return (
    <InstrumentPanel tone="recessed" label="Organic layer">
      <PanelRow label="Asset delivery" value={delivery.configured ? delivery.id : 'Not configured'} />
      <PanelRow label="Bus" value={organic?.output ?? (snapshot.backend.audible ? 'Built, idle' : 'None')} />
      <PanelRow label="Phase" value={organic?.phase ?? 'idle'} />

      {organic ? (
        <>
          <PanelDivider />
          <PanelRow label="Events planned" value={String(organic.plannedEvents)} />
          <PanelRow label="Events scheduled" value={String(organic.scheduledEvents)} />
          <PanelRow label="Events skipped" value={String(organic.skippedEvents)} />
          <PanelDivider />
          <PanelRow
            label="Voices"
            value={`${organic.voices.active} of ${organic.voices.cap}`}
          />
          <PanelRow label="Voices started" value={String(organic.voices.started)} />
          <PanelRow label="Dropped: polyphony" value={String(organic.voices.droppedForPolyphony)} />
          <PanelRow label="Dropped: load" value={String(organic.voices.droppedForLoad)} />
          <PanelDivider />
          <PanelRow
            label="Cache"
            value={`${organic.cache.residentCount} assets · ${formatMb(organic.cache.residentBytes)} of ${formatMb(organic.cache.budgetBytes)}`}
          />
          <PanelRow label="Decoded" value={String(organic.cache.loaded)} />
          <PanelRow label="Evicted" value={String(organic.cache.evicted)} />
          <PanelRow label="Unavailable" value={String(organic.cache.failed)} />
          {organic.skips.length > 0 ? (
            <>
              <PanelDivider />
              {organic.skips.slice(0, 6).map((skip) => (
                <Text key={`${skip.assetId}-${skip.reason}`} variant="caption" tone="warning">
                  {skip.count}× {skip.assetId}: {skip.reason}
                </Text>
              ))}
            </>
          ) : null}
        </>
      ) : (
        <>
          <PanelDivider />
          <Text variant="caption" tone="tertiary">
            {snapshot.organicUnavailable ?? 'No organic layer is loaded for this session.'}
          </Text>
        </>
      )}

      {delivery.configured ? null : (
        <>
          <PanelDivider />
          <Text variant="caption" tone="warning">
            {delivery.description}
          </Text>
          <Text variant="caption" tone="tertiary">
            The scheduler, voice manager, look-ahead and mixer are built and the
            organic bus is wired into the master mixer. Nothing can be played
            through them until the library has somewhere to come from.
          </Text>
        </>
      )}
    </InstrumentPanel>
  );
}

function formatMb(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const styles = StyleSheet.create({
  scopes: { gap: space.md },
  vectorRow: { alignItems: 'center' },
  selector: { marginTop: space.md },
});
