/// <reference lib="webworker" />

import { deserializeWorkbook, serializeWorkbook } from "@idea10/core/serialization";
import type {
  XlsxCompatibilityReport,
  XlsxWorkerRequest,
  XlsxWorkerResponse,
} from "./xlsxWorkerProtocol";

const worker = self as unknown as DedicatedWorkerGlobalScope;

worker.addEventListener("message", (event: MessageEvent<XlsxWorkerRequest>) => {
  void handleRequest(event.data);
});

async function handleRequest(request: XlsxWorkerRequest): Promise<void> {
  try {
    // The codec stays behind this worker-only dynamic import so ExcelJS never enters the app bundle.
    const codec = await import("@idea10/xlsx-io");
    if (request.type === "decode") {
      const result = await codec.decodeXlsx(new Uint8Array(request.bytes));
      respond({
        id: request.id,
        ok: true,
        type: "decode",
        snapshot: serializeWorkbook(result.workbook),
        report: result.report,
      });
      return;
    }
    const result = await codec.encodeXlsx(deserializeWorkbook(request.snapshot));
    const bytes = new Uint8Array(result.bytes).buffer;
    respond(
      {
        id: request.id,
        ok: true,
        type: "encode",
        bytes,
        report: result.report,
      },
      [bytes],
    );
  } catch (cause) {
    const error = cause as { message?: unknown; report?: unknown };
    respond({
      id: request.id,
      ok: false,
      error: {
        message: typeof error.message === "string" ? error.message : "XLSX conversion failed.",
        ...(error.report && typeof error.report === "object"
          ? { report: error.report as XlsxCompatibilityReport }
          : {}),
      },
    });
  }
}

function respond(response: XlsxWorkerResponse, transfer: Transferable[] = []): void {
  worker.postMessage(response, transfer);
}
