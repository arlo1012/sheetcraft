<script setup lang="ts">
import { computed, ref, useId, watch } from "vue";
import {
  PanelsTopLeft,
  SquareCheck,
  CircleDot,
  List,
  ListFilter,
  ChevronsUpDown,
  SlidersHorizontal,
  RectangleHorizontal,
  Type,
  SquareDashed,
} from "lucide-vue-next";
import type { FormControlType } from "@sheetcraft/core/form-controls";
import { useAppI18n } from "../../../shared/i18n";
import MenuItem from "../../../shared/menu/MenuItem.vue";
import MenuSurface from "../../../shared/menu/MenuSurface.vue";
import { useMenu } from "../../../shared/menu/useMenu";
import RibbonMenuButton from "../../../shared/ribbon/RibbonMenuButton.vue";

const props = defineProps<{ disabled: boolean; ownerId?: string | number }>();
const emit = defineEmits<{ insert: [type: FormControlType] }>();
const { t } = useAppI18n();
const button = ref<InstanceType<typeof RibbonMenuButton>>();
const surface = ref<InstanceType<typeof MenuSurface>>();
const menuId = `form-control-insert-${useId().replaceAll(":", "")}`;
const { open, floatingStyles, dismiss, toggleMenu, onTriggerKeydown } = useMenu({
  triggerRef: computed(() => button.value?.rootElement ?? null),
  menuSurfaceRef: computed(() => surface.value ?? null),
  disabled: computed(() => props.disabled),
});
function insert(type: FormControlType): void {
  if (props.disabled) return;
  dismiss("programmatic", false);
  emit("insert", type);
}
watch(
  () => props.ownerId,
  () => dismiss("programmatic", false),
);
</script>

<template>
  <span class="form-control-insert">
    <RibbonMenuButton
      ref="button"
      variant="tall"
      :label="t('control.title')"
      :text="t('control.title')"
      :disabled="disabled"
      :expanded="open"
      :menu-id="menuId"
      data-insert-tool="control"
      @activate="toggleMenu"
      @keydown="onTriggerKeydown"
      ><PanelsTopLeft
    /></RibbonMenuButton>
    <Teleport to="body">
      <MenuSurface
        v-if="open"
        :id="menuId"
        ref="surface"
        :label="t('control.title')"
        :style="floatingStyles"
        class="form-control-insert__menu"
      >
        <template #items>
          <MenuItem @select="insert('checkbox')"
            ><template #icon><SquareCheck /></template>{{ t("control.checkbox") }}</MenuItem
          >
          <MenuItem @select="insert('radio')"
            ><template #icon><CircleDot /></template>{{ t("control.radio") }}</MenuItem
          >
          <MenuItem @select="insert('combo')"
            ><template #icon><ListFilter /></template>{{ t("control.combo") }}</MenuItem
          >
          <MenuItem @select="insert('list')"
            ><template #icon><List /></template>{{ t("control.list") }}</MenuItem
          >
          <MenuItem @select="insert('spinner')"
            ><template #icon><ChevronsUpDown /></template>{{ t("control.spinner") }}</MenuItem
          >
          <MenuItem @select="insert('scrollbar')"
            ><template #icon><SlidersHorizontal /></template>{{ t("control.scrollbar") }}</MenuItem
          >
          <MenuItem @select="insert('button')"
            ><template #icon><RectangleHorizontal /></template>{{ t("control.button") }}</MenuItem
          >
          <MenuItem @select="insert('label')"
            ><template #icon><Type /></template>{{ t("control.label") }}</MenuItem
          >
          <MenuItem @select="insert('group')"
            ><template #icon><SquareDashed /></template>{{ t("control.group") }}</MenuItem
          >
        </template>
      </MenuSurface>
    </Teleport>
  </span>
</template>

<style scoped lang="scss">
@use "../../../shared/ribbon/ribbon-layout" as ribbon;
.form-control-insert {
  @include ribbon.tool;
  &__menu {
    z-index: var(--sheetcraft-layer-menu);
  }
}
</style>
