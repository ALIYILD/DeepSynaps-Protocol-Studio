#!/usr/bin/env python3
"""
generate-og-image.py — Phase 14C

Renders the Open Graph / social-card PNG referenced by the marketplace
landing page meta tags (Phase 12C):

    https://deepsynaps-studio-preview.netlify.app/og-marketplace.png

Output: apps/web/public/og-marketplace.png

Spec
----
Dimensions : 1200 x 630 px (Twitter / Facebook / LinkedIn standard)
Background : #0f1419  (matches the dark navbar shell in index.html)
Accent     : #00d4bc  (theme-color from index.html)
Text color : #ffffff  (white)
Font       : PIL default bitmap font — DO NOT bundle a custom font.
             We render the brand at multiple sizes by drawing the default
             font onto a small surface and resizing (NEAREST) up to the
             target size. This keeps the script dependency-free at the
             cost of a deliberately chunky pixel-art look.

Idempotency
-----------
Re-running this script overwrites the PNG with the same byte content
(Pillow's PNG encoder is deterministic for identical inputs).

Usage
-----
    /opt/homebrew/bin/python3.11 apps/web/scripts/generate-og-image.py

Or any python3 with Pillow >= 9 installed:

    pip install Pillow
    python3 apps/web/scripts/generate-og-image.py
"""

from __future__ import annotations

import os
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

# ───── Spec constants ────────────────────────────────────────────────────
WIDTH = 1200
HEIGHT = 630

BG_COLOR = (15, 20, 25)       # #0f1419 — dark navbar shell
ACCENT_COLOR = (0, 212, 188)  # #00d4bc — theme-color from index.html
WHITE = (255, 255, 255)
MUTED = (170, 180, 190)

BRAND = "DeepSynaps Studio"
HERO = "Agents that run your clinic"
SUB = "Reception . Reporting . DrClaw . Care Companion"
FOOTER = "deepsynaps-studio-preview.netlify.app"

OUT_PATH = Path(__file__).resolve().parents[1] / "public" / "og-marketplace.png"


def _draw_text_at_size(text: str, target_height: int, color: tuple[int, int, int]) -> Image.Image:
    """
    Render `text` using PIL's default bitmap font, then upscale (NEAREST) so
    the rendered glyphs are roughly `target_height` pixels tall. Returns a
    transparent RGBA tile sized to the rendered text bounding box.
    """
    font = ImageFont.load_default()

    # Measure the default-font glyphs first.
    measure_img = Image.new("RGBA", (10, 10))
    measure_draw = ImageDraw.Draw(measure_img)
    bbox = measure_draw.textbbox((0, 0), text, font=font)
    base_w = max(1, bbox[2] - bbox[0])
    base_h = max(1, bbox[3] - bbox[1])

    # Render at native size onto a tight tile.
    tile = Image.new("RGBA", (base_w + 4, base_h + 4), (0, 0, 0, 0))
    ImageDraw.Draw(tile).text((-bbox[0] + 2, -bbox[1] + 2), text, font=font, fill=color + (255,))

    # Upscale to the requested pixel height.
    scale = max(1, round(target_height / base_h))
    new_size = (tile.width * scale, tile.height * scale)
    return tile.resize(new_size, Image.NEAREST)


def render() -> Image.Image:
    img = Image.new("RGB", (WIDTH, HEIGHT), BG_COLOR)
    draw = ImageDraw.Draw(img)

    # Subtle accent bar on the left edge.
    draw.rectangle([(0, 0), (8, HEIGHT)], fill=ACCENT_COLOR)

    # Top hairline divider.
    draw.rectangle([(48, 110), (WIDTH - 48, 112)], fill=(40, 50, 60))

    # Brand line — top-left, ~40 px tall.
    brand_tile = _draw_text_at_size(BRAND, target_height=40, color=WHITE)
    img.paste(brand_tile, (48, 48), brand_tile)

    # Hero — centered-ish, ~80 px tall.
    hero_tile = _draw_text_at_size(HERO, target_height=80, color=WHITE)
    hero_x = (WIDTH - hero_tile.width) // 2
    hero_y = (HEIGHT - hero_tile.height) // 2 - 40
    img.paste(hero_tile, (hero_x, hero_y), hero_tile)

    # Sub-line — under hero, ~30 px tall.
    sub_tile = _draw_text_at_size(SUB, target_height=30, color=MUTED)
    sub_x = (WIDTH - sub_tile.width) // 2
    sub_y = hero_y + hero_tile.height + 32
    img.paste(sub_tile, (sub_x, sub_y), sub_tile)

    # Footer — bottom-right, ~24 px tall.
    footer_tile = _draw_text_at_size(FOOTER, target_height=24, color=ACCENT_COLOR)
    footer_x = WIDTH - footer_tile.width - 48
    footer_y = HEIGHT - footer_tile.height - 40
    img.paste(footer_tile, (footer_x, footer_y), footer_tile)

    return img


def main() -> None:
    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    img = render()
    # `optimize=True` + fixed inputs keeps byte-output stable across runs.
    img.save(OUT_PATH, format="PNG", optimize=True)
    size = os.path.getsize(OUT_PATH)
    print(f"wrote {OUT_PATH} ({WIDTH}x{HEIGHT}, {size} bytes)")


if __name__ == "__main__":
    main()
