"""Recorta de la portada el escudo del león y el rótulo «Imperio» con fondo transparente.

Uso: python3 scripts/prepare-victory.py [vista_previa.png]
Entrada: public/assets/ui/portada.webp (generada por prepare-cover.py)
Salida: public/assets/ui/victoria-escudo.webp, public/assets/ui/victoria-titulo.webp
"""
import sys
import numpy as np
from PIL import Image

im = Image.open('public/assets/ui/portada.webp').convert('RGB')
a = np.asarray(im).astype(float)
paper = np.median(a[520:540, 60:160].reshape(-1, 3), axis=0)  # papel junto al escudo


def cut(y0, y1, name, x0=0, x1=None, ink=False):
    r = a[y0:y1, x0:x1]
    if ink:  # solo la tinta oscura del rótulo
        alpha = np.clip((150 - r.mean(-1)) / 60, 0, 1)
    else:
        d = np.sqrt(((r - paper) ** 2).sum(-1))
        alpha = np.clip((d - 22) / 40, 0, 1)
    out = Image.fromarray(np.dstack([r, alpha * 255]).astype(np.uint8), 'RGBA')
    out = out.crop(out.getchannel('A').point(lambda v: 255 if v > 60 else 0).getbbox())
    out.save(f'public/assets/ui/{name}.webp', quality=92)
    return out


title = cut(95, 505, 'victoria-titulo', 40, 990, ink=True)
shield = cut(505, 1365, 'victoria-escudo', 150, 880)
# El escudo conserva su interior claro (el león): se rellena el hueco del cuerpo con el papel.
s = np.asarray(shield).astype(float)
from scipy import ndimage
lab, n = ndimage.label(s[..., 3] > 60)
big = lab == (np.argmax(np.bincount(lab.ravel())[1:]) + 1)
solid = ndimage.binary_fill_holes(big)
s[..., 3] = ndimage.gaussian_filter(solid.astype(float), 0.7) * 255
_sh = Image.fromarray(s.astype(np.uint8), 'RGBA')
_sh = _sh.crop(_sh.getchannel('A').getbbox())
_sh.save('public/assets/ui/victoria-escudo.webp', quality=92)

if len(sys.argv) > 1:
    prev = Image.new('RGBA', (900, 700), (120, 90, 60, 255))
    sh = Image.open('public/assets/ui/victoria-escudo.webp')
    sh.thumbnail((400, 460))
    prev.alpha_composite(sh, (40, 20))
    t = title.copy()
    t.thumbnail((420, 200))
    prev.alpha_composite(t, (460, 200))
    prev.save(sys.argv[1])
