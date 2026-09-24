// The 2D paper world: Act I (cozy desk), Act II (AI chaos), Act III (the gate
// slams down, Phase 1 sketch) and Phase 2 (the sketch snaps into clean vector).
// Rendered as SVG markup rebuilt every frame from t.
import { clamp, lerp, prog, ease, hash, rng, noise1, shake, track, esc, mixHex } from '../lib/util.js';
import { Drawing, strokeD, line, ellipse, spline, roundRect, hatch, arc } from '../lib/sketch.js';
import { T } from '../timeline.js';

const INK = '#37312B', RED = '#C8412E', NAVY = '#1F2A44', AMBER = '#F2A93B';
const HAND = `'LXGW WenKai', 'Caveat', serif`;
const MONO = `'JetBrains Mono', monospace`;

// Gate geometry shared with the 3D world (screen px). Π shape, open bottom.
export const GATE = { x0: 800, x1: 1120, top: 360, ground: 780, beam: 44, post: 44 };
const G = GATE;
const gateOuter = [[G.x0, G.ground], [G.x0, G.top], [G.x1, G.top], [G.x1, G.ground]];
const gateInner = [[G.x0 + G.post, G.ground], [G.x0 + G.post, G.top + G.beam], [G.x1 - G.post, G.top + G.beam], [G.x1 - G.post, G.ground]];

let leafPolys, root, dyn, desk, deskWash, chaosItems, heroAnn, hatches, gateSk, gateHatch, splat, reqDraw, bubbleDraw, p2Draw, xMarks;

// --- textures (generated once) -------------------------------------------------
function paperTexture() {
  const W = 2240, H = 1360, c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  g.fillStyle = '#F2E8D6';
  g.fillRect(0, 0, W, H);
  const img = g.getImageData(0, 0, W, H), d = img.data, r = rng(7);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 4;
    const blot = noise1(x / 260 + noise1(y / 300, 3) * 2, 11) * 7 + noise1(y / 190, 5) * 5;
    const grain = (r() - 0.5) * 16;
    const v = blot + grain;
    d[i] += v; d[i + 1] += v * 0.96; d[i + 2] += v * 0.9;
  }
  g.putImageData(img, 0, 0);
  // fibres
  g.globalAlpha = 0.06;
  for (let k = 0; k < 900; k++) {
    g.strokeStyle = r() > 0.5 ? '#8a7560' : '#ffffff';
    g.lineWidth = 0.6 + r();
    const x = r() * W, y = r() * H, a = r() * Math.PI, l = 8 + r() * 26;
    g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + Math.cos(a) * l * 0.5 + 3, y + Math.sin(a) * l * 0.5, x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke();
  }
  // vignette burn
  g.globalAlpha = 1;
  const vg = g.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, H * 0.95);
  vg.addColorStop(0, 'rgba(120,90,50,0)'); vg.addColorStop(1, 'rgba(120,85,45,0.28)');
  g.fillStyle = vg; g.fillRect(0, 0, W, H);
  return c.toDataURL('image/jpeg', 0.9);
}

function lampLight() {
  const c = document.createElement('canvas');
  c.width = 1920; c.height = 1080;
  const g = c.getContext('2d');
  g.filter = 'blur(26px)';
  const lg = g.createLinearGradient(520, 440, 900, 800);
  lg.addColorStop(0, 'rgba(255,190,90,0.62)'); lg.addColorStop(1, 'rgba(255,190,90,0)');
  g.fillStyle = lg;
  g.beginPath(); g.moveTo(470, 470); g.lineTo(565, 425); g.lineTo(1180, 790); g.lineTo(500, 800); g.closePath(); g.fill();
  g.filter = 'blur(40px)';
  const rg = g.createRadialGradient(540, 470, 0, 540, 470, 210);
  rg.addColorStop(0, 'rgba(255,200,110,0.75)'); rg.addColorStop(1, 'rgba(255,200,110,0)');
  g.fillStyle = rg; g.fillRect(200, 150, 700, 650);
  return c.toDataURL('image/png');
}

function grainTexture() {
  const W = 1024, H = 1024, c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d'), img = g.createImageData(W, H), d = img.data, r = rng(3);
  for (let i = 0; i < d.length; i += 4) {
    const v = r() < 0.2 ? 90 + r() * 120 : 255;
    d[i] = d[i + 1] = d[i + 2] = v; d[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  return c.toDataURL('image/png');
}

// --- watercolour ---------------------------------------------------------------
function blob(poly, seed, jitter = 7) {
  const out = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    const n = Math.max(2, Math.round(Math.hypot(b[0] - a[0], b[1] - a[1]) / 14));
    for (let k = 0; k < n; k++) {
      const x = lerp(a[0], b[0], k / n), y = lerp(a[1], b[1], k / n);
      const s = out.length;
      out.push([x + noise1(s / 3.2, seed) * jitter, y + noise1(s / 3.2, seed + 5) * jitter]);
    }
  }
  return 'M' + out.map((p) => p[0].toFixed(1) + ',' + p[1].toFixed(1)).join('L') + 'Z';
}
const centroid = (poly) => poly.reduce((a, p) => [a[0] + p[0] / poly.length, a[1] + p[1] / poly.length], [0, 0]);

class Wash {
  constructor(poly, color, alpha, t0, dur = 0.6, seed = 1) {
    this.c = centroid(poly); this.color = color; this.alpha = alpha; this.t0 = t0; this.dur = dur;
    this.layers = [0, 1, 2].map((k) => blob(poly.map(([x, y]) => [lerp(this.c[0], x, 1 - k * 0.035), lerp(this.c[1], y, 1 - k * 0.035)]), seed * 10 + k, 6 + k * 3));
  }
  svg(t, mul = 1) {
    const k = prog(t, this.t0, this.t0 + this.dur, ease.outCubic);
    if (k <= 0) return '';
    const s = 0.9 + 0.1 * k, [cx, cy] = this.c;
    return `<g transform="translate(${cx} ${cy}) scale(${s}) translate(${-cx} ${-cy})" opacity="${k * mul}" style="mix-blend-mode:multiply">` +
      this.layers.map((d, i) => `<path d="${d}" fill="${this.color}" fill-opacity="${this.alpha * (i === 0 ? 0.55 : 0.3)}"${i === 2 ? ` stroke="${this.color}" stroke-opacity="0.35" stroke-width="1.6"` : ''}/>`).join('') + '</g>';
  }
}

// --- build static drawings ------------------------------------------------------
function buildDesk() {
  const d = new Drawing(11), o = { color: INK, double: true, overshoot: 10 };
  d.add(line(140, 760, 1780, 763), { ...o, t0: 0.0, dur: 0.55, w: 3.4 });
  // laptop
  d.add(roundRect(690, 330, 540, 352, 18), { ...o, t0: 0.22, dur: 0.6, w: 3.6, overshoot: 0 });
  d.add(roundRect(716, 356, 488, 300, 8), { color: INK, t0: 0.62, dur: 0.42, w: 2, amp: 0.8 });
  d.add([[680, 684], [628, 748], [1292, 748], [1240, 684]], { ...o, t0: 0.82, dur: 0.4, w: 3.4 });
  d.add([[902, 704], [1018, 704], [1026, 734], [894, 734], [902, 704]], { color: INK, t0: 1.08, dur: 0.22, w: 1.8 });
  for (let r = 0; r < 2; r++) d.add(line(700 - r * 14, 694 + r * 10, 1220 + r * 14, 694 + r * 10), { color: INK, t0: 1.12 + r * 0.06, dur: 0.18, w: 1.1, opacity: 0.5 });
  d.add(ellipse(960, 343, 3.5, 3.5, 4), { color: INK, t0: 1.0, dur: 0.1, w: 1.6 });
  // lamp
  d.add(ellipse(380, 749, 82, 13, 9), { color: INK, t0: 0.5, dur: 0.36, w: 3.2 });
  d.add(line(380, 742, 326, 560), { ...o, t0: 0.78, dur: 0.24, w: 3.4 });
  d.add(ellipse(326, 556, 10, 10, 2), { color: INK, t0: 0.98, dur: 0.12, w: 2.4 });
  d.add(line(330, 552, 446, 424), { ...o, t0: 1.0, dur: 0.24, w: 3.4 });
  d.add([[420, 420], [462, 392], [578, 452], [508, 514], [420, 420]], { ...o, t0: 1.12, dur: 0.42, w: 3.4, overshoot: 0 });
  d.add(spline([[578, 452], [556, 494], [508, 514]], 8), { color: INK, t0: 1.46, dur: 0.14, w: 2.2 });
  // mug
  d.add(spline([[1400, 636], [1404, 700], [1410, 744], [1455, 752], [1500, 744], [1506, 700], [1510, 636]], 10), { ...o, t0: 0.95, dur: 0.46, w: 3.4, overshoot: 0 });
  d.add(ellipse(1455, 636, 56, 11, 5), { color: INK, t0: 1.2, dur: 0.3, w: 3 });
  d.add(spline([[1509, 658], [1552, 660], [1556, 700], [1506, 722]], 10), { color: INK, t0: 1.36, dur: 0.24, w: 3.2 });
  d.add([[1434, 688], [1422, 700], [1434, 712]], { color: INK, t0: 1.55, dur: 0.12, w: 2.2 });
  d.add([[1476, 688], [1488, 700], [1476, 712]], { color: INK, t0: 1.6, dur: 0.12, w: 2.2 });
  d.add(line(1460, 684, 1450, 716), { color: INK, t0: 1.65, dur: 0.1, w: 2.2 });
  // window
  d.add(roundRect(1352, 128, 330, 272, 6), { ...o, t0: 1.18, dur: 0.5, w: 3.2, overshoot: 0 });
  d.add(line(1517, 130, 1517, 398), { color: INK, t0: 1.5, dur: 0.18, w: 2.6, overshoot: 6 });
  d.add(line(1354, 264, 1680, 264), { color: INK, t0: 1.58, dur: 0.18, w: 2.6, overshoot: 6 });
  d.add(arc(1606, 196, 30, 1.1, 5.6), { color: INK, t0: 1.7, dur: 0.22, w: 2.4 });
  d.add(spline([[1624, 222], [1596, 208], [1598, 178], [1622, 168]], 8), { color: INK, t0: 1.84, dur: 0.14, w: 2 });
  for (const [x, y, s] of [[1410, 180, 9], [1460, 330, 7], [1580, 340, 8], [1400, 300, 5]]) {
    d.add(line(x - s, y, x + s, y), { color: INK, t0: 1.8, dur: 0.08, w: 1.8 });
    d.add(line(x, y - s, x, y + s), { color: INK, t0: 1.86, dur: 0.08, w: 1.8 });
  }
  // plant
  d.add([[1598, 690], [1612, 760], [1680, 760], [1694, 690], [1598, 690]], { ...o, t0: 1.4, dur: 0.34, w: 3, overshoot: 0 });
  const leaves = [[[1646, 690], [1620, 640], [1596, 606]], [[1646, 690], [1650, 620], [1664, 574]], [[1646, 690], [1680, 646], [1716, 624]], [[1646, 690], [1630, 610], [1622, 560]]];
  leaves.forEach((l, i) => d.add(spline(l, 8), { color: INK, t0: 1.62 + i * 0.07, dur: 0.18, w: 2.6 }));
  leafPolys = leaves.map((l, i) => {
    const [a, , c] = l, mx = (a[0] + c[0]) / 2, my = (a[1] + c[1]) / 2, nx = -(c[1] - a[1]) * 0.18, ny = (c[0] - a[0]) * 0.18;
    const poly = spline([a, [mx + nx, my + ny], c, [mx - nx, my - ny], a], 8);
    d.add(poly, { color: INK, t0: 1.72 + i * 0.06, dur: 0.2, w: 2 });
    return poly.filter((_, k) => k % 3 === 0);
  });
  // sticky note
  d.add([[196, 150], [476, 136], [488, 330], [206, 344], [196, 150]], { ...o, t0: 1.55, dur: 0.4, w: 2.6, overshoot: 0 });
  desk = d;

  deskWash = [
    new Wash([[140, 764], [1780, 766], [1780, 850], [140, 846]], '#C9A27A', 0.5, 1.5, 0.8, 1),
    new Wash([[720, 360], [1200, 360], [1200, 652], [720, 652]], '#CFE0F2', 0.55, 1.35, 0.6, 2),
    new Wash([[1404, 640], [1508, 640], [1500, 748], [1410, 748]], '#D9774B', 0.75, 1.75, 0.5, 3),
    new Wash([[1356, 132], [1678, 132], [1678, 396], [1356, 396]], '#3E4C7E', 0.62, 1.7, 0.6, 4),
    new Wash(arc(1606, 196, 29, 0, Math.PI * 2, 18), '#F4C53E', 0.9, 1.95, 0.4, 5),
    new Wash([[1600, 692], [1692, 692], [1678, 758], [1612, 758]], '#C0643D', 0.7, 1.9, 0.4, 6),
    ...leafPolys.map((l, i) => new Wash(l, '#7FA86B', 0.8, 1.9 + i * 0.05, 0.4, 20 + i)),
    new Wash([[198, 152], [474, 138], [486, 328], [208, 342]], '#F7D774', 0.8, 1.8, 0.5, 8),
    new Wash([[420, 420], [462, 392], [578, 452], [508, 514]], '#E0B04A', 0.7, 1.7, 0.4, 9),
  ];
}

const CODE = [
  'function login(u, p) {', 'import * as all from "./everything"', '// TODO: 以后再修', 'useEffect(() => { useEffect(() => {',
  '} } } } } } }', 'data = JSON.parse(JSON.stringify(data))', 'try { … } catch (e) { /* 忽略 */ }', 'var x = x || x && !x',
  'setTimeout(fix, 99999)', 'class GodObject extends Everything', 'while (true) { refactor() }', '<div><div><div><div><div>',
  'color: red !important;', "console.log('为什么??')", 'as any as any as any', '// 第 1,847 行', 'const 临时变量2 = 临时变量1',
  'npm i left-pad right-pad mid-pad', 'if (a) { if (b) { if (c) {', 'return undefined ?? null', 'eval(userInput)', '// 别动这段，能跑',
  'let i, j, k, ii, jj, kk', 'export * from "./utils2_final_v3"', 'catch {} catch {} catch {}', 'document.write(everything)',
];

function buildChaos() {
  const r = rng(42);
  const N = 70;
  chaosItems = [];
  for (let i = 0; i < N; i++) {
    const s = 4.25 + 3.45 * Math.sqrt(i / N);
    let tx, ty;
    do { tx = 80 + r() * 1760; ty = 70 + r() * 940; } while (Math.abs(tx - 960) < 260 && Math.abs(ty - 505) < 170);
    chaosItems.push({
      text: CODE[i % CODE.length], s, tx, ty, size: 22 + r() * 18, rot: (r() - 0.5) * 34,
      red: r() < 0.22, drift: [(r() - 0.5) * 40, (r() - 0.5) * 30], sx: 960 + (r() - 0.5) * 300, sy: 500 + (r() - 0.5) * 160, fall: 0.7 + r() * 0.8,
    });
  }
  // hero lines that the red pen will circle
  heroAnn = [
    { text: 'rewriteEverything();', s: 4.35, tx: 250, ty: 250, size: 40, rot: -6, at: 5.0, note: '重写了整个项目？！', nx: 236, ny: 330 },
    { text: 'export default MegaComponent', s: 4.6, tx: 1250, ty: 200, size: 36, rot: 5, at: 5.5, note: 'main.js · 2,847 行', nx: 1300, ny: 280 },
    { text: 'if (bug) fixBug() && addTwoMore()', s: 4.85, tx: 330, ty: 860, size: 36, rot: 3, at: 6.0, note: '修 1 个 Bug → 冒出 3 个', nx: 360, ny: 940 },
    { text: 'rm -rf ./architecture', s: 5.2, tx: 1260, ty: 860, size: 38, rot: -4, at: 7.0, note: '我的架构呢…？', nx: 1290, ny: 950 },
  ].map((h) => ({ ...h, red: false, drift: [0, 0], sx: 960, sy: 500, fall: 1.1 }));
  chaosItems.push(...heroAnn);

  const d = new Drawing(77);
  for (const h of heroAnn) {
    const w = h.text.length * h.size * 0.52;
    d.add(ellipse(h.tx + w / 2 - 10, h.ty - h.size * 0.3, w * 0.62, h.size * 0.95, h.at * 10, -2.6, Math.PI * 2.15), { color: RED, t0: h.at, dur: 0.22, w: 4.2, amp: 1.6 });
  }
  // big red X over the laptop
  d.add(line(700, 340, 1220, 690), { color: RED, t0: 6.5, dur: 0.14, w: 12, amp: 2.2, overshoot: 30 });
  d.add(line(1220, 336, 700, 694), { color: RED, t0: 6.62, dur: 0.14, w: 12, amp: 2.2, overshoot: 30 });
  xMarks = d;

  const hd = new Drawing(91), hr = rng(9);
  for (let k = 0; k < 18; k++) hd.add(scribble(hr, k), { color: k % 4 === 1 ? RED : '#2a2622', t0: 6.95 + k * 0.055, dur: 0.34, w: 3 + hr() * 4, amp: 2, opacity: 0.8, ease: ease.linear });
  hatches = hd;
}

/** An angry pen scribble: loops riding a wandering path across the page. */
function scribble(r, k) {
  const pts = [];
  let x = r() * 1920, y = r() * 1080, a = r() * 6.28;
  const R = 40 + r() * 70, loops = 14 + r() * 10;
  for (let i = 0; i < loops * 16; i++) {
    a += (r() - 0.5) * 0.25;
    x += Math.cos(a) * 9; y += Math.sin(a) * 9;
    if (x < -100 || x > 2020) a = Math.PI - a;
    if (y < -60 || y > 1140) a = -a;
    const w = (i / 16) * Math.PI * 2, rr = R * (0.7 + 0.3 * noise1(i / 20, k));
    pts.push([x + Math.cos(w) * rr, y + Math.sin(w) * rr * 0.75]);
  }
  return pts;
}

function buildGate() {
  const d = new Drawing(5), o = { color: INK, double: true, overshoot: 12, w: 4.6, amp: 1.3, t0: 7.6, dur: 0.001 };
  d.add(gateOuter, o).add(gateInner, o);
  gateSk = d;
  const h = new Drawing(6);
  for (const [x0, x1] of [[G.x0, G.x0 + G.post], [G.x1 - G.post, G.x1]]) for (let y = G.top + 60; y < G.ground - 10; y += 26) h.add(line(x0 + 6, y + 14, x1 - 6, y - 8), { color: INK, t0: 7.6, dur: 0.001, w: 1.6, amp: 0.8, opacity: 0.7 });
  for (let x = G.x0 + 20; x < G.x1 - 10; x += 28) h.add(line(x, G.top + G.beam - 6, x + 14, G.top + 6), { color: INK, t0: 7.6, dur: 0.001, w: 1.6, amp: 0.8, opacity: 0.7 });
  gateHatch = h;

  const s = new Drawing(8), r = rng(5);
  for (let k = 0; k < 14; k++) {
    const side = k % 2 ? G.x1 - 22 : G.x0 + 22, a = Math.PI + (k % 2 ? -0.1 - r() * 1.2 : -Math.PI + 0.1 + r() * 1.2) * -1;
    const len = 40 + r() * 110, ang = k % 2 ? -r() * 1.3 : Math.PI + r() * 1.3;
    s.add(line(side + Math.cos(ang) * 30, G.ground + Math.sin(ang) * 8, side + Math.cos(ang) * (30 + len), G.ground - 6 + Math.sin(ang) * len * 0.25), { color: INK, t0: 8.0, dur: 0.07, w: 1.6 + r() * 1.8, amp: 1.2, overshoot: 0 });
  }
  splat = s;

  const q = new Drawing(12);
  q.add(roundRect(1196, 440, 520, 150, 26), { color: INK, t0: 8.35, dur: 0.3, w: 3, double: true });
  q.add([[1250, 588], [1222, 628], [1296, 590]], { color: INK, t0: 8.6, dur: 0.1, w: 3 });
  q.add(roundRect(1236, 660, 40, 40, 6), { color: INK, t0: 8.9, dur: 0.18, w: 3 });
  q.add([[1242, 678], [1256, 694], [1290, 646]], { color: RED, t0: T.confirm1, dur: 0.12, w: 5.5, amp: 1.2 });
  bubbleDraw = q;

  const rq = new Drawing(15);
  [0, 1, 2].forEach((i) => {
    rq.add(roundRect(250, 556 + i * 64, 30, 30, 4), { color: INK, t0: 8.45 + i * 0.12, dur: 0.12, w: 2.6 });
    rq.add([[255, 570 + i * 64], [266, 582 + i * 64], [288, 548 + i * 64]], { color: INK, t0: 9.05 + i * 0.1, dur: 0.1, w: 4 });
  });
  rq.add(spline([[240, 520], [340, 514], [440, 522]], 6), { color: AMBER, t0: 8.4, dur: 0.18, w: 5, amp: 1 });
  reqDraw = rq;
}

function buildP2() {
  const d = new Drawing(21), o = { color: NAVY, amp: 0, w: 2, taper: 0.001 };
  // construction lines
  for (const y of [G.top, G.top + G.beam, G.ground]) d.add(line(G.x0 - 700, y, G.x1 + 800, y), { ...o, w: 1, opacity: 0.22, t0: 10.02, dur: 0.35, ease: ease.outExpo });
  for (const x of [G.x0, G.x0 + G.post, G.x1 - G.post, G.x1]) d.add(line(x, 60, x, 1030), { ...o, w: 1, opacity: 0.22, t0: 10.05, dur: 0.35, ease: ease.outExpo });
  // dimension lines
  d.add(line(730, G.top, 730, G.ground), { ...o, t0: 10.25, dur: 0.25 });
  for (const y of [G.top, G.ground]) d.add(line(716, y, 744, y), { ...o, t0: 10.3, dur: 0.1 });
  d.add([[722, G.top + 14], [730, G.top], [738, G.top + 14]], { ...o, t0: 10.3, dur: 0.1 });
  d.add([[722, G.ground - 14], [730, G.ground], [738, G.ground - 14]], { ...o, t0: 10.45, dur: 0.1 });
  d.add(line(G.x0, 316, G.x1, 316), { ...o, t0: 10.3, dur: 0.25 });
  for (const x of [G.x0, G.x1]) d.add(line(x, 304, x, 328), { ...o, t0: 10.34, dur: 0.1 });
  // tree
  d.add(line(G.x1, 382, 1224, 382), { ...o, w: 2.4, t0: 10.5, dur: 0.14 });
  d.add(ellipse(1236, 382, 12, 12, 3, 0, Math.PI * 2, 40), { ...o, w: 2.6, t0: 10.56, dur: 0.14 });
  d.add(line(1236, 394, 1236, 666), { ...o, w: 2.4, t0: 10.62, dur: 0.3, ease: ease.outCubic });
  [0, 1, 2, 3].forEach((i) => {
    const y = 454 + i * 70, t0 = 10.75 + i * 0.25;
    d.add(line(1236, y, 1300, y), { ...o, w: 2.4, t0, dur: 0.1 });
    d.add(ellipse(1310, y, 8, 8, 5 + i, 0, Math.PI * 2, 30), { ...o, w: 2.4, t0: t0 + 0.06, dur: 0.1 });
  });
  p2Draw = d;
}
export const TREE = [['ui/', 'LoginForm.tsx'], ['api/', 'auth.ts'], ['store/', 'session.ts'], ['utils/', 'validate.ts']];

export function initPaper(svg) {
  root = svg;
  buildDesk(); buildChaos(); buildGate(); buildP2();
  svg.innerHTML = `
  <defs>
    <mask id="grain" maskUnits="userSpaceOnUse" x="-200" y="-200" width="2400" height="1500">
      <rect x="-200" y="-200" width="2400" height="1500" fill="#fff"/>
      <image href="${grainTexture()}" x="-100" y="-100" width="1024" height="1024" preserveAspectRatio="none"/>
      <image href="${grainTexture()}" x="924" y="-100" width="1024" height="1024" preserveAspectRatio="none"/>
      <image href="${grainTexture()}" x="-100" y="924" width="1024" height="1024" preserveAspectRatio="none"/>
      <image href="${grainTexture()}" x="924" y="924" width="1024" height="1024" preserveAspectRatio="none"/>
    </mask>
    <filter id="soft" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="1.3"/></filter>
    <image id="lampLight" href="${lampLight()}" x="0" y="0" width="1920" height="1080"/>
    <radialGradient id="screenglow"><stop offset="0" stop-color="#E9F1FF" stop-opacity="0.7"/><stop offset="1" stop-color="#E9F1FF" stop-opacity="0"/></radialGradient>
    <clipPath id="gateFillClip"><rect id="gateFillRect" x="780" y="780" width="360" height="0"/></clipPath>
  </defs>
  <g><g id="cam"><image id="paperImg" href="${paperTexture()}" x="-160" y="-140" width="2240" height="1360" preserveAspectRatio="none"/><rect id="whiten" x="-160" y="-140" width="2240" height="1360" fill="#FBFAF6" opacity="0"/><g id="dyn"></g></g></g>`;
  dyn = svg.querySelector('#dyn');
}

// --- per-frame -------------------------------------------------------------------
function camera(t) {
  let c;
  if (t < T.chaos) c = { cx: lerp(960, 960, 0), cy: track(t, [[0, 572], [4, 530]]), z: track(t, [[0, 1.0], [4, 1.1]], ease.inOutQuad), r: track(t, [[0, -0.4], [4, 0]]) };
  else if (t < 5.0) c = { cx: 960, cy: 530, z: track(t, [[4.0, 1.1], [4.25, 1.0, ease.outExpo], [5, 1.03]]), r: 0 };
  else if (t < 5.5) c = { cx: 520, cy: 270, z: lerp(1.55, 1.62, prog(t, 5, 5.5)), r: -2 };
  else if (t < 6.0) c = { cx: 1480, cy: 230, z: lerp(1.6, 1.68, prog(t, 5.5, 6)), r: 2.5 };
  else if (t < 6.5) c = { cx: 640, cy: 880, z: lerp(1.55, 1.63, prog(t, 6, 6.5)), r: -1.5 };
  else if (t < 7.0) c = { cx: 960, cy: 520, z: lerp(1.1, 1.15, prog(t, 6.5, 7)), r: 1.5 };
  else if (t < 7.35) c = { cx: 1470, cy: 890, z: lerp(1.7, 1.76, prog(t, 7, 7.35)), r: -3 };
  else if (t < T.slam) c = { cx: 960, cy: 540, z: lerp(1.2, 1.0, prog(t, 7.35, 7.75, ease.outCubic)), r: lerp(-2, 0, prog(t, 7.35, 7.7)) };
  else if (t < T.p2) c = { cx: 960, cy: 555, z: track(t, [[8, 1.0], [9.9, 1.05]]), r: 0 };
  else c = { cx: track(t, [[10, 960], [11.9, 960]]), cy: track(t, [[10, 555], [11.9, 540]]), z: track(t, [[10, 1.05], [11.9, 1.0]], ease.outCubic), r: 0 };

  // shakes
  let [sx, sy, sr] = [0, 0, 0];
  const add = ([a, b, c2]) => { sx += a; sy += b; sr += c2; };
  if (t >= 4 && t < 8) add(shake(t, 4.0, 10, 5));
  for (const b of [5, 5.5, 6, 6.5, 7]) add(shake(t, b, 9, 9, 40, b * 3));
  if (t >= 7.35 && t < 8) { const k = prog(t, 7.35, 8) * 16; sx += noise1(t * 45, 3) * k; sy += noise1(t * 45, 8) * k; sr += noise1(t * 20, 2) * k * 0.0015; }
  if (t >= T.slam) add(shake(t, T.slam, 34, 5.5, 34, 4));
  if (t >= T.confirm1) add(shake(t, T.confirm1, 6, 10, 30, 2));
  if (t >= T.p2) add(shake(t, T.p2, 8, 10, 30, 6));
  return { ...c, sx, sy, r: c.r + sr * 57 };
}

function text(x, y, s, { size = 32, color = INK, font = HAND, weight = 400, anchor = 'start', rot = 0, op = 1, boil = 0, seed = 0, amp = 0.7, spacing = 0, halo = 0 } = {}) {
  const jx = noise1(boil * 1.7, seed) * amp, jy = noise1(boil * 1.7, seed + 3) * amp, jr = noise1(boil * 1.3, seed + 6) * amp * 0.6;
  return `<text x="0" y="0" transform="translate(${(x + jx).toFixed(1)} ${(y + jy).toFixed(1)}) rotate(${(rot + jr).toFixed(2)})" font-family="${font}" font-size="${size}" font-weight="${weight}" fill="${color}" opacity="${op}" text-anchor="${anchor}" letter-spacing="${spacing}"${halo ? ` stroke="#F2E8D6" stroke-width="${halo}" stroke-linejoin="round" paint-order="stroke"` : ''}>${esc(s)}</text>`;
}
const typed = (s, t, t0, cps) => [...s].slice(0, Math.max(0, Math.floor((t - t0) * cps))).join('');

function steam(t, boil, jag) {
  let out = '';
  for (let k = 0; k < 3; k++) {
    const x0 = 1432 + k * 22, pts = [];
    for (let i = 0; i <= 14; i++) {
      const y = 620 - i * 9;
      const ph = t * 2.2 - i * 0.35 + k;
      pts.push([x0 + Math.sin(ph) * (6 + i * 0.6) + (jag ? (hash(i + boil * 31 + k) - 0.5) * 14 : 0), y]);
    }
    const a = prog(t, 1.9, 2.4) * (1 - prog(t, 7.6, 7.9));
    if (a > 0) out += `<path d="${strokeD(pts, { seed: 300 + k, boil, amp: 0.8, width: 2.2, taper: 0.4 })}" fill="${INK}" opacity="${a * 0.55}"/>`;
  }
  return out;
}

function pencil(x, y) {
  return `<g transform="translate(${x.toFixed(1)} ${y.toFixed(1)}) rotate(-38)">
    <path d="M0,0 L10,-6 L10,6 Z" fill="${INK}"/><path d="M10,-6 L22,-12 L22,12 L10,6 Z" fill="#E9C9A0" stroke="${INK}" stroke-width="1.6"/>
    <rect x="22" y="-12" width="150" height="24" fill="#F2B233" stroke="${INK}" stroke-width="1.8"/>
    <line x1="22" y1="-4" x2="172" y2="-4" stroke="#C98A1C" stroke-width="1.5"/><line x1="22" y1="4" x2="172" y2="4" stroke="#C98A1C" stroke-width="1.5"/>
    <rect x="172" y="-12" width="16" height="24" fill="#B9B4AA" stroke="${INK}" stroke-width="1.8"/><rect x="188" y="-11" width="22" height="22" rx="5" fill="#E88C8C" stroke="${INK}" stroke-width="1.8"/></g>`;
}

function chaosLine(it, t, boil, frozen) {
  const tt = frozen ? Math.min(t, 7.99) : t;
  const k = prog(tt, it.s, it.s + 0.55, ease.outCubic);
  if (tt < it.s) return '';
  let x = lerp(it.sx, it.tx, k) + it.drift[0] * prog(tt, it.s, 8), y = lerp(it.sy, it.ty, k) + it.drift[1] * prog(tt, it.s, 8);
  let rot = it.rot * k, sc = lerp(0.35, 1, k), op = 1;
  if (t > T.slam + 0.2) { // after the slam: everything drops out of frame
    const f = t - (T.slam + 0.2);
    y += 2600 * f * f * it.fall; rot += f * 90 * (it.fall - 1.1); op = 1 - prog(t, T.slam + 0.4, T.slam + 0.9);
  }
  if (t >= T.slam) op *= 0.38;
  const color = it.red ? RED : INK;
  return `<g transform="translate(${x.toFixed(1)} ${y.toFixed(1)}) scale(${sc.toFixed(3)})" opacity="${op.toFixed(3)}">${text(0, 0, it.text, { size: it.size, color, rot, boil, seed: it.s * 100, amp: frozen ? 0 : 1.2, halo: it.at && !frozen ? 10 : 0 })}</g>`;
}

export function renderPaper(t) {
  const visible = t < T.p3 + 0.35;
  root.style.display = visible ? '' : 'none';
  if (!visible) return;

  const fpsBoil = t < 6 ? 12 : 24;
  const boil = Math.floor(t * fpsBoil);
  const anxiety = t < T.chaos ? 1 : t < T.slam ? lerp(1, 3.4, prog(t, T.chaos, T.slam, ease.inQuad)) : 1;
  const cam = camera(t);
  root.querySelector('#cam').setAttribute('transform', `translate(${960 + cam.sx} ${540 + cam.sy}) rotate(${cam.r.toFixed(3)}) scale(${cam.z.toFixed(4)}) translate(${-cam.cx} ${-cam.cy})`);
  root.querySelector('#whiten').setAttribute('opacity', (prog(t, T.p2, T.p2 + 0.3, ease.outCubic) * 0.92).toFixed(3));

  // iris wipe into the flat 3D world
  const iris = prog(t, T.p3 - 0.02, T.p3 + 0.3, ease.inCubic) * 1400;
  root.style.clipPath = iris > 0 ? `path(evenodd, 'M-10 -10H1930V1090H-10Z M${960 - iris} 570a${iris} ${iris} 0 1 0 ${2 * iris} 0a${iris} ${iris} 0 1 0 ${-2 * iris} 0Z')` : '';

  let s = '';
  if (t < T.slam) {
    // ---- Act I + II: the desk ----
    const flick = t > 5.5 ? (hash(boil * 7) > 0.35 ? 1 : 0.25) : 1;
    const glowA = prog(t, 1.5, 2.6) * flick;
    s += `<use href="#lampLight" opacity="${glowA.toFixed(3)}"/>`;
    s += `<ellipse cx="960" cy="505" rx="360" ry="250" fill="url(#screenglow)" opacity="${prog(t, 1.3, 2)}"/>`;
    s += deskWash.map((w) => w.svg(t)).join('');
    s += `<g mask="url(#grain)">${desk.svg(t, { boil, ampMul: anxiety })}${steam(t, boil, t > 5.5)}</g>`;
    // sticky note text
    const note1 = typed('今晚，', t, 2.0, 10), note2 = typed('写点什么吧 ✎', t, 2.3, 12);
    s += text(236, 222, note1, { size: 48, rot: -3, boil, seed: 1 }) + text(236, 292, note2, { size: 44, rot: -3, boil, seed: 2 });
    // screen prompt
    const p = typed('> 帮我做一个登录页', t, 2.45, 11);
    s += text(744, 408, p, { size: 32, boil, seed: 3, amp: 0.4 });
    if (t > 2.4 && t < 3.6 && Math.floor(t * 3) % 2 === 0) s += `<rect x="${744 + [...p].length * 26}" y="382" width="14" height="30" fill="${INK}" opacity="0.8"/>`;
    const reply = ['好的！马上开始 ✓', 'import React from "react"', 'import * as all from "./all"', 'function App() {', '  // 重写全部…', '  return <Everything/>'];
    reply.forEach((ln, i) => { const t0 = 3.55 + i * (i < 1 ? 0.3 : 0.1); s += text(744, 452 + i * 38, typed(ln, t, t0, 30 + i * 12), { size: 24, color: i === 0 ? '#2F7D4F' : INK, boil, seed: 10 + i, amp: 0.4 }); });
    // chaos
    if (t >= T.chaos - 0.3) {
      s += `<g>${chaosItems.filter((it) => !it.at).map((it) => chaosLine(it, t, boil, false)).join('')}</g>`;
      s += `<g>${heroAnn.map((it) => chaosLine(it, t, boil, false)).join('')}</g>`;
      for (const h of heroAnn) if (t >= h.at) {
        s += text(h.nx, h.ny, typed(h.note, t, h.at + 0.05, 40), { size: 42, color: RED, rot: h.rot * 0.5, boil, seed: h.at * 7, amp: 1.2, halo: 12, weight: 700 });
      }
      s += xMarks.svg(t, { boil, ampMul: 1 });
      s += `<g mask="url(#grain)">${hatches.svg(t, { boil, ampMul: 1 })}</g>`;
      const dark = prog(t, 7.45, 7.95, ease.inQuad) * 0.55;
      if (dark > 0) s += `<rect x="-200" y="-200" width="2400" height="1500" fill="#1b1714" opacity="${dark}"/>`;
    }
    // pencil on the live stroke tip (Act I only)
    const tip = t < 2.2 ? desk.tip(t) : null;
    if (tip) s += pencil(tip[0], tip[1]);
    // the gate falling in (speed ramp)
    if (t >= 7.6) {
      const fall = t < 7.9 ? lerp(-1150, -760, prog(t, 7.6, 7.9, ease.outCubic)) : lerp(-760, 0, prog(t, 7.9, T.slam, ease.inQuad));
      s += `<g transform="translate(0 ${fall.toFixed(1)})">`;
      for (let k = 0; k < 7; k++) s += `<rect x="${G.x0 + k * 50}" y="${G.top - 520}" width="3" height="${500}" fill="#fff" opacity="0.35"/>`;
      s += `<rect x="${G.x0}" y="${G.top}" width="${G.x1 - G.x0}" height="${G.ground - G.top}" fill="#F2E8D6" opacity="0.0"/>`;
      s += `<path d="M${G.x0},${G.ground}V${G.top}H${G.x1}V${G.ground}H${G.x1 - G.post}V${G.top + G.beam}H${G.x0 + G.post}V${G.ground}Z" fill="#F2E8D6"/>`;
      s += gateSk.svg(t, { boil, ampMul: 1 }) + gateHatch.svg(t, { boil });
      s += '</g>';
    }
  } else {
    // ---- Act III + Phase 2: the gate ----
    const snap = prog(t, T.p2, T.p2 + 0.32, (k) => ease.outBack(k, 2.2));
    const vec = t >= T.p2;
    const wob = vec ? Math.max(0, 1 - snap) : 1;
    const col = vec ? mixHex(INK, NAVY, prog(t, T.p2, T.p2 + 0.2)) : INK;
    // frozen chaos lines falling away
    if (t < T.slam + 1.0) s += `<g>${chaosItems.map((it) => chaosLine(it, t, boil, true)).join('')}</g>`;
    // dust puffs
    const dp = prog(t, T.slam, T.slam + 0.6, ease.outCubic);
    if (dp < 1) for (const [x, dir] of [[G.x0 + 10, -1], [G.x1 - 10, 1], [G.x0 + 40, 1], [G.x1 - 40, -1]]) {
      for (let k = 0; k < 3; k++) {
        const cx = x + dir * (30 + k * 38) * dp, cy = G.ground - 10 - k * 14 * dp, r = 14 + dp * 26 + k * 6;
        s += `<path d="${strokeD(ellipse(cx, cy, r, r * 0.7, k * 3 + x, 0, Math.PI * 2, 30), { seed: x + k, boil, amp: 1.2, width: 2.4 })}" fill="${INK}" opacity="${(1 - dp) * 0.7}"/>`;
      }
    }
    if (t < T.p2 + 0.2) s += `<g opacity="${1 - prog(t, T.p2, T.p2 + 0.15)}">${splat.svg(t, { boil })}</g>`;
    // Phase 2 blueprint furniture under the gate
    if (vec) {
      let dots = '';
      const da = prog(t, T.p2, T.p2 + 0.4) * 0.16;
      for (let y = 20; y < 1080; y += 40) for (let x = 20; x < 1920; x += 40) dots += `M${x},${y}h1.6`;
      s += `<path d="${dots}" stroke="${NAVY}" stroke-width="3" stroke-linecap="round" opacity="${da}"/>`;
      s += p2Draw.svg(t, { boil: 0, ampMul: 0 });
      s += `<g opacity="${prog(t, 10.4, 10.6)}">${text(700, 578, '≤ 300 行 / 文件', { size: 26, color: NAVY, font: MONO, anchor: 'end' })}${text(960, 296, '单一职责 · 先理解再修改', { size: 22, color: NAVY, font: MONO, anchor: 'middle' })}</g>`;
      s += text(1256, 391, typed('src/', t, 10.56, 30), { size: 26, color: NAVY, font: MONO, weight: 700 });
      TREE.forEach(([a, b], i) => {
        const t0 = 10.8 + i * 0.25;
        s += text(1330, 462 + i * 70, typed(a, t, t0, 40), { size: 24, color: NAVY, font: MONO, weight: 700 });
        s += text(1330 + a.length * 15 + 18, 462 + i * 70, typed(b, t, t0 + 0.05, 60), { size: 24, color: '#2F6BFF', font: MONO });
      });
    }
    // the gate itself (sketch -> vector)
    const fillK = prog(t, T.p3 - 0.16, T.p3, ease.inCubic);
    s += `<path d="M${G.x0},${G.ground}V${G.top}H${G.x1}V${G.ground}H${G.x1 - G.post}V${G.top + G.beam}H${G.x0 + G.post}V${G.ground}Z" fill="${vec ? '#FBFAF6' : '#F2E8D6'}"/>`;
    if (fillK > 0) {
      const h = (G.ground - G.top + 4) * fillK;
      const rect = root.querySelector('#gateFillRect');
      rect.setAttribute('y', (G.ground + 2 - h).toFixed(1));
      rect.setAttribute('height', h.toFixed(1));
      s += `<path d="M${G.x0},${G.ground}V${G.top}H${G.x1}V${G.ground}H${G.x1 - G.post}V${G.top + G.beam}H${G.x0 + G.post}V${G.ground}Z" fill="#FF5A36" clip-path="url(#gateFillClip)"/>`;
    }
    const gAmp = vec ? wob : 1;
    const gW = vec ? lerp(4.6, 3, prog(t, T.p2, T.p2 + 0.2)) : 4.6;
    if (!vec || snap < 1) {
      s += `<g ${vec ? '' : 'mask="url(#grain)"'}>` + gateSk.svg(t, { boil, ampMul: gAmp, wMul: gW / 4.6, color: col }) + '</g>';
    } else {
      s += `<path d="M${gateOuter.join('L')}M${gateInner.join('L')}" fill="none" stroke="${NAVY}" stroke-width="3" stroke-linejoin="miter"/>`;
    }
    if (!vec || t < T.p2 + 0.2) s += `<g opacity="${1 - prog(t, T.p2, T.p2 + 0.15)}" mask="url(#grain)">${gateHatch.svg(t, { boil })}</g>`;
    // gate label on the lintel
    if (!vec) s += text(960, G.top + 32, 'GATE 1', { size: 30, anchor: 'middle', font: `'Caveat', cursive`, weight: 700, boil, seed: 50 });
    else s += text(960, G.top + 30, 'GATE 2', { size: 20, anchor: 'middle', font: MONO, color: NAVY, weight: 700, spacing: 4 });

    if (t < T.p2 + 0.25) {
      const out = prog(t, T.p2, T.p2 + 0.22, ease.inCubic);
      // barrier (lifts on confirm)
      const lift = prog(t, T.confirm1, T.confirm1 + 0.4, (k) => ease.outBack(k, 2.5)) * -78;
      const bx = G.x0 + G.post, by = 628, bw = G.x1 - G.post - bx;
      let bar = `<rect x="0" y="-12" width="${bw + 20}" height="24" fill="#FBF3E4" stroke="${INK}" stroke-width="3"/>`;
      for (let k = 0; k < 5; k++) bar += `<path d="M${18 + k * 50},-12 l24,0 l-18,24 l-24,0 Z" fill="${RED}" opacity="0.85"/>`;
      s += `<g opacity="${1 - out}" transform="translate(${bx} ${by}) rotate(${lift.toFixed(2)})">${bar}<circle r="9" fill="${INK}"/></g>`;
      // requirement list + handshake bubble
      s += `<g opacity="${1 - out}" transform="translate(${-out * 200} 0)">`;
      s += text(240, 506, typed('需求清单', t, 8.3, 14), { size: 40, boil, seed: 61 });
      ['登录页', '账号 + 密码', '记住我'].forEach((r, i) => { s += text(300, 582 + i * 64, typed(r, t, 8.5 + i * 0.12, 18), { size: 34, boil, seed: 62 + i }); });
      s += reqDraw.svg(t, { boil }) + '</g>';
      s += `<g opacity="${1 - out}" transform="translate(${out * 200} 0)">${bubbleDraw.svg(t, { boil })}`;
      s += text(1232, 500, typed('✅ Phase 1 已完成。', t, 8.55, 22), { size: 34, boil, seed: 71 });
      s += text(1232, 556, typed('请确认后，我再进入 Phase 2。', t, 8.85, 30), { size: 30, boil, seed: 72, color: '#5b534b' });
      s += text(1292, 692, typed('确认', t, 9.0, 12), { size: 34, boil, seed: 73 }) + '</g>';
    }
  }
  dyn.innerHTML = s;
}
