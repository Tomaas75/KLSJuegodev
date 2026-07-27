const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

const startScreen = document.getElementById("startScreen");
const deathScreen = document.getElementById("deathScreen");
const winScreen = document.getElementById("winScreen");

const coinsEl = document.getElementById("coins");
const livesEl = document.getElementById("lives");
const shieldEl = document.getElementById("shield");
const sectorEl = document.getElementById("sector");
const statusEl = document.getElementById("status");
const deathCoinsEl = document.getElementById("deathCoins");
const winCoinsEl = document.getElementById("winCoins");
const loginLink = document.getElementById("loginLink");
const pauseBadge = document.getElementById("pauseBadge");

// Cambia esta URL cuando tengas la página real de loggeo.
const paginaDeLoggeo = "https://wa.me/573142347047?text=Hola,%20soy%20ganador%20de%20la%20Misi%C3%B3n%20KSL-01.%20Quiero%20reclamar%20mi%20premio%20de%20KSL%20Arte%20y%20Dise%C3%B1o%20Gr%C3%A1fico%20S.A.S.";
loginLink.href = paginaDeLoggeo;

const logo = new Image();
logo.src = "assets/logo-ksl.png";

const keys = { left: false, right: false, up: false };

let running = false;
let paused = false;
let won = false;
let cameraX = 0;
let animationId = null;
let coins = 0;
let lives = 5;
let shield = 0;
let checkpoint = { x: 100, y: 280 };
let lastHit = 0;
let lastPortalWarning = 0;
let missionTime = 0;
let bestCoins = Number(localStorage.getItem("ksl_best_coins") || 0);

const levelWidth = 14000;
const gravity = 0.36;
const thrust = -0.66;
const maxCoins = 80;
const checkpointReward = 5;

const ship = {
  x: 100,
  y: 280,
  w: 96,
  h: 54,
  vx: 0,
  vy: 0,
  maxSpeed: 7.35
};

const portal = { x: 13700, y: 300, w: 150, h: 260 };

let platforms = [];
let boxes = [];
let enemies = [];
let coinsMap = [];
let powerUps = [];
let checkpoints = [];
let obstacles = [];
let particles = [];
let stars = [];
let popups = [];

const sectors = [
  { name: "Base KSL", at: 0 },
  { name: "Nebulosa Azul", at: 1800 },
  { name: "Campo Suave", at: 3800 },
  { name: "Anillos Verdes", at: 6000 },
  { name: "Zona Roja", at: 8400 },
  { name: "Ruta Dorada", at: 10800 },
  { name: "Portal Premio", at: 12800 }
];

function buildLevel() {
  platforms = [];
  // Recorrido ajustado a 14.000px: más largo que el original, pero menos agotador que la versión de 14.000px.
  const ground = [
    [0,720], [900,620], [1700,700], [2700,620], [3650,760], [4700,720],
    [5750,640], [6700,820], [7900,650], [8850,760], [9950,690], [10950,720],
    [12050,640], [13000,860]
  ];
  for (const [x, w] of ground) platforms.push({x, y:610, w, h:90, kind:"ground"});

  const mid = [
    [520,470,240], [1190,420,230], [2050,468,260], [3000,408,230], [3900,455,260],
    [5000,420,280], [6040,460,260], [6900,395,240], [7900,455,300], [9100,420,250],
    [10280,465,270], [11380,405,250], [12360,455,300], [13340,420,270]
  ];
  for (const [x, y, w] of mid) platforms.push({x, y, w, h:32, kind:"mid"});

  const high = [
    [1500,330,190], [3350,315,190], [5400,330,200], [7350,300,200],
    [9300,330,200], [11250,305,205], [13100,325,210]
  ];
  for (const [x, y, w] of high) platforms.push({x, y, w, h:28, kind:"high"});

  boxes = [
    {x:620,y:392,w:72,h:72,type:"normal",hit:false},
    {x:1248,y:342,w:72,h:72,type:"special",hit:false},
    {x:2110,y:388,w:72,h:72,type:"normal",hit:false},
    {x:3048,y:332,w:72,h:72,type:"special",hit:false},
    {x:3948,y:377,w:72,h:72,type:"normal",hit:false},
    {x:5050,y:342,w:72,h:72,type:"special",hit:false},
    {x:6120,y:392,w:72,h:72,type:"normal",hit:false},
    {x:6960,y:325,w:72,h:72,type:"shield",hit:false},
    {x:8000,y:385,w:72,h:72,type:"normal",hit:false},
    {x:9180,y:342,w:72,h:72,type:"special",hit:false},
    {x:10340,y:397,w:72,h:72,type:"normal",hit:false},
    {x:11440,y:335,w:72,h:72,type:"shield",hit:false},
    {x:12470,y:385,w:72,h:72,type:"normal",hit:false},
    {x:13420,y:352,w:72,h:72,type:"final",hit:false}
  ];

  enemies = [];
  const droneData = [
    [980,1540,2.0], [1850,2460,2.15], [3700,4320,2.25], [4750,5360,2.35], [5780,6340,2.45],
    [7950,8500,2.65], [10020,10600,2.75], [12100,12640,2.85], [13200,13620,2.95]
  ];
  for (const [min, max, vx] of droneData) enemies.push({x:min+80,y:548,w:58,h:46,min,max,vx,type:"drone"});

  // Centinelas superiores moderados: impiden el exploit de ir siempre arriba, pero ya no saturan la ruta.
  const sentryData = [
    [2300,2750,205,1.65], [5200,5750,190,1.8], [8050,8650,220,1.95],
    [10750,11380,175,2.05]
  ];
  for (const [min, max, y, vx] of sentryData) enemies.push({x:min+40,y,w:54,h:44,min,max,vx,type:"sentry"});

  // Sin láseres. Asteroides superiores más espaciados: aparecen de vez en cuando como advertencia visual/jugable.
  obstacles = [];
  const asteroidData = [
    [2850,115,38], [6100,145,42], [9300,110,40], [12150,150,44]
  ];
  for (const [x, y, r] of asteroidData) obstacles.push({x,y,r,type:"asteroid"});

  checkpoints = [
    {x:3100,y:506,w:116,h:104,active:false,label:"CP-1"},
    {x:6200,y:506,w:116,h:104,active:false,label:"CP-2"},
    {x:9300,y:506,w:116,h:104,active:false,label:"CP-3"},
    {x:12200,y:506,w:116,h:104,active:false,label:"CP-4"}
  ];

  powerUps = [
    {x:1640,y:288,r:22,type:"boost",taken:false}, {x:3490,y:274,r:22,type:"shield",taken:false},
    {x:5535,y:288,r:22,type:"boost",taken:false}, {x:7380,y:258,r:22,type:"shield",taken:false},
    {x:4300,y:315,r:22,type:"life",taken:false},
    {x:8700,y:300,r:22,type:"life",taken:false},
    {x:11950,y:325,r:22,type:"life",taken:false},
    {x:9460,y:288,r:22,type:"boost",taken:false}, {x:11320,y:268,r:22,type:"shield",taken:false},
    {x:13260,y:290,r:22,type:"boost",taken:false}
  ];

  coinsMap = [];
  addCoinLine(360, 505, 5, 85, 18);
  addCoinLine(1160, 350, 5, 78, 22);
  addCoinLine(1960, 520, 6, 82, -20);
  addCoinLine(2920, 350, 5, 82, 22);
  addCoinLine(3820, 505, 6, 84, -18);
  addCoinLine(4920, 350, 6, 80, 20);
  addCoinLine(5900, 500, 5, 86, -20);
  addCoinLine(6840, 325, 5, 82, 18);
  addCoinLine(7840, 500, 6, 86, -18);
  addCoinLine(9040, 350, 6, 82, 20);
  addCoinLine(10180, 505, 5, 86, -20);
  addCoinLine(11300, 330, 5, 82, 18);
  addCoinLine(12250, 505, 6, 86, -18);
  addCoinLine(13200, 350, 5, 82, 20);
  // Rutas superiores de recompensa, separadas para que no se vean monedas pegadas sin intención.
  [2500, 5700, 8900, 11850, 13250].forEach((base, idx) => {
    addCoinLine(base, idx % 2 ? 150 : 195, 3, 96, 16);
  });
}

function addCoinLine(startX, baseY, count, spacing, amp = 0) {
  for (let i = 0; i < count; i++) {
    const x = startX + i * spacing;
    const y = baseY + Math.sin(i / Math.max(1, count - 1) * Math.PI) * amp;
    // Evita monedas absurdamente pegadas entre rutas.
    if (!coinsMap.some(c => Math.abs(c.x - x) < 48 && Math.abs(c.y - y) < 48)) {
      coinsMap.push({x, y, taken:false});
    }
  }
}

function initStars() {
  stars = [];
  for (let i = 0; i < 380; i++) {
    stars.push({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      r: Math.random() * 1.8 + .35,
      speed: Math.random() * .85 + .12,
      alpha: Math.random() * .65 + .25
    });
  }
}

function resetGame() {
  running = true;
  paused = false;
  won = false;
  coins = 0;
  lives = 5;
  shield = 0;
  cameraX = 0;
  missionTime = 0;
  checkpoint = { x: 100, y: 280 };
  lastHit = 0;
  lastPortalWarning = 0;
  particles = [];
  popups = [];

  ship.x = 100;
  ship.y = 280;
  ship.vx = 0;
  ship.vy = 0;

  buildLevel();
  updateHud("Misión activa");

  startScreen.classList.remove("active");
  deathScreen.classList.remove("active");
  winScreen.classList.remove("active");
  pauseBadge.classList.remove("active");

  cancelAnimationFrame(animationId);
  loop();
}

function loop() {
  update();
  draw();
  if (running) animationId = requestAnimationFrame(loop);
}

function update() {
  if (paused) return;
  missionTime++;

  if (keys.left) ship.vx -= 0.42;
  if (keys.right) ship.vx += 0.42;
  if (keys.up) {
    ship.vy += thrust;
    makeFire(ship.x, ship.y + ship.h / 2);
  }

  ship.vy += gravity;
  ship.vx *= 0.965;
  ship.vy *= 0.985;

  ship.vx = clamp(ship.vx, -ship.maxSpeed, ship.maxSpeed);
  ship.vy = clamp(ship.vy, -10.2, 10.2);

  ship.x += ship.vx;
  ship.y += ship.vy;
  ship.x = clamp(ship.x, 0, levelWidth - ship.w);

  if (ship.y < 18) {
    ship.y = 18;
    ship.vy = 0;
  }

  if (ship.y > canvas.height + 80) {
    takeDamage("Caíste al vacío espacial", true);
  }

  for (const p of platforms) {
    if (overlap(ship, p)) {
      const topCollision = ship.y + ship.h - ship.vy <= p.y + 12;
      if (topCollision && ship.vy >= 0) {
        ship.y = p.y - ship.h;
        ship.vy = -0.8;
      } else {
        takeDamage("Choque con plataforma orbital");
      }
    }
  }

  for (const ob of obstacles) {
    if (ob.type === "asteroid" && circleRect(ob.x, ob.y, ob.r, ship)) takeDamage("Impacto con asteroide superior");
  }

  for (const cp of checkpoints) {
    if (!cp.active && overlap(ship, cp)) {
      cp.active = true;
      checkpoint = { x: cp.x + 24, y: 470 };
      coins += checkpointReward;
      addPopup(`Checkpoint ${cp.label} +${checkpointReward}`, cp.x, cp.y - 20, "#86efac");
      burst(cp.x + cp.w / 2, cp.y + cp.h / 2, "#0A8F43", 34);
      updateHud(`Checkpoint ${cp.label} activado`);
    }
  }

  for (const box of boxes) {
    if (!box.hit && overlap(ship, box)) {
      box.hit = true;
      const amount = box.type === "special" ? 8 : box.type === "final" ? 12 : box.type === "shield" ? 5 : 3;
      coins += amount;
      if (box.type === "shield") shield = Math.min(3, shield + 1);
      const label = box.type === "special" ? "Contenedor premium KSL +8" : box.type === "final" ? "Mega caja KSL +12" : box.type === "shield" ? "Caja escudo +5" : "Caja KSL +3";
      // Recompensa sin sacudir ni empujar la pantalla.
      spawnBoxCoins(box.x + box.w / 2, box.y, amount);
      burst(box.x + box.w / 2, box.y + box.h / 2, box.type === "normal" ? "#0D2E8B" : "#F2C10A", 22);
      addPopup(label, box.x, box.y - 12, box.type === "shield" ? "#60a5fa" : "#F2C10A");
      updateHud(label);
    }
  }

  for (const pu of powerUps) {
    if (!pu.taken && circleRect(pu.x, pu.y, pu.r, ship)) {
      pu.taken = true;
      if (pu.type === "shield") {
        shield = Math.min(3, shield + 1);
        updateHud("Escudo KSL activado");
        addPopup("ESCUDO", pu.x, pu.y - 20, "#60a5fa");
        burst(pu.x, pu.y, "#60a5fa", 28);
      } else if (pu.type === "life") {
        lives = Math.min(5, lives + 1);
        updateHud("Vida KSL recuperada");
        addPopup("+1 VIDA", pu.x, pu.y - 20, "#86efac");
        burst(pu.x, pu.y, "#86efac", 30);
      } else {
        ship.vx += ship.vx >= 0 ? 5.5 : -5.5;
        ship.vy = -7.2;
        updateHud("Impulso turbo KSL");
        addPopup("TURBO", pu.x, pu.y - 20, "#F2C10A");
        burst(pu.x, pu.y, "#F2C10A", 28);
      }
    }
  }

  for (const c of coinsMap) {
    if (!c.taken && circleRect(c.x, c.y, 18, ship)) {
      c.taken = true;
      coins += 1;
      addPopup("+1", c.x, c.y - 14, "#F2C10A");
      burst(c.x, c.y, "#F2C10A", 10);
      updateHud("+1 moneda KSL");
    }
  }

  for (const e of enemies) {
    e.x += e.vx;
    if (e.x < e.min || e.x > e.max) e.vx *= -1;
    if (e.type === "sentry") e.y += Math.sin((missionTime + e.x) / 38) * .55;
    if (overlap(ship, e)) takeDamage(e.type === "sentry" ? "Impacto con centinela aéreo" : "Impacto con dron enemigo");
  }

  if (overlap(ship, portal)) {
    if (coins >= maxCoins) win(); else needMoreCoins();
  }

  const targetCameraX = clamp(ship.x - canvas.width * 0.30, 0, levelWidth - canvas.width);
  cameraX += (targetCameraX - cameraX) * 0.12;

  for (const p of particles) {
    p.x += p.vx;
    p.y += p.vy;
    p.vy += p.g || 0;
    p.life--;
  }
  particles = particles.filter(p => p.life > 0);

  for (const pop of popups) {
    pop.y -= .7;
    pop.life--;
  }
  popups = popups.filter(p => p.life > 0);

  sectorEl.textContent = getSectorName();
}

function updateHud(message) {
  coinsEl.textContent = `${coins}/${maxCoins}`;
  livesEl.textContent = lives;
  shieldEl.textContent = shield;
  statusEl.textContent = message;
  sectorEl.textContent = getSectorName();
}

function getSectorName() {
  let name = sectors[0].name;
  for (const s of sectors) if (ship.x >= s.at) name = s.name;
  return name;
}

function takeDamage(reason, fall = false) {
  const now = Date.now();
  if (now - lastHit < 1050) return;
  lastHit = now;

  if (shield > 0 && !fall) {
    shield--;
    ship.vx *= .35;
    ship.vy *= .35;
    burst(ship.x + ship.w/2, ship.y + ship.h/2, "#60a5fa", 34);
    addPopup("Escudo absorbió daño", ship.x, ship.y - 20, "#60a5fa");
    updateHud("Escudo KSL usado");
    return;
  }

  lives--;
  updateHud(reason);
  burst(ship.x + ship.w/2, ship.y + ship.h/2, "#E01818", 28);
  addPopup("-1 vida", ship.x, ship.y - 20, "#fb7185");

  ship.vx *= .28;
  ship.vy *= .28;

  if (fall) {
    ship.x = checkpoint.x;
    ship.y = checkpoint.y;
    ship.vx = 0;
    ship.vy = 0;
  }

  if (lives <= 0) die();
}

function die() {
  running = false;
  cancelAnimationFrame(animationId);
  deathCoinsEl.textContent = coins;
  deathScreen.classList.add("active");
}

function needMoreCoins() {
  const now = Date.now();
  if (now - lastPortalWarning < 1300) return;
  lastPortalWarning = now;

  const missing = Math.max(0, maxCoins - coins);
  updateHud(`Faltan ${missing} monedas para reclamar el premio`);
  addPopup(`Faltan ${missing}`, ship.x, ship.y - 26, "#F2C10A");
  burst(ship.x + ship.w / 2, ship.y + ship.h / 2, "#F2C10A", 18);

  ship.x = Math.max(0, ship.x - 160);
  ship.vx = -5;
  ship.vy = -4;
}

function win() {
  if (won) return;
  won = true;
  running = false;
  cancelAnimationFrame(animationId);
  if (coins > bestCoins) {
    bestCoins = coins;
    localStorage.setItem("ksl_best_coins", String(bestCoins));
  }
  winCoinsEl.textContent = `${coins} — récord: ${bestCoins}`;
  updateHud("Premio desbloqueado");
  winScreen.classList.add("active");
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawSpace();

  ctx.save();
  ctx.translate(-cameraX, 0);
  drawNebulas();
  drawPlanets();
  drawComets();
  drawPlatforms();
  drawObstacles();
  drawCheckpoints();
  drawBoxes();
  drawPowerUps();
  drawCoins();
  drawEnemies();
  drawPortal();
  drawParticles();
  drawPopups();
  drawShip();
  ctx.restore();

  drawDistanceBar();
  drawMiniTips();
}

function drawSpace() {
  const bg = ctx.createLinearGradient(0, 0, 0, canvas.height);
  bg.addColorStop(0, "#00020a");
  bg.addColorStop(.42, "#06112b");
  bg.addColorStop(.75, "#070b18");
  bg.addColorStop(1, "#020617");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  for (const s of stars) {
    s.x -= s.speed;
    if (s.x < -5) { s.x = canvas.width + 5; s.y = Math.random() * canvas.height; }
    ctx.globalAlpha = s.alpha;
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function drawNebulas() {
  const nebulas = [
    {x:520,y:150,r:260,c:"rgba(13,46,139,.30)"}, {x:1820,y:230,r:280,c:"rgba(10,143,67,.20)"},
    {x:3180,y:130,r:260,c:"rgba(242,193,10,.17)"}, {x:4650,y:190,r:300,c:"rgba(224,24,24,.18)"},
    {x:6150,y:150,r:320,c:"rgba(13,46,139,.27)"}, {x:7600,y:220,r:280,c:"rgba(10,143,67,.20)"},
    {x:9300,y:170,r:320,c:"rgba(242,193,10,.15)"}, {x:11100,y:210,r:300,c:"rgba(224,24,24,.15)"},
    {x:13200,y:150,r:330,c:"rgba(13,46,139,.25)"}, {x:15100,y:205,r:300,c:"rgba(10,143,67,.18)"},
    {x:17150,y:155,r:330,c:"rgba(242,193,10,.14)"}, {x:19000,y:220,r:310,c:"rgba(224,24,24,.16)"}
  ];
  for (const n of nebulas) {
    const g = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, n.r);
    g.addColorStop(0, n.c);
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawPlanets() {
  drawPlanet(900, 150, 70, "#0D2E8B", "#60a5fa");
  drawPlanet(2700, 120, 52, "#0A8F43", "#86efac");
  drawPlanet(5200, 150, 82, "#E01818", "#fb7185");
  drawPlanet(7200, 110, 56, "#F2C10A", "#fde68a");
  drawPlanet(9700, 145, 68, "#312e81", "#a5b4fc");
  drawPlanet(12350, 125, 50, "#0f766e", "#5eead4");
  drawPlanet(15150, 155, 78, "#7c2d12", "#fdba74");
  drawPlanet(18000, 120, 62, "#1e3a8a", "#93c5fd");
}

function drawPlanet(x, y, r, color, ring) {
  const g = ctx.createRadialGradient(x-r*.35, y-r*.45, 5, x, y, r);
  g.addColorStop(0, "rgba(255,255,255,.55)");
  g.addColorStop(.18, color);
  g.addColorStop(1, "#020617");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = ring;
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.ellipse(x, y, r * 1.45, r * .35, -0.35, 0, Math.PI * 2);
  ctx.stroke();
}

function drawComets() {
  for (let x = 1400; x < levelWidth; x += 3100) {
    const y = 80 + ((x / 100) % 140);
    ctx.strokeStyle = "rgba(255,255,255,.35)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x - 120, y + 45);
    ctx.stroke();
    ctx.fillStyle = "rgba(255,255,255,.85)";
    ctx.beginPath();
    ctx.arc(x, y, 5, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawPlatforms() {
  for (const p of platforms) {
    const grad = ctx.createLinearGradient(p.x, p.y, p.x, p.y + p.h);
    grad.addColorStop(0, p.kind === "ground" ? "#334155" : "#1f3b5a");
    grad.addColorStop(1, "#0f172a");
    ctx.fillStyle = grad;
    roundRect(p.x, p.y, p.w, p.h, 18);
    ctx.fillStyle = p.kind === "high" ? "#F2C10A" : "#D9D9D9";
    ctx.fillRect(p.x + 6, p.y, p.w - 12, 10);
    ctx.fillStyle = "rgba(255,255,255,.15)";
    for (let x = p.x + 24; x < p.x + p.w - 24; x += 62) ctx.fillRect(x, p.y + 28, 36, 10);
  }
}

function drawObstacles() {
  for (const ob of obstacles) {
    if (ob.type !== "asteroid") continue;
    const g = ctx.createRadialGradient(ob.x - ob.r*.3, ob.y - ob.r*.35, 4, ob.x, ob.y, ob.r);
    g.addColorStop(0, "#f8fafc");
    g.addColorStop(.25, "#64748b");
    g.addColorStop(1, "#1e293b");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(ob.x, ob.y, ob.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,.35)";
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.fillStyle = "rgba(15,23,42,.55)";
    ctx.beginPath(); ctx.arc(ob.x + ob.r*.25, ob.y - ob.r*.1, ob.r*.18, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.arc(ob.x - ob.r*.2, ob.y + ob.r*.22, ob.r*.12, 0, Math.PI*2); ctx.fill();
  }
}

function drawCheckpoints() {
  for (const cp of checkpoints) {
    const cx = cp.x + cp.w / 2;
    const baseY = cp.y + cp.h - 8;
    const pulse = Math.sin(missionTime / 16 + cp.x) * 0.5 + 0.5;
    ctx.save();

    // Baliza de guardado KSL: más limpia y menos parecida a un portal.
    ctx.shadowColor = cp.active ? "#22c55e" : "#F2C10A";
    ctx.shadowBlur = cp.active ? 18 : 10 + pulse * 8;

    const baseGrad = ctx.createLinearGradient(cp.x, cp.y, cp.x, cp.y + cp.h);
    baseGrad.addColorStop(0, cp.active ? "#86efac" : "#fde68a");
    baseGrad.addColorStop(.45, cp.active ? "#0A8F43" : "#0D2E8B");
    baseGrad.addColorStop(1, "#020617");
    ctx.fillStyle = baseGrad;
    roundRect(cp.x + 28, cp.y + 28, cp.w - 56, cp.h - 24, 14);

    ctx.shadowBlur = 0;
    ctx.fillStyle = "rgba(255,255,255,.18)";
    ctx.fillRect(cx - 12, cp.y + 36, 24, cp.h - 44);
    ctx.fillStyle = cp.active ? "#bbf7d0" : "#fff7cc";
    ctx.beginPath();
    ctx.arc(cx, cp.y + 26, 22 + pulse * 3, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = cp.active ? "#22c55e" : "#F2C10A";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(cx, cp.y + 26, 34 + pulse * 6, 0, Math.PI * 2);
    ctx.stroke();

    ctx.fillStyle = "rgba(2,6,23,.86)";
    roundRect(cp.x + 8, baseY - 30, cp.w - 16, 36, 12);
    ctx.fillStyle = cp.active ? "#86efac" : "#F2C10A";
    ctx.font = "900 15px Arial";
    ctx.textAlign = "center";
    ctx.fillText(cp.active ? "GUARDADO" : cp.label, cx, baseY - 8);

    ctx.fillStyle = "rgba(255,255,255,.22)";
    ctx.fillRect(cp.x + 18, baseY + 4, cp.w - 36, 6);
    ctx.textAlign = "left";
    ctx.restore();
  }
}

function drawBoxes() {
  for (const b of boxes) {
    ctx.save();
    if (b.hit) ctx.globalAlpha = .25;
    const primary = b.type === "normal" ? "#0D2E8B" : b.type === "shield" ? "#38bdf8" : b.type === "special" ? "#F2C10A" : "#0A8F43";
    const secondary = b.type === "special" || b.type === "final" ? "#111827" : "#ffffff";
    ctx.shadowColor = primary;
    ctx.shadowBlur = b.hit ? 0 : 18;
    const g = ctx.createLinearGradient(b.x, b.y, b.x + b.w, b.y + b.h);
    g.addColorStop(0, "#f8fafc");
    g.addColorStop(.18, primary);
    g.addColorStop(1, "#020617");
    ctx.fillStyle = g;
    roundRect(b.x, b.y, b.w, b.h, 18);
    ctx.shadowBlur = 0;
    ctx.fillStyle = "rgba(255,255,255,.18)";
    ctx.beginPath();
    ctx.moveTo(b.x + 12, b.y + 10);
    ctx.lineTo(b.x + b.w - 12, b.y + 10);
    ctx.lineTo(b.x + b.w - 24, b.y + 28);
    ctx.lineTo(b.x + 24, b.y + 28);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,.78)";
    ctx.lineWidth = 3;
    roundStroke(b.x + 7, b.y + 7, b.w - 14, b.h - 14, 14);
    ctx.fillStyle = secondary;
    ctx.font = "900 21px Arial";
    ctx.textAlign = "center";
    ctx.fillText("KSL", b.x + b.w/2, b.y + 42);
    ctx.font = "900 11px Arial";
    ctx.fillText(b.type === "shield" ? "ESCUDO" : b.type === "final" ? "MEGA" : b.type === "special" ? "PLUS" : "BOX", b.x + b.w/2, b.y + 57);
    ctx.textAlign = "left";
    ctx.restore();
  }
}

function drawPowerUps() {
  for (const pu of powerUps) {
    if (pu.taken) continue;
    const pulse = Math.sin(missionTime / 12 + pu.x) * 3;
    const color = pu.type === "shield" ? "rgba(96,165,250,.9)" : pu.type === "life" ? "rgba(134,239,172,.92)" : "rgba(242,193,10,.92)";
    ctx.save();
    ctx.shadowColor = pu.type === "shield" ? "#60a5fa" : pu.type === "life" ? "#86efac" : "#F2C10A";
    ctx.shadowBlur = 18;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(pu.x, pu.y, pu.r + pulse, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "white";
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.fillStyle = "#020617";
    ctx.font = "900 18px Arial";
    ctx.textAlign = "center";
    ctx.fillText(pu.type === "shield" ? "S" : pu.type === "life" ? "+" : "T", pu.x, pu.y + 7);
    ctx.textAlign = "left";
    ctx.restore();
  }
}

function drawCoins() {
  for (const c of coinsMap) {
    if (c.taken) continue;
    const pulse = Math.sin(missionTime / 12 + c.x) * 1.5;
    const g = ctx.createRadialGradient(c.x - 5, c.y - 8, 2, c.x, c.y, 23);
    g.addColorStop(0, "#fff7ad");
    g.addColorStop(.45, "#F2C10A");
    g.addColorStop(1, "#92400e");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(c.x, c.y, 16 + pulse*.2, 21 + pulse, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#fff3b0";
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.fillStyle = "#0A8F43";
    ctx.font = "900 13px Arial";
    ctx.fillText("K", c.x - 4, c.y + 5);
  }
}

function drawEnemies() {
  for (const e of enemies) {
    ctx.save();
    ctx.shadowColor = e.type === "sentry" ? "#F2C10A" : "#E01818";
    ctx.shadowBlur = 12;
    ctx.fillStyle = e.type === "sentry" ? "#7f1d1d" : "#E01818";
    roundRect(e.x, e.y, e.w, e.h, 14);
    ctx.shadowBlur = 0;
    ctx.fillStyle = "#111827";
    ctx.fillRect(e.x + 9, e.y + 12, e.w - 18, 13);
    ctx.fillStyle = e.type === "sentry" ? "#F2C10A" : "#60a5fa";
    ctx.beginPath();
    ctx.arc(e.x + 18, e.y + 18, 4.5, 0, Math.PI * 2);
    ctx.arc(e.x + 40, e.y + 18, 4.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#D9D9D9";
    ctx.fillRect(e.x + 24, e.y + 40, 10, 16);
    ctx.restore();
  }
}

function drawPortal() {
  const cx = portal.x + portal.w / 2;
  const cy = portal.y + portal.h / 2;
  const pulse = Math.sin(missionTime / 18) * 10;
  const g = ctx.createRadialGradient(cx, cy, 5, cx, cy, 185 + pulse);
  g.addColorStop(0, "rgba(242,193,10,.95)");
  g.addColorStop(.45, "rgba(10,143,67,.65)");
  g.addColorStop(1, "rgba(13,46,139,0)");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(cx, cy, 185 + pulse, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#F2C10A";
  ctx.lineWidth = 10;
  ctx.beginPath();
  ctx.ellipse(cx, cy, 65 + pulse * .08, 130 + pulse * .18, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = "#0A8F43";
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.ellipse(cx, cy, 92, 155, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = "white";
  ctx.font = "900 28px Arial";
  ctx.fillText("PREMIO", portal.x - 2, portal.y - 42);
  ctx.font = "900 18px Arial";
  ctx.fillStyle = "#F2C10A";
  ctx.fillText(`${maxCoins} MONEDAS`, portal.x - 8, portal.y - 16);
}

function drawShip() {
  const x = ship.x;
  const y = ship.y;
  const cx = x + ship.w / 2;
  const cy = y + ship.h / 2;
  const thrustOn = keys.up || Math.abs(ship.vx) > 1.5;

  // Propulsión con doble núcleo, más limpia y sin afectar la física del juego.
  if (thrustOn) {
    const flicker = Math.random() * 10;
    const flameOuter = ctx.createLinearGradient(x - 58, cy, x + 12, cy);
    flameOuter.addColorStop(0, "rgba(37,99,235,0)");
    flameOuter.addColorStop(.35, "rgba(96,165,250,.78)");
    flameOuter.addColorStop(1, "rgba(14,165,233,.94)");
    ctx.fillStyle = flameOuter;
    ctx.beginPath();
    ctx.moveTo(x + 8, cy - 15);
    ctx.lineTo(x - 50 - flicker, cy);
    ctx.lineTo(x + 8, cy + 15);
    ctx.closePath();
    ctx.fill();

    const flameInner = ctx.createLinearGradient(x - 34, cy, x + 10, cy);
    flameInner.addColorStop(0, "rgba(242,193,10,0)");
    flameInner.addColorStop(.55, "rgba(242,193,10,.88)");
    flameInner.addColorStop(1, "rgba(255,255,255,.95)");
    ctx.fillStyle = flameInner;
    ctx.beginPath();
    ctx.moveTo(x + 7, cy - 8);
    ctx.lineTo(x - 29 - flicker * .65, cy);
    ctx.lineTo(x + 7, cy + 8);
    ctx.closePath();
    ctx.fill();
  }

  if (shield > 0) {
    const shieldPulse = Math.sin(missionTime * .08) * 2;
    ctx.strokeStyle = "rgba(96,165,250,.78)";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.ellipse(cx, cy, 70 + shieldPulse, 48 + shieldPulse, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = "rgba(242,193,10,.22)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(cx, cy, 77 + shieldPulse, 54 + shieldPulse, 0, 0, Math.PI * 2);
    ctx.stroke();
  }

  const glow = ctx.createRadialGradient(cx, cy, 5, cx, cy, 92);
  glow.addColorStop(0, "rgba(10,143,67,.22)");
  glow.addColorStop(.45, "rgba(13,46,139,.18)");
  glow.addColorStop(1, "rgba(13,46,139,0)");
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(cx, cy, 92, 0, Math.PI * 2);
  ctx.fill();

  ctx.save();
  ctx.translate(x, y);

  // Alas traseras estilo caza espacial KSL.
  const blueWing = ctx.createLinearGradient(6, -20, 52, 34);
  blueWing.addColorStop(0, "#0D2E8B");
  blueWing.addColorStop(.65, "#2563eb");
  blueWing.addColorStop(1, "#93c5fd");
  ctx.fillStyle = blueWing;
  ctx.beginPath();
  ctx.moveTo(42, 12);
  ctx.lineTo(7, -24);
  ctx.lineTo(22, 21);
  ctx.lineTo(50, 25);
  ctx.closePath();
  ctx.fill();

  const redWing = ctx.createLinearGradient(6, 78, 52, 28);
  redWing.addColorStop(0, "#E01818");
  redWing.addColorStop(.65, "#ef4444");
  redWing.addColorStop(1, "#fecaca");
  ctx.fillStyle = redWing;
  ctx.beginPath();
  ctx.moveTo(42, 42);
  ctx.lineTo(7, 78);
  ctx.lineTo(22, 33);
  ctx.lineTo(50, 29);
  ctx.closePath();
  ctx.fill();

  // Sombra técnica bajo el casco.
  ctx.fillStyle = "rgba(0,0,0,.34)";
  ctx.beginPath();
  ctx.ellipse(49, 34, 56, 23, 0, 0, Math.PI * 2);
  ctx.fill();

  // Casco principal con degradado metálico.
  const hull = ctx.createLinearGradient(3, 0, 100, 55);
  hull.addColorStop(0, "#f8fafc");
  hull.addColorStop(.28, "#cbd5e1");
  hull.addColorStop(.52, "#f1f5f9");
  hull.addColorStop(.78, "#94a3b8");
  hull.addColorStop(1, "#e5e7eb");
  ctx.fillStyle = hull;
  ctx.beginPath();
  ctx.moveTo(100, 27);
  ctx.bezierCurveTo(84, 7, 61, 0, 35, 7);
  ctx.bezierCurveTo(18, 11, 4, 19, -10, 27);
  ctx.bezierCurveTo(4, 35, 18, 43, 35, 47);
  ctx.bezierCurveTo(61, 54, 84, 47, 100, 27);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = "rgba(226,232,240,.95)";
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.strokeStyle = "rgba(15,23,42,.46)";
  ctx.lineWidth = 1.3;
  ctx.stroke();

  // Nariz amarilla integrada, como en la referencia visual.
  const nose = ctx.createLinearGradient(66, 10, 101, 44);
  nose.addColorStop(0, "#fde047");
  nose.addColorStop(.45, "#F2C10A");
  nose.addColorStop(1, "#b45309");
  ctx.fillStyle = nose;
  ctx.beginPath();
  ctx.moveTo(100, 27);
  ctx.lineTo(65, 11);
  ctx.bezierCurveTo(74, 23, 74, 31, 65, 43);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = "rgba(120,53,15,.55)";
  ctx.lineWidth = 1.2;
  ctx.stroke();

  // Paneles azules y rojos laterales.
  ctx.fillStyle = "#0D2E8B";
  ctx.beginPath();
  ctx.moveTo(28, 10);
  ctx.lineTo(56, 6);
  ctx.lineTo(47, 18);
  ctx.lineTo(21, 22);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = "#E01818";
  ctx.beginPath();
  ctx.moveTo(28, 44);
  ctx.lineTo(56, 48);
  ctx.lineTo(47, 36);
  ctx.lineTo(21, 32);
  ctx.closePath();
  ctx.fill();

  // Emblema verde tipo trazo KSL sobre el fuselaje.
  ctx.strokeStyle = "#0A8F43";
  ctx.lineWidth = 8;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(22, 38);
  ctx.bezierCurveTo(37, 7, 64, 10, 78, 27);
  ctx.stroke();
  ctx.strokeStyle = "rgba(187,247,208,.8)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(24, 37);
  ctx.bezierCurveTo(39, 11, 61, 13, 75, 27);
  ctx.stroke();

  // Cabina con brillo.
  const canopy = ctx.createLinearGradient(45, 15, 78, 36);
  canopy.addColorStop(0, "#020617");
  canopy.addColorStop(.55, "#0f172a");
  canopy.addColorStop(1, "#38bdf8");
  ctx.fillStyle = canopy;
  ctx.beginPath();
  ctx.ellipse(64, 25, 18, 10, -.05, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "rgba(14,165,233,.9)";
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = "rgba(125,211,252,.9)";
  ctx.beginPath();
  ctx.ellipse(69, 21, 6, 3.2, 0, 0, Math.PI * 2);
  ctx.fill();

  // Motores traseros.
  const engineGrad = ctx.createLinearGradient(-4, 18, 16, 36);
  engineGrad.addColorStop(0, "#111827");
  engineGrad.addColorStop(.5, "#475569");
  engineGrad.addColorStop(1, "#020617");
  ctx.fillStyle = engineGrad;
  ctx.beginPath();
  ctx.roundRect(-4, 18, 22, 18, 7);
  ctx.fill();
  ctx.strokeStyle = "#64748b";
  ctx.lineWidth = 1.4;
  ctx.stroke();
  ctx.fillStyle = thrustOn ? "#60a5fa" : "#1e293b";
  ctx.beginPath();
  ctx.arc(1, 27, 4.8, 0, Math.PI * 2);
  ctx.fill();

  // Líneas de placas para que no se vea plano.
  ctx.strokeStyle = "rgba(15,23,42,.32)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(31, 14);
  ctx.lineTo(44, 24);
  ctx.lineTo(31, 40);
  ctx.moveTo(51, 9);
  ctx.lineTo(60, 20);
  ctx.moveTo(51, 45);
  ctx.lineTo(60, 34);
  ctx.stroke();

  ctx.fillStyle = "#0A8F43";
  ctx.font = "900 10px Arial";
  ctx.fillText("KSL", 34, 32);

  ctx.restore();
}
function drawParticles() {
  for (const p of particles) {
    ctx.globalAlpha = Math.max(0, p.life / p.maxLife);
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }
}

function drawPopups() {
  for (const p of popups) {
    ctx.globalAlpha = Math.max(0, p.life / p.maxLife);
    ctx.fillStyle = p.color;
    ctx.font = "900 20px Arial";
    ctx.fillText(p.text, p.x, p.y);
    ctx.globalAlpha = 1;
  }
}

function drawDistanceBar() {
  const margin = 26;
  const w = canvas.width - margin * 2;
  const h = 10;
  const progress = clamp(ship.x / (levelWidth - ship.w), 0, 1);
  ctx.fillStyle = "rgba(255,255,255,.18)";
  roundRect(margin, 22, w, h, 8);
  const grad = ctx.createLinearGradient(margin, 0, margin + w, 0);
  grad.addColorStop(0, "#0D2E8B");
  grad.addColorStop(.5, "#0A8F43");
  grad.addColorStop(1, "#F2C10A");
  ctx.fillStyle = grad;
  roundRect(margin, 22, w * progress, h, 8);
  ctx.fillStyle = "#ffffff";
  ctx.font = "900 16px Arial";
  ctx.fillText(`${Math.floor(progress * 100)}%`, margin, 18);
  ctx.fillText("META", margin + w - 48, 18);
}

function drawMiniTips() {
  if (!running || paused || missionTime > 500) return;
  ctx.fillStyle = "rgba(2,6,23,.68)";
  roundRect(30, canvas.height - 78, 700, 48, 16);
  ctx.fillStyle = "#e5e7eb";
  ctx.font = "900 18px Arial";
  ctx.fillText("Tip: ruta superior más segura, pero aún hay asteroides ocasionales y centinelas. Reúne 80 monedas.", 48, canvas.height - 47);
}

function spawnBoxCoins(x, y, amount) {
  for (let i = 0; i < amount * 4; i++) particles.push({x, y, vx: Math.random() * 6 - 3, vy: Math.random() * -6 - 1.5, r: Math.random() * 4 + 2, color: Math.random() > .25 ? "#F2C10A" : "#ffffff", life: 46, maxLife: 46, g: .16});
}

function makeFire(x, y) {
  particles.push({x, y, vx: Math.random() * -5 - 1, vy: Math.random() * 3 - 1.5, r: Math.random() * 4 + 2, color: Math.random() > .5 ? "#60a5fa" : "#F2C10A", life: 18, maxLife: 18, g: 0});
}

function burst(x, y, color, count) {
  for (let i = 0; i < count; i++) particles.push({x, y, vx: Math.random() * 9 - 4.5, vy: Math.random() * 9 - 4.5, r: Math.random() * 4.5 + 2, color, life: 34, maxLife: 34, g: .04});
}

function addPopup(text, x, y, color) {
  popups.push({ text, x, y, color, life: 70, maxLife: 70 });
}

function overlap(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

function circleRect(cx, cy, r, rect) {
  const tx = Math.max(rect.x, Math.min(cx, rect.x + rect.w));
  const ty = Math.max(rect.y, Math.min(cy, rect.y + rect.h));
  const dx = cx - tx;
  const dy = cy - ty;
  return dx * dx + dy * dy <= r * r;
}

function roundRect(x, y, w, h, r) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  ctx.fill();
}

function roundStroke(x, y, w, h, r) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  ctx.stroke();
}

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function togglePause() {
  if (!running || won) return;
  paused = !paused;
  pauseBadge.classList.toggle("active", paused);
  statusEl.textContent = paused ? "Juego en pausa" : "Misión activa";
}

function bindHoldButton(id, key) {
  const btn = document.getElementById(id);
  const on = (e) => { e.preventDefault(); keys[key] = true; };
  const off = (e) => { e.preventDefault(); keys[key] = false; };
  btn.addEventListener("mousedown", on);
  btn.addEventListener("mouseup", off);
  btn.addEventListener("mouseleave", off);
  btn.addEventListener("touchstart", on, { passive: false });
  btn.addEventListener("touchend", off, { passive: false });
  btn.addEventListener("touchcancel", off, { passive: false });
}

document.getElementById("startBtn").addEventListener("click", resetGame);
document.getElementById("retryBtn").addEventListener("click", resetGame);
document.getElementById("playAgainBtn").addEventListener("click", resetGame);

document.addEventListener("keydown", (e) => {
  if (e.key === "ArrowLeft" || e.key.toLowerCase() === "a") keys.left = true;
  if (e.key === "ArrowRight" || e.key.toLowerCase() === "d") keys.right = true;
  if (e.key === "ArrowUp" || e.code === "Space" || e.key.toLowerCase() === "w") {
    e.preventDefault();
    keys.up = true;
  }
  if (e.key.toLowerCase() === "p") togglePause();
});

document.addEventListener("keyup", (e) => {
  if (e.key === "ArrowLeft" || e.key.toLowerCase() === "a") keys.left = false;
  if (e.key === "ArrowRight" || e.key.toLowerCase() === "d") keys.right = false;
  if (e.key === "ArrowUp" || e.code === "Space" || e.key.toLowerCase() === "w") keys.up = false;
});

bindHoldButton("leftBtn", "left");
bindHoldButton("rightBtn", "right");
bindHoldButton("upBtn", "up");

initStars();
buildLevel();
updateHud("Listo");
draw();
