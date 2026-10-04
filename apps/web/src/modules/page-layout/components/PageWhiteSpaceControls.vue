<script setup lang="ts">
import type { PageViewPaintState } from "../page-view-types";
import type { SheetRenderFrame } from "../../sheet-grid/rendering/sheet-render-frame";
import { useAppI18n } from "../../../shared/i18n";
const props = defineProps<{ state: PageViewPaintState; frame: SheetRenderFrame }>();
const emit = defineEmits<{ toggle: [] }>();
const { t } = useAppI18n();
function position(page: PageViewPaintState["pages"][number]) {
  const size = 10 * (props.state.uiScale ?? 1);
  const scroll = props.frame.layout.bodyScrollPosition;
  return {
    left: `${page.paperRect.x - scroll.x}px`,
    top: `${page.paperRect.y + page.paperRect.height - scroll.y - size / 2}px`,
    width: `${page.paperRect.width}px`,
    height: `${size}px`,
  };
}
</script>
<template>
  <div
    class="page-white-space-controls"
    :style="{
      left: `${frame.body.x}px`,
      top: `${frame.body.y}px`,
      width: `${frame.body.width}px`,
      height: `${frame.body.height}px`,
    }"
  >
    <button
      v-for="page in state.pages"
      :key="`${page.paperRect.x}:${page.paperRect.y}`"
      type="button"
      class="page-white-space-controls__handle"
      :style="position(page)"
      :aria-label="
        t(
          state.showWhiteSpace === false
            ? 'pageLayout.restoreWhiteSpace'
            : 'pageLayout.hideWhiteSpace',
        )
      "
      :title="
        t(
          state.showWhiteSpace === false
            ? 'pageLayout.restoreWhiteSpace'
            : 'pageLayout.hideWhiteSpace',
        )
      "
      data-page-white-space
      @dblclick.stop.prevent="emit('toggle')"
      @keydown.enter.stop.prevent="emit('toggle')"
      @keydown.space.stop.prevent="emit('toggle')"
      @pointerdown.stop
    />
  </div>
</template>
<style scoped lang="scss">
.page-white-space-controls {
  position: absolute;
  z-index: 5;
  overflow: hidden;
  pointer-events: none;
  &__handle {
    position: absolute;
    border: 0;
    padding: 0;
    background: transparent;
    cursor: ns-resize;
    pointer-events: auto;
    &:hover,
    &:focus-visible {
      background: color-mix(in srgb, var(--idea-action-primary) 10%, transparent);
    }
  }
}
</style>
