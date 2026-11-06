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

import {
  collectPrintJobPages,
  writePrintOutput,
  type PrintSheetSource,
  type PrintOutputPage,
} from "../page-print-job";

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
    workbookSheets?: readonly PrintSheetSource[];
    displayedNoteKeys?: ReadonlySet<string>;
    setupDisabled?: boolean;
  }>(),
  { fileName: "workbook.xlsx", locale: "en-US", dateSystem: "1900" },
);
const emit = defineEmits<{ "update:visible": [value: boolean]; pageSetup: [] }>();
const { t } = useAppI18n();
const selected = ref(0);
const scope = ref<"sheet" | "selection" | "workbook">("sheet");
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
const resourcePreparing = ref(false);
const resourceFailure = ref<string>();
let mounted = true;
const renderFailure = ref<string>();
const equationFailure = ref<string>();
const chartFailure = ref<string>();
const thumbnailCanvases = new Map<number, HTMLCanvasElement>();
const pageCanvas = ref<HTMLCanvasElement>();
const repaint = ref(0);
const equationResourceRevision = ref(0);
const thumbnailWindowSize = 9;
const renderers = new Map<Sheet, ReturnType<typeof createPrintPreviewRenderer>>();
function rendererFor(sheet: Sheet) {
  let renderer = renderers.get(sheet);
  if (!renderer) {
    const invalidate = () => {
      equationResourceRevision.value++;
      repaint.value++;
    };
    renderer = createPrintPreviewRenderer(
      () => {
        repaint.value++;
      },
      invalidate,
      invalidate,
    );
    renderers.set(sheet, renderer);
  }
  return renderer;
}
const printSources = computed<readonly PrintSheetSource[]>(() =>
  scope.value === "workbook"
    ? (props.workbookSheets ?? []).filter(({ sheet }) => !sheet.properties.hidden)
    : [
        {
          sheet: props.sheet,
          evaluator: props.evaluator,
          setup: effectiveSetup.value,
          displayedNoteKeys: props.displayedNoteKeys,
        },
      ],
);
watch(printSources, (sources) => {
  const retained = new Set(sources.map(({ sheet }) => sheet));
  for (const [sheet, renderer] of renderers) {
    if (!retained.has(sheet)) {
      renderer.dispose();
      renderers.delete(sheet);
    }
  }
});

function captureChartOwner() {
  const sheet = props.sheet,
    evaluator = props.evaluator,
    revision = props.workbookRevision,
    resolver = props.resolveChartSheet,
    sources = printSources.value;
  return () =>
    mounted &&
    props.visible &&
    props.sheet === sheet &&
    props.evaluator === evaluator &&
    props.workbookRevision === revision &&
    props.resolveChartSheet === resolver &&
    printSources.value === sources;
}

const previewResult = computed<{
  documents?: PrintPreviewDocument[];
  errorKey?:
    | "pagePrint.unsupportedPictures"
    | "pagePrint.unsupportedEquations"
    | "pagePrint.unsupportedCharts"
    | "pagePrint.invalidRange"
    | "drawing.textBoxReferenceUnavailable";
}>(() => {
  void repaint.value;
  try {
    const result = printSources.value.map((source) =>
      createPrintPreviewDocument({
        theme: props.theme,
        sheet: source.sheet,
        evaluator: source.evaluator,
        setup: source.setup,
        displayedNoteKeys: source.displayedNoteKeys,
        sheetName: source.sheet.name,
        fileName: props.fileName,
        locale: props.locale,
        dateSystem: props.dateSystem,
        revision: props.workbookRevision,
        textBoxReferenceResolver: props.textBoxReferenceResolver,
        shapePaintResources: rendererFor(source.sheet).getShapePaintResources(
          props.theme,
          props.imageAssetUrls,
        ),
        nativeEquationConsumer: true,
        nativeChartConsumer: true,
        resolveChartSheet: props.resolveChartSheet,
        isChartSourceCurrent: captureChartOwner(),
      }),
    );
    collectPrintJobPages(result);
    return { documents: result };
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
const documentsPreview = computed(() => previewResult.value.documents ?? []);
const equationPreparing = computed(() => {
  void repaint.value;
  return documentsPreview.value.some(
    (document) => !rendererFor(document.sheet).equationsReady(document),
  );
});
const chartPreparing = computed(() => {
  void repaint.value;
  return documentsPreview.value.some(
    (document) => !rendererFor(document.sheet).chartsReady(document),
  );
});
const preparing = computed(
  () => resourcePreparing.value || equationPreparing.value || chartPreparing.value,
);
const pages = computed(() => collectPrintJobPages(documentsPreview.value));
const validPageRange = computed(
  () =>
    Number.isInteger(pageFrom.value) &&
    Number.isInteger(pageTo.value) &&
    pageFrom.value >= 1 &&
    pageTo.value >= pageFrom.value &&
    pageTo.value <= pages.value.length,
);
watch(
  [() => pages.value.length, scope],
  ([count]) => {
    selected.value = 0;
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
  if (preparing.value || resourceFailure.value) return;
  renderFailure.value = undefined;
  try {
    renderPages();
  } catch (error) {
    renderFailure.value = error instanceof Error ? error.message : String(error);
  }
}
function renderPages(): void {
  if (!props.visible) return;
  for (const { page: entry } of thumbnailPages.value) {
    const canvas = thumbnailCanvases.get(entry.pageNumber);
    if (canvas)
      rendererFor(entry.document.sheet).render({
        canvas,
        document: entry.document,
        page: entry.page,
        imageAssetUrls: props.imageAssetUrls,
        theme: props.theme,
        scale: 0.15,
        density: 1,
      });
  }
  const entry = activePage.value;
  if (pageCanvas.value && entry)
    rendererFor(entry.document.sheet).render({
      canvas: pageCanvas.value,
      document: entry.document,
      page: entry.page,
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
  for (const renderer of renderers.values()) renderer.clearCharts();
  emit("update:visible", false);
}
async function print(): Promise<void> {
  if (
    printing.value ||
    !documentsPreview.value.length ||
    preparing.value ||
    equationFailure.value ||
    chartFailure.value ||
    renderFailure.value ||
    resourceFailure.value ||
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
    const sources = printSources.value;
    const previews = documentsPreview.value;
    const revision = props.workbookRevision,
      theme = props.theme,
      assetUrls = props.imageAssetUrls,
      fileName = props.fileName,
      locale = props.locale,
      dateSystem = props.dateSystem,
      textBoxReferenceResolver = props.textBoxReferenceResolver,
      resolveChartSheet = props.resolveChartSheet,
      from = pageFrom.value,
      to = pageTo.value;
    const sourceCurrent = captureChartOwner();
    const isCurrent = () =>
      sourceCurrent() &&
      !printWindow.closed &&
      pageFrom.value === from &&
      pageTo.value === to &&
      props.theme === theme &&
      props.imageAssetUrls === assetUrls &&
      props.fileName === fileName &&
      props.locale === locale &&
      props.dateSystem === dateSystem &&
      props.textBoxReferenceResolver === textBoxReferenceResolver;
    const documents: PrintPreviewDocument[] = [];
    for (const [index, source] of sources.entries()) {
      if (!isCurrent()) {
        printWindow.close();
        return;
      }
      const renderer = rendererFor(source.sheet);
      const preview = previews[index]!;
      const urls = [
        ...getPrintPictureAssetIds(preview.sheet, preview.shapeMetrics, preview.shapeRenderPass),
      ].map((id) => assetUrls?.get(id));
      if (urls.some((url) => !url)) throw new Error("Image assets are not ready.");
      await renderer.prepareImages(urls as string[], preview);
      await renderer.prepareShapes(preview);
      if (!isCurrent()) {
        printWindow.close();
        return;
      }
      // Rebuild each sheet after font/image readiness without mutating page setup.
      const document = createPrintPreviewDocument({
        sheet: source.sheet,
        evaluator: source.evaluator,
        setup: source.setup,
        displayedNoteKeys: source.displayedNoteKeys,
        theme,
        sheetName: source.sheet.name,
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
      documents.push(document);
    }
    const finalPages = collectPrintJobPages(documents);
    if (to > finalPages.length) throw new Error(t("pagePrint.invalidPages"));
    const images: PrintOutputPage[] = finalPages.slice(from - 1, to).map(({ document, page }) => {
      const canvas = window.document.createElement("canvas");
      rendererFor(document.sheet).render({
        canvas,
        document,
        page,
        imageAssetUrls: assetUrls,
        theme,
        scale: 1,
        density: 2,
      });
      const paper = document.pagination.paperSize;
      return {
        source: canvas.toDataURL("image/png"),
        widthMm: ((paper.width * document.pagination.printScale) / 96) * 25.4,
        heightMm: ((paper.height * document.pagination.printScale) / 96) * 25.4,
      };
    });
    const printDocument = printWindow.document;
    writePrintOutput(printDocument, fileName, images);
    printWindow.addEventListener(
      "load",
      () => {
        if (!isCurrent()) {
          printWindow.close();
          return;
        }
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
    documentsPreview,
    () => props.imageAssetUrls,
    () => props.theme,
    repaint,
    resourcePreparing,
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
    printSources.value,
    props.fileName,
    equationResourceRevision.value,
  ],
  async () => {
    const request = ++resourceGeneration;
    resourcePreparing.value = false;
    resourceFailure.value = undefined;
    if (!props.visible) {
      for (const renderer of renderers.values()) renderer.clearCharts();
      return;
    }
    const documents = documentsPreview.value;
    if (!documents.length) return;
    resourcePreparing.value = true;
    equationFailure.value = undefined;
    chartFailure.value = undefined;
    renderFailure.value = undefined;
    const sourceCurrent = captureChartOwner();
    const isCurrent = () => request === resourceGeneration && sourceCurrent();
    try {
      for (const document of documents) {
        const renderer = rendererFor(document.sheet);
        const urls = [
          ...getPrintPictureAssetIds(
            document.sheet,
            document.shapeMetrics,
            document.shapeRenderPass,
          ),
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
        if (!isCurrent()) return;
      }
      repaint.value++;
    } catch (error) {
      if (isCurrent()) {
        resourceFailure.value = error instanceof Error ? error.message : String(error);
        renderFailure.value = resourceFailure.value;
        if (error instanceof ChartPrintUnavailableError) chartFailure.value = renderFailure.value;
        else if (error instanceof EquationPrintUnavailableError)
          equationFailure.value = renderFailure.value;
      }
    } finally {
      if (request === resourceGeneration) resourcePreparing.value = false;
    }
  },
  { immediate: true },
);
onBeforeUnmount(() => {
  mounted = false;
  resourceGeneration++;
  for (const renderer of renderers.values()) renderer.dispose();
  renderers.clear();
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
        <Radio
          value="workbook"
          :disabled="!workbookSheets?.some(({ sheet }) => !sheet.properties.hidden)"
          >{{ t("pagePrint.workbook") }}</Radio
        >
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
        :disabled="printing || setupDisabled || scope === 'workbook'"
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
          <span
            >{{ page.pageNumber
            }}<template v-if="scope === 'workbook'">
              · {{ page.document.sheetName }}</template
            ></span
          >
        </button>
      </aside>
      <section class="page-print-preview__page" :aria-label="t('pagePrint.preview')">
        <p v-if="!documentsPreview.length" role="alert">
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
        <p v-else-if="resourcePreparing" role="status">{{ t("pagePrint.preparingResources") }}</p>
        <canvas v-else ref="pageCanvas" />
        <p v-if="renderFailure && !equationFailure && !chartFailure" role="alert">
          {{ t("pagePrint.failed") }} {{ renderFailure }}
        </p>
        <p v-if="activePage">
          <template v-if="scope === 'workbook'">{{ activePage.document.sheetName }} · </template
          >{{ t("pagePrint.pageOf", { page: activePage.pageNumber, count: pages.length }) }}
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
            !documentsPreview.length ||
            preparing ||
            Boolean(renderFailure) ||
            Boolean(resourceFailure) ||
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
