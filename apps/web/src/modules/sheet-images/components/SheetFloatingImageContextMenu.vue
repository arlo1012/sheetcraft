<script setup lang="ts">
import { computed, nextTick, onMounted, ref } from "vue";
import type { FloatingReference } from "../../../shared/floating/useFloatingPanel";
import { useDismissibleFloatingPanel } from "../../../shared/floating/useDismissibleFloatingPanel";
import { useAppI18n } from "../../../shared/i18n";
import MenuItem from "../../../shared/menu/MenuItem.vue";
import MenuSurface from "../../../shared/menu/MenuSurface.vue";

const props = defineProps<{ anchor: FloatingReference }>();
const emit = defineEmits<{
  convertToCell: [];
  delete: [];
  close: [restoreFocus: boolean];
}>();

const { t } = useAppI18n();
const menuSurfaceRef = ref<InstanceType<typeof MenuSurface> | null>(null);
const menuRef = computed<HTMLElement | null>(() => menuSurfaceRef.value?.rootElement ?? null);
const menuAnchor = computed(() => props.anchor);
const menuOpen = computed(() => true);
const { floatingStyles } = useDismissibleFloatingPanel(menuAnchor, menuRef, menuOpen, {
  offset: 4,
  onDismiss: ({ restoreFocus }) => emit("close", restoreFocus),
});

onMounted(() => void nextTick(() => menuSurfaceRef.value?.focusFirstItem()));
</script>

<template>
  <Teleport to="body">
    <MenuSurface
      ref="menuSurfaceRef"
      class="sheet-floating-image-context-menu"
      :style="floatingStyles"
      :label="t('image.contextMenuActions')"
      @click.stop
      @keydown.stop
      @contextmenu.prevent.stop
    >
      <MenuItem data-floating-image-action="convert-to-cell" @select="emit('convertToCell')">
        {{ t("image.convertToCell") }}
      </MenuItem>
      <MenuItem danger data-floating-image-action="delete" @select="emit('delete')">
        {{ t("image.deleteImage") }}
      </MenuItem>
    </MenuSurface>
  </Teleport>
</template>

<style scoped lang="scss">
.sheet-floating-image-context-menu {
  z-index: 100;
  width: 208px;
}
</style>
