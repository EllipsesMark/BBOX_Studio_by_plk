"""Run outside ComfyUI: python selftest.py"""

import json
import math
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from bbox_studio.model import (  # noqa: E402
    character_boxes,
    elements,
    ingest,
    layout_prompt,
    moss_dict,
    nearest_higher_preset,
    scale_to,
    working_state,
)
from bbox_studio.render import render_rgb  # noqa: E402


def check(name: str, cond: bool) -> None:
    if not cond:
        raise SystemExit(f"FAIL {name}")
    print(f"ok  {name}")


def stock_moss_items(element: list, width: int, height: int, character_boxes: str = "") -> list:
    """The items loop of ComfyUI's MOSSImageLayoutPrompt.execute, copied as is
    from comfy_extras/nodes_moss_image.py so the elements output is checked
    against what that node really does with it."""
    characters = {int(i) for i in re.findall(r"\d+", character_boxes)}
    items = []
    for i, el in enumerate(element if isinstance(element, list) else []):
        label = "text" if el.get("type") == "text" else ("character" if i + 1 in characters else "object")
        item = {"label": label, "caption": el.get("desc", "")}
        if item["label"] == "text":
            item["text"] = el.get("text", "")
        if el.get("color_palette"):
            item["palette"] = el["color_palette"]
        y0, x0, y1, x1 = el["bbox"]
        item["bbox"] = [math.floor(round(y0 * height / 1000, 9)) - height // 2, math.floor(round(x0 * width / 1000, 9)) - width // 2,
                        math.ceil(round(y1 * height / 1000, 9)) - height // 2, math.ceil(round(x1 * width / 1000, 9)) - width // 2]
        items.append(item)
    return items


def stock_moss_prompt(prompt: str, element: list, width: int, height: int, character_boxes: str = "") -> str:
    """The rest of MOSSImageLayoutPrompt.execute, copied the same way."""
    items = stock_moss_items(element, width, height, character_boxes)
    if not items:
        return prompt
    layout = {"summary": {"caption": prompt.strip()}, "items": items, "bbox_coord_space": "abs_centralized", "bbox_format": "yxyx"}
    return json.dumps(layout, ensure_ascii=False, separators=(",", ":"))


def main() -> None:
    check("preset 1000x800", nearest_higher_preset(1000, 800) == (1216, 832))
    check("preset exact", nearest_higher_preset(1024, 1024) == (1024, 1024))

    editor = ingest({
        "width": 1000,
        "height": 800,
        "canvas_type": "collage",
        "caption": "cover",
        "meta": ["album art"],
        "grid": "thirds",
        "items": [{
            "label": "character",
            "caption": "the singer",
            "y_min": 1.5,
            "x_min": -40,
            "y_max": 80.2,
            "x_max": 2.5,
            "color": "#FF00AA",
        }, {
            "label": "text",
            "caption": "title",
            "text": "HELLO",
            "y_min": -80,
            "x_min": -20,
            "y_max": -40,
            "x_max": 60,
        }],
    })
    check("custom size kept", (editor["width"], editor["height"]) == (1000, 800))
    moss = moss_dict(editor)
    check("space", moss["bbox_coord_space"] == "abs_centralized")
    check("format", moss["bbox_format"] == "yxyx")
    check("canvas", moss["summary"]["canvas"] == "collage")
    check("bankers round", moss["items"][0]["bbox"] == [2, -40, 80, 2])
    check("no text on character", "text" not in moss["items"][0])
    check("text kept", moss["items"][1]["text"] == "HELLO")
    check("editor fields stripped", "color" not in moss["items"][0])

    raw = ingest({
        "bbox_coord_space": "abs",
        "bbox_format": "xyxy",
        "summary": {"meta": ["poster"], "canvas": "single", "caption": "wall"},
        "items": [{"label": "object", "caption": "lamp", "bbox": [0, 0, 100, 50]}],
    })
    check("abs canvas", (raw["width"], raw["height"]) == (1024, 1024))
    box = moss_dict(raw)["items"][0]["bbox"]
    check("abs xyxy -> centered yxyx", box == [-512, -512, -462, -412])
    check("imported caption", raw["caption"] == "wall")
    check("imported meta", raw["meta"] == ["poster"])

    project = ingest({
        "format": "bbox-studio-project",
        "version": 2,
        "view": {"scale": 0.5, "offset_x": 12, "offset_y": -4},
        "layout": {
            "width": 1000,
            "height": 800,
            "summary": {"meta": ["scene"], "canvas": "multi_panel", "caption": "pages"},
            "bbox_coord_space": "abs_centralized",
            "bbox_format": "yxyx",
            "items": [{
                "label": "object",
                "caption": "panel",
                "bbox": [-100, -80, 100, 80],
                "color": "#6ee7a8",
                "locked": True,
                "aspect_locked": True,
            }],
        },
    })
    check("project size", (project["width"], project["height"]) == (1000, 800))
    check("project color", project["items"][0]["color"] == "#6ee7a8")
    check("project locks", project["items"][0]["locked"] and project["items"][0]["aspect_locked"])
    check("project view", project["view"]["scale"] == 0.5)
    check("project box", moss_dict(project)["items"][0]["bbox"] == [-100, -80, 100, 80])

    fitted = working_state(editor, (2000, 1600))
    check("match off keeps canvas", (fitted["width"], fitted["height"]) == (1000, 800))
    editor["match_input"] = True
    fitted = working_state(editor, (2000, 1600))
    check("match on adopts image", (fitted["width"], fitted["height"]) == (2000, 1600))
    scaled = moss_dict(fitted)["items"][0]["bbox"]
    # Stored 1.5 and 2.5 are scaled by 2, then bankers-rounded: 3 and 5.
    check("match scales boxes", scaled == [3, -80, 160, 5])

    grown = scale_to(ingest({"width": 1024, "height": 1024, "canvas_type": "single", "items": [{
        "label": "object", "caption": "", "y_min": -100, "x_min": -50, "y_max": 100, "x_max": 50,
    }]}), 2048, 1024)
    check("scale_to", moss_dict(grown)["items"][0]["bbox"] == [-100, -100, 100, 100])

    check("bad json", ingest("{")["width"] == 1024)

    # elements output: must survive ComfyUI's MOSS-Image Layout Prompt node.
    layout = ingest({
        "width": 2560,
        "height": 1440,
        "caption": "poster",
        "items": [
            {"label": "text", "caption": "lettering", "text": "BBOX STUDIO",
             "y_min": -700, "x_min": -950, "y_max": -221, "x_max": 1050},
            {"label": "object", "caption": "DJ Deck",
             "y_min": -165, "x_min": -1196, "y_max": 535, "x_max": -164},
            {"label": "character", "caption": "the DJ",
             "y_min": -54, "x_min": 29, "y_max": 599, "x_max": 1150},
        ],
    })
    els = elements(layout)
    check("element types", [e["type"] for e in els] == ["text", "obj", "obj"])
    check("element text", els[0]["text"] == "BBOX STUDIO" and "text" not in els[1])
    check("element desc", els[1]["desc"] == "DJ Deck")
    check("element grid", els[0]["bbox"] == [14, 129, 347, 910])
    check("element ints", all(type(v) is int and 0 <= v <= 1000 for e in els for v in e["bbox"]))
    check("character numbers", character_boxes(layout) == "3")
    check("no characters", character_boxes(editor) == "1" and character_boxes(ingest({})) == "")
    stock = stock_moss_items(els, 2560, 1440, character_boxes(layout))
    ours = moss_dict(layout)["items"]
    check("stock labels", [i["label"] for i in stock] == [i["label"] for i in ours])
    check("stock captions", [i["caption"] for i in stock] == [i["caption"] for i in ours])
    check("stock text", stock[0]["text"] == ours[0]["text"])
    worst = max(abs(a - b) for s, o in zip(stock, ours) for a, b in zip(s["bbox"], o["bbox"]))
    # the 0-1000 grid is 2.56 px wide here, and the stock node rounds outward
    check(f"stock boxes within 3 px (worst {worst})", worst <= 3)

    # prompt output: must be the string MOSS-Image Layout Prompt writes.
    # On a 1000 x 1000 canvas every pixel is on the 0-1000 grid, so the two
    # paths have to agree to the character.
    exact = ingest({
        "width": 1000,
        "height": 1000,
        "caption": "  a poster with a title and two people  ",
        "meta": ["poster"],
        "canvas_type": "collage",
        "items": [
            {"label": "text", "caption": "bold title", "text": "HELLO \"WORLD\" é",
             "y_min": -480, "x_min": -400, "y_max": -300, "x_max": 400},
            {"label": "character", "caption": "a woman waving",
             "y_min": -250, "x_min": -450, "y_max": 480, "x_max": -20},
            {"label": "object", "caption": "a red bicycle",
             "y_min": 0, "x_min": 40, "y_max": 470, "x_max": 460},
            {"label": "text", "caption": "empty text box", "text": "",
             "y_min": 400, "x_min": -100, "y_max": 480, "x_max": 100},
        ],
    })
    mine = layout_prompt(exact)
    theirs = stock_moss_prompt(exact["caption"], elements(exact), 1000, 1000, character_boxes(exact))
    check("prompt identical to stock node", mine == theirs)
    check("prompt is compact, one line", "\n" not in mine and mine.startswith('{"summary":{"caption":"a poster'))
    parsed = json.loads(mine)
    check("prompt summary is caption only", list(parsed["summary"]) == ["caption"])
    check("prompt caption stripped", parsed["summary"]["caption"] == "a poster with a title and two people")
    check("prompt key order", list(parsed["items"][0]) == ["label", "caption", "text", "bbox"])
    check("prompt labels", [i["label"] for i in parsed["items"]] == ["text", "character", "object", "text"])
    check("prompt empty text kept", parsed["items"][3]["text"] == "")
    check("prompt boxes match json", [i["bbox"] for i in parsed["items"]] == [i["bbox"] for i in moss_dict(exact)["items"]])
    bare = ingest({"width": 1024, "height": 1024, "caption": "just a caption", "items": []})
    check("prompt with no boxes is the caption", layout_prompt(bare) == "just a caption"
          == stock_moss_prompt("just a caption", elements(bare), 1024, 1024))
    check("prompt boxes exact at 2560", [i["bbox"] for i in json.loads(layout_prompt(layout))["items"]]
          == [[-700, -950, -221, 1050], [-165, -1196, 535, -164], [-54, 29, 599, 1150]])

    plate = render_rgb({
        "width": 200,
        "height": 200,
        "grid": "none",
        "selected": 0,
        "items": [{
            "label": "object",
            "caption": "box",
            "color": "#ff00aa",
            "y_min": -40,
            "x_min": -40,
            "y_max": 40,
            "x_max": 40,
        }],
    }, None, True)
    check("preview shape", plate.shape == (200, 200, 3))
    check("box edge", tuple(int(v) for v in plate[60, 100]) == (255, 0, 170))
    check("empty corner", tuple(int(v) for v in plate[5, 5]) == (12, 12, 18))
    bare = render_rgb({
        "width": 200, "height": 200, "grid": "none", "items": [{
            "label": "object", "caption": "box", "color": "#ff00aa",
            "y_min": -40, "x_min": -40, "y_max": 40, "x_max": 40,
        }],
    }, None, False)
    check("boxes off", tuple(int(v) for v in bare[60, 100]) != (255, 0, 170))
    print("all passed")


if __name__ == "__main__":
    main()
