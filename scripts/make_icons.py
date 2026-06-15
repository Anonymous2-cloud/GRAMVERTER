#!/usr/bin/env python3
"""Generate GRAMVERTER favicon / app-icon set (placeholder 'G' mark)."""
from PIL import Image, ImageDraw, ImageFont

BG = (10, 11, 20)
AMBER = (255, 179, 0)
PURPLE = (124, 92, 255)
S = 512  # master render size (downscaled for crispness)

FONT = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"


def hgradient(size, c1, c2):
    w, h = size
    row = Image.new("RGB", (w, 1))
    px = row.load()
    for x in range(w):
        t = x / max(w - 1, 1)
        px[x, 0] = tuple(int(c1[i] + (c2[i] - c1[i]) * t) for i in range(3))
    return row.resize((w, h))


def make_master():
    img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    # Rounded square background.
    draw.rounded_rectangle([0, 0, S - 1, S - 1], radius=int(S * 0.22), fill=BG)

    # Gradient "G".
    font = ImageFont.truetype(FONT, int(S * 0.74))
    glyph = "G"
    bbox = draw.textbbox((0, 0), glyph, font=font)
    gw, gh = bbox[2] - bbox[0], bbox[3] - bbox[1]
    mask = Image.new("L", (S, S), 0)
    mdraw = ImageDraw.Draw(mask)
    gx = (S - gw) // 2 - bbox[0]
    gy = (S - gh) // 2 - bbox[1]
    mdraw.text((gx, gy), glyph, font=font, fill=255)

    grad = hgradient((S, S), AMBER, PURPLE).convert("RGBA")
    img.paste(grad, (0, 0), mask)
    return img


def main():
    master = make_master()
    # PNG sizes for various uses.
    for size, name in [
        (512, "icon-512.png"),
        (192, "icon-192.png"),
        (180, "apple-touch-icon.png"),
        (32, "favicon-32.png"),
        (16, "favicon-16.png"),
    ]:
        master.resize((size, size), Image.LANCZOS).save(name, "PNG")
        print("wrote", name)

    # Multi-resolution .ico for legacy/browser tab.
    master.save("favicon.ico", sizes=[(16, 16), (32, 32), (48, 48)])
    print("wrote favicon.ico")


if __name__ == "__main__":
    main()
