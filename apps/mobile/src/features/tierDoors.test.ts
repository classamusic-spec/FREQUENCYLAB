import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { type ExperienceLevel } from '@frequencylab/dsp-core';
import { DOORED_SECTIONS, levelOpensRoute } from './tierCapabilities';

/**
 * Doors, and links into them.
 *
 * A level door is honest: `/collections/:id` is a list of frequencies by value,
 * and a version of it with the numbers taken out would be a lie rather than a
 * simplification, so Simple meets a wall that names what is behind it. What is
 * not honest is a screen that *offers* that link anyway.
 *
 * That is the bug these tests exist for. The doors were added to four screens,
 * each reasoning in a comment that the screens behind them were "only ever
 * reached by a link or a typed address" — while the Library route sat in the
 * tab bar at every level, named *Sounds* at Simple, drawing ten shelf rows and
 * an "All twelve shelves" button straight into them. Eleven controls that could
 * not work, each one announcing a preset count it would never show:
 *
 *   under the sounds tab when I click a module there are no presets listed
 *
 * Nothing could have caught it, because "which routes are doored" lived only
 * inside the four screens that doored them and "which links are offered" was
 * decided somewhere else entirely. The two questions now have one answer,
 * `DOORED_SECTIONS`, and these are the tests on it.
 */

const LEVELS: ExperienceLevel[] = ['simple', 'explorer', 'lab'];

describe('which routes a level opens', () => {
  it('doors the collection and preset screens at Simple, and only there', () => {
    const doored = [
      '/collections',
      '/collections/wellness',
      '/collections/acoustic-fundamentals',
      '/preset/solf-528',
      '/preset/compare',
    ];
    for (const route of doored) {
      expect(levelOpensRoute('simple', route), route).toBe(false);
      expect(levelOpensRoute('explorer', route), route).toBe(true);
      expect(levelOpensRoute('lab', route), route).toBe(true);
    }
  });

  it('opens everything the table does not name, at every level', () => {
    /*
     * The table lists the exceptions, never the permissions. A route missing
     * from it must open — the failure to avoid is a helper that quietly closes
     * the app down to the sections somebody remembered to write out.
     */
    const open = ['/', '/library', '/library/solfeggio', '/archive', '/profile', '/quick-start'];
    for (const level of LEVELS) {
      for (const route of open) expect(levelOpensRoute(level, route), `${level} ${route}`).toBe(true);
    }
  });

  it('matches whole path segments rather than prefixes', () => {
    // `/presets-by-goal` is not `/preset`, and a prefix test would door it.
    expect(levelOpensRoute('simple', '/presets-by-goal')).toBe(true);
    expect(levelOpensRoute('simple', '/collection-notes')).toBe(true);
    expect(levelOpensRoute('simple', '/preset')).toBe(false);
    expect(levelOpensRoute('simple', '/preset/solf-528?from=search')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// The invariant the screens have to keep
// ---------------------------------------------------------------------------

// `join`, not `new URL` — the app's TypeScript config has the DOM's `URL` in
// scope, which is not the one `node:url` accepts.
const APP_DIR = `${join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'app')}/`;

function screens(dir: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) found.push(...screens(path));
    else if (entry.name.endsWith('.tsx')) found.push(path);
  }
  return found;
}

/** `app/collections/[id].tsx` → `collections`. */
function sectionOf(path: string): string {
  return path.slice(APP_DIR.length).split('/')[0].replace(/\.tsx$/, '');
}

const LINK = /router\.(?:push|replace|navigate)\(\s*[`'"]\/([a-zA-Z0-9-]+)/g;

/** How far back a guard may sit and still plainly be this link's condition. */
const GUARD_WINDOW = 420;

describe('no screen offers a link into a door', () => {
  it('guards every link into a doored section on the level', () => {
    const offences: string[] = [];

    for (const path of screens(APP_DIR)) {
      // A screen that is itself behind the door cannot be reached without
      // passing it, so its own outgoing links are already conditional.
      if (DOORED_SECTIONS[sectionOf(path)] !== undefined) continue;

      const source = readFileSync(path, 'utf8');
      for (const match of source.matchAll(LINK)) {
        const capability = DOORED_SECTIONS[match[1]];
        if (capability === undefined) continue;

        const before = source.slice(Math.max(0, match.index - GUARD_WINDOW), match.index);
        const guarded =
          before.includes('opensRoute(') || before.includes(`canSee('${capability}')`);
        if (!guarded) {
          const line = source.slice(0, match.index).split('\n').length;
          offences.push(`${path.slice(APP_DIR.length)}:${line} → /${match[1]}`);
        }
      }
    }

    expect(offences, offences.join('\n')).toEqual([]);
  });

  it('is looking at the real screens', () => {
    // The test above passes trivially if the walk finds nothing, and a moved
    // directory or a renamed route file is exactly how that happens quietly.
    const found = screens(APP_DIR);
    expect(found.length).toBeGreaterThan(20);
    expect(found.some((path) => path.endsWith('(tabs)/library.tsx'))).toBe(true);
    expect(
      found.filter((path) => DOORED_SECTIONS[sectionOf(path)] !== undefined).length,
    ).toBeGreaterThanOrEqual(4);
  });
});
