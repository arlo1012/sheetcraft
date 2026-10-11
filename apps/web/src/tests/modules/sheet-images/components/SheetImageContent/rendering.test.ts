import { mount } from "@vue/test-utils";
import { defineComponent, h } from "vue";
import { describe, expect, test } from "vitest";
import SheetImageContent from "../../../../../modules/sheet-images/components/SheetImageContent.vue";
import { createAppI18n } from "../../../../../shared/i18n";
import { createSheetImagePresentationSvg } from "../../../../../modules/sheet-images/components/sheetImagePresentation";

describe("SheetImageContent", () => {
  test.each([
    [0, "0 0 500 400", undefined],
    [90, "0 0 400 500", "translate(400 0) rotate(90)"],
    [180, "0 0 500 400", "translate(500 400) rotate(180)"],
    [270, "0 0 400 500", "translate(0 500) rotate(270)"],
  ] as const)(
    "renders a normalized crop after %s degree rotation",
    async (rotation, viewBox, transform) => {
      const wrapper = mount(SheetImageContent, {
        global: { plugins: [createAppI18n("en-US")] },
        props: {
          src: "blob:source",
          altText: "Diagram",
          transform: { crop: { x: 0.1, y: 0.2, width: 0.5, height: 0.5 }, rotation },
        },
      });
      const probe = wrapper.get(".sheet-image-content__probe");
      Object.defineProperties(probe.element, {
        naturalWidth: { value: 1000 },
        naturalHeight: { value: 800 },
      });
      await probe.trigger("load");

      const svg = wrapper.get("svg.sheet-image-content");
      const source = wrapper.get("svg image");
      expect(svg.attributes()).toMatchObject({
        viewBox,
        preserveAspectRatio: "xMidYMid meet",
        "aria-label": "Diagram",
      });
      expect(source.attributes()).toMatchObject({
        x: "-100",
        y: "-160",
        width: "1000",
        height: "800",
      });
      expect(wrapper.get("clipPath rect").attributes()).toMatchObject({
        width: "500",
        height: "400",
      });
      expect(wrapper.findAll("svg > g")[0]?.attributes("transform")).toBe(transform);
      expect(wrapper.emitted("load")).toEqual([[{ width: 1000, height: 800 }]]);
    },
  );

  test("fills an arbitrary floating frame without replacing the source URL", () => {
    const wrapper = mount(SheetImageContent, {
      global: { plugins: [createAppI18n("en-US")] },
      props: {
        src: "blob:animated-gif",
        altText: "Animated chart",
        transform: { rotation: 90 },
        fit: "fill",
      },
    });
    expect(wrapper.get("svg").attributes("preserveAspectRatio")).toBe("none");
    expect(wrapper.get("svg image").attributes("href")).toBe("blob:animated-gif");
  });

  test("gives every renderer instance its own SVG crop path", () => {
    const wrapper = mount(
      defineComponent({
        setup: () => () =>
          h("div", [
            h(SheetImageContent, { src: "blob:first", altText: "First" }),
            h(SheetImageContent, { src: "blob:second", altText: "Second" }),
          ]),
      }),
      { global: { plugins: [createAppI18n("en-US")] } },
    );
    const ids = wrapper.findAll("clipPath").map((element) => element.attributes("id"));
    expect(new Set(ids).size).toBe(2);
  });

  test("gives an edited viewer image its rotated crop dimensions", () => {
    expect(
      createSheetImagePresentationSvg(
        "data:image/png;base64,AA==",
        { crop: { x: 0, y: 0, width: 0.2, height: 0.1 }, rotation: 90 },
        1200,
        800,
      ),
    ).toContain('width="80" height="240" viewBox="0 0 80 240"');
  });

  test.each([
    [{ flipHorizontal: true }, "translate(500 0) scale(-1 1)"],
    [{ flipVertical: true }, "translate(0 400) scale(1 -1)"],
    [{ flipHorizontal: true, flipVertical: true }, "translate(500 400) scale(-1 -1)"],
  ] as const)("mirrors the cropped source before rotation for %o", async (flip, expected) => {
    const wrapper = mount(SheetImageContent, {
      global: { plugins: [createAppI18n("en-US")] },
      props: {
        src: "blob:source",
        altText: "Diagram",
        transform: { crop: { x: 0.1, y: 0.2, width: 0.5, height: 0.5 }, rotation: 90, ...flip },
      },
    });
    const probe = wrapper.get(".sheet-image-content__probe");
    Object.defineProperties(probe.element, {
      naturalWidth: { value: 1000 },
      naturalHeight: { value: 800 },
    });
    await probe.trigger("load");

    expect(wrapper.get("svg > g").attributes("transform")).toBe("translate(400 0) rotate(90)");
    expect(wrapper.get("svg > g > g").attributes("transform")).toBe(expected);
  });

  test("writes the same flip-then-rotate order for the preview SVG", () => {
    expect(
      createSheetImagePresentationSvg(
        "data:image/png;base64,AA==",
        {
          crop: { x: 0.1, y: 0.2, width: 0.5, height: 0.5 },
          rotation: 270,
          flipHorizontal: true,
          flipVertical: true,
        },
        1000,
        800,
      ),
    ).toContain(
      '<g transform="translate(0 500) rotate(270)"><g transform="translate(500 400) scale(-1 -1)">',
    );
  });
});
