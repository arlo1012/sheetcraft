<script setup lang="ts">
import { computed, nextTick, ref } from "vue";
import { Dialog } from "tdesign-vue-next/es/dialog";
import { Form, FormItem } from "tdesign-vue-next/es/form";
import { Input as TInput } from "tdesign-vue-next/es/input";
import { Button as TButton } from "tdesign-vue-next/es/button";
import { File, MapPin, Mail, Link as LinkIcon } from "lucide-vue-next";
import OptionList from "../../../shared/option-list/OptionList.vue";
import { useAppI18n } from "../../../shared/i18n";
import { vNativeControl } from "../../../shared/tdesign/native-control";
import type { HyperlinkDraft, HyperlinkInput } from "../useHyperlinksController";
import {
  readHyperlinkTarget,
  createLocationHyperlink,
  createEmailHyperlink,
  isCloudShareUrl,
  type HyperlinkKind,
} from "../hyperlink-target";

type Page = HyperlinkKind | "cloud";
const props = withDefaults(
  defineProps<{
    draft: HyperlinkDraft;
    error?: string;
    sheets?: readonly { id: string; name: string }[];
    names?: readonly string[];
    recentEmails?: readonly string[];
    currentSheetName?: string;
  }>(),
  { sheets: () => [], names: () => [], recentEmails: () => [], currentSheetName: "" },
);
const emit = defineEmits<{ confirm: [value: HyperlinkInput]; remove: []; cancel: [] }>();
const { t } = useAppI18n();
const initial = readHyperlinkTarget(props.draft.target, props.currentSheetName);
const kind = ref<Page>(
  props.draft.initialPage ?? (isCloudShareUrl(props.draft.target) ? "cloud" : initial.kind),
);
const pages = computed(() =>
  (["web", "location", "email", "cloud"] as const).map((value) => ({
    value,
    label: t(`hyperlinks.${value}`),
  })),
);
const webAddress = ref(kind.value === "web" ? initial.webAddress : "");
const cloudAddress = ref(
  kind.value === "cloud" && /^https:\/\//i.test(initial.webAddress) ? initial.webAddress : "",
);
const sheetName = ref(initial.sheetName);
const cellReference = ref(initial.cellReference);
const selectedName = ref(
  props.names.find((name) => "#" + name.toLowerCase() === props.draft.target.toLowerCase()),
);
const emailAddress = ref(initial.emailAddress);
const emailSubject = ref(initial.emailSubject);
function chooseSheet(name: string) {
  if (selectedName.value) cellReference.value = "A1";
  selectedName.value = undefined;
  sheetName.value = name;
}
const target = computed(() => {
  switch (kind.value) {
    case "web":
      return webAddress.value.trim();
    case "cloud":
      return cloudAddress.value.trim();
    case "location":
      if (selectedName.value) {
        const namedTarget = "#" + selectedName.value;
        return namedTarget.toLowerCase() === props.draft.target.toLowerCase()
          ? props.draft.target
          : namedTarget;
      }
      if (
        initial.kind === "location" &&
        sheetName.value === initial.sheetName &&
        cellReference.value === initial.cellReference
      )
        return props.draft.target;
      return createLocationHyperlink(sheetName.value, cellReference.value);
    case "email":
      if (
        initial.kind === "email" &&
        emailAddress.value === initial.emailAddress &&
        emailSubject.value === initial.emailSubject
      )
        return props.draft.target;
      return createEmailHyperlink(emailAddress.value, emailSubject.value, initial.emailParameters);
  }
});
const customText = ref<string | undefined>(props.draft.displayText || undefined);
const displayText = computed({
  get: () =>
    customText.value ??
    (props.draft.canEditDisplay ? target.value.replace(/^#/, "") : props.draft.displayText),
  set: (text: string) => {
    customText.value = text;
  },
});
const confirmEnabled = computed(() => {
  if (!target.value) return false;
  if (kind.value !== "cloud") return true;
  try {
    return new URL(target.value).protocol === "https:";
  } catch {
    return false;
  }
});

const tooltip = ref(props.draft.tooltip);
const tipDraft = ref<string>();
const tipButton = ref<InstanceType<typeof TButton>>();
function closeTip(apply: boolean) {
  if (apply && tipDraft.value !== undefined) tooltip.value = tipDraft.value;
  tipDraft.value = undefined;
  void nextTick(() => tipButton.value?.$el.focus());
}
function confirm() {
  if (confirmEnabled.value && tipDraft.value === undefined)
    emit("confirm", {
      target: target.value,
      displayText: displayText.value,
      tooltip: tooltip.value,
    });
}
function onDialogKeydown(event: KeyboardEvent): void {
  if ((event.ctrlKey || event.metaKey) && event.key === "Enter" && confirmEnabled.value) {
    event.preventDefault();
    confirm();
  }
}
</script>

<template>
  <Dialog
    :visible="true"
    role="dialog"
    aria-modal="true"
    :aria-label="t(draft.hasLink ? 'hyperlinks.edit' : 'hyperlinks.insert')"
    :header="t(draft.hasLink ? 'hyperlinks.edit' : 'hyperlinks.insert')"
    :close-on-overlay-click="false"
    :close-on-esc-keydown="tipDraft === undefined"
    :confirm-on-enter="false"
    width="min(620px, calc(100vw - 32px))"
    placement="center"
    @keydown="onDialogKeydown"
    @confirm="confirm"
    @close="tipDraft === undefined && emit('cancel')"
  >
    <div class="hyperlink-layout">
      <OptionList
        class="hyperlink-layout__nav"
        variant="navigation"
        :model-value="kind"
        :options="pages"
        :label="t('hyperlinks.linkTo')"
        item-data-attribute="data-hyperlink-kind"
        @select="kind = $event"
      >
        <template #icon="{ option }">
          <File v-if="option.value === 'web'" aria-hidden="true" /><MapPin
            v-else-if="option.value === 'location'"
            aria-hidden="true"
          /><Mail v-else-if="option.value === 'email'" aria-hidden="true" /><LinkIcon
            v-else
            aria-hidden="true"
          />
        </template>
      </OptionList>
      <Form
        class="hyperlink-form sheetcraft-form-grid"
        label-align="top"
        :prevent-submit-default="true"
      >
        <FormItem :label="t('hyperlinks.displayText')">
          <div class="hyperlink-form__display">
            <TInput
              v-model="displayText"
              :disabled="!draft.canEditDisplay"
              v-native-control="{ attributes: { 'aria-label': t('hyperlinks.displayText') } }"
              data-hyperlink-text
            />
            <TButton
              ref="tipButton"
              theme="default"
              variant="base"
              data-hyperlink-tip-button
              @click="tipDraft = tooltip"
              >{{ t("hyperlinks.tooltip") }}…</TButton
            >
          </div>
        </FormItem>
        <p v-if="!draft.canEditDisplay" class="hyperlink-form__hint">
          {{ t("hyperlinks.formulaTextHint") }}
        </p>
        <template v-if="kind === 'web'">
          <FormItem :label="t('hyperlinks.address')"
            ><TInput
              v-model="webAddress"
              placeholder="https://"
              v-native-control="{ attributes: { 'aria-label': t('hyperlinks.address') } }"
              data-hyperlink-target
          /></FormItem>
          <p class="hyperlink-form__hint">{{ t("hyperlinks.webHint") }}</p>
        </template>
        <template v-else-if="kind === 'location'">
          <FormItem :label="t('hyperlinks.cellReference')"
            ><TInput
              :model-value="selectedName ?? cellReference"
              @update:model-value="cellReference = String($event)"
              :disabled="!!selectedName"
              placeholder="A1"
              v-native-control="{ attributes: { 'aria-label': t('hyperlinks.cellReference') } }"
              data-hyperlink-reference
          /></FormItem>
          <div class="hyperlink-form__location-lists">
            <FormItem :label="t('hyperlinks.sheet')">
              <OptionList
                class="hyperlink-form__list"
                :model-value="selectedName ? undefined : sheetName"
                :options="sheets.map((s) => ({ value: s.name, label: s.name }))"
                :label="t('hyperlinks.sheet')"
                item-data-attribute="data-hyperlink-sheet"
                @select="chooseSheet"
              />
            </FormItem>
            <FormItem :label="t('hyperlinks.definedNames')">
              <OptionList
                class="hyperlink-form__list"
                :model-value="selectedName"
                :options="names.map((value) => ({ value, label: value }))"
                :label="t('hyperlinks.definedNames')"
                item-data-attribute="data-hyperlink-name"
                @select="selectedName = $event"
              />
            </FormItem>
          </div>
        </template>
        <template v-else-if="kind === 'email'">
          <FormItem :label="t('hyperlinks.emailAddress')"
            ><TInput
              v-model="emailAddress"
              v-native-control="{ attributes: { 'aria-label': t('hyperlinks.emailAddress') } }"
              data-hyperlink-email
          /></FormItem>
          <FormItem :label="t('hyperlinks.emailSubject')"
            ><TInput
              v-model="emailSubject"
              v-native-control="{ attributes: { 'aria-label': t('hyperlinks.emailSubject') } }"
              data-hyperlink-subject
          /></FormItem>
          <FormItem :label="t('hyperlinks.recentEmails')"
            ><OptionList
              class="hyperlink-form__list hyperlink-form__list--recent"
              :model-value="emailAddress"
              :options="recentEmails.map((value) => ({ value, label: value }))"
              :label="t('hyperlinks.recentEmails')"
              item-data-attribute="data-hyperlink-recent-email"
              @select="emailAddress = $event"
          /></FormItem>
        </template>
        <FormItem v-else :label="t('hyperlinks.cloudAddress')"
          ><TInput
            v-model="cloudAddress"
            placeholder="https://"
            v-native-control="{ attributes: { 'aria-label': t('hyperlinks.cloudAddress') } }"
            data-hyperlink-cloud
        /></FormItem>
        <p v-if="error" class="hyperlink-form__error" role="alert">{{ error }}</p>
      </Form>
    </div>
    <template #footer>
      <div class="hyperlink-footer">
        <TButton
          v-if="draft.hasLink"
          class="hyperlink-footer__remove"
          theme="danger"
          variant="text"
          @click="emit('remove')"
          >{{ t("hyperlinks.remove") }}</TButton
        >
        <div class="hyperlink-footer__actions">
          <TButton
            theme="default"
            variant="base"
            @click="tipDraft === undefined && emit('cancel')"
            >{{ t("hyperlinks.cancel") }}</TButton
          >
          <TButton theme="primary" variant="base" :disabled="!confirmEnabled" @click="confirm">{{
            t("hyperlinks.confirm")
          }}</TButton>
        </div>
      </div>
    </template>
  </Dialog>
  <Dialog
    v-if="tipDraft !== undefined"
    :visible="true"
    role="dialog"
    aria-modal="true"
    :aria-label="t('hyperlinks.tipTitle')"
    :header="t('hyperlinks.tipTitle')"
    :close-on-overlay-click="false"
    :confirm-btn="t('hyperlinks.confirm')"
    :cancel-btn="t('hyperlinks.cancel')"
    width="min(400px, calc(100vw - 32px))"
    placement="center"
    @confirm="closeTip(true)"
    @close="closeTip(false)"
  >
    <Form class="sheetcraft-form-grid" label-align="top" :prevent-submit-default="true">
      <FormItem :label="t('hyperlinks.tipText')"
        ><TInput
          v-model="tipDraft"
          :maxlength="255"
          autofocus
          v-native-control="{ attributes: { 'aria-label': t('hyperlinks.tipText') } }"
          data-hyperlink-tooltip
      /></FormItem>
    </Form>
  </Dialog>
</template>
<style scoped lang="scss">
.hyperlink-layout {
  display: grid;
  grid-template-columns: 144px minmax(0, 1fr);
  gap: 16px;
  height: min(312px, calc(100dvh - 200px));
  min-height: 0;

  &__nav {
    height: 100%;
  }
}
.hyperlink-form {
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-width: 0;
  min-height: 0;
  overflow-x: hidden;
  overflow-y: auto;
  &__display {
    display: flex;
    width: 100%;
    align-items: center;
    gap: 8px;

    > :first-child {
      flex: 1;
      min-width: 0;
    }

    > :last-child {
      flex: none;
    }
  }
  &__location-lists {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 12px;
    min-width: 0;
  }
  &__list {
    width: 100%;
    height: 132px;

    &--recent {
      height: 88px;
    }
  }
  &__hint,
  &__error {
    margin: 0;
    font-size: var(--sheetcraft-font-size-body-small);
    line-height: var(--sheetcraft-line-height-body-small);
  }
  &__hint {
    color: var(--sheetcraft-text-muted);
  }
  &__error {
    color: var(--sheetcraft-status-error);
  }
}
.hyperlink-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--sheetcraft-space-4);

  &__actions {
    display: inline-flex;
    align-items: center;
    gap: var(--sheetcraft-space-3);
    margin-left: auto;
  }
}
@media (max-width: 560px) {
  .hyperlink-layout {
    grid-template-columns: minmax(0, 1fr);
    height: auto;
  }
  .hyperlink-form__location-lists {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
