<script setup lang="ts">
import {
  CopyMinus,
  FileWarning,
  Highlighter,
  ListChecks,
  Settings,
  Trash2,
  XCircle,
} from "lucide-vue-next";
import { computed, ref, useId } from "vue";
import { useAppI18n } from "../../../shared/i18n";
import MenuItem from "../../../shared/menu/MenuItem.vue";
import MenuSeparator from "../../../shared/menu/MenuSeparator.vue";
import MenuSurface from "../../../shared/menu/MenuSurface.vue";
import { useMenu } from "../../../shared/menu/useMenu";
import RibbonMenuButton from "../../../shared/ribbon/RibbonMenuButton.vue";
import type { DuplicateToolMode } from "../duplicate-tools-types";

const props = defineProps<{ disabled: boolean; removeDuplicates: boolean }>();
const emit = defineEmits<{
  open: [mode: DuplicateToolMode];
  clearHighlights: [];
  clearRejections: [];
  remove: [];
  errorCheckOptions: [];
}>();
const { t } = useAppI18n();
const trigger = ref<InstanceType<typeof RibbonMenuButton> | null>(null);
const triggerRef = computed(() => trigger.value?.rootElement ?? null);
const surface = ref<InstanceType<typeof MenuSurface> | null>(null);
const menuId = `data-duplicates-${useId().replaceAll(":", "")}`;
const { open, floatingStyles, dismiss, toggleMenu, onTriggerKeydown } = useMenu({
  triggerRef,
  menuSurfaceRef: surface,
  disabled: computed(() => props.disabled),
});
function choose(mode: DuplicateToolMode): void {
  emit("open", mode);
  dismiss("programmatic", true);
}
function clearHighlights(): void {
  emit("clearHighlights");
  dismiss("programmatic", true);
}
function clearRejections(): void {
  emit("clearRejections");
  dismiss("programmatic", true);
}
function remove(): void {
  emit("remove");
  dismiss("programmatic", true);
}
function openErrorCheckOptions(): void {
  dismiss("programmatic", false);
  emit("errorCheckOptions");
}
</script>
<template>
  <div class="data-duplicates-tool">
    <RibbonMenuButton
      ref="trigger"
      variant="tall"
      :disabled="disabled"
      :label="t('dataTools.duplicates.title')"
      :text="t('dataTools.duplicates.title')"
      data-data-action="duplicates"
      popup-role="menu"
      :expanded="open"
      :menu-id="menuId"
      @activate="toggleMenu"
      @keydown="onTriggerKeydown"
      ><CopyMinus
    /></RibbonMenuButton>
    <Teleport to="body">
      <MenuSurface
        v-if="open"
        :id="menuId"
        ref="surface"
        class="data-duplicates-tool__menu"
        :style="floatingStyles"
        :label="t('dataTools.duplicates.title')"
      >
        <MenuItem data-data-duplicates="highlight" @select="choose('highlight')"
          ><template #icon><Highlighter :size="15" /></template
          >{{ t("dataTools.duplicates.highlight") }}</MenuItem
        >
        <MenuItem data-data-duplicates="clear-highlights" @select="clearHighlights"
          ><template #icon><XCircle :size="15" /></template
          >{{ t("dataTools.duplicates.clearHighlights") }}</MenuItem
        >
        <MenuItem data-data-duplicates="count" @select="choose('count')"
          ><template #icon><ListChecks :size="15" /></template
          >{{ t("dataTools.duplicates.count") }}</MenuItem
        >
        <MenuSeparator />
        <MenuItem data-data-duplicates="reject" @select="choose('reject')"
          ><template #icon><FileWarning :size="15" /></template
          >{{ t("dataTools.duplicates.reject") }}</MenuItem
        >
        <MenuItem data-data-duplicates="clear-rejections" @select="clearRejections"
          ><template #icon><XCircle :size="15" /></template
          >{{ t("dataTools.duplicates.clearRejections") }}</MenuItem
        >
        <MenuSeparator />
        <MenuItem
          data-data-duplicates="remove"
          :disabled="!removeDuplicates"
          danger
          @select="remove"
          ><template #icon><Trash2 :size="15" /></template
          >{{ t("dataTools.duplicates.remove") }}</MenuItem
        >
        <MenuSeparator />
        <MenuItem data-data-duplicates="error-options" @select="openErrorCheckOptions">
          <template #icon><Settings :size="15" /></template>
          {{ t("dataTools.duplicates.errorChecks.optionsLabel") }}
        </MenuItem>
      </MenuSurface>
    </Teleport>
  </div>
</template>
<style scoped lang="scss">
.data-duplicates-tool {
  display: contents;
  &__menu {
    position: fixed;
    z-index: 80;
    min-width: 190px;
  }
}
</style>
