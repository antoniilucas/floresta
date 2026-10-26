# Modelos 3D

- `knight.glb` — cavaleiro detalhado do Sketchfab com animações de andar, correr e ataque.
- `realistic_forest.glb` — cena de floresta realista do Sketchfab, importada como uma área do mapa.
- `ATTRIBUTION.md` — autores, links de origem e licenças dos dois assets.

O restante do mapa (terreno, árvores, pedras, troncos, grama e flores) é gerado por código.

O cavaleiro atual pode ser substituído por outro GLB ajustando `CONFIG.model.knight` e
`CONFIG.model.knightScale` em `src/config.js`. O carregador reconhece nomes comuns de clipes
como `Idle`, `Walk`, `Slash` e `Attack`.
