#!/usr/bin/env python3
"""Generate the GRAMVERTER Open Graph social-share image (1200x630)."""
from PIL import Image, ImageDraw, ImageFont, ImageFilter

W, H = 1200, 630
BG = (10, 11, 20)
PURPLE = (124, 92, 255)
AMBER = (255, 179, 0)
WHITE = (242, 244, 255)
MUTED = (139, 143, 168)
GREEN = (30, 203, 139)

FONT_DIR = "/usr/share/fonts/truetype/dejavu/"
def bold(sz):    return ImageFont.truetype(FONT_DIR + "DejaVuSans-Bold.ttf", sz)
def regular(sz): return ImageFont.truetype(FONT_DIR + "DejaVuSans.ttf", sz)

img = Image.new("RGB", (W, H), BG)

# --- Soft background orbs ---
def orb(center, radius, color, alpha):
    layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    cx, cy = center
    d.ellipse([cx - radius, cy - radius, cx + radius, cy + radius],
              fill=color + (alpha,))
    layer = layer.filter(ImageFilter.GaussianBlur(110))
    img.paste(Image.alpha_composite(img.convert("RGBA"), layer).convert("RGB"), (0, 0))

orb((130, 90), 230, PURPLE, 150)
orb((1080, 560), 210, AMBER, 90)

draw = ImageDraw.Draw(img)

def text_w(s, font):
    return draw.textbbox((0, 0), s, font=font)[2]

def hgradient(size, c1, c2):
    """Horizontal two-colour gradient image."""
    w, h = size
    row = Image.new("RGB", (w, 1))
    px = row.load()
    for x in range(w):
        t = x / max(w - 1, 1)
        px[x, 0] = tuple(int(c1[i] + (c2[i] - c1[i]) * t) for i in range(3))
    return row.resize((w, h))

def gradient_text(xy, s, font, c1, c2):
    """Draw text filled with a horizontal gradient."""
    bbox = draw.textbbox((0, 0), s, font=font)
    w, h = bbox[2] - bbox[0], bbox[3] - bbox[1]
    mask = Image.new("L", (w + 4, h + 4), 0)
    ImageDraw.Draw(mask).text((2 - bbox[0], 2 - bbox[1]), s, font=font, fill=255)
    grad = hgradient((w + 4, h + 4), c1, c2)
    img.paste(grad, (xy[0], xy[1]), mask)

def rounded(xy, wh, radius, fill=None, outline=None, width=1):
    x, y = xy
    draw.rounded_rectangle([x, y, x + wh[0], y + wh[1]], radius=radius,
                           fill=fill, outline=outline, width=width)

# --- Logo: "GRAM" gradient + "VERTER" white ---
logo_f = bold(82)
x0, y0 = 90, 96
gradient_text((x0, y0), "GRAM", logo_f, AMBER, PURPLE)
draw.text((x0 + text_w("GRAM", logo_f), y0), "VERTER", font=logo_f, fill=WHITE)

# --- Tagline ---
draw.text((92, 200), "Real-time crypto & fiat converter",
          font=regular(34), fill=MUTED)

# --- Sample conversion card ---
card_y = 280
rounded((90, card_y), (1020, 150), 26,
        fill=(22, 24, 38), outline=(255, 255, 255, 30), width=2)
big = bold(60)
draw.text((130, card_y + 42), "1 BTC", font=big, fill=WHITE)
eq_x = 130 + text_w("1 BTC", big) + 34
draw.text((eq_x, card_y + 42), "=", font=big, fill=MUTED)
res_x = eq_x + text_w("=", big) + 34
draw.text((res_x, card_y + 42), "$64,210.00", font=big, fill=GREEN)

# --- Direction pills ---
pills = ["Crypto → Fiat", "Fiat → Crypto", "Crypto → Crypto"]
pf = bold(26)
px = 92
py = 470
for p in pills:
    pw = text_w(p, pf) + 44
    rounded((px, py), (pw, 52), 26, fill=(124, 92, 255, 40),
            outline=(124, 92, 255), width=2)
    draw.text((px + 22, py + 11), p, font=pf, fill=WHITE)
    px += pw + 18

# --- Footer line ---
draw.text((92, 558), "100+ tokens  ·  19 currencies (incl. Naira)  ·  live prices  ·  free",
          font=regular(25), fill=MUTED)
handle_f = bold(25)
draw.text((W - 92 - text_w("@TheFiregram", handle_f), 558),
          "@TheFiregram", font=handle_f, fill=AMBER)

img.save("og-image.png", "PNG")
print("wrote og-image.png", img.size)
