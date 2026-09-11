import { mount } from "@vue/test-utils";
import { describe, expect, test } from "vitest";
import CellTextContent from "../../../shared/cell-text/CellTextContent.vue";

describe("CellTextContent", () => {
  test("renders a double accounting underline separately from a solid strikethrough", () => {
    const wrapper = mount(CellTextContent, {
      props: {
        text: "amount",
        width: 100,
        height: 24,
        cellStyle: {
          underline: "doubleAccounting",
          strikethrough: true,
          fontScript: "superscript",
        },
      },
    });

    expect(wrapper.get<HTMLElement>(".cell-text__content").element.style.textDecoration).toBe(
      "underline double",
    );
    expect(wrapper.get<HTMLElement>(".cell-text__content").element.style.textUnderlineOffset).toBe(
      "0.18em",
    );
    expect(wrapper.get<HTMLElement>(".cell-text__strikethrough").element.style.textDecoration).toBe(
      "line-through",
    );
    expect(wrapper.get<HTMLElement>(".cell-text__line").element.style.transform).toBe(
      "translateY(-0.35em)",
    );
  });
});
