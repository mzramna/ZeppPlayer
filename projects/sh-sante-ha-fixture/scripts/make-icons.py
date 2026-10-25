#!/usr/bin/env python3
"""Draw the 32x32 white glyph icons used by utils/ui.js with Pillow primitives.

Each glyph is drawn at 4x (128x128) on a transparent canvas, then downscaled
with LANCZOS for anti-aliasing. Run from the repo root:

    python3 -I scripts/make-icons.py
"""
import math
import os

from PIL import Image, ImageDraw

FINAL = 32
CANVAS = FINAL * 4           # drawn at 4x, then downscaled
STROKE = 12                  # 3px at 32px
WHITE = (255, 255, 255, 255)
CLEAR = (255, 255, 255, 0)   # transparent, same RGB as the glyph so LANCZOS adds no fringe
OUT_DIR = os.path.normpath(os.path.join(
    os.path.dirname(os.path.abspath(__file__)), "..", "assets", "common.r", "icons"))


def canvas():
    img = Image.new("RGBA", (CANVAS, CANVAS), CLEAR)
    return img, ImageDraw.Draw(img)


def dot(d, x, y, r=STROKE / 2, fill=WHITE):
    d.ellipse([x - r, y - r, x + r, y + r], fill=fill)


def stroke(d, pts, closed=False):
    """Stroked polyline with round joins and caps, centred on the points."""
    pts = list(pts) + ([pts[0]] if closed else [])
    d.line(pts, fill=WHITE, width=STROKE)
    for x, y in pts:
        dot(d, x, y)


def arc(cx, cy, r, a0, a1, n=72):
    """Points on a circle; angles in degrees, 0 = 3 o'clock, increasing clockwise."""
    return [(cx + r * math.cos(math.radians(a)), cy + r * math.sin(math.radians(a)))
            for a in (a0 + (a1 - a0) * i / n for i in range(n + 1))]


def ring(d, cx, cy, r):
    stroke(d, arc(cx, cy, r, 0, 360, 96), closed=True)


def rrect(x0, y0, x1, y1, r):
    """Centre-line outline of a rounded rectangle."""
    pts = []
    for cx, cy, a0 in ((x1 - r, y0 + r, -90), (x1 - r, y1 - r, 0),
                       (x0 + r, y1 - r, 90), (x0 + r, y0 + r, 180)):
        pts += arc(cx, cy, r, a0, a0 + 90, 12)
    return pts


def bezier(p0, p1, p2, n=24):
    pts = []
    for i in range(n + 1):
        t = i / n
        pts.append(((1 - t) ** 2 * p0[0] + 2 * (1 - t) * t * p1[0] + t * t * p2[0],
                    (1 - t) ** 2 * p0[1] + 2 * (1 - t) * t * p1[1] + t * t * p2[1]))
    return pts


def arrowhead(d, cx, cy, r, a):
    """Filled arrow head at angle a on a circle, pointing in the clockwise travel direction."""
    t = math.radians(a)
    px, py = cx + r * math.cos(t), cy + r * math.sin(t)
    tx, ty = -math.sin(t), math.cos(t)
    nx, ny = math.cos(t), math.sin(t)
    d.polygon([(px + 18 * tx, py + 18 * ty),
               (px + 14 * nx, py + 14 * ny),
               (px - 14 * nx, py - 14 * ny)], fill=WHITE)


def light():
    img, d = canvas()
    globe = arc(64, 50, 32, 150, 390, 60)
    stroke(d, globe)
    stroke(d, [globe[0], (48, 94), (80, 94), globe[-1]])
    stroke(d, [(52, 108), (76, 108)])
    return img


def power_icon():
    img, d = canvas()
    stroke(d, arc(64, 72, 38, -60, 240, 90))
    stroke(d, [(64, 18), (64, 72)])
    return img


def fan():
    """Three swept teardrop blades, 120 degrees apart, around a small hub."""
    img, d = canvas()
    cx = cy = 64
    for k in range(3):
        a = math.radians(-90 + 120 * k)
        ex, ey = math.cos(a), math.sin(a)      # blade axis
        px, py = -ey, ex                       # across the blade

        def pt(u, v):
            return (cx + u * ex + v * px, cy + u * ey + v * py)

        # Blade in local (u, v): narrow at the hub, bulging to a round tip,
        # with the centre line swept sideways (v = 10 t^2) like a fan blade.
        ts = [i / 20 for i in range(21)]
        plus = [pt(10 + 24 * t, 10 * t * t + (3 + 12 * t)) for t in ts]
        minus = [pt(10 + 24 * t, 10 * t * t - (3 + 12 * t)) for t in reversed(ts)]
        cap = [pt(34 + 15 * math.cos(math.radians(th)), 10 + 15 * math.sin(math.radians(th)))
               for th in (90 - 180 * i / 24 for i in range(25))]   # round tip, side to side
        d.polygon(plus + cap + minus, fill=WHITE)
    dot(d, cx, cy, 10)
    return img


def climate():
    img, d = canvas()
    yb = 88 - math.sqrt(22 ** 2 - 10 ** 2)     # where the bulb meets the tube sides
    a0 = math.degrees(math.atan2(yb - 88, 10))
    a1 = math.degrees(math.atan2(yb - 88, -10)) + 360
    stroke(d, arc(64, 30, 10, 180, 360, 24) + arc(64, 88, 22, a0, a1, 80) + [(54, 30)])
    d.rectangle([62, 44, 66, 88], fill=WHITE)  # mercury column
    dot(d, 64, 88, 12)
    return img


def cover():
    img, d = canvas()
    stroke(d, rrect(18, 18, 110, 110, 6), closed=True)
    for y in (42, 64, 86):
        stroke(d, [(18, y), (110, y)])
    return img


def lock():
    img, d = canvas()
    stroke(d, [(40, 60), (40, 46)] + arc(64, 46, 24, 180, 360, 36) + [(88, 60)])
    stroke(d, rrect(26, 56, 102, 110, 10), closed=True)
    d.ellipse([56, 70, 72, 86], fill=WHITE)   # keyhole head
    d.rectangle([60, 78, 68, 96], fill=WHITE)  # keyhole stem
    return img


def vacuum():
    img, d = canvas()
    d.ellipse([64 - 52, 64 - 52, 64 + 52, 64 + 52], fill=WHITE)   # robot body
    r = 24                                                         # inner circle, cut out
    d.ellipse([64 - r - 4, 64 - r - 4, 64 + r + 4, 64 + r + 4], outline=CLEAR, width=8)
    return img


def media():
    img, d = canvas()
    stroke(d, [(54, 96), (54, 28), (104, 22), (104, 84)])
    dot(d, 42, 96, 14)
    dot(d, 92, 84, 14)
    return img


def alarm():
    img, d = canvas()
    shield = ([(64, 20), (104, 34), (104, 64)]
              + bezier((104, 64), (104, 94), (64, 110))
              + bezier((64, 110), (24, 94), (24, 64))
              + [(24, 34)])
    stroke(d, shield, closed=True)
    stroke(d, [(64, 44), (64, 70)])
    dot(d, 64, 88, 7)
    return img


def camera():
    img, d = canvas()
    stroke(d, [(44, 42), (50, 26), (78, 26), (84, 42)])   # top bump
    stroke(d, rrect(18, 42, 110, 106, 12), closed=True)
    stroke(d, arc(64, 74, 14, 0, 360, 64), closed=True)   # lens
    return img


def scene():
    img, d = canvas()
    pts = []
    for i in range(120):
        t = 2 * math.pi * i / 120
        c, s = math.cos(t), math.sin(t)
        pts.append((64 + 54 * math.copysign(abs(c) ** 2.8, c),
                    64 + 54 * math.copysign(abs(s) ** 2.8, s)))
    d.polygon(pts, fill=WHITE)
    return img


def scripts_icon():
    img, d = canvas()
    stroke(d, rrect(18, 18, 110, 110, 20), closed=True)
    d.polygon([(50, 42), (50, 86), (86, 64)], fill=WHITE)
    return img


def button():
    img, d = canvas()
    ring(d, 64, 64, 46)
    dot(d, 64, 64, 16)
    return img


def gauge(filled):
    img, d = canvas()
    cx, cy, r = 64, 87, 46
    tip = (cx + 34 * math.cos(math.radians(-50)), cy + 34 * math.sin(math.radians(-50)))
    if filled:
        d.pieslice([cx - r, cy - r, cx + r, cy + r], 180, 360, fill=WHITE)
        d.line([(cx, cy), tip], fill=CLEAR, width=8)   # needle cut out of the disc
        dot(d, cx, cy, 8, CLEAR)
    else:
        stroke(d, arc(cx, cy, r, 180, 360, 48))
        stroke(d, [(cx, cy), tip])
        dot(d, cx, cy, 9)
    return img


def star():
    img, d = canvas()
    pts = []
    for i in range(10):
        r = 46 if i % 2 == 0 else 24
        a = math.radians(-90 + 36 * i)
        pts.append((64 + r * math.cos(a), 68 + r * math.sin(a)))
    stroke(d, pts, closed=True)
    return img


def area():
    img, d = canvas()
    stroke(d, [(22, 62), (64, 22), (106, 62), (106, 110), (22, 110)], closed=True)
    stroke(d, [(54, 110), (54, 86), (74, 86), (74, 110)])
    return img


def sync():
    img, d = canvas()
    for a0, a1 in ((200, 340), (20, 160)):
        stroke(d, arc(64, 64, 40, a0, a1, 48))
        arrowhead(d, 64, 64, 40, a1)
    return img


def devices():
    img, d = canvas()
    for x, y in ((24, 24), (76, 24), (24, 76), (76, 76)):
        stroke(d, rrect(x, y, x + 28, y + 28, 5), closed=True)
    return img


ICONS = {
    "light": light,
    "power_icon": power_icon,
    "fan": fan,
    "climate": climate,
    "cover": cover,
    "lock": lock,
    "vacuum": vacuum,
    "media": media,
    "alarm": alarm,
    "camera": camera,
    "scene": scene,
    "scripts_icon": scripts_icon,
    "button": button,
    "sensor": lambda: gauge(False),
    "star": star,
    "area": area,
    "sync": sync,
    "devices": devices,
    "sensors_cat": lambda: gauge(True),
    "scripts_cat": scripts_icon,
}


# App icon: the house glyph on a Home Assistant blue disc. Zepp OS wants at least
# 124 px; 248 px keeps it sharp when the build scales it down per device.
APP_ICON = 248
APP_ICON_PATH = os.path.join(os.path.dirname(OUT_DIR), "icon.png")


def app_icon():
    big = APP_ICON * 4
    k = big / CANVAS * 0.62  # house glyph (area) coordinates scaled into the disc
    off = big * 0.19
    img = Image.new("RGBA", (big, big), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.ellipse((0, 0, big - 1, big - 1), fill=(24, 188, 242, 255))
    w = round(STROKE * k)
    for line, closed in (
        ([(22, 62), (64, 22), (106, 62), (106, 110), (22, 110)], True),
        ([(54, 110), (54, 86), (74, 86), (74, 110)], False),
    ):
        pts = [(off + x * k, off + y * k) for x, y in line]
        pts += [pts[0]] if closed else []
        d.line(pts, fill=WHITE, width=w)
        for x, y in pts:
            d.ellipse((x - w / 2, y - w / 2, x + w / 2, y + w / 2), fill=WHITE)
    return img.resize((APP_ICON, APP_ICON), Image.Resampling.LANCZOS)


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    app_icon().save(APP_ICON_PATH)
    print("wrote", os.path.relpath(APP_ICON_PATH))
    for name, make in ICONS.items():
        img = make().resize((FINAL, FINAL), Image.Resampling.LANCZOS)
        # LANCZOS leaves 1-3/255 ringing alpha outside the glyph; clear it.
        img.putalpha(img.getchannel("A").point(lambda a: a if a >= 8 else 0))
        img.save(os.path.join(OUT_DIR, name + ".png"))
        print("wrote", name + ".png")


if __name__ == "__main__":
    main()
