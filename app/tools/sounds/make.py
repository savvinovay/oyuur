"""
Elevate's own interface sounds (wave 2 spec, section 4.10), synthesized from scratch.

How to run (from the `app` folder):
    python tools/sounds/make.py              (every sound)
    python tools/sounds/make.py acorn spend  (only these)

What you need:
    - Python 3.9+ with numpy           (pip install --user numpy)
    - ffmpeg on the PATH               (Windows: winget install Gyan.FFmpeg;
                                        macOS: brew install ffmpeg; Linux: apt install ffmpeg)

It writes app/assets/sounds/*.mp3: mono, 44.1 kHz, 96 kbit/s, peaks at -3 dBFS, silence
cut at the edges, 5 ms attack. The random parts use fixed seeds, so every run gives the
same files. To change a sound, edit its function below and run the script again.
"""

import os
import shutil
import subprocess
import sys
import tempfile
import wave

import numpy as np

SR = 44100
PEAK_DB = -3.0
OUT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'assets', 'sounds'))


# ---- Building blocks ----

def times(dur):
    return np.arange(int(round(dur * SR))) / SR


def place(buf, sig, at):
    """Adds `sig` into `buf` starting at `at` seconds (cut at the end)."""
    i = int(round(at * SR))
    n = min(len(sig), len(buf) - i)
    if n > 0:
        buf[i:i + n] += sig[:n]
    return buf


def biquad(x, kind, freq, q=0.707, step=32):
    """RBJ cookbook filter. `freq` may be a number or one value per sample (a sweep);
    a sweep recomputes the coefficients every `step` samples."""
    freq = np.broadcast_to(np.asarray(freq, dtype=float), x.shape)
    y = np.zeros_like(x)
    x1 = x2 = y1 = y2 = 0.0
    b0 = b1 = b2 = a1 = a2 = 0.0
    for i in range(len(x)):
        if i % step == 0:
            w = 2 * np.pi * min(freq[i], SR * 0.45) / SR
            cw, alpha = np.cos(w), np.sin(w) / (2 * q)
            if kind == 'low':
                b0, b1, b2 = (1 - cw) / 2, 1 - cw, (1 - cw) / 2
            elif kind == 'high':
                b0, b1, b2 = (1 + cw) / 2, -(1 + cw), (1 + cw) / 2
            else:  # band, 0 dB peak
                b0, b1, b2 = alpha, 0.0, -alpha
            a0 = 1 + alpha
            b0, b1, b2, a1, a2 = b0 / a0, b1 / a0, b2 / a0, -2 * cw / a0, (1 - alpha) / a0
        xi = x[i]
        yi = b0 * xi + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2
        x2, x1, y2, y1 = x1, xi, y1, yi
        y[i] = yi
    return y


def white(dur, rng):
    return rng.uniform(-1, 1, len(times(dur)))


def pink(dur, rng):
    """Paul Kellet's pink noise filter over white noise."""
    w = rng.uniform(-1, 1, len(times(dur)))
    out = np.zeros_like(w)
    b = [0.0] * 6
    for i, v in enumerate(w):
        b[0] = 0.99886 * b[0] + v * 0.0555179
        b[1] = 0.99332 * b[1] + v * 0.0750759
        b[2] = 0.96900 * b[2] + v * 0.1538520
        b[3] = 0.86650 * b[3] + v * 0.3104856
        b[4] = 0.55000 * b[4] + v * 0.5329522
        b[5] = -0.7616 * b[5] - v * 0.0168980
        out[i] = sum(b) + v * 0.5362
    return out / np.max(np.abs(out))


def glide(f0, f1, dur, curve='exp'):
    """Frequency per sample from f0 to f1."""
    t = times(dur) / dur
    return f0 * (f1 / f0) ** t if curve == 'exp' else f0 + (f1 - f0) * t


def osc(freq):
    """Sine following a frequency per sample."""
    return np.sin(2 * np.pi * np.cumsum(freq) / SR)


def decay(dur, tau, attack=0.001):
    t = times(dur)
    return np.minimum(1, t / attack) * np.exp(-t / tau)


def smooth_random(dur, rate, rng):
    """Slow random wobble around 0 (−1..1), `rate` changes per second."""
    n = len(times(dur))
    k = max(2, int(dur * rate) + 2)
    pts = rng.uniform(-1, 1, k)
    return np.interp(np.linspace(0, k - 1, n), np.arange(k), pts)


def partials(freq, dur, parts):
    """A struck tone: (ratio, amplitude, decay tau) per partial."""
    t = times(dur)
    out = np.zeros_like(t)
    for ratio, amp, tau in parts:
        f = freq * ratio
        if f < SR * 0.45:
            out += amp * np.sin(2 * np.pi * f * t) * np.exp(-t / tau)
    return out * np.minimum(1, t / 0.0015)


# ---- The sounds ----

def wood_knock(freq, dur, rng):
    """A soft wooden knock: a 3 ms click rung through a resonator, ~40 ms of decay."""
    burst = white(dur, rng)
    click = int(0.003 * SR)
    burst[:click] *= np.hanning(click)
    burst[click:] = 0
    ring = biquad(burst, 'band', freq, q=14)
    ring /= np.max(np.abs(ring)) or 1
    body = partials(freq, dur, [(1, 1.0, 0.0087), (2.71, 0.25, 0.004), (0.5, 0.35, 0.012)])
    return 0.55 * ring + body


def tap(rng):
    return wood_knock(1200, 0.05, rng)


def switch(rng):
    # The same knock a fourth higher, shorter.
    return wood_knock(1200 * 4 / 3, 0.04, rng)


def pop(rng):
    dur = 0.07
    t = times(dur)
    f = np.concatenate([glide(900, 300, 0.06), np.full(len(t) - len(times(0.06)), 300.0)])
    env = np.minimum(1, t / 0.002) * (1 - t / dur) ** 2
    return osc(f) * env


def paper(rising, rng):
    """Paper rustle: noise through a band sweeping 2 → 4 kHz (or back)."""
    dur = 0.15
    t = times(dur)
    f = glide(2000, 4000, dur) if rising else glide(4000, 2000, dur)
    x = biquad(white(dur, rng), 'band', f, q=1.4)
    grain = 0.65 + 0.35 * np.abs(smooth_random(dur, 180, rng))
    env = np.sin(np.pi * np.minimum(1, t / dur)) ** (1.2 if rising else 1.6)
    # Rising: the energy late (paper lifted); falling: early (paper put down).
    tilt = (0.6 + 0.4 * t / dur) if rising else (1 - 0.4 * t / dur)
    return x * grain * env * tilt


def water(rng):
    dur = 0.9
    t = times(dur)
    stream = biquad(pink(dur, rng), 'low', 2500, q=0.6)
    stream = biquad(stream, 'high', 250, q=0.6)
    gurgle = 0.7 + 0.3 * smooth_random(dur, 14, rng)
    env = np.minimum(1, t / 0.08) * np.minimum(1, (dur - t) / 0.25)
    out = 0.45 * stream / np.max(np.abs(stream)) * gurgle * env
    # Eight drops: short sines whose pitch rises fast, like a drop hitting water.
    starts = np.sort(rng.uniform(0.08, 0.8, 8))
    for i, s in enumerate(starts):
        f0 = rng.uniform(1200, 2500)
        d = 0.03
        f = f0 * (1 + 0.7 * (1 - np.exp(-times(d) / 0.008)))
        drop = osc(f) * decay(d, 0.009, attack=0.0008) * rng.uniform(0.45, 0.8)
        place(out, drop, s)
    return out


def marimba(freq, dur):
    return partials(freq, dur, [(1, 1.0, 0.11), (4, 0.28, 0.03), (10, 0.06, 0.008)])


def grow(rng):
    dur = 0.35
    out = np.zeros(len(times(dur)))
    place(out, marimba(1046.5, dur), 0)        # C6
    place(out, marimba(1568.0, dur - 0.11), 0.11)  # G6
    return out


def bell(freq, dur, tau=0.5):
    return partials(freq, dur, [(1, 1.0, tau), (2.76, 0.45, tau * 0.5), (5.4, 0.22, tau * 0.25)])


def stage(rng):
    """A warm major chord swells for exactly 500 ms into the flash, then six bells go up."""
    dur = 2.2
    flash = 0.5
    t = times(dur)
    chord = np.zeros_like(t)
    for f in (261.63, 523.25, 659.25, 783.99):  # C4, C5 E5 G5
        for detune in (-0.8, 0.8):
            ff = f + detune
            chord += np.sin(2 * np.pi * ff * t)
            # A soft saw: a few harmonics at 1/n, kept low.
            for n in range(2, 7):
                chord += 0.22 / n * np.sin(2 * np.pi * ff * n * t + n)
    chord = biquad(chord, 'low', 1800, q=0.6)
    chord /= np.max(np.abs(chord))
    swell = np.where(t < flash, (t / flash) ** 2.2, np.exp(-(t - flash) / 0.55))
    out = 0.55 * chord * swell * np.minimum(1, (dur - t) / 0.3)
    for i, f in enumerate((1046.5, 1318.5, 1568.0, 2093.0, 2637.0, 3136.0)):  # C6 E6 G6 C7 E7 G7
        at = flash + i * 0.075
        place(out, 0.32 * (1 - 0.06 * i) * bell(f, dur - at, tau=0.4), at)
    return out


def lock(rng):
    dur = 1.2
    out = np.zeros(len(times(dur)))
    thump = biquad(white(0.06, rng), 'band', 400, q=2.2) * decay(0.06, 0.012, attack=0.001)
    thump /= np.max(np.abs(thump))
    place(out, 0.9 * thump + 0.5 * partials(200, 0.06, [(1, 1, 0.02)]), 0)
    place(out, 0.55 * bell(659.25, dur - 0.025, tau=0.45), 0.025)  # E5
    return out


def whoosh(rng):
    dur = 0.4
    t = times(dur)
    x = biquad(white(dur, rng), 'band', glide(600, 2400, dur), q=1.1)
    x /= np.max(np.abs(x))
    env = np.exp(-((t - dur * 0.55) / (dur * 0.2)) ** 2)
    return x * env


def rustle(rng):
    dur = 0.3
    t = times(dur)
    x = biquad(white(dur, rng), 'high', 3000, q=0.7)
    x = biquad(x, 'low', 9000, q=0.7)
    env = np.zeros_like(t)
    for s in (0.0, 0.05, 0.1, 0.165, 0.23):
        a = rng.uniform(0.55, 1.0)
        tau = rng.uniform(0.012, 0.022)
        k = t - s - rng.uniform(0, 0.01)
        env += np.where(k >= 0, a * np.minimum(1, k / 0.003) * np.exp(-np.maximum(k, 0) / tau), 0)
    return x * env


def plant(rng):
    dur = 0.6
    out = np.zeros(len(times(dur)))
    f = np.concatenate([glide(260, 160, 0.05), np.full(len(times(0.15)) - len(times(0.05)), 160.0)])
    thud = osc(f) * decay(0.15, 0.04, attack=0.002)
    soil = biquad(white(0.08, rng), 'low', 700, q=0.7) * decay(0.08, 0.015)
    soil /= np.max(np.abs(soil))
    place(out, thud, 0)
    place(out, 0.35 * soil, 0)
    leaves = rustle(rng)
    place(out, 0.55 * leaves / np.max(np.abs(leaves)), 0.12)
    return out


def acorn_knock(freq, dur, rng):
    """An acorn on wood: a 2 ms click rung through two resonators (freq and 1.5 × freq), ~45 ms of decay."""
    burst = white(dur, rng)
    click = int(0.002 * SR)
    burst[:click] *= np.hanning(click)
    burst[click:] = 0
    ring = biquad(burst, 'band', freq, q=16) + 0.7 * biquad(burst, 'band', freq * 1.5, q=16)
    ring /= np.max(np.abs(ring)) or 1
    body = partials(freq, dur, [(1, 1.0, 0.011), (1.5, 0.7, 0.009), (3.1, 0.15, 0.003)])
    return 0.6 * ring + body


def acorn(rng):
    """Wave 5: a light wooden "tock", a second softer one 18 ms later (9 dB down)."""
    dur = 0.07
    out = np.zeros(len(times(dur)))
    place(out, acorn_knock(1600, 0.06, rng), 0)
    place(out, 10 ** (-9 / 20) * acorn_knock(1600, 0.05, rng), 0.018)
    return out


def spend(rng):
    """Wave 5: acorns pouring out of a hand: 9 tocks from 2.2 down to 1.4 kHz over a soft low thud."""
    dur = 0.4
    out = np.zeros(len(times(dur)))
    at = 0.0
    for i in range(9):
        f = 2200 + (1400 - 2200) * i / 8
        gain = 10 ** (-8 / 20 * i / 8) * rng.uniform(0.8, 1.0)
        place(out, gain * acorn_knock(f, 0.05, rng), at)
        at += rng.uniform(0.030, 0.045)
    thud = partials(160, 0.04, [(1, 1.0, 0.012), (2, 0.3, 0.006)])
    place(out, 0.5 * thud, 0)
    return out


def unlock(rng):
    """Wave 5: "new!": marimba C6 E6 G6 C7, 90 ms apart, and a bell with a 700 ms tail."""
    dur = 1.1
    out = np.zeros(len(times(dur)))
    for i, f in enumerate((1046.5, 1318.5, 1568.0, 2093.0)):
        at = i * 0.09
        place(out, (0.8 + 0.07 * i) * marimba(f, dur - at), at)
    place(out, 0.45 * bell(2093.0, dur - 0.36, tau=0.24), 0.36)
    return out


def cheer(rng):
    """Wave 5, friends: a soft rising breath for 500 ms, then at 560 ms (the hands land on the
    avatar) two short claps 70 ms apart and a little bell."""
    dur = 0.78
    t = times(dur)
    out = np.zeros_like(t)
    air_dur = 0.5
    air = biquad(white(air_dur, rng), 'band', glide(500, 1800, air_dur), q=1.2)
    air /= np.max(np.abs(air))
    ta = times(air_dur)
    place(out, 0.28 * air * (ta / air_dur) ** 1.6 * np.minimum(1, (air_dur - ta) / 0.06 + 0.15), 0)
    for i, at in enumerate((0.56, 0.63)):
        burst = white(0.06, rng)
        click = int(0.003 * SR)
        burst[:click] *= np.hanning(click)
        burst[click:] = 0
        clap = biquad(burst, 'band', 1500, q=1.4)
        clap = biquad(clap + 0.15 * burst, 'high', 600, q=0.7) * decay(0.06, 0.012, attack=0.0005)
        clap /= np.max(np.abs(clap)) or 1
        place(out, (0.9 if i == 0 else 0.7) * clap, at)
    place(out, 0.5 * partials(1568.0, dur - 0.56, [(1, 1.0, 0.2), (2.76, 0.35, 0.1)]), 0.56)  # G6
    return out


SOUNDS = {
    # name: (function, keep the start as is — its timing matters)
    'tap': (tap, False),
    'pop': (pop, False),
    'menu-open': (lambda rng: paper(True, rng), False),
    'menu-close': (lambda rng: paper(False, rng), False),
    'switch': (switch, False),
    'water': (water, False),
    'grow': (grow, False),
    'stage': (stage, True),
    'lock': (lock, False),
    'whoosh': (whoosh, False),
    'plant': (plant, False),
    'rustle': (rustle, False),
    # Wave 5 (spec 14.2). New sounds go at the end: each sound's seed is its place in this list.
    'acorn': (acorn, False),
    'spend': (spend, False),
    'unlock': (unlock, False),
    # Friends (спец-друзья 13): the start is kept, the claps must land at 560 ms.
    'cheer': (cheer, True),
}


# ---- Finishing ----

def finish(x, keep_start):
    x = np.asarray(x, dtype=float)
    x /= np.max(np.abs(x))
    # Cut the silence at the edges (under −50 dB from the peak).
    loud = np.nonzero(np.abs(x) > 10 ** (-50 / 20))[0]
    start = 0 if keep_start else loud[0]
    x = x[start:loud[-1] + 1]
    # 5 ms attack, 5 ms release: no clicks at the cuts.
    n = min(int(0.005 * SR), len(x) // 2)
    ramp = 0.5 - 0.5 * np.cos(np.linspace(0, np.pi, n))
    x[:n] *= ramp
    x[-n:] *= ramp[::-1]
    # Peaks at −3 dBFS, measured after the ramps.
    return x / np.max(np.abs(x)) * 10 ** (PEAK_DB / 20)


def write_wav(path, x):
    pcm = np.clip(np.round(x * 32767), -32768, 32767).astype('<i2')
    with wave.open(path, 'wb') as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(pcm.tobytes())


def main():
    if not shutil.which('ffmpeg'):
        sys.exit('ffmpeg is not on the PATH (see the top of this file).')
    os.makedirs(OUT, exist_ok=True)
    only = set(sys.argv[1:])
    unknown = only - set(SOUNDS)
    if unknown:
        sys.exit(f'no such sounds: {", ".join(sorted(unknown))}')
    total = 0
    with tempfile.TemporaryDirectory() as tmp:
        for i, (name, (make, keep_start)) in enumerate(SOUNDS.items()):
            if only and name not in only:
                continue
            x = finish(make(np.random.default_rng(1000 + i)), keep_start)
            wav = os.path.join(tmp, name + '.wav')
            mp3 = os.path.join(OUT, name + '.mp3')
            write_wav(wav, x)
            subprocess.run(
                ['ffmpeg', '-y', '-loglevel', 'error', '-i', wav, '-ac', '1', '-ar', str(SR),
                 '-codec:a', 'libmp3lame', '-b:a', '96k', '-map_metadata', '-1', '-fflags', '+bitexact', mp3],
                check=True,
            )
            size = os.path.getsize(mp3)
            total += size
            print(f'{name:11s} {len(x) / SR * 1000:6.0f} ms  {size / 1024:5.1f} KB')
    print(f'all together {total / 1024:.1f} KB -> {OUT}')


if __name__ == '__main__':
    main()
