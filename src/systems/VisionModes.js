// src/systems/VisionModes.js
// Manages Standard, Night Vision (NVG), and Thermal Infrared vision modes

import * as THREE from '../../vendor/three.module.js';

export class VisionModes {
  constructor(scene, ambientLight, hemiLight, audio) {
    this.scene = scene;
    this.ambientLight = ambientLight || new THREE.AmbientLight(0x16241e, 0.72);
    this.hemiLight = hemiLight || new THREE.HemisphereLight(0x284038, 0x080c0a, 0.55);
    this.audio = audio;

    if (this.scene && !ambientLight) {
      this.scene.add(this.ambientLight);
    }
    if (this.scene && !hemiLight) {
      this.scene.add(this.hemiLight);
    }

    this.mode = 'NORMAL'; // 'NORMAL' | 'NVG' | 'THERMAL'
    this.overlayEl = document.getElementById('vision-overlay');
    this.badgeNvg = document.getElementById('mode-nvg') || document.getElementById('badge-nvg') || document.getElementById('nvg-badge');
    this.badgeThermal = document.getElementById('mode-therm') || document.getElementById('badge-thermal') || document.getElementById('thermal-badge');

    this.standardFog = new THREE.FogExp2(0x050a08, 0.022);
    this.nvgFog = new THREE.FogExp2(0x082812, 0.013);
    this.thermalFog = new THREE.FogExp2(0x050922, 0.018);

    if (this.scene) {
      this.scene.fog = this.standardFog;
    }
  }

  get currentMode() {
    return this.mode;
  }

  toggleMode(requestedMode, guards = [], securityTech = null, cameras = [], lasers = []) {
    const normalized = requestedMode === 'STANDARD' ? 'NORMAL' : requestedMode;
    const nextMode = this.mode === normalized ? 'NORMAL' : normalized;
    this.setMode(nextMode, guards, securityTech, cameras, lasers);
    return this.mode;
  }

  setMode(newMode, guards = [], securityTech = null, cameras = [], lasers = []) {
    const normalized = newMode === 'STANDARD' ? 'NORMAL' : newMode;
    if (this.mode === normalized) return this.mode;
    const turningOn = normalized !== 'NORMAL';
    this.mode = normalized;

    if (this.audio && typeof this.audio.playNVGToggle === 'function') {
      this.audio.playNVGToggle(turningOn);
    }

    if (this.overlayEl) {
      this.overlayEl.className = '';
      if (normalized === 'NVG') this.overlayEl.classList.add('nvg');
      if (normalized === 'THERMAL') this.overlayEl.classList.add('thermal');
    }

    if (this.badgeNvg) {
      this.badgeNvg.classList.toggle('active', normalized === 'NVG');
    }
    if (this.badgeThermal) {
      this.badgeThermal.classList.toggle('active', normalized === 'THERMAL');
    }

    if (normalized === 'NORMAL') {
      this.ambientLight.color.setHex(0x16241e);
      this.ambientLight.intensity = 0.72;
      this.hemiLight.color.setHex(0x284038);
      this.hemiLight.groundColor.setHex(0x080c0a);
      this.hemiLight.intensity = 0.55;
      if (this.scene) {
        this.scene.fog = this.standardFog;
        this.scene.background = new THREE.Color(0x040806);
      }
    } else if (normalized === 'NVG') {
      // High-gain green image intensification
      this.ambientLight.color.setHex(0x46ff7a);
      this.ambientLight.intensity = 2.65;
      this.hemiLight.color.setHex(0x66ff99);
      this.hemiLight.groundColor.setHex(0x10381c);
      this.hemiLight.intensity = 1.65;
      if (this.scene) {
        this.scene.fog = this.nvgFog;
        this.scene.background = new THREE.Color(0x051c0b);
      }
    } else if (normalized === 'THERMAL') {
      // Cold deep-blue ambient + hot orange/red actors & electronics
      this.ambientLight.color.setHex(0x2848c8);
      this.ambientLight.intensity = 1.95;
      this.hemiLight.color.setHex(0x3a64ff);
      this.hemiLight.groundColor.setHex(0x091032);
      this.hemiLight.intensity = 1.3;
      if (this.scene) {
        this.scene.fog = this.thermalFog;
        this.scene.background = new THREE.Color(0x04071a);
      }
    }

    this._applyHighlights(guards, securityTech, cameras, lasers);
    return this.mode;
  }

  _applyHighlights(guards = [], securityTech = null, cameras = [], lasers = []) {
    const isThermal = this.mode === 'THERMAL';
    const isNVG = this.mode === 'NVG';

    if (Array.isArray(guards)) {
      for (const guard of guards) {
        if (guard && typeof guard.setThermalHighlight === 'function') {
          guard.setThermalHighlight(isThermal);
        }
      }
    }
    if (securityTech && typeof securityTech.setThermalHighlight === 'function') {
      securityTech.setThermalHighlight(isThermal);
    }
    if (Array.isArray(cameras)) {
      for (const cam of cameras) {
        if (cam && typeof cam.setThermalHighlight === 'function') {
          cam.setThermalHighlight(isThermal);
        }
      }
    }
    if (Array.isArray(lasers)) {
      for (const laser of lasers) {
        if (laser && typeof laser.setVisionEnhance === 'function') {
          laser.setVisionEnhance(isThermal || isNVG);
        }
      }
    }
  }

  update(dt, guards = [], cameras = [], lasers = []) {
    this._applyHighlights(guards, null, cameras, lasers);
  }
}
