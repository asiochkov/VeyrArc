"""Builds the app icons from tools/icon/logo-source.png (white mark on #1E1E1E).
   python3 tools/icon/make.py   (needs Pillow)"""
from pathlib import Path
from PIL import Image, ImageDraw

HERE = Path(__file__).parent
PUB = HERE.parent.parent / 'public'
BG = (5, 7, 10, 255)  # --bg #05070A

src = Image.open(HERE / 'logo-source.png').convert('RGBA')
lum = src.convert('L')
# background ≈ 30; everything clearly brighter is the mark (soft 25-level ramp keeps anti-aliasing)
alpha = lum.point(lambda v: 0 if v <= 34 else 255 if v >= 60 else int((v - 34) * 255 / 26))
mark = src.copy(); mark.putalpha(alpha)
mark = mark.crop(alpha.getbbox())
w, h = mark.size
side = max(w, h)
sq = Image.new('RGBA', (side, side), (0, 0, 0, 0))
sq.paste(mark, ((side - w) // 2, (side - h) // 2), mark)
sq.resize((512, 512), Image.LANCZOS).save(PUB / 'logo-mark.png')  # used as a CSS mask in the app

def icon(size, scale, name, radius=0, bg=BG):
    im = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    ImageDraw.Draw(im).rounded_rectangle([0, 0, size - 1, size - 1], radius=radius, fill=bg)
    m = sq.resize((int(size * scale),) * 2, Image.LANCZOS)
    o = (size - m.size[0]) // 2
    im.paste(m, (o, o + int(size * 0.02)), m)
    im.save(PUB / name)

icon(192, 0.66, 'icon-192.png')
icon(512, 0.66, 'icon-512.png')
icon(512, 0.52, 'icon-maskable-512.png')   # safe zone for round/squircle masks
icon(180, 0.62, 'apple-touch-icon.png')
icon(64, 0.78, 'favicon.png', radius=14)
icon(32, 0.8, 'favicon-32.png', radius=7)
print('ok', sq.size)
