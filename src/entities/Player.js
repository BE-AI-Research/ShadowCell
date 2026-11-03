// src/entities/Player.js
// Third Echelon Operative (Sam Fisher inspired): articulated 3D mesh, iconic trifocal green goggles,
// crouch/walk/sprint stealth locomotion, whistle distraction, and SC-20K OCP EMP pistol.

import * as THREE from '../../vendor/three.module.js';

export class Player {
  constructor(scene, startPos = new THREE.Vector3(0, 0, 23.5)) {
    this.scene = scene;
    this.position = startPos.clone();
    this.velocity = new THREE.Vector3();
    this.facingYaw = 0;

    this.health = 100;
    this.maxHealth = 100;
    this.empEnergy = 100;
    this.maxEmpEnergy = 100;

    this.isCrouching = false;
    this.currentSpeed = 0;
    this.walkCycle = 0;
    this.footstepTimer = 0;

    this.mesh = new THREE.Group();
    this.mesh.position.copy(this.position);
    this._buildOperativeModel();
    this.scene.add(this.mesh);

    // Temporary EMP tracer beams
    this.activeBeams = [];
  }

  _buildOperativeModel() {
    const suitMat = new THREE.MeshStandardMaterial({
      color: 0x13191b,
      roughness: 0.72,
      metalness: 0.28,
    });
    const harnessMat = new THREE.MeshStandardMaterial({
      color: 0x222d2a,
      roughness: 0.55,
      metalness: 0.45,
    });
    const skinMat = new THREE.MeshStandardMaterial({
      color: 0x24282a,
      roughness: 0.65,
    });
    const goggleGlowMat = new THREE.MeshBasicMaterial({
      color: 0x38ff6a,
    });
    this.goggleGlowMat = goggleGlowMat;

    // Subtle green point light emitted by the trifocal goggles
    this.goggleLight = new THREE.PointLight(0x38ff6a, 0.35, 1.8);
    this.goggleLight.position.set(0, 0.03, -0.22);

    this.bodyRoot = new THREE.Group();
    this.mesh.add(this.bodyRoot);

    // Torso + tacticalops vest
    this.torso = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.58, 0.26), suitMat);
    this.torso.position.y = 1.15;
    this.bodyRoot.add(this.torso);

    const vest = new THREE.Mesh(new THREE.BoxGeometry(0.49, 0.42, 0.29), harnessMat);
    vest.position.y = 0.03;
    this.torso.add(vest);

    // Spine Light-Gem indicator on the operative's back (classic Splinter Cell detail)
    this.backGemMesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.09, 0.14, 0.04),
      new THREE.MeshBasicMaterial({ color: 0x38ff6a })
    );
    this.backGemMesh.position.set(0, 0.08, 0.155);
    this.torso.add(this.backGemMesh);

    // Head + Balaclava + Iconic 3-dot Trifocal Goggles
    this.headGroup = new THREE.Group();
    this.headGroup.position.set(0, 1.59, 0);
    this.bodyRoot.add(this.headGroup);

    const headMesh = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.28, 0.27), skinMat);
    this.headGroup.add(headMesh);

    // Goggle strap & visor housing
    const visorBand = new THREE.Mesh(
      new THREE.BoxGeometry(0.28, 0.09, 0.29),
      harnessMat
    );
    visorBand.position.set(0, 0.02, -0.01);
    this.headGroup.add(visorBand);

    // Trifocal 3 green lenses (Left, Right, Top-Center triangle)
    const lensGeo = new THREE.CylinderGeometry(0.032, 0.032, 0.05, 10);
    lensGeo.rotateX(Math.PI / 2);

    const leftLens = new THREE.Mesh(lensGeo, goggleGlowMat);
    leftLens.position.set(-0.062, 0.0, -0.155);
    this.headGroup.add(leftLens);

    const rightLens = new THREE.Mesh(lensGeo, goggleGlowMat);
    rightLens.position.set(0.062, 0.0, -0.155);
    this.headGroup.add(rightLens);

    const topLens = new THREE.Mesh(lensGeo, goggleGlowMat);
    topLens.position.set(0.0, 0.065, -0.155);
    this.headGroup.add(topLens);
    this.headGroup.add(this.goggleLight);

    // Limbs (pivoted at shoulders/hips for smooth procedural stealth animation)
    const armGeo = new THREE.BoxGeometry(0.14, 0.52, 0.14);
    armGeo.translate(0, -0.22, 0);

    this.leftArm = new THREE.Mesh(armGeo, suitMat);
    this.leftArm.position.set(-0.31, 1.38, 0);
    this.bodyRoot.add(this.leftArm);

    this.rightArm = new THREE.Mesh(armGeo, suitMat);
    this.rightArm.position.set(0.31, 1.38, 0);
    this.bodyRoot.add(this.rightArm);

    // Suppressed SC-20K / Five-seveN OCP Pistol in right hand
    const gunGroup = new THREE.Group();
    gunGroup.position.set(0, -0.44, -0.12);
    const gunBody = new THREE.Mesh(
      new THREE.BoxGeometry(0.06, 0.1, 0.28),
      harnessMat
    );
    const suppressor = new THREE.Mesh(
      new THREE.CylinderGeometry(0.022, 0.022, 0.18, 8),
      suitMat
    );
    suppressor.rotateX(Math.PI / 2);
    suppressor.position.set(0, 0.02, -0.2);
    gunGroup.add(gunBody, suppressor);
    this.rightArm.add(gunGroup);
    this.muzzleNode = suppressor;

    const legGeo = new THREE.BoxGeometry(0.17, 0.62, 0.18);
    legGeo.translate(0, -0.3, 0);

    this.leftLeg = new THREE.Mesh(legGeo, suitMat);
    this.leftLeg.position.set(-0.13, 0.84, 0);
    this.bodyRoot.add(this.leftLeg);

    this.rightLeg = new THREE.Mesh(legGeo, suitMat);
    this.rightLeg.position.set(0.13, 0.84, 0);
    this.bodyRoot.add(this.rightLeg);
  }

  update(dt, input, cameraRig, level, soundSystem, audio, guards, visibility) {
    // Toggle crouch with C or CtrlLeft
    if (input.consumePressed('KeyC') || input.consumePressed('ControlLeft')) {
      this.isCrouching = !this.isCrouching;
    }

    // Regenerate OCP EMP capacitor energy
    this.empEnergy = Math.min(this.maxEmpEnergy, this.empEnergy + dt * 11.5);

    // Update spine Light-Gem color based on shadow visibility
    if (visibility < 0.32) {
      this.backGemMesh.material.color.setHex(0x38ff6a); // Hidden green
    } else if (visibility < 0.65) {
      this.backGemMesh.material.color.setHex(0xffc83b); // Cautious amber
    } else {
      this.backGemMesh.material.color.setHex(0xff384c); // Exposed crimson
    }

    // Compute movement vector on XZ plane relative to camera yaw
    const forward = cameraRig.getFlatForward();
    const right = cameraRig.getFlatRight();
    const moveDir = new THREE.Vector3();

    if (input.isDown('KeyW') || input.isDown('ArrowUp')) moveDir.add(forward);
    if (input.isDown('KeyS') || input.isDown('ArrowDown')) moveDir.sub(forward);
    if (input.isDown('KeyD') || input.isDown('ArrowRight')) moveDir.add(right);
    if (input.isDown('KeyA') || input.isDown('ArrowLeft')) moveDir.sub(right);

    const isMoving = moveDir.lengthSq() > 0.001;
    const isSprinting =
      isMoving && (input.isDown('ShiftLeft') || input.isDown('ShiftRight')) && !input.isAiming();

    if (isSprinting && this.isCrouching) {
      this.isCrouching = false; // Sprinting brings operative out of crouch
    }

    let targetSpeed = 0;
    if (isMoving) {
      moveDir.normalize();
      if (this.isCrouching) {
        targetSpeed = 2.25; // Silent crouch prowl
      } else if (isSprinting) {
        targetSpeed = 5.45; // Fast tactical sprint (loud)
      } else {
        targetSpeed = 3.55; // Standard stealth walk
      }
    }

    this.currentSpeed = THREE.MathUtils.lerp(
      this.currentSpeed,
      targetSpeed,
      Math.min(1, dt * 14)
    );

    if (isMoving) {
      this.position.addScaledVector(moveDir, this.currentSpeed * dt);
      level.resolveCharacterCollision(this.position, 0.42, this.isCrouching);
    }

    // Orient character model: when aiming, lock to camera yaw; otherwise face movement direction
    if (input.isAiming()) {
      this.facingYaw = cameraRig.yaw;
    } else if (isMoving) {
      const desiredYaw = Math.atan2(-moveDir.x, -moveDir.z);
      let diff = desiredYaw - this.facingYaw;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      this.facingYaw += diff * Math.min(1, dt * 12);
    }

    this.mesh.position.copy(this.position);
    this.mesh.rotation.y = this.facingYaw;

    // Procedural crouch & limb animation
    const targetCrouchOffset = this.isCrouching ? -0.34 : 0.0;
    this.bodyRoot.position.y = THREE.MathUtils.lerp(
      this.bodyRoot.position.y,
      targetCrouchOffset,
      Math.min(1, dt * 12)
    );
    this.torso.rotation.x = THREE.MathUtils.lerp(
      this.torso.rotation.x,
      this.isCrouching ? 0.28 : 0.05,
      Math.min(1, dt * 12)
    );

    if (isMoving) {
      const cycleRate = this.isCrouching ? 6.5 : isSprinting ? 13.0 : 9.0;
      this.walkCycle += dt * cycleRate;
      const swing = Math.sin(this.walkCycle) * (this.isCrouching ? 0.35 : 0.55);

      this.leftLeg.rotation.x = swing;
      this.rightLeg.rotation.x = -swing;
      this.leftArm.rotation.x = -swing * 0.65;
      this.rightArm.rotation.x = input.isAiming() ? 1.35 - cameraRig.pitch : swing * 0.65;

      // Footstep acoustic emission
      const stepInterval = this.isCrouching ? 0.52 : isSprinting ? 0.28 : 0.4;
      this.footstepTimer += dt;
      if (this.footstepTimer >= stepInterval) {
        this.footstepTimer = 0;
        if (this.isCrouching) {
          // Near-silent footsteps
          audio.playFootstep(0.1);
          soundSystem.emitNoise(this.position, 1.3, 0.08, 0x38ff6a, []);
        } else if (isSprinting) {
          audio.playFootstep(0.85);
          soundSystem.emitNoise(this.position, 9.5, 0.82, 0xffc83b, guards);
        } else {
          audio.playFootstep(0.35);
          soundSystem.emitNoise(this.position, 4.2, 0.34, 0x38ff6a, guards);
        }
      }
    } else {
      this.leftLeg.rotation.x = THREE.MathUtils.lerp(this.leftLeg.rotation.x, 0, dt * 10);
      this.rightLeg.rotation.x = THREE.MathUtils.lerp(this.rightLeg.rotation.x, 0, dt * 10);
      this.leftArm.rotation.x = THREE.MathUtils.lerp(this.leftArm.rotation.x, 0, dt * 10);
      const aimArmAngle = input.isAiming() ? 1.42 - cameraRig.pitch : 0.15;
      this.rightArm.rotation.x = THREE.MathUtils.lerp(this.rightArm.rotation.x, aimArmAngle, dt * 12);
    }

    // Update active OCP tracer beams
    for (let i = this.activeBeams.length - 1; i >= 0; i--) {
      const b = this.activeBeams[i];
      b.life -= dt;
      if (b.life <= 0) {
        this.scene.remove(b.line);
        b.line.geometry.dispose();
        b.line.material.dispose();
        this.activeBeams.splice(i, 1);
      } else {
        b.line.material.opacity = b.life / b.maxLife;
      }
    }
  }

  spawnEMPBeam(endPoint) {
    const startPoint = new THREE.Vector3();
    this.muzzleNode.getWorldPosition(startPoint);

    const points = [startPoint, endPoint.clone()];
    const geo = new THREE.BufferGeometry().setFromPoints(points);
    const mat = new THREE.LineBasicMaterial({
      color: 0x38e8ff,
      transparent: true,
      opacity: 0.9,
    });
    const line = new THREE.Line(geo, mat);
    this.scene.add(line);

    this.activeBeams.push({
      line,
      life: 0.18,
      maxLife: 0.18,
    });
  }

  setGoggleColor(hexColor) {
    if (this.goggleGlowMat) {
      this.goggleGlowMat.color.setHex(hexColor);
    }
    if (this.goggleLight) {
      this.goggleLight.color.setHex(hexColor);
    }
  }
}
