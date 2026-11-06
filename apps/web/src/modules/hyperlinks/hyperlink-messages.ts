export type HyperlinkMessageSchema = {
  hyperlinks: {
    insert: string;
    edit: string;
    displayText: string;
    address: string;
    web: string;
    location: string;
    email: string;
    sheet: string;
    cellReference: string;
    emailAddress: string;
    emailSubject: string;
    tooltip: string;
    addressHint: string;
    formulaTextHint: string;
    confirm: string;
    cancel: string;
    remove: string;
    invalidTarget: string;
    unavailableTarget: string;
    failed: string;
    open: string;
  };
};
