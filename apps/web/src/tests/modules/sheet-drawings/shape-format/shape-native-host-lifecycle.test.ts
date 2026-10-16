import { mount, flushPromises, type VueWrapper } from "@vue/test-utils";
import { afterEach, expect, test, vi } from "vitest";
import { Select } from "tdesign-vue-next/es/select";
import ShapeFormatPane from "../../../../modules/sheet-drawings/components/shape-format/ShapeFormatPane.vue";
import ShapeFormatChoiceField from "../../../../modules/sheet-drawings/components/shape-format/ShapeFormatChoiceField.vue";
import ShapeFormatMixedEffect from "../../../../modules/sheet-drawings/components/shape-format/ShapeFormatMixedEffect.vue";
import ShapeFormatTextBox from "../../../../modules/sheet-drawings/components/shape-format/ShapeFormatTextBox.vue";
import ShapeLineEndsControls from "../../../../modules/sheet-drawings/components/ShapeLineEndsControls.vue";
import PictureFormatField from "../../../../modules/sheet-images/components/format-pane/PictureFormatField.vue";
import { createAppI18n } from "../../../../shared/i18n";
import type {
  ShapeFormatCapabilities,
  ShapeFormatSnapshot,
} from "../../../../modules/sheet-drawings/shape-format-pane-model";
const wrappers: VueWrapper[] = [];
afterEach(() => {
  wrappers.splice(0).forEach((w) => w.unmount());
  document.body.replaceChildren();
  vi.restoreAllMocks();
});
function snapshot(): ShapeFormatSnapshot {
  return {
    owner: { workbookId: "book", sheetId: "sheet", drawingId: "shape", sessionId: "session" },
    revision: 2,
    drawing: {
      id: "shape",
      name: "Rounded rectangle",
      kind: "shape",
      shape: "roundedRectangle",
      shapeGeometry: { preset: "roundRect" },
      anchor: { row: 2, column: 3 },
      offsetX: 0,
      offsetY: 0,
      width: 288,
      height: 192,
      rotation: 37,
      text: "shape\ntext",
      fill: "#4472C4",
      stroke: "#203864",
      strokeWidth: 1,
      color: "#FFFFFF",
      fontSize: 12,
      bold: false,
      italic: false,
    },
    values: {
      sizeWidthPt: 216,
      sizeHeightPt: 144,
      rotationDeg: 37,
      scaleWidthPercent: 100,
      scaleHeightPercent: 100,
      lockAspectRatio: false,
      anchor: "move-size",
      printObject: true,
      locked: true,
      altTitle: "",
      altDescription: "",
      textVerticalAlignment: "top",
      textDirection: "horizontal",
      textMarginLeftPt: 7.2,
      textMarginRightPt: 7.2,
      textMarginTopPt: 3.6,
      textMarginBottomPt: 3.6,
      textResizeToFit: false,
      textOverflow: false,
      textWrap: true,
      fontFamily: "Inter",
      fontSizePt: 12,
      textBold: false,
      textItalic: false,
      paragraphAlignment: "left",
    },
    shapeStyle: {
      fill: {
        kind: "value",
        value: { kind: "solid", color: { kind: "rgb", rgb: "#4472C4" }, opacity: 1 },
      },
    },
  };
}

const fields = ["begin", "end", "choice", "mixed", "units", "margins"] as const;
type Field = (typeof fields)[number];
const choices: Record<Field, string> = {
  begin: "triangle",
  end: "triangle",
  choice: "fixed",
  mixed: "none",
  units: "in",
  margins: "none",
};
const capabilities: ShapeFormatCapabilities = {
  fields: {
    anchor: { enabled: true },
    sizeWidthPt: { enabled: true, min: 1 },
    textMarginLeftPt: { enabled: true },
    textMarginRightPt: { enabled: true },
    textMarginTopPt: { enabled: true },
    textMarginBottomPt: { enabled: true },
  },
  styles: { shape: { shadow: { enabled: true } } },
  lineEnds: { enabled: true },
};
function fixture(field: Field, standalone = false) {
  const commit = vi.fn(() => true);
  const common = {
    attachTo: document.body,
    global: {
      plugins: [createAppI18n("en-US")],
      stubs: {
        ColorPaletteSelect: true,
        PicturePaintColor: true,
        PicturePresetGallery: true,
        WordArtStyleGallery: true,
        WordArtTransformGallery: true,
      },
    },
  };
  const value = snapshot();
  value.mixedStyleCategories = { shape: ["shadow"] };
  const wrapper: VueWrapper =
    field === "begin" || field === "end"
      ? mount(ShapeLineEndsControls, {
          ...common,
          props: { ownerKey: standalone ? undefined : "owner-a", handler: commit, locale: "en-US" },
        })
      : mount(ShapeFormatPane, {
          ...common,
          props: {
            snapshot: value,
            capabilities,
            onIntent: commit,
            t: (key: string) => key,
            initialTab:
              field === "mixed" ? "effects" : field === "margins" ? "text-box" : "size-properties",
          },
        });
  wrappers.push(wrapper);
  const select =
    field === "begin" || field === "end"
      ? wrapper.findAllComponents(Select)[field === "begin" ? 0 : 1]!
      : field === "choice"
        ? wrapper
            .findAllComponents(ShapeFormatChoiceField)
            .find((c) => c.props("field") === "anchor")!
            .getComponent(Select)
        : field === "mixed"
          ? wrapper
              .findAllComponents(ShapeFormatMixedEffect)
              .find((c) => c.props("category") === "shadow" && c.props("target") === "shape")!
              .getComponent(Select)
          : field === "units"
            ? wrapper
                .findAllComponents(Select)
                .find((c) => c.attributes("data-shape-format-units") !== undefined)!
            : wrapper
                .getComponent(ShapeFormatTextBox)
                .findAllComponents(Select)
                .find((c) => c.attributes("aria-label") === "Text margins")!;
  if (!select) throw new Error(`Missing ${field}`);
  const attach = (select.props("popupProps") as { attach: () => HTMLElement | undefined }).attach;
  const change = () => {
    const f = select.vm.$.vnode.props?.onChange;
    if (typeof f !== "function") throw Error("Missing change");
    return f;
  };
  async function retire() {
    if (field === "begin" || field === "end") await wrapper.setProps({ ownerKey: "owner-b" });
    else
      await wrapper.setProps({
        snapshot: { ...value, owner: { ...value.owner, sessionId: "session-b" } },
      });
  }
  async function disable() {
    if (field === "begin" || field === "end") await wrapper.setProps({ disabled: true });
    else if (field === "units") {
      const c = wrapper.getComponent(ShapeFormatChoiceField).props("controller");
      c.setNumericDraft("host-test", true);
      await flushPromises();
    } else
      await wrapper.setProps({
        capabilities: {
          ...capabilities,
          fields: {
            ...capabilities.fields,
            anchor: { enabled: false },
            textMarginRightPt: { enabled: false },
          },
          styles: { shape: { shadow: { enabled: false } } },
        },
      });
  }
  return { wrapper, select, attach, commit, change, retire, disable, field };
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
  if (!host) throw Error("Missing host");
  expect(host.parentElement).toBe(document.body);
  await vi.waitFor(() => expect(host.querySelector("li.t-select-option")).not.toBeNull());
  return host;
}
test.each(fields)(
  "%s owns its native host through nested click, Escape, outside, unmount and remount",
  async (field) => {
    const f = fixture(field),
      host = await open(f);
    const nested = document.createElement("button");
    host.append(nested);
    nested.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    nested.click();
    await flushPromises();
    expect(f.select.props("popupVisible")).toBe(true);
    expect(f.commit).not.toHaveBeenCalled();
    if (field === "choice") {
      const root = f.wrapper
        .findAllComponents(ShapeFormatChoiceField)
        .find((c) => c.props("field") === "anchor")!
        .getComponent(PictureFormatField).element;
      expect(root).toBeInstanceOf(HTMLElement);
      expect(root.contains(f.select.element)).toBe(true);
    }
    await f.select.get("input").trigger("keydown", { key: "Escape", code: "Escape", keyCode: 27 });
    await vi.waitFor(() => expect(f.select.props("popupVisible")).toBe(false));
    await open(f);
    const outside = document.createElement("button");
    document.body.append(outside);
    outside.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    outside.click();
    await vi.waitFor(() => expect(f.select.props("popupVisible")).toBe(false));
    expect(f.commit).not.toHaveBeenCalled();
    f.wrapper.unmount();
    expect(f.attach()).toBeUndefined();
    expect(host.isConnected).toBe(false);
    expect(await open(fixture(field))).not.toBe(host);
  },
);
test.each(fields)(
  "%s retires stale callbacks and obeys its actual disabled capability",
  async (field) => {
    const f = fixture(field),
      host = await open(f),
      old = f.change();
    const oldVisible = f.select.vm.$.vnode.props?.onPopupVisibleChange;
    if (typeof oldVisible !== "function") throw Error("Missing visibility");
    await f.retire();
    expect(f.select.props("popupVisible")).toBe(false);
    expect(f.attach()).toBe(host);
    oldVisible(true);
    old(choices[field]);
    await flushPromises();
    if (field === "units") expect(f.select.props("modelValue")).toBe("pt");
    expect(f.select.props("popupVisible")).toBe(false);
    expect(f.commit).not.toHaveBeenCalled();
    await open(f);
    f.change()(choices[field]);
    await flushPromises();
    if (field === "units") {
      expect(f.select.props("modelValue")).toBe("in");
      expect(f.commit).not.toHaveBeenCalled();
    } else expect(f.commit).toHaveBeenCalledTimes(1);
    await open(f);
    const current = f.change();
    await f.disable();
    expect(f.select.props("popupVisible")).toBe(false);
    current(field === "units" ? "cm" : choices[field]);
    await flushPromises();
    if (field === "units") expect(f.select.props("modelValue")).toBe("in");
    else expect(f.commit).toHaveBeenCalledTimes(1);
  },
);
test.each(["begin", "end"] as const)(
  "standalone %s handler generation retires callbacks and legal selection restores endpoint focus",
  async (field) => {
    const f = fixture(field, true);
    await open(f);
    const old = f.change(),
      next = vi.fn(() => true);
    await f.wrapper.setProps({ handler: next });
    expect(f.select.props("popupVisible")).toBe(false);
    old("triangle");
    expect(f.commit).not.toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
    const host = await open(f);
    const option = [...host.querySelectorAll<HTMLElement>("li.t-select-option")].find(
      (n) => n.textContent?.trim() === "Arrow",
    );
    if (!option) throw Error("Missing triangle");
    option.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, button: 0 }));
    option.click();
    await flushPromises();
    expect(next).toHaveBeenCalledTimes(1);
    await vi.waitFor(() => expect(document.activeElement).toBe(f.select.get("input").element));
  },
);
