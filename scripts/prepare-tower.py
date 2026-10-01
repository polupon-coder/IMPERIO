"""Ficha del Torreón a partir de la ilustración del autor (art/torreon.webp).

Uso: python3 scripts/prepare-tower.py
Salida: public/assets/fichas/<color>/torreon.webp (fondo de acuarela suave del color del jugador,
igual que las tropas) y public/assets/ui/torreon.webp (sobre papel, para paneles).
"""
import os
import numpy as np
from PIL import Image
from scipy import ndimage

COLORS = {'rojo': (179, 54, 47), 'azul': (47, 93, 155), 'amarillo': (209, 161, 42), 'verde': (63, 125, 58)}
PAPER = np.array([244, 235, 220], float)
MIX = 0.45
S = 256

src = Image.open('art/torreon.webp').convert('RGB')
a0 = np.array(src).astype(float)
mx = a0.max(2); mn = a0.min(2); sat = (mx - mn) / np.maximum(mx, 1)
paper = (mx > 175) & (sat < 0.16)
lab, _ = ndimage.label(paper)
border = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))) - {0}
bg = ndimage.binary_opening(np.isin(lab, list(border)), iterations=2)
fig = ~bg
# Solo la mancha principal (torre, arbustos y suelo); fuera las motas del papel
flab, n = ndimage.label(fig)
sizes = ndimage.sum(fig, flab, range(1, n + 1))
keep = [int(np.argmax(sizes)) + 1]
fig = ndimage.binary_fill_holes(np.isin(flab, keep))
ys, xs = np.where(fig)
# Recorte cuadrado centrado en la figura con un pequeño margen
cy, cx = (ys.min() + ys.max()) / 2, (xs.min() + xs.max()) / 2
half = max(ys.max() - ys.min(), xs.max() - xs.min()) / 2 * 1.12
box = (int(cx - half), int(cy - half), int(cx + half), int(cy + half))
img = src.crop(box).resize((S, S), Image.LANCZOS)
mask = Image.fromarray((fig * 255).astype(np.uint8)).crop(box).resize((S, S), Image.LANCZOS)
a = np.array(img).astype(float)
m = ndimage.gaussian_filter(np.array(mask).astype(float) / 255, 1.0)[..., None]

os.makedirs('public/assets/ui', exist_ok=True)
Image.fromarray(np.clip(a * m + PAPER * (1 - m), 0, 255).astype(np.uint8)).save('public/assets/ui/torreon.webp', quality=88)
for color, rgb in COLORS.items():
    rng = np.random.default_rng(sum(rgb) + 7)
    base = np.array(rgb, float) * MIX + PAPER * (1 - MIX)
    wash = ndimage.gaussian_filter(rng.normal(size=(S, S)), 7)[..., None]
    wash = wash / (np.abs(wash).max() + 1e-6) * 14
    out = a * m + np.clip(base + wash, 0, 255) * (1 - m)
    os.makedirs(f'public/assets/fichas/{color}', exist_ok=True)
    Image.fromarray(np.clip(out, 0, 255).astype(np.uint8)).save(f'public/assets/fichas/{color}/torreon.webp', quality=88)
print('ok', box)
