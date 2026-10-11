import { DOMWrapper, flushPromises, mount } from "@vue/test-utils";
import { afterEach, describe, expect, test, vi } from "vitest";
import FontFormatControls from "../../../../../modules/home-tools/components/FontFormatControls.vue";
import { createDefaultSelectionCellStyleState } from "@sheetcraft/core/style-state";
import { createAppI18n } from "../../../../../shared/i18n";

const { query } = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock("../../../../../shared/cell-text/local-fonts", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../../../../shared/cell-text/local-fonts")>();
  return {
    ...actual,
    localFontAccess: actual.createLocalFontAccess(() => ({ secure: true, query })),
  };
});

const wrappers: Array<ReturnType<typeof mountControls>> = [];
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

  test("loads local families on request and shares choices with another formatting control", async () => {
    query.mockResolvedValue([{ family: "Team Font" }, { family: "Team Font" }]);
    const first = mountControls();
    const second = mountControls();
    await openFonts(first);
    expect(query).not.toHaveBeenCalled();
    await menu().get("[data-local-font-access] button").trigger("click");
    await flushPromises();
    expect(query).toHaveBeenCalledTimes(1);
    expect(menu().text()).toContain("已读取 1 个本机字体");
    expect(first.emitted("applyStyle")).toBeUndefined();
    await menu().trigger("keydown", { key: "Escape" });
    await openFonts(second);
    const choice = menu()
      .findAll('[role="menuitemradio"]')
      .find((item) => item.text() === "Team Font")!;
    await choice.trigger("click");
    expect(second.emitted("applyStyle")).toEqual([[{ fontFamily: "Team Font" }]]);
  });
});
