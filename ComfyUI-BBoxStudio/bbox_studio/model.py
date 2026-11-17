"""MOSS-Image layout math shared by the node and the selftest.

Coordinate space matches BBox Studio:
  bbox_coord_space: abs_centralized
  bbox_format: yxyx  -> [y_min, x_min, y_max, x_max]
  origin at the canvas center, y increases downward.
"""

from __future__ import annotations

import copy
import json
import math
from typing import Any

MIN_BOX = 20
DEFAULT_W = 1024
DEFAULT_H = 1024
DEFAULT_CAPTION = "A clean composition with carefully placed elements."
MAX_SIDE = 8192

PALETTE = [
    "#7c9cff", "#6ee7a8", "#f9a8d4", "#fbbf24", "#a78bfa",
    "#34d399", "#fb923c", "#60a5fa", "#e879f9", "#4ade80",
    "#f472b6", "#38bdf8", "#c084fc", "#facc15", "#2dd4bf",
]

COMMON_SIZES = [
    (512, 512),
    (1024, 1024),
    (1536, 1536),
    (2048, 2048),
    (832, 1216),
    (896, 1152),
    (1024, 1536),
    (720, 1280),
    (1080, 1920),
    (1440, 2560),
    (1216, 832),
    (1152, 896),
    (1536, 1024),
    (1280, 720),
    (1920, 1080),
    (2560, 1440),
]

META_PRESETS = [
    ("scene", ["scene"]),
    ("poster", ["poster"]),
    ("minimal graphic design", ["minimal graphic design"]),
    ("editorial layout", ["editorial layout"]),
    ("book cover", ["book cover"]),
    ("album art", ["album art"]),
    ("vintage travel poster", ["vintage travel poster"]),
    ("product campaign + studio photo", ["product campaign", "studio photography"]),
    ("e-commerce banner", ["e-commerce banner"]),
    ("advertisement", ["advertisement"]),
    ("packaging mockup", ["packaging mockup"]),
    ("infographic", ["infographic"]),
    ("knowledge graphic", ["knowledge graphic"]),
    ("diagram", ["diagram"]),
    ("ui mockup", ["ui mockup"]),
    ("slide deck", ["slide deck"]),
    ("anime illustration", ["anime illustration"]),
    ("comic page", ["comic page"]),
    ("manga", ["manga"]),
    ("children's book illustration", ["children's book illustration"]),
    ("flat vector art", ["flat vector art"]),
    ("cinematic still", ["cinematic still"]),
    ("street photography", ["street photography"]),
    ("portrait photography", ["portrait photography"]),
    ("macro photography", ["macro photography"]),
]


def nearest_higher_preset(need_w: int, need_h: int) -> tuple[int, int]:
    """Smallest COMMON_SIZES entry that covers need_w x need_h."""
    need_w = max(64, int(need_w))
    need_h = max(64, int(need_h))
    candidates = [(w, h) for w, h in COMMON_SIZES if w >= need_w and h >= need_h]
    if candidates:
        def score(wh: tuple[int, int]) -> tuple[int, int, int]:
            w, h = wh
            return ((w * h) - (need_w * need_h), (w - need_w) + (h - need_h), w * h)
        return min(candidates, key=score)
    if COMMON_SIZES:
        best = max(COMMON_SIZES, key=lambda wh: wh[0] * wh[1])
        return (max(best[0], need_w), max(best[1], need_h))
    return (need_w, need_h)


def default_state() -> dict[str, Any]:
    return {
        "width": DEFAULT_W,
        "height": DEFAULT_H,
        "meta": ["scene"],
        "canvas_type": "single",
        "caption": DEFAULT_CAPTION,
        "grid": "default",
        "snap": False,
        "match_input": False,
        "bg": None,
        "view": {"scale": 1.0, "offset_x": 0.0, "offset_y": 0.0},
        "selected": None,
        "items": [],
    }


def _side(value: Any, fallback: int) -> int:
    try:
        n = int(value)
    except (TypeError, ValueError):
        return fallback
    return max(64, min(MAX_SIDE, n))


def _num(value: Any, fallback: float = 0.0) -> float:
    try:
        n = float(value)
    except (TypeError, ValueError):
        return fallback
    if not math.isfinite(n):
        return fallback
    return n


def clamp_item(item: dict[str, Any], half_w: float, half_h: float) -> None:
    item["y_min"] = max(-half_h, min(half_h - MIN_BOX, _num(item.get("y_min"))))
    item["x_min"] = max(-half_w, min(half_w - MIN_BOX, _num(item.get("x_min"))))
    item["y_max"] = max(item["y_min"] + MIN_BOX, min(half_h, _num(item.get("y_max"), item["y_min"] + MIN_BOX)))
    item["x_max"] = max(item["x_min"] + MIN_BOX, min(half_w, _num(item.get("x_max"), item["x_min"] + MIN_BOX)))


def _clamp_all(state: dict[str, Any]) -> None:
    half_w = state["width"] / 2.0
    half_h = state["height"] / 2.0
    for item in state["items"]:
        clamp_item(item, half_w, half_h)


def _as_str_list(value: Any, fallback: list[str]) -> list[str]:
    if isinstance(value, str):
        parts = [part.strip() for part in value.split(",") if part.strip()]
        return parts or list(fallback)
    if isinstance(value, list):
        parts = [str(part).strip() for part in value if str(part).strip()]
        return parts or list(fallback)
    return list(fallback)


def _color(value: Any, index: int) -> str:
    text = str(value or "").strip()
    if len(text) == 7 and text.startswith("#"):
        try:
            int(text[1:], 16)
            return text.lower()
        except ValueError:
            pass
    return PALETTE[index % len(PALETTE)]


def _item_from_editor(raw: dict[str, Any], index: int) -> dict[str, Any]:
    if "bbox" in raw and not all(k in raw for k in ("y_min", "x_min", "y_max", "x_max")):
        bbox = list(raw.get("bbox") or [0, 0, MIN_BOX, MIN_BOX])
        while len(bbox) < 4:
            bbox.append(0)
        y_min, x_min, y_max, x_max = bbox[:4]
    else:
        y_min = raw.get("y_min", -100)
        x_min = raw.get("x_min", -100)
        y_max = raw.get("y_max", 100)
        x_max = raw.get("x_max", 100)
    label = str(raw.get("label") or "object").strip() or "object"
    return {
        "label": label,
        "caption": str(raw.get("caption") or ""),
        "text": str(raw.get("text") or ""),
        "color": _color(raw.get("color"), index),
        "locked": bool(raw.get("locked", False)),
        "aspect_locked": bool(raw.get("aspect_locked", False)),
        "y_min": _num(y_min),
        "x_min": _num(x_min),
        "y_max": _num(y_max),
        "x_max": _num(x_max),
    }


def _blank_from(width: int, height: int) -> dict[str, Any]:
    state = default_state()
    state["width"] = _side(width, DEFAULT_W)
    state["height"] = _side(height, DEFAULT_H)
    return state


def coerce_editor_state(data: dict[str, Any]) -> dict[str, Any]:
    state = default_state()
    state["width"] = _side(data.get("width"), DEFAULT_W)
    state["height"] = _side(data.get("height"), DEFAULT_H)
    state["meta"] = _as_str_list(data.get("meta"), ["scene"])
    canvas = str(data.get("canvas_type") or data.get("canvas") or "single").strip() or "single"
    state["canvas_type"] = canvas
    caption = data.get("caption")
    state["caption"] = DEFAULT_CAPTION if caption is None else str(caption)
    grid = str(data.get("grid") or "default")
    state["grid"] = grid
    state["snap"] = bool(data.get("snap", False))
    state["match_input"] = bool(data.get("match_input", False))
    bg = data.get("bg")
    if isinstance(bg, dict) and bg.get("filename"):
        state["bg"] = {
            "filename": os_basename(str(bg.get("filename"))),
            "subfolder": str(bg.get("subfolder") or ""),
            "type": str(bg.get("type") or "input"),
        }
    view = data.get("view") if isinstance(data.get("view"), dict) else {}
    state["view"] = {
        "scale": min(4.0, max(0.08, _num(view.get("scale"), 1.0))),
        "offset_x": _num(view.get("offset_x")),
        "offset_y": _num(view.get("offset_y")),
    }
    items = []
    for index, raw in enumerate(data.get("items") or []):
        if isinstance(raw, dict):
            items.append(_item_from_editor(raw, index))
    state["items"] = items
    _clamp_all(state)
    selected = data.get("selected")
    if isinstance(selected, int) and 0 <= selected < len(items):
        state["selected"] = selected
    else:
        state["selected"] = None
    return state


def os_basename(name: str) -> str:
    name = name.replace("\\", "/").split("/")[-1]
    return name.strip()


def ingest_moss(data: dict[str, Any]) -> dict[str, Any]:
    """Load a MOSS layout or a layout block that may use xyxy / top-left coords."""
    summary = data.get("summary") if isinstance(data.get("summary"), dict) else {}
    explicit_w = int(data["width"]) if _has_int(data, "width") else None
    explicit_h = int(data["height"]) if _has_int(data, "height") else None
    state = _blank_from(explicit_w or DEFAULT_W, explicit_h or DEFAULT_H)
    state["meta"] = _as_str_list(summary.get("meta", data.get("meta")), ["scene"])
    state["canvas_type"] = str(summary.get("canvas", data.get("canvas_type") or "single") or "single")
    caption = summary.get("caption", data.get("caption"))
    state["caption"] = DEFAULT_CAPTION if caption is None else str(caption)

    space = str(data.get("bbox_coord_space") or "abs_centralized")
    fmt = str(data.get("bbox_format") or "yxyx")
    items = []
    for index, raw in enumerate(data.get("items") or []):
        if not isinstance(raw, dict):
            continue
        bbox = list(raw.get("bbox") or [0, 0, 100, 100])
        while len(bbox) < 4:
            bbox.append(0)
        if fmt == "xyxy":
            x1, y1, x2, y2 = (float(bbox[0]), float(bbox[1]), float(bbox[2]), float(bbox[3]))
            y_min, x_min, y_max, x_max = y1, x1, y2, x2
        else:
            y_min, x_min, y_max, x_max = (float(bbox[0]), float(bbox[1]), float(bbox[2]), float(bbox[3]))
        if space == "abs":
            width = explicit_w if explicit_w else state["width"]
            height = explicit_h if explicit_h else state["height"]
            y_min -= height / 2.0
            x_min -= width / 2.0
            y_max -= height / 2.0
            x_max -= width / 2.0
        item = _item_from_editor({
            "label": raw.get("label", "object"),
            "caption": raw.get("caption", ""),
            "text": raw.get("text", ""),
            "color": raw.get("color"),
            "locked": raw.get("locked", False),
            "aspect_locked": raw.get("aspect_locked", False),
            "y_min": y_min,
            "x_min": x_min,
            "y_max": y_max,
            "x_max": x_max,
        }, index)
        items.append(item)
    state["items"] = items

    if items:
        max_ax = 0.0
        max_ay = 0.0
        for item in items:
            max_ax = max(max_ax, abs(item["x_min"]), abs(item["x_max"]))
            max_ay = max(max_ay, abs(item["y_min"]), abs(item["y_max"]))
        inferred_w = max(64, int(math.ceil(max_ax * 2 - 1e-9)))
        inferred_h = max(64, int(math.ceil(max_ay * 2 - 1e-9)))
        if explicit_w and explicit_h:
            inferred_w = max(inferred_w, explicit_w)
            inferred_h = max(inferred_h, explicit_h)
        if inferred_w < 1024 and inferred_h < 1024:
            inferred_w, inferred_h = 1024, 1024
        state["width"], state["height"] = nearest_higher_preset(inferred_w, inferred_h)
    _clamp_all(state)
    return state


def _has_int(data: dict[str, Any], key: str) -> bool:
    try:
        int(data[key])
        return key in data
    except (KeyError, TypeError, ValueError):
        return False


def ingest_project(data: dict[str, Any]) -> dict[str, Any]:
    layout = data.get("layout") if isinstance(data.get("layout"), dict) else data
    state = ingest_moss(layout)
    # A project file's width/height is the editor canvas, not a preset guess.
    if _has_int(layout, "width") and _has_int(layout, "height"):
        # ingest_moss may have snapped the canvas. Scale boxes back only if
        # the snap changed the size — project boxes were authored at layout size,
        # and ingest_moss does not scale them, so just restore the size and clamp.
        state["width"] = _side(layout.get("width"), state["width"])
        state["height"] = _side(layout.get("height"), state["height"])
        _clamp_all(state)
    view = data.get("view") if isinstance(data.get("view"), dict) else {}
    if view:
        state["view"] = {
            "scale": min(4.0, max(0.08, _num(view.get("scale"), 1.0))),
            "offset_x": _num(view.get("offset_x")),
            "offset_y": _num(view.get("offset_y")),
        }
    return state


def _looks_like_editor(data: dict[str, Any]) -> bool:
    if data.get("format") == "bbox-studio-project":
        return False
    if "canvas_type" in data or "match_input" in data or "grid" in data:
        return True
    if "width" in data and "items" in data and "summary" not in data and "bbox_coord_space" not in data:
        return True
    return False


def ingest(data: Any) -> dict[str, Any]:
    if isinstance(data, str):
        try:
            data = json.loads(data or "{}")
        except json.JSONDecodeError:
            return default_state()
    if not isinstance(data, dict):
        return default_state()
    if data.get("format") == "bbox-studio-project" or (
        isinstance(data.get("layout"), dict) and "history" in data
    ):
        return ingest_project(data)
    if _looks_like_editor(data):
        return coerce_editor_state(data)
    if "summary" in data or "bbox_coord_space" in data or "items" in data:
        return ingest_moss(data)
    return default_state()


def scale_to(state: dict[str, Any], width: int, height: int) -> dict[str, Any]:
    """Copy state onto a new canvas, scaling boxes from the center."""
    out = copy.deepcopy(state)
    width = _side(width, out["width"])
    height = _side(height, out["height"])
    old_w = max(1, int(out["width"]))
    old_h = max(1, int(out["height"]))
    if width != old_w or height != old_h:
        sx = width / old_w
        sy = height / old_h
        for item in out["items"]:
            item["x_min"] *= sx
            item["x_max"] *= sx
            item["y_min"] *= sy
            item["y_max"] *= sy
        out["width"] = width
        out["height"] = height
    _clamp_all(out)
    return out


def working_state(state: dict[str, Any], image_size: tuple[int, int] | None) -> dict[str, Any]:
    """State used for one execution. Match-input rescales onto the image."""
    if image_size and state.get("match_input"):
        return scale_to(state, int(image_size[0]), int(image_size[1]))
    out = copy.deepcopy(state)
    _clamp_all(out)
    return out


def moss_dict(state: dict[str, Any]) -> dict[str, Any]:
    items = []
    for item in state.get("items") or []:
        entry: dict[str, Any] = {
            "label": item.get("label") or "object",
            "caption": item.get("caption") or "",
            "bbox": [
                int(round(float(item["y_min"]))),
                int(round(float(item["x_min"]))),
                int(round(float(item["y_max"]))),
                int(round(float(item["x_max"]))),
            ],
        }
        if entry["label"] == "text" and item.get("text"):
            entry["text"] = item["text"]
        items.append(entry)
    meta = state.get("meta") or ["scene"]
    return {
        "summary": {
            "meta": list(meta),
            "canvas": state.get("canvas_type") or "single",
            "caption": state.get("caption") if state.get("caption") is not None else "",
        },
        "items": items,
        "bbox_coord_space": "abs_centralized",
        "bbox_format": "yxyx",
    }


def moss_str(state: dict[str, Any]) -> str:
    return json.dumps(moss_dict(state), indent=2, ensure_ascii=False)


def layout_prompt(state: dict[str, Any]) -> str:
    """The prompt ComfyUI's MOSS-Image Layout Prompt node would write.

    Same keys, same order, same compact one-line JSON as
    comfy_extras/nodes_moss_image.py, so this output replaces that node:
    the Summary caption is its `prompt` box and the boxes are its elements.
    Meta and Canvas are not part of that format and are left out. With no
    boxes it returns the caption alone, as that node does.
    """
    caption = str(state.get("caption") or "")
    items = []
    for item in state.get("items") or []:
        label = item.get("label")
        if label not in ("text", "character"):
            label = "object"
        entry: dict[str, Any] = {"label": label, "caption": item.get("caption") or ""}
        if label == "text":
            entry["text"] = item.get("text") or ""
        entry["bbox"] = [
            int(round(float(item["y_min"]))),
            int(round(float(item["x_min"]))),
            int(round(float(item["y_max"]))),
            int(round(float(item["x_max"]))),
        ]
        items.append(entry)
    if not items:
        return caption
    layout = {
        "summary": {"caption": caption.strip()},
        "items": items,
        "bbox_coord_space": "abs_centralized",
        "bbox_format": "yxyx",
    }
    return json.dumps(layout, ensure_ascii=False, separators=(",", ":"))


def _grid(value: float, side: float) -> int:
    """Pixels from the canvas centre -> the 0-1000 grid ComfyUI elements use."""
    return max(0, min(1000, int(round((float(value) + side / 2.0) / side * 1000.0))))


def elements(state: dict[str, Any]) -> list[dict[str, Any]]:
    """Boxes as the `elements` list of ComfyUI's Create Bounding Boxes node.

    This is what MOSS-Image Layout Prompt (and the other layout prompt nodes)
    take on their `element` input: type "text" or "obj", bbox as
    [ymin, xmin, ymax, xmax] on a 0-1000 grid from the top-left corner.
    """
    width = float(state["width"])
    height = float(state["height"])
    out = []
    for item in state.get("items") or []:
        kind = "text" if item.get("label") == "text" else "obj"
        element: dict[str, Any] = {
            "type": kind,
            "bbox": [
                _grid(item["y_min"], height),
                _grid(item["x_min"], width),
                _grid(item["y_max"], height),
                _grid(item["x_max"], width),
            ],
        }
        if kind == "text":
            element["text"] = item.get("text") or ""
        element["desc"] = item.get("caption") or ""
        out.append(element)
    return out


def character_boxes(state: dict[str, Any]) -> str:
    """1-based numbers of the character boxes, e.g. "1, 3".

    Elements have no character type; MOSS-Image Layout Prompt takes the
    numbers on its `character_boxes` input instead.
    """
    numbers = [
        str(index + 1)
        for index, item in enumerate(state.get("items") or [])
        if item.get("label") == "character"
    ]
    return ", ".join(numbers)
