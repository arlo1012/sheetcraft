<script setup lang="ts">
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Copy } from "lucide-vue-next";
import type { FillDirection } from "@idea10/sheet-engine/fill-selection";
import { computed, ref, useId } from "vue";
import { useAppI18n } from "../../../shared/i18n";
import MenuItem from "../../../shared/menu/MenuItem.vue";
import MenuSurface from "../../../shared/menu/MenuSurface.vue";
import { useMenu } from "../../../shared/menu/useMenu";
import RibbonMenuButton from "../../../shared/ribbon/RibbonMenuButton.vue";

const props = defineProps<{ disabled: boolean; canFillRows: boolean; canFillColumns: boolean }>();
const emit = defineEmits<{ fill: [direction: FillDirection] }>();
const { t } = useAppI18n();
const trigger = ref<InstanceType<typeof RibbonMenuButton> | null>(null);
const triggerRef = computed(() => trigger.value?.rootElement ?? null);
const surface = ref<InstanceType<typeof MenuSurface> | null>(null);
const menuId = `data-fill-${useId().replaceAll(":", "")}`;
const unavailable = computed(() => props.disabled || (!props.canFillRows && !props.canFillColumns));
const { open, floatingStyles, dismiss, toggleMenu, onTriggerKeydown } = useMenu({
  triggerRef,
  menuSurfaceRef: surface,
  disabled: unavailable,
});

function choose(direction: FillDirection): void {
  if (unavailable.value) return;
  if (direction === "down" || direction === "up" ? !props.canFillRows : !props.canFillColumns)
    return;
  dismiss("programmatic", false);
  emit("fill", direction);
}
</script>

<template>
  <div class="data-fill-tool">
    <RibbonMenuButton
      ref="trigger"
      variant="tall"
      :disabled="unavailable"
      :label="t('dataTools.fill.title')"
      :text="t('dataTools.fill.title')"
      data-data-action="fill"
      popup-role="menu"
      :expanded="open"
      :menu-id="menuId"
      @activate="toggleMenu"
      @keydown="onTriggerKeydown"
      ><Copy :size="18"
    /></RibbonMenuButton>
    <Teleport to="body">
      <MenuSurface
        v-if="open"
        :id="menuId"
        ref="surface"
        class="data-fill-tool__menu"
        :style="floatingStyles"
        :label="t('dataTools.fill.title')"
      >
        <MenuItem data-data-fill="down" :disabled="!canFillRows" @select="choose('down')">
          <template #icon><ArrowDown :size="15" /></template>
          {{ t("dataTools.fill.down") }}
        </MenuItem>
        <MenuItem data-data-fill="right" :disabled="!canFillColumns" @select="choose('right')">
          <template #icon><ArrowRight :size="15" /></template>
          {{ t("dataTools.fill.right") }}
        </MenuItem>
        <MenuItem data-data-fill="up" :disabled="!canFillRows" @select="choose('up')">
          <template #icon><ArrowUp :size="15" /></template>
          {{ t("dataTools.fill.up") }}
        </MenuItem>
        <MenuItem data-data-fill="left" :disabled="!canFillColumns" @select="choose('left')">
          <template #icon><ArrowLeft :size="15" /></template>
          {{ t("dataTools.fill.left") }}
        </MenuItem>
      </MenuSurface>
    </Teleport>
  </div>
</template>

<style scoped lang="scss">
.data-fill-tool {
  display: contents;

  &__menu {
    position: fixed;
    z-index: 80;
    min-width: 150px;
  }
}
</style>
