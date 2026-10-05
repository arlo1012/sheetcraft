<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue";
import { Dialog } from "tdesign-vue-next/es/dialog";
import { Button } from "tdesign-vue-next/es/button";
import { Textarea } from "tdesign-vue-next/es/textarea";
import { Input } from "tdesign-vue-next/es/input";
import { Checkbox } from "tdesign-vue-next/es/checkbox";
import { BaseTable } from "tdesign-vue-next/es/table";
import type { BaseTableCol } from "tdesign-vue-next/es/table/type";
import { Form, FormItem } from "tdesign-vue-next/es/form";
import TableHeightWrapper from "../../../shared/table/TableHeightWrapper.vue";
import { useAppI18n } from "../../../shared/i18n";
import { builtinRules } from "../proofreading";
import type { useWordProofreading } from "../useWordProofreading";
const props = defineProps<{ controller: ReturnType<typeof useWordProofreading> }>();
const { t } = useAppI18n();
const originalWord = ref<string>();
const returnTo = ref<"general" | "batch">();
const word = ref(""),
  replacement = ref(""),
  builtins = ref(true);
watch(
  () => props.controller.panel.value,
  (panel, previous) => {
    returnTo.value =
      panel === "accepted" && (previous === "general" || previous === "batch")
        ? previous
        : undefined;
    originalWord.value = undefined;
    word.value = "";
    replacement.value = "";
    builtins.value = props.controller.dictionary.value.builtins;
  },
);
const visible = computed(
  () =>
    !!props.controller.panel.value && !["general", "batch"].includes(props.controller.panel.value),
);
const title = computed(() => {
  switch (props.controller.panel.value) {
    case "accepted":
      return t("wordProof.accepted");
    case "mistake":
      return t("wordProof.mistake");
    case "settings":
      return t("wordProof.settings");
    default:
      return t("wordProof.dictionary");
  }
});
const rows = computed(() => [
  ...props.controller.dictionary.value.accepted.map((word) => ({
    id: `accepted:${word}`,
    word,
    replacement: "",
    kind: t("wordProof.correctWord"),
    builtin: false,
  })),
  ...props.controller.dictionary.value.mistakes.map((r) => ({
    ...r,
    id: `mistake:${r.word}`,
    kind: t("wordProof.incorrectWord"),
    builtin: false,
  })),
  ...builtinRules.map((r) => ({
    ...r,
    id: `builtin:${r.word}`,
    kind: t("wordProof.incorrectWord"),
    builtin: true,
  })),
]);
type Row = (typeof rows.value)[number];
const columns = computed<BaseTableCol[]>(() => [
  { colKey: "word", title: t("wordProof.word"), width: 140 },
  { colKey: "replacement", title: t("wordProof.replacement"), width: 140 },
  { colKey: "kind", title: t("wordProof.kind"), width: 90 },
  { colKey: "origin", title: t("wordProof.origin"), width: 80 },
  { colKey: "actions", title: "", width: 130 },
]);
const batchAccepted = computed(
  () => props.controller.panel.value === "accepted" && !originalWord.value,
);
function saveWord() {
  if (batchAccepted.value) {
    if (props.controller.addAcceptedWords(word.value)) finishEditor(true);
    return;
  }
  if (
    props.controller.add(
      word.value,
      props.controller.panel.value === "mistake" ? replacement.value : undefined,
      originalWord.value,
    )
  )
    finishEditor(true);
}
function finishEditor(saved = false) {
  const target = returnTo.value;
  props.controller.panel.value = target ?? (saved ? "dictionary" : undefined);
  if (saved && target) props.controller.scan();
}
function remove(row: Row) {
  props.controller.save({
    ...props.controller.dictionary.value,
    accepted: props.controller.dictionary.value.accepted.filter((w) => w !== row.word),
    mistakes: props.controller.dictionary.value.mistakes.filter((r) => r.word !== row.word),
  });
}
function edit(row: Row) {
  props.controller.panel.value = row.replacement ? "mistake" : "accepted";
  void nextTick(() => {
    originalWord.value = row.word;
    word.value = row.word;
    replacement.value = row.replacement;
  });
}
</script>
<template>
  <Dialog
    :visible="visible"
    :header="title"
    :width="controller.panel.value === 'dictionary' ? '660px' : '520px'"
    :footer="controller.panel.value !== 'dictionary'"
    :close-on-overlay-click="false"
    @close="finishEditor()"
  >
    <div class="word-dictionary">
      <p v-if="controller.error.value" role="alert">{{ controller.error.value }}</p>
      <template
        v-if="controller.panel.value === 'accepted' || controller.panel.value === 'mistake'"
      >
        <Form label-align="top">
          <FormItem :label="t('wordProof.word')">
            <Textarea
              v-if="batchAccepted"
              v-model="word"
              :autosize="{ minRows: 5, maxRows: 10 }"
              :placeholder="t('wordProof.batchPlaceholder')" />
            <Input v-else v-model="word" :maxlength="100"
          /></FormItem>
          <FormItem v-if="controller.panel.value === 'mistake'" :label="t('wordProof.replacement')"
            ><Input v-model="replacement" :maxlength="100"
          /></FormItem>
        </Form>
      </template>
      <template v-else-if="controller.panel.value === 'dictionary'">
        <p>{{ t("wordProof.localHint") }}</p>
        <div class="word-dictionary__actions">
          <Button variant="outline" @click="controller.open('accepted')">{{
            t("wordProof.accepted")
          }}</Button
          ><Button variant="outline" @click="controller.open('mistake')">{{
            t("wordProof.mistake")
          }}</Button>
        </div>
        <div class="word-dictionary__table">
          <TableHeightWrapper v-slot="{ height }"
            ><BaseTable
              class="idea-table--mini idea-table--row-dividers"
              size="small"
              vertical-align="middle"
              :bordered="false"
              hover
              row-key="id"
              :data="rows"
              :columns="columns"
              :height="height"
              table-layout="fixed"
              resizable
            >
              <template #origin="{ row }">{{
                t(row.builtin ? "wordProof.builtin" : "wordProof.custom")
              }}</template>
              <template #actions="{ row }"
                ><template v-if="!row.builtin"
                  ><Button size="small" variant="text" @click="edit(row as Row)">{{
                    t("wordProof.edit")
                  }}</Button
                  ><Button size="small" variant="text" @click="remove(row as Row)">{{
                    t("wordProof.remove")
                  }}</Button></template
                ></template
              >
            </BaseTable></TableHeightWrapper
          >
        </div>
      </template>
      <template v-else-if="controller.panel.value === 'settings'">
        <p>{{ t("wordProof.hint") }}</p>
        <p>{{ t("wordProof.localHint") }}</p>
        <Checkbox v-model="builtins">{{ t("wordProof.enableBuiltin") }}</Checkbox>
      </template>
    </div>
    <template #footer>
      <div class="word-dictionary__footer">
        <span v-if="controller.panel.value !== 'settings'" class="word-dictionary__hint">{{
          t(batchAccepted ? "wordProof.batchHint" : "wordProof.wordHint")
        }}</span>
        <div class="word-dictionary__footer-actions">
          <Button theme="default" @click="finishEditor()">{{ t("wordProof.cancel") }}</Button>
          <Button
            theme="primary"
            @click="
              controller.panel.value === 'settings'
                ? controller.save({ ...controller.dictionary.value, builtins }) &&
                  (controller.panel.value = undefined)
                : saveWord()
            "
            >{{ t("wordProof.save") }}</Button
          >
        </div>
      </div>
    </template>
  </Dialog>
</template>
<style scoped lang="scss">
.word-dictionary {
  display: grid;
  gap: 12px;
  p {
    margin: 0;
    color: var(--td-text-color-secondary);
  }
  &__actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
  }
  &__footer {
    display: flex;
    align-items: center;
    gap: 16px;
    text-align: left;
  }
  &__hint {
    color: var(--idea-text-secondary);
    flex: 1;
  }
  &__footer-actions {
    display: flex;
    flex-shrink: 0;
    margin-left: auto;
  }
  &__table {
    height: min(320px, calc(100dvh - 280px));
    min-height: 0;
  }
}
</style>
