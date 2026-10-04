<script setup lang="ts">
import { Maximize2 } from "lucide-vue-next";
import { InputNumber as TInputNumber } from "tdesign-vue-next/es/input-number";
import type { InputNumberValue } from "tdesign-vue-next/es/input-number/type";
import { computed, ref, useId } from "vue";
import type { SheetPageFitToPage, SheetPageSetup } from "@idea10/core/page-setup";
import { useAppI18n } from "../../../shared/i18n";
import MenuItem from "../../../shared/menu/MenuItem.vue";
import MenuRadioItem from "../../../shared/menu/MenuRadioItem.vue";
import MenuSeparator from "../../../shared/menu/MenuSeparator.vue";
import MenuSurface from "../../../shared/menu/MenuSurface.vue";
import { useMenu } from "../../../shared/menu/useMenu";
import RibbonMenuButton from "../../../shared/ribbon/RibbonMenuButton.vue";

type FitPreset = "sheet" | "columns" | "rows";
const props = defineProps<{ setup: SheetPageSetup; disabled: boolean }>();
const emit = defineEmits<{ change: [patch: Partial<SheetPageSetup>]; openSetup: [] }>();
const { t } = useAppI18n();
const buttonRef = ref<InstanceType<typeof RibbonMenuButton> | null>(null);
const triggerRef = computed(() => buttonRef.value?.rootElement ?? null);
const menuSurfaceRef = ref<InstanceType<typeof MenuSurface> | null>(null);
const menuId = `page-scaling-menu-${useId().replaceAll(":", "")}`;
const presets: Record<FitPreset, SheetPageFitToPage> = {
  sheet: { width: 1, height: 1 },
  columns: { width: 1, height: 0 },
  rows: { width: 0, height: 1 },
};
const { open, floatingStyles, dismiss, toggleMenu, onTriggerKeydown } = useMenu({
  triggerRef,
  menuSurfaceRef,
  disabled: computed(() => props.disabled),
  defaultFocus: "selected",
});

function matches(fit: SheetPageFitToPage): boolean {
  return props.setup.fitToPage?.width === fit.width && props.setup.fitToPage?.height === fit.height;
}
function selectNoScaling(): void {
  emit("change", { scale: 100, fitToPage: null });
  dismiss("programmatic", true);
}
function select(preset: FitPreset): void {
  emit("change", { fitToPage: { ...presets[preset] } });
  dismiss("programmatic", true);
}
function setScale(value: InputNumberValue): void {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 10 || value > 400) {
    return;
  }
  emit("change", { scale: value, fitToPage: null });
}
function openSetup(): void {
  dismiss("programmatic", false);
  emit("openSetup");
}
</script>

<template>
  <span class="page-scaling-menu">
    <RibbonMenuButton
      ref="buttonRef"
      variant="tall"
      :label="t('pageTools.printScaling')"
      :text="t('pageTools.printScaling')"
      :disabled="disabled"
      :expanded="open"
      :menu-id="menuId"
      data-page-tool="scaling"
      @activate="toggleMenu"
      @keydown="onTriggerKeydown"
      ><Maximize2 aria-hidden="true"
    /></RibbonMenuButton>
    <Teleport to="body">
      <MenuSurface
        v-if="open"
        :id="menuId"
        ref="menuSurfaceRef"
        class="page-scaling-menu__surface"
        :style="floatingStyles"
        :label="t('pageTools.printScaling')"
      >
        <MenuRadioItem
          :checked="setup.fitToPage == null && setup.scale === 100"
          data-page-scaling="none"
          @select="selectNoScaling"
          >{{ t("pageTools.noScaling") }}</MenuRadioItem
        >
        <MenuRadioItem
          :checked="matches(presets.sheet)"
          data-page-scaling="sheet"
          @select="select('sheet')"
          >{{ t("pageLayout.fitEntireSheet") }}</MenuRadioItem
        >
        <MenuRadioItem
          :checked="matches(presets.columns)"
          data-page-scaling="columns"
          @select="select('columns')"
          >{{ t("pageLayout.fitAllColumns") }}</MenuRadioItem
        >
        <MenuRadioItem
          :checked="matches(presets.rows)"
          data-page-scaling="rows"
          @select="select('rows')"
          >{{ t("pageLayout.fitAllRows") }}</MenuRadioItem
        >
        <li class="page-scaling-menu__scale" role="none">
          <div role="group" :aria-label="t('pageLayout.scale')">
            <span>{{ t("pageLayout.scale") }}</span>
            <TInputNumber
              :model-value="setup.scale"
              class="page-scaling-menu__scale-input idea-input-number--persistent-controls"
              :aria-label="t('pageLayout.scale')"
              data-page-scaling="scale"
              theme="column"
              :min="10"
              :max="400"
              :decimal-places="0"
              :step="1"
              suffix="%"
              @update:model-value="setScale"
            />
          </div>
        </li>
        <MenuSeparator />
        <MenuItem data-page-scaling="custom" @select="openSetup">{{
          t("pageTools.customScaling")
        }}</MenuItem>
      </MenuSurface>
    </Teleport>
  </span>
</template>

<style scoped lang="scss">
@use "../../../shared/ribbon/ribbon-layout" as ribbon;
.page-scaling-menu {
  @include ribbon.tool;
  &__surface {
    z-index: var(--idea-layer-menu);
    min-width: 220px;
  }
  &__scale {
    padding: 4px 14px;
    color: var(--idea-text-primary);
    font-size: var(--idea-font-size-body-medium);
    line-height: var(--idea-line-height-body-medium);
    list-style: none;

    > [role="group"] {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      align-items: center;
      gap: 8px;
    }
  }
  &__scale-input {
    width: 96px;
    min-width: 0;
  }
}
</style>
