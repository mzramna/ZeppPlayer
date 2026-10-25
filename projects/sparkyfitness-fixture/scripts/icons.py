#!/usr/bin/env python3
"""Gera assets/default.w480-r/ a partir da arte oficial do SparkyFitness (script de dev, não roda no relógio).

  python3 -I scripts/icons.py <SparkyFitnessMobile/assets/icons/adaptiveicon.png> <ionicons/dist/svg>

- icon.png (248x248, exigido pela Zepp para 480 px): símbolo sobre disco branco, 4 px transparentes na borda.
- logo.png (120 px): só o símbolo, fundo transparente (o adaptiveicon oficial já é transparente).
- icons/<nome>.png (40 px): Ionicons usados pelo app Android (SparkyFitnessMobile/src/components/Icon.tsx),
  rasterizados por um Chromium headless (Playwright) porque o ImageMagick deste ambiente não tem
  rsvg-convert. Variável PW_ENTRY aponta o módulo playwright se não estiver no node_modules local.
"""
import json, os, subprocess, sys
from PIL import Image, ImageDraw

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'assets', 'default.w480-r')  # pasta = <target>.<sr>-<st> do app.json v3
BRAND = (0xE5, 0x31, 0x36)  # vermelho do símbolo, amostrado do adaptiveicon.png
ACCENT = (0x42, 0x7C, 0xF0)  # theme.accent
WATER = (0x47, 0x99, 0xC2)   # theme.water
CYCLE = (0xE9, 0x63, 0x70)   # theme.menstrual
WHITE = (0xFF, 0xFF, 0xFF)

# nome do arquivo -> (ícone Ionicons, cor). Mesmos nomes que o app Android usa em Icon.tsx.
# medication e symptoms usam o mesmo medkit-outline no Android; sync é branco porque fica sobre o botão vermelho.
ICONS = {
    'water': ('water', WATER),
    'medkit-outline': ('medkit-outline', ACCENT),
    'leaf-outline': ('leaf-outline', CYCLE),
    'happy-outline': ('happy-outline', ACCENT),
    'restaurant': ('restaurant', ACCENT),
    'timer-outline': ('timer-outline', ACCENT),
    'sync': ('sync', WHITE),
}
RENDER = 160  # 4x e reduz com LANCZOS: borda suave


def symbol(src):
    im = Image.open(src).convert('RGBA')
    return im.crop(im.getchannel('A').getbbox())


def brand_assets(src):
    sym = symbol(src)
    # logo: símbolo ocupando 120 px de largura, centralizado num quadrado transparente
    w = 120
    logo = Image.new('RGBA', (w, w), (0, 0, 0, 0))
    s = sym.resize((w, round(sym.height * w / sym.width)), Image.LANCZOS)
    logo.alpha_composite(s, (0, (w - s.height) // 2))
    logo.save(os.path.join(OUT, 'logo.png'), optimize=True)
    # icon: disco branco de 240 px (4 px de margem transparente), símbolo a ~62% do disco
    big = 248 * 4
    disc = Image.new('RGBA', (big, big), (0, 0, 0, 0))
    ImageDraw.Draw(disc).ellipse((4 * 4, 4 * 4, big - 4 * 4 - 1, big - 4 * 4 - 1), fill=WHITE + (255,))
    sw = round(240 * 4 * 0.62)
    s = sym.resize((sw, round(sym.height * sw / sym.width)), Image.LANCZOS)
    disc.alpha_composite(s, ((big - sw) // 2, (big - s.height) // 2))
    disc.resize((248, 248), Image.LANCZOS).save(os.path.join(OUT, 'icon.png'), optimize=True)


NODE = r"""
import { readFileSync, writeFileSync } from 'node:fs'
const { chromium } = await import(process.env.PW_ENTRY || 'playwright')
const jobs = JSON.parse(readFileSync(0, 'utf8'))
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: jobs.size, height: jobs.size } })
for (const j of jobs.items) {
  const svg = readFileSync(j.svg)
  const uri = 'data:image/svg+xml;base64,' + svg.toString('base64')
  await page.setContent(`<html><body style="margin:0;background:transparent"><img src="${uri}" width="${jobs.size}" height="${jobs.size}" style="display:block"></body></html>`)
  await page.screenshot({ path: j.out, omitBackground: true, clip: { x: 0, y: 0, width: jobs.size, height: jobs.size } })
}
await browser.close()
"""


def card_icons(svg_dir):
    tmp = os.path.join(os.environ.get('TMPDIR', '/tmp'), 'sparky-icons')
    os.makedirs(tmp, exist_ok=True)
    items = [{'svg': os.path.join(svg_dir, f'{svg}.svg'), 'out': os.path.join(tmp, f'{name}.png')}
             for name, (svg, _) in ICONS.items()]
    subprocess.run(['node', '--input-type=module', '-e', NODE], input=json.dumps({'size': RENDER, 'items': items}),
                   text=True, check=True)
    os.makedirs(os.path.join(OUT, 'icons'), exist_ok=True)
    for name, (_, color) in ICONS.items():
        alpha = Image.open(os.path.join(tmp, f'{name}.png')).convert('RGBA').getchannel('A')
        alpha = alpha.resize((40, 40), Image.LANCZOS)
        out = Image.new('RGBA', (40, 40), color + (0,))
        out.putalpha(alpha)
        out.save(os.path.join(OUT, 'icons', f'{name}.png'), optimize=True)


if __name__ == '__main__':
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    brand_assets(sys.argv[1])
    card_icons(sys.argv[2])
    print('ok')
