<script setup lang="ts">
import { ChevronDown, Maximize2 } from "lucide-vue-next";
import { InputNumber as TInputNumber } from "tdesign-vue-next/es/input-number";
import type { InputNumberValue } from "tdesign-vue-next/es/input-number/type";
import { computed, nextTick, ref, useId } from "vue";
import { useDismissibleFloatingPanel } from "../../../shared/floating/useDismissibleFloatingPanel";
import { useAppI18n } from "../../../shared/i18n";
import { MAX_SHEET_ZOOM, MIN_SHEET_ZOOM } from "../../../shared/sheet-view/zoom";
import MenuItem from "../../../shared/menu/MenuItem.vue";
import MenuSurface from "../../../shared/menu/MenuSurface.vue";

const props = defineProps<{ zoom: number }>();
const emit = defineEmits<{ select: [zoom: number]; fitSelection: [] }>();
const { t } = useAppI18n();
const triggerRef = ref<HTMLButtonElement | null>(null);
const menuRef = ref<InstanceType<typeof MenuSurface> | null>(null);
const open = ref(false);
const customZoom = ref<InputNumberValue>(props.zoom);
const menuId = `workbook-zoom-menu-${useId().replaceAll(":", "")}`;
const menuElement = computed(() => menuRef.value?.rootElement ?? null);
const { floatingStyles, dismiss } = useDismissibleFloatingPanel(triggerRef, menuElement, open, {
  offset: 6,
  placement: "top-end",
  onDismiss: () => {
    open.value = false;
  },
});

function isSelected(value: number): boolean {
  return props.zoom === value;
}
function openMenu(): void {
  customZoom.value = props.zoom;
  open.value = true;
  void nextTick(() => {
    const selected = menuElement.value?.querySelector<HTMLElement>(
      '[role="menuitemradio"][aria-checked="true"]',
    );
    if (selected) selected.focus();
    else menuRef.value?.focusFirstItem();
  });
}
function toggleMenu(): void {
  if (open.value) dismiss("programmatic", true);
  else openMenu();
}
function onTriggerKeydown(event: KeyboardEvent): void {
  if (event.key === "ArrowDown" || event.key === "ArrowUp") {
    event.preventDefault();
    openMenu();
  }
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
    <span>{{ zoom }}%</span><ChevronDown :size="12" aria-hidden="true" />
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
      <li class="workbook-zoom-menu__heading" role="presentation">{{ t("statusBar.zoomMenu") }}</li>
      <MenuItem
        role="menuitemradio"
        :aria-checked="isSelected(200)"
        data-zoom-preset="200"
        @select="selectZoom(200)"
        ><template #icon
          ><span
            class="workbook-zoom-menu__radio"
            :class="{ 'is-selected': isSelected(200) }" /></template
        >200%</MenuItem
      >
      <MenuItem
        role="menuitemradio"
        :aria-checked="isSelected(100)"
        data-zoom-preset="100"
        @select="selectZoom(100)"
        ><template #icon
          ><span
            class="workbook-zoom-menu__radio"
            :class="{ 'is-selected': isSelected(100) }" /></template
        >100%</MenuItem
      >
      <MenuItem
        role="menuitemradio"
        :aria-checked="isSelected(75)"
        data-zoom-preset="75"
        @select="selectZoom(75)"
        ><template #icon
          ><span
            class="workbook-zoom-menu__radio"
            :class="{ 'is-selected': isSelected(75) }" /></template
        >75%</MenuItem
      >
      <MenuItem
        role="menuitemradio"
        :aria-checked="isSelected(50)"
        data-zoom-preset="50"
        @select="selectZoom(50)"
        ><template #icon
          ><span
            class="workbook-zoom-menu__radio"
            :class="{ 'is-selected': isSelected(50) }" /></template
        >50%</MenuItem
      >
      <MenuItem
        role="menuitemradio"
        :aria-checked="isSelected(25)"
        data-zoom-preset="25"
        @select="selectZoom(25)"
        ><template #icon
          ><span
            class="workbook-zoom-menu__radio"
            :class="{ 'is-selected': isSelected(25) }" /></template
        >25%</MenuItem
      >
      <MenuItem data-zoom-fit-selection @select="fitSelection"
        ><template #icon><Maximize2 :size="15" /></template
        >{{ t("statusBar.fitSelection") }}</MenuItem
      >
      <li class="workbook-zoom-menu__custom" role="none">
        <label>
          <span>{{ t("statusBar.customZoom") }}</span>
          <TInputNumber
            :model-value="customZoom"
            :min="MIN_SHEET_ZOOM"
            :max="MAX_SHEET_ZOOM"
            :decimal-places="0"
            :step="1"
            size="small"
            theme="column"
            suffix="%"
            @change="customZoom = $event"
            @enter="commitCustom($event, true)"
            @blur="commitCustom($event, false)"
          />
        </label>
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
    font-size: 12px;
    font-variant-numeric: tabular-nums;
    background: transparent;
    border: 0;
    border-radius: 2px;
    cursor: pointer;

    &:hover,
    &[aria-expanded="true"] {
      color: var(--idea-text-primary);
      background: var(--idea-surface-hover);
    }

    &:focus-visible {
      outline: 1px solid var(--idea-action-primary);
      outline-offset: -1px;
    }
  }

  &__heading {
    padding: 2px 14px 4px;
    color: var(--idea-text-primary);
    font-size: var(--idea-font-size-body-small);
    font-weight: 600;
  }

  &__radio {
    display: grid;
    place-items: center;
    width: 13px;
    height: 13px;
    border: 1px solid var(--idea-text-muted);
    border-radius: 50%;

    &.is-selected {
      border-color: var(--idea-action-primary);

      &::after {
        width: 7px;
        height: 7px;
        background: var(--idea-action-primary);
        border-radius: 50%;
        content: "";
      }
    }
  }

  &__custom {
    padding: 8px 14px 0;
    color: var(--idea-text-secondary);
    font-size: var(--idea-font-size-body-small);
    list-style: none;

    > label {
      display: grid;
      justify-items: start;
      gap: 6px;

      > span {
        font-weight: 600;
      }
    }
  }
}
</style>
