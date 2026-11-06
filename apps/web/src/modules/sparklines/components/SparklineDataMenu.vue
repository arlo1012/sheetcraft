<script setup lang="ts">
import { computed, ref, useId, watch } from "vue";
import { Database, Pencil, Settings2 } from "lucide-vue-next";
import type { SparklineToolContext } from "../useSparklineTools";
import { useAppI18n } from "../../../shared/i18n";
import RibbonMenuButton from "../../../shared/ribbon/RibbonMenuButton.vue";
import MenuSurface from "../../../shared/menu/MenuSurface.vue";
import MenuItem from "../../../shared/menu/MenuItem.vue";
import { useMenu } from "../../../shared/menu/useMenu";

const props = defineProps<{ context: SparklineToolContext }>();
const emit = defineEmits<{ dataOptions: [] }>();
const { t } = useAppI18n();
const button = ref<InstanceType<typeof RibbonMenuButton>>();
const surface = ref<InstanceType<typeof MenuSurface>>();
const menuId = `sparkline-data-${useId()}`;
let owner: SparklineToolContext | undefined;
const { open, floatingStyles, dismiss, toggleMenu, onTriggerKeydown } = useMenu({
  triggerRef: computed(() => button.value?.rootElement ?? null),
  menuSurfaceRef: computed(() => surface.value ?? null),
  disabled: computed(() => props.context.disabled),
  onOpen: () => {
    owner = props.context;
  },
  onDismiss: () => {
    owner = undefined;
  },
});
watch(
  () => props.context,
  () => {
    if (open.value) dismiss("programmatic", false);
  },
  { flush: "sync" },
);
function select(action: "edit" | "dataOptions"): void {
  if (!open.value || props.context.disabled || owner !== props.context) return;
  const target = owner;
  dismiss("programmatic", false);
  if (action === "edit") target.edit();
  else emit("dataOptions");
}
</script>

<template>
  <span class="sparkline-data-menu">
    <RibbonMenuButton
      ref="button"
      variant="tall"
      :label="t('sparkline.editData')"
      :text="t('sparkline.editData')"
      :disabled="context.disabled"
      :expanded="open"
      :menu-id="menuId"
      @activate="toggleMenu"
      @keydown="onTriggerKeydown"
      ><Database
    /></RibbonMenuButton>
    <Teleport to="body">
      <MenuSurface
        v-if="open"
        :id="menuId"
        ref="surface"
        :label="t('sparkline.editData')"
        :style="floatingStyles"
        class="sparkline-data-menu__surface"
      >
        <template #items>
          <MenuItem @select="select('edit')">
            <template #icon><Pencil /></template>{{ t("sparkline.editSingleData") }}
          </MenuItem>
          <MenuItem @select="select('dataOptions')">
            <template #icon><Settings2 /></template>{{ t("sparkline.dataOptions") }}
          </MenuItem>
        </template>
      </MenuSurface>
    </Teleport>
  </span>
</template>

<style scoped lang="scss">
@use "../../../shared/ribbon/ribbon-layout" as ribbon;
.sparkline-data-menu {
  @include ribbon.tool;
}
.sparkline-data-menu__surface {
  z-index: var(--sheetcraft-layer-menu);
}
</style>
