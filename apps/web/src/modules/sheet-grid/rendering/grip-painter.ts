/** Lucide GripHorizontal/GripVertical geometry at the original 12px icon size. */
export function paintGripIcon(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  horizontal: boolean,
  color: string,
): void {
  context.save();
  context.strokeStyle = color;
  context.lineWidth = 1;
  for (const along of [-3.5, 0, 3.5]) {
    for (const across of [-1.5, 1.5]) {
      context.beginPath();
      context.arc(
        x + (horizontal ? along : across),
        y + (horizontal ? across : along),
        0.5,
        0,
        Math.PI * 2,
      );
      context.stroke();
    }
  }
  context.restore();
}
