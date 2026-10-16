import { mount, flushPromises, type VueWrapper } from "@vue/test-utils";
import { computed, nextTick } from "vue";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import ShapeTextRibbonTools from "../../../modules/sheet-drawings/components/ShapeTextRibbonTools.vue";
import ShapeRibbonStyleMenu from "../../../modules/sheet-drawings/components/ShapeRibbonStyleMenu.vue";
import ShapeObjectToolControls from "../../../modules/sheet-drawings/components/ShapeObjectToolControls.vue";
import FontFormatField from "../../../shared/cell-text/FontFormatField.vue";
import ColorPaletteSelect from "../../../shared/color/ColorPaletteSelect.vue";
import { createAppI18n } from "../../../shared/i18n";
import { drawingShapeTextValues } from "../../../modules/sheet-drawings/shape-text-options";
import type {
  ShapeFormatIntent,
  ShapeFormatSnapshot,
} from "../../../modules/sheet-drawings/shape-format-pane-model";
import { createGraphicDrawing } from "../../../modules/sheet-drawings/drawing-defaults";

const fonts = vi.hoisted(() => ({ load: vi.fn<(family: string) => Promise<void>>() }));
vi.mock("../../../shared/cell-text/font-resources", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../shared/cell-text/font-resources")>()),
  ensureCellFontResource: fonts.load,
}));
vi.mock("../../../shared/cell-text/useFontCatalog", () => ({
  useFontCatalog: () => ({ fontOptions: computed(() => [{ value: "Arial", label: "Arial" }]) }),
}));
const mounted: VueWrapper[] = [];
beforeEach(() => {
  fonts.load.mockReset().mockResolvedValue(undefined);
});
afterEach(() => {
  mounted.splice(0).forEach((wrapper) => wrapper.unmount());
  document.body.replaceChildren();
});
function fixture(mode: "drawing" | "text" = "text", locale: "en-US" | "zh-CN" = "en-US") {
  const drawing = createGraphicDrawing("target", "textBox", "alpha beta", { row: 0, column: 0 }),
    onIntent = vi.fn((_intent: ShapeFormatIntent) => true);
  const snapshot: ShapeFormatSnapshot = {
    owner: { workbookId: "book", sheetId: "sheet", drawingId: drawing.id, sessionId: "lease-7" },
    revision: 3,
    drawing,
    values: {
      ...drawingShapeTextValues(drawing),
      textBold: false,
      textItalic: false,
      textUnderline: false,
      textColor: "#123456",
    },
  };
  const objectTools = {
    ownerKey: "book:sheet:target",
    disabled: false,
    canFlip: true,
    canRotate: true,
    canOrder: true,
    actionHandler: vi.fn(() => true),
    formatHandler: vi.fn(() => true),
    selectionPaneHandler: vi.fn(() => true),
  };
  const wrapper = mount(ShapeTextRibbonTools, {
    attachTo: document.body,
    props: {
      mode,
      sessionId: 7,
      snapshot,
      locale,
      t: (key) => key,
      onIntent,
      objectTools,
      capabilities: {
        fields: Object.fromEntries(
          Object.keys(snapshot.values).map((field) => [field, { enabled: true }]),
        ),
        styles: {
          shape: { fill: { enabled: true }, line: { enabled: true } },
          text: { fill: { enabled: true }, line: { enabled: true } },
        },
      },
    },
    global: {
      plugins: [createAppI18n(locale)],
      stubs: {
        ColorPaletteSelect: true,
        ShapeFormatNumberField: true,
        ShapeRibbonStyleMenu: true,
        ShapeRibbonLayoutMenu: true,
        ShapeObjectToolControls: true,
      },
    },
  });
  mounted.push(wrapper);
  return { wrapper, onIntent, snapshot, objectTools };
}
function action(wrapper: VueWrapper, name: string) {
  return wrapper.get(`[data-shape-ribbon-action="${name}"]`);
}

describe("concrete text and drawing ribbon tools on the existing shape format contract", () => {
  test.each(["en-US", "zh-CN"] as const)(
    "%s text mode maps B/I/U and paragraph alignment to exact owner-bound intents",
    async (locale) => {
      const f = fixture("text", locale);
      expect(
        f.wrapper.get("[data-shape-text-ribbon]").attributes("data-shape-text-edit-session"),
      ).toBe("7");
      expect(f.wrapper.find('[data-ribbon-group="shape-font"]').exists()).toBe(true);
      expect(f.wrapper.find('[data-ribbon-group="shape-paragraph"]').exists()).toBe(true);
      expect(f.wrapper.findComponent(ShapeObjectToolControls).exists()).toBe(false);
      expect(action(f.wrapper, "align-left").attributes("aria-label")).toBe(
        locale === "zh-CN" ? "左对齐" : "Align Left",
      );
      for (const name of [
        "bold",
        "italic",
        "underline",
        "align-center",
        "align-right",
        "align-left",
      ])
        await action(f.wrapper, name).trigger("click");
      expect(
        f.onIntent.mock.calls.map(
          ([intent]) => intent.type === "set-field" && [intent.field, intent.value],
        ),
      ).toEqual([
        ["textBold", true],
        ["textItalic", true],
        ["textUnderline", true],
        ["paragraphAlignment", "center"],
        ["paragraphAlignment", "right"],
        ["paragraphAlignment", "left"],
      ]);
      for (const [intent] of f.onIntent.mock.calls)
        expect(intent).toMatchObject({
          owner: f.snapshot.owner,
          baseRevision: 3,
          intentId: expect.any(String),
        });
      expect(new Set(f.onIntent.mock.calls.map(([intent]) => intent.intentId)).size).toBe(6);
    },
  );

  test("font and text color use the same session contract and restore the leased input selection", async () => {
    const f = fixture();
    const input = document.createElement("textarea");
    input.dataset.shapeCanvasTextInput = "";
    input.dataset.shapeTextEditSession = "7";
    input.value = "alpha beta";
    document.body.appendChild(input);
    input.setSelectionRange(1, 6, "backward");
    f.wrapper.getComponent(FontFormatField).vm.$emit("change", "Arial");
    await flushPromises();
    expect(f.onIntent).toHaveBeenLastCalledWith(
      expect.objectContaining({
        type: "set-field",
        field: "fontFamily",
        value: "Arial",
        owner: f.snapshot.owner,
        baseRevision: 3,
      }),
    );
    const color = f.wrapper.getComponent(ColorPaletteSelect);
    expect(color.props("modelValue")).toBe("#123456");
    color.vm.$emit("select", "#ff0000");
    await nextTick();
    expect(f.onIntent).toHaveBeenLastCalledWith(
      expect.objectContaining({ type: "set-field", field: "textColor", value: "#ff0000" }),
    );
    expect(document.activeElement).toBe(input);
    expect([input.selectionStart, input.selectionEnd, input.selectionDirection]).toEqual([
      1,
      6,
      "backward",
    ]);
    color.vm.$emit("select", null);
    await nextTick();
    expect(f.onIntent).toHaveBeenLastCalledWith(
      expect.objectContaining({ field: "textColor", value: "" }),
    );
  });

  test("drawing mode shows body fill/outline and passes the exact object-control owner", async () => {
    const f = fixture("drawing");
    expect(f.wrapper.find('[data-ribbon-group="shape-font"]').exists()).toBe(false);
    expect(f.wrapper.find('[data-ribbon-group="shape-paragraph"]').exists()).toBe(false);
    expect(f.wrapper.findComponent(FontFormatField).exists()).toBe(false);
    const object = f.wrapper.getComponent(ShapeObjectToolControls);
    expect(object.props()).toMatchObject(f.objectTools);
    const bodyMenus = f.wrapper
      .findAllComponents(ShapeRibbonStyleMenu)
      .filter((menu) => menu.props("target") === "shape");
    expect(bodyMenus.map((menu) => menu.props("category"))).toEqual(["fill", "line"]);
    for (const menu of bodyMenus) expect(menu.props("sessionId")).toBe(7);
    const fill = bodyMenus[0]!.props("controller").styleBinding("shape", "fill");
    expect(fill.onCommit({ kind: "none" })).toBe(true);
    expect(f.onIntent).toHaveBeenLastCalledWith(
      expect.objectContaining({
        type: "set-style",
        target: "shape",
        category: "fill",
        value: { kind: "none" },
        owner: f.snapshot.owner,
        baseRevision: 3,
      }),
    );
  });

  test("mixed/disabled fields stay explicit and cannot dispatch formatting", async () => {
    const f = fixture();
    await f.wrapper.setProps({
      snapshot: { ...f.snapshot, mixedFields: ["textBold"] },
      capabilities: { fields: { textBold: { enabled: false, reason: "Protected" } } },
    });
    expect(action(f.wrapper, "bold").attributes("aria-pressed")).toBe("mixed");
    await action(f.wrapper, "bold").trigger("click");
    expect(f.wrapper.getComponent(FontFormatField).props("disabled")).toBe(true);
    expect(f.wrapper.getComponent(ColorPaletteSelect).props("disabled")).toBe(true);
    expect(f.onIntent).not.toHaveBeenCalled();
  });
});
