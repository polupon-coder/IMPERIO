"""Recorta los 8 edificios de las hojas del autor (art/edificios-*.webp) conservando el fondo de papel.

Uso: python3 scripts/prepare-buildings.py [vista_previa.png]
Salida: public/assets/buildings/<edificio>.webp
"""
import sys
import numpy as np
from PIL import Image

SOURCES = {  # edificio: (hoja, recuadro x0, x1, y0, y1)
    'cuartel': ('art/edificios-militares.webp', (80, 790, 48, 516)),
    'caballerizas': ('art/edificios-militares.webp', (784, 1480, 144, 492)),
    'arqueria': ('art/edificios-militares.webp', (96, 748, 528, 936)),
    'herreria': ('art/edificios-militares.webp', (752, 1484, 544, 924)),
    'biblioteca': ('art/edificios-civiles.webp', (16, 816, 92, 512)),
    'ayuntamiento': ('art/edificios-civiles.webp', (816, 1532, 16, 552)),
    'iglesia': ('art/edificios-civiles.webp', (32, 770, 496, 992)),
    'mercado': ('art/edificios-civiles.webp', (780, 1528, 572, 992)),
}
W_OUT, H_OUT = 360, 270  # 4:3, mismo encuadre para todos

cache = {}
out = {}
for name, (path, (x0, x1, y0, y1)) in SOURCES.items():
    if path not in cache:
        a = np.asarray(Image.open(path).convert('RGB')).astype(float)
        paper = np.median(np.concatenate([a[:12].reshape(-1, 3), a[-12:].reshape(-1, 3)]), axis=0)
        cache[path] = (a, paper)
    a, paper = cache[path]
    region = a[y0:y1, x0:x1]
    mask = np.sqrt(((region - paper) ** 2).sum(-1)) > 30
    ys, xs = np.nonzero(mask)
    m = 10
    bx0, bx1 = max(0, xs.min() - m), min(region.shape[1], xs.max() + m)
    by0, by1 = max(0, ys.min() - m), min(region.shape[0], ys.max() + m)
    sub = region[by0:by1, bx0:bx1]
    # Fondo de papel transparente: solo queda el dibujo del edificio
    d = np.sqrt(((sub - paper) ** 2).sum(-1))
    alpha = np.clip((d - 14) / 24, 0, 1)
    crop = Image.fromarray(np.dstack([sub, alpha * 255]).astype(np.uint8), 'RGBA')
    # Encaja en 4:3
    k = min(W_OUT / crop.width, H_OUT / crop.height)
    crop = crop.resize((round(crop.width * k), round(crop.height * k)), Image.LANCZOS)
    can = Image.new('RGBA', (W_OUT, H_OUT), (0, 0, 0, 0))
    can.alpha_composite(crop, ((W_OUT - crop.width) // 2, (H_OUT - crop.height) // 2))
    can.save(f'public/assets/buildings/{name}.webp', quality=88)
    out[name] = can

if len(sys.argv) > 1:
    prev = Image.new('RGBA', (W_OUT * 4, H_OUT * 2), (236, 222, 190, 255))
    for i, (k, im) in enumerate(out.items()):
        prev.alpha_composite(im, ((i % 4) * W_OUT, (i // 4) * H_OUT))
    prev.save(sys.argv[1])
