import type { FrequencyPreset } from './types.js';

/**
 * Shared construction for the factory preset rows.
 *
 * Three fields are identical on every shipped preset — `schemaVersion`,
 * `factory` and the starting `version` — and repeating them 70-odd times is
 * three chances per row to ship a preset that claims to be something it is
 * not. They are filled in here instead, so a row in the data files is only the
 * parts that actually differ.
 *
 * `version` is bumped **by hand**, on the row, whenever the sound changes
 * (§43). It is not derived from anything: a session recorded against v1 has to
 * keep rendering as v1, which means a changed configuration ships as a new
 * version rather than silently editing the old one.
 */
export function preset(
  row: Omit<FrequencyPreset, 'schemaVersion' | 'factory' | 'version'> &
    Partial<Pick<FrequencyPreset, 'version'>>,
): FrequencyPreset {
  return {
    schemaVersion: 1,
    factory: true,
    version: row.version ?? 1,
    ...row,
  };
}

/**
 * The carrier the Brainwave Lab holds constant.
 *
 * A binaural beat's audibility depends on the carrier as well as the rate —
 * detection is reported as best for carriers in the 400–500 Hz region
 * (`carrier-440`) and for low hundreds of hertz generally (`carrier-choice`) —
 * so a shelf that varied both at once would be comparing two things and
 * measuring neither. 220 Hz is low enough to sit comfortably under a long
 * session and high enough for the beat to be clear.
 */
export const LAB_CARRIER_HZ = 220;

/**
 * The value a preset carries when it has no source frequency at all.
 *
 * Broadband noise is described by the slope of its spectrum, not by a
 * frequency, so "which hertz is pink noise" has no answer. The type requires a
 * number, so these rows carry zero with `role: 'unspecified'` — the same
 * placeholder convention the archive uses for its context-only records, and
 * with the same obligation on the interface: **show that the preset holds no
 * frequency, never print a 0 Hz readout**, which would be a value this module
 * does not hold.
 */
export const NO_SOURCE_FREQUENCY = 0;

/**
 * The library entry every preset screen is expected to link, regardless of
 * which preset is open.
 *
 * Hearing damage is a function of level and duration together, so it applies to
 * a tuning-fork demo and a 45-minute noise session alike. Linking it from each
 * of seventy rows would say nothing extra and would bury the evidence links
 * that actually differ between them.
 */
export const SAFETY_LIBRARY_ENTRY_ID = 'safe-listening';
