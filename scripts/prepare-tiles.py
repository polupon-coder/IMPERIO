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
    'agua': lambda im: hsv_adjust(im, sat=0.5, val=1.17),  # agua suave
    'llanura': lambda im: hsv_adjust(im, hue_target=50, pull=0.35, sat=1.05, val=1.06),  # más amarillenta
}

# Color de base de cada terreno: el dibujo se atenúa y predomina este color.
BASE_COLOR = {
    'llanura': (222, 200, 110),  # amarillo
    'bosque': (104, 146, 84),  # verde
    'montana': (150, 148, 142),  # gris
    'agua': (112, 162, 196),  # azul
}
DETAIL = 0.45  # intensidad del dibujo que se conserva (1 = original)
WASH = 0.55  # peso del color de base


def base_wash(im, color):
    a = np.asarray(im).astype(float)
    lum = a.mean(-1, keepdims=True)
    # El color de base modulado suavemente por la luz del dibujo
    tint = np.array(color, float) * (0.82 + 0.18 * lum / lum.mean())
    soft = lum.mean() + (a - lum.mean()) * DETAIL  # dibujo con menos contraste
    out = soft * (1 - WASH) + tint * WASH
    return Image.fromarray(np.clip(out, 0, 255).astype(np.uint8))


sheet = Image.open('art/losetas.webp').convert('RGB')
out = {}
for name, (a, b, c, d) in BOXES.items():
    t = sheet.crop((a + INSET, b + INSET, c - INSET, d - INSET)).resize((512, 512), Image.LANCZOS)
    if name in ADJUST:
        t = ADJUST[name](t)
    t = base_wash(t, BASE_COLOR[name])
    t.save(f'public/assets/tiles/{name}.webp', quality=88)
    out[name] = t

if len(sys.argv) > 1:
    prev = Image.new('RGB', (1024, 256))
    for i, k in enumerate(['agua', 'montana', 'bosque', 'llanura']):
        prev.paste(out[k].resize((256, 256)), (i * 256, 0))
    prev.save(sys.argv[1])
