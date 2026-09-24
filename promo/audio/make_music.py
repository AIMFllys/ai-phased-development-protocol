"""Synthesises the film's score + sound design at 120 BPM straight from the
timeline, so every hit lands on the same frame as the picture.

    python3 audio/make_music.py   ->  audio/score.wav  (48 kHz, stereo, 30 s)

Arc: felt piano (warm) -> staccato tension + glitches (chaos) -> gate slam ->
confirm chime -> a layer per phase (ascension) -> silence + "确认 ↵" ->
full drop through the gates -> STOP/CONFIRM/SHIP hits -> stutter montage ->
the opening piano motif returns under the title.
"""
import os
import re
import numpy as np
from scipy import signal

SR = 48000
DUR = 30.0
N = int(SR * DUR)
BEAT = 0.5
HERE = os.path.dirname(os.path.abspath(__file__))
rng = np.random.default_rng(7)

L = np.zeros(N)
R = np.zeros(N)
SEND = np.zeros((2, N))  # reverb send


def midi(n):
    names = {'C': 0, 'D': 2, 'E': 4, 'F': 5, 'G': 7, 'A': 9, 'B': 11}
    m = re.match(r'([A-G])([#b]?)(-?\d)', n)
    k = names[m.group(1)] + (1 if m.group(2) == '#' else -1 if m.group(2) == 'b' else 0)
    return 440.0 * 2 ** ((k + 12 * (int(m.group(3)) + 1) - 69) / 12)


def place(sig, t, gain=1.0, pan=0.0, send=0.0):
    """Mix a mono or stereo signal in at time t (seconds)."""
    i = int(round(t * SR))
    if i >= N:
        return
    if sig.ndim == 1:
        sig = np.stack([sig * np.sqrt(0.5 * (1 - pan)), sig * np.sqrt(0.5 * (1 + pan))])
    j = min(N, i + sig.shape[1])
    a = max(0, -i)
    if a >= j - i:
        return
    L[i + a:j] += sig[0, a:j - i] * gain
    R[i + a:j] += sig[1, a:j - i] * gain
    if send:
        SEND[0, i + a:j] += sig[0, a:j - i] * gain * send
        SEND[1, i + a:j] += sig[1, a:j - i] * gain * send


def env(n, a=0.005, d=None, s=1.0, r=0.05, total=None):
    t = np.arange(n) / SR
    e = np.minimum(1, t / max(a, 1e-4))
    if d is not None:
        e *= np.exp(-t / d) * (1 - s) + s
    if r:
        e *= np.clip((n / SR - t) / r, 0, 1)
    return e


def lp(x, f, order=2):
    return signal.sosfilt(signal.butter(order, min(f, SR / 2 - 100), 'low', fs=SR, output='sos'), x)


def hp(x, f, order=2):
    return signal.sosfilt(signal.butter(order, f, 'high', fs=SR, output='sos'), x)


def bp(x, lo, hi, order=2):
    return signal.sosfilt(signal.butter(order, [lo, min(hi, SR / 2 - 100)], 'band', fs=SR, output='sos'), x)


def noise(sec):
    return rng.standard_normal(int(round(sec * SR)))


# --- instruments -------------------------------------------------------------------------
def piano(f, dur, vel=0.5, bright=0.5):
    n = int(round((dur + 1.6) * SR))
    t = np.arange(n) / SR
    out = np.zeros(n)
    for k in range(1, 10):
        fk = f * k * np.sqrt(1 + 0.0004 * k * k)
        if fk > 12000:
            break
        amp = (1 / k ** (1.6 - bright * 0.6)) * (0.9 + 0.2 * rng.random())
        dec = 2.8 / (1 + 0.45 * k) * (220 / max(f, 110)) ** 0.3
        out += amp * np.sin(2 * np.pi * fk * t + rng.random() * 6) * np.exp(-t / dec)
    out += 0.4 * np.sin(2 * np.pi * f * 1.002 * t) * np.exp(-t / 2.2)
    rel = np.clip((dur + 0.35 - t) / 0.35, 0, 1) ** 2
    hammer = lp(noise(n / SR), 2500) * np.exp(-t / 0.01) * 0.3
    x = (out + hammer) * rel * np.minimum(1, t / 0.004)
    return lp(x, 1800 + 3500 * bright) * vel


def pluck(f, dur=0.22, vel=0.3, cutoff=3000):
    n = int(round((dur + 0.3) * SR))
    t = np.arange(n) / SR
    x = np.zeros(n)
    for k in range(1, 24):
        if f * k > 14000:
            break
        x += np.sin(2 * np.pi * f * k * t) / k * np.exp(-t * (6 + k * 1.8))
    return lp(x * np.minimum(1, t / 0.002), cutoff) * vel


def supersaw(freqs, dur, vel=0.2, cutoff=4000, detune=0.012):
    n = int(round((dur + 0.25) * SR))
    t = np.arange(n) / SR
    x = np.zeros((2, n))
    for f in freqs:
        for v in range(7):
            d = (v - 3) / 3 * detune
            fv = f * (1 + d)
            ph = rng.random()
            saw = 2 * ((fv * t + ph) % 1) - 1
            pan = (v - 3) / 3 * 0.8
            x[0] += saw * np.sqrt(0.5 * (1 - pan))
            x[1] += saw * np.sqrt(0.5 * (1 + pan))
    x = np.stack([lp(x[0], cutoff, 4), lp(x[1], cutoff, 4)])
    e = env(n, a=0.02, r=0.25)
    return x * e * vel / (len(freqs) * 3.5)


def sub(f, dur, vel=0.5):
    n = int(round((dur + 0.1) * SR))
    t = np.arange(n) / SR
    x = np.sin(2 * np.pi * f * t) + 0.25 * np.sin(4 * np.pi * f * t)
    return np.tanh(x * 1.4) * env(n, a=0.01, r=0.08) * vel


def kick(vel=1.0, punch=1.0):
    n = int(round(0.5 * SR))
    t = np.arange(n) / SR
    f = 46 + 110 * np.exp(-t / 0.035) * punch
    ph = 2 * np.pi * np.cumsum(f) / SR
    x = np.sin(ph) * np.exp(-t / 0.28) + 0.35 * hp(noise(0.5), 3000) * np.exp(-t / 0.004)
    return np.tanh(x * 1.6) * vel


def clap(vel=0.5):
    n = int(round(0.4 * SR))
    t = np.arange(n) / SR
    burst = np.zeros(n)
    for off in (0, 0.009, 0.018):
        burst += (t >= off) * np.exp(-np.maximum(t - off, 0) / (0.006 if off < 0.018 else 0.09))
    return bp(noise(0.4), 900, 5500) * burst * vel


def snare(vel=0.5):
    n = int(round(0.3 * SR))
    t = np.arange(n) / SR
    tone = np.sin(2 * np.pi * 190 * t) * np.exp(-t / 0.05)
    return (0.6 * tone + bp(noise(0.3), 1500, 9000) * np.exp(-t / 0.08)) * vel


def hat(vel=0.2, dec=0.03):
    n = int(round(0.15 * SR))
    t = np.arange(n) / SR
    return hp(noise(0.15), 7000) * np.exp(-t / dec) * vel


def crash(vel=0.4, dec=1.6):
    n = int(round(2.5 * SR))
    t = np.arange(n) / SR
    x = hp(noise(2.5), 4500) * np.exp(-t / dec)
    for f in (3170, 4410, 5930, 7210):
        x += 0.08 * np.sin(2 * np.pi * f * t) * np.exp(-t / (dec * 0.6))
    return x * vel


def boom(vel=1.0, dur=1.6, f0=55):
    n = int(round(dur * SR))
    t = np.arange(n) / SR
    f = f0 * (0.55 + 0.45 * np.exp(-t / 0.25)) + 90 * np.exp(-t / 0.02)
    x = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / (dur * 0.35))
    x += lp(noise(dur), 900) * np.exp(-t / 0.12) * 0.6
    return np.tanh(x * 2.2) * vel


def clang(vel=0.4):
    n = int(round(1.8 * SR))
    t = np.arange(n) / SR
    x = np.zeros(n)
    for f, d in ((523, 1.2), (1291, 0.8), (1877, 0.6), (2744, 0.45), (3651, 0.3)):
        x += np.sin(2 * np.pi * f * t) * np.exp(-t / d) / (1 + f / 2000)
    return x * vel


def bell(f, vel=0.3, dec=1.4):
    n = int(round(dec * 2.2 * SR))
    t = np.arange(n) / SR
    x = np.zeros(n)
    for k, a, d in ((1, 1, 1), (2.0, 0.5, 0.7), (2.76, 0.35, 0.5), (5.4, 0.2, 0.25), (8.93, 0.1, 0.12)):
        x += a * np.sin(2 * np.pi * f * k * t) * np.exp(-t / (dec * d))
    return x * np.minimum(1, t / 0.002) * vel


def whoosh(dur=0.6, vel=0.4, lo=300, hi=6000, pan_from=-0.8, pan_to=0.8, peak=0.6):
    n = int(round(dur * SR))
    t = np.arange(n) / SR
    x = noise(dur)
    # time-varying one-pole lowpass sweep
    fc = lo + (hi - lo) * np.sin(np.pi * np.clip(t / dur, 0, 1)) ** 2
    a = np.exp(-2 * np.pi * fc / SR)
    y = np.zeros(n)
    acc = 0.0
    for i in range(n):
        acc = (1 - a[i]) * x[i] + a[i] * acc
        y[i] = acc
    y = hp(y, 120)
    e = np.where(t < dur * peak, (t / (dur * peak)) ** 2, np.exp(-(t - dur * peak) / (dur * 0.18)))
    y = y * e / (np.max(np.abs(y)) + 1e-9)
    pan = np.linspace(pan_from, pan_to, n)
    return np.stack([y * np.sqrt(0.5 * (1 - pan)), y * np.sqrt(0.5 * (1 + pan))]) * vel


def riser(dur, vel=0.3, lo=200, hi=9000):
    n = int(round(dur * SR))
    t = np.arange(n) / SR
    k = t / dur
    fc = lo * (hi / lo) ** k
    a = np.exp(-2 * np.pi * fc / SR)
    x = noise(dur)
    y = np.zeros(n)
    acc = 0.0
    for i in range(n):
        acc = (1 - a[i]) * x[i] + a[i] * acc
        y[i] = acc
    y = hp(y, 150) / (np.max(np.abs(y)) + 1e-9)
    tone = np.sin(2 * np.pi * np.cumsum(110 * 4 ** k) / SR) * 0.3
    return (y * 0.8 + tone) * k ** 2 * vel


def tick(vel=0.15, f=4000):
    n = int(round(0.03 * SR))
    t = np.arange(n) / SR
    return bp(noise(0.03), f * 0.6, f * 1.6) * np.exp(-t / 0.004) * vel


def keyclick(vel=0.25):
    n = int(round(0.06 * SR))
    t = np.arange(n) / SR
    x = bp(noise(0.06), 1800, 7000) * np.exp(-t / 0.006) + 0.5 * np.sin(2 * np.pi * 900 * t) * np.exp(-t / 0.01)
    return x * vel


def scratch(dur, vel=0.08, seed=0):
    """Pencil on paper: grainy band-passed noise with a jittery amplitude."""
    n = int(round(dur * SR))
    t = np.arange(n) / SR
    x = bp(noise(dur), 1800, 7500)
    grain = np.abs(lp(noise(dur), 35)) * 3
    e = np.minimum(1, t / 0.02) * np.minimum(1, (dur - t) / 0.03).clip(0)
    return x * (0.5 + grain) * e * vel


def crackle(dur, vel=0.02):
    n = int(round(dur * SR))
    x = np.zeros(n)
    idx = rng.integers(0, n, int(dur * 40))
    x[idx] = rng.standard_normal(len(idx))
    return hp(lp(x, 6000), 800) * vel + lp(noise(dur), 400) * vel * 0.25


def pad(freqs, dur, vel=0.12, cutoff=1400):
    n = int(round((dur + 0.6) * SR))
    t = np.arange(n) / SR
    x = np.zeros(n)
    for f in freqs:
        for d in (-0.004, 0, 0.004):
            x += np.sin(2 * np.pi * f * (1 + d) * t + rng.random() * 6)
            x += 0.3 * np.sin(4 * np.pi * f * (1 + d) * t)
    x = lp(x, cutoff) * env(n, a=0.5, r=0.6)
    return x * vel / len(freqs)


# --- score ---------------------------------------------------------------------------------
CH = {
    'Fmaj7': ['F3', 'A3', 'C4', 'E4'], 'Dm9': ['D3', 'F3', 'A3', 'C4', 'E4'],
    'Dm': ['D3', 'F3', 'A3', 'D4'], 'Bb': ['Bb2', 'D3', 'F3', 'Bb3'], 'F': ['F3', 'A3', 'C4', 'F4'], 'C': ['C3', 'E3', 'G3', 'C4'],
}
MOTIF = [(0.0, 'A4', 0.9), (1.0, 'C5', 0.45), (1.5, 'E5', 0.45), (2.0, 'F5', 0.7), (2.75, 'E5', 0.25), (3.0, 'D5', 1.0)]

# ACT I (0-4): felt piano, vinyl, pencil
place(crackle(8.0, 0.008), 0, 1.0)
place(pad([midi(n) for n in CH['Fmaj7']], 3.8, 0.08, 900), 0.0, 1.0, send=0.3)
for i, n in enumerate(CH['Fmaj7']):
    place(piano(midi(n), 1.8 - i * 0.1, 0.22, 0.3), 0.02 + i * 0.12, 1.0, pan=-0.2 + i * 0.12, send=0.35)
for i, n in enumerate(CH['Dm9']):
    place(piano(midi(n), 1.8 - i * 0.1, 0.2, 0.3), 2.0 + i * 0.1, 1.0, pan=-0.25 + i * 0.1, send=0.35)
for t0, n, d in MOTIF:
    place(piano(midi(n), d, 0.3, 0.45), t0 + 0.02, 1.0, pan=0.15, send=0.4)

# pencil scratches: parse the stroke schedule straight from the paper scene
src = open(os.path.join(HERE, '..', 'src', 'scenes', 'paper.js'), encoding='utf-8').read()
desk_src = src[src.index('function buildDesk'):src.index('deskWash = [')]
for m in re.finditer(r't0: ([0-9.]+)(?: \+ i \* ([0-9.]+))?, dur: ([0-9.]+)', desk_src):
    t0, dur = float(m.group(1)), float(m.group(3))
    reps = 4 if m.group(2) else 1
    for k in range(reps):
        tt = t0 + (float(m.group(2)) * k if m.group(2) else 0)
        place(scratch(dur, 0.03, k), tt, 1.0, pan=rng.uniform(-0.4, 0.4))
for i in range(4):
    place(scratch(0.1, 0.06), 2.0 + i * 0.1, 1.0, pan=-0.5)      # "今晚，"
for i in range(7):
    place(scratch(0.08, 0.05), 2.3 + i * 0.083, 1.0, pan=-0.5)   # "写点什么吧"
for i in range(10):
    place(keyclick(0.12), 2.45 + i / 11, 1.0, pan=0.05 + rng.uniform(-0.1, 0.1))
for i in range(22):
    place(keyclick(0.07), 3.6 + i * 0.022, 1.0, pan=0.1)

# ACT II (4-8): tension. Staccato Bb(#11) chord, accelerating
tension = ['Bb2', 'F3', 'A3', 'E4']
tt = 4.0
while tt < 7.95:
    rate = 0.25 if tt < 5.5 else 0.125 if tt < 7.0 else 0.0625
    vel = 0.12 + 0.12 * (tt - 4) / 4
    for n in tension + (['C#5'] if tt > 6 else []):
        place(piano(midi(n), 0.08, vel, 0.7), tt, 1.0, pan=rng.uniform(-0.3, 0.3), send=0.1)
    tt += rate
for b in np.arange(4.0, 8.0, 0.5):
    place(kick(0.35, 0.5), b, 1.0)
for b in np.arange(4.0, 8.0, 0.125 if True else 0.25):
    place(hat(0.05 + 0.08 * (b - 4) / 4), b, 1.0, pan=0.3)
place(riser(4.0, 0.28), 4.0, 1.0, send=0.2)
for i in range(70):  # glitch clicks for every line the AI spits out
    s = 4.25 + 3.45 * np.sqrt(i / 70)
    place(tick(0.12, rng.uniform(1500, 6000)), s, 1.0, pan=rng.uniform(-0.8, 0.8))
for tpen in (5.0, 5.5, 6.0, 7.0):
    place(scratch(0.25, 0.14), tpen, 1.0, pan=rng.uniform(-0.5, 0.5))
    place(boom(0.25, 0.5, 80), tpen, 1.0)
place(scratch(0.15, 0.2), 6.5, 1.0, pan=-0.3)
place(scratch(0.15, 0.2), 6.62, 1.0, pan=0.3)
for k in range(18):
    place(scratch(0.34, 0.07), 6.95 + k * 0.055, 1.0, pan=rng.uniform(-0.7, 0.7))
place(whoosh(0.42, 0.5, 200, 3000, 0, 0, 0.95), 7.6, 1.0)

# ACT III (8-10): SLAM, silence, confirm
place(boom(1.3, 1.5, 42), 8.0, 1.0, send=0.3)
place(clang(0.3), 8.0, 1.0, send=0.35)
place(crash(0.35, 1.2), 8.0, 1.0, send=0.3)
place(pad([midi('D3'), midi('A3')], 1.6, 0.05, 600), 8.3, 1.0, send=0.5)
for i in range(10):
    place(keyclick(0.06), 8.55 + i / 22, 1.0, pan=0.4)
for i in range(3):
    place(scratch(0.1, 0.07), 9.05 + i * 0.1, 1.0, pan=-0.4)
place(bell(midi('A5'), 0.3), 9.5, 1.0, pan=0.3, send=0.5)
place(whoosh(0.4, 0.15, 400, 2500, -0.3, 0.2, 0.3), 9.5, 1.0)
place(riser(0.5, 0.12, 400, 8000), 9.5, 1.0)

# ACT IV (10-18): the ascension, one layer per phase
prog4 = [(10.0, 'Dm'), (12.0, 'Bb'), (14.0, 'F'), (16.0, 'C')]
kicks = []
for b in np.arange(10.0, 17.99, 0.5):
    place(kick(0.9), b, 1.0)
    kicks.append(b)
for b in np.arange(12.5, 17.99, 1.0):
    place(clap(0.42), b, 1.0, send=0.25)
for b in np.arange(14.0, 17.99, 0.25):
    place(hat(0.1 if (b * 4) % 2 else 0.05), b + 0.25 if False else b, 1.0, pan=0.25)
for t0, ch in prog4:
    notes = [midi(n) for n in CH[ch]]
    place(sub(notes[0] / 2, 1.95, 0.45), t0, 1.0)
    cutoff = {10.0: 1600, 12.0: 2600, 14.0: 3800, 16.0: 6000}[t0]
    octs = 2 if t0 >= 14 else 1
    arp = [n * (2 ** o) for o in range(1, 1 + octs) for n in notes[1:]]
    for k in range(16):
        place(pluck(arp[k % len(arp)], 0.14, 0.13, cutoff), t0 + k * 0.125, 1.0, pan=0.35 * np.sin(k), send=0.25)
    if t0 >= 16.0:
        place(supersaw(notes, 1.95, 0.4, 3500), t0, 1.0, send=0.2)
for i, (tc, n) in enumerate(zip([11.5, 13.5, 15.5, 17.5], ['C6', 'D6', 'E6', 'G6'])):
    place(bell(midi(n), 0.22, 1.0), tc, 1.0, pan=0.3, send=0.5)
# per-phase sound design
for x in (10.02, 10.05, 10.25, 10.3, 10.62):
    place(tick(0.12, 3000), x, 1.0, pan=rng.uniform(-0.4, 0.4))
for x in (10.56, 10.81, 11.06, 11.31, 11.56):
    place(bell(midi('E6'), 0.06, 0.2), x, 1.0, pan=0.5)
place(whoosh(0.5, 0.35, 500, 7000, -0.9, 0.9), 11.8, 1.0)          # iris
for i, x in enumerate((12.0, 12.5, 13.0, 13.5)):
    place(whoosh(0.3, 0.2, 800, 5000, 0.9, 0.2, 0.7), x - 0.12, 1.0)
    place(kick(0.25, 0.3), x + 0.2, 1.0)
place(boom(0.5, 0.8, 70), 14.0, 1.0, send=0.3)
place(whoosh(0.55, 0.35, 200, 4000, -0.6, 0.6), 13.8, 1.0)
for x in (14.5, 15.0, 15.5, 16.0):
    place(bell(midi('A6'), 0.05, 0.25), x, 1.0, pan=-0.4)
    place(tick(0.2, 2500), x, 1.0)
n16 = int(0.6 * SR)
hum = np.sin(2 * np.pi * 100 * np.arange(n16) / SR) * (rng.random(n16) > 0.3) * np.exp(-np.arange(n16) / SR / 0.3)
place(lp(hum, 3000) * 0.08, 16.0, 1.0)
place(boom(0.7, 1.0, 50), 16.0, 1.0, send=0.3)
place(riser(2.0, 0.35), 16.0, 1.0, send=0.2)
rolls = list(np.arange(17.0, 17.5, 0.125)) + list(np.arange(17.5, 17.75, 0.0625)) + list(np.arange(17.75, 18.0, 0.03125))
for i, x in enumerate(rolls):
    place(snare(0.12 + 0.3 * i / len(rolls)), x, 1.0, send=0.15)

# ACT V (18-19): silence, the human types 确认 and presses enter
place(sub(midi('D1'), 0.8, 0.12), 18.0, 1.0)
place(keyclick(0.3), 18.33, 1.0)
place(keyclick(0.3), 18.44, 1.0)
place(keyclick(0.55) + np.pad(lp(noise(0.03), 500) * 0.4, (0, int(0.06 * SR) - int(0.03 * SR))), 18.75, 1.0, send=0.4)
rev = riser(0.25, 0.4, 600, 12000)
place(rev, 18.75, 1.0, send=0.3)

# ACT VI (19-27): the drop
drop_prog = [(19.0, 'Dm'), (21.0, 'Bb'), (23.0, 'F'), (25.0, 'C')]
for b in np.arange(19.0, 26.0, 0.5):
    place(kick(1.0, 1.2), b, 1.0)
    kicks.append(b)
for b in np.arange(19.5, 26.0, 1.0):
    place(clap(0.5), b, 1.0, send=0.3)
for b in np.arange(19.0, 26.0, 0.125):
    place(hat(0.09 if (b * 8) % 2 else 0.05, 0.02), b, 1.0, pan=0.3 if (b * 8) % 2 else -0.3)
for t0, ch in drop_prog:
    notes = [midi(n) for n in CH[ch]]
    for b in np.arange(t0, t0 + 2.0, 0.25):
        place(sub(notes[0] / 2, 0.22, 0.5), b, 1.0)
    place(supersaw([n * 2 for n in notes[1:]], 1.98, 0.55, 5200), t0, 1.0, send=0.3)
for t0, n, d in MOTIF:   # the opening piano motif, now as a lead
    for rep in (19.0, 23.0):
        f = midi(n)
        place(supersaw([f], d * 0.95, 0.35, 7000, 0.006), rep + t0, 1.0, send=0.35)
        place(piano(f * 2, d, 0.12, 0.9), rep + t0, 1.0, send=0.3)
place(boom(1.3, 2.0, 45), 19.0, 1.0, send=0.4)
place(crash(0.5, 1.8), 19.0, 1.0, send=0.3)
for x in (19.5, 20.0, 20.5, 21.0, 21.5):
    place(whoosh(0.4, 0.4, 400, 9000, 0.9, -0.9, 0.75), x - 0.3, 1.0)
place(whoosh(0.8, 0.5, 150, 5000, -0.5, 0.5, 0.6), 21.9, 1.0, send=0.3)   # the reveal
for i, x in enumerate((23.0, 24.0, 25.0)):
    place(boom(1.1, 1.4, 48 + i * 4), x, 1.0, send=0.4)
    place(crash(0.35, 1.0), x, 1.0, send=0.3)
    place(clap(0.6), x, 1.0, send=0.4)

# montage 26-27: stutter-chop the drop, a riser into the title
chop = np.stack([L[int(25.0 * SR):int(25.125 * SR)].copy(), R[int(25.0 * SR):int(25.125 * SR)].copy()])
for k in range(8):
    seg = chop[:, : int(0.125 * SR) - int(0.01 * SR)] * (0.35 + 0.04 * k)
    place(seg, 26.0 + k * 0.125, 1.0)
    place(tick(0.25, 3000), 26.0 + k * 0.125, 1.0)
place(riser(1.0, 0.35), 26.0, 1.0)
place(sub(midi('C2'), 1.0, 0.35), 26.0, 1.0)

# ACT VII (27-30): the title. One last hit, then the warm piano comes home.
place(boom(1.2, 2.4, 40), 27.0, 1.0, send=0.6)
place(crash(0.4, 2.2), 27.0, 1.0, send=0.5)
place(supersaw([midi(n) for n in CH['F']], 2.5, 0.25, 2000), 27.0, 1.0, send=0.6)
place(pad([midi(n) for n in CH['Fmaj7']], 2.9, 0.1, 1200), 27.0, 1.0, send=0.5)
for i, n in enumerate(CH['Fmaj7']):
    place(piano(midi(n), 2.2, 0.2, 0.35), 27.35 + i * 0.12, 1.0, pan=-0.2 + i * 0.12, send=0.5)
for t0, n, d in MOTIF[:3]:
    place(piano(midi(n), d * 1.4, 0.26, 0.5), 27.6 + t0, 1.0, pan=0.15, send=0.55)
place(crackle(3.0, 0.015), 27.0, 1.0)

# --- mix bus --------------------------------------------------------------------------------
# sidechain the busy drop/build against the kicks
t = np.arange(N) / SR
kicks = np.array(sorted(kicks))
idx = np.searchsorted(kicks, t, side='right') - 1
since = np.where(idx >= 0, t - kicks[np.clip(idx, 0, None)], 10)
duck = 1 - 0.35 * np.exp(-since / 0.09) * ((t >= 10) & (t < 26))
L *= duck
R *= duck

# reverb: synthetic stereo hall
irn = int(round(2.6 * SR))
tir = np.arange(irn) / SR
ir = np.stack([lp(noise(2.6), 5000) * np.exp(-tir / 0.55), lp(noise(2.6), 5000) * np.exp(-tir / 0.55)])
ir /= np.sqrt(np.sum(ir ** 2, axis=1, keepdims=True))
wet = np.stack([signal.fftconvolve(SEND[0], ir[0])[:N], signal.fftconvolve(SEND[1], ir[1])[:N]]) * 0.6
mix = np.stack([L, R]) + wet

# silence before the drop is part of the arrangement: gate everything but the Act V sounds
gate = np.ones(N)
a, b = int(18.0 * SR), int(19.0 * SR)
fade = np.linspace(1, 0.06, int(0.04 * SR))
gate[a:a + len(fade)] = fade
gate[a + len(fade):b] = 0.06
mix *= gate
act5 = np.zeros((2, N))
# re-add the Act V foreground cleanly (keys, enter, suck-in) above the gate
for fn, tt, g in ((lambda: keyclick(0.3), 18.33, 1.0), (lambda: keyclick(0.3), 18.44, 1.0), (lambda: keyclick(0.6), 18.75, 1.0)):
    s = fn()
    i = int(tt * SR)
    act5[:, i:i + len(s)] += s * g
s = riser(0.25, 0.45, 600, 12000)
act5[:, int(18.75 * SR):int(18.75 * SR) + len(s)] += s
mix += act5

# section gain automation: the arc from intimate to huge
auto = np.interp(t, [0, 3.9, 4.0, 7.9, 8.0, 8.5, 9.4, 10.0, 15.9, 16.0, 17.9, 19.0, 25.9, 26.0, 27.0, 30.0],
                    [0.42, 0.45, 0.5, 0.85, 1.0, 0.75, 0.55, 0.72, 0.85, 0.92, 1.0, 1.0, 1.0, 0.8, 0.95, 0.9])
mix *= auto

# gentle master: tilt EQ, soft clip, normalise, fade out
mix = np.stack([hp(mix[0], 28), hp(mix[1], 28)])
mix = np.tanh(mix * 1.1) / np.tanh(1.1)
mix /= np.max(np.abs(mix)) / 0.89
fo = int(0.5 * SR)
mix[:, -fo:] *= np.linspace(1, 0, fo) ** 2

out = os.path.join(HERE, 'score.wav')
from scipy.io import wavfile
wavfile.write(out, SR, (mix.T * 32767).astype(np.int16))
print('wrote', out, f'{DUR}s', f'peak {np.max(np.abs(mix)):.2f}')
