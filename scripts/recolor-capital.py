"""Genera la loseta de Capital de cada jugador tiñendo los tejados con su color.

Uso: python3 scripts/recolor-capital.py [vista_previa.png]
Entrada: public/assets/tiles/capital.webp (ilustración original)
Salida: public/assets/tiles/capital-{rojo,azul,amarillo,verde}.webp
"""
import sys
import numpy as np
from PIL import Image, ImageFilter

TARGET = {  # tono, saturación mínima, factor de brillo
    'rojo': (358, 0.78, 0.9),
    'azul': (215, 0.72, 0.85),
    'amarillo': (45, 0.85, 1.05),
    'verde': (115, 0.68, 0.8),
}


def hsv(a):
    rgb = a[..., :3] / 255
    mx, mn = rgb.max(-1), rgb.min(-1)
    df = mx - mn
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    h = np.zeros_like(mx)
    m = df > 1e-6
    rm = m & (mx == r)
    gm = m & (mx == g) & ~rm
    bm = m & ~rm & ~gm
    h[rm] = ((g - b)[rm] / df[rm]) % 6
    h[gm] = (b - r)[gm] / df[gm] + 2
    h[bm] = (r - g)[bm] / df[bm] + 4
    return h * 60, np.where(mx > 0, df / np.maximum(mx, 1e-6), 0), mx


def rgb(h, s, v):
    c = v * s
    x = c * (1 - np.abs((h / 60) % 2 - 1))
    m = v - c
    z = np.zeros_like(h)
    i = (h // 60).astype(int) % 6
    sel = lambda *vals: np.select([i == k for k in range(6)], vals)
    return np.dstack([sel(c, x, z, z, x, c) + m, sel(x, c, c, x, z, z) + m, sel(z, z, x, c, c, x) + m]) * 255


base = np.asarray(Image.open('public/assets/tiles/capital.webp').convert('RGB')).astype(float)
h, s, v = hsv(base)
hh = np.where(h > 180, h - 360, h)
# Tejados de terracota: tono rojizo-anaranjado y saturación media-alta. Los muros de piedra son poco saturados.
w = np.clip((30 - hh) / 6, 0, 1) * np.clip((hh + 20) / 6, 0, 1) * np.clip((s - 0.30) / 0.14, 0, 1) * np.clip((v - 0.30) / 0.1, 0, 1)
w = np.asarray(Image.fromarray((w * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(0.8))) / 255

tiles = []
for color, (th, ts, tv) in TARGET.items():  # ts: saturación mínima
    new = rgb((th + hh * 0.3) % 360, np.clip(np.maximum(s * 1.2, ts), 0, 1), np.clip(v * tv, 0, 1))
    out = base * (1 - w[..., None]) + new * w[..., None]
    im = Image.fromarray(np.clip(out, 0, 255).astype(np.uint8))
    im.save(f'public/assets/tiles/capital-{color}.webp', quality=88)
    tiles.append(im)

if len(sys.argv) > 1:
    prev = Image.new('RGB', (512 * 4, 512))
    for i, t in enumerate(tiles):
        prev.paste(t, (i * 512, 0))
    prev.resize((1024, 256)).save(sys.argv[1])
