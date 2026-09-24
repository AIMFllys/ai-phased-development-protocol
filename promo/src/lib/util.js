// Math, easing, seeded randomness and noise. Everything in the film is a pure
// function of time, so all randomness here is deterministic.

export const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
export const lerp = (a, b, k) => a + (b - a) * k;
export const invlerp = (a, b, x) => clamp((x - a) / (b - a));
/** 0..1 progress of t through [a, b], optionally eased. */
export const prog = (t, a, b, ease = (k) => k) => ease(invlerp(a, b, t));
export const smooth = (k) => k * k * (3 - 2 * k);
export const mix = (a, b, k) => a.map((v, i) => lerp(v, b[i], k));

export const ease = {
  linear: (k) => k,
  inQuad: (k) => k * k,
  outQuad: (k) => 1 - (1 - k) * (1 - k),
  inOutQuad: (k) => (k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2),
  inCubic: (k) => k ** 3,
  outCubic: (k) => 1 - (1 - k) ** 3,
  inOutCubic: (k) => (k < 0.5 ? 4 * k ** 3 : 1 - (-2 * k + 2) ** 3 / 2),
  inQuart: (k) => k ** 4,
  outQuart: (k) => 1 - (1 - k) ** 4,
  inOutQuart: (k) => (k < 0.5 ? 8 * k ** 4 : 1 - (-2 * k + 2) ** 4 / 2),
  inExpo: (k) => (k === 0 ? 0 : 2 ** (10 * k - 10)),
  outExpo: (k) => (k === 1 ? 1 : 1 - 2 ** (-10 * k)),
  inOutExpo: (k) => (k === 0 ? 0 : k === 1 ? 1 : k < 0.5 ? 2 ** (20 * k - 10) / 2 : (2 - 2 ** (-20 * k + 10)) / 2),
  outBack: (k, s = 1.70158) => 1 + (s + 1) * (k - 1) ** 3 + s * (k - 1) ** 2,
  inBack: (k, s = 1.70158) => (s + 1) * k ** 3 - s * k * k,
  outElastic: (k) => (k === 0 || k === 1 ? k : 2 ** (-10 * k) * Math.sin((k * 10 - 0.75) * (2 * Math.PI / 3)) + 1),
};

// --- deterministic randomness -------------------------------------------------
export function hash(n) {
  let x = (n | 0) ^ 0x9e3779b9;
  x = Math.imul(x ^ (x >>> 16), 0x85ebca6b);
  x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35);
  return ((x ^ (x >>> 16)) >>> 0) / 4294967296;
}
export const hashf = (a, b = 0, c = 0) => hash(Math.floor(a * 7919) + Math.floor(b * 104729) * 31 + Math.floor(c * 1299709) * 131);

export function rng(seed) {
  let s = (seed * 2654435761) >>> 0 || 1;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Smooth 1D value noise in [-1, 1]. */
export function noise1(x, seed = 0) {
  const i = Math.floor(x), f = x - i;
  const a = hash(i * 374761 + seed * 668265) * 2 - 1;
  const b = hash((i + 1) * 374761 + seed * 668265) * 2 - 1;
  return lerp(a, b, smooth(f));
}
/** Fractal 1D noise, roughly in [-1, 1]. */
export const fbm1 = (x, seed = 0) => noise1(x, seed) * 0.62 + noise1(x * 2.13, seed + 17) * 0.28 + noise1(x * 4.7, seed + 31) * 0.1;

/** Decaying camera shake: offsets for an impulse at t0. */
export function shake(t, t0, amp, decay = 7, freq = 38, seed = 1) {
  if (t < t0) return [0, 0, 0];
  const k = Math.exp(-(t - t0) * decay) * amp;
  return [noise1((t - t0) * freq, seed) * k, noise1((t - t0) * freq, seed + 9) * k, noise1((t - t0) * freq * 0.7, seed + 5) * k * 0.0008];
}

// --- timing ----------------------------------------------------------------
export const BPM = 120;
export const BEAT = 60 / BPM; // 0.5s
export const beat = (n) => n * BEAT;

/** Piecewise-linear keyframe track: [[t, v], ...] with optional per-segment ease. */
export function track(t, keys, easeFn = ease.inOutCubic) {
  if (t <= keys[0][0]) return keys[0][1];
  for (let i = 0; i < keys.length - 1; i++) {
    const [t0, v0] = keys[i], [t1, v1, e] = keys[i + 1];
    if (t <= t1) {
      const k = (e || easeFn)((t - t0) / (t1 - t0));
      return Array.isArray(v0) ? v0.map((v, j) => lerp(v, v1[j], k)) : lerp(v0, v1, k);
    }
  }
  return keys[keys.length - 1][1];
}

export const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
export const rgb = (c, a = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
export const mixHex = (a, b, k) => rgb(mix(hex(a), hex(b), clamp(k)));
export const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
