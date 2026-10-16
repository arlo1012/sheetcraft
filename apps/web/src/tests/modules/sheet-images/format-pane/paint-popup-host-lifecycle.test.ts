import { flushPromises, mount, type VueWrapper } from "@vue/test-utils";
import { afterEach, expect, test, vi } from "vitest";
import { Select } from "tdesign-vue-next/es/select";
import type { Choice, PicturePaint } from "@sheetcraft/core/picture-detailed-style";
import PictureGradientEditor from "../../../../modules/sheet-images/components/format-pane/PictureGradientEditor.vue";
import PicturePaintEditor from "../../../../modules/sheet-images/components/format-pane/PicturePaintEditor.vue";
import { createPictureGradientPaint } from "../../../../modules/sheet-images/picture-paint-edit";
import { createAppI18n } from "../../../../shared/i18n";

const mounted: VueWrapper[] = [];
afterEach(() => {
  mounted.splice(0).forEach((wrapper) => wrapper.unmount());
  document.body.replaceChildren();
  vi.restoreAllMocks();
});
const fields = ["gradientKind", "paintLayout", "paintAlignment", "paintMirror"] as const;
type Field = (typeof fields)[number];
function fixture(field: Field) {
  const onCommit = vi.fn(() => true);
  const common = {
    attachTo: document.body,
    global: {
      plugins: [createAppI18n("en-US")],
      stubs: { PicturePaintNumber: true, PicturePaintColor: true, PictureTextureGallery: true },
    },
  };
  const picture: Choice<PicturePaint> = {
    kind: "value",
    value: {
      kind: "picture",
      assetId: "existing",
      opacity: 1,
      rotateWithShape: true,
      layout: {
        kind: "tile",
        scaleX: 1,
        scaleY: 1,
        offsetXPt: 0,
        offsetYPt: 0,
        anchor: "center",
        flip: "none",
      },
    },
  };
  const props = { ownerKey: "picture-a", t: (key: string) => key, onCommit };
  const wrapper =
    field === "gradientKind"
      ? mount(PictureGradientEditor, {
          ...common,
          props: { ...props, value: createPictureGradientPaint() },
        })
      : mount(PicturePaintEditor, { ...common, props: { ...props, value: picture } });
  mounted.push(wrapper);
  const select = wrapper
    .findAllComponents(Select)
    .find((item) => item.attributes("aria-label") === field);
  if (!select) throw new Error(`Missing ${field} select.`);
  const attach = (select.props("popupProps") as { attach: () => HTMLElement | undefined }).attach;
  return { wrapper, select, attach, onCommit };
}
type Fixture = ReturnType<typeof fixture>;
async function open(f: Fixture) {
  await flushPromises();
  for (const target of f.select.findAll(
    ".t-input__wrap, .t-input, .t-select-input, .t-select__wrap",
  ))
    vi.spyOn(target.element, "getBoundingClientRect").mockReturnValue(
      new DOMRect(100, 100, 132, 28),
    );
  await f.select.get(".t-input").trigger("click");
  await vi.waitFor(() => expect(f.select.props("popupVisible")).toBe(true));
  const host = f.attach();
  if (!host) throw new Error("Popup host not mounted.");
  expect(host.parentElement).toBe(document.body);
  await vi.waitFor(() => expect(host.querySelector("li.t-select-option")).not.toBeNull());
  return host;
}
test.each(fields)(
  "%s attaches its own host, preserves nested clicks, closes on Escape/outside, and clears on unmount",
  async (field) => {
    const f = fixture(field),
      host = await open(f);
    const nested = document.createElement("button");
    nested.textContent = "nested non-option control";
    host.append(nested);
    nested.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    nested.click();
    await flushPromises();
    expect(f.select.props("popupVisible")).toBe(true);
    expect(f.onCommit).not.toHaveBeenCalled();
    await f.select.get("input").trigger("keydown", { key: "Escape", code: "Escape", keyCode: 27 });
    await vi.waitFor(() => expect(f.select.props("popupVisible")).toBe(false));
    expect(f.attach()).toBe(host);
    await open(f);
    const outside = document.createElement("button");
    document.body.append(outside);
    outside.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    outside.click();
    await vi.waitFor(() => expect(f.select.props("popupVisible")).toBe(false));
    expect(f.onCommit).not.toHaveBeenCalled();
    f.wrapper.unmount();
    expect(f.attach()).toBeUndefined();
    expect(host.isConnected).toBe(false);
    const next = fixture(field),
      nextHost = await open(next);
    expect(nextHost).not.toBe(host);
  },
);
test.each(fields)(
  "%s retires the old owner's popup and callbacks without replacing its host",
  async (field) => {
    const f = fixture(field),
      host = await open(f);
    const change = f.select.vm.$.vnode.props?.onChange;
    const visible = f.select.vm.$.vnode.props?.onPopupVisibleChange;
    if (typeof change !== "function" || typeof visible !== "function")
      throw new Error("Missing guarded callbacks.");
    await f.wrapper.setProps({ ownerKey: "picture-b" });
    expect(f.select.props("popupVisible")).toBe(false);
    expect(f.attach()).toBe(host);
    visible(true);
    change(
      field === "paintMirror"
        ? "x"
        : field === "paintAlignment"
          ? "bottom-left"
          : field === "paintLayout"
            ? "stretch"
            : "radial",
    );
    await flushPromises();
    expect(f.select.props("popupVisible")).toBe(false);
    expect(f.onCommit).not.toHaveBeenCalled();
    await open(f);
    await f.wrapper.setProps({ disabled: true });
    expect(f.select.props("popupVisible")).toBe(false);
  },
);
