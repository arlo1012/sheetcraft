import { init, use, type EChartsType } from "echarts/core";
import {
  BarChart,
  LineChart,
  PieChart,
  ScatterChart,
  RadarChart,
  TreemapChart,
  SankeyChart,
  ThemeRiverChart,
} from "echarts/charts";
import {
  TitleComponent,
  TooltipComponent,
  LegendComponent,
  GridComponent,
  RadarComponent,
  SingleAxisComponent,
} from "echarts/components";
import { SVGRenderer } from "echarts/renderers";
use([
  BarChart,
  LineChart,
  PieChart,
  ScatterChart,
  RadarChart,
  TreemapChart,
  SankeyChart,
  ThemeRiverChart,
  TitleComponent,
  TooltipComponent,
  LegendComponent,
  GridComponent,
  RadarComponent,
  SingleAxisComponent,
  SVGRenderer,
]);
export { init, type EChartsType };
