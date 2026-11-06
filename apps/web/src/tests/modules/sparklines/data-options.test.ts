// 未执行：按用户要求仅编写测试，不运行检查。
import { afterEach, describe, expect, test, vi } from "vitest";
import { effectScope, nextTick, shallowRef, type EffectScope } from "vue";
import type { CellSparkline } from "@sheetcraft/core/sparklines";
import { useSparklineDataOptions } from "../../../modules/sparklines/useSparklineDataOptions";
import type {
  SparklineStylePatch,
  SparklineToolContext,
} from "../../../modules/sparklines/useSparklineTools";

const scopes: EffectScope[] = [];
afterEach(() => scopes.splice(0).forEach((scope) => scope.stop()));

function createContext(patch: Partial<SparklineToolContext> = {}) {
  const value: CellSparkline = {
    type: "line",
    source: null,
    color: "#123456",
    negativeColor: "#654321",
    markers: false,
    axis: false,
    showHidden: false,
    empty: "gap",
  };
  return {
    key: "sheet-selection",
    value,
    mixed: [],
    mixedPointVisibility: [],
    disabled: false,
    apply: vi.fn((_patch: SparklineStylePatch) => true),
    edit: vi.fn(),
    clear: vi.fn(() => true),
    clearGroup: vi.fn(() => true),
    canGroup: false,
    canUngroup: false,
    group: vi.fn(() => false),
    ungroup: vi.fn(() => false),
    ...patch,
  } satisfies SparklineToolContext;
}

function fixture() {
  const initial = createContext();
  const context = shallowRef<SparklineToolContext | undefined>(initial);
  const flush = vi.fn(() => true);
  const scope = effectScope();
  scopes.push(scope);
  const actions = scope.run(() =>
    useSparklineDataOptions({ getContext: () => context.value, flush }),
  )!;
  return { initial, context, flush, actions };
}

describe("sparkline data options dialog", () => {
  test("initializes homogeneous empty-cell and hidden-data settings without applying anything", () => {
    const f = fixture();
    f.actions.open();

    expect(f.actions.dialog.value?.initial).toEqual({ empty: "gap", showHidden: false });
    expect(f.actions.failed.value).toBe(false);
    expect(f.initial.apply).not.toHaveBeenCalled();
  });

  test.each(["missing context", "disabled context", "flush refusal"] as const)(
    "does not open after %s",
    (block) => {
      const f = fixture();
      if (block === "missing context") f.context.value = undefined;
      if (block === "disabled context") f.context.value = createContext({ disabled: true });
      if (block === "flush refusal") f.flush.mockReturnValue(false);
      f.actions.open();

      expect(f.actions.dialog.value).toBeUndefined();
      expect(f.initial.apply).not.toHaveBeenCalled();
    },
  );

  test("captures the current context after flushing pending edits", () => {
    const f = fixture();
    const replacement = createContext({
      key: "after-flush",
      value: { ...f.initial.value, empty: "connect", showHidden: true },
    });
    f.flush.mockImplementation(() => {
      f.context.value = replacement;
      return true;
    });
    f.actions.open();

    expect(f.actions.dialog.value?.initial).toEqual({ empty: "connect", showHidden: true });
    f.actions.dialog.value!.confirm({ empty: "zero" });
    expect(replacement.apply).toHaveBeenCalledWith({ empty: "zero" });
    expect(f.initial.apply).not.toHaveBeenCalled();
  });

  test.each([
    { mixed: ["empty"] as const, empty: undefined, showHidden: false },
    { mixed: ["showHidden"] as const, empty: "gap", showHidden: undefined },
    { mixed: ["empty", "showHidden"] as const, empty: undefined, showHidden: undefined },
  ])("leaves mixed fields $mixed unset in the initial draft", ({ mixed, empty, showHidden }) => {
    const f = fixture();
    f.context.value = createContext({ mixed });
    f.actions.open();

    expect(f.actions.dialog.value?.initial.empty).toBe(empty);
    expect(f.actions.dialog.value?.initial.showHidden).toBe(showHidden);
    expect(f.initial.apply).not.toHaveBeenCalled();
  });

  test.each([
    { patch: { empty: "zero" as const } },
    { patch: { showHidden: false } },
    { patch: { empty: "connect" as const, showHidden: true } },
  ])("applies exactly the user-selected fields $patch", ({ patch }) => {
    const f = fixture();
    const apply = vi.fn((_patch: SparklineStylePatch) => true);
    f.context.value = createContext({ mixed: ["empty", "showHidden"], apply });
    f.actions.open();
    f.actions.dialog.value!.confirm(patch);

    expect(apply.mock.calls).toEqual([[patch]]);
    expect(f.actions.dialog.value).toBeUndefined();
    expect(f.actions.failed.value).toBe(false);
  });

  test("closes an unchanged empty patch without calling apply", () => {
    const f = fixture();
    f.actions.open();
    f.actions.dialog.value!.confirm({});

    expect(f.initial.apply).not.toHaveBeenCalled();
    expect(f.actions.dialog.value).toBeUndefined();
    expect(f.actions.failed.value).toBe(false);
  });

  test("keeps a refused draft open and clears failure after a successful retry", () => {
    const f = fixture();
    const apply = vi.fn((_patch: SparklineStylePatch) => true).mockReturnValueOnce(false);
    f.context.value = createContext({ apply });
    f.actions.open();
    const target = f.actions.dialog.value!;
    target.confirm({ empty: "zero" });

    expect(f.actions.dialog.value).toBe(target);
    expect(f.actions.failed.value).toBe(true);
    target.confirm({ empty: "zero" });
    expect(apply.mock.calls).toEqual([[{ empty: "zero" }], [{ empty: "zero" }]]);
    expect(f.actions.dialog.value).toBeUndefined();
    expect(f.actions.failed.value).toBe(false);
  });

  test("clears a failed draft when closed and starts a fresh dialog without applying again", () => {
    const f = fixture();
    const apply = vi.fn((_patch: SparklineStylePatch) => false);
    f.context.value = createContext({ apply });
    f.actions.open();
    f.actions.dialog.value!.confirm({ showHidden: true });
    expect(f.actions.failed.value).toBe(true);

    f.actions.close();
    expect(f.actions.dialog.value).toBeUndefined();
    expect(f.actions.failed.value).toBe(false);
    f.actions.open();
    expect(f.actions.dialog.value).toBeDefined();
    expect(f.actions.failed.value).toBe(false);
    expect(apply).toHaveBeenCalledTimes(1);
  });

  test.each(["removed", "replaced with the same key"] as const)(
    "automatically closes the old target when its context is %s and rejects retained confirmation",
    async (change) => {
      const f = fixture();
      f.actions.open();
      const old = f.actions.dialog.value!;
      f.context.value = change === "removed" ? undefined : createContext({ key: f.initial.key });
      old.confirm({ empty: "zero" });
      await nextTick();

      expect(f.initial.apply).not.toHaveBeenCalled();
      expect(f.actions.dialog.value).toBeUndefined();
      expect(f.actions.failed.value).toBe(false);
    },
  );

  test.each(["confirm", "close"] as const)(
    "does not let an obsolete %s callback alter a reopened dialog or its feedback",
    (callback) => {
      const f = fixture();
      f.actions.open();
      const old = f.actions.dialog.value!;
      f.actions.close();
      f.actions.open();
      const current = f.actions.dialog.value!;

      expect(current).not.toBe(old);
      if (callback === "confirm") old.confirm({ showHidden: true });
      else old.close();

      expect(f.initial.apply).not.toHaveBeenCalled();
      expect(f.actions.dialog.value).toBe(current);
      expect(f.actions.failed.value).toBe(false);
    },
  );
});
