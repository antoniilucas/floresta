import * as THREE from 'three';

// Câmera em terceira pessoa: orbita o alvo (mouse arrastando / Q e R / roda do mouse)
// e o segue com suavização. Nunca entra no chão.
export class ThirdPersonCamera {
  constructor(camera, input, terrain, cfg) {
    this.camera = camera;
    this.input = input;
    this.terrain = terrain;
    this.cfg = cfg;
    this.yaw = 0.8 + Math.PI; // começa atrás do cavaleiro
    this.pitch = cfg.pitch;
    this.distance = cfg.distance;
    this.focus = new THREE.Vector3();
    this._desired = new THREE.Vector3();
    this._first = true;
  }

  snapTo(target) {
    this.focus.set(target.x, target.y + this.cfg.focusHeight, target.z);
    this._first = true;
  }

  update(dt, target) {
    const cfg = this.cfg, input = this.input;
    const look = input.consumeLook();
    this.yaw -= look.dx * 0.005;
    this.pitch = THREE.MathUtils.clamp(this.pitch + look.dy * 0.004, 0.08, 1.25);
    this.distance = THREE.MathUtils.clamp(this.distance + look.wheel * 0.01, cfg.minDistance, cfg.maxDistance);
    if (input.isDown('camLeft')) this.yaw += cfg.keyRotateSpeed * dt;
    if (input.isDown('camRight')) this.yaw -= cfg.keyRotateSpeed * dt;

    const goal = new THREE.Vector3(target.x, target.y + cfg.focusHeight, target.z);
    const k = 1 - Math.exp(-dt * cfg.followSharpness);
    if (this._first) this.focus.copy(goal); else this.focus.lerp(goal, k);

    const cp = Math.cos(this.pitch);
    this._desired.set(
      this.focus.x + Math.sin(this.yaw) * cp * this.distance,
      this.focus.y + Math.sin(this.pitch) * this.distance,
      this.focus.z + Math.cos(this.yaw) * cp * this.distance,
    );
    const minY = this.terrain.heightAt(this._desired.x, this._desired.z) + 0.8;
    if (this._desired.y < minY) this._desired.y = minY;

    if (this._first) { this.camera.position.copy(this._desired); this._first = false; }
    else this.camera.position.lerp(this._desired, 1 - Math.exp(-dt * (cfg.followSharpness + 2)));
    this.camera.lookAt(this.focus);
  }
}
