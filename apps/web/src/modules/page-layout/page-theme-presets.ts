import type {
  WorkbookCustomColor,
  WorkbookCustomFont,
  WorkbookTheme,
  WorkbookThemeColors,
  WorkbookThemeEffects,
} from "@idea10/core/workbook-theme";

/**
 * The WPS catalog names and four picker categories follow
 * https://www.wps.cn/learning/question/detail/id/334245 . It documents 44
 * built-ins, while the supplied WPS capture includes the additional “波形”.
 * WPS does not publish the complete scheme payload, so only the Office 2013
 * palette is source-exact (https://learn.microsoft.com/en-us/office/dev/add-ins/powerpoint/use-document-themes-in-your-powerpoint-add-ins).
 * The remaining named entries are intentional visual approximations for the
 * gallery, not a claim that they are extracted WPS .thmx files.
 */
export type PageThemeColors = WorkbookThemeColors;
export type PageThemeFontPreset = WorkbookCustomFont;
export type PageThemeEffectPreset = WorkbookThemeEffects;
export type PageThemeColorPreset = WorkbookCustomColor;

export type PageThemePreset = WorkbookTheme & {
  colors: PageThemeColors;
  fonts: PageThemeFontPreset;
  effects: PageThemeEffectPreset;
};

type PaletteRow = readonly [string, string, string, string, string, string, string, string];

const PALETTES: readonly PaletteRow[] = [
  ["wps", "WPS", "#4472c4", "#ed7d31", "#ffc000", "#70ad47", "#5b9bd5", "#c00000"],
  ["office", "Office", "#4f81bd", "#c0504d", "#9bbb59", "#8064a2", "#4bacc6", "#f79646"],
  ["adjacent", "相邻", "#4f81bd", "#c0504d", "#9bbb59", "#8064a2", "#4bacc6", "#f79646"],
  ["angle", "角度", "#5b9bd5", "#ed7d31", "#a5a5a5", "#ffc000", "#4472c4", "#70ad47"],
  ["summit", "顶峰", "#70ad47", "#5b9bd5", "#ffc000", "#ed7d31", "#a5a5a5", "#4472c4"],
  ["apothecary", "药剂师", "#76933c", "#c0504d", "#4f81bd", "#8064a2", "#f79646", "#4bacc6"],
  ["viewpoint", "视点", "#31859c", "#e46c0a", "#9bbb59", "#8064a2", "#c0504d", "#4f81bd"],
  ["austin", "奥斯汀", "#95b3d7", "#f79646", "#c0504d", "#9bbb59", "#8064a2", "#4bacc6"],
  ["black-tie", "黑领结", "#5b9bd5", "#70ad47", "#ffc000", "#ed7d31", "#a5a5a5", "#4472c4"],
  ["flow", "行云流水", "#1f4e79", "#4f81bd", "#9bbb59", "#8064a2", "#c0504d", "#f79646"],
  ["town", "市镇", "#8c4b2d", "#a65d3b", "#7f8c4f", "#8064a2", "#4bacc6", "#c0504d"],
  ["transparent", "透明", "#5b9bd5", "#5b9bd5", "#a5a5a5", "#d9e2f3", "#70ad47", "#ed7d31"],
  ["composite", "复合", "#4472c4", "#ed7d31", "#70ad47", "#5b9bd5", "#ffc000", "#a5a5a5"],
  ["aggregate", "聚合", "#2f75b5", "#548235", "#bf9000", "#c55a11", "#7f7f7f", "#8064a2"],
  ["fashion", "时装设计", "#c00000", "#7f6000", "#38761d", "#134f5c", "#674ea7", "#a64d79"],
  ["soaring", "龙腾四海", "#1f4e79", "#c00000", "#7f6000", "#38761d", "#134f5c", "#674ea7"],
  ["elemental", "元素", "#5b9bd5", "#ed7d31", "#ffc000", "#70ad47", "#4472c4", "#a5a5a5"],
  ["balance", "平衡", "#7f8c8d", "#b5654d", "#d6a84f", "#668d3c", "#4f81bd", "#8064a2"],
  ["basic", "基本", "#4472c4", "#5b9bd5", "#a5a5a5", "#ffc000", "#ed7d31", "#70ad47"],
  ["official", "行政公文", "#2f75b5", "#548235", "#7f6000", "#c55a11", "#7f7f7f", "#8064a2"],
  ["fragrance", "暗香扑面", "#a64d79", "#c27ba0", "#d6b656", "#6aa84f", "#45818e", "#674ea7"],
  ["streamlined", "流畅", "#3d85c6", "#6aa84f", "#f1c232", "#cc4125", "#8e7cc3", "#76a5af"],
  ["sedate", "沉稳", "#5f6b7a", "#7b8f6a", "#b7a57a", "#9e7f70", "#7f8c9a", "#6a7b83"],
  ["grid", "网格", "#4472c4", "#70ad47", "#ffc000", "#ed7d31", "#a5a5a5", "#5b9bd5"],
  ["hardcover", "精装书", "#7f6000", "#a64d00", "#6aa84f", "#3d85c6", "#674ea7", "#a64d79"],
  ["long-view", "极目远眺", "#3d85c6", "#76a5af", "#6aa84f", "#f1c232", "#cc4125", "#8e7cc3"],
  ["neutral", "中性", "#7f7f7f", "#a5a5a5", "#b7b7b7", "#d9d9d9", "#595959", "#c9c9c9"],
  ["crossing", "穿越", "#2f75b5", "#00b0f0", "#70ad47", "#ffc000", "#ed7d31", "#c00000"],
  ["module", "模块", "#1f4e79", "#4f81bd", "#5b9bd5", "#70ad47", "#ffc000", "#ed7d31"],
  ["newspaper", "新闻纸", "#595959", "#7f7f7f", "#a5a5a5", "#b7b7b7", "#d9d9d9", "#404040"],
  ["gorgeous", "华丽", "#c00000", "#f4b183", "#ffd966", "#93c47d", "#6d9eeb", "#8e7cc3"],
  ["prominent", "凸显", "#0050b3", "#00a870", "#ff7d00", "#f5222d", "#722ed1", "#13c2c2"],
  ["plain", "质朴", "#7f6000", "#b45f06", "#6aa84f", "#45818e", "#3d85c6", "#674ea7"],
  ["paper", "纸张", "#8c4b2d", "#c27ba0", "#d6b656", "#6aa84f", "#76a5af", "#8e7cc3"],
  ["perspective", "透视", "#0b5394", "#3d85c6", "#6aa84f", "#f1c232", "#cc4125", "#8e7cc3"],
  ["wind", "风舞九天", "#0b5394", "#00a2e8", "#00b0f0", "#6fa8dc", "#93c47d", "#ffd966"],
  ["pushpin", "图钉", "#4472c4", "#5b9bd5", "#a5a5a5", "#ffc000", "#ed7d31", "#70ad47"],
  ["airflow", "气流", "#3d85c6", "#76a5af", "#6aa84f", "#93c47d", "#ffd966", "#f6b26b"],
  ["summer-solstice", "夏至", "#f1c232", "#ff9900", "#cc4125", "#a64d79", "#674ea7", "#3d85c6"],
  ["technique", "技巧", "#3d85c6", "#6aa84f", "#ffd966", "#f6b26b", "#c27ba0", "#8e7cc3"],
  ["fragrant-grass", "芳草", "#6aa84f", "#93c47d", "#b6d7a8", "#ffd966", "#76a5af", "#3d85c6"],
  ["journey", "跋涉", "#8c4b2d", "#b45f06", "#7f6000", "#6aa84f", "#45818e", "#3d85c6"],
  ["city", "都市", "#404040", "#7f7f7f", "#5b9bd5", "#4472c4", "#70ad47", "#ffc000"],
  ["vitality", "活力", "#00b0f0", "#00b050", "#92d050", "#ffc000", "#ff7d00", "#f5222d"],
  ["wave", "波形", "#1f4e79", "#3d85c6", "#00b0f0", "#6aa84f", "#ffd966", "#f6b26b"],
];

type FontRow = readonly [string, string, string, string];
// The first eighteen pairs are transcribed from the supplied WPS font gallery.
// The remaining entries use the same Cambria/Calibri Latin scheme and explicit,
// named CJK pairs rather than cycling unrelated choices by array position.
const FONT_ROWS: readonly FontRow[] = [
  ["office", "Office", "宋体", "宋体"],
  ["office-2", "Office 2", "宋体", "黑体"],
  ["office-classic", "Office 经典", "黑体", "宋体"],
  ["office-classic-2", "Office 经典 2", "黑体", "黑体"],
  ["adjacent", "相邻", "宋体", "宋体"],
  ["angle", "角度", "微软雅黑", "隶书"],
  ["summit", "顶峰", "黑体", "宋体"],
  ["apothecary", "药剂师", "宋体", "幼圆"],
  ["viewpoint", "视点", "微软雅黑", "微软雅黑"],
  ["austin", "奥斯汀", "幼圆", "幼圆"],
  ["black-tie", "黑领结", "仿宋", "仿宋"],
  ["flow", "行云流水", "华文行楷", "华文行楷"],
  ["town", "市镇", "方正舒体", "方正舒体"],
  ["transparent", "透明", "方正舒体", "方正舒体"],
  ["composite", "复合", "宋体", "宋体"],
  ["aggregate", "聚合", "黑体", "黑体"],
  ["fashion", "时装设计", "仿宋", "仿宋"],
  ["soaring", "龙腾四海", "隶书", "华文楷体"],
  ["elemental", "元素", "等线", "等线"],
  ["balance", "平衡", "宋体", "宋体"],
  ["basic", "基本", "黑体", "宋体"],
  ["official", "行政公文", "方正小标宋简体", "仿宋"],
  ["fragrance", "暗香扑面", "华文新魏", "宋体"],
  ["streamlined", "流畅", "微软雅黑", "微软雅黑"],
  ["sedate", "沉稳", "宋体", "宋体"],
  ["grid", "网格", "等线", "等线"],
  ["hardcover", "精装书", "华文楷体", "仿宋"],
  ["long-view", "极目远眺", "微软雅黑", "宋体"],
  ["neutral", "中性", "等线", "等线"],
  ["crossing", "穿越", "黑体", "微软雅黑"],
  ["module", "模块", "等线", "宋体"],
  ["newspaper", "新闻纸", "宋体", "宋体"],
  ["gorgeous", "华丽", "华文行楷", "宋体"],
  ["prominent", "凸显", "微软雅黑", "微软雅黑"],
  ["plain", "质朴", "仿宋", "宋体"],
  ["paper", "纸张", "宋体", "仿宋"],
  ["perspective", "透视", "微软雅黑", "等线"],
  ["wind", "风舞九天", "华文行楷", "微软雅黑"],
  ["pushpin", "图钉", "黑体", "宋体"],
  ["airflow", "气流", "微软雅黑", "等线"],
  ["summer-solstice", "夏至", "幼圆", "宋体"],
  ["technique", "技巧", "等线", "微软雅黑"],
  ["fragrant-grass", "芳草", "华文楷体", "宋体"],
  ["journey", "跋涉", "方正舒体", "仿宋"],
  ["city", "都市", "黑体", "等线"],
  ["vitality", "活力", "微软雅黑", "微软雅黑"],
  ["wave", "波形", "等线", "宋体"],
];

function colors([id, name, ...accentColors]: PaletteRow): PageThemeColorPreset {
  return {
    id,
    name,
    dark1: "#000000",
    light1: "#ffffff",
    dark2: "#44546a",
    light2: "#e7e6e6",
    hyperlink: "#0563c1",
    followedHyperlink: "#954f72",
    accentColors: accentColors as PageThemeColorPreset["accentColors"],
  };
}

export const PAGE_THEME_COLOR_PRESETS: readonly PageThemeColorPreset[] = PALETTES.map(colors);
export const PAGE_THEME_FONT_PRESETS: readonly PageThemeFontPreset[] = FONT_ROWS.map(
  ([id, name, headingEastAsia, bodyEastAsia]) => ({
    id,
    name,
    headingFont: "Cambria",
    bodyFont: "Calibri",
    headingEastAsia,
    bodyEastAsia,
  }),
);

const FONT_BY_THEME_ID = new Map(PAGE_THEME_FONT_PRESETS.map((font) => [font.id, font]));

function effect(
  id: string,
  name: string,
  shadow: PageThemeEffectPreset["shadow"],
  reflection: boolean,
  bevel: boolean,
  outlineWidth: number,
  gradient: boolean,
): PageThemeEffectPreset {
  return { id, name, shadow, reflection, bevel, outlineWidth, gradient };
}

// These are explicit preview recipes selected to resemble the supplied WPS
// gallery; they are not a serialized copy of WPS format schemes.
export const PAGE_THEME_EFFECT_PRESETS: readonly PageThemeEffectPreset[] = [
  effect("wps", "WPS", "soft", false, false, 1, true),
  effect("office", "Office", "soft", false, false, 1, false),
  effect("adjacent", "相邻", "soft", false, false, 1, true),
  effect("angle", "角度", "hard", false, false, 1, true),
  effect("summit", "顶峰", "hard", true, true, 2, true),
  effect("apothecary", "药剂师", "soft", false, true, 2, true),
  effect("viewpoint", "视点", "soft", true, false, 1, true),
  effect("austin", "奥斯汀", "soft", true, true, 1, false),
  effect("black-tie", "黑领结", "hard", false, true, 2, false),
  effect("flow", "行云流水", "soft", false, false, 1, true),
  effect("town", "市镇", "soft", false, false, 1, false),
  effect("transparent", "透明", "none", false, false, 1, false),
  effect("composite", "复合", "soft", false, true, 1, true),
  effect("aggregate", "聚合", "soft", true, true, 2, true),
  effect("fashion", "时装设计", "soft", false, true, 2, true),
  effect("soaring", "龙腾四海", "hard", true, true, 2, true),
  effect("elemental", "元素", "hard", false, false, 1, true),
  effect("balance", "平衡", "soft", false, false, 1, false),
  effect("basic", "基本", "none", false, false, 1, false),
  effect("official", "行政公文", "soft", false, false, 1, false),
  effect("fragrance", "暗香扑面", "soft", true, false, 1, true),
  effect("streamlined", "流畅", "soft", false, false, 1, true),
  effect("sedate", "沉稳", "hard", false, true, 2, false),
  effect("grid", "网格", "soft", false, false, 1, false),
  effect("hardcover", "精装书", "hard", true, true, 2, true),
  effect("long-view", "极目远眺", "soft", true, false, 1, true),
  effect("neutral", "中性", "none", false, false, 1, false),
  effect("crossing", "穿越", "hard", false, true, 2, true),
  effect("module", "模块", "hard", false, true, 2, false),
  effect("newspaper", "新闻纸", "none", false, false, 1, false),
  effect("gorgeous", "华丽", "soft", true, true, 2, true),
  effect("prominent", "凸显", "hard", false, true, 2, true),
  effect("plain", "质朴", "soft", false, false, 1, false),
  effect("paper", "纸张", "soft", false, false, 1, false),
  effect("perspective", "透视", "soft", true, false, 1, true),
  effect("wind", "风舞九天", "soft", true, true, 1, true),
  effect("pushpin", "图钉", "hard", false, false, 1, true),
  effect("airflow", "气流", "soft", false, false, 1, true),
  effect("summer-solstice", "夏至", "soft", false, true, 1, true),
  effect("technique", "技巧", "soft", false, false, 1, true),
  effect("fragrant-grass", "芳草", "soft", false, false, 1, true),
  effect("journey", "跋涉", "hard", false, true, 2, false),
  effect("city", "都市", "hard", false, false, 1, false),
  effect("vitality", "活力", "soft", true, false, 1, true),
  effect("wave", "波形", "soft", false, false, 1, true),
];

const EFFECT_BY_THEME_ID = new Map(PAGE_THEME_EFFECT_PRESETS.map((preset) => [preset.id, preset]));

export const PAGE_THEME_PRESETS: readonly PageThemePreset[] = PAGE_THEME_COLOR_PRESETS.map(
  (color) => {
    const fonts = FONT_BY_THEME_ID.get(color.id) ?? FONT_BY_THEME_ID.get("office")!;
    const effects = EFFECT_BY_THEME_ID.get(color.id)!;
    return {
      id: color.id,
      name: color.name,
      accentColors: color.accentColors,
      headingFont: fonts.headingFont,
      bodyFont: fonts.bodyFont,
      colors: color,
      fonts,
      effects,
    };
  },
);

export function createCustomThemeColors(
  id: string,
  name: string,
  accentColors: PageThemeColorPreset["accentColors"],
  base: Omit<PageThemeColors, "name">,
): PageThemeColorPreset {
  return { id, name, accentColors, ...base };
}

export function createCustomThemeFont(
  id: string,
  name: string,
  fonts: Omit<PageThemeFontPreset, "id" | "name">,
): PageThemeFontPreset {
  return { id, name, ...fonts };
}
