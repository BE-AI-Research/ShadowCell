// src/world/FacilityLevel.js
// Builds the 4-zone Georgian Ministry Data Vault level, wall/cover colliders, vents, and tactical lighting

import * as THREE from '../../vendor/three.module.js';

export class FacilityLevel {
  constructor(scene, lightSystem) {
    this.scene = scene;
    this.lightSystem = lightSystem;

    this.colliders = []; // { box: THREE.Box3, crouchBypass: boolean, mesh: THREE.Mesh }
    this.occluderMeshes = []; // Meshes that block light & line-of-sight
    this.lightSwitchPanels = []; // Interactive wall switches

    this._createMaterials();
    this._buildGeometry();
    this._populateLights();
  }

  _createMaterials() {
    // Procedural canvas grid texture for tactical floor
    const floorCanvas = document.createElement('canvas');
    floorCanvas.width = 256;
    floorCanvas.height = 256;
    const fctx = floorCanvas.getContext('2d');
    fctx.fillStyle = '#0f1614';
    fctx.fillRect(0, 0, 256, 256);
    fctx.strokeStyle = '#1b2824';
    fctx.lineWidth = 3;
    fctx.strokeRect(0, 0, 256, 256);
    fctx.strokeStyle = '#141e1b';
    fctx.lineWidth = 1;
    fctx.beginPath();
    fctx.moveTo(128, 0);
    fctx.lineTo(128, 256);
    fctx.moveTo(0, 128);
    fctx.lineTo(256, 128);
    fctx.stroke();

    const floorTex = new THREE.CanvasTexture(floorCanvas);
    floorTex.wrapS = THREE.RepeatWrapping;
    floorTex.wrapT = THREE.RepeatWrapping;
    floorTex.repeat.set(22, 34);

    this.floorMat = new THREE.MeshStandardMaterial({
      map: floorTex,
      roughness: 0.82,
      metalness: 0.18,
    });

    this.wallMat = new THREE.MeshStandardMaterial({
      color: 0x1a2421,
      roughness: 0.78,
      metalness: 0.22,
    });

    this.pillarMat = new THREE.MeshStandardMaterial({
      color: 0x222f2b,
      roughness: 0.65,
      metalness: 0.35,
    });

    this.crateMat = new THREE.MeshStandardMaterial({
      color: 0x2a362a,
      roughness: 0.7,
      metalness: 0.28,
    });

    this.serverMat = new THREE.MeshStandardMaterial({
      color: 0x111920,
      roughness: 0.45,
      metalness: 0.65,
    });

    this.ventMat = new THREE.MeshStandardMaterial({
      color: 0x293836,
      roughness: 0.5,
      metalness: 0.6,
    });
  }

  _addBox(x, y, z, w, h, d, material, { collides = true, occludes = true, crouchBypass = false } = {}) {
    const geo = new THREE.BoxGeometry(w, h, d);
    const mesh = new THREE.Mesh(geo, material);
    mesh.position.set(x, y, z);
    mesh.receiveShadow = true;
    this.scene.add(mesh);

    if (occludes) {
      this.occluderMeshes.push(mesh);
    }

    if (collides) {
      const box = new THREE.Box3().setFromCenterAndSize(
        new THREE.Vector3(x, y, z),
        new THREE.Vector3(w, h, d)
      );
      this.colliders.push({ box, crouchBypass, mesh });
    }

    return mesh;
  }

  _buildGeometry() {
    // Main facility floor (X: -20..20, Z: -38..28)
    const floorGeo = new THREE.PlaneGeometry(44, 70);
    floorGeo.rotateX(-Math.PI / 2);
    const floor = new THREE.Mesh(floorGeo, this.floorMat);
    floor.position.set(0, 0, -5);
    this.scene.add(floor);
    this.occluderMeshes.push(floor);

    // Ceiling rafters / industrial beams for atmosphere
    for (let z = 24; z >= -34; z -= 8) {
      this._addBox(0, 5.15, z, 36, 0.3, 0.45, this.pillarMat, {
        collides: false,
        occludes: false,
      });
    }

    const wallH = 5.0;
    const halfH = wallH / 2;

    // Outer perimeter walls
    this._addBox(0, halfH, 27, 36, wallH, 1.0, this.wallMat); // South wall
    this._addBox(0, halfH, -37, 36, wallH, 1.0, this.wallMat); // North wall
    this._addBox(-18, halfH, -5, 1.0, wallH, 65, this.wallMat); // West outer wall
    this._addBox(18, halfH, -5, 1.0, wallH, 65, this.wallMat); // East outer wall

    // =========================================================================
    // ZONE 1 -> ZONE 2 Divider Wall at Z = 14
    // Main doorway at X: -2.5..2.5; West crouch vent tunnel at X: -13.5
    // =========================================================================
    this._addBox(-16.25, halfH, 14, 3.5, wallH, 0.9, this.wallMat); // X: -18..-14.5
    // Vent header above crouch opening at X = -13.5 (so player must crouch under it!)
    this._addBox(-13.5, 3.15, 14, 2.0, 3.7, 0.9, this.ventMat, {
      collides: true,
      occludes: true,
      crouchBypass: true,
    });
    this._addBox(-7.5, halfH, 14, 10.0, wallH, 0.9, this.wallMat); // X: -12.5..-2.5
    this._addBox(10.25, halfH, 14, 15.5, wallH, 0.9, this.wallMat); // X: 2.5..18

    // Zone 1 Courtyard tactical crates & shadow cover
    this._addBox(-5.2, 0.65, 20.5, 2.4, 1.3, 1.4, this.crateMat);
    this._addBox(5.4, 0.65, 19.2, 2.6, 1.3, 1.6, this.crateMat);
    this._addBox(0.0, 0.6, 17.2, 2.0, 1.2, 1.2, this.crateMat);

    // West maintenance vent tunnel walls (X: -14.8 to -12.2, Z: 14 to 2)
    this._addBox(-12.1, halfH, 8.0, 0.6, wallH, 12.0, this.ventMat);
    // Vent exit header at Z = 2.0, X = -13.5
    this._addBox(-13.5, 3.15, 2.0, 2.2, 3.7, 0.8, this.ventMat, {
      collides: true,
      occludes: true,
      crouchBypass: true,
    });

    // =========================================================================
    // ZONE 2: Security Corridor & Guard Post (Z: 14 to -4)
    // =========================================================================
    // Central pillars and low cover barriers
    this._addBox(-4.5, halfH, 8.5, 1.4, wallH, 1.4, this.pillarMat);
    this._addBox(4.5, halfH, 8.5, 1.4, wallH, 1.4, this.pillarMat);
    this._addBox(-4.5, halfH, 1.5, 1.4, wallH, 1.4, this.pillarMat);
    this._addBox(4.5, halfH, 1.5, 1.4, wallH, 1.4, this.pillarMat);

    // Waist-high cover walls in Security Hallway
    this._addBox(0.0, 0.65, 5.2, 3.6, 1.3, 0.8, this.crateMat);
    this._addBox(9.5, 0.65, 6.5, 2.8, 1.3, 1.8, this.crateMat);
    this._addBox(11.0, 0.65, -0.5, 2.5, 1.3, 2.2, this.crateMat);

    // =========================================================================
    // ZONE 2 -> ZONE 3 Divider Wall at Z = -4.5
    // Center security gate (X: -3..3) + East flank doorway (X: 11..14)
    // =========================================================================
    this._addBox(-10.5, halfH, -4.5, 15.0, wallH, 0.9, this.wallMat); // X: -18..-3
    this._addBox(7.0, halfH, -4.5, 8.0, wallH, 0.9, this.wallMat); // X: 3..11
    this._addBox(16.0, halfH, -4.5, 4.0, wallH, 0.9, this.wallMat); // X: 14..18

    // =========================================================================
    // ZONE 3: Central Server Vault (Z: -4.5 to -24)
    // =========================================================================
    // Server racks providing rich stealth lanes & sightline breaks
    for (const zPos of [-9.5, -14.5, -19.5]) {
      this._addBox(-7.5, 1.4, zPos, 4.2, 2.8, 1.3, this.serverMat);
      this._addBox(7.5, 1.4, zPos, 4.2, 2.8, 1.3, this.serverMat);
      this._addServerLEDStrip(-7.5, 2.1, zPos + 0.67);
      this._addServerLEDStrip(7.5, 2.1, zPos + 0.67);
    }

    // Inner glass/metal vault booth shielding the Primary Server Terminal at (0, 0, -16)
    this._addBox(-3.2, 1.3, -14.5, 0.5, 2.6, 5.2, this.serverMat);
    this._addBox(3.2, 1.3, -14.5, 0.5, 2.6, 5.2, this.serverMat);
    this._addBox(0.0, 0.65, -11.2, 2.8, 1.3, 0.7, this.crateMat);

    // =========================================================================
    // ZONE 3 -> ZONE 4 Divider Wall at Z = -24.5 (Extraction Helipad Access)
    // =========================================================================
    this._addBox(-10.5, halfH, -24.5, 15.0, wallH, 0.9, this.wallMat);
    this._addBox(10.5, halfH, -24.5, 15.0, wallH, 0.9, this.wallMat);

    // Zone 4 Cover & Helipad markings at (0, 0, -31.5)
    this._addBox(-6.5, 0.65, -29.0, 2.6, 1.3, 1.4, this.crateMat);
    this._addBox(6.5, 0.65, -29.0, 2.6, 1.3, 1.4, this.crateMat);

    // Glowing Vent Frame Indicators so player easily spots crouch vents
    this._addVentFrameIndicator(-13.5, 14.0);
    this._addVentFrameIndicator(-13.5, 2.0);

    // Interactive Wall Light Switch Panels
    this._addLightSwitchPanel(new THREE.Vector3(-2.1, 1.35, 13.45), [
      'z2_hall_1',
      'z2_hall_2',
    ]);
    this._addLightSwitchPanel(new THREE.Vector3(3.4, 1.35, -5.05), [
      'z3_vault_center',
      'z3_vault_west',
      'z3_vault_east',
    ]);
  }

  _addServerLEDStrip(x, y, z) {
    const geo = new THREE.BoxGeometry(3.6, 0.08, 0.04);
    const mat = new THREE.MeshBasicMaterial({ color: 0x22d8ff });
    const strip = new THREE.Mesh(geo, mat);
    strip.position.set(x, y, z);
    this.scene.add(strip);
  }

  _addVentFrameIndicator(x, z) {
    const frameGeo = new THREE.BoxGeometry(2.1, 0.08, 0.95);
    const frameMat = new THREE.MeshBasicMaterial({ color: 0x38ff6a });
    const bar = new THREE.Mesh(frameGeo, frameMat);
    bar.position.set(x, 1.28, z);
    this.scene.add(bar);
  }

  _addLightSwitchPanel(position, lightIds) {
    const group = new THREE.Group();
    group.position.copy(position);

    const box = new THREE.Mesh(
      new THREE.BoxGeometry(0.32, 0.44, 0.12),
      new THREE.MeshStandardMaterial({ color: 0x22302c, metalness: 0.6, roughness: 0.4 })
    );
    group.add(box);

    const led = new THREE.Mesh(
      new THREE.SphereGeometry(0.06, 8, 8),
      new THREE.MeshBasicMaterial({ color: 0x38ff6a })
    );
    led.position.set(0, 0.08, 0.07);
    group.add(led);

    this.scene.add(group);
    this.lightSwitchPanels.push({
      position,
      lightIds,
      ledMesh: led,
    });
  }

  _populateLights() {
    // Zone 1: Insertion Courtyard (Shootable spotlight over the main gate)
    this.lightSystem.addTacticalSpotLight({
      id: 'z1_entry_light',
      position: new THREE.Vector3(0, 4.75, 22.0),
      color: 0xdff6ff,
      intensity: 1.35,
      range: 12.5,
    });

    this.lightSystem.addTacticalSpotLight({
      id: 'z1_gate_light',
      position: new THREE.Vector3(0, 4.75, 15.2),
      color: 0xffe9c8,
      intensity: 1.5,
      range: 12.5,
    });

    // Zone 2: Security Corridor
    this.lightSystem.addTacticalSpotLight({
      id: 'z2_hall_1',
      position: new THREE.Vector3(0, 4.75, 9.2),
      color: 0xd8f4ff,
      intensity: 1.5,
      range: 13.0,
    });

    this.lightSystem.addTacticalSpotLight({
      id: 'z2_hall_2',
      position: new THREE.Vector3(0, 4.75, 1.0),
      color: 0xd8f4ff,
      intensity: 1.5,
      range: 13.0,
    });

    this.lightSystem.addTacticalSpotLight({
      id: 'z2_east_bay',
      position: new THREE.Vector3(11.5, 4.75, 4.0),
      color: 0xffe4b5,
      intensity: 1.35,
      range: 12.0,
    });

    // Zone 3: Server Vault
    this.lightSystem.addTacticalSpotLight({
      id: 'z3_vault_center',
      position: new THREE.Vector3(0, 4.75, -13.5),
      color: 0xc8f0ff,
      intensity: 1.55,
      range: 13.5,
    });

    this.lightSystem.addTacticalSpotLight({
      id: 'z3_vault_west',
      position: new THREE.Vector3(-12.0, 4.75, -14.5),
      color: 0xc8f0ff,
      intensity: 1.3,
      range: 12.0,
    });

    this.lightSystem.addTacticalSpotLight({
      id: 'z3_vault_east',
      position: new THREE.Vector3(12.5, 4.75, -14.5),
      color: 0xc8f0ff,
      intensity: 1.3,
      range: 12.0,
    });

    // Zone 4: Extraction Helipad Beacon Light
    this.lightSystem.addTacticalSpotLight({
      id: 'z4_extract_light',
      position: new THREE.Vector3(0, 4.75, -31.5),
      color: 0x62ff95,
      intensity: 1.4,
      range: 13.0,
      shootable: false,
    });
  }

  get wallColliders() {
    return this.colliders.map((c) => c.box);
  }

  // Resolves sphere-vs-AABB character movement collision on the XZ plane
  resolveCharacterCollision(position, radius = 0.42, isCrouching = false) {
    const charMinY = position.y + 0.05;
    const charMaxY = position.y + (isCrouching ? 1.05 : 1.75);

    for (const col of this.colliders) {
      if (col.crouchBypass && isCrouching) continue;

      const box = col.box;
      if (charMaxY < box.min.y || charMinY > box.max.y) continue;

      // Closest point on AABB in XZ
      const closestX = THREE.MathUtils.clamp(position.x, box.min.x, box.max.x);
      const closestZ = THREE.MathUtils.clamp(position.z, box.min.z, box.max.z);

      const dx = position.x - closestX;
      const dz = position.z - closestZ;
      const distSq = dx * dx + dz * dz;

      if (distSq < radius * radius) {
        const dist = Math.sqrt(distSq);
        if (dist > 0.0001) {
          const overlap = radius - dist;
          position.x += (dx / dist) * overlap;
          position.z += (dz / dist) * overlap;
        } else {
          // Inside box center fallback
          position.z += radius;
        }
      }
    }
  }
}
