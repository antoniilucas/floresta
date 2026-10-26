#!/usr/bin/env python3
"""
Gerador do modelo `assets/models/knight.glb`.

Cria um cavaleiro low poly (hierarquia de nós, sem skin) com 6 animações:
  Idle, IdleSword, Walk, WalkSword, Draw (desembainhar), Slash (ataque).

Uso:
    python3 tools/build_knight.py                # grava assets/models/knight-procedural.glb
    python3 tools/build_knight.py saida.glb      # grava em outro caminho

Só usa a biblioteca padrão do Python. Para trocar o cavaleiro por um modelo
seu (Mixamo, Blender...), basta substituir o .glb e ajustar os nomes dos clipes
em `src/entities/Knight.js` (constante CLIPS).
"""
import json
import math
import os
import struct
import sys

# --------------------------------------------------------------------------
# Matemática básica
# --------------------------------------------------------------------------


def qmul(a, b):
    ax, ay, az, aw = a
    bx, by, bz, bw = b
    return (
        aw * bx + ax * bw + ay * bz - az * by,
        aw * by - ax * bz + ay * bw + az * bx,
        aw * bz + ax * by - ay * bx + az * bw,
        aw * bw - ax * bx - ay * by - az * bz,
    )


def qaxis(axis, ang):
    s, c = math.sin(ang / 2), math.cos(ang / 2)
    return (axis[0] * s, axis[1] * s, axis[2] * s, c)


def qeuler(x, y, z):
    """Ry * Rx * Rz (Z aplicado primeiro, depois X, depois Y)."""
    return qmul(qmul(qaxis((0, 1, 0), y), qaxis((1, 0, 0), x)), qaxis((0, 0, 1), z))


def sub(a, b):
    return (a[0] - b[0], a[1] - b[1], a[2] - b[2])


def cross(a, b):
    return (a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0])


def dot(a, b):
    return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]


def norm(v):
    l = math.sqrt(dot(v, v))
    return (v[0] / l, v[1] / l, v[2] / l) if l > 1e-12 else (0.0, 0.0, 0.0)


# --------------------------------------------------------------------------
# Geometria: caixa com afunilamento (taper) opcional
# --------------------------------------------------------------------------

FACES = [
    [(1, -1, -1), (1, 1, -1), (1, 1, 1), (1, -1, 1)],
    [(-1, -1, 1), (-1, 1, 1), (-1, 1, -1), (-1, -1, -1)],
    [(-1, 1, -1), (-1, 1, 1), (1, 1, 1), (1, 1, -1)],
    [(-1, -1, 1), (-1, -1, -1), (1, -1, -1), (1, -1, 1)],
    [(-1, -1, 1), (1, -1, 1), (1, 1, 1), (-1, 1, 1)],
    [(1, -1, -1), (-1, -1, -1), (-1, 1, -1), (1, 1, -1)],
]


def box(size, center=(0, 0, 0), top=(1, 1), bottom=(1, 1)):
    """Retorna (posições, normais, índices) de uma caixa; normais planas."""
    if isinstance(top, (int, float)):
        top = (top, top)
    if isinstance(bottom, (int, float)):
        bottom = (bottom, bottom)
    hx, hy, hz = size[0] / 2, size[1] / 2, size[2] / 2
    cx, cy, cz = center

    def vert(s):
        k = top if s[1] > 0 else bottom
        return (cx + s[0] * hx * k[0], cy + s[1] * hy, cz + s[2] * hz * k[1])

    pos, nor, idx = [], [], []
    for face in FACES:
        vs = [vert(s) for s in face]
        # normal por Newell (robusto a quads degenerados)
        n = [0.0, 0.0, 0.0]
        for i in range(4):
            a, b = vs[i], vs[(i + 1) % 4]
            n[0] += (a[1] - b[1]) * (a[2] + b[2])
            n[1] += (a[2] - b[2]) * (a[0] + b[0])
            n[2] += (a[0] - b[0]) * (a[1] + b[1])
        n = norm(tuple(n))
        if n == (0.0, 0.0, 0.0):
            continue
        centroid = tuple(sum(v[i] for v in vs) / 4 for i in range(3))
        if dot(n, sub(centroid, center)) < 0:
            vs.reverse()
            n = (-n[0], -n[1], -n[2])
        base = len(pos)
        pos.extend(vs)
        nor.extend([n] * 4)
        for tri in ((0, 1, 2), (0, 2, 3)):
            a, b, c = (vs[t] for t in tri)
            if dot(cross(sub(b, a), sub(c, a)), cross(sub(b, a), sub(c, a))) > 1e-14:
                idx.extend(base + t for t in tri)
    return pos, nor, idx


# --------------------------------------------------------------------------
# Materiais (cores em sRGB -> linear)
# --------------------------------------------------------------------------


def lin(hexstr):
    h = hexstr.lstrip("#")
    r, g, b = (int(h[i:i + 2], 16) / 255 for i in (0, 2, 4))
    f = lambda c: c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4
    return [round(f(r), 4), round(f(g), 4), round(f(b), 4), 1.0]


MATERIALS = {
    "steel": (lin("#aab4c2"), 0.25, 0.55),
    "steel_dark": (lin("#5f6874"), 0.25, 0.6),
    "gold": (lin("#d9a634"), 0.3, 0.45),
    "cloth": (lin("#2b3f7a"), 0.0, 0.9),
    "red": (lin("#b3202a"), 0.0, 0.85),
    "leather": (lin("#5a3a22"), 0.0, 0.9),
    "blade": (lin("#e6edf5"), 0.35, 0.3),
    "visor": (lin("#0e0f14"), 0.0, 0.8),
    "shield": (lin("#2a5cc4"), 0.1, 0.6),
}
MAT_NAMES = list(MATERIALS.keys())

# --------------------------------------------------------------------------
# Hierarquia do cavaleiro (frente = +Z, esquerda do personagem = +X, altura ~1,95 m)
# --------------------------------------------------------------------------


def N(name, t=(0, 0, 0), r=(0, 0, 0), parts=None, children=None):
    return {"name": name, "t": t, "r": r, "parts": parts or [], "children": children or []}


def arm(side):
    """side = +1 (esquerdo/escudo) ou -1 (direito/espada)."""
    s = side
    suf = "L" if s > 0 else "R"
    hand_children = []
    if s < 0:
        sword_parts = [
            (box((0.045, 0.18, 0.045), (0, 0, 0)), "leather"),
            (box((0.26, 0.045, 0.07), (0, 0.11, 0)), "gold"),
            (box((0.07, 0.07, 0.07), (0, -0.11, 0)), "gold"),
            (box((0.075, 0.82, 0.018), (0, 0.55, 0)), "blade"),
            (box((0.075, 0.14, 0.018), (0, 1.03, 0), top=(0.05, 0.6)), "blade"),
        ]
        hand_children.append(
            N("Sword_Hand", (0, -0.02, 0.0), (math.radians(100), 0, 0), sword_parts))
    forearm_parts = [
        (box((0.14, 0.27, 0.14), (0, -0.135, 0)), "steel"),
        (box((0.16, 0.06, 0.16), (0, -0.03, 0)), "gold"),
        (box((0.12, 0.1, 0.12), (0, -0.30, 0)), "steel_dark"),  # luva
    ]
    if s > 0:
        forearm_parts += [
            (box((0.05, 0.5, 0.36), (0.11, -0.12, 0.08), bottom=(1, 0.55)), "shield"),
            (box((0.06, 0.4, 0.04), (0.115, -0.12, 0.08)), "gold"),
            (box((0.062, 0.04, 0.26), (0.115, -0.10, 0.08)), "gold"),
        ]
    elbow = N("Elbow" + suf, (0, -0.30, 0), parts=forearm_parts,
              children=[N("Hand" + suf, (0, -0.30, 0), children=hand_children)])
    shoulder = N("Shoulder" + suf, (s * 0.33, 0.50, 0), parts=[
        (box((0.22, 0.13, 0.24), (s * 0.03, 0.03, 0), top=(0.8, 0.9)), "steel"),
        (box((0.14, 0.32, 0.14), (0, -0.16, 0)), "cloth"),
    ], children=[elbow])
    return shoulder


def leg(side):
    s = side
    suf = "L" if s > 0 else "R"
    foot = N("Foot" + suf, (0, -0.40, 0), parts=[
        (box((0.15, 0.14, 0.27), (0, 0.0, 0.055)), "leather"),
        (box((0.14, 0.05, 0.1), (0, 0.065, 0.12)), "steel_dark"),
    ])
    knee = N("Knee" + suf, (0, -0.42, 0), parts=[
        (box((0.14, 0.38, 0.15), (0, -0.19, 0)), "steel_dark"),
        (box((0.17, 0.09, 0.19), (0, 0.0, 0.02)), "steel"),
    ], children=[foot])
    return N("Thigh" + suf, (s * 0.11, -0.08, 0), parts=[
        (box((0.17, 0.42, 0.19), (0, -0.21, 0)), "cloth"),
    ], children=[knee])


def build_tree():
    head = N("Head", (0, 0.55, 0), parts=[
        (box((0.12, 0.08, 0.12), (0, 0.04, 0)), "steel_dark"),
        (box((0.27, 0.30, 0.30), (0, 0.20, 0)), "steel"),
        (box((0.22, 0.045, 0.02), (0, 0.22, 0.155)), "visor"),
        (box((0.03, 0.12, 0.02), (0, 0.15, 0.155)), "visor"),
        (box((0.06, 0.05, 0.32), (0, 0.375, -0.02), top=(1, 1)), "steel_dark"),
        (box((0.05, 0.16, 0.30), (0, 0.46, -0.07), bottom=(1, 0.5)), "red"),
    ])
    cape = N("Cape", (0, 0.48, -0.155), parts=[
        (box((0.44, 0.85, 0.03), (0, -0.425, -0.01), bottom=(1.15, 1)), "red"),
    ])
    torso = N("Torso", (0, 0.10, 0), parts=[
        (box((0.50, 0.56, 0.28), (0, 0.28, 0), bottom=(0.82, 0.9)), "steel"),
        (box((0.30, 0.34, 0.03), (0, 0.30, 0.15)), "cloth"),
        (box((0.06, 0.34, 0.035), (0, 0.30, 0.155)), "gold"),
        (box((0.54, 0.05, 0.30), (0, 0.02, 0)), "leather"),
        (box((0.20, 0.35, 0.05), (0, 0.30, -0.15)), "steel_dark"),
    ], children=[head, cape, arm(+1), arm(-1)])
    sheath = N("Sword_Sheathed", (0.23, 0.02, -0.02), (math.radians(14), 0, math.radians(-4)), [
        (box((0.045, 0.16, 0.045), (0, 0.08, 0)), "leather"),
        (box((0.20, 0.04, 0.07), (0, 0.0, 0)), "gold"),
        (box((0.075, 0.80, 0.045), (0, -0.40, 0), bottom=(0.6, 0.8)), "leather"),
        (box((0.085, 0.05, 0.055), (0, -0.05, 0)), "gold"),
    ])
    hips = N("Hips", (0, 0.97, 0), parts=[
        (box((0.40, 0.20, 0.25), (0, 0.0, 0)), "cloth"),
        (box((0.44, 0.06, 0.28), (0, 0.09, 0)), "leather"),
        (box((0.30, 0.34, 0.02), (0, -0.20, 0.13), bottom=(0.7, 1)), "cloth"),  # saiote frontal
    ], children=[torso, sheath, leg(+1), leg(-1)])
    return N("Knight", children=[hips])


# --------------------------------------------------------------------------
# Animações
# --------------------------------------------------------------------------

ANIMATED = ["Hips", "Torso", "Head", "Cape", "ShoulderL", "ElbowL", "ShoulderR", "ElbowR",
            "ThighL", "KneeL", "ThighR", "KneeR", "FootL", "FootR"]
HIPS_Y = 0.97


def pose(**kw):
    """Valores ausentes = 0. HipsT = (x, y, z) posição absoluta do quadril."""
    p = {j: (0.0, 0.0, 0.0) for j in ANIMATED}
    p["HipsT"] = (0.0, HIPS_Y, 0.0)
    for k, v in kw.items():
        p[k] = tuple(float(x) for x in v)
    # pé sempre "plano" (compensa coxa + joelho) se não foi definido
    if "FootL" not in kw:
        p["FootL"] = (-(p["ThighL"][0] + p["KneeL"][0]) * 0.9, 0.0, 0.0)
    if "FootR" not in kw:
        p["FootR"] = (-(p["ThighR"][0] + p["KneeR"][0]) * 0.9, 0.0, 0.0)
    return p


# Poses-base reutilizadas
READY_ARMS = dict(
    ShoulderR=(-0.55, 0, -0.10), ElbowR=(-0.95, 0, 0),
    ShoulderL=(-0.30, 0, 0.18), ElbowL=(-0.95, 0, 0),
)
READY_LEGS = dict(ThighL=(-0.28, 0, 0), KneeL=(0.22, 0, 0), ThighR=(0.22, 0, 0), KneeR=(0.30, 0, 0))
RELAXED_ARMS = dict(ShoulderL=(0, 0, 0.07), ShoulderR=(0, 0, -0.07),
                    ElbowL=(-0.18, 0, 0), ElbowR=(-0.18, 0, 0))


def ready_pose(**extra):
    d = dict(READY_ARMS)
    d.update(READY_LEGS)
    d.update(Torso=(0.03, -0.18, 0), Head=(0, 0.1, 0), HipsT=(0, 0.935, 0), Hips=(0, 0.12, 0))
    d.update(extra)
    return pose(**d)


def relaxed_pose(**extra):
    d = dict(RELAXED_ARMS)
    d.update(extra)
    return pose(**d)


def build_clips():
    clips = {}

    # ---- Idle (sem espada) -------------------------------------------------
    clips["Idle"] = (2.4, [
        (0.0, relaxed_pose()),
        (1.2, relaxed_pose(HipsT=(0, 0.962, 0), Torso=(0.025, 0, 0), Head=(-0.03, 0.04, 0),
                           ShoulderL=(0, 0, 0.1), ShoulderR=(0, 0, -0.1), Cape=(0.04, 0, 0))),
        (2.4, relaxed_pose()),
    ])

    # ---- IdleSword (postura de combate) -----------------------------------
    r0 = ready_pose()
    r1 = ready_pose(HipsT=(0, 0.915, 0), Torso=(0.06, -0.2, 0), Head=(-0.03, 0.1, 0),
                    ElbowR=(-1.0, 0, 0), ShoulderR=(-0.58, 0, -0.1), ShoulderL=(-0.34, 0, 0.18),
                    Cape=(0.05, 0, 0))
    clips["IdleSword"] = (1.8, [(0.0, r0), (0.9, r1), (1.8, r0)])

    # ---- Walk (ciclo de 1 s, 2 passos) -------------------------------------
    A = 0.5
    ts = [0.0, 0.25, 0.5, 0.75, 1.0]
    tl = [-A, 0, A, 0, -A]
    tr = [A, 0, -A, 0, A]
    kl = [0.10, 0.12, 0.25, 1.05, 0.10]
    kr = [0.25, 1.05, 0.10, 0.12, 0.25]
    hy = [0.885, 0.965, 0.885, 0.965, 0.885]
    tw = [0.12, 0, -0.12, 0, 0.12]
    walk, walks = [], []
    for i, t in enumerate(ts):
        base = dict(
            ThighL=(tl[i], 0, 0), KneeL=(kl[i], 0, 0),
            ThighR=(tr[i], 0, 0), KneeR=(kr[i], 0, 0),
            HipsT=(0, hy[i], 0), Hips=(0, tw[i], 0), Torso=(0.07, -tw[i] * 1.2, 0),
            Head=(0, tw[i] * 0.4, 0), Cape=(0.22 + 0.08 * abs(math.sin(i * math.pi / 2)), 0, 0),
        )
        w = dict(base)
        w.update(ShoulderL=(-tl[i] * 0.8, 0, 0.08), ShoulderR=(-tr[i] * 0.8, 0, -0.08),
                 ElbowL=(-0.35, 0, 0), ElbowR=(-0.35, 0, 0))
        walk.append((t, pose(**w)))
        s = dict(base)
        s.update(READY_ARMS)
        s.update(ShoulderL=(-0.34 - tl[i] * 0.2, 0, 0.18),
                 ElbowR=(-0.95 + 0.06 * math.sin(i * math.pi), 0, 0),
                 Torso=(0.1, -0.15 - tw[i] * 1.0, 0))
        walks.append((t, pose(**s)))
    clips["Walk"] = (1.0, walk)
    clips["WalkSword"] = (1.0, walks)

    # ---- Draw (desembainhar) — a espada troca de mão em ~45% do clipe ------
    D = 0.9
    clips["Draw"] = (D, [
        (0.00, relaxed_pose()),
        (0.20 * D, relaxed_pose(ShoulderR=(-0.30, 0, 0.95), ElbowR=(-0.55, 0, 0),
                                Torso=(0.04, 0.28, 0), Head=(0, 0.2, 0), HipsT=(0, 0.95, 0),
                                ShoulderL=(0.25, 0, 0.12), ThighL=(-0.1, 0, 0), KneeL=(0.1, 0, 0))),
        (0.45 * D, relaxed_pose(ShoulderR=(-0.55, 0, 0.75), ElbowR=(-0.95, 0, 0),
                                Torso=(0.05, 0.32, 0), Head=(0, 0.2, 0), HipsT=(0, 0.94, 0),
                                ShoulderL=(0.15, 0, 0.14), ThighL=(-0.18, 0, 0), KneeL=(0.16, 0, 0),
                                ThighR=(0.1, 0, 0), KneeR=(0.15, 0, 0))),
        (0.72 * D, ready_pose(ShoulderR=(-1.05, 0, -0.3), ElbowR=(-1.35, 0, 0),
                              Torso=(0.0, -0.05, 0), HipsT=(0, 0.935, 0),
                              ShoulderL=(-0.22, 0, 0.2), ElbowL=(-0.7, 0, 0))),
        (1.00 * D, ready_pose()),
    ])

    # ---- Slash (ataque) ----------------------------------------------------
    S = 0.85
    clips["Slash"] = (S, [
        (0.00, ready_pose()),
        (0.25 * S, ready_pose(ShoulderR=(-2.5, 0, -0.2), ElbowR=(-1.0, 0, 0),
                              Torso=(-0.14, -0.4, 0), Head=(0.06, 0.2, 0), HipsT=(0, 0.93, 0),
                              Hips=(0, -0.15, 0), ShoulderL=(-0.1, 0, 0.35), ElbowL=(-0.6, 0, 0),
                              ThighL=(-0.3, 0, 0), KneeL=(0.25, 0, 0), ThighR=(0.35, 0, 0),
                              KneeR=(0.3, 0, 0), Cape=(0.35, 0, 0))),
        (0.46 * S, ready_pose(ShoulderR=(-1.0, 0, 0.1), ElbowR=(-0.1, 0, 0),
                              Torso=(0.34, 0.5, 0), Head=(0.1, -0.3, 0), HipsT=(0, 0.86, 0.1),
                              Hips=(0, 0.3, 0), ShoulderL=(0.35, 0, 0.35), ElbowL=(-0.5, 0, 0),
                              ThighL=(-0.62, 0, 0), KneeL=(0.55, 0, 0), ThighR=(0.45, 0, 0),
                              KneeR=(0.4, 0, 0), Cape=(0.1, 0, 0))),
        (0.64 * S, ready_pose(ShoulderR=(-0.75, 0, 0.3), ElbowR=(-0.05, 0, 0),
                              Torso=(0.28, 0.55, 0), Head=(0.08, -0.3, 0), HipsT=(0, 0.87, 0.1),
                              Hips=(0, 0.32, 0), ShoulderL=(0.3, 0, 0.35), ElbowL=(-0.5, 0, 0),
                              ThighL=(-0.6, 0, 0), KneeL=(0.5, 0, 0), ThighR=(0.45, 0, 0),
                              KneeR=(0.4, 0, 0), Cape=(0.2, 0, 0))),
        (1.00 * S, ready_pose()),
    ])
    return clips


# --------------------------------------------------------------------------
# Escrita do GLB
# --------------------------------------------------------------------------


class Glb:
    def __init__(self):
        self.bin = bytearray()
        self.views, self.accessors = [], []

    def _align(self):
        while len(self.bin) % 4:
            self.bin.append(0)

    def accessor(self, values, comp, type_, target=None, minmax=False):
        """values = lista plana; type_ ∈ SCALAR/VEC3/VEC4."""
        n = {"SCALAR": 1, "VEC3": 3, "VEC4": 4}[type_]
        count = len(values) // n
        if comp == 5126:
            data = struct.pack("<%df" % len(values), *values)
        else:
            data = struct.pack("<%dH" % len(values), *values)
        self._align()
        view = {"buffer": 0, "byteOffset": len(self.bin), "byteLength": len(data)}
        if target:
            view["target"] = target
        self.bin += data
        self.views.append(view)
        acc = {"bufferView": len(self.views) - 1, "componentType": comp, "count": count, "type": type_}
        if minmax:
            cols = [values[i::n] for i in range(n)]
            acc["min"] = [min(c) for c in cols]
            acc["max"] = [max(c) for c in cols]
        self.accessors.append(acc)
        return len(self.accessors) - 1


def build_glb(path):
    g = Glb()
    tree = build_tree()
    nodes, meshes, name_to_idx = [], [], {}

    def add_node(n):
        idx = len(nodes)
        entry = {"name": n["name"]}
        nodes.append(entry)
        name_to_idx[n["name"]] = idx
        if any(abs(v) > 1e-9 for v in n["t"]):
            entry["translation"] = [round(v, 5) for v in n["t"]]
        if any(abs(v) > 1e-9 for v in n["r"]):
            entry["rotation"] = [round(v, 6) for v in qeuler(*n["r"])]
        if n["parts"]:
            by_mat = {}
            for (geo, mat) in n["parts"]:
                by_mat.setdefault(mat, []).append(geo)
            prims = []
            for mat, geos in by_mat.items():
                P, Nn, I = [], [], []
                for (p, nn, ii) in geos:
                    off = len(P)
                    P += p
                    Nn += nn
                    I += [i + off for i in ii]
                pos = [c for v in P for c in v]
                nor = [c for v in Nn for c in v]
                prims.append({
                    "attributes": {
                        "POSITION": g.accessor(pos, 5126, "VEC3", 34962, minmax=True),
                        "NORMAL": g.accessor(nor, 5126, "VEC3", 34962),
                    },
                    "indices": g.accessor(I, 5123, "SCALAR", 34963),
                    "material": MAT_NAMES.index(mat),
                })
            meshes.append({"name": n["name"] + "_mesh", "primitives": prims})
            entry["mesh"] = len(meshes) - 1
        kids = [add_node(c) for c in n["children"]]
        if kids:
            entry["children"] = kids
        return idx

    root = add_node(tree)

    # animações
    animations = []
    for cname, (dur, keys) in build_clips().items():
        times = [k[0] for k in keys]
        t_acc = g.accessor(times, 5126, "SCALAR", minmax=True)
        samplers, channels = [], []

        def add_channel(node_name, path, flat):
            o = g.accessor(flat, 5126, "VEC4" if path == "rotation" else "VEC3")
            samplers.append({"input": t_acc, "output": o, "interpolation": "LINEAR"})
            channels.append({"sampler": len(samplers) - 1,
                             "target": {"node": name_to_idx[node_name], "path": path}})

        for joint in ANIMATED:
            prev = None
            flat = []
            for (_, p) in keys:
                q = qeuler(*p[joint])
                if prev is not None and dot(q, prev) < 0:  # mantém o hemisfério
                    q = tuple(-c for c in q)
                prev = q
                flat += list(q)
            add_channel(joint, "rotation", flat)
        add_channel("Hips", "translation", [c for (_, p) in keys for c in p["HipsT"]])
        animations.append({"name": cname, "samplers": samplers, "channels": channels})

    doc = {
        "asset": {"version": "2.0", "generator": "floresta-cavaleiro/tools/build_knight.py"},
        "scene": 0,
        "scenes": [{"name": "Scene", "nodes": [root]}],
        "nodes": nodes,
        "meshes": meshes,
        "materials": [
            {"name": m, "pbrMetallicRoughness": {
                "baseColorFactor": MATERIALS[m][0], "metallicFactor": MATERIALS[m][1],
                "roughnessFactor": MATERIALS[m][2]}} for m in MAT_NAMES],
        "accessors": g.accessors,
        "bufferViews": g.views,
        "buffers": [{"byteLength": len(g.bin)}],
        "animations": animations,
    }
    g._align()
    js = json.dumps(doc, separators=(",", ":")).encode()
    js += b" " * ((4 - len(js) % 4) % 4)
    total = 12 + 8 + len(js) + 8 + len(g.bin)
    os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
    with open(path, "wb") as f:
        f.write(struct.pack("<4sII", b"glTF", 2, total))
        f.write(struct.pack("<I4s", len(js), b"JSON") + js)
        f.write(struct.pack("<I4s", len(g.bin), b"BIN\0") + bytes(g.bin))
    return total


if __name__ == "__main__":
    here = os.path.dirname(os.path.abspath(__file__))
    out = sys.argv[1] if len(sys.argv) > 1 else os.path.join(here, "..", "assets", "models", "knight-procedural.glb")
    size = build_glb(out)
    print("OK  %s  (%.1f KB)" % (os.path.normpath(out), size / 1024))
