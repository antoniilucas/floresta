
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

export class Wizard {
  static async create(url, name = 'Mago') {
    const loader = new GLTFLoader();
    const gltf = await loader.loadAsync(url);

    return new Wizard(gltf, name);
  }

  constructor(gltf, name) {
    this.root = new THREE.Group();
    this.root.name = name;

    this.model = gltf.scene;
    this.root.add(this.model);

    const bounds = new THREE.Box3().setFromObject(this.model);
    const height = bounds.max.y - bounds.min.y;

    if (height > 0) {
      this.model.scale.setScalar(1.8 / height);
    }

    this.model.updateMatrixWorld(true);

    const fittedBounds = new THREE.Box3().setFromObject(this.model);
    this.model.position.y -= fittedBounds.min.y;

    this.model.traverse((object) => {
      if (object.isMesh) {
        object.castShadow = true;
        object.receiveShadow = true;
      }
    });

    this.mixer = new THREE.AnimationMixer(this.model);
    this.actions = {};

    for (const clip of gltf.animations) {
      this.actions[clip.name] = this.mixer.clipAction(clip);
    }

    const clips = gltf.animations;

    const findClip = (pattern, fallbackIndex = -1) => {
      return clips.find((clip) => pattern.test(clip.name))
        || clips[fallbackIndex]
        || null;
    };

    this.clips = {
      idle: findClip(/idle|stand|breath/i, 0),
      walk: findClip(/walk|run|move/i, clips.length === 1 ? 0 : -1),
      attack: findClip(/attack|hit|slash/i, clips.length === 1 ? 0 : -1),
    };

    if (new Set([this.clips.idle, this.clips.walk, this.clips.attack]).size < 3) {
      console.warn('O GLB do mago não contém clipes distintos para idle, walk e attack.');
    }

    this.currentAction = null;
    this.moving = false;
    this.play('idle');
  }

  get position() {
    return this.root.position;
  }

  get yaw() {
    return this.root.rotation.y;
  }

  set yaw(value) {
    this.root.rotation.y = value;
  }

  get canMove() {
    return true;
  }

  get drawn() {
    return false;
  }

  setPosition(x, y, z) {
    this.root.position.set(x, y, z);
  }

  setMoving(moving) {
    if (this.moving === moving) return;
    this.moving = moving;
    this.play(moving ? 'walk' : 'idle');
  }

  play(type) {
    const clip = this.clips[type];

    if (!clip) {
      console.warn('Animação não encontrada:', type);
      return;
    }

    const next = this.actions[clip.name];

    if (this.currentAction === next) {
      return;
    }

    if (this.currentAction) {
      this.currentAction.fadeOut(0.15);
    }

    next.reset();
    next.enabled = true;
    next.setEffectiveWeight(1);

    if (type === 'attack') {
      next.setLoop(THREE.LoopOnce, 1);
      next.clampWhenFinished = true;
    } else {
      next.setLoop(THREE.LoopRepeat, Infinity);
      next.clampWhenFinished = false;
    }

    next.fadeIn(0.15);
    next.play();

    this.currentAction = next;
  }

  update(delta) {
    this.mixer.update(delta);
  }
}
