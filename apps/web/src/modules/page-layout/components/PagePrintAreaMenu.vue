<script setup lang="ts">
import { computed, ref, useId } from "vue";
import { ScanLine } from "lucide-vue-next";
import { useAppI18n } from "../../../shared/i18n";
import RibbonMenuButton from "../../../shared/ribbon/RibbonMenuButton.vue";
import MenuSurface from "../../../shared/menu/MenuSurface.vue";
import MenuItem from "../../../shared/menu/MenuItem.vue";
import MenuSeparator from "../../../shared/menu/MenuSeparator.vue";
import { useMenu } from "../../../shared/menu/useMenu";
const props = defineProps<{ disabled: boolean; hasPrintArea: boolean }>();
const emit = defineEmits<{ set: []; clear: []; openSetup: [] }>();
const { t } = useAppI18n();
const trigger = ref<InstanceType<typeof RibbonMenuButton> | null>(null);
const surface = ref<InstanceType<typeof MenuSurface> | null>(null);
const menuId = `page-print-area-${useId()}`;
const { open, floatingStyles, dismiss, toggleMenu, onTriggerKeydown } = useMenu({
  triggerRef: computed(() => trigger.value?.rootElement ?? null),
  menuSurfaceRef: surface,
  disabled: computed(() => props.disabled),
});
function select(action: "set" | "clear" | "openSetup"): void {
  dismiss("programmatic", true);
  if (action === "set") emit("set");
  else if (action === "clear") emit("clear");
  else emit("openSetup");
}
</script>
<template>
  <span class="page-print-area-menu">
    <RibbonMenuButton
      ref="trigger"
      variant="tall"
      :label="t('pageTools.printArea')"
      :text="t('pageTools.printArea')"
      :disabled="disabled"
      :expanded="open"
      :menu-id="menuId"
      data-page-tool="print-area"
      @activate="toggleMenu"
      @keydown="onTriggerKeydown"
      ><ScanLine
    /></RibbonMenuButton>
    <Teleport to="body"
      ><MenuSurface
        v-if="open"
        :id="menuId"
        ref="surface"
        :label="t('pageTools.printArea')"
        :style="floatingStyles"
        class="page-print-area-menu__surface"
      >
        <MenuItem data-page-action="set-print-area" @select="select('set')">{{
          t("pageTools.setPrintArea")
        }}</MenuItem>
        <MenuItem
          :disabled="!hasPrintArea"
          data-page-action="clear-print-area"
          @select="select('clear')"
          >{{ t("pageTools.clearPrintArea") }}</MenuItem
        >
        <MenuSeparator />
        <MenuItem @select="select('openSetup')">{{ t("pageLayout.pageSetup") }}…</MenuItem>
      </MenuSurface></Teleport
    >
  </span>
</template>
<style scoped lang="scss">
@use "../../../shared/ribbon/ribbon-layout" as ribbon;
.page-print-area-menu {
  @include ribbon.tool;
  &__surface {
    position: fixed;
    z-index: 80;
  }
}
</style>
