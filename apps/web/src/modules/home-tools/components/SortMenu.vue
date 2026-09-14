<script setup lang="ts">
import { ArrowDownAZ, ArrowUpAZ } from "lucide-vue-next";
import { computed, ref, useId } from "vue";
import { useAppI18n } from "../../../shared/i18n";
import MenuItem from "../../../shared/menu/MenuItem.vue";
import MenuSurface from "../../../shared/menu/MenuSurface.vue";
import RibbonMenuButton from "../../../shared/ribbon/RibbonMenuButton.vue";
import { useMenu } from "../../../shared/menu/useMenu";

defineOptions({ inheritAttrs: false });

const props = defineProps<{ disabled: boolean }>();
const emit = defineEmits<{ sort: [direction: "ascending" | "descending"] }>();
const { t } = useAppI18n();
const triggerComponentRef = ref<InstanceType<typeof RibbonMenuButton> | null>(null);
const triggerRef = computed(() => triggerComponentRef.value?.rootElement ?? null);
const menuSurfaceRef = ref<InstanceType<typeof MenuSurface> | null>(null);
const menuId = `sort-menu-${useId().replaceAll(":", "")}`;
const { open, floatingStyles, dismiss, toggleMenu, onTriggerKeydown } = useMenu({
  triggerRef,
  menuSurfaceRef,
  disabled: computed(() => props.disabled),
});

function select(direction: "ascending" | "descending"): void {
  emit("sort", direction);
  dismiss("programmatic", true);
}
</script>

<template>
  <span v-bind="$attrs" class="ribbon-menu-tool">
    <RibbonMenuButton
      ref="triggerComponentRef"
      :label="t('ribbon.sort')"
      :disabled="disabled"
      data-ribbon-action="sort"
      popup-role="menu"
      :expanded="open"
      :menu-id="menuId"
      @activate="toggleMenu"
      @keydown="onTriggerKeydown"
    >
      <ArrowDownAZ :size="15" aria-hidden="true" />
    </RibbonMenuButton>

    <Teleport to="body">
      <MenuSurface
        v-if="open"
        :id="menuId"
        ref="menuSurfaceRef"
        class="sort-menu"
        :style="floatingStyles"
        :label="t('ribbon.sort')"
      >
        <MenuItem data-sort-direction="ascending" @select="select('ascending')">
          <template #icon><ArrowUpAZ :size="15" /></template>
          {{ t("ribbon.sortAscending") }}
        </MenuItem>
        <MenuItem data-sort-direction="descending" @select="select('descending')">
          <template #icon><ArrowDownAZ :size="15" /></template>
          {{ t("ribbon.sortDescending") }}
        </MenuItem>
      </MenuSurface>
    </Teleport>
  </span>
</template>

<style scoped lang="scss">
@use "../../../shared/ribbon/ribbon-layout" as ribbon;

.ribbon-menu-tool {
  @include ribbon.tool;
}

.sort-menu {
  position: fixed;
  z-index: 80;
  min-width: 168px;
}
</style>
