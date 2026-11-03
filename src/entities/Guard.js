// src/entities/Guard.js
// Enemy Patrol Guard AI with FSM (PATROL, INVESTIGATE, ALERT, KNOCKED_OUT),
// flashlight + ground vision cone, Light-Gem awareness math, and silent rear takedowns.

import * as THREE from '../../vendor/three.module.js';

export class Guard {
  constructor(scene, id, waypoints) {
    this.scene = scene;
    this.id = id;
    this.waypoints = waypoints.map((p) => p.clone());
    this.currentWaypointIndex = 0;

    this.position = this.waypoints[0].clone();
    this.facingYaw = 0;
    this.state = 'PATROL'; // 'PATROL' | 'INVESTIGATE' | 'ALERT' | 'KNOCKED_OUT'

    this.suspicion = 0; // 0..100
    this.investigateTarget = null;
    this.investigateTimer = 0;
    this.waypointPauseTimer = 0;
    this.shootCooldown = 0;
    this.justFired = false;
    this.walkCycle = 0;

    this.viewRange = 14.5;
    this.fovCos = Math.cos(THREE.MathUtils.degToRad(48)); // 96-degree total vision cone

    this.raycaster = new THREE.Raycaster();
    this.bodyMeshes = [];

    this.mesh = new THREE.Group();
    this.mesh.position.copy(this.position);
    this._buildGuardModel();
    this.scene.add(this.mesh);
  }

  _buildGuardModel() {
    this.standardUniformMat = new THREE.MeshStandardMaterial({
      color: 0x2b362f,
      roughness: 0.72,
      metalness: 0.25,
    });
    this.armorMat = new THREE.MeshStandardMaterial({
      color: 0x1c2220,
      roughness: 0.6,
      metalness: 0.4,
    });
    this.skinMat = new THREE.MeshStandardMaterial({
      color: 0x8f735e,
      roughness: 0.7,
    });
    this.thermalMat = new THREE.MeshBasicMaterial({
      color: 0xff5a1f,
    });

    this.bodyRoot = new THREE.Group();
    this.mesh.add(this.bodyRoot);

    const torso = new THREE.Mesh(
      new THREE.BoxGeometry(0.5, 0.62, 0.28),
      this.standardUniformMat
    );
    torso.position.y = 1.18;
    this.bodyRoot.add(torso);
    this.bodyMeshes.push({ mesh: torso, defaultMat: this.standardUniformMat });

    const vest = new THREE.Mesh(new THREE.BoxGeometry(0.53, 0.45, 0.31), this.armorMat);
    vest.position.y = 1.2;
    this.bodyRoot.add(vest);
    this.bodyMeshes.push({ mesh: vest, defaultMat: this.armorMat });

    // Head + Beret/Helmet + Red Visor
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.27, 0.28, 0.27), this.skinMat);
    head.position.y = 1.64;
    this.bodyRoot.add(head);
    this.bodyMeshes.push({ mesh: head, defaultMat: this.skinMat });

    const helmet = new THREE.Mesh(
      new THREE.BoxGeometry(0.3, 0.14, 0.31),
      this.armorMat
    );
    helmet.position.y = 1.75;
    this.bodyRoot.add(helmet);
    this.bodyMeshes.push({ mesh: helmet, defaultMat: this.armorMat });

    // Overhead status beacon (Green = Patrol, Amber = Investigate, Red = Alert)
    this.statusBeacon = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.09, 0),
      new THREE.MeshBasicMaterial({ color: 0x38ff6a })
    );
    this.statusBeacon.position.set(0, 2.08, 0);
    this.bodyRoot.add(this.statusBeacon);

    const armGeo = new THREE.BoxGeometry(0.15, 0.52, 0.15);
    armGeo.translate(0, -0.22, 0);
    this.leftArm = new THREE.Mesh(armGeo, this.standardUniformMat);
    this.leftArm.position.set(-0.33, 1.4, 0);
    this.rightArm = new THREE.Mesh(armGeo, this.standardUniformMat);
    this.rightArm.position.set(0.33, 1.4, 0);
    this.rightArm.rotation.x = 0.55; // Holding rifle & flashlight forward
    this.bodyRoot.add(this.leftArm, this.rightArm);
    this.bodyMeshes.push(
      { mesh: this.leftArm, defaultMat: this.standardUniformMat },
      { mesh: this.rightArm, defaultMat: this.standardUniformMat }
    );

    const legGeo = new THREE.BoxGeometry(0.18, 0.62, 0.19);
    legGeo.translate(0, -0.3, 0);
    this.leftLeg = new THREE.Mesh(legGeo, this.standardUniformMat);
    this.leftLeg.position.set(-0.14, 0.85, 0);
    this.rightLeg = new THREE.Mesh(legGeo, this.standardUniformMat);
    this.rightLeg.position.set(0.14, 0.85, 0);
    this.bodyRoot.add(this.leftLeg, this.rightLeg);
    this.bodyMeshes.push(
      { mesh: this.leftLeg, defaultMat: this.standardUniformMat },
      { mesh: this.rightLeg, defaultMat: this.standardUniformMat }
    );

    // Tactical Flashlight volumetric cone attached to guard's chest/rifle
    const coneLen = 9.5;
    const coneRad = 3.2;
    const coneGeo = new THREE.ConeGeometry(coneRad, coneLen, 18, 1, true);
    coneGeo.translate(0, -coneLen / 2, 0);
    coneGeo.rotateX(Math.PI / 2);
    this.visionConeMat = new THREE.MeshBasicMaterial({
      color: 0xdcf6ff,
      transparent: true,
      opacity: 0.065,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.visionConeMesh = new THREE.Mesh(coneGeo, this.visionConeMat);
    this.visionConeMesh.position.set(0, 1.15, -0.25);
    this.bodyRoot.add(this.visionConeMesh);
  }

  setThermalHighlight(enabled) {
    for (const item of this.bodyMeshes) {
      item.mesh.material = enabled ? this.thermalMat : item.defaultMat;
    }
  }

  getEyePosition() {
    return new THREE.Vector3(this.position.x, this.position.y + 1.55, this.position.z);
  }

  getForwardVector() {
    return new THREE.Vector3(
      -Math.sin(this.facingYaw),
      0,
      -Math.cos(this.facingYaw)
    ).normalize();
  }

  canBeTakenDown(player) {
    if (this.state === 'KNOCKED_OUT') return false;
    const dist = this.position.distanceTo(player.position);
    if (dist > 2.25) return false;

    // Allow takedown from behind/flank at any time, or from close range if unalerted
    const toPlayer = player.position.clone().sub(this.position).normalize();
    const forward = this.getForwardVector();
    const dot = forward.dot(toPlayer);
    return dot < 0.35 || this.state !== 'ALERT';
  }

  knockOut(audio) {
    if (this.state === 'KNOCKED_OUT') return;
    this.state = 'KNOCKED_OUT';
    this.suspicion = 0;
    this.visionConeMesh.visible = false;
    this.statusBeacon.visible = false;

    // Lay guard flat on the ground
    this.bodyRoot.rotation.x = -Math.PI / 2;
    this.bodyRoot.position.y = 0.22;
    this.bodyRoot.position.z = 0.6;

    if (audio) audio.playTakedown();
  }

  stunWithEMP(duration = 8.0) {
    if (this.state === 'KNOCKED_OUT') return;
    this.state = 'INVESTIGATE';
    this.investigateTarget = this.position.clone();
    this.investigateTimer = duration;
    this.suspicion = Math.max(this.suspicion, 45);
  }

  onHearSound(soundPos, intensity, isLoudLure = false) {
    if (this.state === 'KNOCKED_OUT' || this.state === 'ALERT') return;

    if (intensity >= 0.22 || isLoudLure) {
      this.state = 'INVESTIGATE';
      this.investigateTarget = soundPos.clone();
      this.investigateTimer = 6.5;
      this.suspicion = Math.min(95, Math.max(this.suspicion, 35 + intensity * 35));
    }
  }

  triggerAlert(targetPos, audio) {
    if (this.state === 'KNOCKED_OUT') return;
    const wasAlert = this.state === 'ALERT';
    this.state = 'ALERT';
    this.suspicion = 100;
    this.investigateTarget = targetPos.clone();
    this.investigateTimer = 10.0;
    if (!wasAlert && audio) {
      audio.playAlertSting('alert');
    }
  }

  update(dt, player, visibility, level, audio, soundSystem, allGuards) {
    this.justFired = false;
    if (this.state === 'KNOCKED_OUT') return;

    this.statusBeacon.rotation.y += dt * 2.5;

    // 1. Visual perception check against Player
    const canSeePlayer = this._checkVision(dt, player, visibility, level.occluderMeshes, audio);

    // 2. State machine behavior
    let moveTarget = null;
    let moveSpeed = 0;

    if (this.state === 'PATROL') {
      this.statusBeacon.material.color.setHex(0x38ff6a);
      this.visionConeMat.color.setHex(0xdcf6ff);

      const wp = this.waypoints[this.currentWaypointIndex];
      const dist = this.position.distanceTo(wp);

      if (dist < 0.45) {
        this.waypointPauseTimer += dt;
        if (this.waypointPauseTimer >= 1.4) {
          this.waypointPauseTimer = 0;
          this.currentWaypointIndex =
            (this.currentWaypointIndex + 1) % this.waypoints.length;
        }
      } else {
        moveTarget = wp;
        moveSpeed = 1.95;
      }
    } else if (this.state === 'INVESTIGATE') {
      this.statusBeacon.material.color.setHex(0xffc83b);
      this.visionConeMat.color.setHex(0xffe082);

      if (this.investigateTarget) {
        const dist = this.position.distanceTo(this.investigateTarget);
        if (dist > 1.1) {
          moveTarget = this.investigateTarget;
          moveSpeed = 2.55;
        } else {
          // Look around at the sound/sight origin
          this.facingYaw += Math.sin(this.investigateTimer * 2.4) * dt * 1.3;
          this.investigateTimer -= dt;
          if (this.investigateTimer <= 0 && this.suspicion < 40) {
            this.state = 'PATROL';
            this.investigateTarget = null;
          }
        }
      } else {
        this.state = 'PATROL';
      }
    } else if (this.state === 'ALERT') {
      this.statusBeacon.material.color.setHex(0xff384c);
      this.visionConeMat.color.setHex(0xff5263);

      if (canSeePlayer) {
        this.investigateTarget = player.position.clone();
        this.investigateTimer = 8.0;

        const toPlayer = player.position.clone().sub(this.position);
        const dist = toPlayer.length();
        this._turnTowards(toPlayer, dt * 10);

        // Maintain tactical firing distance
        if (dist > 6.5) {
          moveTarget = player.position;
          moveSpeed = 3.4;
        }

        // Fire burst at exposed operative
        this.shootCooldown -= dt;
        if (this.shootCooldown <= 0) {
          this.shootCooldown = 0.85;
          this.justFired = true;
          if (audio) audio.playGunshot();
          soundSystem.emitNoise(this.position, 14.0, 0.9, 0xff384c, allGuards);
          player.health = Math.max(0, player.health - 14);
        }
      } else if (this.investigateTarget) {
        const dist = this.position.distanceTo(this.investigateTarget);
        if (dist > 1.2) {
          moveTarget = this.investigateTarget;
          moveSpeed = 3.2;
        } else {
          this.facingYaw += Math.sin(this.investigateTimer * 3.0) * dt * 1.8;
          this.investigateTimer -= dt;
          if (this.investigateTimer <= 0) {
            this.state = 'INVESTIGATE';
            this.suspicion = 55;
            this.investigateTimer = 5.0;
          }
        }
      }
    }

    // 3. Move & animate limbs
    if (moveTarget && moveSpeed > 0) {
      const dir = moveTarget.clone().sub(this.position);
      dir.y = 0;
      if (dir.lengthSq() > 0.001) {
        dir.normalize();
        this._turnTowards(dir, dt * 8);
        this.position.addScaledVector(dir, moveSpeed * dt);
        level.resolveCharacterCollision(this.position, 0.42, false);
      }

      this.walkCycle += dt * (moveSpeed * 3.2);
      const swing = Math.sin(this.walkCycle) * 0.45;
      this.leftLeg.rotation.x = swing;
      this.rightLeg.rotation.x = -swing;
      this.leftArm.rotation.x = -swing * 0.5;
    } else {
      this.leftLeg.rotation.x = THREE.MathUtils.lerp(this.leftLeg.rotation.x, 0, dt * 8);
      this.rightLeg.rotation.x = THREE.MathUtils.lerp(this.rightLeg.rotation.x, 0, dt * 8);
      this.leftArm.rotation.x = THREE.MathUtils.lerp(this.leftArm.rotation.x, 0, dt * 8);
    }

    this.mesh.position.copy(this.position);
    this.mesh.rotation.y = this.facingYaw;
  }

  _turnTowards(dirVector, maxStep) {
    const desiredYaw = Math.atan2(-dirVector.x, -dirVector.z);
    let diff = desiredYaw - this.facingYaw;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    this.facingYaw += diff * Math.min(1, maxStep);
  }

  _checkVision(dt, player, visibility, occluderMeshes, audio) {
    const eyePos = this.getEyePosition();
    const targetPos = new THREE.Vector3(
      player.position.x,
      player.position.y + (player.isCrouching ? 0.65 : 1.15),
      player.position.z
    );

    const toPlayer = targetPos.clone().sub(eyePos);
    const dist = toPlayer.length();

    // Effective vision distance scales strongly with the player's Light-Gem visibility!
    // In deep shadow (visibility < 0.15), guard can only spot player within ~2.3m.
    const effectiveRange = THREE.MathUtils.lerp(2.3, this.viewRange, visibility);

    let spotted = false;
    if (dist <= effectiveRange && dist > 0.05) {
      const dir = toPlayer.clone().divideScalar(dist);
      const forward = this.getForwardVector();
      const cosAngle = dir.dot(forward);

      if (cosAngle >= this.fovCos || dist < 1.35) {
        this.raycaster.set(eyePos, dir);
        this.raycaster.near = 0.2;
        this.raycaster.far = dist - 0.15;
        const hits = this.raycaster.intersectObjects(occluderMeshes, false);
        if (hits.length === 0) {
          spotted = true;
        }
      }
    }

    if (spotted) {
      const proximityBoost = Math.max(0.25, 1 - dist / this.viewRange);
      const rate = (32 + visibility * 95) * proximityBoost;
      const prevSuspicion = this.suspicion;
      this.suspicion = Math.min(100, this.suspicion + rate * dt);

      if (prevSuspicion < 35 && this.suspicion >= 35 && this.state === 'PATROL') {
        this.state = 'INVESTIGATE';
        this.investigateTarget = player.position.clone();
        this.investigateTimer = 6.0;
        if (audio) audio.playAlertSting('suspicious');
      }

      if (this.suspicion >= 100) {
        this.triggerAlert(player.position, audio);
      } else if (this.state === 'INVESTIGATE') {
        this.investigateTarget = player.position.clone();
      }
    } else {
      this.suspicion = Math.max(0, this.suspicion - dt * 16);
    }

    return spotted;
  }

  canBeTakenDown(playerPos) {
    if (this.state === 'KNOCKED_OUT' || this.state === 'ALERT') return false;
    const dist = this.position.distanceTo(playerPos);
    if (dist > 2.2) return false;

    const toPlayer = new THREE.Vector3()
      .subVectors(playerPos, this.position)
      .setY(0)
      .normalize();
    const forward = this.getForwardVector();
    // Must be behind or to the blind side (or guard is EMP stunned)
    return this.empStunTimer > 0 || forward.dot(toPlayer) < 0.25;
  }

  performTakedown(audio) {
    this.knockOut(audio);
  }
}
