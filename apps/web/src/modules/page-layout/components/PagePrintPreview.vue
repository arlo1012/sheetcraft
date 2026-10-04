<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from "vue";
import { Dialog as TDialog } from "tdesign-vue-next/es/dialog";
import { MessagePlugin } from "tdesign-vue-next/es/message";
import { Button as TButton } from "tdesign-vue-next/es/button";
import { ChevronLeft, ChevronRight, Printer } from "lucide-vue-next";
import type { Sheet, SheetEvaluator } from "@idea10/core/workbook";
import type { SheetPageSetup } from "@idea10/core/page-setup";
import type { WorkbookTheme } from "@idea10/core/workbook-theme";
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
    imageAssetUrls?: ReadonlyMap<string, string>;
    theme?: WorkbookTheme;
  }>(),
  { fileName: "workbook.xlsx", locale: "en-US", dateSystem: "1900" },
);
const emit = defineEmits<{ "update:visible": [value: boolean] }>();
const { t } = useAppI18n();
const selected = ref(0);
const printing = ref(false);
const thumbnailCanvases = new Map<number, HTMLCanvasElement>();
const pageCanvas = ref<HTMLCanvasElement>();
const repaint = ref(0);
const thumbnailWindowSize = 9;
const renderer = createPrintPreviewRenderer(() => {
  repaint.value += 1;
});

const documentPreview = computed<PrintPreviewDocument | undefined>(() => {
  try {
    const result = createPrintPreviewDocument({
      theme: props.theme,
      sheet: props.sheet,
      evaluator: props.evaluator,
      setup: props.setup,
      sheetName: props.sheet.name,
      fileName: props.fileName,
      locale: props.locale,
      dateSystem: props.dateSystem,
      revision: props.workbookRevision,
    });
    return result;
  } catch {
    return undefined;
  }
});
const pages = computed(() => documentPreview.value?.pages ?? []);
const activePage = computed(() => pages.value[selected.value] ?? pages.value[0]);
const canPrevious = computed(() => selected.value > 0);
const canNext = computed(() => selected.value < pages.value.length - 1);
const thumbnailPages = computed(() => {
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
      scale: 0.6,
      density: 1,
    });
}
function setThumbnail(pageNumber: number, element: unknown): void {
  if (element instanceof HTMLCanvasElement) thumbnailCanvases.set(pageNumber, element);
  else thumbnailCanvases.delete(pageNumber);
}
function close(): void {
  emit("update:visible", false);
}
async function print(): Promise<void> {
  if (printing.value || !documentPreview.value) return;
  const printWindow = window.open("", "_blank");
  if (!printWindow) {
    void MessagePlugin.error(t("pagePrint.popupBlocked"));
    return;
  }
  printing.value = true;
  try {
    printWindow.opener = null;
    const document = documentPreview.value;
    const assetIds = new Set(document.sheet.floatingImages.map((image) => image.assetId));
    for (const cell of document.sheet.cells.values())
      if (cell.content?.kind === "image") assetIds.add(cell.content.image.assetId);
    const watermarkAssetId = document.sheet.pageDecoration?.watermark?.image?.assetId;
    if (watermarkAssetId) assetIds.add(watermarkAssetId);
    const urls = [...assetIds].map((id) => props.imageAssetUrls?.get(id));
    if (urls.some((url) => !url)) throw new Error("Image assets are not ready.");
    await renderer.prepareImages(urls as string[]);
    if (!props.visible || printWindow.closed) {
      printWindow.close();
      return;
    }
    const images = document.pages.map((page) => {
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
  } catch {
    printWindow.close();
    void MessagePlugin.error(t("pagePrint.failed"));
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
  ],
  async () => {
    if (!props.visible) return;
    if (selected.value >= pages.value.length) selected.value = Math.max(0, pages.value.length - 1);
    await nextTick();
    render();
  },
  { immediate: true, flush: "post" },
);
onBeforeUnmount(() => renderer.dispose());
</script>

<template>
  <TDialog
    :visible="visible"
    :header="t('pagePrint.title')"
    width="min(1120px, calc(100vw - 32px))"
    class="page-print-preview"
    :confirm-btn="null"
    :cancel-btn="null"
    :close-on-overlay-click="false"
    @close="close"
  >
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
        <p v-if="!documentPreview" role="alert">{{ t("pagePrint.invalidRange") }}</p>
        <canvas v-else ref="pageCanvas" />
        <p v-if="activePage">
          {{ t("pagePrint.pageOf", { page: activePage.pageNumber, count: pages.length }) }}
        </p>
      </section>
    </div>
    <template #footer>
      <div class="page-print-preview__footer">
        <TButton variant="outline" :disabled="!canPrevious" @click="selected -= 1"
          ><ChevronLeft :size="15" aria-hidden="true" />{{ t("pagePrint.previous") }}</TButton
        >
        <TButton variant="outline" :disabled="!canNext" @click="selected += 1"
          >{{ t("pagePrint.next") }}<ChevronRight :size="15" aria-hidden="true"
        /></TButton>
        <span />
        <TButton variant="outline" @click="close">{{ t("pagePrint.close") }}</TButton>
        <TButton theme="primary" :loading="printing" :disabled="!documentPreview" @click="print"
          ><Printer :size="15" aria-hidden="true" />{{ t("pagePrint.print") }}</TButton
        >
      </div>
    </template>
  </TDialog>
</template>

<style scoped lang="scss">
.page-print-preview {
  &__body {
    display: grid;
    grid-template-columns: 164px minmax(0, 1fr);
    height: min(640px, calc(100vh - 220px));
    min-height: 200px;
    overflow: hidden;
    background: var(--idea-surface-secondary);
  }
  &__thumbnails {
    overflow: auto;
    padding: 12px;
    display: grid;
    align-content: start;
    gap: 10px;
    background: var(--idea-surface-panel);
    border-right: 1px solid var(--idea-border-subtle);
  }
  &__thumbnails button {
    display: grid;
    justify-items: center;
    gap: 4px;
    padding: 6px;
    border: 1px solid transparent;
    background: transparent;
    color: var(--idea-text-secondary);
    cursor: pointer;
  }
  &__thumbnails button.is-active {
    border-color: var(--idea-action-primary);
    background: var(--idea-action-primary-subtle);
    color: var(--idea-action-primary);
  }
  &__thumbnails canvas {
    max-width: 132px;
    height: auto;
    box-shadow: 0 1px 3px rgb(0 0 0 / 18%);
  }
  &__page {
    display: grid;
    place-content: center;
    justify-items: center;
    gap: 10px;
    overflow: auto;
    padding: 24px;
  }
  &__page canvas {
    max-width: 100%;
    height: auto;
    box-shadow: 0 3px 14px rgb(0 0 0 / 20%);
  }
  &__page p {
    margin: 0;
    color: var(--idea-text-secondary);
  }
  &__footer {
    display: grid;
    grid-template-columns: auto auto 1fr auto auto;
    gap: 8px;
    align-items: center;
  }
}
</style>
