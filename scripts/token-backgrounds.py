"""Fichas con fondo de acuarela suave del color de cada jugador.

Uso: python3 scripts/token-backgrounds.py
Entrada: public/assets/units/<color>/<tipo>.webp (figura sobre papel)
Salida:  public/assets/fichas/<color>/<tipo>.webp
El papel que rodea la figura se sustituye por el color del jugador mezclado con papel.
Además del papel conectado con el borde, se tratan como fondo los huecos grandes y claros
encerrados por la figura (por ejemplo, entre el arco y la cuerda del Arquero).
"""
import os
import numpy as np
from PIL import Image
from scipy import ndimage

COLORS = {'rojo': (179, 54, 47), 'azul': (47, 93, 155), 'amarillo': (209, 161, 42), 'verde': (63, 125, 58)}
TYPES = ['infanteria', 'arquero', 'lancero', 'caballeria', 'artilleria']
PAPER = np.array([244, 235, 220], float)
MIX = 0.45  # proporción de color del jugador


def background_mask(a):
    mx = a.max(2)
    mn = a.min(2)
    sat = (mx - mn) / np.maximum(mx, 1)
    paper = (mx > 185) & (sat < 0.22)
    lab, n = ndimage.label(paper)
    border = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))) - {0}
    sizes = ndimage.sum(np.ones_like(lab), lab, range(n + 1))
    big_holes = {i for i in range(1, n + 1) if sizes[i] > a.shape[0] * a.shape[1] * 0.004}
    bg = np.isin(lab, list(border | big_holes))
    bg = ndimage.binary_opening(bg, iterations=1)
    return ndimage.gaussian_filter((~bg).astype(float), 1.0)


for color, rgb in COLORS.items():
    os.makedirs(f'public/assets/fichas/{color}', exist_ok=True)
    rng = np.random.default_rng(sum(rgb))
    for t in TYPES:
        im = Image.open(f'public/assets/units/{color}/{t}.webp').convert('RGB')
        a = np.array(im).astype(float)
        h, w = a.shape[:2]
        m = background_mask(a)[..., None]
        base = np.array(rgb, float) * MIX + PAPER * (1 - MIX)
        wash = ndimage.gaussian_filter(rng.normal(size=(h, w)), 7)[..., None]
        wash = wash / (np.abs(wash).max() + 1e-6) * 14  # textura de acuarela sutil
        bg = np.clip(base + wash, 0, 255)
        out = a * m + bg * (1 - m)
        Image.fromarray(np.clip(out, 0, 255).astype(np.uint8)).save(f'public/assets/fichas/{color}/{t}.webp', quality=88)
print('ok')
