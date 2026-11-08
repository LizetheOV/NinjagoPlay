'use strict';

// ── Sonido ────────────────────────────────────────────────────────────────────
// Efectos sintetizados con Web Audio: no hace falta ningún archivo. Cada
// efecto está pensado para el elemento que representa:
//   swing    → tajo de la espada: silbido metálico del aire
//   garmadon → impacto oscuro y pesado: estruendo grave + acorde siniestro
//   serpent  → siseo de serpiente con cascabeleo, chillido y golpe
//   star     → "ting" metálico de shuriken con destello agudo
//   death    → Lloyd muere: "wah wah wah waaah" triste de trombón con sordina
//   dying    → muerte final: el mismo lamento, más lento, mientras cae la espada
//   swordDrop→ la espada golpea el suelo: golpe sordo + resonancia metálica + rebote
//   gameover → fin del juego: frase lenta y solemne en menor sobre un acorde grave
//   levelup  → sube de nivel: arpegio mayor ascendente con destello
//
// Para usar archivos propios (con licencia), agrégalos en assets/sounds/ y
// descomenta la línea correspondiente en CUSTOM_SOUNDS: si un efecto tiene
// archivo, se usa el archivo en lugar del sonido sintetizado.
const CUSTOM_SOUNDS = {
  // swing:    'assets/sounds/swing.mp3',
  // garmadon: 'assets/sounds/garmadon.mp3',
  // serpent:  'assets/sounds/serpent.mp3',
  // star:     'assets/sounds/star.mp3',
  // death:    'assets/sounds/death.mp3',
  // dying:    'assets/sounds/dying.mp3',
  // swordDrop:'assets/sounds/sword-drop.mp3',
  // gameover: 'assets/sounds/gameover.mp3',
  // levelup:  'assets/sounds/levelup.mp3',
};

const Sound = (() => {
  let ac = null;        // AudioContext (se crea con el primer gesto del usuario)
  let master = null;
  let muted = false;
  try { muted = localStorage.getItem('ninjagoplay-muted') === '1'; } catch (e) { /* sin storage */ }

  const VOLUME = 0.6;
  const custom = {};
  for (const [name, src] of Object.entries(CUSTOM_SOUNDS)) {
    const a = new Audio(src);
    a.preload = 'auto';
    custom[name] = a;
  }

  // Los navegadores (sobre todo en móvil) solo permiten audio después de un
  // gesto del usuario: se llama desde los eventos de puntero y teclado.
  function unlock() {
    if (!ac) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      ac = new AC();
      master = ac.createGain();
      master.gain.value = muted ? 0 : VOLUME;
      // Compresor: varios cortes a la vez no saturan
      const comp = ac.createDynamicsCompressor();
      master.connect(comp);
      comp.connect(ac.destination);
    }
    if (ac.state === 'suspended') ac.resume();
  }

  // ── Piezas básicas ──
  let noiseBuffer = null;
  function noise() {
    if (!noiseBuffer) {
      noiseBuffer = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
      const d = noiseBuffer.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    const src = ac.createBufferSource();
    src.buffer = noiseBuffer;
    src.loop = true;
    return src;
  }

  // Envolvente: subida rápida hasta `peak` y caída exponencial
  function envelope(t, attack, peak, decay) {
    const g = ac.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
    return g;
  }

  function tone(type, f0, f1, t, attack, peak, decay, dest = master) {
    const o = ac.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + attack + decay);
    const g = envelope(t, attack, peak, decay);
    o.connect(g).connect(dest);
    o.start(t);
    o.stop(t + attack + decay + 0.05);
    return o;
  }

  function filteredNoise(filterType, f0, f1, q, t, attack, peak, decay, dest = master) {
    const n = noise();
    const f = ac.createBiquadFilter();
    f.type = filterType;
    f.Q.value = q;
    f.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) f.frequency.exponentialRampToValueAtTime(f1, t + attack + decay);
    const g = envelope(t, attack, peak, decay);
    n.connect(f).connect(g).connect(dest);
    n.start(t);
    n.stop(t + attack + decay + 0.05);
    return g;
  }

  // Nota sostenida (para melodías): sube, se mantiene `dur` y se apaga.
  // `glide` desliza la afinación hacia esa frecuencia al final de la nota.
  function note(type, freq, t, dur, peak, dest = master, glide = null) {
    const o = ac.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (glide) o.frequency.exponentialRampToValueAtTime(glide, t + dur);
    const g = ac.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + 0.03);
    g.gain.setValueAtTime(peak, t + Math.max(0.03, dur - 0.08));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.2);
    o.connect(g).connect(dest);
    o.start(t);
    o.stop(t + dur + 0.25);
    return o;
  }

  // Vibrato: oscila la afinación de `osc` (frecuencia `rate` Hz, ±`depth` Hz)
  function vibrato(osc, t, dur, rate, depth) {
    const lfo = ac.createOscillator();
    const amt = ac.createGain();
    lfo.frequency.value = rate;
    amt.gain.setValueAtTime(0, t);
    amt.gain.linearRampToValueAtTime(depth, t + Math.min(0.25, dur / 2));
    lfo.connect(amt).connect(osc.frequency);
    lfo.start(t);
    lfo.stop(t + dur + 0.25);
  }

  // ── Efectos ──
  const synth = {
    // Silbido de la hoja: ruido filtrado que barre de agudo a grave
    swing(t) {
      filteredNoise('bandpass', 3800, 700, 1.1, t, 0.03, 1.6, 0.2);
      tone('sine', 1900, 1100, t, 0.01, 0.08, 0.14);   // brillo del metal
    },

    // Garmadon: estruendo grave que cae + rumor + acorde disminuido siniestro
    garmadon(t) {
      tone('sine', 130, 32, t, 0.005, 0.95, 0.75);
      filteredNoise('lowpass', 900, 120, 0.7, t, 0.01, 0.5, 0.85);
      const low = ac.createBiquadFilter();
      low.type = 'lowpass';
      low.frequency.value = 1100;
      low.connect(master);
      for (const f of [110, 130.81, 155.56]) {          // La2, Do3, Mi♭3
        tone('sawtooth', f, f * 0.94, t + 0.06, 0.04, 0.12, 1.0, low);
        tone('sawtooth', f * 1.006, f * 0.946, t + 0.06, 0.04, 0.08, 1.0, low);
      }
    },

    // Serpentino: siseo con cascabeleo + chillido descendente + golpe
    serpent(t) {
      const hiss = filteredNoise('highpass', 4200, 3000, 0.8, t, 0.03, 0.45, 0.55);
      const rattle = ac.createOscillator();              // trémolo del cascabel
      const depth = ac.createGain();
      rattle.frequency.value = 26;
      depth.gain.value = 0.25;
      rattle.connect(depth).connect(hiss.gain);
      rattle.start(t);
      rattle.stop(t + 0.65);
      const squeal = tone('triangle', 820, 230, t, 0.02, 0.16, 0.32);
      const vib = ac.createOscillator();                 // vibrato del chillido
      const vibDepth = ac.createGain();
      vib.frequency.value = 18;
      vibDepth.gain.value = 40;
      vib.connect(vibDepth).connect(squeal.frequency);
      vib.start(t);
      vib.stop(t + 0.4);
      tone('sine', 210, 70, t, 0.004, 0.45, 0.16);
    },

    // Estrella ninja: parciales inarmónicas (campana metálica) + destello
    star(t) {
      const partials = [[2637, 0.4, 0.55], [3953, 0.26, 0.42], [5590, 0.16, 0.3], [7380, 0.1, 0.22]];
      for (const [f, peak, decay] of partials) tone('sine', f, f * 0.998, t, 0.002, peak, decay);
      filteredNoise('highpass', 7000, 7000, 0.7, t, 0.002, 0.35, 0.07);
      tone('sine', 1319, 1319, t + 0.07, 0.004, 0.14, 0.18);   // Mi6
      tone('sine', 1976, 1976, t + 0.12, 0.004, 0.12, 0.22);   // Si6
    },

    // Lloyd muere: "wah wah wah waaah" de trombón con sordina. Cuatro notas
    // que bajan por semitonos; cada una "se abre" con un filtro (el "wah") y
    // la última se queda temblando y cae al final.
    // `slow` estira las notas (1 = normal).
    death(t, slow = 1) {
      const notes = [[293.66, 0.32], [277.18, 0.32], [261.63, 0.32], [246.94, 1.0]];   // Re4 Do#4 Do4 Si3
      let at = t;
      notes.forEach(([f, baseDur], i) => {
        const dur = baseDur * slow;
        const last = i === notes.length - 1;
        const wah = ac.createBiquadFilter();
        wah.type = 'lowpass';
        wah.Q.value = 6;
        wah.frequency.setValueAtTime(350, at);
        wah.frequency.exponentialRampToValueAtTime(1500, at + 0.12);
        wah.frequency.exponentialRampToValueAtTime(600, at + dur);
        wah.connect(master);
        const o = note('sawtooth', f, at, dur, 0.32, wah, last ? f * 0.94 : null);
        note('square', f / 2, at, dur, 0.06, wah);            // cuerpo grave
        if (last) vibrato(o, at, dur, 5.5 / slow, 7);
        at += dur + 0.04;
      });
    },

    // Muerte final: el mismo lamento, más lento. Dura ~2.45 s, lo que tarda
    // Lloyd en soltar la espada y ésta en llegar al suelo (DYING en game.js).
    dying(t) {
      synth.death(t, 1.18);
    },

    // La espada cae al suelo: golpe sordo, resonancia metálica (parciales
    // inarmónicas, más graves que la estrella) y un rebote más suave.
    swordDrop(t) {
      tone('sine', 160, 60, t, 0.003, 0.5, 0.18);
      filteredNoise('lowpass', 2500, 400, 0.8, t, 0.002, 0.4, 0.12);
      for (const [f, peak, decay] of [[620, 0.22, 0.9], [1517, 0.16, 0.7], [2480, 0.11, 0.5], [3720, 0.07, 0.35]])
        tone('sine', f, f * 0.997, t, 0.002, peak, decay);
      for (const [f, peak, decay] of [[1517, 0.07, 0.4], [2480, 0.05, 0.3]])
        tone('sine', f, f, t + 0.2, 0.002, peak, decay);
      filteredNoise('lowpass', 2000, 400, 0.8, t + 0.2, 0.002, 0.15, 0.08);
    },

    // Fin del juego: frase lenta y solemne en La menor (La4 Mi4 Do4 … La3)
    // sobre un acorde grave sostenido.
    gameover(t) {
      const soft = ac.createBiquadFilter();
      soft.type = 'lowpass';
      soft.frequency.value = 1800;
      soft.connect(master);
      const melody = [[440, 0.45], [329.63, 0.45], [261.63, 0.45], [246.94, 0.35], [220, 1.4]];
      let at = t;
      for (const [f, dur] of melody) {
        const o = note('triangle', f, at, dur, 0.3, soft);
        note('sine', f * 2, at, dur, 0.04, soft);             // brillo suave
        if (dur > 1) vibrato(o, at, dur, 4.5, 3);
        at += dur;
      }
      const total = at - t;
      for (const f of [110, 164.81, 130.81]) note('sine', f, t, total, 0.09, soft);   // La2 Mi3 Do3
    },

    // Sube de nivel: arpegio mayor ascendente (Do5 Mi5 Sol5 Do6) + destello
    levelup(t) {
      const notes = [523.25, 659.25, 783.99, 1046.5];
      notes.forEach((f, i) => {
        const at = t + i * 0.085;
        const dur = i === notes.length - 1 ? 0.45 : 0.08;
        note('square', f, at, dur, 0.09);
        note('triangle', f, at, dur, 0.22);
      });
      const end = t + 3 * 0.085;
      for (const [f, peak, decay] of [[3136, 0.12, 0.5], [4186, 0.09, 0.4], [5274, 0.06, 0.3]])
        tone('sine', f, f, end + 0.05, 0.003, peak, decay);
    },
  };

  // Evita que el mismo efecto suene varias veces en el mismo instante
  // (por ejemplo, un tajo que corta dos estrellas a la vez).
  const lastPlayed = {};

  // `delay` (s) retrasa el inicio, p. ej. para que el sonido de fin del juego
  // empiece después del golpe de la espada.
  function play(name, delay = 0) {
    if (muted) return;
    const now = performance.now();
    if (lastPlayed[name] !== undefined && now - lastPlayed[name] < 50) return;
    lastPlayed[name] = now;

    if (custom[name]) {
      const a = custom[name].cloneNode();
      a.volume = VOLUME;
      setTimeout(() => { if (!muted) a.play().catch(() => {}); }, delay * 1000);
      return;
    }
    if (!ac || ac.state !== 'running' || !synth[name]) return;
    synth[name](ac.currentTime + 0.005 + delay);
  }

  function toggleMute() {
    muted = !muted;
    if (master) master.gain.setTargetAtTime(muted ? 0 : VOLUME, ac.currentTime, 0.02);
    try { localStorage.setItem('ninjagoplay-muted', muted ? '1' : '0'); } catch (e) { /* sin storage */ }
  }

  return { unlock, play, toggleMute, isMuted: () => muted };
})();
