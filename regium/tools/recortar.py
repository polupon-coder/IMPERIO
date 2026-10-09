"""Recorta cartas exportadas con la plantilla Ludotipia póker 88x63 (página 83x108 mm).
Uso: python3 -I recortar.py salida_dir imagen1 [imagen2 ...]
Corta por la línea de corte (63x88 mm centrada) con esquinas redondeadas de 3 mm
y guarda PNG con transparencia. Funciona en vertical u horizontal."""
import sys, os
from PIL import Image, ImageDraw

PAGE = (83.0, 108.0); CUT = (63.0, 88.0); RADIUS_MM = 3.0

def recortar(path, out_dir):
    im = Image.open(path).convert("RGB"); w, h = im.size
    landscape = w > h
    pw, ph = (PAGE[1], PAGE[0]) if landscape else PAGE
    cw, ch = (CUT[1], CUT[0]) if landscape else CUT
    sx, sy = w / pw, h / ph
    if abs(sx - sy) / sx > 0.01:
        print(f"AVISO {path}: proporción {w}x{h} no coincide con la plantilla")
    left = round((pw - cw) / 2 * sx); top = round((ph - ch) / 2 * sy)
    card = im.crop((left, top, left + round(cw * sx), top + round(ch * sy))).convert("RGBA")
    mask = Image.new("L", card.size, 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, card.size[0] - 1, card.size[1] - 1), radius=round(RADIUS_MM * sx), fill=255)
    card.putalpha(mask)
    out = os.path.join(out_dir, os.path.splitext(os.path.basename(path))[0] + ".png")
    card.save(out, optimize=True); print(out, card.size)

if __name__ == "__main__":
    for p in sys.argv[2:]: recortar(p, sys.argv[1])
