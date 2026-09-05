import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { inflateRawSync } from "node:zlib";
import type { XlsxWorkerRequest } from "../apps/web/src/modules/workbook-xlsx/xlsxWorkerProtocol";
import {
  deserializeWorkbook,
  serializeWorkbook,
  type WorkbookSnapshot,
} from "@idea10/core/serialization";
import {
  createWorkbook,
  getActiveSheet,
  getCellComputedValue,
  getCellContent,
  getCellStyle,
  getColumnWidth,
  getCellValue,
  setCellContent,
  setCellStyle,
  setColumnWidth,
  setRowHeight,
  setSheetMetadata,
} from "@idea10/core/workbook";

type CompatibilityIssue = {
  code: string;
  severity: "warning" | "block";
  count: number;
};
type CompatibilityReport = { issues: CompatibilityIssue[] };
type WorkerResponse =
  | {
      id: string;
      ok: true;
      type: "encode";
      bytes: ArrayBuffer;
      report: CompatibilityReport;
    }
  | {
      id: string;
      ok: true;
      type: "decode";
      snapshot: WorkbookSnapshot;
      report: CompatibilityReport;
    }
  | {
      id: string;
      ok: false;
      error: { message: string; report?: CompatibilityReport };
    };

const workspaceRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const workerEntry = join(
  workspaceRoot,
  "apps/web/src/modules/workbook-xlsx/workbookXlsx.worker.ts",
);
const xlsxArtifact = join(workspaceRoot, "packages/xlsx-io/dist/index.js");
const workerTimeoutMs = 10_000;

function createFixtureSnapshot(): WorkbookSnapshot {
  const workbook = createWorkbook({
    id: "xlsx-worker-fixture",
    sheetId: "xlsx-worker-sheet",
    dateSystem: "1904",
  });
  const sheet = getActiveSheet(workbook);
  setCellContent(sheet, { row: 0, column: 0 }, { kind: "literal", value: 7 });
  setCellContent(sheet, { row: 0, column: 1 }, { kind: "literal", value: 3 });
  setCellContent(
    sheet,
    { row: 0, column: 2 },
    {
      kind: "formula",
      formula: { source: "=IF(A1>B1,ROUND(A1/B1,1),0)" },
    },
  );
  setCellStyle(sheet, { row: 3, column: 3 }, { bold: true, fillColor: "#88CCEE" });
  setCellStyle(
    sheet,
    { row: 0, column: 2 },
    {
      numberFormat: { kind: "currency", currency: "CNY", fractionDigits: 2 },
      borderTop: { style: "thin", color: "#112233" },
      borderRight: { style: "medium", color: "#223344" },
      borderBottom: { style: "dashed", color: "#334455" },
      borderLeft: { style: "double", color: "#445566" },
    },
  );
  setRowHeight(sheet, 8, 42);
  setColumnWidth(sheet, 0, 200);
  setSheetMetadata(sheet, {
    freezePanes: { rows: 1, columns: 0 },
    mergedCells: [{ start: { row: 5, column: 0 }, end: { row: 5, column: 1 } }],
    filter: null,
  });
  return serializeWorkbook(workbook);
}

function assertFixture(snapshot: WorkbookSnapshot): void {
  const workbook = deserializeWorkbook(snapshot);
  const sheet = getActiveSheet(workbook);
  const formula = getCellContent(sheet, { row: 0, column: 2 });
  if (
    workbook.dateSystem !== "1904" ||
    getCellValue(sheet, { row: 0, column: 0 }) !== 7 ||
    getCellValue(sheet, { row: 0, column: 1 }) !== 3 ||
    getCellComputedValue(sheet, { row: 0, column: 2 }) !== 2.3 ||
    formula?.kind !== "formula" ||
    formula.formula.source !== "=IF(A1>B1,ROUND(A1/B1,1),0)"
  ) {
    throw new Error(
      "XLSX worker did not preserve fixture values, formula source, or computed value.",
    );
  }
  if (
    getCellStyle(sheet, { row: 3, column: 3 })?.fillColor !== "#88ccee" ||
    sheet.rowHeights.get(8) !== 42 ||
    getColumnWidth(sheet, 0) !== 200 ||
    sheet.freezePanes.rows !== 1 ||
    sheet.mergedCells.length !== 1
  ) {
    throw new Error("XLSX worker did not preserve the styled blank or sheet geometry metadata.");
  }
  const style = getCellStyle(sheet, { row: 0, column: 2 });
  if (
    style?.numberFormat?.kind !== "currency" ||
    style.numberFormat.currency !== "CNY" ||
    style.numberFormat.fractionDigits !== 2 ||
    style.borderTop?.style !== "thin" ||
    style.borderTop.color !== "#112233" ||
    style.borderRight?.style !== "medium" ||
    style.borderRight.color !== "#223344" ||
    style.borderBottom?.style !== "dashed" ||
    style.borderBottom.color !== "#334455" ||
    style.borderLeft?.style !== "double" ||
    style.borderLeft.color !== "#445566"
  ) {
    throw new Error("XLSX worker did not preserve currency formatting and four-sided borders.");
  }
}

async function postWorker(worker: Worker, request: XlsxWorkerRequest): Promise<WorkerResponse> {
  return new Promise((resolveValue, reject) => {
    const timeout = setTimeout(
      () => reject(new Error(`Worker request ${request.id} timed out.`)),
      workerTimeoutMs,
    );
    const cleanup = () => {
      clearTimeout(timeout);
      worker.onmessage = null;
      worker.onerror = null;
      worker.onmessageerror = null;
    };
    worker.onmessage = (event: MessageEvent<unknown>) => {
      const response = event.data as Partial<WorkerResponse> | null;
      if (!response || response.id !== request.id || typeof response.ok !== "boolean") return;
      cleanup();
      resolveValue(response as WorkerResponse);
    };
    worker.onerror = (event) => {
      cleanup();
      reject(event.error ?? new Error(event.message || "XLSX worker failed."));
    };
    worker.onmessageerror = () => {
      cleanup();
      reject(new Error("XLSX worker returned an unreadable message."));
    };
    const transfer =
      request.type === "decode"
        ? [request.bytes]
        : [...new Set(request.images?.map((image) => image.bytes) ?? [])];
    try {
      worker.postMessage(request, transfer);
    } catch (error) {
      cleanup();
      reject(error);
    }
  });
}

function assertImageExport(bytes: ArrayBuffer, originalImage: Uint8Array): void {
  const entries = new Map<string, Uint8Array>();
  const view = new DataView(bytes);
  let offset = 0;
  while (offset + 30 <= bytes.byteLength && view.getUint32(offset, true) === 0x04034b50) {
    const compression = view.getUint16(offset + 8, true);
    const compressedSize = view.getUint32(offset + 18, true);
    const nameLength = view.getUint16(offset + 26, true);
    const extraLength = view.getUint16(offset + 28, true);
    const name = new TextDecoder().decode(new Uint8Array(bytes, offset + 30, nameLength));
    const start = offset + 30 + nameLength + extraLength;
    const content = new Uint8Array(bytes, start, compressedSize);
    entries.set(name, compression === 8 ? new Uint8Array(inflateRawSync(content)) : content);
    offset = start + compressedSize;
  }
  const media = [...entries].filter(([name]) => /^xl\/media\/image\d+\.png$/u.test(name));
  const image = media[0]?.[1];
  if (
    media.length !== 1 ||
    !image ||
    image.length !== originalImage.length ||
    image.some((byte, index) => byte !== originalImage[index])
  ) {
    throw new Error("XLSX Worker did not preserve or deduplicate the transferred image bytes.");
  }
  const drawing = new TextDecoder().decode(entries.get("xl/drawings/drawing1.xml"));
  const relations = new TextDecoder().decode(entries.get("xl/drawings/_rels/drawing1.xml.rels"));
  if (
    drawing.match(/<xdr:twoCellAnchor editAs="oneCell">/gu)?.length !== 2 ||
    drawing.includes("<xdr:oneCellAnchor") ||
    !drawing.includes("<xdr:colOff>76200</xdr:colOff>") ||
    !drawing.includes(
      "<xdr:to><xdr:col>3</xdr:col><xdr:colOff>76200</xdr:colOff><xdr:row>8</xdr:row><xdr:rowOff>57150</xdr:rowOff></xdr:to>",
    ) ||
    !relations.includes("../media/image1.png")
  ) {
    throw new Error("XLSX Worker did not write the cell and floating image drawing anchors.");
  }
}

function requireSuccess<T extends WorkerResponse["type"]>(
  response: WorkerResponse,
  type: T,
): Extract<WorkerResponse, { ok: true; type: T }> {
  if (!response.ok) throw new Error(`XLSX worker failed: ${response.error.message}`);
  if (response.type !== type) throw new Error(`XLSX worker returned ${response.type} for ${type}.`);
  return response as Extract<WorkerResponse, { ok: true; type: T }>;
}

async function main(): Promise<void> {
  if (typeof Bun === "undefined") {
    throw new Error("This verification requires Bun. Run: bun scripts/verify-xlsx-worker.mts");
  }
  if (!existsSync(workerEntry)) throw new Error(`XLSX worker entry is missing: ${workerEntry}`);
  if (!existsSync(xlsxArtifact)) {
    throw new Error("@idea10/xlsx-io is not built. Run: bun run --filter @idea10/xlsx-io build");
  }

  const temporaryDirectory = mkdtempSync(join(workspaceRoot, ".xlsx-worker-smoke-"));
  try {
    const build = await Bun.build({
      entrypoints: [workerEntry],
      outdir: join(temporaryDirectory, "dist"),
      target: "browser",
      format: "esm",
      splitting: false,
      sourcemap: "none",
      minify: false,
    });
    if (!build.success || build.outputs.length !== 1) {
      const diagnostics = build.logs.map((log) => log.message).join("\n");
      throw new Error(`Browser-target XLSX Worker bundle failed:\n${diagnostics}`);
    }
    const output = build.outputs[0];
    if (!output || !existsSync(output.path))
      throw new Error("XLSX Worker bundle output is missing.");
    const source = await output.text();
    if (/\bnode:[a-z_]+\b/u.test(source)) {
      throw new Error("Browser-target XLSX Worker bundle references a Node builtin.");
    }

    const snapshot = createFixtureSnapshot();
    const originalSnapshot = JSON.stringify(snapshot);
    const worker = new Worker(pathToFileURL(output.path).href, {
      type: "module",
    });
    try {
      const encoded = requireSuccess(
        await postWorker(worker, { id: "encode", type: "encode", snapshot }),
        "encode",
      );
      if (encoded.report.issues.length !== 0) {
        throw new Error("Supported XLSX fixture must export without compatibility losses.");
      }
      if (JSON.stringify(snapshot) !== originalSnapshot) {
        throw new Error("XLSX Worker mutated the source snapshot during encoding.");
      }
      const decoded = requireSuccess(
        await postWorker(worker, {
          id: "decode",
          type: "decode",
          bytes: encoded.bytes,
        }),
        "decode",
      );
      if (decoded.snapshot.version !== 6)
        throw new Error("XLSX Worker returned an unversioned snapshot.");
      assertFixture(decoded.snapshot);

      const imageWorkbook = deserializeWorkbook(snapshot);
      const imageSheet = getActiveSheet(imageWorkbook);
      setCellContent(
        imageSheet,
        { row: 4, column: 0 },
        {
          kind: "image",
          image: { assetId: "worker-image", altText: "Cell image" },
        },
      );
      imageSheet.floatingImages.push({
        id: "worker-floating",
        assetId: "worker-image",
        altText: "Floating image",
        anchor: { row: 6, column: 2 },
        offsetX: 8,
        offsetY: 6,
        width: 96,
        height: 48,
      });
      const imageSnapshot = serializeWorkbook(imageWorkbook);
      const originalImageSnapshot = JSON.stringify(imageSnapshot);
      const imageBytes = new Uint8Array(
        Buffer.from(
          "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Zl1sAAAAASUVORK5CYII=",
          "base64",
        ),
      );
      const encodedImages = requireSuccess(
        await postWorker(worker, {
          id: "encode-images",
          type: "encode",
          snapshot: imageSnapshot,
          images: [
            {
              assetId: "worker-image",
              bytes: new Uint8Array(imageBytes).buffer,
              extension: "png",
              width: 1,
              height: 1,
            },
          ],
        }),
        "encode",
      );
      if (encodedImages.report.issues.length !== 0)
        throw new Error("Supported images must export without omissions.");
      assertImageExport(encodedImages.bytes, imageBytes);
      if (JSON.stringify(imageSnapshot) !== originalImageSnapshot)
        throw new Error("Image export mutated the source snapshot.");

      const malformed = await postWorker(worker, {
        id: "malformed",
        type: "decode",
        bytes: new Uint8Array(22).buffer,
      });
      if (
        malformed.ok ||
        !malformed.error.report?.issues.some((issue) => issue.code === "archive-invalid")
      ) {
        throw new Error(
          "Malformed XLSX archive did not return an archive-invalid compatibility report.",
        );
      }
      if (JSON.stringify(snapshot) !== originalSnapshot) {
        throw new Error("Malformed XLSX decode mutated the source snapshot.");
      }
    } finally {
      worker.terminate();
    }

    console.log(
      "Browser-target XLSX Worker bundle, codec round trip, image media/anchors, and malformed-archive gate passed.",
    );
  } finally {
    rmSync(temporaryDirectory, { recursive: true, force: true });
  }
}

main().catch((error: unknown) => {
  console.error(`XLSX Worker verification failed: ${(error as Error).message}`);
  process.exitCode = 1;
});
