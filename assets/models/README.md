# Modelos 3D

- `knight.glb` — cavaleiro detalhado do Sketchfab com animações de andar, correr e ataque.
- `realistic_forest.glb` — vegetação de floresta realista do Sketchfab, usada no mapa da cena.
- `Wizard.glb` — modelo do mago usado como segundo jogador, controlado pelas setas.
- `ATTRIBUTION.md` — autores, links de origem e licenças dos modelos.

O cavaleiro atual pode ser substituído por outro GLB ajustando `CONFIG.model.knight` e
`CONFIG.model.knightScale` em `src/config.js`. O carregador reconhece nomes comuns de clipes
como `Idle`, `Walk`, `Slash` e `Attack`.
