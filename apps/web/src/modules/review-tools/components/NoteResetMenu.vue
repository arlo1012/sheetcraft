<script setup lang="ts">
import { RotateCcw } from "lucide-vue-next";
import { computed, ref, useId } from "vue";
import { useAppI18n } from "../../../shared/i18n";
import MenuItem from "../../../shared/menu/MenuItem.vue";
import MenuSurface from "../../../shared/menu/MenuSurface.vue";
import RibbonMenuButton from "../../../shared/ribbon/RibbonMenuButton.vue";
import { useMenu } from "../../../shared/menu/useMenu";

const props = defineProps<{ disabled: boolean }>();
const emit = defineEmits<{ reset: [mode: "position" | "size" | "all"] }>();
const { t } = useAppI18n();
const triggerComponentRef = ref<InstanceType<typeof RibbonMenuButton> | null>(null);
const triggerRef = computed(() => triggerComponentRef.value?.rootElement ?? null);
const menuSurfaceRef = ref<InstanceType<typeof MenuSurface> | null>(null);
const menuId = `reset-note-${useId().replaceAll(":", "")}`;
const { open, floatingStyles, dismiss, toggleMenu, onTriggerKeydown } = useMenu({
  triggerRef,
  menuSurfaceRef,
  disabled: computed(() => props.disabled),
});
function select(mode: "position" | "size" | "all"): void {
  emit("reset", mode);
  dismiss("programmatic", true);
}
</script>

<template>
  <span class="note-menu-tool">
    <RibbonMenuButton
      ref="triggerComponentRef"
      :label="t('review.resetNote')"
      :text="t('review.resetNote')"
      :disabled="disabled"
      :expanded="open"
      :menu-id="menuId"
      data-review-action="reset-note"
      @activate="toggleMenu"
      @keydown="onTriggerKeydown"
      ><RotateCcw
    /></RibbonMenuButton>
    <Teleport to="body">
      <MenuSurface
        v-if="open"
        :id="menuId"
        ref="menuSurfaceRef"
        class="note-menu"
        :style="floatingStyles"
        :label="t('review.resetNote')"
      >
        <MenuItem data-review-action="reset-note-position" @select="select('position')">{{
          t("review.resetNotePosition")
        }}</MenuItem>
        <MenuItem data-review-action="reset-note-size" @select="select('size')">{{
          t("review.resetNoteSize")
        }}</MenuItem>
        <MenuItem data-review-action="reset-note-box" @select="select('all')">{{
          t("review.resetNoteBox")
        }}</MenuItem>
      </MenuSurface>
    </Teleport>
  </span>
</template>

<style scoped lang="scss">
@use "../../../shared/ribbon/ribbon-layout" as ribbon;
.note-menu-tool {
  @include ribbon.tool;
}
.note-menu {
  z-index: var(--sheetcraft-layer-menu);
}
</style>
