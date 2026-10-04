<script setup lang="ts">
import { computed, ref, useId } from "vue";
import { BetweenHorizontalStart } from "lucide-vue-next";
import type { CellAddress } from "@idea10/core/workbook";
import type { SheetPageSetup } from "@idea10/core/page-setup";
import type { SelectionMode } from "@idea10/sheet-engine/selection";
import { useAppI18n } from "../../../shared/i18n";
import RibbonMenuButton from "../../../shared/ribbon/RibbonMenuButton.vue";
import MenuSurface from "../../../shared/menu/MenuSurface.vue";
import MenuItem from "../../../shared/menu/MenuItem.vue";
import MenuSeparator from "../../../shared/menu/MenuSeparator.vue";
import { useMenu } from "../../../shared/menu/useMenu";
import { canChangePageBreak, type PageBreakAction } from "../page-toolbar-actions";
const props = defineProps<{
  disabled: boolean;
  setup: SheetPageSetup;
  activeCell: CellAddress;
  selectionMode: SelectionMode;
}>();
const emit = defineEmits<{ action: [action: PageBreakAction] }>();
const { t } = useAppI18n();
const trigger = ref<InstanceType<typeof RibbonMenuButton> | null>(null);
const surface = ref<InstanceType<typeof MenuSurface> | null>(null);
const menuId = `page-break-${useId()}`;
const { open, floatingStyles, dismiss, toggleMenu, onTriggerKeydown } = useMenu({
  triggerRef: computed(() => trigger.value?.rootElement ?? null),
  menuSurfaceRef: surface,
  disabled: computed(() => props.disabled),
});
function enabled(action: PageBreakAction): boolean {
  return canChangePageBreak(props.setup, props.activeCell, props.selectionMode, action);
}
function select(action: PageBreakAction): void {
  dismiss("programmatic", true);
  emit("action", action);
}
</script>
<template>
  <span class="page-break-menu">
    <RibbonMenuButton
      ref="trigger"
      :label="t('pageTools.insertPageBreak')"
      :text="t('pageTools.insertPageBreak')"
      :disabled="disabled"
      :expanded="open"
      :menu-id="menuId"
      data-page-tool="page-break"
      @activate="toggleMenu"
      @keydown="onTriggerKeydown"
      ><BetweenHorizontalStart
    /></RibbonMenuButton>
    <Teleport to="body"
      ><MenuSurface
        v-if="open"
        :id="menuId"
        ref="surface"
        :label="t('pageTools.breaks')"
        :style="floatingStyles"
        class="page-break-menu__surface"
      >
        <MenuItem
          :disabled="!enabled('insert')"
          data-page-action="insert-break"
          @select="select('insert')"
          >{{ t("pageTools.insertPageBreak") }}</MenuItem
        >
        <MenuItem
          :disabled="!enabled('remove')"
          data-page-action="remove-break"
          @select="select('remove')"
          >{{ t("pageTools.removePageBreak") }}</MenuItem
        >
        <MenuSeparator />
        <MenuItem
          :disabled="!enabled('reset')"
          data-page-action="reset-breaks"
          @select="select('reset')"
          >{{ t("pageTools.resetPageBreaks") }}</MenuItem
        >
      </MenuSurface></Teleport
    >
  </span>
</template>
<style scoped lang="scss">
@use "../../../shared/ribbon/ribbon-layout" as ribbon;
.page-break-menu {
  @include ribbon.tool;
  &__surface {
    z-index: var(--idea-layer-menu);
  }
}
</style>
