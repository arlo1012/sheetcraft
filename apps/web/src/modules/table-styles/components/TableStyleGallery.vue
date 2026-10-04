<script setup lang="ts">
import type { TableStyleDefinition } from "@idea10/core/table-styles";
import type { PivotTableStyleDefinition } from "@idea10/core/pivot-table-styles";
import { computed, markRaw, nextTick, shallowRef } from "vue";
import { MoreHorizontal } from "lucide-vue-next";
import GallerySection from "../../../shared/gallery/GallerySection.vue";
import CustomStyleContextMenu from "../../../shared/gallery/CustomStyleContextMenu.vue";
import type { FloatingReference } from "../../../shared/floating/useFloatingPanel";
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
  delete: [style: TableStyleDefinition | PivotTableStyleDefinition];
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
const contextMenu = shallowRef<{
  style: TableStyleDefinition | PivotTableStyleDefinition;
  trigger: HTMLElement;
  anchor: FloatingReference;
}>();
const contextStyle = computed(() => contextMenu.value?.style);
const contextMenuRef = shallowRef<InstanceType<typeof CustomStyleContextMenu> | null>(null);
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
function openContextMenu(
  style: TableStyleDefinition | PivotTableStyleDefinition,
  trigger: HTMLElement,
  x: number,
  y: number,
): void {
  contextMenu.value = {
    style,
    trigger,
    anchor: markRaw({
      contextElement: trigger,
      getBoundingClientRect: () => new DOMRect(x, y, 0, 0),
    }),
  };
}
function onTileContextMenu(
  event: MouseEvent,
  style: TableStyleDefinition | PivotTableStyleDefinition,
): void {
  event.preventDefault();
  if (style.category !== "custom") return;
  event.stopPropagation();
  openContextMenu(style, event.currentTarget as HTMLButtonElement, event.clientX, event.clientY);
}
function onMoreClick(
  event: MouseEvent,
  style: TableStyleDefinition | PivotTableStyleDefinition,
): void {
  event.preventDefault();
  event.stopPropagation();
  const trigger = event.currentTarget as HTMLElement;
  const rect = trigger.getBoundingClientRect();
  openContextMenu(style, trigger, rect.left, rect.bottom);
}
function closeContextMenu(restoreFocus: boolean): void {
  const trigger = contextMenu.value?.trigger;
  contextMenu.value = undefined;
  if (restoreFocus && trigger?.isConnected)
    void nextTick(() => trigger.focus({ preventScroll: true }));
}
function editContextStyle(): void {
  const style = contextStyle.value;
  closeContextMenu(false);
  if (style) emit("edit", style);
}
function deleteContextStyle(): void {
  const style = contextStyle.value;
  closeContextMenu(false);
  if (style) emit("delete", style);
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

function contextMenuElement(): HTMLElement | null {
  return contextMenuRef.value?.rootElement ?? null;
}

defineExpose({ contextMenuElement });
</script>

<template>
  <div
    class="table-style-gallery"
    :class="{ 'is-ribbon': layout === 'ribbon' }"
    :style="{ '--table-style-columns': columns }"
  >
    <template v-for="category in categories" :key="category">
      <GallerySection
        v-if="styles.some((style) => style.category === category)"
        :title="showCategories ? t(categoryLabel(category)) : undefined"
        :inline="layout === 'ribbon'"
      >
        <div
          class="table-style-gallery__grid"
          :class="{ 'table-style-gallery__grid--compact': compact }"
          role="grid"
        >
          <div
            v-for="style in styles.filter((item) => item.category === category)"
            :key="style.id"
            class="table-style-gallery__item"
          >
            <button
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
              @contextmenu="onTileContextMenu($event, style)"
              @keydown="onTileKeydown($event, style)"
            >
              <TableStylePreview
                :kind="kind"
                :style="style"
                :selected="style.id === selectedStyleId"
                :compact="compact"
              />
            </button>
            <button
              v-if="style.category === 'custom'"
              type="button"
              class="table-style-gallery__more"
              :aria-label="`${displayName(style)} · ${t('tableStyles.editTitle')}`"
              :disabled="disabled"
              @click="onMoreClick($event, style)"
            >
              <MoreHorizontal :size="14" />
            </button>
          </div>
        </div>
      </GallerySection>
    </template>
    <CustomStyleContextMenu
      v-if="contextMenu && contextStyle"
      ref="contextMenuRef"
      :anchor="contextMenu.anchor"
      :label="contextStyle.name"
      :edit-label="t(kind === 'pivot' ? 'tableStyles.pivotEditTitle' : 'tableStyles.editTitle')"
      :delete-label="t('tableStyles.delete')"
      @edit="editContextStyle"
      @delete="deleteContextStyle"
      @close="closeContextMenu"
    />
  </div>
</template>

<style scoped lang="scss">
.table-style-gallery {
  display: grid;

  &.is-ribbon {
    display: flex;
    gap: 2px;

    .table-style-gallery__grid {
      display: flex;
    }
  }

  &__grid {
    display: grid;
    grid-template-columns: repeat(var(--table-style-columns), minmax(0, 1fr));
    gap: 4px;
  }

  &__item {
    position: relative;
    min-width: 0;
  }

  &__tile {
    width: 100%;
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

  &__more {
    position: absolute;
    top: 3px;
    right: 3px;
    display: grid;
    place-items: center;
    width: 18px;
    height: 18px;
    padding: 0;
    color: var(--idea-text-secondary);
    visibility: hidden;
    background: var(--idea-surface-panel);
    border: 1px solid var(--idea-border-subtle);
    border-radius: var(--idea-radius-small);
    cursor: pointer;
  }

  &__item:hover &__more,
  &__item:focus-within &__more,
  &__more:focus-visible {
    visibility: visible;
  }

  &__grid--compact {
    gap: 2px;

    .table-style-gallery__tile {
      padding: 2px;
    }
  }
}
</style>
