import { DOMWrapper, mount } from "@vue/test-utils";
import { afterEach, describe, expect, test } from "vitest";
import HomeNumberGroup from "../../../../../modules/home-tools/components/HomeNumberGroup.vue";
import type { CellNumberFormat } from "@idea10/core/style";
import { createDefaultSelectionCellStyleState } from "@idea10/core/style-state";
import { createAppI18n, type AppLocale } from "../../../../../shared/i18n";

const wrappers: ReturnType<typeof mount>[] = [];

function mountNumberGroup(
  locale: AppLocale = "en-US",
  mixed = false,
  value: CellNumberFormat | undefined = mixed ? { kind: "number", fractionDigits: 2 } : undefined,
) {
  const state = createDefaultSelectionCellStyleState();
  state.numberFormat = {
    value,
    mixed,
  };
  const wrapper = mount(HomeNumberGroup, {
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

describe("HomeNumberGroup", () => {
  test("applies each format from the accessible format menu", async () => {
    const wrapper = mountNumberGroup();

    await wrapper.get("[data-number-format-trigger]").trigger("click");
    const menu = new DOMWrapper(document.body).get('ul[aria-label="Number format"]');
    expect(menu.findAll("[data-number-format-option]")).toHaveLength(11);
    expect(menu.findAll('[role="menuitemradio"]')).toHaveLength(11);
    expect(menu.get('[data-number-format-option="general"]').attributes("aria-checked")).toBe(
      "true",
    );

    await menu.get('[data-number-format-option="number"]').trigger("click");
    expect(wrapper.emitted("applyStyle")).toEqual([
      [{ numberFormat: { kind: "number", fractionDigits: 2 } }],
    ]);
  });

  test("opens at the last option from ArrowUp and returns focus on Escape", async () => {
    const wrapper = mountNumberGroup();
    const trigger = wrapper.get<HTMLElement>("[data-number-format-trigger]");
    trigger.element.focus();

    await trigger.trigger("keydown", { key: "ArrowUp" });
    const more = new DOMWrapper(document.body).get<HTMLElement>("[data-number-format-more]");
    expect(document.activeElement).toBe(more.element);

    await more.trigger("keydown", { key: "Escape" });
    expect(document.activeElement).toBe(trigger.element);
  });

  test("uses locale-derived currency defaults without making mixed selections look uniform", async () => {
    const english = mountNumberGroup("en-US", true);
    const chinese = mountNumberGroup("zh-CN");
    const existingCurrency = mountNumberGroup("en-US", false, {
      kind: "currency",
      currency: "CNY",
      fractionDigits: 4,
    });

    expect(english.get("[data-number-format-trigger]").attributes("aria-label")).toBe(
      "Number format, mixed",
    );
    await english.get('[data-ribbon-action="currency-format"]').trigger("click");
    await chinese.get('[data-ribbon-action="currency-format"]').trigger("click");
    await existingCurrency.get('[data-ribbon-action="currency-format"]').trigger("click");

    expect(english.emitted("applyStyle")).toEqual([
      [{ numberFormat: { kind: "currency", currency: "USD", fractionDigits: 2 } }],
    ]);
    expect(chinese.emitted("applyStyle")).toEqual([
      [{ numberFormat: { kind: "currency", currency: "CNY", fractionDigits: 2 } }],
    ]);
    expect(existingCurrency.emitted("applyStyle")).toEqual([
      [{ numberFormat: { kind: "currency", currency: "CNY", fractionDigits: 2 } }],
    ]);
  });

  test("exposes direct percent and decimal commands and respects disabled state", async () => {
    const wrapper = mountNumberGroup();
    await wrapper.get('[data-ribbon-action="percent-format"]').trigger("click");
    await wrapper.get('[data-ribbon-action="decrease-decimal"]').trigger("click");
    await wrapper.get('[data-ribbon-action="increase-decimal"]').trigger("click");

    expect(wrapper.emitted("applyStyle")).toEqual([
      [{ numberFormat: { kind: "percent", fractionDigits: 0 } }],
    ]);
    expect(wrapper.emitted("adjustDecimals")).toEqual([[-1], [1]]);

    await wrapper.setProps({ disabled: true });
    expect(wrapper.get("[data-number-format-trigger]").attributes("disabled")).toBeDefined();
    expect(
      wrapper.get('[data-ribbon-action="percent-format"]').attributes("disabled"),
    ).toBeDefined();
  });

  test("keeps format choices available for dates while disabling decimal adjustments", async () => {
    const wrapper = mountNumberGroup("en-US", false, { kind: "date", code: "yyyy-mm-dd" });

    expect(wrapper.get("[data-number-format-trigger]").attributes("disabled")).toBeUndefined();
    expect(
      wrapper.get('[data-ribbon-action="percent-format"]').attributes("disabled"),
    ).toBeUndefined();
    expect(
      wrapper.get('[data-ribbon-action="decrease-decimal"]').attributes("disabled"),
    ).toBeDefined();
    expect(
      wrapper.get('[data-ribbon-action="increase-decimal"]').attributes("disabled"),
    ).toBeDefined();

    await wrapper.get("[data-number-format-trigger]").trigger("click");
    expect(
      new DOMWrapper(document.body).find('[data-number-format-option="general"]').exists(),
    ).toBe(true);
  });
  test("forwards conversion and more-format actions, keeping conversion enabled for large selections", async () => {
    const wrapper = mountNumberGroup();
    await wrapper.get("[data-number-format-trigger]").trigger("click");
    await new DOMWrapper(document.body).get("[data-number-format-more]").trigger("click");
    expect(wrapper.emitted("openCellFormat")).toEqual([[]]);

    await wrapper.setProps({ disabled: true, conversionDisabled: false });
    expect(wrapper.get("[data-number-format-trigger]").attributes("disabled")).toBeDefined();
    const trigger = wrapper.get<HTMLElement>('[data-ribbon-action="convert-number"]');
    expect(trigger.attributes("disabled")).toBeUndefined();
    await trigger.trigger("keydown", { key: "ArrowUp" });
    const last = new DOMWrapper(document.body).get<HTMLElement>(
      '[data-number-conversion="number-to-text"]',
    );
    expect(document.activeElement).toBe(last.element);
    await last.trigger("click");
    expect(wrapper.emitted("convert")).toEqual([["number-to-text"]]);
    expect(document.activeElement).toBe(trigger.element);

    await trigger.trigger("click");
    await wrapper.setProps({ conversionDisabled: true });
    expect(document.body.querySelector("[data-number-conversion]")).toBeNull();
    expect(trigger.attributes("disabled")).toBeDefined();
  });
});
