import { parseCellAddress } from "@sheetcraft/core/coordinates";
import { readNativeWorkbook } from "./reader.js";
import { writeNativeWorkbook } from "./writer.js";
import { assertNativeWorksheetName } from "./writer-names.js";
import type {
  NativeCell,
  NativeColumn,
  NativeImage,
  NativeImageAnchor,
  NativeRow,
  NativeSheetData,
  NativeWorkbookData,
} from "./model.js";

/** Minimal product-owned interchange facade; not an implementation of ExcelJS's public API. */
class ExchangeRow {
  constructor(readonly data: NativeRow) {}
  get height() {
    return this.data.height;
  }
  set height(value: number | undefined) {
    this.data.height = value;
  }
  get hidden() {
    return this.data.hidden;
  }
  set hidden(value: boolean | undefined) {
    this.data.hidden = value;
  }
  eachCell(
    options: { includeEmpty: boolean },
    callback: (cell: NativeCell, column: number) => void,
  ): void {
    for (const [column, cell] of [...this.data.cells].sort(([a], [b]) => a - b)) {
      if (options.includeEmpty || (cell.value !== null && cell.value !== undefined))
        callback(cell, column);
    }
  }
}

class ExchangeWorksheet {
  constructor(readonly data: NativeSheetData) {}
  get name() {
    return this.data.name;
  }
  get properties() {
    return this.data.properties;
  }
  get views() {
    return this.data.views;
  }
  get autoFilter() {
    return this.data.autoFilter;
  }
  get columns(): NativeColumn[] {
    return [...this.data.columns.values()].sort((a, b) => a.number - b.number);
  }
  get model() {
    return {
      merges: this.data.merges,
      rows: [...this.data.rows.values()]
        .sort((a, b) => a.number - b.number)
        .map((row) => ({
          number: row.number,
          height: row.height,
          hidden: row.hidden,
          cells: [...row.cells.values()].map((cell) => ({ address: cell.address })),
        })),
    };
  }
  getRow(index: number): ExchangeRow {
    if (!Number.isInteger(index) || index < 1 || index > 1_048_576)
      throw new RangeError("Invalid XLSX row.");
    let row = this.data.rows.get(index);
    if (!row) {
      row = { number: index, cells: new Map() };
      this.data.rows.set(index, row);
    }
    return new ExchangeRow(row);
  }
  getColumn(index: number): NativeColumn {
    if (!Number.isInteger(index) || index < 1 || index > 16_384)
      throw new RangeError("Invalid XLSX column.");
    let column = this.data.columns.get(index);
    if (!column) {
      column = { number: index };
      this.data.columns.set(index, column);
    }
    return column;
  }
  getCell(reference: string): NativeCell {
    const address = reference.toUpperCase();
    const parsed = parseCellAddress(address);
    if (!parsed || parsed.row >= 1_048_576 || parsed.column >= 16_384)
      throw new RangeError("Invalid XLSX cell address.");
    const row = this.getRow(parsed.row + 1).data;
    let cell = row.cells.get(parsed.column + 1);
    if (!cell) {
      cell = { address, value: null, style: {} };
      row.cells.set(parsed.column + 1, cell);
    }
    return cell;
  }
  eachRow(
    options: { includeEmpty: boolean },
    callback: (row: ExchangeRow, rowNumber: number) => void,
  ): void {
    for (const row of [...this.data.rows.values()].sort((a, b) => a.number - b.number)) {
      if (
        options.includeEmpty ||
        [...row.cells.values()].some((cell) => cell.value !== null && cell.value !== undefined)
      ) {
        callback(new ExchangeRow(row), row.number);
      }
    }
  }
  mergeCells(reference: string): void {
    if (reference.split(":").length !== 2) throw new RangeError("Invalid XLSX merged range.");
    const [first, last] = reference.toUpperCase().split(":");
    const start = first && parseCellAddress(first);
    const end = last && parseCellAddress(last);
    if (
      !start ||
      !end ||
      end.row < start.row ||
      end.column < start.column ||
      end.row >= 1_048_576 ||
      end.column >= 16_384
    ) {
      throw new RangeError("Invalid XLSX merged range.");
    }
    const count = (end.row - start.row + 1) * (end.column - start.column + 1);
    if (count > 200_000)
      throw new RangeError("The XLSX merged range exceeds the sparse cell limit.");
    const anchor = this.getCell(first!);
    // XLSX stores the merge anchor value once. Border/style cells are physical,
    // matching existing supported merge export behavior without duplicating values.
    for (let rowIndex = start.row; rowIndex <= end.row; rowIndex++) {
      const row = this.getRow(rowIndex + 1).data;
      for (let columnIndex = start.column; columnIndex <= end.column; columnIndex++) {
        if (rowIndex === start.row && columnIndex === start.column) continue;
        let label = "";
        let value = columnIndex + 1;
        while (value) {
          const digit = (value - 1) % 26;
          label = String.fromCharCode(65 + digit) + label;
          value = Math.floor((value - 1) / 26);
        }
        const cell = this.getCell(`${label}${rowIndex + 1}`);
        cell.value = null;
        cell.style = anchor.style;
        cell.numFmt = anchor.numFmt;
        row.cells.set(columnIndex + 1, cell);
      }
    }
    this.data.merges.push(reference.toUpperCase());
  }
  addImage(imageId: number, range: NativeImageAnchor): void {
    this.data.images.push({ imageId, range });
  }
}

export class NativeWorkbook {
  private data: NativeWorkbookData = {
    properties: {},
    calcProperties: { fullCalcOnLoad: true },
    sheets: [],
    images: [],
  };
  get properties() {
    return this.data.properties;
  }
  get calcProperties() {
    return this.data.calcProperties;
  }
  get views() {
    return this.data.views;
  }
  get worksheets(): ExchangeWorksheet[] {
    return this.data.sheets.map((sheet) => new ExchangeWorksheet(sheet));
  }
  addWorksheet(name: string, options?: { views?: Record<string, unknown>[] }): ExchangeWorksheet {
    assertNativeWorksheetName(
      name,
      this.data.sheets.map((sheet) => sheet.name),
    );
    const data: NativeSheetData = {
      name,
      properties: {},
      views: options?.views,
      rows: new Map(),
      columns: new Map(),
      merges: [],
      images: [],
    };
    this.data.sheets.push(data);
    return new ExchangeWorksheet(data);
  }
  addImage(image: NativeImage): number {
    this.data.images.push(image);
    return this.data.images.length - 1;
  }
  readonly xlsx = {
    load: async (bytes: Uint8Array): Promise<void> => {
      this.data = readNativeWorkbook(bytes);
    },
    writeBuffer: async (): Promise<Uint8Array> => writeNativeWorkbook(this.data),
  };
}
