import { mount } from "@vue/test-utils";
import { describe, expect, test } from "vitest";
import GridNavigationBar from "../../../../../modules/sheet-grid/components/GridNavigationBar.vue";
import { createAppI18n } from "../../../../../shared/i18n";

function mountNavigationBar(props: {
  address: string;
  searchQuery: string;
  searchFeedback?: string;
}) {
  return mount(GridNavigationBar, {
    global: {
      plugins: [createAppI18n("en-US")],
    },
    props,
  });
}

describe("GridNavigationBar", () => {
  test("submits addresses and search directions", async () => {
    const wrapper = mountNavigationBar({
      address: "A1",
      searchQuery: "needle",
      searchFeedback: "",
    });
    const addressInput = wrapper.get<HTMLInputElement>(".grid-navigation-bar__address-input input");
    const searchInput = wrapper.get<HTMLInputElement>(".grid-navigation-bar__search-input input");

    await addressInput.setValue("b12");
    await addressInput.trigger("keydown", { key: "Enter" });
    await searchInput.trigger("keydown", { key: "Enter" });
    await searchInput.trigger("keydown", { key: "Enter", shiftKey: true });
    await wrapper.get('[aria-label="Find next"]').trigger("click");
    await wrapper.get('[aria-label="Find previous"]').trigger("click");

    expect(wrapper.emitted("navigate")).toEqual([["B12"]]);
    expect(wrapper.emitted("find")).toEqual([["forward"], ["backward"], ["forward"], ["backward"]]);
  });

  test("keeps the address draft synchronized with navigation", async () => {
    const wrapper = mountNavigationBar({ address: "A1", searchQuery: "" });
    const input = wrapper.get<HTMLInputElement>(".grid-navigation-bar__address-input input");

    await input.setValue("invalid");
    await input.trigger("keydown", { key: "Escape" });
    expect(input.element.value).toBe("A1");

    await input.setValue("b2");
    await input.trigger("blur");
    expect(input.element.value).toBe("A1");

    await wrapper.setProps({ address: "C3" });

    expect(input.element.value).toBe("C3");
  });
});
