import {
  evaluateShapePreset,
  flattenShapePath,
  shapePresetPathToSvg,
  SHAPE_PRESET_FILLED_NAMES,
  type PictureCropShape,
  type ShapePresetName,
} from "@sheetcraft/core/shape-presets";

export type PictureCropShapeLocale = "en-US" | "zh-CN";
export type PictureCropShapeLabel = Readonly<Record<PictureCropShapeLocale, string>>;
export type PictureCropShapeChoice = Readonly<{
  preset: ShapePresetName;
  label: PictureCropShapeLabel;
}>;
export type PictureCropShapeCategory =
  | "rectangles"
  | "basic"
  | "arrows"
  | "equation"
  | "flowchart"
  | "stars"
  | "callouts";
export type PictureCropShapeGroup = Readonly<{
  id: PictureCropShapeCategory;
  label: PictureCropShapeLabel;
  items: readonly PictureCropShapeChoice[];
}>;
export type PictureCropShapeMenuLabels = Readonly<{
  trigger: string;
  applyRejected: string;
}>;

function label(en: string, zh: string): PictureCropShapeLabel {
  return { "en-US": en, "zh-CN": zh };
}
function choice(preset: ShapePresetName, en: string, zh: string): PictureCropShapeChoice {
  return { preset, label: label(en, zh) };
}

export const PICTURE_CROP_SHAPE_MENU_LABELS: Readonly<
  Record<PictureCropShapeLocale, PictureCropShapeMenuLabels>
> = {
  "en-US": {
    trigger: "Crop to Shape",
    applyRejected: "Couldn’t apply this shape. Try again.",
  },
  "zh-CN": {
    trigger: "裁剪为形状",
    applyRejected: "无法应用此形状，请重试。",
  },
};

/**
 * Explicit, product-owned crop choices. The desktop gallery has 147 choices in
 * this order, excluding text boxes, lines and its separate shape/size reset.
 * The preset identifiers are DrawingML semantics, never resource or DOM ids.
 */
export const PICTURE_CROP_SHAPE_GALLERY: readonly PictureCropShapeGroup[] = [
  {
    id: "rectangles",
    label: label("Rectangles", "矩形"),
    items: [
      choice("rect", "Rectangle", "矩形"),
      choice("roundRect", "Rounded Rectangle", "圆角矩形"),
      choice("snip1Rect", "Snip Single Corner Rectangle", "剪去单角的矩形"),
      choice("snip2SameRect", "Snip Same Side Corner Rectangle", "剪去同侧角的矩形"),
      choice("snip2DiagRect", "Snip Diagonal Corner Rectangle", "剪去对角的矩形"),
      choice("snipRoundRect", "Snip and Round Single Corner Rectangle", "剪角圆角矩形"),
      choice("round1Rect", "Round Single Corner Rectangle", "单圆角矩形"),
      choice("round2SameRect", "Round Same Side Corner Rectangle", "同侧圆角矩形"),
      choice("round2DiagRect", "Round Diagonal Corner Rectangle", "对角圆角矩形"),
    ],
  },
  {
    id: "basic",
    label: label("Basic Shapes", "基本形状"),
    items: [
      choice("ellipse", "Oval", "椭圆"),
      choice("triangle", "Isosceles Triangle", "等腰三角形"),
      choice("rtTriangle", "Right Triangle", "直角三角形"),
      choice("parallelogram", "Parallelogram", "平行四边形"),
      choice("trapezoid", "Trapezoid", "梯形"),
      choice("diamond", "Diamond", "菱形"),
      choice("pentagon", "Regular Pentagon", "正五边形"),
      choice("hexagon", "Hexagon", "六边形"),
      choice("heptagon", "Heptagon", "七边形"),
      choice("octagon", "Octagon", "八边形"),
      choice("decagon", "Decagon", "十边形"),
      choice("dodecagon", "Dodecagon", "十二边形"),
      choice("pie", "Pie", "饼形"),
      choice("chord", "Chord", "弦形"),
      choice("teardrop", "Teardrop", "泪滴形"),
      choice("frame", "Frame", "图文框"),
      choice("halfFrame", "Half Frame", "半闭框"),
      choice("corner", "L-Shape", "L 形"),
      choice("diagStripe", "Diagonal Stripe", "斜纹"),
      choice("plus", "Cross", "十字形"),
      choice("plaque", "Plaque", "缺角矩形"),
      choice("can", "Cylinder", "圆柱形"),
      choice("cube", "Cube", "立方体"),
      choice("bevel", "Bevel", "棱台"),
      choice("donut", "Donut", "同心圆"),
      choice("noSmoking", "No Symbol", "禁止符"),
      choice("blockArc", "Block Arc", "空心弧"),
      choice("foldedCorner", "Folded Corner", "折角形"),
      choice("smileyFace", "Smiley Face", "笑脸"),
      choice("heart", "Heart", "心形"),
      choice("lightningBolt", "Lightning Bolt", "闪电形"),
      choice("sun", "Sun", "太阳形"),
      choice("moon", "Moon", "新月形"),
      choice("cloud", "Cloud", "云形"),
      choice("arc", "Arc", "弧形"),
      choice("bracketPair", "Double Bracket", "双括号"),
      choice("bracePair", "Double Brace", "双大括号"),
      choice("leftBracket", "Left Bracket", "左中括号"),
      choice("rightBracket", "Right Bracket", "右中括号"),
      choice("leftBrace", "Left Brace", "左大括号"),
      choice("rightBrace", "Right Brace", "右大括号"),
    ],
  },
  {
    id: "arrows",
    label: label("Block Arrows", "箭头总汇"),
    items: [
      choice("rightArrow", "Right Arrow", "右箭头"),
      choice("leftArrow", "Left Arrow", "左箭头"),
      choice("upArrow", "Up Arrow", "上箭头"),
      choice("downArrow", "Down Arrow", "下箭头"),
      choice("leftRightArrow", "Left-Right Arrow", "左右箭头"),
      choice("upDownArrow", "Up-Down Arrow", "上下箭头"),
      choice("quadArrow", "Quad Arrow", "十字箭头"),
      choice("leftRightUpArrow", "Left-Right-Up Arrow", "丁字箭头"),
      choice("bentArrow", "Bent Arrow", "圆角右箭头"),
      choice("uturnArrow", "U-Turn Arrow", "手杖形箭头"),
      choice("leftUpArrow", "Left-Up Arrow", "直角双向箭头"),
      choice("bentUpArrow", "Bent-Up Arrow", "直角上箭头"),
      choice("curvedRightArrow", "Curved Right Arrow", "右弧形箭头"),
      choice("curvedLeftArrow", "Curved Left Arrow", "左弧形箭头"),
      choice("curvedUpArrow", "Curved Up Arrow", "上弧形箭头"),
      choice("curvedDownArrow", "Curved Down Arrow", "下弧形箭头"),
      choice("stripedRightArrow", "Striped Right Arrow", "虚尾箭头"),
      choice("notchedRightArrow", "Notched Right Arrow", "燕尾形箭头"),
      choice("homePlate", "Pentagon", "五边形"),
      choice("chevron", "Chevron", "燕尾形"),
      choice("rightArrowCallout", "Right Arrow Callout", "右箭头标注"),
      choice("leftArrowCallout", "Left Arrow Callout", "左箭头标注"),
      choice("upArrowCallout", "Up Arrow Callout", "上箭头标注"),
      choice("downArrowCallout", "Down Arrow Callout", "下箭头标注"),
      choice("leftRightArrowCallout", "Left-Right Arrow Callout", "左右箭头标注"),
      choice("quadArrowCallout", "Quad Arrow Callout", "十字箭头标注"),
      choice("circularArrow", "Circular Arrow", "环形箭头"),
    ],
  },
  {
    id: "equation",
    label: label("Equation Shapes", "公式形状"),
    items: [
      choice("mathPlus", "Plus", "加号"),
      choice("mathMinus", "Minus", "减号"),
      choice("mathMultiply", "Multiply", "乘号"),
      choice("mathDivide", "Divide", "除号"),
      choice("mathEqual", "Equal", "等于号"),
      choice("mathNotEqual", "Not Equal", "不等于号"),
    ],
  },
  {
    id: "flowchart",
    label: label("Flowchart", "流程图"),
    items: [
      choice("flowChartProcess", "Flowchart: Process", "流程图：过程"),
      choice("flowChartAlternateProcess", "Flowchart: Alternate Process", "流程图：可选过程"),
      choice("flowChartDecision", "Flowchart: Decision", "流程图：决策"),
      choice("flowChartInputOutput", "Flowchart: Data", "流程图：数据"),
      choice("flowChartPredefinedProcess", "Flowchart: Predefined Process", "流程图：预定义过程"),
      choice("flowChartInternalStorage", "Flowchart: Internal Storage", "流程图：内部贮存"),
      choice("flowChartDocument", "Flowchart: Document", "流程图：文档"),
      choice("flowChartMultidocument", "Flowchart: Multidocument", "流程图：多文档"),
      choice("flowChartTerminator", "Flowchart: Terminator", "流程图：终止"),
      choice("flowChartPreparation", "Flowchart: Preparation", "流程图：准备"),
      choice("flowChartManualInput", "Flowchart: Manual Input", "流程图：手动输入"),
      choice("flowChartManualOperation", "Flowchart: Manual Operation", "流程图：手动操作"),
      choice("flowChartConnector", "Flowchart: Connector", "流程图：联系"),
      choice("flowChartOffpageConnector", "Flowchart: Off-page Connector", "流程图：离页连接符"),
      choice("flowChartPunchedCard", "Flowchart: Card", "流程图：卡片"),
      choice("flowChartPunchedTape", "Flowchart: Punched Tape", "流程图：资料带"),
      choice("flowChartSummingJunction", "Flowchart: Summing Junction", "流程图：汇总连接"),
      choice("flowChartOr", "Flowchart: Or", "流程图：或者"),
      choice("flowChartCollate", "Flowchart: Collate", "流程图：对照"),
      choice("flowChartSort", "Flowchart: Sort", "流程图：排序"),
      choice("flowChartExtract", "Flowchart: Extract", "流程图：摘录"),
      choice("flowChartMerge", "Flowchart: Merge", "流程图：合并"),
      choice("flowChartOnlineStorage", "Flowchart: Stored Data", "流程图：库存数据"),
      choice("flowChartDelay", "Flowchart: Delay", "流程图：延期"),
      choice(
        "flowChartMagneticTape",
        "Flowchart: Sequential Access Storage",
        "流程图：顺序访问存储器",
      ),
      choice("flowChartMagneticDisk", "Flowchart: Magnetic Disk", "流程图：磁盘"),
      choice("flowChartMagneticDrum", "Flowchart: Direct Access Storage", "流程图：直接访问存储器"),
      choice("flowChartDisplay", "Flowchart: Display", "流程图：显示"),
    ],
  },
  {
    id: "stars",
    label: label("Stars and Banners", "星与旗帜"),
    items: [
      choice("irregularSeal1", "Explosion 1", "爆炸形 1"),
      choice("irregularSeal2", "Explosion 2", "爆炸形 2"),
      choice("star4", "4-Point Star", "十字星"),
      choice("star5", "5-Point Star", "五角星"),
      choice("star6", "6-Point Star", "六角星"),
      choice("star7", "7-Point Star", "七角星"),
      choice("star8", "8-Point Star", "八角星"),
      choice("star10", "10-Point Star", "十角星"),
      choice("star12", "12-Point Star", "十二角星"),
      choice("star16", "16-Point Star", "十六角星"),
      choice("star24", "24-Point Star", "二十四角星"),
      choice("star32", "32-Point Star", "三十二角星"),
      choice("ribbon2", "Up Ribbon", "上凸带形"),
      choice("ribbon", "Down Ribbon", "前凸带形"),
      choice("ellipseRibbon2", "Curved Up Ribbon", "上凸弯带形"),
      choice("ellipseRibbon", "Curved Down Ribbon", "前凸弯带形"),
      choice("verticalScroll", "Vertical Scroll", "竖卷轴"),
      choice("horizontalScroll", "Horizontal Scroll", "横卷形"),
      choice("wave", "Wave", "波形"),
      choice("doubleWave", "Double Wave", "双波形"),
    ],
  },
  {
    id: "callouts",
    label: label("Callouts", "标注"),
    items: [
      choice("wedgeRectCallout", "Rectangular Callout", "矩形标注"),
      choice("wedgeRoundRectCallout", "Rounded Rectangular Callout", "圆角矩形标注"),
      choice("wedgeEllipseCallout", "Oval Callout", "椭圆形标注"),
      choice("cloudCallout", "Cloud Callout", "云形标注"),
      choice("borderCallout1", "Line Callout 1", "线形标注 1"),
      choice("borderCallout2", "Line Callout 2", "线形标注 2"),
      choice("borderCallout3", "Line Callout 3", "线形标注 3"),
      choice("accentCallout1", "Line Callout 1 (Accent Bar)", "线形标注 1（带强调线）"),
      choice("accentCallout2", "Line Callout 2 (Accent Bar)", "线形标注 2（带强调线）"),
      choice("accentCallout3", "Line Callout 3 (Accent Bar)", "线形标注 3（带强调线）"),
      choice("callout1", "Line Callout 1 (No Border)", "线形标注 1（无边框）"),
      choice("callout2", "Line Callout 2 (No Border)", "线形标注 2（无边框）"),
      choice("callout3", "Line Callout 3 (No Border)", "线形标注 3（无边框）"),
      choice(
        "accentBorderCallout1",
        "Line Callout 1 (Border and Accent Bar)",
        "线形标注 1（带边框和强调线）",
      ),
      choice(
        "accentBorderCallout2",
        "Line Callout 2 (Border and Accent Bar)",
        "线形标注 2（带边框和强调线）",
      ),
      choice(
        "accentBorderCallout3",
        "Line Callout 3 (Border and Accent Bar)",
        "线形标注 3（带边框和强调线）",
      ),
    ],
  },
];

const galleryPresets = new Set<ShapePresetName>(
  PICTURE_CROP_SHAPE_GALLERY.flatMap((group) => group.items.map((item) => item.preset)),
);
const filledPresets = new Set<ShapePresetName>(SHAPE_PRESET_FILLED_NAMES);

/** Rectangle clears only the mask; it does not reset picture size or crop. */
export function pictureCropShapeChoiceValue(preset: ShapePresetName): PictureCropShape | undefined {
  if (!galleryPresets.has(preset) || !filledPresets.has(preset))
    throw new TypeError("This preset is not a picture crop gallery choice.");
  return preset === "rect" ? undefined : { preset };
}

export type PictureCropShapePreview = Readonly<{
  viewBox: string;
  paths: readonly Readonly<{ d: string; filled: boolean; stroke: boolean }>[];
}>;
const previews = new Map<ShapePresetName, PictureCropShapePreview>();

/** Numeric SVG paths from the public geometry API, with no external image assets. */
export function pictureCropShapePreview(preset: ShapePresetName): PictureCropShapePreview {
  const cached = previews.get(preset);
  if (cached) return cached;
  const geometry = evaluateShapePreset(pictureCropShapeChoiceValue(preset), 32, 24);
  let left = 0,
    top = 0,
    right = 32,
    bottom = 24;
  for (const path of geometry.paths) {
    for (const contour of flattenShapePath(path)) {
      for (const point of contour.points) {
        left = Math.min(left, point.x);
        top = Math.min(top, point.y);
        right = Math.max(right, point.x);
        bottom = Math.max(bottom, point.y);
      }
    }
  }
  // Fit callout tails as well as filled paths; leave space for the own preview stroke.
  const preview: PictureCropShapePreview = {
    viewBox: [left - 1.5, top - 1.5, right - left + 3, bottom - top + 3]
      .map((value) => String(Number(value.toPrecision(10))))
      .join(" "),
    paths: geometry.paths.map((path) => ({
      d: shapePresetPathToSvg(path),
      filled: path.filled,
      stroke: path.stroke,
    })),
  };
  previews.set(preset, preview);
  return preview;
}
