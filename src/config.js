// Configuração central do projeto. Ajuste aqui sem mexer no resto do código.
export const CONFIG = {
  seed: 20260,

  model: {
    knight: 'assets/models/knight.glb',
    knightScale: 1.0, // ajuste se quiser alterar a proporção do cavaleiro
    forest: 'assets/models/realistic_forest.glb',
    forestWidth: 150,
  },

  world: {
    size: 400,            // 400 x 400 m (160 mil m²)
    segments: 160,        // resolução do terreno
    clearingRadius: 38,   // clareira central livre (sem árvores/pedras grandes)
    hillHeight: 9,        // amplitude das colinas fora da clareira
    edgeMargin: 6,        // distância mínima da borda do mapa
    importedForest: { x: 70, z: 0, clearRadius: 82 },
  },

  forest: {
    trees: 0,
    rocks: 0,
    logs: 0,
    grass: 2200,
    flowers: 180,
    chunkSize: 100,       // tamanho dos blocos usados para frustum culling
  },

  // "?quality=low" na URL usa o preset low
  quality: {
    high: { density: 1.0, shadowMap: 2048, pixelRatio: 2 },
    low: { density: 0.5, shadowMap: 1024, pixelRatio: 1 },
  },

  // Pontos de nascimento. "second" está reservado para o 2º personagem.
  spawns: {
    player: { x: -6, z: 4, yaw: 1.57 },
    second: { x: 7, z: -3, yaw: -2.4 },
  },

  player: {
    speed: 2.8,              // m/s andando
    swordSpeedFactor: 0.85,  // mais lento com a espada na mão
    turnSpeed: 12,           // rad/s (suavização da rotação)
    radius: 0.45,            // raio de colisão
    strideLength: 1.57,      // metros por ciclo da animação Walk (sincroniza os pés)
  },

  camera: {
    distance: 7.5,
    minDistance: 3.5,
    maxDistance: 16,
    pitch: 0.38,
    focusHeight: 1.5,
    followSharpness: 8,
    keyRotateSpeed: 1.8,
  },

  sky: {
    top: 0x3d7fd0,
    horizon: 0xcfe6f5,
    ground: 0xcfe6f5,
    fogNear: 70,
    fogFar: 300,
    sunDir: [0.55, 0.62, 0.42],
  },
};
