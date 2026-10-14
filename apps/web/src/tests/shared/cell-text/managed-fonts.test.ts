import { afterEach, describe, expect, test, vi } from "vitest";
import {
  MANAGED_CELL_FONTS,
  ensureManagedCellFont,
  getLoadedManagedCellFontFace,
} from "../../../shared/cell-text/managed-fonts";

const originalFonts = Object.getOwnPropertyDescriptor(document, "fonts");
afterEach(() => {
  vi.unstubAllGlobals();
  if (originalFonts) Object.defineProperty(document, "fonts", originalFonts);
  else Reflect.deleteProperty(document, "fonts");
});

function fixture(load: () => Promise<unknown>) {
  const added: unknown[] = [];
  const removed: unknown[] = [];
  const constructed: unknown[][] = [];
  class Face {
    status = "unloaded";
    constructor(...args: unknown[]) {
      constructed.push(args);
    }
    async load() {
      await load();
      this.status = "loaded";
      return this;
    }
  }
  vi.stubGlobal("FontFace", Face);
  Object.defineProperty(document, "fonts", {
    configurable: true,
    value: {
      add: (face: unknown) => added.push(face),
      delete: (face: unknown) => removed.push(face),
    },
  });
  return { added, removed, constructed };
}

describe("exact managed cell-font loading", () => {
  test("keeps four actual family names and does not guess unknown system-font coverage", async () => {
    const state = fixture(() => Promise.resolve());
    expect(MANAGED_CELL_FONTS.map((font) => font.family)).toEqual([
      "Noto Sans",
      "Noto Sans Math",
      "Noto Sans Symbols",
      "Noto Sans Symbols 2",
    ]);
    await ensureManagedCellFont("Unverified System Font");
    expect(state.constructed).toEqual([]);
    expect(state.added).toEqual([]);
    expect(getLoadedManagedCellFontFace("Unverified System Font")).toBeUndefined();
    expect(getLoadedManagedCellFontFace("Noto Sans")).toBeUndefined();
  });
  test("trusted source lookup never loads and returns only the exact successfully loaded owned face", async () => {
    let finish!: () => void;
    const state = fixture(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    expect(getLoadedManagedCellFontFace("Noto Sans")).toBeUndefined();
    expect(state.constructed).toEqual([]);
    const pending = ensureManagedCellFont("Noto Sans");
    expect(getLoadedManagedCellFontFace("Noto Sans")).toBeUndefined();
    finish();
    await pending;
    expect(getLoadedManagedCellFontFace("Noto Sans")).toBe(state.added[0]);
    expect(state.constructed).toHaveLength(1);
  });
  test("loads packaged bytes once, without local(), and only resolves after actual load", async () => {
    let resolve!: () => void;
    const state = fixture(
      () =>
        new Promise<void>((done) => {
          resolve = done;
        }),
    );
    const first = ensureManagedCellFont("Noto Sans Math");
    const second = ensureManagedCellFont("Noto Sans Math");
    expect(first).toBe(second);
    expect(state.added).toHaveLength(1);
    expect(state.constructed[0]?.[0]).toBe("Noto Sans Math");
    expect(state.constructed[0]?.[1]).toContain("NotoSansMath-Regular.ttf");
    expect(state.constructed[0]?.[1]).not.toContain("local(");
    expect(state.constructed[0]?.[2]).toEqual({ weight: "400", style: "normal", display: "swap" });
    let completed = false;
    void first.then(() => {
      completed = true;
    });
    await Promise.resolve();
    expect(completed).toBe(false);
    resolve();
    await first;
    expect(completed).toBe(true);
  });
  test("removes a failed face and permits an explicit retry rather than claiming fallback succeeded", async () => {
    let failed = true;
    const state = fixture(() =>
      failed ? Promise.reject(new Error("font asset failed")) : Promise.resolve(),
    );
    await expect(ensureManagedCellFont("Noto Sans Symbols")).rejects.toThrow("font asset failed");
    expect(getLoadedManagedCellFontFace("Noto Sans Symbols")).toBeUndefined();
    expect(state.removed).toEqual(state.added);
    failed = false;
    await ensureManagedCellFont("Noto Sans Symbols");
    expect(state.added).toHaveLength(2);
    expect(state.removed).toHaveLength(1);
  });
  test("reports an unavailable Font Loading API", async () => {
    vi.stubGlobal("FontFace", undefined);
    await expect(ensureManagedCellFont("Noto Sans Symbols 2")).rejects.toThrow(
      "Font Loading API is unavailable",
    );
  });
});
