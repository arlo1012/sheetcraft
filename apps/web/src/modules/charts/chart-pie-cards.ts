import { rotateChartPalette, type PieLabel } from "@sheetcraft/core/chart-presentation";

type PieCard = { colors: readonly string[]; labels: "none" | PieLabel; exploded: boolean };
export const pieCards: readonly PieCard[] = [
  {
    colors: ["#4472c4", "#ed7d31", "#a5a5a5", "#ffc000", "#5b9bd5", "#70ad47"],
    labels: "none",
    exploded: false,
  },
  {
    colors: ["#162464", "#20589b", "#3d8bc5", "#77b5df", "#a9cce9", "#d3e5f5"],
    labels: "percent",
    exploded: true,
  },
  {
    colors: ["#474371", "#716fc1", "#f4efdc", "#586e91", "#8988b0", "#c3cad9"],
    labels: "none",
    exploded: true,
  },
  {
    colors: ["#b62035", "#f04967", "#ef9caa", "#d55775", "#a94469", "#f7bec8"],
    labels: "percent",
    exploded: true,
  },
  {
    colors: ["#ff963f", "#ee5264", "#62bdeb", "#4b82f4", "#5bc19c", "#b88bde"],
    labels: "percent",
    exploded: false,
  },
  {
    colors: ["#1c3374", "#dfad71", "#768ab7", "#e3c5aa", "#526e9d", "#bda789"],
    labels: "categoryPercent",
    exploded: false,
  },
];
export function pieCardColors(
  index: number,
  followTheme: boolean,
  themeColors: readonly string[],
): string[] {
  return followTheme ? rotateChartPalette(themeColors, index) : [...pieCards[index]!.colors];
}
