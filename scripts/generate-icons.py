#!/usr/bin/env python3
"""
Generate icon assets for Chrome Extension Manifest V3 and Chrome Web Store.
Resizes icons/icon.png into 16x16, 48x48, 128x128.
"""

import os
from PIL import Image

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ICON_SOURCE = os.path.join(BASE_DIR, 'icons', 'icon.png')
ICONS_DIR = os.path.join(BASE_DIR, 'icons')

SIZES = {
    'icon-16.png': (16, 16),
    'icon-48.png': (48, 48),
    'icon-128.png': (128, 128),
    'store-icon-128.png': (128, 128)
}

def generate_icons():
    if not os.path.exists(ICON_SOURCE):
        raise FileNotFoundError(f"Icon source not found: {ICON_SOURCE}")

    with Image.open(ICON_SOURCE) as img:
        img = img.convert("RGBA")
        for filename, (width, height) in SIZES.items():
            output_path = os.path.join(ICONS_DIR, filename)
            resized = img.resize((width, height), Image.Resampling.LANCZOS)
            resized.save(output_path, "PNG", optimize=True)
            print(f"Generated: {output_path} ({width}x{height})")

if __name__ == '__main__':
    generate_icons()
