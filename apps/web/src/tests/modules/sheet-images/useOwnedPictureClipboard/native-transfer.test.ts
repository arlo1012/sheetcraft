import { describe, expect, test, vi } from "vitest";
import {
  SHEETCRAFT_CLIPBOARD_TYPE,
  type GridClipboardTransfer,
} from "../../../../modules/sheet-grid/gridClipboardPort";
import { deferred, event, fixture } from "./fixture";

describe("owned clipboard native boundary", () => {
  test("toolbar write exposes only readable alt text and the existing local marker", async () => {
    const f = fixture();
    await f.clipboard.copy([["owned-group"]], "copy");
    expect(f.write).toHaveBeenCalledExactlyOnceWith({
      text: "Synthetic group",
      localToken: f.clipboard.getIdentity()!.token,
    });
    expect(Object.keys(f.write.mock.calls[0]![0]).sort()).toEqual(["localToken", "text"]);
    expect(f.nativeWrite).not.toHaveBeenCalled();
  });

  test("ClipboardEvent synchronously writes text/plain and existing marker without a tree format", async () => {
    const f = fixture();
    const native = event();
    const copy = f.clipboard.copy([["owned-group"]], "cut", native.event);
    expect(native.event.defaultPrevented).toBe(true);
    expect([...native.data.keys()]).toEqual(["text/plain", SHEETCRAFT_CLIPBOARD_TYPE]);
    expect(native.data.get("text/plain")).toBe("Synthetic group");
    expect(native.data.get(SHEETCRAFT_CLIPBOARD_TYPE)).toBe(f.clipboard.getIdentity()!.token);
    await copy;
    expect(f.nativeWrite).toHaveBeenCalledExactlyOnceWith({
      text: "Synthetic group",
      localToken: f.clipboard.getIdentity()!.token,
    });
    expect(f.write).not.toHaveBeenCalled();
  });

  test("ClipboardEvent without native-rich support uses the same serialized port write", async () => {
    const f = fixture({ writeNativeRich: undefined });
    const native = event();
    await f.clipboard.copy([["owned-group"]], "copy", native.event);
    expect(f.write).toHaveBeenCalledOnce();
    expect([...native.data.keys()]).toEqual(["text/plain", SHEETCRAFT_CLIPBOARD_TYPE]);
  });

  test("denied clipboard write retains explicit local paste but grants no unknown native ownership", async () => {
    const write = vi.fn(async () => {
      throw new Error("Synthetic clipboard denial.");
    });
    const f = fixture({ write });
    await expect(f.clipboard.copy([["owned-group"]], "cut")).resolves.toBeUndefined();
    expect(f.clipboard.hasPending()).toBe(true);
    expect(f.clipboard.paste({ row: 8, column: 4 })).toBe(true);
    expect(f.execute).toHaveBeenCalledOnce();
    expect(f.clipboard.hasPending()).toBe(false);
    await f.clipboard.copy([["owned-group"]], "copy");
    expect(f.clipboard.paste({ row: 9, column: 4 }, { text: "Synthetic group" })).toBe(false);
    expect(f.execute).toHaveBeenCalledOnce();
  });

  test("denied event custom format and async write preserve complete local session", async () => {
    const nativeWrite = vi.fn(async () => {
      throw new Error("Synthetic write denial.");
    });
    const f = fixture({ writeNativeRich: nativeWrite });
    const native = new Event("copy", { cancelable: true }) as ClipboardEvent;
    Object.defineProperty(native, "clipboardData", {
      value: {
        setData: () => {
          throw new Error("Synthetic format denial.");
        },
      },
    });
    await expect(f.clipboard.copy([["owned-group"]], "copy", native)).resolves.toBeUndefined();
    expect(f.clipboard.paste({ row: 8, column: 4 })).toBe(true);
    expect(f.sheet.floatingImages).toHaveLength(4);
  });

  test.each([
    "unknown",
    "text-only-match",
    "different-text",
    "different-token",
    "external-image",
  ] as const)("does not paste a pending tree for %s transfer", async (kind) => {
    const f = fixture();
    await f.clipboard.copy([["owned-group"]], "cut");
    const transfer: GridClipboardTransfer = { ...f.transfer() };
    if (kind === "unknown") {
      delete transfer.localToken;
      delete transfer.text;
    }
    if (kind === "text-only-match") delete transfer.localToken;
    if (kind === "different-text") transfer.text = "External text";
    if (kind === "different-token") transfer.localToken = "external-token";
    if (kind === "external-image") transfer.imageFile = new File(["synthetic"], "image.png");
    expect(f.clipboard.paste({ row: 8, column: 4 }, transfer)).toBe(false);
    expect(f.clipboard.hasPending()).toBe(false);
    expect(f.execute).not.toHaveBeenCalled();
  });

  test("matching token-only payload can claim exactly the local session", async () => {
    const f = fixture();
    await f.clipboard.copy([["owned-group"]], "copy");
    expect(
      f.clipboard.paste(
        { row: 8, column: 4 },
        {
          localToken: f.clipboard.getIdentity()!.token,
        },
      ),
    ).toBe(true);
    expect(f.execute).toHaveBeenCalledOnce();
  });

  test("normalized native newlines do not reject the same marker", async () => {
    const f = fixture();
    await f.clipboard.copy([["owned-group"], ["legacy"]], "copy");
    expect(
      f.clipboard.paste(
        { row: 8, column: 4 },
        {
          text: "Synthetic group\r\nLegacy",
          localToken: f.clipboard.getIdentity()!.token,
        },
      ),
    ).toBe(true);
  });

  test("delayed observer and clear with the old identity cannot clear a newer copy", async () => {
    const f = fixture();
    await f.clipboard.copy([["owned-group"]], "cut");
    const old = f.clipboard.getIdentity();
    await f.clipboard.copy([["legacy"]], "copy");
    const current = f.clipboard.getIdentity();
    f.clipboard.observeTransfer({ text: "External" }, old);
    expect(f.clipboard.clear(old)).toBe(false);
    expect(f.clipboard.getIdentity()).toEqual(current);
    expect(f.clipboard.clear(undefined)).toBe(false);
    f.clipboard.observeTransfer({ text: "External" }, undefined);
    expect(f.clipboard.getIdentity()).toEqual(current);
    expect(f.clipboard.clear()).toBe(true);
    expect(f.clipboard.hasPending()).toBe(false);
  });

  test("clearCut only clears its current cut identity", async () => {
    const f = fixture();
    await f.clipboard.copy([["owned-group"]], "cut");
    const old = f.clipboard.getIdentity();
    await f.clipboard.copy([["legacy"]], "cut");
    expect(f.clipboard.clearCut(old)).toBe(false);
    expect(f.clipboard.clearCut(undefined)).toBe(false);
    expect(f.clipboard.hasPending()).toBe(true);
    expect(f.clipboard.clearCut()).toBe(true);
    await f.clipboard.copy([["legacy"]], "copy");
    expect(f.clipboard.clearCut()).toBe(false);
    expect(f.clipboard.hasPending()).toBe(true);
  });

  test("writes serialize so a delayed older native write finishes before the newer one", async () => {
    const first = deferred<{ localTokenWritten: boolean }>();
    const written: string[] = [];
    const write = vi.fn(async (transfer: { text: string; localToken: string }) => {
      if (written.length === 0) {
        written.push(transfer.text);
        return first.promise;
      }
      written.push(transfer.text);
      return { localTokenWritten: true };
    });
    const f = fixture({ write });
    const older = f.clipboard.copy([["owned-group"]], "copy");
    await Promise.resolve();
    const newer = f.clipboard.copy([["legacy"]], "copy");
    await Promise.resolve();
    expect(write).toHaveBeenCalledOnce();
    expect(f.clipboard.getIdentity()!.token).toEqual(expect.any(String));
    first.resolve({ localTokenWritten: true });
    await Promise.all([older, newer]);
    expect(written).toEqual(["Synthetic group", "Legacy"]);
    expect(write.mock.calls.at(-1)![0].localToken).toBe(f.clipboard.getIdentity()!.token);
  });

  test("superseded queued writes are skipped before touching native state", async () => {
    const f = fixture();
    const older = f.clipboard.copy([["owned-group"]], "copy");
    const newer = f.clipboard.copy([["legacy"]], "copy");
    await Promise.all([older, newer]);
    expect(f.write).toHaveBeenCalledExactlyOnceWith({
      text: "Legacy",
      localToken: f.clipboard.getIdentity()!.token,
    });
  });

  test("explicit clear before queued native write prevents an old token from being published", async () => {
    const f = fixture();
    const copy = f.clipboard.copy([["owned-group"]], "cut");
    expect(f.clipboard.clear()).toBe(true);
    await copy;
    expect(f.write).not.toHaveBeenCalled();
    expect(f.clipboard.paste({ row: 8, column: 4 })).toBe(false);
  });
});
