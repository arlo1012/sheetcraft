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

function stubLegacyPaste(text: string): () => void {
  Object.defineProperty(document, "execCommand", {
    configurable: true,
    value: vi.fn(() => {
      const event = new Event("paste", { bubbles: true, cancelable: true });
      Object.defineProperty(event, "clipboardData", {
        value: {
          types: ["text/plain"],
          getData: (format: string) => (format === "text/plain" ? text : ""),
        },
      });
      document.dispatchEvent(event);
      return true;
    }),
  });
  return () => Reflect.deleteProperty(document, "execCommand");
}

function createRichClipboardItem(text: string, token: string) {
  return {
    types: ["text/plain", WEB_IDEA10_CLIPBOARD_TYPE],
    getType: vi.fn(async (type: string) =>
      type === "text/plain"
        ? new Blob([text], { type: "text/plain" })
        : new Blob([token], { type: "application/x-idea10-cells" }),
    ),
  };
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

  test("does not downgrade a failed native rich upgrade to text-only clipboard data", async () => {
    const write = vi.fn().mockRejectedValue(new DOMException("unsupported", "NotSupportedError"));
    const writeText = vi.fn().mockResolvedValue(undefined);
    stubClipboard({ write, writeText });
    stubClipboardItem();

    await expect(
      createBrowserGridClipboardPort().writeNativeRich?.({
        text: "native source",
        localToken: "token-native",
      }),
    ).rejects.toThrow("unsupported");
    expect(write).toHaveBeenCalledOnce();
    expect(writeText).not.toHaveBeenCalled();
  });

  test("reports a local token written by the legacy copy event", async () => {
    const setData = vi.fn();
    vi.stubGlobal("navigator", {});
    vi.stubGlobal("ClipboardItem", undefined);
    Object.defineProperty(document, "execCommand", {
      configurable: true,
      value: vi.fn(() => {
        const event = new Event("copy", { bubbles: true, cancelable: true });
        Object.defineProperty(event, "clipboardData", { value: { setData } });
        document.dispatchEvent(event);
        return true;
      }),
    });

    try {
      await expect(
        createBrowserGridClipboardPort().write({ text: "legacy", localToken: "token-legacy" }),
      ).resolves.toEqual({ localTokenWritten: true });
      expect(setData).toHaveBeenCalledWith("text/plain", "legacy");
      expect(setData).toHaveBeenCalledWith("application/x-idea10-cells", "token-legacy");
    } finally {
      Reflect.deleteProperty(document, "execCommand");
    }
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

  test("hydrates a native text transfer with an async custom token only when the texts match", async () => {
    const removeLegacyPaste = stubLegacyPaste("line one\r\nline two");
    const read = vi
      .fn()
      .mockResolvedValue([createRichClipboardItem("line one\nline two", "token-4")]);
    const readText = vi.fn().mockResolvedValue("unused");
    stubClipboard({ read, readText });

    try {
      await expect(createBrowserGridClipboardPort().read()).resolves.toEqual({
        text: "line one\r\nline two",
        localToken: "token-4",
      });
      expect(read).toHaveBeenCalledOnce();
    } finally {
      removeLegacyPaste();
    }
  });

  test("does not attach an async token from a different clipboard text", async () => {
    const removeLegacyPaste = stubLegacyPaste("captured native text");
    const read = vi
      .fn()
      .mockResolvedValue([createRichClipboardItem("later clipboard text", "token-5")]);
    const readText = vi.fn().mockResolvedValue("unused");
    stubClipboard({ read, readText });

    try {
      await expect(createBrowserGridClipboardPort().read()).resolves.toEqual({
        text: "captured native text",
      });
    } finally {
      removeLegacyPaste();
    }
  });

  test("keeps native text when async revalidation is denied", async () => {
    const removeLegacyPaste = stubLegacyPaste("native fallback");
    const read = vi.fn().mockRejectedValue(new DOMException("denied", "NotAllowedError"));
    const readText = vi.fn().mockRejectedValue(new DOMException("denied", "NotAllowedError"));
    stubClipboard({ read, readText });

    try {
      await expect(createBrowserGridClipboardPort().read()).resolves.toEqual({
        text: "native fallback",
      });
    } finally {
      removeLegacyPaste();
    }
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
