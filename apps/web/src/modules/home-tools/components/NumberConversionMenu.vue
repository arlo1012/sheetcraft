<script setup lang="ts">
import { ArrowRightLeft, CaseSensitive, Hash } from "lucide-vue-next";
import { computed, ref, useId } from "vue";
import type { CellValueConversionMode } from "@idea10/core/commands";
import { useAppI18n } from "../../../shared/i18n";
import MenuItem from "../../../shared/menu/MenuItem.vue";
import MenuSurface from "../../../shared/menu/MenuSurface.vue";
import RibbonMenuButton from "../../../shared/ribbon/RibbonMenuButton.vue";
import { useRibbonMenu } from "../../../shared/ribbon/useRibbonMenu";

const props = defineProps<{ disabled: boolean }>();
const emit = defineEmits<{ convert: [mode: CellValueConversionMode] }>();
const { t } = useAppI18n();
const buttonRef = ref<InstanceType<typeof RibbonMenuButton> | null>(null);
const triggerRef = computed(() => buttonRef.value?.rootElement ?? null);
const menuSurfaceRef = ref<InstanceType<typeof MenuSurface> | null>(null);
const menuId = `number-conversion-${useId().replaceAll(":", "")}`;
const { open, floatingStyles, dismiss, toggleMenu, onTriggerKeydown } = useRibbonMenu({
  triggerRef,
  menuSurfaceRef,
  disabled: computed(() => props.disabled),
});

function convert(mode: CellValueConversionMode): void {
  if (props.disabled) return;
  emit("convert", mode);
  dismiss();
}
</script>

<template>
  <div class="number-conversion-menu">
    <RibbonMenuButton
      ref="buttonRef"
      variant="tall"
      :label="t('ribbon.convertDataType')"
      :text="t('ribbon.convert')"
      :disabled="disabled"
      :expanded="open"
      :menu-id="menuId"
      data-ribbon-action="convert-number"
      data-ribbon-layout="tall"
      data-ribbon-span="2"
      @activate="toggleMenu"
      @keydown="onTriggerKeydown"
    >
      <ArrowRightLeft :size="17" aria-hidden="true" />
    </RibbonMenuButton>
    <Teleport to="body">
      <MenuSurface
        v-if="open"
        :id="menuId"
        ref="menuSurfaceRef"
        class="number-conversion-menu__surface"
        :style="floatingStyles"
        :label="t('ribbon.convertDataType')"
      >
        <MenuItem data-number-conversion="text-to-number" @select="convert('text-to-number')">
          <template #icon><Hash :size="15" /></template>
          {{ t("ribbon.textToNumber") }}
        </MenuItem>
        <MenuItem data-number-conversion="number-to-text" @select="convert('number-to-text')">
          <template #icon><CaseSensitive :size="15" /></template>
          {{ t("ribbon.numberToText") }}
        </MenuItem>
      </MenuSurface>
    </Teleport>
  </div>
</template>

<style scoped lang="scss">
@use "../../../shared/ribbon/ribbon-layout" as ribbon;

.number-conversion-menu {
  @include ribbon.tool;

  &__surface {
    z-index: 80;
    min-width: 190px;
  }
}
</style>
