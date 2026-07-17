from PIL import Image, ImageOps, ImageDraw
from pathlib import Path
from collections import deque
import sys

SRC = Path(sys.argv[1])
OUT = Path(sys.argv[2])
OUT.mkdir(parents=True, exist_ok=True)


def remove_border_white_to_transparency(image: Image.Image, threshold=242) -> Image.Image:
    rgba = image.convert("RGBA")
    px = rgba.load()
    w, h = rgba.size
    seen = bytearray(w * h)
    q = deque()

    def is_white(x, y):
        r, g, b, a = px[x, y]
        return a > 0 and r >= threshold and g >= threshold and b >= threshold

    def push(x, y):
        idx = y * w + x
        if not seen[idx] and is_white(x, y):
            seen[idx] = 1
            q.append((x, y))

    for x in range(w):
        push(x, 0)
        push(x, h - 1)
    for y in range(h):
        push(0, y)
        push(w - 1, y)

    while q:
        x, y = q.popleft()
        r, g, b, a = px[x, y]
        px[x, y] = (r, g, b, 0)
        if x > 0:
            push(x - 1, y)
        if x + 1 < w:
            push(x + 1, y)
        if y > 0:
            push(x, y - 1)
        if y + 1 < h:
            push(x, y + 1)

    return rgba


def trim_alpha(image: Image.Image, pad=0) -> Image.Image:
    bbox = image.getchannel("A").getbbox()
    if not bbox:
        return image
    left, top, right, bottom = bbox
    return image.crop((max(0, left - pad), max(0, top - pad), min(image.width, right + pad), min(image.height, bottom + pad)))


def fit_square(image: Image.Image, size: int, bg=(255, 255, 255, 0), occupancy=0.94) -> Image.Image:
    canvas = Image.new("RGBA", (size, size), bg)
    target = max(1, int(size * occupancy))
    tmp = image.copy()
    tmp.thumbnail((target, target), Image.Resampling.LANCZOS)
    canvas.alpha_composite(tmp, ((size - tmp.width) // 2, (size - tmp.height) // 2))
    return canvas


def opaque_square(image: Image.Image, size: int, bg=(255, 255, 255, 255), occupancy=0.94) -> Image.Image:
    c = fit_square(image, size, bg=bg, occupancy=occupancy)
    flat = Image.new("RGBA", c.size, bg)
    flat.alpha_composite(c)
    return flat.convert("RGB")


def maskable_square(image: Image.Image, size: int, bg=(7, 19, 33, 255), occupancy=0.82) -> Image.Image:
    canvas = Image.new("RGBA", (size, size), bg)
    target = int(size * occupancy)
    tmp = image.copy()
    tmp.thumbnail((target, target), Image.Resampling.LANCZOS)
    canvas.alpha_composite(tmp, ((size - tmp.width) // 2, (size - tmp.height) // 2))
    return canvas.convert("RGB")


def circle_icon(image: Image.Image, size: int, bg=(7, 19, 33, 255), occupancy=0.96) -> Image.Image:
    base = Image.new("RGBA", (size, size), bg)
    tmp = image.copy()
    tmp.thumbnail((int(size * occupancy), int(size * occupancy)), Image.Resampling.LANCZOS)
    base.alpha_composite(tmp, ((size - tmp.width) // 2, (size - tmp.height) // 2))
    mask = Image.new("L", (size, size), 0)
    ImageDraw.Draw(mask).ellipse((0, 0, size - 1, size - 1), fill=255)
    out = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    out.paste(base, (0, 0), mask)
    return out


def save_png(image, path):
    path.parent.mkdir(parents=True, exist_ok=True)
    image.save(path, "PNG", optimize=True)


src = Image.open(SRC)
transparent = remove_border_white_to_transparency(src, threshold=242)
trimmed = trim_alpha(transparent, pad=2)

master_dir = OUT / "00-master"
save_png(fit_square(trimmed, 1024, occupancy=0.96), master_dir / "fs-fit-master-1024.png")
save_png(fit_square(trimmed, 2048, occupancy=0.96), master_dir / "fs-fit-master-2048.png")

web_dir = OUT / "01-web-favicon"
for s in [16, 32, 48, 64, 96, 128, 256, 512]:
    save_png(fit_square(trimmed, s, occupancy=0.94), web_dir / f"favicon-{s}x{s}.png")

ico_base = fit_square(trimmed, 256, occupancy=0.94)
ico_base.save(web_dir / "favicon.ico", format="ICO", sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])
save_png(opaque_square(trimmed, 180, occupancy=0.94), web_dir / "apple-touch-icon.png")
save_png(fit_square(trimmed, 192, occupancy=0.94), web_dir / "android-chrome-192x192.png")
save_png(fit_square(trimmed, 512, occupancy=0.94), web_dir / "android-chrome-512x512.png")

pwa_dir = OUT / "02-pwa"
for s in [72, 96, 128, 144, 152, 192, 384, 512]:
    save_png(fit_square(trimmed, s, occupancy=0.94), pwa_dir / f"icon-{s}x{s}.png")
for s in [192, 512]:
    save_png(maskable_square(trimmed, s, occupancy=0.80), pwa_dir / f"icon-maskable-{s}x{s}.png")

android_dir = OUT / "03-android"
legacy = {"mipmap-mdpi": 48, "mipmap-hdpi": 72, "mipmap-xhdpi": 96, "mipmap-xxhdpi": 144, "mipmap-xxxhdpi": 192}
for folder, s in legacy.items():
    save_png(opaque_square(trimmed, s, bg=(255, 255, 255, 255), occupancy=0.94), android_dir / "res" / folder / "ic_launcher.png")
    save_png(circle_icon(trimmed, s, occupancy=0.94), android_dir / "res" / folder / "ic_launcher_round.png")

adaptive = {"mipmap-mdpi": 108, "mipmap-hdpi": 162, "mipmap-xhdpi": 216, "mipmap-xxhdpi": 324, "mipmap-xxxhdpi": 432}
for folder, s in adaptive.items():
    save_png(fit_square(trimmed, s, bg=(0, 0, 0, 0), occupancy=0.66), android_dir / "adaptive-foreground" / folder / "ic_launcher_foreground.png")
save_png(opaque_square(trimmed, 512, occupancy=0.94), android_dir / "play-store-icon-512x512.png")

ios_dir = OUT / "04-ios" / "AppIcon.appiconset"
ios_specs = [
    ("AppIcon-20@1x.png", 20), ("AppIcon-20@2x.png", 40), ("AppIcon-20@3x.png", 60),
    ("AppIcon-29@1x.png", 29), ("AppIcon-29@2x.png", 58), ("AppIcon-29@3x.png", 87),
    ("AppIcon-40@1x.png", 40), ("AppIcon-40@2x.png", 80), ("AppIcon-40@3x.png", 120),
    ("AppIcon-60@2x.png", 120), ("AppIcon-60@3x.png", 180),
    ("AppIcon-76@1x.png", 76), ("AppIcon-76@2x.png", 152), ("AppIcon-83.5@2x.png", 167),
    ("AppIcon-1024.png", 1024),
]
for filename, pixels in ios_specs:
    save_png(opaque_square(trimmed, pixels, occupancy=0.94), ios_dir / filename)

win_dir = OUT / "05-windows-tiles"
for name, size in [("mstile-70x70.png", 70), ("mstile-150x150.png", 150), ("mstile-310x310.png", 310)]:
    save_png(opaque_square(trimmed, size, bg=(7, 19, 33, 255), occupancy=0.84), win_dir / name)
wide = Image.new("RGBA", (310, 150), (7, 19, 33, 255))
tmp = trimmed.copy()
tmp.thumbnail((120, 120), Image.Resampling.LANCZOS)
wide.alpha_composite(tmp, ((310 - tmp.width) // 2, (150 - tmp.height) // 2))
save_png(wide.convert("RGB"), win_dir / "mstile-310x150.png")

extra_dir = OUT / "06-extra-common-sizes"
for s in [36, 48, 72, 96, 128, 144, 180, 192, 256, 384, 512, 1024]:
    save_png(fit_square(trimmed, s, occupancy=0.94), extra_dir / f"fs-fit-icon-{s}x{s}.png")

print("FS Fit icons generated successfully")
