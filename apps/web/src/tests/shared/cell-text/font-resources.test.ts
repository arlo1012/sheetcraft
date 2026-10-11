import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  CellFontResourceError,
  cellFontResourceNeedsLoading,
  ensureCellFontResource,
  getCellFontResourceFamilies,
  getCellFontResourceKind,
  getCellFontResourceStatus,
  invalidateCellFontResource,
  retryCellFontResource,
  useCellFontResources,
} from "../../../shared/cell-text/font-resources";

const state = vi.hoisted(() => ({
  managed: vi.fn<() => Promise<void>>(),
  local: vi.fn<() => Promise<{ family: string } | undefined>>(),
  fonts: undefined as { value: readonly { family: string }[] } | undefined,
  invalidateMetrics: vi.fn(),
}));
vi.mock("../../../shared/cell-text/text-metrics", () => ({
  invalidateCellTextFontMetrics: state.invalidateMetrics,
}));

vi.mock("../../../shared/cell-text/managed-fonts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../shared/cell-text/managed-fonts")>()),
  ensureManagedCellFont: state.managed,
}));
vi.mock("../../../shared/cell-text/local-font-source", async () => {
  const { shallowRef } = await import("vue");
  state.fonts = shallowRef<readonly { family: string }[]>([]);
  return {
    ensureLocalSymbolFont: state.local,
    useLocalSymbolFonts: () => ({ fonts: state.fonts }),
  };
});

const alias = `SheetcraftLocal_${"a".repeat(64)}`;

beforeEach(() => {
  state.managed.mockReset().mockResolvedValue(undefined);
  state.local.mockReset().mockResolvedValue(undefined);
  state.invalidateMetrics.mockReset();
});
afterEach(() => {
  for (const family of useCellFontResources().resources.value.keys())
    invalidateCellFontResource(family);
  state.fonts!.value = [];
});

describe("shared cell-font resource readiness", () => {
  test("only loads owned exact families; ordinary CSS and malformed aliases stay on the system path", async () => {
    for (const family of ["Arial", "Wingdings", "Noto Sans, Arial", "SheetcraftLocal_short"]) {
      await ensureCellFontResource(family);
      expect(getCellFontResourceKind(family)).toBe("system");
      expect(cellFontResourceNeedsLoading(family)).toBe(false);
    }
    expect(state.managed).not.toHaveBeenCalled();
    expect(state.local).not.toHaveBeenCalled();
    expect(getCellFontResourceFamilies(`"Noto Sans", 'Arial', "${alias}", Noto Sans`)).toEqual([
      "Noto Sans",
      alias,
    ]);
    expect(getCellFontResourceFamilies('"Noto Sans, Arial"')).toEqual([]);
  });

  test("deduplicates actual managed loads and publishes readiness only after completion", async () => {
    let resolve!: () => void;
    state.managed.mockImplementation(
      () =>
        new Promise<void>((done) => {
          resolve = done;
        }),
    );
    const { revision, resources } = useCellFontResources();
    const before = revision.value;
    const first = ensureCellFontResource("Noto Sans Math");
    expect(ensureCellFontResource("Noto Sans Math")).toBe(first);
    expect(resources.value.get("Noto Sans Math")?.state).toBe("loading");
    expect(state.invalidateMetrics).not.toHaveBeenCalled();
    await Promise.resolve();
    expect(state.managed).toHaveBeenCalledTimes(1);
    expect(cellFontResourceNeedsLoading("Noto Sans Math")).toBe(true);
    resolve();
    await first;
    expect(getCellFontResourceStatus("Noto Sans Math").state).toBe("ready");
    expect(revision.value).toBeGreaterThan(before);
    expect(state.invalidateMetrics).toHaveBeenCalledTimes(1);
    await ensureCellFontResource("Noto Sans Math");
    expect(state.managed).toHaveBeenCalledTimes(1);
    expect(state.invalidateMetrics).toHaveBeenCalledTimes(1);
  });

  test("missing persisted aliases fail explicitly and do not retry on viewport refresh", async () => {
    const first = ensureCellFontResource(alias);
    await expect(first).rejects.toMatchObject({ family: alias, code: "missing-local-resource" });
    expect(getCellFontResourceStatus(alias).state).toBe("error");
    expect(ensureCellFontResource(alias)).toBe(first);
    await expect(ensureCellFontResource(alias)).rejects.toBeInstanceOf(CellFontResourceError);
    expect(state.local).toHaveBeenCalledTimes(1);
    state.local.mockResolvedValue({ family: alias });
    await retryCellFontResource(alias);
    expect(state.local).toHaveBeenCalledTimes(2);
    expect(getCellFontResourceStatus(alias).state).toBe("ready");
  });

  test("an explicit picker import clears a cached missing alias without another storage query", async () => {
    await expect(ensureCellFontResource(alias)).rejects.toMatchObject({
      code: "missing-local-resource",
    });
    const before = useCellFontResources().revision.value;
    state.fonts!.value = [{ family: alias }];
    expect(getCellFontResourceStatus(alias).state).toBe("ready");
    expect(useCellFontResources().revision.value).toBeGreaterThan(before);
    await ensureCellFontResource(alias);
    expect(state.local).toHaveBeenCalledTimes(1);
  });

  test("reports load failures with their cause and supports an explicit managed retry", async () => {
    const cause = new Error("asset failed");
    state.managed.mockRejectedValueOnce(cause);
    await expect(ensureCellFontResource("Noto Sans Symbols")).rejects.toMatchObject({
      code: "font-load",
      cause,
    });
    await expect(ensureCellFontResource("Noto Sans Symbols")).rejects.toMatchObject({
      code: "font-load",
    });
    expect(state.managed).toHaveBeenCalledTimes(1);
    await retryCellFontResource("Noto Sans Symbols");
    expect(getCellFontResourceStatus("Noto Sans Symbols").state).toBe("ready");
    expect(state.managed).toHaveBeenCalledTimes(2);
  });

  test("an invalidated pending attempt cannot publish a stale completion", async () => {
    let resolve!: () => void;
    state.managed.mockImplementationOnce(
      () =>
        new Promise<void>((done) => {
          resolve = done;
        }),
    );
    const first = ensureCellFontResource("Noto Sans Symbols 2");
    await Promise.resolve();
    invalidateCellFontResource("Noto Sans Symbols 2");
    resolve();
    await first;
    expect(getCellFontResourceStatus("Noto Sans Symbols 2").state).toBe("idle");
    await ensureCellFontResource("Noto Sans Symbols 2");
    expect(getCellFontResourceStatus("Noto Sans Symbols 2").state).toBe("ready");
  });
});
