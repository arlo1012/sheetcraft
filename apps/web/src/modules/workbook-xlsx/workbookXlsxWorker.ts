import type {
  XlsxCompatibilityReport,
  XlsxWorkerRequest,
  XlsxWorkerResponse,
} from "./xlsxWorkerProtocol";

export type XlsxWorkerPort = {
  onerror: ((event: ErrorEvent) => void) | null;
  onmessage: ((event: MessageEvent<XlsxWorkerResponse>) => void) | null;
  onmessageerror: ((event: MessageEvent<unknown>) => void) | null;
  postMessage: (message: XlsxWorkerRequest, transfer?: Transferable[]) => void;
  terminate: () => void;
};

export type XlsxWorkerFactory = () => XlsxWorkerPort;

export class XlsxWorkerFailure extends Error {
  constructor(
    message: string,
    readonly report?: XlsxCompatibilityReport,
  ) {
    super(message);
    this.name = "XlsxWorkerFailure";
  }
}

export class XlsxWorkerTimeoutError extends Error {
  constructor() {
    super("XLSX conversion timed out.");
    this.name = "XlsxWorkerTimeoutError";
  }
}

export class XlsxWorkerAbortError extends Error {
  constructor() {
    super("XLSX conversion was cancelled.");
    this.name = "XlsxWorkerAbortError";
  }
}

export function createWorkbookXlsxWorker(): XlsxWorkerPort {
  return new Worker(new URL("./workbookXlsx.worker.ts", import.meta.url), {
    type: "module",
  }) as unknown as XlsxWorkerPort;
}

export function runXlsxWorker(
  factory: XlsxWorkerFactory,
  request: XlsxWorkerRequest,
  options: { timeoutMs: number; signal?: AbortSignal },
): Promise<Extract<XlsxWorkerResponse, { ok: true }>> {
  return new Promise((resolve, reject) => {
    const worker = factory();
    let settled = false;
    const timeout = setTimeout(() => settle(new XlsxWorkerTimeoutError()), options.timeoutMs);

    function cleanup(): void {
      clearTimeout(timeout);
      options.signal?.removeEventListener("abort", onAbort);
      worker.onmessage = null;
      worker.onerror = null;
      worker.onmessageerror = null;
      worker.terminate();
    }

    function settle(error?: Error, response?: Extract<XlsxWorkerResponse, { ok: true }>): void {
      if (settled) return;
      settled = true;
      cleanup();
      if (error) reject(error);
      else if (response) resolve(response);
    }

    function onAbort(): void {
      settle(new XlsxWorkerAbortError());
    }

    if (options.signal?.aborted) {
      onAbort();
      return;
    }
    options.signal?.addEventListener("abort", onAbort, { once: true });
    worker.onerror = (event) =>
      settle(new XlsxWorkerFailure(event.message || "XLSX worker failed."));
    worker.onmessageerror = () =>
      settle(new XlsxWorkerFailure("XLSX worker returned an invalid message."));
    worker.onmessage = (event) => {
      const response = event.data;
      if (!response || typeof response !== "object" || Array.isArray(response)) {
        settle(new XlsxWorkerFailure("XLSX worker returned an invalid message."));
        return;
      }
      if (response.id !== request.id) return;
      if (response.ok !== true && response.ok !== false) {
        settle(new XlsxWorkerFailure("XLSX worker returned an invalid message."));
        return;
      }
      if (!response.ok) {
        if (!response.error || typeof response.error.message !== "string") {
          settle(new XlsxWorkerFailure("XLSX worker returned an invalid message."));
          return;
        }
        settle(new XlsxWorkerFailure(response.error.message, response.error.report));
        return;
      }
      if (response.type !== request.type) {
        settle(new XlsxWorkerFailure("XLSX worker returned an unexpected response."));
        return;
      }
      settle(undefined, response);
    };
    const transfer = request.type === "decode" ? [request.bytes] : [];
    try {
      worker.postMessage(request, transfer);
    } catch (cause) {
      settle(
        new XlsxWorkerFailure(
          cause instanceof Error ? cause.message : "XLSX worker could not start.",
        ),
      );
    }
  });
}
