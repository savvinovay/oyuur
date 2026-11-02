# Previews of the Android icon and splash from the files Expo prebuild generated.
import sys
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
PB = Path(sys.argv[1]); OUT = Path(sys.argv[2])
load = lambda n: Image.open(PB / 'mipmap-xxxhdpi' / n).convert('RGBA')
fg, bg, mono = load('ic_launcher_foreground.webp'), load('ic_launcher_background.webp'), load('ic_launcher_monochrome.webp')
legacy = load('ic_launcher.webp')
try:
    font = ImageFont.truetype('C:/Windows/Fonts/segoeui.ttf', 30); small = ImageFont.truetype('C:/Windows/Fonts/segoeui.ttf', 22)
except Exception:
    font = small = ImageFont.load_default()

def mask(shape, s):
    m = Image.new('L', (s * 4, s * 4), 0); d = ImageDraw.Draw(m); S = s * 4
    if shape == 'circle': d.ellipse([0, 0, S - 1, S - 1], fill=255)
    elif shape == 'squircle': d.rounded_rectangle([0, 0, S - 1, S - 1], radius=S * 0.3, fill=255)
    elif shape == 'square': d.rounded_rectangle([0, 0, S - 1, S - 1], radius=S * 0.08, fill=255)
    elif shape == 'teardrop':
        d.rounded_rectangle([0, 0, S - 1, S - 1], radius=S // 2, fill=255); d.rectangle([S // 2, S // 2, S - 1, S - 1], fill=255)
    return m.resize((s, s), Image.LANCZOS)

def adaptive(s, themed=None):
    """The launcher shows the middle 72 of 108 dp."""
    if themed:
        layer = Image.new('RGBA', mono.size, themed[0]); ink = Image.new('RGBA', mono.size, themed[1]); layer.paste(ink, (0, 0), mono)
    else:
        layer = Image.alpha_composite(bg, fg)
    w = layer.size[0]; c = round(w * (1 - 72 / 108) / 2)
    return layer.crop((c, c, w - c, w - c)).resize((s, s), Image.LANCZOS)

def sheet(name, back, ink, themed=None):
    shapes = ['circle', 'squircle', 'square', 'teardrop']
    S, pad = 220, 70
    img = Image.new('RGB', (pad + len(shapes) * (S + pad) + S // 2 + pad, S + 260), back); d = ImageDraw.Draw(img)
    for i, sh in enumerate(shapes):
        x = pad + i * (S + pad); y = 60
        img.paste(adaptive(S, themed), (x, y), mask(sh, S))
        d.text((x + S / 2, y + S + 30), 'Oyuur', fill=ink, font=font, anchor='mm')
        d.text((x + S / 2, y + S + 75), sh, fill=(128, 128, 128), font=small, anchor='mm')
    # Small, as on a real home screen (48 dp at ~2.6x).
    x = pad + len(shapes) * (S + pad); s = 125
    img.paste(adaptive(s, themed), (x, 60 + (S - s) // 2), mask('circle', s))
    d.text((x + s / 2, 60 + (S + s) // 2 + 25), 'Oyuur', fill=ink, font=small, anchor='mm')
    d.text((x + s / 2, 60 + S + 75), 'real size', fill=(128, 128, 128), font=small, anchor='mm')
    img.save(OUT / name)

sheet('icon-light.png', (242, 242, 246), (30, 30, 30))
sheet('icon-dark.png', (24, 24, 28), (235, 235, 235))
sheet('icon-wallpaper.png', (84, 110, 160), (255, 255, 255))
sheet('icon-themed-light.png', (242, 242, 246), (30, 30, 30), themed=((214, 232, 205, 255), (46, 79, 33, 255)))
sheet('icon-themed-dark.png', (24, 24, 28), (235, 235, 235), themed=((40, 56, 36, 255), (196, 232, 170, 255)))
# Old launchers (no adaptive icons): the full square icon.
Image.open(PB / 'mipmap-xxxhdpi' / 'ic_launcher_round.webp').save(OUT / 'icon-legacy-round.png'); legacy.save(OUT / 'icon-legacy.png')
# Splash on Android 12+: background color, the logo in the middle cut to a circle of 2/3 (if it is drawn so).
logo = Image.open(PB / 'drawable-xxxhdpi' / 'splashscreen_logo.png').convert('RGBA')
logo_night = Image.open(PB / 'drawable-night-xxxhdpi' / 'splashscreen_logo.png').convert('RGBA')
for name, color, logo in [('splash-day.png', '#C9F0FA', logo), ('splash-night.png', '#191E5E', logo_night)]:
    W, H = 412 * 2, 915 * 2
    img = Image.new('RGBA', (W, H), color)
    side = 288 * 2; lg = logo.resize((side, round(side * logo.size[1] / logo.size[0])), Image.LANCZOS)
    img.alpha_composite(lg, ((W - lg.size[0]) // 2, (H - lg.size[1]) // 2))
    img.convert('RGB').save(OUT / name)
print('ok', logo.size)
