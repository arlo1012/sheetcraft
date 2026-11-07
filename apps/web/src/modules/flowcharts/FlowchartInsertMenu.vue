<script setup lang="ts">
import { computed, ref, useId } from "vue";
import { Workflow, Plus, FolderOpen, Upload } from "lucide-vue-next";
import { useAppI18n } from "../../shared/i18n";
import MenuItem from "../../shared/menu/MenuItem.vue";
import MenuSurface from "../../shared/menu/MenuSurface.vue";
import { useMenu } from "../../shared/menu/useMenu";
import RibbonMenuButton from "../../shared/ribbon/RibbonMenuButton.vue";
import type { FlowchartStart } from "./flowchart-templates";
const props = defineProps<{ disabled: boolean }>();
const emit = defineEmits<{ insert: [start: FlowchartStart] }>();
const { t } = useAppI18n();
const trigger = ref<InstanceType<typeof RibbonMenuButton>>();
const surface = ref<InstanceType<typeof MenuSurface>>();
const menuId = "flowchart-insert-" + useId();
const { open, floatingStyles, dismiss, toggleMenu, onTriggerKeydown } = useMenu({
  triggerRef: computed(() => trigger.value?.rootElement ?? null),
  menuSurfaceRef: computed(() => surface.value ?? null),
  disabled: computed(() => props.disabled),
});
function select(start: FlowchartStart) {
  dismiss("programmatic", false);
  emit("insert", start);
}
</script>
<template>
  <span class="flowchart-tool">
    <RibbonMenuButton
      ref="trigger"
      variant="tall"
      :label="t('flowchart.title')"
      :text="t('flowchart.title')"
      :disabled="disabled"
      :expanded="open"
      :menu-id="menuId"
      data-insert-tool="flowchart"
      @activate="toggleMenu"
      @keydown="onTriggerKeydown"
      ><Workflow
    /></RibbonMenuButton>
    <Teleport to="body"
      ><MenuSurface
        v-if="open"
        ref="surface"
        :id="menuId"
        class="flowchart-menu"
        :style="floatingStyles"
        :label="t('flowchart.title')"
        ><template #items>
          <MenuItem @select="select('gallery')"
            ><template #icon><FolderOpen /></template>{{ t("flowchart.gallery") }}</MenuItem
          >
          <MenuItem @select="select('blank')"
            ><template #icon><Plus /></template>{{ t("flowchart.blank") }}</MenuItem
          >
          <MenuItem @select="select('import')"
            ><template #icon><Upload /></template>{{ t("flowchart.import") }}</MenuItem
          >
        </template></MenuSurface
      ></Teleport
    >
  </span>
</template>
<style scoped lang="scss">
@use "../../shared/ribbon/ribbon-layout" as ribbon;
.flowchart-tool {
  @include ribbon.tool;
}
.flowchart-menu {
  z-index: var(--sheetcraft-layer-menu);
}
</style>
