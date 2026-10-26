import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { CONFIG } from './config.js';
import { Terrain } from './world/Terrain.js';
import { Forest } from './world/Forest.js';
import { Sky } from './world/Sky.js';
import { Lighting } from './world/Lighting.js';
import { Knight } from './entities/Knight.js';
import { Input } from './controls/Input.js';
import { PlayerController } from './controls/PlayerController.js';
import { ThirdPersonCamera } from './controls/ThirdPersonCamera.js';
import { Hud } from './ui/Hud.js';

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
  hud.setProgress(0.1, 'Gerando terreno…');
  await nextFrame();
  const terrain = new Terrain(CONFIG.world, CONFIG.seed);
  scene.add(terrain.mesh);

  hud.setProgress(0.2, 'Carregando o mapa realista do Sketchfab…');
  await nextFrame();
  const forestGltf = await new GLTFLoader().loadAsync(CONFIG.model.forest);
  const importedForest = forestGltf.scene;
  const sourceBounds = new THREE.Box3().setFromObject(importedForest);
  const sourceSize = sourceBounds.getSize(new THREE.Vector3());
  const sourceFootprint = Math.max(sourceSize.x, sourceSize.z);
  importedForest.scale.multiplyScalar(CONFIG.model.forestWidth / sourceFootprint);
  importedForest.updateMatrixWorld(true);
  const forestBounds = new THREE.Box3().setFromObject(importedForest);
  const landmark = CONFIG.world.importedForest;
  importedForest.position.x = landmark.x - (forestBounds.min.x + forestBounds.max.x) / 2;
  importedForest.position.z = landmark.z - (forestBounds.min.z + forestBounds.max.z) / 2;
  importedForest.position.y = terrain.heightAt(landmark.x, landmark.z) + 0.025 - forestBounds.min.y;
  importedForest.name = 'Sketchfab Realistic Forest';
  importedForest.traverse((object) => {
    if (object.isMesh) {
      object.castShadow = false;
      object.receiveShadow = true;
    }
  });
  scene.add(importedForest);

  hud.setProgress(0.3, 'Plantando a floresta…');
  await nextFrame();
  const forest = new Forest({
    terrain, worldCfg: CONFIG.world, forestCfg: CONFIG.forest,
    density: quality.density, seed: CONFIG.seed,
  });
  scene.add(forest.group);

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

  const player = await spawnKnight(CONFIG.spawns.player, 'Cavaleiro');

  // Demonstração do 2º personagem: abra com ?second=1 (ou chame spawnKnight() depois)
  if (params.get('second') === '1') await spawnKnight(CONFIG.spawns.second, 'Cavaleiro 2');

  // ------------------------------------------------------------ controles
  const input = new Input(canvas);
  const tpCam = new ThirdPersonCamera(camera, input, terrain, CONFIG.camera);
  tpCam.yaw = CONFIG.spawns.player.yaw + Math.PI;
  tpCam.snapTo(player.position);
  const controller = new PlayerController({
    knight: player, input, camera: tpCam, terrain, forest,
    cfg: CONFIG.player, worldCfg: CONFIG.world,
  });

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  // Atalho para desenvolvimento / adicionar o 2º personagem pelo console
  window.game = { THREE, scene, renderer, camera, terrain, forest, importedForest, characters, player, spawnKnight, CONFIG };

  // ------------------------------------------------------------ loop
  const clock = new THREE.Clock();
  renderer.setAnimationLoop(() => {
    const dt = Math.min(clock.getDelta(), 0.05);
    controller.update(dt);
    for (const c of characters) c.update(dt);
    tpCam.update(dt, player.position);
    lighting.follow(player.position);
    sky.update(dt, camera);
    hud.setState(player.stateLabel);
    renderer.render(scene, camera);
  });

  hud.setProgress(1, 'Pronto!');
  console.info(`Mapa ${CONFIG.world.size}×${CONFIG.world.size} m com cena realista importada do Sketchfab e ${forest.treeCount} árvores procedurais`);
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
