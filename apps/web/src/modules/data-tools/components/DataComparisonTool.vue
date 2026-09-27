<script setup lang="ts">
import { CopyCheck, CopyPlus, GitCompareArrows, Highlighter, ListX } from "lucide-vue-next";
import { computed, ref, useId } from "vue";
import { useAppI18n } from "../../../shared/i18n";
import MenuItem from "../../../shared/menu/MenuItem.vue";
import MenuSurface from "../../../shared/menu/MenuSurface.vue";
import { useMenu } from "../../../shared/menu/useMenu";
import RibbonMenuButton from "../../../shared/ribbon/RibbonMenuButton.vue";
import type { DataComparisonAction } from "../data-comparison-types";

const props = defineProps<{ disabled: boolean }>();
const emit = defineEmits<{ open: [action: DataComparisonAction] }>();
const { t } = useAppI18n();
const trigger = ref<InstanceType<typeof RibbonMenuButton> | null>(null);
const triggerRef = computed(() => trigger.value?.rootElement ?? null);
const surface = ref<InstanceType<typeof MenuSurface> | null>(null);
const menuId = `data-comparison-${useId().replaceAll(":", "")}`;
const { open, floatingStyles, dismiss, toggleMenu, onTriggerKeydown } = useMenu({
  triggerRef,
  menuSurfaceRef: surface,
  disabled: computed(() => props.disabled),
});

function choose(action: DataComparisonAction): void {
  emit("open", action);
  dismiss("programmatic", true);
}
</script>

<template>
  <div class="data-comparison-tool">
    <RibbonMenuButton
      ref="trigger"
      variant="tall"
      :disabled="disabled"
      :label="t('dataTools.comparison.title')"
      :text="t('dataTools.comparison.title')"
      data-data-action="comparison"
      popup-role="menu"
      :expanded="open"
      :menu-id="menuId"
      @activate="toggleMenu"
      @keydown="onTriggerKeydown"
      ><GitCompareArrows
    /></RibbonMenuButton>
    <Teleport to="body">
      <MenuSurface
        v-if="open"
        :id="menuId"
        ref="surface"
        class="data-comparison-tool__menu"
        :style="floatingStyles"
        :label="t('dataTools.comparison.title')"
      >
        <MenuItem data-data-comparison="mark-duplicate" @select="choose('markDuplicate')"
          ><template #icon><Highlighter :size="15" /></template
          >{{ t("dataTools.comparison.markDuplicate") }}</MenuItem
        >
        <MenuItem data-data-comparison="extract-duplicate" @select="choose('extractDuplicate')"
          ><template #icon><CopyPlus :size="15" /></template
          >{{ t("dataTools.comparison.extractDuplicate") }}</MenuItem
        >
        <MenuItem data-data-comparison="mark-unique" @select="choose('markUnique')"
          ><template #icon><ListX :size="15" /></template
          >{{ t("dataTools.comparison.markUnique") }}</MenuItem
        >
        <MenuItem data-data-comparison="extract-unique" @select="choose('extractUnique')"
          ><template #icon><CopyCheck :size="15" /></template
          >{{ t("dataTools.comparison.extractUnique") }}</MenuItem
        >
      </MenuSurface>
    </Teleport>
  </div>
</template>

<style scoped lang="scss">
.data-comparison-tool {
  display: contents;

  &__menu {
    position: fixed;
    z-index: 80;
    min-width: 196px;
  }
}
</style>
