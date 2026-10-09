"""Guarda territorios: detecta el color del círculo (esquina sup. izq.) y numera por reino."""
import sys, os, glob, shutil, colorsys
from PIL import Image
sys.path.insert(0, os.path.dirname(__file__))
from clasificar_tropa import hue_name
dest = sys.argv[1]
for p in sys.argv[2:]:
    im = Image.open(p).convert("RGB"); sx = im.width / 1275
    px = [im.getpixel((round((210 + dx) * sx), round((208 + dy) * sx))) for dx in range(-6, 7, 3) for dy in range(-6, 7, 3)]
    r, g, b = (sum(c[i] for c in px) / len(px) / 255 for i in range(3))
    color = hue_name(colorsys.rgb_to_hsv(r, g, b)[0])
    n = len(glob.glob(os.path.join(dest, f"lugar-{color}-territorio-*.jpg"))) + 1
    out = os.path.join(dest, f"lugar-{color}-territorio-{n}.jpg"); shutil.copy(p, out); print(out)
