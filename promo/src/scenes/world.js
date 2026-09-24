// The 3D world. One set of objects is re-dressed through three eras:
//   P3 flat colour  -> P4 isometric clay -> P5 metal / glass / light
// using a single camera rig whose fov runs from ~0.6° (reads as orthographic,
// pixel-aligned with the 2D paper world) to full perspective (a vertigo zoom).
// Then Act VI flies through five gates and pulls back to reveal the state machine.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { clamp, lerp, prog, ease, track, rng, noise1, hash } from '../lib/util.js';
import { T, PHASES } from '../timeline.js';

const DEG = Math.PI / 180;
const C = (h) => new THREE.Color(h);
const hot = (h, k) => new THREE.Color(h).multiplyScalar(k); // HDR colour for bloom
const AMBER = '#FFB547', CYAN = '#4FE3FF';

// ---------------------------------------------------------------------------------
function extrude(shape, depth, bevel = 3) {
  const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 3, curveSegments: 24 });
  g.translate(0, 0, -(depth + bevel)); // front face at z = 0, body extends backwards
  return g;
}
function gateShape(i = 3) {
  const s = new THREE.Shape();
  s.moveTo(-160 + i, -240); s.lineTo(-160 + i, 180 - i); s.lineTo(160 - i, 180 - i); s.lineTo(160 - i, -240);
  s.lineTo(116 + i, -240); s.lineTo(116 + i, 136 + i); s.lineTo(-116 - i, 136 + i); s.lineTo(-116 - i, -240); s.closePath();
  return s;
}
function roundRectShape(w, h, r) {
  const s = new THREE.Shape(), x = -w / 2, y = -h / 2;
  s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r); s.lineTo(x + w, y + h - r);
  s.quadraticCurveTo(x + w, y + h, x + w - r, y + h); s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y);
  return s;
}
function textTexture(w, h, draw, scale = 2) {
  const c = document.createElement('canvas');
  c.width = w * scale; c.height = h * scale;
  const g = c.getContext('2d');
  g.scale(scale, scale);
  draw(g, w, h);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}
const SANS = (w, px) => `${w} ${px}px 'Space Grotesk', 'Noto Sans SC', sans-serif`;
const CN = (w, px) => `${w} ${px}px 'Noto Sans SC', sans-serif`;
const MONO = (w, px) => `${w} ${px}px 'JetBrains Mono', monospace`;

// ---------------------------------------------------------------------------------
const PortalShader = {
  uniforms: { uTime: { value: 0 }, uI: { value: 0 } },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }`,
  fragmentShader: `
    uniform float uTime, uI; varying vec2 vUv;
    float h(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
    float n(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f);
      return mix(mix(h(i),h(i+vec2(1,0)),f.x), mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x), f.y); }
    float fbm(vec2 p){ float a=.5, s=0.; for(int k=0;k<5;k++){ s+=a*n(p); p*=2.03; a*=.5; } return s; }
    void main(){
      vec2 p = (vUv - .5) * vec2(1., 1.62);
      float r = length(p), a = atan(p.y, p.x);
      float sw = fbm(vec2(a * 2. + uTime * .6 - r * 5., r * 6. - uTime * 1.8));
      float core = exp(-r * 5.5);
      float rim = smoothstep(.58, .0, abs(r - .42 - sw * .12)) * .45;
      vec3 amber = vec3(1.0, .62, .22), cyan = vec3(.3, .85, 1.);
      vec3 col = mix(cyan, amber, smoothstep(.55, .05, r)) * (sw * 1.6 + core * 2.8 + rim);
      float edge = smoothstep(.0, .06, vUv.x) * smoothstep(1., .94, vUv.x) * smoothstep(.0, .04, vUv.y) * smoothstep(1., .96, vUv.y);
      gl_FragColor = vec4(col * uI * edge, 1.);
    }`,
};

const FinalShader = {
  uniforms: { tDiffuse: { value: null }, uCA: { value: 0 }, uVig: { value: 0.35 }, uGrain: { value: 0.03 }, uTime: { value: 0 }, uFlash: { value: 0 }, uExp: { value: 1 } },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }`,
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float uCA, uVig, uGrain, uTime, uFlash, uExp; varying vec2 vUv;
    float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233)) + uTime * 17.) * 43758.5453); }
    void main(){
      vec2 d = vUv - .5;
      vec3 c;
      c.r = texture2D(tDiffuse, vUv + d * uCA).r;
      c.g = texture2D(tDiffuse, vUv).g;
      c.b = texture2D(tDiffuse, vUv - d * uCA).b;
      c = clamp(c, 0., 64.);
      c *= uExp;
      float v = smoothstep(1.05, .25, length(d * vec2(1., .82)));
      c *= mix(1., v, uVig);
      c += (h(vUv * 1000.) - .5) * uGrain;
      c = mix(c, vec3(1.6), uFlash);
      gl_FragColor = vec4(c, 1.);
    }`,
};

// ---------------------------------------------------------------------------------
export class World {
  constructor(canvas) { this.canvas = canvas; }

  async init(faces) {
    await Promise.all(faces.map((f) => document.fonts.load(f, '搭建表单组件校验输入对接登录接口保存会话通过需求分析架构设计任务拆解编码执行审查收尾 0123456789 GATE STEP ✓')));
    const r = this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: false, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
    r.setPixelRatio(1);
    r.setSize(1920, 1080, false);
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    r.outputColorSpace = THREE.SRGBColorSpace;

    const scene = this.scene = new THREE.Scene();
    const pm = new THREE.PMREMGenerator(r);
    this.env = pm.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = this.env;
    this.cam = new THREE.PerspectiveCamera(30, 1920 / 1080, 1, 100000);

    const rt = new THREE.WebGLRenderTarget(1920, 1080, { type: THREE.HalfFloatType, samples: 4 });
    const comp = this.composer = new EffectComposer(r, rt);
    comp.setPixelRatio(1);
    comp.setSize(1920, 1080);
    comp.addPass(new RenderPass(scene, this.cam));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(960, 540), 0, 0.55, 0.82);
    comp.addPass(this.bloom);
    this.final = new ShaderPass(FinalShader);
    comp.addPass(this.final);
    comp.addPass(new OutputPass());

    this.buildLights();
    this.buildStudio();
    this.buildFloors();
    this.buildTunnel();
    this.buildParticles();
  }

  // --- lights ------------------------------------------------------------------
  buildLights() {
    const s = this.scene;
    this.hemi = new THREE.HemisphereLight('#FFF4E6', '#39426A', 0);
    this.key = new THREE.DirectionalLight('#FFF1DE', 0);
    this.key.position.set(-700, 1300, 900);
    this.key.castShadow = true;
    this.key.shadow.mapSize.set(2048, 2048);
    const sc = this.key.shadow.camera;
    sc.left = -1500; sc.right = 1500; sc.top = 1500; sc.bottom = -1500; sc.near = 10; sc.far = 5000;
    this.key.shadow.bias = -0.0004;
    this.key.shadow.radius = 6;
    this.rim = new THREE.PointLight(AMBER, 0, 3000, 2);
    this.rim.position.set(0, -60, -200);
    this.fill = new THREE.DirectionalLight('#9FC4FF', 0);
    this.fill.position.set(900, 300, 600);
    s.add(this.hemi, this.key, this.key.target, this.rim, this.fill);
  }

  // --- P3–P5 studio ------------------------------------------------------------------
  look(flat, clay, fin) {
    const m = new THREE.MeshPhysicalMaterial({ color: '#000', emissive: flat, roughness: 1, metalness: 0 });
    m.userData = { flat: C(flat), clay: C(clay), fin };
    this.looks.push(m);
    return m;
  }

  buildStudio() {
    this.looks = [];
    const g = this.studio = new THREE.Group();
    this.scene.add(g);

    // the gate
    this.gateGeo = extrude(gateShape(), 84, 3);
    this.gateMat = this.look('#FF5A36', '#FF7452', { color: '#8C929C', metalness: 1, roughness: 0.26, clearcoat: 0.6 });
    const gate = this.gate = new THREE.Mesh(this.gateGeo, this.gateMat);
    gate.castShadow = gate.receiveShadow = true;
    g.add(gate);
    this.gateStrips = this.makeStrips();
    g.add(this.gateStrips);
    this.portal = new THREE.Mesh(new THREE.PlaneGeometry(232, 376), new THREE.ShaderMaterial({ ...PortalShader, uniforms: THREE.UniformsUtils.clone(PortalShader.uniforms), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    this.portal.position.set(0, -52, -44);
    g.add(this.portal);
    this.lintel = new THREE.Mesh(new THREE.PlaneGeometry(232, 40), new THREE.MeshBasicMaterial({ transparent: true, toneMapped: false }));
    this.lintel.position.set(0, 158, 0.8);
    g.add(this.lintel);
    const lintelTex = (label, color) => textTexture(232, 40, (c, w, h) => { c.font = MONO(700, 20); c.fillStyle = color; c.textAlign = 'center'; c.textBaseline = 'middle'; c.letterSpacing = '6px'; c.fillText(label, w / 2, h / 2 + 1); });
    this.lintelTex = { p3: lintelTex('GATE 3', '#1F2A44'), p4: lintelTex('GATE 4', '#5A2416'), p5: lintelTex('GATE 5', '#FFD9A0') };

    // task cards
    const CARDS = [['01', '搭建表单组件', '#2F6BFF', '#FFFFFF'], ['02', '校验输入', '#FFC53D', '#1F2A44'], ['03', '对接登录接口', '#19C39C', '#0E2A33'], ['04', '保存会话', '#F4EFE6', '#1F2A44']];
    const cardGeo = extrude(roundRectShape(440, 76, 16), 30, 2);
    this.cards = CARDS.map(([n, label, col, ink], i) => {
      const grp = new THREE.Group();
      grp.position.set(470, 122 - i * 96, 0);
      const mat = this.look(col, col, { color: '#0C1222', metalness: 0.1, roughness: 0.12, clearcoat: 1, opacity: 0.62 });
      const body = new THREE.Mesh(cardGeo, mat);
      body.castShadow = body.receiveShadow = true;
      const mk = (done, glow) => textTexture(440, 76, (c, w, h) => {
        c.fillStyle = glow ? '#E8F7FF' : ink;
        c.font = SANS(700, 30); c.textBaseline = 'middle';
        c.fillText(n, 28, h / 2 + 1);
        c.font = CN(700, 28); c.fillText(label, 88, h / 2 + 1);
        if (done) {
          c.beginPath(); c.arc(w - 44, h / 2, 20, 0, Math.PI * 2);
          c.fillStyle = glow ? '#3DFFB5' : '#1F2A44'; c.fill();
          c.strokeStyle = glow ? '#04120C' : '#FFFFFF'; c.lineWidth = 4.5; c.lineCap = 'round'; c.lineJoin = 'round';
          c.beginPath(); c.moveTo(w - 54, h / 2 + 1); c.lineTo(w - 47, h / 2 + 8); c.lineTo(w - 33, h / 2 - 8); c.stroke();
        }
      });
      const tex = { idle: mk(false, false), done: mk(true, false), glow: mk(true, true) };
      const face = new THREE.Mesh(new THREE.PlaneGeometry(440, 76), new THREE.MeshBasicMaterial({ map: tex.idle, transparent: true, toneMapped: false }));
      face.position.z = 0.7;
      const outline = roundRectShape(448, 84, 20);
      outline.holes.push(new THREE.Path(roundRectShape(440, 76, 16).getPoints(12).reverse()));
      const edge = new THREE.Mesh(new THREE.ShapeGeometry(outline), new THREE.MeshBasicMaterial({ color: hot(CYAN, 1.8), transparent: true, opacity: 0, toneMapped: false, depthWrite: false }));
      edge.position.z = 1.2;
      grp.add(body, face, edge);
      g.add(grp);
      return { grp, body, face, edge, tex, mat, sx: 700 + i * 60 };
    });

    // bauhaus decorations (flat -> extruded clay -> fly away)
    const circle = new THREE.Shape(); circle.absarc(0, 0, 120, 0, Math.PI * 2);
    const semi = new THREE.Shape(); semi.moveTo(-220, 0); semi.absarc(0, 0, 220, Math.PI, 0, true); semi.lineTo(-220, 0);
    const tri = new THREE.Shape(); tri.moveTo(-70, -60); tri.lineTo(70, -60); tri.lineTo(0, 64); tri.closePath();
    const ring = new THREE.Shape(); ring.absarc(0, 0, 64, 0, Math.PI * 2); const hole = new THREE.Path(); hole.absarc(0, 0, 40, 0, Math.PI * 2, true); ring.holes.push(hole);
    const bar = roundRectShape(220, 22, 11);
    this.decos = [
      [circle, '#FFC53D', -330, 110, 60, 0.00], [semi, '#2F6BFF', -690, -540, 50, 0.05], [tri, '#F4EFE6', 760, 330, 40, 0.1],
      [ring, '#19C39C', 330, -380, 30, 0.14], [bar, '#FF5A36', -560, -250, 30, 0.08],
    ].map(([shape, col, x, y, d, delay]) => {
      const m = new THREE.Mesh(extrude(shape, d, 2), this.look(col, col, { color: col, metalness: 0, roughness: 0.5 }));
      m.position.set(x, y, -20);
      m.castShadow = true;
      m.userData.delay = delay;
      g.add(m);
      return m;
    });

    // the "current step" token and the loop ring
    this.token = new THREE.Mesh(new THREE.SphereGeometry(16, 32, 16), this.look('#FFB547', '#FFB547', { color: '#FFB547', metalness: 0, roughness: 0.3, glow: '#FFB547', glowI: 3 }));
    this.token.castShadow = true;
    g.add(this.token);
    const loop = new THREE.Group();
    const tor = new THREE.Mesh(new THREE.TorusGeometry(330, 5, 12, 160, Math.PI * 1.72), this.look('#FFB547', '#FFB547', { color: '#0A0F1A', metalness: 0, roughness: 0.3, glow: CYAN, glowI: 1.5 }));
    const head = new THREE.Mesh(new THREE.ConeGeometry(16, 38, 24), tor.material);
    head.position.set(330 * Math.cos(Math.PI * 1.72), 330 * Math.sin(Math.PI * 1.72), 0);
    head.rotation.z = Math.PI * 1.72;
    loop.add(tor, head);
    const loopWrap = this.loop = new THREE.Group();
    loopWrap.add(loop);
    loop.rotation.x = Math.PI / 2;
    loopWrap.position.set(470, -20, -15);
    g.add(loopWrap);
    this.loopInner = loop;
  }

  makeStrips(scale = 1) {
    const grp = new THREE.Group();
    const mat = new THREE.MeshBasicMaterial({ color: hot(AMBER, 3.2), toneMapped: false, transparent: true });
    const add = (w, h, x, y) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, 3), mat); m.position.set(x, y, 1.6); grp.add(m); };
    add(4, 374, -114, -52); add(4, 374, 114, -52); add(232, 4, 0, 134);   // inner edges
    add(4, 418, -158, -30); add(4, 418, 158, -30); add(320, 4, 0, 178);   // outer edges
    grp.userData.mat = mat;
    return grp;
  }

  buildFloors() {
    const clay = this.floorClay = new THREE.Mesh(new THREE.PlaneGeometry(12000, 12000), new THREE.MeshStandardMaterial({ color: '#2B3558', roughness: 0.95 }));
    clay.rotation.x = -Math.PI / 2; clay.position.y = -240.5; clay.receiveShadow = true;
    this.scene.add(clay);
    const refl = this.reflector = new Reflector(new THREE.PlaneGeometry(40000, 40000), { textureWidth: 960, textureHeight: 540, color: 0x8a8a8a });
    refl.rotation.x = -Math.PI / 2; refl.position.y = -242;
    const night = this.floorNight = new THREE.Mesh(new THREE.PlaneGeometry(40000, 40000), new THREE.MeshBasicMaterial({ color: '#020306', transparent: true, opacity: 0.8 }));
    night.rotation.x = -Math.PI / 2; night.position.y = -240.5; night.receiveShadow = true;
    const grid = this.grid = new THREE.GridHelper(40000, 400, CYAN, CYAN);
    grid.material.transparent = true; grid.material.opacity = 0.07; grid.material.toneMapped = false;
    grid.position.y = -240;
    this.scene.add(refl, night, grid);
  }

  // --- Act VI: the tunnel of gates -----------------------------------------------------
  buildTunnel() {
    const g = this.tunnel = new THREE.Group();
    this.scene.add(g);
    const pts = [[0, 1400], [0, 0], [520, -1500], [0, -3000], [-520, -4500], [0, -6000], [420, -7400], [900, -8400]].map(([x, z]) => new THREE.Vector3(x, 0, z));
    const curve = this.curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
    const L = this.curveLen = curve.getLength();
    const find = (p) => { let best = 0, bd = 1e9; for (let i = 0; i <= 4000; i++) { const d = curve.getPointAt(i / 4000).distanceTo(p); if (d < bd) { bd = d; best = i / 4000; } } return best; };
    this.gateU = pts.slice(1, 6).map(find);
    const gateMat = new THREE.MeshPhysicalMaterial({ color: '#8C929C', metalness: 1, roughness: 0.26, clearcoat: 0.6 });
    this.tGates = pts.slice(1, 6).map((p, i) => {
      const grp = new THREE.Group();
      const u = this.gateU[i], tan = curve.getTangentAt(u);
      grp.position.copy(curve.getPointAt(u));
      grp.position.y = 120;           // scaled 1.5x about its origin, feet stay on the floor
      grp.scale.setScalar(1.5);
      grp.rotation.y = Math.atan2(-tan.x, -tan.z);
      const m = new THREE.Mesh(this.gateGeo, gateMat);
      m.castShadow = true;
      const strips = this.makeStrips();
      strips.userData.mat = strips.userData.mat.clone();
      strips.children.forEach((c) => (c.material = strips.userData.mat));
      const portal = new THREE.Mesh(this.portal.geometry, new THREE.ShaderMaterial({ ...PortalShader, uniforms: THREE.UniformsUtils.clone(PortalShader.uniforms), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
      portal.position.set(0, -52, -44);
      const [num, cn] = PHASES[i];
      const tex = textTexture(232, 40, (c, w, h) => { c.font = MONO(700, 19); c.fillStyle = '#FFD9A0'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(`${num} · ${cn}`, w / 2, h / 2 + 1); });
      const label = new THREE.Mesh(new THREE.PlaneGeometry(232, 40), new THREE.MeshBasicMaterial({ map: tex, transparent: true, toneMapped: false, color: hot('#FFFFFF', 1.6) }));
      label.position.set(0, 158, 0.8);
      // floating check badge above each gate
      const badgeTex = textTexture(96, 96, (c) => {
        c.beginPath(); c.arc(48, 48, 40, 0, Math.PI * 2); c.lineWidth = 6; c.strokeStyle = '#3DFFB5'; c.stroke();
        c.lineCap = 'round'; c.lineJoin = 'round'; c.lineWidth = 9; c.beginPath(); c.moveTo(29, 50); c.lineTo(43, 64); c.lineTo(68, 34); c.stroke();
      });
      const badge = new THREE.Mesh(new THREE.PlaneGeometry(96, 96), new THREE.MeshBasicMaterial({ map: badgeTex, transparent: true, toneMapped: false, color: hot('#FFFFFF', 2.2), depthWrite: false }));
      badge.position.set(0, 290, -40);
      grp.add(m, strips, portal, label, badge);
      g.add(grp);
      return { grp, strips, portal, badge, label };
    });

    // glowing path on the floor between the gates
    const flat = new THREE.CatmullRomCurve3(curve.getSpacedPoints(300).map((p) => new THREE.Vector3(p.x, -238, p.z)));
    this.beam = new THREE.Mesh(new THREE.TubeGeometry(flat, 600, 4, 8, false), new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uI: { value: 1 }, uHead: { value: -1 } },
      vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }`,
      fragmentShader: `uniform float uTime, uI, uHead; varying vec2 vUv;
        void main(){ float d = fract(vUv.x * 40. - uTime * 2.);
          float pulse = smoothstep(.0, .12, d) * smoothstep(.5, .12, d);
          float head = exp(-abs(vUv.x - uHead) * 30.) * 6.;
          vec3 c = vec3(1., .62, .22) * (0.9 + pulse * 2.5) + vec3(1.) * head;
          gl_FragColor = vec4(c * uI, 1.); }`,
      toneMapped: false,
    }));
    g.add(this.beam);
    // hologram loop ring around gate 4
    const ring4 = this.ring4 = new THREE.Mesh(new THREE.TorusGeometry(420, 3, 8, 200), new THREE.MeshBasicMaterial({ color: hot(CYAN, 3), toneMapped: false, transparent: true, opacity: 0.8 }));
    ring4.position.copy(this.tGates[3].grp.position).setY(-60);
    ring4.scale.setScalar(1.3);
    ring4.rotation.x = Math.PI / 2;
    g.add(ring4);

    // speed streaks along the flight path
    const N = 700, r = rng(21);
    const streak = new THREE.InstancedMesh(new THREE.BoxGeometry(1.6, 1.6, 1), new THREE.MeshBasicMaterial({ toneMapped: false, transparent: true }), N);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
    for (let i = 0; i < N; i++) {
      const u = r() * 0.95, p = curve.getPointAt(u), tan = curve.getTangentAt(u);
      const side = new THREE.Vector3().crossVectors(tan, up).normalize();
      const ang = r() * Math.PI * 2, rad = 380 + r() * 1400;
      p.addScaledVector(side, Math.cos(ang) * rad).add(new THREE.Vector3(0, Math.abs(Math.sin(ang)) * rad * 0.7 - 60, 0));
      q.setFromUnitVectors(new THREE.Vector3(0, 0, 1), tan);
      m4.compose(p, q, new THREE.Vector3(1, 1, 120 + r() * 380));
      streak.setMatrixAt(i, m4);
      streak.setColorAt(i, r() < 0.5 ? hot(AMBER, 3) : r() < 0.6 ? hot(CYAN, 3) : hot('#FFFFFF', 2.5));
    }
    this.streaks = streak;
    g.add(streak);
  }

  buildParticles() {
    const N = 1600, r = rng(33), pos = new Float32Array(N * 3), seed = new Float32Array(N);
    for (let i = 0; i < N; i++) { pos[i * 3] = (r() - 0.5) * 9000; pos[i * 3 + 1] = r() * 1800 - 240; pos[i * 3 + 2] = 2000 - r() * 11000; seed[i] = r(); }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('seed', new THREE.BufferAttribute(seed, 1));
    this.dust = new THREE.Points(geo, new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uI: { value: 0 } },
      vertexShader: `attribute float seed; uniform float uTime; varying float vS;
        void main(){ vec3 p = position; p.y = -240. + mod(p.y + 240. + uTime * (20. + seed * 60.), 1800.);
          p.x += sin(uTime * .5 + seed * 40.) * 30.; vS = seed;
          vec4 mv = modelViewMatrix * vec4(p, 1.); gl_Position = projectionMatrix * mv;
          gl_PointSize = (2. + seed * 5.) * 900. / -mv.z; }`,
      fragmentShader: `uniform float uI; varying float vS;
        void main(){ float d = length(gl_PointCoord - .5); float a = smoothstep(.5, .0, d);
          vec3 c = mix(vec3(1., .66, .3), vec3(.35, .85, 1.), step(.6, vS)) * 2.2; gl_FragColor = vec4(c * a * uI, 1.); }`,
      transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
    }));
    this.dust.frustumCulled = false;
    this.scene.add(this.dust);
  }

  // --- camera rig ----------------------------------------------------------------------
  /** Orbit rig: target, azimuth/elevation (deg), fov (deg), frame height at target. */
  rig({ target, az, el, fov, frameH, roll = 0 }) {
    const d = frameH / 2 / Math.tan((fov * DEG) / 2);
    const cam = this.cam;
    cam.fov = fov;
    cam.position.set(target[0] + d * Math.sin(az * DEG) * Math.cos(el * DEG), target[1] + d * Math.sin(el * DEG), target[2] + d * Math.cos(az * DEG) * Math.cos(el * DEG));
    cam.near = Math.max(1, d - 4000); cam.far = d + 60000;
    cam.up.set(Math.sin(roll * DEG), Math.cos(roll * DEG), 0);
    cam.lookAt(target[0], target[1], target[2]);
    cam.updateProjectionMatrix();
  }

  // --- per-frame -----------------------------------------------------------------------
  render(t, realT = t) {
    const vis = t >= T.p3 - 0.05 && !(t >= T.black && t < T.drop);
    this.canvas.style.display = vis ? '' : 'none';
    if (!vis) return;
    const studio = t < T.black;
    this.studio.visible = studio;
    this.tunnel.visible = !studio;
    if (studio) this.renderStudio(t); else this.renderTunnel(t);
    this.fx(t, realT);
    this.composer.render();
  }

  renderStudio(t) {
    const k4 = prog(t, T.p4, T.p4 + 0.4, ease.inOutCubic);   // flat -> clay
    const k5 = prog(t, T.p5, T.p5 + 0.45, ease.inOutCubic);  // clay -> real
    const r = this.renderer;
    r.toneMapping = t < T.p4 ? THREE.NoToneMapping : THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = lerp(1.0, 1.15, k5);
    this.scene.background = new THREE.Color('#1F2A44').lerp(C('#212A45'), k4).lerp(C('#04060B'), k5);
    this.scene.fog = k5 > 0 ? new THREE.FogExp2('#04060B', 0.00016 * k5) : null;
    this.scene.environmentIntensity = lerp(1, 0.4, k5);

    // materials
    for (const m of this.looks) {
      const u = m.userData, f = u.fin;
      m.emissive.copy(u.flat).multiplyScalar(1 - k4);
      if (f.glow) m.emissive.add(C(f.glow).multiplyScalar(f.glowI * k5));
      m.color.copy(C('#000')).lerp(u.clay, k4).lerp(C(f.color), k5);
      m.metalness = lerp(0, f.metalness, k5);
      m.roughness = lerp(1, lerp(0.72, f.roughness, k5), k4);
      m.clearcoat = lerp(0, f.clearcoat || 0, k5);
      m.envMapIntensity = lerp(0, lerp(0.35, 1.25, k5), k4);
      const op = lerp(1, f.opacity ?? 1, k5);
      m.transparent = op < 1; m.opacity = op;
    }
    this.hemi.intensity = lerp(0, lerp(1.25, 0.25, k5), k4);
    this.key.intensity = lerp(0, lerp(2.6, 1.3, k5), k4);
    this.fill.intensity = lerp(0, lerp(0.4, 1.4, k5), k4);
    this.rim.intensity = lerp(0, 1.6e5, k5) * (1 + 0.12 * Math.sin(t * 20));

    // depth: flat -> extruded
    const depth = lerp(0.015, 1, prog(t, T.p4 + 0.05, T.p4 + 0.5, ease.outCubic));
    this.gate.scale.z = depth;
    this.gateStrips.visible = t >= T.p5;
    const flick = t < T.p5 + 0.25 ? (hash(Math.floor(t * 40)) > 0.45 ? 1 : 0.15) : 1;
    this.gateStrips.userData.mat.opacity = prog(t, T.p5, T.p5 + 0.1) * flick;
    this.portal.visible = t >= T.p5 + 0.1;
    this.portal.material.uniforms.uTime.value = t;
    this.portal.material.uniforms.uI.value = prog(t, T.p5 + 0.1, T.p5 + 0.8) * lerp(1, 2.2, prog(t, 17.3, 18));
    this.lintel.material.map = t < T.p4 ? this.lintelTex.p3 : t < T.p5 ? this.lintelTex.p4 : this.lintelTex.p5;

    // cards: slide in on the beat, then execute one per beat
    const exec = [14.5, 15.0, 15.5, 16.0];
    this.cards.forEach((c, i) => {
      const k = prog(t, T.p3 + i * 0.5, T.p3 + i * 0.5 + 0.32, (x) => ease.outBack(x, 1.4));
      const pop = t >= exec[i] ? 1 + 0.12 * Math.exp(-(t - exec[i]) * 9) * Math.sin((t - exec[i]) * 30) : 1;
      c.grp.position.x = 470 + (1 - k) * 900;
      c.grp.scale.setScalar(pop);
      c.body.scale.z = depth;
      c.face.material.map = t >= T.p5 ? c.tex.glow : t >= exec[i] ? c.tex.done : c.tex.idle;
      c.edge.material.opacity = k5 * 0.9;
    });

    // decorations: pop in, extrude, then fly off when the lights go down
    this.decos.forEach((m, i) => {
      const k = prog(t, T.p3 + m.userData.delay, T.p3 + m.userData.delay + 0.35, (x) => ease.outBack(x, 2));
      const away = prog(t, T.p5 - 0.05, T.p5 + 0.35, ease.inCubic);
      m.scale.set(k * (1 - away) + 1e-3, k * (1 - away) + 1e-3, depth);
      m.rotation.z = (t - T.p3) * 0.15 * (i % 2 ? 1 : -1) + away * 2;
      m.position.z = -20 + prog(t, T.p4, T.p4 + 0.5) * (i % 2 ? -120 : 90);
    });

    // token hops between steps; loop ring spins
    const hop = exec.findLastIndex((e) => t >= e);
    const from = Math.max(0, hop - 1), to = Math.max(0, hop), hk = hop < 0 ? 0 : prog(t, exec[to], exec[to] + 0.22, ease.outCubic);
    const ty = lerp(122 - from * 96, 122 - to * 96, hk) + Math.sin(hk * Math.PI) * 60;
    this.token.position.set(215, ty, 40);
    this.token.visible = t >= T.p4 + 0.2;
    this.token.scale.setScalar(prog(t, T.p4 + 0.2, T.p4 + 0.45, ease.outBack) + 1e-3);
    this.loop.visible = t >= T.p4 + 0.15;
    this.loop.scale.setScalar(prog(t, T.p4 + 0.15, T.p4 + 0.6, ease.outBack) + 1e-3);
    this.loopInner.rotation.z = -t * 1.6 - [14.5, 15, 15.5, 16, 16.5, 17, 17.5].reduce((a, b) => a + (t > b ? ease.outCubic(prog(t, b, b + 0.3)) * 1.2 : 0), 0);

    // floors
    this.floorClay.visible = t >= T.p4 && t < T.p5 + 0.5;
    this.floorClay.material.opacity = 1 - k5;
    this.floorClay.material.transparent = k5 > 0;
    this.floorClay.material.color = C('#2B3558');
    const night = t >= T.p5;
    this.reflector.visible = this.floorNight.visible = this.grid.visible = night;
    this.grid.material.opacity = 0.07 * k5;
    this.dust.material.uniforms.uI.value = k5 * 0.8;
    this.dust.material.uniforms.uTime.value = t;

    // camera: front "orthographic" -> isometric -> vertigo into perspective -> push into the portal
    const az = track(t, [[T.p3, 0], [T.p4, 0], [T.p4 + 0.5, -38, ease.outExpo], [T.p5, -44, ease.linear], [T.p5 + 0.7, -26, ease.inOutCubic], [18, -18, ease.linear]]);
    const el = track(t, [[T.p4, 0], [T.p4 + 0.5, 27, ease.outExpo], [T.p5, 29, ease.linear], [T.p5 + 0.7, 9, ease.inOutCubic], [18, 5, ease.linear]]);
    const fov = track(t, [[T.p5, 0.6], [T.p5 + 0.7, 38, ease.inOutCubic], [17.5, 40, ease.linear], [18, 58, ease.inQuad]]);
    const frameH = track(t, [[T.p3, 1080], [T.p4 - 0.05, 1030, ease.linear], [T.p4 + 0.5, 1300, ease.outExpo], [T.p5, 1340, ease.linear], [T.p5 + 0.7, 930, ease.inOutCubic], [17.5, 820, ease.linear], [18, 260, ease.inQuart]]);
    const target = track(t, [[T.p4, [0, 0, 0]], [T.p4 + 0.5, [170, -40, -30], ease.outExpo], [T.p5, [170, -40, -30]], [T.p5 + 0.7, [90, -60, -30], ease.inOutCubic], [17.5, [40, -60, -30]], [18, [0, -52, -44], ease.inQuart]]);
    const roll = track(t, [[17.4, 0], [18, -6, ease.inQuad]]);
    this.rig({ target, az, el, fov, frameH, roll });
  }

  renderTunnel(t) {
    const r = this.renderer;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.15;
    this.scene.background = C('#03050A');
    this.scene.fog = new THREE.FogExp2('#03050A', 0.00009);
    this.scene.environmentIntensity = 0.35;
    this.hemi.intensity = 0.12; this.key.intensity = 0.7; this.fill.intensity = 0.9; this.rim.intensity = 0;
    this.floorClay.visible = false;
    this.reflector.visible = this.floorNight.visible = this.grid.visible = true;
    this.grid.material.opacity = 0.07;
    this.dust.material.uniforms.uI.value = 1;
    this.dust.material.uniforms.uTime.value = t;

    const L = this.curveLen, U = this.gateU;
    const pass = [19.5, 20.0, 20.5, 21.0, 21.5];
    const hits = [23, 24, 25];
    const pulse = hits.reduce((a, h) => a + (t >= h ? Math.exp(-(t - h) * 5) : 0), 0);
    this.tGates.forEach((gt, i) => {
      const near = Math.exp(-Math.abs(t - pass[i]) * 6);
      gt.strips.userData.mat.color = hot(AMBER, 2.6 + near * 2.5 + pulse * 3);
      gt.portal.material.uniforms.uTime.value = t + i;
      gt.portal.material.uniforms.uI.value = 0.8 + near * 0.8 + pulse * 0.6;
      const b = prog(t, pass[i] + 0.05, pass[i] + 0.35, ease.outBack);
      gt.badge.scale.setScalar(b + 1e-3);
      gt.badge.position.y = 280 + Math.sin(t * 2 + i) * 10;
      gt.badge.lookAt(this.cam.position);
    });
    this.beam.material.uniforms.uTime.value = t;
    this.beam.material.uniforms.uI.value = 1 + pulse * 0.8;
    this.beam.material.uniforms.uHead.value = t >= 24 ? prog(t, 24, 24.9, ease.inOutCubic) * 1.1 - 0.05 : -1;
    this.ring4.rotation.z = t * 0.8;
    this.ring4.scale.setScalar(1.3 + pulse * 0.1);
    this.streaks.material.opacity = 1 - prog(t, 21.6, 22.3);
    this.streaks.visible = t < 22.4;

    // camera: fly the path, slow-mo past gate 5, whip back to reveal, then orbit
    const cam = this.cam;
    if (t < T.reveal) {
      const uStart = U[0] - 1300 / L;
      const u = t < 19.5 ? lerp(uStart, U[0], ease.outQuad(prog(t, 19.0, 19.5)) * 0.35 + prog(t, 19.0, 19.5) * 0.65)
        : t < 21.5 ? (() => { const i = Math.min(3, Math.floor((t - 19.5) / 0.5)); return lerp(U[i], U[i + 1], (t - 19.5 - i * 0.5) / 0.5); })()
          : lerp(U[4], U[4] + 700 / L, ease.outCubic(prog(t, 21.5, 22.0)));
      const p = this.curve.getPointAt(clamp(u, 0, 1)), ahead = this.curve.getPointAt(clamp(u + 160 / L, 0, 1));
      cam.fov = t < 19.12 ? lerp(40, 72, ease.outExpo(prog(t, 19, 19.12))) : lerp(72, 58, prog(t, 21.4, 22));
      cam.position.set(p.x, 30 + Math.sin(t * 3) * 10, p.z);
      cam.up.set(Math.sin(Math.sin(t * 2.2) * 5 * DEG), 1, 0);
      cam.lookAt(ahead.x, 20, ahead.z);
    } else {
      const center = new THREE.Vector3(0, -240, -2700);
      const th = track(t, [[T.reveal + 0.8, 0.22], [27, 0.62, ease.linear], [30, 0.8, ease.outQuad]]);
      const R = track(t, [[T.reveal + 0.8, 4300], [27, 4700, ease.linear], [30, 5200, ease.outQuad]]);
      const orbit = new THREE.Vector3(center.x + Math.sin(th) * R, 1250 + Math.sin(t * 0.7) * 40, center.z + Math.cos(th) * R);
      const endPath = this.curve.getPointAt(clamp(U[4] + 700 / L, 0, 1));
      const k = ease.inOutExpo(prog(t, T.reveal, T.reveal + 0.8));
      const from = new THREE.Vector3(endPath.x, 30, endPath.z);
      cam.position.lerpVectors(from, orbit, k);
      const look = new THREE.Vector3().lerpVectors(this.curve.getPointAt(clamp(U[4] + 860 / L, 0, 1)).setY(20), center, k);
      cam.fov = lerp(58, 42, k);
      cam.up.set(0, 1, 0);
      cam.lookAt(look);
    }
    cam.near = 5; cam.far = 60000;
    cam.updateProjectionMatrix();
  }

  fx(t, realT) {
    const u = this.final.uniforms;
    const imp = (h, k = 10) => (realT >= h ? Math.exp(-(realT - h) * k) : 0);
    u.uTime.value = realT;
    u.uCA.value = 0.0008 + imp(T.p4) * 0.01 + imp(T.p5) * 0.012 + prog(t, 17.4, 18) * 0.012 + imp(T.drop, 5) * 0.03 + [23, 24, 25].reduce((a, h) => a + imp(h, 7) * 0.02, 0) + (t > 19 && t < 21.6 ? 0.004 : 0);
    u.uFlash.value = imp(T.drop, 12) * 0.9 + imp(T.p5, 14) * 0.35 + imp(T.p4, 16) * 0.2;
    u.uGrain.value = t < T.p4 ? 0.02 : 0.035;
    u.uVig.value = t < T.p4 ? 0.2 : t < T.p5 ? 0.35 : 0.55;
    u.uExp.value = 1;
    this.bloom.strength = t < T.p5 ? 0 : t < T.black ? lerp(0, 0.6, prog(t, T.p5, T.p5 + 0.5)) + prog(t, 17.6, 18) * 0.3 : 0.5 + [23, 24, 25].reduce((a, h) => a + imp(h, 5) * 0.5, 0);
    this.bloom.threshold = 0.9;
    this.bloom.radius = t < T.black ? 0.42 : 0.32;
  }
}
