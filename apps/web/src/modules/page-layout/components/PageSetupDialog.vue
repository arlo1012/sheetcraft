<script setup lang="ts">
import { ref, watch } from "vue";
import { Dialog } from "tdesign-vue-next/es/dialog";
import { TabPanel as TTabPanel, Tabs as TTabs } from "tdesign-vue-next/es/tabs";
import { cloneSheetPageSetup, type SheetPageSetup } from "@sheetcraft/core/page-setup";
import { useAppI18n } from "../../../shared/i18n";
import type { HeaderFooterEditTarget } from "../header-footer-editor";
import {
  createPageSetupReferences,
  parsePageSetupRange,
  parsePageSetupTitle,
  type PageSetupReferences,
  type PageSetupReferenceField,
  type PageSetupReferenceErrors,
} from "../page-setup-inputs";
import PageSetupPagePanel from "./PageSetupPagePanel.vue";
import PageSetupMarginsPanel from "./PageSetupMarginsPanel.vue";
import PageSetupHeaderFooterPanel from "./PageSetupHeaderFooterPanel.vue";
import PageSetupSheetPanel from "./PageSetupSheetPanel.vue";
import CustomHeaderFooterDialog from "./CustomHeaderFooterDialog.vue";

type Tab = "page" | "margins" | "header-footer" | "sheet";
const props = defineProps<{
  visible: boolean;
  setup: SheetPageSetup;
  initialTab?: Tab;
  headerFooterTarget?: HeaderFooterEditTarget;
  suspended?: boolean;
  sheetName?: string;
  fileName?: string;
  selectReference?: (
    current: string,
    field: PageSetupReferenceField,
  ) => Promise<string | undefined>;
}>();
const emit = defineEmits<{
  "update:visible": [value: boolean];
  confirm: [setup: SheetPageSetup];
}>();
const { t } = useAppI18n();
const draft = ref<SheetPageSetup>(cloneSheetPageSetup(props.setup));
const activeTab = ref<Tab>("page");
const draftGeneration = ref(0);
const references = ref<PageSetupReferences>(createPageSetupReferences(draft.value));
const referenceErrors = ref<PageSetupReferenceErrors>({});
const setupError = ref("");
const customVisible = ref(false);
const customTarget = ref<HeaderFooterEditTarget>();

function openCustom(target: HeaderFooterEditTarget): void {
  customTarget.value = target;
  customVisible.value = true;
}
function saveCustom(setup: SheetPageSetup): void {
  draft.value = setup;
  customVisible.value = false;
}
function resetDraft(): void {
  draft.value = cloneSheetPageSetup(props.setup);
  draftGeneration.value += 1;
  references.value = createPageSetupReferences(draft.value);
  referenceErrors.value = {};
  setupError.value = "";
  activeTab.value = props.headerFooterTarget ? "header-footer" : (props.initialTab ?? "page");
  customVisible.value = false;
  customTarget.value = undefined;
}
function confirm(): void {
  const printArea = parsePageSetupRange(references.value.printArea);
  const rows = parsePageSetupTitle(references.value.titleRows, "row");
  const columns = parsePageSetupTitle(references.value.titleColumns, "column");
  const bottomRows = parsePageSetupTitle(references.value.bottomTitleRows, "row");
  const errors: PageSetupReferenceErrors = {};
  if (printArea === undefined) errors.printArea = t("pageLayout.invalidPrintArea");
  if (rows === undefined) errors.titleRows = t("pageLayout.invalidTitleRows");
  if (columns === undefined) errors.titleColumns = t("pageLayout.invalidTitleColumns");
  if (bottomRows === undefined) errors.bottomTitleRows = t("pageLayout.invalidTitleRows");
  referenceErrors.value = errors;
  if (
    printArea === undefined ||
    rows === undefined ||
    columns === undefined ||
    bottomRows === undefined
  ) {
    activeTab.value = "sheet";
    return;
  }
  try {
    const setup = cloneSheetPageSetup({
      ...draft.value,
      printArea,
      printTitles: { rows, columns, bottomRows },
    });
    setupError.value = "";
    emit("confirm", setup);
  } catch {
    setupError.value = t("pageLayout.invalidPageSetup");
  }
}
function close(): void {
  customVisible.value = false;
  emit("update:visible", false);
}
watch(
  () => [props.visible, props.setup] as const,
  ([visible]) => {
    if (visible) resetDraft();
    else customVisible.value = false;
  },
  { deep: true, immediate: true },
);
watch(
  () => props.headerFooterTarget,
  (target) => {
    if (props.visible && target) {
      activeTab.value = "header-footer";
    }
  },
  { deep: true },
);
</script>

<template>
  <Dialog
    :visible="visible && !suspended"
    :header="t('pageLayout.pageSetup')"
    width="min(560px, calc(100vw - 32px))"
    :confirm-btn="t('pageLayout.confirm')"
    :cancel-btn="t('pageLayout.cancel')"
    :close-on-overlay-click="false"
    :confirm-on-enter="false"
    @confirm="confirm"
    @close="close"
  >
    <div class="page-setup-dialog">
      <TTabs :key="draftGeneration" v-model="activeTab" class="page-setup-dialog__tabs">
        <TTabPanel value="page" :label="t('pageLayout.page')"
          ><PageSetupPagePanel v-model:setup="draft"
        /></TTabPanel>
        <TTabPanel value="margins" :label="t('pageLayout.margins')"
          ><PageSetupMarginsPanel v-model:setup="draft"
        /></TTabPanel>
        <TTabPanel value="header-footer" :label="t('pageLayout.headerFooterTools')"
          ><PageSetupHeaderFooterPanel
            v-model:setup="draft"
            :sheet-name="sheetName"
            :file-name="fileName"
            @custom-edit="openCustom"
        /></TTabPanel>
        <TTabPanel value="sheet" :label="t('pageLayout.worksheet')"
          ><PageSetupSheetPanel
            v-model:setup="draft"
            v-model:references="references"
            :errors="referenceErrors"
            :select-reference="selectReference"
        /></TTabPanel>
      </TTabs>
      <p v-if="setupError" class="page-setup-dialog__error" role="alert">{{ setupError }}</p>
    </div>
  </Dialog>
  <CustomHeaderFooterDialog
    v-if="customVisible"
    v-model:visible="customVisible"
    :setup="draft"
    :target="customTarget"
    @confirm="saveCustom"
  />
</template>

<style scoped lang="scss">
.page-setup-dialog {
  min-width: 0;
  &__tabs {
    min-width: 0;
  }
  &__error {
    margin: var(--sheetcraft-space-2) 0 0;
    color: var(--sheetcraft-status-error);
  }
}
</style>
