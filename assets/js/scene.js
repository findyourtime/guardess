/* ============================================================
   Guardess · scène 3D (three.js r170)
   Apple Watch 45 mm (Series 7 à 9) et coque Guardess : verre de
   confidentialité et bumper rigide d'une seule pièce.
   Unités : millimètres. Origine au centre du boîtier, +z vers l'écran.
   ============================================================ */
import * as THREE from '../vendor/three/three.module.min.js';

const D2R = Math.PI / 180;
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;

/* ---------- Dimensions réelles (boîtier 45 mm : 45 × 38 × 10,7) ---------- */
export const A = 19, B = 22.5;          // demi-largeur, demi-hauteur au plus large
const N_SQ = 4.6;                        // exposant du squircle (coins continus)
const Z_FRONT = 3.85;                    // arête avant du boîtier (départ du verre)
const Z_BACK = -4.25;                    // arête arrière (départ du fond)
const DOME = 1.35;                       // bombé du verre de la montre
const Z_SCREEN = 4.3;
const GAP = 0.12, WALL = 1.0;            // jeu et épaisseur du bumper
const Z_WRAP = -1.6;                     // le bumper enveloppe le boîtier jusque-là
const Z_GLASS = 5.3, GLASS_T = 0.34;     // verre de confidentialité de la coque
const CROWN = { r: 3.1, len: 1.7, y: 7.4, z: 0 };
export const MODEL_H = 82;               // hauteur cadrée (bracelet coupé compris)

/* Contour superellipse rééchantillonné à pas constant, avec normales sortantes */
function contour(a, b, count = 256, n = N_SQ) {
  const M = 4096, dense = [];
  for (let i = 0; i < M; i++) {
    const t = i / M * Math.PI * 2, c = Math.cos(t), s = Math.sin(t);
    dense.push([a * Math.sign(c) * Math.abs(c) ** (2 / n), b * Math.sign(s) * Math.abs(s) ** (2 / n)]);
  }
  const len = [0];
  for (let i = 1; i <= M; i++) { const p = dense[i % M], q = dense[i - 1]; len.push(len[i - 1] + Math.hypot(p[0] - q[0], p[1] - q[1])); }
  const pts = [];
  for (let k = 0, j = 0; k < count; k++) {
    const target = k / count * len[M];
    while (len[j + 1] < target) j++;
    const f = (target - len[j]) / (len[j + 1] - len[j]), p = dense[j], q = dense[(j + 1) % M];
    pts.push([p[0] + (q[0] - p[0]) * f, p[1] + (q[1] - p[1]) * f]);
  }
  return pts.map((p, k) => {
    const u = pts[(k + count - 1) % count], v = pts[(k + 1) % count];
    const tx = v[0] - u[0], ty = v[1] - u[1], l = Math.hypot(tx, ty);
    return { x: p[0], y: p[1], nx: ty / l, ny: -tx / l };
  });
}

/* Balayage d'un profil (u = décalage le long de la normale, z) tout autour du contour */
function sweepRing(ring, profileAt, { closed = false, outward } = {}) {
  const P = profileAt(0).length, K = ring.length, pos = [], idx = [];
  for (let k = 0; k < K; k++) {
    const r = ring[k], prof = profileAt(k);
    for (const [u, z] of prof) pos.push(r.x + r.nx * u, r.y + r.ny * u, z);
  }
  const segs = closed ? P : P - 1;
  for (let k = 0; k < K; k++) {
    const k2 = (k + 1) % K;
    for (let j = 0; j < segs; j++) {
      const j2 = (j + 1) % P, a = k * P + j, b = k2 * P + j, c = k2 * P + j2, d = k * P + j2;
      idx.push(a, d, b, b, d, c);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx); g.computeVertexNormals();
  /* orientation : la normale du point témoin doit regarder vers l'extérieur */
  if (outward) {
    const [vi, dir] = outward(P), n = g.attributes.normal;
    if (n.getX(vi) * dir[0] + n.getY(vi) * dir[1] + n.getZ(vi) * dir[2] < 0) {
      const ix = g.index.array;
      for (let i = 0; i < ix.length; i += 3) { const t = ix[i + 1]; ix[i + 1] = ix[i + 2]; ix[i + 2] = t; }
      g.computeVertexNormals();
    }
  }
  return g;
}

/* Profil latéral du boîtier : galet arrondi de l'arête avant (verre) à l'arête arrière (fond) */
const CASE_PROFILE = (() => {
  const ctrl = [[1.55, Z_FRONT], [0.78, 3.56], [0.32, 3.08], [0.09, 2.38], [0, 1.4], [0.04, 0.2], [0.2, -1.0], [0.55, -2.2], [1.1, -3.2], [1.8, -3.9], [2.55, Z_BACK]];
  const c = new THREE.CatmullRomCurve3(ctrl.map(([i, z]) => new THREE.Vector3(i, z, 0)), false, 'centripetal');
  return c.getSpacedPoints(56).map(p => [-p.x, p.y]);
})();
/* retrait du boîtier (mm vers l'intérieur) à une hauteur z donnée */
const insetAt = z => {
  const P = CASE_PROFILE;
  if (z >= P[0][1]) return -P[0][0];
  for (let i = 1; i < P.length; i++) {
    if (z >= P[i][1]) { const f = (z - P[i][1]) / (P[i - 1][1] - P[i][1]); return -lerp(P[i][0], P[i - 1][0], f); }
  }
  return -P[P.length - 1][0];
};

/* Verre bombé : surface paramétrée sur le contour de l'arête avant */
function domeGeometry(edge, zEdge, height, k = 6, rings = 40) {
  const pos = [0, 0, zEdge + height], idx = [], K = edge.length;
  for (let j = 1; j <= rings; j++) {
    const rho = Math.sin(j / rings * Math.PI / 2), z = zEdge + height * (1 - rho ** k);
    for (const p of edge) pos.push(p.x * rho, p.y * rho, z);
  }
  for (let k2 = 0; k2 < K; k2++) idx.push(0, 1 + k2, 1 + (k2 + 1) % K);
  for (let j = 1; j < rings; j++) {
    for (let k2 = 0; k2 < K; k2++) {
      const a = 1 + (j - 1) * K + k2, b = 1 + (j - 1) * K + (k2 + 1) % K, c = a + K, d = b + K;
      idx.push(a, c, b, b, c, d);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}

/* miroir en z (fond de la montre) : on inverse aussi le sens des faces */
function mirrorZ(g) {
  g.scale(1, 1, -1);
  const ix = g.index.array;
  for (let i = 0; i < ix.length; i += 3) { const t = ix[i + 1]; ix[i + 1] = ix[i + 2]; ix[i + 2] = t; }
  g.computeVertexNormals(); return g;
}
const squircleShape = (a, b, seg = 200) => {
  const s = new THREE.Shape();
  contour(a, b, seg).forEach((p, i) => (i ? s.lineTo(p.x, p.y) : s.moveTo(p.x, p.y)));
  return s;
};
const planarUv = (g, w, h) => {
  const p = g.attributes.position, uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) { uv[i * 2] = p.getX(i) / w + .5; uv[i * 2 + 1] = p.getY(i) / h + .5; }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); return g;
};

/* Bracelet : section plate aux bords arrondis balayée dans le plan YZ, bouts coupés et fermés */
function bandSweep(curve, width, thick, steps = 120, ring = 40) {
  const pos = [], idx = [], X = new THREE.Vector3(1, 0, 0), sec = [];
  for (let j = 0; j < ring; j++) {
    const a = j / ring * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
    sec.push([Math.sign(c) * Math.abs(c) ** .22 * width / 2, Math.sign(s) * Math.abs(s) ** .5 * thick / 2]);
  }
  for (let i = 0; i <= steps; i++) {
    const t = i / steps, p = curve.getPointAt(t), T = curve.getTangentAt(t), N = new THREE.Vector3().crossVectors(T, X).normalize();
    /* le bracelet s'affine un peu en s'éloignant du boîtier */
    const w = 1 - .06 * t;
    for (const [x, n] of sec) pos.push(p.x + x * w, p.y + N.y * n, p.z + N.z * n);
  }
  const uv = [];
  for (let i = 0; i <= steps; i++) for (let j = 0; j < ring; j++) uv.push(j / ring, i / steps);
  for (let i = 0; i < steps; i++) for (let j = 0; j < ring; j++) { const a = i * ring + j, b = i * ring + (j + 1) % ring; idx.push(a, a + ring, b, b, a + ring, b + ring); }
  [[0, false], [steps, true]].forEach(([i, flip]) => {
    const p = curve.getPointAt(i / steps), c = pos.length / 3; pos.push(p.x, p.y, p.z); uv.push(.5, i / steps);
    for (let j = 0; j < ring; j++) { const a = i * ring + j, b = i * ring + (j + 1) % ring; flip ? idx.push(c, a, b) : idx.push(c, b, a); }
  });
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals(); return g;
}

/* ---------- Écrans : cadran, démarrage (logo), recharge ---------- */
const SHIELD = 'M124.0 1.0 L1.9 55.6 L0.9 58.4 L0.9 115.5 L2.0 119.2 L2.0 131.6 L3.0 134.2 L3.0 140.6 L8.1 165.1 L15.2 185.5 L25.2 205.5 L32.5 216.9 L48.1 236.6 L74.0 261.4 L99.4 279.6 L114.4 288.6 L125.4 293.6 L145.5 282.6 L163.9 270.4 L184.9 253.4 L202.4 235.9 L214.4 220.9 L231.4 196.0 L235.5 192.6 L236.9 180.2 L242.5 159.2 L240.6 158.0 L158.2 158.0 L155.6 159.0 L145.5 159.4 L125.6 191.9 L125.8 193.6 L187.4 193.9 L188.6 195.5 L177.5 210.9 L159.9 228.5 L141.9 242.5 L129.5 250.8 L124.1 252.6 L105.0 240.5 L93.0 231.5 L82.2 221.9 L68.4 206.9 L62.4 198.9 L52.1 182.5 L47.1 171.5 L42.0 157.1 L37.9 137.6 L37.9 132.2 L36.9 129.6 L36.9 119.2 L35.9 116.6 L36.2 80.2 L50.4 73.1 L123.2 40.9 L126.6 40.9 L212.2 78.9 L232.6 77.9 L245.8 81.8 L247.4 81.5 L248.0 79.4 L247.6 55.6 L147.5 10.2 L126.2 1.1Z';
const BAR = 'M114.1 136.9 L115.5 137.9 L209.6 137.9 L212.2 138.9 L232.6 138.9 L237.9 137.8 L247.9 119.9 L247.9 103.2 L246.4 102.0 L135.0 102.1 L130.1 108.8 L129.2 111.5 L114.5 135.0Z';
const TIP = 'M246.6 124.8 L244.5 126.0 L237.9 137.9 L232.6 139.0 L211.1 139.2 L209.0 143.2 L206.8 157.2 L207.9 157.9 L243.2 158.1 L243.9 152.2 L245.9 145.6 L246.9 135.2 L247.9 132.9 L247.9 128.0Z M248.8 102.5 L248.0 104.5 L248.0 116.4 L248.9 118.4Z';

const SCR_A = A - 3.3, SCR_B = B - 3.3;            // zone active de l'écran
const SW = 1024, SH = Math.round(SW * SCR_B / SCR_A);
const DISPLAY = '"Space Grotesk", "Helvetica Neue", Arial, sans-serif', BODY = 'Manrope, "Helvetica Neue", Arial, sans-serif', MONO = '"IBM Plex Mono", ui-monospace, Menlo, monospace';
const mkCanvas = (w = SW, h = SH) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
const faceCv = mkCanvas(), bootCv = mkCanvas(), chargeCv = mkCanvas();

function fitText(c, text, font, size, maxW) {
  c.font = `${font.replace('%', size)}`;
  const w = c.measureText(text).width;
  if (w > maxW) c.font = `${font.replace('%', size * maxW / w)}`;
}
function drawFace() {
  const c = faceCv.getContext('2d'), k = SW / 600;
  c.fillStyle = '#000'; c.fillRect(0, 0, SW, SH);
  c.textAlign = 'center'; c.textBaseline = 'alphabetic';
  c.fillStyle = '#7FA2FF'; c.font = `500 ${30 * k}px ${MONO}`; c.fillText('WED 28', SW / 2, SH * .2);
  c.fillStyle = '#fff'; fitText(c, '10:09', `700 %px ${DISPLAY}`, 196 * k, SW * .76); c.fillText('10:09', SW / 2, SH * .47);
  const bx = 52 * k, by = SH * .57, bw = SW - 104 * k, bh = 158 * k;
  const g = c.createLinearGradient(bx, by, bx + bw, by + bh); g.addColorStop(0, '#2F5EFF'); g.addColorStop(1, '#7A6CFF');
  c.fillStyle = g; c.beginPath(); c.roundRect(bx, by, bw, bh, 46 * k); c.fill();
  c.fillStyle = 'rgba(255,255,255,.22)'; c.beginPath(); c.arc(bx + 66 * k, by + bh / 2, 34 * k, 0, Math.PI * 2); c.fill();
  c.fillStyle = '#fff'; c.font = `700 ${34 * k}px ${BODY}`; c.fillText('L', bx + 66 * k, by + bh / 2 + 12 * k);
  c.textAlign = 'left';
  c.font = `700 ${40 * k}px ${BODY}`; c.fillText('Lea', bx + 118 * k, by + 66 * k);
  c.font = `500 ${38 * k}px ${BODY}`; c.fillStyle = 'rgba(255,255,255,.88)'; c.fillText('Dinner at 7?', bx + 118 * k, by + 118 * k);
  /* complications : anneaux d'activité discrets */
  c.lineCap = 'round';
  [['#2F5EFF', .72], ['#B7C6FF', .5]].forEach(([col, f], i) => {
    const r = (30 - i * 9) * k, cx = SW / 2, cy = SH * .885;
    c.strokeStyle = 'rgba(255,255,255,.12)'; c.lineWidth = 6 * k; c.beginPath(); c.arc(cx, cy, r, 0, Math.PI * 2); c.stroke();
    c.strokeStyle = col; c.beginPath(); c.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * f); c.stroke();
  });
}
function drawLogo(c, cx, cy, h, glow) {
  const s = h / 295;
  c.save(); c.translate(cx - 124.5 * s, cy - 147.5 * s); c.scale(s, s);
  if (glow) { c.shadowColor = 'rgba(47,94,255,.9)'; c.shadowBlur = glow; }
  c.fillStyle = '#F5F7FB'; c.fill(new Path2D(SHIELD), 'evenodd');
  c.fillStyle = '#2F5EFF'; c.fill(new Path2D(BAR));
  c.fillStyle = '#B7C6FF'; c.fill(new Path2D(TIP));
  c.restore();
}
function drawBoot() {
  const c = bootCv.getContext('2d');
  c.fillStyle = '#000'; c.fillRect(0, 0, SW, SH);
  const g = c.createRadialGradient(SW / 2, SH * .46, 0, SW / 2, SH * .46, SW * .55);
  g.addColorStop(0, 'rgba(47,94,255,.32)'); g.addColorStop(1, 'rgba(47,94,255,0)');
  c.fillStyle = g; c.fillRect(0, 0, SW, SH);
  drawLogo(c, SW / 2, SH * .46, SH * .36, 60);
  c.fillStyle = 'rgba(245,247,251,.9)'; c.textAlign = 'center';
  c.font = `600 ${SW * .062}px ${DISPLAY}`; c.fillText('GUARDESS', SW / 2, SH * .78);
}
function drawCharge() {
  const c = chargeCv.getContext('2d'), k = SW / 600, cx = SW / 2, cy = SH * .44, r = 170 * k;
  c.fillStyle = '#000'; c.fillRect(0, 0, SW, SH);
  c.lineCap = 'round'; c.lineWidth = 30 * k;
  c.strokeStyle = 'rgba(80,230,140,.16)'; c.beginPath(); c.arc(cx, cy, r, 0, Math.PI * 2); c.stroke();
  c.strokeStyle = '#4BE38A'; c.beginPath(); c.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * .82); c.stroke();
  c.fillStyle = '#4BE38A'; c.beginPath();
  const bolt = [[18, -78], [-46, 12], [-6, 12], [-18, 78], [46, -12], [6, -12]];
  bolt.forEach(([x, y], i) => (i ? c.lineTo(cx + x * k, cy + y * k) : c.moveTo(cx + x * k, cy + y * k))); c.closePath(); c.fill();
  c.fillStyle = '#fff'; c.textAlign = 'center'; c.font = `600 ${64 * k}px ${DISPLAY}`; c.fillText('82%', cx, SH * .86);
}
const screenTextures = [];
const redrawScreens = () => { drawFace(); drawBoot(); drawCharge(); screenTextures.forEach(t => { t.needsUpdate = true; }); };
redrawScreens();
document.fonts?.ready.then(redrawScreens);

/* Fond de la montre : cristal noir et capteurs */
function sensorTexture() {
  const S = 512, cv = mkCanvas(S, S), c = cv.getContext('2d'), m = S / 2;
  c.fillStyle = '#060708'; c.fillRect(0, 0, S, S);
  c.strokeStyle = 'rgba(255,255,255,.07)'; c.lineWidth = 2;
  [.92, .62, .3].forEach(f => { c.beginPath(); c.arc(m, m, m * f, 0, Math.PI * 2); c.stroke(); });
  for (let i = 0; i < 4; i++) {
    c.save(); c.translate(m, m); c.rotate(i * Math.PI / 2 + Math.PI / 4);
    c.fillStyle = '#121418'; c.beginPath(); c.arc(0, 0, m * .58, -.42, .42); c.arc(0, 0, m * .36, .42, -.42, true); c.closePath(); c.fill();
    c.restore();
  }
  c.fillStyle = '#0d0f12'; c.beginPath(); c.arc(m, m, m * .26, 0, Math.PI * 2); c.fill();
  [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([x, y]) => { c.fillStyle = '#1a3a22'; c.beginPath(); c.arc(m + x * 26, m + y * 26, 9, 0, Math.PI * 2); c.fill(); });
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t;
}

/* Bracelet coupé : il s'efface vers ses extrémités (pas de tranche visible) */
function bandFade() {
  const cv = mkCanvas(4, 256), x = cv.getContext('2d'), g = x.createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0, '#fff'); g.addColorStop(.5, '#fff'); g.addColorStop(.92, '#000'); g.addColorStop(1, '#000');
  x.fillStyle = g; x.fillRect(0, 0, 4, 256);
  const t = new THREE.CanvasTexture(cv); t.flipY = false; return t;
}

/* Ombre de contact douce */
function shadowTexture() {
  const cv = mkCanvas(256, 256), x = cv.getContext('2d'), g = x.createRadialGradient(128, 128, 0, 128, 128, 128);
  g.addColorStop(0, 'rgba(0,0,0,.6)'); g.addColorStop(.45, 'rgba(0,0,0,.24)'); g.addColorStop(1, 'rgba(0,0,0,0)');
  x.fillStyle = g; x.fillRect(0, 0, 256, 256); return new THREE.CanvasTexture(cv);
}

/* ---------- Studio : panneaux de lumière (reflets nets façon photo produit) ---------- */
function studioEnvironment(renderer) {
  const s = new THREE.Scene(); s.background = new THREE.Color(0x07090f);
  /* boîtes à lumière aux bords doux : dégradés naturels dans les reflets */
  const cv = mkCanvas(128, 128), x = cv.getContext('2d'), img = x.createImageData(128, 128);
  for (let j = 0; j < 128; j++) for (let i = 0; i < 128; i++) {
    const e = t => { const d = Math.min(t, 1 - t) / .22; return d >= 1 ? 1 : d * d * (3 - 2 * d); };
    const v = Math.round(255 * e((i + .5) / 128) * e((j + .5) / 128) * (.82 + .18 * (1 - j / 127)));
    img.data.set([v, v, v, 255], (j * 128 + i) * 4);
  }
  x.putImageData(img, 0, 0);
  const soft = new THREE.CanvasTexture(cv);
  const panel = (w, h, pos, rgb, k, look = [0, 0, 0]) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(...rgb).multiplyScalar(k), map: soft, side: THREE.DoubleSide }));
    m.position.set(...pos); m.lookAt(...look); s.add(m);
  };
  panel(13, 4.5, [0, 8.5, 2.5], [1, 1, 1], 6);              // grande boîte à lumière au-dessus
  panel(2.2, 14, [-8.5, 1, 4.5], [1, .99, .97], 4.6);       // bande gauche
  panel(2, 14, [8.5, .5, 2.5], [.92, .95, 1], 3.6);         // bande droite
  panel(2.4, 13, [-6.5, 2, -7.5], [.18, .37, 1], 4.2);      // contre-jour bleu électrique
  panel(1.6, 13, [7, 0, -6.5], [.72, .78, 1], 3.4);         // contre-jour lavande
  panel(16, 7, [0, -9, 2], [.12, .17, .42], 1.1);           // rebond du sol
  panel(5, 1.2, [0, 5.5, 10], [1, 1, 1], 1.4);              // fine bande frontale haute (liseré du verre)
  const pm = new THREE.PMREMGenerator(renderer), tex = pm.fromScene(s, .035).texture;
  pm.dispose(); soft.dispose(); s.traverse(o => { o.geometry?.dispose(); o.material?.dispose(); });
  return tex;
}

/* ---------- Matériaux ---------- */
/* Verre : reflets physiques ajoutés, et assombrissement selon l'angle (filtre de confidentialité) */
function glassMaterial(uniforms, { privacy }) {
  const m = new THREE.MeshPhysicalMaterial({ color: 0x000000, metalness: 0, roughness: .035, envMapIntensity: privacy ? .3 : .55, transparent: true, depthWrite: false });
  m.blending = THREE.CustomBlending;
  m.blendSrc = THREE.OneFactor; m.blendDst = THREE.OneMinusSrcAlphaFactor;
  m.blendSrcAlpha = THREE.OneFactor; m.blendDstAlpha = THREE.OneMinusSrcAlphaFactor;
  m.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, uniforms);
    sh.fragmentShader = 'uniform float uTintBase;uniform float uTintMax;uniform float uTintA;uniform float uTintB;uniform float uPrivacyOn;\n' + sh.fragmentShader.replace('#include <opaque_fragment>', privacy
      ? '/*SCAN*/\nfloat ndv = clamp(dot(normal, geometryViewDir), 0., 1.);\nfloat ang = degrees(acos(ndv));\nfloat tint = mix(uTintBase, uTintMax, smoothstep(uTintA, uTintB, ang)) * uPrivacyOn;\ngl_FragColor = vec4(outgoingLight, tint);'
      : '/*SCAN*/\ngl_FragColor = vec4(outgoingLight, 0.);');
  };
  m.customProgramCacheKey = () => (privacy ? 'privacy-glass' : 'watch-glass');
  return m;
}
/* Ligne de balayage lumineuse (changement de finition, verrouillage) */
function addScan(m, scan) {
  const prev = m.onBeforeCompile;
  m.onBeforeCompile = (sh, r) => {
    prev?.call(m, sh, r);
    Object.assign(sh.uniforms, scan);
    sh.vertexShader = 'varying float vScanY;\n' + sh.vertexShader.replace('#include <project_vertex>', '#include <project_vertex>\nvScanY = (modelMatrix * vec4(transformed, 1.0)).y;');
    const anchor = sh.fragmentShader.includes('#include <opaque_fragment>') ? '#include <opaque_fragment>' : '/*SCAN*/';
    sh.fragmentShader = 'varying float vScanY;uniform float uScanY;uniform float uScanAmt;uniform vec3 uScanColor;\n' + sh.fragmentShader.replace(anchor, 'outgoingLight += uScanColor * uScanAmt * exp(-pow((vScanY - uScanY) / 1.6, 2.));\n' + anchor);
  };
  const key = m.customProgramCacheKey?.bind(m);
  m.customProgramCacheKey = () => (key ? key() : '') + '+scan';
  return m;
}

export const FINISHES = {
  black: { label: 'Black', swatch: '#0d0e11' },
  transparent: { label: 'Transparent', swatch: 'rgba(220,230,255,.35)' },
  starlight: { label: 'Starlight', swatch: '#e7dac6' },
  silver: { label: 'Silver', swatch: '#dfe3e8' },
};
function finishMaterial(name) {
  switch (name) {
    case 'black': return new THREE.MeshPhysicalMaterial({ color: 0x0a0b0d, metalness: 0, roughness: .16, clearcoat: 1, clearcoatRoughness: .06, envMapIntensity: 1.1 });
    case 'transparent': return new THREE.MeshPhysicalMaterial({ color: 0xffffff, metalness: 0, roughness: .05, transmission: 1, thickness: 1.1, ior: 1.58, attenuationColor: new THREE.Color(0xdfe8ff), attenuationDistance: 6, clearcoat: 1, clearcoatRoughness: .04, envMapIntensity: 1.2 });
    case 'starlight': return new THREE.MeshPhysicalMaterial({ color: 0xe9dcc9, metalness: 1, roughness: .2, clearcoat: .7, clearcoatRoughness: .08, envMapIntensity: 1.15 });
    default: return new THREE.MeshPhysicalMaterial({ color: 0xdfe3e8, metalness: 1, roughness: .13, clearcoat: .6, clearcoatRoughness: .06, envMapIntensity: 1.2 });
  }
}

/* ---------- Montre ---------- */
function buildWatch(M) {
  const g = new THREE.Group();
  const ring = contour(A, B, 288);
  /* boîtier en aluminium */
  const body = sweepRing(ring, () => CASE_PROFILE, { outward: P => [Math.floor(P * .45), [1, 0, 0]] });
  g.add(new THREE.Mesh(body, M.alu));
  /* écran : sous-couche noire, zone active, verre bombé */
  const edge = contour(A - 1.55, B - 1.55, 288);
  const under = new THREE.Mesh(new THREE.ShapeGeometry(squircleShape(A - 1.5, B - 1.5)), M.black); under.position.z = Z_SCREEN - .12; g.add(under);
  const screen = new THREE.Mesh(planarUv(new THREE.ShapeGeometry(squircleShape(SCR_A, SCR_B)), SCR_A * 2, SCR_B * 2), M.screen); screen.position.z = Z_SCREEN; g.add(screen);
  const glass = new THREE.Mesh(domeGeometry(edge, Z_FRONT, DOME), M.watchGlass); glass.renderOrder = 1; g.add(glass);
  /* fond : céramique noire légèrement bombée, dôme de capteurs au centre */
  const backG = mirrorZ(domeGeometry(contour(A - 2.55, B - 2.55, 288), -Z_BACK, .5, 4, 20));
  g.add(new THREE.Mesh(backG, M.ceramic));
  const R = 56, th = Math.asin(10 / R);
  const cap = new THREE.SphereGeometry(R, 96, 16, 0, Math.PI * 2, 0, th); cap.rotateX(-Math.PI / 2); cap.translate(0, 0, Z_BACK - .45 + R * Math.cos(th));
  planarUv(cap, 20, 20);
  g.add(new THREE.Mesh(cap, M.sensor));
  /* couronne : fine, crantage serré */
  const { r: CR, len: CL, y: CY, z: CZ } = CROWN;
  const crownG = new THREE.CylinderGeometry(CR, CR, CL, 192, 1), cp = crownG.attributes.position;
  for (let i = 0; i < cp.count; i++) { const x = cp.getX(i), z = cp.getZ(i); if (Math.hypot(x, z) > CR - .1) { const k = 1 + .018 * Math.cos(Math.atan2(z, x) * 90); cp.setX(i, x * k); cp.setZ(i, z * k); } }
  crownG.computeVertexNormals(); crownG.rotateZ(Math.PI / 2);
  const crown = new THREE.Mesh(crownG, M.alu); crown.position.set(A + .6 + CL / 2, CY, CZ); g.add(crown);
  const crownCap = new THREE.Mesh(new THREE.CylinderGeometry(CR - .5, CR - .22, .2, 96).rotateZ(Math.PI / 2), M.aluDark); crownCap.position.set(A + .6 + CL + .08, CY, CZ); g.add(crownCap);
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.6, 1.2, 48).rotateZ(Math.PI / 2), M.aluDark); neck.position.set(A, CY, CZ); g.add(neck);
  /* bouton latéral, micro, haut-parleur */
  const btn = new THREE.Mesh(new THREE.CapsuleGeometry(1.05, 8.6, 12, 40), M.alu); btn.scale.set(.72, 1, .72); btn.position.set(A - .3, -6.6, .1); g.add(btn);
  const mic = new THREE.Mesh(new THREE.CylinderGeometry(.36, .36, .8, 20).rotateZ(Math.PI / 2), M.hole); mic.position.set(A - .25, 1.4, .1); g.add(mic);
  [-4.6, 4.6].forEach(y => { const s = new THREE.Mesh(new THREE.CapsuleGeometry(.38, 6.8, 6, 16), M.hole); s.scale.z = .8; s.position.set(-A + .2, y, .15); g.add(s); });
  /* fentes des bracelets */
  [1, -1].forEach(sy => { const sl = new THREE.Mesh(new THREE.BoxGeometry(23, .5, 2.6), M.hole); sl.position.set(0, sy * (B - .45), -2.2); g.add(sl); });
  /* bracelet sport coupé : deux bouts qui partent du boîtier et s'incurvent vers l'arrière */
  const band = new THREE.Group();
  [1, -1].forEach(sy => {
    const pts = [[0, 17.5, -2.2], [0, 24.5, -2.6], [0, 30.5, -4.8], [0, 35, -9], [0, 37.6, -15]].map(([x, y, z]) => new THREE.Vector3(x, y * sy, z));
    band.add(new THREE.Mesh(bandSweep(new THREE.CatmullRomCurve3(pts), 22.4, 3.1), M.band));
  });
  g.add(band);
  return { group: g, screen, glass, band };
}

/* ---------- Coque Guardess : bumper et verre d'une seule pièce ---------- */
function buildCase(M) {
  const g = new THREE.Group();
  const ring = contour(A, B, 288);
  /* ouverture côté droit pour la couronne et le bouton (le bumper ne garde que sa lèvre avant) */
  const notch = r => {
    if (r.nx < .55) return 0;
    const lo = -12.6, hi = 11.4, w = 1.4, y = r.y;
    const s1 = clamp((y - lo) / w), s2 = clamp((hi - y) / w);
    const k = Math.min(s1, s2); return k * k * (3 - 2 * k);
  };
  const OUTER = 10, INNER = 8;
  /* paroi extérieure : presque droite devant le point le plus large, puis elle suit le galet du boîtier */
  const outerU = z => (z >= 1.4 ? GAP + WALL - .15 * ((z - 1.4) / 4) ** 2 : -insetAt(z) + GAP + WALL);
  const loop = ze => {
    const pts = [];
    pts.push([-1.12, Z_GLASS - .02], [-1.1, 5.78], [-.2, 5.8], [.62, 5.7], [.98, 5.4]);
    for (let i = 0; i < OUTER; i++) { const z = lerp(4.9, ze + .35, i / (OUTER - 1)); pts.push([outerU(z), z]); }
    pts.push([outerU(ze) - .3, ze - .05], [-insetAt(ze) + GAP + .3, ze - .05]);
    for (let i = 0; i < INNER; i++) { const z = lerp(ze + .35, Z_FRONT, i / (INNER - 1)); pts.push([-insetAt(z) + GAP, z]); }
    pts.push([-1.42, 4.35], [-1.3, Z_GLASS - .25]);
    return pts;
  };
  const profiles = ring.map(r => loop(lerp(Z_WRAP, 3.4, notch(r))));
  const shell = sweepRing(ring, k => profiles[k], { closed: true, outward: () => [Math.floor(5 + OUTER / 2), [1, 0, 0]] });
  const bumper = new THREE.Mesh(shell, M.finish.silver); g.add(bumper);
  /* verre de confidentialité trempé, bords arrondis */
  const plateG = new THREE.ExtrudeGeometry(squircleShape(A - 1.12 - .22, B - 1.12 - .22), { depth: GLASS_T - .14, bevelEnabled: true, bevelThickness: .07, bevelSize: .22, bevelSegments: 6, curveSegments: 24 });
  const plate = new THREE.Mesh(plateG, M.privacyGlass); plate.position.z = Z_GLASS + .07; plate.renderOrder = 2; g.add(plate);
  return { group: g, bumper, plate };
}

/* ---------- Chargeur magnétique ---------- */
function buildCharger(M) {
  const g = new THREE.Group();
  /* palet : face de contact en z = 0, tournée vers le fond de la montre */
  const prof = [[0, -6.7], [9, -6.7], [12.6, -6.1], [13.6, -4.9], [13.8, -2.9], [13.6, -.9], [12.8, 0], [0, 0]].map(([x, y]) => new THREE.Vector2(x, y));
  const puck = new THREE.Mesh(new THREE.LatheGeometry(prof, 96), M.charger); puck.rotation.x = Math.PI / 2; g.add(puck);
  const band = new THREE.Mesh(new THREE.CylinderGeometry(13.85, 13.85, 2.2, 96, 1, true), M.chargerRing); band.rotation.x = Math.PI / 2; band.position.z = -3.3; g.add(band);
  const cable = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([[0, -13, -3.5], [0, -20, -4], [0, -30, -7], [0, -42, -9]].map(p => new THREE.Vector3(...p))), 48, 1.7, 20), M.charger);
  g.add(cable);
  const glow = new THREE.Mesh(new THREE.RingGeometry(8, 14.6, 96), new THREE.MeshBasicMaterial({ color: 0x4be38a, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
  glow.position.z = .25; g.add(glow);
  return { group: g, glow };
}

/* ============================================================
   Scène complète
   ============================================================ */
export function createWatchScene(canvas, { pixelRatio = Math.min(devicePixelRatio || 1, 2) } = {}) {
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: false });
  renderer.setPixelRatio(pixelRatio);
  renderer.toneMapping = THREE.NeutralToneMapping; renderer.toneMappingExposure = 1.0;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  scene.environment = studioEnvironment(renderer);
  scene.add(new THREE.HemisphereLight(0xdfe6ff, 0x101a40, .35));
  const key = new THREE.DirectionalLight(0xffffff, 1.4); key.position.set(-40, 70, 80); scene.add(key);
  const rim = new THREE.DirectionalLight(0x6f8fff, 1.6); rim.position.set(60, 20, -70); scene.add(rim);

  const mk = cv => { const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = renderer.capabilities.getMaxAnisotropy(); screenTextures.push(t); return t; };
  const glassU = { uTintBase: { value: .1 }, uTintMax: { value: .96 }, uTintA: { value: 16 }, uTintB: { value: 34 }, uPrivacyOn: { value: 1 } };
  const watchGlassU = { uTintBase: { value: 0 }, uTintMax: { value: 0 }, uTintA: { value: 16 }, uTintB: { value: 34 }, uPrivacyOn: { value: 0 } };
  const scan = { uScanY: { value: 99 }, uScanAmt: { value: 0 }, uScanColor: { value: new THREE.Color(0x7fa2ff).multiplyScalar(1.6) } };
  const screenU = { tFace: { value: mk(faceCv) }, tBoot: { value: mk(bootCv) }, tCharge: { value: mk(chargeCv) }, uPower: { value: 1 }, uBoot: { value: 0 }, uCharge: { value: 0 } };
  const M = {
    alu: new THREE.MeshPhysicalMaterial({ color: 0xe3e5e9, metalness: 1, roughness: .3, clearcoat: .15, clearcoatRoughness: .25, envMapIntensity: 1.2 }),
    aluDark: new THREE.MeshPhysicalMaterial({ color: 0xbfc3ca, metalness: 1, roughness: .38, envMapIntensity: 1.05 }),
    ceramic: new THREE.MeshPhysicalMaterial({ color: 0x0b0c0f, metalness: 0, roughness: .12, clearcoat: 1, clearcoatRoughness: .05, envMapIntensity: 1 }),
    black: new THREE.MeshBasicMaterial({ color: 0x000000 }),
    hole: new THREE.MeshBasicMaterial({ color: 0x050608 }),
    sensor: new THREE.MeshPhysicalMaterial({ color: 0xffffff, map: sensorTexture(), metalness: 0, roughness: .08, clearcoat: 1, clearcoatRoughness: .04, envMapIntensity: 1 }),
    band: new THREE.MeshPhysicalMaterial({ color: 0x23272f, roughness: .55, sheen: .45, sheenRoughness: .5, sheenColor: new THREE.Color(0x9aa3b8), clearcoat: .12, clearcoatRoughness: .5, envMapIntensity: .8, transparent: true, alphaMap: bandFade() }),
    watchGlass: addScan(glassMaterial(watchGlassU, { privacy: false }), scan),
    privacyGlass: addScan(glassMaterial(glassU, { privacy: true }), scan),
    screen: new THREE.ShaderMaterial({
      uniforms: screenU,
      vertexShader: 'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
      /* écrans exclusifs : on passe par le noir, jamais deux écrans superposés */
      fragmentShader: 'uniform sampler2D tFace;uniform sampler2D tBoot;uniform sampler2D tCharge;uniform float uPower;uniform float uBoot;uniform float uCharge;varying vec2 vUv;void main(){vec3 c=texture2D(tFace,vUv).rgb*(1.-smoothstep(0.,.5,uCharge))+texture2D(tCharge,vUv).rgb*smoothstep(.5,1.,uCharge);c=c*(1.-smoothstep(0.,.5,uBoot))+texture2D(tBoot,vUv).rgb*smoothstep(.5,1.,uBoot);gl_FragColor=vec4(c*uPower,1.);\n#include <colorspace_fragment>\n}',
    }),
    charger: new THREE.MeshPhysicalMaterial({ color: 0xf2f3f5, roughness: .42, clearcoat: .3, clearcoatRoughness: .4, envMapIntensity: .9 }),
    chargerRing: new THREE.MeshPhysicalMaterial({ color: 0xd8dbe0, metalness: 1, roughness: .25, envMapIntensity: 1.1 }),
    finish: {},
  };
  for (const name of Object.keys(FINISHES)) M.finish[name] = addScan(finishMaterial(name), scan);

  /* hiérarchie : rig (pose) > montre + coque + chargeur */
  const rig = new THREE.Group(); scene.add(rig);
  const watch = buildWatch(M); rig.add(watch.group);
  const kase = buildCase(M); rig.add(kase.group);
  const charger = buildCharger(M); rig.add(charger.group);
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(72, 30), new THREE.MeshBasicMaterial({ map: shadowTexture(), transparent: true, depthWrite: false, opacity: .9 }));
  shadow.rotation.x = -Math.PI / 2; shadow.position.set(0, -44, 6); scene.add(shadow);

  const camera = new THREE.PerspectiveCamera(18, 1, 10, 4000);
  const view = { w: 0, h: 0, cx: 0, cy: 0, th: 1 };
  let finish = 'silver';

  /* pose : tous les paramètres animables de la scène */
  const pose = { rx: 0, ry: 0, rz: 0, x: 0, y: 0, explode: 0, caseTilt: 0, caseY: 0, power: 1, boot: 0, charge: 0, chargerIn: 0, shadow: 1, scanY: 99, scanAmt: 0, privacy: 1, exposure: 1 };
  function apply(p = pose) {
    rig.rotation.set(p.rx, p.ry, p.rz, 'YXZ');
    rig.position.set(p.x, p.y, 0);
    const e = p.explode;
    kase.group.position.set(0, e * 10 + p.caseY, e * 38);
    kase.group.rotation.set(-e * .12 - p.caseTilt, e * .2, 0);
    screenU.uPower.value = p.power; screenU.uBoot.value = p.boot; screenU.uCharge.value = p.charge;
    const ci = p.chargerIn;
    charger.group.visible = ci > .001;
    charger.group.position.set(0, 0, Z_BACK - 1.4 - (1 - ci) * 46);
    charger.glow.material.opacity = clamp(p.charge * 1.4) * .55;
    shadow.material.opacity = .9 * p.shadow;
    shadow.position.x = p.x;
    scan.uScanY.value = p.scanY; scan.uScanAmt.value = p.scanAmt;
    glassU.uPrivacyOn.value = p.privacy;
    renderer.toneMappingExposure = p.exposure;
  }
  /* cadrage : le centre du boîtier tombe en (cx, cy) et MODEL_H mm occupent th pixels */
  function setView(w, h, cx, cy, th) {
    if (w !== view.w || h !== view.h) { renderer.setSize(w, h, false); view.w = w; view.h = h; }
    view.cx = cx; view.cy = cy; view.th = Math.max(40, th);
    const dist = MODEL_H * (h / view.th) / (2 * Math.tan(camera.fov / 2 * D2R));
    camera.aspect = w / h; camera.position.set(0, 0, dist); camera.lookAt(0, 0, 0);
    camera.setViewOffset(w, h, w / 2 - cx, h / 2 - cy, w, h);
    camera.near = Math.max(1, dist - 200); camera.far = dist + 400;
    camera.updateProjectionMatrix();
  }
  function setFinish(name) {
    if (!M.finish[name] || name === finish) return false;
    finish = name; kase.bumper.material = M.finish[name]; return true;
  }
  const v3 = new THREE.Vector3();
  /* position écran (px dans le canevas) d'un point local de la montre ou de la coque */
  function project(x, y, z, of = 'watch') {
    v3.set(x, y, z); (of === 'case' ? kase.group : watch.group).localToWorld(v3); v3.project(camera);
    return [(v3.x * .5 + .5) * view.w, (-v3.y * .5 + .5) * view.h, v3.z];
  }
  const render = () => renderer.render(scene, camera);
  /* compilation des shaders sans bloquer la page (KHR_parallel_shader_compile quand il existe) */
  const compile = () => (renderer.compileAsync ? renderer.compileAsync(scene, camera) : Promise.resolve(renderer.compile(scene, camera)));
  /* les autres finitions et le chargeur, compilés à l'avance pour éviter un à-coup au premier changement */
  async function warm() {
    for (const name of Object.keys(M.finish)) {
      if (name === finish) continue;
      const keep = kase.bumper.material, vis = charger.group.visible;
      kase.bumper.material = M.finish[name]; charger.group.visible = true;
      try { await compile(); } finally { kase.bumper.material = keep; charger.group.visible = vis; }
    }
  }
  return { renderer, scene, camera, pose, apply, setView, setFinish, get finish() { return finish; }, project, render, compile, warm, redrawScreens };
}
