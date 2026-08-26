import { mount } from "@vue/test-utils";
import { describe, expect, test } from "vitest";
import App from "./App.vue";

describe("App", () => {
  test("mounts an empty workspace root", () => {
    const wrapper = mount(App);

    expect(wrapper.get("[data-app-root]").attributes("aria-label")).toBe("idea10 workspace");
  });
});
