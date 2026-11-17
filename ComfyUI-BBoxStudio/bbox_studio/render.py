"""Raster preview of a BBox Studio layout. Pillow only, no ComfyUI imports."""

from __future__ import annotations

import os
from typing import Any

import numpy as np
from PIL import Image, ImageDraw, ImageFont

from .model import PALETTE

_FONTS: dict[int, ImageFont.ImageFont] = {}


def _font(size: int) -> ImageFont.ImageFont:
    size = max(8, int(size))
    cached = _FONTS.get(size)
    if cached is not None:
        return cached
    candidates = [
        os.path.join(os.environ.get("WINDIR", r"C:\Windows"), "Fonts", "segoeui.ttf"),
        r"C:\Windows\Fonts\arial.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        "/System/Library/Fonts/Supplemental/Arial.ttf",
    ]
    font: ImageFont.ImageFont | None = None
    for path in candidates:
        if path and os.path.isfile(path):
            try:
                font = ImageFont.truetype(path, size)
                break
            except OSError:
                continue
    if font is None:
        font = ImageFont.load_default()
    _FONTS[size] = font
    return font


def _hex(color: str) -> tuple[int, int, int]:
    text = (color or "").strip()
    if len(text) == 7 and text.startswith("#"):
        try:
            return int(text[1:3], 16), int(text[3:5], 16), int(text[5:7], 16)
        except ValueError:
            pass
    return (124, 156, 255)


def _centered_coords(half: float, step: float) -> list[float]:
    if step <= 0:
        return [0.0]
    vals = [0.0]
    k = step
    while k <= half + 1e-6:
        vals.append(k)
        vals.append(-k)
        k += step
    vals.sort()
    return vals


def _to_px(ix: float, iy: float, half_w: float, half_h: float) -> tuple[int, int]:
    return int(round(ix + half_w)), int(round(iy + half_h))


def _draw_grid(draw: ImageDraw.ImageDraw, width: int, height: int, style: str) -> None:
    if style == "none":
        return
    half_w = width / 2.0
    half_h = height / 2.0
    grid = (0x1E, 0x1E, 0x2C)
    accent = (0x2A, 0x2A, 0x3C)
    border = (0x2E, 0x2E, 0x42)

    def vline(x_img: float, col: tuple[int, int, int]) -> None:
        x, _ = _to_px(x_img, 0, half_w, half_h)
        draw.line([(x, 0), (x, height - 1)], fill=col)

    def hline(y_img: float, col: tuple[int, int, int]) -> None:
        _, y = _to_px(0, y_img, half_w, half_h)
        draw.line([(0, y), (width - 1, y)], fill=col)

    if style in ("default", "fine", "coarse", "cross", "thirds", "golden", "dots"):
        cx, cy = _to_px(0, 0, half_w, half_h)
        draw.line([(cx - 14, cy), (cx + 14, cy)], fill=border)
        draw.line([(cx, cy - 14), (cx, cy + 14)], fill=border)
    if style == "cross":
        return
    if style == "dots":
        step = 50 if width <= 1200 else 80
        for gx in _centered_coords(half_w, step):
            for gy in _centered_coords(half_h, step):
                px, py = _to_px(gx, gy, half_w, half_h)
                draw.point((px, py), fill=grid)
        return
    if style == "thirds":
        for t in (1 / 3, 2 / 3):
            vline(-half_w + 2 * half_w * t, accent)
            hline(-half_h + 2 * half_h * t, accent)
        return
    if style == "golden":
        phi = 0.6180339887
        for t in (1 - phi, phi):
            vline(-half_w + 2 * half_w * t, accent)
            hline(-half_h + 2 * half_h * t, accent)
        return
    if style == "fine":
        step = 25 if width <= 1200 else 50
    elif style == "coarse":
        step = 100 if width <= 1200 else 200
    else:
        step = 50 if width <= 1200 else 100
    for gx in _centered_coords(half_w, step):
        vline(gx, grid)
    for gy in _centered_coords(half_h, step):
        hline(gy, grid)


def _fit_text(text: str, font: ImageFont.ImageFont, max_width: int) -> str:
    if max_width <= 4 or not text:
        return ""
    try:
        length = font.getlength
    except AttributeError:
        return text
    if length(text) <= max_width:
        return text
    trimmed = text
    while trimmed and length(trimmed + "…") > max_width:
        trimmed = trimmed[:-1]
    return (trimmed + "…") if trimmed else ""


def render_rgb(
    state: dict[str, Any],
    background: np.ndarray | None,
    draw_boxes: bool,
) -> np.ndarray:
    """Return HxWx3 uint8. background, when given, is resized to the canvas."""
    width = int(state["width"])
    height = int(state["height"])
    if background is not None and background.size:
        plate = Image.fromarray(background[..., :3].astype(np.uint8), "RGB")
        if plate.size != (width, height):
            plate = plate.resize((width, height), Image.Resampling.LANCZOS)
    else:
        plate = Image.new("RGB", (width, height), (0x0C, 0x0C, 0x12))
        draw = ImageDraw.Draw(plate)
        _draw_grid(draw, width, height, str(state.get("grid") or "default"))

    draw = ImageDraw.Draw(plate)
    border = (0x2E, 0x2E, 0x42)
    draw.rectangle([0, 0, width - 1, height - 1], outline=border)
    if not draw_boxes:
        return np.asarray(plate)

    half_w = width / 2.0
    half_h = height / 2.0
    font_size = 16 if min(width, height) >= 768 else 12
    font = _font(font_size)
    selected = state.get("selected")
    for index, item in enumerate(state.get("items") or []):
        col = _hex(item.get("color") or PALETTE[index % len(PALETTE)])
        x0, y0 = _to_px(float(item["x_min"]), float(item["y_min"]), half_w, half_h)
        x1, y1 = _to_px(float(item["x_max"]), float(item["y_max"]), half_w, half_h)
        if x0 > x1:
            x0, x1 = x1, x0
        if y0 > y1:
            y0, y1 = y1, y0
        thick = 3 if selected == index else 2
        draw.rectangle([x0, y0, x1, y1], outline=col, width=thick)
        label = str(item.get("label") or "").strip()
        caption = str(item.get("caption") or "").strip()
        if label and caption:
            text = f"{label}: {caption}"
        else:
            text = caption or label
        if text:
            shown = _fit_text(text, font, max(8, x1 - x0 - 8))
            if shown:
                tx, ty = x0 + 4, y0 + 4
                draw.text((tx + 1, ty + 1), shown, fill=(0, 0, 0), font=font)
                draw.text((tx, ty), shown, fill=col, font=font)
    return np.asarray(plate)
