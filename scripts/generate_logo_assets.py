#!/usr/bin/env python3

from __future__ import annotations

import argparse
import base64
from io import BytesIO
from pathlib import Path

from PIL import Image


ALPHA_THRESHOLD = 8
ICON_SPECS = {
    192: (0.94, 0.46),
    512: (0.94, 0.46),
}
RESAMPLE = Image.Resampling.LANCZOS if hasattr(Image, "Resampling") else Image.LANCZOS


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Generate scummweb logo assets from a master PNG.")
    parser.add_argument("--source", required=True, type=Path, help="Path to the master PNG source.")
    parser.add_argument("--out-dir", required=True, type=Path, help="Directory to write generated assets into.")
    return parser.parse_args()


def load_logo(source: Path) -> Image.Image:
    image = Image.open(source).convert("RGBA")
    alpha = image.getchannel("A").point(lambda value: 255 if value > ALPHA_THRESHOLD else 0)
    bbox = alpha.getbbox()
    if bbox is None:
        raise SystemExit(f"Logo source has no visible pixels: {source}")
    return image.crop(bbox)


def load_logo_with_fallback(source: Path, out_dir: Path) -> Image.Image:
    if source.is_file():
        return load_logo(source)

    fallback_icon = out_dir / "scummvm-512.png"
    if fallback_icon.is_file():
        return load_logo(fallback_icon)

    raise SystemExit(f"Missing logo source and no fallback icon available: {source}")


def build_logo_svg(image: Image.Image) -> str:
    buffer = BytesIO()
    image.save(buffer, format="PNG")
    encoded_png = base64.b64encode(buffer.getvalue()).decode("ascii")
    return f"""<svg xmlns="http://www.w3.org/2000/svg" width="{image.width}" height="{image.height}" viewBox="0 0 {image.width} {image.height}" role="img" aria-labelledby="title desc">
  <title id="title">scummweb</title>
  <desc id="desc">scummweb logo wordmark.</desc>
  <image width="{image.width}" height="{image.height}" preserveAspectRatio="xMidYMid meet" href="data:image/png;base64,{encoded_png}" />
</svg>
"""


def build_icon(image: Image.Image, size: int) -> Image.Image:
    max_width_ratio, max_height_ratio = ICON_SPECS[size]
    icon = image.copy()
    icon.thumbnail((round(size * max_width_ratio), round(size * max_height_ratio)), RESAMPLE)

    canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    x = (size - icon.width) // 2
    y = (size - icon.height) // 2
    canvas.alpha_composite(icon, (x, y))
    return canvas


def main() -> None:
    args = parse_args()
    args.out_dir.mkdir(parents=True, exist_ok=True)

    logo = load_logo_with_fallback(args.source, args.out_dir)
    (args.out_dir / "logo.svg").write_text(build_logo_svg(logo))

    for size in ICON_SPECS:
        build_icon(logo, size).save(args.out_dir / f"scummvm-{size}.png")


if __name__ == "__main__":
    main()
