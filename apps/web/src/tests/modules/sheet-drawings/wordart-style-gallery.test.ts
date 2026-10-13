import { mount, flushPromises, type VueWrapper } from "@vue/test-utils";
import { afterEach, expect, test, vi } from "vitest";
import WordArtStyleGallery from "../../../modules/sheet-drawings/components/WordArtStyleGallery.vue";
import { WORDART_STYLE_PRESETS } from "../../../modules/sheet-drawings/wordart-style-presets";

vi.mock("../../../modules/sheet-drawings/components/WordArtStylePreview.vue", () => ({
  default: {
    props: ["choice", "label", "theme"],
    template: '<span aria-hidden="true">{{ label }}</span>',
  },
}));

const wrappers: VueWrapper[] = [];
afterEach(() => {
  wrappers.splice(0).forEach((wrapper) => wrapper.unmount());
  document.body.replaceChildren();
});
function gallery(props: Record<string, unknown> = {}) {
  const wrapper = mount(WordArtStyleGallery, { props, attachTo: document.body });
  wrappers.push(wrapper);
  return wrapper;
}
function choice(wrapper: VueWrapper, index: number) {
  return wrapper.get(`button[data-wordart-style-choice="${WORDART_STYLE_PRESETS[index]!.id}"]`);
}

test("gallery exposes 25 labelled choices with controlled selection and immediate simple choice", async () => {
  const wrapper = gallery({ selectedId: WORDART_STYLE_PRESETS[2]!.id, locale: "zh-CN" });
  expect(wrapper.findAll("button[data-wordart-style-choice]")).toHaveLength(25);
  expect(wrapper.findAll('button[tabindex="0"]')).toHaveLength(1);
  expect(choice(wrapper, 2).attributes("aria-pressed")).toBe("true");
  expect(choice(wrapper, 2).attributes("tabindex")).toBe("0");
  for (const [index, preset] of WORDART_STYLE_PRESETS.entries())
    expect(choice(wrapper, index).attributes("aria-label")).toBe(preset.label["zh-CN"]);
  const node = choice(wrapper, 2).element;
  await choice(wrapper, 2).trigger("click");
  expect(wrapper.emitted("choose")).toEqual([[WORDART_STYLE_PRESETS[2]]]);
  expect(wrapper.emitted("applied")).toBeUndefined();
  await wrapper.setProps({ selectedId: WORDART_STYLE_PRESETS[4]!.id });
  expect(choice(wrapper, 2).element).toBe(node);
  expect(choice(wrapper, 4).attributes("aria-pressed")).toBe("true");
});

test("native choice grid uses one tab stop and spatial ten-column arrows including the short last row", async () => {
  const wrapper = gallery();
  (choice(wrapper, 8).element as HTMLButtonElement).focus();
  await choice(wrapper, 8).trigger("keydown", { key: "ArrowDown" });
  expect(document.activeElement).toBe(choice(wrapper, 18).element);
  await choice(wrapper, 18).trigger("keydown", { key: "ArrowDown" });
  expect(document.activeElement).toBe(choice(wrapper, 24).element);
  await choice(wrapper, 24).trigger("keydown", { key: "ArrowUp" });
  expect(document.activeElement).toBe(choice(wrapper, 14).element);
  await choice(wrapper, 14).trigger("keydown", { key: "Home" });
  expect(document.activeElement).toBe(choice(wrapper, 0).element);
  await choice(wrapper, 0).trigger("keydown", { key: "End" });
  expect(document.activeElement).toBe(choice(wrapper, 24).element);
  expect(wrapper.findAll('button[tabindex="0"]')).toHaveLength(1);
  expect(wrapper.emitted("choose")).toBeUndefined();
});

test("async callback blocks duplicate insertion and emits applied only for a true result", async () => {
  let resolve!: (accepted: boolean) => void;
  const onSelect = vi.fn(
    () =>
      new Promise<boolean>((done) => {
        resolve = done;
      }),
  );
  const wrapper = gallery({ onSelect });
  await choice(wrapper, 0).trigger("click");
  expect(onSelect).toHaveBeenCalledExactlyOnceWith(WORDART_STYLE_PRESETS[0]);
  expect(wrapper.attributes("aria-busy")).toBe("true");
  expect(wrapper.findAll("button:disabled")).toHaveLength(25);
  await choice(wrapper, 1).trigger("click");
  expect(onSelect).toHaveBeenCalledTimes(1);
  expect(wrapper.emitted("choose")).toBeUndefined();
  expect(wrapper.emitted("applied")).toBeUndefined();
  resolve(true);
  await flushPromises();
  expect(wrapper.emitted("applied")).toEqual([[WORDART_STYLE_PRESETS[0]]]);
  expect(wrapper.attributes("aria-busy")).toBe("false");
  expect(wrapper.findAll("button:disabled")).toHaveLength(0);
});

test("false and rejected callbacks retain choices for retry, then a true retry succeeds", async () => {
  const onSelect = vi
    .fn()
    .mockReturnValueOnce(false)
    .mockRejectedValueOnce(new Error("blocked"))
    .mockResolvedValueOnce(true);
  const wrapper = gallery({ onSelect });
  await choice(wrapper, 0).trigger("click");
  await flushPromises();
  expect(wrapper.emitted("failed")).toHaveLength(1);
  expect(wrapper.text()).toContain("could not be applied");
  await choice(wrapper, 1).trigger("click");
  await flushPromises();
  expect(wrapper.emitted("failed")).toHaveLength(2);
  expect(wrapper.emitted("applied")).toBeUndefined();
  await choice(wrapper, 2).trigger("click");
  await flushPromises();
  expect(wrapper.emitted("applied")).toEqual([[WORDART_STYLE_PRESETS[2]]]);
  expect(wrapper.text()).not.toContain("could not be applied");
});

test("owner change invalidates a pending result without remounting controls or marking success", async () => {
  let resolve!: (accepted: boolean) => void;
  const onSelect = () =>
    new Promise<boolean>((done) => {
      resolve = done;
    });
  const wrapper = gallery({ onSelect, ownerId: "sheet-a" });
  const node = choice(wrapper, 0).element;
  await choice(wrapper, 0).trigger("click");
  await wrapper.setProps({ ownerId: "sheet-b" });
  expect(choice(wrapper, 0).element).toBe(node);
  resolve(true);
  await flushPromises();
  expect(wrapper.emitted("applied")).toBeUndefined();
  expect(wrapper.emitted("failed")).toBeUndefined();
  expect(wrapper.attributes("aria-busy")).toBe("false");
});

test("disabled gallery has no usable tab stop, and disable invalidates pending success", async () => {
  let resolve!: (accepted: boolean) => void;
  const onSelect = () =>
    new Promise<boolean>((done) => {
      resolve = done;
    });
  const wrapper = gallery({ onSelect });
  await choice(wrapper, 0).trigger("click");
  await wrapper.setProps({ disabled: true });
  resolve(true);
  await flushPromises();
  expect(wrapper.emitted("applied")).toBeUndefined();
  expect(wrapper.findAll('button[tabindex="0"]')).toHaveLength(0);
  expect(wrapper.findAll("button:disabled")).toHaveLength(25);
});

test("callback replacement and unmount suppress stale completion events", async () => {
  let resolve!: (accepted: boolean) => void;
  const original = () =>
    new Promise<boolean>((done) => {
      resolve = done;
    });
  const replacement = vi.fn(() => true);
  const applied = vi.fn();
  const wrapper = gallery({ onSelect: original, onApplied: applied });
  await choice(wrapper, 0).trigger("click");
  await wrapper.setProps({ onSelect: replacement });
  resolve(true);
  await flushPromises();
  expect(wrapper.emitted("applied")).toBeUndefined();
  await choice(wrapper, 1).trigger("click");
  await flushPromises();
  expect(replacement).toHaveBeenCalledExactlyOnceWith(WORDART_STYLE_PRESETS[1]);
  expect(wrapper.emitted("applied")).toEqual([[WORDART_STYLE_PRESETS[1]]]);
  await wrapper.setProps({ onSelect: original });
  await choice(wrapper, 2).trigger("click");
  wrapper.unmount();
  resolve(true);
  await flushPromises();
  expect(applied).toHaveBeenCalledExactlyOnceWith(WORDART_STYLE_PRESETS[1]);
});
