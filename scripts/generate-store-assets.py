#!/usr/bin/env python3
"""
Generate Chrome Web Store assets with exact required dimensions:
- Screenshots: 1280x800 px
- Small Promo Tile: 440x280 px
"""

import os
from PIL import Image, ImageDraw, ImageFont, ImageFilter

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
IMG_DIR = os.path.join(BASE_DIR, 'assets', 'img')
STORE_DIR = os.path.join(BASE_DIR, 'store-assets')
ICON_PATH = os.path.join(BASE_DIR, 'icons', 'icon.png')

os.makedirs(STORE_DIR, exist_ok=True)

BG_COLOR = (11, 15, 25) # #0b0f19
BORDER_COLOR = (255, 255, 255, 25)

def create_card_background(width=1280, height=800):
    bg = Image.new("RGB", (width, height), BG_COLOR)
    draw = ImageDraw.Draw(bg)
    # Subtle gradient or glow
    glow = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    glow_draw = ImageDraw.Draw(glow)
    glow_draw.ellipse([width - 400, -100, width + 200, 500], fill=(139, 92, 246, 35))
    glow_draw.ellipse([-200, height - 400, 400, height + 200], fill=(124, 108, 240, 25))
    bg.paste(Image.alpha_composite(Image.new("RGBA", (width, height), (11, 15, 25, 255)), glow).convert("RGB"))
    return bg

def fit_image_in_frame(img, max_w, max_h):
    w, h = img.size
    ratio = min(max_w / w, max_h / h)
    new_w = int(w * ratio)
    new_h = int(h * ratio)
    return img.resize((new_w, new_h), Image.Resampling.LANCZOS)

def generate_screenshots():
    # 1. Main Overlay (1280x800)
    main_img_path = os.path.join(IMG_DIR, '1-Main.png')
    if os.path.exists(main_img_path):
        bg = create_card_background(1280, 800)
        with Image.open(main_img_path) as main_img:
            fitted = fit_image_in_frame(main_img.convert("RGB"), 1200, 720)
            x = (1280 - fitted.width) // 2
            y = (800 - fitted.height) // 2
            bg.paste(fitted, (x, y))
            out_path = os.path.join(STORE_DIR, 'screenshot-1-main-1280x800.png')
            bg.save(out_path, "PNG", optimize=True)
            print("Generated:", out_path)

    # 2. Sidepanel Legendas Showcase (1280x800)
    sub_img_path = os.path.join(IMG_DIR, '1-legendas.png')
    sub_click_path = os.path.join(IMG_DIR, '1.2-legendas-click.png')
    if os.path.exists(sub_img_path):
        bg = create_card_background(1280, 800)
        with Image.open(sub_img_path) as im1:
            fit1 = fit_image_in_frame(im1.convert("RGB"), 520, 720)
            y1 = (800 - fit1.height) // 2
            if os.path.exists(sub_click_path):
                with Image.open(sub_click_path) as im2:
                    fit2 = fit_image_in_frame(im2.convert("RGB"), 520, 720)
                    y2 = (800 - fit2.height) // 2
                    total_w = fit1.width + fit2.width + 40
                    start_x = (1280 - total_w) // 2
                    bg.paste(fit1, (start_x, y1))
                    bg.paste(fit2, (start_x + fit1.width + 40, y2))
            else:
                bg.paste(fit1, ((1280 - fit1.width) // 2, y1))
        out_path = os.path.join(STORE_DIR, 'screenshot-2-legendas-1280x800.png')
        bg.save(out_path, "PNG", optimize=True)
        print("Generated:", out_path)

    # 3. Vocabulary Showcase (1280x800)
    vocab_img_path = os.path.join(IMG_DIR, '1-vocabulário.png')
    vocab_click_path = os.path.join(IMG_DIR, '1.2-vocabulário-click.png')
    if os.path.exists(vocab_img_path):
        bg = create_card_background(1280, 800)
        with Image.open(vocab_img_path) as im1:
            fit1 = fit_image_in_frame(im1.convert("RGB"), 520, 720)
            y1 = (800 - fit1.height) // 2
            if os.path.exists(vocab_click_path):
                with Image.open(vocab_click_path) as im2:
                    fit2 = fit_image_in_frame(im2.convert("RGB"), 520, 720)
                    y2 = (800 - fit2.height) // 2
                    total_w = fit1.width + fit2.width + 40
                    start_x = (1280 - total_w) // 2
                    bg.paste(fit1, (start_x, y1))
                    bg.paste(fit2, (start_x + fit1.width + 40, y2))
            else:
                bg.paste(fit1, ((1280 - fit1.width) // 2, y1))
        out_path = os.path.join(STORE_DIR, 'screenshot-3-vocabulario-1280x800.png')
        bg.save(out_path, "PNG", optimize=True)
        print("Generated:", out_path)

    # 4. Config & Anki Showcase (1280x800)
    cfg_img_path = os.path.join(IMG_DIR, '1-config.png')
    cfg_click_path = os.path.join(IMG_DIR, '1.2-config-ajuste-legenda.png')
    if os.path.exists(cfg_img_path):
        bg = create_card_background(1280, 800)
        with Image.open(cfg_img_path) as im1:
            fit1 = fit_image_in_frame(im1.convert("RGB"), 520, 720)
            y1 = (800 - fit1.height) // 2
            if os.path.exists(cfg_click_path):
                with Image.open(cfg_click_path) as im2:
                    fit2 = fit_image_in_frame(im2.convert("RGB"), 520, 720)
                    y2 = (800 - fit2.height) // 2
                    total_w = fit1.width + fit2.width + 40
                    start_x = (1280 - total_w) // 2
                    bg.paste(fit1, (start_x, y1))
                    bg.paste(fit2, (start_x + fit1.width + 40, y2))
            else:
                bg.paste(fit1, ((1280 - fit1.width) // 2, y1))
        out_path = os.path.join(STORE_DIR, 'screenshot-4-config-1280x800.png')
        bg.save(out_path, "PNG", optimize=True)
        print("Generated:", out_path)

def generate_promo_tile():
    # 440x280 Promo Tile
    width, height = 440, 280
    bg = create_card_background(width, height)
    draw = ImageDraw.Draw(bg)

    # Add icon
    if os.path.exists(ICON_PATH):
        with Image.open(ICON_PATH) as icon:
            icon_resized = icon.convert("RGBA").resize((96, 96), Image.Resampling.LANCZOS)
            bg_rgba = bg.convert("RGBA")
            bg_rgba.paste(icon_resized, (32, (height - 96) // 2), icon_resized)
            bg = bg_rgba.convert("RGB")

    # Add text banner
    draw = ImageDraw.Draw(bg)
    draw.text((150, 85), "VLL", fill=(167, 139, 250))
    draw.text((150, 115), "Video Language Learner", fill=(248, 250, 252))
    draw.text((150, 145), "Aprenda Mandarim no YouTube", fill=(148, 163, 184))

    out_path = os.path.join(STORE_DIR, 'promo-small-440x280.png')
    bg.save(out_path, "PNG", optimize=True)
    print("Generated:", out_path)

if __name__ == '__main__':
    generate_screenshots()
    generate_promo_tile()
