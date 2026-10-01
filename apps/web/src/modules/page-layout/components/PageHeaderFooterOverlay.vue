<script setup lang="ts">
import { computed, type CSSProperties } from "vue";
import { useAppI18n } from "../../../shared/i18n";
import { getSheetHeaderFooterOptions, type SheetPageSetup } from "@idea10/core/page-setup";
import { parseHeaderFooterRuns } from "../header-footer-text";
import type {
  HeaderFooterEditTarget,
  HeaderFooterPart,
  HeaderFooterSection,
  HeaderFooterVariant,
} from "../header-footer-editor";
import type { SheetRenderFrame } from "../../sheet-grid/rendering/sheet-render-frame";
import type { PageViewPaintState, PageViewPage } from "../page-view-types";
import PageHeaderFooterField from "./PageHeaderFooterField.vue";

const props = withDefaults(
  defineProps<{
    state: PageViewPaintState;
    frame: SheetRenderFrame;
    setup: SheetPageSetup;
    sheetName: string;
    disabled: boolean;
    pageCount: number;
    fileName?: string;
  }>(),
  { fileName: "Workbook.xlsx" },
);
const emit = defineEmits<{ open: [target: HeaderFooterEditTarget] }>();
const { t } = useAppI18n();
const headerFooter = computed(() => getSheetHeaderFooterOptions(props.setup));
const now = new Date();
function variant(page: PageViewPage): HeaderFooterVariant {
  const pageNumber = page.pageNumber ?? 1;
  if (headerFooter.value.differentFirst && pageNumber === 1) return "first";
  if (headerFooter.value.differentOddEven && pageNumber % 2 === 0) return "even";
  return "odd";
}
function value(section: HeaderFooterSection, part: HeaderFooterPart, page: PageViewPage): string {
  const target = variant(page);
  if (target === "odd") return props.setup[section][part];
  const key = `${target}${section === "header" ? "Header" : "Footer"}` as
    | "firstHeader"
    | "firstFooter"
    | "evenHeader"
    | "evenFooter";
  return headerFooter.value[key][part];
}
function fontScale(): number {
  return headerFooter.value.scaleWithDocument ? 1 : (props.state.uiScale ?? 1);
}
function rowHeight(section: HeaderFooterSection, page: PageViewPage): number {
  const scale = fontScale();
  return Math.max(
    28 * (props.state.uiScale ?? 1),
    ...(["left", "center", "right"] as const).map((part) => {
      const runs = parseHeaderFooterRuns(value(section, part, page));
      const lines = Math.max(1, value(section, part, page).split(/\r?\n/).length);
      const size = Math.max(10, ...runs.map((run) => run.format.fontSize));
      return Math.ceil(((size * 4 * scale * lines) / 3) * 1.2 + 4);
    }),
  );
}
function availableHeight(section: HeaderFooterSection): number {
  const outer = props.setup.margins[section === "header" ? "top" : "bottom"];
  return Math.max(0, (outer - props.setup.margins[section]) / props.state.millimetresPerUnit);
}
function sectionVisible(section: HeaderFooterSection, page: PageViewPage): boolean {
  if (props.state.showWhiteSpace === false) return false;
  if (props.disabled && sectionEmpty(section, page)) return false;
  return availableHeight(section) >= 18 * (props.state.uiScale ?? 1);
}
function style(page: PageViewPage, section: HeaderFooterSection): CSSProperties {
  const { bodyScrollPosition: scroll } = props.frame.layout;
  const options = headerFooter.value;
  const height = Math.min(rowHeight(section, page), availableHeight(section));
  const offset = props.setup.margins[section] / props.state.millimetresPerUnit;
  const anchor =
    section === "header"
      ? page.paperRect.y + offset
      : page.paperRect.y + page.paperRect.height - offset;
  const left = options.alignWithMargins ? page.contentRect.x : page.paperRect.x;
  const width = options.alignWithMargins ? page.contentRect.width : page.paperRect.width;
  return {
    left: `${left - scroll.x}px`,
    top: `${section === "header" ? anchor - scroll.y : anchor - height - scroll.y}px`,
    width: `${width}px`,
    height: `${height}px`,
    paddingInline: options.alignWithMargins ? undefined : "4px",
    boxSizing: "border-box",
  };
}
function sectionEmpty(section: HeaderFooterSection, page: PageViewPage): boolean {
  return (["left", "center", "right"] as const).every(
    (part) => parseHeaderFooterRuns(value(section, part, page)).length === 0,
  );
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
        v-if="sectionVisible('header', page)"
        class="page-header-footer-overlay__row"
        data-page-section-row="header"
        :style="style(page, 'header')"
        :data-paper-number="page.pageNumber"
      >
        <PageHeaderFooterField
          :value="value('header', 'left', page)"
          section="header"
          part="left"
          :variant="variant(page)"
          :page-number="page.pageNumber"
          :page-count="pageCount"
          :sheet-name="sheetName"
          :file-name="fileName"
          :now="now"
          :font-scale="fontScale()"
          :ui-scale="state.uiScale ?? 1"
          :disabled="disabled"
          @open="emit('open', $event)"
        />
        <PageHeaderFooterField
          :value="value('header', 'center', page)"
          section="header"
          part="center"
          :placeholder="sectionEmpty('header', page) ? t('pageLayout.addHeader') : undefined"
          :variant="variant(page)"
          :page-number="page.pageNumber"
          :page-count="pageCount"
          :sheet-name="sheetName"
          :file-name="fileName"
          :now="now"
          :font-scale="fontScale()"
          :ui-scale="state.uiScale ?? 1"
          :disabled="disabled"
          @open="emit('open', $event)"
        />
        <PageHeaderFooterField
          :value="value('header', 'right', page)"
          section="header"
          part="right"
          :variant="variant(page)"
          :page-number="page.pageNumber"
          :page-count="pageCount"
          :sheet-name="sheetName"
          :file-name="fileName"
          :now="now"
          :font-scale="fontScale()"
          :ui-scale="state.uiScale ?? 1"
          :disabled="disabled"
          @open="emit('open', $event)"
        />
      </div>
      <div
        v-if="sectionVisible('footer', page)"
        class="page-header-footer-overlay__row"
        data-page-section-row="footer"
        :style="style(page, 'footer')"
      >
        <PageHeaderFooterField
          :value="value('footer', 'left', page)"
          section="footer"
          part="left"
          :variant="variant(page)"
          :page-number="page.pageNumber"
          :page-count="pageCount"
          :sheet-name="sheetName"
          :file-name="fileName"
          :now="now"
          :font-scale="fontScale()"
          :ui-scale="state.uiScale ?? 1"
          :disabled="disabled"
          @open="emit('open', $event)"
        />
        <PageHeaderFooterField
          :value="value('footer', 'center', page)"
          section="footer"
          part="center"
          :placeholder="sectionEmpty('footer', page) ? t('pageLayout.addFooter') : undefined"
          :variant="variant(page)"
          :page-number="page.pageNumber"
          :page-count="pageCount"
          :sheet-name="sheetName"
          :file-name="fileName"
          :now="now"
          :font-scale="fontScale()"
          :ui-scale="state.uiScale ?? 1"
          :disabled="disabled"
          @open="emit('open', $event)"
        />
        <PageHeaderFooterField
          :value="value('footer', 'right', page)"
          section="footer"
          part="right"
          :variant="variant(page)"
          :page-number="page.pageNumber"
          :page-count="pageCount"
          :sheet-name="sheetName"
          :file-name="fileName"
          :now="now"
          :font-scale="fontScale()"
          :ui-scale="state.uiScale ?? 1"
          :disabled="disabled"
          @open="emit('open', $event)"
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
    overflow: hidden;
    &:hover :deep(.page-header-footer-field__preview:not(:disabled)) {
      outline: 1px solid var(--idea-border-control);
      outline-offset: -1px;
    }
  }
}
</style>
