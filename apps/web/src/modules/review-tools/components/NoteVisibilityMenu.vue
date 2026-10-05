<script setup lang="ts">
import { MessageSquareText } from "lucide-vue-next";
import { computed, ref, useId } from "vue";
import { useAppI18n } from "../../../shared/i18n";
import MenuItem from "../../../shared/menu/MenuItem.vue";
import MenuSurface from "../../../shared/menu/MenuSurface.vue";
import RibbonMenuButton from "../../../shared/ribbon/RibbonMenuButton.vue";
import { useMenu } from "../../../shared/menu/useMenu";

const props = defineProps<{ disabled: boolean; hasNote: boolean; showActiveNote: boolean }>();
const emit = defineEmits<{ toggle: []; showAll: []; hideAll: [] }>();
const { t } = useAppI18n();
const triggerComponentRef = ref<InstanceType<typeof RibbonMenuButton> | null>(null);
const triggerRef = computed(() => triggerComponentRef.value?.rootElement ?? null);
const menuSurfaceRef = ref<InstanceType<typeof MenuSurface> | null>(null);
const menuId = `note-visibility-${useId().replaceAll(":", "")}`;
const { open, floatingStyles, dismiss, toggleMenu, onTriggerKeydown } = useMenu({
  triggerRef,
  menuSurfaceRef,
  disabled: computed(() => props.disabled),
});
function select(action: "toggle" | "showAll" | "hideAll"): void {
  if (action === "toggle") emit("toggle");
  else if (action === "showAll") emit("showAll");
  else emit("hideAll");
  dismiss("programmatic", true);
}
</script>

<template>
  <span class="note-menu-tool">
    <RibbonMenuButton
      ref="triggerComponentRef"
      :label="t('review.noteVisibility')"
      :text="t('review.noteVisibility')"
      :disabled="disabled"
      :expanded="open"
      :menu-id="menuId"
      data-review-action="note-visibility"
      @activate="toggleMenu"
      @keydown="onTriggerKeydown"
      ><MessageSquareText
    /></RibbonMenuButton>
    <Teleport to="body">
      <MenuSurface
        v-if="open"
        :id="menuId"
        ref="menuSurfaceRef"
        class="note-menu"
        :style="floatingStyles"
        :label="t('review.noteVisibility')"
      >
        <MenuItem
          :disabled="!hasNote"
          data-review-action="toggle-note"
          @select="select('toggle')"
          >{{ t(showActiveNote ? "review.hideNotes" : "review.showNotes") }}</MenuItem
        >
        <MenuItem data-review-action="show-all-notes" @select="select('showAll')">{{
          t("review.showAllNotes")
        }}</MenuItem>
        <MenuItem data-review-action="hide-all-notes" @select="select('hideAll')">{{
          t("review.hideAllNotes")
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
  z-index: var(--idea-layer-menu);
}
</style>
