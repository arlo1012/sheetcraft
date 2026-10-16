import { mount, flushPromises, type VueWrapper } from "@vue/test-utils";
import { computed, defineComponent, h, nextTick, reactive } from "vue";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { Select } from "tdesign-vue-next/es/select";
import { Checkbox } from "tdesign-vue-next/es/checkbox";
import { createAppI18n } from "../../../../shared/i18n";
import FontFormatField from "../../../../shared/cell-text/FontFormatField.vue";
import ShapeFormatTextBox from "../../../../modules/sheet-drawings/components/shape-format/ShapeFormatTextBox.vue";
import ShapeFormatChoiceField from "../../../../modules/sheet-drawings/components/shape-format/ShapeFormatChoiceField.vue";
import ShapeFormatCheckbox from "../../../../modules/sheet-drawings/components/shape-format/ShapeFormatCheckbox.vue";
import {
  useShapeFormatPane,
  type ShapeFormatController,
  type ShapeFormatPaneInput,
} from "../../../../modules/sheet-drawings/components/shape-format/useShapeFormatPane";
import type {
  ShapeFormatChoiceField as ChoiceField,
  ShapeFormatIntent,
  ShapeFormatSnapshot,
  ShapeFormatValues,
} from "../../../../modules/sheet-drawings/shape-format-pane-model";

const fonts = vi.hoisted(() => ({ load: vi.fn<(family: string) => Promise<void>>() }));
vi.mock("../../../../shared/cell-text/font-resources", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../../shared/cell-text/font-resources")>()),
  ensureCellFontResource: fonts.load,
}));
vi.mock("../../../../shared/cell-text/useFontCatalog", () => ({
  useFontCatalog: () => ({
    fontOptions: computed(() => [
      { value: "Exact Custom Family", label: "Exact Custom Family" },
      { value: "Noto Sans", label: "Noto Sans" },
      { value: "Arial", label: "Arial" },
    ]),
  }),
}));
const wrappers: VueWrapper[] = [];
beforeEach(() => {
  fonts.load.mockReset().mockResolvedValue(undefined);
});
afterEach(() => {
  wrappers.splice(0).forEach((wrapper) => wrapper.unmount());
  document.body.replaceChildren();
});
function snapshot(): ShapeFormatSnapshot {
  return {
    owner: { workbookId: "book", sheetId: "sheet", drawingId: "shape", sessionId: "session" },
    revision: 2,
    drawing: {
      id: "shape",
      name: "Rectangle",
      kind: "shape",
      shape: "rectangle",
      anchor: { row: 0, column: 0 },
      offsetX: 0,
      offsetY: 0,
      width: 288,
      height: 192,
      rotation: 0,
      text: "ab cd\nef gh",
      fill: "#4472C4",
      stroke: "#203864",
      strokeWidth: 1,
      color: "#FF0000",
      fontSize: 32,
      bold: false,
      italic: false,
    },
    values: {
      textVerticalAlignment: "top",
      textDirection: "horizontal",
      textLineOrder: "rtl",
      textMarginLeftPt: 7.2,
      textMarginRightPt: 7.2,
      textMarginTopPt: 3.6,
      textMarginBottomPt: 3.6,
      textWrap: true,
      textOverflow: false,
      textResizeToFit: false,
      fontFamily: "",
      fontSizePt: 24,
      textBold: false,
      textItalic: false,
      textUnderline: false,
      textStrike: false,
      paragraphAlignment: "left",
      paragraphBeforePt: 0,
      paragraphAfterPt: 0,
      paragraphLineSpacing: "normal",
      paragraphLineSpacingPt: 18,
    },
  };
}
function fixture(options: { locale?: "en-US" | "zh-CN"; accepted?: boolean } = {}) {
  const source = snapshot();
  const onIntent = vi.fn((_intent: ShapeFormatIntent) => options.accepted !== false);
  const input = reactive<ShapeFormatPaneInput>({
    snapshot: source,
    capabilities: {
      fields: Object.fromEntries(Object.keys(source.values).map((key) => [key, { enabled: true }])),
    },
    onIntent,
    t: (key) => key,
    locale: options.locale ?? "en-US",
  });
  let controller!: ShapeFormatController;
  const wrapper = mount(
    defineComponent({
      setup() {
        controller = useShapeFormatPane(input);
        return () => h(ShapeFormatTextBox, { controller, unit: "pt" });
      },
    }),
    {
      attachTo: document.body,
      global: {
        plugins: [createAppI18n(options.locale ?? "en-US")],
        stubs: { FontSettingsAction: true },
      },
    },
  );
  wrappers.push(wrapper);
  function revise(values: Partial<ShapeFormatValues>, acceptedIntentId?: string) {
    input.snapshot = {
      ...input.snapshot!,
      revision: input.snapshot!.revision + 1,
      values: { ...input.snapshot!.values, ...values },
      acceptedIntentId,
    };
    return nextTick();
  }
  return { wrapper, input, onIntent, controller, revise };
}
function choice(wrapper: VueWrapper, field: ChoiceField) {
  return wrapper
    .findAllComponents(ShapeFormatChoiceField)
    .find((component) => component.props("field") === field)!
    .getComponent(Select);
}
function font(wrapper: VueWrapper) {
  return wrapper.getComponent(FontFormatField);
}

describe("shape text layout and paragraph controls", () => {
  test.each(["en-US", "zh-CN"] as const)(
    "six real directions and stacked-only line order in %s",
    async (locale) => {
      const f = fixture({ locale });
      expect(
        choice(f.wrapper, "textDirection")
          .props("options")!
          .map((option) => ("value" in option ? option.value : undefined)),
      ).toEqual(["horizontal", "vertical-rl", "vertical-lr", "rotate-90", "rotate-270", "stacked"]);
      const order = f.wrapper.get('[data-shape-format-field="textLineOrder"]');
      expect(order.isVisible()).toBe(false);
      await f.revise({ textDirection: "stacked" });
      expect(order.isVisible()).toBe(true);
      expect(
        choice(f.wrapper, "textLineOrder")
          .props("options")!
          .map((option) => ("value" in option ? option.value : undefined)),
      ).toEqual(["rtl", "ltr"]);
      choice(f.wrapper, "textLineOrder").vm.$emit("change", "ltr");
      await flushPromises();
      expect(f.onIntent).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({ type: "set-field", field: "textLineOrder", value: "ltr" }),
      );
      expect(f.wrapper.text()).toContain(locale === "zh-CN" ? "行的顺序" : "Order of lines");
    },
  );
  test("logical block alignment has physical labels for every direction and stacked order", async () => {
    const f = fixture();
    for (const [direction, lineOrder, labels] of [
      ["horizontal", "rtl", ["Top", "Middle", "Bottom"]],
      ["vertical-rl", "rtl", ["Right", "Center", "Left"]],
      ["vertical-lr", "rtl", ["Left", "Center", "Right"]],
      ["rotate-90", "rtl", ["Right", "Center", "Left"]],
      ["rotate-270", "rtl", ["Left", "Center", "Right"]],
      ["stacked", "rtl", ["Right", "Center", "Left"]],
      ["stacked", "ltr", ["Left", "Center", "Right"]],
    ] as const) {
      await f.revise({ textDirection: direction, textLineOrder: lineOrder });
      const options = choice(f.wrapper, "textVerticalAlignment").props("options")!;
      expect(options.map((option) => ("value" in option ? option.value : undefined))).toEqual([
        "top",
        "middle",
        "bottom",
      ]);
      expect(options.map((option) => option.label)).toEqual(labels);
    }
  });
  test("normal/exact line spacing and retained numeric drafts survive accepted edits", async () => {
    const f = fixture();
    expect(
      choice(f.wrapper, "paragraphLineSpacing")
        .props("options")!
        .map((option) => ("value" in option ? option.value : undefined)),
    ).toEqual(["normal", "exact"]);
    await f.revise({ paragraphLineSpacing: "exact" });
    const exact = f.wrapper.get<HTMLInputElement>(
      '[data-shape-format-field="paragraphLineSpacingPt"] input',
    );
    const element = exact.element;
    await exact.setValue("123.");
    choice(f.wrapper, "paragraphLineSpacing").vm.$emit("change", "normal");
    await flushPromises();
    let intent = f.onIntent.mock.calls.at(-1)![0];
    await f.revise({ paragraphLineSpacing: "normal" }, intent.intentId);
    choice(f.wrapper, "paragraphLineSpacing").vm.$emit("change", "exact");
    await flushPromises();
    intent = f.onIntent.mock.calls.at(-1)![0];
    await f.revise({ paragraphLineSpacing: "exact" }, intent.intentId);
    expect(exact.element).toBe(element);
    expect(exact.element.value).toBe("123.");
    await exact.trigger("blur");
    expect(f.onIntent).toHaveBeenLastCalledWith(
      expect.objectContaining({ field: "paragraphLineSpacingPt", value: 123, baseRevision: 5 }),
    );
  });
  test("a partially typed font size survives an accepted direction edit without remounting", async () => {
    const f = fixture();
    const size = f.wrapper.get<HTMLInputElement>('[data-shape-format-field="fontSizePt"] input');
    const element = size.element;
    await size.setValue("24.");
    await size.trigger("blur");
    expect(f.onIntent).not.toHaveBeenCalled(); // Same canonical value never creates a command.
    await size.setValue("25.");
    choice(f.wrapper, "textDirection").vm.$emit("change", "vertical-rl");
    await flushPromises();
    const intent = f.onIntent.mock.calls.at(-1)![0];
    await f.revise({ textDirection: "vertical-rl" }, intent.intentId);
    expect(size.element).toBe(element);
    expect(size.element.value).toBe("25.");
    await size.trigger("blur");
    expect(f.onIntent).toHaveBeenLastCalledWith(
      expect.objectContaining({ field: "fontSizePt", value: 25, baseRevision: 3 }),
    );
  });
  test("wrap, overflow, and resize-to-fit remain three independent intents", async () => {
    const f = fixture();
    for (const [field, value] of [
      ["textWrap", false],
      ["textOverflow", true],
      ["textResizeToFit", true],
    ] as const) {
      const component = f.wrapper
        .findAllComponents(ShapeFormatCheckbox)
        .find((component) => component.props("field") === field)!;
      component.getComponent(Checkbox).vm.$emit("change", value);
    }
    await flushPromises();
    expect(
      f.onIntent.mock.calls.map(
        ([intent]) => intent.type === "set-field" && [intent.field, intent.value],
      ),
    ).toEqual([
      ["textWrap", false],
      ["textOverflow", true],
      ["textResizeToFit", true],
    ]);
  });
});

describe("shape font exact-resource preparation", () => {
  test("inherited and exact custom family choices do not select a replacement", async () => {
    const f = fixture();
    expect(font(f.wrapper).props("modelValue")).toBe("");
    expect(font(f.wrapper).props("options")[0]).toMatchObject({
      value: "",
      label: "Inherited font",
    });
    font(f.wrapper).vm.$emit("change", "Exact Custom Family");
    await flushPromises();
    expect(f.onIntent).toHaveBeenLastCalledWith(
      expect.objectContaining({ field: "fontFamily", value: "Exact Custom Family" }),
    );
    font(f.wrapper).vm.$emit("change", "");
    await flushPromises();
    expect(f.onIntent).toHaveBeenLastCalledWith(
      expect.objectContaining({ field: "fontFamily", value: "" }),
    );
    expect(font(f.wrapper).props("modelValue")).toBe("");
    expect(fonts.load).not.toHaveBeenCalled();
  });
  test("owned font loading has no early intent or acknowledgement", async () => {
    let complete!: () => void;
    fonts.load.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          complete = resolve;
        }),
    );
    const f = fixture();
    font(f.wrapper).vm.$emit("change", "Noto Sans");
    await nextTick();
    expect(font(f.wrapper).props("modelValue")).toBe("Noto Sans");
    expect(f.onIntent).not.toHaveBeenCalled();
    complete();
    await flushPromises();
    expect(f.onIntent).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ field: "fontFamily", value: "Noto Sans", baseRevision: 2 }),
    );
  });
  test("loading failure and host rejection keep the family draft", async () => {
    fonts.load.mockRejectedValue(new Error("missing exact font"));
    const f = fixture();
    font(f.wrapper).vm.$emit("change", "Noto Sans");
    await flushPromises();
    expect(f.onIntent).not.toHaveBeenCalled();
    expect(font(f.wrapper).props("modelValue")).toBe("Noto Sans");
    expect(f.wrapper.text()).toContain(
      "The selected font could not be loaded. Your draft has been kept.",
    );
    const rejected = fixture({ accepted: false });
    font(rejected.wrapper).vm.$emit("change", "Exact Custom Family");
    await flushPromises();
    expect(font(rejected.wrapper).props("modelValue")).toBe("Exact Custom Family");
    expect(rejected.wrapper.text()).toContain(
      "The change could not be applied. Your draft has been kept.",
    );
  });
  test("an accepted unrelated edit retains the pending font draft without retargeting its action", async () => {
    let complete!: () => void;
    fonts.load.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          complete = resolve;
        }),
    );
    const f = fixture();
    font(f.wrapper).vm.$emit("change", "Noto Sans");
    await nextTick();
    choice(f.wrapper, "paragraphAlignment").vm.$emit("change", "center");
    await flushPromises();
    const intent = f.onIntent.mock.calls.at(-1)![0];
    await f.revise({ paragraphAlignment: "center" }, intent.intentId);
    complete();
    await flushPromises();
    expect(f.onIntent).toHaveBeenCalledTimes(2);
    expect(f.onIntent).toHaveBeenLastCalledWith(
      expect.objectContaining({ field: "fontFamily", value: "Noto Sans", baseRevision: 3 }),
    );
    expect(font(f.wrapper).props("modelValue")).toBe("Noto Sans");
    expect(f.wrapper.text()).not.toContain(
      "The selection or drawing changed. Review the current values and try again.",
    );
  });
  test.each(["selection", "revision", "handler", "cancel", "newer-font", "escape"] as const)(
    "pending font work cannot survive %s",
    async (boundary) => {
      let complete!: () => void;
      fonts.load.mockImplementation(
        () =>
          new Promise<void>((resolve) => {
            complete = resolve;
          }),
      );
      const f = fixture();
      font(f.wrapper).vm.$emit("change", "Noto Sans");
      await nextTick();
      if (boundary === "selection")
        f.input.snapshot = {
          ...f.input.snapshot!,
          owner: { ...f.input.snapshot!.owner, sessionId: "new-session" },
          values: { ...f.input.snapshot!.values, fontFamily: "Arial" },
        };
      if (boundary === "revision") await f.revise({ fontFamily: "Arial" });
      if (boundary === "handler") f.input.onIntent = vi.fn(() => true);
      if (boundary === "cancel") f.controller.cancel();
      if (boundary === "newer-font") font(f.wrapper).vm.$emit("change", "Arial");
      if (boundary === "escape") await font(f.wrapper).trigger("keydown", { key: "Escape" });
      await nextTick();
      complete();
      await flushPromises();
      expect(f.onIntent).toHaveBeenCalledTimes(boundary === "newer-font" ? 1 : 0);
      expect(
        f.onIntent.mock.calls.some(
          ([intent]) => intent.type === "set-field" && intent.value === "Noto Sans",
        ),
      ).toBe(false);
      if (boundary === "selection" || boundary === "newer-font")
        expect(font(f.wrapper).props("modelValue")).toBe("Arial");
      if (boundary === "revision") {
        expect(font(f.wrapper).props("modelValue")).toBe("Noto Sans");
        expect(f.wrapper.text()).toContain("The selection or drawing changed.");
        await font(f.wrapper).trigger("keydown", { key: "Escape" });
        expect(font(f.wrapper).props("modelValue")).toBe("Arial");
      }
      if (boundary === "escape") expect(font(f.wrapper).props("modelValue")).toBe("");
    },
  );
});
