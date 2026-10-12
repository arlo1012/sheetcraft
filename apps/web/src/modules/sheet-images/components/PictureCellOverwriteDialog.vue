<script setup lang="ts">
import { Dialog } from "tdesign-vue-next/es/dialog";
import { formatCellAddress } from "@sheetcraft/core/coordinates";
import type { PictureCellConversionConfirmation } from "../usePictureCellConversion";
import { useAppI18n } from "../../../shared/i18n";
const props = defineProps<{ confirmation: PictureCellConversionConfirmation }>();
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
    @confirm="confirm"
    @close="cancel"
  >
    <p>
      {{
        t("image.overwriteMessage", {
          cell: `${confirmation.sheetName}!${formatCellAddress(confirmation.address)}`,
        })
      }}
    </p>
    <p v-if="confirmation.error" role="alert">{{ t("image.convertFailed") }}</p>
  </Dialog>
</template>
