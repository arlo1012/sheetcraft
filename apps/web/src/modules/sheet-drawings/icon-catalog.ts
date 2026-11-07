import { iconPaths, type SheetIconId } from "@sheetcraft/core/sheet-icons";

export const iconCategories = ["arrows", "letters", "math", "basic", "buildings"] as const;
export type IconCategory = (typeof iconCategories)[number];
export type IconFilter = IconCategory | "all" | "favorites";
export type CatalogIcon = {
  id: SheetIconId;
  category: IconCategory;
  zh: string;
  en: string;
  search: string;
};
type IconEntry = readonly [id: SheetIconId, zh: string, en: string, keywords?: string];
const entries: Record<IconCategory, readonly IconEntry[]> = {
  arrows: [
    ["arrow-right", "单线向右箭头", "Right arrow", "右方向 前进 next forward"],
    ["arrow-left", "单线向左箭头", "Left arrow", "左方向 返回 back"],
    ["arrow-up", "向上箭头", "Up arrow", "上升 rise"],
    ["arrow-down", "向下箭头", "Down arrow", "下降 fall"],
    ["arrow-up-right", "右上箭头", "Up-right arrow", "增长 increase"],
    ["arrow-up-left", "左上箭头", "Up-left arrow"],
    ["arrow-down-right", "右下箭头", "Down-right arrow"],
    ["arrow-down-left", "左下箭头", "Down-left arrow"],
    ["arrow-horizontal", "左右双向箭头", "Horizontal arrows", "水平 双向"],
    ["arrow-vertical", "上下双向箭头", "Vertical arrows", "垂直 双向"],
    ["arrow-return", "返回箭头", "Return arrow", "撤销"],
    ["arrow-turn", "转向箭头", "Turn arrow"],
  ],
  letters: Object.keys(iconPaths)
    .filter((id): id is SheetIconId => id.startsWith("letter-"))
    .map((id) => {
      const letter = id.slice(-1).toUpperCase();
      return [id, "字母 " + letter, "Letter " + letter];
    }),
  math: [
    ["plus", "加号", "Plus", "加法 +"],
    ["minus", "减号", "Minus", "减法 -"],
    ["multiply", "乘号", "Multiply", "乘法 × *"],
    ["divide", "除号", "Divide", "除法 ÷ /"],
    ["equal", "等号", "Equals", "等于 ="],
    ["not-equal", "不等号", "Not equal", "不等于 ≠"],
    ["plus-minus", "正负号", "Plus minus", "±"],
    ["less-than", "小于号", "Less than", "<"],
    ["greater-than", "大于号", "Greater than", ">"],
    ["percent", "百分号", "Percent", "百分比 %"],
    ["sum", "求和", "Sum", "求和符号 Σ sigma"],
    ["square-root", "平方根", "Square root", "根号 √"],
    ["infinity", "无穷大", "Infinity", "无限 ∞"],
  ],
  basic: [
    ["ellipse", "圆形", "Circle", "椭圆 oval"],
    ["rectangle", "矩形", "Rectangle", "长方形"],
    ["roundedRectangle", "圆角矩形", "Rounded rectangle"],
    ["triangle", "三角形", "Triangle"],
    ["diamond", "菱形", "Diamond"],
    ["star", "五角星", "Star", "星形"],
    ["heart", "爱心", "Heart", "心形"],
    ["hexagon", "六边形", "Hexagon"],
    ["pentagon", "五边形", "Pentagon"],
    ["flag", "旗帜", "Flag", "旗子"],
  ],
  buildings: [
    ["house", "住宅", "House", "房屋 建筑 home"],
    ["factory", "工厂", "Factory", "工业 制造 厂房 industry"],
    ["office", "办公楼", "Office building", "商业 公司"],
    ["warehouse", "仓库", "Warehouse", "仓储 物流"],
    ["bridge", "桥梁", "Bridge"],
    ["tower", "输电塔", "Power tower", "电力 电塔"],
    ["crane", "起重机", "Crane", "塔吊 工地"],
    ["windmill", "风力发电机", "Wind turbine", "风车 能源 windmill"],
    ["chimney", "烟囱", "Chimneys", "排烟"],
    ["school", "学校", "School", "校园"],
  ],
};
export const catalogIcons: readonly CatalogIcon[] = iconCategories.flatMap((category) =>
  entries[category].map(([id, zh, en, keywords]) => ({
    id,
    category,
    zh,
    en,
    search: [id, zh, en, keywords].filter(Boolean).join(" ").toLowerCase(),
  })),
);
const iconsById = new Map(catalogIcons.map((icon) => [icon.id, icon]));
export function iconName(id: SheetIconId, locale: string): string {
  const icon = iconsById.get(id)!;
  return locale === "zh-CN" ? icon.zh : icon.en;
}
