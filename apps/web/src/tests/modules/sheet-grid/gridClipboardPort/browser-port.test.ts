import { afterEach, describe, expect, test, vi } from "vitest";
import {
  createBrowserGridClipboardPort,
  WEB_FLOATING_IMAGE_CLIPBOARD_TYPE,
} from "../../../../modules/sheet-grid/gridClipboardPort";
import { FLOATING_IMAGE_CLIPBOARD_TYPE } from "../../../../modules/sheet-images/imageClipboard";

const WEB_SHEETCRAFT_CLIPBOARD_TYPE = "web application/x-sheetcraft-cells";

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
    types: ["text/plain", WEB_SHEETCRAFT_CLIPBOARD_TYPE],
    getType: vi.fn(async (type: string) =>
      type === "text/plain"
        ? new Blob([text], { type: "text/plain" })
        : new Blob([token], { type: "application/x-sheetcraft-cells" }),
    ),
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("browser grid clipboard port", () => {
  test("matching malformed async image data stays invalid through native text hydration", async () => {
    const restore = stubLegacyPaste("Picture caption");
    const item = {
      types: ["text/plain", WEB_FLOATING_IMAGE_CLIPBOARD_TYPE],
      getType: async (type: string) =>
        new Blob([type === "text/plain" ? "Picture caption" : "{"], { type: "text/plain" }),
    };
    stubClipboard({ read: vi.fn().mockResolvedValue([item]) });
    try {
      await expect(createBrowserGridClipboardPort().read()).resolves.toEqual({
        text: "Picture caption",
        invalidFloatingImage: true,
      });
    } finally {
      restore();
    }
  });
  test("does not borrow an async token for native picture metadata with matching alt text", async () => {
    const picture = {
      id: "old",
      assetId: "old-asset",
      altText: "Same caption",
      anchor: { row: 0, column: 0 },
      offsetX: 0,
      offsetY: 0,
      width: 40,
      height: 20,
    };
    Object.defineProperty(document, "execCommand", {
      configurable: true,
      value: vi.fn(() => {
        const event = new Event("paste", { bubbles: true, cancelable: true });
        Object.defineProperty(event, "clipboardData", {
          value: {
            types: ["text/plain", FLOATING_IMAGE_CLIPBOARD_TYPE],
            getData: (format: string) =>
              format === "text/plain"
                ? picture.altText
                : format === FLOATING_IMAGE_CLIPBOARD_TYPE
                  ? JSON.stringify(picture)
                  : "",
          },
        });
        document.dispatchEvent(event);
        return true;
      }),
    });
    stubClipboard({
      read: vi.fn().mockResolvedValue([createRichClipboardItem(picture.altText, "new-cut-token")]),
    });
    try {
      const transfer = await createBrowserGridClipboardPort().read();
      expect(transfer.floatingImage).toEqual(picture);
      expect(transfer.localToken).toBeUndefined();
    } finally {
      Reflect.deleteProperty(document, "execCommand");
    }
  });
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

  test("writes floating metadata through Chromium's web custom format", async () => {
    const write = vi.fn().mockResolvedValue(undefined);
    stubClipboard({ write });
    stubClipboardItem();
    await createBrowserGridClipboardPort().write({
      text: "logo",
      localToken: "float-token",
      floatingImage: {
        id: "float",
        assetId: "asset",
        altText: "logo",
        anchor: { row: 0, column: 0 },
        offsetX: 0,
        offsetY: 0,
        width: 40,
        height: 20,
      },
    });
    const item = write.mock.calls[0]?.[0][0] as { data: Record<string, Blob> };
    expect(item.data[WEB_FLOATING_IMAGE_CLIPBOARD_TYPE]).toBeInstanceOf(Blob);
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
      expect(setData).toHaveBeenCalledWith("application/x-sheetcraft-cells", "token-legacy");
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

  test("reads a bitmap clipboard item as an image file", async () => {
    const image = new Blob(["png"], { type: "image/png" });
    stubClipboard({
      read: vi
        .fn()
        .mockResolvedValue([{ types: ["image/png"], getType: vi.fn(async () => image) }]),
      readText: vi.fn(),
    });
    const transfer = await createBrowserGridClipboardPort().read({ preferAsync: true });
    expect(transfer.imageFile).toMatchObject({ type: "image/png", name: "pasted-image" });
  });

  test("preserves text and the local token from a custom clipboard item", async () => {
    const item = {
      types: ["text/plain", WEB_SHEETCRAFT_CLIPBOARD_TYPE],
      getType: vi.fn(async (type: string) =>
        type === "text/plain"
          ? new Blob(["cell value"], { type: "text/plain" })
          : new Blob(["token-3"], { type: "application/x-sheetcraft-cells" }),
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
