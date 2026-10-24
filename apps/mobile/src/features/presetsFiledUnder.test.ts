import { describe, expect, it } from 'vitest';
import { FACTORY_PRESETS, LIBRARY_ENTRIES } from '@frequencylab/dsp-core';
import { presetsFiledUnder } from './presetPlayback';

describe('presetsFiledUnder', () => {
  it('leads from the 40.68 MHz study to the thunderstorm built on it', () => {
    expect(presetsFiledUnder('ultrashort-wave-glymphatic').map((preset) => preset.id)).toEqual([
      'noise-storm-40',
    ]);
  });

  it('is exactly the reverse of each preset’s own filing', () => {
    for (const entry of LIBRARY_ENTRIES) {
      const listed = new Set(presetsFiledUnder(entry.id).map((preset) => preset.id));
      for (const preset of FACTORY_PRESETS) {
        expect(listed.has(preset.id), `${entry.id} / ${preset.id}`).toBe(
          preset.libraryEntryIds.includes(entry.id),
        );
      }
    }
  });

  it('lists nothing for an entry no preset rests on', () => {
    expect(presetsFiledUnder('safe-listening')).toEqual([]);
    expect(presetsFiledUnder('no-such-entry')).toEqual([]);
  });
});
