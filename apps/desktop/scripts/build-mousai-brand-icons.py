"""Build the approved Mousai portrait as rounded application icons."""

from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageFilter


DESKTOP_ROOT = Path(__file__).resolve().parents[1]
ASSETS_ROOT = DESKTOP_ROOT / "assets"
BRAND_ROOT = ASSETS_ROOT / "brand"
MASTER_PATH = BRAND_ROOT / "mousai-workspace-logo-1024.png"
CORNER_RADIUS_RATIO = 0.215
EXPORT_SIZES = (1024, 512, 256, 128, 64, 32)
ICO_SIZES = (16, 24, 32, 48, 64, 128, 256)


def rounded_master() -> Image.Image:
    image = Image.open(MASTER_PATH).convert("RGBA")
    if image.size != (1024, 1024):
        image = image.resize((1024, 1024), Image.Resampling.LANCZOS)

    scale = 4
    mask_size = image.width * scale
    mask = Image.new("L", (mask_size, mask_size), 0)
    radius = round(image.width * CORNER_RADIUS_RATIO * scale)
    ImageDraw.Draw(mask).rounded_rectangle(
        (0, 0, mask_size - 1, mask_size - 1), radius=radius, fill=255
    )
    mask = mask.resize(image.size, Image.Resampling.LANCZOS)
    image.putalpha(ImageChops.multiply(image.getchannel("A"), mask))
    return image


def resized(master: Image.Image, size: int) -> Image.Image:
    icon = master.resize((size, size), Image.Resampling.LANCZOS)
    if size <= 128:
        alpha = icon.getchannel("A")
        icon = icon.filter(ImageFilter.UnsharpMask(radius=0.45, percent=55, threshold=3))
        icon.putalpha(alpha)
    return icon


def main() -> None:
    master = rounded_master()
    for size in EXPORT_SIZES:
        resized(master, size).save(
            BRAND_ROOT / f"mousai-workspace-logo-{size}.png", optimize=True
        )

    master.save(ASSETS_ROOT / "icon.png", optimize=True)
    resized(master, 180).save(DESKTOP_ROOT / "public" / "apple-touch-icon.png", optimize=True)
    master.save(ASSETS_ROOT / "icon.ico", sizes=[(size, size) for size in ICO_SIZES])
    master.save(ASSETS_ROOT / "icon.icns")
    master.save(
        BRAND_ROOT / "mousai-workspace-shortcut-v2.ico",
        sizes=[(size, size) for size in ICO_SIZES],
    )


if __name__ == "__main__":
    main()
