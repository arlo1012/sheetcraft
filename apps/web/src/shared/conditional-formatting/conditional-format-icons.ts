import type { ConditionalFormatIconSet } from "@idea10/core/conditional-formatting";
import type { Rect } from "@idea10/sheet-engine/geometry";

type Ink = { fill: string; edge: string };
const GREEN: Ink = { fill: "#70AC98", edge: "#417766" };
const YELLOW: Ink = { fill: "#F6CF7B", edge: "#B78A38" };
const RED: Ink = { fill: "#DF5934", edge: "#AC3F24" };
const GRAY: Ink = { fill: "#9B9B9B", edge: "#606060" };
const BLACK: Ink = { fill: "#555756", edge: "#363837" };
const TRAFFIC = [RED, YELLOW, GREEN] as const;

function polygon(
  context: CanvasRenderingContext2D,
  points: readonly (readonly [number, number])[],
): void {
  context.beginPath();
  points.forEach(([x, y], index) => {
    if (index === 0) context.moveTo(x, y);
    else context.lineTo(x, y);
  });
  context.closePath();
}
function finish(context: CanvasRenderingContext2D, ink: Ink): void {
  context.fillStyle = ink.fill;
  context.strokeStyle = ink.edge;
  context.fill();
  context.stroke();
}
function circle(context: CanvasRenderingContext2D, ink: Ink, radius = 8): void {
  context.beginPath();
  context.arc(9, 9, radius, 0, Math.PI * 2);
  finish(context, ink);
}
function arrow(
  context: CanvasRenderingContext2D,
  index: number,
  count: number,
  gray: boolean,
): void {
  const angle =
    count === 3
      ? [Math.PI, Math.PI / 2, 0][index]!
      : count === 4
        ? [Math.PI, Math.PI * 0.75, Math.PI * 0.25, 0][index]!
        : [Math.PI, Math.PI * 0.75, Math.PI / 2, Math.PI * 0.25, 0][index]!;
  const ink = gray ? GRAY : index === 0 ? RED : index === count - 1 ? GREEN : YELLOW;
  context.translate(9, 9);
  context.rotate(angle);
  context.translate(-9, -9);
  polygon(context, [
    [6.5, 16.5],
    [6.5, 7.5],
    [2.5, 7.5],
    [9, 1],
    [15.5, 7.5],
    [11.5, 7.5],
    [11.5, 16.5],
  ]);
  finish(context, ink);
  // A small inset edge keeps the shaft and head distinct at native menu size.
  context.beginPath();
  context.moveTo(7.7, 15);
  context.lineTo(7.7, 6.3);
  context.lineTo(5.2, 6.3);
  context.lineTo(9, 2.5);
  context.strokeStyle = "rgba(255, 255, 255, 0.65)";
  context.lineWidth = 0.7;
  context.stroke();
}
function triangle(context: CanvasRenderingContext2D, index: number): void {
  if (index === 1) {
    polygon(context, [
      [1, 6.5],
      [17, 6.5],
      [17, 11.5],
      [1, 11.5],
    ]);
  } else {
    polygon(
      context,
      index === 0
        ? [
            [1, 4.5],
            [17, 4.5],
            [9, 13.5],
          ]
        : [
            [1, 13.5],
            [9, 4.5],
            [17, 13.5],
          ],
    );
  }
  finish(context, TRAFFIC[index]!);
}
function sign(context: CanvasRenderingContext2D, index: number): void {
  if (index === 2) return circle(context, GREEN);
  polygon(
    context,
    index === 0
      ? [
          [9, 1],
          [17, 9],
          [9, 17],
          [1, 9],
        ]
      : [
          [9, 1.5],
          [17, 16.5],
          [1, 16.5],
        ],
  );
  finish(context, TRAFFIC[index]!);
}
function symbol(context: CanvasRenderingContext2D, index: number, circled: boolean): void {
  const ink = TRAFFIC[index]!;
  if (circled) {
    circle(context, ink);
    context.strokeStyle = "#FFFFFF";
    context.lineWidth = 1.8;
    context.lineCap = "round";
    context.beginPath();
    if (index === 0) {
      context.moveTo(5.5, 5.5);
      context.lineTo(12.5, 12.5);
      context.moveTo(12.5, 5.5);
      context.lineTo(5.5, 12.5);
    } else if (index === 1) {
      context.moveTo(9, 4);
      context.lineTo(9, 10);
      context.moveTo(9, 13);
      context.lineTo(9, 13.2);
    } else {
      context.moveTo(4.5, 9);
      context.lineTo(7.5, 12);
      context.lineTo(13.5, 5.5);
    }
    context.stroke();
    return;
  }
  if (index === 0) {
    polygon(context, [
      [3, 1.5],
      [9, 7.5],
      [15, 1.5],
      [17, 3.5],
      [11, 9.5],
      [17, 15.5],
      [15, 17.5],
      [9, 11.5],
      [3, 17.5],
      [1, 15.5],
      [7, 9.5],
      [1, 3.5],
    ]);
  } else if (index === 1) {
    polygon(context, [
      [7, 1],
      [11, 1],
      [10.5, 12],
      [7.5, 12],
    ]);
    finish(context, ink);
    context.beginPath();
    context.arc(9, 15.5, 1.8, 0, Math.PI * 2);
  } else {
    polygon(context, [
      [1.5, 9],
      [4, 6.5],
      [7, 9.5],
      [14, 1.5],
      [17, 4],
      [7.5, 15.5],
    ]);
  }
  finish(context, ink);
}
function flag(context: CanvasRenderingContext2D, index: number): void {
  context.beginPath();
  context.moveTo(3.5, 1);
  context.lineTo(3.5, 17);
  context.strokeStyle = "#686C6B";
  context.stroke();
  polygon(context, [
    [6, 2],
    [16, 6.5],
    [6, 11],
  ]);
  finish(context, TRAFFIC[index]!);
}
function traceStar(context: CanvasRenderingContext2D): void {
  const points = Array.from({ length: 10 }, (_, index): [number, number] => {
    const angle = -Math.PI / 2 + (index * Math.PI) / 5;
    const radius = index % 2 === 0 ? 8.7 : 3.9;
    return [9 + Math.cos(angle) * radius, 9 + Math.sin(angle) * radius];
  });
  polygon(context, points);
}
function star(context: CanvasRenderingContext2D, index: number): void {
  traceStar(context);
  context.fillStyle = "#FFFFFF";
  context.fill();
  if (index > 0) {
    context.save();
    context.clip();
    context.fillStyle = YELLOW.fill;
    context.fillRect(0, 0, index === 1 ? 9 : 18, 18);
    context.restore();
  }
  traceStar(context);
  context.strokeStyle = index === 2 ? YELLOW.edge : "#737574";
  context.stroke();
}
function rating(context: CanvasRenderingContext2D, index: number, count: number): void {
  // Both families use the same four-step staircase. Four ratings start at one
  // filled bar; five ratings additionally include an entirely empty staircase.
  const filled = count === 4 ? index + 1 : index;
  for (let bar = 0; bar < 4; bar++) {
    const left = 1 + bar * 4;
    const height = 5 + bar * 4;
    context.fillStyle = bar < filled ? "#4B82B9" : "#E4E4E4";
    context.strokeStyle = bar < filled ? "#355F88" : "#8B8B8B";
    context.fillRect(left, 18 - height, 4, height);
    context.strokeRect(left + 0.5, 18.5 - height, 3, height - 1);
  }
}
function quarter(context: CanvasRenderingContext2D, index: number): void {
  circle(context, { fill: "#FFFFFF", edge: BLACK.edge });
  if (index > 0) {
    context.beginPath();
    context.moveTo(9, 9);
    context.arc(9, 9, 8, -Math.PI / 2, -Math.PI / 2 + (index / 4) * Math.PI * 2);
    context.closePath();
    context.fillStyle = BLACK.fill;
    context.fill();
    context.beginPath();
    context.arc(9, 9, 8, 0, Math.PI * 2);
    context.strokeStyle = BLACK.edge;
    context.stroke();
  }
}
function boxes(context: CanvasRenderingContext2D, index: number): void {
  // The lower row fills first, followed by the upper-left and upper-right quadrants.
  const order = [2, 3, 0, 1];
  for (let cell = 0; cell < 4; cell++) {
    context.fillStyle = order.indexOf(cell) < index ? "#4B82B9" : "#C5C5C5";
    context.fillRect(1 + (cell % 2) * 8, 1 + Math.floor(cell / 2) * 8, 8, 8);
  }
  context.strokeStyle = index > 0 ? "#3E6489" : "#747474";
  context.strokeRect(1, 1, 16, 16);
  context.beginPath();
  context.moveTo(9, 1);
  context.lineTo(9, 17);
  context.moveTo(1, 9);
  context.lineTo(17, 9);
  context.stroke();
}

/** Native paths shared by the sheet canvas and all conditional-format previews. */
export function paintConditionalFormatIcon(
  context: CanvasRenderingContext2D,
  rect: Rect,
  iconSet: ConditionalFormatIconSet,
  iconIndex: number,
): void {
  const count = iconSet.startsWith("three") ? 3 : iconSet.startsWith("four") ? 4 : 5;
  const index = Math.max(0, Math.min(count - 1, iconIndex));
  const size = Math.max(0, Math.min(rect.height - 4, rect.width - 2, 18));
  if (size === 0) return;
  context.save();
  context.translate(rect.x + 2, rect.y + (rect.height - size) / 2);
  context.scale(size / 18, size / 18);
  context.lineWidth = 1;
  context.lineJoin = "round";
  context.lineCap = "butt";
  try {
    if (iconSet.includes("Arrows")) arrow(context, index, count, iconSet.endsWith("Gray"));
    else if (iconSet === "threeTriangles") triangle(context, index);
    else if (iconSet === "threeSigns") sign(context, index);
    else if (iconSet.includes("Symbols")) symbol(context, index, iconSet.endsWith("Circled"));
    else if (iconSet === "threeFlags") flag(context, index);
    else if (iconSet === "threeStars") star(context, index);
    else if (iconSet.includes("Ratings")) rating(context, index, count);
    else if (iconSet === "fiveQuarters") quarter(context, index);
    else if (iconSet === "fiveBoxes") boxes(context, index);
    else if (iconSet === "fourRedToBlack")
      circle(
        context,
        [BLACK, { fill: "#C3C3C3", edge: "#868686" }, { fill: "#EFB5A6", edge: "#AD7E72" }, RED][
          index
        ]!,
      );
    else if (iconSet === "threeTrafficLightsRimmed") {
      context.fillStyle = "#484A49";
      context.fillRect(0.5, 0.5, 17, 17);
      circle(context, TRAFFIC[index]!, 5.8);
    } else
      circle(
        context,
        iconSet === "fourTrafficLights"
          ? [BLACK, { fill: "#EE8A6B", edge: "#BE6146" }, YELLOW, GREEN][index]!
          : TRAFFIC[index]!,
      );
  } finally {
    context.restore();
  }
}
