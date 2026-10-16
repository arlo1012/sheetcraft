import { afterEach, expect, test, vi } from "vitest";
import { createWorkbook } from "@sheetcraft/core/workbook";
import { decodeXlsx } from "@sheetcraft/xlsx-io";
import type {
  XlsxWorkerRequest,
  XlsxWorkerResponse,
} from "../../../modules/workbook-xlsx/xlsxWorkerProtocol";

vi.mock("@sheetcraft/xlsx-io", () => ({
  isOfficeEncryptedFile: () => false,
  decodeXlsx: vi.fn(),
}));

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

test("the decode worker transfers original picture bytes alongside the matching snapshot", async () => {
  const source = new Uint8Array([137, 80, 78, 71]);
  const workbook = createWorkbook({ id: "imported", sheetId: "sheet" });
  vi.mocked(decodeXlsx).mockResolvedValue({
    workbook,
    report: { issues: [] },
    images: [{ assetId: "source-picture", bytes: source, extension: "png" }],
  });
  let listener: ((event: MessageEvent<XlsxWorkerRequest>) => void) | undefined;
  const postMessage = vi.fn<(response: XlsxWorkerResponse, transfer: Transferable[]) => void>();
  vi.stubGlobal("self", {
    addEventListener: (_name: string, handler: typeof listener) => {
      listener = handler;
    },
    postMessage,
  });
  await import("../../../modules/workbook-xlsx/workbookXlsx.worker");
  listener?.({
    data: { id: "decode-images", type: "decode", bytes: new ArrayBuffer(1) },
  } as MessageEvent<XlsxWorkerRequest>);
  await vi.waitFor(() => expect(postMessage).toHaveBeenCalledOnce());
  const [response, transfer] = postMessage.mock.calls[0]!;
  expect(response).toMatchObject({
    id: "decode-images",
    ok: true,
    type: "decode",
    snapshot: { id: "imported" },
    report: { issues: [] },
  });
  if (!response.ok || response.type !== "decode") throw Error("Expected decoded workbook.");
  expect(response.images?.[0]).toMatchObject({ assetId: "source-picture", extension: "png" });
  expect(response.images?.[0]?.bytes).toBeInstanceOf(ArrayBuffer);
  expect(new Uint8Array(response.images![0]!.bytes)).toEqual(source);
  expect(transfer).toEqual([response.images![0]!.bytes]);
  expect(response.images![0]!.bytes).not.toBe(source.buffer);
  expect(source).toEqual(new Uint8Array([137, 80, 78, 71]));
});
