// 未执行：按用户要求仅编写测试，不运行检查。
import { afterEach, describe, expect, test, vi } from "vitest";
import { effectScope, nextTick, shallowRef, type EffectScope } from "vue";
import type { CellSparkline } from "@sheetcraft/core/sparklines";
import { useSparklineAxisLimit } from "../../../modules/sparklines/useSparklineAxisLimit";
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
    minAxis: { type: "custom", value: -12 },
    maxAxis: { type: "custom", value: 45 },
  };
  return {
    key: "sheet-selection",
    value,
    mixed: [],
    mixedPointVisibility: [],
    mixedAxisModes: [],
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
    useSparklineAxisLimit({ getContext: () => context.value, flush }),
  )!;
  return { initial, context, flush, scope, actions };
}

describe("sparkline custom axis limit dialog", () => {
  test.each([
    { end: "minAxis" as const, value: -12 },
    { end: "maxAxis" as const, value: 45 },
  ])("initializes the $end value independently without applying a change", ({ end, value }) => {
    const f = fixture();
    f.actions.open(end);

    expect(f.actions.dialog.value?.initial).toEqual({ end, value });
    expect(f.actions.failed.value).toBe(false);
    expect(f.initial.apply).not.toHaveBeenCalled();
  });

  test.each(["minAxis", "maxAxis"] as const)(
    "leaves %s unset when selected custom values differ",
    (end) => {
      const f = fixture();
      f.context.value = createContext({ mixed: [end] });
      f.actions.open(end);

      expect(f.actions.dialog.value?.initial.end).toBe(end);
      expect(f.actions.dialog.value?.initial.value).toBeUndefined();
    },
  );

  test.each(["individual", "group"] as const)(
    "does not seed a custom number from the current %s mode",
    (type) => {
      const f = fixture();
      f.context.value = createContext({
        value: { ...f.initial.value, minAxis: { type } },
      });
      f.actions.open("minAxis");

      expect(f.actions.dialog.value?.initial.value).toBeUndefined();
    },
  );

  test("leaves a mixed-mode endpoint blank without hiding the other endpoint's custom value", () => {
    const f = fixture();
    f.context.value = createContext({ mixed: ["minAxis"], mixedAxisModes: ["minAxis"] });
    f.actions.open("minAxis");
    expect(f.actions.dialog.value?.initial.value).toBeUndefined();
    f.actions.open("maxAxis");
    expect(f.actions.dialog.value?.initial).toEqual({ end: "maxAxis", value: 45 });
  });

  test.each(["missing context", "disabled context", "flush refusal"] as const)(
    "does not open after %s",
    (block) => {
      const f = fixture();
      if (block === "missing context") f.context.value = undefined;
      if (block === "disabled context") f.context.value = createContext({ disabled: true });
      if (block === "flush refusal") f.flush.mockReturnValue(false);
      f.actions.open("minAxis");

      expect(f.actions.dialog.value).toBeUndefined();
      expect(f.initial.apply).not.toHaveBeenCalled();
    },
  );

  test("captures the active context after pending edits flush", () => {
    const f = fixture();
    const replacement = createContext({
      key: "after-flush",
      value: { ...f.initial.value, maxAxis: { type: "custom", value: 80 } },
    });
    f.flush.mockImplementation(() => {
      f.context.value = replacement;
      return true;
    });
    f.actions.open("maxAxis");

    expect(f.actions.dialog.value?.initial).toEqual({ end: "maxAxis", value: 80 });
    f.actions.dialog.value!.confirm(100);
    expect(replacement.apply).toHaveBeenCalledWith({ maxAxis: { type: "custom", value: 100 } });
    expect(f.initial.apply).not.toHaveBeenCalled();
  });

  test.each(["minAxis", "maxAxis"] as const)(
    "applies a finite number only to %s and closes after acceptance",
    (end) => {
      const f = fixture();
      f.actions.open(end);
      f.actions.dialog.value!.confirm(-2.75);

      expect(f.initial.apply).toHaveBeenCalledTimes(1);
      expect(f.initial.apply).toHaveBeenCalledWith({ [end]: { type: "custom", value: -2.75 } });
      expect(f.actions.dialog.value).toBeUndefined();
      expect(f.actions.failed.value).toBe(false);
    },
  );

  test.each([0, 1e15])("accepts the finite axis value %s", (value) => {
    const f = fixture();
    f.actions.open("minAxis");
    f.actions.dialog.value!.confirm(value);
    expect(f.initial.apply).toHaveBeenCalledWith({ minAxis: { type: "custom", value } });
  });

  test.each([NaN, Infinity, -Infinity])("rejects the non-finite axis value %s", (value) => {
    const f = fixture();
    f.actions.open("maxAxis");
    const target = f.actions.dialog.value!;
    target.confirm(value);

    expect(f.initial.apply).not.toHaveBeenCalled();
    expect(f.actions.dialog.value).toBe(target);
  });

  test("keeps a refused draft and clears feedback after a successful retry", () => {
    const f = fixture();
    const apply = vi.fn((_patch: SparklineStylePatch) => true).mockReturnValueOnce(false);
    f.context.value = createContext({ apply });
    f.actions.open("minAxis");
    const target = f.actions.dialog.value!;
    target.confirm(-4);

    expect(f.actions.dialog.value).toBe(target);
    expect(f.actions.failed.value).toBe(true);
    target.confirm(-4);
    expect(apply.mock.calls).toEqual([
      [{ minAxis: { type: "custom", value: -4 } }],
      [{ minAxis: { type: "custom", value: -4 } }],
    ]);
    expect(f.actions.dialog.value).toBeUndefined();
    expect(f.actions.failed.value).toBe(false);
  });

  test("clears refusal on close and opens a fresh endpoint with a new key", () => {
    const f = fixture();
    const apply = vi.fn((_patch: SparklineStylePatch) => false);
    f.context.value = createContext({ apply });
    f.actions.open("minAxis");
    const old = f.actions.dialog.value!;
    old.confirm(-5);
    expect(f.actions.failed.value).toBe(true);
    f.actions.close();

    expect(f.actions.dialog.value).toBeUndefined();
    expect(f.actions.failed.value).toBe(false);
    f.actions.open("maxAxis");
    expect(f.actions.dialog.value?.key).not.toBe(old.key);
    expect(f.actions.dialog.value?.initial).toEqual({ end: "maxAxis", value: 45 });
    expect(apply).toHaveBeenCalledTimes(1);
  });

  test.each(["removed", "replaced with the same key"] as const)(
    "closes when the owner is %s and rejects its retained confirmation",
    async (change) => {
      const f = fixture();
      f.actions.open("minAxis");
      const old = f.actions.dialog.value!;
      const replacement = createContext({ key: f.initial.key });
      f.context.value = change === "removed" ? undefined : replacement;
      old.confirm(-6);
      await nextTick();

      expect(f.initial.apply).not.toHaveBeenCalled();
      expect(replacement.apply).not.toHaveBeenCalled();
      expect(f.actions.dialog.value).toBeUndefined();
      expect(f.actions.failed.value).toBe(false);
    },
  );

  test.each(["confirm", "close"] as const)(
    "ignores an obsolete %s callback after reopening for the other endpoint",
    (callback) => {
      const f = fixture();
      const apply = vi.fn((_patch: SparklineStylePatch) => false);
      f.context.value = createContext({ apply });
      f.actions.open("minAxis");
      const old = f.actions.dialog.value!;
      f.actions.open("maxAxis");
      const current = f.actions.dialog.value!;
      current.confirm(50);
      expect(f.actions.failed.value).toBe(true);
      if (callback === "confirm") old.confirm(-7);
      else old.close();

      expect(apply).toHaveBeenCalledTimes(1);
      expect(f.actions.dialog.value).toBe(current);
      expect(f.actions.failed.value).toBe(true);
    },
  );

  test("scope disposal closes the draft and makes retained callbacks inert", () => {
    const f = fixture();
    f.actions.open("minAxis");
    const old = f.actions.dialog.value!;
    f.scope.stop();
    old.confirm(-8);
    old.close();

    expect(f.initial.apply).not.toHaveBeenCalled();
    expect(f.actions.dialog.value).toBeUndefined();
    expect(f.actions.failed.value).toBe(false);
  });
});
