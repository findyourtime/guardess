/* Guardess — Apple Watch en 3D temps réel (three.js) pour le hero.
   L'angle vient de main.js (événement « watchangle » sur [data-watch]).
   L'écran utilise un shader : sa luminosité dépend de l'angle réel entre
   la normale de l'écran et la caméra, comme un filtre à micro-lamelles. */
import * as THREE from '../vendor/three/three.module.min.js';
import { RoomEnvironment } from '../vendor/three/RoomEnvironment.js';

const host = document.querySelector('[data-watch]');
const canvas = host?.querySelector('canvas');
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');

/* ---------- Dimensions (≈ millimètres, boîtier 45 mm) ---------- */
const W = 36, H = 43, R = 10, D = 8.6, BEVEL = 1.9;
const FRONT_Z = D / 2 + BEVEL;
const PRIVACY_START = 18, PRIVACY_END = 32; // degrés

const roundedRect = (w, h, r) => {
  const s = new THREE.Shape(), x = -w / 2, y = -h / 2;
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r); s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y);
  return s;
};

/* Normalise les UV d'une ShapeGeometry sur 0..1 */
const fitUv = geo => {
  geo.computeBoundingBox();
  const { min, max } = geo.boundingBox, pos = geo.attributes.position, uv = geo.attributes.uv;
  for (let i = 0; i < pos.count; i++) {
    uv.setXY(i, (pos.getX(i) - min.x) / (max.x - min.x), (pos.getY(i) - min.y) / (max.y - min.y));
  }
  uv.needsUpdate = true;
  return geo;
};

/* Balaye une section « superellipse » le long d'une courbe du plan YZ (le bracelet) */
const sweep = (curve, width, thick, steps = 220, ring = 28) => {
  const pos = [], idx = [];
  const X = new THREE.Vector3(1, 0, 0);
  const section = [];
  for (let j = 0; j < ring; j++) {
    const a = (j / ring) * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
    section.push([Math.sign(c) * Math.abs(c) ** .35 * width / 2, Math.sign(s) * Math.abs(s) ** .35 * thick / 2]);
  }
  for (let i = 0; i <= steps; i++) {
    const t = i / steps, p = curve.getPointAt(t), T = curve.getTangentAt(t);
    const N = new THREE.Vector3().crossVectors(T, X).normalize();
    for (const [x, n] of section) pos.push(p.x + x, p.y + N.y * n, p.z + N.z * n);
  }
  for (let i = 0; i < steps; i++) for (let j = 0; j < ring; j++) {
    const a = i * ring + j, b = i * ring + (j + 1) % ring, c = a + ring, d = b + ring;
    idx.push(a, c, b, b, c, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
};

/* ---------- Contenu de l'écran (canvas 2D → texture) ---------- */
const screenCanvas = document.createElement('canvas');
screenCanvas.width = 600; screenCanvas.height = 716;
const drawScreen = () => {
  const c = screenCanvas.getContext('2d'), w = screenCanvas.width, h = screenCanvas.height;
  c.fillStyle = '#000'; c.fillRect(0, 0, w, h);
  c.fillStyle = '#fff'; c.textAlign = 'center'; c.textBaseline = 'alphabetic';
  /* taille ajustée pour tenir dans 76 % de la largeur, quelle que soit la police chargée */
  let size = 190;
  c.font = `700 ${size}px "Space Grotesk", system-ui, sans-serif`;
  size = Math.min(size, size * (w * .76) / c.measureText('10:09').width);
  c.font = `700 ${size}px "Space Grotesk", system-ui, sans-serif`;
  c.fillText('10:09', w / 2, 320);
  const bx = 52, by = 408, bw = w - 104, bh = 150, br = 44;
  const g = c.createLinearGradient(bx, by, bx + bw, by + bh);
  g.addColorStop(0, '#2F5EFF'); g.addColorStop(1, '#7A6CFF');
  c.fillStyle = g; c.beginPath(); c.roundRect(bx, by, bw, bh, br); c.fill();
  c.fillStyle = '#fff'; c.textAlign = 'left';
  c.font = '600 44px Manrope, system-ui, sans-serif'; c.fillText('Léa', bx + 32, by + 62);
  c.font = '400 40px Manrope, system-ui, sans-serif'; c.fillText('On se voit à 19h ?', bx + 32, by + 116);
};

function init() {
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'low-power' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), .04).texture;
  scene.add(new THREE.HemisphereLight(0xffffff, 0x3548ff, .7));
  const key = new THREE.DirectionalLight(0xffffff, 1.4);
  key.position.set(-40, 60, 80);
  scene.add(key);

  const camera = new THREE.PerspectiveCamera(26, 1, 10, 600);
  camera.position.set(0, 0, 190);

  /* Matériaux */
  const aluminium = new THREE.MeshPhysicalMaterial({ color: 0xe4e7ec, metalness: 1, roughness: .24, clearcoat: .35, clearcoatRoughness: .2 });
  const silicone = new THREE.MeshPhysicalMaterial({ color: 0xb9c2d3, metalness: 0, roughness: .72, sheen: .35, sheenColor: 0xe8eeff, sheenRoughness: .7, envMapIntensity: .7 });
  const darkGlass = new THREE.MeshPhysicalMaterial({ color: 0x020305, metalness: 0, roughness: .5, envMapIntensity: .3 });

  drawScreen();
  const screenTex = new THREE.CanvasTexture(screenCanvas);
  screenTex.colorSpace = THREE.SRGBColorSpace;
  screenTex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  document.fonts?.ready.then(() => { drawScreen(); screenTex.needsUpdate = true; render(); });

  const screenMat = new THREE.ShaderMaterial({
    uniforms: { map: { value: screenTex }, uStart: { value: PRIVACY_START }, uEnd: { value: PRIVACY_END } },
    vertexShader: /* glsl */`
      varying vec2 vUv; varying vec3 vN; varying vec3 vP;
      void main() {
        vUv = uv;
        vN = normalize(mat3(modelMatrix) * normal);
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vP = wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: /* glsl */`
      uniform sampler2D map; uniform float uStart; uniform float uEnd;
      varying vec2 vUv; varying vec3 vN; varying vec3 vP;
      void main() {
        float c = clamp(dot(normalize(vN), normalize(cameraPosition - vP)), 0.0, 1.0);
        float vis = 1.0 - smoothstep(uStart, uEnd, degrees(acos(c)));
        vec3 col = texture2D(map, vUv).rgb * vis * vis;
        gl_FragColor = vec4(col, 1.0);
        #include <colorspace_fragment>
      }`,
  });
  /* Reflets du verre : couche additive qui ne rend que la réflexion spéculaire */
  const glassMat = new THREE.MeshPhysicalMaterial({
    color: 0x000000, metalness: 0, roughness: .06,
    envMapIntensity: .9, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
  });

  /* ---------- Modèle ---------- */
  const model = new THREE.Group();

  const caseGeo = new THREE.ExtrudeGeometry(roundedRect(W, H, R), {
    depth: D, bevelEnabled: true, bevelThickness: BEVEL, bevelSize: BEVEL, bevelSegments: 12, curveSegments: 48,
  });
  caseGeo.translate(0, 0, -D / 2);
  model.add(new THREE.Mesh(caseGeo, aluminium));

  const face = new THREE.Mesh(new THREE.ShapeGeometry(roundedRect(W + .6, H + .6, R + .3), 48), darkGlass);
  face.position.z = FRONT_Z + .02;
  model.add(face);
  const screen = new THREE.Mesh(fitUv(new THREE.ShapeGeometry(roundedRect(W - 3.2, H - 3.4, R - 1.6), 48)), screenMat);
  screen.position.z = FRONT_Z + .06;
  model.add(screen);
  const glass = new THREE.Mesh(new THREE.ShapeGeometry(roundedRect(W + .6, H + .6, R + .3), 48), glassMat);
  glass.position.z = FRONT_Z + .12;
  model.add(glass);

  /* Couronne crantée + bouton latéral */
  const crownGeo = new THREE.CylinderGeometry(3.4, 3.4, 3.4, 96, 1);
  const cp = crownGeo.attributes.position;
  for (let i = 0; i < cp.count; i++) {
    const x = cp.getX(i), z = cp.getZ(i), r = Math.hypot(x, z);
    if (r > 3) { const k = 1 + .045 * Math.sin(Math.atan2(z, x) * 44); cp.setX(i, x * k); cp.setZ(i, z * k); }
  }
  crownGeo.computeVertexNormals();
  crownGeo.rotateZ(Math.PI / 2);
  const crown = new THREE.Mesh(crownGeo, aluminium);
  crown.position.set(W / 2 + BEVEL + 2.4, 7, 0);
  model.add(crown);
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(1.9, 1.9, 2.4, 32).rotateZ(Math.PI / 2), aluminium);
  neck.position.set(W / 2 + BEVEL + .4, 7, 0);
  model.add(neck);
  const button = new THREE.Mesh(new THREE.CapsuleGeometry(1.3, 9, 8, 24), aluminium);
  button.scale.set(1, 1, .8);
  button.position.set(W / 2 + BEVEL - .2, -7.5, 0);
  model.add(button);

  /* Bracelet sport : une boucle qui passe derrière (le poignet) */
  const loop = new THREE.CatmullRomCurve3([
    [0, 16, -1.5], [0, 24, -2.5], [0, 30.5, -6], [0, 35, -14], [0, 36.5, -25], [0, 33.5, -37],
    [0, 25, -46.5], [0, 12, -52], [0, -2, -53.5], [0, -16, -51], [0, -27, -44], [0, -34, -33],
    [0, -36, -21], [0, -33, -10], [0, -26, -3.5], [0, -16, -1.5],
  ].map(p => new THREE.Vector3(...p)), false, 'centripetal');
  model.add(new THREE.Mesh(sweep(loop, 23, 3.4), silicone));
  /* Tenon métallique à l'arrière du bracelet */
  const tStud = .57, sp = loop.getPointAt(tStud), st = loop.getTangentAt(tStud);
  const out = new THREE.Vector3().crossVectors(st, new THREE.Vector3(1, 0, 0)).normalize();
  if (out.dot(new THREE.Vector3(0, -sp.y, -26 - sp.z)) > 0) out.negate();
  const stud = new THREE.Mesh(new THREE.CylinderGeometry(3.1, 3.3, 1.3, 48), aluminium);
  stud.position.copy(sp).addScaledVector(out, 2.1);
  stud.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), out);
  model.add(stud);

  /* Pivot au milieu de la boucle : de trois quarts, le boîtier part à gauche et le bracelet à droite */
  model.position.z = 16;
  const pivot = new THREE.Group();
  pivot.add(model);
  scene.add(pivot);

  /* ---------- Rendu ---------- */
  let target = +host.dataset.deg || 0, current = target, visible = true, raf = 0;
  const resize = () => {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    /* recule la caméra sur les écrans étroits pour garder le bracelet dans le cadre */
    camera.position.z = 190 * Math.max(1, .92 / camera.aspect);
    camera.updateProjectionMatrix();
    render();
  };
  function render() {
    const a = THREE.MathUtils.degToRad(current), k = current / 64;
    pivot.rotation.set(THREE.MathUtils.lerp(.03, .2, k), -a, 0);
    renderer.render(scene, camera);
  }
  const loopFrame = t => {
    raf = 0;
    current += (target - current) * .14;
    if (!reduceMotion.matches) model.position.y = Math.sin(t / 1400) * .9;
    render();
    const settling = Math.abs(target - current) > .02;
    if (visible && (settling || !reduceMotion.matches)) raf = requestAnimationFrame(loopFrame);
  };
  const wake = () => { if (!raf && visible) raf = requestAnimationFrame(loopFrame); };

  host.addEventListener('watchangle', e => { target = e.detail; wake(); });
  new ResizeObserver(resize).observe(canvas);
  new IntersectionObserver(([e]) => { visible = e.isIntersecting; wake(); }).observe(host);
  resize();
  host.classList.add('is-ready');
  wake();
}

if (host && canvas) {
  try { init(); } catch (err) { console.warn('Guardess 3D indisponible, image de repli conservée.', err); }
}
