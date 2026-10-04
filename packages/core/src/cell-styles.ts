import {
  createClearCellStylePatch,
  normalizeCellStylePatch,
  type CellStyle,
  type CellStylePatch,
} from "./style.js";
import {
  DEFAULT_WORKBOOK_THEME,
  resolveThemeFontFamily,
  type WorkbookTheme,
} from "./workbook-theme.js";

/** The format groups which Excel exposes in the Style dialog. */
export type CellStyleInclude = "number" | "alignment" | "font" | "border" | "fill";

export const CELL_STYLE_INCLUDES = ["number", "alignment", "font", "border", "fill"] as const;

const INCLUDE_KEYS: Record<CellStyleInclude, readonly (keyof CellStyle)[]> = {
  number: ["numberFormat"],
  alignment: [
    "horizontalAlign",
    "verticalAlign",
    "indent",
    "shrinkToFit",
    "textDirection",
    "textRotation",
    "wrapText",
  ],
  font: [
    "fontFamily",
    "fontTheme",
    "fontSize",
    "bold",
    "italic",
    "underline",
    "strikethrough",
    "fontScript",
    "textColor",
    "textColorTheme",
  ],
  border: [
    "borderTop",
    "borderRight",
    "borderBottom",
    "borderLeft",
    "borderDiagonalUp",
    "borderDiagonalDown",
  ],
  fill: ["fillColor", "fillColorTheme", "fillPattern", "fillPatternColor", "fillGradient"],
};

/** Groups used by the Cell Styles gallery. Names are localized by the UI from stable IDs. */
export type CellStyleCategory =
  | "goodBadNeutral"
  | "dataModel"
  | "titles"
  | "theme"
  | "number"
  | "custom";

export type CellStyleDefinition = {
  id: string;
  name: string;
  category: CellStyleCategory;
  style: CellStylePatch;
  /** Selected format groups in the Style dialog. Omitted means all groups for legacy definitions. */
  includes?: CellStyleInclude[];
  /** WPS/XLSX builtin style identifier when one is available. */
  builtinId?: number;
};

export function normalizeCellStyleIncludes(
  includes: readonly CellStyleInclude[] | undefined,
): CellStyleInclude[] {
  if (includes === undefined) return [...CELL_STYLE_INCLUDES];
  if (!Array.isArray(includes)) throw new TypeError("Cell style includes must be an array.");
  const seen = new Set<CellStyleInclude>();
  for (const include of includes) {
    if (!CELL_STYLE_INCLUDES.includes(include))
      throw new TypeError("Cell style include is invalid.");
    if (seen.has(include)) throw new TypeError("Cell style includes must be unique.");
    seen.add(include);
  }
  return CELL_STYLE_INCLUDES.filter((include) => seen.has(include));
}

/** Returns the format groups touched by a patch. */
export function getCellStylePatchIncludes(patch: CellStylePatch): CellStyleInclude[] {
  const normalized = normalizeCellStylePatch(patch);
  return CELL_STYLE_INCLUDES.filter((include) =>
    INCLUDE_KEYS[include].some((key) => key in normalized),
  );
}

/** Copies only the selected format groups, clearing old values in those groups first. */
export function applyCellStyleIncludes(
  base: Readonly<CellStyle> | undefined,
  patch: CellStylePatch,
  includes: readonly CellStyleInclude[],
  preservedKeys: readonly (keyof CellStyle)[] = [],
): CellStylePatch {
  const next: CellStylePatch = base ? { ...base } : {};
  const mutable = next as Record<string, unknown>;
  const normalized = normalizeCellStylePatch(patch);
  const preserved = new Set<keyof CellStyle>(preservedKeys);
  for (const include of normalizeCellStyleIncludes(includes)) {
    for (const key of INCLUDE_KEYS[include]) {
      if (preserved.has(key)) continue;
      if (key in normalized) mutable[key] = normalized[key];
      else delete mutable[key];
    }
  }
  return next;
}

const CATEGORIES = new Set<CellStyleCategory>([
  "goodBadNeutral",
  "dataModel",
  "titles",
  "theme",
  "number",
  "custom",
]);

function requireIdentifier(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new TypeError(`Cell style ${field} must be a non-empty string.`);
  }
  return value;
}

export function normalizeCellStyleDefinition(value: CellStyleDefinition): CellStyleDefinition {
  if (!value || typeof value !== "object")
    throw new TypeError("Cell style definition must be an object.");
  const id = requireIdentifier(value.id, "id");
  const name = requireIdentifier(value.name, "name").trim();
  if (!CATEGORIES.has(value.category)) throw new TypeError("Cell style category is invalid.");
  if (!value.style || typeof value.style !== "object" || Array.isArray(value.style)) {
    throw new TypeError("Cell style definition style must be an object.");
  }
  if (
    value.builtinId !== undefined &&
    (!Number.isSafeInteger(value.builtinId) || value.builtinId < 0)
  ) {
    throw new TypeError("Cell style builtinId must be a non-negative safe integer.");
  }
  return {
    id,
    name,
    category: value.category,
    style: normalizeCellStylePatch(value.style),
    ...(value.includes === undefined
      ? {}
      : { includes: normalizeCellStyleIncludes(value.includes) }),
    ...(value.builtinId !== undefined ? { builtinId: value.builtinId } : {}),
  };
}

export function cloneCellStyleDefinition(definition: CellStyleDefinition): CellStyleDefinition {
  return normalizeCellStyleDefinition(definition);
}

export function normalizeWorkbookCellStyles(
  definitions: readonly CellStyleDefinition[],
): CellStyleDefinition[] {
  if (!Array.isArray(definitions)) throw new TypeError("Workbook cell styles must be an array.");
  const normalized = definitions.map(normalizeCellStyleDefinition);
  const ids = new Set<string>();
  const names = new Set<string>();
  for (const definition of normalized) {
    if (definition.category !== "custom")
      throw new TypeError("Workbook cell styles must use the custom category.");
    if (definition.name.toLocaleLowerCase() === "normal")
      throw new TypeError("Normal is a reserved builtin cell style name.");
    if (ids.has(definition.id)) throw new TypeError("Cell style IDs must be unique.");
    if (names.has(definition.name.toLocaleLowerCase()))
      throw new TypeError("Cell style names must be unique.");
    ids.add(definition.id);
    names.add(definition.name.toLocaleLowerCase());
  }
  return normalized;
}

/** Materializes a gallery entry into a direct cell-format patch. */
export function getCellStyleDefinitionPatch(definition: CellStyleDefinition): CellStylePatch {
  const normalized = normalizeCellStyleDefinition(definition);
  return normalized.category !== "custom" && normalized.builtinId === 0
    ? createClearCellStylePatch()
    : normalized.style;
}

function builtin(
  id: string,
  name: string,
  category: Exclude<CellStyleCategory, "custom">,
  style: CellStylePatch,
  builtinId?: number,
): CellStyleDefinition {
  return normalizeCellStyleDefinition({
    id,
    name,
    category,
    style,
    ...(builtinId !== undefined ? { builtinId } : {}),
  });
}

const THEME_COLORS = [
  ["blue", "#4f81bd", "#dce6f1", "#b8cce4", "#95b3d7"],
  ["red", "#c0504d", "#f2dcdb", "#e6b8b7", "#da9694"],
  ["green", "#9bbb59", "#ebf1de", "#d7e4bc", "#c4d79b"],
  ["purple", "#8064a2", "#e4dfec", "#ccc1d9", "#b2a2c7"],
  ["cyan", "#4bacc6", "#dbeef3", "#b7dde8", "#92cddc"],
  ["orange", "#f79646", "#fde9d9", "#fbd5b5", "#fac090"],
] as const;

/** Builtins mirror the WPS/Excel gallery at a semantic level; IDs are the stable product contract. */
export function createBuiltinCellStyles(
  theme: WorkbookTheme = DEFAULT_WORKBOOK_THEME,
): CellStyleDefinition[] {
  const frame = { style: "thin", color: "#808080" } as const;
  const framed = { borderTop: frame, borderRight: frame, borderBottom: frame, borderLeft: frame };
  // Named title styles stay bound to the theme; direct fontFamily values remain user overrides.
  const headingFont = {
    fontFamily: resolveThemeFontFamily(theme, "major"),
    fontTheme: "major" as const,
  };
  const styles: CellStyleDefinition[] = [
    builtin(
      "normal",
      "Normal",
      "goodBadNeutral",
      { fontFamily: resolveThemeFontFamily(theme, "minor"), fontTheme: "minor" },
      0,
    ),
    builtin("good", "Good", "goodBadNeutral", { textColor: "#006100", fillColor: "#c6efce" }),
    builtin("bad", "Bad", "goodBadNeutral", { textColor: "#9c0006", fillColor: "#ffc7ce" }),
    builtin("neutral", "Neutral", "goodBadNeutral", { textColor: "#9c6500", fillColor: "#ffeb9c" }),
    builtin("hyperlink", "Hyperlink", "dataModel", { textColor: "#0000ff", underline: true }),
    builtin("followed-hyperlink", "Followed Hyperlink", "dataModel", {
      textColor: "#800080",
      underline: true,
    }),
    builtin("note", "Note", "dataModel", { ...framed, fillColor: "#ffffcc" }),
    builtin("warning-text", "Warning Text", "dataModel", { textColor: "#ff0000" }),
    builtin("input", "Input", "dataModel", {
      ...framed,
      textColor: "#7f3f00",
      fillColor: "#ffcc99",
    }),
    builtin("output", "Output", "dataModel", { ...framed, bold: true, fillColor: "#f2f2f2" }),
    builtin("calculation", "Calculation", "dataModel", {
      ...framed,
      bold: true,
      textColor: "#ff6600",
      fillColor: "#f2f2f2",
    }),
    builtin("check-cell", "Check Cell", "dataModel", {
      ...framed,
      textColor: "#ffffff",
      fillColor: "#a5a5a5",
      bold: true,
    }),
    builtin("linked-cell", "Linked Cell", "dataModel", { textColor: "#ff6600", underline: true }),
    builtin("explanatory-text", "Explanatory Text", "dataModel", {
      italic: true,
      textColor: "#7f7f7f",
    }),
    builtin("title", "Title", "titles", {
      ...headingFont,
      fontSize: 20,
      bold: true,
      textColor: theme.accentColors[0],
      textColorTheme: { slot: "accent1" },
    }),
    builtin("heading-1", "Heading 1", "titles", {
      fontSize: 16,
      bold: true,
      ...headingFont,
      textColor: theme.accentColors[0],
      textColorTheme: { slot: "accent1" },
      borderBottom: { style: "thin", color: theme.accentColors[0] },
    }),
    builtin("heading-2", "Heading 2", "titles", {
      fontSize: 14,
      bold: true,
      ...headingFont,
      textColor: theme.accentColors[0],
      textColorTheme: { slot: "accent1" },
      borderBottom: { style: "thin", color: theme.accentColors[1] },
    }),
    builtin("heading-3", "Heading 3", "titles", {
      fontSize: 12,
      bold: true,
      ...headingFont,
      textColor: theme.accentColors[0],
      textColorTheme: { slot: "accent1" },
      borderBottom: { style: "thin", color: theme.accentColors[2] },
    }),
    builtin("heading-4", "Heading 4", "titles", {
      ...headingFont,
      bold: true,
      textColor: theme.accentColors[0],
      textColorTheme: { slot: "accent1" },
    }),
    builtin("total", "Total", "titles", {
      bold: true,
      ...headingFont,
      borderTop: { style: "thin", color: theme.accentColors[0] },
      borderBottom: { style: "double", color: theme.accentColors[0] },
    }),
  ];
  for (const [index, [colorId, fallback, subtle, light, accent]] of THEME_COLORS.entries()) {
    const color = theme.accentColors[index]! ?? fallback;
    styles.push(
      builtin(`theme-${colorId}-strong`, `${colorId} Strong`, "theme", {
        bold: true,
        textColor: "#ffffff",
        fillColor: color,
      }),
      builtin(`theme-${colorId}-subtle`, `${colorId} 20% Accent`, "theme", {
        textColor: "#000000",
        fillColor: subtle,
      }),
      builtin(`theme-${colorId}-light`, `${colorId} 40% Accent`, "theme", {
        textColor: "#000000",
        fillColor: light,
      }),
      builtin(`theme-${colorId}-accent`, `${colorId} 60% Accent`, "theme", {
        bold: true,
        textColor: "#ffffff",
        fillColor: accent,
      }),
    );
  }
  styles.push(
    builtin("number-comma", "Comma", "number", {
      numberFormat: { kind: "number", fractionDigits: 2, useGrouping: true },
    }),
    builtin("number-currency", "Currency", "number", {
      numberFormat: { kind: "currency", currency: "USD", currencySymbol: "$", fractionDigits: 2 },
    }),
    builtin("number-percent", "Percent", "number", {
      numberFormat: { kind: "percent", fractionDigits: 0 },
    }),
    builtin("number-comma-0", "Comma [0]", "number", {
      numberFormat: { kind: "number", fractionDigits: 0, useGrouping: true },
    }),
    builtin("number-currency-0", "Currency [0]", "number", {
      numberFormat: { kind: "currency", currency: "USD", currencySymbol: "$", fractionDigits: 0 },
    }),
  );
  return styles;
}
