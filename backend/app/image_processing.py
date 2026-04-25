from io import BytesIO
from typing import Optional

from PIL import Image, ImageOps

ASPECT_RATIOS: dict[str, Optional[float]] = {
    "original": None,
    "1:1": 1.0,
    "16:9": 16 / 9,
    "9:16": 9 / 16,
    "4:5": 4 / 5,
    "5:4": 5 / 4,
    "4:3": 4 / 3,
    "3:2": 3 / 2,
}

FORMAT_MAP = {"webp": "WEBP", "png": "PNG", "jpeg": "JPEG"}
ALLOWED_FORMATS = set(FORMAT_MAP.keys())
ALLOWED_FLIPS = {"horizontal", "vertical"}


def _center_crop(img: Image.Image, target_ratio: float) -> Image.Image:
    w, h = img.size
    if h == 0:
        return img
    cur_ratio = w / h
    if abs(cur_ratio - target_ratio) < 0.001:
        return img
    if cur_ratio > target_ratio:
        new_w = int(round(h * target_ratio))
        x = (w - new_w) // 2
        return img.crop((x, 0, x + new_w, h))
    new_h = int(round(w / target_ratio))
    y = (h - new_h) // 2
    return img.crop((0, y, w, y + new_h))


def process(
    img_bytes: bytes,
    *,
    aspect: str = "original",
    flip: Optional[str] = None,
    grayscale: bool = False,
    max_width: Optional[int] = None,
    fmt: str = "webp",
    quality: int = 85,
) -> tuple[bytes, str]:
    fmt = fmt.lower()
    if fmt not in ALLOWED_FORMATS:
        raise ValueError(f"Format tidak didukung: {fmt}")
    if aspect not in ASPECT_RATIOS:
        raise ValueError(f"Aspect tidak valid: {aspect}")
    if flip is not None and flip not in ALLOWED_FLIPS:
        raise ValueError(f"Flip tidak valid: {flip}")

    img = Image.open(BytesIO(img_bytes))

    # Apply EXIF orientation supaya hasil sesuai preview
    img = ImageOps.exif_transpose(img)

    # Normalisasi mode
    if img.mode == "P":
        img = img.convert("RGBA" if "transparency" in img.info else "RGB")

    # Crop center to ratio
    target_ratio = ASPECT_RATIOS[aspect]
    if target_ratio:
        img = _center_crop(img, target_ratio)

    # Flip
    if flip == "horizontal":
        img = ImageOps.mirror(img)
    elif flip == "vertical":
        img = ImageOps.flip(img)

    # Grayscale (preserve alpha kalau ada)
    if grayscale:
        if img.mode in ("RGBA", "LA"):
            alpha = img.getchannel("A")
            gray = ImageOps.grayscale(img.convert("RGB"))
            img = Image.merge("LA", (gray, alpha))
        else:
            img = ImageOps.grayscale(img)

    # Resize (downscale only)
    if max_width and max_width > 0 and img.width > max_width:
        ratio = max_width / img.width
        new_h = max(1, int(round(img.height * ratio)))
        img = img.resize((max_width, new_h), Image.Resampling.LANCZOS)

    # Format-specific mode handling
    if fmt == "jpeg":
        if img.mode in ("RGBA", "LA"):
            bg = Image.new("RGB", img.size, (255, 255, 255))
            mask = img.split()[-1]
            base = img.convert("RGB")
            bg.paste(base, mask=mask)
            img = bg
        elif img.mode != "RGB":
            img = img.convert("RGB")

    # Save
    buf = BytesIO()
    save_kwargs: dict = {"optimize": True}
    if fmt in ("webp", "jpeg"):
        save_kwargs["quality"] = max(1, min(100, quality))
    if fmt == "webp":
        save_kwargs["method"] = 6  # max compression effort

    img.save(buf, format=FORMAT_MAP[fmt], **save_kwargs)
    return buf.getvalue(), f"image/{fmt}"
