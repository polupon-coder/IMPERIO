"""Sustituye la alabarda de la Infantería por la espada del jinete (ambas de la ilustración del autor).

Uso: python3 scripts/edit-infantry-sword.py
Entrada: art/tropas-rojo.webp  ·  Salida: art/tropas-rojo-editado.webp
Después: python3 scripts/recolor-units.py art/tropas-rojo-editado.webp
"""
import math
import numpy as np
from PIL import Image

src = Image.open('art/tropas-rojo.webp').convert('RGB')
a = np.asarray(src).astype(float)
out = a.copy()
paper_patch = a[500:760, 640:720]  # papel limpio entre el arquero y el cañón


def fill_paper(x0, x1, y0, y1):
    out[y0:y1, x0:x1] = paper_patch[: y1 - y0, : x1 - x0]


# 1) Cabeza de la alabarda y asta por encima de la mano: solo hay papel alrededor.
fill_paper(508, 582, 476, 598)
fill_paper(527, 550, 596, 666)


# 2) Asta por debajo de la mano: se reconstruye interpolando cada fila entre ambos lados del asta.
def shaft_x(y):  # el asta baja ligeramente inclinada hacia la izquierda
    return 537 + (527 - 537) * (y - 600) / (850 - 600)


for y in range(694, 866):
    cx = shaft_x(y)
    l, r = int(round(cx - 8)), int(round(cx + (13 if y > 800 else 8)))
    for x in range(l + 1, r):
        t = (x - l) / (r - l)
        out[y, x] = out[y, l] * (1 - t) + out[y, r] * t

# 3) Espada del jinete: se endereza y se recorta la hoja con la guarda.
G = (1150, 151)  # centro de la guarda en la ilustración
tip = (1246, 39)
angle = math.degrees(math.atan2(tip[0] - G[0], G[1] - tip[1]))
rot = np.asarray(src.rotate(angle, center=G, resample=Image.BICUBIC, fillcolor=(244, 235, 220))).astype(float)
x0, x1, y0, y1 = G[0] - 17, G[0] + 17, max(0, G[1] - 152), G[1] + 10
sword = rot[y0:y1, x0:x1]
paper = np.array([244.0, 235.0, 220.0])
d = np.sqrt(((sword - paper) ** 2).sum(-1))
mx, mn = sword.max(-1), sword.min(-1)
sat = (mx - mn) / np.maximum(mx, 1)
alpha = np.clip((d - 18) / 30, 0, 1) * np.clip((0.42 - sat) / 0.12, 0, 1)  # gris/acero, sin la mano

# Colocación: vertical con una ligera inclinación, con la guarda justo encima del puño.
tilt = 6
sw = Image.fromarray(np.dstack([sword, alpha * 255]).astype(np.uint8), 'RGBA').rotate(-tilt, expand=True, resample=Image.BICUBIC)
base = Image.fromarray(np.clip(out, 0, 255).astype(np.uint8)).convert('RGBA')
fist_x, fist_top = 538, 671
base.alpha_composite(sw, (fist_x - sw.width // 2 + 2, fist_top - sw.height + 4))
base.convert('RGB').save('art/tropas-rojo-editado.webp', quality=95)
