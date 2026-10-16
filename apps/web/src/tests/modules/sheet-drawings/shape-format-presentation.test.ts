import { effectScope, nextTick, shallowRef } from "vue";
import { expect, test } from "vitest";
import {
  useShapeFormatPresentation,
  type ShapeFormatPresentationIdentity,
} from "../../../modules/sheet-drawings/useShapeFormatPresentation";

function fixture() {
  const scope = effectScope();
  const owner = shallowRef<ShapeFormatPresentationIdentity | undefined>({
    workbook: {},
    sheet: {},
    generation: 1,
    rootId: "root",
    path: ["root", "leaf"],
  });
  const state = scope.run(() => useShapeFormatPresentation(() => owner.value))!;
  return { owner, state, stop: () => scope.stop() };
}
test("presentation survives a batched same-object handoff without retaining sessions", async () => {
  const f = fixture();
  try {
    const first = f.state.value!;
    first.textBoxOpen = false;
    first.paragraphOpen = true;
    first.scrollTop = 75;
    const identity = f.owner.value!;
    f.owner.value = undefined;
    f.owner.value = { ...identity, path: [...identity.path] };
    await nextTick();
    expect(f.state.value).toBe(first);
    expect(Object.keys(first).sort()).toEqual([
      "fontOpen",
      "paragraphOpen",
      "scrollTop",
      "textBoxOpen",
    ]);
  } finally {
    f.stop();
  }
});
test.each(["workbook", "sheet", "generation", "rootId", "path"] as const)(
  "presentation never crosses changed %s identity",
  async (field) => {
    const f = fixture();
    try {
      const first = f.state.value!;
      first.fontOpen = false;
      first.scrollTop = 75;
      const changed =
        field === "generation"
          ? 2
          : field === "rootId"
            ? "other-root"
            : field === "path"
              ? ["root", "other-parent", "leaf"]
              : {};
      f.owner.value = { ...f.owner.value!, [field]: changed };
      await nextTick();
      expect(f.state.value).not.toBe(first);
      expect(f.state.value).toEqual({
        textBoxOpen: true,
        fontOpen: true,
        paragraphOpen: false,
        scrollTop: 0,
      });
      first.fontOpen = false;
      expect(f.state.value!.fontOpen).toBe(true);
    } finally {
      f.stop();
    }
  },
);
test("closing drops the only slot, reopening the same owner uses defaults", async () => {
  const f = fixture();
  try {
    const identity = f.owner.value;
    f.state.value!.scrollTop = 90;
    f.owner.value = undefined;
    await nextTick();
    expect(f.state.value).toBeUndefined();
    f.owner.value = identity;
    await nextTick();
    expect(f.state.value!.scrollTop).toBe(0);
  } finally {
    f.stop();
  }
});
