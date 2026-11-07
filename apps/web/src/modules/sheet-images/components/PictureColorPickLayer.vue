<script setup lang="ts">
import { onMounted, ref } from "vue";
import { Button } from "tdesign-vue-next/es/button";
import { useAppI18n } from "../../../shared/i18n";
import FloatingPanelSurface from "../../../shared/floating/FloatingPanelSurface.vue";
const emit = defineEmits<{ pick: [event: PointerEvent]; cancel: [] }>();
const root = ref<HTMLElement>();
const { t } = useAppI18n();
onMounted(() => root.value?.focus({ preventScroll: true }));
</script>
<template>
  <div
    ref="root"
    class="picture-color-pick"
    data-picture-color-picker
    tabindex="0"
    role="group"
    :aria-label="t('picture.pickTransparentColorHint')"
    @pointerdown.prevent.stop="$event.button === 0 ? emit('pick', $event) : emit('cancel')"
    @click.prevent.stop
    @dblclick.prevent.stop
    @contextmenu.prevent.stop="emit('cancel')"
    @keydown.escape.prevent.stop="emit('cancel')"
  >
    <FloatingPanelSurface
      class="picture-color-pick__hint"
      role="group"
      :label="t('picture.pickTransparentColor')"
      padding="compact"
      :scrollable="false"
    >
      <div class="picture-color-pick__hint-content" @pointerdown.stop>
        <span role="status">{{ t("picture.pickTransparentColorHint") }}</span>
        <Button theme="default" variant="base" @click.stop="emit('cancel')">{{
          t("picture.cancel")
        }}</Button>
      </div>
    </FloatingPanelSurface>
  </div>
</template>
<style scoped lang="scss">
.picture-color-pick {
  position: absolute;
  inset: 0;
  z-index: 30;
  pointer-events: auto;
  cursor: crosshair;
  outline: none;
  &__hint {
    position: absolute;
    left: 12px;
    bottom: 12px;
    cursor: default;
  }
  &__hint-content {
    display: flex;
    align-items: center;
    gap: 12px;
  }
}
</style>
