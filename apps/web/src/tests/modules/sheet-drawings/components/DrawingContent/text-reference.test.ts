import { mount } from "@vue/test-utils";
import { describe, expect, test } from "vitest";
import DrawingContent from "../../../../../modules/sheet-drawings/components/DrawingContent.vue";
import { createGraphicDrawing } from "../../../../../modules/sheet-drawings/drawing-defaults";
import { createAppI18n } from "../../../../../shared/i18n";

function fixture() {
  const drawing = {
    ...createGraphicDrawing("linked", "textBox", "Linked", { row: 0, column: 0 }),
    text: "",
    textReference: { sheetId: "source", cell: { row: 0, column: 0 } },
  };
  const { textReference: _r, ...appearance } = drawing;
  const paintDrawing = { ...appearance, text: "Derived display" };
  return { drawing, paintDrawing };
}
const global = {
  plugins: [createAppI18n("en-US")],
  stubs: {
    StandardShapeContent: {
      props: ["drawing"],
      template: '<div data-test="glyph">{{ drawing.text }}</div>',
    },
    ShapeLeafPixelContent: {
      props: ["drawing"],
      template: '<div data-test="projected">{{ drawing.text }}</div>',
    },
  },
};

describe("linked drawing content", () => {
  test("normal glyph content gets a separate display drawing while the real carrier stays unchanged", async () => {
    const { drawing, paintDrawing } = fixture();
    const before = JSON.stringify(drawing);
    const wrapper = mount(DrawingContent, { props: { drawing, paintDrawing }, global });
    try {
      expect(wrapper.get('[data-test="glyph"]').text()).toBe("Derived display");
      expect(wrapper.props("drawing")).toEqual(drawing);
      await wrapper.setProps({ paintDrawing: { ...paintDrawing, text: "New calculation" } });
      expect(wrapper.get('[data-test="glyph"]').text()).toBe("New calculation");
      expect(JSON.stringify(drawing)).toBe(before);
    } finally {
      wrapper.unmount();
    }
  });

  test("shows unavailable status when the resolver is absent or fails, including after a ready display", async () => {
    const { drawing, paintDrawing } = fixture();
    const wrapper = mount(DrawingContent, { props: { drawing }, global });
    try {
      expect(wrapper.get('[role="status"]').text()).not.toBe("");
      expect(wrapper.find('[data-test="glyph"]').exists()).toBe(false);
      await wrapper.setProps({ paintDrawing });
      expect(wrapper.find('[role="status"]').exists()).toBe(false);
      await wrapper.setProps({ textReferenceUnavailable: true });
      expect(wrapper.find('[role="status"]').exists()).toBe(true);
      expect(wrapper.find('[data-test="glyph"]').exists()).toBe(false);
    } finally {
      wrapper.unmount();
    }
  });

  test("legacy plain and projected text box routes both consume display text", () => {
    const { drawing, paintDrawing } = fixture();
    delete drawing.shapeText;
    delete paintDrawing.shapeText;
    const plain = mount(DrawingContent, { props: { drawing, paintDrawing }, global });
    try {
      expect(plain.get(".drawing-content__text").text()).toBe("Derived display");
    } finally {
      plain.unmount();
    }
    const projected = mount(DrawingContent, {
      props: {
        drawing,
        paintDrawing: {
          ...paintDrawing,
          shapeStyle: {
            rotation3d: {
              kind: "value",
              value: {
                projection: "parallel",
                xDeg: 15,
                yDeg: 20,
                zDeg: 0,
                distanceFromGroundPt: 0,
              },
            },
          },
        },
      },
      global,
    });
    try {
      expect(projected.get('[data-test="projected"]').text()).toBe("Derived display");
    } finally {
      projected.unmount();
    }
  });
});
