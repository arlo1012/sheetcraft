<script setup lang="ts">
import { computed, nextTick, onMounted, ref } from "vue";
import type { FloatingReference } from "../floating/useFloatingPanel";
import { useDismissibleFloatingPanel } from "../floating/useDismissibleFloatingPanel";
import MenuItem from "../menu/MenuItem.vue";
import MenuSurface from "../menu/MenuSurface.vue";

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
const { floatingStyles } = useDismissibleFloatingPanel(anchor, surfaceElement, open, {
  offset: 4,
  onDismiss: ({ restoreFocus }) => emit("close", restoreFocus),
});

onMounted(() => void nextTick(() => surfaceRef.value?.focusFirstItem()));

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
  z-index: 100;
}
</style>
