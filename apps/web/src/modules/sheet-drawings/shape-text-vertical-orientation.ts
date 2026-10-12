/*!
 * Unicode 17.0.0 Vertical_Orientation, generated from the official UCD data.
 * Data copyright © 2025 Unicode®, Inc.
 * Source: https://github.com/unicode-org/unicodetools/blob/main/unicodetools/data/ucd/17.0.0/VerticalOrientation.txt
 * Source Git blob SHA-1: c601f181231bd3afdfef4bb75b660ffe7ceef0d6; source date: 2025-07-24.
 * R is the @missing default. Adjacent non-R intervals of the same value are merged.
 * Orientation is applied to an entire grapheme using its leading scalar.
 *
 * UNICODE LICENSE V3
 *
 * COPYRIGHT AND PERMISSION NOTICE
 *
 * Copyright © 2001-2024 Unicode, Inc.
 *
 * NOTICE TO USER: Carefully read the following legal agreement. BY
 * DOWNLOADING, INSTALLING, COPYING OR OTHERWISE USING DATA FILES, AND/OR
 * SOFTWARE, YOU UNEQUIVOCALLY ACCEPT, AND AGREE TO BE BOUND BY, ALL OF THE
 * TERMS AND CONDITIONS OF THIS AGREEMENT. IF YOU DO NOT AGREE, DO NOT
 * DOWNLOAD, INSTALL, COPY, DISTRIBUTE OR USE THE DATA FILES OR SOFTWARE.
 *
 * Permission is hereby granted, free of charge, to any person obtaining a
 * copy of data files and any associated documentation (the "Data Files") or
 * software and any associated documentation (the "Software") to deal in the
 * Data Files or Software without restriction, including without limitation
 * the rights to use, copy, modify, merge, publish, distribute, and/or sell
 * copies of the Data Files or Software, and to permit persons to whom the
 * Data Files or Software are furnished to do so, provided that either (a)
 * this copyright and permission notice appear with all copies of the Data
 * Files or Software, or (b) this copyright and permission notice appear in
 * associated Documentation.
 *
 * THE DATA FILES AND SOFTWARE ARE PROVIDED "AS IS", WITHOUT WARRANTY OF ANY
 * KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
 * MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT OF
 * THIRD PARTY RIGHTS.
 *
 * IN NO EVENT SHALL THE COPYRIGHT HOLDER OR HOLDERS INCLUDED IN THIS NOTICE
 * BE LIABLE FOR ANY CLAIM, OR ANY SPECIAL INDIRECT OR CONSEQUENTIAL DAMAGES,
 * OR ANY DAMAGES WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS,
 * WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION,
 * ARISING OUT OF OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THE DATA
 * FILES OR SOFTWARE.
 *
 * Except as contained in this notice, the name of a copyright holder shall
 * not be used in advertising or otherwise to promote the sale, use or other
 * dealings in these Data Files or Software without prior written
 * authorization of the copyright holder.
 *
 * SPDX-License-Identifier: Unicode-3.0
 */
export type ShapeTextVerticalOrientation = "U" | "R" | "Tu" | "Tr";
export const SHAPE_TEXT_VERTICAL_ORIENTATION_VERSION = "17.0.0";
export const SHAPE_TEXT_VERTICAL_ORIENTATION_SOURCE_SHA =
  "c601f181231bd3afdfef4bb75b660ffe7ceef0d6";

const NON_DEFAULT_RANGES: readonly (readonly [
  number,
  number,
  Exclude<ShapeTextVerticalOrientation, "R">,
])[] = [
  [0xa7, 0xa7, "U"],
  [0xa9, 0xa9, "U"],
  [0xae, 0xae, "U"],
  [0xb1, 0xb1, "U"],
  [0xbc, 0xbe, "U"],
  [0xd7, 0xd7, "U"],
  [0xf7, 0xf7, "U"],
  [0x2ea, 0x2eb, "U"],
  [0x1100, 0x11ff, "U"],
  [0x1401, 0x167f, "U"],
  [0x18b0, 0x18ff, "U"],
  [0x2016, 0x2016, "U"],
  [0x2018, 0x2019, "Tr"],
  [0x201c, 0x201d, "Tr"],
  [0x2020, 0x2021, "U"],
  [0x2030, 0x2031, "U"],
  [0x203b, 0x203c, "U"],
  [0x2042, 0x2042, "U"],
  [0x2047, 0x2049, "U"],
  [0x2051, 0x2051, "U"],
  [0x2065, 0x2065, "U"],
  [0x20dd, 0x20e0, "U"],
  [0x20e2, 0x20e4, "U"],
  [0x2100, 0x2101, "U"],
  [0x2103, 0x2109, "U"],
  [0x210f, 0x210f, "U"],
  [0x2113, 0x2114, "U"],
  [0x2116, 0x2117, "U"],
  [0x211e, 0x2123, "U"],
  [0x2125, 0x2125, "U"],
  [0x2127, 0x2127, "U"],
  [0x2129, 0x2129, "U"],
  [0x212e, 0x212e, "U"],
  [0x2135, 0x213f, "U"],
  [0x2145, 0x214a, "U"],
  [0x214c, 0x214d, "U"],
  [0x214f, 0x2189, "U"],
  [0x218c, 0x218f, "U"],
  [0x221e, 0x221e, "U"],
  [0x2234, 0x2235, "U"],
  [0x2300, 0x2307, "U"],
  [0x230c, 0x231f, "U"],
  [0x2324, 0x2328, "U"],
  [0x2329, 0x232a, "Tr"],
  [0x232b, 0x232b, "U"],
  [0x237d, 0x239a, "U"],
  [0x23be, 0x23cd, "U"],
  [0x23cf, 0x23cf, "U"],
  [0x23d1, 0x23db, "U"],
  [0x23e2, 0x2422, "U"],
  [0x2424, 0x24ff, "U"],
  [0x25a0, 0x2619, "U"],
  [0x2620, 0x2767, "U"],
  [0x2776, 0x2793, "U"],
  [0x2b12, 0x2b2f, "U"],
  [0x2b50, 0x2b59, "U"],
  [0x2b97, 0x2b97, "U"],
  [0x2bb8, 0x2bd1, "U"],
  [0x2bd3, 0x2beb, "U"],
  [0x2bf0, 0x2bff, "U"],
  [0x2e50, 0x2e51, "U"],
  [0x2e80, 0x3000, "U"],
  [0x3001, 0x3002, "Tu"],
  [0x3003, 0x3007, "U"],
  [0x3008, 0x3011, "Tr"],
  [0x3012, 0x3013, "U"],
  [0x3014, 0x301f, "Tr"],
  [0x3020, 0x302f, "U"],
  [0x3030, 0x3030, "Tr"],
  [0x3031, 0x3040, "U"],
  [0x3041, 0x3041, "Tu"],
  [0x3042, 0x3042, "U"],
  [0x3043, 0x3043, "Tu"],
  [0x3044, 0x3044, "U"],
  [0x3045, 0x3045, "Tu"],
  [0x3046, 0x3046, "U"],
  [0x3047, 0x3047, "Tu"],
  [0x3048, 0x3048, "U"],
  [0x3049, 0x3049, "Tu"],
  [0x304a, 0x3062, "U"],
  [0x3063, 0x3063, "Tu"],
  [0x3064, 0x3082, "U"],
  [0x3083, 0x3083, "Tu"],
  [0x3084, 0x3084, "U"],
  [0x3085, 0x3085, "Tu"],
  [0x3086, 0x3086, "U"],
  [0x3087, 0x3087, "Tu"],
  [0x3088, 0x308d, "U"],
  [0x308e, 0x308e, "Tu"],
  [0x308f, 0x3094, "U"],
  [0x3095, 0x3096, "Tu"],
  [0x3097, 0x309a, "U"],
  [0x309b, 0x309c, "Tu"],
  [0x309d, 0x309f, "U"],
  [0x30a0, 0x30a0, "Tr"],
  [0x30a1, 0x30a1, "Tu"],
  [0x30a2, 0x30a2, "U"],
  [0x30a3, 0x30a3, "Tu"],
  [0x30a4, 0x30a4, "U"],
  [0x30a5, 0x30a5, "Tu"],
  [0x30a6, 0x30a6, "U"],
  [0x30a7, 0x30a7, "Tu"],
  [0x30a8, 0x30a8, "U"],
  [0x30a9, 0x30a9, "Tu"],
  [0x30aa, 0x30c2, "U"],
  [0x30c3, 0x30c3, "Tu"],
  [0x30c4, 0x30e2, "U"],
  [0x30e3, 0x30e3, "Tu"],
  [0x30e4, 0x30e4, "U"],
  [0x30e5, 0x30e5, "Tu"],
  [0x30e6, 0x30e6, "U"],
  [0x30e7, 0x30e7, "Tu"],
  [0x30e8, 0x30ed, "U"],
  [0x30ee, 0x30ee, "Tu"],
  [0x30ef, 0x30f4, "U"],
  [0x30f5, 0x30f6, "Tu"],
  [0x30f7, 0x30fb, "U"],
  [0x30fc, 0x30fc, "Tr"],
  [0x30fd, 0x3126, "U"],
  [0x3127, 0x3127, "Tu"],
  [0x3128, 0x31b3, "U"],
  [0x31b4, 0x31b7, "Tu"],
  [0x31b8, 0x31ba, "U"],
  [0x31bb, 0x31bb, "Tu"],
  [0x31bc, 0x31ef, "U"],
  [0x31f0, 0x31ff, "Tu"],
  [0x3200, 0x32fe, "U"],
  [0x32ff, 0x3357, "Tu"],
  [0x3358, 0x337a, "U"],
  [0x337b, 0x337f, "Tu"],
  [0x3380, 0xa4cf, "U"],
  [0xa960, 0xa97f, "U"],
  [0xac00, 0xd7ff, "U"],
  [0xe000, 0xfaff, "U"],
  [0xfe10, 0xfe1f, "U"],
  [0xfe30, 0xfe48, "U"],
  [0xfe50, 0xfe52, "Tu"],
  [0xfe53, 0xfe57, "U"],
  [0xfe59, 0xfe5e, "Tr"],
  [0xfe5f, 0xfe62, "U"],
  [0xfe67, 0xfe6f, "U"],
  [0xff01, 0xff01, "Tu"],
  [0xff02, 0xff07, "U"],
  [0xff08, 0xff09, "Tr"],
  [0xff0a, 0xff0b, "U"],
  [0xff0c, 0xff0c, "Tu"],
  [0xff0e, 0xff0e, "Tu"],
  [0xff0f, 0xff19, "U"],
  [0xff1a, 0xff1b, "Tr"],
  [0xff1f, 0xff1f, "Tu"],
  [0xff20, 0xff3a, "U"],
  [0xff3b, 0xff3b, "Tr"],
  [0xff3c, 0xff3c, "U"],
  [0xff3d, 0xff3d, "Tr"],
  [0xff3e, 0xff3e, "U"],
  [0xff3f, 0xff3f, "Tr"],
  [0xff40, 0xff5a, "U"],
  [0xff5b, 0xff60, "Tr"],
  [0xffe0, 0xffe2, "U"],
  [0xffe3, 0xffe3, "Tr"],
  [0xffe4, 0xffe7, "U"],
  [0xfff0, 0xfff8, "U"],
  [0xfffc, 0xfffd, "U"],
  [0x10980, 0x1099f, "U"],
  [0x11580, 0x115ff, "U"],
  [0x11a00, 0x11abf, "U"],
  [0x13000, 0x1467f, "U"],
  [0x16fe0, 0x18dff, "U"],
  [0x1aff0, 0x1b131, "U"],
  [0x1b132, 0x1b132, "Tu"],
  [0x1b133, 0x1b14f, "U"],
  [0x1b150, 0x1b152, "Tu"],
  [0x1b153, 0x1b154, "U"],
  [0x1b155, 0x1b155, "Tu"],
  [0x1b156, 0x1b163, "U"],
  [0x1b164, 0x1b167, "Tu"],
  [0x1b168, 0x1b2ff, "U"],
  [0x1cec0, 0x1cfcf, "U"],
  [0x1d000, 0x1d1ff, "U"],
  [0x1d2e0, 0x1d37f, "U"],
  [0x1d800, 0x1daaf, "U"],
  [0x1f000, 0x1f1ff, "U"],
  [0x1f200, 0x1f201, "Tu"],
  [0x1f202, 0x1f7ff, "U"],
  [0x1f900, 0x1faff, "U"],
  [0x20000, 0x2fffd, "U"],
  [0x30000, 0x3fffd, "U"],
  [0xf0000, 0xffffd, "U"],
  [0x100000, 0x10fffd, "U"],
];

export function getShapeTextVerticalOrientation(codePoint: number): ShapeTextVerticalOrientation {
  if (!Number.isInteger(codePoint) || codePoint < 0 || codePoint > 0x10ffff) return "R";
  let low = 0;
  let high = NON_DEFAULT_RANGES.length - 1;
  while (low <= high) {
    const middle = (low + high) >>> 1;
    const range = NON_DEFAULT_RANGES[middle]!;
    if (codePoint < range[0]) high = middle - 1;
    else if (codePoint > range[1]) low = middle + 1;
    else return range[2];
  }
  return "R";
}
