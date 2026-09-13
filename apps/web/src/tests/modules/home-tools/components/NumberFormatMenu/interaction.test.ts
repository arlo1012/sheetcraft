import { DOMWrapper, mount } from "@vue/test-utils";
import { afterEach, describe, expect, test } from "vitest";
import type { CellNumberFormat } from "@idea10/core/style";
import { createDefaultSelectionCellStyleState } from "@idea10/core/style-state";
import NumberFormatMenu from "../../../../../modules/home-tools/components/NumberFormatMenu.vue";
import { createAppI18n, type AppLocale } from "../../../../../shared/i18n";

const wrappers: ReturnType<typeof mount>[] = [];

function mountMenu(locale: AppLocale = "en-US", value?: CellNumberFormat, mixed = false) {
  const state = createDefaultSelectionCellStyleState().numberFormat;
  state.value = value;
  state.mixed = mixed;
  const wrapper = mount(NumberFormatMenu, {
    attachTo: document.body,
    global: { plugins: [createAppI18n(locale)] },
    props: { state, disabled: false },
  });
  wrappers.push(wrapper);
  return wrapper;
}

afterEach(() => {
  for (const wrapper of wrappers.splice(0)) wrapper.unmount();
  document.body.replaceChildren();
});

describe("NumberFormatMenu", () => {
  test("offers Excel's common number formats and opens the full format dialog", async () => {
    const wrapper = mountMenu();

    await wrapper.get("[data-number-format-trigger]").trigger("click");
    const menu = new DOMWrapper(document.body).get('ul[aria-label="Number format"]');
    expect(menu.findAll("[data-number-format-option]")).toHaveLength(11);
    expect(menu.findAll('[role="menuitemradio"]')).toHaveLength(11);

    await menu.get('[data-number-format-option="longDate"]').trigger("click");
    expect(wrapper.emitted("select")).toEqual([["longDate"]]);

    await wrapper.get("[data-number-format-trigger]").trigger("click");
    await new DOMWrapper(document.body).get("[data-number-format-more]").trigger("click");
    expect(wrapper.emitted("openCellFormat")).toHaveLength(1);
  });

  test("distinguishes short and long dates when reporting the controlled selection", async () => {
    const shortDate = mountMenu("zh-CN", { kind: "date", code: "yyyy/m/d", locale: "zh-CN" });
    const longDate = mountMenu("zh-CN", {
      kind: "date",
      code: 'yyyy"年"m"月"d"日"',
      locale: "zh-CN",
    });

    await shortDate.get("[data-number-format-trigger]").trigger("click");
    let menu = new DOMWrapper(document.body).get('ul[aria-label="数字格式"]');
    expect(menu.get('[data-number-format-option="shortDate"]').attributes("aria-checked")).toBe(
      "true",
    );
    expect(menu.get('[data-number-format-option="longDate"]').attributes("aria-checked")).toBe(
      "false",
    );

    await longDate.get("[data-number-format-trigger]").trigger("click");
    menu = new DOMWrapper(document.body).findAll('ul[aria-label="数字格式"]').at(-1)!;
    expect(menu.get('[data-number-format-option="shortDate"]').attributes("aria-checked")).toBe(
      "false",
    );
    expect(menu.get('[data-number-format-option="longDate"]').attributes("aria-checked")).toBe(
      "true",
    );
  });

  test("supports keyboard navigation through the extra options and restores focus", async () => {
    const wrapper = mountMenu();
    const trigger = wrapper.get<HTMLElement>("[data-number-format-trigger]");
    trigger.element.focus();

    await trigger.trigger("keydown", { key: "ArrowUp" });
    const more = new DOMWrapper(document.body).get<HTMLElement>("[data-number-format-more]");
    expect(document.activeElement).toBe(more.element);

    await more.trigger("keydown", { key: "Escape" });
    expect(document.activeElement).toBe(trigger.element);
  });
});
