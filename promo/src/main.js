// Glue: every layer renders as a pure function of time t (seconds).
// Render mode (?render=1) exposes window.__render(t) for the frame capturer;
// otherwise a scrubber + play button preview the film with its score.
import { initPaper, renderPaper } from './scenes/paper.js';
import { World } from './scenes/world.js';
import { initUI, renderUI } from './scenes/ui.js';
import { initFX, renderFX } from './scenes/fx.js';
import { sceneTime, T } from './timeline.js';

const q = new URLSearchParams(location.search);
const stage = document.getElementById('stage');

await document.fonts.ready;
const FACES = [`400 32px 'LXGW WenKai'`, `700 32px 'LXGW WenKai'`, `700 32px 'Caveat'`, `400 32px 'JetBrains Mono'`, `700 32px 'JetBrains Mono'`,
  `500 32px 'Space Grotesk'`, `700 32px 'Space Grotesk'`, `500 32px 'Noto Sans SC'`, `700 32px 'Noto Sans SC'`, `900 32px 'Noto Sans SC'`];

initPaper(document.getElementById('paper'));
initUI(document.getElementById('ui'));
initFX(document.getElementById('fx'));
const world = new World(document.getElementById('gl'));
await world.init(FACES);

export function render(t) {
  const st = sceneTime(t);        // the montage re-uses earlier moments
  renderPaper(st);
  world.render(st, t);
  renderUI(st, t);
  renderFX(t, st, stage);
}
window.__render = render;
window.__world = world;

// Warm-up: touch every moment once so every font subset is fetched before capture.
for (let t = 0; t <= T.end; t += 0.25) { renderPaper(t); renderUI(t, t); }
await Promise.all(FACES.map((f) => document.fonts.load(f, '确认 GATE Phase 0123456789 abcxyz')));
await document.fonts.ready;
await new Promise((r) => setTimeout(r, 300));
await document.fonts.ready;

if (q.has('render')) {
  render(0);
  window.__ready = true;
} else {
  const ctl = document.getElementById('controls'), scrub = document.getElementById('scrub'), time = document.getElementById('time');
  const music = document.getElementById('music'), play = document.getElementById('play');
  ctl.hidden = false;
  const fit = () => { const s = Math.min(innerWidth / 1920, (innerHeight - 50) / 1080); stage.style.transform = `scale(${s})`; };
  addEventListener('resize', fit); fit();
  const show = (t) => { render(t); scrub.value = t; time.textContent = t.toFixed(2) + 's'; };
  scrub.oninput = () => { music.pause(); play.textContent = '▶'; music.currentTime = +scrub.value; show(+scrub.value); };
  play.onclick = () => { if (music.paused) { music.play(); play.textContent = '❚❚'; } else { music.pause(); play.textContent = '▶'; } };
  const loop = () => { if (!music.paused) show(music.currentTime); requestAnimationFrame(loop); };
  loop();
  const t0 = Number(q.get('t') || 0);
  music.currentTime = t0; show(t0);
  window.__ready = true;
}
