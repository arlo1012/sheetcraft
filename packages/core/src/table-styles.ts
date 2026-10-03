import { mergeCellStyle, type CellBorder, type CellStyle, type CellStylePatch } from "./style.js";
import type { CellAddress, Sheet, SheetTable } from "./workbook.js";

export const TABLE_STYLE_ELEMENTS = [
  "wholeTable",
  "firstColumnStripe",
  "secondColumnStripe",
  "firstRowStripe",
  "secondRowStripe",
  "lastColumn",
  "firstColumn",
  "headerRow",
  "totalRow",
  "firstHeaderCell",
  "lastHeaderCell",
  "firstTotalCell",
  "lastTotalCell",
] as const;

export type TableStyleElement = (typeof TABLE_STYLE_ELEMENTS)[number];
export type TableStyleElementFormat = {
  style: CellStylePatch;
  stripeSize?: number;
  innerHorizontal?: CellBorder | null;
  innerVertical?: CellBorder | null;
};
export type TableStyleDefinition = {
  id: string;
  name: string;
  category: "light" | "medium" | "dark" | "custom";
  accentColor?: string;
  elements: Partial<Record<TableStyleElement, TableStyleElementFormat>>;
};

/** Colored first-column presets enable emphasis when selected; bold-only elements remain optional. */
export function hasHighlightedFirstColumn(style: TableStyleDefinition): boolean {
  return Boolean(style.elements.firstColumn?.style.fillColor);
}

/** Produces a storage-safe plain copy, including nested element formatting. */
export function cloneTableStyleDefinition(style: TableStyleDefinition): TableStyleDefinition {
  return JSON.parse(JSON.stringify(style)) as TableStyleDefinition;
}

function blend(color: string, amount: number): string {
  const value = color.slice(1);
  const channels = [0, 2, 4].map((offset) => parseInt(value.slice(offset, offset + 2), 16));
  return `#${channels
    .map((channel) =>
      Math.round(channel + (255 - channel) * amount)
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`;
}

function shade(color: string, amount: number): string {
  const value = color.slice(1);
  const channels = [0, 2, 4].map((offset) => parseInt(value.slice(offset, offset + 2), 16));
  return `#${channels
    .map((channel) =>
      Math.round(channel * (1 - amount))
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`;
}
/** Excel-inspired More gallery: 21 light, 28 medium, and 11 dark presets. */
export function createBuiltinTableStyles(accentColor = "#4f81bd"): TableStyleDefinition[] {
  const colors = ["#000000", accentColor, "#c0504d", "#9bbb59", "#8064a2", "#4bacc6", "#f79646"];
  const styles: TableStyleDefinition[] = [];
  const border = (color: string) => ({ style: "thin" as const, color });
  const add = (
    category: TableStyleDefinition["category"],
    index: number,
    color: string,
    elements: TableStyleDefinition["elements"],
  ) =>
    styles.push({
      id: `table-${category}-${index}`,
      name: `${category[0]!.toUpperCase()}${category.slice(1)} ${index}`,
      category,
      accentColor: color,
      elements,
    });

  for (let family = 0; family < 3; family += 1)
    for (const [colorIndex, color] of colors.entries()) {
      const index = family * 7 + colorIndex + 1;
      add(
        "light",
        index,
        color,
        family === 0
          ? {
              wholeTable: { style: {}, innerHorizontal: border(blend(color, 0.72)) },
              headerRow: {
                style: {
                  textColor: color,
                  bold: true,
                  borderBottom: border(color),
                },
              },
              firstRowStripe: { style: { fillColor: blend(color, 0.9) } },
              totalRow: { style: { bold: true, borderTop: border(color) } },
            }
          : family === 1
            ? {
                wholeTable: { style: { borderBottom: border(blend(color, 0.35)) } },
                headerRow: { style: { fillColor: color, textColor: "#ffffff", bold: true } },
                firstRowStripe: { style: { fillColor: blend(color, 0.84) } },
                firstColumn: { style: { bold: true } },
              }
            : {
                wholeTable: {
                  style: {
                    borderTop: border(color),
                    borderBottom: border(color),
                    borderLeft: border(color),
                    borderRight: border(color),
                  },
                  innerHorizontal: border(blend(color, 0.62)),
                  innerVertical: border(blend(color, 0.62)),
                },
                headerRow: {
                  style: { fillColor: blend(color, 0.74), textColor: color, bold: true },
                },
                totalRow: {
                  style: { fillColor: blend(color, 0.84), bold: true, borderTop: border(color) },
                },
              },
      );
    }
  for (let family = 0; family < 4; family += 1)
    for (const [colorIndex, color] of colors.entries()) {
      const index = family * 7 + colorIndex + 1;
      add(
        "medium",
        index,
        color,
        family === 0
          ? {
              wholeTable: { style: {}, innerHorizontal: border(blend(color, 0.5)) },
              headerRow: { style: { fillColor: color, textColor: "#ffffff", bold: true } },
              firstRowStripe: { style: { fillColor: blend(color, 0.67) } },
              totalRow: { style: { bold: true, borderTop: border(color) } },
            }
          : family === 1
            ? {
                wholeTable: {
                  style: {
                    fillColor: blend(color, 0.94),
                    borderTop: border(color),
                    borderBottom: border(color),
                  },
                  innerHorizontal: border(blend(color, 0.76)),
                  innerVertical: border(blend(color, 0.76)),
                },
                headerRow: {
                  style: {
                    fillColor: blend(color, 0.18),
                    textColor: "#ffffff",
                    bold: true,
                    borderBottom: border(color),
                  },
                  innerVertical: border("#ffffff"),
                },
                firstRowStripe: { style: { fillColor: blend(color, 0.9) } },
                firstColumn: { style: { bold: true } },
                lastColumn: { style: { bold: true } },
              }
            : family === 2
              ? {
                  wholeTable: {
                    style: {
                      fillColor: blend(color, 0.9),
                      textColor: "#20242c",
                      borderTop: border(color),
                      borderBottom: border(color),
                    },
                    innerHorizontal: border(blend(color, 0.7)),
                  },
                  headerRow: {
                    style: {
                      fillColor: "#20242c",
                      textColor: "#ffffff",
                      bold: true,
                      borderBottom: border(color),
                    },
                  },
                  totalRow: {
                    style: { fillColor: blend(color, 0.78), bold: true, borderTop: border(color) },
                  },
                }
              : {
                  wholeTable: {
                    style: {
                      fillColor: blend(color, 0.72),
                      borderLeft: border(color),
                      borderRight: border(color),
                    },
                    innerHorizontal: border(blend(color, 0.5)),
                    innerVertical: border(blend(color, 0.5)),
                  },
                  headerRow: {
                    style: { fillColor: blend(color, 0.08), textColor: "#ffffff", bold: true },
                  },
                  firstColumn: { style: { fillColor: blend(color, 0.55), bold: true } },
                  totalRow: { style: { borderTop: border(color), bold: true } },
                },
      );
    }
  for (const color of colors)
    add("dark", styles.filter((style) => style.category === "dark").length + 1, color, {
      wholeTable: {
        style: { fillColor: shade(color, 0.38), textColor: "#ffffff" },
        innerHorizontal: border(shade(color, 0.5)),
        innerVertical: border(shade(color, 0.5)),
      },
      headerRow: {
        style: {
          fillColor: shade(color, 0.52),
          textColor: "#ffffff",
          bold: true,
          borderBottom: border(color),
        },
      },
      totalRow: {
        style: {
          fillColor: shade(color, 0.46),
          textColor: "#ffffff",
          bold: true,
          borderTop: border(color),
        },
      },
      firstColumn: { style: { bold: true } },
    });
  for (const color of colors.slice(1, 5))
    add("dark", styles.filter((style) => style.category === "dark").length + 1, color, {
      wholeTable: {
        style: {
          fillColor: blend(color, 0.86),
          textColor: "#20242c",
          borderTop: border(color),
          borderBottom: border(color),
        },
        innerHorizontal: border(blend(color, 0.55)),
      },
      headerRow: {
        style: {
          fillColor: "#20242c",
          textColor: "#ffffff",
          bold: true,
          borderBottom: border(color),
        },
      },
      firstRowStripe: { style: { fillColor: blend(color, 0.78) } },
      totalRow: {
        style: {
          fillColor: blend(color, 0.72),
          textColor: "#20242c",
          bold: true,
          borderTop: border(color),
        },
      },
      lastColumn: { style: { fillColor: blend(color, 0.72), bold: true } },
    });
  return styles;
}

/** WPS-inspired quick gallery, recolored as a coherent family for the selected theme. */
export function createThemedTableStyles(accentColor = "#4f81bd"): TableStyleDefinition[] {
  const styles: TableStyleDefinition[] = [];
  const border = (amount: number) => ({
    style: "thin" as const,
    color: blend(accentColor, amount),
  });
  const add = (
    category: "light" | "medium" | "dark",
    index: number,
    elements: TableStyleDefinition["elements"],
  ) =>
    styles.push({
      id: `table-wps-${category}-${index}`,
      name: `WPS ${category[0]!.toUpperCase()}${category.slice(1)} ${index}`,
      category,
      accentColor,
      elements,
    });
  const lightRecipes = [
    {
      wholeTable: { style: {} },
      headerRow: { style: { textColor: accentColor, bold: true, borderBottom: border(0) } },
      firstRowStripe: { style: { fillColor: blend(accentColor, 0.9) } },
    },
    {
      wholeTable: { style: {}, innerHorizontal: border(0.7) },
      headerRow: { style: { fillColor: blend(accentColor, 0.82), bold: true } },
      totalRow: { style: { borderTop: border(0), bold: true } },
    },
    {
      wholeTable: { style: { borderTop: border(0), borderBottom: border(0) } },
      headerRow: { style: { textColor: accentColor, bold: true } },
      firstColumn: { style: { bold: true } },
    },
    {
      wholeTable: { style: { fillColor: blend(accentColor, 0.94) }, innerVertical: border(0.78) },
      headerRow: { style: { fillColor: blend(accentColor, 0.72), bold: true } },
      lastColumn: { style: { bold: true } },
    },
    {
      wholeTable: { style: {}, innerHorizontal: border(0.75), innerVertical: border(0.75) },
      headerRow: {
        style: { fillColor: blend(accentColor, 0.86), textColor: accentColor, bold: true },
      },
    },
    {
      wholeTable: { style: { borderLeft: border(0), borderRight: border(0) } },
      headerRow: { style: { fillColor: blend(accentColor, 0.78), bold: true } },
      totalRow: { style: { fillColor: blend(accentColor, 0.9), bold: true } },
    },
    {
      wholeTable: { style: {} },
      headerRow: { style: { textColor: accentColor, bold: true } },
      firstColumnStripe: { style: { fillColor: blend(accentColor, 0.9) } },
    },
    {
      wholeTable: { style: { fillColor: blend(accentColor, 0.96) } },
      headerRow: { style: { fillColor: blend(accentColor, 0.68), bold: true } },
      firstRowStripe: { style: { fillColor: blend(accentColor, 0.88) } },
    },
  ];
  lightRecipes.forEach((elements, index) => add("light", index + 1, elements));
  for (let index = 0; index < 16; index += 1)
    add("medium", index + 1, {
      wholeTable: {
        style:
          index % 4 === 2
            ? { fillColor: blend(accentColor, 0.54 + index * 0.012) }
            : { borderTop: border(index * 0.025), borderBottom: border(index * 0.025) },
        ...(index % 3 === 0
          ? { innerHorizontal: border(0.5 + index * 0.012) }
          : { innerVertical: border(0.5 + index * 0.012) }),
      },
      headerRow: {
        style: {
          fillColor:
            index % 2 ? blend(accentColor, 0.1 + index * 0.018) : blend(accentColor, index * 0.018),
          textColor: "#ffffff",
          bold: true,
        },
        ...(index % 4 === 1 ? { innerVertical: border(0.92) } : {}),
      },
      firstRowStripe: {
        style: { fillColor: blend(accentColor, 0.7 + index * 0.012) },
        stripeSize: index < 8 ? 1 : 2,
      },
      totalRow: {
        style: {
          fillColor: blend(accentColor, 0.36 + index * 0.018),
          bold: true,
          borderTop: border(index * 0.025),
        },
      },
      ...(index === 2 || index === 3
        ? {
            firstColumn: {
              style: { fillColor: accentColor, textColor: "#ffffff", bold: true },
            },
            firstHeaderCell: {
              style: { fillColor: accentColor, textColor: "#ffffff", bold: true },
            },
            firstTotalCell: {
              style: { fillColor: accentColor, textColor: "#ffffff", bold: true },
            },
          }
        : index % 4 === 0
          ? { firstColumn: { style: { bold: true } } }
          : {}),
      ...(index % 4 === 3 ? { lastColumn: { style: { bold: true } } } : {}),
    });
  for (let index = 0; index < 8; index += 1)
    add("dark", index + 1, {
      wholeTable: {
        style: {
          fillColor: shade(accentColor, 0.36 + index * 0.012),
          textColor: "#ffffff",
          ...(index % 4 === 2 ? { borderTop: border(0.7), borderBottom: border(0.7) } : {}),
        },
        innerHorizontal: { style: "thin", color: shade(accentColor, 0.5 + index * 0.01) },
        ...(index % 3 === 0
          ? { innerVertical: { style: "thin", color: shade(accentColor, 0.5 + index * 0.01) } }
          : {}),
      },
      headerRow: {
        style: {
          fillColor: shade(accentColor, 0.5 + index * 0.02),
          textColor: "#ffffff",
          bold: true,
        },
      },
      firstRowStripe: {
        style: { fillColor: blend(accentColor, 0.24 + index * 0.035) },
        stripeSize: (index % 3) + 1,
      },
      totalRow: {
        style: {
          fillColor: shade(accentColor, 0.42 + index * 0.02),
          textColor: "#ffffff",
          bold: true,
        },
      },
      ...(index % 2
        ? { lastColumn: { style: { bold: true } } }
        : { firstColumn: { style: { bold: true } } }),
    });
  return styles;
}

export function getTableAtAddress(sheet: Sheet, address: CellAddress): SheetTable | undefined {
  return (sheet.tables ?? []).find(
    (table) =>
      address.row >= table.range.start.row &&
      address.row <= table.range.end.row &&
      address.column >= table.range.start.column &&
      address.column <= table.range.end.column,
  );
}

type ElementRegion = { start: CellAddress; end: CellAddress };

/**
 * Resolves an element's border geometry before it is layered with the styles
 * below it. This keeps an outer border local to its element region while
 * allowing later elements such as the header and total rows to take priority.
 */
function resolveElementPatch(
  element: TableStyleElementFormat | undefined,
  address: CellAddress,
  region: ElementRegion,
): CellStylePatch | undefined {
  if (!element) return undefined;
  const patch = { ...element.style };
  if (address.row !== region.start.row) delete patch.borderTop;
  if (address.row !== region.end.row) delete patch.borderBottom;
  if (address.column !== region.start.column) delete patch.borderLeft;
  if (address.column !== region.end.column) delete patch.borderRight;
  if (element.innerHorizontal !== undefined && address.row > region.start.row)
    patch.borderTop = element.innerHorizontal ? { ...element.innerHorizontal } : null;
  if (element.innerVertical !== undefined && address.column > region.start.column)
    patch.borderLeft = element.innerVertical ? { ...element.innerVertical } : null;
  return patch;
}

function apply(
  style: CellStyle | undefined,
  element: TableStyleElementFormat | undefined,
  address: CellAddress,
  region: ElementRegion,
): CellStyle | undefined {
  const patch = resolveElementPatch(element, address, region);
  return patch ? mergeCellStyle(style, patch) : style;
}

/** Returns the declarative table layer. Direct cell formatting is applied by the caller afterwards. */
export function resolveTableCellStyle(
  table: SheetTable,
  address: CellAddress,
  headerRows = table.headerRow ? 1 : 0,
): CellStyle | undefined {
  const { range, style } = table;
  if (
    address.row < range.start.row ||
    address.row > range.end.row ||
    address.column < range.start.column ||
    address.column > range.end.column
  )
    return undefined;
  let result = apply(undefined, style.elements.wholeTable, address, range);
  const headerEnd = range.start.row + headerRows - 1;
  const isHeader = headerRows > 0 && address.row <= headerEnd;
  const isTotal = table.totalRow && address.row === range.end.row;
  const firstDataRow = range.start.row + headerRows;
  const lastDataRow = range.end.row - (table.totalRow ? 1 : 0);
  if (
    !isHeader &&
    !isTotal &&
    address.row >= firstDataRow &&
    address.row <= lastDataRow &&
    table.bandedRows
  ) {
    const firstSize = style.elements.firstRowStripe?.stripeSize ?? 1;
    const secondSize = style.elements.secondRowStripe?.stripeSize ?? firstSize;
    const offset = (address.row - firstDataRow) % (firstSize + secondSize);
    const stripe =
      offset < firstSize ? style.elements.firstRowStripe : style.elements.secondRowStripe;
    result = apply(result, stripe, address, {
      start: { row: address.row, column: range.start.column },
      end: { row: address.row, column: range.end.column },
    });
  }
  if (table.bandedColumns) {
    const firstSize = style.elements.firstColumnStripe?.stripeSize ?? 1;
    const secondSize = style.elements.secondColumnStripe?.stripeSize ?? firstSize;
    const offset = (address.column - range.start.column) % (firstSize + secondSize);
    const stripe =
      offset < firstSize ? style.elements.firstColumnStripe : style.elements.secondColumnStripe;
    result = apply(result, stripe, address, {
      start: { row: range.start.row, column: address.column },
      end: { row: range.end.row, column: address.column },
    });
  }
  if (table.firstColumn && address.column === range.start.column)
    result = apply(result, style.elements.firstColumn, address, {
      start: { row: range.start.row, column: range.start.column },
      end: { row: range.end.row, column: range.start.column },
    });
  if (table.lastColumn && address.column === range.end.column)
    result = apply(result, style.elements.lastColumn, address, {
      start: { row: range.start.row, column: range.end.column },
      end: { row: range.end.row, column: range.end.column },
    });
  if (isHeader) {
    const header = {
      start: { ...range.start },
      end: { row: headerEnd, column: range.end.column },
    };
    result = apply(result, style.elements.headerRow, address, header);
    if (address.column === range.start.column)
      result = apply(result, style.elements.firstHeaderCell, address, {
        start: { ...range.start },
        end: { ...range.start },
      });
    if (address.column === range.end.column)
      result = apply(result, style.elements.lastHeaderCell, address, {
        start: { row: range.start.row, column: range.end.column },
        end: { row: range.start.row, column: range.end.column },
      });
  }
  if (isTotal) {
    const total = {
      start: { row: range.end.row, column: range.start.column },
      end: { ...range.end },
    };
    result = apply(result, style.elements.totalRow, address, total);
    if (address.column === range.start.column)
      result = apply(result, style.elements.firstTotalCell, address, {
        start: { row: range.end.row, column: range.start.column },
        end: { row: range.end.row, column: range.start.column },
      });
    if (address.column === range.end.column)
      result = apply(result, style.elements.lastTotalCell, address, {
        start: { ...range.end },
        end: { ...range.end },
      });
  }
  return result;
}
