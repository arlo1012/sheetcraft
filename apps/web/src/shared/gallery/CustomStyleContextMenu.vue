<script setup lang="ts">
import { computed, ref } from "vue";
import type { FloatingReference } from "../floating/useFloatingPanel";
import MenuItem from "../menu/MenuItem.vue";
import MenuSurface from "../menu/MenuSurface.vue";
import { useContextMenu } from "../menu/useContextMenu";

const props = defineProps<{
  anchor: FloatingReference;
  label: string;
  editLabel: string;
  deleteLabel: string;
}>();
const emit = defineEmits<{
  edit: [];
  delete: [];
  close: [restoreFocus: boolean];
}>();
const surfaceRef = ref<InstanceType<typeof MenuSurface> | null>(null);
const surfaceElement = computed<HTMLElement | null>(() => surfaceRef.value?.rootElement ?? null);
const anchor = computed(() => props.anchor);
const open = computed(() => true);
const { floatingStyles } = useContextMenu({
  anchor,
  panelRef: surfaceElement,
  open,
  surfaceRef,
  offset: 4,
  onDismiss: ({ restoreFocus }) => emit("close", restoreFocus),
});

defineExpose({ rootElement: surfaceElement });
</script>

<template>
  <Teleport to="body">
    <MenuSurface
      ref="surfaceRef"
      class="custom-style-context-menu"
      :style="floatingStyles"
      :label="label"
      @click.stop
      @contextmenu.prevent.stop
    >
      <MenuItem data-custom-style-action="edit" @select="emit('edit')">{{ editLabel }}</MenuItem>
      <MenuItem danger data-custom-style-action="delete" @select="emit('delete')">
        {{ deleteLabel }}
      </MenuItem>
    </MenuSurface>
  </Teleport>
</template>

<style scoped lang="scss">
.custom-style-context-menu {
  z-index: var(--idea-layer-context-menu);
}
</style>
