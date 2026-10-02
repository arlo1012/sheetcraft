<script setup lang="ts">
import { computed } from "vue";
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
} from "@idea10/core/page-setup";
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
const { t } = useAppI18n();
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
  <div class="page-setup-sheet">
    <div class="page-setup-sheet__reference">
      <span>{{ t("pageLayout.printArea") }}</span
      ><RangeReferenceInput
        :model-value="references.printArea"
        :label="t('pageLayout.printArea')"
        :show-picker="true"
        :select-reference="picker('printArea')"
        data-page-setup="print-area"
        @update:model-value="setReference('printArea', $event)"
      />
      <p v-if="errors.printArea" role="alert" class="page-setup-sheet__error">
        {{ errors.printArea }}
      </p>
    </div>
    <section :aria-label="t('pageLayout.printTitles')">
      <h3>{{ t("pageLayout.printTitles") }}</h3>
      <div class="page-setup-sheet__titles">
        <div class="page-setup-sheet__reference">
          <span>{{ t("pageLayout.titleRows") }}</span
          ><RangeReferenceInput
            :model-value="references.titleRows"
            :label="t('pageLayout.titleRows')"
            :show-picker="true"
            :select-reference="picker('titleRows')"
            data-page-setup="title-rows"
            @update:model-value="setReference('titleRows', $event)"
          />
          <p v-if="errors.titleRows" role="alert" class="page-setup-sheet__error">
            {{ errors.titleRows }}
          </p>
        </div>
        <div class="page-setup-sheet__reference">
          <span>{{ t("pageLayout.titleColumns") }}</span
          ><RangeReferenceInput
            :model-value="references.titleColumns"
            :label="t('pageLayout.titleColumns')"
            :show-picker="true"
            :select-reference="picker('titleColumns')"
            data-page-setup="title-columns"
            @update:model-value="setReference('titleColumns', $event)"
          />
          <p v-if="errors.titleColumns" role="alert" class="page-setup-sheet__error">
            {{ errors.titleColumns }}
          </p>
        </div>
        <div class="page-setup-sheet__reference">
          <span>{{ t("pageLayout.bottomTitleRows") }}</span
          ><RangeReferenceInput
            :model-value="references.bottomTitleRows"
            :label="t('pageLayout.bottomTitleRows')"
            :show-picker="true"
            :select-reference="picker('bottomTitleRows')"
            data-page-setup="bottom-title-rows"
            @update:model-value="setReference('bottomTitleRows', $event)"
          />
          <p v-if="errors.bottomTitleRows" role="alert" class="page-setup-sheet__error">
            {{ errors.bottomTitleRows }}
          </p>
        </div>
      </div>
    </section>
    <section :aria-label="t('pageLayout.printSettings')">
      <h3>{{ t("pageLayout.printSettings") }}</h3>
      <div class="page-setup-sheet__print-options">
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
        <div class="page-setup-sheet__print-selects">
          <div class="page-setup-sheet__reference">
            <span>{{ t("pageLayout.cellComments") }}</span
            ><TSelect
              :model-value="options.cellComments"
              :options="commentOptions"
              :aria-label="t('pageLayout.cellComments')"
              data-page-setup="cell-comments"
              @change="setComments"
            />
          </div>
          <div class="page-setup-sheet__reference">
            <span>{{ t("pageLayout.cellErrors") }}</span
            ><TSelect
              :model-value="options.errors"
              :options="errorOptions"
              :aria-label="t('pageLayout.cellErrors')"
              data-page-setup="cell-errors"
              @change="setErrors"
            />
          </div>
        </div>
      </div>
    </section>
    <section :aria-label="t('pageLayout.pageOrder')">
      <h3>{{ t("pageLayout.pageOrder") }}</h3>
      <div class="page-setup-sheet__order" data-page-setup="page-order">
        <TRadio
          :checked="setup.pageOrder === 'downThenOver'"
          @change="setup = { ...setup, pageOrder: 'downThenOver' }"
          >{{ t("pageLayout.downThenOver") }}</TRadio
        ><TRadio
          :checked="setup.pageOrder === 'overThenDown'"
          @change="setup = { ...setup, pageOrder: 'overThenDown' }"
          >{{ t("pageLayout.overThenDown") }}</TRadio
        ><ArrowDown v-if="setup.pageOrder === 'downThenOver'" aria-hidden="true" /><ArrowRight
          v-else
          aria-hidden="true"
        />
      </div>
    </section>
    <div class="page-setup-dialog__breaks">
      <TButton variant="outline" @click="resetManualBreaks">{{
        t("pageLayout.resetManualBreaks")
      }}</TButton>
    </div>
  </div>
</template>
<style scoped lang="scss">
@use "./page-setup-panel" as panel;
.page-setup-sheet {
  @include panel.panel;
  &__reference {
    display: grid;
    gap: var(--idea-space-1);
    min-width: 0;
  }
  &__titles {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: var(--idea-space-2) var(--idea-space-3);
  }
  &__print-options {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: var(--idea-space-3);
  }
  &__flags {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: var(--idea-space-2);
  }
  &__print-selects {
    display: grid;
    gap: var(--idea-space-2);
  }
  &__order {
    display: flex;
    align-items: center;
    gap: var(--idea-space-4);
    svg {
      width: 24px;
      height: 24px;
      color: var(--idea-text-secondary);
    }
  }
  &__error {
    margin: 0;
    color: var(--idea-status-error);
  }
}
</style>
