import { DOMWrapper, flushPromises, mount, type VueWrapper } from "@vue/test-utils";
import { afterEach, describe, expect, test, vi } from "vitest";
import FontFormatControls from "../../../../../modules/home-tools/components/FontFormatControls.vue";
import { createDefaultSelectionCellStyleState } from "@sheetcraft/core/style-state";
import { createAppI18n } from "../../../../../shared/i18n";
import FontSettingsDialog from "../../../../../shared/cell-text/FontSettingsDialog.vue";
import { fontSettingsVisible } from "../../../../../shared/cell-text/font-settings";

const { query } = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock("../../../../../shared/cell-text/local-fonts", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../../../../shared/cell-text/local-fonts")>();
  return {
    ...actual,
    localFontAccess: actual.createLocalFontAccess(() => ({ secure: true, query })),
  };
});

const wrappers: VueWrapper[] = [];
function mountControls() {
  const wrapper = mount(FontFormatControls, {
    attachTo: document.body,
    props: { state: createDefaultSelectionCellStyleState(), disabled: false },
    global: { plugins: [createAppI18n("zh-CN")] },
  });
  wrappers.push(wrapper);
  return wrapper;
}
function menu() {
  return new DOMWrapper(document.body).get(".font-format-field__menu");
}
async function openFonts(wrapper: ReturnType<typeof mountControls>) {
  await wrapper.get(".font-format-controls__family .font-format-field__arrow").trigger("click");
}
afterEach(() => {
  fontSettingsVisible.value = false;
  for (const wrapper of wrappers.splice(0)) wrapper.unmount();
  document.body.innerHTML = "";
  query.mockReset();
});

describe("font catalog in formatting controls", () => {
  test("selects Chinese labels and submits the font family name", async () => {
    const wrapper = mountControls();
    await openFonts(wrapper);
    const choice = menu()
      .findAll('[role="menuitemradio"]')
      .find((item) => item.text() === "微软雅黑")!;
    await choice.trigger("click");
    expect(wrapper.emitted("applyStyle")).toEqual([[{ fontFamily: "Microsoft YaHei" }]]);
    expect(document.body.querySelector(".font-format-field__menu")).toBeNull();
    const input = wrapper.get(".font-format-controls__family input");
    await input.setValue("microsoft yahei");
    await input.trigger("keydown", { key: "Enter" });
    await flushPromises();
    expect(wrapper.emitted("applyStyle")?.at(-1)).toEqual([{ fontFamily: "Microsoft YaHei" }]);
    expect(query).not.toHaveBeenCalled();
  });

  test("searches both Chinese labels and English names without applying formatting", async () => {
    const wrapper = mountControls();
    await openFonts(wrapper);
    const search = menu().get('input[type="search"]');
    await search.setValue("Microsoft YaHei");
    expect(
      menu()
        .findAll('[role="menuitemradio"]')
        .map((item) => item.text()),
    ).toEqual(["微软雅黑"]);
    await search.setValue("宋体");
    expect(
      menu()
        .findAll('[role="menuitemradio"]')
        .map((item) => item.text()),
    ).toContain("宋体");
    await search.setValue("no-such-font-123");
    expect(menu().findAll('[role="menuitemradio"]')).toHaveLength(0);
    expect(menu().text()).toContain("没有匹配的字体");
    expect(wrapper.emitted("applyStyle")).toBeUndefined();
    await search.trigger("keydown", { key: "Escape" });
    expect(document.body.querySelector(".font-format-field__menu")).toBeNull();
    expect(query).not.toHaveBeenCalled();
  });

  test("finds the saved Chinese family by English alias and retains its exact value", async () => {
    const wrapper = mountControls();
    const state = createDefaultSelectionCellStyleState();
    state.fontFamily = { value: "微软雅黑", mixed: false };
    await wrapper.setProps({ state });
    await openFonts(wrapper);
    await menu().get('input[type="search"]').setValue("Microsoft YaHei");
    const choice = menu().findAll('[role="menuitemradio"]');
    expect(choice.map((item) => item.text())).toEqual(["微软雅黑"]);
    await choice[0]!.trigger("click");
    expect(wrapper.emitted("applyStyle")?.at(-1)).toEqual([{ fontFamily: "微软雅黑" }]);
    expect(query).not.toHaveBeenCalled();
  });

  test("opens and filters while typing in the font field, then cancels or selects with the keyboard", async () => {
    const wrapper = mountControls();
    const input = wrapper.get<HTMLInputElement>(".font-format-controls__family input");
    await input.setValue("宋体");
    expect(menu().find(".sheetcraft-menu-search").exists()).toBe(false);
    expect(
      menu()
        .findAll('[role="menuitemradio"]')
        .map((item) => item.text()),
    ).toContain("宋体");
    expect(menu().text()).not.toContain("微软雅黑");
    await input.setValue("Microsoft YaHei");
    expect(
      menu()
        .findAll('[role="menuitemradio"]')
        .map((item) => item.text()),
    ).toEqual(["微软雅黑"]);
    expect(wrapper.emitted("applyStyle")).toBeUndefined();
    await input.trigger("keydown", { key: "Escape" });
    expect(document.body.querySelector(".font-format-field__menu")).toBeNull();
    expect(input.element.value).toBe("默认字体");
    await openFonts(wrapper);
    expect(menu().find('input[type="search"]').exists()).toBe(true);
    expect(menu().find('[aria-label="字体设置"]').exists()).toBe(true);
    await input.setValue("Arial");
    expect(menu().find(".sheetcraft-menu-search").exists()).toBe(false);
    await input.setValue("");
    expect(menu().text()).toContain("微软雅黑");
    await input.setValue("Microsoft YaHei");
    await input.trigger("keydown", { key: "ArrowDown" });
    await flushPromises();
    const choice = menu().get('[role="menuitemradio"]');
    expect(document.activeElement).toBe(choice.element);
    await choice.trigger("keydown", { key: "Enter" });
    expect(wrapper.emitted("applyStyle")).toEqual([[{ fontFamily: "Microsoft YaHei" }]]);
  });

  test("syncs from settings after closing the menu and shares choices with another control", async () => {
    query.mockResolvedValue([{ family: "Team Font" }, { family: "Team Font" }]);
    const settings = mount(FontSettingsDialog, {
      attachTo: document.body,
      global: { plugins: [createAppI18n("zh-CN")] },
    });
    wrappers.push(settings);
    const first = mountControls();
    const second = mountControls();
    await openFonts(first);
    expect(query).not.toHaveBeenCalled();
    await menu().get('[aria-label="字体设置"]').trigger("click");
    await flushPromises();
    expect(document.body.querySelector(".font-format-field__menu")).toBeNull();
    expect(fontSettingsVisible.value).toBe(true);
    expect(query).not.toHaveBeenCalled();
    await new DOMWrapper(document.body).get("[data-local-font-access] button").trigger("click");
    await flushPromises();
    expect(query).toHaveBeenCalledTimes(1);
    expect(document.body.textContent).toContain("已列出 1 个本机字体名称，尚未加载字体文件");
    expect(first.emitted("applyStyle")).toBeUndefined();
    await new DOMWrapper(document.body).get(".t-dialog__close").trigger("click");
    await flushPromises();
    expect(fontSettingsVisible.value).toBe(false);
    await openFonts(second);
    const choice = menu()
      .findAll('[role="menuitemradio"]')
      .find((item) => item.text() === "Team Font")!;
    await choice.trigger("click");
    expect(second.emitted("applyStyle")).toEqual([[{ fontFamily: "Team Font" }]]);
  });
});
