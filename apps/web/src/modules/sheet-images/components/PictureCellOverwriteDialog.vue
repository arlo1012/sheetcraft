<script setup lang="ts">
import { Dialog } from "tdesign-vue-next/es/dialog";
import { formatCellAddress } from "@sheetcraft/core/coordinates";
import type { PictureCellOverwriteConfirmation } from "../picture-cell-overwrite-confirmation";
import { useAppI18n } from "../../../shared/i18n";
const props = defineProps<{ confirmation: PictureCellOverwriteConfirmation }>();
const { t } = useAppI18n();
const confirm = props.confirmation.confirm,
  cancel = props.confirmation.cancel;
</script>
<template>
  <Dialog
    :visible="true"
    :header="t('image.overwriteTitle')"
    width="440px"
    :close-on-overlay-click="false"
    :confirm-btn="t('image.overwriteConfirm')"
    :cancel-btn="t('picture.cancel')"
    :confirm-loading="confirmation.busy ?? false"
    @confirm="confirm"
    @close="cancel"
  >
    <template v-if="confirmation.insertionTargets">
      <p>
        {{
          t("image.insertOverwriteMessage", {
            count: confirmation.insertionTargets.length,
            occupied: confirmation.occupiedTargetCount ?? 0,
          })
        }}
      </p>
      <ul class="picture-overwrite-targets">
        <li v-for="(range, index) in confirmation.insertionTargets" :key="index">
          {{ confirmation.sheetName }}!{{ formatCellAddress(range.start)
          }}<template
            v-if="range.start.row !== range.end.row || range.start.column !== range.end.column"
            >:{{ formatCellAddress(range.end) }}</template
          >
        </li>
      </ul>
    </template>
    <p v-else>
      {{
        t("image.overwriteMessage", {
          cell: `${confirmation.sheetName}!${formatCellAddress(confirmation.address)}`,
        })
      }}
    </p>
    <p v-if="confirmation.error" role="alert">
      {{
        t(
          confirmation.insertionTargets
            ? confirmation.errorReason === "command"
              ? "image.insertionFailed"
              : "image.insertTargetsChanged"
            : "image.convertFailed",
        )
      }}
    </p>
  </Dialog>
</template>

<style scoped lang="scss">
.picture-overwrite-targets {
  max-height: 160px;
  overflow-y: auto;
  overflow-wrap: anywhere;
}
</style>
