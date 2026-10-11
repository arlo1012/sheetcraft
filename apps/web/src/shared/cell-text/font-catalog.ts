// Names identify font families; presets do not imply that a font file is installed.
const FONT_FAMILIES: ReadonlyArray<{ family: string; chinese?: string }> = [
  { family: "Inter" },
  { family: "SimSun", chinese: "宋体" },
  { family: "SimHei", chinese: "黑体" },
  { family: "KaiTi", chinese: "楷体" },
  { family: "FangSong", chinese: "仿宋" },
  { family: "Microsoft YaHei", chinese: "微软雅黑" },
  { family: "Microsoft JhengHei", chinese: "微软正黑体" },
  { family: "DengXian", chinese: "等线" },
  { family: "NSimSun", chinese: "新宋体" },
  { family: "LiSu", chinese: "隶书" },
  { family: "YouYuan", chinese: "幼圆" },
  { family: "STSong", chinese: "华文宋体" },
  { family: "STHeiti", chinese: "华文黑体" },
  { family: "STKaiti", chinese: "华文楷体" },
  { family: "STFangsong", chinese: "华文仿宋" },
  { family: "STXihei", chinese: "华文细黑" },
  { family: "STZhongsong", chinese: "华文中宋" },
  { family: "STXingkai", chinese: "华文行楷" },
  { family: "STLiti", chinese: "华文隶书" },
  { family: "STHupo", chinese: "华文琥珀" },
  { family: "STCaiyun", chinese: "华文彩云" },
  { family: "STXinwei", chinese: "华文新魏" },
  { family: "STBaoli", chinese: "华文报隶" },
  { family: "STYuanti", chinese: "华文圆体" },
  { family: "PingFang SC", chinese: "苹方" },
  { family: "Songti SC", chinese: "宋体-简" },
  { family: "Heiti SC", chinese: "黑体-简" },
  { family: "Noto Sans CJK SC", chinese: "Noto Sans CJK 简体中文" },
  { family: "Noto Serif CJK SC", chinese: "Noto Serif CJK 简体中文" },
  { family: "Source Han Sans SC", chinese: "思源黑体" },
  { family: "Source Han Serif SC", chinese: "思源宋体" },
  { family: "Noto Sans SC", chinese: "Noto Sans 简体中文" },
  { family: "Noto Serif SC", chinese: "Noto Serif 简体中文" },
  { family: "LXGW WenKai", chinese: "霞鹜文楷" },
  { family: "Arial" },
  { family: "Arial Narrow" },
  { family: "Arial Rounded MT Bold" },
  { family: "Calibri" },
  { family: "Calibri Light" },
  { family: "Aptos" },
  { family: "Aptos Display" },
  { family: "Aptos Narrow" },
  { family: "Aptos Mono" },
  { family: "Aptos Serif" },
  { family: "Cambria" },
  { family: "Candara" },
  { family: "Constantia" },
  { family: "Corbel" },
  { family: "Times New Roman" },
  { family: "Courier New" },
  { family: "Consolas" },
  { family: "Georgia" },
  { family: "Verdana" },
  { family: "Tahoma" },
  { family: "Trebuchet MS" },
  { family: "Segoe UI" },
  { family: "Segoe Print" },
  { family: "Segoe Script" },
  { family: "Helvetica" },
  { family: "Franklin Gothic Medium" },
  { family: "Garamond" },
  { family: "Palatino Linotype" },
  { family: "Book Antiqua" },
  { family: "Bookman Old Style" },
  { family: "Century" },
  { family: "Century Gothic" },
  { family: "Century Schoolbook" },
  { family: "Lucida Sans Unicode" },
  { family: "Lucida Console" },
  { family: "Arial Black" },
  { family: "Comic Sans MS" },
  { family: "Impact" },
];

export const CELL_FONT_FAMILY_PRESETS = FONT_FAMILIES.map(({ family }) => family);

function findFontFamily(input: string) {
  const name = input.trim().toLowerCase();
  return FONT_FAMILIES.find(
    ({ family, chinese }) => family.toLowerCase() === name || chinese?.toLowerCase() === name,
  );
}

export function resolveFontFamilyName(input: string): string {
  return findFontFamily(input)?.family ?? input.trim();
}

export function getFontFamilyLabel(family: string, locale: string): string {
  const entry = findFontFamily(family);
  return (locale.startsWith("zh") ? entry?.chinese : undefined) ?? entry?.family ?? family;
}

export function createFontFamilyOptions(locale: string, additional: readonly string[] = []) {
  const extras = new Map<string, string>();
  for (const value of additional) {
    const family = value.trim();
    if (!family) continue;
    const key = resolveFontFamilyName(family).toLowerCase();
    if (!extras.has(key)) extras.set(key, family);
  }
  const families = new Map(
    CELL_FONT_FAMILY_PRESETS.map((family) => {
      const key = family.toLowerCase();
      return [key, extras.get(key) ?? family];
    }),
  );
  for (const [key, value] of extras) {
    if (!families.has(key)) families.set(key, value);
  }
  return [...families.values()].map((value) => ({
    value,
    label: getFontFamilyLabel(value, locale),
  }));
}

export const CELL_FONT_SIZE_PRESETS = [
  8, 9, 10, 11, 12, 13, 14, 16, 18, 20, 22, 24, 28, 32, 36, 48, 72,
] as const;
