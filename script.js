/* ==========================================================================
   MISIÓN KSL-01 · v10  —  KSL Arte y Diseño Gráfico S.A.S.
   Motor reescrito para 60 FPS estables:
     · Timestep fijo (60 Hz) + interpolación de render.
     · Sprites pre-renderizados (cero gradientes / shadowBlur en el frame loop).
     · Culling de cámara: solo se dibuja lo que entra en pantalla.
     · Calidad adaptativa automática (Alta / Media / Básica).
     · Recorrido de 37.000 px con 10 sectores.
   ========================================================================== */
'use strict';

/* ---------------------------------------------------------------- 1. CONFIG */

const VW = 1280;              // ancho lógico del mundo visible
const VH = 720;               // alto lógico
const LEVEL_W = 37000;        // recorrido total
const META_MONEDAS = 80;      // monedas necesarias para reclamar el premio
const VIDAS_INICIALES = 10;
const VIDAS_MAX = 10;
const ESCUDO_MAX = 3;
const PREMIO_CHECKPOINT = 5;
const GRAVITY = 0.36;
const THRUST = -0.66;
const STEP = 1000 / 60;       // paso de física fijo
const HIT_COOLDOWN = 78;      // frames de invulnerabilidad (~1.3 s)

const PORTAL = { x: LEVEL_W - 420, y: 288, w: 152, h: 268 };

const PALETA = {
  azul: '#0D2E8B', verde: '#0A8F43', oro: '#F2C10A',
  rojo: '#E01818', plata: '#D9D9D9', noche: '#020617'
};

const SECTORES = [
  { at: 0,     nombre: 'Base KSL',           tinte: [13, 46, 139, 0.00] },
  { at: 4200,  nombre: 'Nebulosa Azul',      tinte: [30, 64, 175, 0.10] },
  { at: 8200,  nombre: 'Cinturón KSL',       tinte: [10, 143, 67, 0.09] },
  { at: 12200, nombre: 'Anillos Verdes',     tinte: [13, 148, 136, 0.10] },
  { at: 16000, nombre: 'Zona Roja',          tinte: [190, 24, 24, 0.11] },
  { at: 20000, nombre: 'Campo de Asteroides',tinte: [71, 85, 105, 0.12] },
  { at: 24000, nombre: 'Ruta Dorada',        tinte: [242, 193, 10, 0.09] },
  { at: 28000, nombre: 'Vía Plateada',       tinte: [148, 163, 184, 0.10] },
  { at: 31800, nombre: 'Umbral KSL',         tinte: [88, 28, 135, 0.12] },
  { at: 35000, nombre: 'Portal Premio',      tinte: [242, 193, 10, 0.12] }
];

/* ------------------------------------------------------------------ 2. DOM */

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d', { alpha: false });

const el = (id) => document.getElementById(id);
const startScreen = el('startScreen');
const deathScreen = el('deathScreen');
const winScreen = el('winScreen');
const coinsEl = el('coins');
const livesEl = el('lives');
const shieldEl = el('shield');
const sectorEl = el('sector');
const statusEl = el('status');
const recordEl = el('record');
const deathCoinsEl = el('deathCoins');
const deathSectorEl = el('deathSector');
const winCoinsEl = el('winCoins');
const winTimeEl = el('winTime');
const winRecordEl = el('winRecord');
const loginLink = el('loginLink');
const pauseBadge = el('pauseBadge');
const fpsEl = el('fps');
const qualityBtn = el('qualityBtn');
const soundBtn = el('soundBtn');
const pauseBtn = el('pauseBtn');

/* Cambia esta URL cuando tengas la página real de loggeo. */
const paginaDeLoggeo = 'https://wa.me/573142347047?text=Hola,%20soy%20ganador%20de%20la%20Misi%C3%B3n%20KSL-01.%20Quiero%20reclamar%20mi%20premio%20de%20KSL%20Arte%20y%20Dise%C3%B1o%20Gr%C3%A1fico%20S.A.S.';
if (loginLink) loginLink.href = paginaDeLoggeo;

/* Compatibilidad: roundRect no existe en Safari antiguo. */
if (!CanvasRenderingContext2D.prototype.roundRect) {
  CanvasRenderingContext2D.prototype.roundRect = function (x, y, w, h, r) {
    const rr = Math.min(typeof r === 'number' ? r : 0, w / 2, h / 2);
    this.moveTo(x + rr, y);
    this.arcTo(x + w, y, x + w, y + h, rr);
    this.arcTo(x + w, y + h, x, y + h, rr);
    this.arcTo(x, y + h, x, y, rr);
    this.arcTo(x, y, x + w, y, rr);
    this.closePath();
    return this;
  };
}

/* ------------------------------------------------------------- 3. UTILIDADES */

const TAU = Math.PI * 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function overlap(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

function circleRect(cx, cy, r, rect) {
  const tx = clamp(cx, rect.x, rect.x + rect.w);
  const ty = clamp(cy, rect.y, rect.y + rect.h);
  const dx = cx - tx, dy = cy - ty;
  return dx * dx + dy * dy <= r * r;
}

function fillRound(x, y, w, h, r) { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); ctx.fill(); }
function strokeRound(x, y, w, h, r) { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); ctx.stroke(); }

/* --------------------------------------------------------------- 4. CALIDAD */

/* tier 2 = Alta · 1 = Media · 0 = Básica.
   Se baja sola si el dispositivo no alcanza los frames. */
const QUALITY = {
  tier: 2,
  auto: true,
  escala: [0.62, 0.82, 1],
  particulasMax: [90, 190, 320],
  capasEstrellas: [1, 2, 3],
  estela: [false, true, true],
  nombres: ['Básica', 'Media', 'Alta']
};

const perf = { acumulado: 0, muestras: 0, avg: 16.7, bajadas: 0, subidas: 0, cooldown: 120 };

function aplicarCalidad() {
  resizeCanvas();
  if (qualityBtn) qualityBtn.textContent = 'Gráficos: ' + QUALITY.nombres[QUALITY.tier];
}

function medirRendimiento(dt) {
  perf.acumulado += dt;
  perf.muestras++;
  if (perf.cooldown > 0) perf.cooldown--;
  if (perf.muestras < 45) return;

  perf.avg = perf.acumulado / perf.muestras;
  perf.acumulado = 0;
  perf.muestras = 0;
  if (fpsEl) fpsEl.textContent = Math.round(1000 / Math.max(1, perf.avg)) + ' FPS';

  if (!QUALITY.auto || perf.cooldown > 0) return;

  if (perf.avg > 22 && QUALITY.tier > 0 && perf.bajadas < 3) {
    QUALITY.tier--; perf.bajadas++; perf.cooldown = 150; aplicarCalidad();
    avisar('Gráficos ajustados a ' + QUALITY.nombres[QUALITY.tier] + ' para mantener la fluidez');
  } else if (perf.avg < 13.2 && QUALITY.tier < 2 && perf.bajadas === 0 && perf.subidas < 2) {
    QUALITY.tier++; perf.subidas++; perf.cooldown = 240; aplicarCalidad();
  }
}

/* --------------------------------------------------- 5. TAMAÑO DEL LIENZO */

let escalaX = 1, escalaY = 1;

const MAX_ANCHO_LIENZO = 1700;   // 1,3x supersampling: nítido y barato

function resizeCanvas() {
  const anchoCSS = canvas.clientWidth || canvas.parentElement.clientWidth || VW;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const f = dpr * QUALITY.escala[QUALITY.tier];
  const w = clamp(Math.round(anchoCSS * f), 360, MAX_ANCHO_LIENZO);
  const h = Math.round(w * (VH / VW));
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
  escalaX = canvas.width / VW;
  escalaY = canvas.height / VH;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'low';
}

window.addEventListener('resize', resizeCanvas);
window.addEventListener('orientationchange', () => setTimeout(resizeCanvas, 220));

/* ------------------------------------------------------------- 6. SPRITES */

/* Todo lo repetitivo se dibuja UNA vez a un canvas fuera de pantalla y luego
   se pinta con drawImage. Es la clave del salto de rendimiento. */

function sprite(w, h, dibujar, escala) {
  const s = escala || 2;
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.ceil(w * s));
  c.height = Math.max(1, Math.ceil(h * s));
  const g = c.getContext('2d');
  g.scale(s, s);
  dibujar(g, w, h);
  c.anchoLog = w;
  c.altoLog = h;
  return c;
}

function blit(spr, x, y) { ctx.drawImage(spr, x, y, spr.anchoLog, spr.altoLog); }

const SPR = {};
const GRAD = {};

function construirSprites() {
  /* --- moneda KSL: 10 fotogramas de giro --- */
  SPR.moneda = [];
  for (let i = 0; i < 10; i++) {
    const t = i / 10;
    const ancho = Math.max(0.16, Math.abs(Math.cos(t * Math.PI)));
    SPR.moneda.push(sprite(44, 50, (g) => {
      const cx = 22, cy = 25, rx = 15 * ancho, ry = 20;
      g.save();
      const gr = g.createRadialGradient(cx - rx * 0.4, cy - 8, 1, cx, cy, ry);
      gr.addColorStop(0, '#fffbe6');
      gr.addColorStop(0.42, '#F2C10A');
      gr.addColorStop(1, '#8a4b06');
      g.fillStyle = gr;
      g.beginPath(); g.ellipse(cx, cy, rx, ry, 0, 0, TAU); g.fill();
      g.strokeStyle = 'rgba(255,247,176,.95)'; g.lineWidth = 2.4; g.stroke();
      if (ancho > 0.55) {
        g.fillStyle = '#0A8F43';
        g.font = '900 14px Arial';
        g.textAlign = 'center';
        g.fillText('K', cx, cy + 5);
      }
      g.strokeStyle = 'rgba(255,255,255,.55)'; g.lineWidth = 1.2;
      g.beginPath(); g.ellipse(cx, cy, rx * 0.62, ry * 0.72, 0, 0, TAU); g.stroke();
      g.restore();
    }));
  }

  /* --- contenedores KSL --- */
  const cajaColores = {
    normal: ['#0D2E8B', '#ffffff', 'BOX'],
    special: ['#F2C10A', '#111827', 'PLUS'],
    shield: ['#38bdf8', '#08213a', 'ESCUDO'],
    final: ['#0A8F43', '#ecfdf5', 'MEGA']
  };
  SPR.caja = {};
  for (const k in cajaColores) {
    const [pri, txt, etiqueta] = cajaColores[k];
    SPR.caja[k] = sprite(96, 96, (g) => {
      g.translate(12, 12);
      g.shadowColor = pri; g.shadowBlur = 16;
      const gr = g.createLinearGradient(0, 0, 72, 72);
      gr.addColorStop(0, '#f8fafc');
      gr.addColorStop(0.2, pri);
      gr.addColorStop(1, '#020617');
      g.fillStyle = gr;
      g.beginPath(); g.roundRect(0, 0, 72, 72, 16); g.fill();
      g.shadowBlur = 0;
      g.fillStyle = 'rgba(255,255,255,.20)';
      g.beginPath();
      g.moveTo(11, 9); g.lineTo(61, 9); g.lineTo(49, 27); g.lineTo(23, 27);
      g.closePath(); g.fill();
      g.strokeStyle = 'rgba(255,255,255,.82)'; g.lineWidth = 2.6;
      g.beginPath(); g.roundRect(6, 6, 60, 60, 12); g.stroke();
      g.strokeStyle = 'rgba(255,255,255,.16)'; g.lineWidth = 1;
      for (let i = 1; i < 4; i++) { g.beginPath(); g.moveTo(6, 6 + i * 15); g.lineTo(66, 6 + i * 15); g.stroke(); }
      g.fillStyle = txt; g.textAlign = 'center';
      g.font = '900 20px Arial'; g.fillText('KSL', 36, 43);
      g.font = '900 10px Arial'; g.fillText(etiqueta, 36, 57);
    });
  }
  SPR.cajaAbierta = sprite(96, 96, (g) => {
    g.translate(12, 12);
    g.globalAlpha = 0.32;
    g.fillStyle = '#1e293b';
    g.beginPath(); g.roundRect(0, 0, 72, 72, 16); g.fill();
    g.strokeStyle = 'rgba(148,163,184,.7)'; g.lineWidth = 2.4;
    g.beginPath(); g.roundRect(6, 6, 60, 60, 12); g.stroke();
    g.globalAlpha = 0.5;
    g.fillStyle = '#94a3b8'; g.textAlign = 'center';
    g.font = '900 16px Arial'; g.fillText('VACÍA', 36, 42);
  });

  /* --- enemigos --- */
  SPR.dron = sprite(74, 62, (g) => {
    g.translate(8, 8);
    g.shadowColor = '#E01818'; g.shadowBlur = 12;
    const gr = g.createLinearGradient(0, 0, 58, 46);
    gr.addColorStop(0, '#fca5a5'); gr.addColorStop(0.4, '#E01818'); gr.addColorStop(1, '#450a0a');
    g.fillStyle = gr;
    g.beginPath(); g.roundRect(0, 0, 58, 46, 13); g.fill();
    g.shadowBlur = 0;
    g.fillStyle = '#0b1220';
    g.beginPath(); g.roundRect(8, 11, 42, 15, 7); g.fill();
    g.fillStyle = '#7dd3fc';
    g.beginPath(); g.arc(18, 18, 4.4, 0, TAU); g.arc(40, 18, 4.4, 0, TAU); g.fill();
    g.fillStyle = 'rgba(255,255,255,.25)';
    g.beginPath(); g.roundRect(9, 4, 40, 5, 3); g.fill();
    g.fillStyle = '#cbd5e1';
    g.beginPath(); g.roundRect(23, 40, 12, 15, 4); g.fill();
    g.strokeStyle = 'rgba(2,6,23,.5)'; g.lineWidth = 1.4;
    g.beginPath(); g.moveTo(4, 33); g.lineTo(54, 33); g.stroke();
  });

  SPR.centinela = sprite(72, 60, (g) => {
    g.translate(9, 8);
    g.shadowColor = '#F2C10A'; g.shadowBlur = 14;
    const gr = g.createLinearGradient(0, 0, 54, 44);
    gr.addColorStop(0, '#fde68a'); gr.addColorStop(0.35, '#b45309'); gr.addColorStop(1, '#450a0a');
    g.fillStyle = gr;
    g.beginPath(); g.ellipse(27, 22, 27, 21, 0, 0, TAU); g.fill();
    g.shadowBlur = 0;
    g.fillStyle = '#0b1220';
    g.beginPath(); g.ellipse(27, 22, 16, 10, 0, 0, TAU); g.fill();
    g.fillStyle = '#F2C10A';
    g.beginPath(); g.arc(27, 22, 5.2, 0, TAU); g.fill();
    g.strokeStyle = 'rgba(242,193,10,.85)'; g.lineWidth = 2.4;
    g.beginPath(); g.ellipse(27, 22, 25, 12, 0, 0, TAU); g.stroke();
    g.fillStyle = '#94a3b8';
    g.beginPath(); g.roundRect(6, 38, 10, 8, 3); g.roundRect(38, 38, 10, 8, 3); g.fill();
  });

  /* --- asteroides (3 tamaños) --- */
  SPR.asteroide = [30, 44, 68].map((r) => sprite(r * 2 + 12, r * 2 + 12, (g) => {
    const c = r + 6;
    const gr = g.createRadialGradient(c - r * 0.35, c - r * 0.4, 3, c, c, r);
    gr.addColorStop(0, '#f1f5f9'); gr.addColorStop(0.28, '#64748b'); gr.addColorStop(1, '#111827');
    g.fillStyle = gr;
    g.beginPath();
    const lados = 11;
    for (let i = 0; i <= lados; i++) {
      const a = (i / lados) * TAU;
      const rr = r * (0.82 + ((i * 37) % 11) / 40);
      const px = c + Math.cos(a) * rr, py = c + Math.sin(a) * rr;
      i ? g.lineTo(px, py) : g.moveTo(px, py);
    }
    g.closePath(); g.fill();
    g.strokeStyle = 'rgba(226,232,240,.42)'; g.lineWidth = 2.4; g.stroke();
    g.fillStyle = 'rgba(2,6,23,.5)';
    g.beginPath(); g.arc(c + r * 0.28, c - r * 0.12, r * 0.19, 0, TAU); g.fill();
    g.beginPath(); g.arc(c - r * 0.24, c + r * 0.26, r * 0.13, 0, TAU); g.fill();
    g.beginPath(); g.arc(c + r * 0.05, c + r * 0.5, r * 0.09, 0, TAU); g.fill();
  }));

  /* --- power ups --- */
  const puDef = {
    boost: ['#F2C10A', '#fff7cc', 'T'],
    shield: ['#38bdf8', '#e0f2fe', 'S'],
    life: ['#22c55e', '#dcfce7', '+']
  };
  SPR.pu = {};
  for (const k in puDef) {
    const [color, claro, letra] = puDef[k];
    SPR.pu[k] = sprite(74, 74, (g) => {
      g.shadowColor = color; g.shadowBlur = 16;
      const gr = g.createRadialGradient(31, 29, 2, 37, 37, 24);
      gr.addColorStop(0, '#ffffff'); gr.addColorStop(0.45, color); gr.addColorStop(1, 'rgba(2,6,23,.9)');
      g.fillStyle = gr;
      g.beginPath(); g.arc(37, 37, 23, 0, TAU); g.fill();
      g.shadowBlur = 0;
      g.strokeStyle = claro; g.lineWidth = 3; g.beginPath(); g.arc(37, 37, 23, 0, TAU); g.stroke();
      g.strokeStyle = 'rgba(255,255,255,.35)'; g.lineWidth = 1.6;
      g.beginPath(); g.arc(37, 37, 30, 0, TAU); g.stroke();
      g.fillStyle = '#020617'; g.font = '900 22px Arial'; g.textAlign = 'center';
      g.fillText(letra, 37, 45);
    });
  }

  /* --- baliza de guardado --- */
  const baliza = (activa) => sprite(136, 132, (g) => {
    g.translate(10, 12);
    const w = 116, h = 112;
    g.shadowColor = activa ? '#22c55e' : '#F2C10A';
    g.shadowBlur = 16;
    const gr = g.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, activa ? '#bbf7d0' : '#fde68a');
    gr.addColorStop(0.45, activa ? '#0A8F43' : '#0D2E8B');
    gr.addColorStop(1, '#020617');
    g.fillStyle = gr;
    g.beginPath(); g.roundRect(28, 30, w - 56, h - 26, 13); g.fill();
    g.shadowBlur = 0;
    g.fillStyle = 'rgba(255,255,255,.2)';
    g.fillRect(w / 2 - 11, 38, 22, h - 46);
    g.fillStyle = activa ? '#bbf7d0' : '#fff7cc';
    g.beginPath(); g.arc(w / 2, 26, 21, 0, TAU); g.fill();
    g.fillStyle = 'rgba(2,6,23,.86)';
    g.beginPath(); g.roundRect(6, h - 40, w - 12, 32, 11); g.fill();
    g.fillStyle = activa ? '#86efac' : '#F2C10A';
    g.font = '900 14px Arial'; g.textAlign = 'center';
    g.fillText(activa ? 'GUARDADO' : 'BALIZA KSL', w / 2, h - 18);
    g.fillStyle = 'rgba(255,255,255,.22)';
    g.fillRect(16, h - 4, w - 32, 5);
  });
  SPR.cpOff = baliza(false);
  SPR.cpOn = baliza(true);

  /* --- plataformas: se pintan por tramos de 160 px --- */
  SPR.suelo = sprite(160, 110, (g) => {
    const gr = g.createLinearGradient(0, 0, 0, 110);
    gr.addColorStop(0, '#3b4d63'); gr.addColorStop(0.35, '#1f3149'); gr.addColorStop(1, '#080e1c');
    g.fillStyle = gr; g.fillRect(0, 0, 160, 110);
    g.fillStyle = '#D9D9D9'; g.fillRect(0, 0, 160, 8);
    g.fillStyle = 'rgba(96,165,250,.35)'; g.fillRect(0, 8, 160, 2);
    g.fillStyle = 'rgba(255,255,255,.07)';
    for (let i = 0; i < 3; i++) g.fillRect(14 + i * 52, 26, 34, 11);
    g.strokeStyle = 'rgba(2,6,23,.55)'; g.lineWidth = 2;
    g.beginPath(); g.moveTo(80, 12); g.lineTo(80, 108); g.stroke();
    g.fillStyle = 'rgba(242,193,10,.55)';
    g.fillRect(6, 54, 10, 4); g.fillRect(144, 54, 10, 4);
    g.fillStyle = 'rgba(255,255,255,.045)';
    for (let i = 0; i < 4; i++) g.fillRect(8 + i * 40, 74, 24, 6);
  });

  const losa = (h, franja) => sprite(160, h, (g) => {
    const gr = g.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, '#2b425e'); gr.addColorStop(1, '#0a1121');
    g.fillStyle = gr; g.fillRect(0, 0, 160, h);
    g.fillStyle = franja; g.fillRect(0, 0, 160, 6);
    g.fillStyle = 'rgba(255,255,255,.10)';
    for (let i = 0; i < 4; i++) g.fillRect(10 + i * 40, h - 10, 22, 4);
    g.strokeStyle = 'rgba(255,255,255,.08)'; g.lineWidth = 1;
    g.beginPath(); g.moveTo(0, h - 1); g.lineTo(160, h - 1); g.stroke();
  });
  SPR.losaMedia = losa(30, '#D9D9D9');
  SPR.losaAlta = losa(26, '#F2C10A');
  SPR.losaMovil = losa(26, '#38bdf8');

  /* --- nave (cuerpo horneado, la llama va en vivo) --- */
  SPR.nave = sprite(126, 116, (g) => {
    g.translate(16, 30);
    const blueWing = g.createLinearGradient(6, -20, 52, 34);
    blueWing.addColorStop(0, '#0D2E8B'); blueWing.addColorStop(0.65, '#2563eb'); blueWing.addColorStop(1, '#93c5fd');
    g.fillStyle = blueWing;
    g.beginPath(); g.moveTo(42, 12); g.lineTo(7, -24); g.lineTo(22, 21); g.lineTo(50, 25); g.closePath(); g.fill();
    const redWing = g.createLinearGradient(6, 78, 52, 28);
    redWing.addColorStop(0, '#E01818'); redWing.addColorStop(0.65, '#ef4444'); redWing.addColorStop(1, '#fecaca');
    g.fillStyle = redWing;
    g.beginPath(); g.moveTo(42, 42); g.lineTo(7, 78); g.lineTo(22, 33); g.lineTo(50, 29); g.closePath(); g.fill();
    g.fillStyle = 'rgba(0,0,0,.30)';
    g.beginPath(); g.ellipse(49, 34, 54, 22, 0, 0, TAU); g.fill();
    const hull = g.createLinearGradient(3, 0, 100, 55);
    hull.addColorStop(0, '#f8fafc'); hull.addColorStop(0.28, '#cbd5e1');
    hull.addColorStop(0.52, '#f8fafc'); hull.addColorStop(0.78, '#94a3b8'); hull.addColorStop(1, '#e5e7eb');
    g.fillStyle = hull;
    g.beginPath();
    g.moveTo(100, 27);
    g.bezierCurveTo(84, 7, 61, 0, 35, 7);
    g.bezierCurveTo(18, 11, 4, 19, -10, 27);
    g.bezierCurveTo(4, 35, 18, 43, 35, 47);
    g.bezierCurveTo(61, 54, 84, 47, 100, 27);
    g.closePath(); g.fill();
    g.strokeStyle = 'rgba(226,232,240,.95)'; g.lineWidth = 3; g.stroke();
    g.strokeStyle = 'rgba(15,23,42,.42)'; g.lineWidth = 1.3; g.stroke();
    const nose = g.createLinearGradient(66, 10, 101, 44);
    nose.addColorStop(0, '#fde047'); nose.addColorStop(0.45, '#F2C10A'); nose.addColorStop(1, '#b45309');
    g.fillStyle = nose;
    g.beginPath(); g.moveTo(100, 27); g.lineTo(65, 11);
    g.bezierCurveTo(74, 23, 74, 31, 65, 43); g.closePath(); g.fill();
    g.fillStyle = '#0D2E8B';
    g.beginPath(); g.moveTo(28, 10); g.lineTo(56, 6); g.lineTo(47, 18); g.lineTo(21, 22); g.closePath(); g.fill();
    g.fillStyle = '#E01818';
    g.beginPath(); g.moveTo(28, 44); g.lineTo(56, 48); g.lineTo(47, 36); g.lineTo(21, 32); g.closePath(); g.fill();
    g.strokeStyle = '#0A8F43'; g.lineWidth = 8; g.lineCap = 'round';
    g.beginPath(); g.moveTo(22, 38); g.bezierCurveTo(37, 7, 64, 10, 78, 27); g.stroke();
    g.strokeStyle = 'rgba(187,247,208,.85)'; g.lineWidth = 2;
    g.beginPath(); g.moveTo(24, 37); g.bezierCurveTo(39, 11, 61, 13, 75, 27); g.stroke();
    const canopy = g.createLinearGradient(45, 15, 78, 36);
    canopy.addColorStop(0, '#020617'); canopy.addColorStop(0.55, '#0f172a'); canopy.addColorStop(1, '#38bdf8');
    g.fillStyle = canopy;
    g.beginPath(); g.ellipse(64, 25, 18, 10, -0.05, 0, TAU); g.fill();
    g.strokeStyle = 'rgba(14,165,233,.9)'; g.lineWidth = 2; g.stroke();
    g.fillStyle = 'rgba(125,211,252,.9)';
    g.beginPath(); g.ellipse(69, 21, 6, 3.2, 0, 0, TAU); g.fill();
    const eng = g.createLinearGradient(-4, 18, 16, 36);
    eng.addColorStop(0, '#111827'); eng.addColorStop(0.5, '#475569'); eng.addColorStop(1, '#020617');
    g.fillStyle = eng;
    g.beginPath(); g.roundRect(-4, 18, 22, 18, 7); g.fill();
    g.strokeStyle = '#64748b'; g.lineWidth = 1.4; g.stroke();
    g.strokeStyle = 'rgba(15,23,42,.30)'; g.lineWidth = 1;
    g.beginPath();
    g.moveTo(31, 14); g.lineTo(44, 24); g.lineTo(31, 40);
    g.moveTo(51, 9); g.lineTo(60, 20);
    g.moveTo(51, 45); g.lineTo(60, 34);
    g.stroke();
    g.fillStyle = '#0A8F43'; g.font = '900 10px Arial';
    g.fillText('KSL', 34, 32);
  });
  SPR.naveOX = 16; SPR.naveOY = 30;

  /* --- partícula (punto con brillo) --- */
  SPR.punto = sprite(24, 24, (g) => {
    const gr = g.createRadialGradient(12, 12, 0, 12, 12, 12);
    gr.addColorStop(0, 'rgba(255,255,255,1)');
    gr.addColorStop(0.35, 'rgba(255,255,255,.85)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, 24, 24);
  }, 1);

  /* --- nebulosas de fondo --- */
  const nebColores = [
    'rgba(37,99,235,0.42)', 'rgba(10,143,67,0.32)', 'rgba(242,193,10,0.26)',
    'rgba(224,24,24,0.28)', 'rgba(124,58,237,0.32)', 'rgba(13,148,136,0.30)'
  ];
  SPR.nebulosa = nebColores.map((c) => sprite(360, 360, (g) => {
    const gr = g.createRadialGradient(180, 180, 6, 180, 180, 180);
    gr.addColorStop(0, c);
    gr.addColorStop(0.55, c.replace(/0\.\d+\)/, '0.12)'));
    gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, 360, 360);
    g.globalAlpha = 0.5;
    for (let i = 0; i < 5; i++) {
      const x = 70 + ((i * 71) % 200), y = 70 + ((i * 113) % 200), r = 40 + ((i * 29) % 60);
      const g2 = g.createRadialGradient(x, y, 2, x, y, r);
      g2.addColorStop(0, c); g2.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = g2; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
    }
  }, 1));

  /* --- planetas --- */
  const planetas = [
    ['#0D2E8B', '#60a5fa', 78], ['#0A8F43', '#86efac', 58], ['#E01818', '#fb7185', 88],
    ['#F2C10A', '#fde68a', 62], ['#312e81', '#a5b4fc', 72], ['#0f766e', '#5eead4', 54],
    ['#7c2d12', '#fdba74', 84], ['#4c1d95', '#c4b5fd', 66]
  ];
  SPR.planeta = planetas.map(([color, anillo, r]) => sprite(r * 3.2, r * 2.2, (g) => {
    const cx = r * 1.6, cy = r * 1.1;
    g.strokeStyle = anillo; g.lineWidth = 4; g.globalAlpha = 0.35;
    g.beginPath(); g.ellipse(cx, cy, r * 1.5, r * 0.36, -0.35, 0, TAU); g.stroke();
    g.globalAlpha = 1;
    const gr = g.createRadialGradient(cx - r * 0.38, cy - r * 0.44, 4, cx, cy, r);
    gr.addColorStop(0, 'rgba(255,255,255,.7)');
    gr.addColorStop(0.2, color);
    gr.addColorStop(0.86, color);
    gr.addColorStop(1, '#020617');
    g.fillStyle = gr;
    g.beginPath(); g.arc(cx, cy, r, 0, TAU); g.fill();
    g.globalAlpha = 0.28;
    g.fillStyle = '#020617';
    for (let i = 0; i < 3; i++) {
      g.beginPath();
      g.ellipse(cx + (i - 1) * r * 0.35, cy + (i - 1) * r * 0.3, r * 0.42, r * 0.14, 0.4, 0, TAU);
      g.fill();
    }
    g.globalAlpha = 1;
    g.strokeStyle = anillo; g.lineWidth = 4;
    g.beginPath(); g.ellipse(cx, cy, r * 1.5, r * 0.36, -0.35, Math.PI * 0.08, Math.PI * 0.98); g.stroke();
  }, 1.4));

  /* --- estaciones lejanas (silueta) --- */
  SPR.estacion = [0, 1].map((v) => sprite(300, 170, (g) => {
    g.globalAlpha = 0.5;
    g.fillStyle = '#0b1a33';
    g.strokeStyle = 'rgba(96,165,250,.5)';
    g.lineWidth = 2;
    if (v === 0) {
      g.beginPath(); g.roundRect(90, 60, 120, 40, 12); g.fill(); g.stroke();
      g.beginPath(); g.roundRect(20, 74, 70, 12, 6); g.fill(); g.stroke();
      g.beginPath(); g.roundRect(210, 74, 70, 12, 6); g.fill(); g.stroke();
      g.beginPath(); g.arc(150, 40, 26, 0, TAU); g.fill(); g.stroke();
    } else {
      g.beginPath(); g.ellipse(150, 85, 120, 30, 0, 0, TAU); g.stroke();
      g.beginPath(); g.roundRect(118, 58, 64, 54, 14); g.fill(); g.stroke();
      g.beginPath(); g.moveTo(30, 85); g.lineTo(118, 85); g.moveTo(182, 85); g.lineTo(270, 85); g.stroke();
    }
    g.globalAlpha = 0.9;
    g.fillStyle = '#F2C10A';
    for (let i = 0; i < 6; i++) g.fillRect(100 + i * 18, 76, 4, 4);
  }, 1));

  /* --- portal del premio --- */
  SPR.portalGlow = sprite(520, 520, (g) => {
    const gr = g.createRadialGradient(260, 260, 8, 260, 260, 258);
    gr.addColorStop(0, 'rgba(255,247,205,.95)');
    gr.addColorStop(0.25, 'rgba(242,193,10,.60)');
    gr.addColorStop(0.55, 'rgba(10,143,67,.32)');
    gr.addColorStop(1, 'rgba(13,46,139,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 520, 520);
  }, 1);

  /* --- capas de estrellas (parallax) --- */
  SPR.estrellas = [
    capaEstrellas(230, 1.1, 0.5, '#bfdbfe'),
    capaEstrellas(150, 1.7, 0.72, '#fde68a'),
    capaEstrellas(80, 2.5, 0.95, '#ffffff')
  ];

  /* --- gradientes cacheados (se crean una sola vez) --- */
  GRAD.cielo = ctx.createLinearGradient(0, 0, 0, VH);
  GRAD.cielo.addColorStop(0, '#00020a');
  GRAD.cielo.addColorStop(0.4, '#061029');
  GRAD.cielo.addColorStop(0.74, '#070b18');
  GRAD.cielo.addColorStop(1, '#01030c');

  GRAD.vineta = ctx.createRadialGradient(VW / 2, VH / 2, VH * 0.35, VW / 2, VH / 2, VH * 0.92);
  GRAD.vineta.addColorStop(0, 'rgba(0,0,0,0)');
  GRAD.vineta.addColorStop(1, 'rgba(0,0,0,.42)');

  GRAD.barra = ctx.createLinearGradient(26, 0, VW - 26, 0);
  GRAD.barra.addColorStop(0, '#0D2E8B');
  GRAD.barra.addColorStop(0.5, '#0A8F43');
  GRAD.barra.addColorStop(1, '#F2C10A');
}

function capaEstrellas(cantidad, maxR, alpha, tinte) {
  const c = document.createElement('canvas');
  c.width = VW; c.height = VH;
  const g = c.getContext('2d');
  const rnd = mulberry32(cantidad * 7919);
  for (let i = 0; i < cantidad; i++) {
    const x = rnd() * VW, y = rnd() * VH, r = rnd() * maxR + 0.35;
    g.globalAlpha = alpha * (0.3 + rnd() * 0.7);
    g.fillStyle = rnd() > 0.82 ? tinte : '#ffffff';
    g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
  }
  g.globalAlpha = 1;
  c.anchoLog = VW; c.altoLog = VH;
  return c;
}

/* ---------------------------------------------------------- 7. ESTADO */

const keys = { left: false, right: false, up: false };

let running = false, paused = false, won = false, listo = false;
let frames = 0, tiempoMision = 0;
let coins = 0, lives = VIDAS_INICIALES, shield = 0;
let cameraX = 0, camPrev = 0, camRender = 0;
let ultimoGolpe = -999, ultimoAviso = -999, ultimoSonidoMoneda = -999;
let flashDanio = 0, sectorActual = -1, bannerSector = 0;
let checkpoint = { x: 120, y: 300 };
let bestCoins = Number(localStorage.getItem('ksl_best_coins') || 0);

const ship = { x: 120, y: 300, px: 120, py: 300, w: 96, h: 54, vx: 0, vy: 0, maxSpeed: 7.35, tilt: 0 };

let platforms = [], movers = [], boxes = [], enemies = [], coinsMap = [];
let powerUps = [], checkpoints = [], obstacles = [];
let fondoNebulosas = [], fondoPlanetas = [], fondoEstaciones = [], polvo = [];
let particles = [], popups = [], estela = [];

/* Pool de partículas: se reutilizan objetos, cero basura para el GC. */
const POOL = [];
for (let i = 0; i < 340; i++) POOL.push({ activo: false, x: 0, y: 0, vx: 0, vy: 0, r: 2, g: 0, vida: 0, maxVida: 1, color: '#fff' });

/* ------------------------------------------------------------ 8. SONIDO */

let AC = null;
let sfxOn = localStorage.getItem('ksl_sfx') !== '0';

function pito(freq, dur, tipo, vol, desliz) {
  if (!sfxOn) return;
  try {
    if (!AC) AC = new (window.AudioContext || window.webkitAudioContext)();
    if (AC.state === 'suspended') AC.resume();
    const o = AC.createOscillator(), g = AC.createGain();
    o.type = tipo || 'square';
    o.frequency.setValueAtTime(freq, AC.currentTime);
    if (desliz) o.frequency.exponentialRampToValueAtTime(Math.max(45, freq + desliz), AC.currentTime + dur);
    g.gain.setValueAtTime(vol || 0.05, AC.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, AC.currentTime + dur);
    o.connect(g); g.connect(AC.destination);
    o.start(); o.stop(AC.currentTime + dur);
  } catch (e) { /* sin audio disponible */ }
}

function actualizarBotonSonido() {
  if (soundBtn) {
    soundBtn.textContent = sfxOn ? 'Sonido: sí' : 'Sonido: no';
    soundBtn.setAttribute('aria-pressed', String(sfxOn));
  }
}

/* -------------------------------------------------------- 9. NIVEL 37.000 px */

function buildLevel() {
  const rnd = mulberry32(0x4B534C0A);
  platforms = []; movers = []; boxes = []; enemies = []; coinsMap = [];
  powerUps = []; checkpoints = []; obstacles = [];

  /* --- suelo con huecos progresivos --- */
  const tramos = [];
  let x = 0;
  while (x < LEVEL_W - 2200) {
    const p = x / LEVEL_W;
    const w = 540 + Math.floor(rnd() * 520);
    const seg = { x, y: 610, w, h: 110, kind: 'ground' };
    platforms.push(seg); tramos.push(seg);
    let hueco = 120 + Math.floor(rnd() * 110) + Math.floor(p * 160);
    if (x > LEVEL_W - 6000) hueco = 110 + Math.floor(rnd() * 60);
    x += w + hueco;
  }
  const pista = { x: LEVEL_W - 2100, y: 610, w: 2200, h: 110, kind: 'ground' };
  platforms.push(pista); tramos.push(pista);

  /* --- plataformas móviles (se reservan primero su espacio) --- */
  x = 2500;
  while (x < LEVEL_W - 3600) {
    const m = {
      x, w: 190, h: 26, kind: 'mover',
      baseY: 344 + rnd() * 126, amp: 55 + rnd() * 75,
      vel: 0.011 + rnd() * 0.009, fase: rnd() * TAU
    };
    m.y = m.baseY;
    platforms.push(m); movers.push(m);
    x += 2000 + Math.floor(rnd() * 1200);
  }
  const zonaMovil = (px, w) => movers.some((m) => px < m.x + m.w + 210 && px + w + 210 > m.x);

  /* --- plataformas medias --- */
  const medias = [];
  x = 460;
  while (x < LEVEL_W - 1500) {
    const w = 200 + Math.floor(rnd() * 130);
    if (!zonaMovil(x, w)) {
      const p = { x, y: 396 + Math.floor(rnd() * 84), w, h: 30, kind: 'mid' };
      platforms.push(p); medias.push(p);
    }
    x += w + 450 + Math.floor(rnd() * 420);
  }

  /* --- plataformas altas (sin cerrar el pasillo vertical) --- */
  const altas = [];
  x = 1450;
  while (x < LEVEL_W - 3200) {
    const w = 170 + Math.floor(rnd() * 90);
    let px = x;
    for (let intento = 0; intento < 4; intento++) {
      const choque = medias.find((m) => px < m.x + m.w + 70 && px + w + 70 > m.x);
      if (!choque) break;
      px = choque.x + choque.w + 90;
    }
    const libre = !medias.some((m) => px < m.x + m.w + 70 && px + w + 70 > m.x) && !zonaMovil(px, w);
    if (libre && px < LEVEL_W - 3000) {
      const p = { x: px, y: 258 + Math.floor(rnd() * 70), w, h: 26, kind: 'high' };
      platforms.push(p); altas.push(p);
    }
    x = Math.max(x, px) + 900 + Math.floor(rnd() * 520);
  }

  /* --- balizas de guardado cada ~4.100 px --- */
  const totalCP = 8;
  for (let i = 1; i <= totalCP; i++) {
    const meta = Math.round((LEVEL_W / (totalCP + 1)) * i);
    let mejor = tramos[0];
    for (const s of tramos) {
      if (Math.abs(s.x + s.w / 2 - meta) < Math.abs(mejor.x + mejor.w / 2 - meta)) mejor = s;
    }
    const cx = clamp(meta, mejor.x + 60, mejor.x + mejor.w - 180);
    checkpoints.push({ x: cx, y: 498, w: 116, h: 112, active: false, label: 'CP-' + i });
  }

  /* --- contenedores KSL --- */
  const soportes = medias.concat(altas).sort((a, b) => a.x - b.x);
  let n = 0;
  for (let i = 0; i < soportes.length; i++) {
    if (i % 2 !== 0) continue;
    const p = soportes[i];
    let tipo = 'normal';
    if (n % 5 === 3) tipo = 'shield';
    else if (n % 4 === 1) tipo = 'special';
    boxes.push({ x: p.x + p.w / 2 - 36, y: p.y - 84, w: 72, h: 72, type: tipo, hit: false });
    n++;
  }
  boxes.push({ x: LEVEL_W - 1500, y: 500, w: 72, h: 72, type: 'final', hit: false });
  boxes.push({ x: LEVEL_W - 1050, y: 430, w: 72, h: 72, type: 'special', hit: false });

  /* --- potenciadores --- */
  function libreY(px, py, r) {
    let y = py;
    for (let k = 0; k < 9; k++) {
      let choca = false;
      for (const p of platforms) {
        if (p.kind === 'ground') continue;
        if (circleRect(px, y, r + 14, p)) { choca = true; break; }
      }
      if (!choca) break;
      y -= 58;
    }
    return Math.max(72, y);
  }
  for (let i = 1; i * 2500 < LEVEL_W - 1200; i++) {
    const px = i * 2500 + 120;
    const tipo = i % 2 ? 'boost' : 'shield';
    powerUps.push({ x: px, y: libreY(px, 250 + ((i * 47) % 90), 24), r: 24, type: tipo, taken: false });
  }
  for (let i = 1; i <= 8; i++) {
    const px = Math.round((LEVEL_W / 9) * i) + 400;
    powerUps.push({ x: px, y: libreY(px, 300, 24), r: 24, type: 'life', taken: false });
  }

  /* --- monedas: arcos sobre huecos, líneas sobre plataformas y ruta alta --- */
  for (let i = 0; i < tramos.length - 1; i++) {
    const fin = tramos[i].x + tramos[i].w;
    const ini = tramos[i + 1].x;
    if (ini - fin < 100) continue;
    const centro = (fin + ini) / 2;
    for (let k = -2; k <= 1; k++) {
      const cx = centro + k * 46 + 23;
      const cy = 546 - Math.cos((k + 0.5) / 2.6 * Math.PI) * 34;
      pushCoin(cx, cy);
    }
  }
  for (const p of medias) {
    for (let k = 0; k < 3; k++) pushCoin(p.x + 46 + k * 74, p.y - 52);
  }
  for (const p of altas) {
    for (let k = 0; k < 2; k++) pushCoin(p.x + 52 + k * 76, p.y - 50);
  }
  for (let px = 1800; px < LEVEL_W - 1600; px += 1750) {
    const base = 148 + ((px / 1750) % 3) * 34;
    for (let k = 0; k < 3; k++) pushCoin(px + k * 88, base + Math.sin(k) * 22);
  }
  for (let px = LEVEL_W - 1900; px < LEVEL_W - 520; px += 96) pushCoin(px, 520);

  /* --- drones sobre el suelo --- */
  let d = 0;
  for (const s of tramos) {
    if (s.w < 620) continue;
    const cerca = checkpoints.some((c) => Math.abs(c.x - (s.x + s.w / 2)) < 240);
    if (cerca) continue;
    if (s.x < 900 || s.x > LEVEL_W - 2400) continue;
    const min = s.x + 60, max = s.x + s.w - 120;
    if (max - min < 220) continue;
    const p = s.x / LEVEL_W;
    enemies.push({
      x: min + 40, y: 548, w: 58, h: 46, px: min + 40,
      min, max, vx: 1.7 + p * 1.7 + (d % 3) * 0.16, type: 'drone'
    });
    d++;
  }

  /* --- centinelas orbitales --- */
  for (let px = 2400; px < LEVEL_W - 2600; px += 1700) {
    const p = px / LEVEL_W;
    const y = 165 + ((px / 1700) % 5) * 44;
    enemies.push({
      x: px, y, py: y, px, baseY: y, w: 54, h: 44,
      min: px - 40, max: px + 300 + p * 340,
      vx: 1.5 + p * 1.5, amp: 26 + (px % 40), type: 'sentry'
    });
  }

  /* --- asteroides a la deriva --- */
  for (let px = 1700; px < LEVEL_W - 2400; px += 900) {
    const enCampo = px > 20000 && px < 24000;
    if (!enCampo && (px / 900) % 3 >= 1) continue;
    const tam = enCampo ? ((px / 900) % 3 | 0) : ((px / 900) % 2 | 0);
    const r = [30, 44, 68][tam];
    obstacles.push({
      x: px, y: 96 + ((px / 900) % 4) * 42, r,
      baseY: 96 + ((px / 900) % 4) * 42,
      amp: enCampo ? 48 + (px % 40) : 20 + (px % 22),
      vel: 0.005 + (px % 7) * 0.0009,
      giro: (px % 2 ? 0.004 : -0.004),
      ang: (px % 31) / 5, type: 'asteroid'
    });
  }

  /* --- decorado de fondo (parallax, no colisiona) --- */
  fondoNebulosas = [];
  for (let i = 0; i < 34; i++) {
    fondoNebulosas.push({
      x: 300 + i * 1120 + ((i * 397) % 420),
      y: 40 + ((i * 173) % 330),
      s: 1.1 + ((i * 53) % 90) / 100,
      spr: i % SPR.nebulosa.length
    });
  }
  fondoPlanetas = [];
  for (let i = 0; i < 20; i++) {
    fondoPlanetas.push({
      x: 700 + i * 1900 + ((i * 311) % 500),
      y: 88 + ((i * 149) % 190),
      spr: i % SPR.planeta.length
    });
  }
  fondoEstaciones = [];
  for (let i = 0; i < 12; i++) {
    fondoEstaciones.push({
      x: 1500 + i * 3200 + ((i * 271) % 700),
      y: 210 + ((i * 97) % 190),
      spr: i % 2
    });
  }
  polvo = [];
  for (let i = 0; i < 90; i++) {
    polvo.push({ x: i * 430 + ((i * 71) % 300), y: ((i * 137) % VH), r: 1.4 + ((i * 13) % 22) / 10 });
  }

  coinsMap.sort((a, b) => a.x - b.x);
}

function pushCoin(x, y) {
  if (x < 220 || x > LEVEL_W - 300) return;
  for (const p of platforms) {
    if (circleRect(x, y, 26, p)) return;
  }
  for (const b of boxes) {
    if (circleRect(x, y, 26, b)) return;
  }
  for (const u of powerUps) {
    if (Math.abs(u.x - x) < 56 && Math.abs(u.y - y) < 56) return;
  }
  if (Math.abs(x - (PORTAL.x + PORTAL.w / 2)) < 220) return;
  for (const c of coinsMap) {
    if (Math.abs(c.x - x) < 40 && Math.abs(c.y - y) < 40) return;
  }
  coinsMap.push({ x, y, taken: false });
}

/* ------------------------------------------------------- 10. CICLO PRINCIPAL */

let rafId = null, ultimoTick = 0, acumulador = 0;

function resetGame() {
  running = true; paused = false; won = false;
  coins = 0; lives = VIDAS_INICIALES; shield = 0;
  frames = 0; tiempoMision = 0;
  cameraX = 0; camPrev = 0; camRender = 0;
  ultimoGolpe = -999; ultimoAviso = -999;
  flashDanio = 0; sectorActual = -1; bannerSector = 0;
  checkpoint = { x: 120, y: 300 };
  particles.length = 0; popups.length = 0; estela.length = 0;
  for (const p of POOL) p.activo = false;
  particulasActivas = 0;

  ship.x = ship.px = 120;
  ship.y = ship.py = 300;
  ship.vx = 0; ship.vy = 0; ship.tilt = 0;

  buildLevel();
  actualizarHud('Misión activa');

  startScreen.classList.remove('active');
  deathScreen.classList.remove('active');
  winScreen.classList.remove('active');
  pauseBadge.classList.remove('active');

  resizeCanvas();
  pito(520, 0.12, 'square', 0.05, 420);

  cancelAnimationFrame(rafId);
  ultimoTick = performance.now();
  acumulador = 0;
  rafId = requestAnimationFrame(frame);
}

function frame(ahora) {
  let dt = ahora - ultimoTick;
  ultimoTick = ahora;
  if (dt > 250) dt = STEP;          // pestaña en segundo plano
  medirRendimiento(dt);

  acumulador += dt;
  let pasos = 0;
  while (acumulador >= STEP && pasos < 5) {
    update();
    acumulador -= STEP;
    pasos++;
    if (!running) break;
  }
  if (acumulador > STEP * 5) acumulador = 0;

  const alpha = running && !paused ? clamp(acumulador / STEP, 0, 1) : 0;
  render(alpha);

  if (running) rafId = requestAnimationFrame(frame);
}

/* ----------------------------------------------------------- 11. FÍSICA */

function update() {
  if (paused) return;
  frames++;
  tiempoMision += STEP;

  ship.px = ship.x; ship.py = ship.y;
  camPrev = cameraX;

  if (keys.left) ship.vx -= 0.42;
  if (keys.right) ship.vx += 0.42;
  if (keys.up) {
    ship.vy += THRUST;
    if (frames % 2 === 0) chispaMotor();
  }

  ship.vy += GRAVITY;
  ship.vx *= 0.965;
  ship.vy *= 0.985;
  ship.vx = clamp(ship.vx, -ship.maxSpeed, ship.maxSpeed);
  ship.vy = clamp(ship.vy, -10.2, 10.2);

  ship.x += ship.vx;
  ship.y += ship.vy;
  ship.x = clamp(ship.x, 0, LEVEL_W - ship.w);
  ship.tilt = clamp(ship.vy * 0.022, -0.24, 0.24);

  if (ship.y < 18) { ship.y = 18; ship.vy = 0; }
  if (ship.y > VH + 80) recibirDanio('Caíste al vacío espacial', true);

  /* plataformas móviles */
  for (const m of movers) m.y = m.baseY + Math.sin(frames * m.vel + m.fase) * m.amp;

  /* colisión con plataformas (solo las cercanas) */
  for (const p of platforms) {
    if (p.x > ship.x + 400 || p.x + p.w < ship.x - 400) continue;
    if (!overlap(ship, p)) continue;
    const desdeArriba = ship.y + ship.h - ship.vy <= p.y + 14;
    if (desdeArriba && ship.vy >= 0) {
      ship.y = p.y - ship.h;
      ship.vy = -0.8;
    } else {
      recibirDanio('Choque con plataforma orbital');
    }
  }

  /* asteroides */
  for (const ob of obstacles) {
    ob.ang += ob.giro;
    ob.y = ob.baseY + Math.sin(frames * ob.vel + ob.x) * ob.amp;
    if (ob.x > ship.x + 500 || ob.x < ship.x - 500) continue;
    if (circleRect(ob.x, ob.y, ob.r * 0.86, ship)) recibirDanio('Impacto con asteroide');
  }

  /* balizas de guardado */
  for (const cp of checkpoints) {
    if (cp.active || cp.x > ship.x + 300 || cp.x < ship.x - 300) continue;
    if (overlap(ship, cp)) {
      cp.active = true;
      checkpoint = { x: cp.x + 24, y: 430 };
      coins += PREMIO_CHECKPOINT;
      addPopup('Baliza ' + cp.label + ' +' + PREMIO_CHECKPOINT, cp.x, cp.y - 20, '#86efac');
      estallido(cp.x + cp.w / 2, cp.y + cp.h / 2, '#0A8F43', 30);
      actualizarHud('Avance guardado en ' + cp.label);
      pito(660, 0.16, 'triangle', 0.06, 320);
    }
  }

  /* contenedores */
  for (const b of boxes) {
    if (b.hit || b.x > ship.x + 300 || b.x < ship.x - 300) continue;
    if (!overlap(ship, b)) continue;
    b.hit = true;
    const cantidad = b.type === 'final' ? 12 : b.type === 'special' ? 8 : b.type === 'shield' ? 5 : 3;
    coins += cantidad;
    if (b.type === 'shield') shield = Math.min(ESCUDO_MAX, shield + 1);
    const etiqueta = b.type === 'special' ? 'Contenedor premium KSL +8'
      : b.type === 'final' ? 'Mega contenedor KSL +12'
      : b.type === 'shield' ? 'Contenedor escudo +5' : 'Contenedor KSL +3';
    lluviaMonedas(b.x + b.w / 2, b.y, cantidad);
    estallido(b.x + b.w / 2, b.y + b.h / 2, b.type === 'normal' ? '#60a5fa' : '#F2C10A', 20);
    addPopup(etiqueta, b.x - 20, b.y - 14, b.type === 'shield' ? '#7dd3fc' : '#F2C10A');
    actualizarHud(etiqueta);
    pito(430, 0.13, 'square', 0.05, 340);
  }

  /* potenciadores */
  for (const pu of powerUps) {
    if (pu.taken || pu.x > ship.x + 300 || pu.x < ship.x - 300) continue;
    if (!circleRect(pu.x, pu.y, pu.r, ship)) continue;
    pu.taken = true;
    if (pu.type === 'shield') {
      shield = Math.min(ESCUDO_MAX, shield + 1);
      actualizarHud('Escudo KSL activado');
      addPopup('ESCUDO', pu.x - 30, pu.y - 24, '#7dd3fc');
      estallido(pu.x, pu.y, '#38bdf8', 26);
      pito(700, 0.2, 'sine', 0.06, 260);
    } else if (pu.type === 'life') {
      lives = Math.min(VIDAS_MAX, lives + 1);
      actualizarHud('Vida KSL recuperada');
      addPopup('+1 VIDA', pu.x - 34, pu.y - 24, '#86efac');
      estallido(pu.x, pu.y, '#22c55e', 30);
      pito(520, 0.24, 'triangle', 0.07, 460);
    } else {
      ship.vx += ship.vx >= 0 ? 5.5 : -5.5;
      ship.vy = -7.2;
      actualizarHud('Impulso turbo KSL');
      addPopup('TURBO', pu.x - 28, pu.y - 24, '#F2C10A');
      estallido(pu.x, pu.y, '#F2C10A', 26);
      pito(300, 0.18, 'sawtooth', 0.05, 620);
    }
  }

  /* monedas */
  for (const c of coinsMap) {
    if (c.taken) continue;
    if (c.x > ship.x + 260) break;             // ordenadas por x
    if (c.x < ship.x - 260) continue;
    if (!circleRect(c.x, c.y, 19, ship)) continue;
    c.taken = true;
    coins++;
    addPopup('+1', c.x - 8, c.y - 16, '#F2C10A');
    estallido(c.x, c.y, '#F2C10A', 8);
    if (frames - ultimoSonidoMoneda > 4) {
      ultimoSonidoMoneda = frames;
      pito(880 + (coins % 6) * 40, 0.06, 'square', 0.035, 260);
    }
    if (coins === META_MONEDAS) {
      actualizarHud('¡' + META_MONEDAS + ' monedas! El portal ya te deja reclamar el premio');
      addPopup('PORTAL LISTO', ship.x, ship.y - 40, '#86efac');
    } else {
      actualizarHud('+1 moneda KSL · ' + coins + '/' + META_MONEDAS);
    }
  }

  /* enemigos */
  for (const e of enemies) {
    e.px = e.x;
    if (e.x > ship.x + 1010 || e.x < ship.x - 620) continue;
    e.x += e.vx;
    if (e.x < e.min || e.x > e.max) e.vx *= -1;
    if (e.type === 'sentry') e.y = e.baseY + Math.sin((frames + e.min) / 40) * e.amp;
    if (overlap(ship, e)) {
      recibirDanio(e.type === 'sentry' ? 'Impacto con centinela orbital' : 'Impacto con dron enemigo');
    }
  }

  /* portal del premio */
  if (overlap(ship, PORTAL)) {
    if (coins >= META_MONEDAS) win(); else faltanMonedas();
  }

  /* cámara */
  const objetivo = clamp(ship.x - VW * 0.3, 0, LEVEL_W - VW);
  cameraX += (objetivo - cameraX) * 0.12;

  /* partículas */
  for (const p of POOL) {
    if (!p.activo) continue;
    p.x += p.vx; p.y += p.vy; p.vy += p.g;
    if (--p.vida <= 0) { p.activo = false; particulasActivas--; }
  }

  for (let i = popups.length - 1; i >= 0; i--) {
    const pop = popups[i];
    pop.y -= 0.75;
    if (--pop.vida <= 0) popups.splice(i, 1);
  }

  if (QUALITY.estela[QUALITY.tier] && frames % 3 === 0) {
    estela.push({ x: ship.x + 6, y: ship.y + ship.h / 2, vida: 16 });
    if (estela.length > 14) estela.shift();
  }
  for (let i = estela.length - 1; i >= 0; i--) if (--estela[i].vida <= 0) estela.splice(i, 1);

  if (flashDanio > 0) flashDanio--;
  if (bannerSector > 0) bannerSector--;

  /* sector nuevo */
  const idx = indiceSector();
  if (idx !== sectorActual) {
    sectorActual = idx;
    bannerSector = 150;
    sectorEl.textContent = SECTORES[idx].nombre;
  }
}

function indiceSector() {
  let i = 0;
  for (let k = 0; k < SECTORES.length; k++) if (ship.x >= SECTORES[k].at) i = k;
  return i;
}

/* ---------------------------------------------------------- 12. HUD / ESTADOS */

function actualizarHud(mensaje) {
  coinsEl.textContent = coins + '/' + META_MONEDAS;
  livesEl.textContent = lives;
  shieldEl.textContent = shield;
  if (recordEl) recordEl.textContent = bestCoins;
  if (mensaje) statusEl.textContent = mensaje;
  sectorEl.textContent = SECTORES[Math.max(0, indiceSector())].nombre;
}

function avisar(mensaje) { statusEl.textContent = mensaje; }

function recibirDanio(motivo, caida) {
  if (frames - ultimoGolpe < HIT_COOLDOWN) return;
  ultimoGolpe = frames;

  if (shield > 0 && !caida) {
    shield--;
    ship.vx *= 0.35; ship.vy *= 0.35;
    estallido(ship.x + ship.w / 2, ship.y + ship.h / 2, '#38bdf8', 32);
    addPopup('Escudo absorbió el golpe', ship.x - 40, ship.y - 24, '#7dd3fc');
    actualizarHud('Escudo KSL usado · quedan ' + shield);
    pito(240, 0.16, 'sine', 0.06, 180);
    return;
  }

  lives--;
  flashDanio = 16;
  actualizarHud(motivo);
  estallido(ship.x + ship.w / 2, ship.y + ship.h / 2, '#E01818', 30);
  addPopup('-1 vida', ship.x, ship.y - 24, '#fb7185');
  pito(190, 0.26, 'sawtooth', 0.07, -110);

  ship.vx *= 0.28; ship.vy *= 0.28;

  if (caida) {
    ship.x = checkpoint.x;
    ship.y = checkpoint.y;
    ship.px = ship.x; ship.py = ship.y;
    ship.vx = 0; ship.vy = 0;
    cameraX = camPrev = clamp(ship.x - VW * 0.3, 0, LEVEL_W - VW);
  }

  if (lives <= 0) morir();
}

function morir() {
  running = false;
  cancelAnimationFrame(rafId);
  guardarRecord();
  deathCoinsEl.textContent = coins;
  if (deathSectorEl) deathSectorEl.textContent = SECTORES[Math.max(0, indiceSector())].nombre;
  deathScreen.classList.add('active');
  pito(140, 0.5, 'sawtooth', 0.07, -80);
}

function faltanMonedas() {
  if (frames - ultimoAviso < 78) return;
  ultimoAviso = frames;
  const faltan = Math.max(0, META_MONEDAS - coins);
  actualizarHud('El portal pide ' + META_MONEDAS + ' monedas · te faltan ' + faltan);
  addPopup('Faltan ' + faltan, ship.x - 20, ship.y - 30, '#F2C10A');
  estallido(ship.x + ship.w / 2, ship.y + ship.h / 2, '#F2C10A', 18);
  ship.x = Math.max(0, ship.x - 190);
  ship.vx = -5; ship.vy = -4;
  pito(220, 0.2, 'square', 0.05, -60);
}

function guardarRecord() {
  if (coins > bestCoins) {
    bestCoins = coins;
    localStorage.setItem('ksl_best_coins', String(bestCoins));
  }
}

function win() {
  if (won) return;
  won = true;
  running = false;
  cancelAnimationFrame(rafId);
  guardarRecord();
  winCoinsEl.textContent = String(coins);
  if (winRecordEl) winRecordEl.textContent = String(bestCoins);
  if (winTimeEl) winTimeEl.textContent = formatoTiempo(tiempoMision);
  actualizarHud('Premio desbloqueado');
  winScreen.classList.add('active');
  pito(660, 0.18, 'triangle', 0.07, 260);
  setTimeout(() => pito(880, 0.28, 'triangle', 0.07, 320), 150);
}

function formatoTiempo(ms) {
  const t = Math.floor(ms / 1000);
  return String(Math.floor(t / 60)).padStart(2, '0') + ':' + String(t % 60).padStart(2, '0');
}

/* ------------------------------------------------------- 13. PARTÍCULAS */

let particulasActivas = 0;
let cursorPool = 0;

function tomarParticula() {
  if (particulasActivas >= QUALITY.particulasMax[QUALITY.tier]) return null;
  for (let i = 0; i < POOL.length; i++) {
    cursorPool = (cursorPool + 1) % POOL.length;
    const p = POOL[cursorPool];
    if (!p.activo) { particulasActivas++; return p; }
  }
  return null;
}

function emitir(x, y, vx, vy, r, color, vida, g) {
  const p = tomarParticula();
  if (!p) return;
  p.activo = true;
  p.x = x; p.y = y; p.vx = vx; p.vy = vy;
  p.r = r; p.color = color; p.vida = vida; p.maxVida = vida; p.g = g || 0;
}

function chispaMotor() {
  const x = ship.x + 8, y = ship.y + ship.h / 2;
  emitir(x, y, Math.random() * -5 - 1, Math.random() * 3 - 1.5,
    Math.random() * 4 + 2, Math.random() > 0.5 ? '#60a5fa' : '#F2C10A', 16, 0);
}

function estallido(x, y, color, cantidad) {
  const n = Math.round(cantidad * (QUALITY.tier === 0 ? 0.4 : QUALITY.tier === 1 ? 0.7 : 1));
  for (let i = 0; i < n; i++) {
    emitir(x, y, Math.random() * 9 - 4.5, Math.random() * 9 - 4.5,
      Math.random() * 4.5 + 2, color, 32, 0.04);
  }
}

function lluviaMonedas(x, y, cantidad) {
  const n = Math.round(cantidad * (QUALITY.tier === 0 ? 1.4 : 3));
  for (let i = 0; i < n; i++) {
    emitir(x, y, Math.random() * 6 - 3, Math.random() * -6 - 1.5,
      Math.random() * 4 + 2, Math.random() > 0.25 ? '#F2C10A' : '#ffffff', 44, 0.16);
  }
}

function addPopup(texto, x, y, color) {
  if (popups.length > 14) popups.shift();
  popups.push({ texto, x, y, color, vida: 72, maxVida: 72 });
}

/* ------------------------------------------------------------- 14. RENDER */

const dotCache = {};
function dot(color) {
  if (!dotCache[color]) {
    dotCache[color] = sprite(24, 24, (g) => {
      const gr = g.createRadialGradient(12, 12, 0, 12, 12, 12);
      gr.addColorStop(0, '#ffffff');
      gr.addColorStop(0.3, color);
      gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = gr;
      g.fillRect(0, 0, 24, 24);
    }, 1);
  }
  return dotCache[color];
}

function tile(spr, x, y, w, h) {
  const tw = spr.anchoLog;
  let hecho = 0;
  while (hecho < w - 0.5) {
    const seg = Math.min(tw, w - hecho);
    ctx.drawImage(spr, 0, 0, (seg / tw) * spr.width, spr.height, x + hecho, y, seg, h);
    hecho += seg;
  }
}

function render(alpha) {
  ctx.setTransform(escalaX, 0, 0, escalaY, 0, 0);

  const sx = lerp(ship.px, ship.x, alpha);
  const sy = lerp(ship.py, ship.y, alpha);
  camRender = lerp(camPrev, cameraX, alpha);
  const cam = camRender;

  /* --- cielo --- */
  ctx.fillStyle = GRAD.cielo;
  ctx.fillRect(0, 0, VW, VH);

  /* --- estrellas en parallax --- */
  const capas = QUALITY.capasEstrellas[QUALITY.tier];
  const factores = [0.06, 0.14, 0.26];
  for (let i = 3 - capas; i < 3; i++) {
    const capa = SPR.estrellas[i];
    let off = ((cam * factores[i] + frames * (0.06 + i * 0.05)) % VW + VW) % VW;
    ctx.drawImage(capa, -off, 0, VW, VH);
    ctx.drawImage(capa, VW - off, 0, VW, VH);
  }

  /* --- nebulosas / planetas / estaciones --- */
  dibujarFondo(cam);

  /* --- tinte del sector --- */
  aplicarTinte();

  /* --- mundo --- */
  ctx.save();
  ctx.translate(-cam, 0);
  const izq = cam - 140, der = cam + VW + 140;

  dibujarPlataformas(izq, der);
  dibujarAsteroides(izq, der);
  dibujarBalizas(izq, der);
  dibujarCajas(izq, der);
  dibujarPotenciadores(izq, der);
  dibujarMonedas(izq, der);
  dibujarEnemigos(izq, der, alpha);
  dibujarPortal(izq, der);
  dibujarParticulas();
  dibujarNave(sx, sy);
  dibujarPopups();
  ctx.restore();

  /* --- polvo en primer plano --- */
  if (QUALITY.tier > 0) dibujarPolvo(cam);

  /* --- viñeta + flash --- */
  if (QUALITY.tier > 0) {
    ctx.fillStyle = GRAD.vineta;
    ctx.fillRect(0, 0, VW, VH);
  }
  if (flashDanio > 0) {
    ctx.globalAlpha = (flashDanio / 16) * 0.34;
    ctx.fillStyle = '#E01818';
    ctx.fillRect(0, 0, VW, VH);
    ctx.globalAlpha = 1;
  }

  /* --- interfaz sobre el lienzo --- */
  dibujarRiel(sx);
  dibujarBannerSector();
  dibujarTip();
  if (!listo) dibujarCarga();
}

function aplicarTinte() {
  const i = Math.max(0, sectorActual);
  const a = SECTORES[i].tinte;
  const sig = SECTORES[Math.min(SECTORES.length - 1, i + 1)];
  const desde = SECTORES[i].at;
  const hasta = sig.at === desde ? LEVEL_W : sig.at;
  const t = clamp((ship.x - desde) / (hasta - desde), 0, 1);
  const b = sig.tinte;
  const r = lerp(a[0], b[0], t), g = lerp(a[1], b[1], t), bl = lerp(a[2], b[2], t);
  const al = lerp(a[3], b[3], t);
  if (al <= 0.001) return;
  ctx.fillStyle = 'rgba(' + (r | 0) + ',' + (g | 0) + ',' + (bl | 0) + ',' + al.toFixed(3) + ')';
  ctx.fillRect(0, 0, VW, VH);
}

function dibujarFondo(cam) {
  /* nebulosas */
  const fN = 0.2;
  for (const n of fondoNebulosas) {
    const x = n.x - cam * fN;
    const w = 360 * n.s;
    if (x + w < -60 || x > VW + 60) continue;
    ctx.drawImage(SPR.nebulosa[n.spr], x, n.y - w * 0.2, w, w);
  }
  /* planetas */
  const fP = 0.3;
  for (const p of fondoPlanetas) {
    const spr = SPR.planeta[p.spr];
    const x = p.x - cam * fP;
    if (x + spr.anchoLog < -40 || x > VW + 40) continue;
    ctx.drawImage(spr, x, p.y, spr.anchoLog, spr.altoLog);
  }
  /* estaciones */
  if (QUALITY.tier > 0) {
    const fE = 0.46;
    for (const e of fondoEstaciones) {
      const spr = SPR.estacion[e.spr];
      const x = e.x - cam * fE;
      if (x + 300 < -40 || x > VW + 40) continue;
      ctx.drawImage(spr, x, e.y, 300, 170);
    }
  }
}

function dibujarPolvo(cam) {
  ctx.globalAlpha = 0.22;
  ctx.fillStyle = '#bfdbfe';
  for (const d of polvo) {
    const x = ((d.x - cam * 1.24) % (LEVEL_W + VW) + LEVEL_W + VW) % (LEVEL_W + VW);
    if (x > VW + 20) continue;
    ctx.fillRect(x, d.y, d.r * 1.6, d.r);
  }
  ctx.globalAlpha = 1;
}

function dibujarPlataformas(izq, der) {
  for (const p of platforms) {
    if (p.x + p.w < izq || p.x > der) continue;
    if (p.kind === 'ground') {
      tile(SPR.suelo, p.x, p.y, p.w, p.h);
    } else if (p.kind === 'mid') {
      tile(SPR.losaMedia, p.x, p.y, p.w, p.h);
    } else if (p.kind === 'high') {
      tile(SPR.losaAlta, p.x, p.y, p.w, p.h);
    } else {
      tile(SPR.losaMovil, p.x, p.y, p.w, p.h);
      ctx.globalAlpha = 0.55;
      ctx.fillStyle = '#38bdf8';
      const s = 3 + Math.sin(frames * 0.1) * 2;
      ctx.fillRect(p.x + 22, p.y + p.h, 16, s);
      ctx.fillRect(p.x + p.w - 38, p.y + p.h, 16, s);
      ctx.globalAlpha = 1;
    }
  }
}

function dibujarAsteroides(izq, der) {
  for (const ob of obstacles) {
    if (ob.x + ob.r < izq || ob.x - ob.r > der) continue;
    const spr = SPR.asteroide[ob.r === 30 ? 0 : ob.r === 44 ? 1 : 2];
    ctx.save();
    ctx.translate(ob.x, ob.y);
    ctx.rotate(ob.ang);
    ctx.drawImage(spr, -spr.anchoLog / 2, -spr.altoLog / 2, spr.anchoLog, spr.altoLog);
    ctx.restore();
  }
}

function dibujarBalizas(izq, der) {
  for (const cp of checkpoints) {
    if (cp.x + cp.w < izq || cp.x > der) continue;
    const pulso = Math.sin(frames / 16 + cp.x) * 0.5 + 0.5;
    blit(cp.active ? SPR.cpOn : SPR.cpOff, cp.x - 10, cp.y - 12);
    ctx.strokeStyle = cp.active ? 'rgba(34,197,94,.75)' : 'rgba(242,193,10,.7)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(cp.x + cp.w / 2, cp.y + 14, 30 + pulso * 9, 0, TAU);
    ctx.stroke();
  }
}

function dibujarCajas(izq, der) {
  for (const b of boxes) {
    if (b.x + b.w < izq || b.x > der) continue;
    if (b.hit) { blit(SPR.cajaAbierta, b.x - 12, b.y - 12); continue; }
    const flot = Math.sin(frames / 22 + b.x) * 3;
    blit(SPR.caja[b.type], b.x - 12, b.y - 12 + flot);
  }
}

function dibujarPotenciadores(izq, der) {
  for (const pu of powerUps) {
    if (pu.taken || pu.x < izq || pu.x > der) continue;
    const s = 1 + Math.sin(frames / 13 + pu.x) * 0.07;
    const w = 74 * s;
    ctx.drawImage(SPR.pu[pu.type], pu.x - w / 2, pu.y - w / 2, w, w);
  }
}

function dibujarMonedas(izq, der) {
  const base = frames >> 2;
  for (const c of coinsMap) {
    if (c.taken) continue;
    if (c.x < izq) continue;
    if (c.x > der) break;
    const spr = SPR.moneda[(base + (c.x | 0)) % 10];
    ctx.drawImage(spr, c.x - 22, c.y - 25 + Math.sin(frames / 20 + c.x) * 2.5, 44, 50);
  }
}

function dibujarEnemigos(izq, der, alpha) {
  for (const e of enemies) {
    if (e.x + e.w < izq || e.x > der) continue;
    const ex = lerp(e.px === undefined ? e.x : e.px, e.x, alpha);
    if (e.type === 'drone') {
      blit(SPR.dron, ex - 8, e.y - 8);
      ctx.globalAlpha = 0.5;
      ctx.fillStyle = '#38bdf8';
      const l = 6 + Math.sin(frames * 0.2 + e.min) * 3;
      ctx.fillRect(ex + 26, e.y + e.h + 8, 6, l);
      ctx.globalAlpha = 1;
    } else {
      blit(SPR.centinela, ex - 9, e.y - 8);
      ctx.strokeStyle = 'rgba(242,193,10,.28)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(ex + e.w / 2, e.y + e.h / 2, 40 + Math.sin(frames * 0.06) * 5, 20, 0, 0, TAU);
      ctx.stroke();
    }
  }
}

function dibujarPortal(izq, der) {
  if (PORTAL.x + 300 < izq || PORTAL.x - 300 > der) return;
  const cx = PORTAL.x + PORTAL.w / 2, cy = PORTAL.y + PORTAL.h / 2;
  const pulso = Math.sin(frames / 20) * 12;
  const listoPortal = coins >= META_MONEDAS;

  ctx.globalAlpha = listoPortal ? 0.95 : 0.6;
  const s = 520 + pulso * 2;
  ctx.drawImage(SPR.portalGlow, cx - s / 2, cy - s / 2, s, s);
  ctx.globalAlpha = 1;

  ctx.strokeStyle = listoPortal ? '#F2C10A' : 'rgba(242,193,10,.55)';
  ctx.lineWidth = 10;
  ctx.beginPath();
  ctx.ellipse(cx, cy, 66 + pulso * 0.1, 132 + pulso * 0.2, 0, 0, TAU);
  ctx.stroke();
  ctx.strokeStyle = listoPortal ? '#0A8F43' : 'rgba(10,143,67,.5)';
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.ellipse(cx, cy, 94, 158, 0, 0, TAU);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,.35)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.ellipse(cx, cy, 44 - pulso * 0.2, 96 - pulso * 0.3, 0, 0, TAU);
  ctx.stroke();

  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffffff';
  ctx.font = '900 30px Arial';
  ctx.fillText('PREMIO KSL', cx, PORTAL.y - 54);
  ctx.font = '900 19px Arial';
  ctx.fillStyle = listoPortal ? '#86efac' : '#F2C10A';
  ctx.fillText(listoPortal ? 'ACCESO LIBERADO' : 'REQUIERE ' + META_MONEDAS + ' MONEDAS', cx, PORTAL.y - 26);
  ctx.textAlign = 'left';
}

function dibujarParticulas() {
  for (const p of POOL) {
    if (!p.activo) continue;
    const a = p.vida / p.maxVida;
    ctx.globalAlpha = a < 0 ? 0 : a;
    const d = p.r * 3.4;
    ctx.drawImage(dot(p.color), p.x - d / 2, p.y - d / 2, d, d);
  }
  ctx.globalAlpha = 1;
}

function dibujarPopups() {
  ctx.font = '900 20px Arial';
  for (const p of popups) {
    ctx.globalAlpha = Math.min(1, p.vida / 30);
    ctx.fillStyle = 'rgba(2,6,23,.55)';
    const w = ctx.measureText(p.texto).width;
    fillRound(p.x - 8, p.y - 19, w + 16, 26, 8);
    ctx.fillStyle = p.color;
    ctx.fillText(p.texto, p.x, p.y);
  }
  ctx.globalAlpha = 1;
}

function dibujarNave(sx, sy) {
  const cx = sx + ship.w / 2, cy = sy + ship.h / 2;
  const empuje = keys.up || Math.abs(ship.vx) > 1.6;
  const invulnerable = frames - ultimoGolpe < HIT_COOLDOWN;

  /* estela */
  if (estela.length) {
    for (let i = 0; i < estela.length; i++) {
      const e = estela[i];
      ctx.globalAlpha = (e.vida / 16) * 0.3 * (i / estela.length);
      const d = 26;
      ctx.drawImage(dot('#60a5fa'), e.x - d / 2, e.y - d / 2, d, d);
    }
    ctx.globalAlpha = 1;
  }

  /* escudo */
  if (shield > 0) {
    const p = Math.sin(frames * 0.08) * 3;
    ctx.strokeStyle = 'rgba(56,189,248,.75)';
    ctx.lineWidth = 4;
    ctx.beginPath(); ctx.ellipse(cx, cy, 70 + p, 48 + p, 0, 0, TAU); ctx.stroke();
    ctx.strokeStyle = 'rgba(242,193,10,.22)';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.ellipse(cx, cy, 78 + p, 55 + p, 0, 0, TAU); ctx.stroke();
  }

  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(ship.tilt);

  if (empuje) {
    const chispa = Math.random() * 10;
    const g1 = ctx.createLinearGradient(-106, 0, -36, 0);
    g1.addColorStop(0, 'rgba(37,99,235,0)');
    g1.addColorStop(0.35, 'rgba(96,165,250,.75)');
    g1.addColorStop(1, 'rgba(14,165,233,.95)');
    ctx.fillStyle = g1;
    ctx.beginPath();
    ctx.moveTo(-40, -15); ctx.lineTo(-98 - chispa, 0); ctx.lineTo(-40, 15);
    ctx.closePath(); ctx.fill();
    const g2 = ctx.createLinearGradient(-82, 0, -38, 0);
    g2.addColorStop(0, 'rgba(242,193,10,0)');
    g2.addColorStop(0.55, 'rgba(242,193,10,.9)');
    g2.addColorStop(1, 'rgba(255,255,255,.95)');
    ctx.fillStyle = g2;
    ctx.beginPath();
    ctx.moveTo(-41, -8); ctx.lineTo(-77 - chispa * 0.65, 0); ctx.lineTo(-41, 8);
    ctx.closePath(); ctx.fill();
  }

  if (invulnerable && (frames >> 2) % 2 === 0) ctx.globalAlpha = 0.45;
  ctx.drawImage(SPR.nave, -ship.w / 2 - SPR.naveOX, -ship.h / 2 - SPR.naveOY, 126, 116);
  ctx.globalAlpha = 1;
  ctx.restore();
}

/* ---------------------------------------------- 15. INTERFAZ SOBRE EL LIENZO */

function dibujarRiel(sx) {
  const m = 30, w = VW - m * 2, y = 24, h = 12;
  const prog = clamp(sx / (LEVEL_W - ship.w), 0, 1);

  ctx.fillStyle = 'rgba(2,6,23,.55)';
  fillRound(m - 8, y - 8, w + 16, h + 18, 12);
  ctx.fillStyle = 'rgba(255,255,255,.14)';
  fillRound(m, y, w, h, 7);
  ctx.fillStyle = GRAD.barra;
  fillRound(m, y, Math.max(6, w * prog), h, 7);

  /* nodos de sector */
  for (let i = 1; i < SECTORES.length; i++) {
    const px = m + w * (SECTORES[i].at / LEVEL_W);
    ctx.fillStyle = 'rgba(255,255,255,.42)';
    ctx.fillRect(px, y - 4, 2, h + 8);
  }
  /* balizas */
  for (const cp of checkpoints) {
    const px = m + w * (cp.x / LEVEL_W);
    ctx.fillStyle = cp.active ? '#22c55e' : 'rgba(242,193,10,.85)';
    ctx.beginPath(); ctx.arc(px + 1, y + h / 2, 4, 0, TAU); ctx.fill();
  }
  /* marcador de la nave */
  const nx = m + w * prog;
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.moveTo(nx, y - 7); ctx.lineTo(nx + 7, y - 16); ctx.lineTo(nx - 7, y - 16);
  ctx.closePath(); ctx.fill();

  ctx.font = '900 15px Arial';
  ctx.fillStyle = '#e2e8f0';
  ctx.fillText(Math.round(prog * 100) + '% · ' + (sx / 1000).toFixed(1) + 'k / '
    + Math.round(LEVEL_W / 1000) + 'k px', m, y + h + 24);
  ctx.textAlign = 'right';
  ctx.fillStyle = '#F2C10A';
  ctx.fillText('PORTAL PREMIO', m + w, y + h + 24);
  ctx.textAlign = 'left';
}

function dibujarBannerSector() {
  if (bannerSector <= 0) return;
  const t = bannerSector / 150;
  const entra = clamp((1 - t) * 6, 0, 1);
  const sale = clamp(t * 4, 0, 1);
  ctx.globalAlpha = Math.min(entra, sale);
  const nombre = SECTORES[Math.max(0, sectorActual)].nombre;
  ctx.font = '900 17px Arial';
  const w = Math.max(300, ctx.measureText(nombre).width + 120);
  const x = VW / 2 - w / 2, y = 92;
  ctx.fillStyle = 'rgba(2,6,23,.78)';
  fillRound(x, y, w, 62, 16);
  ctx.strokeStyle = 'rgba(242,193,10,.6)';
  ctx.lineWidth = 2;
  strokeRound(x, y, w, 62, 16);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#F2C10A';
  ctx.font = '900 13px Arial';
  ctx.fillText('SECTOR ' + String(Math.max(0, sectorActual) + 1).padStart(2, '0') + ' / ' + SECTORES.length, VW / 2, y + 24);
  ctx.fillStyle = '#ffffff';
  ctx.font = '900 26px Arial';
  ctx.fillText(nombre.toUpperCase(), VW / 2, y + 50);
  ctx.textAlign = 'left';
  ctx.globalAlpha = 1;
}

function dibujarTip() {
  if (!running || paused || frames > 460) return;
  ctx.globalAlpha = clamp((460 - frames) / 90, 0, 1);
  ctx.fillStyle = 'rgba(2,6,23,.72)';
  fillRound(30, VH - 84, 760, 54, 16);
  ctx.strokeStyle = 'rgba(96,165,250,.35)';
  ctx.lineWidth = 2;
  strokeRound(30, VH - 84, 760, 54, 16);
  ctx.fillStyle = '#F2C10A';
  ctx.font = '900 14px Arial';
  ctx.fillText('CONTROL DE MISIÓN', 48, VH - 62);
  ctx.fillStyle = '#e2e8f0';
  ctx.font = '900 15px Arial';
  ctx.fillText('Reúne ' + META_MONEDAS + ' monedas antes del portal. Las balizas guardan tu avance.', 48, VH - 42);
  ctx.globalAlpha = 1;
}

function dibujarCarga() {
  ctx.fillStyle = 'rgba(2,6,23,.6)';
  ctx.fillRect(0, 0, VW, VH);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#F2C10A';
  ctx.font = '900 24px Arial';
  ctx.fillText('Preparando la ruta KSL...', VW / 2, VH / 2);
  ctx.textAlign = 'left';
}

/* ------------------------------------------------------------- 16. CONTROLES */

function togglePause(forzar) {
  if (!running || won) return;
  paused = forzar === undefined ? !paused : forzar;
  pauseBadge.classList.toggle('active', paused);
  statusEl.textContent = paused ? 'Misión en pausa' : 'Misión activa';
  if (pauseBtn) pauseBtn.textContent = paused ? 'Reanudar' : 'Pausa';
}

function botonMantenido(id, key) {
  const btn = el(id);
  if (!btn) return;
  const on = (e) => { e.preventDefault(); keys[key] = true; btn.classList.add('presionado'); };
  const off = (e) => { if (e) e.preventDefault(); keys[key] = false; btn.classList.remove('presionado'); };
  btn.addEventListener('pointerdown', on);
  btn.addEventListener('pointerup', off);
  btn.addEventListener('pointercancel', off);
  btn.addEventListener('pointerleave', off);
  btn.addEventListener('contextmenu', (e) => e.preventDefault());
}

document.addEventListener('keydown', (e) => {
  const k = e.key.toLowerCase();
  if (k === 'arrowleft' || k === 'a') keys.left = true;
  if (k === 'arrowright' || k === 'd') keys.right = true;
  if (k === 'arrowup' || k === 'w' || e.code === 'Space') { e.preventDefault(); keys.up = true; }
  if (k === 'p' || k === 'escape') togglePause();
  if (k === 'm') { sfxOn = !sfxOn; localStorage.setItem('ksl_sfx', sfxOn ? '1' : '0'); actualizarBotonSonido(); }
  if (k === 'enter' && !running) {
    if (winScreen.classList.contains('active') || deathScreen.classList.contains('active') || startScreen.classList.contains('active')) resetGame();
  }
});

document.addEventListener('keyup', (e) => {
  const k = e.key.toLowerCase();
  if (k === 'arrowleft' || k === 'a') keys.left = false;
  if (k === 'arrowright' || k === 'd') keys.right = false;
  if (k === 'arrowup' || k === 'w' || e.code === 'Space') keys.up = false;
});

document.addEventListener('visibilitychange', () => { if (document.hidden && running) togglePause(true); });
window.addEventListener('blur', () => { keys.left = keys.right = keys.up = false; });

botonMantenido('leftBtn', 'left');
botonMantenido('rightBtn', 'right');
botonMantenido('upBtn', 'up');

/* Empujar la nave tocando la mitad de la pantalla también funciona. */
canvas.addEventListener('pointerdown', (e) => {
  if (!running || paused) return;
  e.preventDefault();
  keys.up = true;
});
window.addEventListener('pointerup', () => { keys.up = false; });
window.addEventListener('pointercancel', () => { keys.up = false; });

el('startBtn').addEventListener('click', resetGame);
el('retryBtn').addEventListener('click', resetGame);
el('playAgainBtn').addEventListener('click', resetGame);
if (pauseBtn) pauseBtn.addEventListener('click', () => togglePause());
if (soundBtn) soundBtn.addEventListener('click', () => {
  sfxOn = !sfxOn;
  localStorage.setItem('ksl_sfx', sfxOn ? '1' : '0');
  actualizarBotonSonido();
  if (sfxOn) pito(660, 0.1, 'triangle', 0.05, 180);
});
if (qualityBtn) qualityBtn.addEventListener('click', () => {
  QUALITY.auto = false;
  QUALITY.tier = (QUALITY.tier + 1) % 3;
  aplicarCalidad();
  avisar('Gráficos en modo ' + QUALITY.nombres[QUALITY.tier] + ' (manual)');
});

/* ---------------------------------------------------------------- 17. ARRANQUE */

construirSprites();
buildLevel();
resizeCanvas();
actualizarHud('Listo para despegar');
actualizarBotonSonido();
aplicarCalidad();
listo = true;
sectorActual = 0;
render(0);
