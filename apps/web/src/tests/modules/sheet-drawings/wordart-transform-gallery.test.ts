import { flushPromises, mount, type VueWrapper } from "@vue/test-utils";
import { afterEach, expect, test, vi } from "vitest";
import { defineComponent } from "vue";
import WordArtTransformGallery from "../../../modules/sheet-drawings/components/WordArtTransformGallery.vue";
import MenuSurface from "../../../shared/menu/MenuSurface.vue";
import {
  WORDART_TRANSFORM_PRESETS,
  type WordArtTransformPreset,
  type WordArtTransformSelectionContext,
} from "../../../modules/sheet-drawings/wordart-transform-presets";

vi.mock("../../../modules/sheet-drawings/components/WordArtTransformPreview.vue", () => ({
  default: { props: ["choice"], template: '<span aria-hidden="true" />' },
}));
const wrappers: VueWrapper[] = [];
afterEach(() => {
  wrappers.splice(0).forEach((wrapper) => wrapper.unmount());
  document.body.replaceChildren();
});
function gallery(props: Record<string, unknown> = {}) {
  const wrapper = mount(WordArtTransformGallery, { props, attachTo: document.body });
  wrappers.push(wrapper);
  return wrapper;
}
function choice(wrapper: VueWrapper, index: number) {
  return wrapper.get(
    `button[data-wordart-transform-choice="${WORDART_TRANSFORM_PRESETS[index]!.id}"]`,
  );
}

test("all 41 bilingual controlled radio choices retain catalog identities and three concrete groups", async () => {
  const wrapper = gallery({
    locale: "zh-CN",
    selectedWarp: { preset: "textArchDown", adjustments: { adj: 3000 } },
  });
  expect(wrapper.findAll('[role="menuitemradio"]')).toHaveLength(41);
  expect(wrapper.findAll("section").map((section) => section.attributes("aria-label"))).toEqual([
    "无转换",
    "沿路径排列",
    "扭曲",
  ]);
  for (const [index, preset] of WORDART_TRANSFORM_PRESETS.entries())
    expect(choice(wrapper, index).attributes("aria-label")).toBe(preset.label["zh-CN"]);
  expect(choice(wrapper, 2).attributes("aria-checked")).toBe("true");
  expect(wrapper.findAll('[tabindex="0"]')).toHaveLength(1);
  expect(wrapper.text()).toContain("ASCII");
  expect(wrapper.text()).toContain("不支持跨字字距调整或连字");
  const existingNode = choice(wrapper, 2).element;
  await choice(wrapper, 0).trigger("click");
  expect(wrapper.emitted("choose")).toEqual([[WORDART_TRANSFORM_PRESETS[0]]]);
  expect(wrapper.emitted("applied")).toBeUndefined();
  expect(choice(wrapper, 2).attributes("aria-checked")).toBe("true");
  await wrapper.setProps({ selectedWarp: undefined });
  expect(choice(wrapper, 2).element).toBe(existingNode);
  expect(choice(wrapper, 0).attributes("aria-checked")).toBe("true");
});

test("standalone pane uses one radiogroup, mixed highlights none, disabled reason stays readable", async () => {
  const wrapper = gallery({ menu: false, mixed: true });
  expect(wrapper.attributes("role")).toBe("radiogroup");
  expect(wrapper.findAll('[role="radio"]')).toHaveLength(41);
  expect(wrapper.findAll('[aria-checked="true"]')).toHaveLength(0);
  expect(wrapper.text()).toContain("Mixed transforms");
  await wrapper.setProps({ disabled: true, disabledReason: "The current shape has no text." });
  expect(wrapper.findAll("button:disabled")).toHaveLength(41);
  expect(wrapper.findAll('[tabindex="0"]')).toHaveLength(0);
  expect(wrapper.text()).toContain("The current shape has no text.");
});

test("spatial arrows cross every group, Home/End cover all choices, and Enter selects exactly once", async () => {
  const wrapper = gallery();
  (choice(wrapper, 0).element as HTMLButtonElement).focus();
  await choice(wrapper, 0).trigger("keydown", { key: "ArrowDown" });
  expect(document.activeElement).toBe(choice(wrapper, 1).element);
  await choice(wrapper, 1).trigger("keydown", { key: "ArrowRight" });
  await choice(wrapper, 2).trigger("keydown", { key: "ArrowDown" });
  expect(document.activeElement).toBe(choice(wrapper, 6).element);
  await choice(wrapper, 6).trigger("keydown", { key: "ArrowUp" });
  expect(document.activeElement).toBe(choice(wrapper, 2).element);
  await choice(wrapper, 2).trigger("keydown", { key: "End" });
  expect(document.activeElement).toBe(choice(wrapper, 40).element);
  await choice(wrapper, 40).trigger("keydown", { key: "Home" });
  expect(document.activeElement).toBe(choice(wrapper, 0).element);
  await choice(wrapper, 0).trigger("keydown", { key: "Enter" });
  expect(wrapper.emitted("choose")).toEqual([[WORDART_TRANSFORM_PRESETS[0]]]);
  expect(wrapper.findAll('[tabindex="0"]')).toHaveLength(1);
});

test("shared MenuSurface discovers every radio choice in one continuous menu and respects gallery arrows", async () => {
  const host = defineComponent({
    components: { MenuSurface, WordArtTransformGallery },
    template:
      '<MenuSurface label="Transform"><template #body><WordArtTransformGallery /></template></MenuSurface>',
  });
  const wrapper = mount(host, { attachTo: document.body });
  wrappers.push(wrapper);
  expect(wrapper.findAll('[role="menu"]')).toHaveLength(1);
  expect(wrapper.findAll('[role="menuitemradio"]')).toHaveLength(41);
  expect(wrapper.findAll('[tabindex="0"]')).toHaveLength(1);
  (choice(wrapper, 0).element as HTMLButtonElement).focus();
  await choice(wrapper, 0).trigger("keydown", { key: "End" });
  expect(document.activeElement).toBe(choice(wrapper, 40).element);
  await choice(wrapper, 40).trigger("keydown", { key: "ArrowUp" });
  expect(document.activeElement).toBe(choice(wrapper, 36).element);
});

test("callback must return true, pending/failure preserve selected warp, and duplicate intents are blocked", async () => {
  let resolve!: (accepted: boolean) => void;
  const onSelect = vi.fn(
    (_choice: WordArtTransformPreset, _context: WordArtTransformSelectionContext) =>
      new Promise<boolean>((done) => {
        resolve = done;
      }),
  );
  const wrapper = gallery({ onSelect, selectedWarp: { preset: "textArchUp" }, ownerId: "a" });
  await choice(wrapper, 3).trigger("click");
  expect(onSelect).toHaveBeenCalledTimes(1);
  expect(onSelect.mock.calls[0]![0]).toBe(WORDART_TRANSFORM_PRESETS[3]);
  expect(wrapper.attributes("aria-busy")).toBe("true");
  expect(wrapper.findAll("button:disabled")).toHaveLength(41);
  expect(choice(wrapper, 1).attributes("aria-checked")).toBe("true");
  await choice(wrapper, 4).trigger("click");
  expect(onSelect).toHaveBeenCalledTimes(1);
  resolve(false);
  await flushPromises();
  expect(wrapper.emitted("applied")).toBeUndefined();
  expect(wrapper.emitted("failed")).toHaveLength(1);
  expect(wrapper.text()).toContain("could not be applied");
  expect(choice(wrapper, 1).attributes("aria-checked")).toBe("true");
  await choice(wrapper, 3).trigger("click");
  resolve(true);
  await flushPromises();
  expect(wrapper.emitted("applied")).toEqual([[WORDART_TRANSFORM_PRESETS[3]]]);
  expect(choice(wrapper, 1).attributes("aria-checked")).toBe("true");
});

test("measured responsive two-column rows preserve vertical columns across section boundaries", async () => {
  const wrapper = gallery();
  for (const [index] of WORDART_TRANSFORM_PRESETS.entries()) {
    const relativeIndex = index === 0 ? 0 : index < 5 ? index - 1 : index - 5;
    const row =
      index === 0
        ? 0
        : index < 5
          ? 1 + Math.floor(relativeIndex / 2)
          : 3 + Math.floor(relativeIndex / 2);
    const column = index === 0 ? 0 : relativeIndex % 2;
    vi.spyOn(choice(wrapper, index).element, "getBoundingClientRect").mockReturnValue({
      top: row * 80,
      left: column * 100,
      width: 96,
      height: 72,
      bottom: row * 80 + 72,
      right: column * 100 + 96,
      x: column * 100,
      y: row * 80,
      toJSON: () => ({}),
    });
  }
  (choice(wrapper, 2).element as HTMLButtonElement).focus();
  await choice(wrapper, 2).trigger("keydown", { key: "ArrowDown" });
  expect(document.activeElement).toBe(choice(wrapper, 4).element);
  await choice(wrapper, 4).trigger("keydown", { key: "ArrowDown" });
  expect(document.activeElement).toBe(choice(wrapper, 6).element);
  await choice(wrapper, 6).trigger("keydown", { key: "ArrowUp" });
  expect(document.activeElement).toBe(choice(wrapper, 4).element);
});

test("old owner completion cannot clear or accept a new owner's pending choice", async () => {
  const resolutions: ((accepted: boolean) => void)[] = [];
  const onSelect = vi.fn(
    () =>
      new Promise<boolean>((done) => {
        resolutions.push(done);
      }),
  );
  const wrapper = gallery({ ownerId: "a", onSelect });
  await choice(wrapper, 1).trigger("click");
  await wrapper.setProps({ ownerId: "b", selectedWarp: { preset: "textCurveDown" } });
  await choice(wrapper, 3).trigger("click");
  resolutions[0]!(true);
  await flushPromises();
  expect(wrapper.attributes("aria-busy")).toBe("true");
  expect(wrapper.emitted("applied")).toBeUndefined();
  resolutions[1]!(true);
  await flushPromises();
  expect(wrapper.attributes("aria-busy")).toBe("false");
  expect(wrapper.emitted("applied")).toEqual([[WORDART_TRANSFORM_PRESETS[3]]]);
  expect(
    wrapper.get('[data-wordart-transform-choice="textCurveDown"]').attributes("aria-checked"),
  ).toBe("true");
});

test("thrown or truthy non-boolean callback results remain a readable failure", async () => {
  const wrapper = gallery({
    onSelect: vi
      .fn()
      .mockRejectedValueOnce(new Error("unsupported"))
      .mockResolvedValueOnce({ ok: true }),
  });
  await choice(wrapper, 1).trigger("click");
  await flushPromises();
  await choice(wrapper, 2).trigger("click");
  await flushPromises();
  expect(wrapper.emitted("failed")).toHaveLength(2);
  expect(wrapper.emitted("applied")).toBeUndefined();
  expect(choice(wrapper, 0).attributes("aria-checked")).toBe("true");
});

test("owner, handler, disable, and unmount changes invalidate in-flight acceptance and context", async () => {
  for (const change of ["owner", "handler", "disabled", "unmount"]) {
    let resolve!: (accepted: boolean) => void;
    let context!: WordArtTransformSelectionContext;
    const onSelect = vi.fn((_choice, selectionContext: WordArtTransformSelectionContext) => {
      context = selectionContext;
      return new Promise<boolean>((done) => {
        resolve = done;
      });
    });
    const wrapper = gallery({ onSelect, ownerId: "a" });
    await choice(wrapper, 1).trigger("click");
    expect(context.ownerId).toBe("a");
    expect(context.isCurrent()).toBe(true);
    if (change === "owner") await wrapper.setProps({ ownerId: "b" });
    else if (change === "handler") await wrapper.setProps({ onSelect: () => true });
    else if (change === "disabled") await wrapper.setProps({ disabled: true });
    else wrapper.unmount();
    expect(context.isCurrent()).toBe(false);
    resolve(true);
    await flushPromises();
    expect(wrapper.emitted("applied")).toBeUndefined();
    expect(wrapper.emitted("failed")).toBeUndefined();
  }
});
