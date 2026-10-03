import type { HyperlinkMessageSchema } from "./hyperlink-messages";
export const hyperlinksEnUS = {
  hyperlinks: {
    insert: "Hyperlink",
    edit: "Edit hyperlink",
    displayText: "Text to display",
    address: "Address",
    tooltip: "Screen tip",
    addressHint:
      "Enter a web or email address, such as https://example.com or mailto:name{'@'}example.com, or a worksheet location such as #Sheet1!A1.",
    formulaTextHint: "The cell's existing formula or numeric value will be preserved.",
    confirm: "OK",
    cancel: "Cancel",
    remove: "Remove link",
    invalidTarget: "Enter a valid web or email address, or worksheet location.",
    unavailableTarget: "The linked worksheet location could not be found.",
    failed: "Unable to update the hyperlink. Try again.",
    open: "Open hyperlink",
  },
} satisfies HyperlinkMessageSchema;
