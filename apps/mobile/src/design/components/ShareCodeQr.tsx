import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Rect } from 'react-native-svg';
import { toQR } from 'toqr';
import { colors, radius, space } from '../tokens';
import { Text } from './Text';

export interface ShareCodeQrProps {
  /** The string to encode — in practice a share code from `encodeShareCode`. */
  value: string;
  /** Outer edge length in points, quiet zone included. */
  size?: number;
}

/**
 * The blank margin around the symbol, in modules.
 *
 * Four is the specification minimum and it is not decoration: a scanner finds
 * the symbol by looking for the finder patterns' 1:1:3:1:1 ratio, and without
 * clear space around the edge the surrounding UI reads as part of that ratio.
 * The card behind this is near-white too, but "near" is not the same colour,
 * so the quiet zone is painted rather than inherited.
 */
const QUIET_ZONE = 4;

/**
 * How far each run is drawn past its own module, in module units.
 *
 * Two rects sharing an edge do not composite to solid ink — each anti-aliases
 * its own half of the boundary pixel, and the seam lands somewhere around 75%
 * coverage, which shows up as a grey grid over the symbol. Overlapping by a
 * fiftieth of a module removes the seam. A decoder samples module centres, so
 * the same bleed into a light neighbour is beneath its notice.
 */
const BLEED = 0.02;

/** One horizontal run of dark modules: the unit we actually draw. */
interface Run {
  x: number;
  y: number;
  width: number;
}

interface QrSymbol {
  /** Modules per side, excluding the quiet zone. 21 at version 1, 177 at 40. */
  modules: number;
  runs: Run[];
}

/**
 * Encodes and packs the symbol into as few rectangles as it takes.
 *
 * Drawing one rect per dark module means ~400 SVG nodes for a share code and
 * over 15,000 at the top versions — every one of them crossing the bridge to
 * the native view on each render. Merging horizontal runs typically cuts that
 * by three quarters at no cost to fidelity, because a row of adjacent dark
 * modules is geometrically one rectangle.
 *
 * Returns null rather than throwing when the value cannot be encoded: `toqr`
 * raises a RangeError past the version 40 capacity, and a share code is not
 * important enough to take a screen down with it.
 */
function encodeSymbol(value: string): QrSymbol | null {
  if (!value) return null;

  let matrix: Uint8Array;
  try {
    // Left at the default error-correction level (L). Error correction pays for
    // damage and dirt on printed labels; this symbol lives on a clean backlit
    // screen for thirty seconds, and the lower level buys a smaller version —
    // fewer, larger modules, which is what actually helps a camera at 200pt.
    matrix = toQR(value);
  } catch {
    return null;
  }

  const modules = Math.round(Math.sqrt(matrix.length));
  // Defensive: everything downstream indexes as a square, so refuse anything
  // that is not one rather than drawing a sheared symbol nobody can scan.
  if (modules * modules !== matrix.length) return null;

  const runs: Run[] = [];
  for (let y = 0; y < modules; y += 1) {
    let x = 0;
    while (x < modules) {
      if (!matrix[y * modules + x]) {
        x += 1;
        continue;
      }
      const start = x;
      while (x < modules && matrix[y * modules + x]) x += 1;
      runs.push({ x: start, y, width: x - start });
    }
  }

  return { modules, runs };
}

/**
 * A share code as a QR symbol.
 *
 * Phone-to-phone sharing should be a camera point, not a retype: the share
 * code is short by design, but "FL1 C220 NP12 | 5m B10-6 #A7K3" read aloud
 * across a table is still four chances to get a character wrong, and the
 * checksum will correctly refuse the result.
 *
 * Drawn as vector rects rather than a rasterised image for two reasons. It
 * stays crisp at whatever size the layout gives it — a resampled QR is a
 * blurred QR, and blur is exactly what a scanner cannot forgive — and it needs
 * no network, no cache and no image pipeline, which matters because sharing a
 * protocol is something people do sitting next to each other, often on a
 * phone that has nothing to talk to.
 */
export function ShareCodeQr({ value, size = 220 }: ShareCodeQrProps) {
  // Encoding runs Reed-Solomon over the payload and then scores all eight mask
  // patterns to pick one, so it is keyed on the value and not repeated when the
  // card re-renders around it.
  const symbol = useMemo(() => encodeSymbol(value), [value]);

  if (!symbol) {
    return (
      <View style={[styles.frame, styles.fallback, { width: size }]}>
        <Text variant="caption" tone="tertiary" style={styles.fallbackText}>
          This code is too long to fit in a QR. Copy it instead.
        </Text>
      </View>
    );
  }

  // The viewBox is measured in modules, so the SVG scales to any `size` without
  // the module grid ever landing on a fraction we chose here.
  const extent = symbol.modules + QUIET_ZONE * 2;

  return (
    <View
      style={[styles.frame, { width: size, height: size }]}
      accessible
      accessibilityRole="image"
      accessibilityLabel={`QR code for the share code ${value}. Point another phone's camera at it to open this protocol.`}
    >
      <Svg width="100%" height="100%" viewBox={`0 0 ${extent} ${extent}`}>
        {/* Painted, not inherited: the quiet zone has to be the same white as
            the modules sit on, whatever the card behind it is doing. */}
        <Rect x={0} y={0} width={extent} height={extent} fill={colors.surfaceHigh} />
        {symbol.runs.map((run) => (
          <Rect
            key={`${run.y}:${run.x}`}
            x={run.x + QUIET_ZONE}
            y={run.y + QUIET_ZONE}
            width={run.width + BLEED}
            height={1 + BLEED}
            fill={colors.text}
          />
        ))}
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    backgroundColor: colors.surfaceHigh,
    borderRadius: radius.control,
    overflow: 'hidden',
    // The card behind is porcelain too, so the plate is separated by a hairline
    // rather than by contrast — the same way every other form on the panel is.
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.hairline,
  },
  fallback: { padding: space.lg, alignItems: 'center', justifyContent: 'center', minHeight: 88 },
  fallbackText: { textAlign: 'center' },
});
