<script setup lang="ts">
import type { TableStyleDefinition } from "@idea10/core/table-styles";
import type { PivotTableStyleDefinition } from "@idea10/core/pivot-table-styles";
import { nextTick } from "vue";
import { useAppI18n, type MessageKey } from "../../../shared/i18n";
import TableStylePreview from "./TableStylePreview.vue";

const props = withDefaults(
  defineProps<{
    kind?: "table" | "pivot";
    styles: readonly (TableStyleDefinition | PivotTableStyleDefinition)[];
    selectedStyleId?: string;
    compact?: boolean;
    showCategories?: boolean;
    columns?: 4 | 7;
    layout?: "grid" | "ribbon";
    disabled?: boolean;
  }>(),
  {
    kind: "table",
    selectedStyleId: undefined,
    compact: false,
    showCategories: false,
    columns: 4,
    layout: "grid",
    disabled: false,
  },
);
const emit = defineEmits<{
  select: [style: TableStyleDefinition | PivotTableStyleDefinition];
  edit: [style: TableStyleDefinition | PivotTableStyleDefinition];
}>();
const { t } = useAppI18n();
const categories = ["light", "medium", "dark", "custom"] as const;
const categoryLabels = {
  light: "tableStyles.light",
  medium: "tableStyles.medium",
  dark: "tableStyles.dark",
  custom: "tableStyles.custom",
} satisfies Record<(typeof categories)[number], MessageKey>;
const buttons = new Map<string, HTMLButtonElement>();
const orderedStyles = () =>
  categories.flatMap((category) => props.styles.filter((style) => style.category === category));

function categoryLabel(category: (typeof categories)[number]) {
  return categoryLabels[category];
}
function displayName(style: TableStyleDefinition | PivotTableStyleDefinition): string {
  const match = /^table-(?:wps-)?(light|medium|dark|outline)-(\d+)$/.exec(style.id);
  if (!match) return style.name;
  const variant =
    match[1] === "light"
      ? t("tableStyles.light")
      : match[1] === "medium"
        ? t("tableStyles.medium")
        : match[1] === "dark"
          ? t("tableStyles.dark")
          : t("tableStyles.outline");
  return t("tableStyles.presetLabel", {
    variant,
    index: match[2] ?? "",
  });
}
function setButtonRef(style: TableStyleDefinition | PivotTableStyleDefinition) {
  return (element: unknown): void => {
    if (element instanceof HTMLButtonElement) buttons.set(style.id, element);
    else buttons.delete(style.id);
  };
}
function onTileKeydown(
  event: KeyboardEvent,
  style: TableStyleDefinition | PivotTableStyleDefinition,
): void {
  if (
    style.category === "custom" &&
    (event.key === "ContextMenu" || (event.key === "F10" && event.shiftKey))
  ) {
    event.preventDefault();
    event.stopPropagation();
    emit("edit", style);
    return;
  }
  const all = orderedStyles();
  const current = all.findIndex((item) => item.id === style.id);
  const offset =
    event.key === "ArrowRight"
      ? 1
      : event.key === "ArrowLeft"
        ? -1
        : event.key === "ArrowDown"
          ? props.layout === "ribbon"
            ? 1
            : props.columns
          : event.key === "ArrowUp"
            ? props.layout === "ribbon"
              ? -1
              : -props.columns
            : 0;
  const next = event.key === "Home" ? 0 : event.key === "End" ? all.length - 1 : current + offset;
  if (!offset && event.key !== "Home" && event.key !== "End") return;
  event.preventDefault();
  event.stopPropagation();
  const target = all[Math.max(0, Math.min(all.length - 1, next))];
  if (target) void nextTick(() => buttons.get(target.id)?.focus());
}
</script>

<template>
  <div
    class="table-style-gallery"
    :class="{ 'is-ribbon': layout === 'ribbon' }"
    :style="{ '--table-style-columns': columns }"
  >
    <template v-for="category in categories" :key="category">
      <h3 v-if="showCategories && styles.some((style) => style.category === category)">
        {{ t(categoryLabel(category)) }}
      </h3>
      <div
        v-if="styles.some((style) => style.category === category)"
        class="table-style-gallery__grid"
        :class="{ 'table-style-gallery__grid--compact': compact }"
        role="grid"
      >
        <button
          v-for="style in styles.filter((item) => item.category === category)"
          :key="style.id"
          :ref="setButtonRef(style)"
          type="button"
          class="table-style-gallery__tile"
          :class="{ 'is-selected': style.id === selectedStyleId }"
          :aria-label="displayName(style)"
          :aria-pressed="style.id === selectedStyleId"
          :title="displayName(style)"
          :disabled="disabled"
          :data-table-style-id="style.id"
          role="gridcell"
          @click="emit('select', style)"
          @contextmenu.prevent="style.category === 'custom' && emit('edit', style)"
          @keydown="onTileKeydown($event, style)"
        >
          <TableStylePreview
            :kind="kind"
            :style="style"
            :selected="style.id === selectedStyleId"
            :compact="compact"
          />
        </button>
      </div>
    </template>
  </div>
</template>

<style scoped lang="scss">
.table-style-gallery {
  display: grid;
  gap: 6px;

  &.is-ribbon {
    display: flex;
    gap: 2px;

    .table-style-gallery__grid {
      display: flex;
    }
  }

  h3 {
    margin: 0;
    padding: 3px 6px;
    background: var(--idea-surface-secondary);
    color: var(--idea-text-secondary);
    font-size: var(--idea-font-size-body-small);
    font-weight: var(--idea-font-weight-medium);
    line-height: var(--idea-line-height-body-medium);
  }

  &__grid {
    display: grid;
    grid-template-columns: repeat(var(--table-style-columns), minmax(0, 1fr));
    gap: 4px;
  }

  &__tile {
    display: grid;
    place-items: center;
    min-width: 0;
    padding: 3px;
    border: 0;
    border-radius: var(--idea-radius-small);
    background: transparent;
    cursor: pointer;

    &:hover {
      background: var(--idea-surface-secondary);
    }

    &.is-selected {
      background: var(--idea-action-primary-subtle);
    }

    &:disabled {
      opacity: 0.5;
      cursor: default;
    }
  }

  &__grid--compact {
    gap: 2px;

    .table-style-gallery__tile {
      padding: 2px;
    }
  }
}
</style>
