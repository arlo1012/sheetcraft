<script setup lang="ts">
import { ArrowDownAZ, ArrowUpAZ, ListFilter } from "lucide-vue-next";
import { computed, ref, useId } from "vue";
import { useAppI18n } from "../../../shared/i18n";
import MenuItem from "../../../shared/menu/MenuItem.vue";
import MenuSurface from "../../../shared/menu/MenuSurface.vue";
import RibbonMenuButton from "../../../shared/ribbon/RibbonMenuButton.vue";
import { useMenu } from "../../../shared/menu/useMenu";
const props = defineProps<{ disabled: boolean }>();
const emit = defineEmits<{ sort: [direction: "ascending" | "descending"]; custom: [] }>();
const { t } = useAppI18n();
const trigger = ref<InstanceType<typeof RibbonMenuButton> | null>(null);
const triggerRef = computed(() => trigger.value?.rootElement ?? null);
const surface = ref<InstanceType<typeof MenuSurface> | null>(null);
const id = `data-sort-${useId().replaceAll(":", "")}`;
const { open, floatingStyles, dismiss, toggleMenu, onTriggerKeydown } = useMenu({
  triggerRef,
  menuSurfaceRef: surface,
  disabled: computed(() => props.disabled),
});
function choose(direction: "ascending" | "descending"): void {
  emit("sort", direction);
  dismiss("programmatic", true);
}
function custom(): void {
  emit("custom");
  dismiss("programmatic", true);
}
</script>
<template>
  <span class="data-sort-tool"
    ><RibbonMenuButton
      ref="trigger"
      variant="tall"
      :label="t('dataTools.sort.title')"
      :text="t('dataTools.sort.title')"
      :disabled="disabled"
      data-data-action="sort"
      popup-role="menu"
      :expanded="open"
      :menu-id="id"
      @activate="toggleMenu"
      @keydown="onTriggerKeydown"
      ><ArrowDownAZ /></RibbonMenuButton
    ><Teleport to="body"
      ><MenuSurface
        v-if="open"
        :id="id"
        ref="surface"
        class="data-sort-tool__menu"
        :style="floatingStyles"
        :label="t('dataTools.sort.title')"
        ><MenuItem data-data-sort="ascending" @select="choose('ascending')"
          ><template #icon><ArrowUpAZ :size="15" /></template
          >{{ t("dataTools.sort.ascending") }}</MenuItem
        ><MenuItem data-data-sort="descending" @select="choose('descending')"
          ><template #icon><ArrowDownAZ :size="15" /></template
          >{{ t("dataTools.sort.descending") }}</MenuItem
        ><MenuItem data-data-sort="custom" @select="custom"
          ><template #icon><ListFilter :size="15" /></template
          >{{ t("dataTools.sort.custom") }}</MenuItem
        ></MenuSurface
      ></Teleport
    ></span
  >
</template>
<style scoped lang="scss">
.data-sort-tool {
  display: contents;
  &__menu {
    position: fixed;
    z-index: 80;
    min-width: 170px;
  }
}
</style>
