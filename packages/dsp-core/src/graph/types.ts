import type { EnvelopeShape, Waveform } from '../dsp/oscillator.js';
import type { NoiseColor } from '../dsp/noise.js';
import type { BiquadKind } from '../math/biquad.js';

/** Every processing block the routing graph can instantiate. */
export type NodeKind =
  | 'oscillator'
  | 'binaural'
  | 'monaural'
  | 'isochronic'
  | 'am'
  | 'fm'
  | 'harmonic'
  | 'noise'
  | 'gain'
  | 'filter'
  | 'pan'
  | 'stereoMotion'
  | 'mixer'
  | 'output';

export type NodeCategory = 'generator' | 'processor' | 'utility' | 'output';

export type ParamUnit = 'hz' | 'db' | 'percent' | 'ratio' | 'ms' | 'turns' | 'index' | 'none';

/** How a control's travel maps onto its value — logarithmic for frequencies. */
export type ParamTaper = 'linear' | 'log';

export interface ParamDescriptor {
  key: string;
  label: string;
  unit: ParamUnit;
  min: number;
  max: number;
  default: number;
  /** Decimal places the instrument readout shows. */
  precision: number;
  taper: ParamTaper;
  /** Whether an automation lane may target this parameter. */
  automatable: boolean;
  /** Smoothing time constant in seconds applied in the audio path. */
  smoothingSeconds?: number;
  /** One-line explanation shown in Lab Mode's parameter inspector. */
  help?: string;
}

export interface OptionDescriptor {
  key: string;
  label: string;
  values: readonly string[];
  default: string;
  help?: string;
}

export interface NodeDescriptor {
  kind: NodeKind;
  label: string;
  /** Short hardware-style abbreviation used on the signal-flow view. */
  shortLabel: string;
  category: NodeCategory;
  /** Maximum number of upstream connections. 0 for pure generators. */
  maxInputs: number;
  params: readonly ParamDescriptor[];
  options: readonly OptionDescriptor[];
  description: string;
}

/** A node as it is stored inside a protocol. */
export interface GraphNode {
  id: string;
  kind: NodeKind;
  /** User-visible name, defaults to the descriptor label. */
  label?: string;
  params: Record<string, number>;
  options: Record<string, string>;
  /** Bypassed nodes pass their summed input through unchanged. */
  bypass?: boolean;
  /** Editor position on the signal-flow canvas. Not part of the audio result. */
  position?: { x: number; y: number };
}

export interface GraphConnection {
  from: string;
  to: string;
}

export interface RoutingGraph {
  nodes: GraphNode[];
  connections: GraphConnection[];
}

/** Fully-qualified automation target: `nodeId:paramKey`. */
export type ParamAddress = string;

export function paramAddress(nodeId: string, paramKey: string): ParamAddress {
  return `${nodeId}:${paramKey}`;
}

export function parseParamAddress(address: ParamAddress): { nodeId: string; paramKey: string } | null {
  const index = address.indexOf(':');
  if (index <= 0 || index === address.length - 1) return null;
  return { nodeId: address.slice(0, index), paramKey: address.slice(index + 1) };
}

export const OUTPUT_NODE_ID = 'output';

export interface OptionTypes {
  waveform: Waveform;
  envelope: EnvelopeShape;
  noiseColor: NoiseColor;
  filterKind: BiquadKind;
}
