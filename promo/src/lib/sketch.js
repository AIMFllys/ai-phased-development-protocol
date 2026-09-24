// Hand-drawn stroke engine. A stroke is a polyline that gets resampled, wobbled
// with seeded noise ("boil" re-seeds it ~12x a second like hand-drawn animation),
// then turned into a filled outline whose width follows pen pressure.
import { clamp, lerp, noise1, fbm1, hash, ease } from './util.js';

const f1 = (v) => Math.round(v * 10) / 10;

export function resample(pts, step = 5) {
  const out = [pts[0]];
  let carry = 0;
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1], [x1, y1] = pts[i];
    const len = Math.hypot(x1 - x0, y1 - y0);
    let d = step - carry;
    while (d <= len) {
      out.push([lerp(x0, x1, d / len), lerp(y0, y1, d / len)]);
      d += step;
    }
    carry = len - (d - step);
  }
  const last = pts[pts.length - 1], tail = out[out.length - 1];
  if (Math.hypot(last[0] - tail[0], last[1] - tail[1]) > 0.5) out.push(last);
  return out;
}

function lengths(pts) {
  const s = [0];
  for (let i = 1; i < pts.length; i++) s.push(s[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  return s;
}

/**
 * Filled outline path for a hand-drawn stroke.
 * o: { seed, boil, amp, width, progress, overshoot, taper, pressure }
 */
export function strokeD(raw, o = {}) {
  const seed = o.seed ?? 1, boil = o.boil ?? 0, amp = o.amp ?? 1.2, width = o.width ?? 3;
  const progress = o.progress ?? 1;
  if (progress <= 0.001 || raw.length < 2) return '';
  let pts = raw.map((p) => [p[0], p[1]]);
  if (o.overshoot) {
    const ext = (a, b, k) => {
      const dx = a[0] - b[0], dy = a[1] - b[1], l = Math.hypot(dx, dy) || 1;
      return [a[0] + (dx / l) * k, a[1] + (dy / l) * k];
    };
    pts[0] = ext(pts[0], pts[1], o.overshoot * (0.3 + hash(seed * 7) * 0.7));
    const n = pts.length;
    pts[n - 1] = ext(pts[n - 1], pts[n - 2], o.overshoot * (0.3 + hash(seed * 13) * 0.7));
  }
  pts = resample(pts, o.step ?? 5);
  const S = lengths(pts), L = S[S.length - 1] || 1;
  const cut = progress * L;

  // jitter along normals + a per-boil drift so the whole line "breathes"
  const bs = seed * 3.17 + boil * 5.31;
  const dx = noise1(bs, 3) * amp * 0.6, dy = noise1(bs, 4) * amp * 0.6;
  const P = [], U = [];
  for (let i = 0; i < pts.length; i++) {
    if (S[i] > cut) {
      const k = (cut - S[i - 1]) / (S[i] - S[i - 1]);
      P.push([lerp(pts[i - 1][0], pts[i][0], k), lerp(pts[i - 1][1], pts[i][1], k)]);
      U.push(cut / L);
      break;
    }
    P.push(pts[i]);
    U.push(S[i] / L);
  }
  if (P.length < 2) return '';
  const J = P.map((p, i) => {
    const a = P[Math.max(0, i - 1)], b = P[Math.min(P.length - 1, i + 1)];
    let tx = b[0] - a[0], ty = b[1] - a[1];
    const tl = Math.hypot(tx, ty) || 1;
    const s = U[i] * L;
    const off = amp * (fbm1(s / 110 + bs, seed) + 0.25 * noise1(s / 13 + bs * 1.7, seed + 7));
    return [p[0] - (ty / tl) * off + dx, p[1] + (tx / tl) * off + dy];
  });

  // pressure: taper at both ends of the *full* stroke, never at the live tip
  const taper = o.taper ?? 0.12, pressure = o.pressure ?? 0.35;
  const L2 = [], R2 = [];
  for (let i = 0; i < J.length; i++) {
    const u = U[i];
    const tin = clamp(u / taper), tout = progress < 1 ? 1 : clamp((1 - u) / taper);
    const env = (0.35 + 0.65 * ease.outQuad(tin)) * (0.35 + 0.65 * ease.outQuad(tout));
    const w = width * env * (1 - pressure * 0.5 + pressure * 0.5 * (1 + noise1(u * L / 70 + seed, seed + 2)) / 1) / 2;
    const a = J[Math.max(0, i - 1)], b = J[Math.min(J.length - 1, i + 1)];
    let tx = b[0] - a[0], ty = b[1] - a[1];
    const tl = Math.hypot(tx, ty) || 1;
    tx /= tl; ty /= tl;
    L2.push([J[i][0] - ty * w, J[i][1] + tx * w]);
    R2.push([J[i][0] + ty * w, J[i][1] - tx * w]);
  }
  // round cap at the live tip
  const e = J[J.length - 1], el = L2[L2.length - 1], er = R2[R2.length - 1];
  const cx = (el[0] + er[0]) / 2, cy = (el[1] + er[1]) / 2;
  const r = Math.hypot(el[0] - cx, el[1] - cy);
  const ang = Math.atan2(el[1] - cy, el[0] - cx);
  const cap = [];
  for (let k = 1; k < 4; k++) cap.push([e[0] + Math.cos(ang - (Math.PI * k) / 4) * r, e[1] + Math.sin(ang - (Math.PI * k) / 4) * r]);
  const ring = [...L2, ...cap, ...R2.reverse()];
  return 'M' + ring.map((p) => f1(p[0]) + ',' + f1(p[1])).join('L') + 'Z';
}

/** Point at fraction k of a polyline (used to park the pencil on a live tip). */
export function pointAt(raw, k) {
  const S = lengths(raw), L = S[S.length - 1], c = k * L;
  for (let i = 1; i < raw.length; i++) if (S[i] >= c) {
    const q = (c - S[i - 1]) / (S[i] - S[i - 1] || 1);
    return [lerp(raw[i - 1][0], raw[i][0], q), lerp(raw[i - 1][1], raw[i][1], q)];
  }
  return raw[raw.length - 1];
}

// --- shape generators (raw polylines) ------------------------------------------
export const line = (x1, y1, x2, y2) => [[x1, y1], [x2, y2]];

export function ellipse(cx, cy, rx, ry, seed = 1, a0 = -2.2, sweep = Math.PI * 2.08, n = 72) {
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const a = a0 + (sweep * i) / n;
    const wob = 1 + 0.035 * noise1(i / 9, seed) + (i / n) * 0.03; // slight spiral: hand never closes exactly
    pts.push([cx + Math.cos(a) * rx * wob, cy + Math.sin(a) * ry * wob]);
  }
  return pts;
}

export function arc(cx, cy, r, a0, a1, n = 40) {
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const a = lerp(a0, a1, i / n);
    pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
  }
  return pts;
}

/** Catmull-Rom spline through control points. */
export function spline(cp, seg = 14) {
  const out = [];
  for (let i = 0; i < cp.length - 1; i++) {
    const p0 = cp[Math.max(0, i - 1)], p1 = cp[i], p2 = cp[i + 1], p3 = cp[Math.min(cp.length - 1, i + 2)];
    for (let j = 0; j < seg; j++) {
      const t = j / seg, t2 = t * t, t3 = t2 * t;
      out.push([0, 1].map((d) => 0.5 * (2 * p1[d] + (-p0[d] + p2[d]) * t + (2 * p0[d] - 5 * p1[d] + 4 * p2[d] - p3[d]) * t2 + (-p0[d] + 3 * p1[d] - 3 * p2[d] + p3[d]) * t3)));
    }
  }
  out.push(cp[cp.length - 1]);
  return out;
}

export function roundRect(x, y, w, h, r, n = 6) {
  const pts = [];
  const corner = (cx, cy, a0) => { for (let i = 0; i <= n; i++) { const a = a0 + (Math.PI / 2) * (i / n); pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]); } };
  corner(x + w - r, y + r, -Math.PI / 2);
  corner(x + w - r, y + h - r, 0);
  corner(x + r, y + h - r, Math.PI / 2);
  corner(x + r, y + r, Math.PI);
  pts.push([x + w - r, y]);
  return pts;
}

/** Zig-zag hatching filling a rectangle (for chaos scribbles). */
export function hatch(x, y, w, h, gap, angle, seed) {
  const pts = [];
  const r = Math.hypot(w, h);
  const ca = Math.cos(angle), sa = Math.sin(angle);
  const cx = x + w / 2, cy = y + h / 2;
  let flip = false;
  for (let d = -r / 2; d <= r / 2; d += gap) {
    const j = (hash(seed + d) - 0.5) * gap * 0.8;
    const a = [-r / 2 + j, d], b = [r / 2 - j, d + gap * 0.5];
    const [p, q] = flip ? [b, a] : [a, b];
    flip = !flip;
    for (const [u, v] of [p, q]) {
      const px = clamp(cx + u * ca - v * sa, x, x + w), py = clamp(cy + u * sa + v * ca, y, y + h);
      pts.push([px, py]);
    }
  }
  return pts;
}

/**
 * A timed sequence of strokes. add() schedules a stroke; svg(t, env) returns
 * markup for every stroke that has started, drawn to its current progress.
 */
export class Drawing {
  constructor(seed = 1) { this.items = []; this.seed = seed; }
  add(pts, o = {}) {
    this.items.push({ pts, t0: o.t0 ?? 0, dur: o.dur ?? 0.3, w: o.w ?? 3, color: o.color ?? '#3a342e',
      seed: o.seed ?? this.seed * 1000 + this.items.length * 17 + 1, amp: o.amp ?? 1, opacity: o.opacity ?? 1,
      overshoot: o.overshoot ?? 0, double: o.double ?? false, ease: o.ease ?? ease.inOutQuad, taper: o.taper, cls: o.cls });
    return this;
  }
  /** Latest stroke still being drawn at t -> its tip position (for the pencil). */
  tip(t) {
    let best = null;
    for (const it of this.items) {
      const k = (t - it.t0) / it.dur;
      if (k > 0 && k < 1 && (!best || it.t0 > best.it.t0)) best = { it, k };
    }
    return best ? pointAt(best.it.pts, best.it.ease(best.k)) : null;
  }
  svg(t, env = {}) {
    const boil = env.boil ?? 0, ampMul = env.ampMul ?? 1, wMul = env.wMul ?? 1;
    let out = '';
    for (const it of this.items) {
      const k = clamp((t - it.t0) / it.dur);
      if (k <= 0) continue;
      const progress = it.ease(k);
      const color = env.color ?? it.color;
      const d = strokeD(it.pts, { seed: it.seed, boil, amp: it.amp * ampMul, width: it.w * wMul, progress, overshoot: it.overshoot, taper: it.taper });
      out += `<path d="${d}" fill="${color}" opacity="${it.opacity}"${it.cls ? ` class="${it.cls}"` : ''}/>`;
      if (it.double && ampMul > 0.05) {
        const d2 = strokeD(it.pts, { seed: it.seed + 77, boil, amp: it.amp * ampMul * 1.6, width: it.w * wMul * 0.55, progress: clamp(progress * 1.03), overshoot: it.overshoot * 1.4 });
        out += `<path d="${d2}" fill="${color}" opacity="${it.opacity * 0.55}"/>`;
      }
    }
    return out;
  }
}
