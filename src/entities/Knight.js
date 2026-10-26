import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneWithSkeleton } from 'three/addons/utils/SkeletonUtils.js';

// Apelidos lógicos: aceitam nomes comuns usados em GLBs baixados do Sketchfab.
export const CLIPS = {
  idle: ['Idle', 'Idle 1'],
  idleSword: ['IdleSword', 'Idle Sword', 'Combat Idle'],
  walk: ['Walk', 'Walking'],
  walkSword: ['WalkSword', 'Walk Sword'],
  draw: ['Draw', 'Unsheath', 'Unsheathe'],
  slash: ['Slash', 'Sword Slash', 'Attack 1', 'Attack'],
};
// Nomes dos nós das duas espadas (uma na bainha, outra na mão)
const NODE_SHEATHED = 'Sword_Sheathed';
const NODE_HAND = 'Sword_Hand';
const SWAP_AT = 0.45; // fração do clipe Draw em que a espada troca de lugar

function resolveClipNames(animations) {
  const names = animations.map((clip) => clip.name);
  const find = (candidates) => {
    for (const candidate of candidates) {
      const exact = names.find((name) => name.toLowerCase() === candidate.toLowerCase());
      if (exact) return exact;
    }
    for (const candidate of candidates) {
      const partial = names.find((name) => name.toLowerCase().includes(candidate.toLowerCase()));
      if (partial) return partial;
    }
    return null;
  };
  const foundIdle = find(CLIPS.idle);
  const foundIdleSword = find(CLIPS.idleSword);
  const slash = find(CLIPS.slash);
  const walk = find(CLIPS.walk) || foundIdle;
  return {
    idle: foundIdle || walk || names[0] || null,
    idleIsStatic: !foundIdle,
    idleSword: foundIdleSword || slash || foundIdle || walk || names[0] || null,
    idleSwordIsStatic: !foundIdleSword,
    walk,
    walkSword: find(CLIPS.walkSword) || walk,
    draw: find(CLIPS.draw),
    slash,
  };
}

const gltfCache = new Map();
function loadGLTF(url, onProgress) {
  if (!gltfCache.has(url)) gltfCache.set(url, new GLTFLoader().loadAsync(url, onProgress));
  return gltfCache.get(url);
}

/**
 * Cavaleiro: carrega o GLB, controla o AnimationMixer e a máquina de estados
 * (parado / andando / desembainhando / atacando). Não lê teclado: quem controla
 * (PlayerController, IA, rede...) chama setMoving(), toggleSword() e attack().
 */
export class Knight {
  static async create(opts) {
    const gltf = await loadGLTF(opts.url, opts.onProgress);
    return new Knight(gltf, opts);
  }

  constructor(gltf, { name = 'Knight', scale = 1, strideLength = 1.57 } = {}) {
    this.name = name;
    this.strideLength = strideLength;

    this.root = new THREE.Group(); // posição e rotação (yaw) no mundo
    this.root.name = name;
    // Clone correto para meshes skinned: mantém a relação entre cada mesh e seus ossos.
    this.model = cloneWithSkeleton(gltf.scene);
    this.model.scale.setScalar(1);
    this.root.add(this.model);
    this.root.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(this.model, true);
    const modelHeight = bounds.max.y - bounds.min.y;
    if (Number.isFinite(modelHeight) && modelHeight > 0.001) {
      this.model.scale.setScalar((1.85 * scale) / modelHeight);
      this.root.updateMatrixWorld(true);
      const fittedBounds = new THREE.Box3().setFromObject(this.model, true);
      this.model.position.y -= fittedBounds.min.y;
    } else {
      this.model.scale.setScalar(scale);
    }
    this.model.traverse((o) => {
      if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; }
    });

    this.swordSheathed = this.model.getObjectByName(NODE_SHEATHED);
    this.swordHand = this.model.getObjectByName(NODE_HAND);

    // animações
    this.mixer = new THREE.AnimationMixer(this.model);
    this.actions = {};
    for (const clip of gltf.animations) this.actions[clip.name] = this.mixer.clipAction(clip);
    this.clips = resolveClipNames(gltf.animations);
    this.mixer.addEventListener('finished', (e) => this._onFinished(e.action));

    // estado
    this.drawn = false;       // espada na mão?
    this.moving = false;
    this.moveSpeed = 0;
    this.busy = null;         // null | 'draw' | 'sheathe' | 'slash'
    this.pendingAttack = false;
    this.swapped = false;
    this.current = null;
    this.currentName = '';

    this._setSwordVisible(false);
    this._fadeTo('idle', 0);
  }

  // ----------------------------------------------------------------- posição
  get position() { return this.root.position; }
  get yaw() { return this.root.rotation.y; }
  set yaw(v) { this.root.rotation.y = v; }
  setPosition(x, y, z) { this.root.position.set(x, y, z); }

  get canMove() { return this.busy === null; }

  get stateLabel() {
    if (this.busy === 'slash') return 'Atacando';
    if (this.busy === 'draw') return 'Desembainhando';
    if (this.busy === 'sheathe') return 'Embainhando';
    if (this.moving) return this.drawn ? 'Andando (espada na mão)' : 'Andando';
    return this.drawn ? 'Postura de combate' : 'Parado';
  }

  // ----------------------------------------------------------------- comandos
  setMoving(moving, speed = 0) {
    this.moving = moving && this.canMove;
    this.moveSpeed = speed;
  }

  toggleSword() {
    if (this.busy) return;
    this.moving = false;
    this.swapped = false;
    if (!this.clips.draw) {
      this._swap(!this.drawn);
      this._refreshLocomotion();
      return;
    }
    if (!this.drawn) {
      this.busy = 'draw';
      this._fadeTo('draw', 0.12, { once: true });
    } else {
      this.busy = 'sheathe';
      this._fadeTo('draw', 0.12, { once: true, reverse: true });
    }
  }

  attack() {
    if (this.busy === 'slash' || this.busy === 'sheathe') return;
    if (this.busy === 'draw' || (!this.drawn && this.clips.draw)) {
      // ainda sem espada: desembainha primeiro e ataca em seguida
      this.pendingAttack = true;
      if (!this.busy) this.toggleSword();
      return;
    }
    if (!this.drawn) this._swap(true);
    if (!this.clips.slash) return;
    this.moving = false;
    this.busy = 'slash';
    this._fadeTo('slash', 0.08, { once: true });
  }

  // ----------------------------------------------------------------- loop
  update(dt) {
    this.mixer.update(dt);
    this._checkSwordSwap();
    if (!this.busy) this._refreshLocomotion();
  }

  _refreshLocomotion() {
    const want = this.moving
      ? (this.drawn ? 'walkSword' : 'walk')
      : (this.drawn ? 'idleSword' : 'idle');
    if (want !== this.currentName) this._fadeTo(want, 0.18);
    if (this.moving && this.current) {
      // sincroniza a cadência dos passos com a velocidade real (evita "patinar")
      this.current.timeScale = Math.max(0.4, this.moveSpeed / this.strideLength);
    }
  }

  _checkSwordSwap() {
    if (this.swapped || (this.busy !== 'draw' && this.busy !== 'sheathe')) return;
    const a = this.actions[this.clips.draw];
    const at = a.getClip().duration * SWAP_AT;
    if (this.busy === 'draw' && a.time >= at) this._swap(true);
    else if (this.busy === 'sheathe' && a.time <= at) this._swap(false);
  }

  _swap(drawn) {
    this.swapped = true;
    this.drawn = drawn;
    this._setSwordVisible(drawn);
  }

  _setSwordVisible(drawn) {
    if (this.swordHand) this.swordHand.visible = drawn;
    if (this.swordSheathed) this.swordSheathed.visible = !drawn;
  }

  _onFinished(action) {
    const draw = this.actions[this.clips.draw], slash = this.actions[this.clips.slash];
    if (action === draw && (this.busy === 'draw' || this.busy === 'sheathe')) {
      if (!this.swapped) this._swap(this.busy === 'draw');
      this.busy = null;
      this._refreshLocomotion();
      if (this.pendingAttack && this.drawn) { this.pendingAttack = false; this.attack(); }
      else this.pendingAttack = false;
    } else if (action === slash && this.busy === 'slash') {
      this.busy = null;
      this._refreshLocomotion();
    }
  }

  _fadeTo(name, fade, { once = false, reverse = false } = {}) {
    const clipName = this.clips[name];
    const next = clipName && this.actions[clipName];
    if (!next) { console.warn('Clipe não encontrado:', name, this.clips); return; }
    const prev = this.current;

    next.reset();
    next.enabled = true;
    next.setEffectiveWeight(1);
    const holdIdlePose = !!this.clips[`${name}IsStatic`];
    next.setEffectiveTimeScale(holdIdlePose ? 0 : reverse ? -1 : 1);
    if (once) { next.setLoop(THREE.LoopOnce, 1); next.clampWhenFinished = true; }
    else { next.setLoop(THREE.LoopRepeat, Infinity); next.clampWhenFinished = false; }
    if (reverse) next.time = next.getClip().duration;

    // Walk <-> WalkSword têm a mesma fase: mantém os pés em sincronia
    const walks = ['walk', 'walkSword'];
    if (prev && walks.includes(name) && walks.includes(this.currentName)) next.time = prev.time;

    next.play();
    if (prev && prev !== next && fade > 0) prev.crossFadeTo(next, fade, false);
    else if (prev && prev !== next) prev.stop();
    else if (!prev && fade > 0) next.fadeIn(fade);

    this.current = next;
    this.currentName = name;
  }
}
