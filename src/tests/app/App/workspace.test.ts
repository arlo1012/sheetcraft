import { mount } from "@vue/test-utils";
import { describe, expect, test } from "vitest";
import App from "../../../app/App.vue";

describe("App", () => {
  test("mounts the spreadsheet workspace", () => {
    const wrapper = mount(App);

    expect(wrapper.get("[data-app-root]").attributes("aria-label")).toBe("idea10 workspace");
    expect(wrapper.get('[role="grid"]').attributes("aria-label")).toBe("Sheet1");
    expect(wrapper.get('[role="grid"]').attributes("aria-rowcount")).toBe("1000");
    expect(wrapper.get('[role="grid"]').attributes("aria-colcount")).toBe("100");
    expect(wrapper.get("[data-active-cell]").attributes("data-active-cell")).toBe("A1");
  });
});
