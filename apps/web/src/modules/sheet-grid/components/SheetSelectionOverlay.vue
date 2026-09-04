<script setup lang="ts">
import type { CSSProperties } from "vue";
import type { Rect } from "@idea10/sheet-engine/geometry";
import type { SheetViewportRangeFragment } from "@idea10/sheet-engine/viewport-layout";

const props = defineProps<{
  activeRects: readonly SheetViewportRangeFragment[];
  rangeRects: readonly SheetViewportRangeFragment[];
  addressLabel: string;
  editing: boolean;
  clipboardRects?: readonly SheetViewportRangeFragment[];
  clipboardMode?: "copy" | "cut" | null;
}>();

function getRectStyle(rect: Rect): CSSProperties {
  return {
    left: `${rect.x}px`,
    top: `${rect.y}px`,
    width: `${rect.width}px`,
    height: `${rect.height}px`,
  };
}

function getOutlineStyle(rect: Rect): CSSProperties {
  return {
    left: `${rect.x - 1}px`,
    top: `${rect.y - 1}px`,
    width: `${rect.width + 1}px`,
    height: `${rect.height + 1}px`,
    borderWidth: "1px",
  };
}

function getClipboardStyle(rect: Rect): CSSProperties {
  return { ...getOutlineStyle(rect), borderWidth: "2px" };
}

function getRangeOutlineStyle(
  fragment: SheetViewportRangeFragment,
  fragments: readonly SheetViewportRangeFragment[],
): CSSProperties {
  const rect = fragment.rect;
  const style = getOutlineStyle(rect);
  for (const candidate of fragments) {
    if (candidate === fragment) continue;
    const other = candidate.rect;
    const overlapsVertically = other.y < rect.y + rect.height && rect.y < other.y + other.height;
    const overlapsHorizontally = other.x < rect.x + rect.width && rect.x < other.x + other.width;
    if (overlapsVertically && other.x + other.width === rect.x)
      style.borderLeftColor = "transparent";
    if (overlapsVertically && rect.x + rect.width === other.x)
      style.borderRightColor = "transparent";
    if (overlapsHorizontally && other.y + other.height === rect.y)
      style.borderTopColor = "transparent";
    if (overlapsHorizontally && rect.y + rect.height === other.y)
      style.borderBottomColor = "transparent";
  }
  return style;
}

function getFragmentKey(fragment: SheetViewportRangeFragment): string {
  const { paneId, rect } = fragment;
  return `${paneId}:${rect.x}:${rect.y}:${rect.width}:${rect.height}`;
}
</script>

<template>
  <div
    v-for="fragment in rangeRects"
    :key="`range:${getFragmentKey(fragment)}`"
    class="sheet-selection-overlay__range-fill"
    :class="{ 'is-editing': editing }"
    :style="getRectStyle(fragment.rect)"
    data-selection-range
    aria-hidden="true"
  />
  <div
    v-for="fragment in rangeRects"
    :key="`outline:${getFragmentKey(fragment)}`"
    class="sheet-selection-overlay__range-outline"
    :class="{ 'is-editing': editing }"
    :style="getRangeOutlineStyle(fragment, rangeRects)"
    data-selection-outline
    aria-hidden="true"
  />
  <div
    v-for="fragment in activeRects"
    :key="`active:${getFragmentKey(fragment)}`"
    class="sheet-selection-overlay__active"
    :class="{ 'is-editing': editing }"
    :style="getOutlineStyle(fragment.rect)"
    :data-active-cell="addressLabel"
    aria-hidden="true"
  />
  <div
    v-for="fragment in clipboardRects"
    :key="`clipboard:${getFragmentKey(fragment)}`"
    class="sheet-selection-overlay__clipboard"
    :class="`is-${clipboardMode}`"
    :style="getClipboardStyle(fragment.rect)"
    data-clipboard-range
    aria-hidden="true"
  />
</template>

<style scoped lang="scss">
.sheet-selection-overlay {
  &__range-fill,
  &__range-outline,
  &__active,
  &__clipboard {
    position: absolute;
    pointer-events: none;
  }

  &__range-fill {
    z-index: 1;
    background: color-mix(in srgb, var(--idea-action-primary) 8%, transparent);

    &.is-editing {
      background: transparent;
    }
  }

  &__range-outline {
    z-index: 4;
    border-style: solid;
    border-color: var(--idea-action-primary);

    &.is-editing {
      border-color: transparent;
    }
  }

  &__active {
    z-index: 4;
    border-style: solid;
    border-color: var(--idea-action-primary);

    &.is-editing {
      border-color: transparent;
    }
  }

  &__clipboard {
    z-index: 6;
    border-style: dashed;
    border-color: var(--idea-action-primary);
  }
}
</style>
