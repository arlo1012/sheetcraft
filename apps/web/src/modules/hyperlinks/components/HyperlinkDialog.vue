<script setup lang="ts">
import { computed, ref } from "vue";
import { Dialog } from "tdesign-vue-next/es/dialog";
import { Input as TInput } from "tdesign-vue-next/es/input";
import { Button as TButton } from "tdesign-vue-next/es/button";
import { Select as TSelect } from "tdesign-vue-next/es/select";
import { TabPanel as TTabPanel, Tabs as TTabs } from "tdesign-vue-next/es/tabs";
import { useAppI18n } from "../../../shared/i18n";
import type { HyperlinkDraft, HyperlinkInput } from "../useHyperlinksController";
import {
  readHyperlinkTarget,
  createLocationHyperlink,
  createEmailHyperlink,
  type HyperlinkKind,
} from "../hyperlink-target";

const props = withDefaults(
  defineProps<{
    draft: HyperlinkDraft;
    error?: string;
    sheets?: readonly { id: string; name: string }[];
    currentSheetName?: string;
  }>(),
  { sheets: () => [], currentSheetName: "" },
);
const emit = defineEmits<{ confirm: [value: HyperlinkInput]; remove: []; cancel: [] }>();
const { t } = useAppI18n();
const displayText = ref(props.draft.displayText);
const initial = readHyperlinkTarget(props.draft.target, props.currentSheetName);
const kind = ref<HyperlinkKind>(initial.kind);
const webAddress = ref(initial.webAddress);
const sheetName = ref(initial.sheetName);
const cellReference = ref(initial.cellReference);
const emailAddress = ref(initial.emailAddress);
const emailSubject = ref(initial.emailSubject);
const target = computed(() => {
  if (kind.value === "web") return webAddress.value;
  if (kind.value === "email") {
    if (
      initial.kind === "email" &&
      emailAddress.value === initial.emailAddress &&
      emailSubject.value === initial.emailSubject
    )
      return props.draft.target;
    return createEmailHyperlink(emailAddress.value, emailSubject.value, initial.emailParameters);
  }
  if (
    initial.kind === "location" &&
    sheetName.value === initial.sheetName &&
    cellReference.value === initial.cellReference
  )
    return props.draft.target;
  return createLocationHyperlink(sheetName.value, cellReference.value);
});
const tooltip = ref(props.draft.tooltip);
</script>

<template>
  <Dialog
    :visible="true"
    :header="t(draft.hasLink ? 'hyperlinks.edit' : 'hyperlinks.insert')"
    :confirm-btn="{ content: t('hyperlinks.confirm'), disabled: !target.trim() }"
    :cancel-btn="t('hyperlinks.cancel')"
    :close-on-overlay-click="false"
    :confirm-on-enter="false"
    width="min(600px, calc(100vw - 32px))"
    placement="center"
    @confirm="emit('confirm', { target, tooltip, displayText })"
    @close="emit('cancel')"
  >
    <div class="hyperlink-dialog">
      <label class="hyperlink-dialog__field"
        ><span>{{ t("hyperlinks.displayText") }}</span>
        <TInput v-model="displayText" :disabled="!draft.canEditDisplay" data-hyperlink-text />
      </label>
      <p v-if="!draft.canEditDisplay" class="hyperlink-dialog__hint">
        {{ t("hyperlinks.formulaTextHint") }}
      </p>
      <TTabs v-model="kind" class="hyperlink-dialog__targets">
        <TTabPanel value="web" :label="t('hyperlinks.web')">
          <div class="hyperlink-dialog__target-fields">
            <label class="hyperlink-dialog__field"
              ><span>{{ t("hyperlinks.address") }}</span>
              <TInput v-model="webAddress" placeholder="https://" autofocus data-hyperlink-target />
            </label>
          </div>
        </TTabPanel>
        <TTabPanel value="location" :label="t('hyperlinks.location')">
          <div class="hyperlink-dialog__target-fields">
            <label class="hyperlink-dialog__field"
              ><span>{{ t("hyperlinks.sheet") }}</span>
              <TSelect
                v-model="sheetName"
                :options="sheets.map((sheet) => ({ value: sheet.name, label: sheet.name }))"
                data-hyperlink-sheet
              />
            </label>
            <label class="hyperlink-dialog__field"
              ><span>{{ t("hyperlinks.cellReference") }}</span>
              <TInput v-model="cellReference" placeholder="A1" data-hyperlink-reference />
            </label>
          </div>
        </TTabPanel>
        <TTabPanel value="email" :label="t('hyperlinks.email')">
          <div class="hyperlink-dialog__target-fields">
            <label class="hyperlink-dialog__field"
              ><span>{{ t("hyperlinks.emailAddress") }}</span>
              <TInput v-model="emailAddress" data-hyperlink-email />
            </label>
            <label class="hyperlink-dialog__field"
              ><span>{{ t("hyperlinks.emailSubject") }}</span>
              <TInput v-model="emailSubject" data-hyperlink-subject />
            </label>
          </div>
        </TTabPanel>
      </TTabs>
      <label class="hyperlink-dialog__field"
        ><span>{{ t("hyperlinks.tooltip") }}</span>
        <TInput v-model="tooltip" data-hyperlink-tooltip />
      </label>
      <p v-if="error" class="hyperlink-dialog__error" role="alert">{{ error }}</p>
      <TButton
        v-if="draft.hasLink"
        class="hyperlink-dialog__remove"
        theme="default"
        variant="base"
        @click="emit('remove')"
        >{{ t("hyperlinks.remove") }}</TButton
      >
    </div>
  </Dialog>
</template>

<style scoped lang="scss">
.hyperlink-dialog {
  display: grid;
  gap: 12px;
  align-items: center;
  &__field {
    display: grid;
    grid-template-columns: 100px minmax(0, 1fr);
    gap: 12px;
    align-items: center;
  }
  &__targets {
    min-width: 0;
  }
  &__target-fields {
    display: grid;
    gap: 12px;
    align-items: center;
    padding-block: 16px;
  }
  &__hint,
  &__error {
    margin: 0;
  }
  &__hint {
    color: var(--sheetcraft-text-secondary);
  }
  &__error {
    color: var(--sheetcraft-status-error);
  }
  &__remove {
    justify-self: start;
  }
}
</style>
