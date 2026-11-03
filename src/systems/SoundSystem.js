// src/systems/SoundSystem.js
// Propagates 3D acoustic wave rings on the floor (footsteps, whistle lures, EMP snaps, alarms) and alerts nearby guards

import * as THREE from '../../vendor/three.module.js';

export class SoundSystem {
  constructor(scene) {
    this.scene = scene;
    this.rings = [];
    this.currentNoiseLevel = 0; // [0..1] for HUD noise meter
  }

  emitNoise(position, radius, loudness = 0.5, color = 0x38ff6a, guards = []) {
    this.currentNoiseLevel = Math.max(this.currentNoiseLevel, loudness);

    // Visual 3D sonar ring on the ground
    const ringGeo = new THREE.RingGeometry(0.18, 0.32, 32);
    ringGeo.rotateX(-Math.PI / 2);
    const ringMat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.78,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(ringGeo, ringMat);
    mesh.position.set(position.x, 0.04, position.z);
    this.scene.add(mesh);

    this.rings.push({
      mesh,
      maxRadius: radius,
      age: 0,
      duration: Math.min(1.1, Math.max(0.45, radius * 0.065)),
    });

    // Notify guards within acoustic range
    if (guards && guards.length > 0) {
      for (const guard of guards) {
        if (guard.state === 'KNOCKED_OUT') continue;
        const dist = guard.position.distanceTo(position);
        if (dist <= radius) {
          const hearingIntensity = (1 - dist / radius) * loudness;
          guard.onHearSound(position.clone(), hearingIntensity, radius >= 11);
        }
      }
    }
  }

  update(dt) {
    // Decay HUD noise level smoothly
    this.currentNoiseLevel = Math.max(0, this.currentNoiseLevel - dt * 1.65);

    for (let i = this.rings.length - 1; i >= 0; i--) {
      const r = this.rings[i];
      r.age += dt;
      const t = r.age / r.duration;
      if (t >= 1) {
        this.scene.remove(r.mesh);
        r.mesh.geometry.dispose();
        r.mesh.material.dispose();
        this.rings.splice(i, 1);
        continue;
      }

      const scale = 1 + t * (r.maxRadius * 3.1);
      r.mesh.scale.set(scale, 1, scale);
      r.mesh.material.opacity = (1 - t) * 0.72;
    }
  }
}
