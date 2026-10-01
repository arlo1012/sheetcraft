<script setup lang="ts">
import type { SheetPageSetup } from "@idea10/core/page-setup";
import type { CSSProperties } from "vue";
import type { SheetRenderFrame } from "../../sheet-grid/rendering/sheet-render-frame";
import type { PageViewPaintState, PageViewPage } from "../page-view-types";
import PageHeaderFooterField from "./PageHeaderFooterField.vue";

const props = defineProps<{
  state: PageViewPaintState;
  frame: SheetRenderFrame;
  setup: SheetPageSetup;
  sheetName: string;
  disabled: boolean;
  pageCount: number;
}>();
const emit = defineEmits<{
  change: [
    payload: { section: "header" | "footer"; part: "left" | "center" | "right"; value: string },
  ];
}>();
function style(page: PageViewPage, section: "header" | "footer"): CSSProperties {
  const { bodyScrollPosition: scroll } = props.frame.layout;
  const offset = props.setup.margins[section] / props.state.millimetresPerUnit;
  const y =
    section === "header"
      ? page.paperRect.y + offset
      : page.paperRect.y + page.paperRect.height - offset - 28;
  return {
    left: `${page.contentRect.x - scroll.x}px`,
    top: `${y - scroll.y}px`,
    width: `${page.contentRect.width}px`,
  };
}
</script>

<template>
  <div
    class="page-header-footer-overlay"
    :style="{
      left: `${frame.body.x}px`,
      top: `${frame.body.y}px`,
      width: `${frame.body.width}px`,
      height: `${frame.body.height}px`,
    }"
    data-page-header-footer
    @keydown.stop
    @copy.stop
    @cut.stop
    @paste.stop
  >
    <template v-for="page in state.pages" :key="`${page.paperRect.x}:${page.paperRect.y}`">
      <div
        class="page-header-footer-overlay__row"
        :style="style(page, 'header')"
        :data-paper-number="page.pageNumber"
      >
        <PageHeaderFooterField
          :value="setup.header.left"
          section="header"
          part="left"
          :page-number="page.pageNumber"
          :page-count="pageCount"
          :sheet-name="sheetName"
          :disabled="disabled"
          @change="emit('change', { section: 'header', part: 'left', value: $event })"
        />
        <PageHeaderFooterField
          :value="setup.header.center"
          section="header"
          part="center"
          :page-number="page.pageNumber"
          :page-count="pageCount"
          :sheet-name="sheetName"
          :disabled="disabled"
          @change="emit('change', { section: 'header', part: 'center', value: $event })"
        />
        <PageHeaderFooterField
          :value="setup.header.right"
          section="header"
          part="right"
          :page-number="page.pageNumber"
          :page-count="pageCount"
          :sheet-name="sheetName"
          :disabled="disabled"
          @change="emit('change', { section: 'header', part: 'right', value: $event })"
        />
      </div>
      <div class="page-header-footer-overlay__row" :style="style(page, 'footer')">
        <PageHeaderFooterField
          :value="setup.footer.left"
          section="footer"
          part="left"
          :page-number="page.pageNumber"
          :page-count="pageCount"
          :sheet-name="sheetName"
          :disabled="disabled"
          @change="emit('change', { section: 'footer', part: 'left', value: $event })"
        />
        <PageHeaderFooterField
          :value="setup.footer.center"
          section="footer"
          part="center"
          :page-number="page.pageNumber"
          :page-count="pageCount"
          :sheet-name="sheetName"
          :disabled="disabled"
          @change="emit('change', { section: 'footer', part: 'center', value: $event })"
        />
        <PageHeaderFooterField
          :value="setup.footer.right"
          section="footer"
          part="right"
          :page-number="page.pageNumber"
          :page-count="pageCount"
          :sheet-name="sheetName"
          :disabled="disabled"
          @change="emit('change', { section: 'footer', part: 'right', value: $event })"
        />
      </div>
    </template>
  </div>
</template>

<style scoped lang="scss">
.page-header-footer-overlay {
  position: absolute;
  z-index: 3;
  pointer-events: none;
  overflow: hidden;
  &__row {
    position: absolute;
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    pointer-events: auto;
    height: 28px;
  }
}
</style>
