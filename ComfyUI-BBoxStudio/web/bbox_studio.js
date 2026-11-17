// BBox Studio — MOSS-Image bounding box editor, drawn on the node.
// Coordinate space matches the desktop app and bbox_studio/model.py:
//   origin at the canvas center, y grows downward, bbox is yxyx.

import { app } from "/scripts/app.js";
import { api } from "/scripts/api.js";

const MIN_BOX = 20;
const DEFAULT_CAPTION = "A clean composition with carefully placed elements.";
const PALETTE = [
  "#7c9cff", "#6ee7a8", "#f9a8d4", "#fbbf24", "#a78bfa",
  "#34d399", "#fb923c", "#60a5fa", "#e879f9", "#4ade80",
  "#f472b6", "#38bdf8", "#c084fc", "#facc15", "#2dd4bf",
];
const COMMON = [
  [512, 512], [1024, 1024], [1536, 1536], [2048, 2048],
  [832, 1216], [896, 1152], [1024, 1536], [720, 1280], [1080, 1920], [1440, 2560],
  [1216, 832], [1152, 896], [1536, 1024], [1280, 720], [1920, 1080], [2560, 1440],
];
const SIZE_GROUPS = [
  ["Square", [[512, 512], [1024, 1024], [1536, 1536], [2048, 2048]]],
  ["Portrait", [[832, 1216], [896, 1152], [1024, 1536], [720, 1280], [1080, 1920], [1440, 2560]]],
  ["Landscape", [[1216, 832], [1152, 896], [1536, 1024], [1280, 720], [1920, 1080], [2560, 1440]]],
];
// Aspect ratio + megapixels, same math as ComfyUI's Resolution Selector node
// (comfy_extras/nodes_resolution.py): 1 MP is 1024 x 1024, each side is rounded
// to a multiple. The first eight ratios are that node's list; 4:5 and 5:4 are
// added for social posts. The multiple is 16, the step MOSS-Image sizes use.
const ASPECTS = [
  ["1:1", "Square", 1, 1],
  ["2:3", "Portrait Photo", 2, 3],
  ["3:2", "Photo", 3, 2],
  ["3:4", "Portrait Standard", 3, 4],
  ["4:3", "Standard", 4, 3],
  ["9:16", "Portrait Widescreen", 9, 16],
  ["16:9", "Widescreen", 16, 9],
  ["21:9", "Ultrawide", 21, 9],
  ["4:5", "Portrait Social", 4, 5],
  ["5:4", "Social", 5, 4],
];
const SIZE_MULTIPLE = 16;
const MEGAPIXEL = 1024 * 1024;
const MP_MIN = 0.1;
const MP_MAX = 16;
const META = [
  ["scene", ["scene"]],
  ["poster", ["poster"]],
  ["minimal graphic design", ["minimal graphic design"]],
  ["editorial layout", ["editorial layout"]],
  ["book cover", ["book cover"]],
  ["album art", ["album art"]],
  ["vintage travel poster", ["vintage travel poster"]],
  ["product campaign + studio photo", ["product campaign", "studio photography"]],
  ["e-commerce banner", ["e-commerce banner"]],
  ["advertisement", ["advertisement"]],
  ["packaging mockup", ["packaging mockup"]],
  ["infographic", ["infographic"]],
  ["knowledge graphic", ["knowledge graphic"]],
  ["diagram", ["diagram"]],
  ["ui mockup", ["ui mockup"]],
  ["slide deck", ["slide deck"]],
  ["anime illustration", ["anime illustration"]],
  ["comic page", ["comic page"]],
  ["manga", ["manga"]],
  ["children's book illustration", ["children's book illustration"]],
  ["flat vector art", ["flat vector art"]],
  ["cinematic still", ["cinematic still"]],
  ["street photography", ["street photography"]],
  ["portrait photography", ["portrait photography"]],
  ["macro photography", ["macro photography"]],
];
const GRIDS = [
  ["default", "Default grid"],
  ["fine", "Fine grid"],
  ["coarse", "Coarse grid"],
  ["dots", "Dotted grid"],
  ["thirds", "Rule of thirds"],
  ["golden", "Golden ratio"],
  ["cross", "Center cross"],
  ["none", "No grid"],
];
const CURSORS = {
  nw: "nwse-resize", se: "nwse-resize",
  ne: "nesw-resize", sw: "nesw-resize",
  n: "ns-resize", s: "ns-resize",
  w: "ew-resize", e: "ew-resize",
};

const CSS = `
.bbs { height:100%; min-height:520px; display:flex; flex-direction:column;
  background:#12121a; color:#e4e4ef; font:12px "Segoe UI", system-ui, sans-serif;
  border-radius:8px; overflow:hidden; user-select:none; }
.bbs-top, .bbs-status { display:flex; flex-wrap:wrap; gap:6px; align-items:center;
  padding:6px 8px; background:#1a1a26; }
.bbs-brand { font-weight:650; letter-spacing:.02em; margin-right:4px; }
.bbs-top label, .bbs-side label { display:flex; align-items:center; gap:4px; color:#8b8ba0; }
.bbs button, .bbs select, .bbs input, .bbs textarea {
  background:#12121a; color:#e4e4ef; border:1px solid #2e2e42; border-radius:6px;
  font:12px "Segoe UI", system-ui, sans-serif; }
.bbs button { padding:4px 8px; cursor:pointer; }
.bbs button:hover { border-color:#7c9cff; }
.bbs button:disabled { opacity:.4; cursor:default; }
.bbs button.primary { background:#243056; border-color:#7c9cff; }
.bbs input[type="number"] { width:64px; padding:3px 6px; }
.bbs select { padding:3px 4px; max-width:160px; }
.bbs-main { flex:1 1 0; min-height:360px; display:flex; gap:6px; padding:6px; }
.bbs-stage { position:relative; flex:1; min-width:0; background:#16161f; border-radius:6px; overflow:hidden; }
.bbs-stage canvas { position:absolute; inset:0; width:100%; height:100%; display:block; touch-action:none; cursor:crosshair; }
.bbs-inline, .bbs-keys { position:absolute; }
.bbs-inline { z-index:2; display:none; min-width:80px; padding:2px 6px;
  border-color:#7c9cff; background:#1a1a26; }
.bbs-keys { width:1px; height:1px; opacity:0; border:0; padding:0; left:0; top:0; }
.bbs-side { width:248px; flex:0 0 248px; min-height:0; overflow:auto; display:flex; flex-direction:column; gap:6px;
  background:#1a1a26; border-radius:6px; padding:8px; }
.bbs-add, .bbs-row { display:flex; gap:4px; }
.bbs-add button, .bbs-row button { flex:1; }
.bbs-sec { color:#8b8ba0; font-size:10px; letter-spacing:.08em; text-transform:uppercase; margin-top:4px; }
.bbs-side label.stack { flex-direction:column; align-items:stretch; gap:3px; }
.bbs textarea { width:100%; min-height:48px; resize:vertical; padding:4px 6px; box-sizing:border-box; }
.bbs-json { margin:0; max-height:140px; overflow:auto; white-space:pre-wrap; word-break:break-word;
  background:#12121a; border:1px solid #2e2e42; border-radius:6px; padding:6px;
  color:#8b8ba0; font:10.5px/1.4 ui-monospace, Consolas, monospace; user-select:text; }
.bbs-status { color:#8b8ba0; min-height:16px; }
.bbs-note { display:none; color:#fbbf24; font-size:11px; line-height:1.35; }
.bbs-menu { position:fixed; z-index:10050; background:#1a1a26; border:1px solid #2e2e42;
  border-radius:8px; padding:4px; min-width:180px; box-shadow:0 12px 40px rgba(0,0,0,.45); }
.bbs-menu button { display:block; width:100%; text-align:left; background:transparent;
  color:#e4e4ef; border:0; border-radius:5px; padding:6px 10px; }
.bbs-menu button:hover { background:#2a2a3c; }
.bbs-sep { height:1px; background:#2e2e42; margin:4px 0; }
.bbs-check { color:#e4e4ef !important; }
`;

function ensureStyle() {
  if (document.getElementById("bbs-style")) return;
  const style = document.createElement("style");
  style.id = "bbs-style";
  style.textContent = CSS;
  document.head.appendChild(style);
}

function el(tag, cls, text) {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text != null) node.textContent = text;
  return node;
}

function clampSide(value, fallback = 1024) {
  const n = parseInt(value, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(64, Math.min(8192, n));
}

function pyRound(n) {
  if (!Number.isFinite(n)) return 0;
  const f = Math.floor(n);
  const diff = n - f;
  if (diff > 0.5) return f + 1;
  if (diff < 0.5) return f;
  return (f % 2 === 0) ? f : f + 1;
}

function megapixelsOf(width, height) {
  return (width * height) / MEGAPIXEL;
}

function sizeForAspect(wRatio, hRatio, megapixels) {
  const scale = Math.sqrt((megapixels * MEGAPIXEL) / (wRatio * hRatio));
  return [
    pyRound((wRatio * scale) / SIZE_MULTIPLE) * SIZE_MULTIPLE,
    pyRound((hRatio * scale) / SIZE_MULTIPLE) * SIZE_MULTIPLE,
  ];
}

// A size counts as a ratio when rounding each side to the multiple explains
// the difference, so 1360 x 768 is 16:9 and 1216 x 832 is not 3:2.
function aspectFits(width, height, wRatio, hRatio) {
  return Math.abs(width * hRatio - height * wRatio) <= (SIZE_MULTIPLE / 2) * (wRatio + hRatio);
}

function aspectOf(width, height, prefer = "") {
  const kept = ASPECTS.find(([id]) => id === prefer);
  if (kept && aspectFits(width, height, kept[2], kept[3])) return kept[0];
  let best = "";
  let bestError = Infinity;
  for (const [id, , wRatio, hRatio] of ASPECTS) {
    if (!aspectFits(width, height, wRatio, hRatio)) continue;
    const error = Math.abs(width / height - wRatio / hRatio);
    if (error < bestError) { best = id; bestError = error; }
  }
  return best;
}

function ratioText(width, height) {
  const named = aspectOf(width, height);
  if (named) return named;
  return width >= height ? `${(width / height).toFixed(2)}:1` : `1:${(height / width).toFixed(2)}`;
}

function validColor(value, index) {
  const text = String(value || "").trim();
  if (/^#[0-9a-fA-F]{6}$/.test(text)) return text.toLowerCase();
  return PALETTE[index % PALETTE.length];
}

function defaultState() {
  return {
    width: 1024,
    height: 1024,
    meta: ["scene"],
    canvas_type: "single",
    caption: DEFAULT_CAPTION,
    grid: "default",
    snap: false,
    match_input: false,
    bg: null,
    view: { scale: 1, offset_x: 0, offset_y: 0 },
    selected: null,
    items: [],
  };
}

function clampItem(item, width, height) {
  const halfW = width / 2;
  const halfH = height / 2;
  item.y_min = Math.max(-halfH, Math.min(halfH - MIN_BOX, Number(item.y_min) || 0));
  item.x_min = Math.max(-halfW, Math.min(halfW - MIN_BOX, Number(item.x_min) || 0));
  item.y_max = Math.max(item.y_min + MIN_BOX, Math.min(halfH, Number(item.y_max) || 0));
  item.x_max = Math.max(item.x_min + MIN_BOX, Math.min(halfW, Number(item.x_max) || 0));
}

function itemFromRaw(raw, index) {
  const bbox = Array.isArray(raw.bbox) ? raw.bbox : null;
  const item = {
    label: String(raw.label || "object").trim() || "object",
    caption: String(raw.caption || ""),
    text: String(raw.text || ""),
    color: validColor(raw.color, index),
    locked: !!raw.locked,
    aspect_locked: !!raw.aspect_locked,
    y_min: Number(bbox ? bbox[0] : raw.y_min) || 0,
    x_min: Number(bbox ? bbox[1] : raw.x_min) || 0,
    y_max: Number(bbox ? bbox[2] : raw.y_max) || 0,
    x_max: Number(bbox ? bbox[3] : raw.x_max) || 0,
  };
  return item;
}

function nearestPreset(needW, needH) {
  needW = Math.max(64, needW | 0);
  needH = Math.max(64, needH | 0);
  const candidates = COMMON.filter(([w, h]) => w >= needW && h >= needH);
  if (candidates.length) {
    candidates.sort((a, b) => {
      const area = (a[0] * a[1] - needW * needH) - (b[0] * b[1] - needW * needH);
      if (area) return area;
      const over = ((a[0] - needW) + (a[1] - needH)) - ((b[0] - needW) + (b[1] - needH));
      if (over) return over;
      return a[0] * a[1] - b[0] * b[1];
    });
    return candidates[0];
  }
  const best = COMMON.reduce((p, c) => (c[0] * c[1] > p[0] * p[1] ? c : p), COMMON[0]);
  return [Math.max(best[0], needW), Math.max(best[1], needH)];
}

function fromMoss(data) {
  const summary = data.summary && typeof data.summary === "object" ? data.summary : {};
  const explicit = Number(data.width) > 0 && Number(data.height) > 0;
  const explicitW = explicit ? clampSide(data.width) : null;
  const explicitH = explicit ? clampSide(data.height) : null;
  let width = explicitW || 1024;
  let height = explicitH || 1024;
  const space = data.bbox_coord_space || "abs_centralized";
  const fmt = data.bbox_format || "yxyx";
  const items = [];
  for (const raw of data.items || []) {
    if (!raw || typeof raw !== "object") continue;
    const bbox = Array.isArray(raw.bbox) ? raw.bbox : [0, 0, 100, 100];
    let yMin, xMin, yMax, xMax;
    if (fmt === "xyxy") {
      xMin = Number(bbox[0]) || 0;
      yMin = Number(bbox[1]) || 0;
      xMax = Number(bbox[2]) || 0;
      yMax = Number(bbox[3]) || 0;
    } else {
      yMin = Number(bbox[0]) || 0;
      xMin = Number(bbox[1]) || 0;
      yMax = Number(bbox[2]) || 0;
      xMax = Number(bbox[3]) || 0;
    }
    if (space === "abs") {
      const w = explicitW || width;
      const h = explicitH || height;
      yMin -= h / 2; xMin -= w / 2; yMax -= h / 2; xMax -= w / 2;
    }
    const item = itemFromRaw({
      label: raw.label,
      caption: raw.caption,
      text: raw.text,
      color: raw.color,
      locked: raw.locked,
      aspect_locked: raw.aspect_locked,
      y_min: yMin,
      x_min: xMin,
      y_max: yMax,
      x_max: xMax,
    }, items.length);
    items.push(item);
  }
  if (items.length) {
    let maxAx = 0;
    let maxAy = 0;
    for (const item of items) {
      maxAx = Math.max(maxAx, Math.abs(item.x_min), Math.abs(item.x_max));
      maxAy = Math.max(maxAy, Math.abs(item.y_min), Math.abs(item.y_max));
    }
    let inferredW = Math.max(64, Math.ceil(maxAx * 2 - 1e-9));
    let inferredH = Math.max(64, Math.ceil(maxAy * 2 - 1e-9));
    if (explicitW && explicitH) {
      inferredW = Math.max(inferredW, explicitW);
      inferredH = Math.max(inferredH, explicitH);
    }
    if (inferredW < 1024 && inferredH < 1024) {
      inferredW = 1024;
      inferredH = 1024;
    }
    [width, height] = nearestPreset(inferredW, inferredH);
  }
  const caption = summary.caption != null ? String(summary.caption)
    : (data.caption != null ? String(data.caption) : DEFAULT_CAPTION);
  const metaSrc = summary.meta != null ? summary.meta : data.meta;
  const meta = Array.isArray(metaSrc)
    ? metaSrc.map((part) => String(part).trim()).filter(Boolean)
    : String(metaSrc || "scene").split(",").map((part) => part.trim()).filter(Boolean);
  const state = defaultState();
  state.width = width;
  state.height = height;
  state.meta = meta.length ? meta : ["scene"];
  state.canvas_type = String(summary.canvas || data.canvas_type || "single") || "single";
  state.caption = caption;
  state.items = items;
  state.items.forEach((item) => clampItem(item, state.width, state.height));
  return state;
}

function sanitizeBg(bg) {
  if (!bg || !bg.filename) return null;
  const filename = String(bg.filename).replace(/\\/g, "/").split("/").pop();
  if (!filename) return null;
  return {
    filename,
    subfolder: String(bg.subfolder || ""),
    type: String(bg.type || "input"),
  };
}

function fromEditor(data) {
  const state = defaultState();
  if (!data || typeof data !== "object") return state;
  state.width = clampSide(data.width, 1024);
  state.height = clampSide(data.height, 1024);
  state.meta = Array.isArray(data.meta) && data.meta.length
    ? data.meta.map((part) => String(part))
    : ["scene"];
  state.canvas_type = String(data.canvas_type || "single") || "single";
  state.caption = data.caption == null ? DEFAULT_CAPTION : String(data.caption);
  state.grid = String(data.grid || "default");
  state.snap = !!data.snap;
  state.match_input = !!data.match_input;
  state.bg = sanitizeBg(data.bg);
  if (data.view && typeof data.view === "object") {
    state.view = {
      scale: Math.min(4, Math.max(0.08, Number(data.view.scale) || 1)),
      offset_x: Number(data.view.offset_x) || 0,
      offset_y: Number(data.view.offset_y) || 0,
    };
  }
  state.items = (data.items || []).filter((raw) => raw && typeof raw === "object")
    .map((raw, index) => itemFromRaw(raw, index));
  state.items.forEach((item) => clampItem(item, state.width, state.height));
  const selected = data.selected;
  state.selected = Number.isInteger(selected) && selected >= 0 && selected < state.items.length
    ? selected : null;
  return state;
}

function fromProject(data) {
  const layout = data.layout && typeof data.layout === "object" ? data.layout : data;
  const state = fromMoss(layout);
  if (Number(layout.width) > 0 && Number(layout.height) > 0) {
    state.width = clampSide(layout.width);
    state.height = clampSide(layout.height);
    state.items.forEach((item) => clampItem(item, state.width, state.height));
  }
  if (data.view && typeof data.view.scale === "number") {
    state.view = {
      scale: Math.min(4, Math.max(0.08, Number(data.view.scale) || 1)),
      offset_x: Number(data.view.offset_x) || 0,
      offset_y: Number(data.view.offset_y) || 0,
    };
  }
  state.bg = sanitizeBg(data.bg);
  return state;
}

function adopt(data) {
  if (!data || typeof data !== "object") return defaultState();
  if (data.format === "bbox-studio-project" || (data.layout && data.history)) return fromProject(data);
  if ((data.canvas_type || data.grid || data.match_input != null) && !data.summary && !data.bbox_coord_space) {
    return fromEditor(data);
  }
  if (data.summary || data.bbox_coord_space || data.items) return fromMoss(data);
  return fromEditor(data);
}

function toMoss(state) {
  const items = state.items.map((item) => {
    const entry = {
      label: item.label || "object",
      caption: item.caption || "",
      bbox: [pyRound(item.y_min), pyRound(item.x_min), pyRound(item.y_max), pyRound(item.x_max)],
    };
    if (entry.label === "text" && item.text) entry.text = item.text;
    return entry;
  });
  return {
    summary: {
      meta: state.meta?.length ? state.meta.slice() : ["scene"],
      canvas: state.canvas_type || "single",
      caption: state.caption == null ? "" : state.caption,
    },
    items,
    bbox_coord_space: "abs_centralized",
    bbox_format: "yxyx",
  };
}

function presetLabel(tags) {
  const key = (tags || []).join("\n");
  const found = META.find(([, list]) => list.join("\n") === key);
  return found ? found[0] : "custom";
}

function hideWidget(widget) {
  if (!widget) return;
  widget.hidden = true;
  widget.computeSize = () => [0, -4];
  widget.serialize = true;
}

function repairWidgetWidth(widget) {
  if (!widget || widget.__bbsWidthGuard) return;
  const prev = Object.getOwnPropertyDescriptor(widget, "width");
  if (prev && !prev.configurable) return;
  const vueMode = () => Boolean(globalThis.LiteGraph?.vueNodesMode);
  let stored = vueMode() ? widget.width : undefined;
  Object.defineProperties(widget, {
    __bbsWidthGuard: { value: true, configurable: true },
    width: {
      configurable: true,
      enumerable: prev?.enumerable ?? true,
      get() { return stored; },
      set(value) { stored = vueMode() ? value : undefined; },
    },
  });
}

function setup(node) {
  if (node._bbsMounted || typeof node.addDOMWidget !== "function") return;
  node._bbsMounted = true;
  ensureStyle();

  const stateWidget = node.widgets?.find((widget) => widget.name === "state");
  if (!stateWidget) return;
  hideWidget(stateWidget);
  const drawWidget = node.widgets?.find((widget) => widget.name === "draw_boxes");
  if (drawWidget) drawWidget.label = "Draw boxes";

  let state = defaultState();
  let history = [];
  let histIndex = -1;
  let histLock = false;
  let filling = false;
  let aspectChoice = "";
  let drag = null;
  let spaceDown = false;
  let bgImage = null;
  let bgToken = 0;
  let pendingFit = true;
  let inlineOpen = false;
  let menuEl = null;
  let ratio = 1;

  const root = el("div", "bbs");
  root.tabIndex = -1;
  const top = el("div", "bbs-top");
  const brand = el("span", "bbs-brand", "BBox Studio");
  brand.title = "Drag to draw. Double-click a box to caption it. Wheel zooms, middle mouse pans. Delete removes the box.";
  const sizeSel = document.createElement("select");
  sizeSel.title = "Canvas preset";
  const customOpt = document.createElement("option");
  customOpt.value = "custom";
  customOpt.textContent = "Custom";
  sizeSel.append(customOpt);
  for (const [group, sizes] of SIZE_GROUPS) {
    const label = document.createElement("option");
    label.disabled = true;
    label.textContent = group;
    sizeSel.append(label);
    for (const [w, h] of sizes) {
      const opt = document.createElement("option");
      opt.value = `${w}x${h}`;
      opt.dataset.w = String(w);
      opt.dataset.h = String(h);
      opt.textContent = `${w} × ${h}`;
      sizeSel.append(opt);
    }
  }
  const wIn = document.createElement("input");
  wIn.type = "number"; wIn.min = "64"; wIn.max = "8192"; wIn.step = "1";
  const hIn = document.createElement("input");
  hIn.type = "number"; hIn.min = "64"; hIn.max = "8192"; hIn.step = "1";
  const aspectSel = document.createElement("select");
  aspectSel.title = "Aspect ratio. Picking one resizes the canvas to that shape at the megapixels on the right.";
  aspectSel.add(new Option("Custom ratio", ""));
  for (const [id, name] of ASPECTS) aspectSel.add(new Option(`${id} (${name})`, id));
  const mpIn = document.createElement("input");
  mpIn.type = "number"; mpIn.min = String(MP_MIN); mpIn.max = String(MP_MAX); mpIn.step = "0.01";
  mpIn.title = "Megapixels. 1 MP is 1024 × 1024. Typing a value resizes the canvas and keeps its shape.";
  const fitBtn = button("Fit", "fit");
  const z50 = button("50%", "z50");
  const z100 = button("100%", "z100");
  const z200 = button("200%", "z200");
  const snapIn = document.createElement("input");
  snapIn.type = "checkbox";
  const gridSel = document.createElement("select");
  for (const [id, label] of GRIDS) gridSel.add(new Option(label, id));
  const fileBtn = button("File", "file");
  const copyBtn = button("Copy JSON", "copy");
  copyBtn.className = "primary";
  const undoBtn = button("Undo", "undo");
  const redoBtn = button("Redo", "redo");
  const resetBtn = button("Reset", "reset");
  const wLabel = el("label"); wLabel.append("W", wIn);
  const hLabel = el("label"); hLabel.append("H", hIn);
  const snapLabel = el("label", "bbs-check"); snapLabel.append(snapIn, document.createTextNode("Snap"));
  const mpLabel = el("label"); mpLabel.append("MP", mpIn);
  top.append(brand, sizeSel, wLabel, hLabel, aspectSel, mpLabel, fitBtn, z50, z100, z200, snapLabel, gridSel, fileBtn, copyBtn, undoBtn, redoBtn, resetBtn);

  const main = el("div", "bbs-main");
  const stage = el("div", "bbs-stage");
  const canvas = document.createElement("canvas");
  canvas.style.width = "100%";
  canvas.style.height = "100%";
  canvas.style.display = "block";
  const ctx = canvas.getContext("2d");
  const inline = document.createElement("input");
  inline.className = "bbs-inline";
  inline.spellcheck = false;
  const keytrap = document.createElement("input");
  keytrap.className = "bbs-keys";
  keytrap.tabIndex = -1;
  keytrap.readOnly = true;
  keytrap.setAttribute("aria-hidden", "true");
  stage.append(canvas, inline, keytrap);

  const side = el("div", "bbs-side");
  const addRow = el("div", "bbs-add");
  const addObject = button("Object", "add-object");
  const addCharacter = button("Character", "add-character");
  const addText = button("Text", "add-text");
  addRow.append(addObject, addCharacter, addText);
  side.append(addRow, el("div", "bbs-sec", "Box"));
  const labelSel = document.createElement("select");
  for (const name of ["object", "character", "text"]) labelSel.add(new Option(name, name));
  const colorIn = document.createElement("input");
  colorIn.type = "color";
  const capIn = document.createElement("textarea");
  capIn.rows = 2;
  const textIn = document.createElement("textarea");
  textIn.rows = 2;
  const textWrap = el("label", "stack");
  textWrap.append("Text", textIn);
  const lockIn = document.createElement("input");
  lockIn.type = "checkbox";
  const aspectIn = document.createElement("input");
  aspectIn.type = "checkbox";
  const lockLabel = el("label", "bbs-check"); lockLabel.append(lockIn, document.createTextNode("Lock"));
  const aspectLabel = el("label", "bbs-check"); aspectLabel.append(aspectIn, document.createTextNode("Aspect"));
  const flagRow = el("div", "bbs-row"); flagRow.append(lockLabel, aspectLabel);
  const dupBtn = button("Duplicate", "dup");
  const frontBtn = button("Front", "front");
  const delBtn = button("Delete", "del");
  const opRow = el("div", "bbs-row"); opRow.append(dupBtn, frontBtn, delBtn);
  const labelWrap = el("label", "stack"); labelWrap.append("Type", labelSel);
  const colorWrap = el("label"); colorWrap.append("Color", colorIn);
  const capWrap = el("label", "stack"); capWrap.append("Caption", capIn);
  side.append(labelWrap, colorWrap, capWrap, textWrap, flagRow, opRow);
  side.append(el("div", "bbs-sec", "Summary"));
  const metaSel = document.createElement("select");
  for (const [name] of META) metaSel.add(new Option(name, name));
  metaSel.add(new Option("custom", "custom"));
  const metaCustom = document.createElement("input");
  metaCustom.type = "text";
  metaCustom.placeholder = "tags, comma separated";
  const canvasSel = document.createElement("select");
  for (const name of ["single", "multi_panel", "collage"]) canvasSel.add(new Option(name, name));
  const summary = document.createElement("textarea");
  summary.rows = 3;
  const metaWrap = el("label", "stack"); metaWrap.append("Meta", metaSel);
  const canvasWrap = el("label", "stack"); canvasWrap.append("Canvas", canvasSel);
  const summaryWrap = el("label", "stack"); summaryWrap.append("Prompt", summary);
  const matchIn = document.createElement("input");
  matchIn.type = "checkbox";
  const matchLabel = el("label", "bbs-check");
  matchLabel.title = "At run time, adopt the connected image's size and scale the boxes to it.";
  matchLabel.append(matchIn, document.createTextNode("Match input image"));
  const matchNote = el("div", "bbs-note", "On run, the json output scales onto the connected image. The box below stays on this canvas.");
  side.append(metaWrap, metaCustom, canvasWrap, summaryWrap, matchLabel, matchNote);
  side.append(el("div", "bbs-sec", "MOSS JSON"));
  const jsonPre = el("pre", "bbs-json");
  side.append(jsonPre);
  const statusEl = el("div", "bbs-status");
  const fileInput = document.createElement("input");
  fileInput.type = "file";
  fileInput.hidden = true;
  root.append(top, main, statusEl, fileInput);
  main.append(stage, side);

  function button(text, act) {
    const nodeBtn = document.createElement("button");
    nodeBtn.type = "button";
    nodeBtn.textContent = text;
    nodeBtn.dataset.act = act;
    return nodeBtn;
  }

  function contentOf(source) {
    return JSON.parse(JSON.stringify({
      width: source.width,
      height: source.height,
      meta: source.meta,
      canvas_type: source.canvas_type,
      caption: source.caption,
      grid: source.grid,
      snap: source.snap,
      match_input: source.match_input,
      bg: source.bg,
      selected: source.selected,
      items: source.items,
    }));
  }

  function writeWidget(mark) {
    const text = JSON.stringify(state);
    stateWidget.value = text;
    if (stateWidget.inputEl) stateWidget.inputEl.value = text;
    if (mark && app.graph) app.graph.setDirtyCanvas(true, true);
  }

  function resetHistory() {
    history = [contentOf(state)];
    histIndex = 0;
  }

  function pushHistory() {
    if (histLock || filling) return;
    const snap = contentOf(state);
    const key = JSON.stringify(snap);
    if (histIndex >= 0 && JSON.stringify(history[histIndex]) === key) return;
    history = history.slice(0, histIndex + 1);
    history.push(snap);
    if (history.length > 80) history.splice(0, history.length - 80);
    histIndex = history.length - 1;
  }

  function applySnap(snap) {
    histLock = true;
    const view = state.view;
    const sizeChanged = snap.width !== state.width || snap.height !== state.height;
    const bgChanged = JSON.stringify(snap.bg || null) !== JSON.stringify(state.bg || null);
    state.width = snap.width;
    state.height = snap.height;
    state.meta = snap.meta.slice();
    state.canvas_type = snap.canvas_type;
    state.caption = snap.caption;
    state.grid = snap.grid || "default";
    state.snap = !!snap.snap;
    state.match_input = !!snap.match_input;
    state.bg = snap.bg ? { ...snap.bg } : null;
    state.selected = Number.isInteger(snap.selected) ? snap.selected : null;
    state.items = JSON.parse(JSON.stringify(snap.items || []));
    state.view = view;
    histLock = false;
    if (sizeChanged) pendingFit = true;
    writeWidget(true);
    syncForm();
    if (bgChanged) loadBg();
    resizeCanvas();
  }

  function undo() {
    if (histIndex <= 0) { setStatus("Nothing to undo"); return; }
    histIndex -= 1;
    applySnap(history[histIndex]);
    setStatus(`Undo ${histIndex + 1}/${history.length}`);
  }

  function redo() {
    if (histIndex >= history.length - 1) { setStatus("Nothing to redo"); return; }
    histIndex += 1;
    applySnap(history[histIndex]);
    setStatus(`Redo ${histIndex + 1}/${history.length}`);
  }

  function current() {
    return state.selected == null ? null : state.items[state.selected] || null;
  }

  function setStatus(message) {
    const n = state.items.length;
    const boxes = n === 1 ? "1 box" : `${n} boxes`;
    statusEl.textContent = message ? `${message}   ·   ${boxes}` : boxes;
  }

  function syncForm() {
    filling = true;
    wIn.value = String(state.width);
    hIn.value = String(state.height);
    const preset = `${state.width}x${state.height}`;
    sizeSel.value = [...sizeSel.options].some((option) => option.value === preset) ? preset : "custom";
    aspectChoice = aspectOf(state.width, state.height, aspectChoice);
    aspectSel.value = aspectChoice;
    mpIn.value = megapixelsOf(state.width, state.height).toFixed(2);
    gridSel.value = GRIDS.some(([id]) => id === state.grid) ? state.grid : "default";
    snapIn.checked = !!state.snap;
    matchIn.checked = !!state.match_input;
    matchNote.style.display = state.match_input ? "block" : "none";
    summary.value = state.caption || "";
    metaCustom.value = (state.meta || []).join(", ");
    metaSel.value = presetLabel(state.meta);
    canvasSel.value = ["single", "multi_panel", "collage"].includes(state.canvas_type)
      ? state.canvas_type : "single";
    const item = current();
    const on = !!item;
    for (const input of [labelSel, colorIn, capIn, textIn, lockIn, aspectIn, dupBtn, frontBtn, delBtn]) {
      input.disabled = !on;
    }
    const labels = ["object", "character", "text"];
    labelSel.replaceChildren();
    for (const name of labels) labelSel.add(new Option(name, name));
    if (item && !labels.includes(item.label)) labelSel.add(new Option(item.label, item.label));
    textWrap.style.display = item && item.label === "text" ? "" : "none";
    if (item) {
      labelSel.value = item.label || "object";
      colorIn.value = validColor(item.color, 0);
      capIn.value = item.caption || "";
      textIn.value = item.text || "";
      lockIn.checked = !!item.locked;
      aspectIn.checked = !!item.aspect_locked;
    } else {
      capIn.value = "";
      textIn.value = "";
      lockIn.checked = false;
      aspectIn.checked = false;
    }
    jsonPre.textContent = JSON.stringify(toMoss(state), null, 2);
    filling = false;
    if (!statusEl.dataset.sticky) setStatus("");
  }

  // Drawing and the pointer share one space: view units, which are the
  // canvas's layout pixels. The bitmap is view × ratio so it stays sharp.
  function viewW() { return canvas.width / ratio; }
  function viewH() { return canvas.height / ratio; }

  function imgToCanvas(x, y) {
    const cx = viewW() / 2 + state.view.offset_x;
    const cy = viewH() / 2 + state.view.offset_y;
    return [cx + x * state.view.scale, cy + y * state.view.scale];
  }

  function canvasToImg(cx, cy) {
    const ox = viewW() / 2 + state.view.offset_x;
    const oy = viewH() / 2 + state.view.offset_y;
    const scale = state.view.scale || 1;
    return [(cx - ox) / scale, (cy - oy) / scale];
  }

  function localPos(event) {
    // The graph zoom scales this node on screen, so the on-screen box and the
    // view size differ. Scale the pointer into view units.
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return [0, 0];
    return [
      (event.clientX - rect.left) * (viewW() / rect.width),
      (event.clientY - rect.top) * (viewH() / rect.height),
    ];
  }

  function fitView() {
    const cw = viewW();
    const ch = viewH();
    if (cw < 40 || ch < 40) return false;
    const scale = Math.min((cw - 28) / state.width, (ch - 28) / state.height);
    state.view.scale = Math.max(0.05, Math.min(4, scale));
    state.view.offset_x = 0;
    state.view.offset_y = 0;
    pendingFit = false;
    return true;
  }

  function setZoom(scale) {
    state.view.scale = Math.max(0.08, Math.min(4, scale));
    state.view.offset_x = 0;
    state.view.offset_y = 0;
    pendingFit = false;
    writeWidget(true);
    draw();
  }

  function zoomAt(factor, cx, cy) {
    const [ix, iy] = canvasToImg(cx, cy);
    state.view.scale = Math.max(0.08, Math.min(4, state.view.scale * factor));
    state.view.offset_x = cx - viewW() / 2 - ix * state.view.scale;
    state.view.offset_y = cy - viewH() / 2 - iy * state.view.scale;
    pendingFit = false;
    draw();
  }

  function setSize(width, height, push) {
    width = clampSide(width, state.width);
    height = clampSide(height, state.height);
    if (width === state.width && height === state.height) {
      if (push) pushHistory();
      syncForm();
      draw();
      return;
    }
    const sx = width / state.width;
    const sy = height / state.height;
    state.width = width;
    state.height = height;
    for (const item of state.items) {
      item.x_min *= sx; item.x_max *= sx;
      item.y_min *= sy; item.y_max *= sy;
      clampItem(item, state.width, state.height);
    }
    pendingFit = true;
    if (push) pushHistory();
    writeWidget(true);
    syncForm();
    resizeCanvas();
    setStatus(`Canvas ${width}×${height}`);
  }

  function nextColor() {
    const taken = new Set(state.items.map((item) => item.color));
    let pool = PALETTE.filter((color) => !taken.has(color));
    if (!pool.length) pool = PALETTE.slice();
    return pool[Math.floor(Math.random() * pool.length)];
  }

  function gridStep() {
    const w = state.width;
    if (state.grid === "fine") return w <= 1200 ? 25 : 50;
    if (state.grid === "coarse") return w <= 1200 ? 100 : 200;
    if (state.grid === "dots") return w <= 1200 ? 50 : 80;
    return w <= 1200 ? 50 : 100;
  }

  function snapScalar(value, axis) {
    if (!state.snap || state.bg) return value;
    const half = axis === "x" ? state.width / 2 : state.height / 2;
    const nearest = (pts) => pts.reduce((best, pt) => (Math.abs(pt - value) < Math.abs(best - value) ? pt : best));
    if (state.grid === "thirds") return nearest([-half, -half / 3, 0, half / 3, half]);
    if (state.grid === "golden") {
      const phi = 0.6180339887;
      return nearest([-half, -half + 2 * half * (1 - phi), 0, -half + 2 * half * phi, half]);
    }
    if (state.grid === "cross") return nearest([-half, 0, half]);
    const step = gridStep();
    if (step <= 0) return value;
    return pyRound(value / step) * step;
  }

  function snapEdges(item, edges) {
    if (!state.snap || state.bg) return;
    if (edges.includes("n")) item.y_min = snapScalar(item.y_min, "y");
    if (edges.includes("s")) item.y_max = snapScalar(item.y_max, "y");
    if (edges.includes("w")) item.x_min = snapScalar(item.x_min, "x");
    if (edges.includes("e")) item.x_max = snapScalar(item.x_max, "x");
    if (item.y_max - item.y_min < MIN_BOX) item.y_max = item.y_min + MIN_BOX;
    if (item.x_max - item.x_min < MIN_BOX) item.x_max = item.x_min + MIN_BOX;
  }

  function snapMove(item) {
    if (!state.snap || state.bg) return;
    const w = item.x_max - item.x_min;
    const h = item.y_max - item.y_min;
    item.x_min = snapScalar(item.x_min, "x");
    item.y_min = snapScalar(item.y_min, "y");
    item.x_max = item.x_min + w;
    item.y_max = item.y_min + h;
  }

  function selectIndex(index) {
    state.selected = index == null || index < 0 ? null : index;
    syncForm();
    draw();
  }

  function addItem(label) {
    const w = 220;
    const h = 160;
    const n = state.items.length;
    const item = {
      label, caption: "", text: "", color: nextColor(),
      locked: false, aspect_locked: false,
      y_min: -h / 2 + (n % 4) * 28,
      x_min: -w / 2 + (n % 5) * 28,
      y_max: h / 2 + (n % 4) * 28,
      x_max: w / 2 + (n % 5) * 28,
    };
    clampItem(item, state.width, state.height);
    state.items.push(item);
    state.selected = state.items.length - 1;
    pushHistory();
    writeWidget(true);
    syncForm();
    draw();
    setStatus(`Added ${label}`);
  }

  function deleteSelected() {
    if (state.selected == null) return;
    finishInline(true);
    state.items.splice(state.selected, 1);
    state.selected = null;
    pushHistory();
    writeWidget(true);
    syncForm();
    draw();
  }

  function duplicate() {
    const item = current();
    if (!item) return;
    const copy = {
      ...item,
      color: nextColor(),
      y_min: item.y_min + 24,
      x_min: item.x_min + 24,
      y_max: item.y_max + 24,
      x_max: item.x_max + 24,
    };
    clampItem(copy, state.width, state.height);
    state.items.push(copy);
    state.selected = state.items.length - 1;
    pushHistory();
    writeWidget(true);
    syncForm();
    draw();
  }

  function bringFront() {
    const item = current();
    if (!item) return;
    state.items.splice(state.selected, 1);
    state.items.push(item);
    state.selected = state.items.length - 1;
    pushHistory();
    writeWidget(true);
    syncForm();
    draw();
  }

  function cycle(direction) {
    const n = state.items.length;
    if (!n) return;
    if (state.selected == null) state.selected = direction > 0 ? 0 : n - 1;
    else state.selected = (state.selected + direction + n) % n;
    syncForm();
    draw();
    writeWidget(true);
  }

  function hitTest(cx, cy) {
    const sel = state.selected;
    if (sel != null && state.items[sel]) {
      const item = state.items[sel];
      const [x0, y0] = imgToCanvas(item.x_min, item.y_min);
      const [x1, y1] = imgToCanvas(item.x_max, item.y_max);
      const mx = (x0 + x1) / 2;
      const my = (y0 + y1) / 2;
      const hs = 12;
      const handles = {
        nw: [x0, y0], n: [mx, y0], ne: [x1, y0],
        w: [x0, my], e: [x1, my],
        sw: [x0, y1], s: [mx, y1], se: [x1, y1],
      };
      for (const name of Object.keys(handles)) {
        const [hx, hy] = handles[name];
        if (Math.abs(cx - hx) <= hs && Math.abs(cy - hy) <= hs) {
          return { item, index: sel, handle: name };
        }
      }
    }
    for (let i = state.items.length - 1; i >= 0; i--) {
      const item = state.items[i];
      const [x0, y0] = imgToCanvas(item.x_min, item.y_min);
      const [x1, y1] = imgToCanvas(item.x_max, item.y_max);
      const left = Math.min(x0, x1);
      const right = Math.max(x0, x1);
      const top = Math.min(y0, y1);
      const bottom = Math.max(y0, y1);
      if (cx >= left && cx <= right && cy >= top && cy <= bottom) {
        return { item, index: i, handle: null };
      }
    }
    return { item: null, index: -1, handle: null };
  }

  function resizeBy(item, handle, dx, dy, aspect) {
    if (handle.includes("n")) item.y_min += dy;
    if (handle.includes("s")) item.y_max += dy;
    if (handle.includes("w")) item.x_min += dx;
    if (handle.includes("e")) item.x_max += dx;
    if (item.y_max - item.y_min < MIN_BOX) {
      if (handle.includes("n")) item.y_min = item.y_max - MIN_BOX;
      else item.y_max = item.y_min + MIN_BOX;
    }
    if (item.x_max - item.x_min < MIN_BOX) {
      if (handle.includes("w")) item.x_min = item.x_max - MIN_BOX;
      else item.x_max = item.x_min + MIN_BOX;
    }
    if (aspect) {
      const bw = item.x_max - item.x_min;
      const bh = item.y_max - item.y_min;
      if (Math.abs(dx) >= Math.abs(dy)) {
        const newH = Math.max(MIN_BOX, bw / aspect);
        if (handle.includes("n") && !handle.includes("s")) item.y_min = item.y_max - newH;
        else item.y_max = item.y_min + newH;
      } else {
        const newW = Math.max(MIN_BOX, bh * aspect);
        if (handle.includes("w") && !handle.includes("e")) item.x_min = item.x_max - newW;
        else item.x_max = item.x_min + newW;
      }
    }
    clampItem(item, state.width, state.height);
  }

  function centeredCoords(half, step) {
    if (step <= 0) return [0];
    const vals = [0];
    for (let k = step; k <= half + 1e-6; k += step) {
      vals.push(k, -k);
    }
    vals.sort((a, b) => a - b);
    return vals;
  }

  function draw() {
    const cw = viewW();
    const ch = viewH();
    if (!cw || !ch) return;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, cw, ch);
    const hw = state.width / 2;
    const hh = state.height / 2;
    const [fx, fy] = imgToCanvas(-hw, -hh);
    const [fx2, fy2] = imgToCanvas(hw, hh);
    const fw = fx2 - fx;
    const fh = fy2 - fy;
    ctx.fillStyle = "#0c0c12";
    ctx.fillRect(fx, fy, fw, fh);
    if (bgImage) {
      ctx.drawImage(bgImage, fx, fy, fw, fh);
    } else {
      drawGrid(hw, hh);
    }
    ctx.strokeStyle = "#6a6a88";
    ctx.lineWidth = 2;
    ctx.strokeRect(fx + 1, fy + 1, fw - 2, fh - 2);
    ctx.fillStyle = "#9a9ab0";
    ctx.font = "13px Segoe UI, sans-serif";
    ctx.textBaseline = "bottom";
    ctx.textAlign = "left";
    const sizeNote = `${state.width} × ${state.height}  ·  ${ratioText(state.width, state.height)}`
      + `  ·  ${megapixelsOf(state.width, state.height).toFixed(2)} MP`;
    ctx.fillText(sizeNote, fx + 8, fy2 - 8);
    state.items.forEach((item, index) => drawItem(item, index === state.selected));
    if (state.selected != null && state.items[state.selected] && (!drag || drag.mode !== "create")) {
      drawHandles(state.items[state.selected]);
    }
    if (drag && drag.mode === "create") {
      ctx.strokeStyle = drag.color;
      ctx.lineWidth = 2;
      ctx.strokeRect(drag.x0, drag.y0, drag.cx - drag.x0, drag.cy - drag.y0);
    }
  }

  function drawGrid(hw, hh) {
    const style = state.grid || "default";
    if (style === "none") return;
    ctx.save();
    ctx.lineWidth = 1;
    const [cx, cy] = imgToCanvas(0, 0);
    if (style !== "none") {
      ctx.strokeStyle = "#2e2e42";
      ctx.beginPath();
      ctx.moveTo(cx - 14, cy); ctx.lineTo(cx + 14, cy);
      ctx.moveTo(cx, cy - 14); ctx.lineTo(cx, cy + 14);
      ctx.stroke();
    }
    if (style === "cross") { ctx.restore(); return; }
    const seg = (x0, y0, x1, y1) => {
      const a = imgToCanvas(x0, y0);
      const b = imgToCanvas(x1, y1);
      ctx.beginPath();
      ctx.moveTo(a[0], a[1]);
      ctx.lineTo(b[0], b[1]);
      ctx.stroke();
    };
    if (style === "dots") {
      const step = state.width <= 1200 ? 50 : 80;
      ctx.fillStyle = "#1e1e2c";
      for (const gx of centeredCoords(hw, step)) {
        for (const gy of centeredCoords(hh, step)) {
          const [px, py] = imgToCanvas(gx, gy);
          ctx.fillRect(px - 1, py - 1, 2, 2);
        }
      }
      ctx.restore();
      return;
    }
    ctx.strokeStyle = style === "thirds" || style === "golden" ? "#2a2a3c" : "#1e1e2c";
    ctx.setLineDash(style === "thirds" ? [6, 4] : style === "golden" ? [8, 5] : []);
    if (style === "thirds" || style === "golden") {
      const stops = style === "thirds" ? [1 / 3, 2 / 3] : [1 - 0.6180339887, 0.6180339887];
      for (const t of stops) {
        const gx = -hw + 2 * hw * t;
        const gy = -hh + 2 * hh * t;
        seg(gx, -hh, gx, hh);
        seg(-hw, gy, hw, gy);
      }
      ctx.restore();
      return;
    }
    let step = state.width <= 1200 ? 50 : 100;
    if (style === "fine") step = state.width <= 1200 ? 25 : 50;
    if (style === "coarse") step = state.width <= 1200 ? 100 : 200;
    for (const gx of centeredCoords(hw, step)) seg(gx, -hh, gx, hh);
    for (const gy of centeredCoords(hh, step)) seg(-hw, gy, hw, gy);
    ctx.restore();
  }

  function drawItem(item, selected) {
    const [x0, y0] = imgToCanvas(item.x_min, item.y_min);
    const [x1, y1] = imgToCanvas(item.x_max, item.y_max);
    const left = Math.min(x0, x1);
    const top = Math.min(y0, y1);
    const w = Math.abs(x1 - x0);
    const h = Math.abs(y1 - y0);
    ctx.save();
    if (selected) {
      ctx.fillStyle = hexAlpha(item.color, 0.16);
      ctx.fillRect(left, top, w, h);
    }
    ctx.strokeStyle = item.color || "#7c9cff";
    ctx.lineWidth = selected ? 3 : 2;
    ctx.setLineDash(item.locked ? [4, 3] : []);
    ctx.strokeRect(left, top, w, h);
    ctx.setLineDash([]);
    const body = item.caption || (item.label === "text" ? item.text : "");
    const display = body ? `${item.label} · ${body}` : (item.label || "object");
    ctx.font = "12px Segoe UI, sans-serif";
    ctx.textBaseline = "top";
    ctx.textAlign = "left";
    ctx.fillStyle = item.color || "#7c9cff";
    const maxW = Math.max(8, w - 12);
    let shown = display;
    while (shown.length > 1 && ctx.measureText(shown).width > maxW) {
      shown = shown.slice(0, -2) + "…";
    }
    if (shown) ctx.fillText(shown, left + 6, top + 6);
    ctx.restore();
  }

  function drawHandles(item) {
    const [x0, y0] = imgToCanvas(item.x_min, item.y_min);
    const [x1, y1] = imgToCanvas(item.x_max, item.y_max);
    const mx = (x0 + x1) / 2;
    const my = (y0 + y1) / 2;
    const pts = [[x0, y0], [mx, y0], [x1, y0], [x0, my], [x1, my], [x0, y1], [mx, y1], [x1, y1]];
    ctx.save();
    ctx.fillStyle = "#7c9cff";
    ctx.strokeStyle = "#0f0f17";
    ctx.lineWidth = 1;
    for (const [hx, hy] of pts) {
      ctx.fillRect(hx - 3.5, hy - 3.5, 7, 7);
      ctx.strokeRect(hx - 3.5, hy - 3.5, 7, 7);
    }
    ctx.restore();
  }

  function hexAlpha(color, alpha) {
    const c = validColor(color, 0);
    const r = parseInt(c.slice(1, 3), 16);
    const g = parseInt(c.slice(3, 5), 16);
    const b = parseInt(c.slice(5, 7), 16);
    return `rgba(${r},${g},${b},${alpha})`;
  }

  function resizeCanvas() {
    const cssW = canvas.clientWidth;
    const cssH = canvas.clientHeight;
    if (!cssW || !cssH) return;
    ratio = Math.min(3, Math.max(1, window.devicePixelRatio || 1));
    const w = Math.round(cssW * ratio);
    const h = Math.round(cssH * ratio);
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    if (pendingFit) fitView();
    draw();
  }

  function finishInline(cancel) {
    if (!inlineOpen) return;
    inlineOpen = false;
    inline.style.display = "none";
    if (!cancel && current()) {
      current().caption = inline.value;
      pushHistory();
      writeWidget(true);
      syncForm();
    }
    draw();
  }

  function startInline(item) {
    finishInline(true);
    const [x, y] = imgToCanvas(item.x_min, item.y_min);
    const [x2] = imgToCanvas(item.x_max, item.y_max);
    inlineOpen = true;
    inline.style.display = "block";
    inline.style.left = `${Math.min(x, x2) + 4}px`;
    inline.style.top = `${y + 4}px`;
    inline.style.width = `${Math.max(80, Math.abs(x2 - x) - 8)}px`;
    inline.style.color = item.color;
    inline.style.borderColor = item.color;
    inline.value = item.caption || "";
    inline.focus();
    inline.select();
  }

  function loadBg() {
    const token = ++bgToken;
    bgImage = null;
    const bg = state.bg;
    if (!bg || !bg.filename) { draw(); return; }
    const params = new URLSearchParams({
      filename: bg.filename,
      type: bg.type || "input",
      subfolder: bg.subfolder || "",
    });
    const img = new Image();
    img.onload = () => {
      if (token !== bgToken) return;
      bgImage = img;
      draw();
    };
    img.onerror = () => {
      if (token !== bgToken) return;
      bgImage = null;
      setStatus("Reference image was not found in input");
      draw();
    };
    img.src = api.apiURL(`/view?${params.toString()}`);
  }

  function closeMenu() {
    if (menuEl) { menuEl.remove(); menuEl = null; }
  }

  function openMenu(clientX, clientY, rows) {
    closeMenu();
    const menu = el("div", "bbs-menu");
    for (const row of rows) {
      if (row.sep) { menu.append(el("div", "bbs-sep")); continue; }
      const item = document.createElement("button");
      item.type = "button";
      item.textContent = row.label;
      item.addEventListener("click", (event) => {
        event.stopPropagation();
        closeMenu();
        row.run();
      });
      menu.append(item);
    }
    document.body.append(menu);
    menu.style.left = `${Math.max(8, Math.min(clientX, window.innerWidth - menu.offsetWidth - 8))}px`;
    menu.style.top = `${Math.max(8, Math.min(clientY, window.innerHeight - menu.offsetHeight - 8))}px`;
    menuEl = menu;
    setTimeout(() => {
      const onDoc = (event) => {
        if (!menu.contains(event.target)) closeMenu();
        document.removeEventListener("pointerdown", onDoc, true);
      };
      document.addEventListener("pointerdown", onDoc, true);
    }, 0);
  }

  function download(name, text) {
    const link = document.createElement("a");
    const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
    link.href = url;
    link.download = name;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  }

  function projectDoc() {
    const moss = toMoss(state);
    moss.width = state.width;
    moss.height = state.height;
    moss.items = state.items.map((item, index) => ({
      ...moss.items[index],
      color: item.color,
      locked: !!item.locked,
      aspect_locked: !!item.aspect_locked,
    }));
    const desktop = (snap) => ({
      width: snap.width,
      height: snap.height,
      meta: snap.meta,
      canvas_type: snap.canvas_type,
      caption: snap.caption,
      selected: snap.selected,
      items: (snap.items || []).map((item) => ({
        label: item.label,
        caption: item.caption,
        text: item.text,
        color: item.color,
        locked: !!item.locked,
        aspect_locked: !!item.aspect_locked,
        bbox: [item.y_min, item.x_min, item.y_max, item.x_max],
      })),
    });
    return {
      format: "bbox-studio-project",
      version: 2,
      view: {
        scale: state.view.scale,
        offset_x: state.view.offset_x,
        offset_y: state.view.offset_y,
      },
      bg: state.bg,
      layout: moss,
      history: { index: histIndex, states: history.map(desktop) },
    };
  }

  async function copyJson() {
    const text = JSON.stringify(toMoss(state), null, 2);
    try {
      await navigator.clipboard.writeText(text);
      setStatus("Copied MOSS JSON");
    } catch {
      setStatus("Clipboard blocked. Use Export JSON, or wire the json output.");
    }
  }

  function saveProject() {
    download("layout.bbox", JSON.stringify(projectDoc(), null, 2));
    setStatus("Saved .bbox project");
  }

  function exportJson() {
    download("layout.json", JSON.stringify(toMoss(state), null, 2));
    setStatus("Exported MOSS JSON");
  }

  function replaceState(next, honorView) {
    state = next;
    pendingFit = !honorView;
    resetHistory();
    writeWidget(true);
    syncForm();
    loadBg();
    resizeCanvas();
  }

  async function importFile(file) {
    let data;
    try { data = JSON.parse(await file.text()); }
    catch { setStatus("That file is not JSON"); return; }
    if (!data || typeof data !== "object") { setStatus("That file is not a layout"); return; }
    const honor = !!(data.view && typeof data.view.scale === "number");
    replaceState(adopt(data), honor);
    setStatus("Imported layout");
  }

  function blobImage(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("unreadable image")); };
      img.src = url;
    });
  }

  async function useReference(file) {
    let img;
    try { img = await blobImage(file); }
    catch { setStatus("Could not read that image"); return; }
    if (Math.max(img.naturalWidth, img.naturalHeight) > 4096) {
      setStatus("Use a reference at 4096px or smaller");
      return;
    }
    const body = new FormData();
    body.append("image", file);
    body.append("overwrite", "true");
    body.append("type", "input");
    body.append("subfolder", "bbox_studio");
    let payload;
    try {
      const res = await api.fetchApi("/upload/image", { method: "POST", body });
      if (!res.ok) throw new Error(String(res.status));
      payload = await res.json();
    } catch {
      setStatus("Upload failed");
      return;
    }
    state.bg = {
      filename: payload.name,
      subfolder: payload.subfolder || "",
      type: payload.type || "input",
    };
    setSize(img.naturalWidth, img.naturalHeight, false);
    pushHistory();
    writeWidget(true);
    loadBg();
    setStatus(`Reference ${img.naturalWidth}×${img.naturalHeight}`);
  }

  function removeReference() {
    if (!state.bg) { setStatus("No reference loaded"); return; }
    state.bg = null;
    pushHistory();
    writeWidget(true);
    loadBg();
    setStatus("Reference removed");
  }

  function resetAll() {
    if ((state.items.length || state.bg) && !confirm("Clear all boxes and restore the default canvas?")) return;
    state = defaultState();
    pendingFit = true;
    pushHistory();
    writeWidget(true);
    syncForm();
    loadBg();
    resizeCanvas();
  }

  function onKey(event) {
    if (event.key === " " || event.code === "Space") {
      event.preventDefault();
      spaceDown = true;
      return;
    }
    const cmd = event.ctrlKey || event.metaKey;
    const key = event.key.toLowerCase();
    if (cmd && key === "z") { event.preventDefault(); event.stopPropagation(); event.shiftKey ? redo() : undo(); return; }
    if (cmd && key === "y") { event.preventDefault(); event.stopPropagation(); redo(); return; }
    if (cmd && key === "c") { event.preventDefault(); event.stopPropagation(); copyJson(); return; }
    if (cmd && key === "s") { event.preventDefault(); event.stopPropagation(); saveProject(); return; }
    // Delete and Backspace are handled by onDeleteKey, ahead of ComfyUI.
    if (event.key === "Escape") {
      event.preventDefault();
      finishInline(true);
      selectIndex(null);
      return;
    }
    if (event.key === "ArrowRight") { event.preventDefault(); cycle(1); return; }
    if (event.key === "ArrowLeft") { event.preventDefault(); cycle(-1); return; }
    if (event.key === "+" || event.key === "=") {
      event.preventDefault();
      zoomAt(1.1, viewW() / 2, viewH() / 2);
      writeWidget(true);
      return;
    }
    if (event.key === "-" || event.key === "_") {
      event.preventDefault();
      zoomAt(1 / 1.1, viewW() / 2, viewH() / 2);
      writeWidget(true);
      return;
    }
    // Every other key is left alone, so F5, Ctrl+R and the rest still work.
  }

  root.addEventListener("pointerdown", (event) => event.stopPropagation());
  root.addEventListener("mousedown", (event) => event.stopPropagation());
  root.addEventListener("wheel", (event) => {
    event.stopPropagation();
    if (event.target === canvas) event.preventDefault();
  }, { passive: false });
  root.addEventListener("contextmenu", (event) => {
    if (event.target === canvas) return;
    event.stopPropagation();
  });

  canvas.addEventListener("pointerdown", (event) => {
    if (event.button === 2) return;
    const [x, y] = localPos(event);
    keytrap.focus({ preventScroll: true });
    if (event.button === 1 || (event.button === 0 && spaceDown)) {
      drag = { mode: "pan", lx: x, ly: y };
      canvas.setPointerCapture(event.pointerId);
      return;
    }
    if (event.button !== 0) return;
    finishInline(false);
    const hit = hitTest(x, y);
    if (hit.handle) {
      selectIndex(hit.index);
      if (hit.item.locked) { setStatus("Box is locked"); drag = null; return; }
      const aspect = hit.item.aspect_locked && (hit.item.y_max - hit.item.y_min) > 0
        ? (hit.item.x_max - hit.item.x_min) / (hit.item.y_max - hit.item.y_min) : 0;
      drag = { mode: "resize", handle: hit.handle, lx: x, ly: y, aspect };
      canvas.setPointerCapture(event.pointerId);
      return;
    }
    if (hit.item) {
      selectIndex(hit.index);
      if (hit.item.locked) { setStatus("Box is locked"); drag = null; return; }
      drag = { mode: "move", lx: x, ly: y };
      canvas.setPointerCapture(event.pointerId);
      return;
    }
    selectIndex(null);
    const [ix, iy] = canvasToImg(x, y);
    drag = { mode: "create", x0: x, y0: y, cx: x, cy: y, ix, iy, color: nextColor() };
    canvas.style.cursor = "none";
    canvas.setPointerCapture(event.pointerId);
    draw();
  });

  canvas.addEventListener("pointermove", (event) => {
    const [x, y] = localPos(event);
    if (!drag) {
      const hit = hitTest(x, y);
      if (spaceDown) canvas.style.cursor = "grab";
      else if (hit.handle) canvas.style.cursor = CURSORS[hit.handle] || "crosshair";
      else if (hit.item) canvas.style.cursor = hit.item.locked ? "not-allowed" : "move";
      else canvas.style.cursor = "crosshair";
      const [ix, iy] = canvasToImg(x, y);
      setStatus(`x ${Math.round(ix)}    y ${Math.round(iy)}`);
      return;
    }
    if (drag.mode === "pan") {
      state.view.offset_x += x - drag.lx;
      state.view.offset_y += y - drag.ly;
      drag.lx = x;
      drag.ly = y;
      pendingFit = false;
      draw();
      return;
    }
    if (drag.mode === "create") {
      drag.cx = x;
      drag.cy = y;
      draw();
      return;
    }
    const item = current();
    if (!item || item.locked) return;
    const scale = state.view.scale || 1;
    const dx = (x - drag.lx) / scale;
    const dy = (y - drag.ly) / scale;
    drag.lx = x;
    drag.ly = y;
    if (drag.mode === "move") {
      item.x_min += dx; item.x_max += dx;
      item.y_min += dy; item.y_max += dy;
      clampItem(item, state.width, state.height);
    } else if (drag.mode === "resize") {
      resizeBy(item, drag.handle, dx, dy, drag.aspect);
    }
    draw();
    jsonPre.textContent = JSON.stringify(toMoss(state), null, 2);
  });

  canvas.addEventListener("pointerup", (event) => {
    if (!drag) return;
    const [x, y] = localPos(event);
    const mode = drag.mode;
    if (mode === "pan") {
      drag = null;
      writeWidget(true);
      canvas.style.cursor = "crosshair";
      return;
    }
    if (mode === "create") {
      const [ix1, iy1] = canvasToImg(x, y);
      let xMin = Math.min(drag.ix, ix1);
      let xMax = Math.max(drag.ix, ix1);
      let yMin = Math.min(drag.iy, iy1);
      let yMax = Math.max(drag.iy, iy1);
      const color = drag.color;
      drag = null;
      canvas.style.cursor = "crosshair";
      if (xMax - xMin < MIN_BOX || yMax - yMin < MIN_BOX) { draw(); return; }
      const item = {
        label: "object", caption: "", text: "", color,
        locked: false, aspect_locked: false,
        y_min: yMin, x_min: xMin, y_max: yMax, x_max: xMax,
      };
      snapEdges(item, "nsew");
      clampItem(item, state.width, state.height);
      state.items.push(item);
      state.selected = state.items.length - 1;
      pushHistory();
      writeWidget(true);
      syncForm();
      draw();
      return;
    }
    const item = current();
    if (item && !item.locked) {
      if (mode === "move") snapMove(item);
      else if (mode === "resize") snapEdges(item, drag.handle || "nsew");
      clampItem(item, state.width, state.height);
    }
    drag = null;
    canvas.style.cursor = "crosshair";
    pushHistory();
    writeWidget(true);
    syncForm();
    draw();
  });

  canvas.addEventListener("pointercancel", () => { drag = null; draw(); });
  canvas.addEventListener("dblclick", (event) => {
    const [x, y] = localPos(event);
    const hit = hitTest(x, y);
    if (!hit.item) return;
    selectIndex(hit.index);
    startInline(hit.item);
  });
  canvas.addEventListener("contextmenu", (event) => {
    event.preventDefault();
    event.stopPropagation();
    openMenu(event.clientX, event.clientY, [
      ...GRIDS.map(([id, label]) => ({
        label: `${state.grid === id ? "✓ " : ""}${label}`,
        run() {
          state.grid = id;
          pushHistory();
          writeWidget(true);
          syncForm();
          draw();
        },
      })),
      { sep: true },
      {
        label: `${state.snap ? "✓ " : ""}Snap to grid`,
        run() {
          state.snap = !state.snap;
          pushHistory();
          writeWidget(true);
          syncForm();
        },
      },
    ]);
  });
  canvas.addEventListener("wheel", (event) => {
    event.preventDefault();
    event.stopPropagation();
    const [x, y] = localPos(event);
    const factor = event.deltaY < 0 ? 1.1 : 0.9;
    zoomAt(factor, x, y);
    writeWidget(true);
  }, { passive: false });

  inline.addEventListener("keydown", (event) => {
    event.stopPropagation();
    if (event.key === "Enter") { event.preventDefault(); finishInline(false); keytrap.focus(); }
    if (event.key === "Escape") { event.preventDefault(); finishInline(true); keytrap.focus(); }
  });
  inline.addEventListener("pointerdown", (event) => event.stopPropagation());
  inline.addEventListener("blur", () => finishInline(false));
  keytrap.addEventListener("keydown", onKey);
  keytrap.addEventListener("keyup", (event) => {
    if (event.code === "Space") spaceDown = false;
  });
  keytrap.addEventListener("blur", () => { spaceDown = false; });

  // ComfyUI binds Delete and Backspace to "delete selected nodes" for any
  // target inside the graph that is not a text field, and this node is selected
  // whenever the editor is clicked. So a press with focus on an editor button,
  // a dropdown or the panel itself removed the whole node. Claim both keys on
  // window in the capture phase, which runs before ComfyUI's handlers.
  function isTextField(el) {
    if (!(el instanceof HTMLElement) || el.readOnly) return false;
    if (el.isContentEditable || el.tagName === "TEXTAREA") return true;
    if (el.tagName !== "INPUT") return false;
    return !["checkbox", "radio", "button", "range", "color", "file", "submit", "reset"].includes(el.type);
  }
  let lastClickInside = false;
  const onAnyPointerDown = (event) => { lastClickInside = root.contains(event.target); };
  const onDeleteKey = (event) => {
    if (event.key !== "Delete" && event.key !== "Backspace") return;
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    const target = event.composedPath?.()[0] ?? event.target;
    if (isTextField(target)) return;
    if (!root.contains(target)) {
      // Focus can fall out of the editor, for example when the focused button
      // is disabled. The key still belongs to the box if the editor was the
      // last thing clicked and a box is selected.
      const graphEl = document.getElementById("graph-canvas-container");
      const loose = target === document.body || !!graphEl?.contains(target);
      if (!lastClickInside || !loose || state.selected == null) return;
    }
    event.preventDefault();
    event.stopImmediatePropagation();
    deleteSelected();
  };
  document.addEventListener("pointerdown", onAnyPointerDown, true);
  window.addEventListener("keydown", onDeleteKey, true);

  root.addEventListener("click", (event) => {
    const act = event.target?.closest?.("button")?.dataset?.act;
    if (!act) return;
    if (act === "fit") { pendingFit = true; resizeCanvas(); writeWidget(true); }
    else if (act === "z50") setZoom(0.5);
    else if (act === "z100") setZoom(1);
    else if (act === "z200") setZoom(2);
    else if (act === "copy") copyJson();
    else if (act === "undo") undo();
    else if (act === "redo") redo();
    else if (act === "reset") resetAll();
    else if (act === "add-object") addItem("object");
    else if (act === "add-character") addItem("character");
    else if (act === "add-text") addItem("text");
    else if (act === "dup") duplicate();
    else if (act === "front") bringFront();
    else if (act === "del") deleteSelected();
    else if (act === "file") {
      const rect = fileBtn.getBoundingClientRect();
      openMenu(rect.left, rect.bottom + 4, [
        { label: "Load reference…", run() { fileInput.accept = "image/*"; fileInput.dataset.mode = "image"; fileInput.click(); } },
        { label: "Remove reference", run: removeReference },
        { sep: true },
        { label: "Import JSON or project…", run() { fileInput.accept = ".json,.bbox,.txt,application/json"; fileInput.dataset.mode = "import"; fileInput.click(); } },
        { label: "Export MOSS JSON", run: exportJson },
        { label: "Save .bbox project", run: saveProject },
      ]);
    }
  });

  function applyPreset() {
    if (filling) return;
    const opt = sizeSel.selectedOptions[0];
    const w = parseInt(opt?.dataset.w || "", 10);
    const h = parseInt(opt?.dataset.h || "", 10);
    if (w >= 64 && h >= 64) setSize(w, h, true);
  }
  sizeSel.addEventListener("change", applyPreset);
  function commitTypedSize() {
    if (filling) return;
    const w = parseInt(wIn.value, 10);
    const h = parseInt(hIn.value, 10);
    if (w >= 64 && h >= 64) {
      setSize(w, h, true);
    } else {
      syncForm();
      setStatus("Width and height must be 64 or more");
    }
  }
  for (const field of [wIn, hIn]) {
    field.addEventListener("change", commitTypedSize);
    field.addEventListener("keydown", (event) => {
      event.stopPropagation();
      if (event.key === "Enter") {
        event.preventDefault();
        commitTypedSize();
        keytrap.focus({ preventScroll: true });
      }
    });
  }
  // Aspect ratio and megapixels. Neither is stored: both are read back from
  // the canvas size, so presets and typed sizes show their ratio too.
  function applyAspect() {
    if (filling) return;
    const picked = ASPECTS.find(([id]) => id === aspectSel.value);
    if (!picked) {
      aspectChoice = "";
      syncForm();
      return;
    }
    const mp = parseFloat(mpIn.value);
    const megapixels = mp >= MP_MIN && mp <= MP_MAX ? mp : megapixelsOf(state.width, state.height);
    aspectChoice = picked[0];
    const [w, h] = sizeForAspect(picked[2], picked[3], megapixels);
    setSize(w, h, true);
  }
  function commitMegapixels() {
    if (filling) return;
    const mp = parseFloat(mpIn.value);
    if (!(mp >= MP_MIN && mp <= MP_MAX)) {
      syncForm();
      setStatus(`Megapixels must be between ${MP_MIN} and ${MP_MAX}`);
      return;
    }
    // Unchanged field: leave the canvas alone instead of re-rounding it.
    if (mp.toFixed(2) === megapixelsOf(state.width, state.height).toFixed(2)) return;
    const picked = ASPECTS.find(([id]) => id === aspectSel.value);
    const [w, h] = picked
      ? sizeForAspect(picked[2], picked[3], mp)
      : sizeForAspect(state.width, state.height, mp);
    setSize(w, h, true);
  }
  aspectSel.addEventListener("change", applyAspect);
  mpIn.addEventListener("change", commitMegapixels);
  mpIn.addEventListener("keydown", (event) => {
    event.stopPropagation();
    if (event.key === "Enter") {
      event.preventDefault();
      commitMegapixels();
      keytrap.focus({ preventScroll: true });
    }
  });

  snapIn.addEventListener("change", () => {
    if (filling) return;
    state.snap = snapIn.checked;
    pushHistory();
    writeWidget(true);
  });
  gridSel.addEventListener("change", () => {
    if (filling) return;
    state.grid = gridSel.value;
    pushHistory();
    writeWidget(true);
    draw();
  });
  labelSel.addEventListener("change", () => {
    if (filling || !current()) return;
    current().label = labelSel.value;
    pushHistory();
    writeWidget(true);
    syncForm();
    draw();
  });
  colorIn.addEventListener("input", () => {
    if (filling || !current()) return;
    current().color = colorIn.value;
    writeWidget(true);
    draw();
  });
  colorIn.addEventListener("change", () => { if (!filling) pushHistory(); });
  capIn.addEventListener("input", () => {
    if (filling || !current()) return;
    current().caption = capIn.value;
    writeWidget(true);
    jsonPre.textContent = JSON.stringify(toMoss(state), null, 2);
    draw();
  });
  capIn.addEventListener("change", () => { if (!filling) pushHistory(); });
  textIn.addEventListener("input", () => {
    if (filling || !current()) return;
    current().text = textIn.value;
    writeWidget(true);
    jsonPre.textContent = JSON.stringify(toMoss(state), null, 2);
    draw();
  });
  textIn.addEventListener("change", () => { if (!filling) pushHistory(); });
  lockIn.addEventListener("change", () => {
    if (filling || !current()) return;
    current().locked = lockIn.checked;
    pushHistory();
    writeWidget(true);
    draw();
  });
  aspectIn.addEventListener("change", () => {
    if (filling || !current()) return;
    current().aspect_locked = aspectIn.checked;
    pushHistory();
    writeWidget(true);
  });
  metaSel.addEventListener("change", () => {
    if (filling || metaSel.value === "custom") return;
    const found = META.find(([name]) => name === metaSel.value);
    if (!found) return;
    state.meta = found[1].slice();
    pushHistory();
    writeWidget(true);
    syncForm();
  });
  metaCustom.addEventListener("input", () => {
    if (filling) return;
    const parts = metaCustom.value.split(",").map((part) => part.trim()).filter(Boolean);
    state.meta = parts.length ? parts : ["scene"];
    metaSel.value = presetLabel(state.meta);
    writeWidget(true);
    jsonPre.textContent = JSON.stringify(toMoss(state), null, 2);
  });
  metaCustom.addEventListener("change", () => { if (!filling) pushHistory(); });
  canvasSel.addEventListener("change", () => {
    if (filling) return;
    state.canvas_type = canvasSel.value;
    pushHistory();
    writeWidget(true);
    jsonPre.textContent = JSON.stringify(toMoss(state), null, 2);
  });
  summary.addEventListener("input", () => {
    if (filling) return;
    state.caption = summary.value;
    writeWidget(true);
    jsonPre.textContent = JSON.stringify(toMoss(state), null, 2);
  });
  summary.addEventListener("change", () => { if (!filling) pushHistory(); });
  matchIn.addEventListener("change", () => {
    if (filling) return;
    state.match_input = matchIn.checked;
    pushHistory();
    writeWidget(true);
    setStatus(state.match_input ? "Run size follows the connected image" : "Run size is the canvas");
  });
  fileInput.addEventListener("change", () => {
    const file = fileInput.files && fileInput.files[0];
    const mode = fileInput.dataset.mode;
    fileInput.value = "";
    if (!file) return;
    if (mode === "image") useReference(file);
    else importFile(file);
  });

  function loadFromWidget() {
    let data = {};
    try { data = JSON.parse(stateWidget.value || "{}"); }
    catch { data = {}; }
    const honor = !!(data && data.view && typeof data.view.scale === "number");
    state = adopt(data);
    pendingFit = !honor;
    resetHistory();
    syncForm();
    loadBg();
    resizeCanvas();
  }

  const domWidget = node.addDOMWidget("bbox_ui", "bbox-studio", root, {
    serialize: false,
    hideOnZoom: false,
    getMinHeight: () => 560,
  });
  repairWidgetWidth(domWidget);
  const widgets = node.widgets;
  const at = widgets.indexOf(domWidget);
  if (at > 0) {
    widgets.splice(at, 1);
    widgets.unshift(domWidget);
  }
  node.setSize?.([
    Math.max(Number(node.size?.[0]) || 0, 980),
    Math.max(Number(node.size?.[1]) || 0, 700),
  ]);

  const observer = new ResizeObserver(() => resizeCanvas());
  observer.observe(stage);
  const onResize = node.onResize;
  node.onResize = function () {
    onResize?.apply(this, arguments);
    requestAnimationFrame(resizeCanvas);
  };
  const onConfigure = node.onConfigure;
  node.onConfigure = function () {
    onConfigure?.apply(this, arguments);
    loadFromWidget();
  };
  const onRemoved = node.onRemoved;
  node.onRemoved = function () {
    closeMenu();
    observer.disconnect();
    document.removeEventListener("pointerdown", onAnyPointerDown, true);
    window.removeEventListener("keydown", onDeleteKey, true);
    onRemoved?.apply(this, arguments);
  };

  loadFromWidget();
}

app.registerExtension({
  name: "bbox.studio",
  async beforeRegisterNodeDef(nodeType, nodeData) {
    if (nodeData.name !== "BBoxStudio") return;
    const onNodeCreated = nodeType.prototype.onNodeCreated;
    nodeType.prototype.onNodeCreated = function () {
      onNodeCreated?.apply(this, arguments);
      setup(this);
    };
  },
});
