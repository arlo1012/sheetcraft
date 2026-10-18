export type NoticeRect = { x: number; y: number; width: number; height: number };
/** A compact explicit fallback only. Never expand an automatic notice over plot text. */
export function chartNoticeButtonPosition(
  chart: NoticeRect,
  preferred: { x: number; y: number },
  viewport: { width: number; height: number },
) {
  const size = 24,
    inset = 4;
  const visible =
    preferred.x >= inset &&
    preferred.y >= inset &&
    preferred.x + size <= viewport.width - inset &&
    preferred.y + size <= viewport.height - inset;
  const outside =
    preferred.x + size <= chart.x ||
    preferred.x >= chart.x + chart.width ||
    preferred.y + size <= chart.y ||
    preferred.y >= chart.y + chart.height;
  if (visible && outside) return { ...preferred, fallback: false };
  return {
    x: Math.max(
      inset,
      Math.min(chart.x + chart.width - size - inset, viewport.width - size - inset),
    ),
    y: Math.max(inset, Math.min(chart.y + inset, viewport.height - size - inset)),
    fallback: true,
  };
}
