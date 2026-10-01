"""Genera los sonidos suaves del juego (WAV mono 22 kHz) sintetizados, sin muestras externas.

Uso: python3 scripts/make-sounds.py   → public/assets/sonidos/*.wav
"""
import numpy as np
from scipy.io import wavfile
from scipy.signal import butter, lfilter

SR = 22050
rng = np.random.default_rng(3)
OUT = 'public/assets/sonidos/'


def t(d):
    return np.arange(int(SR * d)) / SR


def env(n, attack=0.005, decay=0.3):
    x = np.arange(n) / SR
    a = np.clip(x / attack, 0, 1)
    return a * np.exp(-x / decay)


def band(x, lo, hi):
    b, a = butter(2, [lo / (SR / 2), hi / (SR / 2)], btype='band')
    return lfilter(b, a, x)


def place(buf, snd, at):
    i = int(at * SR)
    buf[i:i + len(snd)] += snd[: max(0, len(buf) - i)]


def save(name, x, peak=0.25):
    x = x / (np.abs(x).max() + 1e-9) * peak  # suave: pico a −12 dB
    fade = min(len(x), int(0.02 * SR))
    x[-fade:] *= np.linspace(1, 0, fade)
    wavfile.write(OUT + name + '.wav', SR, (x * 32767).astype(np.int16))


def bell(f, d=1.4):
    x = t(d)
    s = sum(a * np.sin(2 * np.pi * f * m * x) * np.exp(-x / (dec * d)) for m, a, dec in [(1, 1, 0.45), (2.76, 0.25, 0.2), (5.4, 0.08, 0.1)])
    return s * np.clip(x / 0.004, 0, 1)


def knock(f=180, d=0.12, bright=900):
    n = int(SR * d)
    x = np.arange(n) / SR
    body = np.sin(2 * np.pi * f * x) * np.exp(-x / 0.025)
    click = band(rng.normal(size=n), bright * 0.6, bright * 1.6) * np.exp(-x / 0.008)
    return body + 0.5 * click


def horn(f, d):
    x = t(d)
    s = sum(np.sin(2 * np.pi * f * k * x) / k ** 2 for k in range(1, 7))
    a = np.clip(x / 0.05, 0, 1) * np.clip((d - x) / 0.12, 0, 1)
    return s * a


def metal(f, d=0.9):
    """Choque metálico grave: parciales inarmónicos que se apagan deprisa."""
    x = t(d)
    s = sum(a * np.sin(2 * np.pi * f * m * x + rng.uniform(0, 6)) * np.exp(-x / dec) for m, a, dec in [(1, 1, 0.35), (2.41, 0.6, 0.18), (3.87, 0.35, 0.1), (5.93, 0.2, 0.06)])
    hit = band(rng.normal(size=len(x)), 1500, 5000) * np.exp(-x / 0.006)
    return s * np.clip(x / 0.002, 0, 1) + 0.4 * hit


def stone(f=260, d=0.09):
    """Golpe de piedra contra piedra: seco, con algo de cuerpo grave."""
    n = int(SR * d)
    x = np.arange(n) / SR
    body = np.sin(2 * np.pi * f * x) * np.exp(-x / 0.012)
    grit = band(rng.normal(size=n), 700, 2600) * np.exp(-x / 0.015)
    return 0.7 * body + grit


def drum(f=70, d=0.6):
    """Golpe grave de madera (tambor o puerta pesada)."""
    x = t(d)
    pitch = f * (1 + 0.6 * np.exp(-x / 0.03))
    body = np.sin(2 * np.pi * np.cumsum(pitch) / SR) * np.exp(-x / 0.18)
    click = band(rng.normal(size=len(x)), 300, 1200) * np.exp(-x / 0.01)
    return body + 0.35 * click


# Tu turno: dos golpes graves de madera, como llamar a una puerta pesada
buf = np.zeros(int(SR * 1.0))
place(buf, drum(85, 0.5), 0)
place(buf, drum(85, 0.5) * 0.8, 0.22)
save('turno', buf, 0.3)

# Ficha y Construir conservan exactamente la versión aprobada (misma semilla y secuencia aleatoria)
rng = np.random.default_rng(3)
# Ficha: toque de madera al colocar loseta o mover tropa
save('ficha', knock(210, 0.14, 1100), 0.28)

# Dados: pocas piedras graves, corto (generador propio; se consume la secuencia anterior para no alterar los demás)
for i in range(8):
    stone(rng.uniform(180, 320), rng.uniform(0.06, 0.1))
    rng.uniform(0.04, 0.09)
saved = rng
rng = np.random.default_rng(21)
buf = np.zeros(int(SR * 0.36))
at = 0.0
for i in range(4):
    snd = stone(rng.uniform(95, 140), rng.uniform(0.07, 0.1))
    place(buf, band(snd, 60, 1400) * (1 - i / 6), at)
    at += rng.uniform(0.05, 0.08)
save('dados', buf, 0.3)
rng = saved


# (consume la misma secuencia aleatoria que la primera versión, para que Construir no cambie)
saved = rng
rng = np.random.default_rng(3)
knock(210, 0.14, 1100)
for i in range(9):
    knock(rng.uniform(500, 900), 0.05, rng.uniform(2500, 4000))
    rng.uniform(0.03, 0.08)
# Construir: tres golpes de martillo en madera
buf = np.zeros(int(SR * 0.7))
for i, at in enumerate([0, 0.17, 0.34]):
    place(buf, knock(150, 0.16, 700) * (1 - 0.15 * i), at)
save('construir', buf, 0.3)
rng = saved

# Conquista: dos choques de acero graves sobre un golpe de madera
buf = np.zeros(int(SR * 1.4))
place(buf, drum(65, 0.7), 0)
place(buf, metal(196), 0.02)
place(buf, metal(174.6) * 0.85, 0.3)
save('conquista', buf, 0.26)

# Victoria: tres golpes de tambor de guerra y un gran choque de acero
buf = np.zeros(int(SR * 2.4))
for i, at in enumerate([0, 0.32, 0.64]):
    place(buf, drum(60, 0.7) * (0.75 + 0.1 * i), at)
place(buf, drum(55, 1.0), 0.96)
place(buf, metal(146.8, 1.4), 0.97)
place(buf, metal(220, 1.2) * 0.6, 0.99)
save('victoria', buf, 0.28)

# Batalla: entrechocar grave de espadas al empezar un combate (generador propio)
rng = np.random.default_rng(42)
buf = np.zeros(int(SR * 1.1))
for at, f, g in [(0, 130.8, 1), (0.16, 116.5, 0.85), (0.3, 123.5, 0.7)]:
    place(buf, band(metal(f, 0.7), 80, 3200) * g, at)
    place(buf, drum(70, 0.3) * 0.25 * g, at)
save('batalla', buf, 0.27)
