import { mount, flushPromises, type VueWrapper } from "@vue/test-utils";
import { computed, defineComponent, h, nextTick, reactive } from "vue";
import { afterEach, describe, expect, test, vi } from "vitest";
import FontFormatField from "../../../shared/cell-text/FontFormatField.vue";
import type { FontFieldDraftBinding } from "../../../shared/cell-text/font-field-draft";
import { useNumericDraft } from "../../../shared/numeric-field/useNumericDraft";
import type { NumericDraftInputs, NumericCandidate } from "../../../shared/numeric-field/types";
const mounted: VueWrapper[] = [];
afterEach(() => {
  mounted.splice(0).forEach((w) => w.unmount());
  document.body.replaceChildren();
});
function fixture() {
  const accepted = { value: true };
  const calls = vi.fn((candidate: NumericCandidate) => {
    if (!accepted.value) return { accepted: false as const, error: "Refused" };
    source.value = candidate;
    return { accepted: true as const };
  });
  const source = reactive<NumericDraftInputs>({
    value: { kind: "value", value: 11 },
    ownerKey: "shape-a",
    spec: { displayUnit: "pt", canonicalBounds: { min: 1, max: 1000 } },
    invalidMessage: "Invalid",
    rejectedMessage: "Refused",
    staleMessage: "Stale",
    onCommit: calls,
  });
  let state!: ReturnType<typeof useNumericDraft>;
  let currentBinding!: FontFieldDraftBinding;
  const wrapper = mount(
    defineComponent({
      setup() {
        state = useNumericDraft(source);
        const binding = computed<FontFieldDraftBinding>(() => {
          const owner = source.ownerKey,
            handler = source.onCommit;
          const current = () => owner === source.ownerKey && handler === source.onCommit;
          return {
            get text() {
              return state.text.value;
            },
            get composing() {
              return state.composing.value;
            },
            edit: (text) => {
              if (current()) state.edit(text);
            },
            setComposing: (active, text) => {
              if (current()) state.setComposing(active, text);
            },
            submit: (kind) => current() && state.commit(kind),
            select: (value) => {
              if (!current() || state.composing.value) return false;
              state.edit(String(value));
              return state.commit("external");
            },
            cancel: () => {
              if (current()) state.cancel();
            },
          };
        });
        return () => {
          currentBinding = binding.value;
          return h(FontFormatField, {
            modelValue: source.value.kind === "value" ? source.value.value : undefined,
            draft: binding.value,
            options: [
              { value: 11, label: "11" },
              { value: 14, label: "14" },
              { value: 24, label: "24" },
            ],
            label: "Font size",
            disabled: !!source.disabled,
            readOnly: !!source.readOnly,
            status: state.error.value ? "error" : undefined,
            nativeAttributes: {
              inputmode: "decimal",
              "aria-description": "pt",
              "data-shape-text-edit-session": "7",
            },
          });
        };
      },
    }),
    { attachTo: document.body },
  );
  mounted.push(wrapper);
  return {
    wrapper,
    source,
    calls,
    accepted,
    input: wrapper.get<HTMLInputElement>("input"),
    state: () => state,
    binding: () => currentBinding,
  };
}
async function key(input: ReturnType<typeof fixture>["input"], key: string) {
  await input.trigger("keydown", { key, code: key });
  await flushPromises();
}
async function open(f: ReturnType<typeof fixture>) {
  await f.wrapper.get(".font-format-field__arrow").trigger("click");
  await flushPromises();
}
function row(text: string) {
  const el = [...document.body.querySelectorAll<HTMLElement>('[role="menuitemradio"]')].find(
    (el) => el.textContent?.trim() === text,
  );
  expect(el).toBeDefined();
  return el!;
}
describe("existing font combo optional controlled draft", () => {
  test("keeps the standard SelectInput shell and real combobox/unit/owner attributes", async () => {
    const f = fixture();
    expect(f.wrapper.find(".sheetcraft-ribbon-font-input.t-select-input").exists()).toBe(true);
    expect(f.wrapper.find(".t-input-number").exists()).toBe(false);
    expect(f.wrapper.findAll(".font-format-field__arrow")).toHaveLength(1);
    expect(f.input.attributes()).toMatchObject({
      role: "combobox",
      "aria-expanded": "false",
      inputmode: "decimal",
      "aria-description": "pt",
      "data-shape-text-edit-session": "7",
    });
    expect(f.input.attributes("aria-valuenow")).toBeUndefined();
    await open(f);
    expect(f.input.attributes("aria-expanded")).toBe("true");
    expect(document.getElementById(f.input.attributes("aria-controls")!)).not.toBeNull();
  });
  test("typed fractional size commits Enter then blur only once without spinner quantization", async () => {
    const f = fixture();
    f.input.element.focus();
    await f.input.setValue("100.5");
    expect(f.calls).not.toHaveBeenCalled();
    await key(f.input, "Enter");
    f.input.element.blur();
    await flushPromises();
    expect(f.calls).toHaveBeenCalledTimes(1);
    expect(f.calls.mock.calls[0]?.[0]).toEqual({ kind: "value", value: 100.5 });
    expect(f.input.element.value).toBe("100.5");
  });
  test.each(["invalid", "rejected"] as const)(
    "ordinary blur retains %s draft without reclaiming outside focus",
    async (kind) => {
      const f = fixture();
      const outside = document.createElement("button");
      document.body.append(outside);
      f.accepted.value = kind !== "rejected";
      f.input.element.focus();
      await f.input.setValue(kind === "invalid" ? "oops" : "24");
      outside.focus();
      await flushPromises();
      expect(document.activeElement).toBe(outside);
      expect(f.input.element.value).toBe(kind === "invalid" ? "oops" : "24");
      expect(f.state().error.value).toBe(kind === "invalid" ? "Invalid" : "Refused");
      expect(f.calls).toHaveBeenCalledTimes(kind === "invalid" ? 0 : 1);
      expect(f.wrapper.getComponent(FontFormatField).emitted("focusChange")?.at(-1)).toEqual([
        false,
      ]);
      f.input.element.focus();
      await key(f.input, "Escape");
      expect(f.input.element.value).toBe("11");
      expect(f.state().error.value).toBeUndefined();
      expect(f.calls).toHaveBeenCalledTimes(kind === "invalid" ? 0 : 1);
    },
  );
  test.each(["invalid", "rejected", "valid"] as const)(
    "Tab focus chain through the arrow releases %s draft outside exactly once",
    async (kind) => {
      const f = fixture();
      const outside = document.createElement("button");
      document.body.append(outside);
      const arrow = f.wrapper.get<HTMLElement>(".font-format-field__arrow");
      f.accepted.value = kind !== "rejected";
      f.input.element.focus();
      await f.input.setValue(kind === "invalid" ? "0" : "24");
      await key(f.input, "Enter");
      await f.input.trigger("keydown", { key: "Tab" });
      // happy-dom has no native Tab traversal: move to the actual next tab stop.
      arrow.element.focus();
      await flushPromises();
      expect(document.activeElement).toBe(arrow.element);
      expect(f.wrapper.getComponent(FontFormatField).emitted("focusChange")?.at(-1)).toEqual([
        true,
      ]);
      expect(f.calls).toHaveBeenCalledTimes(kind === "invalid" ? 0 : 1);
      await arrow.trigger("keydown", { key: "Tab" });
      outside.focus();
      await flushPromises();
      expect(document.activeElement).toBe(outside);
      expect(f.wrapper.getComponent(FontFormatField).emitted("focusChange")?.at(-1)).toEqual([
        false,
      ]);
      expect(f.input.element.value).toBe(kind === "invalid" ? "0" : "24");
      expect(f.state().error.value).toBe(
        kind === "invalid" ? "Invalid" : kind === "rejected" ? "Refused" : undefined,
      );
      expect(f.calls).toHaveBeenCalledTimes(kind === "invalid" ? 0 : 1);
    },
  );
  test("arrow blur keeps input and owned popup focus transfers internal", async () => {
    const f = fixture();
    const arrow = f.wrapper.get<HTMLElement>(".font-format-field__arrow");
    f.input.element.focus();
    await f.input.setValue("17");
    arrow.element.focus();
    await flushPromises();
    f.input.element.focus();
    await flushPromises();
    expect(f.calls).not.toHaveBeenCalled();
    arrow.element.focus();
    await flushPromises();
    await arrow.trigger("keydown", { key: "ArrowDown" });
    await flushPromises();
    expect(document.activeElement?.getAttribute("role")).toBe("menuitemradio");
    expect(f.input.attributes("aria-expanded")).toBe("true");
    expect(f.calls).not.toHaveBeenCalled();
    expect(f.wrapper.getComponent(FontFormatField).emitted("focusChange")?.at(-1)).toEqual([true]);
  });
  test("ordinary blur submits a valid draft once and leaves focus outside", async () => {
    const f = fixture();
    const outside = document.createElement("button");
    document.body.append(outside);
    f.input.element.focus();
    await f.input.setValue("24.5");
    outside.focus();
    await flushPromises();
    expect(document.activeElement).toBe(outside);
    expect(f.calls).toHaveBeenCalledExactlyOnceWith(
      { kind: "value", value: 24.5 },
      expect.anything(),
    );
    expect(f.input.element.value).toBe("24.5");
    expect(f.state().error.value).toBeUndefined();
  });
  test("compositionend before ordinary blur submits the completed text exactly once", async () => {
    const f = fixture();
    const outside = document.createElement("button");
    document.body.append(outside);
    f.input.element.focus();
    await f.input.trigger("compositionstart");
    f.input.element.value = "15.5";
    await f.input.trigger("input");
    await f.input.trigger("compositionend");
    outside.focus();
    await flushPromises();
    expect(f.input.element.value).toBe("15.5");
    expect(document.activeElement).toBe(outside);
    expect(f.state().composing.value).toBe(false);
    expect(f.calls).toHaveBeenCalledExactlyOnceWith(
      { kind: "value", value: 15.5 },
      expect.anything(),
    );
  });
  test("queued ordinary blur cannot submit the replaced owner's draft or reclaim focus", async () => {
    const f = fixture();
    const outside = document.createElement("button");
    document.body.append(outside);
    f.input.element.focus();
    await f.input.setValue("17");
    outside.focus();
    f.source.ownerKey = "shape-b";
    f.source.value = { kind: "value", value: 9 };
    await flushPromises();
    expect(document.activeElement).toBe(outside);
    expect(f.calls).not.toHaveBeenCalled();
    expect(f.input.element.value).toBe("9");
    expect(f.state().error.value).toBeUndefined();
  });
  test("invalid and intermediate text is retained; Escape cancels without parent action", async () => {
    const f = fixture(),
      parent = vi.fn();
    document.body.addEventListener("keydown", parent);
    for (const raw of ["-", "oops"]) {
      await f.input.setValue(raw);
      await key(f.input, "Enter");
      expect(f.input.element.value).toBe(raw);
      expect(f.state().error.value).toBe("Invalid");
      expect(f.calls).not.toHaveBeenCalled();
    }
    await key(f.input, "Escape");
    expect(f.input.element.value).toBe("11");
    expect(parent).not.toHaveBeenCalled();
    document.body.removeEventListener("keydown", parent);
  });
  test("a real candidate replaces an invalid draft and closes only after acceptance", async () => {
    const f = fixture();
    await f.input.setValue("oops");
    await key(f.input, "Enter");
    await open(f);
    row("14").click();
    await flushPromises();
    expect(f.calls).toHaveBeenCalledTimes(1);
    expect(f.calls.mock.calls[0]?.[0]).toEqual({ kind: "value", value: 14 });
    expect(f.input.element.value).toBe("14");
    expect(f.input.attributes("aria-expanded")).toBe("false");
  });
  test("rejected candidate keeps its draft and menu; Escape closes menu before cancelling text", async () => {
    const f = fixture();
    f.accepted.value = false;
    await open(f);
    row("24").click();
    await flushPromises();
    expect(f.input.element.value).toBe("24");
    expect(f.input.attributes("aria-expanded")).toBe("true");
    expect(f.state().error.value).toBe("Refused");
    await key(f.input, "Escape");
    expect(f.input.attributes("aria-expanded")).toBe("false");
    expect(f.input.element.value).toBe("24");
    await key(f.input, "Escape");
    expect(f.input.element.value).toBe("11");
  });
  test("IME Enter/Escape cannot submit or cancel a partial composition", async () => {
    const f = fixture();
    f.input.element.focus();
    await f.input.trigger("compositionstart");
    f.input.element.value = "15.5";
    await f.input.trigger("input");
    await key(f.input, "Enter");
    await key(f.input, "Escape");
    expect(f.calls).not.toHaveBeenCalled();
    expect(f.state().composing.value).toBe(true);
    await f.input.trigger("compositionend");
    await key(f.input, "Enter");
    expect(f.calls).toHaveBeenCalledTimes(1);
    expect(f.calls.mock.calls[0]?.[0]).toEqual({ kind: "value", value: 15.5 });
  });
  test("external lease remains stale, while new-owner input and real selection stay usable", async () => {
    const f = fixture();
    const old = f.binding();
    await f.input.setValue("17");
    const fresh = vi.fn((candidate: NumericCandidate) => ({
      accepted: true as const,
      value: candidate,
    }));
    f.source.onCommit = fresh;
    await nextTick();
    await key(f.input, "Enter");
    expect(f.state().error.value).toBe("Stale");
    expect(fresh).not.toHaveBeenCalled();
    await key(f.input, "Escape");
    f.source.ownerKey = "shape-b";
    f.source.value = { kind: "value", value: 9 };
    await nextTick();
    expect(old.select(24)).toBe(false);
    await f.input.setValue("19.5");
    await key(f.input, "Enter");
    expect(fresh).toHaveBeenCalledTimes(1);
    await open(f);
    row("14").click();
    await flushPromises();
    expect(fresh).toHaveBeenCalledTimes(2);
    expect(fresh.mock.calls[1]?.[0]).toEqual({ kind: "value", value: 14 });
  });
  test("real owned popup containment delays blur; ArrowDown opens choices rather than steps", async () => {
    const f = fixture();
    f.input.element.focus();
    await f.input.setValue("17");
    await key(f.input, "ArrowDown");
    expect(f.calls).not.toHaveBeenCalled();
    expect(f.input.element.value).toBe("17");
    const field = f.wrapper.getComponent(FontFormatField);
    expect(field.vm.containsTarget(row("14"))).toBe(true);
    expect(field.vm.ownsDraftTarget(row("14"))).toBe(false);
    const arrow = f.wrapper.get(".font-format-field__arrow").element;
    expect(field.vm.ownsTriggerTarget(arrow)).toBe(true);
    expect(field.vm.ownsDraftTarget(arrow)).toBe(false);
    expect(field.vm.ownsTriggerTarget(f.input.element)).toBe(false);
    expect(field.vm.ownsTriggerTarget(row("14"))).toBe(false);
    expect(field.vm.ownsTriggerTarget(field.element)).toBe(false);
    expect(field.vm.ownsTriggerTarget(null)).toBe(false);
    const other = document.createElement("button");
    document.body.append(other);
    expect(field.vm.containsTarget(other)).toBe(false);
    row("14").focus();
    await flushPromises();
    expect(f.calls).not.toHaveBeenCalled();
  });
  test("readonly pending stays focusable and Escape can cancel without a write", async () => {
    const f = fixture();
    await f.input.setValue("17");
    f.source.readOnly = true;
    await nextTick();
    expect(f.input.element.readOnly).toBe(true);
    expect(f.input.element.disabled).toBe(false);
    f.input.element.focus();
    expect(document.activeElement).toBe(f.input.element);
    await key(f.input, "Enter");
    expect(f.calls).not.toHaveBeenCalled();
    await key(f.input, "Escape");
    expect(f.input.element.value).toBe("11");
  });
  test("legacy font family/search and exposed exact-main-input contract remain available", async () => {
    const w = mount(FontFormatField, {
      attachTo: document.body,
      props: {
        modelValue: "Arial",
        options: [
          { value: "Arial", label: "Arial" },
          { value: "Noto Sans", label: "Noto Sans" },
        ],
        label: "Font family",
        disabled: false,
        searchLabel: "Search fonts",
        emptyLabel: "None",
      },
    });
    mounted.push(w);
    const input = w.get<HTMLInputElement>("input");
    expect(w.vm.ownsDraftTarget(input.element)).toBe(true);
    expect(w.vm.readDraft()).toBe("Arial");
    await w.get(".font-format-field__arrow").trigger("click");
    await flushPromises();
    const search = document.body.querySelector<HTMLInputElement>('input[type="search"]')!;
    expect(search).not.toBeNull();
    expect(w.vm.ownsDraftTarget(search)).toBe(false);
    expect(w.vm.ownsTriggerTarget(search)).toBe(false);
    expect(w.vm.containsTarget(search)).toBe(true);
    search.value = "Arial";
    search.dispatchEvent(new Event("input", { bubbles: true }));
    search.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    await flushPromises();
    expect(w.emitted("change")).toBeUndefined();
    row("Arial").click();
    await flushPromises();
    expect(w.emitted("change")?.[0]).toEqual(["Arial"]);
    await input.setValue("Custom Family");
    await key(input, "Enter");
    expect(w.emitted("change")?.at(-1)).toEqual(["Custom Family"]);
    w.vm.reset();
    await nextTick();
    expect(w.vm.hasDraft()).toBe(false);
    w.vm.focus();
    expect(document.activeElement).toBe(input.element);
  });
});
