<script setup lang="ts">
import { ImagePlus, Trash2 } from "lucide-vue-next";
import { computed, ref, useId } from "vue";
import { useAppI18n } from "../../../shared/i18n";
import MenuItem from "../../../shared/menu/MenuItem.vue";
import MenuSurface from "../../../shared/menu/MenuSurface.vue";
import { useMenu } from "../../../shared/menu/useMenu";
import RibbonMenuButton from "../../../shared/ribbon/RibbonMenuButton.vue";

const props = defineProps<{ hasBackground?: boolean; disabled?: boolean; busy?: boolean }>();
const emit = defineEmits<{ selectFile: [file: File]; remove: [] }>();
const { t } = useAppI18n();
const buttonRef = ref<InstanceType<typeof RibbonMenuButton> | null>(null);
const triggerRef = computed(() => buttonRef.value?.rootElement ?? null);
const surfaceRef = ref<InstanceType<typeof MenuSurface> | null>(null);
const input = ref<HTMLInputElement>();
const menuId = `page-background-menu-${useId().replaceAll(":", "")}`;
const { open, floatingStyles, dismiss, toggleMenu, onTriggerKeydown } = useMenu({
  triggerRef,
  menuSurfaceRef: surfaceRef,
  disabled: computed(() => !!props.disabled || !!props.busy),
});
function choose(): void {
  input.value?.click();
}
function changed(event: Event): void {
  const target = event.target as HTMLInputElement;
  const file = target.files?.[0];
  target.value = "";
  if (file) emit("selectFile", file);
  dismiss("programmatic", true);
}
function remove(): void {
  emit("remove");
  dismiss("programmatic", true);
}
</script>
<template>
  <span class="page-background-menu">
    <input ref="input" type="file" accept="image/*" hidden tabindex="-1" @change="changed" />
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
