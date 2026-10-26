// Teclado + mouse. Ações em vez de teclas cruas, para facilitar remapear.
const KEYMAP = {
  KeyW: 'forward', ArrowUp: 'forward',
  KeyS: 'back', ArrowDown: 'back',
  KeyA: 'left', ArrowLeft: 'left',
  KeyD: 'right', ArrowRight: 'right',
  KeyQ: 'camLeft', KeyR: 'camRight',
  KeyE: 'sword',
  Space: 'attack', KeyF: 'attack',
};
const HELD = new Set(['forward', 'back', 'left', 'right', 'camLeft', 'camRight']);

export class Input {
  constructor(canvas) {
    this.down = new Set();
    this.listeners = new Map();
    this.look = { dx: 0, dy: 0, wheel: 0 };
    this._dragging = false;

    window.addEventListener('keydown', (e) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return; // não atrapalha Ctrl+R, Ctrl+F...
      const action = KEYMAP[e.code];
      if (!action) return;
      e.preventDefault();
      if (HELD.has(action)) this.down.add(action);
      else if (!e.repeat) this._emit(action);
    });
    window.addEventListener('keyup', (e) => {
      const action = KEYMAP[e.code];
      if (action) this.down.delete(action);
    });
    window.addEventListener('blur', () => this.down.clear());

    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    canvas.addEventListener('pointerdown', (e) => {
      this._dragging = true;
      canvas.setPointerCapture(e.pointerId);
    });
    canvas.addEventListener('pointerup', (e) => {
      this._dragging = false;
      if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
    });
    canvas.addEventListener('pointermove', (e) => {
      if (!this._dragging) return;
      this.look.dx += e.movementX;
      this.look.dy += e.movementY;
    });
    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.look.wheel += e.deltaY;
    }, { passive: false });
  }

  isDown(action) { return this.down.has(action); }

  on(action, fn) {
    if (!this.listeners.has(action)) this.listeners.set(action, []);
    this.listeners.get(action).push(fn);
  }

  _emit(action) {
    const fns = this.listeners.get(action);
    if (fns) for (const fn of fns) fn();
  }

  consumeLook() {
    const l = { ...this.look };
    this.look.dx = this.look.dy = this.look.wheel = 0;
    return l;
  }
}
