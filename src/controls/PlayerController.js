// Converte o input em movimento/ações do cavaleiro controlado pelo jogador.
function dampAngle(current, target, speed, dt) {
  let diff = ((target - current + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
  const step = 1 - Math.exp(-speed * dt);
  return current + diff * step;
}

export class PlayerController {
  constructor({ knight, input, camera, terrain, cfg, worldCfg }) {
    this.knight = knight;
    this.input = input;
    this.camera = camera; // ThirdPersonCamera (precisa de .yaw)
    this.terrain = terrain;
    this.cfg = cfg;
    this.limitX = (worldCfg.mapBounds?.x ?? worldCfg.size) / 2 - worldCfg.edgeMargin;
    this.limitZ = (worldCfg.mapBounds?.z ?? worldCfg.size) / 2 - worldCfg.edgeMargin;

    input.on('sword', () => knight.toggleSword?.());
    input.on('attack', () => knight.attack?.());
  }

  update(dt) {
    const { knight, input, cfg } = this;
    const ix = (input.isDown('right') ? 1 : 0) - (input.isDown('left') ? 1 : 0);
    const iz = (input.isDown('forward') ? 1 : 0) - (input.isDown('back') ? 1 : 0);

    if (knight.canMove !== false && (ix !== 0 || iz !== 0)) {
      // movimento relativo à câmera: W = para longe da câmera
      const s = Math.sin(this.camera.yaw), c = Math.cos(this.camera.yaw);
      let dx = -s * iz + c * ix;
      let dz = -c * iz - s * ix;
      const len = Math.hypot(dx, dz);
      dx /= len; dz /= len;

      const speed = cfg.speed * (knight.drawn ? cfg.swordSpeedFactor : 1);
      knight.yaw = dampAngle(knight.yaw, Math.atan2(dx, dz), cfg.turnSpeed, dt);

      const p = knight.position;
      p.x += dx * speed * dt;
      p.z += dz * speed * dt;
      p.x = Math.max(-this.limitX, Math.min(this.limitX, p.x));
      p.z = Math.max(-this.limitZ, Math.min(this.limitZ, p.z));
      p.y = this.terrain.heightAt(p.x, p.z);
      knight.setMoving(true, speed);
    } else {
      knight.setMoving(false);
    }
  }
}
