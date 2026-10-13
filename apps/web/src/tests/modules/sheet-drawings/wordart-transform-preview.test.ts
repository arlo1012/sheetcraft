import { mount } from "@vue/test-utils";
import { expect, test } from "vitest";
import WordArtTransformPreview from "../../../modules/sheet-drawings/components/WordArtTransformPreview.vue";
import {
  WORDART_TRANSFORM_PRESETS,
  getWordArtTransformDiagram,
} from "../../../modules/sheet-drawings/wordart-transform-presets";

test("preview uses safe native SVG commands and distinct source track/band guides, without a glyph renderer", () => {
  for (const choice of WORDART_TRANSFORM_PRESETS) {
    const wrapper = mount(WordArtTransformPreview, { props: { choice } });
    const diagram = getWordArtTransformDiagram(choice);
    expect(wrapper.attributes("aria-hidden")).toBe("true");
    expect(wrapper.attributes("data-wordart-transform-diagram")).toBe(choice.id);
    expect(wrapper.findAll("path")).toHaveLength(
      diagram.untransformed ? 1 : 3 * (diagram.tracks.length + diagram.bands.length),
    );
    expect(wrapper.find("foreignObject, image, script, canvas").exists()).toBe(false);
    expect(wrapper.find("text").exists()).toBe(diagram.untransformed);
    const pathData = wrapper.findAll("path").map((path) => path.attributes("d"));
    for (const path of pathData) expect(path).not.toMatch(/NaN|Infinity|<|>/);
    wrapper.unmount();
  }
});
