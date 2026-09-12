import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

type CellSnapshot = {
  address: { row: number; column: number };
  content: { kind: "literal"; value: string | number };
  style?: Record<string, unknown>;
};

/**
 * Produces the shared 100k-cell fixture used by the DOM and Canvas browser
 * benchmarks.  It deliberately includes formatting, borders, a merge and
 * frozen panes, so a result cannot be attributed to an empty-grid fast path.
 */
function createFixture(): object {
  const rows = 500;
  const columns = 200;
  const cells: CellSnapshot[] = [];
  const thinBorder = { style: "thin", color: "#94a3b8" };

  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const index = row * columns + column;
      const cell: CellSnapshot = {
        address: { row, column },
        content: { kind: "literal", value: row === 0 ? `Column ${column + 1}` : index },
      };

      if (row === 0) {
        cell.style = {
          bold: true,
          fillColor: "#dbeafe",
          horizontalAlign: "center",
          borderBottom: { style: "medium", color: "#2563eb" },
        };
      } else if (index % 17 === 0) {
        cell.style = {
          fillColor: index % 34 === 0 ? "#f8fafc" : "#fef3c7",
          textColor: "#1e293b",
          borderTop: thinBorder,
          borderRight: thinBorder,
          numberFormat: { kind: "number", fractionDigits: 0, useGrouping: true },
        };
      } else if (index % 29 === 0) {
        cell.style = { wrapText: true, borderLeft: thinBorder, borderBottom: thinBorder };
      }
      cells.push(cell);
    }
  }

  return {
    version: 7,
    dateSystem: "1900",
    id: "sheet-canvas-benchmark",
    activeSheetId: "benchmark-sheet",
    sheets: [
      {
        id: "benchmark-sheet",
        name: "100k cells",
        properties: { pinned: false, hidden: false, protected: false },
        cells,
        rowHeights: [{ index: 0, size: 28 }],
        columnWidths: [{ index: 0, size: 128 }],
        freezePanes: { rows: 1, columns: 1 },
        filter: null,
        mergedCells: [{ start: { row: 2, column: 2 }, end: { row: 3, column: 4 } }],
        floatingImages: [],
      },
    ],
  };
}

async function main(): Promise<void> {
  const requestedRoot = process.argv.find((argument) => argument.startsWith("--workspace-root="));
  const workspaceRoot = requestedRoot
    ? resolve(requestedRoot.slice("--workspace-root=".length))
    : resolve(dirname(fileURLToPath(import.meta.url)), "../..");
  const outputPath = resolve(workspaceRoot, "output/playwright/sheet-canvas-fixture.json");
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, JSON.stringify(createFixture()));
  process.stdout.write(`${outputPath}\n`);
}

void main();
