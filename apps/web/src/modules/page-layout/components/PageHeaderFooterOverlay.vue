<script setup lang="ts">
import { computed, ref, watch, type CSSProperties } from "vue";
import { getSheetHeaderFooterOptions, type SheetPageSetup } from "@idea10/core/page-setup";
import { parseHeaderFooterRuns } from "../header-footer-text";
import type {
  HeaderFooterActionRequest,
  HeaderFooterEditContext,
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
    actionRequest?: HeaderFooterActionRequest;
  }>(),
  { fileName: "Workbook.xlsx", actionRequest: undefined },
);
const emit = defineEmits<{
  change: [
    payload: {
      section: HeaderFooterSection;
      part: HeaderFooterPart;
      variant: HeaderFooterVariant;
      value: string;
    },
  ];
  edit: [context: HeaderFooterEditContext | undefined];
}>();
const headerFooter = computed(() => getSheetHeaderFooterOptions(props.setup));
const now = new Date();
type HeaderFooterFieldHandle = { finishEditing: () => boolean; hasPendingEdit: () => boolean };
const fields = ref<HeaderFooterFieldHandle[]>([]);
const activeContext = ref<HeaderFooterEditContext>();
const retainedPage = ref<PageViewPage>();
const renderedPages = computed(() => {
  const visible = props.state.pages;
  const retained = retainedPage.value;
  return retained && !visible.some((page) => page.pageNumber === retained.pageNumber)
    ? [...visible, retained]
    : visible;
});
function sameEditTarget(
  context: HeaderFooterEditContext | undefined,
  target: Pick<HeaderFooterEditContext, "section" | "part" | "variant" | "pageNumber">,
): boolean {
  if (!context) return false;
  return (
    context.section === target.section &&
    context.part === target.part &&
    context.variant === target.variant &&
    context.pageNumber === target.pageNumber
  );
}
function onFieldEdit(
  context: HeaderFooterEditContext | undefined,
  page: PageViewPage,
  section: HeaderFooterSection,
  part: HeaderFooterPart,
): void {
  const target = { section, part, variant: variant(page), pageNumber: page.pageNumber };
  if (context !== undefined) {
    activeContext.value = context;
    retainedPage.value = page;
    emit("edit", context);
  } else if (sameEditTarget(activeContext.value, target)) {
    activeContext.value = undefined;
    retainedPage.value = undefined;
    emit("edit", undefined);
  }
}
watch(
  () => props.state.pages,
  (pages) => {
    const retained = retainedPage.value;
    const updated = retained && pages.find((page) => page.pageNumber === retained.pageNumber);
    if (updated) retainedPage.value = updated;
  },
);
function finishEditing(): boolean {
  return fields.value.every((field) => field.finishEditing());
}
function flushPendingEdit(): boolean {
  return finishEditing();
}
function hasPendingEdit(): boolean {
  return fields.value.some((field) => field.hasPendingEdit());
}
defineExpose({ finishEditing, flushPendingEdit, hasPendingEdit });
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
    28,
    ...(["left", "center", "right"] as const).map((part) => {
      const runs = parseHeaderFooterRuns(value(section, part, page));
      const lines = Math.max(1, value(section, part, page).split(/\r?\n/).length);
      const size = Math.max(10, ...runs.map((run) => run.format.fontSize));
      return Math.ceil(((size * 4 * scale * lines) / 3) * 1.2 + 4);
    }),
  );
}
function style(page: PageViewPage, section: HeaderFooterSection): CSSProperties {
  const { bodyScrollPosition: scroll } = props.frame.layout;
  const options = headerFooter.value;
  const height = rowHeight(section, page);
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
    minHeight: `${height}px`,
    paddingInline: options.alignWithMargins ? undefined : "4px",
    boxSizing: "border-box",
  };
}
function emitChange(
  section: HeaderFooterSection,
  part: HeaderFooterPart,
  page: PageViewPage,
  value: string,
): void {
  emit("change", { section, part, variant: variant(page), value });
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
    <template v-for="page in renderedPages" :key="`${page.paperRect.x}:${page.paperRect.y}`">
      <div
        class="page-header-footer-overlay__row"
        :style="style(page, 'header')"
        :data-paper-number="page.pageNumber"
      >
        <PageHeaderFooterField
          ref="fields"
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
          :disabled="disabled"
          :action-request="actionRequest"
          @change="emitChange('header', 'left', page, $event)"
          @edit="onFieldEdit($event, page, 'header', 'left')"
        />
        <PageHeaderFooterField
          ref="fields"
          :value="value('header', 'center', page)"
          section="header"
          part="center"
          :variant="variant(page)"
          :page-number="page.pageNumber"
          :page-count="pageCount"
          :sheet-name="sheetName"
          :file-name="fileName"
          :now="now"
          :font-scale="fontScale()"
          :disabled="disabled"
          :action-request="actionRequest"
          @change="emitChange('header', 'center', page, $event)"
          @edit="onFieldEdit($event, page, 'header', 'center')"
        />
        <PageHeaderFooterField
          ref="fields"
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
          :disabled="disabled"
          :action-request="actionRequest"
          @change="emitChange('header', 'right', page, $event)"
          @edit="onFieldEdit($event, page, 'header', 'right')"
        />
      </div>
      <div class="page-header-footer-overlay__row" :style="style(page, 'footer')">
        <PageHeaderFooterField
          ref="fields"
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
          :disabled="disabled"
          :action-request="actionRequest"
          @change="emitChange('footer', 'left', page, $event)"
          @edit="onFieldEdit($event, page, 'footer', 'left')"
        />
        <PageHeaderFooterField
          ref="fields"
          :value="value('footer', 'center', page)"
          section="footer"
          part="center"
          :variant="variant(page)"
          :page-number="page.pageNumber"
          :page-count="pageCount"
          :sheet-name="sheetName"
          :file-name="fileName"
          :now="now"
          :font-scale="fontScale()"
          :disabled="disabled"
          :action-request="actionRequest"
          @change="emitChange('footer', 'center', page, $event)"
          @edit="onFieldEdit($event, page, 'footer', 'center')"
        />
        <PageHeaderFooterField
          ref="fields"
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
          :disabled="disabled"
          :action-request="actionRequest"
          @change="emitChange('footer', 'right', page, $event)"
          @edit="onFieldEdit($event, page, 'footer', 'right')"
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
  }
}
</style>
