<script setup lang="ts">
import { Filter, ListFilter } from "lucide-vue-next";
import { computed, ref, useId } from "vue";
import { useAppI18n } from "../../../shared/i18n";
import MenuItem from "../../../shared/menu/MenuItem.vue";
import MenuSurface from "../../../shared/menu/MenuSurface.vue";
import RibbonSplitButton from "../../../shared/ribbon/RibbonSplitButton.vue";
import { useMenu } from "../../../shared/menu/useMenu";
const props = defineProps<{ disabled: boolean; active: boolean }>();
const emit = defineEmits<{ toggle: []; advanced: [] }>();
const { t } = useAppI18n();
const split = ref<InstanceType<typeof RibbonSplitButton> | null>(null);
const triggerRef = computed(() => split.value?.menuElement ?? null);
const surface = ref<InstanceType<typeof MenuSurface> | null>(null);
const id = `data-filter-${useId().replaceAll(":", "")}`;
const { open, floatingStyles, dismiss, toggleMenu, onTriggerKeydown } = useMenu({
  triggerRef,
  menuSurfaceRef: surface,
  disabled: computed(() => props.disabled),
});
function choose(action: "toggle" | "advanced"): void {
  if (action === "toggle") emit("toggle");
  else emit("advanced");
  dismiss("programmatic", true);
}
</script>
<template>
  <span class="data-filter-tool"
    ><RibbonSplitButton
      ref="split"
      variant="tall"
      :label="t('dataTools.filter.toggle')"
      :menu-label="t('dataTools.filter.toggle')"
      :text="t('dataTools.filter.toggle')"
      :disabled="disabled"
      :pressed="active"
      :menu-disabled="disabled"
      :expanded="open"
      :menu-id="id"
      data-data-action="filter"
      @activate="emit('toggle')"
      @toggle-menu="toggleMenu"
      @menu-keydown="onTriggerKeydown"
      ><Filter /></RibbonSplitButton
    ><Teleport to="body"
      ><MenuSurface
        v-if="open"
        :id="id"
        ref="surface"
        class="data-filter-tool__menu"
        :style="floatingStyles"
        :label="t('dataTools.filter.toggle')"
        ><MenuItem data-data-filter="toggle" @select="choose('toggle')"
          ><template #icon><Filter :size="15" /></template
          >{{ t("dataTools.advanced.autoFilter") }}</MenuItem
        ><MenuItem data-data-filter="advanced" @select="choose('advanced')"
          ><template #icon><ListFilter :size="15" /></template
          >{{ t("dataTools.advanced.title") }}</MenuItem
        ></MenuSurface
      ></Teleport
    ></span
  >
</template>
<style scoped lang="scss">
.data-filter-tool {
  display: contents;
  &__menu {
    position: fixed;
    z-index: 80;
  }
}
</style>
