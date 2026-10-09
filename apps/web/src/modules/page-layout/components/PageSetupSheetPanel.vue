<script setup lang="ts">
import { computed } from "vue";
import { Form as TForm, FormItem as TFormItem } from "tdesign-vue-next/es/form";
import { Checkbox as TCheckbox } from "tdesign-vue-next/es/checkbox";
import { Radio as TRadio } from "tdesign-vue-next/es/radio";
import { Select as TSelect } from "tdesign-vue-next/es/select";
import type { SelectValue } from "tdesign-vue-next/es/select/type";
import { Button as TButton } from "tdesign-vue-next/es/button";
import { ArrowDown, ArrowRight } from "lucide-vue-next";
import {
  DEFAULT_SHEET_PAGE_PRINT_OPTIONS,
  type SheetPageSetup,
  type SheetPagePrintOptions,
} from "@sheetcraft/core/page-setup";
import RangeReferenceInput from "../../../shared/range-reference/RangeReferenceInput.vue";
import { useAppI18n } from "../../../shared/i18n";
import type {
  PageSetupReferences,
  PageSetupReferenceErrors,
  PageSetupReferenceField,
} from "../page-setup-inputs";
const setup = defineModel<SheetPageSetup>("setup", { required: true });
const references = defineModel<PageSetupReferences>("references", { required: true });
const props = defineProps<{
  errors: PageSetupReferenceErrors;
  selectReference?: (
    current: string,
    field: PageSetupReferenceField,
  ) => Promise<string | undefined>;
}>();
const { t, locale } = useAppI18n();
const options = computed(() => setup.value.printOptions ?? DEFAULT_SHEET_PAGE_PRINT_OPTIONS);
const commentOptions = computed(() => [
  { value: "none", label: t("pageLayout.commentsNone") },
  { value: "atEnd", label: t("pageLayout.commentsAtEnd") },
  { value: "asDisplayed", label: t("pageLayout.commentsAsDisplayed") },
]);
const errorOptions = computed(() => [
  { value: "displayed", label: t("pageLayout.errorsDisplayed") },
  { value: "blank", label: t("pageLayout.errorsBlank") },
  { value: "dash", label: t("pageLayout.errorsDash") },
  { value: "NA", label: t("pageLayout.errorsNA") },
]);
function patchOptions(patch: Partial<SheetPagePrintOptions>): void {
  setup.value = { ...setup.value, printOptions: { ...options.value, ...patch } };
}
function setComments(value: SelectValue): void {
  if (value === "none" || value === "atEnd" || value === "asDisplayed")
    patchOptions({ cellComments: value });
}
function setErrors(value: SelectValue): void {
  if (value === "displayed" || value === "blank" || value === "dash" || value === "NA")
    patchOptions({ errors: value });
}
function setReference(field: PageSetupReferenceField, value: string): void {
  references.value = { ...references.value, [field]: value };
}
function picker(
  field: PageSetupReferenceField,
): ((current: string) => Promise<string | undefined>) | undefined {
  const select = props.selectReference;
  return select ? (current) => select(current, field) : undefined;
}
function resetManualBreaks(): void {
  setup.value = { ...setup.value, rowBreaks: [], columnBreaks: [] };
}
</script>
<template>
  <TForm
    class="page-setup-sheet idea-form-grid"
    :data="references"
    label-align="right"
    :label-width="locale === 'zh-CN' ? 104 : 176"
  >
    <TFormItem
      name="printArea"
      :label="t('pageLayout.printArea')"
      :status="errors.printArea ? 'error' : undefined"
      ><RangeReferenceInput
        class="page-setup-sheet__reference"
        :model-value="references.printArea"
        :label="t('pageLayout.printArea')"
        :show-picker="true"
        :select-reference="picker('printArea')"
        data-page-setup="print-area"
        @update:model-value="setReference('printArea', $event)"
      />
      <template #tips
        ><p v-if="errors.printArea" role="alert" class="page-setup-sheet__error">
          {{ errors.printArea }}
        </p>
      </template>
    </TFormItem>
    <section class="page-setup-sheet__section" :aria-label="t('pageLayout.printTitles')">
      <h3>{{ t("pageLayout.printTitles") }}</h3>
      <div class="page-setup-sheet__titles">
        <TFormItem
          name="titleRows"
          :label="t('pageLayout.titleRows')"
          :status="errors.titleRows ? 'error' : undefined"
          ><RangeReferenceInput
            class="page-setup-sheet__reference"
            :model-value="references.titleRows"
            :label="t('pageLayout.titleRows')"
            :show-picker="true"
            :select-reference="picker('titleRows')"
            data-page-setup="title-rows"
            @update:model-value="setReference('titleRows', $event)"
          />
          <template #tips
            ><p v-if="errors.titleRows" role="alert" class="page-setup-sheet__error">
              {{ errors.titleRows }}
            </p>
          </template>
        </TFormItem>
        <TFormItem
          name="titleColumns"
          :label="t('pageLayout.titleColumns')"
          :status="errors.titleColumns ? 'error' : undefined"
          ><RangeReferenceInput
            class="page-setup-sheet__reference"
            :model-value="references.titleColumns"
            :label="t('pageLayout.titleColumns')"
            :show-picker="true"
            :select-reference="picker('titleColumns')"
            data-page-setup="title-columns"
            @update:model-value="setReference('titleColumns', $event)"
          />
          <template #tips
            ><p v-if="errors.titleColumns" role="alert" class="page-setup-sheet__error">
              {{ errors.titleColumns }}
            </p>
          </template>
        </TFormItem>
        <TFormItem
          name="bottomTitleRows"
          :label="t('pageLayout.bottomTitleRows')"
          :status="errors.bottomTitleRows ? 'error' : undefined"
          ><RangeReferenceInput
            class="page-setup-sheet__reference"
            :model-value="references.bottomTitleRows"
            :label="t('pageLayout.bottomTitleRows')"
            :show-picker="true"
            :select-reference="picker('bottomTitleRows')"
            data-page-setup="bottom-title-rows"
            @update:model-value="setReference('bottomTitleRows', $event)"
          />
          <template #tips
            ><p v-if="errors.bottomTitleRows" role="alert" class="page-setup-sheet__error">
              {{ errors.bottomTitleRows }}
            </p>
          </template>
        </TFormItem>
      </div>
    </section>
    <section class="page-setup-sheet__section" :aria-label="t('pageLayout.printSettings')">
      <h3>{{ t("pageLayout.printSettings") }}</h3>
      <div class="page-setup-sheet__print-options">
        <TFormItem :label-width="0">
          <div class="page-setup-sheet__flags">
            <TCheckbox
              :checked="options.gridLines"
              data-page-setup="print-gridlines"
              @change="patchOptions({ gridLines: Boolean($event) })"
              >{{ t("pageLayout.printGridLines") }}</TCheckbox
            >
            <TCheckbox
              :checked="options.blackAndWhite"
              data-page-setup="black-and-white"
              @change="patchOptions({ blackAndWhite: Boolean($event) })"
              >{{ t("pageLayout.blackAndWhite") }}</TCheckbox
            >
            <TCheckbox
              :checked="options.headings"
              data-page-setup="print-headings"
              @change="patchOptions({ headings: Boolean($event) })"
              >{{ t("pageLayout.printHeadings") }}</TCheckbox
            >
          </div>
        </TFormItem>
        <div class="page-setup-sheet__print-selects">
          <TFormItem :label="t('pageLayout.cellComments')"
            ><TSelect
              :model-value="options.cellComments"
              :options="commentOptions"
              :aria-label="t('pageLayout.cellComments')"
              data-page-setup="cell-comments"
              @change="setComments"
            />
          </TFormItem>
          <TFormItem :label="t('pageLayout.cellErrors')"
            ><TSelect
              :model-value="options.errors"
              :options="errorOptions"
              :aria-label="t('pageLayout.cellErrors')"
              data-page-setup="cell-errors"
              @change="setErrors"
            />
          </TFormItem>
        </div>
      </div>
    </section>
    <TFormItem class="page-setup-sheet__section" :label="t('pageLayout.pageOrder')">
      <div class="page-setup-sheet__order" data-page-setup="page-order">
        <TRadio
          :checked="setup.pageOrder === 'downThenOver'"
          @change="setup = { ...setup, pageOrder: 'downThenOver' }"
          ><span class="page-setup-sheet__order-option"
            ><ArrowDown aria-hidden="true" />{{ t("pageLayout.downThenOver") }}</span
          ></TRadio
        ><TRadio
          :checked="setup.pageOrder === 'overThenDown'"
          @change="setup = { ...setup, pageOrder: 'overThenDown' }"
          ><span class="page-setup-sheet__order-option"
            ><ArrowRight aria-hidden="true" />{{ t("pageLayout.overThenDown") }}</span
          ></TRadio
        >
      </div>
    </TFormItem>
    <TFormItem>
      <TButton variant="outline" data-page-setup="reset-manual-breaks" @click="resetManualBreaks">{{
        t("pageLayout.resetManualBreaks")
      }}</TButton>
    </TFormItem>
  </TForm>
</template>
<style scoped lang="scss">
@use "./page-setup-panel" as panel;
.page-setup-sheet {
  @include panel.panel;
  &__reference {
    width: 100%;
    min-width: 0;
  }
  &__section {
    min-width: 0;
    border-top: 1px solid var(--sheetcraft-border-subtle);
    padding-top: var(--sheetcraft-space-3);
  }
  &__titles {
    display: grid;
    gap: var(--sheetcraft-space-2);
  }
  &__print-options {
    display: grid;
    gap: var(--sheetcraft-space-3);
  }
  &__flags {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: var(--sheetcraft-space-2) var(--sheetcraft-space-4);
    width: 100%;
  }
  &__print-selects {
    display: grid;
    gap: var(--sheetcraft-space-2);
  }
  &__order {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: var(--sheetcraft-space-2);
  }
  &__order-option {
    display: inline-flex;
    align-items: center;
    gap: var(--sheetcraft-space-2);
    vertical-align: middle;
    svg {
      width: var(--sheetcraft-action-icon-size);
      height: var(--sheetcraft-action-icon-size);
      color: var(--sheetcraft-text-secondary);
    }
  }
  &__error {
    margin: 0;
    color: var(--sheetcraft-status-error);
  }
}
</style>
