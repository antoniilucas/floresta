# 🛡️ Floresta do Cavaleiro — Three.js

Cena 3D interativa: um cavaleiro animado explora uma floresta low poly **grande (400 × 400 m)**,
com câmera em terceira pessoa, sombras suaves, céu com nuvens e uma clareira central livre
já reservada para o **segundo personagem**.

## Como rodar

O projeto usa módulos ES e carrega um `.glb`, então o navegador exige um servidor local
(abrir o `index.html` com duplo clique **não funciona**). É simples:

| Sistema | O que fazer |
|---|---|
| Windows | duplo clique em **`start.bat`** |
| macOS / Linux | `./start.sh` (ou `sh start.sh`) |
| Qualquer um | `python3 -m http.server 8080` dentro da pasta e abra <http://localhost:8080> |
| Node.js 18+ | `npm start` (servidor local incluído, sem dependências) |

Requisitos: um navegador com WebGL (Chrome, Edge, Firefox, Safari) e **internet na primeira
abertura** — o Three.js é carregado do CDN jsDelivr (versão fixa 0.160.0). O servidor local incluído não
precisa baixar pacotes. Para rodar offline, veja abaixo.

PC fraco ou celular? Abra com **`http://localhost:8080/?quality=low`** (metade da vegetação,
sombras menores, sem pixel-ratio alto).

## Controles

| Tecla | Ação |
|---|---|
| **W A S D** ou **setas** | mover (relativo à câmera) → toca a animação *Walk* |
| **E** | alternar a postura de combate |
| **Espaço** ou **F** | ataque com a espada (*Sword Attack*) |
| **Arrastar o mouse** | girar a câmera |
| **Q / R** | girar a câmera pelo teclado |
| **Roda do mouse** | aproximar / afastar |

## Estrutura

```
floresta-cavaleiro/
├── index.html              # página principal (importmap do Three.js + HUD)
├── start.bat / start.sh    # servidor local em 1 clique
├── assets/models/
│   ├── knight.glb          # cavaleiro Sketchfab: andar, correr e ataque
│   ├── realistic_forest.glb # trecho importado de floresta realista
│   └── ATTRIBUTION.md      # fontes e licenças dos modelos
├── src/
│   ├── main.js             # monta renderer, mundo, personagens e o loop
│   ├── config.js           # TODAS as configurações (tamanho do mapa, velocidade, câmera, céu…)
│   ├── world/
│   │   ├── Terrain.js      # terreno com colinas + clareira plana central
│   │   ├── Forest.js       # árvores, pedras, troncos, grama, flores + colisão
│   │   ├── Sky.js          # céu em gradiente, sol e nuvens
│   │   ├── Lighting.js     # ambiente + hemisférica + sol com sombras que seguem o jogador
│   │   └── noise.js        # ruído e RNG com semente (mapa sempre igual)
│   ├── entities/
│   │   └── Knight.js       # GLTFLoader + AnimationMixer + máquina de estados
│   ├── controls/
│   │   ├── Input.js        # teclado/mouse → ações
│   │   ├── PlayerController.js  # ações → movimento do cavaleiro
│   │   └── ThirdPersonCamera.js # câmera suave em 3ª pessoa
│   └── ui/                 # HUD e CSS
└── tools/
    ├── build_knight.py    # gera o knight-procedural.glb (opcional)
    └── serve.mjs          # servidor local sem dependências para npm start
```

## O mapa

- **400 × 400 m** (a travessia de ponta a ponta leva ~2 minutos andando), com a floresta realista importada perto da área inicial e gramado aberto ao redor.
- O bosque realista importado fica próximo ao ponto inicial; a clareira ampla mantém espaço para explorar e acomodar o segundo personagem.
- Limite invisível nas bordas do terreno.
- Leve: o restante da vegetação procedural antiga foi desativado para deixar o modelo importado visível e o mapa aberto.

Mude tamanho, quantidades, cores do céu, velocidade etc. em **`src/config.js`**.
## Adicionando o 2º personagem

O ponto de nascimento já existe em `CONFIG.spawns.second` e o `Knight` não depende do teclado,
então qualquer controlador pode dirigi-lo. Para ver funcionando, abra `http://localhost:8080/?second=1`
(um segundo cavaleiro aparece parado ao lado do primeiro). No código, o caminho é:

```js
// em src/main.js (spawnKnight já está pronto)
const outro = await spawnKnight(CONFIG.spawns.second, 'Aliado');
outro.toggleSword();            // desembainha
outro.setMoving(true, 2.0);     // anda (a velocidade sincroniza os passos)
outro.attack();                 // ataca
```

Para um personagem com modelo diferente: crie `src/entities/NovoPersonagem.js` seguindo o `Knight.js`
(carrega o GLB, cria o `AnimationMixer`, expõe `root` e `update(dt)`) e coloque-o no array `characters`
do `main.js` — o loop já chama `update(dt)` de todos. Pelo console do navegador também dá para testar:
`await game.spawnKnight({x: 10, z: 0, yaw: 0}, 'Teste')`.

## Sobre os modelos 3D

- **Cavaleiro:** `assets/models/knight.glb` é o cavaleiro detalhado baixado do Sketchfab. O arquivo inclui
  as animações `rig|Basic_Walk`, `rig|Run_Cycle` e `rig|Sword_attacK`. O controle usa Walk para andar,
  Attack para golpear e segura o primeiro quadro de Walk como pose parada, pois o modelo não tem Idle.
  A tecla E usa o primeiro quadro do ataque como postura de combate; este asset não inclui animação Draw.
- **Mapa importado:** `assets/models/realistic_forest.glb` é uma cena realista do Sketchfab, ampliada para cerca de 150 m e posicionada junto à área inicial. A vegetação procedural antiga foi desativada para o cenário importado aparecer claramente; o restante do mapa fica aberto para movimentação e para o segundo personagem.
- **Créditos/licenças:** consulte [`assets/models/ATTRIBUTION.md`](assets/models/ATTRIBUTION.md).
- **Gerador opcional:** `python3 tools/build_knight.py` gera uma versão procedural separada em
  `assets/models/knight-procedural.glb`; não sobrescreve o cavaleiro do Sketchfab.

## Rodar offline (opcional)

Baixe `three.module.js` e a pasta `examples/jsm` do pacote `three@0.160.0` (por exemplo `npm pack three@0.160.0`),
coloque em `vendor/three/` e troque o `importmap` do `index.html`:

```json
{ "imports": { "three": "./vendor/three/build/three.module.js",
               "three/addons/": "./vendor/three/examples/jsm/" } }
```

## Problemas comuns

- **Tela de carregamento parada / erro vermelho:** abriu com duplo clique (`file://`) ou está sem internet
  para o CDN. Use o `start.bat`/`start.sh`.
- **Porta 8080 ocupada:** `PORT=9000 npm start` ou `PORT=9000 ./start.sh` (ou mude no `start.bat`).
- **Pouco FPS:** use `?quality=low` ou reduza `forest.trees`/`forest.grass` em `config.js`.

Three.js © mrdoob e colaboradores, licença MIT.
