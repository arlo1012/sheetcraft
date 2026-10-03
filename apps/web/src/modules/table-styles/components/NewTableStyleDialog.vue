<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { Button as TButton } from "tdesign-vue-next/es/button";
import { Checkbox as TCheckbox } from "tdesign-vue-next/es/checkbox";
import { Dialog } from "tdesign-vue-next/es/dialog";
import { Input as TInput } from "tdesign-vue-next/es/input";
import { InputNumber as TInputNumber } from "tdesign-vue-next/es/input-number";
import type { CellFormatChange } from "@idea10/core/commands";
import {
  TABLE_STYLE_ELEMENTS,
  type TableStyleDefinition,
  type TableStyleElement,
  type TableStyleElementFormat,
} from "@idea10/core/table-styles";
import {
  PIVOT_TABLE_STYLE_ELEMENTS,
  type PivotTableStyleDefinition,
  type PivotTableStyleElement,
} from "@idea10/core/pivot-table-styles";
import CellFormatDialog from "../../cell-format/components/CellFormatDialog.vue";
import { useAppI18n } from "../../../shared/i18n";
import {
  mergeStyleFormatChange,
  styleFormatToBorderState,
  stylePatchToSelectionState,
  type StyleFormatDraft,
} from "../../../shared/cell-format/style-format-dialog";
import { createBrowserIdFactory } from "../../../shared/runtime/browser-id-factory";
import OptionList from "../../../shared/option-list/OptionList.vue";
import TableStylePreview from "./TableStylePreview.vue";
import type { TableStylesMessageKey } from "../table-style-messages";

type EditableStyle = TableStyleDefinition | PivotTableStyleDefinition;
type EditableStyleElement = TableStyleElement | PivotTableStyleElement;

const props = withDefaults(
  defineProps<{
    existingNames: readonly string[];
    kind?: "table" | "pivot";
    style?: EditableStyle;
    defaultStyleId?: string;
    dateSystem?: "1900" | "1904";
  }>(),
  { kind: "table", style: undefined, defaultStyleId: undefined, dateSystem: "1900" },
);
const emit = defineEmits<{
  confirm: [value: { style: TableStyleDefinition; setAsDefault: boolean }];
  confirmPivot: [value: { style: PivotTableStyleDefinition; setAsDefault: boolean }];
  cancel: [];
}>();
const { t } = useAppI18n();
const idFactory = createBrowserIdFactory();
const selectedElement = ref<EditableStyleElement>("wholeTable");
const formatDialogOpen = ref(false);
const name = ref("");
const setAsDefault = ref(false);
const draft = ref<EditableStyle>(createDraft());

const availableElements = computed<readonly EditableStyleElement[]>(() =>
  props.kind === "pivot" ? PIVOT_TABLE_STYLE_ELEMENTS : TABLE_STYLE_ELEMENTS,
);
const elementOptions = computed(() =>
  availableElements.value.map((element) => ({ value: element, label: t(elementLabel(element)) })),
);
const title = computed(() => {
  if (props.kind === "pivot")
    return props.style ? t("tableStyles.pivotEditTitle") : t("tableStyles.pivotCreateTitle");
  return props.style ? t("tableStyles.editTitle") : t("tableStyles.createTitle");
});
const selectedFormat = computed<TableStyleElementFormat | undefined>(
  () =>
    (draft.value.elements as Partial<Record<EditableStyleElement, TableStyleElementFormat>>)[
      selectedElement.value
    ],
);
const stripeElement = computed(
  () =>
    selectedElement.value === "firstColumnStripe" ||
    selectedElement.value === "secondColumnStripe" ||
    selectedElement.value === "firstRowStripe" ||
    selectedElement.value === "secondRowStripe",
);
const duplicateName = computed(() => {
  const candidate = name.value.trim().toLocaleLowerCase();
  return (
    candidate.length > 0 &&
    props.existingNames.some(
      (item) => item.toLocaleLowerCase() === candidate && item !== props.style?.name,
    )
  );
});

function nextStyleName(): string {
  const key =
    props.kind === "pivot" ? "tableStyles.pivotNamePlaceholder" : "tableStyles.namePlaceholder";
  const existing = new Set(props.existingNames.map((value) => value.trim().toLocaleLowerCase()));
  let index = 1;
  let candidate = t(key, { index });
  while (existing.has(candidate.toLocaleLowerCase())) candidate = t(key, { index: ++index });
  return candidate;
}

function createDraft(): EditableStyle {
  const style = props.style
    ? (JSON.parse(JSON.stringify(props.style)) as EditableStyle)
    : undefined;
  name.value = style?.name ?? nextStyleName();
  setAsDefault.value = Boolean(style && style.id === props.defaultStyleId);
  return (
    style ?? {
      id: idFactory(props.kind === "pivot" ? "pivot-custom" : "table-custom"),
      name: name.value,
      category: "custom",
      elements: { wholeTable: { style: {} } },
    }
  );
}

function chooseElement(element: EditableStyleElement): void {
  selectedElement.value = element;
}
function elementLabel(element: EditableStyleElement): TableStylesMessageKey {
  if (props.kind === "pivot" && element === "totalRow") return "tableStyles.pivotGrandTotalRow";
  if (props.kind === "pivot" && element === "lastColumn")
    return "tableStyles.pivotGrandTotalColumn";
  return `tableStyles.${element}`;
}

function selectedDraft(): StyleFormatDraft {
  const format = selectedFormat.value;
  const draft: StyleFormatDraft = {
    style: { ...format?.style },
  };
  if (format?.innerHorizontal !== undefined) draft.innerHorizontal = format.innerHorizontal;
  if (format?.innerVertical !== undefined) draft.innerVertical = format.innerVertical;
  return draft;
}

function openFormat(): void {
  formatDialogOpen.value = true;
}

function saveFormat(change: CellFormatChange): void {
  const updated = mergeStyleFormatChange(selectedDraft(), change);
  draft.value = {
    ...draft.value,
    elements: {
      ...draft.value.elements,
      [selectedElement.value]: { ...selectedFormat.value, ...updated },
    },
  };
  formatDialogOpen.value = false;
}

function clearFormat(): void {
  const elements = {
    ...(draft.value.elements as Partial<Record<EditableStyleElement, TableStyleElementFormat>>),
  };
  delete elements[selectedElement.value];
  draft.value = { ...draft.value, elements };
}

function updateStripeSize(value: string | number | null): void {
  const size = Number(value);
  if (!stripeElement.value || !size) return;
  draft.value = {
    ...draft.value,
    elements: {
      ...draft.value.elements,
      [selectedElement.value]: {
        ...(selectedFormat.value ?? { style: {} }),
        stripeSize: Math.max(1, Math.floor(size)),
      },
    },
  };
}

function confirm(): void {
  if (!name.value.trim() || duplicateName.value) return;
  const value = {
    style: { ...draft.value, name: name.value.trim() },
    setAsDefault: setAsDefault.value,
  };
  if (props.kind === "pivot")
    emit("confirmPivot", value as { style: PivotTableStyleDefinition; setAsDefault: boolean });
  else emit("confirm", value as { style: TableStyleDefinition; setAsDefault: boolean });
}

watch(
  () => props.style,
  () => {
    draft.value = createDraft();
    selectedElement.value = "wholeTable";
  },
);
</script>

<template>
  <Dialog
    v-if="!formatDialogOpen"
    role="dialog"
    aria-modal="true"
    :aria-label="title"
    :visible="true"
    :header="title"
    :confirm-btn="{ content: t('tableStyles.confirm'), disabled: !name.trim() || duplicateName }"
    :cancel-btn="t('tableStyles.cancel')"
    :close-on-overlay-click="false"
    :confirm-on-enter="false"
    width="min(620px, calc(100vw - 32px))"
    placement="center"
    class="new-table-style-dialog"
    @confirm="confirm"
    @close="emit('cancel')"
  >
    <div class="new-table-style-dialog__content">
      <div class="new-table-style-dialog__name">
        <label for="table-style-name">{{ t("tableStyles.name") }}</label>
        <TInput
          id="table-style-name"
          v-model="name"
          :status="duplicateName ? 'error' : undefined"
          autofocus
          data-table-style-name
        />
        <p v-if="duplicateName" role="alert">{{ t("tableStyles.styleNameExists") }}</p>
      </div>
      <div class="new-table-style-dialog__main">
        <section
          class="new-table-style-dialog__elements"
          :aria-label="t('tableStyles.tableElements')"
        >
          <h3>{{ t("tableStyles.tableElements") }}</h3>
          <OptionList
            class="new-table-style-dialog__element-list"
            :model-value="selectedElement"
            :options="elementOptions"
            :label="t('tableStyles.tableElements')"
            item-data-attribute="data-table-style-element"
            @select="chooseElement"
          />
        </section>
        <section class="new-table-style-dialog__editor">
          <div class="new-table-style-dialog__preview">
            <h3>{{ t("tableStyles.preview") }}</h3>
            <div class="new-table-style-dialog__preview-frame">
              <TableStylePreview
                :kind="kind"
                :style="draft"
                :selected-element="selectedElement"
                variant="editor"
              />
            </div>
          </div>
          <div class="new-table-style-dialog__controls">
            <h3>{{ t(elementLabel(selectedElement)) }}</h3>
            <div class="new-table-style-dialog__actions">
              <div class="new-table-style-dialog__buttons">
                <TButton
                  theme="default"
                  variant="outline"
                  data-table-style-action="format"
                  @click="openFormat"
                  >{{ t("tableStyles.format") }}</TButton
                >
                <TButton
                  theme="default"
                  variant="outline"
                  data-table-style-action="clear"
                  @click="clearFormat"
                  >{{ t("tableStyles.clear") }}</TButton
                >
              </div>
              <div
                v-if="stripeElement"
                class="new-table-style-dialog__stripe"
                role="group"
                :aria-label="t('tableStyles.stripeSize')"
              >
                <span>{{ t("tableStyles.stripeSize") }}</span>
                <TInputNumber
                  class="new-table-style-dialog__stripe-size idea-input-number--persistent-controls"
                  theme="column"
                  :aria-label="t('tableStyles.stripeSize')"
                  :model-value="selectedFormat?.stripeSize ?? 1"
                  :min="1"
                  :max="8"
                  :decimal-places="0"
                  @change="updateStripeSize"
                />
              </div>
            </div>
          </div>
        </section>
      </div>
      <TCheckbox v-model="setAsDefault">
        {{ t(kind === "pivot" ? "tableStyles.setAsDefaultPivot" : "tableStyles.setAsDefault") }}
      </TCheckbox>
    </div>
  </Dialog>
  <CellFormatDialog
    v-else
    :state="stylePatchToSelectionState(selectedDraft().style)"
    :border-state="styleFormatToBorderState(selectedDraft())"
    :border-capabilities="{ innerHorizontal: true, innerVertical: true }"
    :initial-style-patch="selectedDraft().style"
    sample-value="1234"
    :date-system="dateSystem"
    initial-tab="font"
    :available-tabs="['font', 'border', 'fill']"
    @confirm="saveFormat"
    @cancel="formatDialogOpen = false"
  />
</template>

<style scoped lang="scss">
.new-table-style-dialog {
  &__content {
    display: grid;
    gap: var(--idea-space-6);
  }
  &__name {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    align-items: center;
    gap: var(--idea-space-4);

    p {
      grid-column: 2;
      margin: 0;
      color: var(--idea-status-error);
    }
  }

  &__main {
    display: grid;
    grid-template-columns: 184px minmax(0, 1fr);
    align-items: start;
    gap: var(--idea-space-6);
  }

  h3,
  p {
    margin: 0;
  }

  h3 {
    font-size: var(--idea-font-size-body-medium);
    font-weight: var(--idea-font-weight-semibold);
    line-height: var(--idea-line-height-body-medium);
  }

  &__elements {
    display: grid;
    grid-template-rows: auto minmax(0, 1fr);
    align-content: start;
    gap: var(--idea-space-4);
  }

  &__element-list {
    height: 264px;
    max-height: 264px;
  }

  &__editor {
    display: grid;
    min-width: 0;
    align-content: start;
    gap: var(--idea-space-6);
  }

  &__preview,
  &__controls {
    display: grid;
    align-content: start;
    gap: var(--idea-space-4);
  }

  &__preview-frame {
    height: 198px;
    overflow: auto;
    border: 1px solid var(--idea-border-subtle);
    border-radius: var(--idea-radius-default);
    background: var(--idea-surface-panel);
  }

  &__actions,
  &__buttons {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--idea-space-4);
  }

  &__actions {
    justify-content: space-between;
  }

  &__stripe {
    display: flex;
    align-items: center;
    gap: var(--idea-space-4);
  }

  &__stripe-size {
    width: 76px;
  }

  @media (max-width: 560px) {
    &__main {
      grid-template-columns: minmax(0, 1fr);
    }

    &__element-list {
      height: 144px;
    }
  }
}
</style>
