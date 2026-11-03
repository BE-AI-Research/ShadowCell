// src/core/AudioSynth.js
// Procedural Web Audio API sound effects (Splinter Cell NVG whine, footsteps, OCP EMP, whistle, alerts)

export class AudioSynth {
  constructor() {
    this.ctx = null;
  }

  init() {
    this._ensureContext();
  }

  _ensureContext() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
    return this.ctx;
  }

  // Iconic Splinter Cell Trifocal Night-Vision high-pitched capacitor whine
  playNVGToggle(turningOn = true) {
    const ctx = this._ensureContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    if (turningOn) {
      osc.frequency.setValueAtTime(680, now);
      osc.frequency.exponentialRampToValueAtTime(3650, now + 0.38);
      osc.frequency.setValueAtTime(3650, now + 0.65);
    } else {
      osc.frequency.setValueAtTime(3200, now);
      osc.frequency.exponentialRampToValueAtTime(420, now + 0.28);
    }

    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.11, now + 0.05);
    gain.gain.exponentialRampToValueAtTime(0.0008, now + (turningOn ? 0.68 : 0.3));

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + (turningOn ? 0.7 : 0.32));
  }

  playVisionToggle(mode = 'NVG') {
    this.playNVGToggle(mode !== 'NORMAL');
  }

  playFootstep(loudnessOrCrouching = 0.3, isSprinting = false) {
    const ctx = this._ensureContext();
    if (!ctx) return;

    let loudness = 0.35;
    if (typeof loudnessOrCrouching === 'boolean') {
      loudness = loudnessOrCrouching ? 0.12 : isSprinting ? 0.85 : 0.42;
    } else if (typeof loudnessOrCrouching === 'number') {
      loudness = loudnessOrCrouching;
    }

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(115 + loudness * 45, now);
    osc.frequency.exponentialRampToValueAtTime(38, now + 0.08);

    const vol = Math.min(0.16, 0.03 + loudness * 0.12);
    gain.gain.setValueAtTime(vol, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.095);
  }

  playWhistle() {
    const ctx = this._ensureContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(1450, now);
    osc.frequency.linearRampToValueAtTime(1920, now + 0.16);
    osc.frequency.linearRampToValueAtTime(1580, now + 0.38);

    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.11, now + 0.04);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.42);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.44);
  }

  playOCPFiring() {
    const ctx = this._ensureContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(920, now);
    osc.frequency.exponentialRampToValueAtTime(140, now + 0.14);

    gain.gain.setValueAtTime(0.12, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.16);
  }

  playElectricSpark() {
    const ctx = this._ensureContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'square';
    osc.frequency.setValueAtTime(520, now);
    osc.frequency.setValueAtTime(240, now + 0.04);
    osc.frequency.setValueAtTime(790, now + 0.08);

    gain.gain.setValueAtTime(0.08, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.17);
  }

  playTakedown() {
    const ctx = this._ensureContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(160, now);
    osc.frequency.exponentialRampToValueAtTime(42, now + 0.22);

    gain.gain.setValueAtTime(0.22, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.24);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.25);
  }

  playAlertSting(level = 'suspicious') {
    const ctx = this._ensureContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    if (level === 'alert') {
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(540, now);
      osc.frequency.setValueAtTime(760, now + 0.1);
      gain.gain.setValueAtTime(0.14, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
      osc.start(now);
      osc.stop(now + 0.36);
    } else {
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(420, now);
      osc.frequency.exponentialRampToValueAtTime(560, now + 0.16);
      gain.gain.setValueAtTime(0.09, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
      osc.start(now);
      osc.stop(now + 0.22);
    }

    osc.connect(gain);
    gain.connect(ctx.destination);
  }

  playHackComplete() {
    const ctx = this._ensureContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const notes = [587.33, 783.99, 1174.66]; // D5, G5, D6
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + i * 0.08);
      gain.gain.setValueAtTime(0.09, now + i * 0.08);
      gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.08 + 0.2);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + i * 0.08);
      osc.stop(now + i * 0.08 + 0.21);
    });
  }

  playEMP() {
    this.playOCPFiring();
    this.playElectricSpark();
  }

  playAlert(level = 1) {
    if (level === 2 || level === 'alert') {
      this.playAlertSting('alert');
    } else {
      this.playAlertSting('suspicious');
    }
  }

  playHackTick() {
    const ctx = this._ensureContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'square';
    osc.frequency.setValueAtTime(1180 + Math.random() * 260, now);
    gain.gain.setValueAtTime(0.035, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.045);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.05);
  }

  playObjectiveComplete() {
    this.playHackComplete();
  }

  playGunshot() {
    const ctx = this._ensureContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(220, now);
    osc.frequency.exponentialRampToValueAtTime(45, now + 0.12);

    gain.gain.setValueAtTime(0.18, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.13);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.14);
  }
}
