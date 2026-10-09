"""Lee el valor (círculos encendidos) y el color de una tropa sin recortar (980x1275 aprox)."""
import sys, colorsys
from PIL import Image
YS = [210, 302, 396, 489, 583, 677, 770, 864, 958, 1052]; X = 220
def hue_name(h):
    d = h * 360
    if d < 20 or d >= 330: return "rojo"
    if d < 70: return "amarillo"
    if d < 170: return "verde"
    if d < 260: return "azul"
    return "morado"
def leer(path):
    im = Image.open(path).convert("RGB"); sx, sy = im.width / 980, im.height / 1275
    lit = []
    for y in YS:
        r = g = b = 0; n = 0
        for dx in range(-8, 9, 2):
            for dy in range(-8, 9, 2):
                p = im.getpixel((round((X + dx) * sx), round((y + dy) * sy))); r += p[0]; g += p[1]; b += p[2]; n += 1
        h, s, v = colorsys.rgb_to_hsv(r / n / 255, g / n / 255, b / n / 255)
        brown = 0.02 < h < 0.10 and v < 0.6
        lit.append(((s > 0.38 or v > 0.62) and not brown, h, round(s, 2)))
    val = sum(1 for l in lit if l[0])
    contiguous = all(lit[i][0] for i in range(val))
    color = hue_name(lit[0][1]) if val else "?"
    return val, color, contiguous
if __name__ == "__main__":
    for p in sys.argv[1:]:
        print(p.split("/")[-1], *leer(p))
