"""ComfyUI node: BBox Studio layout editor state -> MOSS JSON + preview."""

from __future__ import annotations

import os

import numpy as np
import torch
from PIL import Image

from .model import character_boxes, elements, ingest, layout_prompt, moss_str, working_state
from .render import render_rgb

try:
    import folder_paths
except ImportError:  # selftest / import outside ComfyUI
    folder_paths = None


def _directory_for(kind: str) -> str | None:
    if folder_paths is None:
        return None
    if kind == "output":
        return folder_paths.get_output_directory()
    if kind == "temp":
        return folder_paths.get_temp_directory()
    return folder_paths.get_input_directory()


def _reference_path(bg: dict | None) -> str | None:
    if not isinstance(bg, dict) or not bg.get("filename"):
        return None
    root = _directory_for(str(bg.get("type") or "input"))
    if not root:
        return None
    root_real = os.path.realpath(root)
    name = os.path.basename(str(bg.get("filename")))
    sub = str(bg.get("subfolder") or "").replace("\\", "/").strip("/")
    if any(part == ".." for part in sub.split("/")):
        return None
    path = os.path.realpath(os.path.join(root_real, sub, name))
    if path != root_real and not path.startswith(root_real + os.sep):
        return None
    return path if os.path.isfile(path) else None


def _load_reference(bg: dict | None) -> np.ndarray | None:
    path = _reference_path(bg)
    if not path:
        return None
    try:
        with Image.open(path) as im:
            return np.asarray(im.convert("RGB"))
    except OSError:
        return None


def _frame_uint8(frame: torch.Tensor) -> np.ndarray:
    arr = frame.detach().float().cpu().numpy()
    arr = np.clip(arr[..., :3], 0.0, 1.0)
    return (arr * 255.0 + 0.5).astype(np.uint8)


def _to_tensor(frames: list[np.ndarray]) -> torch.Tensor:
    stack = np.stack(frames, axis=0).astype(np.float32) / 255.0
    return torch.from_numpy(stack)


class BBoxStudio:
    """Visual MOSS-Image bounding-box editor.

    The canvas UI lives in web/bbox_studio.js and stores its document in
    `state`. This class turns that document into the MOSS JSON string and
    a preview image. A connected IMAGE becomes the preview plate; with
    Match input image on, the canvas (and the JSON coordinates) adopt
    that image's size at run time.
    """

    CATEGORY = "BBox Studio"
    FUNCTION = "build"
    # New outputs go on the end so links in saved workflows keep their slots.
    RETURN_TYPES = ("STRING", "IMAGE", "INT", "INT", "ARRAY", "STRING", "STRING")
    RETURN_NAMES = ("json", "preview", "width", "height", "elements", "character_boxes", "prompt")
    OUTPUT_TOOLTIPS = (
        "The layout as the BBox Studio desktop app writes it, with Meta and Canvas.",
        "The canvas with the boxes drawn.",
        "Canvas width.",
        "Canvas height.",
        "The boxes as elements, the same list Create Bounding Boxes outputs. "
        "Wire it to the element input of MOSS-Image Layout Prompt.",
        "Numbers of the character boxes. Wire it to character_boxes on MOSS-Image Layout Prompt.",
        "The finished MOSS layout prompt, the same string MOSS-Image Layout Prompt writes. "
        "Wire it to the text encoder; that node is not needed.",
    )
    DESCRIPTION = (
        "Draw MOSS-Image bounding boxes on the node. "
        "prompt is the finished layout prompt for the text encoder. "
        "elements feeds ComfyUI's MOSS-Image Layout Prompt node instead, for those who keep it. "
        "preview is the canvas with the boxes drawn."
    )

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "state": ("STRING", {
                    "default": "{}",
                    "multiline": False,
                    "tooltip": "Editor document. The canvas on the node writes this.",
                }),
                "draw_boxes": ("BOOLEAN", {
                    "default": True,
                    "tooltip": "Draw boxes and captions on the preview image. "
                               "Off returns the plate alone (reference, input image, or grid).",
                }),
            },
            "optional": {
                "image": ("IMAGE", {
                    "tooltip": "Optional plate. The preview is drawn on this image, "
                               "resized to the canvas. With Match input image enabled "
                               "in the editor, the canvas adopts this image's size.",
                }),
            },
        }

    def build(self, state, draw_boxes, image=None):
        doc = ingest(state)
        image_size = None
        if image is not None and getattr(image, "ndim", 0) == 4 and image.shape[0] > 0:
            # NHWC
            image_size = (int(image.shape[2]), int(image.shape[1]))
        working = working_state(doc, image_size)
        text = moss_str(working)
        width = int(working["width"])
        height = int(working["height"])

        frames: list[np.ndarray] = []
        if image is None:
            plate = _load_reference(working.get("bg"))
            frames.append(render_rgb(working, plate, bool(draw_boxes)))
        else:
            for index in range(int(image.shape[0])):
                plate = _frame_uint8(image[index])
                frames.append(render_rgb(working, plate, bool(draw_boxes)))
        preview = _to_tensor(frames)
        return (text, preview, width, height, elements(working), character_boxes(working),
                layout_prompt(working))


NODE_CLASS_MAPPINGS = {
    "BBoxStudio": BBoxStudio,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "BBoxStudio": "BBox Studio",
}
