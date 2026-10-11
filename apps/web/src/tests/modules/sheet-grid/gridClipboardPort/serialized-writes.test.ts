import { afterEach, describe, expect, test, vi } from "vitest";
import { createBrowserGridClipboardPort } from "../../../../modules/sheet-grid/gridClipboardPort";

class MockClipboardItem {
  constructor(readonly data: Record<string, Blob>) {}
}

describe("browser clipboard shared write ownership", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  test("an older pending owned rich write finishes before the newer cell text write across ports", async () => {
    let finishOld!: () => void;
    const committed: string[] = [];
    const write = vi.fn(async (items: MockClipboardItem[]) => {
      const text = await items[0]!.data["text/plain"]!.text();
      if (text === "Old owned group") {
        await new Promise<void>((resolve) => (finishOld = resolve));
        committed.push(text);
      } else throw new DOMException("Custom format denied", "NotAllowedError");
    });
    const writeText = vi.fn(async (text: string) => {
      committed.push(text);
    });
    vi.stubGlobal("ClipboardItem", MockClipboardItem);
    vi.stubGlobal("navigator", { clipboard: { write, writeText } });
    const ownedPort = createBrowserGridClipboardPort();
    const cellPort = createBrowserGridClipboardPort();
    const old = ownedPort.writeNativeRich!({
      text: "Old owned group",
      localToken: "old-owned-token",
    });
    await vi.waitFor(() => expect(write).toHaveBeenCalledOnce());
    await vi.waitFor(() => expect(finishOld).toBeTypeOf("function"));
    const newest = cellPort.write({ text: "Newest cell copy", localToken: "new-cell-token" });
    await Promise.resolve();
    expect(write).toHaveBeenCalledOnce();
    expect(writeText).not.toHaveBeenCalled();
    expect(committed).toEqual([]);
    finishOld();
    await old;
    await expect(newest).resolves.toEqual({ localTokenWritten: false });
    expect(committed).toEqual(["Old owned group", "Newest cell copy"]);
    expect(write).toHaveBeenCalledTimes(2);
    expect(writeText).toHaveBeenCalledExactlyOnceWith("Newest cell copy");
  });

  test("a failed older rich write does not poison the next queued clipboard owner", async () => {
    let rejectOld!: (reason: unknown) => void;
    const write = vi
      .fn()
      .mockImplementationOnce(() => new Promise<void>((_resolve, reject) => (rejectOld = reject)))
      .mockResolvedValueOnce(undefined);
    vi.stubGlobal("ClipboardItem", MockClipboardItem);
    vi.stubGlobal("navigator", { clipboard: { write, writeText: vi.fn() } });
    const oldPort = createBrowserGridClipboardPort();
    const nextPort = createBrowserGridClipboardPort();
    const old = oldPort.writeNativeRich!({ text: "Old failed group", localToken: "old-token" });
    const failure = expect(old).rejects.toThrow("Old write rejected");
    await vi.waitFor(() => expect(write).toHaveBeenCalledOnce());
    const next = nextPort.write({ text: "Next owner", localToken: "next-token" });
    await Promise.resolve();
    expect(write).toHaveBeenCalledOnce();
    rejectOld(new Error("Old write rejected"));
    await failure;
    await expect(next).resolves.toEqual({ localTokenWritten: true });
    expect(write).toHaveBeenCalledTimes(2);
    const item = write.mock.calls[1]![0][0] as MockClipboardItem;
    expect(await item.data["text/plain"]!.text()).toBe("Next owner");
    expect(await item.data["web application/x-sheetcraft-cells"]!.text()).toBe("next-token");
  });
});
