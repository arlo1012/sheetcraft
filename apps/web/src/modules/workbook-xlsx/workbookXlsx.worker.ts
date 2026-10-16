/// <reference lib="webworker" />

import { deserializeWorkbook, serializeWorkbook } from "@sheetcraft/core/serialization";
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
    const codec = await import("@sheetcraft/xlsx-io");
    if (request.type === "decode") {
      const input = new Uint8Array(request.bytes);
      const plaintext = codec.isOfficeEncryptedFile(input)
        ? codec.decryptOfficeFile(input, request.password ?? "")
        : input;
      const result = await codec.decodeXlsx(plaintext);
      const images = result.images?.map((image) => ({
        ...image,
        bytes: new Uint8Array(image.bytes).buffer,
      }));
      respond(
        {
          id: request.id,
          ok: true,
          type: "decode",
          snapshot: serializeWorkbook(result.workbook),
          ...(images?.length ? { images } : {}),
          report: result.report,
        },
        images?.map((image) => image.bytes),
      );
      return;
    }
    const result = await codec.encodeXlsx(deserializeWorkbook(request.snapshot), {
      filename: request.filename,
      images: request.images?.map((image) => ({
        ...image,
        bytes: new Uint8Array(image.bytes),
      })),
    });
    const bytes = new Uint8Array(
      request.password ? codec.encryptOfficeFile(result.bytes, request.password) : result.bytes,
    ).buffer;
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
    const error = cause as {
      message?: unknown;
      report?: unknown;
      code?: import("./xlsxWorkerProtocol").XlsxWorkerError["code"];
    };
    respond({
      id: request.id,
      ok: false,
      error: {
        ...(error.code ? { code: error.code } : {}),
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
