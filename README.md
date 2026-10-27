# 🛡️ Floresta do Cavaleiro — Three.js

Cena 3D interativa: um cavaleiro animado explora o mapa de floresta importado em GLB
(150 × 150 m), com câmera em terceira pessoa, sombras suaves e céu com nuvens.

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

PC fraco ou celular? Abra com **`http://localhost:8080/?quality=low`** (sombras menores e
sem pixel-ratio alto).

## Controles

| Tecla | Ação |
|---|---|
| **W A S D** | jogador 1 (cavaleiro): mover |
| **Setas** | jogador 2 (mago): mover |
| **E** | cavaleiro: alternar a postura de combate |
| **Espaço** ou **F** | cavaleiro: ataque com a espada (*Sword Attack*) |
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
│   │   ├── Terrain.js      # terreno procedural legado (não usado na cena atual)
│   │   ├── Forest.js       # vegetação procedural legada (não usada na cena atual)
│   │   ├── Sky.js          # céu em gradiente, sol e nuvens
│   │   ├── Lighting.js     # ambiente + hemisférica + sol com sombras que seguem o jogador
│   │   └── noise.js        # ruído e RNG com semente (mapa sempre igual)
│   ├── entities/
│   │   ├── Knight.js       # cavaleiro GLB + animações e máquina de estados
│   └── Wizard.js       # segundo personagem GLB
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

- **150 m de largura**, usando somente `realistic_forest.glb`. O terreno é alinhado a partir das superfícies incluídas no próprio GLB; não é criado um segundo cenário procedural.
- O cavaleiro e o mago começam juntos no mapa. O cavaleiro é controlado com WASD e o mago com as setas.
- A câmera compartilhada enquadra o ponto médio entre os jogadores.

Mude escala do mapa, cores do céu e velocidade em **`src/config.js`**.
## Adicionando o 2º personagem

O ponto de nascimento do mago já existe em `CONFIG.spawns.second`; ele é criado junto com o cavaleiro
e controlado pelas setas. No código, o cavaleiro pode ser criado novamente com:

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
- **Mapa:** `assets/models/realistic_forest.glb` fornece a floresta e as superfícies do chão. A cena posiciona os jogadores sobre essas superfícies e não adiciona um mapa procedural separado.
- **Mago:** `assets/models/Wizard.glb` contém atualmente apenas um clipe (`Take 001`). Para ter idle,
  walk e attack distintos no segundo personagem, o GLB precisa ser exportado novamente com os três clipes.
  Enquanto isso, o mago pode se mover pelas setas e reutiliza esse clipe único.
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
- **Pouco FPS:** use `?quality=low` para reduzir o custo das sombras e do pixel-ratio.

Three.js © mrdoob e colaboradores, licença MIT.
