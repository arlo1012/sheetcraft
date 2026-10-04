<script setup lang="ts">
import { ImagePlus, Trash2 } from "lucide-vue-next";
import { computed, nextTick, ref, useId, watch } from "vue";
import { useAppI18n } from "../../../shared/i18n";
import MenuItem from "../../../shared/menu/MenuItem.vue";
import MenuSurface from "../../../shared/menu/MenuSurface.vue";
import { useMenu } from "../../../shared/menu/useMenu";
import RibbonMenuButton from "../../../shared/ribbon/RibbonMenuButton.vue";
import BackgroundWatermarkConflictDialog from "./BackgroundWatermarkConflictDialog.vue";

type BackgroundResolution = "independent" | "remove";

const props = defineProps<{
  hasBackground?: boolean;
  backgroundConflict?: boolean;
  contextKey: string;
  disabled?: boolean;
  busy?: boolean;
}>();
const emit = defineEmits<{
  selectFile: [file: File, resolution?: BackgroundResolution];
  remove: [];
  "update:conflictVisible": [value: boolean];
}>();
const { t } = useAppI18n();
const buttonRef = ref<InstanceType<typeof RibbonMenuButton> | null>(null);
const triggerRef = computed(() => buttonRef.value?.rootElement ?? null);
const surfaceRef = ref<InstanceType<typeof MenuSurface> | null>(null);
const input = ref<HTMLInputElement>();
const conflictVisible = ref(false);
const pendingResolution = ref<BackgroundResolution>();
const pickerContext = ref<string>();
const menuId = `page-background-menu-${useId().replaceAll(":", "")}`;
const { open, floatingStyles, dismiss, toggleMenu, onTriggerKeydown } = useMenu({
  triggerRef,
  menuSurfaceRef: surfaceRef,
  disabled: computed(() => !!props.disabled || !!props.busy),
});
function setConflictVisible(visible: boolean): void {
  conflictVisible.value = visible;
  emit("update:conflictVisible", visible);
}
function openFilePicker(resolution?: BackgroundResolution): void {
  pendingResolution.value = resolution;
  pickerContext.value = props.contextKey;
  void nextTick(() => input.value?.click());
}
function choose(): void {
  if (props.disabled || props.busy) return;
  if (props.backgroundConflict) {
    dismiss("programmatic", true);
    setConflictVisible(true);
    return;
  }
  dismiss("programmatic", true);
  openFilePicker();
}
function continueWithResolution(resolution: BackgroundResolution): void {
  if (props.disabled || props.busy) return;
  setConflictVisible(false);
  openFilePicker(resolution);
}
function closeConflict(): void {
  pendingResolution.value = undefined;
  setConflictVisible(false);
}
function reset(): void {
  pendingResolution.value = undefined;
  pickerContext.value = undefined;
  if (input.value) input.value.value = "";
  dismiss("programmatic", true);
  setConflictVisible(false);
}
function changed(event: Event): void {
  const target = event.target as HTMLInputElement;
  const file = target.files?.[0];
  target.value = "";
  const resolution = pendingResolution.value;
  const context = pickerContext.value;
  pendingResolution.value = undefined;
  pickerContext.value = undefined;
  if (file && context === props.contextKey && !props.disabled && !props.busy)
    emit("selectFile", file, resolution);
}
function cancelFilePicker(): void {
  pendingResolution.value = undefined;
  pickerContext.value = undefined;
}
function remove(): void {
  emit("remove");
  dismiss("programmatic", true);
}

watch(
  () => [props.contextKey, props.disabled, props.busy] as const,
  () => reset(),
);
</script>
<template>
  <span class="page-background-menu">
    <input
      ref="input"
      type="file"
      accept="image/*"
      hidden
      tabindex="-1"
      @change="changed"
      @cancel="cancelFilePicker"
    />
    <RibbonMenuButton
      ref="buttonRef"
      variant="tall"
      :label="t('pageDecoration.backgroundImage')"
      :text="t('pageDecoration.backgroundImage')"
      :disabled="disabled || busy"
      :expanded="open"
      :menu-id="menuId"
      data-page-tool="background"
      @activate="toggleMenu"
      @keydown="onTriggerKeydown"
      ><ImagePlus aria-hidden="true"
    /></RibbonMenuButton>
    <Teleport to="body"
      ><MenuSurface
        v-if="open"
        :id="menuId"
        ref="surfaceRef"
        class="page-background-menu__surface"
        :style="floatingStyles"
        :label="t('pageDecoration.backgroundImage')"
        ><MenuItem data-page-background-select @select="choose"
          ><template #icon><ImagePlus :size="16" /></template
          >{{ t("pageDecoration.chooseBackground") }}</MenuItem
        ><MenuItem v-if="hasBackground" data-page-background-remove @select="remove"
          ><template #icon><Trash2 :size="16" /></template
          >{{ t("pageDecoration.removeBackground") }}</MenuItem
        ></MenuSurface
      ></Teleport
    >
    <BackgroundWatermarkConflictDialog
      :visible="conflictVisible"
      :busy="busy"
      @update:visible="(visible) => (visible ? setConflictVisible(true) : closeConflict())"
      @continue="continueWithResolution"
    />
  </span>
</template>
<style scoped lang="scss">
@use "../../../shared/ribbon/ribbon-layout" as ribbon;
.page-background-menu {
  @include ribbon.tool;
  &__surface {
    position: fixed;
    z-index: 80;
    min-width: 180px;
  }
}
</style>
