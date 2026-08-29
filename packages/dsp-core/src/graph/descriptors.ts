import { ENVELOPE_SHAPES, WAVEFORMS } from '../dsp/oscillator.js';
import { NOISE_COLORS } from '../dsp/noise.js';
import {
  MAX_BEAT_HZ,
  MAX_CARRIER_HZ,
  MAX_TONE_HZ,
  MIN_BEAT_HZ,
  MIN_CARRIER_HZ,
} from '../math/constants.js';
import type { NodeDescriptor, NodeKind, ParamDescriptor } from './types.js';

/**
 * The single source of truth for every parameter in the instrument.
 *
 * The UI builds encoders, numeric entry ranges, accessibility labels and
 * automation lane scales from these descriptors, and the DSP validates against
 * them. There is no second copy of a range anywhere in the product.
 */

const carrier = (over: Partial<ParamDescriptor> = {}): ParamDescriptor => ({
  key: 'carrier',
  label: 'Carrier',
  unit: 'hz',
  min: MIN_CARRIER_HZ,
  max: MAX_CARRIER_HZ,
  default: 220,
  precision: 3,
  taper: 'log',
  automatable: true,
  smoothingSeconds: 0.02,
  help: 'The audible tone the ear actually hears.',
  ...over,
});

const amplitude = (defaultValue = 0.5): ParamDescriptor => ({
  key: 'amplitude',
  label: 'Amplitude',
  unit: 'ratio',
  min: 0,
  max: 1,
  default: defaultValue,
  precision: 3,
  taper: 'linear',
  automatable: true,
  smoothingSeconds: 0.02,
  help: 'Linear output level of this module before the master chain.',
});

const phase: ParamDescriptor = {
  key: 'phase',
  label: 'Phase',
  unit: 'turns',
  min: 0,
  max: 1,
  default: 0,
  precision: 3,
  taper: 'linear',
  automatable: false,
  help: 'Starting phase offset, in turns. Applied at session start only.',
};

const pan: ParamDescriptor = {
  key: 'pan',
  label: 'Pan',
  unit: 'ratio',
  min: -1,
  max: 1,
  default: 0,
  precision: 2,
  taper: 'linear',
  automatable: true,
  smoothingSeconds: 0.03,
  help: 'Equal-power stereo position. -1 is hard left, +1 is hard right.',
};

export const NODE_DESCRIPTORS: Record<NodeKind, NodeDescriptor> = {
  oscillator: {
    kind: 'oscillator',
    label: 'Oscillator',
    shortLabel: 'OSC',
    category: 'generator',
    maxInputs: 0,
    description: 'A single phase-continuous tone. The simplest generator in the rack.',
    params: [
      carrier({ key: 'frequency', label: 'Frequency', max: MAX_TONE_HZ }),
      amplitude(0.4),
      phase,
      pan,
    ],
    options: [
      { key: 'waveform', label: 'Waveform', values: WAVEFORMS, default: 'sine' },
    ],
  },

  binaural: {
    kind: 'binaural',
    label: 'Binaural Engine',
    shortLabel: 'BIN',
    category: 'generator',
    maxInputs: 0,
    description:
      'Two independent tones, one per ear. The beat exists in perception, not in either channel.',
    params: [
      carrier(),
      {
        key: 'beat',
        label: 'Beat',
        unit: 'hz',
        min: MIN_BEAT_HZ,
        max: MAX_BEAT_HZ,
        default: 7.83,
        precision: 3,
        taper: 'log',
        automatable: true,
        smoothingSeconds: 0.05,
        help: 'Difference between the left and right tone.',
      },
      amplitude(0.4),
      {
        key: 'separation',
        label: 'Separation',
        unit: 'ratio',
        min: 0,
        max: 1,
        default: 1,
        precision: 2,
        taper: 'linear',
        automatable: true,
        smoothingSeconds: 0.05,
        help: 'Channel isolation. Below 1 the two tones bleed into both ears.',
      },
      { ...phase, key: 'phase', label: 'Phase' },
    ],
    options: [
      { key: 'waveform', label: 'Waveform', values: WAVEFORMS, default: 'sine' },
      {
        key: 'mode',
        label: 'Calculation',
        values: ['offset', 'centered'],
        default: 'offset',
        help: 'offset: L = carrier, R = carrier + beat. centered: carrier ± beat/2.',
      },
    ],
  },

  monaural: {
    kind: 'monaural',
    label: 'Monaural Engine',
    shortLabel: 'MON',
    category: 'generator',
    maxInputs: 0,
    description:
      'Two tones summed before the output, so the interference is acoustic and survives speakers.',
    params: [
      carrier(),
      {
        key: 'beat',
        label: 'Difference',
        unit: 'hz',
        min: MIN_BEAT_HZ,
        max: MAX_BEAT_HZ,
        default: 10,
        precision: 3,
        taper: 'log',
        automatable: true,
        smoothingSeconds: 0.05,
      },
      {
        key: 'mix',
        label: 'Mix',
        unit: 'ratio',
        min: 0,
        max: 1,
        default: 0.5,
        precision: 2,
        taper: 'linear',
        automatable: true,
        smoothingSeconds: 0.03,
        help: 'Balance between the two summed tones. 0.5 gives the deepest beat.',
      },
      amplitude(0.4),
      pan,
    ],
    options: [{ key: 'waveform', label: 'Waveform', values: WAVEFORMS, default: 'sine' }],
  },

  isochronic: {
    kind: 'isochronic',
    label: 'Isochronic Engine',
    shortLabel: 'ISO',
    category: 'generator',
    maxInputs: 0,
    description: 'An audible carrier gated on and off at the pulse rate.',
    params: [
      carrier(),
      {
        key: 'pulse',
        label: 'Pulse',
        unit: 'hz',
        min: MIN_BEAT_HZ,
        max: MAX_BEAT_HZ,
        default: 10,
        precision: 3,
        taper: 'log',
        automatable: true,
        smoothingSeconds: 0.05,
      },
      {
        key: 'duty',
        label: 'Duty',
        unit: 'percent',
        min: 0.05,
        max: 0.95,
        default: 0.5,
        precision: 2,
        taper: 'linear',
        automatable: true,
        smoothingSeconds: 0.05,
        help: 'Fraction of each cycle the carrier is audible.',
      },
      {
        key: 'depth',
        label: 'Depth',
        unit: 'percent',
        min: 0,
        max: 1,
        default: 1,
        precision: 2,
        taper: 'linear',
        automatable: true,
        smoothingSeconds: 0.05,
      },
      {
        key: 'attack',
        label: 'Attack',
        unit: 'percent',
        min: 0,
        max: 0.5,
        default: 0.15,
        precision: 2,
        taper: 'linear',
        automatable: true,
        smoothingSeconds: 0.05,
        help: 'Rise time as a fraction of the on-period. Longer removes edge clicks.',
      },
      {
        key: 'release',
        label: 'Release',
        unit: 'percent',
        min: 0,
        max: 0.5,
        default: 0.25,
        precision: 2,
        taper: 'linear',
        automatable: true,
        smoothingSeconds: 0.05,
      },
      amplitude(0.4),
      pan,
    ],
    options: [
      { key: 'waveform', label: 'Waveform', values: WAVEFORMS, default: 'sine' },
      { key: 'envelope', label: 'Envelope', values: ENVELOPE_SHAPES, default: 'softSquare' },
    ],
  },

  am: {
    kind: 'am',
    label: 'AM Engine',
    shortLabel: 'AM',
    category: 'generator',
    maxInputs: 1,
    description:
      'Amplitude modulation. With no input it modulates its own carrier; with an input it modulates that signal.',
    params: [
      carrier({ default: 220 }),
      {
        key: 'modFrequency',
        label: 'Mod Rate',
        unit: 'hz',
        min: MIN_BEAT_HZ,
        max: MAX_BEAT_HZ,
        default: 40,
        precision: 3,
        taper: 'log',
        automatable: true,
        smoothingSeconds: 0.05,
      },
      {
        key: 'depth',
        label: 'Depth',
        unit: 'percent',
        min: 0,
        max: 1,
        default: 0.5,
        precision: 2,
        taper: 'linear',
        automatable: true,
        smoothingSeconds: 0.05,
        help: 'Modulation index. 1 takes the signal fully to silence each cycle.',
      },
      amplitude(0.4),
      pan,
    ],
    options: [
      { key: 'waveform', label: 'Waveform', values: WAVEFORMS, default: 'sine' },
      { key: 'envelope', label: 'Mod Shape', values: ENVELOPE_SHAPES, default: 'sine' },
    ],
  },

  fm: {
    kind: 'fm',
    label: 'FM Engine',
    shortLabel: 'FM',
    category: 'generator',
    maxInputs: 0,
    description: 'Frequency modulation of the carrier by a sine modulator.',
    params: [
      carrier(),
      {
        key: 'modFrequency',
        label: 'Mod Rate',
        unit: 'hz',
        min: 0.05,
        max: 400,
        default: 5,
        precision: 3,
        taper: 'log',
        automatable: true,
        smoothingSeconds: 0.05,
      },
      {
        key: 'deviation',
        label: 'Deviation',
        unit: 'hz',
        min: 0,
        max: 400,
        default: 10,
        precision: 3,
        taper: 'linear',
        automatable: true,
        smoothingSeconds: 0.05,
        help: 'Peak frequency swing either side of the carrier.',
      },
      {
        key: 'depth',
        label: 'Depth',
        unit: 'percent',
        min: 0,
        max: 1,
        default: 1,
        precision: 2,
        taper: 'linear',
        automatable: true,
        smoothingSeconds: 0.05,
      },
      amplitude(0.35),
      pan,
    ],
    options: [{ key: 'waveform', label: 'Waveform', values: WAVEFORMS, default: 'sine' }],
  },

  harmonic: {
    kind: 'harmonic',
    label: 'Harmonic Engine',
    shortLabel: 'HRM',
    category: 'generator',
    maxInputs: 0,
    description: 'A fundamental plus seven independently levelled partials.',
    params: [
      carrier({ key: 'fundamental', label: 'Fundamental', default: 110 }),
      ...Array.from({ length: 8 }, (_, index): ParamDescriptor => ({
        key: `h${index + 1}`,
        label: index === 0 ? 'Fundamental Level' : `${index + 1}×`,
        unit: 'ratio',
        min: 0,
        max: 1,
        /*
         * A half-amplitude 1/n series, the natural ratio of a sawtooth's
         * partials — and running to all eight rather than stopping at four.
         *
         * It used to stop: partials 5 through 8 defaulted to exactly zero, on a
         * node whose own description is "a fundamental plus seven independently
         * levelled partials". Nothing could override them either, because
         * `buildStandardGraph` passes only the fundamental and the amplitude.
         * So `Harmonic series on 110 Hz` named eight partials, rendered four,
         * and its note about the seventh sitting 31 cents flat described a
         * frequency that was not in the output.
         *
         * Changing a default cannot disturb a protocol already saved:
         * `makeNode` bakes every default into `params` when a node is built, so
         * existing graphs carry their own values. And share codes still round
         * trip, because both the encode and the decode side reach this same
         * default through the same builder.
         */
        default: index === 0 ? 1 : 0.5 / (index + 1),
        precision: 3,
        taper: 'linear',
        automatable: true,
        smoothingSeconds: 0.03,
      })),
      amplitude(0.35),
      pan,
    ],
    options: [],
  },

  noise: {
    kind: 'noise',
    label: 'Noise Engine',
    shortLabel: 'NSE',
    category: 'generator',
    maxInputs: 0,
    description: 'Procedurally generated white, pink or brown noise. Never a looped file.',
    params: [
      {
        key: 'level',
        label: 'Level',
        unit: 'percent',
        min: 0,
        max: 1,
        default: 0.12,
        precision: 3,
        taper: 'linear',
        automatable: true,
        smoothingSeconds: 0.05,
      },
      {
        key: 'width',
        label: 'Width',
        unit: 'percent',
        min: 0,
        max: 1,
        default: 0.7,
        precision: 2,
        taper: 'linear',
        automatable: true,
        smoothingSeconds: 0.1,
        help: '0 places the bed dead centre, 1 fully decorrelates the two channels.',
      },
      {
        key: 'cutoff',
        label: 'Cutoff',
        unit: 'hz',
        min: 60,
        max: 18000,
        default: 8000,
        precision: 0,
        taper: 'log',
        automatable: true,
        smoothingSeconds: 0.05,
      },
      {
        key: 'resonance',
        label: 'Resonance',
        unit: 'ratio',
        min: 0.3,
        max: 8,
        default: 0.707,
        precision: 3,
        taper: 'log',
        automatable: false,
      },
      {
        key: 'modDepth',
        label: 'Mod Depth',
        unit: 'percent',
        min: 0,
        max: 1,
        default: 0,
        precision: 2,
        taper: 'linear',
        automatable: true,
        smoothingSeconds: 0.05,
        help: 'Slow amplitude breathing applied to the noise bed.',
      },
      {
        key: 'modRate',
        label: 'Mod Rate',
        unit: 'hz',
        min: 0.01,
        max: 4,
        default: 0.1,
        precision: 3,
        taper: 'log',
        automatable: true,
        smoothingSeconds: 0.1,
      },
    ],
    options: [
      { key: 'color', label: 'Colour', values: NOISE_COLORS, default: 'pink' },
      { key: 'filter', label: 'Filter', values: ['off', 'lowpass', 'highpass', 'bandpass'], default: 'lowpass' },
    ],
  },

  gain: {
    kind: 'gain',
    label: 'Gain',
    shortLabel: 'GAIN',
    category: 'processor',
    maxInputs: 8,
    description: 'Linear level trim.',
    params: [
      {
        key: 'gain',
        label: 'Gain',
        unit: 'ratio',
        min: 0,
        max: 2,
        default: 1,
        precision: 3,
        taper: 'linear',
        automatable: true,
        smoothingSeconds: 0.02,
      },
    ],
    options: [],
  },

  filter: {
    kind: 'filter',
    label: 'Filter',
    shortLabel: 'FLT',
    category: 'processor',
    maxInputs: 8,
    description: 'Stereo biquad filter.',
    params: [
      {
        key: 'cutoff',
        label: 'Cutoff',
        unit: 'hz',
        min: 20,
        max: 18000,
        default: 1200,
        precision: 0,
        taper: 'log',
        automatable: true,
        smoothingSeconds: 0.03,
      },
      {
        key: 'resonance',
        label: 'Q',
        unit: 'ratio',
        min: 0.2,
        max: 12,
        default: 0.707,
        precision: 3,
        taper: 'log',
        automatable: true,
        smoothingSeconds: 0.05,
      },
      {
        key: 'gainDb',
        label: 'Gain',
        unit: 'db',
        min: -24,
        max: 24,
        default: 0,
        precision: 1,
        taper: 'linear',
        automatable: true,
        smoothingSeconds: 0.05,
      },
    ],
    options: [
      {
        key: 'kind',
        label: 'Type',
        values: ['lowpass', 'highpass', 'bandpass', 'notch', 'lowshelf', 'highshelf', 'peaking'],
        default: 'lowpass',
      },
    ],
  },

  pan: {
    kind: 'pan',
    label: 'Pan',
    shortLabel: 'PAN',
    category: 'processor',
    maxInputs: 8,
    description: 'Static equal-power stereo placement.',
    params: [pan],
    options: [],
  },

  stereoMotion: {
    kind: 'stereoMotion',
    label: 'Stereo Motion',
    shortLabel: 'MOV',
    category: 'processor',
    maxInputs: 8,
    description: 'Slow bilateral movement of the incoming signal across the stereo field.',
    params: [
      {
        key: 'rate',
        label: 'Rate',
        unit: 'hz',
        min: 0.01,
        max: 8,
        default: 0.75,
        precision: 3,
        taper: 'log',
        automatable: true,
        smoothingSeconds: 0.1,
      },
      {
        key: 'depth',
        label: 'Depth',
        unit: 'percent',
        min: 0,
        max: 1,
        default: 0.6,
        precision: 2,
        taper: 'linear',
        automatable: true,
        smoothingSeconds: 0.1,
      },
      {
        key: 'center',
        label: 'Centre',
        unit: 'ratio',
        min: -1,
        max: 1,
        default: 0,
        precision: 2,
        taper: 'linear',
        automatable: true,
        smoothingSeconds: 0.1,
      },
    ],
    options: [
      { key: 'shape', label: 'Shape', values: ['sine', 'triangle'], default: 'sine' },
    ],
  },

  mixer: {
    kind: 'mixer',
    label: 'Mixer',
    shortLabel: 'MIX',
    category: 'utility',
    maxInputs: 16,
    description: 'Sums several signals with a single output trim.',
    params: [
      {
        key: 'gain',
        label: 'Gain',
        unit: 'ratio',
        min: 0,
        max: 2,
        default: 1,
        precision: 3,
        taper: 'linear',
        automatable: true,
        smoothingSeconds: 0.02,
      },
    ],
    options: [],
  },

  output: {
    kind: 'output',
    label: 'Output',
    shortLabel: 'OUT',
    category: 'output',
    maxInputs: 16,
    description: 'The single terminal node. Everything audible reaches the master chain here.',
    params: [],
    options: [],
  },
};

export const NODE_KINDS = Object.keys(NODE_DESCRIPTORS) as NodeKind[];

export function getDescriptor(kind: NodeKind): NodeDescriptor {
  const descriptor = NODE_DESCRIPTORS[kind];
  if (!descriptor) throw new Error(`Unknown node kind: ${kind}`);
  return descriptor;
}

export function getParamDescriptor(kind: NodeKind, key: string): ParamDescriptor | undefined {
  return getDescriptor(kind).params.find((param) => param.key === key);
}

/** Builds a fully-populated parameter map from a descriptor's defaults. */
export function defaultParams(kind: NodeKind, overrides: Record<string, number> = {}): Record<string, number> {
  const result: Record<string, number> = {};
  for (const param of getDescriptor(kind).params) result[param.key] = param.default;
  return { ...result, ...overrides };
}

export function defaultOptions(kind: NodeKind, overrides: Record<string, string> = {}): Record<string, string> {
  const result: Record<string, string> = {};
  for (const option of getDescriptor(kind).options) result[option.key] = option.default;
  return { ...result, ...overrides };
}
