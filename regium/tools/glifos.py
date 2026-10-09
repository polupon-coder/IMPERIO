import sys, numpy as np
from PIL import Image
from scipy import ndimage as nd
def boxes(path, region):
    a = np.asarray(Image.open(path).convert("L")).astype(float)
    x0,y0,x1,y1 = region; sub = a[y0:y1, x0:x1]
    bg = nd.median_filter(sub, size=41)
    ink = (bg - sub) > 45
    ink = nd.binary_dilation(ink, iterations=6)   # junta letras de un mismo número
    lab, n = nd.label(ink)
    out = []
    for s in nd.find_objects(lab):
        h = s[0].stop - s[0].start; w = s[1].stop - s[1].start
        if 25 < h < 70 and 15 < w < 120:
            out.append((s[1].start + x0, s[0].start + y0, s[1].stop + x0, s[0].stop + y0))
    return sorted(out, key=lambda b: b[1])
if __name__ == "__main__":
    print("V", boxes(sys.argv[1], (160, 160, 800, 1100)))
    print("H", boxes(sys.argv[2], (170, 190, 1110, 800)))
