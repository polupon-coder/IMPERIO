"""Quita el doble filete del marco del pergamino del autor.

Uso: python3 scripts/clean-parchment.py
Entrada: art/pergamino-transparente.webp (el pergamino del autor ya recortado) · Salida: public/assets/ui/pergamino.webp
Cada línea se sustituye por una franja de papel vecina (desplazada hacia dentro),
con los bordes fundidos para que no se note el parche.
"""
import numpy as np
from PIL import Image

im = np.array(Image.open('art/pergamino-transparente.webp').convert('RGBA')).astype(float)
out = im.copy()
H, W = im.shape[:2]

COLS = [(47, 61, +16), (1383, 1397, -16)]   # (desde, hasta, desplazamiento de la franja fuente)
ROWS = [(64, 78, +16), (995, 1009, -16)]
Y0, Y1 = 60, 1014   # extensión de las líneas verticales
X0, X1 = 44, 1400   # extensión de las líneas horizontales


def ramp(n):
    r = np.ones(n)
    k = 3
    r[:k] = np.linspace(0.2, 1, k)
    r[-k:] = np.linspace(1, 0.2, k)
    return r


for a, b, d in COLS:
    w = ramp(b - a)[None, :, None]
    src = im[Y0:Y1, a + d:b + d, :3]
    out[Y0:Y1, a:b, :3] = out[Y0:Y1, a:b, :3] * (1 - w) + src * w
for a, b, d in ROWS:
    w = ramp(b - a)[:, None, None]
    src = out[a + d:b + d, X0:X1, :3].copy()
    out[a:b, X0:X1, :3] = out[a:b, X0:X1, :3] * (1 - w) + src * w

Image.fromarray(np.clip(out, 0, 255).astype(np.uint8)).save('public/assets/ui/pergamino.webp', quality=90)
