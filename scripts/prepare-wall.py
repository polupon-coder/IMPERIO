"""Recorta la ilustración de Muralla (art/muralla.webp).

Uso: python3 scripts/prepare-wall.py
Salida:
  public/assets/ui/muralla.webp        ficha cuadrada con el papel original (para círculos)
  public/assets/ui/muralla-icono.webp  icono con fondo transparente (para textos y resúmenes)
"""
import numpy as np
from PIL import Image

a = np.asarray(Image.open('art/muralla.webp').convert('RGB')).astype(float)
paper = np.median(np.concatenate([a[:12].reshape(-1, 3), a[-12:].reshape(-1, 3)]), axis=0)
d = np.sqrt(((a - paper) ** 2).sum(-1))
alpha = np.clip((d - 16) / 26, 0, 1)
ys, xs = np.nonzero(alpha > 0.5)
x0, x1, y0, y1 = xs.min(), xs.max() + 1, ys.min(), ys.max() + 1

# Icono transparente, cuadrado
icon = Image.fromarray(a[y0:y1, x0:x1].astype(np.uint8)).convert('RGBA')
icon.putalpha(Image.fromarray((alpha[y0:y1, x0:x1] * 255).astype(np.uint8)))
S = max(icon.size) + 8
can = Image.new('RGBA', (S, S), (0, 0, 0, 0))
can.alpha_composite(icon, ((S - icon.width) // 2, (S - icon.height) // 2))
can.resize((128, 128), Image.LANCZOS).save('public/assets/ui/muralla-icono.webp', quality=90)

# Ficha con el papel original, encuadre para círculo
W, H = x1 - x0, y1 - y0
side = int(max(W, H) * 0.92)
cx, cy = (x0 + x1) // 2, (y0 + y1) // 2
box = (cx - side // 2, cy - side // 2, cx + side // 2, cy + side // 2)
Image.fromarray(a.astype(np.uint8)).crop(box).resize((256, 256), Image.LANCZOS).save('public/assets/ui/muralla.webp', quality=88)
