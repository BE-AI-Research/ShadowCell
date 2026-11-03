// TouchControls — on-screen HUD for phones/tablets.
// Left half: floating virtual joystick (drives WASD virtual keys; pushing to the
// rim engages sprint). Right half: drag-to-look pad (feeds Input mouse delta).
// Action buttons inject virtual key presses/holds into Input so the game logic
// (Player.js / main.js) needs no touch-specific code paths.

const JOY_RADIUS = 56; // px, knob travel
const DEAD_ZONE = 0.22; // fraction of radius
const SPRINT_ZONE = 0.92; // fraction of radius that engages sprint
const LOOK_SENSITIVITY = 1.35; // touch px -> mouse delta px

// [id, label, code, mode] — mode: 'hold' keeps the key down while pressed,
// 'tap' fires a single just-pressed event, 'toggle' latches on/off, 'fire' = left click.
const BUTTONS = [
  ['fire', 'FIRE', null, 'fire'],
  ['aim', 'AIM', 'KeyF', 'toggle'],
  ['interact', 'E', 'KeyE', 'hold'],
  ['crouch', 'CROUCH', 'KeyC', 'tap'],
  ['whistle', 'WHISTLE', 'KeyQ', 'tap'],
  ['vision-nvg', 'NVG', 'Digit2', 'tap'],
  ['vision-thermal', 'THERM', 'Digit3', 'tap'],
];

export class TouchControls {
  constructor(input, { onPause } = {}) {
    this.input = input;
    this.onPause = onPause || null;
    this.enabled = false;
    this.joy = { id: null, ox: 0, oy: 0 };
    this.look = { id: null, x: 0, y: 0 };
    this.buttonTouches = new Map(); // touch identifier -> button element
    this.aimLatched = false;

    this._build();
    this._bind();
  }

  _build() {
    const root = document.createElement('div');
    root.id = 'touch-hud';
    root.setAttribute('aria-hidden', 'true');
    root.innerHTML = `
      <div class="touch-zone touch-zone-move"></div>
      <div class="touch-zone touch-zone-look"></div>
      <div class="touch-joystick">
        <div class="touch-joystick-base"></div>
        <div class="touch-joystick-knob"></div>
      </div>
      <div class="touch-buttons">
        ${BUTTONS.map(
          ([id, label]) =>
            `<button type="button" class="touch-btn touch-btn-${id}" data-btn="${id}">${label}</button>`
        ).join('')}
      </div>
      <button type="button" class="touch-btn touch-btn-pause" data-btn="pause">II</button>
    `;
    document.body.appendChild(root);
    this.root = root;
    this.moveZone = root.querySelector('.touch-zone-move');
    this.lookZone = root.querySelector('.touch-zone-look');
    this.joyEl = root.querySelector('.touch-joystick');
    this.knobEl = root.querySelector('.touch-joystick-knob');
    this.buttons = new Map();
    root.querySelectorAll('[data-btn]').forEach((el) => this.buttons.set(el.dataset.btn, el));
  }

  _bind() {
    const opts = { passive: false };
    this.moveZone.addEventListener('touchstart', (e) => this._onMoveStart(e), opts);
    this.lookZone.addEventListener('touchstart', (e) => this._onLookStart(e), opts);
    this.buttons.forEach((el) =>
      el.addEventListener('touchstart', (e) => this._onButtonStart(e, el), opts)
    );
    window.addEventListener('touchmove', (e) => this._onTouchMove(e), opts);
    window.addEventListener('touchend', (e) => this._onTouchEnd(e), opts);
    window.addEventListener('touchcancel', (e) => this._onTouchEnd(e), opts);
    // Prevent iOS double-tap zoom / long-press callouts on the HUD.
    this.root.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('blur', () => this.reset());
  }

  setEnabled(enabled) {
    this.enabled = Boolean(enabled);
    this.root.classList.toggle('active', this.enabled);
    if (!this.enabled) this.reset();
  }

  setVisible(visible) {
    this.root.classList.toggle('hidden-during-modal', !visible);
    if (!visible) this.reset();
  }

  reset() {
    this.joy.id = null;
    this.look.id = null;
    this.buttonTouches.clear();
    this.aimLatched = false;
    this._setMoveKeys(0, 0, false);
    this.joyEl.classList.remove('engaged');
    this.knobEl.style.transform = 'translate(-50%, -50%)';
    this.buttons.forEach((el) => el.classList.remove('pressed', 'latched'));
    this.input.clearVirtual();
  }

  // --- Joystick ---
  _onMoveStart(e) {
    if (!this.enabled) return;
    e.preventDefault();
    if (this.joy.id !== null) return;
    const t = e.changedTouches[0];
    this.joy.id = t.identifier;
    this.joy.ox = t.clientX;
    this.joy.oy = t.clientY;
    this.joyEl.style.left = `${t.clientX}px`;
    this.joyEl.style.top = `${t.clientY}px`;
    this.joyEl.classList.add('engaged');
    this.knobEl.style.transform = 'translate(-50%, -50%)';
  }

  _updateJoystick(t) {
    let dx = t.clientX - this.joy.ox;
    let dy = t.clientY - this.joy.oy;
    const len = Math.hypot(dx, dy);
    if (len > JOY_RADIUS) {
      dx = (dx / len) * JOY_RADIUS;
      dy = (dy / len) * JOY_RADIUS;
    }
    this.knobEl.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
    const nx = dx / JOY_RADIUS;
    const ny = dy / JOY_RADIUS;
    const mag = Math.min(1, len / JOY_RADIUS);
    this._setMoveKeys(nx, ny, mag >= SPRINT_ZONE && !this.aimLatched);
  }

  _setMoveKeys(nx, ny, sprint) {
    const mag = Math.hypot(nx, ny);
    const input = this.input;
    if (mag < DEAD_ZONE) {
      input.setVirtualKey('KeyW', false);
      input.setVirtualKey('KeyS', false);
      input.setVirtualKey('KeyA', false);
      input.setVirtualKey('KeyD', false);
      input.setVirtualKey('ShiftLeft', false);
      return;
    }
    // 8-way: an axis counts when it holds > ~38% of the direction (22.5° sectors).
    const ax = nx / mag;
    const ay = ny / mag;
    const T = 0.38;
    input.setVirtualKey('KeyW', ay < -T);
    input.setVirtualKey('KeyS', ay > T);
    input.setVirtualKey('KeyA', ax < -T);
    input.setVirtualKey('KeyD', ax > T);
    input.setVirtualKey('ShiftLeft', sprint);
  }

  // --- Look pad ---
  _onLookStart(e) {
    if (!this.enabled) return;
    e.preventDefault();
    if (this.look.id !== null) return;
    const t = e.changedTouches[0];
    this.look.id = t.identifier;
    this.look.x = t.clientX;
    this.look.y = t.clientY;
  }

  // --- Buttons ---
  _onButtonStart(e, el) {
    if (!this.enabled) return;
    e.preventDefault();
    e.stopPropagation();
    const id = el.dataset.btn;
    const t = e.changedTouches[0];
    if (id === 'pause') {
      if (this.onPause) this.onPause();
      return;
    }
    const def = BUTTONS.find((b) => b[0] === id);
    if (!def) return;
    const [, , code, mode] = def;
    el.classList.add('pressed');
    if (navigator.vibrate) {
      try {
        navigator.vibrate(12);
      } catch (_) {}
    }
    if (mode === 'fire') {
      this.input.triggerClick(0);
    } else if (mode === 'tap') {
      this.input.tapVirtualKey(code);
    } else if (mode === 'toggle') {
      this.aimLatched = !this.aimLatched;
      this.input.setVirtualKey(code, this.aimLatched);
      el.classList.toggle('latched', this.aimLatched);
      if (this.aimLatched) this.input.setVirtualKey('ShiftLeft', false);
    } else if (mode === 'hold') {
      this.input.setVirtualKey(code, true);
    }
    // Buttons on the look side double as look-drag starters so the thumb can
    // fire and keep aiming without lifting.
    this.buttonTouches.set(t.identifier, el);
    if (this.look.id === null && (mode === 'fire' || mode === 'toggle')) {
      this.look.id = t.identifier;
      this.look.x = t.clientX;
      this.look.y = t.clientY;
    }
  }

  _releaseButton(el) {
    el.classList.remove('pressed');
    const def = BUTTONS.find((b) => b[0] === el.dataset.btn);
    if (def && def[3] === 'hold') this.input.setVirtualKey(def[2], false);
  }

  // --- Shared move/end ---
  _onTouchMove(e) {
    if (!this.enabled) return;
    let handled = false;
    for (const t of e.changedTouches) {
      if (t.identifier === this.joy.id) {
        this._updateJoystick(t);
        handled = true;
      }
      if (t.identifier === this.look.id) {
        const dx = t.clientX - this.look.x;
        const dy = t.clientY - this.look.y;
        this.look.x = t.clientX;
        this.look.y = t.clientY;
        this.input.addLookDelta(dx * LOOK_SENSITIVITY, dy * LOOK_SENSITIVITY);
        handled = true;
      }
    }
    if (handled) e.preventDefault();
  }

  _onTouchEnd(e) {
    if (!this.enabled) return;
    for (const t of e.changedTouches) {
      if (t.identifier === this.joy.id) {
        this.joy.id = null;
        this._setMoveKeys(0, 0, false);
        this.joyEl.classList.remove('engaged');
        this.knobEl.style.transform = 'translate(-50%, -50%)';
      }
      if (t.identifier === this.look.id) this.look.id = null;
      const el = this.buttonTouches.get(t.identifier);
      if (el) {
        this.buttonTouches.delete(t.identifier);
        this._releaseButton(el);
      }
    }
  }
}
