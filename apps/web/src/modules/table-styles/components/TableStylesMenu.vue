<script setup lang="ts">
import { computed, nextTick, ref, useId } from "vue";
import { Eraser, Plus, Settings2, TableProperties } from "lucide-vue-next";
import { Switch } from "tdesign-vue-next/es/switch";
import {
  createBuiltinTableStyles,
  createThemedTableStyles,
  type TableStyleDefinition,
} from "@idea10/core/table-styles";
import type { PivotTableStyleDefinition } from "@idea10/core/pivot-table-styles";
import { useAppI18n } from "../../../shared/i18n";
import MenuItem from "../../../shared/menu/MenuItem.vue";
import MenuSeparator from "../../../shared/menu/MenuSeparator.vue";
import MenuSurface from "../../../shared/menu/MenuSurface.vue";
import { useMenu } from "../../../shared/menu/useMenu";
import RibbonMenuButton from "../../../shared/ribbon/RibbonMenuButton.vue";
import { TABLE_STYLE_THEME_COLORS } from "../table-style-presentation";
import TableStyleGallery from "./TableStyleGallery.vue";

const props = withDefaults(
  defineProps<{
    variant?: "compact" | "tall";
    label?: string;
    customStyles?: readonly TableStyleDefinition[];
    customPivotStyles?: readonly PivotTableStyleDefinition[];
    selectedStyleId?: string;
    selectedAccentColor?: string;
    /** Current document theme's primary accent for quick table styles. */
    themeAccentColor?: string;
    hasTable?: boolean;
    disabled?: boolean;
    editSessionId?: string;
  }>(),
  {
    customStyles: () => [],
    customPivotStyles: () => [],
    selectedStyleId: undefined,
    hasTable: false,
    disabled: false,
    editSessionId: undefined,
  },
);
const emit = defineEmits<{
  apply: [style: TableStyleDefinition];
  create: [];
  edit: [style: TableStyleDefinition];
  createPivot: [];
  editPivot: [style: PivotTableStyleDefinition];
  clear: [];
  manage: [];
}>();
const { t } = useAppI18n();
const accentColor = ref<string>(props.themeAccentColor ?? TABLE_STYLE_THEME_COLORS[1]);
const expanded = ref(false);
const maxMenuHeight = ref("calc(100vh - 32px)");
const triggerRef = ref<InstanceType<typeof RibbonMenuButton> | null>(null);
const surfaceRef = ref<InstanceType<typeof MenuSurface> | null>(null);
const triggerElement = computed(() => triggerRef.value?.rootElement ?? null);
const panelId = `table-styles-menu-${useId().replaceAll(":", "")}`;
const styles = computed(() => [...createBuiltinTableStyles(), ...props.customStyles]);
const visibleStyles = computed(() =>
  expanded.value
    ? styles.value
    : [...createThemedTableStyles(accentColor.value), ...props.customStyles],
);
const selectedStyleId = computed(() =>
  !expanded.value &&
  props.selectedStyleId?.startsWith("table-wps-") &&
  props.selectedAccentColor !== accentColor.value
    ? undefined
    : props.selectedStyleId,
);
function selectTheme(color: string): void {
  accentColor.value = color;
  expanded.value = false;
}
function updateMenuHeight(): void {
  const trigger = triggerElement.value;
  if (!trigger || typeof window === "undefined") return;
  const rect = trigger.getBoundingClientRect();
  maxMenuHeight.value = `${Math.max(160, Math.max(window.innerHeight - rect.bottom - 16, rect.top - 16))}px`;
}
const { open, floatingStyles, dismiss, toggleMenu, onTriggerKeydown } = useMenu({
  triggerRef: triggerElement,
  menuSurfaceRef: surfaceRef,
  disabled: computed(() => props.disabled),
  placement: "bottom-start",
  onDismiss: () => {
    expanded.value = false;
  },
  onOpen: () => {
    accentColor.value =
      props.selectedAccentColor ?? props.themeAccentColor ?? TABLE_STYLE_THEME_COLORS[1];
    void nextTick(updateMenuHeight);
  },
});

function apply(style: TableStyleDefinition | PivotTableStyleDefinition): void {
  dismiss("programmatic", true);
  emit("apply", style as TableStyleDefinition);
}
function create(): void {
  dismiss("programmatic", true);
  emit("create");
}
function edit(style: TableStyleDefinition | PivotTableStyleDefinition): void {
  dismiss("programmatic", true);
  emit("edit", style as TableStyleDefinition);
}
function createPivot(): void {
  dismiss("programmatic", true);
  emit("createPivot");
}
function editPivot(style: TableStyleDefinition | PivotTableStyleDefinition): void {
  dismiss("programmatic", true);
  emit("editPivot", style as PivotTableStyleDefinition);
}
function clear(): void {
  dismiss("programmatic", true);
  emit("clear");
}
function manage(): void {
  dismiss("programmatic", true);
  emit("manage");
}
</script>

<template>
  <div class="table-styles-menu">
    <RibbonMenuButton
      ref="triggerRef"
      data-ribbon-action="table-styles"
      :label="label ?? t('ribbon.tableStyles')"
      :text="label ?? t('ribbon.tableStyles')"
      :variant="variant"
      :disabled="disabled"
      :expanded="open"
      :menu-id="panelId"
      full-width
      @activate="toggleMenu"
      @keydown="onTriggerKeydown"
      ><TableProperties aria-hidden="true"
    /></RibbonMenuButton>
    <Teleport to="body">
      <MenuSurface
        v-if="open"
        :id="panelId"
        ref="surfaceRef"
        class="table-styles-menu__surface"
        :class="{ 'table-styles-menu__surface--expanded': expanded }"
        :style="[floatingStyles, { maxHeight: maxMenuHeight }]"
        :label="t('tableStyles.title')"
        :data-cell-edit-session="editSessionId"
      >
        <div class="table-styles-menu__header">
          <span>{{ t("tableStyles.allStyles") }}</span>
          <div class="table-styles-menu__view">
            <span>{{ t("tableStyles.themeStyles") }}</span>
            <Switch
              :model-value="!expanded"
              size="small"
              role="switch"
              :tabindex="0"
              :aria-checked="!expanded"
              :aria-label="t('tableStyles.themeStyles')"
              @change="expanded = !$event"
              @keydown.space.stop.prevent="expanded = !expanded"
              @keydown.enter.stop.prevent="expanded = !expanded"
            />
          </div>
        </div>
        <section
          v-if="!expanded"
          class="table-styles-menu__theme"
          :aria-label="t('tableStyles.themeColors')"
        >
          <span>{{ t("tableStyles.themeColors") }}</span>
          <div role="radiogroup" :aria-label="t('tableStyles.themeColors')">
            <button
              v-for="color in TABLE_STYLE_THEME_COLORS"
              :key="color"
              type="button"
              class="table-styles-menu__color"
              :class="{ 'is-selected': !expanded && accentColor === color }"
              :style="{ backgroundColor: color }"
              role="radio"
              :aria-checked="!expanded && accentColor === color"
              :aria-label="color"
              @click="selectTheme(color)"
            />
          </div>
        </section>
        <div class="table-styles-menu__galleries">
          <TableStyleGallery
            class="table-styles-menu__gallery"
            :styles="visibleStyles"
            :selected-style-id="selectedStyleId"
            show-categories
            :columns="expanded ? 7 : 4"
            :compact="expanded"
            @select="apply"
            @edit="edit"
          />
          <section
            v-if="customPivotStyles.length"
            class="table-styles-menu__pivot"
            :aria-label="t('tableStyles.pivotStyles')"
          >
            <span>{{ t("tableStyles.pivotStyles") }}</span>
            <TableStyleGallery
              kind="pivot"
              :styles="customPivotStyles"
              show-categories
              compact
              :columns="4"
              @select="editPivot"
              @edit="editPivot"
            />
          </section>
        </div>
        <MenuSeparator />
        <MenuItem @select="create"
          ><template #icon><Plus /></template>{{ t("tableStyles.newStyle") }}</MenuItem
        >
        <MenuItem @select="createPivot"
          ><template #icon><Plus /></template>{{ t("tableStyles.newPivotStyle") }}</MenuItem
        >
        <MenuItem v-if="hasTable" @select="manage"
          ><template #icon><Settings2 /></template>{{ t("tables.settings") }}</MenuItem
        >
        <MenuItem v-if="hasTable" @select="clear"
          ><template #icon><Eraser /></template>{{ t("tableStyles.clearStyle") }}</MenuItem
        >
      </MenuSurface>
    </Teleport>
  </div>
</template>

<style scoped lang="scss">
.table-styles-menu {
  display: contents;

  &__surface {
    display: flex;
    flex-direction: column;
    z-index: 50;
    width: 400px;
    max-height: calc(100vh - 32px);
    overflow: hidden;

    > * {
      flex-shrink: 0;
    }

    &--expanded {
      width: 520px;
    }
  }

  &__galleries {
    flex: 1 1 auto;
    min-height: 0;
    overflow-y: auto;
    overscroll-behavior: contain;
    padding-bottom: 4px;

    > * + * {
      margin-top: 8px;
    }
  }

  &__pivot {
    display: grid;
    gap: 6px;
    color: var(--idea-text-primary);

    > span {
      padding-inline: var(--idea-space-5);
      color: var(--idea-text-secondary);
      font-size: var(--idea-font-size-body-small);
      font-weight: var(--idea-font-weight-medium);
    }
  }

  &__theme {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 2px var(--idea-space-5) 8px;
    color: var(--idea-text-primary);

    > div {
      display: flex;
      gap: 6px;
    }
  }

  &__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--idea-space-3);
    padding: 2px var(--idea-space-5) 8px;
    color: var(--idea-text-primary);
  }

  &__view {
    display: flex;
    align-items: center;
    gap: var(--idea-space-2);
    color: var(--idea-text-secondary);
    white-space: nowrap;
  }

  &__color {
    width: 18px;
    height: 18px;
    border: 1px solid var(--idea-border-control);
    border-radius: var(--idea-radius-circle);
    cursor: pointer;

    &.is-selected {
      outline: 2px solid var(--idea-action-primary);
      outline-offset: 2px;
    }
  }
}
</style>
