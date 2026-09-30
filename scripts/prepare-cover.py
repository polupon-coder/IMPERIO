"""Portada: pasa el título rojo de art/portada.webp a tinta negra, conservando la textura.

Uso: python3 scripts/prepare-cover.py
Salida: public/assets/ui/portada.webp
"""
import numpy as np
from PIL import Image, ImageFilter

im = Image.open('art/portada.webp').convert('RGB')
a = np.asarray(im).astype(float)
hsv = np.asarray(im.convert('HSV')).astype(float)
h, s, v = hsv[..., 0] * 360 / 255, hsv[..., 1] / 255, hsv[..., 2] / 255
hh = np.where(h > 180, h - 360, h)
# Rojo del título: tono rojizo y saturado (el pergamino es ocre claro y poco saturado)
w = np.clip((25 - np.abs(hh - 2)) / 10, 0, 1) * np.clip((s - 0.38) / 0.15, 0, 1) * np.clip((0.85 - v) / 0.15, 0, 1)
w = np.asarray(Image.fromarray((w * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(0.7))) / 255
ink = np.array([28, 22, 18], float)
tex = (0.75 + 0.9 * (v - v[w > 0.5].mean() if (w > 0.5).any() else 0))[..., None]
dark = np.clip(ink * np.clip(tex, 0.6, 1.6), 0, 255)
out = a * (1 - w[..., None]) + dark * w[..., None]
Image.fromarray(np.clip(out, 0, 255).astype(np.uint8)).save('public/assets/ui/portada.webp', quality=90)
