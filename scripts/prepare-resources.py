"""Recorta los iconos de recursos de art/recursos.webp con fondo transparente y algo desaturados.

Uso: python3 scripts/prepare-resources.py [vista_previa.png]
Salida: public/assets/resources/{comida,madera,piedra,agua}.webp
"""
import sys
import numpy as np
from PIL import Image, ImageEnhance

a = np.asarray(Image.open('art/recursos.webp').convert('RGB')).astype(float)
paper = np.median(np.concatenate([a[:12].reshape(-1, 3), a[-12:].reshape(-1, 3)]), axis=0)
d = np.sqrt(((a - paper) ** 2).sum(-1))
alpha = np.clip((d - 14) / 26, 0, 1)
runs = [(20, 364), (364, 735), (737, 1132), (1136, 1424)]  # columnas de comida, madera, piedra, agua
SATURATION = 0.72  # desaturado suave
out = []
for name, (x0, x1) in zip(['comida', 'madera', 'piedra', 'agua'], runs):
    rows = np.nonzero((alpha[:, x0:x1] > 0.5).any(1))[0]
    y0, y1 = rows.min(), rows.max() + 1
    rgb = Image.fromarray(a[y0:y1, x0:x1].astype(np.uint8))
    rgb = ImageEnhance.Color(rgb).enhance(SATURATION)
    im = rgb.convert('RGBA')
    im.putalpha(Image.fromarray((alpha[y0:y1, x0:x1] * 255).astype(np.uint8)))
    S = max(im.size) + 8
    can = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    can.alpha_composite(im, ((S - im.width) // 2, (S - im.height) // 2))
    can = can.resize((128, 128), Image.LANCZOS)
    can.save(f'public/assets/resources/{name}.webp', quality=90)
    out.append(can)

if len(sys.argv) > 1:
    prev = Image.new('RGBA', (128 * 4, 128), (240, 232, 215, 255))
    for i, im in enumerate(out):
        prev.alpha_composite(im, (i * 128, 0))
    prev.save(sys.argv[1])
