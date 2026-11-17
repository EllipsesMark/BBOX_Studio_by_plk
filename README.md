# BBox Studio for ComfyUI

A bounding-box layout editor for MOSS-Image, built into one ComfyUI node. Draw boxes on the node, caption them, and wire the `prompt` output to your text encoder. No other layout node is needed.

- Draw, move and resize boxes directly on the node, over a grid or a reference image.
- Three box types: **Object**, **Character** and **Text** (with the text to render).
- Canvas size by preset, by width and height, or by **aspect ratio and megapixels**.
- `prompt` output writes the same string as ComfyUI's MOSS-Image Layout Prompt node.
- `elements` output for workflows that keep ComfyUI's own layout prompt node.
- Preview image with the boxes drawn, plus the canvas width and height for your latent.
- The layout is saved with the workflow. Import and export MOSS JSON and `.bbox` projects.

## Requirements

- A ComfyUI build with MOSS-Image support. Tested on ComfyUI 0.45.0 with frontend 1.58.5.
- No extra Python packages. It uses the torch, numpy and Pillow that ship with ComfyUI.
- Tested with the classic node rendering. The Vue node renderer ("Nodes 2.0") has not been tested.

## Install

Clone this repository into `ComfyUI/custom_nodes`, then restart ComfyUI:

```
cd ComfyUI/custom_nodes
git clone <URL of this repository> ComfyUI-BBoxStudio
```

Or use **Code → Download ZIP** on GitHub and unzip it to `ComfyUI/custom_nodes/ComfyUI-BBoxStudio`.

The node appears as **BBox Studio** in the `BBox Studio` category.

## Quick start

1. Add **BBox Studio** to your MOSS-Image workflow.
2. Set the canvas size in the toolbar.
3. Type a description of the whole image into **Prompt**, under Summary in the side panel.
4. Drag on the canvas to draw a box, pick its type, and give it a **Caption**. For a Text box, also fill in **Text**.
5. Wire `prompt` to the `text` input of your text encoder.
6. Wire `width` and `height` to your empty latent node so the image matches the canvas.

## Node

| Port | Direction | What it is |
|---|---|---|
| image | in, optional | Plate for the preview. Resized to the canvas. |
| draw_boxes | widget | Draw boxes on the preview. Off returns the plate or the empty grid. |
| prompt | out | The finished MOSS layout prompt. Wire this to the text encoder. |
| json | out | The same layout as the BBox Studio desktop app writes it, with Meta and Canvas. |
| preview | out | Canvas with the boxes drawn. |
| width, height | out | Canvas size after Match input image, if that is on. |
| elements | out | The boxes as an element list, the same one ComfyUI's Create Bounding Boxes outputs. |
| character_boxes | out | Numbers of the character boxes, for example `1, 3`. |

### Which output to use

1. **prompt → text encoder.** One node, nothing else needed. `prompt` is the string ComfyUI's MOSS-Image Layout Prompt node writes: the Summary **Prompt** box is that node's `prompt` box, and each box becomes an item. With no boxes it is the Summary Prompt alone. Meta and Canvas are not part of that format and are not in it.
2. **elements → MOSS-Image Layout Prompt.** For workflows that keep ComfyUI's node. Wire `elements` to `element`, `width` and `height` to the same inputs, and `character_boxes` to `character_boxes`. Type the image description into that node's `prompt` box; the Summary fields in the editor are not used on this path. Boxes go through a 0–1000 grid, so an edge can land a pixel or two from where `prompt` puts it.
3. **json.** The desktop app's format: the same boxes, plus Meta and Canvas, pretty-printed. Use it for saving or for other tools. For generation use `prompt`; in limited testing the model followed `prompt` and did not follow `json`.

`prompt` looks like this:

```json
{"summary":{"caption":"a cat on a sofa"},"items":[{"label":"character","caption":"a cat","bbox":[-100,-200,300,200]}],"bbox_coord_space":"abs_centralized","bbox_format":"yxyx"}
```

```
bbox_coord_space: abs_centralized
bbox_format:      yxyx   [y_min, x_min, y_max, x_max]
origin:           canvas center, y grows downward, units are pixels
```

## Canvas size

Three ways to set it, all in the toolbar:

- **Preset** list.
- Type **W** and **H**.
- **Aspect ratio** and **MP**. Pick a ratio and the canvas takes that shape at the megapixels shown; type megapixels and the canvas resizes and keeps its shape.

The aspect and megapixel math is ComfyUI's Resolution Selector node: 1 MP is 1024 × 1024, and each side is rounded to a multiple of 16. The ratios are that node's eight, plus 4:5 and 5:4.

Whichever way the size was set, the ratio list and MP show what it is, and the corner of the canvas reads, for example, `1936 × 1088 · 16:9 · 2.01 MP`. A size that is not one of the listed ratios shows as Custom ratio.

Changing the canvas size scales every box with it.

## Caption and Prompt

A box's **Caption** describes what is inside that one box. **Prompt**, under Summary, describes the whole image.

## Drawing

- Drag empty canvas to create a box. Drag a box to move it. Eight handles resize it.
- Double-click a box to edit its caption on the canvas.
- Object, Character and Text are the three MOSS labels. Only Text boxes have a text string.
- Lock keeps a box from moving. Aspect keeps its ratio while resizing.
- Wheel zooms toward the cursor. Middle mouse, or Space and drag, pans. Fit, 50%, 100% and 200% are in the toolbar.
- Pick a grid in the toolbar or by right-clicking the canvas. Snap pulls a box onto that grid when you let go. A reference image turns snap off.

## Reference image

**File → Load reference** uploads a picture into ComfyUI's input folder (`bbox_studio`) and sizes the canvas to it. JPEG, PNG and WebP all work.

A connected **image** input is the plate at run time. The reference you loaded is only used for the preview when nothing is connected.

**Match input image**, in the side panel, makes the run adopt the connected image's width and height and scales the boxes to match. The outputs from that run use those coordinates. Leave it off to keep the canvas you drew.

## Files

- **File → Import JSON or project** reads a MOSS `.json` (including `xyxy` boxes and top-left `abs` coordinates) or a BBox Studio `.bbox` project.
- **File → Export MOSS JSON** downloads the `json` layout.
- **File → Save .bbox project** downloads a project the BBox Studio desktop app can open.
- **Copy JSON** in the toolbar copies the `json` layout to the clipboard.

## Keys

Click the canvas first so the editor has the keyboard.

| Key | Action |
|---|---|
| Delete / Backspace | Delete the selected box |
| Ctrl+Z / Ctrl+Y | Undo / redo (this session, 80 steps) |
| Ctrl+C | Copy the `json` layout |
| Ctrl+S | Download a `.bbox` project |
| Left / Right arrow | Select the previous / next box |
| Escape | Close caption editing and deselect |
| + / − | Zoom |

Delete and Backspace never remove the node while you are working in the editor. To delete the node, click its title bar first, then press Delete.

Undo history is kept for the session. The workflow stores the current layout, not the undo stack.

## Development

`python selftest.py` runs the checks for the layout model, the outputs and the preview renderer. It does not need ComfyUI running.
