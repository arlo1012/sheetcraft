import { color } from "echarts/core";
import type { CustomSeriesOption } from "echarts";

export type PieSector = {
  name: string;
  value: number | "-";
  color: string;
  text: string;
  label: string;
  fraction: number;
};

/** Project the visible front wall and the elliptical top of each sector separately. */
export function perspectivePie(
  seriesName: string,
  sectors: PieSector[],
  cx: number,
  cy: number,
  radius: number,
  exploded: boolean,
  showLabels: boolean,
): CustomSeriesOption {
  const ry = radius * 0.54,
    depth = radius * 0.24;
  let angle = -Math.PI / 2;
  const angles = sectors.map((s) => {
    const start = angle;
    angle += Math.PI * 2 * s.fraction;
    return [start, angle] as const;
  });
  return {
    type: "custom",
    name: seriesName,
    coordinateSystem: "none",
    data: sectors.map((s) => ({ value: s.value, name: s.name, itemStyle: { color: s.color } })),
    tooltip: {
      formatter: (p) => {
        const point = Array.isArray(p) ? p[0] : p;
        return point ? sectors[point.dataIndex]!.text : "";
      },
    },
    renderItem(params) {
      const index = params.dataIndex,
        s = sectors[index]!;
      if (!(s.fraction > 0)) return;
      const [start, end] = angles[index]!,
        middle = (start + end) / 2;
      const x = cx + (exploded ? radius * 0.09 * Math.cos(middle) : 0);
      const y = cy + (exploded ? ry * 0.09 * Math.sin(middle) : 0) - depth / 2;
      const at = (a: number, dy = 0) => `${x + radius * Math.cos(a)},${y + ry * Math.sin(a) + dy}`;
      // Splitting arcs also represents a full ellipse when only one category is visible.
      const arc = (a: number, b: number, dy = 0, reverse = false) => {
        const direction = reverse ? 0 : 1,
          m = (a + b) / 2;
        return `A${radius},${ry} 0 0 ${direction} ${at(m, dy)} A${radius},${ry} 0 0 ${direction} ${at(b, dy)}`;
      };
      const top = `M${x},${y} L${at(start)} ${arc(start, end)} Z`;
      const walls = [];
      for (const horizon of [0, Math.PI * 2]) {
        const a = Math.max(start, horizon),
          b = Math.min(end, horizon + Math.PI);
        if (b > a)
          walls.push(`M${at(a)} ${arc(a, b)} L${at(b, depth)} ${arc(b, a, depth, true)} Z`);
      }
      if (exploded && s.fraction < 1) {
        const cut = (a: number) => `M${x},${y} L${at(a)} L${at(a, depth)} L${x},${y + depth} Z`;
        if (Math.cos(start) < 0) walls.push(cut(start));
        if (Math.cos(end) > 0) walls.push(cut(end));
      }
      return {
        type: "group",
        children: [
          ...walls.map((pathData) => ({
            type: "path" as const,
            shape: { pathData },
            style: {
              fill: {
                type: "linear" as const,
                x: x - radius,
                y: 0,
                x2: x + radius,
                y2: 0,
                global: true,
                colorStops: [
                  { offset: 0, color: color.lerp(0.45, [s.color, "#000000"])! },
                  { offset: 0.4, color: s.color },
                  { offset: 1, color: color.lerp(0.6, [s.color, "#000000"])! },
                ],
              },
            },
            z2: 0,
          })),
          { type: "path", shape: { pathData: top }, style: { fill: s.color }, z2: 1 },
          ...(showLabels && s.label
            ? [
                {
                  type: "text" as const,
                  style: {
                    text: s.label,
                    x: x + radius * 0.68 * Math.cos(middle),
                    y: y + ry * 0.68 * Math.sin(middle),
                    align: "center" as const,
                    verticalAlign: "middle" as const,
                    fill: "#ffffff",
                    fontSize: 11,
                  },
                  z2: 2,
                },
              ]
            : []),
        ],
      };
    },
  };
}
