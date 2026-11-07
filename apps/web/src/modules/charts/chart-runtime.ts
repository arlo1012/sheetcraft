import { init, use, type EChartsType } from "echarts/core";
import {
  CustomChart,
  FunnelChart,
  GaugeChart,
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
  GraphicComponent,
} from "echarts/components";
import { SVGRenderer } from "echarts/renderers";
use([
  CustomChart,
  FunnelChart,
  GaugeChart,
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
  GraphicComponent,
  SVGRenderer,
]);
export { init, type EChartsType };
