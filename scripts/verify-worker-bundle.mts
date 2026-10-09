import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createSetCellContentCommand } from "@sheetcraft/core/commands";
import { deserializeWorkbook, serializeWorkbook } from "@sheetcraft/core/serialization";
import {
  createWorkbook,
  createSheet,
  insertSheet,
  createWorkbookEvaluator,
  getActiveSheet,
  getCellContent,
  getCellValue,
  setCellContent,
} from "@sheetcraft/core/workbook";

type PackageManifest = {
  name: string;
  exports?: Record<string, unknown>;
};

const workspaceRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

type WorkerRoundTripPayload = {
  snapshot: unknown;
  command: unknown;
};

type WorkerRoundTripResult = {
  exportedMemberCount: number;
  commandValue: unknown;
  undoneValue: unknown;
  redoneValue: unknown;
  formulaValue: unknown;
  formulaSource: unknown;
  snapshot: unknown;
  geometryCell: unknown;
  executed: unknown;
  undone: unknown;
  redone: unknown;
};

async function verifyWorkerRoundTrip(
  outputPath: string,
  payload: WorkerRoundTripPayload,
): Promise<WorkerRoundTripResult> {
  const worker = new Worker(pathToFileURL(outputPath).href, { type: "module" });
  try {
    return await new Promise<WorkerRoundTripResult>((resolveValue, reject) => {
      const timeout = setTimeout(
        () => reject(new Error("Worker message round trip timed out.")),
        5_000,
      );
      worker.onmessage = (event: MessageEvent<unknown>) => {
        clearTimeout(timeout);
        const result = event.data as Partial<WorkerRoundTripResult> | null;
        if (
          !result ||
          typeof result.exportedMemberCount !== "number" ||
          !Number.isFinite(result.exportedMemberCount) ||
          result.exportedMemberCount <= 0
        ) {
          reject(new Error(`Worker returned an invalid round trip result: ${String(event.data)}.`));
          return;
        }
        resolveValue(result as WorkerRoundTripResult);
      };
      worker.onerror = (event) => {
        clearTimeout(timeout);
        reject(event.error ?? new Error(event.message));
      };
      worker.postMessage(payload);
    });
  } finally {
    worker.terminate();
  }
}

function createWorkerPayload(): WorkerRoundTripPayload {
  const workbook = createWorkbook({
    id: "worker-workbook",
    sheetId: "worker-sheet",
  });
  const sheet = getActiveSheet(workbook);
  const sourceSheet = createSheet("Source", "worker-source");
  insertSheet(workbook, sourceSheet);
  setCellContent(sourceSheet, { row: 0, column: 0 }, { kind: "literal", value: 7 });
  workbook.definedNames.set("worker-data", {
    id: "worker-data",
    name: "WorkerData",
    reference: {
      sheetId: sourceSheet.id,
      start: { row: 0, column: 0 },
      end: { row: 0, column: 0 },
    },
  });
  setCellContent(sheet, { row: 0, column: 0 }, { kind: "literal", value: 7 });
  setCellContent(
    sheet,
    { row: 0, column: 1 },
    {
      kind: "formula",
      formula: { source: "=SUM(WorkerData)*2" },
    },
  );
  const snapshot = serializeWorkbook(workbook);
  const command = createSetCellContentCommand(
    sheet.id,
    { row: 1, column: 0 },
    { kind: "literal", value: 9 },
  );

  return {
    snapshot: structuredClone(snapshot),
    command: structuredClone(command),
  };
}

function assertRoundTripResult(
  result: WorkerRoundTripResult,
  inputSnapshot: unknown,
  inputCommand: unknown,
  expectedSnapshot: string,
  expectedCommand: string,
  expectGeometry: boolean,
): void {
  if (
    result.executed !== true ||
    result.undone !== true ||
    result.redone !== true ||
    result.commandValue !== 9 ||
    result.undoneValue !== null ||
    result.redoneValue !== 9
  ) {
    throw new Error("Worker command history did not execute, undo, and redo the cell edit.");
  }
  if (result.formulaValue !== 14 || result.formulaSource !== "=SUM(WorkerData)*2") {
    throw new Error("Worker did not preserve and evaluate the formula cell.");
  }
  const snapshot = result.snapshot as { version?: unknown; dateSystem?: unknown } | null;
  if (
    !snapshot ||
    snapshot.version !== (inputSnapshot as { version: number }).version ||
    snapshot.dateSystem !== "1900"
  ) {
    throw new Error(
      "Worker did not return the current workbook snapshot with an explicit date system.",
    );
  }
  const restoredWorkbook = deserializeWorkbook(result.snapshot);
  const restoredSheet = getActiveSheet(restoredWorkbook);
  const restoredFormula = getCellContent(restoredSheet, { row: 0, column: 1 });
  if (
    getCellValue(restoredSheet, { row: 1, column: 0 }) !== 9 ||
    createWorkbookEvaluator(restoredWorkbook, restoredSheet.id).getComputedValue({
      row: 0,
      column: 1,
    }) !== 14 ||
    restoredWorkbook.definedNames.get("worker-data")?.reference.sheetId !== "worker-source" ||
    restoredFormula?.kind !== "formula" ||
    restoredFormula.formula.source !== "=SUM(WorkerData)*2"
  ) {
    throw new Error(
      "Worker returned a workbook snapshot with incorrect command or formula content.",
    );
  }
  if (
    expectGeometry &&
    JSON.stringify(result.geometryCell) !== JSON.stringify({ row: 1, column: 1 })
  ) {
    throw new Error("Worker did not evaluate the Sheet Engine geometry check.");
  }
  if (JSON.stringify(inputSnapshot) !== expectedSnapshot) {
    throw new Error("Worker changed the source workbook snapshot.");
  }
  if (JSON.stringify(inputCommand) !== expectedCommand) {
    throw new Error("Worker changed the source workbook command.");
  }
}

function readPackage(relativeDirectory: string, required: boolean): PackageManifest | undefined {
  const packageDirectory = resolve(workspaceRoot, relativeDirectory);
  const manifestPath = join(packageDirectory, "package.json");
  if (!existsSync(manifestPath)) {
    if (required) {
      throw new Error(`Required package manifest is missing: ${relativeDirectory}/package.json`);
    }
    return undefined;
  }
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as PackageManifest;
  if (!manifest.name || !manifest.exports) {
    throw new Error(`Package ${relativeDirectory} must declare a name and exports.`);
  }
  const rootExport = manifest.exports["."] as { import?: string } | undefined;
  if (!rootExport?.import || !existsSync(join(packageDirectory, rootExport.import))) {
    throw new Error(
      `Package ${manifest.name} is not built. Run its build script before this check.`,
    );
  }
  return manifest;
}

function linkPackageForConsumer(
  temporaryDirectory: string,
  relativePackageDirectory: string,
  manifest: PackageManifest,
): void {
  const linkPath = resolve(temporaryDirectory, "node_modules", ...manifest.name.split("/"));
  mkdirSync(dirname(linkPath), { recursive: true });
  symlinkSync(
    resolve(workspaceRoot, relativePackageDirectory),
    linkPath,
    process.platform === "win32" ? "junction" : "dir",
  );
}

async function main(): Promise<void> {
  if (typeof Bun === "undefined") {
    throw new Error("This verification requires Bun. Run: bun scripts/verify-worker-bundle.mts");
  }

  const core = readPackage("packages/core", true);
  if (!core) {
    throw new Error("Required package @sheetcraft/core could not be loaded.");
  }
  const sheetEngine = readPackage("packages/sheet-engine", false);
  const temporaryDirectory = mkdtempSync(join(workspaceRoot, ".worker-bundle-smoke-"));

  try {
    linkPackageForConsumer(temporaryDirectory, "packages/core", core);
    if (sheetEngine) {
      linkPackageForConsumer(temporaryDirectory, "packages/sheet-engine", sheetEngine);
    }
    const payload = createWorkerPayload();
    const inputSnapshot = JSON.stringify(payload.snapshot);
    const inputCommand = JSON.stringify(payload.command);
    const entryPath = join(temporaryDirectory, "consumer.mjs");
    const imports = [`import * as core from ${JSON.stringify(core.name)};`];
    const values = ["Object.keys(core).length"];
    const geometry = ["let geometryCell = null;"];
    if (sheetEngine) {
      imports.push(`import * as sheetEngine from ${JSON.stringify(sheetEngine.name)};`);
      values.push("Object.keys(sheetEngine).length");
      geometry.push(
        "geometryCell = sheetEngine.createSheetGeometry({ rowCount: 3, columnCount: 3, rowHeight: 20, columnWidth: 80 }).getCellAtPoint({ x: 90, y: 25 });",
      );
    }
    writeFileSync(
      entryPath,
      `${imports.join("\n")}

self.addEventListener("message", (event) => {
  const { snapshot, command } = event.data;
  const workbook = core.deserializeWorkbook(snapshot);
  const session = core.createWorkbookSession({
    workbook,
    idFactory: core.createSequentialIdFactory(),
  });
  const sheet = core.getActiveSheet(workbook);
  const executed = core.executeWorkbookCommand(session, command);
  const commandValue = core.getCellValue(sheet, { row: 1, column: 0 });
  const undone = core.undoWorkbookCommand(session);
  const undoneValue = core.getCellValue(sheet, { row: 1, column: 0 });
  const redone = core.redoWorkbookCommand(session);
  const redoneValue = core.getCellValue(sheet, { row: 1, column: 0 });
  const formulaContent = core.getCellContent(sheet, { row: 0, column: 1 });
  ${geometry.join("\n  ")}
  self.postMessage({
    exportedMemberCount: ${values.join(" + ")},
    commandValue,
    undoneValue,
    redoneValue,
    formulaValue: core.createWorkbookEvaluator(workbook, sheet.id).getComputedValue({ row: 0, column: 1 }),
    formulaSource: formulaContent?.kind === "formula" ? formulaContent.formula.source : null,
    snapshot: core.serializeWorkbook(workbook),
    geometryCell,
    executed,
    undone,
    redone,
  });
});
`,
    );

    const result = await Bun.build({
      entrypoints: [entryPath],
      outdir: join(temporaryDirectory, "dist"),
      target: "browser",
      format: "esm",
      splitting: false,
      sourcemap: "none",
      minify: false,
    });
    if (!result.success) {
      const diagnostics = result.logs.map((log) => log.message).join("\n");
      throw new Error(`Browser-target Worker bundle failed:\n${diagnostics}`);
    }
    if (result.outputs.length === 0) {
      throw new Error("Browser-target Worker bundle produced no output.");
    }

    const output = await result.outputs[0]?.text();
    if (!output) {
      throw new Error("Browser-target Worker bundle output could not be read.");
    }
    if (/\bnode:[a-z_]+\b/u.test(output)) {
      throw new Error("Browser-target Worker bundle still references a Node builtin.");
    }

    const roundTripResult = await verifyWorkerRoundTrip(result.outputs[0].path, payload);
    assertRoundTripResult(
      roundTripResult,
      payload.snapshot,
      payload.command,
      inputSnapshot,
      inputCommand,
      Boolean(sheetEngine),
    );

    console.log(
      `Worker browser bundle and workbook command round trip passed for ${[core.name, sheetEngine?.name].filter(Boolean).join(", ")} (${roundTripResult.exportedMemberCount} exports).`,
    );
  } finally {
    rmSync(temporaryDirectory, { recursive: true, force: true });
  }
}

main().catch((error: unknown) => {
  console.error(`Worker browser bundle verification failed: ${(error as Error).message}`);
  process.exitCode = 1;
});
