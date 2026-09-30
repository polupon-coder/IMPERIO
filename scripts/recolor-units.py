"""Recorta las tropas de una hoja de ilustraciones (jugador rojo) y genera las variantes de color.

Uso: python3 scripts/recolor-units.py hoja.webp
Salida: public/assets/units/{rojo,azul,amarillo,verde}/{tipo}.webp
Cuando existan ilustraciones propias de cada color, basta con sustituir los archivos generados.
"""
import sys
import numpy as np
from PIL import Image, ImageFilter

src = np.asarray(Image.open(sys.argv[1]).convert('RGB')).astype(float)
paper = np.median(np.concatenate([src[:20].reshape(-1, 3), src[-20:].reshape(-1, 3)]), axis=0)
BOXES = {  # x0, x1, y0, y1
    'caballeria': (972, 1392, 36, 564),
    'lancero': (132, 476, 48, 500),
    'arquero': (572, 872, 112, 500),
    'infanteria': (300, 612, 482, 928),
    'artilleria': (748, 1308, 608, 944),
}
EXCLUDE = {'infanteria': [(0, 476, 0, 502)]}  # restos de la figura vecina (coordenadas absolutas)
TARGET = {'azul': (218, 1.0, 0.92), 'amarillo': (47, 1.0, 1.15), 'verde': (120, 0.85, 0.9)}


def cut(name):
    x0, x1, y0, y1 = BOXES[name]
    p = 8
    X0, Y0 = x0 - p, y0 - p
    a = src[Y0:y1 + p, X0:x1 + p]
    d = np.sqrt(((a - paper) ** 2).sum(-1))
    alpha = np.clip((d - 16) / (42 - 16), 0, 1)
    for ex0, ex1, ey0, ey1 in EXCLUDE.get(name, []):
        alpha[max(0, ey0 - Y0):max(0, ey1 - Y0), max(0, ex0 - X0):max(0, ex1 - X0)] = 0
    im = Image.fromarray(np.dstack([a, alpha * 255]).astype(np.uint8), 'RGBA')
    im = im.crop(im.getchannel('A').point(lambda x: 255 if x > 40 else 0).getbbox())
    # Ficha circular: la figura centrada sobre el papel original, con margen para que quepa en el círculo.
    W, H = im.size
    side = round(max(max(W, H) * 0.98, (W * W + H * H) ** 0.5 * 0.74))
    can = Image.new('RGBA', (side, side), tuple(int(c) for c in paper) + (255,))
    can.alpha_composite(im, ((side - W) // 2, (side - H) // 2))
    return can.resize((256, 256), Image.LANCZOS)


def hsv(a):
    rgb = a[..., :3] / 255
    mx, mn = rgb.max(-1), rgb.min(-1)
    df = mx - mn
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    h = np.zeros_like(mx)
    m = df > 1e-6
    rm = m & (mx == r)
    gm = m & (mx == g) & ~rm
    bm = m & ~rm & ~gm
    h[rm] = ((g - b)[rm] / df[rm]) % 6
    h[gm] = (b - r)[gm] / df[gm] + 2
    h[bm] = (r - g)[bm] / df[bm] + 4
    return h * 60, np.where(mx > 0, df / np.maximum(mx, 1e-6), 0), mx


def rgb(h, s, v):
    c = v * s
    x = c * (1 - np.abs((h / 60) % 2 - 1))
    m = v - c
    z = np.zeros_like(h)
    i = (h // 60).astype(int) % 6
    sel = lambda *vals: np.select([i == k for k in range(6)], vals)
    return np.dstack([sel(c, x, z, z, x, c) + m, sel(x, c, c, x, z, z) + m, sel(z, z, x, c, c, x) + m]) * 255


def recolor(im, color):
    a = np.asarray(im).astype(float)
    h, s, v = hsv(a)
    hh = np.where(h > 180, h - 360, h)
    w_h = np.clip((27 - hh) / 6, 0, 1) * np.clip((hh + 30) / 8, 0, 1)
    w_s = np.clip((s - 0.28) / 0.15, 0, 1)
    # Los tonos anaranjados solo si son claros (ropa); el marrón oscuro del caballo y la madera no.
    w_v = np.where(hh > 12, np.clip((v - 0.60) / 0.12, 0, 1), np.clip((v - 0.22) / 0.1, 0, 1))
    w = w_h * w_s * w_v
    w = np.asarray(Image.fromarray((w * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(1.2))) / 255
    w = np.clip(w * 1.3, 0, 1)
    th, ts, tv = TARGET[color]
    out = a.copy()
    new = rgb((th + hh * 0.5) % 360, np.clip(np.maximum(s, 0.45) * ts, 0, 1), np.clip(v * tv, 0, 1))
    out[..., :3] = a[..., :3] * (1 - w[..., None]) + new * w[..., None]
    return Image.fromarray(np.clip(out, 0, 255).astype(np.uint8), 'RGBA')


if __name__ == '__main__':
    preview = Image.new('RGBA', (256 * 5, 256 * 4), (240, 232, 215, 255))
    for i, name in enumerate(BOXES):
        base = cut(name)
        base.save(f'public/assets/units/rojo/{name}.webp', quality=90)
        preview.alpha_composite(base, (i * 256, 0))
        for j, c in enumerate(TARGET):
            r = recolor(base, c)
            r.save(f'public/assets/units/{c}/{name}.webp', quality=90)
            preview.alpha_composite(r, (i * 256, (j + 1) * 256))
    if len(sys.argv) > 2:
        preview.save(sys.argv[2])
