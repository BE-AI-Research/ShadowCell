// src/core/CameraRig.js
// Splinter Cell 3rd-person over-the-shoulder camera with wall-collision spring arm & aim zoom

import * as THREE from '../../vendor/three.module.js';

export class CameraRig {
  constructor(camera) {
    this.camera = camera;
    this.yaw = 0; // Facing North (-Z) initially
    this.pitch = 0.22;
    this.minPitch = -0.75;
    this.maxPitch = 1.05;

    this.shoulderSide = 1; // 1 = right shoulder, -1 = left shoulder
    this.currentSide = 1;

    // Spring-arm parameters
    this.normalDistance = 3.55;
    this.crouchDistance = 3.1;
    this.aimDistance = 1.55;
    this.currentDistance = 3.55;

    this.normalFov = 60;
    this.aimFov = 42;

    this.pivotPos = new THREE.Vector3();
    this.desiredCamPos = new THREE.Vector3();
    this.lookTarget = new THREE.Vector3();
    this.raycaster = new THREE.Raycaster();
    this.trauma = 0;
    this.shakeTime = 0;
  }

  addTrauma(amount = 0.25) {
    this.trauma = Math.min(1.0, this.trauma + amount);
  }

  swapShoulder() {
    this.shoulderSide *= -1;
  }

  update(dt, playerOrInput, inputOrTargetPos, occluderOrAiming, crouchArg, wallCollidersArg) {
    // Support both (dt, player, input, occluderMeshes) and (dt, input, targetPos, isAiming, isCrouching, wallColliders)
    let input;
    let targetPos;
    let isAiming;
    let isCrouching;
    let occluderMeshes;

    if (playerOrInput && typeof playerOrInput.consumeMouseDelta === 'function') {
      input = playerOrInput;
      targetPos = inputOrTargetPos;
      isAiming = Boolean(occluderOrAiming);
      isCrouching = Boolean(crouchArg);
      occluderMeshes = wallCollidersArg;
    } else {
      const player = playerOrInput;
      input = inputOrTargetPos;
      targetPos = player.position;
      isAiming = input.isAiming();
      isCrouching = Boolean(player.isCrouching);
      occluderMeshes = occluderOrAiming;
    }

    const { x: dx, y: dy } = input.consumeMouseDelta();
    const sensitivity = isAiming ? 0.0017 : 0.0025;

    this.yaw -= dx * sensitivity;
    this.pitch = THREE.MathUtils.clamp(
      this.pitch + dy * sensitivity,
      this.minPitch,
      this.maxPitch
    );

    // Smooth shoulder swap
    this.currentSide = THREE.MathUtils.lerp(
      this.currentSide,
      this.shoulderSide,
      Math.min(1, dt * 10)
    );

    const targetDist = isAiming
      ? this.aimDistance
      : isCrouching
      ? this.crouchDistance
      : this.normalDistance;

    // Anchor point near operative's upper back / head
    const targetHeight = isCrouching ? 1.18 : 1.62;
    const desiredPivot = new THREE.Vector3(
      targetPos.x,
      targetPos.y + targetHeight,
      targetPos.z
    );

    if (this.pivotPos.lengthSq() === 0) {
      this.pivotPos.copy(desiredPivot);
    } else {
      this.pivotPos.lerp(desiredPivot, Math.min(1, dt * 16));
    }

    // Compute camera forward & right vectors from yaw/pitch
    const forward = new THREE.Vector3(
      -Math.sin(this.yaw) * Math.cos(this.pitch),
      -Math.sin(this.pitch),
      -Math.cos(this.yaw) * Math.cos(this.pitch)
    ).normalize();

    const right = new THREE.Vector3(
      Math.cos(this.yaw),
      0,
      -Math.sin(this.yaw)
    ).normalize();

    const shoulderOffset = isAiming ? 0.52 : 0.42;
    const shoulderOrigin = this.pivotPos
      .clone()
      .addScaledVector(right, shoulderOffset * this.currentSide);

    // Ideal camera location behind the shoulder
    this.desiredCamPos
      .copy(shoulderOrigin)
      .addScaledVector(forward, -targetDist);

    // Prevent camera from clipping through walls or floor
    let safeDistance = targetDist;
    if (occluderMeshes && occluderMeshes.length > 0) {
      const rayDir = this.desiredCamPos.clone().sub(shoulderOrigin);
      const rayLen = rayDir.length();
      if (rayLen > 0.001) {
        rayDir.divideScalar(rayLen);
        this.raycaster.set(shoulderOrigin, rayDir);
        this.raycaster.near = 0.05;
        this.raycaster.far = rayLen;
        const hits = this.raycaster.intersectObjects(occluderMeshes, false);
        if (hits.length > 0) {
          safeDistance = Math.max(0.45, hits[0].distance - 0.22);
        }
      }
    }

    this.currentDistance = THREE.MathUtils.lerp(
      this.currentDistance,
      safeDistance,
      Math.min(1, dt * 18)
    );

    const finalCamPos = shoulderOrigin
      .clone()
      .addScaledVector(forward, -this.currentDistance);
    finalCamPos.y = Math.max(0.35, finalCamPos.y);

    // Apply trauma shake decay
    if (this.trauma > 0.001) {
      this.shakeTime += dt * 36;
      const shake = this.trauma * this.trauma;
      finalCamPos.x += Math.sin(this.shakeTime * 1.7) * 0.14 * shake;
      finalCamPos.y += Math.cos(this.shakeTime * 2.3) * 0.12 * shake;
      this.trauma = Math.max(0, this.trauma - dt * 1.8);
    } else {
      this.trauma = 0;
    }

    this.camera.position.copy(finalCamPos);

    // Look down the sight line ahead of shoulderOrigin
    this.lookTarget.copy(shoulderOrigin).addScaledVector(forward, 25);
    this.camera.lookAt(this.lookTarget);

    // Smooth FOV zoom when aiming
    const targetFov = isAiming ? this.aimFov : this.normalFov;
    if (Math.abs(this.camera.fov - targetFov) > 0.05) {
      this.camera.fov = THREE.MathUtils.lerp(
        this.camera.fov,
        targetFov,
        Math.min(1, dt * 12)
      );
      this.camera.updateProjectionMatrix();
    }
  }

  getAimRay() {
    const dir = new THREE.Vector3();
    this.camera.getWorldDirection(dir);
    return {
      origin: this.camera.position.clone(),
      direction: dir.normalize(),
    };
  }

  getFlatForward() {
    return new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw)).normalize();
  }

  getFlatRight() {
    return new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw)).normalize();
  }
}
