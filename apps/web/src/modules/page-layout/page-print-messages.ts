export type PagePrintMessageSchema = {
  pagePrint: {
    workbook: string;
    preparingResources: string;
    scope: string;
    sheet: string;
    selection: string;
    fromPage: string;
    toPage: string;
    zoom: string;
    invalidPages: string;

    title: string;
    popupBlocked: string;
    failed: string;
    invalidRange: string;
    unsupportedPictures: string;
    unsupportedEquations: string;
    unsupportedCharts: string;
    preparingCharts: string;
    preparingEquations: string;
    print: string;
    previous: string;
    next: string;
    pageOf: string;
    thumbnails: string;
    preview: string;
    close: string;
  };
};
