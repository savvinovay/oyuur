# Draws the Oyuur home-screen icon and the iPhone launch screens for the web version
# (OYUUR-17), and the Android app icon and splash from the same tree (OYUUR-18). Colors are the app's own: day sky (ui/sky/colors.ts) and the oak's
# leaves and wood (ui/trees/colors.ts).
#   python scripts/web-icons.py      (from app/; needs Pillow)
# Writes assets/web-icon.png (1024, the source) and public/icons/*; for Android assets/icon.png,
# assets/android-icon-{foreground,background,monochrome}.png and assets/splash-icon{,-dark}.png (app.json).
from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'public' / 'icons'
SKY_TOP, SKY_HORIZON = (0x9F, 0xE1, 0xF5), (0xEA, 0xFB, 0xFF)
HILL, HILL_DARK = (0x8B, 0xC3, 0x4A), (0x6F, 0xA8, 0x36)
LEAF_LIGHT, LEAF, LEAF_DARK = (0xB9, 0xDE, 0x6C), (0x8B, 0xC3, 0x4A), (0x5E, 0x9A, 0x2C)
TRUNK, TRUNK_DARK = (0x8A, 0x6A, 0x3B), (0x6B, 0x50, 0x30)
# The leaves under the night sky (the Android splash in dark mode): quieter, so the tree is not a sticker.
NIGHT_LEAVES = (0x9C, 0xCB, 0x5A), (0x6F, 0xA8, 0x3A), (0x3F, 0x6F, 0x1E)


def gradient(w, h, top, bottom):
    img = Image.new('RGB', (w, h))
    d = ImageDraw.Draw(img)
    for y in range(h):
        t = y / max(1, h - 1)
        d.line([(0, y), (w, y)], fill=tuple(round(a + (b - a) * t) for a, b in zip(top, bottom)))
    return img


def tree(size, sky=True, scale=1.0, ground='hill', ink=None, leaves=None):
    """The icon at 4x and scaled down, so the edges are smooth. Full bleed: iOS rounds the corners itself.
    The tree stays inside the middle 80 %, so Android may cut it to a circle (maskable).
    scale shrinks the drawing around the middle (Android's adaptive layers), ground is 'hill', 'mound'
    or None, ink paints everything one color (Android 13+ themed icons), leaves swaps the three greens."""
    leaf_light, leaf, leaf_dark = leaves or (LEAF_LIGHT, LEAF, LEAF_DARK)
    s = size * 4
    u = s / 1024
    img = gradient(s, s, SKY_TOP, SKY_HORIZON) if sky else Image.new('RGBA', (s, s), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    at = lambda v: (512 + (v - 512) * scale) * u
    def e(cx, cy, rx, ry, fill):
        d.ellipse([at(cx - rx), at(cy - ry), at(cx + rx), at(cy + ry)], fill=ink or fill)
    def poly(points, fill):
        d.polygon([(at(x), at(y)) for x, y in points], fill=ink or fill)
    if ground == 'hill':
        e(512, 1180, 760, 330, HILL_DARK)
        e(512, 1200, 700, 330, HILL)
    elif ground == 'mound':
        # A small patch of grass under the trunk: the splash has no sky to hold a hill.
        e(512, 892, 210, 46, HILL_DARK)
        e(512, 886, 196, 40, HILL)
    # Trunk with a darker side.
    poly([(458, 880), (478, 560), (546, 560), (566, 880)], TRUNK)
    poly([(518, 880), (530, 560), (546, 560), (566, 880)], TRUNK_DARK)
    # Crown: dark underside, the leaves, light tops.
    for cx, cy, r in [(360, 520, 170), (664, 520, 170), (512, 560, 200)]:
        e(cx, cy + 22, r, r, leaf_dark)
    for cx, cy, r in [(360, 500, 165), (664, 500, 165), (512, 380, 215), (512, 540, 190)]:
        e(cx, cy, r, r, leaf)
    if not ink:
        for cx, cy, r in [(330, 450, 80), (470, 300, 105), (630, 450, 70)]:
            e(cx, cy, r, r, leaf_light)
    return img.resize((size, size), Image.LANCZOS)


# Android adaptive icons are 108 dp layers; the launcher shows the middle 72 dp (2/3) in its own shape
# and only the middle 66 dp circle is never cut. The web icon shrunk to 2/3 fills that view the same way.
ADAPTIVE = 72 / 108


def adaptive_background(size):
    """The sky layer: the same gradient as the web icon over the part the launcher shows, held past it,
    and the hill, so the tree on the front layer moves over it when Android plays with the icon."""
    img = Image.new('RGB', (size, size))
    d = ImageDraw.Draw(img)
    lo = size * (1 - ADAPTIVE) / 2
    for y in range(size):
        t = min(1, max(0, (y - lo) / (size * ADAPTIVE)))
        d.line([(0, y), (size, y)], fill=tuple(round(a + (b - a) * t) for a, b in zip(SKY_TOP, SKY_HORIZON)))
    ground = Image.new('RGBA', (size * 4, size * 4), (0, 0, 0, 0))
    g = ImageDraw.Draw(ground)
    u = 4 * size / 1024
    at = lambda v: (512 + (v - 512) * ADAPTIVE) * u
    for cx, cy, rx, ry, fill in [(512, 1180, 760, 330, HILL_DARK), (512, 1200, 700, 330, HILL)]:
        g.ellipse([at(cx - rx), at(cy - ry), at(cx + rx), at(cy + ry)], fill=fill)
    return Image.alpha_composite(img.convert('RGBA'), ground.resize((size, size), Image.LANCZOS)).convert('RGB')


def launch(w, h, icon):
    """A launch screen: the day sky with the icon tree in the middle (iOS shows it while the page loads)."""
    img = gradient(w, h, SKY_TOP, SKY_HORIZON)
    side = round(min(w, h) * 0.42)
    mark = icon.resize((side, side), Image.LANCZOS)
    mask = Image.new('L', (side, side), 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, side - 1, side - 1], radius=round(side * 0.225), fill=255)
    shadow = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    x, y = (w - side) // 2, (h - side) // 2
    ImageDraw.Draw(shadow).rounded_rectangle([x, y + side * 0.03, x + side, y + side * 1.03], radius=round(side * 0.225), fill=(60, 120, 140, 70))
    shadow = shadow.filter(ImageFilter.GaussianBlur(side * 0.04))
    img = Image.alpha_composite(img.convert('RGBA'), shadow).convert('RGB')
    img.paste(mark, (x, y), mask)
    return img


# Portrait iPhone screens in device pixels (CSS width x height x pixel ratio).
IPHONES = [(320, 568, 2), (375, 667, 2), (414, 736, 3), (375, 812, 3), (414, 896, 2), (414, 896, 3),
           (390, 844, 3), (428, 926, 3), (393, 852, 3), (430, 932, 3), (402, 874, 3), (420, 912, 3), (440, 956, 3)]

if __name__ == '__main__':
    OUT.mkdir(parents=True, exist_ok=True)
    big = tree(1024)
    big.save(ROOT / 'assets' / 'web-icon.png', optimize=True)
    for size, name in [(180, 'apple-touch-icon.png'), (192, 'icon-192.png'), (512, 'icon-512.png')]:
        tree(size).save(OUT / name, optimize=True)
    for cw, ch, r in IPHONES:
        launch(cw * r, ch * r, big).save(OUT / f'launch-{cw}x{ch}@{r}x.png', optimize=True)
    assets = ROOT / 'assets'
    big.save(assets / 'icon.png', optimize=True)
    tree(1024, sky=False, scale=ADAPTIVE, ground=None).save(assets / 'android-icon-foreground.png', optimize=True)
    adaptive_background(1024).save(assets / 'android-icon-background.png', optimize=True)
    # Themed icons sit among plain system glyphs: smaller, and a mound instead of a heavy hill band.
    tree(1024, sky=False, scale=0.55, ground='mound', ink=(255, 255, 255)).save(assets / 'android-icon-monochrome.png', optimize=True)
    # Android 12+ cuts the splash icon to a circle of 2/3 of it, like an adaptive icon.
    tree(1024, sky=False, scale=ADAPTIVE, ground='mound').save(assets / 'splash-icon.png', optimize=True)
    tree(1024, sky=False, scale=ADAPTIVE, ground='mound', leaves=NIGHT_LEAVES).save(assets / 'splash-icon-dark.png', optimize=True)
    print('ok')
