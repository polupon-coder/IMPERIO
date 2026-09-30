"""Recorta las losetas de terreno de art/losetas.webp y aplica los ajustes de color acordados.

Uso: python3 scripts/prepare-tiles.py [vista_previa.png]
Salida: public/assets/tiles/{agua,montana,bosque,llanura}.webp
"""
import sys
import numpy as np
from PIL import Image

BOXES = {'agua': (221, 12, 734, 497), 'montana': (803, 12, 1316, 497),
         'bosque': (221, 516, 734, 1004), 'llanura': (803, 516, 1316, 1004)}
INSET = 8


def hsv_adjust(im, hue_shift=0.0, sat=1.0, val=1.0, hue_target=None, pull=0.0):
    """Ajuste HSV. Si hue_target se indica, acerca el tono a ese valor en la proporción `pull`."""
    hsv = np.asarray(im.convert('HSV')).astype(float)
    h = hsv[..., 0] * 360 / 255
    if hue_target is not None:
        d = ((hue_target - h + 180) % 360) - 180
        h = h + d * pull
    h = (h + hue_shift) % 360
    hsv[..., 0] = h * 255 / 360
    hsv[..., 1] = np.clip(hsv[..., 1] * sat, 0, 255)
    hsv[..., 2] = np.clip(hsv[..., 2] * val, 0, 255)
    return Image.fromarray(hsv.astype(np.uint8), 'HSV').convert('RGB')


ADJUST = {
    'agua': lambda im: hsv_adjust(im, sat=0.72, val=1.1),  # agua más suave
    'llanura': lambda im: hsv_adjust(im, hue_target=50, pull=0.35, sat=1.05, val=1.06),  # más amarillenta
}

sheet = Image.open('art/losetas.webp').convert('RGB')
out = {}
for name, (a, b, c, d) in BOXES.items():
    t = sheet.crop((a + INSET, b + INSET, c - INSET, d - INSET)).resize((512, 512), Image.LANCZOS)
    if name in ADJUST:
        t = ADJUST[name](t)
    t.save(f'public/assets/tiles/{name}.webp', quality=88)
    out[name] = t

if len(sys.argv) > 1:
    prev = Image.new('RGB', (1024, 256))
    for i, k in enumerate(['agua', 'montana', 'bosque', 'llanura']):
        prev.paste(out[k].resize((256, 256)), (i * 256, 0))
    prev.save(sys.argv[1])
