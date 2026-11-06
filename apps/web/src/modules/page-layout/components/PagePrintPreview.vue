<script setup lang="ts">
import { UnsupportedPictureDocumentError } from "../../sheet-images/picture-document-support";
import { getPrintPictureAssetIds } from "../page-print-pictures";
import { computed, nextTick, onBeforeUnmount, ref, watch } from "vue";
import { Dialog as TDialog } from "tdesign-vue-next/es/dialog";
import { MessagePlugin } from "tdesign-vue-next/es/message";
import { Button as TButton } from "tdesign-vue-next/es/button";
import { InputNumber } from "tdesign-vue-next/es/input-number";
import { Radio, RadioGroup } from "tdesign-vue-next/es/radio";
import { ChevronLeft, ChevronRight, Printer } from "lucide-vue-next";
import type { CellRange, Sheet, SheetEvaluator } from "@sheetcraft/core/workbook";
import {
  TextBoxReferenceUnavailableError,
  type TextBoxReferenceResolver,
} from "../../sheet-drawings/textbox-reference-display";
import { ShapePrintError } from "../page-print-shapes";
import { EquationPrintUnavailableError } from "../page-print-equations";
import { ChartPrintUnavailableError } from "../page-print-charts";
import type { SheetPageSetup } from "@sheetcraft/core/page-setup";
import type { WorkbookTheme } from "@sheetcraft/core/workbook-theme";
import { useAppI18n } from "../../../shared/i18n";
import {
  createPrintPreviewDocument,
  createPrintPreviewRenderer,
  type PrintPreviewDocument,
} from "../page-print-renderer";

const props = withDefaults(
  defineProps<{
    visible: boolean;
    sheet: Sheet;
    evaluator: SheetEvaluator;
    setup: SheetPageSetup;
    fileName?: string;
    locale?: string;
    dateSystem?: "1900" | "1904";
    workbookRevision?: number;
    textBoxReferenceResolver?: TextBoxReferenceResolver;
    resolveChartSheet?: (id: string) => Sheet | undefined;
    imageAssetUrls?: ReadonlyMap<string, string>;
    theme?: WorkbookTheme;
    selection?: CellRange;
    setupDisabled?: boolean;
  }>(),
  { fileName: "workbook.xlsx", locale: "en-US", dateSystem: "1900" },
);
const emit = defineEmits<{ "update:visible": [value: boolean]; pageSetup: [] }>();
const { t } = useAppI18n();
const selected = ref(0);
const scope = ref<"sheet" | "selection">("sheet");
const zoom = ref(60);
const pageFrom = ref(1);
const pageTo = ref(1);
const effectiveSetup = computed(() =>
  scope.value === "selection" && props.selection
    ? {
        ...props.setup,
        printArea: { start: { ...props.selection.start }, end: { ...props.selection.end } },
      }
    : props.setup,
);
const printing = ref(false);
const renderFailure = ref<string>();
const equationFailure = ref<string>();
const chartFailure = ref<string>();
const thumbnailCanvases = new Map<number, HTMLCanvasElement>();
const pageCanvas = ref<HTMLCanvasElement>();
const repaint = ref(0);
const equationResourceRevision = ref(0);
const thumbnailWindowSize = 9;
const renderer = createPrintPreviewRenderer(
  () => {
    repaint.value += 1;
  },
  () => {
    equationResourceRevision.value += 1;
    repaint.value += 1;
  },
  () => {
    equationResourceRevision.value += 1;
    repaint.value += 1;
  },
);

function captureChartOwner() {
  const sheet = props.sheet,
    evaluator = props.evaluator,
    revision = props.workbookRevision,
    resolver = props.resolveChartSheet;
  return () =>
    props.visible &&
    props.sheet === sheet &&
    props.evaluator === evaluator &&
    props.workbookRevision === revision &&
    props.resolveChartSheet === resolver;
}

const previewResult = computed<{
  document?: PrintPreviewDocument;
  errorKey?:
    | "pagePrint.unsupportedPictures"
    | "pagePrint.unsupportedEquations"
    | "pagePrint.unsupportedCharts"
    | "pagePrint.invalidRange"
    | "drawing.textBoxReferenceUnavailable";
}>(() => {
  void repaint.value;
  try {
    const result = createPrintPreviewDocument({
      theme: props.theme,
      sheet: props.sheet,
      evaluator: props.evaluator,
      setup: effectiveSetup.value,
      sheetName: props.sheet.name,
      fileName: props.fileName,
      locale: props.locale,
      dateSystem: props.dateSystem,
      revision: props.workbookRevision,
      textBoxReferenceResolver: props.textBoxReferenceResolver,
      shapePaintResources: renderer.getShapePaintResources(props.theme, props.imageAssetUrls),
      nativeEquationConsumer: true,
      nativeChartConsumer: true,
      resolveChartSheet: props.resolveChartSheet,
      isChartSourceCurrent: captureChartOwner(),
    });
    return { document: result };
  } catch (error) {
    return {
      errorKey:
        error instanceof ChartPrintUnavailableError
          ? "pagePrint.unsupportedCharts"
          : error instanceof EquationPrintUnavailableError
            ? "pagePrint.unsupportedEquations"
            : error instanceof UnsupportedPictureDocumentError
              ? "pagePrint.unsupportedPictures"
              : error instanceof ShapePrintError &&
                  error.cause instanceof TextBoxReferenceUnavailableError
                ? "drawing.textBoxReferenceUnavailable"
                : "pagePrint.invalidRange",
    };
  }
});
const documentPreview = computed(() => previewResult.value.document);
const equationPreparing = computed(() => {
  void repaint.value;
  return Boolean(documentPreview.value && !renderer.equationsReady(documentPreview.value));
});
const chartPreparing = computed(() => {
  void repaint.value;
  return Boolean(documentPreview.value && !renderer.chartsReady(documentPreview.value));
});
const preparing = computed(() => equationPreparing.value || chartPreparing.value);
const pages = computed(() => documentPreview.value?.pages ?? []);
const validPageRange = computed(
  () =>
    Number.isInteger(pageFrom.value) &&
    Number.isInteger(pageTo.value) &&
    pageFrom.value >= 1 &&
    pageTo.value >= pageFrom.value &&
    pageTo.value <= pages.value.length,
);
watch(
  () => pages.value.length,
  (count) => {
    pageFrom.value = 1;
    pageTo.value = Math.max(1, count);
  },
  { immediate: true },
);
const activePage = computed(() => pages.value[selected.value] ?? pages.value[0]);
const canPrevious = computed(() => selected.value > 0);
const canNext = computed(() => selected.value < pages.value.length - 1);
const thumbnailPages = computed(() => {
  if (preparing.value || equationFailure.value || chartFailure.value) return [];
  const count = pages.value.length;
  const start = Math.max(
    0,
    Math.min(selected.value - Math.floor(thumbnailWindowSize / 2), count - thumbnailWindowSize),
  );
  return pages.value.slice(start, start + thumbnailWindowSize).map((page, offset) => ({
    page,
    index: start + offset,
  }));
});

function render(): void {
  if (preparing.value) return;
  renderFailure.value = undefined;
  try {
    renderPages();
  } catch (error) {
    renderFailure.value = error instanceof Error ? error.message : String(error);
  }
}
function renderPages(): void {
  if (!props.visible) return;
  const document = documentPreview.value;
  if (!document) return;
  for (const { page } of thumbnailPages.value) {
    const canvas = thumbnailCanvases.get(page.pageNumber);
    if (canvas)
      renderer.render({
        canvas,
        document,
        page,
        imageAssetUrls: props.imageAssetUrls,
        theme: props.theme,
        scale: 0.15,
        density: 1,
      });
  }
  if (pageCanvas.value && activePage.value)
    renderer.render({
      canvas: pageCanvas.value,
      document,
      page: activePage.value,
      imageAssetUrls: props.imageAssetUrls,
      theme: props.theme,
      scale: zoom.value / 100,
      density: 1,
    });
}
function setThumbnail(pageNumber: number, element: unknown): void {
  if (element instanceof HTMLCanvasElement) thumbnailCanvases.set(pageNumber, element);
  else thumbnailCanvases.delete(pageNumber);
}
function close(): void {
  renderer.clearCharts();
  emit("update:visible", false);
}
async function print(): Promise<void> {
  if (
    printing.value ||
    !documentPreview.value ||
    preparing.value ||
    equationFailure.value ||
    chartFailure.value ||
    renderFailure.value ||
    !validPageRange.value
  )
    return;
  const printWindow = window.open("", "_blank");
  if (!printWindow) {
    void MessagePlugin.error(t("pagePrint.popupBlocked"));
    return;
  }
  printing.value = true;
  try {
    printWindow.opener = null;
    let document = documentPreview.value;
    const sheet = props.sheet,
      revision = props.workbookRevision,
      setup = effectiveSetup.value,
      evaluator = props.evaluator,
      theme = props.theme,
      assetUrls = props.imageAssetUrls,
      fileName = props.fileName,
      locale = props.locale,
      dateSystem = props.dateSystem,
      textBoxReferenceResolver = props.textBoxReferenceResolver,
      resolveChartSheet = props.resolveChartSheet,
      from = pageFrom.value,
      to = pageTo.value;
    const isCurrent = () =>
      props.visible &&
      !printWindow.closed &&
      props.sheet === sheet &&
      props.workbookRevision === revision &&
      effectiveSetup.value === setup &&
      pageFrom.value === from &&
      pageTo.value === to &&
      props.evaluator === evaluator &&
      props.theme === theme &&
      props.imageAssetUrls === assetUrls &&
      props.fileName === fileName &&
      props.locale === locale &&
      props.dateSystem === dateSystem &&
      props.textBoxReferenceResolver === textBoxReferenceResolver &&
      props.resolveChartSheet === resolveChartSheet;
    const assetIds = getPrintPictureAssetIds(
      document.sheet,
      document.shapeMetrics,
      document.shapeRenderPass,
    );
    const urls = [...assetIds].map((id) => props.imageAssetUrls?.get(id));
    if (urls.some((url) => !url)) throw new Error("Image assets are not ready.");
    await renderer.prepareImages(urls as string[], document);
    await renderer.prepareShapes(document);
    if (
      !props.visible ||
      printWindow.closed ||
      props.sheet !== sheet ||
      props.workbookRevision !== revision ||
      effectiveSetup.value !== setup ||
      props.evaluator !== evaluator ||
      props.theme !== theme ||
      props.imageAssetUrls !== assetUrls ||
      props.fileName !== fileName ||
      props.locale !== locale ||
      props.dateSystem !== dateSystem ||
      props.textBoxReferenceResolver !== textBoxReferenceResolver ||
      props.resolveChartSheet !== resolveChartSheet
    ) {
      printWindow.close();
      return;
    }
    // Font readiness can change overflow/effect extents. Rebuild final pagination
    // explicitly after the captured source/revision check, without mutating preview data.
    document = createPrintPreviewDocument({
      sheet,
      evaluator,
      setup,
      theme,
      sheetName: sheet.name,
      fileName,
      locale,
      dateSystem,
      revision,
      shapePaintResources: renderer.getShapePaintResources(theme, assetUrls),
      requireReadyGroupPaint: true,
      textBoxReferenceResolver,
      nativeEquationConsumer: true,
      nativeChartConsumer: true,
      resolveChartSheet,
      isChartSourceCurrent: isCurrent,
    });
    await renderer.prepareChartFonts(document, { isCurrent });
    await renderer.prepareEquations(document, { isCurrent });
    await renderer.prepareCharts(document, { isCurrent });
    if (!isCurrent()) {
      printWindow.close();
      return;
    }
    if (to > document.pages.length) throw new Error(t("pagePrint.invalidPages"));
    const images = document.pages.slice(from - 1, to).map((page) => {
      const canvas = window.document.createElement("canvas");
      renderer.render({
        canvas,
        document,
        page,
        imageAssetUrls: props.imageAssetUrls,
        theme: props.theme,
        scale: 1,
        density: 2,
      });
      return canvas.toDataURL("image/png");
    });
    const paper = document.pagination.paperSize;
    const widthMm = ((paper.width * document.pagination.printScale) / 96) * 25.4;
    const heightMm = ((paper.height * document.pagination.printScale) / 96) * 25.4;
    const printDocument = printWindow.document;
    printDocument.open();
    printDocument.write("<!doctype html><html><head></head><body></body></html>");
    printDocument.title = document.fileName;
    const style = printDocument.createElement("style");
    style.textContent = `@page { size: ${widthMm}mm ${heightMm}mm; margin: 0; } html, body { margin: 0; } img { display: block; width: ${widthMm}mm; height: ${heightMm}mm; break-after: page; } img:last-child { break-after: auto; }`;
    printDocument.head.append(style);
    for (const source of images) {
      const image = printDocument.createElement("img");
      image.src = source;
      printDocument.body.append(image);
    }
    printWindow.addEventListener(
      "load",
      () => {
        printWindow.focus();
        printWindow.print();
      },
      { once: true },
    );
    printDocument.close();
  } catch (error) {
    printWindow.close();
    const detail = error instanceof Error ? error.message : String(error);
    void MessagePlugin.error(`${t("pagePrint.failed")} ${detail}`);
  } finally {
    printing.value = false;
  }
}
watch(
  [
    () => props.visible,
    documentPreview,
    () => props.imageAssetUrls,
    () => props.theme,
    repaint,
    selected,
    zoom,
  ],
  async () => {
    if (!props.visible) return;
    if (selected.value >= pages.value.length) selected.value = Math.max(0, pages.value.length - 1);
    await nextTick();
    render();
  },
  { immediate: true, flush: "post" },
);
let resourceGeneration = 0;
watch(
  () => [
    props.visible,
    props.sheet,
    props.workbookRevision,
    props.imageAssetUrls,
    props.theme,
    props.evaluator,
    props.textBoxReferenceResolver,
    props.resolveChartSheet,
    props.locale,
    props.dateSystem,
    effectiveSetup.value,
    props.fileName,
    equationResourceRevision.value,
  ],
  async () => {
    const request = ++resourceGeneration;
    if (!props.visible) {
      renderer.clearCharts();
      return;
    }
    const document = documentPreview.value;
    if (!document) return;
    equationFailure.value = undefined;
    chartFailure.value = undefined;
    const sourceCurrent = captureChartOwner();
    const isCurrent = () => request === resourceGeneration && sourceCurrent();
    try {
      const urls = [
        ...getPrintPictureAssetIds(document.sheet, document.shapeMetrics, document.shapeRenderPass),
      ].map((id) => props.imageAssetUrls?.get(id));
      if (urls.some((url) => !url)) throw new Error("Print paint resources are unavailable.");
      await Promise.all([
        renderer.prepareImages(urls as string[], document),
        renderer.prepareShapes(document),
      ]);
      if (!isCurrent()) return;
      await renderer.prepareChartFonts(document, { isCurrent });
      await renderer.prepareEquations(document, { isCurrent });
      await renderer.prepareCharts(document, { isCurrent });
      if (request === resourceGeneration && props.visible) repaint.value++;
    } catch (error) {
      if (request === resourceGeneration && props.visible) {
        renderFailure.value = error instanceof Error ? error.message : String(error);
        if (error instanceof ChartPrintUnavailableError) chartFailure.value = renderFailure.value;
        else if (document.equationPrintPass?.entries.length)
          equationFailure.value = renderFailure.value;
      }
    }
  },
  { immediate: true },
);
onBeforeUnmount(() => {
  resourceGeneration++;
  renderer.dispose();
});
</script>

<template>
  <TDialog
    :visible="visible"
    :header="t('pagePrint.title')"
    width="min(1120px, calc(100vw - 32px))"
    placement="center"
    class="page-print-preview"
    :confirm-btn="null"
    :cancel-btn="null"
    :close-on-overlay-click="false"
    @close="close"
  >
    <div class="page-print-preview__options">
      <RadioGroup v-model="scope" :disabled="printing" :aria-label="t('pagePrint.scope')">
        <Radio value="sheet">{{ t("pagePrint.sheet") }}</Radio>
        <Radio value="selection" :disabled="!selection">{{ t("pagePrint.selection") }}</Radio>
      </RadioGroup>
      <div role="group" :aria-label="t('pagePrint.fromPage')">
        <span>{{ t("pagePrint.fromPage") }}</span>
        <InputNumber
          v-model="pageFrom"
          :min="1"
          :max="pages.length || 1"
          :decimal-places="0"
          :disabled="printing"
          theme="column"
          class="sheetcraft-input-number--persistent-controls"
          :aria-label="t('pagePrint.fromPage')"
        />
      </div>
      <div role="group" :aria-label="t('pagePrint.toPage')">
        <span>{{ t("pagePrint.toPage") }}</span>
        <InputNumber
          v-model="pageTo"
          :min="1"
          :max="pages.length || 1"
          :decimal-places="0"
          :disabled="printing"
          theme="column"
          class="sheetcraft-input-number--persistent-controls"
          :aria-label="t('pagePrint.toPage')"
        />
      </div>
      <div role="group" :aria-label="t('pagePrint.zoom')">
        <span>{{ t("pagePrint.zoom") }}</span>
        <InputNumber
          v-model="zoom"
          :min="25"
          :max="200"
          :step="10"
          :decimal-places="0"
          theme="column"
          class="sheetcraft-input-number--persistent-controls"
          :aria-label="t('pagePrint.zoom')"
        />
      </div>
      <TButton
        theme="default"
        variant="base"
        :disabled="printing || setupDisabled"
        @click="emit('pageSetup')"
        >{{ t("pageLayout.pageSetup") }}</TButton
      >
    </div>
    <p v-if="!validPageRange && pages.length" role="alert">{{ t("pagePrint.invalidPages") }}</p>
    <div class="page-print-preview__body">
      <aside class="page-print-preview__thumbnails" :aria-label="t('pagePrint.thumbnails')">
        <button
          v-for="{ page, index } in thumbnailPages"
          :key="page.pageNumber"
          type="button"
          :class="{ 'is-active': index === selected }"
          :aria-label="t('pageLayout.pageNumber', { page: page.pageNumber })"
          @click="selected = index"
        >
          <canvas :ref="(element) => setThumbnail(page.pageNumber, element)" />
          <span>{{ page.pageNumber }}</span>
        </button>
      </aside>
      <section class="page-print-preview__page" :aria-label="t('pagePrint.preview')">
        <p v-if="!documentPreview" role="alert">
          {{ t(previewResult.errorKey ?? "pagePrint.invalidRange") }}
        </p>
        <p v-else-if="chartFailure" role="alert">
          {{ t("pagePrint.unsupportedCharts") }} {{ chartFailure }}
        </p>
        <p v-else-if="chartPreparing && !equationFailure" role="status">
          {{ t("pagePrint.preparingCharts") }}
        </p>
        <p v-else-if="equationPreparing && !equationFailure" role="status">
          {{ t("pagePrint.preparingEquations") }}
        </p>
        <p v-else-if="equationFailure" role="alert">
          {{ t("pagePrint.unsupportedEquations") }} {{ equationFailure }}
        </p>
        <canvas v-else ref="pageCanvas" />
        <p v-if="renderFailure && !equationFailure && !chartFailure" role="alert">
          {{ t("pagePrint.failed") }} {{ renderFailure }}
        </p>
        <p v-if="activePage">
          {{ t("pagePrint.pageOf", { page: activePage.pageNumber, count: pages.length }) }}
        </p>
      </section>
    </div>
    <template #footer>
      <div class="page-print-preview__footer">
        <TButton theme="default" variant="base" :disabled="!canPrevious" @click="selected -= 1"
          ><ChevronLeft :size="15" aria-hidden="true" />{{ t("pagePrint.previous") }}</TButton
        >
        <TButton theme="default" variant="base" :disabled="!canNext" @click="selected += 1"
          >{{ t("pagePrint.next") }}<ChevronRight :size="15" aria-hidden="true"
        /></TButton>
        <span />
        <TButton theme="default" variant="base" @click="close">{{ t("pagePrint.close") }}</TButton>
        <TButton
          theme="primary"
          :loading="printing"
          :disabled="
            !documentPreview ||
            preparing ||
            Boolean(renderFailure) ||
            Boolean(equationFailure) ||
            Boolean(chartFailure) ||
            !validPageRange
          "
          @click="print"
          ><Printer :size="15" aria-hidden="true" />{{ t("pagePrint.print") }}</TButton
        >
      </div>
    </template>
  </TDialog>
</template>

<style scoped lang="scss">
.page-print-preview {
  &__options {
    display: flex;
    flex-wrap: wrap;
    gap: 8px 12px;
    align-items: center;
    margin-bottom: 12px;
    [role="group"] {
      display: flex;
      gap: 6px;
      align-items: center;
    }
    [role="group"] > :last-child {
      width: 88px;
    }
  }
  &__body {
    display: grid;
    grid-template-columns: 164px minmax(0, 1fr);
    height: min(600px, calc(100vh - 300px));
    min-height: 100px;
    overflow: hidden;
    background: var(--sheetcraft-surface-secondary);
  }
  &__thumbnails {
    overflow: auto;
    padding: 12px;
    display: grid;
    align-content: start;
    gap: 10px;
    background: var(--sheetcraft-surface-panel);
    border-right: 1px solid var(--sheetcraft-border-subtle);
  }
  &__thumbnails button {
    display: grid;
    justify-items: center;
    gap: 4px;
    padding: 6px;
    border: 1px solid transparent;
    background: transparent;
    color: var(--sheetcraft-text-secondary);
    cursor: pointer;
  }
  &__thumbnails button.is-active {
    border-color: var(--sheetcraft-action-primary);
    background: var(--sheetcraft-action-primary-subtle);
    color: var(--sheetcraft-action-primary);
  }
  &__thumbnails canvas {
    max-width: 132px;
    height: auto;
    box-shadow: 0 1px 3px rgb(0 0 0 / 18%);
  }
  &__page {
    display: grid;
    align-content: start;
    justify-items: safe center;
    gap: 10px;
    overflow: auto;
    padding: 24px;
  }
  &__page canvas {
    max-width: none;
    height: auto;
    box-shadow: 0 3px 14px rgb(0 0 0 / 20%);
  }
  &__page p {
    margin: 0;
    color: var(--sheetcraft-text-secondary);
  }
  &__footer {
    display: grid;
    grid-template-columns: auto auto 1fr auto auto;
    gap: 8px;
    align-items: center;
  }
}
</style>
