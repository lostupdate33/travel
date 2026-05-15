from io import BytesIO

from PIL import Image, ImageOps


_MEDIA_VARIANT_CACHE: dict[tuple[str, str], tuple[bytes, str]] = {}


def proposal_media_variant(media_asset_id: str, content: bytes) -> tuple[bytes, str]:
    cache_key = (media_asset_id, "proposal")
    cached = _MEDIA_VARIANT_CACHE.get(cache_key)
    if cached:
        return cached

    with Image.open(BytesIO(content)) as image:
        image = ImageOps.exif_transpose(image)
        image.thumbnail((1280, 1280), Image.Resampling.LANCZOS)
        if image.mode not in ("RGB", "L"):
            image = image.convert("RGB")

        output = BytesIO()
        image.save(output, format="JPEG", quality=78, optimize=True, progressive=True)
        result = (output.getvalue(), "image/jpeg")

    if len(_MEDIA_VARIANT_CACHE) > 128:
        _MEDIA_VARIANT_CACHE.clear()
    _MEDIA_VARIANT_CACHE[cache_key] = result
    return result
