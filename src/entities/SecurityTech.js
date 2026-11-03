// src/entities/SecurityTech.js
// Security Systems & Interactive Mission Objectives:
// - SecurityCamera: panning CCTV camera with volumetric scan cone, EMP/shootable disable, alert trigger
// - LaserGrid: rhythmic or static security laser beams that trigger alarms on contact
// - HackTerminal: Server-room terminals & laser override consoles with progress bar hacking
// - ExtractionZone: Illuminated extraction beacon active after objectives are complete

import * as THREE from '../../vendor/three.module.js';

export class SecurityCamera {
  constructor(scene, id, position, baseYaw = 0, sweepAngle = 0.85, speed = 0.9) {
    this.scene = scene;
    this.id = id;
    this.position = position.clone();
    this.baseYaw = baseYaw;
    this.sweepAngle = sweepAngle;
    this.speed = speed;
    this.currentYaw = baseYaw;
    this.pitch = -0.38;

    this.state = 'ACTIVE'; // 'ACTIVE' | 'DISABLED' | 'DESTROYED'
    this.disableTimer = 0;
    this.suspicion = 0;
    this.sweepTime = Math.random() * 5;
    this.viewRange = 12.5;
    this.fovCos = Math.cos(THREE.MathUtils.degToRad(34));
    this.raycaster = new THREE.Raycaster();

    this.group = new THREE.Group();
    this.group.position.copy(this.position);

    this.mountMat = new THREE.MeshStandardMaterial({
      color: 0x222a33,
      roughness: 0.5,
      metalness: 0.7,
    });
    const bracket = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.28, 0.18), this.mountMat);
    bracket.position.y = 0.12;
    this.group.add(bracket);

    this.headPivot = new THREE.Group();
    this.group.add(this.headPivot);

    this.housingMesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.24, 0.18, 0.42),
      this.mountMat
    );
    this.housingMesh.rotation.x = this.pitch;
    this.housingMesh.userData.cameraRef = this;
    this.housingMesh.userData.isSecurityCamera = true;
    this.headPivot.add(this.housingMesh);

    this.ledMat = new THREE.MeshBasicMaterial({ color: 0xff384c });
    this.ledMesh = new THREE.Mesh(new THREE.SphereGeometry(0.055, 8, 8), this.ledMat);
    this.ledMesh.position.set(0, -0.02, -0.22);
    this.housingMesh.add(this.ledMesh);

    // Volumetric CCTV scan cone
    const coneLen = 8.5;
    const coneRad = 2.6;
    const coneGeo = new THREE.ConeGeometry(coneRad, coneLen, 16, 1, true);
    coneGeo.translate(0, -coneLen / 2, 0);
    coneGeo.rotateX(Math.PI / 2);
    this.coneMat = new THREE.MeshBasicMaterial({
      color: 0xff384c,
      transparent: true,
      opacity: 0.075,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.coneMesh = new THREE.Mesh(coneGeo, this.coneMat);
    this.coneMesh.position.set(0, 0, -0.22);
    this.housingMesh.add(this.coneMesh);

    this.scene.add(this.group);
  }

  disableWithEMP(duration = 12.0) {
    if (this.state === 'DESTROYED') return;
    this.state = 'DISABLED';
    this.disableTimer = duration;
    this.coneMesh.visible = false;
    this.ledMat.color.setHex(0x4fc3f7);
  }

  destroy() {
    this.state = 'DESTROYED';
    this.coneMesh.visible = false;
    this.ledMat.color.setHex(0x11151a);
    this.housingMesh.rotation.x = -0.95;
  }

  getForwardVector() {
    const dir = new THREE.Vector3(0, 0, -1);
    dir.applyEuler(new THREE.Euler(this.pitch, this.currentYaw, 0, 'YXZ'));
    return dir.normalize();
  }

  update(dt, player, visibility, occluderMeshes, guards, audio) {
    if (this.state === 'DESTROYED') return;

    if (this.state === 'DISABLED') {
      this.disableTimer -= dt;
      if (this.disableTimer <= 0) {
        this.state = 'ACTIVE';
        this.coneMesh.visible = true;
        this.ledMat.color.setHex(0xff384c);
      }
      return;
    }

    // Pan left and right smoothly
    this.sweepTime += dt * this.speed;
    this.currentYaw = this.baseYaw + Math.sin(this.sweepTime) * this.sweepAngle;
    this.headPivot.rotation.y = this.currentYaw;

    // Check line of sight to Player
    const targetPos = new THREE.Vector3(
      player.position.x,
      player.position.y + (player.isCrouching ? 0.65 : 1.15),
      player.position.z
    );
    const toPlayer = targetPos.clone().sub(this.position);
    const dist = toPlayer.length();
    const effectiveRange = THREE.MathUtils.lerp(3.2, this.viewRange, visibility);

    let spotted = false;
    if (dist <= effectiveRange) {
      const dir = toPlayer.clone().divideScalar(dist);
      const forward = this.getForwardVector();
      if (dir.dot(forward) >= this.fovCos) {
        this.raycaster.set(this.position, dir);
        this.raycaster.near = 0.25;
        this.raycaster.far = dist - 0.15;
        const hits = this.raycaster.intersectObjects(occluderMeshes, false);
        if (hits.length === 0) {
          spotted = true;
        }
      }
    }

    if (spotted) {
      this.suspicion = Math.min(100, this.suspicion + dt * (55 + visibility * 85));
      this.coneMat.opacity = 0.16;
      if (this.suspicion >= 100) {
        // Alert nearby guards to player's position
        for (const guard of guards) {
          if (guard.position.distanceTo(this.position) < 26) {
            guard.triggerAlert(player.position, audio);
          }
        }
      }
    } else {
      this.suspicion = Math.max(0, this.suspicion - dt * 25);
      this.coneMat.opacity = 0.075;
    }
  }

  setThermalHighlight(isThermal) {
    if (this.mountMat) {
      this.mountMat.emissive.setHex(isThermal ? 0xff6b00 : 0x000000);
      this.mountMat.emissiveIntensity = isThermal ? 0.65 : 0.0;
    }
  }
}

export class LaserGrid {
  constructor(scene, id, startX, endX, z, heights = [0.55, 1.25]) {
    this.scene = scene;
    this.id = id;
    this.minX = Math.min(startX, endX);
    this.maxX = Math.max(startX, endX);
    this.z = z;
    this.heights = heights;
    this.enabled = true;
    this.pulseTimer = 0;
    this.alarmCooldown = 0;

    this.group = new THREE.Group();
    this.beams = [];

    const span = this.maxX - this.minX;
    const centerX = (this.minX + this.maxX) / 2;

    this.beamMat = new THREE.MeshBasicMaterial({
      color: 0xff2a4b,
      transparent: true,
      opacity: 0.72,
    });

    const emitterMat = new THREE.MeshStandardMaterial({
      color: 0x26323e,
      roughness: 0.4,
      metalness: 0.8,
    });

    for (const h of heights) {
      const beamGeo = new THREE.CylinderGeometry(0.018, 0.018, span, 8);
      beamGeo.rotateZ(Math.PI / 2);
      const beam = new THREE.Mesh(beamGeo, this.beamMat);
      beam.position.set(centerX, h, z);
      this.group.add(beam);
      this.beams.push(beam);

      const leftNode = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.12), emitterMat);
      leftNode.position.set(this.minX, h, z);
      const rightNode = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.12), emitterMat);
      rightNode.position.set(this.maxX, h, z);
      this.group.add(leftNode, rightNode);
    }

    this.scene.add(this.group);
  }

  setThermalHighlight(isThermal) {
    this.beamMat.opacity = isThermal ? 0.96 : 0.72;
  }

  setVisionEnhance(enhanced) {
    this.setThermalHighlight(enhanced);
  }

  disable() {
    this.enabled = false;
    for (const b of this.beams) {
      b.visible = false;
    }
  }

  update(dt, player, guards, audio, soundSystem) {
    if (!this.enabled) return;

    this.pulseTimer += dt;
    this.alarmCooldown = Math.max(0, this.alarmCooldown - dt);

    // Subtle rhythmic flicker cycle (every 5.5s, drops for 1.4s so skilled operatives can also time it)
    const cycle = this.pulseTimer % 5.8;
    const beamsActive = cycle < 4.35;
    for (const b of this.beams) {
      b.visible = beamsActive;
    }

    if (!beamsActive) return;

    const isCrouchSafe =
      player.isCrouching && this.heights.every((h) => h > 0.9);

    // Check if player intersects the laser plane
    if (
      !isCrouchSafe &&
      player.position.x >= this.minX &&
      player.position.x <= this.maxX &&
      Math.abs(player.position.z - this.z) < 0.36
    ) {
      if (this.alarmCooldown <= 0) {
        this.alarmCooldown = 2.5;
        if (audio) audio.playAlertSting('alert');
        soundSystem.emitNoise(player.position, 18.0, 1.0, 0xff384c, guards, true);
        for (const guard of guards) {
          if (guard.position.distanceTo(player.position) < 25) {
            guard.triggerAlert(player.position, audio);
          }
        }
      }
    }
  }
}

export class HackTerminal {
  constructor(scene, id, label, position, facingYaw = 0, type = 'OBJECTIVE') {
    this.scene = scene;
    this.id = id;
    this.label = label;
    this.position = position.clone();
    this.type = type; // 'OBJECTIVE' | 'LASER_CONTROL'
    this.isHacked = false;
    this.hackProgress = 0; // 0..100

    this.group = new THREE.Group();
    this.group.position.copy(this.position);
    this.group.rotation.y = facingYaw;

    const deskMat = new THREE.MeshStandardMaterial({
      color: 0x1d2630,
      roughness: 0.6,
      metalness: 0.5,
    });
    const base = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.95, 0.65), deskMat);
    base.position.y = 0.475;
    this.group.add(base);

    const monitorFrame = new THREE.Mesh(
      new THREE.BoxGeometry(0.75, 0.48, 0.08),
      deskMat
    );
    monitorFrame.position.set(0, 1.22, -0.1);
    monitorFrame.rotation.x = -0.15;
    this.group.add(monitorFrame);

    this.screenMat = new THREE.MeshBasicMaterial({
      color: type === 'OBJECTIVE' ? 0x38ff6a : 0xffc83b,
    });
    this.screenMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(0.66, 0.38),
      this.screenMat
    );
    this.screenMesh.position.set(0, 1.22, -0.055);
    this.screenMesh.rotation.x = -0.15;
    this.group.add(this.screenMesh);

    // Floating holographic diamond marker above objective terminals
    this.markerMat = new THREE.MeshBasicMaterial({
      color: type === 'OBJECTIVE' ? 0x38ff6a : 0xffc83b,
      wireframe: true,
    });
    this.markerMesh = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.22, 0),
      this.markerMat
    );
    this.markerMesh.position.set(0, 2.05, 0);
    this.group.add(this.markerMesh);

    this.scene.add(this.group);
  }

  canInteract(player) {
    if (this.isHacked) return false;
    return this.position.distanceTo(player.position) <= 2.3;
  }

  update(dt) {
    this.markerMesh.rotation.y += dt * 1.8;
    this.markerMesh.position.y = 2.05 + Math.sin(performance.now() * 0.004) * 0.08;
  }

  completeHack() {
    this.isHacked = true;
    this.hackProgress = 100;
    this.screenMat.color.setHex(0x285cff);
    this.markerMesh.visible = false;
  }
}

export class ExtractionZone {
  constructor(scene, position) {
    this.scene = scene;
    this.position = position.clone();
    this.active = false;

    this.group = new THREE.Group();
    this.group.position.copy(this.position);

    const ringGeo = new THREE.RingGeometry(1.3, 1.55, 32);
    ringGeo.rotateX(-Math.PI / 2);
    this.ringMat = new THREE.MeshBasicMaterial({
      color: 0x38ff6a,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.2,
    });
    this.ringMesh = new THREE.Mesh(ringGeo, this.ringMat);
    this.ringMesh.position.y = 0.03;
    this.group.add(this.ringMesh);

    const pillarGeo = new THREE.CylinderGeometry(1.35, 1.35, 2.6, 24, 1, true);
    this.pillarMat = new THREE.MeshBasicMaterial({
      color: 0x38ff6a,
      transparent: true,
      opacity: 0.0,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.pillarMesh = new THREE.Mesh(pillarGeo, this.pillarMat);
    this.pillarMesh.position.y = 1.3;
    this.group.add(this.pillarMesh);

    this.scene.add(this.group);
  }

  setActive(active) {
    this.active = active;
    this.ringMat.opacity = active ? 0.85 : 0.2;
    this.pillarMat.opacity = active ? 0.14 : 0.0;
  }

  update(dt, player) {
    if (!this.active) return false;
    this.ringMesh.rotation.z += dt * 1.2;
    const dist = Math.hypot(
      player.position.x - this.position.x,
      player.position.z - this.position.z
    );
    return dist < 1.55;
  }
}
