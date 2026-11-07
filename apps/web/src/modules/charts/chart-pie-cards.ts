import type {
  ChartPresentationSettings,
  PieFamily,
  PieGalleryFormat,
  PieLabel,
} from "@sheetcraft/core/chart-presentation";

export type PieCard = {
  colors: string[];
  labels: "none" | PieLabel;
  format: PieGalleryFormat & Pick<ChartPresentationSettings, "pieExploded">;
};
function card(
  colors: string[],
  labels: PieCard["labels"],
  format: PieCard["format"] = {},
): PieCard {
  return { colors, labels, format };
}

// Gallery order follows the five WPS pages. Each recipe is applied as editable chart properties.
export const pieCardsByFamily: Record<PieFamily, readonly PieCard[]> = {
  pie: [
    card(["#4472c4", "#ed7d31", "#a5a5a5", "#ffc000", "#5b9bd5", "#70ad47"], "none"),
    card(["#162464", "#20589b", "#3d8bc5", "#77b5df", "#a9cce9", "#d3e5f5"], "percent", {
      pieExploded: true,
      pieStroke: "light",
    }),
    card(["#474371", "#716fc1", "#f4efdc", "#586e91", "#8988b0", "#c3cad9"], "none", {
      pieExploded: true,
      pieStroke: "light",
    }),
    card(["#e95668", "#c21d2c", "#ed939d", "#fed6da", "#953239", "#f9b4ba"], "percent"),
    card(["#ff963f", "#ee5264", "#62bdeb", "#4b82f4", "#5bc19c"], "percent", {
      pieLabelPlacement: "boxedOutside",
      pieStroke: "light",
    }),
    card(["#132c85", "#dbaa76", "#182659", "#dbe8ff", "#ebc297", "#fae9d3"], "categoryPercent"),
    card(["#4c97fc", "#17ca77", "#fbb71a", "#fb6848", "#fb8719", "#55c4fc"], "categoryPercent", {
      pieFill: "gradient",
    }),
    card(["#3b73fc", "#88aafb", "#b4c9fc", "#d8e6fd", "#5476c6"], "categoryPercent"),
    card(["#34b8e5", "#fac346", "#ea5b75", "#376574", "#549795", "#d8fcfe"], "percent", {
      pieLabelPlacement: "boxedOutside",
    }),
    card(["#4974ca", "#f3ba05", "#ea8434", "#75bc45", "#fffada", "#79a9ad"], "categoryPercent", {
      pieLabelPlacement: "outside",
    }),
    card(["#fc5a57", "#fabb04", "#aa68f9", "#f65694", "#fffad7", "#861636"], "categoryPercent", {
      pieFill: "gradient",
    }),
    card(["#1992fc", "#fcc205", "#74a3fb", "#f99506", "#76d4fa", "#d7fbff"], "categoryPercent", {
      pieExploded: true,
      pieStroke: "light",
    }),
    card(["#ecb595", "#b67185", "#e27982", "#685b7d", "#f6ccb9", "#fde8d9"], "none"),
    card(["#9adbc5", "#b3cc36", "#4cc3c8", "#f886a9", "#d9fefe", "#fbffd8"], "categoryPercent", {
      pieLabelPlacement: "outside",
    }),
    card(["#6881fb", "#a4b4fc", "#dae5ff", "#8592e5"], "percent", { pieLabelPlacement: "outside" }),
    card(["#297894", "#e3a573", "#152644", "#e6c299", "#da7545", "#dafcfe"], "none", {
      pieExploded: true,
      pieStroke: "light",
    }),
    card(["#376cbd", "#e8ebef"], "categoryPercent", { pieFocusFirst: true }),
    card(["#87a9fc", "#27d495", "#97ddfd", "#5c8bfb", "#57dab7", "#d7e7fc"], "percent", {
      pieFill: "gradient",
    }),
    card(["#8687c5", "#68c7ea", "#85caa7", "#fcd7c9", "#e77958", "#f7b8a7"], "percent", {
      pieExploded: true,
      pieLabelPlacement: "outside",
      pieFill: "hatchGradient",
      pieStroke: "light",
    }),
    card(["#fdc804", "#35bc63", "#3d7af8", "#fc5d68", "#d8fee7", "#65a663"], "categoryPercent"),
    card(["#aae857", "#556ac7", "#67c8e8", "#69d5b7", "#d9fdfd", "#86e7fe"], "percent", {
      pieLabelPlacement: "outside",
      pieFill: "hatch",
    }),
    card(["#d8e4fe", "#b3c8fc", "#88aafb", "#567ac5", "#7696d8"], "percent", {
      pieLabelPlacement: "boxedOutside",
      pieFill: "hatch",
      pieStroke: "light",
    }),
    card(["#f4734c", "#68c7e9", "#7b7cba", "#85c8a6", "#d8fcfd", "#fedbc7"], "percent", {
      pieStroke: "light",
    }),
    card(["#e94d73", "#f4ccca", "#173e74", "#b8e2db", "#f58284"], "none"),
    card(["#fde387", "#fbecb8", "#fcc408", "#fffae0", "#d7c998"], "percent"),
    card(["#fefad8", "#d9fdfa", "#bac6e5", "#b69888", "#969cba", "#e9e5b6"], "percent", {
      pieExploded: true,
      pieFill: "outline",
      pieStroke: "light",
    }),
    card(["#fbcba8", "#457a6c", "#a4c8bb", "#fcaa8d", "#fde8d8", "#c3e4d9"], "percent", {
      pieLabelPlacement: "boxedOutside",
      pieFill: "hatch",
    }),
    card(["#374b79", "#2d79b5", "#838ca6", "#d8f8ff", "#9ce3ff", "#66a6d8"], "categoryPercent"),
    card(["#c8e7fd", "#fed8b6", "#ca9469", "#98bad6", "#e8b998", "#6986b8"], "percent", {
      pieExploded: true,
      pieLabelPlacement: "boxedInside",
      pieFill: "hatch",
      pieStroke: "light",
    }),
    card(["#4783fc", "#75c4fc", "#daf9fe", "#46c7f9", "#c5dde7", "#57a5ea"], "categoryPercent"),
    card(["#8c99ae", "#f95738", "#ea253a", "#4a0108", "#452438", "#fed7da"], "none"),
    card(["#fcd876", "#8dcaec", "#f47aa5", "#f7b7a5", "#96a9b9", "#c86688"], "categoryPercent", {
      pieStroke: "dark",
    }),
    card(["#c8a9e9", "#768bd8", "#79d3e8", "#d8fbff", "#a49bd9", "#46b9e6"], "percent", {
      pieExploded: true,
      pieFill: "hatch",
      pieStroke: "light",
    }),
    card(["#d8e5fe", "#fef4c9", "#caf6da", "#fadca7", "#cdbaaa", "#7b8aa6"], "none"),
    card(["#24ad95", "#d7f7f9", "#9ad8dc", "#3a6963", "#469a8b"], "none"),
    card(["#3cb8eb", "#79d2e8", "#fbc216", "#fc9619", "#fef7d8", "#d7f9fd"], "percent", {
      pieLabelPlacement: "boxedOutside",
      pieFill: "hatch",
    }),
  ],
  threeD: [
    card(["#4472c4", "#ed7d31", "#a5a5a5", "#ffc000", "#5b9bd5", "#70ad47"], "none"),
    card(["#4472c4", "#ed7d31", "#ffc000", "#70ad47", "#5b9bd5", "#9e480e"], "percent"),
    card(["#4472c4", "#ed7d31", "#ffc000", "#70ad47", "#5b9bd5", "#9e480e"], "categoryPercent", {
      pieLabelPlacement: "outside",
    }),
    card(["#467add", "#80a3ef", "#a9c5fd", "#c7d9ff"], "categoryPercent", { pieStroke: "light" }),
    card(["#8977fb", "#fdb448", "#fc8757", "#a697fb", "#fcd318", "#fff6d9"], "percent", {
      pieLabelPlacement: "outside",
      pieFill: "gradient",
    }),
    card(["#99d9fb", "#fde885", "#fd85b3", "#f8bba7", "#e9c768", "#fefad9"], "categoryPercent", {
      pieStroke: "dark",
    }),
    card(["#b6dbfc", "#8ac4fd", "#d9f6ff", "#358dfa", "#96b5d9", "#799ac3"], "categoryPercent", {
      pieLabelPlacement: "boxedOutside",
      pieFill: "gradient",
      pieStroke: "light",
    }),
    card(["#d8faff", "#fee5ba", "#a7c9d8", "#d5ab86", "#89a7c9", "#e9c6a7"], "categoryPercent", {
      pieLabelPlacement: "boxedInside",
      pieFill: "hatch",
      pieStroke: "light",
    }),
    card(["#fcb348", "#48c8ac", "#fc7a47", "#64b6fb", "#fff5cb", "#d8fdfc"], "percent"),
    card(["#fdfcd8", "#ddfcf5", "#c8ebd6", "#a6c9b5", "#d7d5a8", "#bab48a"], "categoryPercent", {
      pieStroke: "light",
    }),
    card(["#b7f7fe", "#cac5fa", "#fce5a9", "#fac9c9", "#a9a4d9", "#8b84b7"], "categoryPercent", {
      pieFill: "dots",
    }),
    card(["#59a7fb", "#26d997", "#1bd868", "#fc9825", "#d8fefa", "#58d4fb"], "categoryPercent", {
      pieFill: "gradient",
      pieStroke: "light",
    }),
    card(["#27bb85", "#5789fc", "#68e8b7", "#86abfb", "#fce887", "#fef5b5"], "percent", {
      pieFill: "gradient",
      pieStroke: "light",
    }),
    card(["#6c94f9", "#39ca9a", "#f8c539", "#f79464", "#d7fef6", "#fef5d8"], "percent"),
    card(["#fdc665", "#69c3fc", "#fa8957", "#3c93fb", "#fff7da", "#d8f7ff"], "percent", {
      pieLabelPlacement: "boxedOutside",
    }),
    card(["#fc9749", "#fdcd06", "#fa95bb", "#fff7d9", "#58d5fb", "#d77838"], "percent", {
      pieLabelPlacement: "boxedInside",
      pieStroke: "light",
    }),
    card(["#fda63a", "#f2b716", "#f58d0c", "#65b5a9", "#fff8d7", "#29948b"], "percent", {
      pieExploded: true,
    }),
    card(["#f88a37", "#87a8e8", "#fca866", "#fdd948", "#fcca19", "#fff8d9"], "categoryPercent", {
      pieFill: "gradient",
    }),
  ],
  pieOfPie: [
    card(["#4472c4", "#ed7d31", "#a5a5a5", "#ffc000", "#5b9bd5", "#70ad47"], "none", {
      pieStroke: "dark",
    }),
    card(["#4472c4", "#ed7d31", "#ffc000", "#70ad47", "#5b9bd5", "#9e480e"], "categoryPercent"),
    card(["#4472c4", "#ed7d31", "#ffc000", "#70ad47", "#5b9bd5", "#9e480e"], "categoryPercent", {
      pieLabelPlacement: "outside",
    }),
    card(["#f479a5", "#fdd776", "#94caea", "#b8e2dc", "#f7b39c", "#c76687"], "categoryPercent", {
      pieStroke: "dark",
    }),
    card(["#fbd9a8", "#b6e9fc", "#a7b8fb", "#fed8d7", "#8797e9", "#ebc788"], "percent", {
      pieFill: "checker",
    }),
    card(["#17cb68", "#53a9fd", "#f86377", "#fdb717", "#fd7719", "#fb6949"], "categoryPercent"),
    card(["#fcc805", "#3c7af8", "#35bb64", "#644dfb", "#fa6269", "#b8e5c7"], "categoryPercent"),
    card(["#f4a8c7", "#7667fa", "#64ccf6", "#fb8c46", "#fcb787", "#8adaf8"], "percent", {
      pieFill: "gradient",
      pieStroke: "light",
    }),
    card(["#78d6f8", "#48d9a4", "#fc8a58", "#588afc", "#fdd868", "#fde9d6"], "percent", {
      pieExploded: true,
      pieFill: "gradient",
      pieStroke: "light",
    }),
    card(["#c8d5fc", "#a5abfc", "#6a75fb", "#87d8f9", "#69bad9", "#8999db"], "percent", {
      pieLabelPlacement: "boxedOutside",
      pieFill: "hatch",
    }),
    card(["#fde7c9", "#c96649", "#d88975", "#f98c17", "#f9d648", "#fccaa6"], "percent", {
      pieLabelPlacement: "boxedInside",
      pieFill: "gradient",
    }),
    card(["#a9d5f9", "#87b8f8", "#d6eafc", "#2868d6", "#6699ea", "#a6bbd6"], "categoryPercent", {
      pieLabelPlacement: "boxedOutside",
      pieFill: "gradient",
      pieStroke: "light",
    }),
    card(["#f98529", "#556ac8", "#a9e957", "#67c9e8", "#69d3b7", "#d9fcfb"], "percent", {
      pieLabelPlacement: "outside",
      pieFill: "hatch",
    }),
    card(["#354bfb", "#1ac6c8", "#058cf5", "#04c23a", "#c2e869", "#c8fafe"], "categoryPercent"),
    card(["#fb9797", "#f97b79", "#8997f9", "#56bbb3", "#78cac3", "#c4e667"], "categoryPercent", {
      pieFill: "gradient",
    }),
    card(["#7363fb", "#46caf3", "#fd8b1b", "#fdb607", "#fb592c", "#fce8d7"], "percent", {
      pieExploded: true,
      pieLabelPlacement: "boxedOutside",
      pieStroke: "light",
    }),
    card(["#d5e9fa", "#96c8f7", "#b4c8d9", "#7698ba"], "categoryPercent", { pieFill: "hatch" }),
    card(["#fb9694", "#599bd5", "#86bcc6", "#eaccca", "#6989a9", "#956a66"], "categoryPercent", {
      pieStroke: "dark",
    }),
    card(["#fdc806", "#b677fb", "#6897f9", "#fc6269", "#437bf8", "#fcd438"], "percent", {
      pieExploded: true,
      pieStroke: "light",
    }),
    card(["#3875fc", "#74a3fc", "#fbbd05", "#85d8fc", "#fff3a8", "#fef9d8"], "percent", {
      pieLabelPlacement: "outside",
      pieFill: "hatch",
    }),
    card(["#fef7da", "#e7d8ba", "#c7b69a"], "categoryPercent", {
      pieLabelPlacement: "outside",
      pieFill: "outline",
    }),
    card(["#d9fbff", "#fee9d6", "#b6c6fd", "#97b7c7", "#e9d8b8", "#86b6f9"], "percent", {
      pieLabelPlacement: "boxedInside",
      pieFill: "hatchGradient",
      pieStroke: "light",
    }),
    card(["#fbdcb3", "#458d82", "#6aac98", "#faa78a", "#d8c7a8", "#fdf5db"], "percent", {
      pieLabelPlacement: "boxedInside",
    }),
    card(["#fbc506", "#f48bb5", "#fb8c45", "#5992f9", "#4bc9f7", "#d9f9fe"], "percent", {
      pieExploded: true,
      pieLabelPlacement: "boxedInside",
      pieStroke: "light",
    }),
    card(["#58ba45", "#fc9b25", "#fcbd3c", "#68bec2", "#75b667", "#a6ea99"], "percent", {
      pieFill: "hatch",
    }),
    card(["#e77854", "#97a2b6", "#dc5d37", "#daaaa8", "#fee4da", "#e68c77"], "percent", {
      pieFill: "gradient",
    }),
    card(["#649aa7", "#e66c58", "#fdd6cc", "#ffa795"], "categoryPercent"),
    card(["#4874ca", "#f4ba05", "#75bc45", "#ea8435", "#2cc3b5", "#fef9d9"], "none"),
    card(["#d8f9fd", "#fc8a46", "#fcc828", "#98dbf8", "#89a8f6", "#29d798"], "percent", {
      pieLabelPlacement: "boxedInside",
      pieFill: "gradient",
    }),
    card(["#4974ca", "#f4b905", "#77ba45", "#34c3b6", "#eb832b", "#fefbd8"], "categoryPercent"),
    card(["#3bb8ea", "#77d3e9", "#f9c316", "#d7332a", "#fa961a", "#d9fafe"], "percent", {
      pieExploded: true,
      pieLabelPlacement: "boxedInside",
      pieFill: "hatch",
      pieStroke: "light",
    }),
  ],
  barOfPie: [
    card(["#4472c4", "#ed7d31", "#a5a5a5", "#ffc000", "#5b9bd5", "#70ad47"], "none", {
      pieStroke: "dark",
    }),
    card(["#4472c4", "#ed7d31", "#ffc000", "#70ad47", "#5b9bd5", "#9e480e"], "categoryPercent"),
    card(["#4472c4", "#ed7d31", "#ffc000", "#70ad47", "#5b9bd5", "#9e480e"], "categoryPercent", {
      pieLabelPlacement: "outside",
    }),
    card(["#fff6d7", "#d9fbff", "#d8c597", "#66759a", "#97b7c8", "#e7d8b8"], "percent", {
      pieLabelPlacement: "boxedInside",
      pieFill: "hatchGradient",
    }),
    card(["#fc9a58", "#6797f9", "#f4a7c7", "#8576fb", "#a398fc", "#79d5f6"], "percent", {
      pieExploded: true,
      pieFill: "gradient",
      pieStroke: "light",
    }),
    card(["#17cb68", "#4cb7fd", "#fa5e76", "#4d89fc", "#fda819", "#fb7847"], "categoryPercent", {
      pieFill: "gradient",
    }),
    card(["#fdd876", "#b7e2dd", "#f279a5", "#8cc9eb", "#f7b6a5", "#774b5a"], "categoryPercent", {
      pieStroke: "dark",
    }),
    card(["#4865c4", "#56c2f8", "#4b4398", "#7dcb46", "#d9fcff", "#eafdd9"], "categoryPercent"),
    card(["#556ac7", "#f98529", "#67c8e8", "#a9e958", "#65c8ac", "#f8f9d9"], "categoryPercent", {
      pieLabelPlacement: "outside",
      pieFill: "hatch",
    }),
    card(["#f69aad", "#68dbd9", "#fc6d66", "#b297c7", "#76b3d9", "#d7fefe"], "percent"),
    card(["#7464fa", "#fb6637", "#46caf4", "#f98816", "#fce7c8", "#f9b615"], "percent", {
      pieLabelPlacement: "boxedInside",
      pieStroke: "light",
    }),
    card(["#fdc805", "#34bb64", "#634efb", "#3d7af8", "#f86369", "#b8e4c6"], "categoryPercent"),
    card(["#b6e5f8", "#77bcfc", "#6a75fc", "#8ce3ff", "#7a93e6", "#a4b6f5"], "percent", {
      pieLabelPlacement: "boxedOutside",
      pieFill: "hatchGradient",
      pieStroke: "light",
    }),
    card(["#fdf7da", "#dbd7b9", "#c8b79a"], "categoryPercent", {
      pieLabelPlacement: "outside",
      pieFill: "outline",
    }),
    card(["#cdb8a7", "#99321a", "#c87766", "#fee6d8", "#f4ccb7", "#b99884"], "categoryPercent", {
      pieFill: "dots",
    }),
    card(["#848afb", "#67c8f5", "#f7499b", "#fbcd36", "#a6a8fc", "#18cb8a"], "percent", {
      pieFill: "gradient",
      pieStroke: "dark",
    }),
    card(["#a9b7fb", "#7662f5", "#1a02a9", "#3528d8", "#fdc33a", "#7668c8"], "categoryPercent", {
      pieExploded: true,
      pieStroke: "light",
    }),
    card(["#f7ab18", "#5ac4e9", "#5cb595", "#f3897e", "#8376fb", "#c7f7fb"], "categoryPercent", {
      pieFill: "gradient",
      pieStroke: "light",
    }),
    card(["#fb8637", "#fcda37", "#fef8c8", "#d47c65", "#c5583a", "#fa6a0a"], "percent", {
      pieExploded: true,
      pieLabelPlacement: "boxedInside",
      pieFill: "gradient",
      pieStroke: "light",
    }),
    card(["#a8e6fa", "#a7b8fb", "#fbd9a7", "#d8d7ff", "#8799ea", "#78c9e7"], "percent", {
      pieFill: "checker",
    }),
    card(["#3775fc", "#fbbd04", "#73a2fb", "#a8e4fd", "#ffeba5", "#fef8d9"], "percent", {
      pieLabelPlacement: "outside",
      pieFill: "hatch",
    }),
    card(["#f5655b", "#37b3f4", "#f44b3c", "#fca28a", "#b6f6fe", "#fcd9d5"], "percent", {
      pieExploded: true,
      pieLabelPlacement: "boxedInside",
      pieFill: "hatch",
      pieStroke: "light",
    }),
    card(["#4b72fc", "#98ddf9", "#a36af6", "#cdb3f6", "#e9d6ff", "#9776cb"], "percent", {
      pieFill: "gradient",
    }),
    card(["#8b9bf6", "#93b37a", "#fcc448", "#e97746", "#fefad9", "#f99c77"], "categoryPercent"),
    card(["#4875c9", "#f4b905", "#76bb45", "#ec832c", "#35c2b6", "#d4fcfa"], "categoryPercent"),
    card(["#2d8cca", "#d4e9f6", "#abd2eb", "#86b8da", "#4885aa", "#56a4d9"], "categoryPercent"),
    card(["#c6e8fc", "#63a3ca", "#43c896", "#97dc8c", "#f686a3", "#5688a8"], "categoryPercent", {
      pieStroke: "dark",
    }),
  ],
  doughnut: [
    card(["#4472c4", "#ed7d31", "#a5a5a5", "#ffc000", "#5b9bd5", "#70ad47"], "none", {
      doughnutHole: 72,
    }),
    card(["#4472c4", "#ed7d31", "#ffc000", "#70ad47", "#5b9bd5", "#9e480e"], "percent"),
    card(["#4472c4", "#ed7d31", "#ffc000", "#70ad47", "#5b9bd5", "#9e480e"], "percent", {
      pieLabelPlacement: "outside",
    }),
    card(["#162464", "#20589b", "#3d8bc5", "#77b5df", "#a9cce9", "#d3e5f5"], "percent", {
      pieExploded: true,
      pieStroke: "light",
      doughnutHole: 40,
    }),
    card(["#f99a47", "#f9bda7", "#eb2c2a", "#f56219", "#fff5da"], "percent", {
      pieLabelPlacement: "outside",
      doughnutHole: 40,
    }),
    card(["#18c989", "#4b85fa", "#d8fdfa", "#fc7817", "#fab719", "#fef7d8"], "categoryPercent", {
      doughnutHole: 40,
    }),
    card(["#142c86", "#dbaa77", "#d9e6fe", "#fdebd6", "#19285a", "#e9d3b8"], "percent", {
      doughnutHole: 40,
    }),
    card(["#e95b75", "#fac546", "#386574", "#36b8e6", "#fef6d8", "#d8f7fe"], "percent", {
      pieExploded: true,
      pieLabelPlacement: "boxedOutside",
      pieStroke: "light",
      doughnutHole: 72,
    }),
    card(["#fff7d8", "#289886", "#d8fefc", "#e7c776", "#2b4854"], "percent", {
      pieLabelPlacement: "boxedOutside",
      doughnutHole: 72,
    }),
    card(["#18347a", "#2a59a8", "#6785e6", "#d7e8fd", "#7685b9", "#97a6c6"], "percent", {
      pieLabelPlacement: "boxedInside",
      pieStroke: "light",
    }),
    card(["#9ad7da", "#26ab96", "#d8fefc"], "percent", { pieExploded: true, pieStroke: "light" }),
    card(["#fb9d36", "#fa4756", "#fac537", "#046a99", "#fff8d9", "#dafbff"], "categoryPercent", {
      doughnutRim: true,
    }),
    card(["#466aa7", "#4488c5", "#d9f9fe", "#16b6d8", "#87c6da", "#6687a9"], "percent", {
      pieLabelPlacement: "boxedInside",
      pieStroke: "light",
    }),
    card(["#e85668", "#c31c2c", "#eb949c", "#fed6d9", "#992937", "#f8b5b9"], "percent", {
      doughnutHole: 40,
    }),
    card(["#859bc9", "#4869b7", "#c1cde6", "#d9e7fd", "#1a2945"], "categoryPercent", {
      pieLabelPlacement: "outside",
    }),
    card(["#c50204", "#263859", "#98131a", "#fed9d7"], "percent", {
      pieExploded: true,
      pieLabelPlacement: "boxedOutside",
      pieStroke: "dark",
    }),
    card(["#2977ba", "#daf7ff", "#6799d8", "#477699", "#85b8f7", "#a9c9e7"], "categoryPercent"),
    card(["#fbe6a8", "#a8c7e5", "#fbd468", "#fef8d9", "#89d4c5", "#d2c8ea"], "percent", {
      pieLabelPlacement: "boxedOutside",
      pieFill: "gradient",
    }),
    card(["#2acc94", "#4676e8", "#e87749", "#e8bd49", "#fbd666", "#43e3ac"], "categoryPercent", {
      doughnutHole: 26,
    }),
    card(["#3ae5d8", "#fb5b65", "#fa9758", "#dafdfd", "#2c5cf6", "#fef7db"], "categoryPercent", {
      doughnutRim: true,
    }),
    card(["#d8feff", "#1a96d7", "#caade7", "#9994d6", "#584ad9"], "categoryPercent", {
      pieLabelPlacement: "outside",
      doughnutHole: 80,
    }),
    card(["#444478", "#7473d7", "#576587", "#d5d7fc", "#7675ac", "#9798c7"], "percent", {
      pieLabelPlacement: "boxedInside",
      pieStroke: "light",
      doughnutHole: 40,
    }),
    card(["#c9e9fc", "#247ba4", "#25b9ea", "#fcc4aa", "#e58249", "#fee8d8"], "none"),
    card(["#863b44", "#f96638", "#383a5a", "#f99327", "#fee8d7"], "categoryPercent", {
      pieFill: "dots",
    }),
    card(["#376cbd", "#e8ebef"], "none", { pieFocusFirst: true, doughnutHole: 80 }),
    card(["#b4c4db", "#466aa8", "#8aa3cb", "#d8e8fc"], "percent", {
      pieLabelPlacement: "boxedInside",
      pieStroke: "light",
    }),
    card(["#78d4f6", "#b7eb76", "#77d5ba", "#687cc9", "#d8fbfc", "#e6fdc9"], "categoryPercent"),
    card(["#c9faea", "#fdf7d7", "#f7cab6", "#98d8c6"], "categoryPercent", { doughnutHole: 40 }),
    card(["#d8fefb", "#fef8d8", "#b8fbdb", "#fff5a8", "#66a888", "#b58669"], "percent", {
      pieLabelPlacement: "boxedOutside",
      pieFill: "hatch",
    }),
    card(["#79b6fa", "#9993e7", "#8475d6", "#5674d7", "#c5dbf9", "#b8b7e7"], "categoryPercent", {
      pieExploded: true,
      pieStroke: "light",
    }),
    card(["#a8e6fa", "#fbd9a7", "#bbb6fa", "#d9d7fd", "#fac777", "#f9a8a8"], "percent", {
      pieFill: "checker",
    }),
    card(["#fbd877", "#95cae9", "#f579a6", "#f6b7a7", "#79aac6", "#c76789"], "categoryPercent", {
      pieStroke: "dark",
      doughnutHole: 40,
    }),
    card(["#fff9d9", "#c897f9", "#fa8789", "#f7aa47", "#f6c629", "#ffe9a7"], "none", {
      doughnutHole: 72,
    }),
    card(["#ed327d", "#17181b"], "percent", {
      pieExploded: true,
      pieLabelPlacement: "boxedOutside",
      pieStroke: "dark",
      pieFocusFirst: true,
      doughnutHole: 72,
    }),
    card(["#69c8e7", "#aae857", "#d8fcfc", "#67c6ab", "#566bc8", "#a9fcfe"], "categoryPercent", {
      pieFill: "hatch",
      pieStroke: "light",
    }),
    card(["#daf8fc", "#fee6da", "#a6c6c9"], "percent", { pieFill: "outline", doughnutHole: 80 }),
  ],
};
