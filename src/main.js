// src/main.js
// Shadow Cell: Operation Argon
// Main 3D Stealth Engine, Tactical HUD Controller, Minimap Renderer, and Mission Loop

import * as THREE from '../vendor/three.module.js';
import { Input } from './core/Input.js';
import { DeviceProfile } from './core/DeviceProfile.js';
import { TouchControls } from './core/TouchControls.js';
import { CameraRig } from './core/CameraRig.js';
import { AudioSynth } from './core/AudioSynth.js';
import { FacilityLevel } from './world/FacilityLevel.js';
import { LightSystem } from './systems/LightSystem.js';
import { SoundSystem } from './systems/SoundSystem.js';
import { VisionModes } from './systems/VisionModes.js';
import { Player } from './entities/Player.js';
import { Guard } from './entities/Guard.js';
import {
  SecurityCamera,
  LaserGrid,
  HackTerminal,
  ExtractionZone,
} from './entities/SecurityTech.js';

class ShadowCellGame {
  constructor() {
    this.container =
      document.getElementById('game-container') ||
      document.getElementById('canvas-container') ||
      document.body;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x040709);
    this.scene.fog = new THREE.FogExp2(0x040709, 0.025);

    this.camera = new THREE.PerspectiveCamera(
      62,
      window.innerWidth / window.innerHeight,
      0.1,
      90
    );

    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.canvas = this.renderer.domElement;
    this.container.appendChild(this.canvas);

    // Core systems
    this.input = new Input(this.canvas);
    this.device = new DeviceProfile();
    this.touchControls = new TouchControls(this.input, {
      onPause: () => this._pauseForTouch(),
    });
    this._applyDeviceProfile(this.device.state);
    this.device.onChange((state) => this._applyDeviceProfile(state));
    this.audio = new AudioSynth();
    this.cameraRig = new CameraRig(this.camera);

    // Build Level & Lighting
    this.lightSystem = new LightSystem(this.scene);
    this.level = new FacilityLevel(this.scene, this.lightSystem);
    this.soundSystem = new SoundSystem(this.scene);
    this.visionModes = new VisionModes(
      this.scene,
      this.lightSystem.ambientLight,
      this.lightSystem.hemiLight,
      this.audio
    );

    // Entities
    this.player = new Player(this.scene, new THREE.Vector3(0, 0, 26));
    this.guards = [];
    this.cameras = [];
    this.lasers = [];
    this.terminals = [];
    this.extractionZone = null;

    this._populateFacility();

    // Mission statistics & state
    this.gameRunning = false;
    this.missionEnded = false;
    this.missionStartTime = 0;
    this.elapsedTime = 0;
    this.timesDetected = 0;
    this.lightsNeutralized = 0;
    this.guardsNeutralized = 0;
    this.shootFlashLines = [];

    this._bindUI();
    this._setupResize();

    this.clock = new THREE.Clock();
    this.animate = this.animate.bind(this);
    requestAnimationFrame(this.animate);
  }

  _populateFacility() {
    // 1. Dynamic ceiling lights across all 4 zones (shootable & EMP-disruptable)
    const lightConfigs = [
      // Zone 1: Entry Hall
      { id: 'L1', pos: new THREE.Vector3(0, 3.85, 22), intensity: 2.2, dist: 12 },
      { id: 'L2', pos: new THREE.Vector3(-4, 3.85, 14), intensity: 2.0, dist: 11 },
      { id: 'L3', pos: new THREE.Vector3(4, 3.85, 14), intensity: 2.0, dist: 11 },
      // Zone 2: Security Atrium & Patrol Courtyard
      { id: 'L4', pos: new THREE.Vector3(-6, 3.85, 4), intensity: 2.4, dist: 13 },
      { id: 'L5', pos: new THREE.Vector3(6, 3.85, 4), intensity: 2.4, dist: 13 },
      { id: 'L6', pos: new THREE.Vector3(0, 3.85, -3), intensity: 2.5, dist: 13 },
      { id: 'L7', pos: new THREE.Vector3(-7, 3.85, -9), intensity: 2.2, dist: 12 },
      { id: 'L8', pos: new THREE.Vector3(7, 3.85, -9), intensity: 2.2, dist: 12 },
      // Side Office (East)
      { id: 'L9', pos: new THREE.Vector3(14, 3.85, 1), intensity: 1.9, dist: 10 },
      // Zone 3: Laser Corridor
      { id: 'L10', pos: new THREE.Vector3(0, 3.85, -16), intensity: 2.1, dist: 11 },
      // Zone 4: Argon Core Server Vault
      { id: 'L11', pos: new THREE.Vector3(-5, 3.85, -24), intensity: 2.4, dist: 13 },
      { id: 'L12', pos: new THREE.Vector3(5, 3.85, -24), intensity: 2.4, dist: 13 },
      { id: 'L13', pos: new THREE.Vector3(0, 3.85, -30), intensity: 2.2, dist: 12 },
    ];

    for (const cfg of lightConfigs) {
      this.lightSystem.addFixture({
        id: cfg.id,
        position: cfg.pos,
        intensity: cfg.intensity,
        distance: cfg.dist,
        color: 0xdff4ff,
      });
    }

    // 2. Patrol Guards with tactical routes
    const guardRoutes = [
      // Guard 1: Entry Hall & Reception
      [
        new THREE.Vector3(-4.5, 0, 18),
        new THREE.Vector3(4.5, 0, 18),
        new THREE.Vector3(4.5, 0, 12.5),
        new THREE.Vector3(-4.5, 0, 12.5),
      ],
      // Guard 2: West Security Atrium loop
      [
        new THREE.Vector3(-8.5, 0, 7),
        new THREE.Vector3(-8.5, 0, -9),
        new THREE.Vector3(-2.5, 0, -9),
        new THREE.Vector3(-2.5, 0, 7),
      ],
      // Guard 3: East Security Atrium & Office entrance
      [
        new THREE.Vector3(8.5, 0, -9),
        new THREE.Vector3(8.5, 0, 7),
        new THREE.Vector3(2.8, 0, 7),
        new THREE.Vector3(2.8, 0, -9),
      ],
      // Guard 4: Argon Server Vault
      [
        new THREE.Vector3(-7.0, 0, -22),
        new THREE.Vector3(7.0, 0, -22),
        new THREE.Vector3(7.0, 0, -28),
        new THREE.Vector3(-7.0, 0, -28),
      ],
    ];

    guardRoutes.forEach((wps, idx) => {
      this.guards.push(new Guard(this.scene, `G${idx + 1}`, wps));
    });

    // 3. Panning CCTV Security Cameras
    this.cameras.push(
      new SecurityCamera(
        this.scene,
        'CAM_1',
        new THREE.Vector3(-8.8, 3.35, 11.2),
        -0.65,
        0.65,
        0.75
      ),
      new SecurityCamera(
        this.scene,
        'CAM_2',
        new THREE.Vector3(8.8, 3.35, -11.2),
        0.65,
        0.7,
        0.85
      ),
      new SecurityCamera(
        this.scene,
        'CAM_3',
        new THREE.Vector3(0, 3.35, -20.5),
        0,
        0.85,
        0.9
      )
    );

    // 4. Security Laser Grids in Zone 3 Corridor
    this.lasers.push(
      new LaserGrid(this.scene, 'LASER_1', -3.7, 3.7, -14.2, [0.55, 1.25]),
      new LaserGrid(this.scene, 'LASER_2', -3.7, 3.7, -17.8, [0.55, 1.25])
    );

    // 5. Interactive Terminals (2 Main Argon Server Terminals + 1 Laser Grid Override Console)
    this.terminalA = new HackTerminal(
      this.scene,
      'TERM_ALPHA',
      'Terminal Alpha (East Guard Office)',
      new THREE.Vector3(16.2, 0, -3.2),
      0,
      'OBJECTIVE'
    );
    this.terminalLaser = new HackTerminal(
      this.scene,
      'TERM_LASER',
      'Laser Grid Override Console',
      new THREE.Vector3(-8.2, 0, -10.8),
      0,
      'LASER_CONTROL'
    );
    this.terminalB = new HackTerminal(
      this.scene,
      'TERM_OMEGA',
      'Argon Core Mainframe (Server Vault)',
      new THREE.Vector3(0, 0, -29.2),
      0,
      'OBJECTIVE'
    );
    this.terminals.push(this.terminalA, this.terminalLaser, this.terminalB);

    // 6. North Extraction Helipad Beacon
    this.extractionZone = new ExtractionZone(
      this.scene,
      new THREE.Vector3(0, 0, -32.2)
    );
  }

  _bindUI() {
    this.ui = {
      overlayModal: document.getElementById('overlay-modal'),
      modalTitle: document.getElementById('modal-title'),
      modalSubtitle: document.getElementById('modal-subtitle'),
      modalBody: document.getElementById('modal-body'),
      startBtn: document.getElementById('start-mission-btn'),
      obj1: document.getElementById('obj-1'),
      obj2: document.getElementById('obj-2'),
      obj3: document.getElementById('obj-3'),
      obj4: document.getElementById('obj-4'),
      alertDot: document.getElementById('alert-dot'),
      alertText: document.getElementById('alert-text'),
      modeNorm: document.getElementById('mode-norm'),
      modeNvg: document.getElementById('mode-nvg'),
      modeTherm: document.getElementById('mode-therm'),
      interactionPrompt: document.getElementById('interaction-prompt'),
      hackProgressContainer: document.getElementById('hack-progress-container'),
      hackProgressFill: document.getElementById('hack-progress-fill'),
      stanceText: document.getElementById('stance-text'),
      healthValue: document.getElementById('health-value'),
      healthFill: document.getElementById('health-fill'),
      visibilityValue: document.getElementById('visibility-value'),
      noiseValue: document.getElementById('noise-value'),
      lightGemCore: document.getElementById('light-gem-core'),
      visibilityBar: document.getElementById('visibility-bar'),
      noiseBar: document.getElementById('noise-bar'),
      empCountText: document.getElementById('emp-count-text'),
      empPips: document.getElementById('emp-pips'),
      reticle: document.getElementById('reticle'),
      minimapCanvas: document.getElementById('minimap-canvas'),
    };

    this.minimapCtx = this.ui.minimapCanvas.getContext('2d');

    this.startMission = () => {
      if (this.missionEnded) {
        window.location.reload();
        return;
      }
      this.audio.init();
      this.ui.overlayModal.classList.add('hidden');
      this.ui.overlayModal.style.display = 'none';
      if (!this.gameRunning) {
        this.gameRunning = true;
        this.missionStartTime = performance.now();
      }
      this.input.setCapture(true);
      this.touchControls.setVisible(true);
    };

    this.ui.startBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.startMission();
    });
    if (this.device && this.device.state.touch) {
      this.ui.startBtn.textContent = 'ENGAGE MISSION // TAP TO DEPLOY';
    }

    // Clicking anywhere on the canvas while the mission is running re-engages cursor lock
    this.canvas.addEventListener('click', () => {
      if (this.gameRunning && !this.missionEnded) {
        this.input.setCapture(true);
      }
    });
  }

  _setupResize() {
    window.addEventListener('resize', () => this._resizeViewport());
  }

  _resizeViewport() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const touch = this.device && this.device.state.touch;
    const portrait = h > w;
    // Wider FOV on touch screens / portrait so the player keeps peripheral awareness.
    const baseFov = touch ? (portrait ? 78 : 68) : 60;
    if (this.cameraRig) {
      this.cameraRig.normalFov = baseFov;
      this.cameraRig.aimFov = Math.round(baseFov * 0.7);
    }
    if (!this.cameraRig || !this.gameRunning) this.camera.fov = baseFov;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    // Cap pixel ratio lower on phones to keep frame rate playable.
    const maxRatio = touch ? 1.5 : 2;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, maxRatio));
    this.renderer.setSize(w, h);
  }

  _applyDeviceProfile(state) {
    this.input.setTouchMode(state.touch);
    this.touchControls.setEnabled(state.touch);
    this.touchControls.setVisible(Boolean(this.gameRunning && !this.missionEnded));
    this.renderer.shadowMap.type = state.touch ? THREE.PCFShadowMap : THREE.PCFSoftShadowMap;
    if (this.ui && this.ui.startBtn && !this.gameRunning) {
      this.ui.startBtn.textContent = state.touch
        ? 'ENGAGE MISSION // TAP TO DEPLOY'
        : 'ENGAGE MISSION // LOCK CURSOR';
    }
    this._resizeViewport();
  }

  _pauseForTouch() {
    if (!this.gameRunning || this.missionEnded) return;
    this.input.setCapture(false);
    this.touchControls.setVisible(false);
    this.ui.overlayModal.classList.remove('hidden');
    this.ui.overlayModal.style.display = '';
    this.ui.startBtn.textContent = 'RESUME OPERATION';
  }

  _handleVisionHotkeys() {
    let targetMode = null;
    if (this.input.consumeJustPressed('Digit1')) targetMode = 'NORMAL';
    if (this.input.consumeJustPressed('Digit2')) {
      targetMode = this.visionModes.mode === 'NVG' ? 'NORMAL' : 'NVG';
    }
    if (this.input.consumeJustPressed('Digit3')) {
      targetMode = this.visionModes.mode === 'THERMAL' ? 'NORMAL' : 'THERMAL';
    }

    if (targetMode) {
      const prevMode = this.visionModes.mode;
      this.visionModes.setMode(
        targetMode,
        this.guards,
        null,
        this.cameras,
        this.lasers
      );
      if (this.visionModes.mode !== prevMode) {
        const goggleColor =
          targetMode === 'THERMAL'
            ? 0x4fc3f7
            : targetMode === 'NVG'
            ? 0x7aff9e
            : 0x38ff6a;
        this.player.setGoggleColor(goggleColor);

        if (this.ui.modeNorm) this.ui.modeNorm.classList.toggle('active', targetMode === 'NORMAL');
        if (this.ui.modeNvg) this.ui.modeNvg.classList.toggle('active', targetMode === 'NVG');
        if (this.ui.modeTherm) this.ui.modeTherm.classList.toggle('active', targetMode === 'THERMAL');
      }
    }
  }

  _handleGadgetsAndWeapons() {
    // Q: Acoustic Whistle Distraction
    if (this.input.consumeJustPressed('KeyQ')) {
      this.audio.playWhistle();
      this.soundSystem.emitNoise(
        this.player.position,
        13.5,
        0.75,
        0x4fc3f7,
        this.guards,
        true
      );
    }

    // Left Click while Aiming (or quick fire): Silenced OCP/EMP Pistol
    const firePressed = this.input.consumeMouseLeftClick();
    if (firePressed && this.input.isPointerLocked) {
      this._fireSilencedEMPPistol();
    }
  }

  _fireSilencedEMPPistol() {
    if (this.player.empCharges < 1) return;
    this.player.empCharges -= 1;
    this.audio.playEMPPistol();

    // Very quiet silenced acoustic signature near player
    this.soundSystem.emitNoise(
      this.player.position,
      3.5,
      0.2,
      0x4fc3f7,
      this.guards,
      false
    );

    const { origin, direction } = this.cameraRig.getAimRay();
    const raycaster = new THREE.Raycaster(origin, direction, 0.2, 45);

    // Collect shootable targets: Light bulbs, CCTV cameras, Guards, and Walls
    const lightMeshes = this.lightSystem.getShootableMeshes();
    const camMeshes = this.cameras.map((c) => c.housingMesh);
    const guardRootMeshes = [];
    for (const g of this.guards) {
      if (g.state !== 'KNOCKED_OUT') {
        for (const bm of g.bodyMeshes) {
          const mesh = bm.mesh || bm;
          mesh.userData.guardRef = g;
          guardRootMeshes.push(mesh);
        }
      }
    }

    const allTargets = [
      ...lightMeshes,
      ...camMeshes,
      ...guardRootMeshes,
      ...this.level.occluderMeshes,
    ];

    const hits = raycaster.intersectObjects(allTargets, false);
    let endPoint = origin.clone().addScaledVector(direction, 30);

    if (hits.length > 0) {
      const hit = hits[0];
      endPoint = hit.point;
      const obj = hit.object;

      if (obj.userData.tacticalLight) {
        // Shot a light fixture! Disable it with EMP
        this.lightSystem.disableLightWithEMP(obj.userData.tacticalLight, 18.0);
        this.lightsNeutralized++;
        this.audio.playLightShatter();
      } else if (obj.userData.fixtureId) {
        // Shot a light fixture! Disable it with EMP or shatter if already disabled
        this.lightSystem.disableFixtureWithEMP(obj.userData.fixtureId, 18.0);
        this.lightsNeutralized++;
        this.audio.playLightShatter();
      } else if (obj.userData.cameraRef) {
        obj.userData.cameraRef.disableWithEMP(16.0);
        this.audio.playLightShatter();
      } else if (obj.userData.guardRef) {
        obj.userData.guardRef.stunWithEMP(7.0);
      }
    }

    // Visual EMP tracer line
    const lineGeo = new THREE.BufferGeometry().setFromPoints([
      this.player.position.clone().add(new THREE.Vector3(0, 1.35, 0)),
      endPoint,
    ]);
    const lineMat = new THREE.LineBasicMaterial({
      color: 0x4fc3f7,
      transparent: true,
      opacity: 0.85,
    });
    const line = new THREE.Line(lineGeo, lineMat);
    this.scene.add(line);
    this.shootFlashLines.push({ line, mat: lineMat, geo: lineGeo, life: 0.18 });
  }

  _handleInteractions(dt) {
    let promptText = null;
    let showHackBar = false;

    // 1. Check for nearby guard takedown
    let takedownTarget = null;
    for (const guard of this.guards) {
      if (guard.canBeTakenDown(this.player)) {
        takedownTarget = guard;
        break;
      }
    }

    // 2. Check for nearby hackable terminal
    let activeTerminal = null;
    if (!takedownTarget) {
      for (const term of this.terminals) {
        if (term.canInteract(this.player)) {
          activeTerminal = term;
          break;
        }
      }
    }

    if (takedownTarget) {
      promptText = '[E] SILENT TAKEDOWN';
      if (this.input.consumeJustPressed('KeyE')) {
        takedownTarget.knockOut(this.audio);
        this.guardsNeutralized++;
      }
    } else if (activeTerminal) {
      promptText = `HOLD [E] HACK ${activeTerminal.label.toUpperCase()}`;
      if (this.input.isDown('KeyE')) {
        showHackBar = true;
        activeTerminal.hackProgress = Math.min(
          100,
          activeTerminal.hackProgress + dt * 52
        );
        this.ui.hackProgressFill.style.width = `${activeTerminal.hackProgress}%`;

        if (Math.random() < dt * 9) {
          this.audio.playHackTick(activeTerminal.hackProgress / 100);
        }

        if (activeTerminal.hackProgress >= 100) {
          activeTerminal.completeHack();
          this.audio.playObjectiveComplete();
          this._onTerminalHacked(activeTerminal);
        }
      } else {
        activeTerminal.hackProgress = Math.max(
          0,
          activeTerminal.hackProgress - dt * 35
        );
      }
    } else {
      this.input.consumeJustPressed('KeyE');
    }

    if (promptText) {
      this.ui.interactionPrompt.textContent = promptText;
      this.ui.interactionPrompt.classList.add('visible');
    } else {
      this.ui.interactionPrompt.classList.remove('visible');
    }

    this.ui.hackProgressContainer.classList.toggle('visible', showHackBar);
  }

  _onTerminalHacked(terminal) {
    if (terminal.id === 'TERM_LASER') {
      for (const laser of this.lasers) {
        laser.disable();
      }
    }

    // Update HUD mission objectives
    if (this.terminalA.isHacked) {
      this.ui.obj1.classList.remove('active');
      this.ui.obj1.classList.add('done');
      this.ui.obj2.classList.add('active');
    }
    if (this.terminalB.isHacked) {
      this.ui.obj2.classList.remove('active');
      this.ui.obj2.classList.add('done');
    }

    if (this.terminalA.isHacked && this.terminalB.isHacked) {
      this.extractionZone.setActive(true);
      this.ui.obj3.classList.add('active');
    }
  }

  _updateHUD(visibility) {
    // Stance
    this.ui.stanceText.textContent = this.player.isCrouching
      ? 'CROUCH (STEALTH)'
      : 'STANDING';
    this.ui.stanceText.style.color = this.player.isCrouching
      ? '#38ff6a'
      : '#d4f7dc';

    // Health
    const hp = Math.round(this.player.health);
    this.ui.healthValue.textContent = `${hp}%`;
    this.ui.healthFill.style.width = `${hp}%`;

    // Light Gem & Visibility %
    const visPct = Math.round(visibility * 100);
    this.ui.visibilityBar.style.width = `${visPct}%`;
    if (this.ui.visibilityValue) {
      this.ui.visibilityValue.textContent =
        visibility < 0.25 ? 'SHADOW' : visibility < 0.58 ? 'PARTIAL' : 'EXPOSED';
    }

    if (visibility < 0.25) {
      // Hidden in deep shadow: Glowing Splinter Cell emerald
      this.ui.lightGemCore.style.background =
        'radial-gradient(circle, #38ff6a 0%, #0d401c 80%)';
      this.ui.lightGemCore.style.boxShadow = '0 0 16px rgba(56, 255, 106, 0.85)';
    } else if (visibility < 0.58) {
      // Partial cover: Amber warning
      this.ui.lightGemCore.style.background =
        'radial-gradient(circle, #ffc83b 0%, #573e06 80%)';
      this.ui.lightGemCore.style.boxShadow = '0 0 14px rgba(255, 200, 59, 0.7)';
    } else {
      // Exposed in bright light: High visibility white/red
      this.ui.lightGemCore.style.background =
        'radial-gradient(circle, #ffffff 0%, #ff384c 85%)';
      this.ui.lightGemCore.style.boxShadow = '0 0 18px rgba(255, 255, 255, 0.95)';
    }

    // Acoustic Noise Meter
    const noisePct = Math.min(100, Math.round(this.player.noiseLevel * 100));
    this.ui.noiseBar.style.width = `${noisePct}%`;
    if (this.ui.noiseValue) {
      this.ui.noiseValue.textContent =
        noisePct < 10 ? 'SILENT' : noisePct < 55 ? 'MODERATE' : 'LOUD';
    }

    // EMP Charges
    const fullCharges = Math.floor(this.player.empCharges);
    this.ui.empCountText.textContent = `${fullCharges} / ${this.player.maxEmpCharges}`;
    const pips = this.ui.empPips.children;
    for (let i = 0; i < pips.length; i++) {
      pips[i].classList.toggle('charged', i < fullCharges);
    }

    // Reticle expansion when aiming
    this.ui.reticle.classList.toggle('aiming', this.input.mouseRightDown);

    // Global Alert Status
    let highestState = 'PATROL';
    for (const g of this.guards) {
      if (g.state === 'ALERT') {
        highestState = 'ALERT';
        break;
      } else if (g.state === 'INVESTIGATE') {
        highestState = 'INVESTIGATE';
      }
    }

    if (highestState === 'ALERT') {
      if (this.lastAlertState !== 'ALERT') {
        this.timesDetected++;
        this.ui.obj4.style.color = '#ff384c';
      }
      this.ui.alertDot.style.background = '#ff384c';
      this.ui.alertDot.style.boxShadow = '0 0 12px #ff384c';
      this.ui.alertText.textContent = 'COMBAT ALERT';
      this.ui.alertText.style.color = '#ff384c';
    } else if (highestState === 'INVESTIGATE') {
      this.ui.alertDot.style.background = '#ffc83b';
      this.ui.alertDot.style.boxShadow = '0 0 10px #ffc83b';
      this.ui.alertText.textContent = 'SUSPICIOUS';
      this.ui.alertText.style.color = '#ffc83b';
    } else {
      this.ui.alertDot.style.background = '#38ff6a';
      this.ui.alertDot.style.boxShadow = '0 0 8px #38ff6a';
      this.ui.alertText.textContent = 'UNALERTED';
      this.ui.alertText.style.color = '#d4f7dc';
    }
    this.lastAlertState = highestState;
  }

  _renderMinimap() {
    const ctx = this.minimapCtx;
    const w = this.ui.minimapCanvas.width;
    const h = this.ui.minimapCanvas.height;
    const cx = w / 2;
    const cy = h / 2;
    const scale = 3.8; // pixels per world meter

    ctx.clearRect(0, 0, w, h);

    // Radar sweep rings
    ctx.strokeStyle = 'rgba(56, 255, 106, 0.14)';
    ctx.lineWidth = 1;
    for (const r of [28, 56, 82]) {
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.stroke();
    }

    ctx.save();
    ctx.translate(cx, cy);
    // Rotate radar so player's camera forward is always UP
    ctx.rotate(this.cameraRig.yaw);

    const px = this.player.position.x;
    const pz = this.player.position.z;

    // 1. Draw structural walls & cover blocks relative to player
    ctx.fillStyle = 'rgba(110, 165, 130, 0.35)';
    for (const item of this.level.colliders) {
      const box = item.box || item;
      const minX = (box.min.x - px) * scale;
      const minZ = (box.min.z - pz) * scale;
      const bw = (box.max.x - box.min.x) * scale;
      const bh = (box.max.z - box.min.z) * scale;
      ctx.fillRect(minX, minZ, bw, bh);
    }

    // 2. Draw active Laser Grids
    ctx.strokeStyle = '#ff384c';
    ctx.lineWidth = 2;
    for (const laser of this.lasers) {
      if (!laser.enabled) continue;
      ctx.beginPath();
      ctx.moveTo((laser.minX - px) * scale, (laser.z - pz) * scale);
      ctx.lineTo((laser.maxX - px) * scale, (laser.z - pz) * scale);
      ctx.stroke();
    }

    // 3. Draw Objective Terminals
    for (const term of this.terminals) {
      if (term.isHacked) continue;
      const tx = (term.position.x - px) * scale;
      const tz = (term.position.z - pz) * scale;
      ctx.fillStyle = term.type === 'OBJECTIVE' ? '#38ff6a' : '#ffc83b';
      ctx.fillRect(tx - 3.5, tz - 3.5, 7, 7);
    }

    // 4. Draw Extraction Zone if active
    if (this.extractionZone.active) {
      const ex = (this.extractionZone.position.x - px) * scale;
      const ez = (this.extractionZone.position.z - pz) * scale;
      ctx.strokeStyle = '#38ff6a';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(ex, ez, 6, 0, Math.PI * 2);
      ctx.stroke();
    }

    // 5. Draw Guards & Vision Cones
    for (const g of this.guards) {
      if (g.state === 'KNOCKED_OUT') continue;
      const gx = (g.position.x - px) * scale;
      const gz = (g.position.z - pz) * scale;

      ctx.save();
      ctx.translate(gx, gz);
      ctx.rotate(-g.facingYaw);

      // Vision cone wedge
      ctx.fillStyle =
        g.state === 'ALERT'
          ? 'rgba(255, 56, 76, 0.28)'
          : g.state === 'INVESTIGATE'
          ? 'rgba(255, 200, 59, 0.24)'
          : 'rgba(220, 246, 255, 0.16)';
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, 32, -Math.PI / 2 - 0.5, -Math.PI / 2 + 0.5);
      ctx.closePath();
      ctx.fill();

      // Guard dot
      ctx.fillStyle =
        g.state === 'ALERT'
          ? '#ff384c'
          : g.state === 'INVESTIGATE'
          ? '#ffc83b'
          : '#ff7847';
      ctx.beginPath();
      ctx.arc(0, 0, 3.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    ctx.restore();

    // Player center chevron
    ctx.fillStyle = '#38ff6a';
    ctx.beginPath();
    ctx.moveTo(cx, cy - 5);
    ctx.lineTo(cx - 4, cy + 4);
    ctx.lineTo(cx + 4, cy + 4);
    ctx.closePath();
    ctx.fill();
  }

  _endMission(victory) {
    this.gameRunning = false;
    this.missionEnded = true;
    this.input.setCapture(false);
    this.touchControls.setVisible(false);

    const timeSec = Math.round(this.elapsedTime);
    const stealthRating =
      !victory
        ? 'COMPROMISED (K.I.A.)'
        : this.timesDetected === 0
        ? 'SHADOW OPERATIVE (100% GHOST)'
        : this.timesDetected <= 2
        ? 'INFILTRATOR'
        : 'COMBAT OPERATIVE';

    this.ui.modalTitle.textContent = victory
      ? 'MISSION ACCOMPLISHED'
      : 'OPERATIVE DOWN';
    this.ui.modalTitle.style.color = victory ? '#38ff6a' : '#ff384c';
    this.ui.modalSubtitle.textContent = victory
      ? 'ARGON CORE INTEL SECURED // EXTRACTION COMPLETE'
      : 'THIRD ECHELON LINK TERMINATED';

    this.ui.modalBody.innerHTML = `
      <p>${
        victory
          ? 'Excellent work, Agent. Both Argon Core cryptographic nodes were exfiltrated and you reached the extraction zone.'
          : 'Enemy security forces neutralized you before extraction could be completed. Use shadows, crouch movement, and your OCP pistol to avoid direct firefights.'
      }</p>
      <div class="controls-grid">
        <div class="control-item"><span class="key-badge">${timeSec}s</span><span>Mission Duration</span></div>
        <div class="control-item"><span class="key-badge">${this.timesDetected}</span><span>Alarms Triggered</span></div>
        <div class="control-item"><span class="key-badge">${this.guardsNeutralized}</span><span>Silent Takedowns</span></div>
        <div class="control-item"><span class="key-badge">${this.lightsNeutralized}</span><span>Lights Disrupted</span></div>
      </div>
      <p style="margin-top: 14px; color: #38ff6a; font-weight: 700;">TACTICAL RATING: ${stealthRating}</p>
    `;

    this.ui.startBtn.textContent = 'REPLAY OPERATION ARGON';
    this.ui.overlayModal.classList.remove('hidden');
    this.ui.overlayModal.style.display = 'flex';
  }

  animate() {
    requestAnimationFrame(this.animate);

    const dt = Math.min(this.clock.getDelta(), 0.1);

    if (this.gameRunning && !this.missionEnded) {
      this.elapsedTime += dt;

      // 1. Vision Modes & Gadgets
      this._handleVisionHotkeys();
      this._handleGadgetsAndWeapons();

      // 2. Update Player & Camera Rig
      this.player.update(
        dt,
        this.input,
        this.cameraRig,
        this.level,
        this.soundSystem,
        this.audio,
        this.guards,
        this.lastVisibility ?? 0
      );
      this.cameraRig.update(
        dt,
        this.input,
        this.player.position,
        this.player.isCrouching,
        this.level.occluderMeshes
      );

      // 3. Update Dynamic Lighting & Calculate Splinter Cell Light-Gem Visibility
      this.lightSystem.update(dt);
      const visibility = this.lightSystem.calculateVisibility(
        this.player.position,
        this.player.isCrouching,
        this.player.currentSpeed,
        this.level.occluderMeshes
      );
      this.lastVisibility = visibility;

      // 4. Update Acoustic Waves, Guards, Cameras, Lasers, and Terminals
      this.soundSystem.update(dt);
      this.visionModes.update(dt, this.guards, this.cameras, this.lasers);
      for (const guard of this.guards) {
        guard.update(
          dt,
          this.player,
          visibility,
          this.level,
          this.audio,
          this.soundSystem,
          this.guards
        );
        if (guard.justFired) {
          this.cameraRig.addTrauma(0.32);
        }
      }
      for (const cam of this.cameras) {
        cam.update(
          dt,
          this.player,
          visibility,
          this.level.occluderMeshes,
          this.guards,
          this.audio
        );
      }
      for (const laser of this.lasers) {
        laser.update(dt, this.player, this.guards, this.audio, this.soundSystem);
      }
      for (const term of this.terminals) {
        term.update(dt);
      }

      // 5. Context-Sensitive Interactions (Takedown & Hacking)
      this._handleInteractions(dt);

      // 6. Check Mission Win / Loss conditions
      if (this.player.health <= 0) {
        this._endMission(false);
      } else if (this.extractionZone.update(dt, this.player)) {
        this.ui.obj3.classList.remove('active');
        this.ui.obj3.classList.add('done');
        if (this.timesDetected === 0) {
          this.ui.obj4.classList.add('done');
        }
        this.audio.playObjectiveComplete();
        this._endMission(true);
      }

      // 7. Update HUD & Radar Minimap
      this._updateHUD(visibility);
      this._renderMinimap();
    } else {
      // Idle background camera orbit while briefing modal is open
      const t = performance.now() * 0.0003;
      this.camera.position.set(Math.sin(t) * 8, 5.5, 20 + Math.cos(t) * 6);
      this.camera.lookAt(0, 1.2, 4);
    }

    // Fade out any EMP tracer lines
    for (let i = this.shootFlashLines.length - 1; i >= 0; i--) {
      const item = this.shootFlashLines[i];
      item.life -= dt;
      item.mat.opacity = Math.max(0, item.life / 0.18);
      if (item.life <= 0) {
        this.scene.remove(item.line);
        item.geo.dispose();
        item.mat.dispose();
        this.shootFlashLines.splice(i, 1);
      }
    }

    this.renderer.render(this.scene, this.camera);
  }
}

const initGame = () => {
  if (!window.shadowCellGame) {
    window.__shadowCellReady = true;
    window.shadowCellGame = new ShadowCellGame();
  }
};
if (document.readyState === 'loading') {
  window.addEventListener('DOMContentLoaded', initGame);
} else {
  initGame();
}
