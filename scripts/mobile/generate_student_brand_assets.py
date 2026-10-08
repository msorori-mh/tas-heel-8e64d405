#!/usr/bin/env python3
"""Tamkeen brand assets — "Ta as a check mark" (تاء الصح).

Regenerates every launcher, splash, PWA, academy and Play-listing image from
one geometric definition. Requires only Pillow:  python3 -m pip install Pillow

Usage (from the repository root):
    python3 scripts/mobile/generate_student_brand_assets.py            # write into the repo
    python3 scripts/mobile/generate_student_brand_assets.py --out DIR  # write a copy elsewhere

The approved source of truth is assets/brand/student-tamkeen-mark-approved.png
(pinned by tests/mobile/student-brand-logo-assets-02.static.test.mjs). This
script never rewrites that file unless --write-approved-source is passed.
"""
from __future__ import annotations

import argparse
import os

from PIL import Image, ImageDraw

SS = 4  # supersampling factor for anti-aliasing

NAVY = "#1E2A63"
TEAL = "#12AAA6"
CORAL = "#FB6050"
TEAL_ON_DARK = "#2FD0C5"
CORAL_ON_DARK = "#FF7A6B"
WHITE = "#FFFFFF"
PAPER = "#FBFAF7"
STUDENT_GRADIENT = ("#2A38A0", "#151D5E")
ACADEMY_GRADIENT = ("#17B3AA", "#0A6B67")

# Mark geometry in its own units, centred on (0, 0); bounding box is 72 x 65.
CHECK = [(-29.0, 3.5), (-9.0, 25.5), (29.0, -16.5)]
DOTS = [(-24.0, -24.5), (-2.0, -24.5)]
STROKE = 14.0
DOT_R = 8.0
MARK_W = 72.0


def _rgb(hex_color: str) -> tuple[int, int, int]:
    h = hex_color.lstrip("#")
    return tuple(int(h[i : i + 2], 16) for i in (0, 2, 4))


def draw_mark(img: Image.Image, cx: float, cy: float, width: float, a: str, b: str, c: str) -> None:
    """Draw the mark on a supersampled RGBA canvas (coordinates already scaled)."""
    d = ImageDraw.Draw(img)
    k = width / MARK_W
    pts = [(cx + x * k, cy + y * k) for x, y in CHECK]
    half = STROKE * k / 2
    d.line(pts, fill=a, width=int(round(STROKE * k)), joint="curve")
    for x, y in pts:  # round caps and a clean round join
        d.ellipse((x - half, y - half, x + half, y + half), fill=a)
    for (x, y), color in zip(DOTS, (b, c)):
        px, py, r = cx + x * k, cy + y * k, DOT_R * k
        d.ellipse((px - r, py - r, px + r, py + r), fill=color)


def gradient(w: int, h: int, colors: tuple[str, str]) -> Image.Image:
    c1, c2 = _rgb(colors[0]), _rgb(colors[1])
    small = Image.new("RGB", (64, 64))
    px = small.load()
    for y in range(64):
        for x in range(64):
            t = (x + y) / 126
            px[x, y] = tuple(round(c1[i] + (c2[i] - c1[i]) * t) for i in range(3))
    return small.resize((w, h), Image.BICUBIC).convert("RGBA")


def tile(size: int, shape: str, mark_frac: float, colors=STUDENT_GRADIENT, palette=(WHITE, TEAL_ON_DARK, CORAL_ON_DARK)) -> Image.Image:
    n = size * SS
    bg = gradient(n, n, colors)
    if shape != "square":
        mask = Image.new("L", (n, n), 0)
        md = ImageDraw.Draw(mask)
        if shape == "circle":
            md.ellipse((0, 0, n - 1, n - 1), fill=255)
        else:
            md.rounded_rectangle((0, 0, n - 1, n - 1), radius=n * 0.22, fill=255)
        bg.putalpha(mask)
    draw_mark(bg, n / 2, n / 2, n * mark_frac, *palette)
    return bg.resize((size, size), Image.LANCZOS)


def plain(size: int, palette, mark_frac: float = 0.9) -> Image.Image:
    n = size * SS
    img = Image.new("RGBA", (n, n), (0, 0, 0, 0))
    draw_mark(img, n / 2, n / 2, n * mark_frac, *palette)
    return img.resize((size, size), Image.LANCZOS)


def splash(w: int, h: int) -> Image.Image:
    img = Image.new("RGBA", (w * SS, h * SS), PAPER)
    draw_mark(img, w * SS / 2, h * SS / 2, min(w, h) * SS * 0.26, NAVY, TEAL, CORAL)
    return img.resize((w, h), Image.LANCZOS).convert("RGB")


def feature_graphic() -> Image.Image:
    w, h = 1024, 500
    img = Image.new("RGBA", (w * SS, h * SS), PAPER)
    d = ImageDraw.Draw(img)
    for (cx, cy, r), color in (((70, 55, 200), "#E6F8F5"), ((954, 70, 190), "#EAF0F8"), ((930, 470, 210), "#FFF0EC")):
        d.ellipse(((cx - r) * SS, (cy - r) * SS, (cx + r) * SS, (cy + r) * SS), fill=color)
    draw_mark(img, w * SS / 2, h * SS / 2, 300 * SS, NAVY, TEAL, CORAL)
    return img.resize((w, h), Image.LANCZOS).convert("RGB")


def svg_mark(size: int, palette, mark_frac: float = 0.9, background: str = "") -> str:
    k = size * mark_frac / MARK_W
    c = size / 2
    pts = " L".join(f"{c + x * k:.3f} {c + y * k:.3f}" for x, y in CHECK)
    a, b, col_c = palette
    dots = "".join(
        f'<circle cx="{c + x * k:.3f}" cy="{c + y * k:.3f}" r="{DOT_R * k:.3f}" fill="{col}"/>'
        for (x, y), col in zip(DOTS, (b, col_c))
    )
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {size} {size}">{background}'
        f'<path d="M{pts}" fill="none" stroke="{a}" stroke-width="{STROKE * k:.3f}" stroke-linecap="round" stroke-linejoin="round"/>'
        f"{dots}</svg>\n"
    )


def svg_tile(size: int, colors, palette, mark_frac: float, radius: float) -> str:
    bg = (
        f'<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="{colors[0]}"/>'
        f'<stop offset="1" stop-color="{colors[1]}"/></linearGradient></defs>'
        f'<rect width="{size}" height="{size}" rx="{radius}" fill="url(#g)"/>'
    )
    return svg_mark(size, palette, mark_frac, bg)


def android_xml() -> dict[str, str]:
    k = 108 * 0.43 / MARK_W
    p = lambda pt: (54 + pt[0] * k, 54 + pt[1] * k)  # noqa: E731
    path = "M" + " L".join("%.2f,%.2f" % p(pt) for pt in CHECK)

    def circle(pt):
        x, y = p(pt)
        r = DOT_R * k
        return f"M{x - r:.2f},{y:.2f}a{r:.2f},{r:.2f} 0 1,0 {2 * r:.2f},0a{r:.2f},{r:.2f} 0 1,0 {-2 * r:.2f},0"

    res = "android/app/src/main/res/"
    adaptive = (
        '<?xml version="1.0" encoding="utf-8"?>\n'
        '<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">\n'
        '    <background android:drawable="@drawable/ic_launcher_background"/>\n'
        '    <foreground android:drawable="@mipmap/ic_launcher_foreground"/>\n'
        '    <monochrome android:drawable="@drawable/ic_launcher_monochrome"/>\n'
        "</adaptive-icon>\n"
    )
    return {
        res + "drawable/ic_launcher_background.xml": (
            '<?xml version="1.0" encoding="utf-8"?>\n'
            '<shape xmlns:android="http://schemas.android.com/apk/res/android" android:shape="rectangle">\n'
            f'    <gradient android:type="linear" android:angle="315" android:startColor="{STUDENT_GRADIENT[0]}" android:endColor="{STUDENT_GRADIENT[1]}"/>\n'
            "</shape>\n"
        ),
        res + "drawable/ic_launcher_monochrome.xml": (
            '<?xml version="1.0" encoding="utf-8"?>\n'
            '<vector xmlns:android="http://schemas.android.com/apk/res/android"\n'
            '    android:width="108dp" android:height="108dp"\n'
            '    android:viewportWidth="108" android:viewportHeight="108">\n'
            f'    <path android:pathData="{path}" android:strokeColor="#FF000000" android:strokeWidth="{STROKE * k:.2f}"\n'
            '        android:strokeLineCap="round" android:strokeLineJoin="round" android:fillColor="#00000000"/>\n'
            f'    <path android:pathData="{circle(DOTS[0])}" android:fillColor="#FF000000"/>\n'
            f'    <path android:pathData="{circle(DOTS[1])}" android:fillColor="#FF000000"/>\n'
            "</vector>\n"
        ),
        res + "mipmap-anydpi-v26/ic_launcher.xml": adaptive,
        res + "mipmap-anydpi-v26/ic_launcher_round.xml": adaptive,
    }


def build(out: str, write_approved_source: bool) -> int:
    images: dict[str, Image.Image] = {}
    texts: dict[str, str] = dict(android_xml())
    res = "android/app/src/main/res/"

    for density, px in (("mdpi", 48), ("hdpi", 72), ("xhdpi", 96), ("xxhdpi", 144), ("xxxhdpi", 192)):
        images[f"{res}mipmap-{density}/ic_launcher.png"] = tile(px, "rounded", 0.56)
        images[f"{res}mipmap-{density}/ic_launcher_round.png"] = tile(px, "circle", 0.54)
        fg = px * 108 // 48  # 108dp canvas; the mark stays inside the 66dp safe zone
        images[f"{res}mipmap-{density}/ic_launcher_foreground.png"] = plain(fg, (WHITE, TEAL_ON_DARK, CORAL_ON_DARK), 0.43)

    for folder, (w, h) in {
        "drawable": (480, 320),
        "drawable-land-mdpi": (480, 320), "drawable-land-hdpi": (800, 480), "drawable-land-xhdpi": (1280, 720),
        "drawable-land-xxhdpi": (1600, 960), "drawable-land-xxxhdpi": (1920, 1280),
        "drawable-port-mdpi": (320, 480), "drawable-port-hdpi": (480, 800), "drawable-port-xhdpi": (720, 1280),
        "drawable-port-xxhdpi": (960, 1600), "drawable-port-xxxhdpi": (1280, 1920),
    }.items():
        images[f"{res}{folder}/splash.png"] = splash(w, h)

    # Student web / PWA
    images["public/icons/favicon-64.png"] = tile(64, "rounded", 0.60)
    images["public/icons/icon-192.png"] = tile(192, "square", 0.56)
    images["public/icons/icon-512.png"] = tile(512, "square", 0.56)
    images["public/icons/icon-maskable-512.png"] = tile(512, "square", 0.46)
    light = (NAVY, TEAL, CORAL)
    images["public/brand/student-tamkeen-mark.png"] = plain(512, light)
    images["mobile/www/student-tamkeen-mark.png"] = plain(220, light)

    # Google Play listing
    images["docs/mobile/google-play/assets/play-icon-512.png"] = tile(512, "square", 0.56)
    images["docs/mobile/google-play/assets/feature-graphic-1024x500.png"] = feature_graphic()

    # Teacher academy: the same mark on a teal tile so the two installable apps stay distinguishable.
    academy_palette = (WHITE, NAVY, CORAL_ON_DARK)
    for base in ("public/", "apps/teacher-academy/public/"):
        images[base + "academy-icon-192.png"] = tile(192, "square", 0.50, ACADEMY_GRADIENT, academy_palette)
        images[base + "academy-icon-512.png"] = tile(512, "square", 0.46, ACADEMY_GRADIENT, academy_palette)
        images[base + "academy-apple-touch-icon.png"] = tile(180, "square", 0.56, ACADEMY_GRADIENT, academy_palette)
        texts[base + "academy-icon.svg"] = svg_tile(128, ACADEMY_GRADIENT, academy_palette, 0.58, 28)

    # Vector sources
    texts["assets/brand/student-tamkeen-mark.svg"] = svg_mark(512, light)
    texts["assets/brand/student-tamkeen-mark-on-dark.svg"] = svg_mark(512, (WHITE, TEAL_ON_DARK, CORAL_ON_DARK))
    texts["assets/brand/student-tamkeen-mark-mono.svg"] = svg_mark(512, ("#000000",) * 3)
    texts["assets/brand/student-tamkeen-app-icon.svg"] = svg_tile(512, STUDENT_GRADIENT, (WHITE, TEAL_ON_DARK, CORAL_ON_DARK), 0.56, 0)
    if write_approved_source:
        images["assets/brand/student-tamkeen-mark-approved.png"] = plain(512, light)

    for rel, img in images.items():
        path = os.path.join(out, rel)
        os.makedirs(os.path.dirname(path), exist_ok=True)
        img.save(path, "PNG", optimize=True)
    for rel, text in texts.items():
        path = os.path.join(out, rel)
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "w", encoding="utf-8", newline="\n") as fh:
            fh.write(text)
    return len(images) + len(texts)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out", default=os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")))
    parser.add_argument("--write-approved-source", action="store_true")
    args = parser.parse_args()
    count = build(args.out, args.write_approved_source)
    print(f"Tamkeen brand assets generated: {count} files -> {args.out}")
