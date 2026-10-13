import {
  evaluateShapePreset,
  flattenShapePath,
  shapePresetPathToSvg,
  type ShapePresetName,
} from "@sheetcraft/core/shape-presets";
import {
  SHAPE_PRESET_GALLERY,
  type ShapeGalleryLabel,
  type ShapeGalleryLocale,
  type ShapePresetGalleryCategory,
} from "../../shared/shape-presets/shape-gallery-data";

export type {
  ShapeGalleryLabel,
  ShapeGalleryLocale,
} from "../../shared/shape-presets/shape-gallery-data";

type ChoiceBase = Readonly<{ id: string; label: ShapeGalleryLabel }>;
export type ShapePresetChoice = ChoiceBase & Readonly<{ kind: "preset"; preset: ShapePresetName }>;
export type ShapeLineTool =
  | "line"
  | "arrow"
  | "doubleArrow"
  | "elbowConnector"
  | "elbowArrowConnector"
  | "elbowDoubleArrowConnector"
  | "curvedConnector"
  | "curvedArrowConnector"
  | "curvedDoubleArrowConnector";
/** Static path and requested ends are separate from future shape-to-shape binding. */
export type ShapeLineChoice = ChoiceBase &
  Readonly<{
    kind: "line";
    tool: ShapeLineTool;
    preset: "line" | "bentConnector3" | "curvedConnector3";
    beginArrow: "none" | "triangle";
    endArrow: "none" | "triangle";
  }>;
export type ShapeTextBoxChoice = ChoiceBase &
  Readonly<{
    kind: "textBox";
    direction: "horizontal" | "vertical";
  }>;
/** These are drawing gestures, never aliases for a fixed preset. */
export type ShapeDrawingToolChoice = ChoiceBase &
  Readonly<{
    kind: "drawingTool";
    tool: "curve" | "freeform" | "scribble";
    available: true;
  }>;
export type ShapeGalleryChoice =
  | ShapePresetChoice
  | ShapeLineChoice
  | ShapeTextBoxChoice
  | ShapeDrawingToolChoice;
export type ShapeGalleryCategory = "lines" | ShapePresetGalleryCategory;
export type ShapeGalleryGroup = Readonly<{
  id: ShapeGalleryCategory;
  label: ShapeGalleryLabel;
  items: readonly ShapeGalleryChoice[];
}>;

function label(en: string, zh: string): ShapeGalleryLabel {
  return { "en-US": en, "zh-CN": zh };
}
export const TEXT_BOX_CHOICES: Readonly<Record<"horizontal" | "vertical", ShapeTextBoxChoice>> =
  Object.freeze({
    horizontal: {
      id: "textBox",
      kind: "textBox",
      direction: "horizontal",
      label: label("Horizontal Text Box", "横排文本框"),
    },
    vertical: {
      id: "verticalTextBox",
      kind: "textBox",
      direction: "vertical",
      label: label("Vertical Text Box", "竖排文本框"),
    },
  });
function line(
  tool: ShapeLineTool,
  en: string,
  zh: string,
  preset: ShapeLineChoice["preset"],
  beginArrow: ShapeLineChoice["beginArrow"] = "none",
  endArrow: ShapeLineChoice["endArrow"] = "none",
): ShapeLineChoice {
  return { id: tool, kind: "line", tool, label: label(en, zh), preset, beginArrow, endArrow };
}
function drawingTool(
  tool: ShapeDrawingToolChoice["tool"],
  en: string,
  zh: string,
): ShapeDrawingToolChoice {
  return {
    id: tool,
    kind: "drawingTool",
    tool,
    label: label(en, zh),
    available: true,
  };
}

/** WPS desktop order: 12 lines + the shared 147 filled shapes + two text boxes. */
export const SHAPE_GALLERY: readonly ShapeGalleryGroup[] = [
  {
    id: "lines",
    label: label("Lines", "线条"),
    items: [
      line("line", "Lines", "直线", "line"),
      line("arrow", "Arrow", "箭头", "line", "none", "triangle"),
      line("doubleArrow", "Double Arrow", "双箭头", "line", "triangle", "triangle"),
      line("elbowConnector", "Elbow Connector", "肘形连接符", "bentConnector3"),
      line(
        "elbowArrowConnector",
        "Elbow Arrow Connector",
        "肘形箭头连接符",
        "bentConnector3",
        "none",
        "triangle",
      ),
      line(
        "elbowDoubleArrowConnector",
        "Elbow Double-Arrow Connector",
        "肘形双箭头连接符",
        "bentConnector3",
        "triangle",
        "triangle",
      ),
      line("curvedConnector", "Curved Connector", "曲线连接符", "curvedConnector3"),
      line(
        "curvedArrowConnector",
        "Curved Arrow Connector",
        "曲线箭头连接符",
        "curvedConnector3",
        "none",
        "triangle",
      ),
      line(
        "curvedDoubleArrowConnector",
        "Curved Double Arrow Connector",
        "曲线双箭头连接符",
        "curvedConnector3",
        "triangle",
        "triangle",
      ),
      drawingTool("curve", "Curve", "曲线"),
      drawingTool("freeform", "Freeform", "任意多边形"),
      drawingTool("scribble", "Scribble", "自由曲线"),
    ],
  },
  ...SHAPE_PRESET_GALLERY.map((group): ShapeGalleryGroup => ({
    id: group.id,
    label: group.label,
    items: [
      ...(group.id === "basic" ? [TEXT_BOX_CHOICES.horizontal, TEXT_BOX_CHOICES.vertical] : []),
      ...group.items.map((item): ShapePresetChoice => ({
        id: item.preset,
        kind: "preset",
        preset: item.preset,
        label: item.label,
      })),
    ],
  })),
];
export const SHAPE_GALLERY_COUNT = SHAPE_GALLERY.reduce(
  (count, group) => count + group.items.length,
  0,
);

export const SHAPE_GALLERY_LABELS: Readonly<
  Record<
    ShapeGalleryLocale,
    Readonly<{
      gallery: string;
      search: string;
      selected: string;
      noSelection: string;
      noMatches: string;
      count: string;
      connectorHint: string;
      drawingToolHint: string;
    }>
  >
> = {
  "en-US": {
    gallery: "Shape gallery",
    search: "Search shapes",
    selected: "Selected",
    noSelection: "No shape selected",
    noMatches: "No matching shapes",
    count: "shapes",
    connectorHint:
      "Connectors use fixed paths. Automatic connections to other shapes are not available yet.",
    drawingToolHint:
      "Choose Curve or Freeform to place points; double-click to finish. Drag Scribble to draw a stroke.",
  },
  "zh-CN": {
    gallery: "形状库",
    search: "搜索形状",
    selected: "已选",
    noSelection: "未选择形状",
    noMatches: "没有匹配的形状",
    count: "个形状",
    connectorHint: "连接符使用固定路径，暂不支持自动连接其他形状。",
    drawingToolHint: "曲线和任意多边形单击添加节点、双击完成；自由曲线按住拖动画出轨迹。",
  },
};

/** Search both languages and stable identifiers, regardless of the display locale. */
export function filterShapeGallery(query: string): readonly ShapeGalleryGroup[] {
  const tokens = query.trim().toLocaleLowerCase().split(/\s+/u).filter(Boolean);
  if (!tokens.length) return SHAPE_GALLERY;
  const normalize = (text: string): string => text.toLocaleLowerCase().replace(/[\s:_-]+/gu, "");
  return SHAPE_GALLERY.flatMap((group) => {
    const groupText = normalize(`${group.label["en-US"]} ${group.label["zh-CN"]} ${group.id}`);
    const groupMatch = tokens.every((token) => groupText.includes(normalize(token)));
    const items = groupMatch
      ? group.items
      : group.items.filter((item) => {
          const text = normalize(`${item.label["en-US"]} ${item.label["zh-CN"]} ${item.id}`);
          return tokens.every((token) => text.includes(normalize(token)));
        });
    return items.length ? [{ ...group, items }] : [];
  });
}

export type ShapeGalleryPreview = Readonly<{
  viewBox: string;
  paths: readonly Readonly<{ d: string; filled: boolean; stroke: boolean }>[];
  arrows: readonly string[];
}>;
const previews = new Map<string, ShapeGalleryPreview>();

function triangle(
  tip: Readonly<{ x: number; y: number }>,
  previous: Readonly<{ x: number; y: number }>,
): readonly Readonly<{ x: number; y: number }>[] {
  const distance = Math.hypot(tip.x - previous.x, tip.y - previous.y);
  const x = distance ? (tip.x - previous.x) / distance : 1;
  const y = distance ? (tip.y - previous.y) / distance : 0;
  return [
    tip,
    { x: tip.x - x * 6 - y * 3, y: tip.y - y * 6 + x * 3 },
    { x: tip.x - x * 6 + y * 3, y: tip.y - y * 6 - x * 3 },
  ];
}

/** Public standard geometry provides every fixed-shape icon; no desktop assets. */
export function shapeGalleryPreview(choice: ShapeGalleryChoice): ShapeGalleryPreview {
  const cached = previews.get(choice.id);
  if (cached) return cached;
  // Gesture icons are illustrative standard paths only. They carry no insertion preset
  // and create bounded numeric paths through their own gesture capture.
  const preset: ShapePresetName =
    choice.kind === "preset" || choice.kind === "line"
      ? choice.preset
      : choice.kind === "textBox"
        ? "rect"
        : choice.tool === "freeform"
          ? "bentConnector4"
          : choice.tool === "scribble"
            ? "curvedConnector5"
            : "curvedConnector3";
  const geometry = evaluateShapePreset({ preset }, 32, 24);
  const contours = geometry.paths.flatMap((path) => flattenShapePath(path));
  const points = contours.flatMap((contour) => contour.points);
  const arrows: string[] = [];
  if (choice.kind === "line") {
    const pathPoints = contours.find((contour) => contour.points.length > 1)?.points;
    if (pathPoints) {
      for (const [kind, tip, previous] of [
        [choice.beginArrow, pathPoints[0]!, pathPoints[1]!],
        [choice.endArrow, pathPoints.at(-1)!, pathPoints.at(-2)!],
      ] as const) {
        if (kind !== "triangle") continue;
        const arrow = triangle(tip, previous);
        points.push(...arrow);
        arrows.push(
          `${arrow.map((point, index) => `${index ? "L" : "M"}${point.x} ${point.y}`).join(" ")} Z`,
        );
      }
    }
  }
  let left = 0,
    top = 0,
    right = 32,
    bottom = 24;
  for (const point of points) {
    left = Math.min(left, point.x);
    top = Math.min(top, point.y);
    right = Math.max(right, point.x);
    bottom = Math.max(bottom, point.y);
  }
  const preview: ShapeGalleryPreview = {
    viewBox: [left - 1.5, top - 1.5, right - left + 3, bottom - top + 3]
      .map((value) => String(Number(value.toPrecision(10))))
      .join(" "),
    paths: geometry.paths.map((path) => ({
      d: shapePresetPathToSvg(path),
      filled: choice.kind !== "line" && choice.kind !== "drawingTool" && path.filled,
      stroke: path.stroke,
    })),
    arrows,
  };
  previews.set(choice.id, preview);
  return preview;
}
