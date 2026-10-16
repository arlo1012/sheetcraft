import { DOMWrapper, mount, flushPromises, type VueWrapper } from "@vue/test-utils";
import { defineComponent, h, reactive } from "vue";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import ShapeRibbonFontSizeField from "../../../modules/sheet-drawings/components/ShapeRibbonFontSizeField.vue";
import ShapeFontFamilyField from "../../../modules/sheet-drawings/components/ShapeFontFamilyField.vue";
import ShapeFormatNumberField from "../../../modules/sheet-drawings/components/shape-format/ShapeFormatNumberField.vue";
import {
  useShapeFormatPane,
  type ShapeFormatController,
  type ShapeFormatPaneInput,
} from "../../../modules/sheet-drawings/components/shape-format/useShapeFormatPane";
import {
  createShapeTextFieldDrafts,
  shapeTextFieldDraftsKey,
} from "../../../modules/sheet-drawings/shape-text-field-drafts";
import type {
  ShapeFormatIntent,
  ShapeFormatValues,
} from "../../../modules/sheet-drawings/shape-format-pane-model";
import { createAppI18n } from "../../../shared/i18n";
import { textRoot } from "./shape-text-edit-session-fixture";

const resources = vi.hoisted(() => ({
  load: vi.fn<(family: string) => Promise<void>>(),
  needsLoading: vi.fn<(family: string) => boolean>(),
}));
vi.mock("../../../shared/cell-text/font-resources", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../shared/cell-text/font-resources")>()),
  ensureCellFontResource: resources.load,
  cellFontResourceNeedsLoading: resources.needsLoading,
  getCellFontResourceFamilies: (family: string) => (family === "Noto Sans" ? [family] : []),
}));
const wrappers: VueWrapper[] = [];
beforeEach(() => {
  resources.load.mockReset().mockResolvedValue(undefined);
  resources.needsLoading.mockReset().mockReturnValue(true);
});
afterEach(() => {
  wrappers.splice(0).forEach((wrapper) => wrapper.unmount());
  document.body.replaceChildren();
});
async function fixture(kind: "ribbon" | "pane" | "font") {
  const registry = createShapeTextFieldDrafts(),
    onIntent = vi.fn((_intent: ShapeFormatIntent) => true);
  const input = reactive<ShapeFormatPaneInput>({
    snapshot: {
      owner: {
        workbookId: "book",
        sheetId: "sheet",
        drawingId: "target",
        sessionId: "shape-text-7",
      },
      revision: 3,
      drawing: textRoot(),
      values: { fontSizePt: 12, fontFamily: "Arial" },
    },
    capabilities: {
      fields: { fontSizePt: { enabled: true, min: 1, max: 400 }, fontFamily: { enabled: true } },
    },
    onIntent,
    locale: "en-US",
    t: (key) => key,
  });
  let controller!: ShapeFormatController;
  const order: string[] = [];
  const wrapper = mount(
    defineComponent({
      setup() {
        controller = useShapeFormatPane(input);
        return () =>
          h(
            "div",
            {
              onPointerdownCapture: (event: PointerEvent) => {
                if (
                  !(event.target instanceof HTMLElement) ||
                  !event.target.hasAttribute("data-outside")
                )
                  return;
                order.push("capture");
                if (!registry.flush(input.snapshot!.owner.sessionId).accepted) {
                  event.preventDefault();
                  event.stopImmediatePropagation();
                }
              },
            },
            [
              kind === "ribbon"
                ? h(ShapeRibbonFontSizeField, {
                    controller,
                    sessionId: Number(input.snapshot!.owner.sessionId.replace("shape-text-", "")),
                  })
                : kind === "pane"
                  ? h(ShapeFormatNumberField, { controller, field: "fontSizePt", unit: "pt" })
                  : h(ShapeFontFamilyField, {
                      controller,
                      sessionId: Number(input.snapshot!.owner.sessionId.replace("shape-text-", "")),
                    }),
              h(
                "button",
                { "data-outside": "", onPointerdown: () => order.push("target") },
                "Outside",
              ),
            ],
          );
      },
    }),
    {
      attachTo: document.body,
      global: {
        plugins: [createAppI18n("en-US")],
        provide: { [shapeTextFieldDraftsKey as symbol]: registry },
      },
    },
  );
  wrappers.push(wrapper);
  await flushPromises();
  const field = wrapper.get<HTMLInputElement>("input"),
    outside = wrapper.get<HTMLButtonElement>("[data-outside]");
  function acknowledge(values: Partial<ShapeFormatValues>, intentId?: string) {
    input.snapshot = {
      ...input.snapshot!,
      revision: input.snapshot!.revision + 1,
      values: { ...input.snapshot!.values, ...values },
      acceptedIntentId: intentId,
    };
    return flushPromises();
  }
  return { wrapper, input, onIntent, controller, registry, field, outside, order, acknowledge };
}
async function key(element: HTMLElement, value: string) {
  const event = new KeyboardEvent("keydown", { key: value, bubbles: true, cancelable: true });
  element.dispatchEvent(event);
  await flushPromises();
  return event;
}
function pointer(element: HTMLElement) {
  const event = new PointerEvent("pointerdown", { bubbles: true, cancelable: true });
  element.dispatchEvent(event);
  return event;
}

describe.each(["ribbon", "pane"] as const)(
  "real %s font size field and registered private draft",
  (kind) => {
    test("invalid input blocks outside capture; valid size submits before native blur without duplicate intent", async () => {
      const f = await fixture(kind);
      f.field.element.focus();
      await f.field.setValue("bad size");
      expect(pointer(f.outside.element).defaultPrevented).toBe(true);
      await flushPromises();
      expect(f.onIntent).not.toHaveBeenCalled();
      expect(f.field.element.value).toBe("bad size");
      expect(document.activeElement).toBe(f.field.element);
      expect(new DOMWrapper(document.body).find('[role="alert"]').exists()).toBe(true);
      await f.field.setValue("24.");
      f.field.element.addEventListener("blur", () => f.order.push("blur"));
      f.order.splice(0);
      f.onIntent.mockImplementation((intent) => {
        f.order.push("intent");
        return intent.type === "set-field";
      });
      expect(pointer(f.outside.element).defaultPrevented).toBe(false);
      expect(f.order).toEqual(["capture", "intent", "target"]);
      expect(f.onIntent).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({
          type: "set-field",
          field: "fontSizePt",
          value: 24,
          baseRevision: 3,
        }),
      );
      f.outside.element.focus();
      await flushPromises();
      expect(f.order).toEqual(["capture", "intent", "target", "blur"]);
      expect(f.onIntent).toHaveBeenCalledOnce();
    });

    test("new typing survives a late own acknowledgement and stays on the acknowledged lease", async () => {
      const f = await fixture(kind);
      await f.field.setValue("24");
      await key(f.field.element, "Enter");
      const first = f.onIntent.mock.calls[0]![0];
      await f.field.setValue("30.");
      await f.acknowledge({ fontSizePt: 24 }, first.intentId);
      expect(f.field.element.value).toBe("30.");
      expect(f.field.attributes("aria-invalid")).toBeUndefined();
      await key(f.field.element, "Enter");
      expect(f.onIntent).toHaveBeenCalledTimes(2);
      expect(f.onIntent).toHaveBeenLastCalledWith(
        expect.objectContaining({ field: "fontSizePt", value: 30, baseRevision: 4 }),
      );
    });

    test("external revision retains a dirty stale draft; Escape rebuilds against current values", async () => {
      const f = await fixture(kind);
      await f.field.setValue("24.");
      await f.acknowledge({ fontSizePt: 18 });
      expect(f.field.element.value).toBe("24.");
      expect(pointer(f.outside.element).defaultPrevented).toBe(true);
      expect(f.onIntent).not.toHaveBeenCalled();
      expect(f.field.attributes("aria-invalid")).toBe("true");
      await key(f.field.element, "Escape");
      expect(f.field.element.value).toBe("18");
      await f.field.setValue("20");
      await key(f.field.element, "Enter");
      expect(f.onIntent).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({ field: "fontSizePt", value: 20, baseRevision: 4 }),
      );
    });

    test("actual owner change resets the old private string and retires its registry owner", async () => {
      const f = await fixture(kind);
      await f.field.setValue("24.");
      f.input.snapshot = {
        ...f.input.snapshot!,
        owner: { ...f.input.snapshot!.owner, drawingId: "other", sessionId: "shape-text-8" },
        drawing: { ...f.input.snapshot!.drawing, id: "other" },
        values: { fontSizePt: 9, fontFamily: "Arial" },
      };
      await flushPromises();
      expect(f.field.element.value).toBe("9");
      expect(f.registry.flush("shape-text-7").accepted).toBe(true);
      expect(f.onIntent).not.toHaveBeenCalled();
      await f.field.setValue("10");
      expect(f.registry.flush("shape-text-8").accepted).toBe(true);
      expect(f.onIntent).toHaveBeenLastCalledWith(
        expect.objectContaining({ owner: f.input.snapshot!.owner, field: "fontSizePt", value: 10 }),
      );
    });
  },
);

describe("native field feedback presentation", () => {
  test("Ribbon numeric error teleports only while focused, retains one describedby id unfocused, and Escape restores", async () => {
    const f = await fixture("ribbon");
    expect(f.wrapper.find(".numeric-field__unit").exists()).toBe(false);
    expect(f.field.attributes("aria-valuetext")).toContain("pt");
    f.field.element.focus();
    await f.field.setValue("invalid size");
    await key(f.field.element, "Enter");
    const ids = f.field.attributes("aria-describedby")!.split(/\s+/);
    expect(ids).toHaveLength(1);
    const id = ids[0]!;
    let message = document.getElementById(id)!;
    expect(message.textContent).toContain("range");
    expect(message.getAttribute("role")).toBe("alert");
    expect(message.closest("[data-field-feedback-floating]")?.parentElement).toBe(document.body);
    expect(document.querySelectorAll(`[id="${id}"]`)).toHaveLength(1);
    expect(f.wrapper.element.contains(message)).toBe(false);
    f.outside.element.focus();
    await flushPromises();
    expect(document.querySelector("[data-field-feedback-floating]")).toBeNull();
    message = document.getElementById(id)!;
    expect(message.classList.contains("field-feedback--description-only")).toBe(true);
    expect(f.wrapper.element.contains(message)).toBe(true);
    expect(document.querySelectorAll(`[id="${id}"]`)).toHaveLength(1);
    expect(f.field.attributes("aria-describedby")).toBe(id);
    f.field.element.focus();
    await key(f.field.element, "Escape");
    expect(f.field.element.value).toBe("12");
    expect(f.field.attributes("aria-invalid")).toBeUndefined();
    expect(document.getElementById(id)).toBeNull();
    expect(f.onIntent).not.toHaveBeenCalled();
  });

  test("sidepane NumericField retains inline feedback and visible unit markup", async () => {
    const f = await fixture("pane");
    expect(f.wrapper.get(".numeric-field__unit").text()).toBe("pt");
    f.field.element.focus();
    await f.field.setValue("invalid size");
    await key(f.field.element, "Enter");
    const id = f.field.attributes("aria-describedby")!;
    const message = document.getElementById(id)!;
    expect(f.wrapper.element.contains(message)).toBe(true);
    expect(message.classList.contains("field-feedback--description-only")).toBe(false);
    expect(document.querySelector("[data-field-feedback-floating]")).toBeNull();
    expect(document.querySelectorAll(`[id="${id}"]`)).toHaveLength(1);
    expect(f.onIntent).not.toHaveBeenCalled();
  });
});

describe("real shared font-family field resource and owner boundaries", () => {
  test("ready font resource flushes synchronously before outside pointer and successful reset prevents duplicates", async () => {
    resources.needsLoading.mockReturnValue(false);
    const f = await fixture("font");
    f.field.element.focus();
    await f.field.setValue("Noto Sans");
    f.onIntent.mockImplementation((intent) => {
      f.order.push("intent");
      return intent.type === "set-field";
    });
    expect(pointer(f.outside.element).defaultPrevented).toBe(false);
    expect(f.order).toEqual(["capture", "intent", "target"]);
    expect(f.onIntent).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ field: "fontFamily", value: "Noto Sans" }),
    );
    await flushPromises();
    expect(f.registry.flush("shape-text-7").accepted).toBe(true);
    expect(f.onIntent).toHaveBeenCalledOnce();
    f.outside.element.focus();
    await flushPromises();
    expect(f.registry.flush("shape-text-7").accepted).toBe(true);
    expect(f.onIntent).toHaveBeenCalledOnce();
  });

  test("failed font resource keeps the exact visible draft; Escape discards only that field draft", async () => {
    resources.load.mockRejectedValue(Error("Exact resource unavailable"));
    const f = await fixture("font");
    await f.field.setValue("Noto Sans");
    await key(f.field.element, "Enter");
    expect(f.field.element.value).toBe("Noto Sans");
    expect(f.wrapper.get('[role="alert"]').text()).toContain("could not be loaded");
    expect(f.onIntent).not.toHaveBeenCalled();
    expect(f.registry.flush("shape-text-7").accepted).toBe(false);
    await key(f.field.element, "Escape");
    expect(f.field.element.value).toBe("Arial");
    expect(f.registry.flush("shape-text-7").accepted).toBe(true);
  });

  test("pending resource blocks outside flush; late completion cannot retarget a replacement owner", async () => {
    const completions: Array<() => void> = [];
    resources.load.mockImplementation(
      () =>
        new Promise<void>((complete) => {
          completions.push(complete);
        }),
    );
    const f = await fixture("font");
    await f.field.setValue("Noto Sans");
    await key(f.field.element, "Enter");
    const pendingId = f.field.attributes("aria-describedby")!;
    expect(document.getElementById(pendingId)?.textContent).toContain("Loading font");
    expect(document.querySelectorAll(`[id="${pendingId}"]`)).toHaveLength(1);
    expect(f.registry.flush("shape-text-7").accepted).toBe(false);
    expect(f.onIntent).not.toHaveBeenCalled();
    f.input.snapshot = {
      ...f.input.snapshot!,
      owner: { ...f.input.snapshot!.owner, drawingId: "other", sessionId: "shape-text-8" },
      drawing: { ...f.input.snapshot!.drawing, id: "other" },
      values: { fontFamily: "Arial", fontSizePt: 12 },
    };
    await flushPromises();
    completions.splice(0).forEach((complete) => complete());
    await flushPromises();
    expect(f.field.element.value).toBe("Arial");
    expect(f.onIntent).not.toHaveBeenCalled();
    expect(f.registry.flush("shape-text-8").accepted).toBe(true);
  });

  test("Escape cancels pending font work before completion", async () => {
    const completions: Array<() => void> = [];
    resources.load.mockImplementation(
      () =>
        new Promise<void>((complete) => {
          completions.push(complete);
        }),
    );
    const f = await fixture("font");
    await f.field.setValue("Noto Sans");
    await key(f.field.element, "Enter");
    await key(f.field.element, "Escape");
    completions.splice(0).forEach((complete) => complete());
    await flushPromises();
    expect(f.field.element.value).toBe("Arial");
    expect(f.wrapper.find('[role="alert"], [role="status"]').exists()).toBe(false);
    expect(f.registry.flush("shape-text-7").accepted).toBe(true);
    expect(f.onIntent).not.toHaveBeenCalled();
  });

  test("command rejection retains family text; outside flush does not repeat it and explicit Enter retries", async () => {
    const f = await fixture("font");
    f.onIntent.mockReturnValue(false);
    const raw = "  Exact Custom Family  ";
    await f.field.setValue(raw);
    await key(f.field.element, "Enter");
    expect(f.field.element.value).toBe(raw);
    expect(f.onIntent).toHaveBeenCalledOnce();
    expect(f.registry.flush("shape-text-7").accepted).toBe(false);
    expect(f.onIntent).toHaveBeenCalledOnce();
    f.onIntent.mockReturnValue(true);
    await key(f.field.element, "Enter");
    expect(f.onIntent).toHaveBeenCalledTimes(2);
    expect(f.onIntent).toHaveBeenLastCalledWith(
      expect.objectContaining({
        field: "fontFamily",
        value: "Exact Custom Family",
        baseRevision: 3,
      }),
    );
  });
});

describe("font popup search is separate from the registered main draft", () => {
  test("search typing and Enter only filter candidates and never create a main-field intent", async () => {
    const f = await fixture("font");
    await f.wrapper.get('span[aria-haspopup="menu"]').trigger("click");
    await flushPromises();
    const search = new DOMWrapper(document.body).get<HTMLInputElement>('input[type="search"]');
    search.element.focus();
    await search.setValue("Noto");
    await key(search.element, "Enter");
    expect(f.field.element.value).toBe("Arial");
    expect(f.registry.flush("shape-text-7").accepted).toBe(true);
    expect(f.onIntent).not.toHaveBeenCalled();
  });

  test("font arrow opens a body popup; search ArrowDown and candidate Enter apply the correct family and refocus the lease", async () => {
    resources.needsLoading.mockReturnValue(false);
    const f = await fixture("font");
    const input = document.createElement("textarea");
    input.dataset.shapeCanvasTextInput = "";
    input.dataset.shapeTextEditSession = "7";
    input.value = "alpha beta";
    document.body.appendChild(input);
    input.setSelectionRange(1, 5, "backward");
    await f.wrapper.get('span[aria-haspopup="menu"]').trigger("click");
    await flushPromises();
    const body = new DOMWrapper(document.body),
      search = body.get<HTMLInputElement>('input[type="search"]');
    expect(f.wrapper.element.contains(search.element)).toBe(false);
    search.element.focus();
    await search.setValue("Noto Sans CJK SC");
    await key(search.element, "ArrowDown");
    const candidate = document.activeElement;
    expect(candidate).toBeInstanceOf(HTMLElement);
    if (!(candidate instanceof HTMLElement)) throw Error("Expected the native font candidate");
    expect(candidate.getAttribute("role")).toBe("menuitemradio");
    expect(candidate.textContent).toContain("Noto Sans CJK SC");
    await key(candidate, "Enter");
    expect(f.onIntent).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        field: "fontFamily",
        value: "Noto Sans CJK SC",
        owner: f.input.snapshot!.owner,
        baseRevision: 3,
      }),
    );
    expect(document.activeElement).toBe(input);
    expect([input.selectionStart, input.selectionEnd, input.selectionDirection]).toEqual([
      1,
      5,
      "backward",
    ]);
    expect(f.registry.flush("shape-text-7").accepted).toBe(true);
    expect(f.onIntent).toHaveBeenCalledOnce();
  });

  test("search Enter and Escape do not submit or cancel an existing exact main-input draft", async () => {
    const f = await fixture("font");
    f.field.element.focus();
    await f.field.setValue("Exact Main Draft");
    // Typing already opened the main-input filter; close it before opening the
    // independent popup search rather than accidentally toggling it shut.
    const arrow = f.wrapper.get('span[aria-haspopup="menu"]');
    expect(arrow.attributes("aria-expanded")).toBe("true");
    await arrow.trigger("click");
    await arrow.trigger("click");
    await flushPromises();
    const search = new DOMWrapper(document.body).get<HTMLInputElement>('input[type="search"]');
    search.element.focus();
    await search.setValue("Arial");
    await key(search.element, "Enter");
    expect(f.onIntent).not.toHaveBeenCalled();
    expect(f.field.element.value).toBe("Exact Main Draft");
    await key(search.element, "Escape");
    expect(f.onIntent).not.toHaveBeenCalled();
    expect(f.field.element.value).toBe("Exact Main Draft");
    expect(f.registry.flush("shape-text-7").accepted).toBe(true);
    expect(f.onIntent).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ field: "fontFamily", value: "Exact Main Draft", baseRevision: 3 }),
    );
  });
});
