import { mount } from "@vue/test-utils";
import { describe, expect, test } from "vitest";
import GridNavigationBar from "../../../../../modules/sheet-grid/components/GridNavigationBar.vue";

describe("GridNavigationBar", () => {
  test("submits addresses and search directions", async () => {
    const wrapper = mount(GridNavigationBar, {
      props: { address: "A1", searchQuery: "needle", searchFeedback: "" },
    });

    await wrapper.get('[aria-label="Cell address"]').setValue("B12");
    await wrapper.get('[aria-label="Go to cell"]').trigger("submit");
    await wrapper.get('[aria-label="Find next"]').trigger("click");
    await wrapper.get('[aria-label="Find previous"]').trigger("click");

    expect(wrapper.emitted("navigate")).toEqual([["B12"]]);
    expect(wrapper.emitted("find")).toEqual([["forward"], ["backward"]]);
  });

  test("keeps the address draft synchronized with navigation", async () => {
    const wrapper = mount(GridNavigationBar, {
      props: { address: "A1", searchQuery: "" },
    });
    const input = wrapper.get<HTMLInputElement>('[aria-label="Cell address"]');

    await input.setValue("invalid");
    await wrapper.setProps({ address: "C3" });

    expect(input.element.value).toBe("C3");
  });
});
