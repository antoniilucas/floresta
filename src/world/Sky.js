import * as THREE from 'three';
import { mulberry32 } from './noise.js';

// Céu em gradiente (cúpula com shader) + sol + algumas nuvens low poly.
export class Sky {
  constructor(cfg, seed) {
    this.group = new THREE.Group();
    const sunDir = new THREE.Vector3(...cfg.sunDir).normalize();

    const mat = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: {
        top: { value: new THREE.Color(cfg.top) },
        horizon: { value: new THREE.Color(cfg.horizon) },
        bottom: { value: new THREE.Color(cfg.ground) },
        sunDir: { value: sunDir },
      },
      vertexShader: /* glsl */`
        varying vec3 vDir;
        void main() {
          vDir = normalize(position);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: /* glsl */`
        uniform vec3 top; uniform vec3 horizon; uniform vec3 bottom; uniform vec3 sunDir;
        varying vec3 vDir;
        void main() {
          vec3 d = normalize(vDir);
          float h = d.y;
          vec3 col = mix(horizon, top, pow(clamp(h, 0.0, 1.0), 0.55));
          col = mix(col, bottom, smoothstep(0.0, -0.2, h));
          float s = max(dot(d, normalize(sunDir)), 0.0);
          col += vec3(1.0, 0.88, 0.65) * pow(s, 10.0) * 0.28;
          col += vec3(1.0, 0.95, 0.8) * smoothstep(0.9985, 0.9996, s) * 1.4;
          gl_FragColor = vec4(col, 1.0);
          #include <colorspace_fragment>
        }`,
    });
    this.dome = new THREE.Mesh(new THREE.SphereGeometry(900, 32, 16), mat);
    this.dome.frustumCulled = false;
    this.dome.renderOrder = -1000;
    this.group.add(this.dome);

    // nuvens
    const rng = mulberry32(seed + 5);
    const cloudMat = new THREE.MeshStandardMaterial({
      color: 0xffffff, flatShading: true, roughness: 1, fog: false,
      emissive: 0x8fa6c0, emissiveIntensity: 0.35,
    });
    this.clouds = [];
    for (let i = 0; i < 16; i++) {
      const cloud = new THREE.Group();
      const puffs = 4 + Math.floor(rng() * 3);
      for (let p = 0; p < puffs; p++) {
        const r = 14 + rng() * 14;
        const m = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 0), cloudMat);
        m.position.set((p - puffs / 2) * 17 + rng() * 6, rng() * 6, (rng() - 0.5) * 14);
        m.scale.y = 0.55;
        cloud.add(m);
      }
      const a = rng() * Math.PI * 2, dist = 150 + rng() * 380;
      cloud.position.set(Math.cos(a) * dist, 120 + rng() * 50, Math.sin(a) * dist);
      cloud.rotation.y = rng() * Math.PI;
      cloud.userData.speed = 1.5 + rng() * 2;
      this.clouds.push(cloud);
      this.group.add(cloud);
    }
  }

  update(dt, camera) {
    this.dome.position.copy(camera.position);
    for (const c of this.clouds) {
      c.position.x += c.userData.speed * dt;
      if (c.position.x > 550) c.position.x = -550;
    }
  }
}
