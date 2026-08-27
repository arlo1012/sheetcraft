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

    await wrapper.get('[aria-label="Cell address"]').setValue("B12");
    await wrapper.get('[aria-label="Go to cell"]').trigger("submit");
    await wrapper.get('[aria-label="Find next"]').trigger("click");
    await wrapper.get('[aria-label="Find previous"]').trigger("click");

    expect(wrapper.emitted("navigate")).toEqual([["B12"]]);
    expect(wrapper.emitted("find")).toEqual([["forward"], ["backward"]]);
  });

  test("keeps the address draft synchronized with navigation", async () => {
    const wrapper = mountNavigationBar({ address: "A1", searchQuery: "" });
    const input = wrapper.get<HTMLInputElement>('[aria-label="Cell address"]');

    await input.setValue("invalid");
    await wrapper.setProps({ address: "C3" });

    expect(input.element.value).toBe("C3");
  });
});
