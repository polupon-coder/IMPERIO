"""Fichas del Torreón y de la Muralla con el fondo de acuarela suave de cada jugador.

Uso: python3 scripts/prepare-tower.py
Entradas: art/torreon.webp (ilustración del autor) y public/assets/ui/muralla.webp
Salidas:  public/assets/fichas/<color>/torreon.webp, public/assets/fichas/<color>/muralla.webp
          y public/assets/ui/torreon.webp (sobre papel, para el panel).
"""
import os
import numpy as np
from PIL import Image
from scipy import ndimage

COLORS = {'rojo': (179, 54, 47), 'azul': (47, 93, 155), 'amarillo': (209, 161, 42), 'verde': (63, 125, 58)}
PAPER = np.array([244, 235, 220], float)
MIX = 0.45
S = 256


def figure(src_path, crop):
    """Figura sobre papel → (imagen S×S, máscara suave de la figura)."""
    src = Image.open(src_path).convert('RGB')
    a0 = np.array(src).astype(float)
    mx = a0.max(2)
    mn = a0.min(2)
    sat = (mx - mn) / np.maximum(mx, 1)
    paper = (mx > 175) & (sat < 0.16)
    lab, _ = ndimage.label(paper)
    border = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))) - {0}
    fig = ~ndimage.binary_opening(np.isin(lab, list(border)), iterations=2)
    # Solo la mancha principal (figura, arbustos y suelo); fuera las motas del papel
    flab, n = ndimage.label(fig)
    sizes = ndimage.sum(fig, flab, range(1, n + 1))
    fig = ndimage.binary_fill_holes(flab == int(np.argmax(sizes)) + 1)
    if crop:
        ys, xs = np.where(fig)
        cy, cx = (ys.min() + ys.max()) / 2, (xs.min() + xs.max()) / 2
        half = max(ys.max() - ys.min(), xs.max() - xs.min()) / 2 * 1.12
        box = (int(cx - half), int(cy - half), int(cx + half), int(cy + half))
    else:
        box = (0, 0, src.width, src.height)
    img = src.crop(box).resize((S, S), Image.LANCZOS)
    mask = Image.fromarray((fig * 255).astype(np.uint8)).crop(box).resize((S, S), Image.LANCZOS)
    return np.array(img).astype(float), ndimage.gaussian_filter(np.array(mask).astype(float) / 255, 1.0)[..., None]


def ground(a, m):
    """Suelo pintado bajo la figura: la franja inferior de la mancha (bajo la base), en tonos
    claros; no tiñe la piedra ni la hierba."""
    H, W = a.shape[:2]
    mx = a.max(2)
    sat = (mx - a.min(2)) / np.maximum(mx, 1)
    r, g = a[..., 0], a[..., 1]
    light = (mx > 150) & (sat < 0.6) & (r >= g)
    inside = m[..., 0] > 0.5
    gm = np.zeros((H, W), bool)
    band = int(H * 0.07)
    for x in range(W):
        ys = np.where(inside[:, x])[0]
        if not len(ys):
            continue
        bottom = ys.max()
        gm[max(bottom - band, int(H * 0.55)) : bottom + 1, x] = True
    gm &= light & inside
    return ndimage.gaussian_filter(gm.astype(float), 1.5)[..., None]


def tinted(a, m, rgb, seed):
    rng = np.random.default_rng(seed)
    base = np.array(rgb, float) * MIX + PAPER * (1 - MIX)
    # El suelo se tiñe del color suave conservando su textura
    gm = ground(a, m)
    lum = a.mean(2, keepdims=True) / PAPER.mean()
    a = a * (1 - gm) + np.clip(base * (0.45 + 0.55 * lum), 0, 255) * gm
    wash = ndimage.gaussian_filter(rng.normal(size=(S, S)), 7)[..., None]
    wash = wash / (np.abs(wash).max() + 1e-6) * 14
    return np.clip(a * m + np.clip(base + wash, 0, 255) * (1 - m), 0, 255).astype(np.uint8)


tower, tmask = figure('art/torreon.webp', crop=True)
os.makedirs('public/assets/ui', exist_ok=True)
Image.fromarray(np.clip(tower * tmask + PAPER * (1 - tmask), 0, 255).astype(np.uint8)).save('public/assets/ui/torreon.webp', quality=88)
wall, wmask = figure('public/assets/ui/muralla.webp', crop=False)
for color, rgb in COLORS.items():
    os.makedirs(f'public/assets/fichas/{color}', exist_ok=True)
    Image.fromarray(tinted(tower, tmask, rgb, sum(rgb) + 7)).save(f'public/assets/fichas/{color}/torreon.webp', quality=88)
    Image.fromarray(tinted(wall, wmask, rgb, sum(rgb) + 11)).save(f'public/assets/fichas/{color}/muralla.webp', quality=88)
print('ok')
