import * as THREE from 'three';
import { fbm2, smoothstep } from './noise.js';

// Terreno com colinas suaves e uma clareira plana no centro.
export class Terrain {
  constructor(cfg, seed) {
    this.cfg = cfg;
    this.seed = seed;
    this.half = cfg.size / 2;
    this.mesh = this._build();
  }

  heightAt(x, z) {
    const c = this.cfg;
    const d = Math.hypot(x, z);
    const mask = smoothstep(c.clearingRadius * 0.7, c.clearingRadius * 1.7, d);
    if (mask <= 0) return 0;
    const big = fbm2(x * 0.011 + 10, z * 0.011 + 10, 4, this.seed) - 0.5;
    const small = fbm2(x * 0.07, z * 0.07, 2, this.seed + 3) - 0.5;
    let height = (big * 2 * c.hillHeight + small * 0.5) * mask;
    const imported = c.importedForest;
    if (imported) {
      const forestDistance = Math.hypot(x - imported.x, z - imported.z);
      const flatten = 1 - smoothstep(imported.clearRadius * 0.72, imported.clearRadius * 1.2, forestDistance);
      height *= 1 - flatten;
    }
    return height;
  }

  _build() {
    const c = this.cfg;
    const geo = new THREE.PlaneGeometry(c.size, c.size, c.segments, c.segments);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    const colors = new Float32Array(pos.count * 3);

    const grassA = new THREE.Color(0x5a9a3c);
    const grassB = new THREE.Color(0x3f7d2f);
    const light = new THREE.Color(0x86b64c);
    const dirt = new THREE.Color(0x7a6240);
    const tmp = new THREE.Color();

    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i);
      const h = this.heightAt(x, z);
      pos.setY(i, h);

      const patch = fbm2(x * 0.03 + 100, z * 0.03 + 100, 3, this.seed + 7);
      const fine = fbm2(x * 0.25, z * 0.25, 2, this.seed + 9);
      tmp.copy(grassB).lerp(grassA, smoothstep(0.35, 0.65, patch));
      tmp.lerp(light, smoothstep(0.55, 0.8, fine) * 0.5);
      // manchas de terra
      const dirtN = fbm2(x * 0.045 + 300, z * 0.045 + 300, 3, this.seed + 11);
      tmp.lerp(dirt, smoothstep(0.62, 0.74, dirtN) * 0.85);
      // clareira um pouco mais clara
      const d = Math.hypot(x, z);
      tmp.lerp(light, (1 - smoothstep(c.clearingRadius * 0.6, c.clearingRadius * 1.1, d)) * 0.35);

      colors[i * 3] = tmp.r; colors[i * 3 + 1] = tmp.g; colors[i * 3 + 2] = tmp.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();

    const mat = new THREE.MeshStandardMaterial({
      vertexColors: true, roughness: 1, metalness: 0, flatShading: true,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.receiveShadow = true;
    mesh.name = 'Terrain';
    return mesh;
  }
}
