/**
 * @frequencylab/dsp-core
 *
 * The whole instrument, minus the interface: oscillators, engines, the routing
 * graph, the protocol schema, deterministic playback, offline rendering and the
 * analysis used by experiments and insights.
 *
 * The package has no runtime dependencies and no platform assumptions, so the
 * identical code runs in the app, in the offline renderer and in the test suite.
 */

export * from './math/constants.js';
export * from './math/util.js';
export * from './math/curves.js';
export * from './math/rng.js';
export * from './math/smoother.js';
export * from './math/biquad.js';
export * from './math/fft.js';

export * from './dsp/oscillator.js';
export * from './dsp/noise.js';
export * from './dsp/limiter.js';
export * from './dsp/meter.js';

export * from './graph/types.js';
export * from './graph/descriptors.js';
export * from './graph/factory.js';
export * from './graph/validate.js';
export * from './graph/renderGraph.js';
export type { RenderContext } from './graph/nodes/base.js';
export { RuntimeNode } from './graph/nodes/base.js';
export { binauralFrequencies } from './graph/nodes/generators.js';

export * from './protocol/schema.js';
export * from './protocol/automation.js';
export * from './protocol/canonical.js';
export * from './protocol/sha256.js';
export * from './protocol/dna.js';
export * from './protocol/validate.js';
export * from './protocol/migrate.js';
export * from './protocol/builders.js';
export * from './protocol/recipes.js';

export * from './engine/master.js';
export * from './engine/sessionRenderer.js';
export * from './engine/offline.js';
export * from './engine/wav.js';
