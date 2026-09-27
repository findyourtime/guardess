/* Guardess — interactions : navigation, images optionnelles, 3D pilotée par le scroll */
(() => {
  const root = document.documentElement;
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const pinned = matchMedia('(min-width: 880px) and (min-height: 640px)');
  const finePointer = matchMedia('(hover: hover) and (pointer: fine)');

  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const smooth = (a, b, v) => { const t = clamp((v - a) / (b - a)); return t * t * (3 - 2 * t); };
  /* 0 quand l'élément entre par le bas de l'écran, 1 quand il sort par le haut */
  const viewProgress = (el, vh) => { const r = el.getBoundingClientRect(); return clamp((vh - r.top) / (vh + r.height)); };

  /* ---------- Année ---------- */
  document.querySelectorAll('[data-year]').forEach(el => { el.textContent = new Date().getFullYear(); });

  /* ---------- Images optionnelles (logo, photo du pack) ---------- */
  const onReady = { logo: img => img.closest('.brand')?.classList.add('has-logo'),
                    photo: img => img.closest('.pack__scene')?.classList.add('has-photo') };
  document.querySelectorAll('img[data-optional]').forEach(img => {
    const ok = () => onReady[img.dataset.optional]?.(img);
    if (img.complete) { img.naturalWidth > 0 ? ok() : img.remove(); return; }
    img.addEventListener('load', ok, { once: true });
    img.addEventListener('error', () => img.remove(), { once: true });
  });

  /* ---------- Navigation mobile ---------- */
  const nav = document.querySelector('.nav');
  const toggle = document.querySelector('.nav__toggle');
  const setOpen = open => { nav.classList.toggle('is-open', open); toggle.setAttribute('aria-expanded', String(open)); };
  toggle?.addEventListener('click', () => setOpen(!nav.classList.contains('is-open')));
  nav?.querySelectorAll('.nav__links a').forEach(a => a.addEventListener('click', () => setOpen(false)));
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && nav.classList.contains('is-open')) { setOpen(false); toggle.focus(); }
  });

  /* Lien actif selon la section visible */
  const links = new Map([...document.querySelectorAll('.nav__links a[href^="#"]')].map(a => [a.getAttribute('href').slice(1), a]));
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver(entries => {
      entries.forEach(e => {
        const a = links.get(e.target.id);
        if (a) e.isIntersecting ? a.setAttribute('aria-current', 'true') : a.removeAttribute('aria-current');
      });
    }, { rootMargin: '-45% 0px -50% 0px' });
    links.forEach((_, id) => { const s = document.getElementById(id); if (s) io.observe(s); });
  }

  /* ---------- Schéma de la grille optique ---------- */
  const diagram = document.querySelector('[data-louvre-diagram]');
  const rays = diagram?.querySelector('[data-rays]');
  const input = diagram?.querySelector('[data-louvre-input]');
  const out = diagram?.querySelector('[data-louvre-out]');
  const status = diagram?.querySelector('[data-louvre-status]');
  const SVG = 'http://www.w3.org/2000/svg';
  const LOUVRE_TOP = 112, LOUVRE_BOTTOM = 192, SKY = 8;
  const GAPS = [[72, 122], [128, 178], [184, 234], [240, 290]];
  let userDriven = false;

  const line = (x1, y1, x2, y2, cls) => {
    const l = document.createElementNS(SVG, 'line');
    l.setAttribute('x1', x1); l.setAttribute('y1', y1); l.setAttribute('x2', x2); l.setAttribute('y2', y2);
    if (cls) l.setAttribute('class', cls);
    return l;
  };
  const drawRays = deg => {
    if (!rays) return;
    const tan = Math.tan(deg * Math.PI / 180);
    const h = LOUVRE_BOTTOM - LOUVRE_TOP;
    let blocked = false;
    rays.replaceChildren();
    GAPS.forEach(([left, right]) => {
      const x0 = left + 4;
      const climb = tan > 0 ? (right - x0) / tan : Infinity;
      if (climb >= h) {
        rays.append(line(x0, LOUVRE_BOTTOM, x0 + (LOUVRE_BOTTOM - SKY) * tan, SKY));
      } else {
        blocked = true;
        const y = LOUVRE_BOTTOM - climb;
        rays.append(line(x0, LOUVRE_BOTTOM, right, y, 'is-blocked'));
        const dot = document.createElementNS(SVG, 'circle');
        dot.setAttribute('cx', right); dot.setAttribute('cy', y); dot.setAttribute('r', 4);
        rays.append(dot);
      }
    });
    if (out) out.textContent = `${Math.round(deg)}°`;
    if (status) { status.textContent = blocked ? 'Bloqué : écran noir' : 'Visible'; status.classList.toggle('is-blocked', blocked); }
  };
  if (input) {
    input.addEventListener('input', () => { userDriven = true; drawRays(+input.value); });
    drawRays(+input.value);
  }

  /* ---------- Montre du hero ---------- */
  const hero = document.querySelector('[data-hero]');
  const watch = document.querySelector('[data-watch]');
  const panel = document.querySelector('.hero__panel');
  const angleEl = document.querySelector('[data-angle]');
  const angleLabel = document.querySelector('[data-angle-label]');
  const MAX_DEG = 66;
  const setWatch = deg => {
    if (!watch) return;
    /* le modèle 3D (watch3d.js) écoute cet événement */
    watch.dataset.deg = deg.toFixed(2);
    watch.dispatchEvent(new CustomEvent('watchangle', { detail: deg }));
    if (angleEl) angleEl.textContent = `${Math.round(deg)}°`;
    if (angleLabel) angleLabel.textContent = deg < 18 ? 'De face · net' : deg < 34 ? 'Ça s\u2019assombrit…' : 'De côté · écran noir';
  };

  /* ---------- Vue éclatée du pack ---------- */
  const explodeScene = document.querySelector('[data-explode]');
  const explode = explodeScene?.querySelector('.explode');

  /* ---------- Entrées inclinées ---------- */
  const tilts = [...document.querySelectorAll('.tilt')];

  const frame = () => {
    ticking = false;
    const vh = innerHeight;
    if (hero && watch) {
      let deg;
      if (pinned.matches) {
        const r = hero.getBoundingClientRect();
        const p = clamp(-r.top / (r.height - vh));
        const k = smooth(.06, .8, p);
        deg = lerp(0, MAX_DEG, k);
      } else {
        /* le centre du panneau passe de 72 % à 28 % de la hauteur d'écran */
        const r = panel.getBoundingClientRect();
        const k = smooth(.72, .28, (r.top + r.height / 2) / vh);
        deg = lerp(0, MAX_DEG, k);
      }
      setWatch(deg);
    }
    if (explode) {
      const p = viewProgress(explodeScene, vh);
      explode.style.setProperty('--e', smooth(.2, .55, p).toFixed(3));
      explode.style.transform = `rotateX(${lerp(62, 52, p).toFixed(2)}deg) rotateZ(${lerp(-40, -26, p).toFixed(2)}deg) translateZ(-20px)`;
    }
    if (diagram && input && !userDriven) {
      const deg = Math.round(lerp(0, 60, smooth(.3, .62, viewProgress(diagram, vh))));
      if (+input.value !== deg) { input.value = deg; drawRays(deg); }
    }
    for (const el of tilts) {
      const top = el.getBoundingClientRect().top;
      const t = clamp((top - vh * .78) / (vh * .3));
      el.style.setProperty('--t', t.toFixed(3));
      /* au repos, on retire la transformation 3D : le verre de la nav peut alors flouter la carte */
      el.classList.toggle('is-rest', t === 0);
    }
  };
  let ticking = false;
  const request = () => { if (!ticking) { ticking = true; requestAnimationFrame(frame); } };

  const start = () => {
    if (reduceMotion.matches) {
      removeEventListener('scroll', request);
      removeEventListener('resize', request);
      tilts.forEach(el => el.style.removeProperty('--t'));
      explode?.style.setProperty('--e', '.55');
      if (explode) explode.style.transform = '';
      setWatch(0);
      return;
    }
    addEventListener('scroll', request, { passive: true });
    addEventListener('resize', request);
    request();
  };
  reduceMotion.addEventListener?.('change', start);
  pinned.addEventListener?.('change', request);
  start();

  /* ---------- Inclinaison au pointeur + reflet qui suit ---------- */
  if (finePointer.matches && !reduceMotion.matches) {
    document.querySelectorAll('[data-pointer-tilt]').forEach(el => {
      el.addEventListener('pointermove', e => {
        const r = el.getBoundingClientRect();
        const x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
        el.classList.add('is-pointer');
        el.style.setProperty('--pry', `${((x - .5) * 10).toFixed(2)}deg`);
        el.style.setProperty('--prx', `${((.5 - y) * 10).toFixed(2)}deg`);
        el.style.setProperty('--mx', `${(x * 100).toFixed(1)}%`);
        el.style.setProperty('--my', `${(y * 100).toFixed(1)}%`);
      });
      el.addEventListener('pointerleave', () => {
        el.classList.remove('is-pointer');
        ['--pry', '--prx', '--mx', '--my'].forEach(p => el.style.removeProperty(p));
      });
    });
  }
})();
