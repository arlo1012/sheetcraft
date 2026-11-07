<script setup lang="ts">
import { computed, ref, useId } from "vue";
import { FolderOpen, Files } from "lucide-vue-next";
import RibbonMenuButton from "../../../shared/ribbon/RibbonMenuButton.vue";
import MenuItem from "../../../shared/menu/MenuItem.vue";
import MenuSurface from "../../../shared/menu/MenuSurface.vue";
import { useMenu } from "../../../shared/menu/useMenu";
const props = defineProps<{
  disabled: boolean;
  title: string;
  workbookLabel: string;
  localLabel: string;
  tool: string;
}>();
const emit = defineEmits<{ workbook: []; local: [] }>();
const trigger = ref<InstanceType<typeof RibbonMenuButton>>();
const surface = ref<InstanceType<typeof MenuSurface>>();
const menuId = "insert-diagram-" + useId();
const { open, floatingStyles, dismiss, toggleMenu, onTriggerKeydown } = useMenu({
  triggerRef: computed(() => trigger.value?.rootElement ?? null),
  menuSurfaceRef: computed(() => surface.value ?? null),
  disabled: computed(() => props.disabled),
});
function choose(local: boolean) {
  dismiss("programmatic", false);
  if (local) emit("local");
  else emit("workbook");
}
</script>
<template>
  <RibbonMenuButton
    ref="trigger"
    variant="compact"
    :label="title"
    :text="title"
    :disabled="disabled"
    :expanded="open"
    :menu-id="menuId"
    :data-insert-tool="tool"
    @activate="toggleMenu"
    @keydown="onTriggerKeydown"
    ><slot
  /></RibbonMenuButton>
  <Teleport to="body"
    ><MenuSurface
      v-if="open"
      ref="surface"
      :id="menuId"
      :label="title"
      class="diagram-insert-menu"
      :style="floatingStyles"
    >
      <template #items>
        <MenuItem @select="choose(false)"
          ><template #icon><Files /></template>{{ workbookLabel }}</MenuItem
        >
        <MenuItem @select="choose(true)"
          ><template #icon><FolderOpen /></template>{{ localLabel }}</MenuItem
        >
      </template>
    </MenuSurface></Teleport
  >
</template>
<style scoped lang="scss">
.diagram-insert-menu {
  z-index: var(--sheetcraft-layer-menu);
}
</style>
