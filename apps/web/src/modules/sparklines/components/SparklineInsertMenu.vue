<script setup lang="ts">
import { computed, ref, useId } from "vue";
import { Activity, ChartColumn, ChartNoAxesColumnIncreasing } from "lucide-vue-next";
import type { CellSparkline } from "@sheetcraft/core/sparklines";
import { useAppI18n } from "../../../shared/i18n";
import MenuItem from "../../../shared/menu/MenuItem.vue";
import MenuSurface from "../../../shared/menu/MenuSurface.vue";
import { useMenu } from "../../../shared/menu/useMenu";
import RibbonMenuButton from "../../../shared/ribbon/RibbonMenuButton.vue";

const props = defineProps<{ disabled: boolean }>();
const emit = defineEmits<{ insert: [type: CellSparkline["type"]] }>();
const { t } = useAppI18n();
const button = ref<InstanceType<typeof RibbonMenuButton>>();
const surface = ref<InstanceType<typeof MenuSurface>>();
const menuId = `sparkline-insert-${useId().replaceAll(":", "")}`;
const { open, floatingStyles, dismiss, toggleMenu, onTriggerKeydown } = useMenu({
  triggerRef: computed(() => button.value?.rootElement ?? null),
  menuSurfaceRef: computed(() => surface.value ?? null),
  disabled: computed(() => props.disabled),
});
function insert(type: CellSparkline["type"]): void {
  if (props.disabled) return;
  dismiss("programmatic", false);
  emit("insert", type);
}
</script>

<template>
  <span class="sparkline-insert-tool">
    <RibbonMenuButton
      ref="button"
      variant="tall"
      :label="t('sparkline.title')"
      :text="t('sparkline.title')"
      :disabled="disabled"
      :expanded="open"
      :menu-id="menuId"
      popup-role="menu"
      data-insert-tool="sparkline"
      @activate="toggleMenu"
      @keydown="onTriggerKeydown"
      ><Activity aria-hidden="true" />
    </RibbonMenuButton>
    <Teleport to="body">
      <MenuSurface
        v-if="open"
        :id="menuId"
        ref="surface"
        class="sparkline-insert-menu"
        :style="floatingStyles"
        :label="t('sparkline.title')"
      >
        <template #items>
          <MenuItem data-sparkline-type="line" @select="insert('line')">
            <template #icon><Activity /></template>{{ t("chart.line") }}
          </MenuItem>
          <MenuItem data-sparkline-type="column" @select="insert('column')">
            <template #icon><ChartColumn /></template>{{ t("chart.column") }}
          </MenuItem>
          <MenuItem data-sparkline-type="winLoss" @select="insert('winLoss')">
            <template #icon><ChartNoAxesColumnIncreasing /></template>{{ t("sparkline.winLoss") }}
          </MenuItem>
        </template>
      </MenuSurface>
    </Teleport>
  </span>
</template>

<style scoped lang="scss">
@use "../../../shared/ribbon/ribbon-layout" as ribbon;
.sparkline-insert-tool {
  @include ribbon.tool;
}
.sparkline-insert-menu {
  z-index: var(--sheetcraft-layer-menu);
}
</style>
