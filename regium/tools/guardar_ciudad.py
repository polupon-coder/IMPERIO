"""Guarda ciudades: color del marco (muestra en el borde) y numera por reino; salta duplicados."""
import sys, os, glob, shutil, colorsys, hashlib
from PIL import Image
sys.path.insert(0, os.path.dirname(__file__))
from clasificar_tropa import hue_name
dest = sys.argv[1]
have = {hashlib.md5(open(f, 'rb').read()).hexdigest() for f in glob.glob(os.path.join(dest, "*.jpg"))}
for p in sys.argv[2:]:
    if hashlib.md5(open(p, 'rb').read()).hexdigest() in have:
        print(os.path.basename(p), "dup"); continue
    im = Image.open(p).convert("RGB"); w, h = im.size
    px = [im.getpixel((x, y)) for x in range(w // 3, 2 * w // 3, 20) for y in (60, h - 60)]
    r, g, b = (sum(c[i] for c in px) / len(px) / 255 for i in range(3))
    color = hue_name(colorsys.rgb_to_hsv(r, g, b)[0])
    n = len(glob.glob(os.path.join(dest, f"lugar-{color}-ciudad-*.jpg"))) + 1
    out = os.path.join(dest, f"lugar-{color}-ciudad-{n}.jpg"); shutil.copy(p, out); print(os.path.basename(out))
