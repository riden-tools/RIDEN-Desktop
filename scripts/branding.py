#!/usr/bin/env python3
"""Rebuild packaging assets from build/icon.png. Requires Python 3 + Pillow.

Generated files are checked in; ordinary builds do not need Python or fonts.
The NSIS artwork is drawn at 3x resolution for high DPI displays.
"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
BUILD = ROOT / 'build'
SCALE = 3
BG = '#eef1e6'
INK = '#243320'
MUTED = '#65755f'
GREEN = '#3d6832'


def font(size, bold=False):
    family = 'DejaVuSans-Bold.ttf' if bold else 'DejaVuSans.ttf'
    return ImageFont.truetype(family, round(size * SCALE))


def box(values):
    return tuple(round(v * SCALE) for v in values)


source = Image.open(BUILD / 'icon.png').convert('RGBA')
sizes = [16, 24, 32, 48, 64, 128, 256]
source.save(BUILD / 'icon.ico', sizes=[(s, s) for s in sizes])
for relative, size in [('electron/assets/icon.png', 512),
                       ('src/assets/logo.png', 128), ('public/icon.png', 64)]:
    dest = ROOT / relative
    dest.parent.mkdir(parents=True, exist_ok=True)
    source.resize((size, size), Image.Resampling.LANCZOS).save(dest)
(ROOT / 'electron/assets/icon.ico').write_bytes((BUILD / 'icon.ico').read_bytes())
for size in [16, 24, 32, 48, 64, 96, 128, 256, 512]:
    dest = BUILD / 'icons' / f'{size}x{size}.png'
    dest.parent.mkdir(parents=True, exist_ok=True)
    source.resize((size, size), Image.Resampling.LANCZOS).save(dest)

sidebar = Image.new('RGB', box((164, 314)), BG)
d = ImageDraw.Draw(sidebar)
# A quiet grid and two live measurement traces echo the application icon.
for x in range(0, 165, 16):
    d.line(box((x, 198, x, 314)), fill='#e1e7d8', width=SCALE)
for y in range(202, 315, 16):
    d.line(box((0, y, 164, y)), fill='#e1e7d8', width=SCALE)
d.rounded_rectangle(box((19, 27, 81, 89)), radius=17*SCALE, fill='#ffffff')
logo = source.resize(box((48, 48)), Image.Resampling.LANCZOS)
sidebar.paste(logo, box((26, 34)), logo)
d.text(box((19, 106)), 'RIDEN', font=font(21, True), fill=INK)
d.text(box((20, 135)), 'Desktop', font=font(12), fill=GREEN)
d.line(box((20, 164, 51, 164)), fill='#8db27d', width=2*SCALE)
d.text(box((20, 178)), 'POWER,', font=font(9, True), fill=MUTED)
d.text(box((20, 192)), 'PROGRAMMED.', font=font(9, True), fill=MUTED)
for points, color in [([(0, 259), (27, 259), (32, 277), (66, 277), (72, 231), (111, 231), (117, 250), (164, 250)], '#78a55d'),
                      ([(0, 284), (78, 284), (86, 262), (126, 262), (132, 292), (164, 292)], '#4e9da9')]:
    d.line([box(p) for p in points], fill=color, width=3*SCALE, joint='curve')
sidebar.save(BUILD / 'installerSidebar.bmp')

header = Image.new('RGB', box((150, 57)), BG)
d = ImageDraw.Draw(header)
logo = source.resize(box((32, 32)), Image.Resampling.LANCZOS)
header.paste(logo, box((109, 12)), logo)
d.text(box((8, 15)), 'RIDEN', font=font(12, True), fill=INK)
d.text(box((9, 32)), 'Desktop', font=font(7), fill=MUTED)
header.save(BUILD / 'installerHeader.bmp')
print('Updated application icons and NSIS artwork.')
