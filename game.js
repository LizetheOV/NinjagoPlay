'use strict';

const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
const W = 800;
const H = 600;

// ── Input ─────────────────────────────────────────────────────────────────────
const keys = {};
const justPressed = {};

window.addEventListener('keydown', e => {
  Sound.unlock();
  if (e.code === 'KeyM' && !keys[e.code]) Sound.toggleMute();
  justPressed[e.code] = !keys[e.code];
  keys[e.code] = true;
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code))
    e.preventDefault();
});
window.addEventListener('keyup', e => { keys[e.code] = false; });

function pressed(code) {
  const val = justPressed[code];
  justPressed[code] = false;
  return val;
}

// Puntero (Pointer Events: ratón y pantallas táctiles).
// `mouse` es el punto al que Lloyd se dirige, en coordenadas del juego.
//  - Ratón: Lloyd sigue al cursor; clic izquierdo = tajo (igual que Espacio).
//  - Táctil: arrastrar el dedo mueve a Lloyd en relativo (como un trackpad),
//    así el dedo no lo tapa; cada toque nuevo da un tajo. Con dos dedos se
//    puede mover con uno y cortar tocando con el otro.
const mouse = { x: W / 2, y: H / 2, clicked: false };
const TOUCH_SENS = 1.6;            // px del juego por px de dedo (escalado)
const touches = new Map();         // pointerId → última posición en pantalla
const isTouchDevice = window.matchMedia('(pointer: coarse)').matches;

const clampX = x => Math.max(0, Math.min(W, x));
const clampY = y => Math.max(0, Math.min(H, y));

function pointerToGame(e) {
  const r = canvas.getBoundingClientRect();
  mouse.x = clampX((e.clientX - r.left) * W / r.width);
  mouse.y = clampY((e.clientY - r.top)  * H / r.height);
}

// Botón de sonido (esquina superior izquierda, bajo el puntaje)
const MUTE_BTN = { x: 8, y: 36, w: 34, h: 30 };

function hitsMuteButton(e) {
  const r = canvas.getBoundingClientRect();
  const x = (e.clientX - r.left) * W / r.width;
  const y = (e.clientY - r.top)  * H / r.height;
  return x >= MUTE_BTN.x && x <= MUTE_BTN.x + MUTE_BTN.w &&
         y >= MUTE_BTN.y && y <= MUTE_BTN.y + MUTE_BTN.h;
}

window.addEventListener('pointerdown', e => {
  Sound.unlock();
  if (hitsMuteButton(e)) {            // no cuenta como tajo
    Sound.toggleMute();
    e.preventDefault();
    return;
  }
  if (e.pointerType === 'mouse') {
    if (e.button !== 0) return;
    pointerToGame(e);
  } else {
    touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
  }
  mouse.clicked = true;
  e.preventDefault();
}, { passive: false });

window.addEventListener('pointermove', e => {
  if (e.pointerType === 'mouse') { pointerToGame(e); return; }
  const last = touches.get(e.pointerId);
  if (!last) return;
  const r = canvas.getBoundingClientRect();
  mouse.x = clampX(mouse.x + (e.clientX - last.x) * W / r.width  * TOUCH_SENS);
  mouse.y = clampY(mouse.y + (e.clientY - last.y) * H / r.height * TOUCH_SENS);
  last.x = e.clientX;
  last.y = e.clientY;
  e.preventDefault();
}, { passive: false });

for (const type of ['pointerup', 'pointercancel'])
  window.addEventListener(type, e => touches.delete(e.pointerId));

// Sin menú contextual (mantener pulsado en móvil / clic derecho)
window.addEventListener('contextmenu', e => e.preventDefault());

// Tajo pedido este frame (clic o Espacio); consume ambas entradas
function slashPressed() {
  const clicked = mouse.clicked;
  mouse.clicked = false;
  return pressed('Space') || clicked;
}

// ── Utils ─────────────────────────────────────────────────────────────────────
const wrap  = (v, max) => ((v % max) + max) % max;
const dist  = (a, b)   => Math.hypot(a.x - b.x, a.y - b.y);
const rand  = (min, max) => min + Math.random() * (max - min);
const randInt = (min, max) => Math.floor(rand(min, max + 1));
// Diferencia angular normalizada a [-π, π]
const angleDiff = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));

// ── Sprites (Lloyd y Garmadon) ────────────────────────────────────────────────
function loadImage(src) {
  const img = new Image();
  img.src = src;
  return img;
}
const imgReady = img => img.complete && img.naturalWidth > 0;

const lloydImg    = loadImage('assets/lloyd.png');
// La misma imagen separada en dos capas alineadas (mismo tamaño 345×461):
// Lloyd sin espada y la espada sola. Se usan en la animación de muerte final.
const lloydBodyImg  = loadImage('assets/lloyd-body.png');
const lloydSwordImg = loadImage('assets/lloyd-sword.png');
const garmadonImg = loadImage('assets/garmadon.png');
const starImg     = loadImage('assets/estrella.png');
const serpentImg  = loadImage('assets/serpentin.webp');
const spriteReady = () => imgReady(lloydImg);

// Copias pre-escaladas de cada sprite por altura (y brillo opcional). Reducir
// la imagen en pasos de a la mitad (en vez de un solo drawImage grande) evita
// bordes dentados.
const spriteCache = new Map();

// ── Pantalla ──────────────────────────────────────────────────────────────────
// El juego siempre usa coordenadas lógicas de W×H. El canvas se escala para
// ocupar la ventana (manteniendo 4:3) y su resolución interna sigue la
// densidad de píxeles de la pantalla, para que se vea nítido en móviles.
let renderScale = 1;   // píxeles reales del canvas por unidad lógica

function resizeCanvas() {
  const fit  = Math.min(window.innerWidth / W, window.innerHeight / H);
  const cssW = Math.floor(W * fit);
  const cssH = Math.floor(H * fit);
  const dpr  = Math.min(window.devicePixelRatio || 1, 2);   // tope: rendimiento
  canvas.style.width  = cssW + 'px';
  canvas.style.height = cssH + 'px';
  canvas.width  = Math.round(cssW * dpr);
  canvas.height = Math.round(cssH * dpr);
  renderScale = canvas.width / W;
  ctx.setTransform(renderScale, 0, 0, renderScale, 0, 0);
  spriteCache.clear();   // los sprites se re-escalan a la nueva resolución
}

// Los sprites se generan a la resolución real (altura lógica × renderScale)
// y se dibujan con su tamaño lógico, así quedan 1:1 con los píxeles.
// `tint` (color CSS) devuelve una silueta del sprite pintada de ese color,
// para superponerla (p. ej. el destello rojo de Lloyd herido).
function getSprite(img, logicalHeight, glow = null, tint = null) {
  const height = Math.max(1, Math.round(logicalHeight * renderScale));
  const key = `${img.src}|${height}|${glow ? glow.color + glow.blur : ''}|${tint || ''}`;
  let cached = spriteCache.get(key);
  if (cached) return cached;
  const w = Math.round(height * img.naturalWidth / img.naturalHeight);
  let src = img, sw = img.naturalWidth, sh = img.naturalHeight;
  while (sw / 2 > w) {
    const step = document.createElement('canvas');
    step.width  = Math.round(sw / 2);
    step.height = Math.round(sh / 2);
    const sctx = step.getContext('2d');
    sctx.imageSmoothingQuality = 'high';
    sctx.drawImage(src, 0, 0, step.width, step.height);
    src = step; sw = step.width; sh = step.height;
  }
  // Con brillo, se deja margen alrededor para el halo
  const blur = glow ? glow.blur * renderScale : 0;
  const pad  = Math.ceil(blur * 2);
  cached = document.createElement('canvas');
  cached.width  = w + pad * 2;
  cached.height = height + pad * 2;
  const cctx = cached.getContext('2d');
  cctx.imageSmoothingQuality = 'high';
  if (glow) {
    cctx.shadowColor = glow.color;
    cctx.shadowBlur  = blur;
    cctx.drawImage(src, pad, pad, w, height);   // dos pasadas = halo más intenso
  }
  cctx.drawImage(src, pad, pad, w, height);
  if (tint) {
    cctx.globalCompositeOperation = 'source-atop';   // solo donde hay sprite
    cctx.fillStyle = tint;
    cctx.fillRect(0, 0, cached.width, cached.height);
  }
  spriteCache.set(key, cached);
  return cached;
}

// Dibuja un sprite centrado en el origen actual del contexto
function blitCentered(sprite, flip = false) {
  if (flip) ctx.scale(-1, 1);
  const w = sprite.width  / renderScale;
  const h = sprite.height / renderScale;
  ctx.drawImage(sprite, -w / 2, -h / 2, w, h);
}

function drawSprite(img, x, y, height, flip = false, tilt = 0, glow = null) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(tilt);
  blitCentered(getSprite(img, height, glow), flip);
  ctx.restore();
}

const PLAYER_HEIGHT = 140;   // bastante más alto que el enemigo grande (~104 px)

// Geometría de la espada medida en assets/lloyd.png (345×461 px). Se pasa a
// coordenadas locales del sprite (origen en su centro, unidades del juego).
// Si se cambia la imagen de Lloyd, hay que volver a medir estos puntos.
const LLOYD_PX = { w: 345, h: 461 };
function lloydLocal(px, py) {
  const s = PLAYER_HEIGHT / LLOYD_PX.h;
  return { x: (px - LLOYD_PX.w / 2) * s, y: (py - LLOYD_PX.h / 2) * s };
}
const SWORD_TIP   = lloydLocal(8, 33);     // punta de la hoja
const SWORD_GUARD = lloydLocal(210, 290);  // guarda: pivote del tajo
const LLOYD_BODY  = lloydLocal(250, 265);  // centro del torso: hitbox
const BLADE_LEN   = Math.hypot(SWORD_TIP.x - SWORD_GUARD.x, SWORD_TIP.y - SWORD_GUARD.y);
const BLADE_ANGLE = Math.atan2(SWORD_TIP.y - SWORD_GUARD.y, SWORD_TIP.x - SWORD_GUARD.x);
const LIFE_HEIGHT   = 26;

// Garmadon es el enemigo grande. Es casi negro, así que lleva un
// halo morado para que se vea sobre el fondo del espacio.
const GARMADON_HEIGHT = 104;   // ~116 px de ancho: cubre el radio 50 del enemigo
const GARMADON_GLOW   = { color: 'rgba(170, 90, 255, 0.95)', blur: 10 };

// La estrella ninja es el enemigo pequeño y gira como un shuriken.
const STAR_SIZE = 40;          // px; un poco más que el diámetro del radio 16 (puntas)

// El serpentino es el enemigo mediano y se balancea como Garmadon.
const SERPENT_HEIGHT = 72;     // ~62 px de ancho: cubre el radio 30 del enemigo
const WOBBLE         = 0.22;   // balanceo máximo (rad) de los personajes

// ── Espada ────────────────────────────────────────────────────────────────────
const SWORD_REACH    = BLADE_LEN + 50;  // alcance del tajo (px desde la guarda)
const SWORD_ARC      = Math.PI * 0.8;   // apertura del tajo (~144°)
const SLASH_TIME     = 0.18;            // duración de la animación (s)
const SLASH_COOLDOWN = 0.28;            // tiempo entre tajos (s)

// ── Enemigos ──────────────────────────────────────────────────────────────────
const RADII  = [0, 16, 30, 50];   // por tamaño 1, 2, 3
const SPEEDS = [0, 21, 13, 16];   // velocidad base por tamaño (px/s)
const SPEED_JITTER = [0, 3.5, 3.5, 7];   // variación aleatoria ± por tamaño (px/s)
const POINTS = [0, 100, 50, 20];  // puntos por tamaño

class Enemy {
  constructor(x, y, size = 3) {
    this.x    = x;
    this.y    = y;
    this.size = size;
    this.radius = RADII[size];
    this.dead = false;
    // Fragmentos recién cortados: invisibles e intangibles mientras se ven
    // las dos mitades del enemigo padre separándose.
    this.hidden = 0;

    const angle = rand(0, Math.PI * 2);
    const speed = SPEEDS[size] + rand(-SPEED_JITTER[size], SPEED_JITTER[size]);
    this.vx = Math.cos(angle) * speed;
    this.vy = Math.sin(angle) * speed;
    this.rotSpeed = rand(-1.2, 1.2);
    this.rot = rand(0, Math.PI * 2);

    // Grande = Garmadon, mediano = serpentino: personajes que se balancean
    // en lugar de girar sin parar
    this.isGarmadon = size === 3;
    this.isSerpent  = size === 2;
    this.wobbles    = this.isGarmadon || this.isSerpent;
    if (this.wobbles) {
      this.flip   = Math.random() < 0.5;
      this.wobble = rand(0, Math.PI * 2);
      this.rot    = 0;
    }

    // El tamaño más pequeño es la estrella ninja: gira rápido
    this.isStar = size === 1;
    if (this.isStar) this.rotSpeed = (Math.random() < 0.5 ? -1 : 1) * rand(2.5, 4);

    // Polígono irregular (también es el respaldo si la imagen no cargó)
    const n = randInt(8, 13);
    this.verts = [];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const r = this.radius * rand(0.6, 1.0);
      this.verts.push([Math.cos(a) * r, Math.sin(a) * r]);
    }
  }

  update(dt) {
    this.x   = wrap(this.x + this.vx * dt, W);
    this.y   = wrap(this.y + this.vy * dt, H);
    if (this.wobbles) {
      this.wobble += dt * 1.6;
      this.rot = Math.sin(this.wobble) * WOBBLE;
    } else {
      this.rot += this.rotSpeed * dt;
    }
    if (this.hidden > 0) this.hidden -= dt;
  }

  split() {
    if (this.size <= 1) return [];
    return [
      new Enemy(this.x, this.y, this.size - 1),
      new Enemy(this.x, this.y, this.size - 1),
    ];
  }

  draw() {
    if (this.hidden > 0) return;
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.rot);
    this.drawBody();
    ctx.restore();
  }

  // Dibuja el cuerpo en el origen del contexto actual (ya trasladado y rotado).
  // Lo usan tanto el enemigo como sus mitades cortadas (Shard).
  drawBody() {
    if (this.isGarmadon && imgReady(garmadonImg)) {
      blitCentered(getSprite(garmadonImg, GARMADON_HEIGHT, GARMADON_GLOW), this.flip);
      return;
    }
    if (this.isSerpent && imgReady(serpentImg)) {
      blitCentered(getSprite(serpentImg, SERPENT_HEIGHT), this.flip);
      return;
    }
    if (this.isStar && imgReady(starImg)) {
      blitCentered(getSprite(starImg, STAR_SIZE));
      return;
    }
    ctx.strokeStyle = '#fff';
    ctx.lineWidth   = 1.5;
    ctx.lineJoin    = 'round';
    tracePolygon(this.verts);
    ctx.stroke();
  }
}

function tracePolygon(verts) {
  ctx.beginPath();
  ctx.moveTo(verts[0][0], verts[0][1]);
  for (let i = 1; i < verts.length; i++) ctx.lineTo(verts[i][0], verts[i][1]);
  ctx.closePath();
}

// ── Efectos del corte de espada ───────────────────────────────────────────────
// Una mitad del enemigo cortado: el mismo cuerpo (polígono o Garmadon)
// recortado por la línea del tajo, que se aleja girando y se desvanece.
class Shard {
  constructor(a, cutAngle, side) {
    this.x = a.x;
    this.y = a.y;
    this.body   = a;                    // se dibuja con a.drawBody()
    this.radius = a.radius;
    this.rot    = a.rot;
    this.cutLocal = cutAngle - a.rot;   // línea de corte en el marco del polígono
    this.side   = side;                 // +1 / -1: qué mitad es
    const nx = Math.cos(cutAngle + Math.PI / 2) * side;
    const ny = Math.sin(cutAngle + Math.PI / 2) * side;
    const sp = rand(70, 100);
    this.vx = a.vx * 0.4 + nx * sp;
    this.vy = a.vy * 0.4 + ny * sp;
    this.rotSpeed = a.rotSpeed + side * rand(1.5, 3);
    this.life = this.ttl = 0.5;
    this.dead = false;
  }

  update(dt) {
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.rot += this.rotSpeed * dt;
    this.ttl -= dt;
    if (this.ttl <= 0) this.dead = true;
  }

  draw() {
    const t    = this.ttl / this.life;
    const clip = this.radius * 2;      // cubre también el sprite de Garmadon y su halo
    const edge = this.radius * 1.2;    // largo del borde dorado del corte
    ctx.save();
    ctx.globalAlpha = t;
    ctx.translate(this.x, this.y);
    ctx.rotate(this.rot);
    // Recorte por el semiplano de esta mitad
    ctx.rotate(this.cutLocal);
    ctx.beginPath();
    ctx.rect(-clip, this.side > 0 ? 0 : -clip, 2 * clip, clip);
    ctx.clip();
    ctx.rotate(-this.cutLocal);
    this.body.drawBody();
    // Borde del corte, dorado e incandescente, por encima del cuerpo
    ctx.rotate(this.cutLocal);
    ctx.strokeStyle = '#ffd24a';
    ctx.lineWidth   = 3;
    ctx.shadowColor = '#ffb000';
    ctx.shadowBlur  = 10;
    ctx.beginPath();
    ctx.moveTo(-edge, 0);
    ctx.lineTo(edge, 0);
    ctx.stroke();
    ctx.restore();
  }
}

// Destello del filo atravesando el enemigo
class SlashMark {
  constructor(x, y, angle, radius) {
    this.x = x;
    this.y = y;
    this.angle = angle;
    this.len   = radius * 2.8;
    this.life  = this.ttl = 0.28;
    this.dead  = false;
  }

  update(dt) {
    this.ttl -= dt;
    if (this.ttl <= 0) this.dead = true;
  }

  draw() {
    const t = this.ttl / this.life;
    const half = this.len / 2;
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.angle);
    ctx.lineCap     = 'round';
    ctx.shadowColor = '#ffd700';
    ctx.shadowBlur  = 18;
    ctx.strokeStyle = `rgba(255, 210, 60, ${(0.9 * t).toFixed(2)})`;
    ctx.lineWidth   = 6 * t + 1;
    ctx.beginPath();
    ctx.moveTo(-half, 0);
    ctx.lineTo(half, 0);
    ctx.stroke();
    ctx.strokeStyle = `rgba(255, 255, 255, ${t.toFixed(2)})`;
    ctx.lineWidth   = 1.5;
    ctx.stroke();
    ctx.restore();
  }
}

// ── Ship ──────────────────────────────────────────────────────────────────────
class Ship {
  constructor() { this.reset(); }

  // Pose de Lloyd: (x, y) es el centro del sprite, `rot` su giro y `flip` el
  // espejo. La pose se elige para que la hoja apunte en `angle` y la punta de
  // la espada quede exactamente en el puntero (cursor o dedo).
  reset() {
    this.angle  = 0;
    this.flip   = false;
    this.rot    = 0;
    this.radius = 35;   // hitbox del torso (sin contar la espada)
    this.prevMouseX    = mouse.x;
    this.prevMouseY    = mouse.y;
    this.invincible    = 3;
    this.slashCooldown = 0;
    this.slashTimer    = 0;
    this.slashAngle    = this.angle;
    this.slashX        = mouse.x;
    this.slashY        = mouse.y;
    this.dead          = false;
    this.updatePose();
  }

  // Punto local del sprite (sin espejo ni giro) → coordenadas del juego
  toWorld(p, rot = this.rot) {
    const lx = this.flip ? -p.x : p.x;
    const c = Math.cos(rot), s = Math.sin(rot);
    return { x: this.x + lx * c - p.y * s, y: this.y + lx * s + p.y * c };
  }

  updatePose() {
    // Sin espejo la hoja apunta a BLADE_ANGLE; con espejo, a π − BLADE_ANGLE.
    // Se usa la opción que requiere menos giro (Lloyd queda más derecho), con
    // un margen para que no alterne de un lado a otro en el límite.
    const rPlain = angleDiff(this.angle, BLADE_ANGLE);
    const rFlip  = angleDiff(this.angle, Math.PI - BLADE_ANGLE);
    const HYST = 0.35;
    if (this.flip ? Math.abs(rPlain) < Math.abs(rFlip) - HYST
                  : Math.abs(rFlip)  < Math.abs(rPlain) - HYST) this.flip = !this.flip;
    this.rot = this.flip ? rFlip : rPlain;

    // Coloca a Lloyd para que la punta de la espada quede en el puntero
    this.x = 0; this.y = 0;
    const tip = this.toWorld(SWORD_TIP);
    this.x = mouse.x - tip.x;
    this.y = mouse.y - tip.y;

    // Hitbox en el torso
    const body = this.toWorld(LLOYD_BODY);
    this.hx = body.x;
    this.hy = body.y;
  }

  update(dt) {
    if (this.dead) return;
    if (this.invincible    > 0) this.invincible    -= dt;
    if (this.slashCooldown > 0) this.slashCooldown -= dt;
    if (this.slashTimer    > 0) this.slashTimer    -= dt;

    if (dt > 0) {
      const AIM_SPEED = 120;   // px/s mínimos del puntero para cambiar la dirección
      const AIM_TURN  = 14;    // suavizado del giro de la dirección (1/s)
      // La dirección sale del movimiento del puntero (no de Lloyd, cuya
      // posición depende a su vez de la dirección).
      const mdx = mouse.x - this.prevMouseX;
      const mdy = mouse.y - this.prevMouseY;
      if (Math.hypot(mdx, mdy) / dt > AIM_SPEED) {
        const target = Math.atan2(mdy, mdx);
        this.angle += angleDiff(target, this.angle) * Math.min(1, AIM_TURN * dt);
      }
    }
    this.prevMouseX = mouse.x;
    this.prevMouseY = mouse.y;
    this.updatePose();
  }

  trySlash() {
    if (this.slashCooldown > 0 || this.dead) return false;
    this.slashCooldown = SLASH_COOLDOWN;
    this.slashTimer    = SLASH_TIME;
    this.slashAngle    = this.angle;
    // El tajo gira alrededor de la guarda de la espada
    const guard = this.toWorld(SWORD_GUARD);
    this.slashX = guard.x;
    this.slashY = guard.y;
    return true;
  }

  // Giro extra de la espada durante el tajo: barre el arco de −ARC/2 a
  // +ARC/2 (al mismo ritmo que drawSlash) y luego vuelve a su posición.
  swingOffset() {
    if (this.slashTimer <= 0) return 0;
    const t = 1 - this.slashTimer / SLASH_TIME;   // 0 → 1
    const SWEEP_END = 0.4;
    return t < SWEEP_END
      ? -SWORD_ARC / 2 + SWORD_ARC * (t / SWEEP_END)
      : (SWORD_ARC / 2) * (1 - (t - SWEEP_END) / (1 - SWEEP_END));
  }

  draw() {
    if (dying) { drawDyingLloyd(); return; }   // herido / caído (fin del juego)
    if (this.dead) return;
    // Parpadeo durante invencibilidad de reaparición
    if (this.invincible > 0 && Math.floor(this.invincible * 8) % 2 === 0) return;

    if (spriteReady()) {
      // Durante el tajo todo Lloyd gira alrededor de la guarda, así la espada
      // recorre el arco del corte.
      const swing = this.swingOffset();
      ctx.save();
      if (swing !== 0) {
        const guard = this.toWorld(SWORD_GUARD);
        ctx.translate(guard.x, guard.y);
        ctx.rotate(swing);
        ctx.translate(-guard.x, -guard.y);
      }
      drawSprite(lloydImg, this.x, this.y, PLAYER_HEIGHT, this.flip, this.rot);
      ctx.restore();

      // Indicador de dirección justo delante de la punta (= el puntero)
      const tip = this.toWorld(SWORD_TIP);
      ctx.save();
      ctx.translate(tip.x, tip.y);
      ctx.rotate(this.angle);
      ctx.lineWidth   = 2;
      ctx.lineJoin    = 'round';
      ctx.strokeStyle = '#ffd700';
      ctx.beginPath();
      ctx.moveTo(8, -7);
      ctx.lineTo(16, 0);
      ctx.lineTo(8,  7);
      ctx.stroke();
      ctx.restore();
    } else {
      // Respaldo mientras carga la imagen: nave triangular
      ctx.save();
      ctx.translate(this.x, this.y);
      ctx.rotate(this.angle);
      ctx.strokeStyle = '#fff';
      ctx.lineWidth   = 1.5;
      ctx.beginPath();
      ctx.moveTo( 20,  0);
      ctx.lineTo(-12, -9);
      ctx.lineTo( -7,  0);
      ctx.lineTo(-12,  9);
      ctx.closePath();
      ctx.stroke();
      ctx.restore();
    }
  }
}

// ── Partículas (explosión) ────────────────────────────────────────────────────
class Particle {
  constructor(x, y, color = '255,255,255', speedMax = 130) {
    this.x  = x;
    this.y  = y;
    this.color = color;
    const angle = rand(0, Math.PI * 2);
    const speed = rand(30, speedMax);
    this.vx   = Math.cos(angle) * speed;
    this.vy   = Math.sin(angle) * speed;
    this.life = rand(0.4, 1.1);
    this.ttl  = this.life;
    this.dead = false;
  }

  update(dt) {
    this.x  += this.vx * dt;
    this.y  += this.vy * dt;
    this.ttl -= dt;
    if (this.ttl <= 0) this.dead = true;
  }

  draw() {
    const alpha = this.ttl / this.life;
    ctx.strokeStyle = `rgba(${this.color},${alpha.toFixed(2)})`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(this.x, this.y);
    ctx.lineTo(this.x - this.vx * 0.05, this.y - this.vy * 0.05);
    ctx.stroke();
  }
}

// ── Estado del juego ──────────────────────────────────────────────────────────
let ship, enemies, particles;
let effects;    // mitades cortadas (Shard) y destellos del filo (SlashMark)
let score, lives, level;
let state;      // 'playing' | 'dead' | 'dying' | 'gameover'
let deadTimer;
let gameoverT = 0;   // s desde que apareció el GAME OVER
let shake = 0;  // sacudida breve de pantalla al cortar (s)

// Las mitades del enemigo se ven durante este tiempo antes de que
// aparezcan los fragmentos más pequeños.
const SHARD_REVEAL = 0.3;

function spawnEnemies(count) {
  // Lejos de Lloyd (que está donde esté el cursor)
  const SAFE_DIST = 205;
  for (let i = 0; i < count; i++) {
    let x, y;
    do {
      x = rand(0, W);
      y = rand(0, H);
    } while (Math.hypot(x - ship.x, y - ship.y) < SAFE_DIST);
    enemies.push(new Enemy(x, y, 3));
  }
}

function initGame() {
  ship      = new Ship();
  enemies   = [];
  particles = [];
  effects   = [];
  score  = 0;
  lives  = 3;
  level  = 1;
  state  = 'playing';
  dying  = null;
  gameoverT = 0;
  spawnEnemies(4);
}

function nextLevel() {
  level++;
  Sound.play('levelup');
  particles = [];
  effects   = [];
  ship.reset();
  spawnEnemies(3 + level);
}

function explode(x, y, count = 8) {
  for (let i = 0; i < count; i++) particles.push(new Particle(x, y));
}

// El tajo se resuelve una sola vez al pulsar, así los fragmentos que nacen
// de un enemigo cortado no mueren en el mismo golpe.
function slashEnemies() {
  const newEnemies = [];
  const pivot = { x: ship.slashX, y: ship.slashY };   // guarda de la espada
  for (const a of enemies) {
    if (a.hidden > 0) continue;
    const d = dist(pivot, a);
    if (d > SWORD_REACH + a.radius) continue;
    const dir = Math.atan2(a.y - pivot.y, a.x - pivot.x);
    // Tolerancia angular según el tamaño aparente del enemigo
    const tolerance = d > 0 ? Math.asin(Math.min(1, a.radius / d)) : Math.PI;
    if (Math.abs(angleDiff(dir, ship.slashAngle)) <= SWORD_ARC / 2 + tolerance) {
      a.dead = true;
      score += POINTS[a.size];
      newEnemies.push(...cutEnemy(a, dir));
    }
  }
  enemies = enemies.filter(a => !a.dead).concat(newEnemies);
}

// Efecto visual del corte: el filo pasa a través del enemigo (perpendicular
// a la línea Lloyd→enemigo), las dos mitades se separan y, tras un instante,
// en su lugar quedan los fragmentos más pequeños.
function cutEnemy(a, dir) {
  Sound.play(a.isGarmadon ? 'garmadon' : a.isSerpent ? 'serpent' : 'star');
  const cut = dir + Math.PI / 2 + rand(-0.35, 0.35);
  effects.push(new SlashMark(a.x, a.y, cut, a.radius));
  effects.push(new Shard(a, cut, 1), new Shard(a, cut, -1));
  for (let i = 0; i < a.size * 5; i++)
    particles.push(new Particle(a.x, a.y, '255,200,60', 180));   // chispas doradas
  shake = 0.12;

  const nx = Math.cos(cut + Math.PI / 2);
  const ny = Math.sin(cut + Math.PI / 2);
  return a.split().map((k, i) => {
    const side = i === 0 ? 1 : -1;
    k.x  = wrap(a.x + nx * side * a.radius * 0.3, W);
    k.y  = wrap(a.y + ny * side * a.radius * 0.3, H);
    k.vx += nx * side * 11;
    k.vy += ny * side * 11;
    k.hidden = SHARD_REVEAL;
    return k;
  });
}

function killShip() {
  lives--;
  if (lives <= 0) { startDying(); return; }   // última vida: muerte lenta
  explode(ship.hx, ship.hy, 14);
  ship.dead = true;
  Sound.play('death');
  state     = 'dead';
  deadTimer = 2;
}

// ── Muerte final de Lloyd ─────────────────────────────────────────────────────
// En la última vida Lloyd no desaparece: queda herido (destellos rojos), se
// desploma despacio y suelta la espada, que cae girando hasta quedar tendida.
// Cuando la espada toca el suelo suena el golpe metálico y recién entonces
// termina el juego. El sonido triste ('dying') dura justo hasta ese momento.
const DYING = {
  release: 0.55,   // s hasta que suelta la espada
  fall:    1.9,    // s que tarda la espada en caer
  rest:    0.5,    // s con la espada en el suelo antes del GAME OVER
};
const DYING_TOTAL = DYING.release + DYING.fall + DYING.rest;
const HURT_TINT   = 'rgb(210, 25, 25)';
let dying = null;  // estado de la animación (null si no está ocurriendo)

const clamp01   = u => Math.max(0, Math.min(1, u));
const easeInOut = u => u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2;

function startDying() {
  state = 'dying';
  ship.slashTimer = 0;
  dying = {
    t: 0,
    x: ship.x, y: ship.y, rot: ship.rot, flip: ship.flip,
    slumpDir: ship.flip ? 1 : -1,   // hacia dónde se desploma
    sword: null,                    // la espada, una vez suelta
    landed: false,
  };
  for (let i = 0; i < 22; i++)
    particles.push(new Particle(ship.hx, ship.hy, '255,60,60', 160));   // golpe
  shake = 0.35;
  Sound.play('dying');
}

// Cuerpo herido: tiembla con el golpe y luego se desploma (gira y baja)
function dyingBodyPose() {
  const d = dying, t = d.t;
  const hit = Math.max(0, 1 - t / 0.6);
  const s = easeInOut(clamp01((t - 0.25) / 2.3));
  return {
    x: d.x + Math.sin(t * 87) * 4 * hit,
    y: d.y + 45 * s + Math.cos(t * 71) * 4 * hit,
    rot: d.rot + d.slumpDir * 1.05 * s,
    flip: d.flip,
    fade: 1 - 0.2 * s,
  };
}

// Espada suelta: cae acelerando (como con gravedad) mientras gira hasta
// quedar horizontal, y al llegar al suelo da un par de rebotes pequeños.
function swordPose() {
  const s = dying.sword;
  const u = clamp01((dying.t - DYING.release) / DYING.fall);
  let y = s.y0 + (s.ground - s.y0) * u * u;
  if (dying.landed) {
    const b = dying.t - DYING.release - DYING.fall;
    y -= Math.abs(Math.sin(b * 14)) * 9 * Math.exp(-b * 9);
  }
  return { x: s.x + s.drift * u, y, rot: s.rot0 + s.turn * easeInOut(u), flip: s.flip, fade: 1 };
}

function updateDying(dt) {
  const d = dying;
  d.t += dt;

  if (!d.sword && d.t >= DYING.release) {
    // Suelta la espada desde la pose actual de la mano
    const p = dyingBodyPose();
    const bladeAngle = p.rot + (p.flip ? Math.PI - BLADE_ANGLE : BLADE_ANGLE);
    const flat = Math.abs(angleDiff(bladeAngle, 0)) < Math.PI / 2 ? 0 : Math.PI;
    d.sword = {
      x: p.x, y0: p.y, rot0: p.rot, flip: p.flip,
      ground: Math.max(p.y + 40, Math.min(p.y + 170, H - 30)),
      drift: -d.slumpDir * 25,
      // gira hasta quedar tendida, con media vuelta extra al caer
      turn: angleDiff(flat, bladeAngle) + d.slumpDir * Math.PI,
    };
  }

  if (d.sword && !d.landed && d.t >= DYING.release + DYING.fall) {
    d.landed = true;
    const sp = swordPose();
    for (let i = 0; i < 14; i++) particles.push(new Particle(sp.x, sp.y + 8, '255,210,90', 110));
    shake = 0.15;
    Sound.play('swordDrop');
    Sound.play('gameover', 0.45);
  }

  if (d.t >= DYING_TOTAL) {
    state = 'gameover';
    gameoverT = 0;
  }
}

// Dibuja una capa (cuerpo o espada) en una pose, con el destello rojo encima
function drawLayer(img, pose, tintA) {
  ctx.save();
  ctx.globalAlpha = pose.fade;
  ctx.translate(pose.x, pose.y);
  ctx.rotate(pose.rot);
  if (pose.flip) ctx.scale(-1, 1);
  blitCentered(getSprite(img, PLAYER_HEIGHT));
  if (tintA > 0) {
    ctx.globalAlpha = pose.fade * tintA;
    blitCentered(getSprite(img, PLAYER_HEIGHT, null, HURT_TINT));
  }
  ctx.restore();
}

function drawDyingLloyd() {
  const t = dying.t;
  const body = dyingBodyPose();
  // Destellos rojos rápidos con el golpe; luego un rojo tenue que late
  const tintA = t < 0.6
    ? 0.35 + 0.45 * (0.5 + 0.5 * Math.sin(t * 38))
    : 0.22 + 0.08 * Math.sin(t * 5);
  if (!imgReady(lloydBodyImg) || !imgReady(lloydSwordImg)) {
    drawLayer(lloydImg, body, tintA);   // respaldo: sin separar la espada
    return;
  }
  drawLayer(lloydBodyImg, body, tintA);
  if (!dying.sword) drawLayer(lloydSwordImg, body, tintA * 0.5);   // aún en la mano
  else drawLayer(lloydSwordImg, swordPose(), 0);
}

// ── Update ────────────────────────────────────────────────────────────────────
function updateEffects(dt) {
  if (shake > 0) shake -= dt;
  particles.forEach(p => p.update(dt));
  particles = particles.filter(p => !p.dead);
  effects.forEach(e => e.update(dt));
  effects = effects.filter(e => !e.dead);
}

function update(dt) {
  if (state === 'dying') {
    slashPressed();   // sin tajos mientras Lloyd cae
    updateEffects(dt);
    enemies.forEach(a => a.update(dt));
    updateDying(dt);
    return;
  }

  if (state === 'gameover') {
    gameoverT += dt;
    // Un instante de gracia para no reiniciar por un clic accidental
    if (slashPressed() && gameoverT > 0.8) initGame();
    updateEffects(dt);
    return;
  }

  if (state === 'dead') {
    slashPressed();   // descartar clics mientras Lloyd no está
    deadTimer -= dt;
    updateEffects(dt);
    enemies.forEach(a => a.update(dt));
    if (deadTimer <= 0) { state = 'playing'; ship.reset(); }
    return;
  }

  ship.update(dt);
  enemies.forEach(a => a.update(dt));
  updateEffects(dt);

  // Tajo de espada vs enemigos
  if (slashPressed() && ship.trySlash()) {
    Sound.play('swing');
    slashEnemies();
  }

  // Lloyd vs enemigo (los fragmentos aún ocultos no cuentan)
  if (ship.invincible <= 0) {
    for (const a of enemies) {
      if (a.hidden <= 0 && dist({ x: ship.hx, y: ship.hy }, a) < ship.radius + a.radius * 0.82) {
        killShip();
        break;
      }
    }
  }

  // Nivel completado
  if (enemies.length === 0) nextLevel();
}

// ── Draw ──────────────────────────────────────────────────────────────────────
function drawSlash() {
  if (ship.dead || ship.slashTimer <= 0) return;
  const life  = ship.slashTimer / SLASH_TIME;           // 1 → 0
  const sweep = Math.min(1, (1 - life) * 2.5);          // el arco se abre rápido
  const start = ship.slashAngle - SWORD_ARC / 2;
  const end   = start + SWORD_ARC * Math.max(sweep, 0.05);

  ctx.save();
  ctx.lineCap     = 'round';
  ctx.shadowColor = '#ffd700';
  ctx.shadowBlur  = 14;

  // Arco interior = recorrido de la punta; exterior = alcance del tajo.
  // Ambos centrados en la guarda, que es el pivote del movimiento.
  ctx.strokeStyle = `rgba(255, 200, 0, ${(0.9 * life).toFixed(2)})`;
  ctx.lineWidth   = 7;
  ctx.beginPath();
  ctx.arc(ship.slashX, ship.slashY, BLADE_LEN, start, end);
  ctx.stroke();

  ctx.strokeStyle = `rgba(255, 255, 220, ${life.toFixed(2)})`;
  ctx.lineWidth   = 2;
  ctx.beginPath();
  ctx.arc(ship.slashX, ship.slashY, SWORD_REACH, start, end);
  ctx.stroke();
  ctx.restore();
}

function drawLifeIcon(x, y) {
  if (spriteReady()) { drawSprite(lloydImg, x, y, LIFE_HEIGHT); return; }
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(-Math.PI / 2);
  ctx.strokeStyle = '#fff';
  ctx.lineWidth   = 1.2;
  ctx.lineJoin    = 'round';
  ctx.beginPath();
  ctx.moveTo( 9,  0);
  ctx.lineTo(-6, -5);
  ctx.lineTo(-3,  0);
  ctx.lineTo(-6,  5);
  ctx.closePath();
  ctx.stroke();
  ctx.restore();
}

function drawHUD() {
  ctx.fillStyle = '#fff';
  ctx.font = '15px monospace';

  ctx.textAlign = 'left';
  ctx.fillText(`SCORE  ${score}`, 14, 26);

  ctx.textAlign = 'center';
  ctx.fillText(`NIVEL ${level}`, W / 2, 26);

  for (let i = 0; i < lives; i++)
    drawLifeIcon(W - 20 - i * 28, 22);

  drawMuteButton();
}

// Altavoz (con ondas, o tachado si está en silencio)
function drawMuteButton() {
  const { x, y, w, h } = MUTE_BTN;
  const muted = Sound.isMuted();
  ctx.save();
  ctx.translate(x + 6, y + h / 2);
  ctx.globalAlpha = 0.7;
  ctx.fillStyle   = '#fff';
  ctx.strokeStyle = '#fff';
  ctx.lineWidth   = 2;
  ctx.lineCap     = 'round';
  ctx.beginPath();
  ctx.moveTo(0, -4); ctx.lineTo(5, -4); ctx.lineTo(11, -10);
  ctx.lineTo(11, 10); ctx.lineTo(5, 4); ctx.lineTo(0, 4);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  if (muted) {
    ctx.moveTo(16, -6); ctx.lineTo(26, 6);
    ctx.moveTo(26, -6); ctx.lineTo(16, 6);
  } else {
    ctx.arc(13, 0, 6,  -0.8, 0.8);
    ctx.moveTo(13 + 11 * Math.cos(-0.8), 11 * Math.sin(-0.8));
    ctx.arc(13, 0, 11, -0.8, 0.8);
  }
  ctx.stroke();
  ctx.restore();

}

function drawOverlay(title, sub) {
  ctx.textAlign   = 'center';
  ctx.fillStyle   = '#fff';
  ctx.font        = 'bold 46px monospace';
  ctx.fillText(title, W / 2, H / 2 - 18);
  ctx.font        = '18px monospace';
  ctx.fillStyle   = 'rgba(255,255,255,0.65)';
  ctx.fillText(sub, W / 2, H / 2 + 22);
}

function draw() {
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, W, H);

  ctx.save();
  if (shake > 0) ctx.translate(rand(-3, 3), rand(-3, 3));
  particles.forEach(p => p.draw());
  enemies.forEach(a => a.draw());
  effects.forEach(e => e.draw());
  ship.draw();
  drawSlash();
  ctx.restore();

  drawHUD();

  if (state === 'gameover') {
    // Velo oscuro que aparece de a poco: Lloyd caído sigue visible detrás,
    // pero el texto se lee aunque quede encima de él.
    ctx.fillStyle = `rgba(0, 0, 0, ${(0.5 * clamp01(gameoverT / 0.6)).toFixed(2)})`;
    ctx.fillRect(0, 0, W, H);
    drawOverlay('GAME OVER', `PUNTAJE: ${score}   —   ${
      isTouchDevice ? 'TOCA PARA REINICIAR' : 'CLIC O ESPACIO PARA REINICIAR'}`);
  }
}

// ── Loop principal ────────────────────────────────────────────────────────────
let lastTime = null;

function loop(ts) {
  const dt = lastTime === null ? 0 : Math.min((ts - lastTime) / 1000, 0.05);
  lastTime = ts;
  update(dt);
  draw();
  requestAnimationFrame(loop);
}

// Cambiar el tamaño del canvas lo borra: se redibuja enseguida para que no
// parpadee en negro al girar el teléfono.
function onResize() {
  resizeCanvas();
  if (ship) draw();
}
resizeCanvas();
window.addEventListener('resize', onResize);
window.addEventListener('orientationchange', onResize);

initGame();
requestAnimationFrame(loop);
