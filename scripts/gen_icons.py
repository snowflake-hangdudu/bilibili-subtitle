from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'icons'
ASSETS = ROOT / 'assets'
USER_ICON = ASSETS / 'icon-source.png'
MASTER = 512
SIZES = (16, 19, 24, 32, 38, 48, 128, 512)


def lerp(a: int, b: int, t: float) -> int:
    return int(a + (b - a) * t)


def gradient(size: int, top: tuple[int, int, int], bottom: tuple[int, int, int]) -> Image.Image:
    img = Image.new('RGBA', (size, size))
    px = img.load()
    for y in range(size):
        t = y / max(size - 1, 1)
        color = tuple(lerp(top[i], bottom[i], t) for i in range(3)) + (255,)
        for x in range(size):
            px[x, y] = color
    return img


def rounded_rect(draw: ImageDraw.ImageDraw, box: tuple[int, int, int, int], radius: int, fill) -> None:
    draw.rounded_rectangle(box, radius=radius, fill=fill)


def draw_play(draw: ImageDraw.ImageDraw, box: tuple[int, int, int, int], fill) -> None:
    x1, y1, x2, y2 = box
    cx = (x1 + x2) / 2
    cy = (y1 + y2) / 2
    w = x2 - x1
    h = y2 - y1
    pts = [(x1 + w * 0.08, y1), (x1 + w * 0.08, y2), (x2, cy)]
    draw.polygon(pts, fill=fill)


def draw_master() -> Image.Image:
    size = MASTER
    img = gradient(size, (53, 204, 255), (0, 116, 218))
    mask = Image.new('L', (size, size), 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, size - 1, size - 1), radius=int(size * 0.22), fill=255)
    img.putalpha(mask)
    draw = ImageDraw.Draw(img)

    shadow = (0, 90, 158, 56)
    rounded_rect(draw, (136, 126, 412, 314), 28, shadow)
    rounded_rect(draw, (166, 344, 382, 370), 13, shadow)
    rounded_rect(draw, (166, 382, 300, 408), 13, shadow)

    white = (255, 255, 255, 255)
    rounded_rect(draw, (118, 108, 394, 296), 28, white)
    rounded_rect(draw, (168, 88, 178, 116), 5, white)
    rounded_rect(draw, (334, 88, 344, 116), 5, white)
    draw_play(draw, (214, 168, 304, 248), (0, 141, 219, 255))
    rounded_rect(draw, (148, 326, 364, 352), 13, white)
    rounded_rect(draw, (148, 364, 300, 390), 13, white)
    return img


def load_master() -> Image.Image:
    if USER_ICON.is_file():
        src = Image.open(USER_ICON).convert('RGBA')
        side = min(src.size)
        left = (src.width - side) // 2
        top = (src.height - side) // 2
        src = src.crop((left, top, left + side, top + side))
        return src.resize((MASTER, MASTER), Image.Resampling.LANCZOS)
    return draw_master()


def render_size(master: Image.Image, size: int) -> Image.Image:
    if size == 512:
        return master.copy()
    # 工具栏 16/19px 必须来自同一主图缩放，不能用简化几何（会像软盘）
    scaled = master.resize((size, size), Image.Resampling.LANCZOS)
    if size <= 32:
        scaled = scaled.filter(ImageFilter.UnsharpMask(radius=0.6, percent=160, threshold=1))
    return scaled


def main() -> None:
    master = load_master()
    OUT.mkdir(parents=True, exist_ok=True)
    master.save(OUT / 'icon512.png', 'PNG')
    for size in SIZES:
        if size == 512:
            continue
        dest = OUT / f'icon{size}.png'
        render_size(master, size).save(dest, 'PNG')
        print('wrote', dest)
    print('wrote', OUT / 'icon512.png')


if __name__ == '__main__':
    main()
