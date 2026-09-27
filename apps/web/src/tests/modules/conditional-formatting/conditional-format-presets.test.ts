import { describe, expect, test } from "vitest";
import { mount } from "@vue/test-utils";
import ConditionalFormatPresetGallery from "../../../modules/conditional-formatting/components/ConditionalFormatPresetGallery.vue";
import { createAppI18n } from "../../../shared/i18n";
import {
  colorScalePresetTiles,
  dataBarPresetTiles,
  getConditionalFormatPreset,
  iconSetPresetTiles,
} from "../../../modules/conditional-formatting/conditional-format-presets";

describe("conditional-format preset gallery data", () => {
  test("offers the full miniature bar and scale galleries", () => {
    expect(dataBarPresetTiles).toHaveLength(12);
    expect(dataBarPresetTiles.filter((tile) => tile.gradient)).toHaveLength(6);
    expect(dataBarPresetTiles.filter((tile) => !tile.gradient)).toHaveLength(6);
    expect(colorScalePresetTiles).toHaveLength(12);
    expect(new Set(colorScalePresetTiles.map((tile) => tile.colors.join(","))).size).toBe(12);
  });

  test("offers every supported icon family with independent condition data", () => {
    expect(iconSetPresetTiles).toHaveLength(20);
    const first = getConditionalFormatPreset("iconsthreeArrows");
    const second = getConditionalFormatPreset("iconsthreeArrows");
    expect(first).toMatchObject({ kind: "iconSet", iconSet: "threeArrows" });
    expect(second).toEqual(first);
    expect(second).not.toBe(first);
  });

  test("renders accessible WPS-style tile grids for all three visual galleries", () => {
    const gallery = (kind: "dataBars" | "colorScales" | "iconSets") =>
      mount(ConditionalFormatPresetGallery, {
        props: { kind },
        global: { plugins: [createAppI18n("en-US")] },
      });
    expect(gallery("dataBars").findAll('[role="menuitem"]')).toHaveLength(12);
    expect(gallery("colorScales").findAll('[role="menuitem"]')).toHaveLength(12);
    expect(gallery("iconSets").findAll('[role="menuitem"]')).toHaveLength(20);
  });
});
