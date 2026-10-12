export function bitmap(
  options: {
    header?: number;
    width?: number;
    height?: number;
    depth?: number;
    compression?: number;
    colors?: number;
  } = {},
) {
  const header = options.header ?? 40,
    width = options.width ?? 3,
    height = options.height ?? 2,
    depth = options.depth ?? 24,
    compression = options.compression ?? 0,
    colors = options.colors ?? (depth <= 8 ? 2 ** depth : 0);
  const core = header === 12;
  const masks = compression === 3 && header === 40 ? 12 : 0;
  const palette = colors * (core ? 3 : 4);
  const offset = 14 + header + masks + palette;
  const pixels = Math.ceil((width * depth) / 32) * 4 * Math.abs(height);
  const bytes = new Uint8Array(offset + pixels),
    view = new DataView(bytes.buffer);
  bytes.set([0x42, 0x4d]);
  view.setUint32(2, bytes.length, true);
  view.setUint32(10, offset, true);
  view.setUint32(14, header, true);
  if (core) {
    view.setUint16(18, width, true);
    view.setUint16(20, height, true);
    view.setUint16(22, 1, true);
    view.setUint16(24, depth, true);
  } else {
    view.setInt32(18, width, true);
    view.setInt32(22, height, true);
    view.setUint16(26, 1, true);
    view.setUint16(28, depth, true);
    view.setUint32(30, compression, true);
    view.setUint32(34, pixels, true);
    view.setUint32(46, options.colors ?? 0, true);
    if (header >= 108) view.setUint32(70, 0x73524742, true);
  }
  if (compression === 3) {
    const start = 54;
    for (const [i, mask] of (depth === 16
      ? [0xf800, 0x07e0, 0x001f]
      : [0xff0000, 0xff00, 0xff]
    ).entries())
      view.setUint32(start + i * 4, mask, true);
  }
  return bytes;
}
