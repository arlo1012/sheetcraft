import { flushPromises, mount } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { Dialog } from "tdesign-vue-next/es/dialog";
import { Input } from "tdesign-vue-next/es/input";
import { Select } from "tdesign-vue-next/es/select";
import { shallowRef } from "vue";
import { Tabs } from "tdesign-vue-next/es/tabs";
import SymbolDialog from "../../../modules/insert-tools/components/SymbolDialog.vue";
import SymbolCharacterGrid from "../../../modules/insert-tools/components/SymbolCharacterGrid.vue";
import { createAppI18n } from "../../../shared/i18n";
import {
  defaultSymbolPreferences,
  useSymbolPreferences,
  withCustomSymbol,
} from "../../../modules/insert-tools/symbols/symbol-preferences";
import * as localSource from "../../../shared/cell-text/local-font-source";
import catalogData from "../../../modules/insert-tools/symbols/assets/unicode-catalog.json";
const ensureFont = vi.hoisted(() => vi.fn(async (_family: string) => undefined));
vi.mock("../../../shared/cell-text/managed-fonts", async (original) => ({
  ...(await original<object>()),
  ensureManagedCellFont: ensureFont,
}));
vi.mock("../../../shared/cell-text/font-resources", () => ({ retryCellFontResource: ensureFont }));
const mounted: Array<{ unmount(): void }> = [];
beforeEach(() => {
  useSymbolPreferences().update(defaultSymbolPreferences());
  ensureFont.mockReset();
  ensureFont.mockResolvedValue(undefined);
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok: true, json: async () => catalogData })),
  );
});
afterEach(() => {
  for (const wrapper of mounted.splice(0)) wrapper.unmount();
  document.body.replaceChildren();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
async function fixture(
  disabled = false,
  defaultFontFamily?: string,
  locale: "en-US" | "zh-CN" = "en-US",
) {
  const wrapper = mount(SymbolDialog, {
    attachTo: document.body,
    props: { disabled, defaultFontFamily },
    global: { plugins: [createAppI18n(locale)] },
  });
  mounted.push(wrapper);
  await vi.waitFor(() =>
    expect(wrapper.text()).not.toContain(
      locale === "zh-CN" ? "正在加载字符目录…" : "Loading character catalog…",
    ),
  );
  await flushPromises();
  return wrapper;
}
function mainDialog(wrapper: Awaited<ReturnType<typeof fixture>>) {
  return wrapper.findAllComponents(Dialog)[0]!;
}
describe("complete Symbol dialog", () => {
  test("localizes Chinese labels and complete Unicode subset choices without changing their identities", async () => {
    const wrapper = await fixture(false, undefined, "zh-CN");
    expect(wrapper.text()).toContain("自定义符号");
    expect(wrapper.get(".symbol-dialog__literal > span").text()).toBe("自定义字符");
    const font = wrapper
      .findAllComponents(Select)
      .find((select) =>
        select
          .props("options")
          ?.some((option) => "value" in option && option.value === "noto-math"),
      )!;
    font.vm.$emit("update:modelValue", "noto-math");
    await flushPromises();
    const subset = wrapper
      .findAllComponents(Select)
      .find((select) =>
        select
          .props("options")
          ?.some((option) => "value" in option && option.value === "Mathematical Operators"),
      );
    expect(subset).toBeDefined();
    expect(
      subset!
        .props("options")
        ?.find((option) => "value" in option && option.value === "Mathematical Operators")?.label,
    ).toContain("数学运算符");
    expect(
      subset!.props("options")?.find((option) => "value" in option && option.value === "Arrows")
        ?.label,
    ).toContain("箭头");
  });
  test("loads only the active font and emits typed continuous insertion without closing", async () => {
    const wrapper = await fixture();
    expect(ensureFont.mock.calls.map((call) => call[0])).toEqual(["Noto Sans"]);
    await wrapper.get('[data-code-point="65"]').trigger("click");
    mainDialog(wrapper).vm.$emit("confirm");
    mainDialog(wrapper).vm.$emit("confirm");
    expect(wrapper.emitted("insert")).toEqual([
      [{ text: "A", fontFamily: "Noto Sans" }],
      [{ text: "A", fontFamily: "Noto Sans" }],
    ]);
    expect(wrapper.emitted("close")).toBeUndefined();
    await wrapper.vm.$nextTick();
    expect(mainDialog(wrapper).props("cancelBtn")).toBe("Close");
  });
  test("keeps glyph DOM bounded and supports double click, arrows and document End", async () => {
    const wrapper = await fixture();
    expect(wrapper.findAll('[role="gridcell"]').length).toBeLessThanOrEqual(170);
    await wrapper.get('[data-code-point="65"]').trigger("dblclick");
    expect(wrapper.emitted("insert")).toHaveLength(1);
    await wrapper.get('[role="grid"]').trigger("keydown", { key: "ArrowRight" });
    await wrapper.get('[role="grid"]').trigger("keydown", { key: "Enter" });
    expect(wrapper.emitted("insert")?.[1]).toEqual([{ text: "B", fontFamily: "Noto Sans" }]);
    await wrapper.get('[role="grid"]').trigger("keydown", { key: "End", ctrlKey: true });
    expect(wrapper.getComponent(SymbolCharacterGrid).props("selected")).toBeGreaterThan(1000);
    expect(wrapper.findAll('[role="gridcell"]').length).toBeLessThanOrEqual(170);
  });
  test("invalid code cannot insert a previously selected glyph", async () => {
    const wrapper = await fixture();
    const codeInput = wrapper
      .findAllComponents(Input)
      .find((input) => input.props("value") === "0020")!;
    codeInput.vm.$emit("change", "D800");
    await wrapper.vm.$nextTick();
    mainDialog(wrapper).vm.$emit("confirm");
    expect(wrapper.emitted("insert")).toBeUndefined();
    expect(wrapper.text()).toContain("previous character will not be inserted");
    codeInput.vm.$emit("change", "03A9");
    await wrapper.vm.$nextTick();
    mainDialog(wrapper).vm.$emit("confirm");
    expect(wrapper.emitted("insert")).toEqual([[{ text: "Ω", fontFamily: "Noto Sans" }]]);
  });
  test("literal custom input preserves arbitrary text and omits font metadata", async () => {
    const wrapper = await fixture();
    const input = wrapper
      .findAllComponents(Input)
      .find((entry) => entry.props("maxlength") === 16)!;
    input.vm.$emit("update:modelValue", "Ω🙂<>&");
    input.vm.$emit("change", "Ω🙂<>&");
    await wrapper.vm.$nextTick();
    mainDialog(wrapper).vm.$emit("confirm");
    expect(wrapper.emitted("insert")).toEqual([[{ text: "Ω🙂<>&" }]]);
    await wrapper.setProps({ disabled: true });
    mainDialog(wrapper).vm.$emit("confirm");
    expect(wrapper.emitted("insert")).toHaveLength(1);
  });
  test("special page retains exact space identities and custom page has 39 entries", async () => {
    const wrapper = await fixture();
    wrapper.getComponent(Tabs).vm.$emit("update:modelValue", "special");
    await wrapper.vm.$nextTick();
    const special = wrapper.findAll(
      '[aria-label="Special characters"][role="listbox"] [role="option"]',
    );
    expect(special).toHaveLength(17);
    await special[2]!.trigger("click");
    mainDialog(wrapper).vm.$emit("confirm");
    expect(wrapper.emitted("insert")?.[0]?.[0]).toMatchObject({ text: "\u3000" });
    expect(wrapper.findAll('.symbol-dialog__custom-list [role="option"]')).toHaveLength(39);
  });
  test("recent identity is published on explicit Close, not Escape", async () => {
    const wrapper = await fixture();
    await wrapper.get('[data-code-point="65"]').trigger("click");
    mainDialog(wrapper).vm.$emit("confirm");
    expect(useSymbolPreferences().preferences.value.recent[0]?.text).toBe("▲");
    mainDialog(wrapper).vm.$emit("close", { trigger: "esc" });
    expect(useSymbolPreferences().preferences.value.recent[0]?.text).toBe("▲");
    const second = await fixture();
    await second.get('[data-code-point="66"]').trigger("click");
    mainDialog(second).vm.$emit("confirm");
    mainDialog(second).vm.$emit("close", { trigger: "cancel" });
    expect(useSymbolPreferences().preferences.value.recent[0]).toEqual({
      text: "B",
      fontFamily: "Noto Sans",
    });
  });
  test("recent inherited text remains inherited and reset requires explicit confirmation", async () => {
    const wrapper = await fixture();
    await wrapper.get(".symbol-dialog__recent button").trigger("click");
    await flushPromises();
    mainDialog(wrapper).vm.$emit("confirm");
    expect(wrapper.emitted("insert")?.[0]).toEqual([{ text: "▲" }]);
    wrapper.getComponent(Tabs).vm.$emit("update:modelValue", "custom");
    await wrapper.vm.$nextTick();
    const reset = wrapper
      .findAll("button")
      .find((button) => button.text() === "Reset symbol toolbar")!;
    await reset.trigger("click");
    const confirm = wrapper.findAllComponents(Dialog)[1]!;
    expect(confirm.props("visible")).toBe(true);
    confirm.vm.$emit("close");
    await wrapper.vm.$nextTick();
    expect(confirm.props("visible")).toBe(false);
  });
  test("font changes use their own repertoire, and subsets jump without filtering away neighbors", async () => {
    const wrapper = await fixture();
    const selectors = wrapper.findAllComponents(Select);
    selectors[1]!.vm.$emit("change", "Greek and Coptic");
    await wrapper.vm.$nextTick();
    const grid = wrapper.getComponent(SymbolCharacterGrid);
    expect(grid.props("selected")).toBeGreaterThanOrEqual(0x370);
    expect(grid.props("points").includes(65)).toBe(true);
    selectors[0]!.vm.$emit("update:modelValue", "noto-symbols-2");
    await flushPromises();
    expect(ensureFont).toHaveBeenLastCalledWith("Noto Sans Symbols 2");
  });
  test("owner callback rejects stale insertion without recording success, and owns accepted insertion", async () => {
    const wrapper = await fixture();
    const insertText = vi.fn(() => false);
    await wrapper.setProps({ insertText, editSessionId: "captured-owner" });
    await wrapper.get('[data-code-point="65"]').trigger("click");
    mainDialog(wrapper).vm.$emit("confirm");
    expect(insertText).toHaveBeenCalledWith({ text: "A", fontFamily: "Noto Sans" });
    expect(wrapper.emitted("insert")).toBeUndefined();
    expect(mainDialog(wrapper).props("cancelBtn")).toBe("Cancel");
    expect(wrapper.get(".symbol-dialog").attributes("data-cell-edit-session")).toBe(
      "captured-owner",
    );
    insertText.mockReturnValue(true);
    mainDialog(wrapper).vm.$emit("confirm");
    await wrapper.vm.$nextTick();
    expect(mainDialog(wrapper).props("cancelBtn")).toBe("Close");
    expect(wrapper.emitted("insert")).toBeUndefined();
  });
  test("custom configuration assigns and clears shortcuts, reorders, removes and confirms reset", async () => {
    const wrapper = await fixture();
    wrapper.getComponent(Tabs).vm.$emit("update:modelValue", "custom");
    await wrapper.vm.$nextTick();
    const button = (text: string) =>
      wrapper.findAll("button").find((entry) => entry.text() === text)!;
    const shortcut = wrapper
      .findAllComponents(Input)
      .find((entry) => entry.props("placeholder") === "Press a key combination")!;
    shortcut.vm.$emit("keydown", "", {
      e: new KeyboardEvent("keydown", { key: "F11", ctrlKey: true, shiftKey: true }),
    });
    await wrapper.vm.$nextTick();
    await button("Assign shortcut").trigger("click");
    expect(useSymbolPreferences().preferences.value.custom[0]?.shortcut).toBe("Ctrl+Shift+F11");
    await button("Move down").trigger("click");
    expect(useSymbolPreferences().preferences.value.custom[1]?.text).toBe("＋");
    await button("Clear shortcut").trigger("click");
    expect(useSymbolPreferences().preferences.value.custom[1]?.shortcut).toBeUndefined();
    await button("Remove").trigger("click");
    expect(useSymbolPreferences().preferences.value.custom).toHaveLength(38);
    await button("Reset symbol toolbar").trigger("click");
    wrapper.findAllComponents(Dialog)[1]!.vm.$emit("confirm");
    await wrapper.vm.$nextTick();
    expect(useSymbolPreferences().preferences.value.custom).toEqual(
      defaultSymbolPreferences().custom,
    );
  });
  test("font failure is explicit, blocks styled insertion and supports retry", async () => {
    ensureFont.mockRejectedValueOnce(new Error("font offline"));
    const wrapper = await fixture();
    expect(wrapper.text()).toContain("selected font could not be loaded");
    mainDialog(wrapper).vm.$emit("confirm");
    expect(wrapper.emitted("insert")).toBeUndefined();
    const retry = wrapper.findAll("button").find((button) => button.text() === "Retry")!;
    await retry.trigger("click");
    await flushPromises();
    mainDialog(wrapper).vm.$emit("confirm");
    expect(wrapper.emitted("insert")?.[0]).toEqual([{ text: " ", fontFamily: "Noto Sans" }]);
  });

  test("shortcut field follows selected entry identity on reopen and prepend", async () => {
    const store = useSymbolPreferences();
    store.update({
      ...store.preferences.value,
      custom: store.preferences.value.custom.map((item, index) =>
        index === 0 ? { ...item, shortcut: "Ctrl+Shift+F11" } : item,
      ),
    });
    const wrapper = await fixture();
    const input = wrapper
      .findAllComponents(Input)
      .find((entry) => entry.props("placeholder") === "Press a key combination")!;
    expect(input.props("value")).toBe("Ctrl+Shift+F11");
    store.update(withCustomSymbol(store.preferences.value, { text: "☃" }));
    await wrapper.vm.$nextTick();
    expect(input.props("value")).toBe("");
  });

  test("custom font preview loads lazily and retries the failing family", async () => {
    const store = useSymbolPreferences();
    store.update(
      withCustomSymbol(store.preferences.value, { text: "Ω", fontFamily: "Noto Sans Math" }),
    );
    const wrapper = await fixture();
    ensureFont.mockRejectedValueOnce(new Error("math offline"));
    wrapper.getComponent(Tabs).vm.$emit("update:modelValue", "custom");
    await flushPromises();
    expect(ensureFont).toHaveBeenLastCalledWith("Noto Sans Math");
    expect(wrapper.text()).toContain("selected font could not be loaded");
    mainDialog(wrapper).vm.$emit("confirm");
    expect(wrapper.emitted("insert")).toBeUndefined();
    await wrapper
      .findAll("button")
      .find((button) => button.text() === "Retry")!
      .trigger("click");
    await flushPromises();
    expect(ensureFont).toHaveBeenLastCalledWith("Noto Sans Math");
    mainDialog(wrapper).vm.$emit("confirm");
    expect(wrapper.emitted("insert")?.[0]).toEqual([{ text: "Ω", fontFamily: "Noto Sans Math" }]);
  });
  test("double clicking a custom visibility checkbox never inserts", async () => {
    const wrapper = await fixture();
    wrapper.getComponent(Tabs).vm.$emit("update:modelValue", "custom");
    await wrapper.vm.$nextTick();
    await wrapper.get('.symbol-dialog__custom-list input[type="checkbox"]').trigger("dblclick");
    expect(wrapper.emitted("insert")).toBeUndefined();
  });
  test("Normal text uses verified current-cell coverage and inherits its font", async () => {
    const query = vi.spyOn(localSource, "requestSystemFontChoices");
    const wrapper = await fixture(false, "Noto Sans Math");
    const fontSelect = wrapper.findAllComponents(Select)[0]!;
    expect(fontSelect.props("modelValue")).toBe("normal-text");
    expect(ensureFont).toHaveBeenCalledWith("Noto Sans Math");
    expect(query).not.toHaveBeenCalled();
    const grid = wrapper.getComponent(SymbolCharacterGrid);
    grid.vm.$emit("select", 0x3a9);
    await wrapper.vm.$nextTick();
    mainDialog(wrapper).vm.$emit("confirm");
    expect(wrapper.emitted("insert")?.[0]).toEqual([{ text: "Ω" }]);
  });
  test("an unverified Normal text family is explicit and never substitutes bundled coverage", async () => {
    const query = vi.spyOn(localSource, "requestSystemFontChoices");
    const wrapper = await fixture(false, "Example Cell Sans");
    expect(wrapper.text()).toContain(
      "Character coverage for Example Cell Sans has not been verified",
    );
    expect(wrapper.findComponent(SymbolCharacterGrid).exists()).toBe(false);
    expect(ensureFont).not.toHaveBeenCalled();
    expect(query).not.toHaveBeenCalled();
    const literal = wrapper
      .findAllComponents(Input)
      .find((entry) => entry.props("maxlength") === 16)!;
    literal.vm.$emit("update:modelValue", "Ω");
    literal.vm.$emit("change", "Ω");
    await wrapper.vm.$nextTick();
    mainDialog(wrapper).vm.$emit("confirm");
    expect(wrapper.emitted("insert")?.[0]).toEqual([{ text: "Ω" }]);
  });
  test("local font denial is explicit and bundled browsing stays usable", async () => {
    const query = vi
      .spyOn(localSource, "requestSystemFontChoices")
      .mockRejectedValue(new localSource.LocalSymbolFontError("denied"));
    const wrapper = await fixture();
    expect(query).not.toHaveBeenCalled();
    await wrapper
      .findAll("button")
      .find((entry) => entry.text() === "Access local fonts…")!
      .trigger("click");
    await flushPromises();
    expect(query).toHaveBeenCalledTimes(1);
    expect(wrapper.text()).toContain("Local font access was not granted");
    expect(wrapper.findComponent(SymbolCharacterGrid).exists()).toBe(true);
    await wrapper.get('[data-code-point="65"]').trigger("click");
    mainDialog(wrapper).vm.$emit("confirm");
    expect(wrapper.emitted("insert")?.[0]).toEqual([{ text: "A", fontFamily: "Noto Sans" }]);
  });
  test("local metadata enumeration never loads all fonts and only selected face is inserted", async () => {
    const local = {
      id: "a".repeat(64),
      displayFamily: "Example Local Font",
      family: `SheetcraftLocal_${"a".repeat(64)}`,
      ranges: [[0x3a9, 0x3a9]] as const,
      count: 1,
      source: "system" as const,
      persisted: false,
    };
    const choices = shallowRef([
      {
        id: "system:Example",
        family: "Example Local Font",
        fullName: "Example Local Font Regular",
        postscriptName: "Example",
        style: "Regular",
      },
    ]);
    const original = localSource.useLocalSymbolFonts();
    vi.spyOn(localSource, "useLocalSymbolFonts").mockReturnValue({ ...original, choices });
    const query = vi
      .spyOn(localSource, "requestSystemFontChoices")
      .mockResolvedValue(choices.value);
    const load = vi.spyOn(localSource, "loadSystemFont").mockResolvedValue(local);
    const wrapper = await fixture();
    await wrapper
      .findAll("button")
      .find((entry) => entry.text() === "Access local fonts…")!
      .trigger("click");
    await flushPromises();
    expect(query).toHaveBeenCalledTimes(1);
    expect(load).not.toHaveBeenCalled();
    const choice = wrapper
      .findAllComponents(Select)
      .find((entry) => entry.props("placeholder") === "Choose one local font to read")!;
    choice.vm.$emit("update:modelValue", "system:Example");
    await wrapper.vm.$nextTick();
    await wrapper
      .findAll("button")
      .find((entry) => entry.text() === "Load selected font")!
      .trigger("click");
    await flushPromises();
    expect(load).toHaveBeenCalledWith("system:Example", { persist: false });
    expect(Array.from(wrapper.getComponent(SymbolCharacterGrid).props("points"))).toEqual([0x3a9]);
    mainDialog(wrapper).vm.$emit("confirm");
    expect(wrapper.emitted("insert")?.[0]).toEqual([{ text: "Ω", fontFamily: local.family }]);
    expect(wrapper.text()).toContain("Font verified for this session");
  });
  test("a settings refresh updates an open Symbol list and clears a removed choice without rescanning", async () => {
    const choices = shallowRef([
      {
        id: "system:Old",
        family: "Old Font",
        fullName: "Old Font Regular",
        postscriptName: "Old",
        style: "Regular",
      },
    ]);
    const original = localSource.useLocalSymbolFonts();
    vi.spyOn(localSource, "useLocalSymbolFonts").mockReturnValue({ ...original, choices });
    const query = vi
      .spyOn(localSource, "requestSystemFontChoices")
      .mockResolvedValue(choices.value);
    const load = vi.spyOn(localSource, "loadSystemFont");
    const wrapper = await fixture();
    await wrapper
      .findAll("button")
      .find((entry) => entry.text() === "Access local fonts…")!
      .trigger("click");
    await flushPromises();
    const choice = wrapper
      .findAllComponents(Select)
      .find((entry) => entry.props("placeholder") === "Choose one local font to read")!;
    choice.vm.$emit("update:modelValue", "system:Old");
    await wrapper.vm.$nextTick();
    choices.value = [
      {
        id: "system:New",
        family: "New Font",
        fullName: "New Font Regular",
        postscriptName: "New",
        style: "Regular",
      },
    ];
    await wrapper.vm.$nextTick();
    expect(choice.props("options")).toEqual([{ label: "New Font Regular", value: "system:New" }]);
    expect(choice.props("modelValue")).toBe("");
    expect(
      wrapper
        .findAll("button")
        .find((entry) => entry.text() === "Load selected font")!
        .attributes("disabled"),
    ).toBeDefined();
    expect(query).toHaveBeenCalledOnce();
    expect(load).not.toHaveBeenCalled();
  });
  test.each([false, true])(
    "a settings refresh keeps Symbol empty-list feedback current (initially empty: %s)",
    async (initiallyEmpty) => {
      const font = {
        id: "system:Example",
        family: "Example Font",
        fullName: "Example Font Regular",
        postscriptName: "Example",
        style: "Regular",
      };
      const choices = shallowRef(initiallyEmpty ? [] : [font]);
      const queryStatus = shallowRef<localSource.SystemFontQueryStatus>({ state: "ready" });
      const original = localSource.useLocalSymbolFonts();
      vi.spyOn(localSource, "useLocalSymbolFonts").mockReturnValue({
        ...original,
        choices,
        queryStatus,
      });
      const query = vi
        .spyOn(localSource, "requestSystemFontChoices")
        .mockResolvedValue(choices.value);
      const wrapper = await fixture();
      await wrapper
        .findAll("button")
        .find((entry) => entry.text() === "Access local fonts…")!
        .trigger("click");
      await flushPromises();
      const emptyText = "No local font metadata was returned";
      expect(wrapper.text().includes(emptyText)).toBe(initiallyEmpty);
      choices.value = initiallyEmpty ? [font] : [];
      queryStatus.value = { state: "ready" };
      await wrapper.vm.$nextTick();
      expect(wrapper.text().includes(emptyText)).toBe(!initiallyEmpty);
      expect(query).toHaveBeenCalledOnce();
    },
  );
  test("a successful settings scan clears a previous Symbol query error", async () => {
    const original = localSource.useLocalSymbolFonts();
    const queryStatus = shallowRef<localSource.SystemFontQueryStatus>({
      state: "error",
      code: "query-failed",
    });
    vi.spyOn(localSource, "useLocalSymbolFonts").mockReturnValue({ ...original, queryStatus });
    vi.spyOn(localSource, "requestSystemFontChoices").mockRejectedValue(
      new localSource.LocalSymbolFontError("query-failed"),
    );
    const wrapper = await fixture();
    await wrapper
      .findAll("button")
      .find((entry) => entry.text() === "Access local fonts…")!
      .trigger("click");
    await flushPromises();
    expect(wrapper.find('[role="alert"]').exists()).toBe(true);
    queryStatus.value = { state: "ready" };
    await wrapper.vm.$nextTick();
    expect(wrapper.find('[role="alert"]').exists()).toBe(false);
  });
  test("partial saved-font restoration keeps verified faces available while reporting failure", async () => {
    const wrapper = await fixture();
    const local = {
      id: "b".repeat(64),
      displayFamily: "Restored Local Font",
      family: `SheetcraftLocal_${"b".repeat(64)}`,
      ranges: [[0x3a9, 0x3a9]] as const,
      count: 1,
      source: "file" as const,
      persisted: true,
    };
    const original = localSource.useLocalSymbolFonts();
    vi.spyOn(localSource, "useLocalSymbolFonts").mockReturnValue({
      ...original,
      fonts: { ...original.fonts, value: [local] },
    } as ReturnType<typeof localSource.useLocalSymbolFonts>);
    vi.spyOn(localSource, "restoreStoredLocalSymbolFonts").mockRejectedValue(
      new localSource.LocalSymbolFontError("storage-corrupt"),
    );
    await wrapper
      .findAll("button")
      .find((entry) => entry.text() === "Restore saved fonts")!
      .trigger("click");
    await flushPromises();
    expect(wrapper.text()).toContain("could not be saved or restored");
    const options = wrapper.findAllComponents(Select)[0]!.props("options") as Array<{
      label: string;
    }>;
    expect(options.some((option) => option.label.startsWith("Restored Local Font"))).toBe(true);
  });

  test("verified Normal text waits for its actual font load before grid insertion", async () => {
    ensureFont.mockRejectedValueOnce(new Error("math offline"));
    const wrapper = await fixture(false, "Noto Sans Math");
    mainDialog(wrapper).vm.$emit("confirm");
    expect(wrapper.emitted("insert")).toBeUndefined();
    await wrapper
      .findAll("button")
      .find((entry) => entry.text() === "Retry")!
      .trigger("click");
    await flushPromises();
    mainDialog(wrapper).vm.$emit("confirm");
    expect(wrapper.emitted("insert")?.[0]).toEqual([{ text: " " }]);
  });
});
