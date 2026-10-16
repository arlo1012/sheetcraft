/** Commands submitted by the owner-bound shape ribbon and selection pane. */
export type ShapeObjectControlAction =
  | "flip-horizontal"
  | "flip-vertical"
  | "rotate-left"
  | "rotate-right"
  | "bring-forward"
  | "send-backward"
  | "bring-front"
  | "send-back";

export type ShapeObjectOrderAction = Extract<
  ShapeObjectControlAction,
  "bring-forward" | "send-backward" | "bring-front" | "send-back"
>;

/** Paths identify roots and recursive group children; the host supplies frontmost-first order. */
export type ShapeSelectionPaneRow = {
  readonly path: readonly string[];
  readonly name: string;
  readonly kind: "shape" | "textBox" | "equation" | "shapeGroup";
  readonly depth: number;
  readonly selected: boolean;
  readonly canEdit: boolean;
  readonly visible?: boolean;
  readonly hiddenByAncestor?: boolean;
  readonly canToggleVisibility?: boolean;
  /** Optional exact object data identity for retaining unrelated name drafts safely. */
  readonly sourceKey?: string;
};

export type ShapeSelectionRow = ShapeSelectionPaneRow;

export type ShapeObjectControlsLocale = "en-US" | "zh-CN";

const en = {
  tools: "Drawing Tools",
  format: "Format Shape",
  rotate: "Rotate",
  rotateLeft: "Rotate Left 90°",
  rotateRight: "Rotate Right 90°",
  flipHorizontal: "Flip Horizontal",
  flipVertical: "Flip Vertical",
  order: "Arrange",
  bringForward: "Bring Forward",
  sendBackward: "Send Backward",
  bringFront: "Bring to Front",
  sendBack: "Send to Back",
  selectionPane: "Selection Pane",
  close: "Close Selection Pane",
  shape: "Shape",
  textBox: "Text Box",
  equation: "Equation",
  shapeGroup: "Group",
  select: "Select",
  name: "Object name",
  empty: "No drawing objects on this sheet.",
  selectionHint: "Frontmost objects first. Ctrl/⌘-click to add to the selection.",
  rejected: "Couldn't apply this change. Try again.",
  openRejected: "Couldn't open this pane. Try again.",
  selectRejected: "Couldn't select this object.",
  renameRejected: "Couldn't rename this object. Your edit is kept.",
  nameRequired: "Enter an object name.",
  hide: "Hide object",
  show: "Show object",
  showAll: "Show All",
  hideAll: "Hide All",
  inheritedHidden: "Show the parent group first.",
  visibilityRejected: "Couldn't change object visibility.",
};

const zh: typeof en = {
  tools: "绘图工具",
  format: "设置形状格式",
  rotate: "旋转",
  rotateLeft: "向左旋转 90°",
  rotateRight: "向右旋转 90°",
  flipHorizontal: "水平翻转",
  flipVertical: "垂直翻转",
  order: "排列",
  bringForward: "上移一层",
  sendBackward: "下移一层",
  bringFront: "置于顶层",
  sendBack: "置于底层",
  selectionPane: "选择窗格",
  close: "关闭选择窗格",
  shape: "形状",
  textBox: "文本框",
  equation: "公式",
  shapeGroup: "组合",
  select: "选择",
  name: "对象名称",
  empty: "此工作表没有绘图对象。",
  selectionHint: "按最前面的对象优先排列。按住 Ctrl/⌘ 单击可追加选择。",
  rejected: "无法应用此更改，请重试。",
  openRejected: "无法打开窗格，请重试。",
  selectRejected: "无法选择此对象。",
  renameRejected: "无法重命名，已保留输入内容。",
  nameRequired: "请输入对象名称。",
  hide: "隐藏对象",
  show: "显示对象",
  showAll: "全部显示",
  hideAll: "全部隐藏",
  inheritedHidden: "请先显示上级组合。",
  visibilityRejected: "无法更改对象可见性。",
};

export function shapeObjectControlsLabels(locale: ShapeObjectControlsLocale = "en-US") {
  return locale === "zh-CN" ? zh : en;
}

/** Shared standalone/embedded object commands retain the same exact-owner handlers. */
export interface ShapeObjectToolsInput {
  ownerKey: string;
  disabled: boolean;
  canFormat?: boolean;
  canFlip: boolean;
  canRotate: boolean;
  canOrder: boolean;
  unavailableReason?: string;
  locale?: ShapeObjectControlsLocale;
  actionHandler: (action: ShapeObjectControlAction) => boolean;
  formatHandler: () => boolean;
  selectionPaneHandler: () => boolean;
}
