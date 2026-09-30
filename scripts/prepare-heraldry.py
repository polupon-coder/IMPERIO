"""Recorta el separador ornamental y los cuatro escudos de armas del autor con fondo transparente.

Uso: python3 scripts/prepare-heraldry.py [vista_previa.png]
Entradas: art/separador.webp, art/escudos.webp
Salidas: public/assets/ui/separador.webp, public/assets/ui/escudo-{rojo,azul,amarillo,verde}.webp
"""
import sys
import numpy as np
from PIL import Image
from scipy import ndimage

# --- Separador: solo la tinta, sobre transparente
a = np.asarray(Image.open('art/separador.webp').convert('RGB')).astype(float)
lum = a.mean(-1)
paper = np.median(lum)
alpha = np.clip((paper - lum - 25) / 60, 0, 1)
ys, xs = np.nonzero(alpha > 0.3)
y0, y1 = max(0, ys.min() - 6), min(a.shape[0], ys.max() + 7)
x0, x1 = max(0, xs.min() - 6), min(a.shape[1], xs.max() + 7)
ink = np.zeros((y1 - y0, x1 - x0, 4), np.uint8)
ink[..., :3] = (74, 50, 30)  # tinta sepia uniforme
ink[..., 3] = (alpha[y0:y1, x0:x1] * 255).astype(np.uint8)
sep = Image.fromarray(ink, 'RGBA')
sep = sep.resize((1200, round(sep.height * 1200 / sep.width)), Image.LANCZOS)
sep.save('public/assets/ui/separador.webp', quality=92)

# --- Escudos
b = np.asarray(Image.open('art/escudos.webp').convert('RGB')).astype(float)
BOXES = {  # color del jugador: recuadro x0, x1, y0, y1
    'amarillo': (215, 670, 30, 535),  # león
    'verde': (770, 1220, 5, 545),  # dragón
    'azul': (215, 665, 525, 1055),  # ciervo
    'rojo': (760, 1230, 530, 1060),  # serpiente
}
out = {}
for color, (x0, x1, y0, y1) in BOXES.items():
    r = b[y0:y1, x0:x1]
    corner = np.median(np.concatenate([r[:8].reshape(-1, 3), r[-8:].reshape(-1, 3)]), axis=0)
    d = np.sqrt(((r - corner) ** 2).sum(-1))
    fg = d > 55
    lab, n = ndimage.label(fg)
    big = lab == (np.argmax(np.bincount(lab.ravel())[1:]) + 1)
    solid = ndimage.binary_fill_holes(ndimage.binary_closing(big, iterations=3))
    solid = ndimage.binary_erosion(solid, iterations=1)
    alpha = ndimage.gaussian_filter(solid.astype(float), 0.8)
    rgba = np.dstack([r, alpha * 255]).astype(np.uint8)
    im = Image.fromarray(rgba, 'RGBA')
    im = im.crop(im.getchannel('A').point(lambda v: 255 if v > 30 else 0).getbbox())
    S = max(im.size)
    can = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    can.alpha_composite(im, ((S - im.width) // 2, (S - im.height) // 2))
    can = can.resize((256, 256), Image.LANCZOS)
    can.save(f'public/assets/ui/escudo-{color}.webp', quality=92)
    out[color] = can

if len(sys.argv) > 1:
    prev = Image.new('RGBA', (1200, 420), (236, 222, 190, 255))
    prev.alpha_composite(sep, (0, 10))
    for i, c in enumerate(['rojo', 'azul', 'amarillo', 'verde']):
        prev.alpha_composite(out[c], (40 + i * 290, 140))
    prev.save(sys.argv[1])
