<script setup lang="ts">
import type { ConditionalFormatIconSet } from "@idea10/core/conditional-formatting";
import { paintConditionalFormatVisual } from "../../../shared/conditional-formatting/conditional-format-painter";
import { useAppI18n, type MessageKey } from "../../../shared/i18n";
import {
  colorScalePresetTiles,
  dataBarPresetTiles,
  iconSetPresetTiles,
  type ConditionalFormatPresetKind,
} from "../conditional-format-presets";

const props = defineProps<{ kind: "dataBars" | "colorScales" | "iconSets" }>();
const emit = defineEmits<{ select: [kind: ConditionalFormatPresetKind] }>();
const { t } = useAppI18n();

const barLabels: Record<string, MessageKey> = {
  "#638EC6": "conditionalFormatting.blueBar",
  "#63BE7B": "conditionalFormatting.greenBar",
  "#F8696B": "conditionalFormatting.redBar",
  "#F4B183": "conditionalFormatting.orangeBar",
  "#9DC3E6": "conditionalFormatting.lightBlueBar" as MessageKey,
  "#B4A7D6": "conditionalFormatting.purpleBar" as MessageKey,
};
const iconLabels: Record<ConditionalFormatIconSet, MessageKey> = {
  threeArrows: "conditionalFormatting.threeArrows",
  threeTriangles: "conditionalFormatting.threeTriangles",
  threeStars: "conditionalFormatting.threeStars",
  threeArrowsGray: "conditionalFormatting.threeArrowsGray",
  threeFlags: "conditionalFormatting.threeFlags",
  threeTrafficLights: "conditionalFormatting.threeTrafficLights",
  threeTrafficLightsRimmed: "conditionalFormatting.threeTrafficLightsRimmed",
  threeSigns: "conditionalFormatting.threeSigns",
  threeSymbols: "conditionalFormatting.threeSymbols",
  threeSymbolsCircled: "conditionalFormatting.threeSymbolsCircled",
  fourArrows: "conditionalFormatting.fourArrows",
  fourArrowsGray: "conditionalFormatting.fourArrowsGray",
  fourRedToBlack: "conditionalFormatting.fourRedToBlack",
  fourRatings: "conditionalFormatting.fourRatings",
  fourTrafficLights: "conditionalFormatting.fourTrafficLights",
  fiveArrows: "conditionalFormatting.fiveArrows",
  fiveArrowsGray: "conditionalFormatting.fiveArrowsGray",
  fiveRatings: "conditionalFormatting.fiveRatings",
  fiveQuarters: "conditionalFormatting.fiveQuarters",
  fiveBoxes: "conditionalFormatting.fiveBoxes",
};
const iconGroups = [
  {
    label: "conditionalFormatting.iconDirection" as MessageKey,
    sets: iconSetPresetTiles.slice(0, 7),
  },
  {
    label: "conditionalFormatting.iconShapes" as MessageKey,
    sets: iconSetPresetTiles.slice(7, 12),
  },
  {
    label: "conditionalFormatting.iconMarkers" as MessageKey,
    sets: iconSetPresetTiles.slice(12, 15),
  },
  { label: "conditionalFormatting.iconRatings" as MessageKey, sets: iconSetPresetTiles.slice(15) },
];
const scaleLabels: Record<string, MessageKey> = {
  scaleRedYellowGreen: "conditionalFormatting.redYellowGreen",
  scaleGreenYellowRed: "conditionalFormatting.greenYellowRed",
  scaleRedWhiteBlue: "conditionalFormatting.redWhiteBlue",
  scaleBlueWhiteRed: "conditionalFormatting.blueWhiteRed",
  scaleWhiteRed: "conditionalFormatting.whiteRed",
  scaleRedWhite: "conditionalFormatting.redWhite",
  scaleWhiteGreen: "conditionalFormatting.whiteGreen",
  scaleGreenWhite: "conditionalFormatting.greenWhite",
  scaleWhiteBlue: "conditionalFormatting.whiteBlue",
  scaleBlueWhite: "conditionalFormatting.blueWhite",
  scaleYellowRed: "conditionalFormatting.yellowRed",
  scaleGreenYellow: "conditionalFormatting.greenYellow",
};
function labelForBar(color: string): string {
  return t(barLabels[color]!);
}
function labelForScale(kind: string): string {
  return t(scaleLabels[kind]!);
}
function interpolate(left: string, right: string, ratio: number): string {
  const channel = (offset: number) =>
    Math.round(
      Number.parseInt(left.slice(offset, offset + 2), 16) * (1 - ratio) +
        Number.parseInt(right.slice(offset, offset + 2), 16) * ratio,
    )
      .toString(16)
      .padStart(2, "0");
  return `#${channel(1)}${channel(3)}${channel(5)}`;
}
function scaleSamples(colors: readonly string[]): string[] {
  return Array.from({ length: 5 }, (_, index) => {
    const segment = (1 - index / 4) * (colors.length - 1);
    const start = Math.floor(segment);
    return interpolate(
      colors[start]!,
      colors[Math.min(start + 1, colors.length - 1)]!,
      segment - start,
    );
  });
}
function paintIcons(element: HTMLCanvasElement | null, iconSet: ConditionalFormatIconSet): void {
  if (!element) return;
  const density = window.devicePixelRatio || 1;
  const width = 104;
  const height = 22;
  element.width = Math.round(width * density);
  element.height = Math.round(height * density);
  const context = element.getContext("2d");
  if (!context) return;
  context.setTransform(density, 0, 0, density, 0, 0);
  context.clearRect(0, 0, width, height);
  const count = iconSet.startsWith("three") ? 3 : iconSet.startsWith("four") ? 4 : 5;
  for (let index = 0; index < count; index += 1)
    paintConditionalFormatVisual(
      context,
      { x: index * 20, y: 0, width: 20, height: 22 },
      {
        iconSet: { iconSet, iconIndex: count - index - 1, showValue: true },
      },
    );
}
</script>

<template>
  <section
    v-if="props.kind === 'dataBars'"
    class="conditional-format-gallery"
    :aria-label="t('conditionalFormatting.dataBars')"
  >
    <h3>{{ t("conditionalFormatting.gradient") }}</h3>
    <div class="conditional-format-gallery__tiles conditional-format-gallery__tiles--three">
      <button
        v-for="preset in dataBarPresetTiles.filter((tile) => tile.gradient)"
        :key="preset.kind"
        type="button"
        role="menuitem"
        class="conditional-format-gallery__tile"
        :aria-label="`${labelForBar(preset.color)} · ${t('conditionalFormatting.gradient')}`"
        :title="`${labelForBar(preset.color)} · ${t('conditionalFormatting.gradient')}`"
        @click="emit('select', preset.kind)"
      >
        <span class="mini-sheet mini-sheet--bar" :style="{ '--bar-color': preset.color }"
          ><i v-for="width in [22, 46, 70, 38]" :key="width" :style="{ width: `${width}%` }"
        /></span>
      </button>
    </div>
    <h3>{{ t("conditionalFormatting.solid") }}</h3>
    <div class="conditional-format-gallery__tiles conditional-format-gallery__tiles--three">
      <button
        v-for="preset in dataBarPresetTiles.filter((tile) => !tile.gradient)"
        :key="preset.kind"
        type="button"
        role="menuitem"
        class="conditional-format-gallery__tile"
        :aria-label="`${labelForBar(preset.color)} · ${t('conditionalFormatting.solid')}`"
        :title="`${labelForBar(preset.color)} · ${t('conditionalFormatting.solid')}`"
        @click="emit('select', preset.kind)"
      >
        <span
          class="mini-sheet mini-sheet--bar mini-sheet--solid"
          :style="{ '--bar-color': preset.color }"
          ><i v-for="width in [22, 46, 70, 38]" :key="width" :style="{ width: `${width}%` }"
        /></span>
      </button>
    </div>
  </section>
  <section
    v-else-if="props.kind === 'colorScales'"
    class="conditional-format-gallery"
    :aria-label="t('conditionalFormatting.colorScales')"
  >
    <div class="conditional-format-gallery__tiles conditional-format-gallery__tiles--three">
      <button
        v-for="preset in colorScalePresetTiles"
        :key="preset.kind"
        type="button"
        role="menuitem"
        class="conditional-format-gallery__tile"
        :aria-label="labelForScale(preset.kind)"
        :title="labelForScale(preset.kind)"
        @click="emit('select', preset.kind)"
      >
        <span class="mini-sheet mini-sheet--scale"
          ><i
            v-for="(color, index) in scaleSamples(preset.colors)"
            :key="`${color}-${index}`"
            :style="{ backgroundColor: color }"
        /></span>
      </button>
    </div>
  </section>
  <section
    v-else
    class="conditional-format-gallery conditional-format-gallery--icons"
    :aria-label="t('conditionalFormatting.iconSets')"
  >
    <div
      v-for="group in iconGroups"
      :key="group.label"
      class="conditional-format-gallery__icon-group"
    >
      <h3>{{ t(group.label) }}</h3>
      <div class="conditional-format-gallery__tiles conditional-format-gallery__tiles--two">
        <button
          v-for="iconSet in group.sets"
          :key="iconSet"
          type="button"
          role="menuitem"
          class="conditional-format-gallery__icon-tile"
          :aria-label="t(iconLabels[iconSet])"
          :title="t(iconLabels[iconSet])"
          @click="emit('select', `icons${iconSet}`)"
        >
          <canvas
            :ref="(element) => paintIcons(element as HTMLCanvasElement | null, iconSet)"
            width="104"
            height="22"
            aria-hidden="true"
          />
        </button>
      </div>
    </div>
  </section>
</template>

<style scoped lang="scss">
.conditional-format-gallery {
  width: 254px;
  padding: 6px 8px 8px;

  h3 {
    margin: 4px 2px 5px;
    color: var(--idea-text-secondary);
    font-size: var(--idea-font-size-body-small);
    font-weight: 500;
  }

  &__tiles {
    display: grid;
    gap: 5px;
  }
  &__tiles--three {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
  &__tiles--two {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  &__tile,
  &__icon-tile {
    min-width: 0;
    border: 1px solid transparent;
    border-radius: 4px;
    background: transparent;
    color: inherit;
    cursor: pointer;

    &:hover,
    &:focus-visible {
      border-color: var(--td-brand-color);
      background: var(--idea-surface-hover);
      outline: none;
    }
  }

  &__tile {
    padding: 3px;
  }
  &--icons {
    width: 258px;
  }
  &__icon-group + &__icon-group {
    margin-top: 8px;
  }
  &__icon-tile {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 28px;
    padding: 3px 4px;

    canvas {
      width: 104px;
      height: 22px;
      max-width: 100%;
    }
  }
}

.mini-sheet {
  display: grid;
  gap: 1px;
  padding: 3px;
  border: 1px solid var(--idea-border-subtle);
  background:
    repeating-linear-gradient(90deg, transparent 0 31px, var(--idea-border-subtle) 32px),
    repeating-linear-gradient(0deg, transparent 0 10px, var(--idea-border-subtle) 11px);

  i {
    display: block;
    height: 7px;
  }
  &--bar i {
    background: linear-gradient(
      90deg,
      var(--bar-color),
      color-mix(in srgb, var(--bar-color) 38%, transparent)
    );
  }
  &--bar.mini-sheet--solid i {
    background: var(--bar-color);
  }
  &--scale i {
    height: 8px;
  }
}
</style>
