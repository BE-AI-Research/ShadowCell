export class Input {
  constructor(domElement) {
    this.domElement = domElement || document.body;
    this.keys = new Set();
    this.justPressed = new Set();
    this.mouseButtons = new Set();
    this.justClicked = new Set();
    this.mouseDelta = { x: 0, y: 0 };
    this.lastMousePos = null;
    this.isLocked = false;
    this.active = false;
    this.onLockChange = null;
    // Touch / virtual-control support (driven by TouchControls on mobile)
    this.touchMode = false;
    this.virtualKeys = new Set();

    this._initListeners();
  }

  _initListeners() {
    window.addEventListener('keydown', (e) => {
      if (!this.keys.has(e.code)) {
        this.justPressed.add(e.code);
      }
      this.keys.add(e.code);
      if (
        ['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(
          e.code
        )
      ) {
        e.preventDefault();
      }
    });

    window.addEventListener('keyup', (e) => {
      this.keys.delete(e.code);
    });

    window.addEventListener('blur', () => {
      this.keys.clear();
      this.virtualKeys.clear();
      this.mouseButtons.clear();
      this.lastMousePos = null;
    });

    document.addEventListener('pointerlockchange', () => {
      this.isLocked = Boolean(document.pointerLockElement);
      if (this.isLocked) {
        this.active = true;
      }
      if (this.onLockChange) {
        this.onLockChange(this.isLocked);
      }
    });

    document.addEventListener('pointerlockerror', () => {
      // Fallback for sandboxed/webview contexts where Pointer Lock is blocked
      this.isLocked = false;
      this.active = true;
      if (this.onLockChange) {
        this.onLockChange(true);
      }
    });

    document.addEventListener('mousemove', (e) => {
      if (this.isLocked) {
        this.mouseDelta.x += e.movementX || 0;
        this.mouseDelta.y += e.movementY || 0;
      } else if (this.active) {
        // Fallback camera look when Pointer Lock is unavailable in embedded preview
        if (typeof e.movementX === 'number' && (e.movementX !== 0 || e.movementY !== 0)) {
          this.mouseDelta.x += e.movementX;
          this.mouseDelta.y += e.movementY;
        } else if (this.lastMousePos) {
          this.mouseDelta.x += e.clientX - this.lastMousePos.x;
          this.mouseDelta.y += e.clientY - this.lastMousePos.y;
        }
        this.lastMousePos = { x: e.clientX, y: e.clientY };
      }
    });

    window.addEventListener('mousedown', (e) => {
      // Ignore clicks on UI buttons/modals
      if (e.target && e.target.closest && e.target.closest('#overlay-modal, #modal-overlay')) {
        return;
      }
      if (!this.active || this.touchMode) return;

      this.lastMousePos = { x: e.clientX, y: e.clientY };
      if (!this.mouseButtons.has(e.button)) {
        this.justClicked.add(e.button);
      }
      this.mouseButtons.add(e.button);

      // Re-request pointer lock if unlocked while playing
      if (!this.isLocked && this.domElement.requestPointerLock) {
        try {
          const res = this.domElement.requestPointerLock();
          if (res && typeof res.catch === 'function') {
            res.catch(() => {});
          }
        } catch (_) {}
      }
    });

    window.addEventListener('mouseup', (e) => {
      this.mouseButtons.delete(e.button);
    });

    window.addEventListener('contextmenu', (e) => {
      e.preventDefault();
    });
  }

  requestPointerLock() {
    this.active = true;
    this.lastMousePos = null;
    if (this.touchMode) {
      // Touch devices have no pointer lock; virtual controls drive the camera.
      if (this.onLockChange) this.onLockChange(true);
      return;
    }
    if (this.domElement && this.domElement.requestPointerLock) {
      try {
        const res = this.domElement.requestPointerLock();
        if (res && typeof res.catch === 'function') {
          res.catch(() => {
            if (this.onLockChange) this.onLockChange(true);
          });
        }
      } catch (_) {
        if (this.onLockChange) this.onLockChange(true);
      }
    }
    if (this.onLockChange) {
      this.onLockChange(true);
    }
  }

  exitPointerLock() {
    this.active = false;
    this.lastMousePos = null;
    if (document.pointerLockElement && document.exitPointerLock) {
      try {
        document.exitPointerLock();
      } catch (_) {}
    }
  }

  isKeyDown(code) {
    return this.keys.has(code) || this.virtualKeys.has(code);
  }

  isDown(code) {
    return this.keys.has(code) || this.virtualKeys.has(code);
  }

  consumeKeyPress(code) {
    if (this.justPressed.has(code)) {
      this.justPressed.delete(code);
      return true;
    }
    return false;
  }

  consumePressed(code) {
    return this.consumeKeyPress(code);
  }

  isMouseDown(button) {
    return this.mouseButtons.has(button);
  }

  isAiming() {
    return (
      this.mouseButtons.has(2) ||
      this.keys.has('KeyF') ||
      this.virtualKeys.has('KeyF')
    );
  }

  consumeClick(button = 0) {
    if (this.justClicked.has(button)) {
      this.justClicked.delete(button);
      return true;
    }
    return false;
  }

  consumeMouseDelta() {
    const dx = this.mouseDelta.x;
    const dy = this.mouseDelta.y;
    this.mouseDelta.x = 0;
    this.mouseDelta.y = 0;
    return { x: dx, y: dy };
  }

  // --- API used by ShadowCellGame (main.js) ---
  setCapture(enabled) {
    this.active = Boolean(enabled);
    if (enabled) this.requestPointerLock();
    else this.exitPointerLock();
  }

  consumeJustPressed(code) {
    return this.consumeKeyPress(code);
  }

  consumeMouseLeftClick() {
    return this.consumeClick(0);
  }

  get isPointerLocked() {
    return this.isLocked || (this.touchMode && this.active);
  }

  // --- Virtual control API (used by TouchControls) ---
  setTouchMode(enabled) {
    this.touchMode = Boolean(enabled);
    if (!this.touchMode) this.virtualKeys.clear();
  }

  setVirtualKey(code, down) {
    if (down) {
      if (!this.virtualKeys.has(code) && !this.keys.has(code)) this.justPressed.add(code);
      this.virtualKeys.add(code);
    } else {
      this.virtualKeys.delete(code);
    }
  }

  tapVirtualKey(code) {
    this.justPressed.add(code);
  }

  addLookDelta(dx, dy) {
    this.mouseDelta.x += dx;
    this.mouseDelta.y += dy;
  }

  triggerClick(button = 0) {
    this.justClicked.add(button);
  }

  clearVirtual() {
    this.virtualKeys.clear();
  }

  get mouseRightDown() {
    return this.isAiming();
  }

  endFrame() {
    this.justPressed.clear();
    this.justClicked.clear();
    this.mouseDelta.x = 0;
    this.mouseDelta.y = 0;
  }
}
