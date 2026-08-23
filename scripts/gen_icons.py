from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / 'assets' / 'icon-source.png'
OUT = ROOT / 'public' / 'icons'
SIZES = (16, 32, 48, 128, 300)


def main() -> None:
    if not SRC.exists():
        raise SystemExit(f'missing icon source: {SRC}')
    img = Image.open(SRC).convert('RGBA')
    OUT.mkdir(parents=True, exist_ok=True)
    for size in SIZES:
        if size <= 32:
            big = img.resize((size * 4, size * 4), Image.Resampling.LANCZOS)
            big = big.filter(ImageFilter.UnsharpMask(radius=1.0, percent=120, threshold=2))
            out = big.resize((size, size), Image.Resampling.LANCZOS)
        else:
            out = img.resize((size, size), Image.Resampling.LANCZOS)
        dest = OUT / f'icon{size}.png'
        out.save(dest, 'PNG')
        print('wrote', dest)


if __name__ == '__main__':
    main()
