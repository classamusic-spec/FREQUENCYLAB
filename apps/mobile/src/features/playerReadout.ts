import {
  binauralFrequencies,
  type GraphConnection,
  type GraphNode,
} from '@frequencylab/dsp-core';

/**
 * What the player says the headphones are producing.
 *
 * ## The bug this replaces
 *
 * The session screen used to read three fixed telemetry keys — `tone:carrier`,
 * `tone:beat`, `tone:pulse` — and the renderer builds keys as
 * `${nodeId}:${param}`. That only ever matched three of the eight engines. A
 * plain tone compiles to `tone:oscillator` whose parameter is called
 * `frequency`; an AM preset puts its numbers on a node called `am`, not `tone`;
 * a harmonic stack calls its root `fundamental`.
 *
 * So 48 of the 80 factory presets found nothing — and *found nothing* did not
 * render as blank. `carrier` defaulted to `0` and the screen printed it, so a
 * Solfeggio session displayed
 *
 *     CARRIER 0.000 Hz   LEFT 0.000 Hz   RIGHT 0.000 Hz
 *
 * under a title reading `Transform — 528 Hz`, while a 528 Hz tone played. On
 * the one screen whose stated job is "what your headphones are literally
 * producing", that is not a missing number but a false one, which is worse.
 *
 * ## The rule
 *
 * Read the graph, never a guess. Every value below comes from the node that is
 * actually generating sound, by the parameter that node actually uses, and the
 * binaural ear split is `binauralFrequencies` from the core rather than a
 * second copy of the arithmetic — the previous screen assumed `right = carrier
 * + beat`, which is the offset mode only and silently wrong for every centered
 * preset.
 *
 * ## An insert is not a generator
 *
 * `AmNode` does two different jobs depending on whether anything is wired into
 * it. With no input it generates its own tone at `carrier`. With an input it is
 * an *insert* — it modulates what arrives and its `carrier` parameter is never
 * heard, kept alive only so that switching modes stays phase-continuous.
 *
 * Both shipped AM representations are the insert form: `am` presets are
 * `oscillator → am → mix`, and `noise-modulation` presets are
 * `noise → am → mix`. So the tone of a Gamma 40 preset is the *oscillator's*
 * frequency, and a modulated-noise preset has no tone at all — reading
 * `am.carrier` returns a number in both cases, and it is a dead one. That is
 * why this walks the connections instead of picking a node by kind.
 *
 * ## Where a number would be a lie, there is no number
 *
 * Noise has no single frequency. `null` says so, and the screen prints the
 * reason rather than `0.000 Hz` — the same distinction `presetReadout` already
 * makes on the library rows, where `null` means *this row genuinely has no
 * frequency* rather than *we could not find one*.
 */
export interface PlayerReadout {
  /** The tone being produced, or null when there is genuinely no single one. */
  carrierHz: number | null;
  /** The rate the sound moves at, or null when it does not move. */
  beatHz: number | null;
  /** What each ear receives. Null wherever `carrierHz` is. */
  leftHz: number | null;
  rightHz: number | null;
  /** The engine, named from the graph rather than from a label. */
  mode: string;
  /**
   * The short form, for the dial — a long sentence does not fit there and the
   * detail row below already carries the explanation.
   */
  absence: string | null;
  /** The full sentence, for the row that has room for it. */
  absenceDetail: string | null;
  /** What the rate row is called: engines pulse, they do not all beat. */
  beatLabel: string;
  /** What that row says when there is no rate at all. */
  noRateLabel: string;
  /** The caption under the dial's number. */
  headlineLabel: string;
}

const SILENT: PlayerReadout = {
  carrierHz: null,
  beatHz: null,
  leftHz: null,
  rightHz: null,
  mode: '—',
  absence: 'Nothing is playing',
  absenceDetail: 'Nothing is playing',
  beatLabel: 'Beat',
  noRateLabel: 'Steady',
  headlineLabel: '—',
};

const NOISE_SHORT = 'No single frequency';
const NOISE_DETAIL = 'Broadband noise — no single frequency';

/**
 * The generator, which is the node the readouts come from.
 *
 * Ordered by specificity rather than by graph position: a noise-modulation
 * preset has both an `am` and a `noise` node, and the `am` is the one carrying
 * the rate. `mixer` and `output` are never generators.
 */
const GENERATORS = [
  'binaural',
  'monaural',
  'isochronic',
  'am',
  'harmonic',
  'oscillator',
  'noise',
] as const;

/**
 * Reads the current value of a parameter from telemetry, falling back to the
 * value written into the graph.
 *
 * The renderer omits a key whose value is zero, so a parameter that is
 * legitimately at zero — a beat of 0 Hz on a steady tone — is absent from
 * telemetry rather than present as `0`. Falling back to the node's own params
 * is what tells those apart from a parameter that does not exist at all.
 */
function read(
  node: GraphNode,
  param: string,
  readouts: Record<string, number>,
): number | undefined {
  const live = readouts[`${node.id}:${param}`];
  if (typeof live === 'number') return live;
  const written = node.params?.[param];
  return typeof written === 'number' ? written : undefined;
}

export function playerReadout(
  nodes: readonly GraphNode[] | undefined,
  readouts: Record<string, number> | undefined,
  connections: readonly GraphConnection[] = [],
): PlayerReadout {
  if (!nodes?.length) return SILENT;
  const values = readouts ?? {};
  const live = (node: GraphNode, param: string) => read(node, param, values);

  const active = nodes.filter((node) => !node.bypass);
  const byId = new Map(active.map((node) => [node.id, node]));
  const feeds = (node: GraphNode) =>
    connections
      .filter((edge) => edge.to === node.id)
      .map((edge) => byId.get(edge.from))
      .filter((n): n is GraphNode => n !== undefined);

  /*
   * An AM node with something wired into it is an insert: it supplies the rate
   * and its source supplies the tone. Resolved first, because picking a node by
   * kind alone reads `am.carrier`, which in that arrangement is never heard.
   */
  const am = active.find((node) => node.kind === 'am');
  if (am) {
    const source = feeds(am)[0];
    const rate = live(am, 'modFrequency') ?? 0;
    if (source) {
      const tone = toneOf(source, live);
      return {
        carrierHz: tone,
        beatHz: rate,
        leftHz: tone,
        rightHz: tone,
        mode: tone === null ? 'Modulated noise' : 'Amplitude modulation',
        absence: tone === null ? NOISE_SHORT : null,
        absenceDetail: tone === null ? NOISE_DETAIL : null,
        beatLabel: 'Modulation',
        noRateLabel: 'Unmodulated',
        headlineLabel: 'Modulation',
      };
    }
    // No input: the node generates its own tone.
    const carrier = live(am, 'carrier') ?? 0;
    return {
      carrierHz: carrier,
      beatHz: rate,
      leftHz: carrier,
      rightHz: carrier,
      mode: 'Amplitude modulation',
      absence: null,
      absenceDetail: null,
      beatLabel: 'Modulation',
      noRateLabel: 'Unmodulated',
      headlineLabel: 'Modulation',
    };
  }

  let generator: GraphNode | undefined;
  for (const kind of GENERATORS) {
    generator = active.find((node) => node.kind === kind);
    if (generator) break;
  }
  if (!generator) return SILENT;

  const at = (param: string) => live(generator as GraphNode, param);
  const both = (hz: number | null, beat: number | null, label: string): PlayerReadout => ({
    carrierHz: hz,
    beatHz: beat,
    leftHz: hz,
    rightHz: hz,
    mode: MODE_WORDS[generator!.kind] ?? '—',
    absence: hz === null ? NOISE_SHORT : null,
    absenceDetail: hz === null ? NOISE_DETAIL : null,
    beatLabel: label,
    // Noise is not a "steady tone" — it is broadband, and simply not being
    // modulated. Naming the absence by the engine keeps the row true.
    noRateLabel: hz === null ? 'Unmodulated' : 'Steady tone',
    // The dial carries the rate where there is one, the pitch where there is
    // not, and nothing for noise. The caption must match whichever it got.
    headlineLabel: beat !== null ? label : hz === null ? 'Noise' : 'Tone',
  });

  switch (generator.kind) {
    case 'binaural': {
      const carrier = at('carrier') ?? 0;
      const beat = at('beat') ?? 0;
      // The core's own split, so offset and centered are both right.
      const ears = binauralFrequencies(carrier, beat, generator.options?.mode ?? 'offset');
      return {
        carrierHz: carrier,
        beatHz: beat,
        leftHz: ears.left,
        rightHz: ears.right,
        mode: 'Binaural',
        absence: null,
        absenceDetail: null,
        beatLabel: 'Beat',
        noRateLabel: 'Steady tone',
        headlineLabel: 'Beat',
      };
    }
    case 'monaural':
      return both(at('carrier') ?? 0, at('beat') ?? 0, 'Beat');
    case 'isochronic':
      return both(at('carrier') ?? 0, at('pulse') ?? 0, 'Pulse');
    case 'harmonic':
      // The stack's root. The partials are integer multiples of it and belong
      // on the preset page rather than on a two-line readout.
      return both(at('fundamental') ?? 0, null, 'Beat');
    case 'oscillator':
      // A steady tone: a frequency and no rate at all. `null` rather than `0`,
      // so the screen says "steady" instead of printing 0.000 Hz.
      return both(at('frequency') ?? 0, null, 'Beat');
    case 'noise':
      return both(null, null, 'Modulation');
    default:
      return SILENT;
  }
}

/** The frequency a node contributes, or null when it genuinely has none. */
function toneOf(
  node: GraphNode,
  live: (node: GraphNode, param: string) => number | undefined,
): number | null {
  switch (node.kind) {
    case 'oscillator':
      return live(node, 'frequency') ?? 0;
    case 'harmonic':
      return live(node, 'fundamental') ?? 0;
    case 'binaural':
    case 'monaural':
    case 'isochronic':
      return live(node, 'carrier') ?? 0;
    case 'noise':
      return null;
    default:
      return null;
  }
}

const MODE_WORDS: Record<string, string> = {
  binaural: 'Binaural',
  monaural: 'Monaural',
  isochronic: 'Isochronic',
  am: 'Amplitude modulation',
  harmonic: 'Harmonic series',
  oscillator: 'Tone',
  noise: 'Noise',
};
