import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { mulberry32, fbm2, smoothstep } from './noise.js';

// Floresta procedural (low poly) feita com InstancedMesh divididos em blocos
// ("chunks") para que a câmera descarte o que está fora da tela.
// Também mantém uma grade espacial de colisores (árvores e pedras grandes).
export class Forest {
  constructor({ terrain, worldCfg, forestCfg, density = 1, seed = 1 }) {
    this.terrain = terrain;
    this.world = worldCfg;
    this.cfg = forestCfg;
    this.density = density;
    this.seed = seed;
    this.half = worldCfg.size / 2;
    this.rng = mulberry32(seed);
    this.group = new THREE.Group();
    this.group.name = 'Forest';

    this.colliders = [];
    this.grid = new Map();
    this.cellSize = 8;
    this._dummy = new THREE.Object3D();

    this._buildTrees();
    this._buildRocks();
    this._buildLogs();
    this._buildGrass();
    this._buildFlowers();
  }

  // ---------------------------------------------------------------- colisão
  _addCollider(x, z, r) {
    const c = { x, z, r };
    this.colliders.push(c);
    const key = Math.floor(x / this.cellSize) + ',' + Math.floor(z / this.cellSize);
    let cell = this.grid.get(key);
    if (!cell) { cell = []; this.grid.set(key, cell); }
    cell.push(c);
  }

  // Empurra a posição (objeto com x/z) para fora dos colisores próximos.
  resolveCollisions(pos, radius) {
    for (let iter = 0; iter < 2; iter++) {
      const cx = Math.floor(pos.x / this.cellSize), cz = Math.floor(pos.z / this.cellSize);
      for (let ix = cx - 1; ix <= cx + 1; ix++) {
        for (let iz = cz - 1; iz <= cz + 1; iz++) {
          const cell = this.grid.get(ix + ',' + iz);
          if (!cell) continue;
          for (const c of cell) {
            const dx = pos.x - c.x, dz = pos.z - c.z;
            const min = c.r + radius;
            const d2 = dx * dx + dz * dz;
            if (d2 < min * min) {
              const d = Math.sqrt(d2) || 0.0001;
              const push = (min - d) / d;
              pos.x += dx * push; pos.z += dz * push;
            }
          }
        }
      }
    }
  }

  // --------------------------------------------------------------- utilidades
  _chunkKey(x, z) {
    const s = this.cfg.chunkSize;
    return Math.floor((x + this.half) / s) + ',' + Math.floor((z + this.half) / s);
  }

  // items: [{x, z, matrix, color?}] -> um InstancedMesh por chunk
  _addInstanced(geometry, material, items, { cast = false, receive = false, name = '' } = {}) {
    const chunks = new Map();
    for (const it of items) {
      const k = this._chunkKey(it.x, it.z);
      let arr = chunks.get(k);
      if (!arr) { arr = []; chunks.set(k, arr); }
      arr.push(it);
    }
    for (const [key, arr] of chunks) {
      const mesh = new THREE.InstancedMesh(geometry, material, arr.length);
      mesh.name = name + ':' + key;
      for (let i = 0; i < arr.length; i++) {
        mesh.setMatrixAt(i, arr[i].matrix);
        if (arr[i].color) mesh.setColorAt(i, arr[i].color);
      }
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.castShadow = cast;
      mesh.receiveShadow = receive;
      if (typeof mesh.computeBoundingSphere === 'function') mesh.computeBoundingSphere();
      else mesh.frustumCulled = false;
      this.group.add(mesh);
    }
  }

  _matrix(x, y, z, yaw, sx, sy, sz, tiltX = 0, tiltZ = 0) {
    const d = this._dummy;
    d.position.set(x, y, z);
    d.rotation.set(tiltX, yaw, tiltZ, 'YXZ');
    d.scale.set(sx, sy, sz);
    d.updateMatrix();
    return d.matrix.clone();
  }

  _pick(rng, hexes) { return hexes[Math.floor(rng() * hexes.length)]; }

  _isImportedForest(x, z) {
    const zone = this.world.importedForest;
    return !!zone && Math.hypot(x - zone.x, z - zone.z) < zone.clearRadius;
  }

  // ------------------------------------------------------------------ árvores
  _buildTrees() {
    const rng = this.rng, cfg = this.cfg, world = this.world;
    const target = Math.round(cfg.trees * this.density);
    const spacing = 3.4;
    const occ = new Map();
    const range = this.half - world.edgeMargin;
    const placed = [];

    let attempts = 0;
    while (placed.length < target && attempts < target * 40) {
      attempts++;
      const x = (rng() * 2 - 1) * range, z = (rng() * 2 - 1) * range;
      const d = Math.hypot(x, z);
      if (d < world.clearingRadius + 4) continue;
      if (this._isImportedForest(x, z)) continue;

      // clareiras e bosques naturais (ruído), mas a borda do mapa é sempre densa
      const edge = this.half - Math.max(Math.abs(x), Math.abs(z));
      const n = fbm2(x * 0.02 + 50, z * 0.02 + 50, 3, this.seed);
      const accept = edge < 30 ? 1 : smoothstep(0.36, 0.58, n);
      if (rng() > accept) continue;

      const cx = Math.floor(x / spacing), cz = Math.floor(z / spacing);
      let ok = true;
      for (let i = cx - 1; i <= cx + 1 && ok; i++) {
        for (let j = cz - 1; j <= cz + 1 && ok; j++) {
          const arr = occ.get(i + ',' + j);
          if (!arr) continue;
          for (const p of arr) {
            if ((p.x - x) ** 2 + (p.z - z) ** 2 < spacing * spacing) { ok = false; break; }
          }
        }
      }
      if (!ok) continue;
      const key = cx + ',' + cz;
      if (!occ.has(key)) occ.set(key, []);
      const p = { x, z };
      occ.get(key).push(p);
      placed.push(p);
    }

    // geometrias
    const trunkGeo = new THREE.CylinderGeometry(0.2, 0.34, 2.8, 6);
    trunkGeo.translate(0, 1.4, 0);

    const cones = [
      new THREE.ConeGeometry(2.2, 3.2, 7), new THREE.ConeGeometry(1.7, 2.8, 7),
      new THREE.ConeGeometry(1.15, 2.5, 7),
    ];
    cones[0].translate(0, 2.7, 0); cones[1].translate(0, 4.2, 0); cones[2].translate(0, 5.7, 0);
    const pineGeo = mergeGeometries(cones);

    const ico1 = new THREE.IcosahedronGeometry(1.9, 1); ico1.translate(0, 3.7, 0);
    const ico2 = new THREE.IcosahedronGeometry(1.3, 1); ico2.translate(1.0, 3.0, 0.5);
    const roundGeo = mergeGeometries([ico1, ico2]);

    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x6b4a2e, roughness: 1, flatShading: true });
    const foliageMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, flatShading: true });

    const trunks = [], pines = [], rounds = [];
    const pinePalette = [0x2d6a3e, 0x34784a, 0x285c37, 0x3a7f4c];
    const roundPalette = [0x5aa13f, 0x6bb04a, 0x4c9137, 0x7cb342, 0x5a9a3c, 0xd9a441];

    for (const p of placed) {
      const isPine = rng() < 0.6;
      let s = 0.85 + rng() * 0.8;
      if (rng() < 0.1) s *= 1.35;
      const y = this.terrain.heightAt(p.x, p.z) - 0.15;
      const yaw = rng() * Math.PI * 2;
      const m = this._matrix(p.x, y, p.z, yaw, s, s * (0.92 + rng() * 0.2), s);
      trunks.push({ x: p.x, z: p.z, matrix: m });
      const col = new THREE.Color(this._pick(rng, isPine ? pinePalette : roundPalette));
      col.offsetHSL((rng() - 0.5) * 0.03, 0, (rng() - 0.5) * 0.06);
      (isPine ? pines : rounds).push({ x: p.x, z: p.z, matrix: m, color: col });
      this._addCollider(p.x, p.z, 0.4 * s);
    }

    this._addInstanced(trunkGeo, trunkMat, trunks, { cast: true, receive: true, name: 'trunks' });
    this._addInstanced(pineGeo, foliageMat, pines, { cast: true, receive: true, name: 'pines' });
    this._addInstanced(roundGeo, foliageMat, rounds, { cast: true, receive: true, name: 'rounds' });
    this.treeCount = placed.length;
  }

  // ------------------------------------------------------------------ pedras
  _buildRocks() {
    const rng = this.rng, world = this.world;
    const total = Math.round(this.cfg.rocks * this.density);
    const range = this.half - world.edgeMargin;
    const safe = world.clearingRadius * 0.55; // centro da clareira sempre livre

    const geo = new THREE.IcosahedronGeometry(1, 1);
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) { // deformação determinística (vértices iguais -> mesmo deslocamento)
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const k = 1 + 0.2 * Math.sin(x * 7.3 + y * 5.1 + z * 3.7) + 0.1 * Math.cos(x * 11.0 - z * 6.0);
      p.setXYZ(i, x * k, y * k * 0.8, z * k);
    }
    geo.computeVertexNormals();
    const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, flatShading: true });
    const palette = [0x7d7f80, 0x8a8c8d, 0x6e7072, 0x6f7d5c, 0x93908a];

    const items = [];
    let count = 0;
    while (count < total) {
      const cx = (rng() * 2 - 1) * range, cz = (rng() * 2 - 1) * range;
      if (Math.hypot(cx, cz) < safe || this._isImportedForest(cx, cz)) continue;
      const n = 1 + Math.floor(rng() * 4);
      for (let i = 0; i < n && count < total; i++, count++) {
        const x = cx + (rng() - 0.5) * 5, z = cz + (rng() - 0.5) * 5;
        if (Math.hypot(x, z) < safe) continue;
        const big = rng() < 0.1;
        const s = big ? 2.2 + rng() * 1.6 : 0.4 + rng() * 1.0;
        const y = this.terrain.heightAt(x, z) + s * 0.15;
        const m = this._matrix(x, y, z, rng() * 6.28, s * (0.9 + rng() * 0.5), s * (0.7 + rng() * 0.5), s * (0.9 + rng() * 0.5));
        const col = new THREE.Color(this._pick(rng, palette));
        col.offsetHSL(0, 0, (rng() - 0.5) * 0.08);
        items.push({ x, z, matrix: m, color: col });
        if (s >= 0.8) this._addCollider(x, z, s * 0.85);
      }
    }
    this._addInstanced(geo, mat, items, { cast: true, receive: true, name: 'rocks' });
  }

  // ------------------------------------------------------------------ troncos
  _buildLogs() {
    const rng = this.rng, world = this.world;
    const total = Math.round(this.cfg.logs * this.density);
    const range = this.half - world.edgeMargin;
    const geo = new THREE.CylinderGeometry(0.28, 0.32, 3.6, 6);
    const mat = new THREE.MeshStandardMaterial({ color: 0x74502f, roughness: 1, flatShading: true });
    const items = [];
    while (items.length < total) {
      const x = (rng() * 2 - 1) * range, z = (rng() * 2 - 1) * range;
      if (Math.hypot(x, z) < world.clearingRadius * 0.8) continue;
      if (this._isImportedForest(x, z)) continue;
      const y = this.terrain.heightAt(x, z) + 0.22;
      // cilindro deitado: gira 90° em Z, depois gira em Y
      const m = this._matrix(x, y, z, rng() * 6.28, 1, 1, 1, 0, Math.PI / 2);
      items.push({ x, z, matrix: m });
    }
    this._addInstanced(geo, mat, items, { cast: true, receive: true, name: 'logs' });
  }

  // ------------------------------------------------------------------ grama
  _buildGrass() {
    const rng = this.rng, world = this.world;
    const total = Math.round(this.cfg.grass * this.density);
    const range = this.half - 2;

    // tufo = 3 lâminas cruzadas; cor mais escura na base e clara na ponta
    const blades = [];
    for (let i = 0; i < 3; i++) {
      const w = 0.09, h = 0.5 + i * 0.08;
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array([
        -w, 0, 0, w, 0, 0, 0.03, h, 0.06,
      ]), 3));
      g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array([0, 1, 0, 0, 1, 0, 0, 1, 0]), 3));
      const base = new THREE.Color(0x2c5a1c), tip = new THREE.Color(0x8cc152);
      g.setAttribute('color', new THREE.BufferAttribute(new Float32Array([
        base.r, base.g, base.b, base.r, base.g, base.b, tip.r, tip.g, tip.b,
      ]), 3));
      g.rotateY((i * Math.PI) / 3);
      blades.push(g);
    }
    const geo = mergeGeometries(blades);
    const mat = new THREE.MeshStandardMaterial({
      vertexColors: true, side: THREE.DoubleSide, roughness: 1, flatShading: false,
    });

    const items = [];
    for (let i = 0; i < total; i++) {
      const x = (rng() * 2 - 1) * range, z = (rng() * 2 - 1) * range;
      if (this._isImportedForest(x, z)) continue;
      const y = this.terrain.heightAt(x, z);
      const s = 0.8 + rng() * 1.1;
      const m = this._matrix(x, y, z, rng() * 6.28, s, s * (0.8 + rng() * 0.6), s);
      const c = new THREE.Color().setRGB(0.8 + rng() * 0.2, 0.85 + rng() * 0.15, 0.7 + rng() * 0.3);
      items.push({ x, z, matrix: m, color: c });
    }
    this._addInstanced(geo, mat, items, { cast: false, receive: true, name: 'grass' });
  }

  // ------------------------------------------------------------------ flores
  _buildFlowers() {
    const rng = this.rng;
    const total = Math.round(this.cfg.flowers * this.density);
    const range = this.half - 2;
    const geo = new THREE.IcosahedronGeometry(0.09, 0);
    const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8, flatShading: true });
    const palette = [0xffffff, 0xffd84a, 0xff7ab0, 0xb48cff, 0xff6a4a];
    const items = [];
    for (let i = 0; i < total; i++) {
      const x = (rng() * 2 - 1) * range, z = (rng() * 2 - 1) * range;
      if (this._isImportedForest(x, z)) continue;
      const y = this.terrain.heightAt(x, z) + 0.28;
      items.push({
        x, z, matrix: this._matrix(x, y, z, rng() * 6.28, 1, 1, 1),
        color: new THREE.Color(this._pick(rng, palette)),
      });
    }
    this._addInstanced(geo, mat, items, { cast: false, receive: false, name: 'flowers' });
  }
}
