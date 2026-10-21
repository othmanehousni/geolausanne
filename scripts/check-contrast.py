"""WCAG contrast of the design tokens in apps/web/src/app/globals.css.

Usage: python3 scripts/check-contrast.py
Prints the pairs listed in docs/design/design-system.md for both themes.
Translucent tokens are blended over their surface in gamma-encoded sRGB,
as browsers do.
"""
import math
import re
from pathlib import Path

css = (Path(__file__).resolve().parent.parent / "apps/web/src/app/globals.css").read_text()
def block(sel):
    i = css.index(sel + " {"); j = css.index("\n}", i); return css[i:j]
def tokens(b):
    out = {}
    for m in re.finditer(r"--([a-z-]+):\s*([^;]+);", b): out[m.group(1)] = m.group(2).strip()
    return out
root = tokens(block(":root")); dark = dict(root); dark.update(tokens(block(".dark")))
def oklch(s, theme):
    if s.startswith("var("): return oklch(theme[s[6:-1]], theme)
    m = re.match(r"oklch\(([\d.]+)\s+([\d.]+)\s+([\d.]+)(?:\s*/\s*([\d.]+)(%?))?\)", s)
    L, C, h = map(float, m.group(1, 2, 3)); a = 1.0
    if m.group(4): a = float(m.group(4)) / (100 if m.group(5) else 1)
    A = C * math.cos(math.radians(h)); B = C * math.sin(math.radians(h))
    l_ = L + 0.3963377774 * A + 0.2158037573 * B; m_ = L - 0.1055613458 * A - 0.0638541728 * B; s_ = L - 0.0894841775 * A - 1.2914855480 * B
    l, mm, ss = l_ ** 3, m_ ** 3, s_ ** 3
    rgb = [4.0767416621 * l - 3.3077115913 * mm + 0.2309699292 * ss, -1.2684380046 * l + 2.6097574011 * mm - 0.3413193965 * ss, -0.0041960863 * l - 0.7034186147 * mm + 1.7076147010 * ss]
    return [max(0, min(1, v)) for v in rgb], a
def enc(x): return 12.92 * x if x <= 0.0031308 else 1.055 * x ** (1 / 2.4) - 0.055
def dec(x): return x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4
def over(fg, bg):  # browsers blend in gamma-encoded sRGB
    (c, a), (d, _) = fg, bg
    return [dec(a * enc(x) + (1 - a) * enc(y)) for x, y in zip(c, d)], 1.0
def lum(c): return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]
def ratio(fg, bg):
    l1, l2 = sorted([lum(fg[0]), lum(bg[0])], reverse=True); return (l1 + 0.05) / (l2 + 0.05)
def tok(name, theme, alpha=None):
    c, a = oklch(theme[name], theme)
    return c, (a if alpha is None else a * alpha)
def ink_alpha(theme, a):  # foreground at alpha
    c, _ = oklch(theme["foreground"], theme); return c, a
for label, theme in (("light", root), ("dark", dark)):
    bg = tok("background", theme); card = tok("card", theme)
    muted_surface = over(ink_alpha(theme, 0.045), card)  # the trust card / info list tint
    rows = [
        ("foreground on background / card", [ratio(tok("foreground", theme), bg), ratio(tok("foreground", theme), card)]),
        ("muted-foreground on background / card / tinted card", [ratio(tok("muted-foreground", theme), bg), ratio(tok("muted-foreground", theme), card), ratio(tok("muted-foreground", theme), muted_surface)]),
        ("saffron-foreground on saffron", [ratio(tok("saffron-foreground", theme), tok("saffron", theme))]),
        ("background on upvote / downvote (pressed vote)", [ratio(bg, tok("upvote", theme)), ratio(bg, tok("downvote", theme))]),
        ("upvote / downvote / destructive / leman on card", [ratio(tok(n, theme), card) for n in ("upvote", "downvote", "destructive", "leman")]),
        ("primary-foreground on primary (ink tile, buttons)", [ratio(tok("primary-foreground", theme), tok("primary", theme))]),
        ("focus ring (solid) on card / background", [ratio(tok("ring", theme), card), ratio(tok("ring", theme), bg)]),
        ("input outline on card", [ratio(over(tok("input", theme), card), card)]),
        ("rating stars on card / empty star (ink 50 %) on card", [ratio(tok("rating", theme), card), ratio(over(ink_alpha(theme, 0.5), card), card)]),
    ]
    print("==", label)
    for name, vals in rows: print(f"{name}: {' / '.join(f'{v:.2f}' for v in vals)}")
