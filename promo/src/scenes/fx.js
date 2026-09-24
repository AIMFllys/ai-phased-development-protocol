// Frame-level finishing: film grain, letterbox, hit flashes (white / inverted
// frames on the big beats) and the title-card defocus of the 3D layer.
import { clamp, prog, ease, rng } from '../lib/util.js';
import { T, CONFIRMS } from '../timeline.js';

let ctx, grains = [];
export function initFX(canvas) {
  ctx = canvas.getContext('2d');
  const r = rng(99);
  for (let k = 0; k < 6; k++) {
    const c = document.createElement('canvas');
    c.width = c.height = 512;
    const g = c.getContext('2d'), img = g.createImageData(512, 512);
    for (let i = 0; i < img.data.length; i += 4) {
      const v = r() * 255;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
      img.data[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    grains.push(c);
  }
}

const imp = (t, h, k) => (t >= h ? Math.exp(-(t - h) * k) : 0);

export function renderFX(t, st, stage) {
  ctx.clearRect(0, 0, 1920, 1080);

  // film grain (changes at 24fps), a touch heavier on paper
  const g = grains[Math.floor(t * 24) % grains.length];
  ctx.globalAlpha = st < T.p3 ? 0.07 : 0.045;
  ctx.globalCompositeOperation = 'overlay';
  const ox = Math.floor((t * 7919) % 512), oy = Math.floor((t * 3571) % 512);
  for (let y = -oy; y < 1080; y += 512) for (let x = -ox; x < 1920; x += 512) ctx.drawImage(g, x, y);
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;

  // letterbox for the cinematic stretch (the confirm prompt through the words)
  const lb = (prog(t, T.black, T.black + 0.35, ease.outCubic) - prog(t, T.title - 0.05, T.title + 0.3, ease.inOutCubic)) * 74;
  if (lb > 0.5) {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, 1920, lb);
    ctx.fillRect(0, 1080 - lb, 1920, lb);
  }

  // white flashes on the hits
  let white = imp(t, T.slam + 0.034, 9) * 0.55 + imp(t, T.p2, 14) * 0.35 + imp(t, T.title, 6) * 0.7;
  for (const c of CONFIRMS) white += imp(t, c, 18) * 0.12;
  for (const w of [T.words, T.words + 1, T.words + 2]) white += imp(t, w + 0.017, 12) * 0.25;
  if (t >= T.montage && t < T.title) white += imp((t - T.montage) % 0.125, 0, 40) * 0.18;
  if (white > 0.005) {
    ctx.fillStyle = `rgba(255,255,255,${clamp(white)})`;
    ctx.fillRect(0, 0, 1920, 1080);
  }

  // inverted single frames on the heaviest hits
  const inv = (t >= T.slam && t < T.slam + 0.034) || [T.words, T.words + 1, T.words + 2].some((w) => t >= w && t < w + 0.017);
  stage.style.filter = inv ? 'invert(1)' : '';

  // title card: the 3D world falls out of focus behind the type
  const gl = document.getElementById('gl');
  const d = prog(t, T.title, T.title + 0.5, ease.outCubic);
  gl.style.filter = d > 0 ? `blur(${(d * 9).toFixed(2)}px) brightness(${1 - d * 0.55})` : '';
  stage.style.background = st >= T.p3 ? '#000' : '#F2E8D6';
}
