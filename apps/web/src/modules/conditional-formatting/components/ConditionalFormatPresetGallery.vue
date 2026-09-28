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
  const width = 120;
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
      { x: index * 24, y: 0, width: 24, height: 22 },
      {
        iconSet: {
          iconSet,
          iconIndex: iconSet.endsWith("Ratings") ? index : count - index - 1,
          showValue: true,
        },
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
        <span
          class="mini-sheet mini-sheet--bar"
          aria-hidden="true"
          :style="{ '--bar-color': preset.color }"
          ><i v-for="width in [86, 58, 32]" :key="width" :style="{ width: `${width}%` }"
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
          aria-hidden="true"
          :style="{ '--bar-color': preset.color }"
          ><i v-for="width in [86, 58, 32]" :key="width" :style="{ width: `${width}%` }"
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
        <span class="mini-sheet mini-sheet--scale" aria-hidden="true"
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
            width="120"
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
  width: 240px;

  h3 {
    margin: 0;
    padding: 2px 12px;
    background: var(--idea-surface-secondary);
    color: var(--idea-text-secondary);
    font-size: var(--idea-font-size-body-small);
    line-height: var(--idea-line-height-body-medium);
    font-weight: var(--idea-font-weight-medium);
  }

  &__tiles {
    display: grid;
    gap: 2px 4px;
    padding: 6px 8px;
  }
  &__tiles--three {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
  &--icons {
    width: 276px;
  }
  &__tiles--two {
    row-gap: 6px;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    padding-block: 4px;
  }

  &__tile,
  &__icon-tile {
    display: grid;
    place-items: center;
    min-width: 0;
    padding: 0;
    border: 0;
    border-radius: var(--idea-radius-small);
    background: transparent;
    color: inherit;
    cursor: pointer;

    &:hover {
      background: var(--idea-surface-secondary);
    }
    &:focus-visible {
      background: var(--idea-surface-secondary);
      outline: 1px solid var(--idea-action-primary);
      outline-offset: -1px;
    }
    &:active {
      background: var(--idea-surface-active);
    }
  }

  &__tile {
    height: 46px;
  }
  &__icon-tile {
    justify-items: start;
    height: 26px;
    padding-inline: 4px;
    canvas {
      display: block;
      width: 120px;
      height: 22px;
    }
  }
}

.mini-sheet {
  display: grid;
  width: 46px;
  height: 36px;
  overflow: hidden;
  border: 1px solid var(--idea-border-control);
  background: var(--idea-surface-panel);

  i {
    display: block;
    min-height: 0;
  }
  &--bar {
    grid-template-rows: repeat(3, 1fr);
    gap: 3px;
    padding: 3px 2px;
    background-image: repeating-linear-gradient(
      to bottom,
      transparent 0 10px,
      var(--idea-border-subtle) 10px 11px
    );
    i {
      background: linear-gradient(
        90deg,
        var(--bar-color),
        color-mix(in srgb, var(--bar-color) 18%, var(--idea-surface-panel))
      );
    }
  }
  &--bar.mini-sheet--solid i {
    background: var(--bar-color);
  }
  &--scale {
    grid-template-rows: repeat(5, 1fr);
    gap: 1px;
    background: var(--idea-surface-panel);
    i {
      background-image: linear-gradient(
        90deg,
        transparent 32%,
        rgba(255, 255, 255, 0.6) 32% 34%,
        transparent 34% 66%,
        rgba(255, 255, 255, 0.6) 66% 68%,
        transparent 68%
      );
    }
  }
}
</style>
