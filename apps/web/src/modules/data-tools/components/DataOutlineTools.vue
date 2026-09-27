<script setup lang="ts">
import { Columns3, Rows3, ListPlus, ListX } from "lucide-vue-next";
import { computed, ref, useId } from "vue";
import { useAppI18n } from "../../../shared/i18n";
import MenuItem from "../../../shared/menu/MenuItem.vue";
import MenuSurface from "../../../shared/menu/MenuSurface.vue";
import RibbonMenuButton from "../../../shared/ribbon/RibbonMenuButton.vue";
import { useMenu } from "../../../shared/menu/useMenu";
import OutlineUngroupDialog from "./OutlineUngroupDialog.vue";

const props = defineProps<{
  disabled: boolean;
  ungroupRows: boolean;
  ungroupColumns: boolean;
  clearOutline: boolean;
}>();
const emit = defineEmits<{
  group: [axis: "rows" | "columns"];
  ungroup: [axis: "rows" | "columns"];
  clearOutline: [];
}>();
const { t } = useAppI18n();
const groupTrigger = ref<InstanceType<typeof RibbonMenuButton> | null>(null);
const groupTriggerRef = computed(() => groupTrigger.value?.rootElement ?? null);
const groupSurface = ref<InstanceType<typeof MenuSurface> | null>(null);
const groupId = `data-group-${useId().replaceAll(":", "")}`;
const {
  open: groupOpen,
  floatingStyles: groupFloatingStyles,
  dismiss: dismissGroup,
  toggleMenu: toggleGroupMenu,
  onTriggerKeydown: onGroupKeydown,
} = useMenu({
  triggerRef: groupTriggerRef,
  menuSurfaceRef: groupSurface,
  disabled: computed(() => props.disabled),
});
const ungroupTrigger = ref<InstanceType<typeof RibbonMenuButton> | null>(null);
const ungroupTriggerRef = computed(() => ungroupTrigger.value?.rootElement ?? null);
const ungroupSurface = ref<InstanceType<typeof MenuSurface> | null>(null);
const ungroupId = `data-ungroup-${useId().replaceAll(":", "")}`;
const ungroupDisabled = computed(
  () => props.disabled || (!props.ungroupRows && !props.ungroupColumns && !props.clearOutline),
);
const canUngroup = computed(() => props.ungroupRows || props.ungroupColumns);
const ungroupDialogVisible = ref(false);
const {
  open: ungroupOpen,
  floatingStyles: ungroupFloatingStyles,
  dismiss: dismissUngroup,
  toggleMenu: toggleUngroupMenu,
  onTriggerKeydown: onUngroupKeydown,
} = useMenu({
  triggerRef: ungroupTriggerRef,
  menuSurfaceRef: ungroupSurface,
  disabled: ungroupDisabled,
});
function chooseGroup(axis: "rows" | "columns"): void {
  emit("group", axis);
  dismissGroup("programmatic", true);
}
function chooseUngroup(axis: "rows" | "columns"): void {
  emit("ungroup", axis);
  ungroupDialogVisible.value = false;
}
function openUngroupDialog(): void {
  if (!canUngroup.value) return;
  ungroupDialogVisible.value = true;
  dismissUngroup("programmatic", true);
}
function onClearOutline(): void {
  if (props.disabled || !props.clearOutline) return;
  emit("clearOutline");
  dismissUngroup("programmatic", true);
}
</script>
<template>
  <div class="data-outline-tools">
    <RibbonMenuButton
      ref="groupTrigger"
      variant="tall"
      :label="t('dataTools.outline.group')"
      :text="t('dataTools.outline.group')"
      :disabled="disabled"
      data-data-action="group"
      popup-role="menu"
      :expanded="groupOpen"
      :menu-id="groupId"
      @activate="toggleGroupMenu"
      @keydown="onGroupKeydown"
      ><ListPlus :size="18" /></RibbonMenuButton
    ><RibbonMenuButton
      ref="ungroupTrigger"
      variant="tall"
      :label="t('dataTools.outline.ungroup')"
      :text="t('dataTools.outline.ungroup')"
      :disabled="ungroupDisabled"
      data-data-action="ungroup"
      popup-role="menu"
      :expanded="ungroupOpen"
      :menu-id="ungroupId"
      @activate="toggleUngroupMenu"
      @keydown="onUngroupKeydown"
      ><ListX :size="18" /></RibbonMenuButton
    ><Teleport to="body"
      ><MenuSurface
        v-if="groupOpen"
        :id="groupId"
        ref="groupSurface"
        class="data-outline-tools__menu"
        :style="groupFloatingStyles"
        :label="t('dataTools.outline.group')"
        ><MenuItem data-data-group="rows" @select="chooseGroup('rows')"
          ><template #icon><Rows3 :size="15" /></template
          >{{ t("dataTools.outline.rows") }}</MenuItem
        ><MenuItem data-data-group="columns" @select="chooseGroup('columns')"
          ><template #icon><Columns3 :size="15" /></template
          >{{ t("dataTools.outline.columns") }}</MenuItem
        ></MenuSurface
      ><MenuSurface
        v-if="ungroupOpen"
        :id="ungroupId"
        ref="ungroupSurface"
        class="data-outline-tools__menu"
        :style="ungroupFloatingStyles"
        :label="t('dataTools.outline.ungroup')"
        ><MenuItem data-data-ungroup :disabled="disabled || !canUngroup" @select="openUngroupDialog"
          ><template #icon><ListX :size="15" /></template
          >{{ t("dataTools.outline.ungroupMenuItem") }}</MenuItem
        ><MenuItem
          data-data-clear-outline
          :disabled="disabled || !clearOutline"
          @select="onClearOutline"
          ><template #icon><ListX :size="15" /></template
          >{{ t("dataTools.outline.clearOutline") }}</MenuItem
        ></MenuSurface
      ></Teleport
    >
    <OutlineUngroupDialog
      :visible="ungroupDialogVisible"
      :ungroup-rows="ungroupRows"
      :ungroup-columns="ungroupColumns"
      @close="ungroupDialogVisible = false"
      @confirm="chooseUngroup"
    />
  </div>
</template>
<style scoped lang="scss">
.data-outline-tools {
  display: contents;
  &__menu {
    position: fixed;
    z-index: 80;
    min-width: 150px;
  }
}
</style>
