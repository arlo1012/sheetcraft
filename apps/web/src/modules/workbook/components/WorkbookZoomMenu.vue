<script setup lang="ts">
import { ChevronDown, ChevronUp, Maximize2 } from "lucide-vue-next";
import { InputNumber as TInputNumber } from "tdesign-vue-next/es/input-number";
import type { InputNumberValue } from "tdesign-vue-next/es/input-number/type";
import { ref, useId } from "vue";
import { useMenu } from "../../../shared/menu/useMenu";
import { useAppI18n } from "../../../shared/i18n";
import { MAX_SHEET_ZOOM, MIN_SHEET_ZOOM } from "../../../shared/sheet-view/zoom";
import MenuItem from "../../../shared/menu/MenuItem.vue";
import MenuRadioItem from "../../../shared/menu/MenuRadioItem.vue";
import MenuSurface from "../../../shared/menu/MenuSurface.vue";

const props = defineProps<{ zoom: number }>();
const emit = defineEmits<{ select: [zoom: number]; fitSelection: [] }>();
const { t } = useAppI18n();
const triggerRef = ref<HTMLButtonElement | null>(null);
const menuRef = ref<InstanceType<typeof MenuSurface> | null>(null);
const customZoom = ref<InputNumberValue>(props.zoom);
const menuId = `workbook-zoom-menu-${useId().replaceAll(":", "")}`;
const { open, floatingStyles, dismiss, toggleMenu, onTriggerKeydown } = useMenu({
  triggerRef,
  menuSurfaceRef: menuRef,
  offset: 6,
  placement: "top-end",
  defaultFocus: "selected",
  onOpen: () => {
    customZoom.value = props.zoom;
  },
});

function isSelected(value: number): boolean {
  return props.zoom === value;
}
function selectZoom(value: number): void {
  emit("select", value);
  dismiss("programmatic", true);
}
function commitCustom(value: InputNumberValue, close: boolean): void {
  if (typeof value !== "number" || !Number.isFinite(value)) return;
  const zoom = Math.round(value);
  if (zoom < MIN_SHEET_ZOOM || zoom > MAX_SHEET_ZOOM) return;
  emit("select", zoom);
  if (close) dismiss("programmatic", true);
}
function fitSelection(): void {
  emit("fitSelection");
  dismiss("programmatic", true);
}
</script>

<template>
  <button
    ref="triggerRef"
    type="button"
    class="workbook-zoom-menu__trigger"
    :aria-label="t('statusBar.zoomLevel', { value: zoom })"
    :aria-controls="open ? menuId : undefined"
    :aria-expanded="open"
    aria-haspopup="menu"
    :title="t('statusBar.zoomMenu')"
    data-view-control="zoom-menu"
    @click="toggleMenu"
    @keydown="onTriggerKeydown"
  >
    <span>{{ zoom }}%</span>
    <ChevronUp v-if="open" :size="12" aria-hidden="true" />
    <ChevronDown v-else :size="12" aria-hidden="true" />
  </button>
  <Teleport to="body">
    <MenuSurface
      v-if="open"
      :id="menuId"
      ref="menuRef"
      class="workbook-zoom-menu"
      :style="floatingStyles"
      :label="t('statusBar.zoomMenu')"
    >
      <MenuRadioItem :checked="isSelected(200)" data-zoom-preset="200" @select="selectZoom(200)"
        >200%</MenuRadioItem
      >
      <MenuRadioItem :checked="isSelected(100)" data-zoom-preset="100" @select="selectZoom(100)"
        >100%</MenuRadioItem
      >
      <MenuRadioItem :checked="isSelected(75)" data-zoom-preset="75" @select="selectZoom(75)"
        >75%</MenuRadioItem
      >
      <MenuRadioItem :checked="isSelected(50)" data-zoom-preset="50" @select="selectZoom(50)"
        >50%</MenuRadioItem
      >
      <MenuRadioItem :checked="isSelected(25)" data-zoom-preset="25" @select="selectZoom(25)"
        >25%</MenuRadioItem
      >
      <MenuItem data-zoom-fit-selection @select="fitSelection"
        ><template #icon><Maximize2 :size="15" /></template
        >{{ t("statusBar.fitSelection") }}</MenuItem
      >
      <li class="workbook-zoom-menu__custom" role="none">
        <div role="group" :aria-label="t('statusBar.customZoom')">
          <span>{{ t("statusBar.customZoom") }}</span>
          <TInputNumber
            class="workbook-zoom-menu__custom-input idea-input-number--persistent-controls"
            :model-value="customZoom"
            :min="MIN_SHEET_ZOOM"
            :max="MAX_SHEET_ZOOM"
            :decimal-places="0"
            :step="1"
            :placeholder="t('statusBar.customZoom')"
            theme="column"
            suffix="%"
            @change="customZoom = $event"
            @enter="commitCustom($event, true)"
            @blur="commitCustom($event, false)"
          />
        </div>
      </li>
    </MenuSurface>
  </Teleport>
</template>

<style scoped lang="scss">
.workbook-zoom-menu {
  z-index: 90;
  width: 176px;

  &__trigger {
    display: inline-flex;
    flex: 0 0 auto;
    align-items: center;
    justify-content: center;
    width: 48px;
    height: 22px;
    gap: 1px;
    padding: 0;
    color: inherit;
    font-size: var(--idea-font-size-body-small);
    line-height: var(--idea-line-height-body-small);
    font-variant-numeric: tabular-nums;
    background: transparent;
    border: 0;
    border-radius: 2px;
    cursor: pointer;

    &:hover,
    &[aria-expanded="true"] {
      background: var(--idea-icon-button-hover-bg);
    }

    &:focus-visible {
      outline: 1px solid var(--idea-action-primary);
      outline-offset: -1px;
    }
  }

  &__custom {
    padding: 8px 14px 0;
    color: var(--idea-text-secondary);
    font-size: var(--idea-font-size-body-medium);
    line-height: var(--idea-line-height-body-medium);
    list-style: none;

    > [role="group"] {
      display: grid;
      grid-template-columns: minmax(0, 1fr);
      gap: 6px;

      > span {
        font-weight: var(--idea-font-weight-regular);
      }

      > .workbook-zoom-menu__custom-input {
        width: 100px;
        max-width: 100%;
        min-width: 0;
      }
    }
  }
}
</style>
