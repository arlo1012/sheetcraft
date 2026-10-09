import {
  createWorkbook,
  getActiveSheet,
  getCellValue,
  setCellContent,
  setCellValue,
} from "@sheetcraft/core/workbook";
import { afterEach, describe, expect, test, vi } from "vitest";
import {
  WorkbookFileError,
  downloadWorkbookJson,
  parseWorkbookJson,
  readWorkbookFile,
  readWorkbookBundleFile,
} from "../../../../modules/workbook-persistence/workbookJsonTransfer";
import { serializeWorkbook } from "@sheetcraft/core/serialization";
import { DEFAULT_SHEET_WATERMARK } from "@sheetcraft/core/page-decoration";
import { createMemoryImageAssetStore } from "../../../../modules/image-assets/imageAssetStore";

function createTestWorkbook() {
  const workbook = createWorkbook({ id: "workbook", sheetId: "sheet", sheetName: "Budget" });
  setCellValue(getActiveSheet(workbook), { row: 0, column: 0 }, "January");
  return workbook;
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("workbook JSON transfer", () => {
  test("parses a current workbook snapshot through Core", () => {
    const workbook = createTestWorkbook();

    const parsed = parseWorkbookJson(JSON.stringify(serializeWorkbook(workbook)));

    expect(parsed.id).toBe("workbook");
    expect(getActiveSheet(parsed).name).toBe("Budget");
    expect(getCellValue(getActiveSheet(parsed), { row: 0, column: 0 })).toBe("January");
  });

  test("accepts Core's version 1 workbook snapshot migration", () => {
    const parsed = parseWorkbookJson(
      JSON.stringify({
        version: 1,
        id: "legacy-workbook",
        activeSheetId: "legacy-sheet",
        sheets: [
          {
            id: "legacy-sheet",
            name: "Legacy",
            cells: [{ address: { row: 0, column: 0 }, value: "Imported" }],
            rowHeights: [],
            columnWidths: [],
          },
        ],
      }),
    );

    expect(parsed.id).toBe("legacy-workbook");
    expect(getCellValue(getActiveSheet(parsed), { row: 0, column: 0 })).toBe("Imported");
  });

  test("classifies malformed JSON, invalid snapshots, and file-read failures", async () => {
    expect(() => parseWorkbookJson("{")).toThrow(
      expect.objectContaining({ code: "invalid-json" }) as WorkbookFileError,
    );
    expect(() => parseWorkbookJson(JSON.stringify({ version: 2 }))).toThrow(
      expect.objectContaining({ code: "invalid-snapshot" }) as WorkbookFileError,
    );
    await expect(
      readWorkbookFile({ text: async () => Promise.reject(new Error("denied")) }),
    ).rejects.toMatchObject({
      code: "read-failed",
    });
  });

  test("reads a file without touching persistence", async () => {
    const workbook = createTestWorkbook();
    vi.stubGlobal("indexedDB", undefined);

    const parsed = await readWorkbookFile({
      text: async () => JSON.stringify(serializeWorkbook(workbook)),
    });

    expect(parsed.id).toBe(workbook.id);
  });

  test("derives imported image identity and dimensions from real PNG bytes", async () => {
    const workbook = createTestWorkbook();
    workbook.watermarkPresets = [
      {
        id: "logo-preset",
        name: "Logo",
        watermark: {
          ...DEFAULT_SHEET_WATERMARK,
          image: { assetId: "untrusted-id", scale: null, washout: true, angle: 0 },
        },
      },
    ];
    getActiveSheet(workbook).pageDecoration = {
      watermark: {
        ...DEFAULT_SHEET_WATERMARK,
        image: { assetId: "untrusted-id", scale: null, washout: true, angle: 0 },
      },
    };
    setCellContent(
      getActiveSheet(workbook),
      { row: 1, column: 1 },
      { kind: "image", image: { assetId: "untrusted-id", altText: "logo" } },
    );
    const snapshot = serializeWorkbook(workbook);
    const png =
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9JZ4sAAAAASUVORK5CYII=";
    const url = { createObjectURL: vi.fn(() => "blob:png"), revokeObjectURL: vi.fn() };
    vi.stubGlobal("URL", url);
    vi.stubGlobal(
      "Image",
      class {
        naturalWidth = 1;
        naturalHeight = 1;
        onload: (() => void) | null = null;
        onerror: (() => void) | null = null;
        set src(_value: string) {
          queueMicrotask(() => this.onload?.());
        }
      },
    );
    const imported = await readWorkbookBundleFile(
      {
        text: async () =>
          JSON.stringify({
            format: "sheetcraft-workbook",
            version: 1,
            snapshot,
            images: [
              { id: "untrusted-id", mimeType: "image/jpeg", width: 999, height: 999, data: png },
            ],
          }),
      },
      createMemoryImageAssetStore(),
    );
    const content = getActiveSheet(imported).cells.get("1:1")?.content;
    expect(content).toMatchObject({
      kind: "image",
      image: { assetId: expect.stringMatching(/^image-/) },
    });
    expect((content as { kind: "image"; image: { assetId: string } }).image.assetId).not.toBe(
      "untrusted-id",
    );
    expect(getActiveSheet(imported).pageDecoration?.watermark?.image?.assetId).toBe(
      (content as { kind: "image"; image: { assetId: string } }).image.assetId,
    );
    expect(imported.watermarkPresets?.[0]?.watermark.image?.assetId).toBe(
      (content as { kind: "image"; image: { assetId: string } }).image.assetId,
    );
  });

  test("rejects a plain image snapshot without bundled image bytes", async () => {
    const workbook = createTestWorkbook();
    setCellContent(
      getActiveSheet(workbook),
      { row: 0, column: 1 },
      { kind: "image", image: { assetId: "missing", altText: "" } },
    );
    await expect(
      readWorkbookBundleFile(
        { text: async () => JSON.stringify(serializeWorkbook(workbook)) },
        createMemoryImageAssetStore(),
      ),
    ).rejects.toMatchObject({ code: "missing-image" });
  });

  test("downloads a fixed JSON filename and revokes its object URL", () => {
    vi.useFakeTimers();
    const createObjectURL = vi.fn(() => "blob:sheetcraft-workbook");
    const revokeObjectURL = vi.fn();
    vi.stubGlobal("URL", { createObjectURL, revokeObjectURL });
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => undefined);

    downloadWorkbookJson(createTestWorkbook());

    expect(createObjectURL).toHaveBeenCalledOnce();
    expect(click).toHaveBeenCalledOnce();
    expect((click.mock.instances[0] as HTMLAnchorElement | undefined)?.download).toBe(
      "sheetcraft-workbook.json",
    );
    expect(document.querySelector('a[download="sheetcraft-workbook.json"]')).toBeNull();
    expect(revokeObjectURL).not.toHaveBeenCalled();
    vi.runAllTimers();
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:sheetcraft-workbook");
  });
});
