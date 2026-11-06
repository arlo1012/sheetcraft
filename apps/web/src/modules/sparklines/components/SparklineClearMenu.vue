<script setup lang="ts">
import { computed, ref, useId, watch } from "vue";
import { Eraser, Group } from "lucide-vue-next";
import type { SparklineToolContext } from "../useSparklineTools";
import { useAppI18n } from "../../../shared/i18n";
import RibbonMenuButton from "../../../shared/ribbon/RibbonMenuButton.vue";
import MenuSurface from "../../../shared/menu/MenuSurface.vue";
import MenuItem from "../../../shared/menu/MenuItem.vue";
import { useMenu } from "../../../shared/menu/useMenu";

const props = defineProps<{ context: SparklineToolContext }>();
const emit = defineEmits<{ failed: [] }>();
const { t } = useAppI18n();
const button = ref<InstanceType<typeof RibbonMenuButton>>();
const surface = ref<InstanceType<typeof MenuSurface>>();
const menuId = `sparkline-clear-${useId()}`;
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
function select(action: "selected" | "group"): void {
  if (!open.value || props.context.disabled || owner !== props.context) return;
  const target = owner;
  dismiss("programmatic", false);
  if (!(action === "selected" ? target.clear() : target.clearGroup())) emit("failed");
}
</script>

<template>
  <span class="sparkline-clear-menu">
    <RibbonMenuButton
      ref="button"
      variant="tall"
      :label="t('sparkline.remove')"
      :text="t('sparkline.remove')"
      :disabled="context.disabled"
      :expanded="open"
      :menu-id="menuId"
      @activate="toggleMenu"
      @keydown="onTriggerKeydown"
      ><Eraser
    /></RibbonMenuButton>
    <Teleport to="body">
      <MenuSurface
        v-if="open"
        :id="menuId"
        ref="surface"
        :label="t('sparkline.remove')"
        :style="floatingStyles"
        class="sparkline-clear-menu__surface"
      >
        <template #items>
          <MenuItem @select="select('selected')">
            <template #icon><Eraser /></template>{{ t("sparkline.remove") }}
          </MenuItem>
          <MenuItem @select="select('group')">
            <template #icon><Group /></template>{{ t("sparkline.clearGroup") }}
          </MenuItem>
        </template>
      </MenuSurface>
    </Teleport>
  </span>
</template>

<style scoped lang="scss">
@use "../../../shared/ribbon/ribbon-layout" as ribbon;
.sparkline-clear-menu {
  @include ribbon.tool;
}
.sparkline-clear-menu__surface {
  z-index: var(--sheetcraft-layer-menu);
}
</style>
