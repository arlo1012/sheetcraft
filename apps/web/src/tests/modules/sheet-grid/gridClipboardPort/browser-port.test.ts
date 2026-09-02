import { afterEach, describe, expect, test, vi } from "vitest";
import { createBrowserGridClipboardPort } from "../../../../modules/sheet-grid/gridClipboardPort";

const WEB_IDEA10_CLIPBOARD_TYPE = "web application/x-idea10-cells";

function stubClipboard(clipboard: Partial<Clipboard>): void {
  vi.stubGlobal("navigator", { clipboard });
}

function stubClipboardItem(): void {
  vi.stubGlobal(
    "ClipboardItem",
    class MockClipboardItem {
      constructor(readonly data: Record<string, Blob>) {}
    },
  );
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("browser grid clipboard port", () => {
  test("writes the local token when custom clipboard formats are supported", async () => {
    const write = vi.fn().mockResolvedValue(undefined);
    const writeText = vi.fn().mockResolvedValue(undefined);
    stubClipboard({ write, writeText });
    stubClipboardItem();

    const result = await createBrowserGridClipboardPort().write({
      text: "value",
      localToken: "token-1",
    });

    expect(result).toEqual({ localTokenWritten: true });
    expect(write).toHaveBeenCalledOnce();
    expect(writeText).not.toHaveBeenCalled();
  });

  test("falls back to a text-only write when a custom format is rejected", async () => {
    const write = vi.fn().mockRejectedValue(new DOMException("unsupported", "NotSupportedError"));
    const writeText = vi.fn().mockResolvedValue(undefined);
    stubClipboard({ write, writeText });
    stubClipboardItem();

    const result = await createBrowserGridClipboardPort().write({
      text: "plain fallback",
      localToken: "token-2",
    });

    expect(result).toEqual({ localTokenWritten: false });
    expect(writeText).toHaveBeenCalledWith("plain fallback");
  });

  test("falls back to readText when reading clipboard items is denied", async () => {
    const read = vi.fn().mockRejectedValue(new DOMException("denied", "NotAllowedError"));
    const readText = vi.fn().mockResolvedValue("plain value");
    stubClipboard({ read, readText });

    await expect(createBrowserGridClipboardPort().read()).resolves.toEqual({
      text: "plain value",
    });
    expect(readText).toHaveBeenCalledOnce();
  });

  test("preserves text and the local token from a custom clipboard item", async () => {
    const item = {
      types: ["text/plain", WEB_IDEA10_CLIPBOARD_TYPE],
      getType: vi.fn(async (type: string) =>
        type === "text/plain"
          ? new Blob(["cell value"], { type: "text/plain" })
          : new Blob(["token-3"], { type: "application/x-idea10-cells" }),
      ),
    };
    const read = vi.fn().mockResolvedValue([item]);
    const readText = vi.fn().mockResolvedValue("unused");
    stubClipboard({ read, readText });

    await expect(createBrowserGridClipboardPort().read()).resolves.toEqual({
      text: "cell value",
      localToken: "token-3",
    });
    expect(readText).not.toHaveBeenCalled();
  });

  test("continues to async read when the legacy paste command throws", async () => {
    Object.defineProperty(document, "execCommand", {
      configurable: true,
      value: vi.fn(() => {
        throw new DOMException("denied", "NotAllowedError");
      }),
    });
    const read = vi.fn().mockRejectedValue(new DOMException("denied", "NotAllowedError"));
    const readText = vi.fn().mockResolvedValue("async fallback");
    stubClipboard({ read, readText });

    try {
      await expect(createBrowserGridClipboardPort().read()).resolves.toEqual({
        text: "async fallback",
      });
    } finally {
      Reflect.deleteProperty(document, "execCommand");
    }
  });
});
