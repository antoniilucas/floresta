import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { CONFIG } from './config.js';
import { Sky } from './world/Sky.js';
import { Lighting } from './world/Lighting.js';
import { Knight } from './entities/Knight.js';
import { Input, PLAYER_ONE_KEYMAP, PLAYER_TWO_KEYMAP } from './controls/Input.js?v=2';
import { PlayerController } from './controls/PlayerController.js?v=2';
import { ThirdPersonCamera } from './controls/ThirdPersonCamera.js';
import { Hud } from './ui/Hud.js';
import { Wizard } from './entities/Wizard.js?v=2';

const params = new URLSearchParams(location.search);
const quality = CONFIG.quality[params.get('quality') === 'low' ? 'low' : 'high'];
const hud = new Hud();
const nextFrame = () => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));

async function main() {
  // ------------------------------------------------------------ renderer/cena
  const canvas = document.getElementById('game');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, quality.pixelRatio));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(CONFIG.sky.horizon, CONFIG.sky.fogNear, CONFIG.sky.fogFar);
  const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.3, 1400);

  // ------------------------------------------------------------ mundo
  hud.setProgress(0.1, 'Preparando o mapa…');
  await nextFrame();
  const terrain = { heightAt: () => 0 };

  hud.setProgress(0.2, 'Carregando o mapa exportado em GLB…');
  await nextFrame();
  const forestGltf = await new GLTFLoader().loadAsync(CONFIG.model.forest);
  const importedForest = forestGltf.scene;
  const sourceBounds = new THREE.Box3().setFromObject(importedForest);
  const sourceSize = sourceBounds.getSize(new THREE.Vector3());
  const sourceFootprint = Math.max(sourceSize.x, sourceSize.z);
  if (!Number.isFinite(sourceFootprint) || sourceFootprint <= 0) {
    throw new Error('O mapa GLB não possui dimensões válidas.');
  }
  const mapScale = CONFIG.model.forestWidth / sourceFootprint;
  const mapSize = sourceSize.multiplyScalar(mapScale);
  importedForest.scale.multiplyScalar(mapScale);
  importedForest.updateMatrixWorld(true);

  const groundLevels = [];
  const groundMeshes = [];
  importedForest.traverse((object) => {
    if (!object.isMesh) return;
    const bounds = new THREE.Box3().setFromObject(object);
    const size = bounds.getSize(new THREE.Vector3());
    if (
      size.x > mapSize.x * 0.35 &&
      size.z > mapSize.z * 0.35 &&
      size.y < Math.min(size.x, size.z) * 0.3
    ) {
      groundLevels.push((bounds.min.y + bounds.max.y) / 2);
      groundMeshes.push(object);
    }
  });
  groundLevels.sort((a, b) => a - b);
  const groundLevel = groundLevels.length
    ? groundLevels[Math.floor(groundLevels.length / 2)]
    : new THREE.Box3().setFromObject(importedForest).min.y;
  const groundTolerance = mapSize.x * 0.15;
  const mapGroundMeshes = groundMeshes.filter((object) => {
    const bounds = new THREE.Box3().setFromObject(object);
    return Math.abs((bounds.min.y + bounds.max.y) / 2 - groundLevel) < groundTolerance;
  });

  const forestBounds = new THREE.Box3().setFromObject(importedForest);
  const landmark = CONFIG.world.importedForest;
  importedForest.position.x = landmark.x - (forestBounds.min.x + forestBounds.max.x) / 2;
  importedForest.position.z = landmark.z - (forestBounds.min.z + forestBounds.max.z) / 2;
  importedForest.position.y = terrain.heightAt(landmark.x, landmark.z) + 0.025 - groundLevel;
  importedForest.updateMatrixWorld(true);
  const groundRaycaster = new THREE.Raycaster();
  const rayOriginY = new THREE.Box3().setFromObject(importedForest).max.y + 1;
  terrain.heightAt = (x, z) => {
    groundRaycaster.set(new THREE.Vector3(x, rayOriginY, z), new THREE.Vector3(0, -1, 0));
    const hit = groundRaycaster.intersectObjects(mapGroundMeshes, false)[0];
    return hit?.point.y ?? 0;
  };
  importedForest.name = 'Exported GLB Map';
  importedForest.traverse((object) => {
    if (object.isMesh) {
      object.castShadow = false;
      object.receiveShadow = true;
    }
  });
  scene.add(importedForest);
  const worldCfg = { ...CONFIG.world, mapBounds: { x: mapSize.x, z: mapSize.z } };

  const sky = new Sky(CONFIG.sky, CONFIG.seed);
  scene.add(sky.group);
  const lighting = new Lighting(scene, CONFIG.sky, quality.shadowMap);

  // ------------------------------------------------------------ personagens
  hud.setProgress(0.6, 'Carregando o cavaleiro…');
  const characters = [];

  async function spawnKnight(spawn, name) {
    const knight = await Knight.create({
      url: CONFIG.model.knight,
      name,
      scale: CONFIG.model.knightScale,
      strideLength: CONFIG.player.strideLength,
      onProgress: (e) => {
        if (e.lengthComputable) hud.setProgress(0.6 + 0.35 * (e.loaded / e.total));
      },
    });
    knight.setPosition(spawn.x, terrain.heightAt(spawn.x, spawn.z), spawn.z);
    knight.yaw = spawn.yaw;
    scene.add(knight.root);
    characters.push(knight);
    return knight;
  }

  async function spawnWizard(spawn, name = 'Mago') {
    const wizard = await Wizard.create(CONFIG.model.wizard, name);
    wizard.setPosition(spawn.x, terrain.heightAt(spawn.x, spawn.z), spawn.z);
    wizard.root.rotation.y = spawn.yaw;
    scene.add(wizard.root);
    characters.push(wizard);
    return wizard;
  }

  const player = await spawnKnight(CONFIG.spawns.player, 'Cavaleiro');
  const wizard = await spawnWizard(CONFIG.spawns.second);

  // ------------------------------------------------------------ controles
  const cameraTarget = player.position.clone().add(wizard.position).multiplyScalar(0.5);
  const input = new Input(canvas, { keymap: PLAYER_ONE_KEYMAP });
  const wizardInput = new Input(canvas, {
    keymap: PLAYER_TWO_KEYMAP,
    capturePointer: false,
  });
  const tpCam = new ThirdPersonCamera(camera, input, terrain, CONFIG.camera);
  tpCam.yaw = CONFIG.spawns.player.yaw + Math.PI;
  tpCam.snapTo(cameraTarget);
  const controller = new PlayerController({
    knight: player, input, camera: tpCam, terrain,
    cfg: CONFIG.player, worldCfg,
  });
  const wizardController = new PlayerController({
    knight: wizard, input: wizardInput, camera: tpCam, terrain,
    cfg: CONFIG.player, worldCfg,
  });

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  // Atalho para desenvolvimento / adicionar o 2º personagem pelo console
  window.game = { THREE, scene, renderer, camera, terrain, importedForest, characters, player, wizard, spawnKnight, spawnWizard, CONFIG };

  // ------------------------------------------------------------ loop
  const clock = new THREE.Clock();
  renderer.setAnimationLoop(() => {
    const dt = Math.min(clock.getDelta(), 0.05);
    controller.update(dt);
    wizardController.update(dt);
    for (const c of characters) c.update(dt);
    cameraTarget.copy(player.position).add(wizard.position).multiplyScalar(0.5);
    tpCam.update(dt, cameraTarget);
    lighting.follow(cameraTarget);
    sky.update(dt, camera);
    hud.setState(player.stateLabel);
    renderer.render(scene, camera);
  });

  hud.setProgress(1, 'Pronto!');
  console.info(`Mapa GLB carregado (${mapSize.x.toFixed(1)}×${mapSize.z.toFixed(1)} m)`);
  hud.hideLoading();
}

main().catch((err) => {
  console.error(err);
  hud.showError(
    'Não foi possível iniciar a cena.<br><small>' + (err && err.message ? err.message : err) +
    '</small><br><br>Abra o projeto por um servidor local (<code>start.bat</code> / <code>start.sh</code>) ' +
    'e confira se há internet para carregar o Three.js.',
  );
});
