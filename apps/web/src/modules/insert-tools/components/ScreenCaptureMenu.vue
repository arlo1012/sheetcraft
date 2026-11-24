<script setup lang="ts">
import { computed, ref, useId } from "vue";
import {
  Scan,
  Video,
  SquareDashed,
  CircleDashed,
  RectangleHorizontal,
  Lasso,
  PanelTopOpen,
  Square,
  SquareCheck,
} from "lucide-vue-next";
import RibbonSplitButton from "../../../shared/ribbon/RibbonSplitButton.vue";
import MenuItem from "../../../shared/menu/MenuItem.vue";
import MenuSeparator from "../../../shared/menu/MenuSeparator.vue";
import MenuSurface from "../../../shared/menu/MenuSurface.vue";
import { useMenu } from "../../../shared/menu/useMenu";
import { useAppI18n } from "../../../shared/i18n";
import { captureShapes, type CaptureShape } from "../capture-region";

const props = defineProps<{ disabled?: boolean; compact?: boolean; fullWidth?: boolean }>();
const emit = defineEmits<{
  record: [];
  capture: [shape: CaptureShape, tools: boolean, excludeSelf: boolean];
}>();
const { t } = useAppI18n();
const trigger = ref<InstanceType<typeof RibbonSplitButton>>();
const surface = ref<InstanceType<typeof MenuSurface>>();
const menuId = "screen-capture-" + useId();
const { open, floatingStyles, toggleMenu, dismiss, onTriggerKeydown } = useMenu({
  triggerRef: computed(() => trigger.value?.menuElement ?? null),
  menuSurfaceRef: computed(() => surface.value ?? null),
  disabled: computed(() => !!props.disabled),
});
const mode = ref<CaptureShape>("rectangle");
const excludeSelf = ref(false);

function choose(shape: CaptureShape, tools = false) {
  dismiss("programmatic", false);
  mode.value = shape;
  emit("capture", shape, tools, excludeSelf.value);
}
</script>
<template>
  <RibbonSplitButton
    ref="trigger"
    :variant="compact ? 'compact' : 'tall'"
    :full-width="fullWidth"
    :label="t('drawing.screenshot')"
    :text="t('drawing.screenshot')"
    :menu-label="t('drawing.captureModes')"
    :disabled="disabled"
    :menu-disabled="disabled"
    :expanded="open"
    :menu-id="menuId"
    data-insert-tool="screenshot"
    @activate="choose(mode)"
    @toggle-menu="toggleMenu"
    @menu-keydown="onTriggerKeydown"
    ><Scan
  /></RibbonSplitButton>
  <Teleport to="body">
    <MenuSurface
      v-if="open"
      ref="surface"
      :id="menuId"
      :label="t('drawing.captureModes')"
      :style="floatingStyles"
      class="capture-menu"
    >
      <template #items>
        <MenuItem v-for="shape in captureShapes" :key="shape" @select="choose(shape)">
          <template #icon>
            <SquareDashed v-if="shape === 'rectangle'" />
            <CircleDashed v-else-if="shape === 'ellipse'" />
            <RectangleHorizontal v-else-if="shape === 'rounded'" />
            <Lasso v-else />
          </template>
          {{ t(`drawing.capture.${shape}`) }}
        </MenuItem>
        <MenuSeparator />
        <MenuItem @select="choose(mode)">
          <template #icon><Scan /></template>
          {{ t("drawing.captureStart") }}
          <template #shortcut>Ctrl+Alt+X</template>
        </MenuItem>
        <MenuItem @select="choose(mode, true)">
          <template #icon><PanelTopOpen /></template>
          {{ t("drawing.captureTools") }}
        </MenuItem>
        <MenuItem
          @select="
            dismiss('programmatic', false);
            emit('record');
          "
        >
          <template #icon><Video /></template>
          {{ t("drawing.record") }}
        </MenuItem>
        <MenuSeparator />
        <MenuItem
          role="menuitemcheckbox"
          :aria-checked="excludeSelf"
          @select="excludeSelf = !excludeSelf"
        >
          <template #icon>
            <SquareCheck v-if="excludeSelf" class="capture-menu__checked" />
            <Square v-else />
          </template>
          {{ t("drawing.captureExcludeSelf") }}
        </MenuItem>
      </template>
    </MenuSurface>
  </Teleport>
</template>
<style scoped lang="scss">
.capture-menu {
  z-index: var(--sheetcraft-layer-menu);

  &__checked {
    color: var(--sheetcraft-action-primary);
  }
}
</style>
