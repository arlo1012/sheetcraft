import { DOMWrapper, mount } from "@vue/test-utils";
import { nextTick } from "vue";
import { afterEach, describe, expect, test } from "vitest";
import FormulaCategoryMenu from "../../../../modules/formula-tools/components/FormulaCategoryMenu.vue";
import { createAppI18n } from "../../../../shared/i18n";

const mounted: Array<{ unmount(): void }> = [];

afterEach(() => {
  for (const wrapper of mounted.splice(0)) wrapper.unmount();
  document.body.replaceChildren();
});

function mountCategoryMenu() {
  const wrapper = mount(FormulaCategoryMenu, {
    attachTo: document.body,
    global: { plugins: [createAppI18n("en-US")] },
    props: { category: "Math", editSessionId: "edit-1" },
    slots: { icon: "∑" },
  });
  mounted.push(wrapper);
  return wrapper;
}

function menu() {
  return new DOMWrapper(document.body).get(".formula-category-menu__panel");
}

describe("FormulaCategoryMenu search", () => {
  test("focuses the TDesign search input and filters a long category by signature", async () => {
    const wrapper = mountCategoryMenu();
    await wrapper.get(".formula-category-menu__trigger").trigger("click");
    await nextTick();

    const search = menu().get<HTMLInputElement>("[data-formula-category-search] input");
    expect(document.activeElement).toBe(search.element);
    await search.setValue("SUM(");
    expect(menu().findAll("[data-formula-function]")).toHaveLength(1);
    expect(menu().get('[data-formula-function="SUM"]').text()).toContain("SUM");

    await search.setValue("not-a-function");
    expect(menu().findAll("[data-formula-function]")).toHaveLength(0);
    expect(menu().text()).toContain("No matching functions");
  });

  test("moves from search into results and resets the query when reopened", async () => {
    const wrapper = mountCategoryMenu();
    const trigger = wrapper.get(".formula-category-menu__trigger");
    await trigger.trigger("click");
    const search = menu().get<HTMLInputElement>("[data-formula-category-search] input");
    await search.setValue("SUM(");
    await search.trigger("keydown", { key: "ArrowDown" });
    const result = menu().get('[data-formula-function="SUM"]');
    expect(document.activeElement).toBe(result.element);

    document.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "Escape" }));
    await nextTick();
    await trigger.trigger("click");
    expect(menu().findAll("[data-formula-function]").length).toBeGreaterThan(1);
  });
});
