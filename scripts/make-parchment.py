"""Genera una textura de papiro/pergamino antiguo sutil y repetible sin costuras.

Uso: python3 scripts/make-parchment.py
Salida: public/assets/ui/papiro.webp (512×512, se repite en mosaico)
"""
import numpy as np
from PIL import Image

N = 512
rng = np.random.default_rng(7)


def periodic_noise(power):
    """Ruido filtrado en frecuencia: periódico por construcción (sin costuras al repetirse)."""
    f = np.fft.fftfreq(N)
    fx, fy = np.meshgrid(f, f)
    r = np.sqrt(fx ** 2 + fy ** 2)
    r[0, 0] = 1
    spec = (rng.normal(size=(N, N)) + 1j * rng.normal(size=(N, N))) / r ** power
    spec[0, 0] = 0
    n = np.real(np.fft.ifft2(spec))
    return (n - n.mean()) / n.std()


def fibers():
    """Fibras horizontales alargadas, como las del papiro."""
    f = np.fft.fftfreq(N)
    fx, fy = np.meshgrid(f, f)
    spec = (rng.normal(size=(N, N)) + 1j * rng.normal(size=(N, N)))
    spec *= np.exp(-(fx / 0.004) ** 2 - (fy / 0.12) ** 2)  # muy estirado en horizontal
    n = np.real(np.fft.ifft2(spec))
    return (n - n.mean()) / n.std()


blotch = periodic_noise(1.9)  # manchas grandes
mid = periodic_noise(1.2)
grain = rng.normal(size=(N, N))
fib = fibers()
v = 0.55 * blotch + 0.25 * mid + 0.35 * fib + 0.12 * grain
v = np.tanh(v / 2.2)  # -1..1 suavizado

light = np.array([241, 231, 206], float)  # pergamino claro
dark = np.array([214, 194, 152], float)   # tono envejecido
t = (v + 1) / 2
t = 0.25 + 0.5 * t  # contraste contenido: textura sutil
rgb = light * (1 - t[..., None]) + dark * t[..., None]
Image.fromarray(np.clip(rgb, 0, 255).astype(np.uint8)).save('public/assets/ui/papiro.webp', quality=85)
