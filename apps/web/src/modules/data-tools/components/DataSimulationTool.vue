<script setup lang="ts">
import { Calculator, Target, Table2 } from "lucide-vue-next";
import { computed, ref, useId } from "vue";
import { useAppI18n } from "../../../shared/i18n";
import MenuItem from "../../../shared/menu/MenuItem.vue";
import MenuSurface from "../../../shared/menu/MenuSurface.vue";
import { useMenu } from "../../../shared/menu/useMenu";
import RibbonMenuButton from "../../../shared/ribbon/RibbonMenuButton.vue";
import type { SimulationMessageKey } from "../simulation-messages";

const props = defineProps<{ disabled: boolean }>();
const emit = defineEmits<{ goalSeek: []; planning: []; dataTable: [] }>();
const { t } = useAppI18n();
const tr = (key: SimulationMessageKey) => t(key as never);
const trigger = ref<InstanceType<typeof RibbonMenuButton> | null>(null);
const surface = ref<InstanceType<typeof MenuSurface> | null>(null);
const triggerRef = computed(() => trigger.value?.rootElement ?? null);
const menuId = `data-simulation-${useId().replaceAll(":", "")}`;
const { open, floatingStyles, dismiss, toggleMenu, onTriggerKeydown } = useMenu({
  triggerRef,
  menuSurfaceRef: surface,
  disabled: computed(() => props.disabled),
});
function choose(kind: "goalSeek" | "planning" | "dataTable") {
  if (kind === "goalSeek") emit("goalSeek");
  else if (kind === "planning") emit("planning");
  else emit("dataTable");
  dismiss("programmatic", true);
}
</script>
<template>
  <div class="data-simulation-tool">
    <RibbonMenuButton
      ref="trigger"
      variant="tall"
      :disabled="disabled"
      :label="tr('simulation.title')"
      :text="tr('simulation.title')"
      data-data-action="simulation"
      popup-role="menu"
      :expanded="open"
      :menu-id="menuId"
      @activate="toggleMenu"
      @keydown="onTriggerKeydown"
      ><Calculator
    /></RibbonMenuButton>
    <Teleport to="body"
      ><MenuSurface
        v-if="open"
        :id="menuId"
        ref="surface"
        class="data-simulation-tool__menu"
        :style="floatingStyles"
        :label="tr('simulation.title')"
      >
        <MenuItem data-data-simulation="goal-seek" @select="choose('goalSeek')"
          ><template #icon><Target /></template>{{ tr("simulation.goalSeek") }}</MenuItem
        >
        <MenuItem data-data-simulation="planning" @select="choose('planning')"
          ><template #icon><Calculator /></template>{{ tr("simulation.planning") }}</MenuItem
        >
        <MenuItem data-data-simulation="data-table" @select="choose('dataTable')">
          <template #icon><Table2 /></template>{{ t("dataTable.title") }}
        </MenuItem>
      </MenuSurface></Teleport
    >
  </div>
</template>
<style scoped lang="scss">
.data-simulation-tool {
  display: contents;
  &__menu {
    z-index: var(--idea-layer-menu);
  }
}
</style>
