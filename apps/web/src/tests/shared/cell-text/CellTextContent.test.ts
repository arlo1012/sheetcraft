import { mount } from "@vue/test-utils";
import { describe, expect, test } from "vitest";
import { layoutCellText } from "../../../shared/cell-text/text-presentation";
import CellTextContent from "../../../shared/cell-text/CellTextContent.vue";

describe("CellTextContent", () => {
  test("reserves two full native bidi line advances without splitting the Unicode paragraph", () => {
    const text = "a\nTא";
    const textLayout = layoutCellText({
      text,
      fontRuns: [{ start: 2, end: 3, fontFamily: "Tall" }],
      style: { fontFamily: "Base", fontSize: 10 },
      width: 100,
      height: 100,
      measurer: {
        measure: (value) => value.length * 10,
        measureMetrics: (value, font) => ({
          width: value.length * 10,
          ascent: font.family === "Tall" ? 35 : 8,
          descent: font.family === "Tall" ? 5 : 2,
        }),
      },
    });
    const wrapper = mount(CellTextContent, { props: { text, textLayout } });
    const content = wrapper.get<HTMLElement>(".cell-text__content").element;
    expect(content.style.lineHeight).toBe("40px");
    expect(content.style.height).toBe("80px");
    expect(wrapper.get<HTMLElement>(".cell-text__bidi-paragraph").element.style.lineHeight).toBe(
      "40px",
    );
    expect(wrapper.get<HTMLElement>(".cell-text__bidi-paragraph").element.textContent).toBe(text);
    expect(wrapper.findAll(".cell-text__line")).toHaveLength(0);
  });

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

  test("renders complete inherited/override spans without changing size, weight, or italic", () => {
    const wrapper = mount(CellTextContent, {
      props: {
        text: "a☀b",
        fontRuns: [{ start: 1, end: 2, fontFamily: "Symbols" }],
        width: 100,
        height: 24,
        cellStyle: { fontFamily: "Base", fontSize: 12, bold: true, italic: true },
      },
    });
    const spans = wrapper.findAll<HTMLElement>(".cell-text__line .cell-text__strikethrough > span");
    expect(spans.map((span) => [span.text(), span.element.style.fontFamily])).toEqual([
      ["a", "Base"],
      ["☀", "Symbols"],
      ["b", "Base"],
    ]);
    const content = wrapper.get<HTMLElement>(".cell-text__content").element.style;
    expect(content.fontSize).toBe("12px");
    expect(content.fontWeight).toBe("700");
    expect(content.fontStyle).toBe("italic");
  });

  test("hands the original mixed-bidi paragraph and controls to browser layout across wraps", () => {
    const text = "A\u2067אב CD\u2069☀\r\nEND";
    const wrapper = mount(CellTextContent, {
      props: {
        text,
        width: 45,
        height: 100,
        fontRuns: [{ start: 8, end: 9, fontFamily: "Symbols" }],
        cellStyle: { fontFamily: "Base", fontSize: 10, wrapText: true },
      },
    });
    const paragraph = wrapper.get<HTMLElement>(".cell-text__bidi-paragraph");
    expect(paragraph.element.textContent).toBe(text);
    expect(paragraph.element.style.whiteSpace).toBe("pre-wrap");
    expect(wrapper.findAll(".cell-text__line")).toHaveLength(0);
    expect(wrapper.get(".cell-text").attributes("dir")).toBe("ltr");
    const spans = paragraph.findAll<HTMLElement>(".cell-text__strikethrough > span");
    expect(spans.map((span) => span.element.style.fontFamily)).toEqual(["Base", "Symbols", "Base"]);
    expect(
      spans.every(
        (span) => span.attributes("dir") === undefined && !span.element.style.unicodeBidi,
      ),
    ).toBe(true);
  });

  test("reuses the scene's projected layout and its icon-slot placement", () => {
    const sceneLayout = layoutCellText({
      text: "Aאב☀",
      width: 100,
      height: 50,
      fontRuns: [{ start: 3, end: 4, fontFamily: "Symbols" }],
      measurer: { measure: (text) => text.length * 5 },
    });
    const wrapper = mount(CellTextContent, {
      props: {
        text: "raw caption",
        width: 5,
        height: 5,
        textLayout: { ...sceneLayout, x: 37, y: 11 },
      },
    });
    expect(wrapper.get<HTMLElement>(".cell-text__content").element.style.left).toBe("37px");
    expect(wrapper.get<HTMLElement>(".cell-text__content").element.style.top).toBe("11px");
    expect(wrapper.get<HTMLElement>(".cell-text__bidi-paragraph").element.textContent).toBe("Aאב☀");
  });
});
