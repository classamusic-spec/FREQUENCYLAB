/**
 * Deterministic PRNG. Noise generation must be reproducible so that a protocol
 * rendered twice from the same DNA produces bit-identical audio (see docs/DSP.md
 * "Determinism"). `Math.random` is never used inside the DSP core.
 */

/** xoshiro128** — fast, good distribution, 128 bits of state. */
export class Rng {
  private s0 = 0;
  private s1 = 0;
  private s2 = 0;
  private s3 = 0;

  constructor(seed: number | string = 0x5eed) {
    this.reseed(seed);
  }

  reseed(seed: number | string): void {
    let h = typeof seed === 'string' ? hashString(seed) : seed >>> 0;
    // SplitMix32 expansion so a small seed still fills the state well.
    this.s0 = (h = splitmix32(h));
    this.s1 = (h = splitmix32(h));
    this.s2 = (h = splitmix32(h));
    this.s3 = splitmix32(h);
    if ((this.s0 | this.s1 | this.s2 | this.s3) === 0) this.s3 = 1;
    // Discard the first values, which correlate with the seed.
    for (let i = 0; i < 16; i++) this.nextUint32();
  }

  nextUint32(): number {
    const result = (Math.imul(rotl(Math.imul(this.s1, 5) >>> 0, 7) >>> 0, 9) >>> 0) >>> 0;
    const t = (this.s1 << 9) >>> 0;
    this.s2 = (this.s2 ^ this.s0) >>> 0;
    this.s3 = (this.s3 ^ this.s1) >>> 0;
    this.s1 = (this.s1 ^ this.s2) >>> 0;
    this.s0 = (this.s0 ^ this.s3) >>> 0;
    this.s2 = (this.s2 ^ t) >>> 0;
    this.s3 = rotl(this.s3, 11) >>> 0;
    return result;
  }

  /** Uniform in [0, 1). */
  nextFloat(): number {
    return this.nextUint32() / 4294967296;
  }

  /** Uniform in [-1, 1). */
  nextBipolar(): number {
    return this.nextFloat() * 2 - 1;
  }

  /** Uniform integer in [0, maxExclusive). */
  nextInt(maxExclusive: number): number {
    if (maxExclusive <= 0) return 0;
    return Math.floor(this.nextFloat() * maxExclusive);
  }

  /** Standard normal via Box–Muller. */
  nextGaussian(): number {
    let u = 0;
    while (u === 0) u = this.nextFloat();
    const v = this.nextFloat();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }
}

function rotl(x: number, k: number): number {
  return ((x << k) | (x >>> (32 - k))) >>> 0;
}

function splitmix32(a: number): number {
  a = (a + 0x9e3779b9) >>> 0;
  let t = a;
  t = Math.imul(t ^ (t >>> 16), 0x21f0aaad) >>> 0;
  t = Math.imul(t ^ (t >>> 15), 0x735a2d97) >>> 0;
  return (t ^ (t >>> 15)) >>> 0;
}

export function hashString(value: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}
