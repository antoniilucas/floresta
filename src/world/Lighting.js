import * as THREE from 'three';

// Luz ambiente + hemisférica + sol (directional) com sombras suaves
// que seguem o jogador (o mapa é grande, a sombra cobre só a área próxima).
export class Lighting {
  constructor(scene, skyCfg, shadowMapSize) {
    this.ambient = new THREE.AmbientLight(0xffffff, 0.25);
    this.hemi = new THREE.HemisphereLight(0xcfe6ff, 0x3f5a2c, 0.9);

    this.sun = new THREE.DirectionalLight(0xfff0d6, 3.0);
    this.offset = new THREE.Vector3(...skyCfg.sunDir).normalize().multiplyScalar(110);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(shadowMapSize, shadowMapSize);
    const cam = this.sun.shadow.camera;
    const r = 55;
    cam.left = -r; cam.right = r; cam.top = r; cam.bottom = -r;
    cam.near = 10; cam.far = 260;
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.06;
    this.sun.shadow.radius = 3;

    scene.add(this.ambient, this.hemi, this.sun, this.sun.target);
  }

  follow(pos) {
    const x = Math.round(pos.x), z = Math.round(pos.z); // snap evita "tremedeira" da sombra
    this.sun.target.position.set(x, pos.y, z);
    this.sun.position.set(x + this.offset.x, pos.y + this.offset.y, z + this.offset.z);
    this.sun.target.updateMatrixWorld();
  }
}
