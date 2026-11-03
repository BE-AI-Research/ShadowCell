// src/systems/LightSystem.js
// Manages dynamic tactical lights, shootable/EMP-disableable fixtures, and computes the Light-Gem visibility [0..1]

import * as THREE from '../../vendor/three.module.js';

export class LightSystem {
  constructor(scene) {
    this.scene = scene;
    this.lights = []; // { id, position, light, bulbMesh, beamMesh, range, intensity, spotDir, spotCos, enabled, empTimer, baseColor }
    this.raycaster = new THREE.Raycaster();
    this.ambientBase = 0.05; // Deep shadow baseline
  }

  addTacticalSpotLight({
    id,
    position,
    targetPosition = null,
    color = 0xdff6ff,
    intensity = 1.45,
    range = 13.5,
    angle = Math.PI / 3.1,
    shootable = true,
  }) {
    const pos = position.clone();
    const tgt = targetPosition
      ? targetPosition.clone()
      : new THREE.Vector3(pos.x, 0, pos.z);

    // Three.js SpotLight
    const spot = new THREE.SpotLight(color, intensity * 18, range, angle, 0.55, 1.5);
    spot.position.copy(pos);
    spot.target.position.copy(tgt);
    this.scene.add(spot);
    this.scene.add(spot.target);

    // Ceiling fixture housing + shootable bulb mesh
    const fixtureGroup = new THREE.Group();
    fixtureGroup.position.copy(pos);

    const housingGeo = new THREE.CylinderGeometry(0.28, 0.36, 0.16, 12);
    const housingMat = new THREE.MeshStandardMaterial({
      color: 0x1e262b,
      roughness: 0.7,
      metalness: 0.6,
    });
    const housing = new THREE.Mesh(housingGeo, housingMat);
    housing.position.y = 0.06;
    fixtureGroup.add(housing);

    const bulbGeo = new THREE.SphereGeometry(0.18, 12, 10);
    const bulbMat = new THREE.MeshBasicMaterial({ color });
    const bulbMesh = new THREE.Mesh(bulbGeo, bulbMat);
    bulbMesh.position.y = -0.04;
    fixtureGroup.add(bulbMesh);

    // Subtle volumetric light cone mesh so player clearly sees lit vs dark zones
    const coneHeight = Math.min(pos.y, range * 0.65);
    const coneRadius = Math.tan(angle * 0.68) * coneHeight;
    const coneGeo = new THREE.ConeGeometry(coneRadius, coneHeight, 20, 1, true);
    coneGeo.translate(0, -coneHeight / 2, 0);
    const coneMat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.055,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const beamMesh = new THREE.Mesh(coneGeo, coneMat);
    fixtureGroup.add(beamMesh);

    this.scene.add(fixtureGroup);

    const spotDir = tgt.clone().sub(pos).normalize();
    const entry = {
      id: id || `light_${this.lights.length}`,
      position: pos,
      light: spot,
      bulbMesh,
      beamMesh,
      range,
      intensity,
      spotDir,
      spotCos: Math.cos(angle * 0.92),
      enabled: true,
      permanentlyBroken: false,
      empTimer: 0,
      baseColor: new THREE.Color(color),
      baseIntensity: intensity * 18,
      shootable,
    };

    bulbMesh.userData.tacticalLight = entry;
    housing.userData.tacticalLight = entry;

    this.lights.push(entry);
    return entry;
  }

  // Convenience wrapper used by the game bootstrap (ceiling fixture configs)
  addFixture({ id, position, intensity = 1.45, distance = 13.5, color = 0xdff6ff, shootable = true }) {
    return this.addTacticalSpotLight({
      id,
      position,
      color,
      intensity: intensity * 0.6,
      range: distance,
      shootable,
    });
  }

  getLightById(id) {
    return this.lights.find((l) => l.id === id) || null;
  }

  disableFixtureWithEMP(id, duration = 18.0) {
    this.disableLightWithEMP(this.getLightById(id), duration);
  }

  // Light-gem visibility from raw player state (wraps computeVisibility)
  calculateVisibility(position, isCrouching, currentSpeed, occluderMeshes, guards = null) {
    return this.computeVisibility(
      { position, isCrouching, currentSpeed },
      guards,
      occluderMeshes || []
    );
  }

  disableLightWithEMP(entry, duration = 18.0) {
    if (!entry) return;
    entry.enabled = false;
    entry.empTimer = duration;
    entry.light.intensity = 0;
    entry.bulbMesh.material.color.setHex(0x11181a);
    if (entry.beamMesh) entry.beamMesh.visible = false;
  }

  toggleZoneLights(lightIds) {
    let anyEnabled = false;
    for (const entry of this.lights) {
      if (lightIds.includes(entry.id) && !entry.permanentlyBroken) {
        if (entry.enabled) anyEnabled = true;
      }
    }
    const nextState = !anyEnabled;
    for (const entry of this.lights) {
      if (lightIds.includes(entry.id) && !entry.permanentlyBroken) {
        entry.enabled = nextState;
        entry.empTimer = 0;
        entry.light.intensity = nextState ? entry.baseIntensity : 0;
        entry.bulbMesh.material.color.copy(
          nextState ? entry.baseColor : new THREE.Color(0x11181a)
        );
        if (entry.beamMesh) entry.beamMesh.visible = nextState;
      }
    }
    return nextState;
  }

  update(dt) {
    for (const entry of this.lights) {
      if (!entry.enabled && entry.empTimer > 0 && !entry.permanentlyBroken) {
        entry.empTimer -= dt;
        // Flicker warning in final 2 seconds before light restores
        if (entry.empTimer > 0 && entry.empTimer < 2.0) {
          const flicker = Math.sin(entry.empTimer * 35) > 0.3;
          entry.light.intensity = flicker ? entry.baseIntensity * 0.25 : 0;
          entry.bulbMesh.material.color.setHex(flicker ? 0x558899 : 0x11181a);
        } else if (entry.empTimer <= 0) {
          entry.empTimer = 0;
          entry.enabled = true;
          entry.light.intensity = entry.baseIntensity;
          entry.bulbMesh.material.color.copy(entry.baseColor);
          if (entry.beamMesh) entry.beamMesh.visible = true;
        }
      }
    }
  }

  // Computes Splinter Cell Light-Gem visibility [0.0 .. 1.0]
  computeVisibility(player, guards, occluderMeshes) {
    let rawLight = this.ambientBase;

    const samplePoint = new THREE.Vector3(
      player.position.x,
      player.position.y + (player.isCrouching ? 0.65 : 1.05),
      player.position.z
    );

    // 1. Sample all static/shootable ceiling lights
    for (const entry of this.lights) {
      if (!entry.enabled) continue;

      const toPlayer = samplePoint.clone().sub(entry.position);
      const dist = toPlayer.length();
      if (dist > entry.range || dist < 0.001) continue;

      const dir = toPlayer.clone().divideScalar(dist);
      const cosAngle = dir.dot(entry.spotDir);
      if (cosAngle < entry.spotCos) continue;

      // Shadow occlusion raycast against walls/crates
      this.raycaster.set(entry.position, dir);
      this.raycaster.near = 0.2;
      this.raycaster.far = dist - 0.15;
      const hits = this.raycaster.intersectObjects(occluderMeshes, false);
      if (hits.length > 0) continue; // Player is in cast shadow!

      const distFactor = Math.max(0, 1 - (dist / entry.range) ** 1.7);
      const coneFactor = THREE.MathUtils.clamp(
        (cosAngle - entry.spotCos) / (1 - entry.spotCos + 0.0001),
        0,
        1
      );

      rawLight += entry.intensity * distFactor * (0.35 + 0.65 * coneFactor);
    }

    // 2. Sample active guard flashlights
    if (guards) {
      for (const guard of guards) {
        if (guard.state === 'KNOCKED_OUT') continue;
        const gEye = guard.getEyePosition();
        const toPlayer = samplePoint.clone().sub(gEye);
        const dist = toPlayer.length();
        if (dist > 11.5 || dist < 0.01) continue;

        const dir = toPlayer.clone().divideScalar(dist);
        const gForward = guard.getForwardVector();
        const cosAngle = dir.dot(gForward);
        if (cosAngle < 0.72) continue;

        this.raycaster.set(gEye, dir);
        this.raycaster.near = 0.2;
        this.raycaster.far = dist - 0.2;
        const hits = this.raycaster.intersectObjects(occluderMeshes, false);
        if (hits.length > 0) continue;

        const flashContribution = (1 - dist / 11.5) * ((cosAngle - 0.72) / 0.28) * 0.65;
        rawLight += flashContribution;
      }
    }

    // 3. Stance & motion modifiers
    if (player.isCrouching) {
      rawLight *= 0.68; // Crouching tucks operative into low shadows
    }
    if (player.currentSpeed > 4.2) {
      rawLight += 0.12; // Sprinting silhouette penalty
    } else if (player.currentSpeed > 1.0) {
      rawLight += 0.03;
    }

    return THREE.MathUtils.clamp(rawLight, 0.02, 1.0);
  }

  getShootableMeshes() {
    const meshes = [];
    for (const entry of this.lights) {
      if (entry.shootable) {
        meshes.push(entry.bulbMesh);
      }
    }
    return meshes;
  }
}
