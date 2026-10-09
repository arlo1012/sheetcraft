<script setup lang="ts">
import { Languages } from "lucide-vue-next";
import { computed, ref, useId } from "vue";
import { useAppI18n } from "../../../shared/i18n";
import MenuItem from "../../../shared/menu/MenuItem.vue";
import MenuSurface from "../../../shared/menu/MenuSurface.vue";
import RibbonSplitButton from "../../../shared/ribbon/RibbonSplitButton.vue";
import { useMenu } from "../../../shared/menu/useMenu";

const props = defineProps<{ disabled: boolean; mode: "to-simplified" | "to-traditional" }>();
const emit = defineEmits<{ convert: [scope: "sheet" | "workbook"] }>();
const { t } = useAppI18n();
const label = computed(() =>
  t(props.mode === "to-traditional" ? "review.toTraditional" : "review.toSimplified"),
);
const triggerComponentRef = ref<InstanceType<typeof RibbonSplitButton> | null>(null);
const triggerRef = computed(() => triggerComponentRef.value?.menuElement ?? null);
const menuSurfaceRef = ref<InstanceType<typeof MenuSurface> | null>(null);
const menuId = `text-conversion-${useId().replaceAll(":", "")}`;
const { open, floatingStyles, dismiss, toggleMenu, onTriggerKeydown } = useMenu({
  triggerRef,
  menuSurfaceRef,
  disabled: computed(() => props.disabled),
});
function select(scope: "sheet" | "workbook"): void {
  emit("convert", scope);
  dismiss("programmatic", true);
}
</script>

<template>
  <span class="text-conversion-tool">
    <RibbonSplitButton
      ref="triggerComponentRef"
      :label="label"
      :text="label"
      :menu-label="`${label} · ${t('review.conversionScope')}`"
      :menu-disabled="disabled"
      :disabled="disabled"
      :expanded="open"
      :menu-id="menuId"
      @activate="select('sheet')"
      @toggle-menu="toggleMenu"
      @menu-keydown="onTriggerKeydown"
      ><Languages
    /></RibbonSplitButton>
    <Teleport to="body">
      <MenuSurface
        v-if="open"
        :id="menuId"
        ref="menuSurfaceRef"
        class="text-conversion-menu"
        :style="floatingStyles"
        :label="label"
      >
        <MenuItem @select="select('sheet')">{{ t("review.scopeSheet") }}</MenuItem>
        <MenuItem @select="select('workbook')">{{ t("review.scopeWorkbook") }}</MenuItem>
      </MenuSurface>
    </Teleport>
  </span>
</template>

<style scoped lang="scss">
@use "../../../shared/ribbon/ribbon-layout" as ribbon;
.text-conversion-tool {
  @include ribbon.tool;
}
.text-conversion-menu {
  z-index: var(--sheetcraft-layer-menu);
}
</style>
