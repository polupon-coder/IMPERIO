"""Corrige los números romanos mal escritos del pergamino vertical usando los glifos del horizontal."""
import sys, numpy as np
from PIL import Image
from scipy import ndimage as nd
V = np.asarray(Image.open(sys.argv[1]).convert("RGB")).astype(float)
H = np.asarray(Image.open(sys.argv[2]).convert("RGB")).astype(float)
PAD = 10
def ink_mask(img, box):
    x0, y0, x1, y1 = box
    sub = img[y0-PAD:y1+PAD, x0-PAD:x1+PAD]; L = sub.mean(2)
    bg = nd.median_filter(L, size=41)
    return sub, nd.binary_dilation((bg - L) > 25, iterations=2)
def background(sub, mask):
    keep = (~mask).astype(float); out = np.empty_like(sub)
    for c in range(3):
        num = nd.gaussian_filter(sub[..., c] * keep, 6); den = nd.gaussian_filter(keep, 6)
        out[..., c] = np.where(mask, num / np.maximum(den, 1e-3), sub[..., c])
    for _ in range(3):  # rellena huecos grandes
        m2 = mask & (den < 0.05)
        if not m2.any(): break
        for c in range(3):
            out[..., c] = np.where(m2, nd.gaussian_filter(out[..., c], 10), out[..., c])
    return out
# (caja errónea en el vertical, caja del número correcto en el horizontal)
FIX = [((359, 459, 417, 506), (765, 555, 824, 602)),   # VI  -> IV
       ((488, 650, 546, 697), (573, 443, 632, 490)),   # IV  -> VI
       ((541, 750, 617, 797), (469, 399, 545, 446)),   # IIV -> VII
       ((600, 840, 692, 887), (367, 344, 460, 391)),   # IIIV-> VIII
       ((673, 934, 732, 981), (285, 267, 344, 314))]   # XI  -> IX
for vb, hb in FIX:
    vsub, vm = ink_mask(V, vb); clean = background(vsub, vm)
    hsub, hm = ink_mask(H, hb); hbg = background(hsub, hm)
    # solo la tinta del número: descarta las líneas verticales del pautado (largas y finas)
    lab, n = nd.label(hm); keep = np.zeros_like(hm)
    for i, s_ in enumerate(nd.find_objects(lab), 1):
        hh = s_[0].stop - s_[0].start; ww = s_[1].stop - s_[1].start
        core = (lab[s_] == i).sum()
        if not (ww <= 8 and hh > 20) and core > 30:
            keep[s_] |= lab[s_] == i
    hm = keep
    ratio = np.clip(hsub / np.maximum(hbg, 1), 0, 1)
    ratio = np.where(hm[..., None], ratio, 1.0)
    # centra el glifo nuevo sobre el centro del viejo
    cy, cx = (vb[1] + vb[3]) / 2, (vb[0] + vb[2]) / 2
    gh, gw = ratio.shape[:2]
    ty, tx = int(round(cy - gh / 2)), int(round(cx - gw / 2))
    oy, ox = vb[1] - PAD, vb[0] - PAD
    V[oy:oy+clean.shape[0], ox:ox+clean.shape[1]] = clean
    V[ty:ty+gh, tx:tx+gw] *= ratio
Image.fromarray(np.clip(V, 0, 255).astype(np.uint8)).save(sys.argv[3], quality=95)
print("ok")
