import type { SheetFramedGraphicDrawing } from "@sheetcraft/core/sheet-drawings";
// Real product-created, synthetic QA object; only its generated ID is replaced.
export const webCreatedTextBox: SheetFramedGraphicDrawing = {
  id: "web-created-textbox",
  kind: "textBox",
  shapeText: {
    layout: {
      blockAlignment: "start",
      direction: "horizontal",
      lineOrder: "rtl",
      marginsPt: {
        leftPt: 7.2,
        rightPt: 7.2,
        topPt: 3.6,
        bottomPt: 3.6,
      },
      wrap: true,
      overflow: false,
      autoFit: "none",
      keepFlat: false,
    },
    paragraph: {
      alignment: "left",
      beforePt: 0,
      afterPt: 0,
      lineSpacing: {
        kind: "normal",
      },
    },
    fontFamily: "Inter",
  },
  name: "横排文本框",
  text: "First paragraph\nSecond paragraph",
  shape: "rectangle",
  fill: "#ffffff",
  stroke: "#bcbcbc",
  strokeWidth: 1,
  color: "#000000",
  fontSize: 14.666666666666666,
  bold: false,
  italic: false,
  rotation: 0,
  shapeFrame: {
    kind: "shape-frame-v1",
    anchor: {
      mode: "move-and-size",
      start: {
        column: {
          index: 0,
          offset: 32,
        },
        row: {
          index: 14,
          offset: 19,
        },
      },
      end: {
        column: {
          index: 3,
          offset: 4,
        },
        row: {
          index: 19,
          offset: 9,
        },
      },
    },
  },
};

export const secondWebCreatedTextBox: SheetFramedGraphicDrawing = {
  id: "second-web-created-textbox",
  kind: "textBox",
  shapeText: {
    layout: {
      blockAlignment: "start",
      direction: "horizontal",
      lineOrder: "rtl",
      marginsPt: {
        leftPt: 7.2,
        rightPt: 7.2,
        topPt: 3.6,
        bottomPt: 3.6,
      },
      wrap: true,
      overflow: false,
      autoFit: "none",
      keepFlat: false,
    },
    paragraph: {
      alignment: "left",
      beforePt: 0,
      afterPt: 0,
      lineSpacing: {
        kind: "normal",
      },
    },
    fontFamily: "Inter",
  },
  name: "横排文本框",
  text: "Second owner",
  shape: "rectangle",
  fill: "#ffffff",
  stroke: "#bcbcbc",
  strokeWidth: 1,
  color: "#000000",
  fontSize: 14.666666666666666,
  bold: false,
  italic: false,
  rotation: 0,
  shapeFrame: {
    kind: "shape-frame-v1",
    anchor: {
      mode: "move-and-size",
      start: {
        column: {
          index: 3,
          offset: 24,
        },
        row: {
          index: 15,
          offset: 5,
        },
      },
      end: {
        column: {
          index: 5,
          offset: 72,
        },
        row: {
          index: 19,
          offset: 9,
        },
      },
    },
  },
};
