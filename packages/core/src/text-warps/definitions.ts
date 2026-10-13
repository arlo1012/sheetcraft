import type { TextWarpDefinition } from "./types.js";
import type { TextWarpPresetName } from "./catalog.js";
// Generated from the pinned ECMA-376 text-warp resource; do not edit by hand.
/*!
# Ecma policy notices for preset text-warp data

Read from the primary Ecma policy pages on 2026-10-13. These full applicable notices accompany the unchanged XML and generated text-warp data. Source excerpt boundaries are recorded below. Do not substitute an inferred copyright year or owner for a blank placeholder in Ecma's published Exhibit A. Retain these notices, conditions and disclaimers in source and binary-distribution documentation/materials.

Software policy: https://ecma-international.org/policies/by-ipr/ecma-international-policy-on-submission-inclusion-and-licensing-of-software/

Exhibit A, exact published template and associated notice (software policy page, paragraphs corresponding to extracted lines 33–49):

(3) The following legend or notice, together with the license, will be prominently displayed on any Ecma International Standard in which software is included: “SOFTWARE, AS DEFINED IN THE ECMA INTERNATIONAL POLICY ON SUBMISSION, INCLUSION AND LICENSING OF SOFTWARE AVAILABLE AT [https://www.ecma-international.org/ipr ] (“POLICY”), WHICH IS INCLUDED IN AN ECMA INTERNATIONAL STANDARD SHALL BE MADE AVAILABLE PURSUANT TO THE LICENSE SET FORTH IN EXHIBIT A (“LICENSE”) OF THE POLICY.
EXHIBIT A
The <> is protected by copyright and is being made available under the “BSD license”, included below. No patent license is granted, nor is a patent license commitment made, by implication, estoppel or otherwise by Ecma International or any member of Ecma International. This software may also be subject to third party rights (rights from parties other than Ecma International or Ecma International members), including patent rights, and no licenses under such third party rights are granted.
SEE THE ECMA CODE OF CONDUCT IN PATENT MATTERS AVAILABLE AT [https://www.ecma-international.org/ipr ] FOR INFORMATION REGARDING THE LICENSING OF PATENT CLAIMS OWNED BY ECMA INTERNATIONAL MEMBERS THAT ARE REQUIRED TO IMPLEMENT ECMA INTERNATIONAL STANDARDS.*
Copyright © <> <>

All rights reserved.

Redistribution and use in source and binary forms, with or without modification, are permitted provided that the following conditions are met:

1. Redistributions of source code must retain the above copyright notice, this list of conditions and the following disclaimer.
2. Redistributions in binary form must reproduce the above copyright notice, this list of conditions and the following disclaimer in the documentation and/or other materials provided with the distribution.

3. Neither the name of the authors nor Ecma International may be used to endorse or promote products derived from this software without specific prior written permission.
THIS SOFTWARE IS PROVIDED BY THE ECMA INTERNATIONAL “AS IS” AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED.
IN NO EVENT SHALL ECMA INTERNATIONAL BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
* Ecma International Standards hereafter means Ecma International Standards as well as Ecma Technical Reports

Software-policy scope example (extracted line 129):

“Source code” means software expressed using a formal language that is able to be read and understood by humans (e.g. C++ source code, JavaScript code, assembly language listings, XML data sets, HTML page descriptions, tabular instructions etc.).

Text policy: https://ecma-international.org/policies/by-ipr/ecma-text-copyright-policy/

Version 3, approved December 2025. Default notice/license, exact published text (extracted lines 10–27):

COPYRIGHT NOTICE

© Ecma International

By obtaining and/or copying this work, you (the licensee) agree that you have read, understood, and will comply with the following terms and conditions.
This document may be copied, published and distributed to others, and certain derivative works of it may be prepared, copied, published, and distributed, in whole or in part, provided that the above copyright notice and this Copyright License and Disclaimer are included on all such copies and derivative works. The only derivative works that are permissible under this Copyright License and Disclaimer are:
(i) works which incorporate all or portion of this document for the purpose of providing commentary or explanation (such as an annotated version of the document),

(ii) works which incorporate all or portion of this document for the purpose of incorporating features that provide accessibility,

(iii) translations of this document into languages other than English and into different formats and
(iv) works by making use of this specification in standard conformant products by implementing (e.g. by copy and paste wholly or partly) the functionality therein.

However, the content of this document itself may not be modified in any way, including by removing the copyright notice or references to Ecma International, except as required to translate it into languages other than English or into a different format.
The official version of an Ecma International document is the English language version on the Ecma International website. In the event of discrepancies between a translated version and the official version, the official version shall govern.

The limited permissions granted above are perpetual and will not be revoked by Ecma International or its successors or assigns.
This document and the information contained herein is provided on an “AS IS” basis and ECMA INTERNATIONAL DISCLAIMS ALL WARRANTIES, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO ANY WARRANTY THAT THE USE OF THE INFORMATION HEREIN WILL NOT INFRINGE ANY OWNERSHIP RIGHTS OR ANY IMPLIED WARRANTIES OF MERCHANTABILITY OR FITNESS FOR A PARTICULAR PURPOSE.

Applicability note:
Do not select the alternative text license: the selected 2016 archive has not been shown to publish under that option. The software policy explicitly covers XML data sets and provides source/binary redistribution conditions. The current default text license independently includes implementing functionality in conformant products. Preserve the unchanged XML, source hash/archive/member metadata, the full applicable notices and disclaimers, and a generated-data derivation statement. Source XML and its containing geometry ZIP have no embedded copyright/license text and no supplied contributor/year substitution for the software-policy template. This evidence is a copyright/provenance assessment, not patent, third-party font, or other rights clearance.
*/
export const TEXT_WARP_DEFINITIONS: Readonly<Record<TextWarpPresetName, TextWarpDefinition>> = {
  textArchDown: {
    guides: [
      ["adval", "pin", "0", "adj", "21599999"],
      ["v1", "+-", "10800000", "0", "adval"],
      ["v2", "+-", "32400000", "0", "adval"],
      ["nv1", "+-", "0", "0", "v1"],
      ["stAng", "?:", "nv1", "v2", "v1"],
      ["w1", "+-", "5400000", "0", "adval"],
      ["w2", "+-", "16200000", "0", "adval"],
      ["d1", "+-", "adval", "0", "stAng"],
      ["d2", "+-", "d1", "0", "21600000"],
      ["v3", "+-", "0", "0", "10800000"],
      ["c2", "?:", "w2", "d1", "d2"],
      ["c1", "?:", "v1", "d2", "c2"],
      ["c0", "?:", "w1", "d1", "c1"],
      ["swAng", "?:", "stAng", "c0", "v3"],
      ["wt1", "sin", "wd2", "adj"],
      ["ht1", "cos", "hd2", "adj"],
      ["dx1", "cat2", "wd2", "ht1", "wt1"],
      ["dy1", "sat2", "hd2", "ht1", "wt1"],
      ["x1", "+-", "hc", "dx1", "0"],
      ["y1", "+-", "vc", "dy1", "0"],
      ["wt2", "sin", "wd2", "stAng"],
      ["ht2", "cos", "hd2", "stAng"],
      ["dx2", "cat2", "wd2", "ht2", "wt2"],
      ["dy2", "sat2", "hd2", "ht2", "wt2"],
      ["x2", "+-", "hc", "dx2", "0"],
      ["y2", "+-", "vc", "dy2", "0"],
    ],
    handles: [
      {
        kind: "ahPolar",
        fields: { gdRefAng: "adj", minAng: "0", maxAng: "21599999" },
        position: ["x1", "y1"],
      },
    ],
    paths: [
      {
        commands: [
          ["moveTo", "x2", "y2"],
          ["arcTo", "wd2", "hd2", "stAng", "swAng"],
        ],
      },
    ],
    family: "follow-path",
    tracks: [{ pathIndex: 0 }],
    bands: [],
  },
  textArchDownPour: {
    guides: [
      ["adval", "pin", "0", "adj1", "21599999"],
      ["v1", "+-", "10800000", "0", "adval"],
      ["v2", "+-", "32400000", "0", "adval"],
      ["nv1", "+-", "0", "0", "v1"],
      ["stAng", "?:", "nv1", "v2", "v1"],
      ["w1", "+-", "5400000", "0", "adval"],
      ["w2", "+-", "16200000", "0", "adval"],
      ["d1", "+-", "adval", "0", "stAng"],
      ["d2", "+-", "d1", "0", "21600000"],
      ["v3", "+-", "0", "0", "10800000"],
      ["c2", "?:", "w2", "d1", "d2"],
      ["c1", "?:", "v1", "d2", "c2"],
      ["c0", "?:", "w1", "d1", "c1"],
      ["swAng", "?:", "stAng", "c0", "v3"],
      ["wt1", "sin", "wd2", "stAng"],
      ["ht1", "cos", "hd2", "stAng"],
      ["dx1", "cat2", "wd2", "ht1", "wt1"],
      ["dy1", "sat2", "hd2", "ht1", "wt1"],
      ["x1", "+-", "hc", "dx1", "0"],
      ["y1", "+-", "vc", "dy1", "0"],
      ["adval2", "pin", "0", "adj2", "99000"],
      ["ratio", "*/", "adval2", "1", "100000"],
      ["iwd2", "*/", "wd2", "ratio", "1"],
      ["ihd2", "*/", "hd2", "ratio", "1"],
      ["wt2", "sin", "iwd2", "adval"],
      ["ht2", "cos", "ihd2", "adval"],
      ["dx2", "cat2", "iwd2", "ht2", "wt2"],
      ["dy2", "sat2", "ihd2", "ht2", "wt2"],
      ["x2", "+-", "hc", "dx2", "0"],
      ["y2", "+-", "vc", "dy2", "0"],
      ["wt3", "sin", "iwd2", "stAng"],
      ["ht3", "cos", "ihd2", "stAng"],
      ["dx3", "cat2", "iwd2", "ht3", "wt3"],
      ["dy3", "sat2", "ihd2", "ht3", "wt3"],
      ["x3", "+-", "hc", "dx3", "0"],
      ["y3", "+-", "vc", "dy3", "0"],
    ],
    handles: [
      {
        kind: "ahPolar",
        fields: {
          gdRefR: "adj2",
          minR: "0",
          maxR: "100000",
          gdRefAng: "adj1",
          minAng: "0",
          maxAng: "21599999",
        },
        position: ["x2", "y2"],
      },
    ],
    paths: [
      {
        commands: [
          ["moveTo", "x3", "y3"],
          ["arcTo", "iwd2", "ihd2", "stAng", "swAng"],
        ],
      },
      {
        commands: [
          ["moveTo", "x1", "y1"],
          ["arcTo", "wd2", "hd2", "stAng", "swAng"],
        ],
      },
    ],
    family: "envelope",
    tracks: [],
    bands: [{ topPathIndex: 0, bottomPathIndex: 1 }],
  },
  textArchUp: {
    guides: [
      ["adval", "pin", "0", "adj", "21599999"],
      ["v1", "+-", "10800000", "0", "adval"],
      ["v2", "+-", "32400000", "0", "adval"],
      ["end", "?:", "v1", "v1", "v2"],
      ["w1", "+-", "5400000", "0", "adval"],
      ["w2", "+-", "16200000", "0", "adval"],
      ["d1", "+-", "end", "0", "adval"],
      ["d2", "+-", "21600000", "d1", "0"],
      ["c2", "?:", "w2", "d1", "d2"],
      ["c1", "?:", "v1", "d2", "c2"],
      ["swAng", "?:", "w1", "d1", "c1"],
      ["wt1", "sin", "wd2", "adj"],
      ["ht1", "cos", "hd2", "adj"],
      ["dx1", "cat2", "wd2", "ht1", "wt1"],
      ["dy1", "sat2", "hd2", "ht1", "wt1"],
      ["x1", "+-", "hc", "dx1", "0"],
      ["y1", "+-", "vc", "dy1", "0"],
    ],
    handles: [
      {
        kind: "ahPolar",
        fields: { gdRefAng: "adj", minAng: "0", maxAng: "21599999" },
        position: ["x1", "y1"],
      },
    ],
    paths: [
      {
        commands: [
          ["moveTo", "x1", "y1"],
          ["arcTo", "wd2", "hd2", "adval", "swAng"],
        ],
      },
    ],
    family: "follow-path",
    tracks: [{ pathIndex: 0 }],
    bands: [],
  },
  textArchUpPour: {
    guides: [
      ["adval", "pin", "0", "adj1", "21599999"],
      ["v1", "+-", "10800000", "0", "adval"],
      ["v2", "+-", "32400000", "0", "adval"],
      ["end", "?:", "v1", "v1", "v2"],
      ["w1", "+-", "5400000", "0", "adval"],
      ["w2", "+-", "16200000", "0", "adval"],
      ["d1", "+-", "end", "0", "adval"],
      ["d2", "+-", "21600000", "d1", "0"],
      ["c2", "?:", "w2", "d1", "d2"],
      ["c1", "?:", "v1", "d2", "c2"],
      ["swAng", "?:", "w1", "d1", "c1"],
      ["wt1", "sin", "wd2", "adval"],
      ["ht1", "cos", "hd2", "adval"],
      ["dx1", "cat2", "wd2", "ht1", "wt1"],
      ["dy1", "sat2", "hd2", "ht1", "wt1"],
      ["x1", "+-", "hc", "dx1", "0"],
      ["y1", "+-", "vc", "dy1", "0"],
      ["adval2", "pin", "0", "adj2", "99000"],
      ["ratio", "*/", "adval2", "1", "100000"],
      ["iwd2", "*/", "wd2", "ratio", "1"],
      ["ihd2", "*/", "hd2", "ratio", "1"],
      ["wt2", "sin", "iwd2", "adval"],
      ["ht2", "cos", "ihd2", "adval"],
      ["dx2", "cat2", "iwd2", "ht2", "wt2"],
      ["dy2", "sat2", "ihd2", "ht2", "wt2"],
      ["x2", "+-", "hc", "dx2", "0"],
      ["y2", "+-", "vc", "dy2", "0"],
    ],
    handles: [
      {
        kind: "ahPolar",
        fields: {
          gdRefR: "adj2",
          minR: "0",
          maxR: "100000",
          gdRefAng: "adj1",
          minAng: "0",
          maxAng: "21599999",
        },
        position: ["x2", "y2"],
      },
    ],
    paths: [
      {
        commands: [
          ["moveTo", "x1", "y1"],
          ["arcTo", "wd2", "hd2", "adval", "swAng"],
        ],
      },
      {
        commands: [
          ["moveTo", "x2", "y2"],
          ["arcTo", "iwd2", "ihd2", "adval", "swAng"],
        ],
      },
    ],
    family: "envelope",
    tracks: [],
    bands: [{ topPathIndex: 0, bottomPathIndex: 1 }],
  },
  textButton: {
    guides: [
      ["adval", "pin", "0", "adj", "21599999"],
      ["bot", "+-", "5400000", "0", "adval"],
      ["lef", "+-", "10800000", "0", "adval"],
      ["top", "+-", "16200000", "0", "adval"],
      ["rig", "+-", "21600000", "0", "adval"],
      ["c3", "?:", "top", "adval", "0"],
      ["c2", "?:", "lef", "10800000", "c3"],
      ["c1", "?:", "bot", "rig", "c2"],
      ["stAng", "?:", "adval", "c1", "0"],
      ["w1", "+-", "21600000", "0", "stAng"],
      ["stAngB", "?:", "stAng", "w1", "0"],
      ["td1", "*/", "bot", "2", "1"],
      ["td2", "*/", "top", "2", "1"],
      ["ntd2", "+-", "0", "0", "td2"],
      ["w2", "+-", "0", "0", "10800000"],
      ["c6", "?:", "top", "ntd2", "w2"],
      ["c5", "?:", "lef", "10800000", "c6"],
      ["c4", "?:", "bot", "td1", "c5"],
      ["v1", "?:", "adval", "c4", "10800000"],
      ["swAngT", "+-", "0", "0", "v1"],
      ["stT", "?:", "lef", "stAngB", "stAng"],
      ["stB", "?:", "lef", "stAng", "stAngB"],
      ["swT", "?:", "lef", "v1", "swAngT"],
      ["swB", "?:", "lef", "swAngT", "v1"],
      ["wt1", "sin", "wd2", "stT"],
      ["ht1", "cos", "hd2", "stT"],
      ["dx1", "cat2", "wd2", "ht1", "wt1"],
      ["dy1", "sat2", "hd2", "ht1", "wt1"],
      ["x1", "+-", "hc", "dx1", "0"],
      ["y1", "+-", "vc", "dy1", "0"],
      ["wt2", "sin", "wd2", "stB"],
      ["ht2", "cos", "hd2", "stB"],
      ["dx2", "cat2", "wd2", "ht2", "wt2"],
      ["dy2", "sat2", "hd2", "ht2", "wt2"],
      ["x2", "+-", "hc", "dx2", "0"],
      ["y2", "+-", "vc", "dy2", "0"],
      ["wt3", "sin", "wd2", "adj"],
      ["ht3", "cos", "hd2", "adj"],
      ["dx3", "cat2", "wd2", "ht3", "wt3"],
      ["dy3", "sat2", "hd2", "ht3", "wt3"],
      ["x3", "+-", "hc", "dx3", "0"],
      ["y3", "+-", "vc", "dy3", "0"],
    ],
    handles: [
      {
        kind: "ahPolar",
        fields: { gdRefAng: "adj", minAng: "0", maxAng: "21599999" },
        position: ["x3", "y3"],
      },
    ],
    paths: [
      {
        commands: [
          ["moveTo", "x1", "y1"],
          ["arcTo", "wd2", "hd2", "stT", "swT"],
        ],
      },
      {
        commands: [
          ["moveTo", "l", "vc"],
          ["lnTo", "r", "vc"],
        ],
      },
      {
        commands: [
          ["moveTo", "x2", "y2"],
          ["arcTo", "wd2", "hd2", "stB", "swB"],
        ],
      },
    ],
    family: "follow-path",
    tracks: [{ pathIndex: 0 }, { pathIndex: 1 }, { pathIndex: 2 }],
    bands: [],
  },
  textButtonPour: {
    guides: [
      ["adval", "pin", "0", "adj1", "21599999"],
      ["bot", "+-", "5400000", "0", "adval"],
      ["lef", "+-", "10800000", "0", "adval"],
      ["top", "+-", "16200000", "0", "adval"],
      ["rig", "+-", "21600000", "0", "adval"],
      ["c3", "?:", "top", "adval", "0"],
      ["c2", "?:", "lef", "10800000", "c3"],
      ["c1", "?:", "bot", "rig", "c2"],
      ["stAng", "?:", "adval", "c1", "0"],
      ["w1", "+-", "21600000", "0", "stAng"],
      ["stAngB", "?:", "stAng", "w1", "0"],
      ["td1", "*/", "bot", "2", "1"],
      ["td2", "*/", "top", "2", "1"],
      ["ntd2", "+-", "0", "0", "td2"],
      ["w2", "+-", "0", "0", "10800000"],
      ["c6", "?:", "top", "ntd2", "w2"],
      ["c5", "?:", "lef", "10800000", "c6"],
      ["c4", "?:", "bot", "td1", "c5"],
      ["v1", "?:", "adval", "c4", "10800000"],
      ["swAngT", "+-", "0", "0", "v1"],
      ["stT", "?:", "lef", "stAngB", "stAng"],
      ["stB", "?:", "lef", "stAng", "stAngB"],
      ["swT", "?:", "lef", "v1", "swAngT"],
      ["swB", "?:", "lef", "swAngT", "v1"],
      ["wt1", "sin", "wd2", "stT"],
      ["ht1", "cos", "hd2", "stT"],
      ["dx1", "cat2", "wd2", "ht1", "wt1"],
      ["dy1", "sat2", "hd2", "ht1", "wt1"],
      ["x1", "+-", "hc", "dx1", "0"],
      ["y1", "+-", "vc", "dy1", "0"],
      ["wt6", "sin", "wd2", "stB"],
      ["ht6", "cos", "hd2", "stB"],
      ["dx6", "cat2", "wd2", "ht6", "wt6"],
      ["dy6", "sat2", "hd2", "ht6", "wt6"],
      ["x6", "+-", "hc", "dx6", "0"],
      ["y6", "+-", "vc", "dy6", "0"],
      ["adval2", "pin", "40000", "adj2", "99000"],
      ["ratio", "*/", "adval2", "1", "100000"],
      ["iwd2", "*/", "wd2", "ratio", "1"],
      ["ihd2", "*/", "hd2", "ratio", "1"],
      ["wt2", "sin", "iwd2", "stT"],
      ["ht2", "cos", "ihd2", "stT"],
      ["dx2", "cat2", "iwd2", "ht2", "wt2"],
      ["dy2", "sat2", "ihd2", "ht2", "wt2"],
      ["x2", "+-", "hc", "dx2", "0"],
      ["y2", "+-", "vc", "dy2", "0"],
      ["wt5", "sin", "iwd2", "stB"],
      ["ht5", "cos", "ihd2", "stB"],
      ["dx5", "cat2", "iwd2", "ht5", "wt5"],
      ["dy5", "sat2", "ihd2", "ht5", "wt5"],
      ["x5", "+-", "hc", "dx5", "0"],
      ["y5", "+-", "vc", "dy5", "0"],
      ["d1", "+-", "hd2", "0", "ihd2"],
      ["d12", "*/", "d1", "1", "2"],
      ["yu", "+-", "vc", "0", "d12"],
      ["yd", "+-", "vc", "d12", "0"],
      ["v1", "*/", "d12", "d12", "1"],
      ["v2", "*/", "ihd2", "ihd2", "1"],
      ["v3", "*/", "v1", "1", "v2"],
      ["v4", "+-", "1", "0", "v3"],
      ["v5", "*/", "iwd2", "iwd2", "1"],
      ["v6", "*/", "v4", "v5", "1"],
      ["v7", "sqrt", "v6"],
      ["xl", "+-", "hc", "0", "v7"],
      ["xr", "+-", "hc", "v7", "0"],
      ["wtadj", "sin", "iwd2", "adj1"],
      ["htadj", "cos", "ihd2", "adj1"],
      ["dxadj", "cat2", "iwd2", "htadj", "wtadj"],
      ["dyadj", "sat2", "ihd2", "htadj", "wtadj"],
      ["xadj", "+-", "hc", "dxadj", "0"],
      ["yadj", "+-", "vc", "dyadj", "0"],
    ],
    handles: [
      {
        kind: "ahPolar",
        fields: {
          gdRefR: "adj2",
          minR: "0",
          maxR: "100000",
          gdRefAng: "adj1",
          minAng: "0",
          maxAng: "21599999",
        },
        position: ["xadj", "yadj"],
      },
    ],
    paths: [
      {
        commands: [
          ["moveTo", "x1", "y1"],
          ["arcTo", "wd2", "hd2", "stT", "swT"],
        ],
      },
      {
        commands: [
          ["moveTo", "x2", "y2"],
          ["arcTo", "iwd2", "ihd2", "stT", "swT"],
        ],
      },
      {
        commands: [
          ["moveTo", "xl", "yu"],
          ["lnTo", "xr", "yu"],
        ],
      },
      {
        commands: [
          ["moveTo", "xl", "yd"],
          ["lnTo", "xr", "yd"],
        ],
      },
      {
        commands: [
          ["moveTo", "x5", "y5"],
          ["arcTo", "iwd2", "ihd2", "stB", "swB"],
        ],
      },
      {
        commands: [
          ["moveTo", "x6", "y6"],
          ["arcTo", "wd2", "hd2", "stB", "swB"],
        ],
      },
    ],
    family: "envelope",
    tracks: [],
    bands: [
      { topPathIndex: 0, bottomPathIndex: 1 },
      { topPathIndex: 2, bottomPathIndex: 3 },
      { topPathIndex: 4, bottomPathIndex: 5 },
    ],
  },
  textCanDown: {
    guides: [
      ["a", "pin", "0", "adj", "33333"],
      ["dy", "*/", "a", "h", "100000"],
      ["y0", "+-", "t", "dy", "0"],
      ["y1", "+-", "b", "0", "dy"],
      ["ncd2", "*/", "cd2", "-1", "1"],
    ],
    handles: [
      { kind: "ahXY", fields: { gdRefY: "adj", minY: "0", maxY: "33333" }, position: ["hc", "y0"] },
    ],
    paths: [
      {
        commands: [
          ["moveTo", "l", "t"],
          ["arcTo", "wd2", "dy", "cd2", "ncd2"],
        ],
      },
      {
        commands: [
          ["moveTo", "l", "y1"],
          ["arcTo", "wd2", "dy", "cd2", "ncd2"],
        ],
      },
    ],
    family: "envelope",
    tracks: [],
    bands: [{ topPathIndex: 0, bottomPathIndex: 1 }],
  },
  textCanUp: {
    guides: [
      ["a", "pin", "66667", "adj", "100000"],
      ["dy1", "*/", "a", "h", "100000"],
      ["dy", "+-", "h", "0", "dy1"],
      ["y0", "+-", "t", "dy1", "0"],
      ["y1", "+-", "t", "dy", "0"],
    ],
    handles: [
      {
        kind: "ahXY",
        fields: { gdRefY: "adj", minY: "66667", maxY: "100000" },
        position: ["hc", "y0"],
      },
    ],
    paths: [
      {
        commands: [
          ["moveTo", "l", "y1"],
          ["arcTo", "wd2", "dy", "cd2", "cd2"],
        ],
      },
      {
        commands: [
          ["moveTo", "l", "b"],
          ["arcTo", "wd2", "dy", "cd2", "cd2"],
        ],
      },
    ],
    family: "envelope",
    tracks: [],
    bands: [{ topPathIndex: 0, bottomPathIndex: 1 }],
  },
  textCascadeDown: {
    guides: [
      ["a", "pin", "28570", "adj", "100000"],
      ["dy", "*/", "a", "h", "100000"],
      ["y1", "+-", "t", "dy", "0"],
      ["dy2", "+-", "h", "0", "dy"],
      ["dy3", "*/", "dy2", "1", "4"],
      ["y2", "+-", "t", "dy3", "0"],
    ],
    handles: [
      {
        kind: "ahXY",
        fields: { gdRefY: "adj", minY: "28570", maxY: "100000" },
        position: ["l", "y1"],
      },
    ],
    paths: [
      {
        commands: [
          ["moveTo", "l", "t"],
          ["lnTo", "r", "y2"],
        ],
      },
      {
        commands: [
          ["moveTo", "l", "y1"],
          ["lnTo", "r", "b"],
        ],
      },
    ],
    family: "envelope",
    tracks: [],
    bands: [{ topPathIndex: 0, bottomPathIndex: 1 }],
  },
  textCascadeUp: {
    guides: [
      ["a", "pin", "28570", "adj", "100000"],
      ["dy", "*/", "a", "h", "100000"],
      ["y1", "+-", "t", "dy", "0"],
      ["dy2", "+-", "h", "0", "dy"],
      ["dy3", "*/", "dy2", "1", "4"],
      ["y2", "+-", "t", "dy3", "0"],
    ],
    handles: [
      {
        kind: "ahXY",
        fields: { gdRefY: "adj", minY: "28570", maxY: "100000" },
        position: ["r", "y1"],
      },
    ],
    paths: [
      {
        commands: [
          ["moveTo", "l", "y2"],
          ["lnTo", "r", "t"],
        ],
      },
      {
        commands: [
          ["moveTo", "l", "b"],
          ["lnTo", "r", "y1"],
        ],
      },
    ],
    family: "envelope",
    tracks: [],
    bands: [{ topPathIndex: 0, bottomPathIndex: 1 }],
  },
  textChevron: {
    guides: [
      ["a", "pin", "0", "adj", "50000"],
      ["y", "*/", "a", "h", "100000"],
      ["y1", "+-", "t", "b", "y"],
    ],
    handles: [
      { kind: "ahXY", fields: { gdRefY: "adj", minY: "0", maxY: "50000" }, position: ["l", "y"] },
    ],
    paths: [
      {
        commands: [
          ["moveTo", "l", "y"],
          ["lnTo", "hc", "t"],
          ["lnTo", "r", "y"],
        ],
      },
      {
        commands: [
          ["moveTo", "l", "b"],
          ["lnTo", "hc", "y1"],
          ["lnTo", "r", "b"],
        ],
      },
    ],
    family: "envelope",
    tracks: [],
    bands: [{ topPathIndex: 0, bottomPathIndex: 1 }],
  },
  textChevronInverted: {
    guides: [
      ["a", "pin", "50000", "adj", "100000"],
      ["y", "*/", "a", "h", "100000"],
      ["y1", "+-", "b", "0", "y"],
    ],
    handles: [
      {
        kind: "ahXY",
        fields: { gdRefY: "adj", minY: "50000", maxY: "100000" },
        position: ["l", "y"],
      },
    ],
    paths: [
      {
        commands: [
          ["moveTo", "l", "t"],
          ["lnTo", "hc", "y1"],
          ["lnTo", "r", "t"],
        ],
      },
      {
        commands: [
          ["moveTo", "l", "y"],
          ["lnTo", "hc", "b"],
          ["lnTo", "r", "y"],
        ],
      },
    ],
    family: "envelope",
    tracks: [],
    bands: [{ topPathIndex: 0, bottomPathIndex: 1 }],
  },
  textCircle: {
    guides: [
      ["adval", "pin", "0", "adj", "21599999"],
      ["d0", "+-", "adval", "0", "10800000"],
      ["d1", "+-", "10800000", "0", "adval"],
      ["d2", "+-", "21600000", "0", "adval"],
      ["d3", "?:", "d1", "d1", "10799999"],
      ["d4", "?:", "d0", "d2", "d3"],
      ["swAng", "*/", "d4", "2", "1"],
      ["wt1", "sin", "wd2", "adj"],
      ["ht1", "cos", "hd2", "adj"],
      ["dx1", "cat2", "wd2", "ht1", "wt1"],
      ["dy1", "sat2", "hd2", "ht1", "wt1"],
      ["x1", "+-", "hc", "dx1", "0"],
      ["y1", "+-", "vc", "dy1", "0"],
    ],
    handles: [
      {
        kind: "ahPolar",
        fields: { gdRefAng: "adj", minAng: "0", maxAng: "21599999" },
        position: ["x1", "y1"],
      },
    ],
    paths: [
      {
        commands: [
          ["moveTo", "x1", "y1"],
          ["arcTo", "wd2", "hd2", "adval", "swAng"],
        ],
      },
    ],
    family: "follow-path",
    tracks: [{ pathIndex: 0 }],
    bands: [],
  },
  textCirclePour: {
    guides: [
      ["adval", "pin", "0", "adj1", "21599999"],
      ["d0", "+-", "adval", "0", "10800000"],
      ["d1", "+-", "10800000", "0", "adval"],
      ["d2", "+-", "21600000", "0", "adval"],
      ["d3", "?:", "d1", "d1", "10799999"],
      ["d4", "?:", "d0", "d2", "d3"],
      ["swAng", "*/", "d4", "2", "1"],
      ["wt1", "sin", "wd2", "adval"],
      ["ht1", "cos", "hd2", "adval"],
      ["dx1", "cat2", "wd2", "ht1", "wt1"],
      ["dy1", "sat2", "hd2", "ht1", "wt1"],
      ["x1", "+-", "hc", "dx1", "0"],
      ["y1", "+-", "vc", "dy1", "0"],
      ["adval2", "pin", "0", "adj2", "99000"],
      ["ratio", "*/", "adval2", "1", "100000"],
      ["iwd2", "*/", "wd2", "ratio", "1"],
      ["ihd2", "*/", "hd2", "ratio", "1"],
      ["wt2", "sin", "iwd2", "adval"],
      ["ht2", "cos", "ihd2", "adval"],
      ["dx2", "cat2", "iwd2", "ht2", "wt2"],
      ["dy2", "sat2", "ihd2", "ht2", "wt2"],
      ["x2", "+-", "hc", "dx2", "0"],
      ["y2", "+-", "vc", "dy2", "0"],
    ],
    handles: [
      {
        kind: "ahPolar",
        fields: {
          gdRefR: "adj2",
          minR: "0",
          maxR: "100000",
          gdRefAng: "adj1",
          minAng: "0",
          maxAng: "21599999",
        },
        position: ["x2", "y2"],
      },
    ],
    paths: [
      {
        commands: [
          ["moveTo", "x1", "y1"],
          ["arcTo", "wd2", "hd2", "adval", "swAng"],
        ],
      },
      {
        commands: [
          ["moveTo", "x2", "y2"],
          ["arcTo", "iwd2", "ihd2", "adval", "swAng"],
        ],
      },
    ],
    family: "envelope",
    tracks: [],
    bands: [{ topPathIndex: 0, bottomPathIndex: 1 }],
  },
  textCurveDown: {
    guides: [
      ["a", "pin", "0", "adj", "56338"],
      ["dy", "*/", "a", "h", "100000"],
      ["gd1", "*/", "dy", "3", "4"],
      ["gd2", "*/", "dy", "5", "4"],
      ["gd3", "*/", "dy", "3", "8"],
      ["gd4", "*/", "dy", "1", "8"],
      ["gd5", "+-", "h", "0", "gd3"],
      ["gd6", "+-", "gd4", "h", "0"],
      ["y0", "+-", "t", "dy", "0"],
      ["y1", "+-", "t", "gd1", "0"],
      ["y2", "+-", "t", "gd2", "0"],
      ["y3", "+-", "t", "gd3", "0"],
      ["y4", "+-", "t", "gd4", "0"],
      ["y5", "+-", "t", "gd5", "0"],
      ["y6", "+-", "t", "gd6", "0"],
      ["x1", "+-", "l", "wd3", "0"],
      ["x2", "+-", "r", "0", "wd3"],
    ],
    handles: [
      { kind: "ahXY", fields: { gdRefY: "adj", minY: "0", maxY: "56338" }, position: ["r", "y0"] },
    ],
    paths: [
      {
        commands: [
          ["moveTo", "l", "t"],
          ["cubicBezTo", "x1", "y1", "x2", "y2", "r", "y0"],
        ],
      },
      {
        commands: [
          ["moveTo", "l", "y5"],
          ["cubicBezTo", "x1", "y6", "x2", "y6", "r", "y5"],
        ],
      },
    ],
    family: "envelope",
    tracks: [],
    bands: [{ topPathIndex: 0, bottomPathIndex: 1 }],
  },
  textCurveUp: {
    guides: [
      ["a", "pin", "0", "adj", "56338"],
      ["dy", "*/", "a", "h", "100000"],
      ["gd1", "*/", "dy", "3", "4"],
      ["gd2", "*/", "dy", "5", "4"],
      ["gd3", "*/", "dy", "3", "8"],
      ["gd4", "*/", "dy", "1", "8"],
      ["gd5", "+-", "h", "0", "gd3"],
      ["gd6", "+-", "gd4", "h", "0"],
      ["y0", "+-", "t", "dy", "0"],
      ["y1", "+-", "t", "gd1", "0"],
      ["y2", "+-", "t", "gd2", "0"],
      ["y3", "+-", "t", "gd3", "0"],
      ["y4", "+-", "t", "gd4", "0"],
      ["y5", "+-", "t", "gd5", "0"],
      ["y6", "+-", "t", "gd6", "0"],
      ["x1", "+-", "l", "wd3", "0"],
      ["x2", "+-", "r", "0", "wd3"],
    ],
    handles: [
      { kind: "ahXY", fields: { gdRefY: "adj", minY: "0", maxY: "56338" }, position: ["l", "y0"] },
    ],
    paths: [
      {
        commands: [
          ["moveTo", "l", "y0"],
          ["cubicBezTo", "x1", "y2", "x2", "y1", "r", "t"],
        ],
      },
      {
        commands: [
          ["moveTo", "l", "y5"],
          ["cubicBezTo", "x1", "y6", "x2", "y6", "r", "y5"],
        ],
      },
    ],
    family: "envelope",
    tracks: [],
    bands: [{ topPathIndex: 0, bottomPathIndex: 1 }],
  },
  textDeflate: {
    guides: [
      ["a", "pin", "0", "adj", "37500"],
      ["dy", "*/", "a", "ss", "100000"],
      ["gd0", "*/", "dy", "4", "3"],
      ["gd1", "+-", "h", "0", "gd0"],
      ["adjY", "+-", "t", "dy", "0"],
      ["y0", "+-", "t", "gd0", "0"],
      ["y1", "+-", "t", "gd1", "0"],
      ["x0", "+-", "l", "wd3", "0"],
      ["x1", "+-", "r", "0", "wd3"],
    ],
    handles: [
      {
        kind: "ahXY",
        fields: { gdRefY: "adj", minY: "0", maxY: "37500" },
        position: ["hc", "adjY"],
      },
    ],
    paths: [
      {
        commands: [
          ["moveTo", "l", "t"],
          ["cubicBezTo", "x0", "y0", "x1", "y0", "r", "t"],
        ],
      },
      {
        commands: [
          ["moveTo", "l", "b"],
          ["cubicBezTo", "x0", "y1", "x1", "y1", "r", "b"],
        ],
      },
    ],
    family: "envelope",
    tracks: [],
    bands: [{ topPathIndex: 0, bottomPathIndex: 1 }],
  },
  textDeflateBottom: {
    guides: [
      ["a", "pin", "6250", "adj", "100000"],
      ["dy", "*/", "a", "ss", "100000"],
      ["dy2", "+-", "h", "0", "dy"],
      ["y1", "+-", "t", "dy", "0"],
      ["cp", "+-", "y1", "0", "dy2"],
    ],
    handles: [
      {
        kind: "ahXY",
        fields: { gdRefY: "adj", minY: "6250", maxY: "100000" },
        position: ["hc", "y1"],
      },
    ],
    paths: [
      {
        commands: [
          ["moveTo", "l", "t"],
          ["lnTo", "r", "t"],
        ],
      },
      {
        commands: [
          ["moveTo", "l", "b"],
          ["quadBezTo", "hc", "cp", "r", "b"],
        ],
      },
    ],
    family: "envelope",
    tracks: [],
    bands: [{ topPathIndex: 0, bottomPathIndex: 1 }],
  },
  textDeflateInflate: {
    guides: [
      ["a", "pin", "5000", "adj", "95000"],
      ["dy", "*/", "a", "h", "100000"],
      ["del", "*/", "h", "5", "100"],
      ["dh1", "*/", "h", "45", "100"],
      ["dh2", "*/", "h", "55", "100"],
      ["yh", "+-", "dy", "0", "del"],
      ["yl", "+-", "dy", "del", "0"],
      ["y3", "+-", "yh", "yh", "dh1"],
      ["y4", "+-", "yl", "yl", "dh2"],
    ],
    handles: [
      {
        kind: "ahXY",
        fields: { gdRefY: "adj", minY: "5000", maxY: "95000" },
        position: ["hc", "dy"],
      },
    ],
    paths: [
      {
        commands: [
          ["moveTo", "l", "t"],
          ["lnTo", "r", "t"],
        ],
      },
      {
        commands: [
          ["moveTo", "l", "dh1"],
          ["quadBezTo", "hc", "y3", "r", "dh1"],
        ],
      },
      {
        commands: [
          ["moveTo", "l", "dh2"],
          ["quadBezTo", "hc", "y4", "r", "dh2"],
        ],
      },
      {
        commands: [
          ["moveTo", "l", "b"],
          ["lnTo", "r", "b"],
        ],
      },
    ],
    family: "envelope",
    tracks: [],
    bands: [
      { topPathIndex: 0, bottomPathIndex: 1 },
      { topPathIndex: 2, bottomPathIndex: 3 },
    ],
  },
  textDeflateInflateDeflate: {
    guides: [
      ["a", "pin", "3000", "adj", "47000"],
      ["dy", "*/", "a", "h", "100000"],
      ["del", "*/", "h", "3", "100"],
      ["ey1", "*/", "h", "30", "100"],
      ["ey2", "*/", "h", "36", "100"],
      ["ey3", "*/", "h", "63", "100"],
      ["ey4", "*/", "h", "70", "100"],
      ["by", "+-", "b", "0", "dy"],
      ["yh1", "+-", "dy", "0", "del"],
      ["yl1", "+-", "dy", "del", "0"],
      ["yh2", "+-", "by", "0", "del"],
      ["yl2", "+-", "by", "del", "0"],
      ["y1", "+-", "yh1", "yh1", "ey1"],
      ["y2", "+-", "yl1", "yl1", "ey2"],
      ["y3", "+-", "yh2", "yh2", "ey3"],
      ["y4", "+-", "yl2", "yl2", "ey4"],
    ],
    handles: [
      {
        kind: "ahXY",
        fields: { gdRefY: "adj", minY: "3000", maxY: "47000" },
        position: ["hc", "dy"],
      },
    ],
    paths: [
      {
        commands: [
          ["moveTo", "l", "t"],
          ["lnTo", "r", "t"],
        ],
      },
      {
        commands: [
          ["moveTo", "l", "ey1"],
          ["quadBezTo", "hc", "y1", "r", "ey1"],
        ],
      },
      {
        commands: [
          ["moveTo", "l", "ey2"],
          ["quadBezTo", "hc", "y2", "r", "ey2"],
        ],
      },
      {
        commands: [
          ["moveTo", "l", "ey3"],
          ["quadBezTo", "hc", "y3", "r", "ey3"],
        ],
      },
      {
        commands: [
          ["moveTo", "l", "ey4"],
          ["quadBezTo", "hc", "y4", "r", "ey4"],
        ],
      },
      {
        commands: [
          ["moveTo", "l", "b"],
          ["lnTo", "r", "b"],
        ],
      },
    ],
    family: "envelope",
    tracks: [],
    bands: [
      { topPathIndex: 0, bottomPathIndex: 1 },
      { topPathIndex: 2, bottomPathIndex: 3 },
      { topPathIndex: 4, bottomPathIndex: 5 },
    ],
  },
  textDeflateTop: {
    guides: [
      ["a", "pin", "0", "adj", "93750"],
      ["dy", "*/", "a", "h", "100000"],
      ["y1", "+-", "t", "dy", "0"],
      ["cp", "+-", "y1", "dy", "0"],
    ],
    handles: [
      { kind: "ahXY", fields: { gdRefY: "adj", minY: "0", maxY: "93750" }, position: ["hc", "y1"] },
    ],
    paths: [
      {
        commands: [
          ["moveTo", "l", "t"],
          ["quadBezTo", "hc", "cp", "r", "t"],
        ],
      },
      {
        commands: [
          ["moveTo", "l", "b"],
          ["lnTo", "r", "b"],
        ],
      },
    ],
    family: "envelope",
    tracks: [],
    bands: [{ topPathIndex: 0, bottomPathIndex: 1 }],
  },
  textDoubleWave1: {
    guides: [
      ["a1", "pin", "0", "adj1", "12500"],
      ["a2", "pin", "-10000", "adj2", "10000"],
      ["y1", "*/", "h", "a1", "100000"],
      ["dy2", "*/", "y1", "10", "3"],
      ["y2", "+-", "y1", "0", "dy2"],
      ["y3", "+-", "y1", "dy2", "0"],
      ["y4", "+-", "b", "0", "y1"],
      ["y5", "+-", "y4", "0", "dy2"],
      ["y6", "+-", "y4", "dy2", "0"],
      ["of", "*/", "w", "a2", "100000"],
      ["of2", "*/", "w", "a2", "50000"],
      ["x1", "abs", "of"],
      ["dx2", "?:", "of2", "0", "of2"],
      ["x2", "+-", "l", "0", "dx2"],
      ["dx8", "?:", "of2", "of2", "0"],
      ["x8", "+-", "r", "0", "dx8"],
      ["dx3", "+/", "dx2", "x8", "6"],
      ["x3", "+-", "x2", "dx3", "0"],
      ["dx4", "+/", "dx2", "x8", "3"],
      ["x4", "+-", "x2", "dx4", "0"],
      ["x5", "+/", "x2", "x8", "2"],
      ["x6", "+-", "x5", "dx3", "0"],
      ["x7", "+/", "x6", "x8", "2"],
      ["x9", "+-", "l", "dx8", "0"],
      ["x15", "+-", "r", "dx2", "0"],
      ["x10", "+-", "x9", "dx3", "0"],
      ["x11", "+-", "x9", "dx4", "0"],
      ["x12", "+/", "x9", "x15", "2"],
      ["x13", "+-", "x12", "dx3", "0"],
      ["x14", "+/", "x13", "x15", "2"],
      ["x16", "+-", "r", "0", "x1"],
      ["xAdj", "+-", "hc", "of", "0"],
    ],
    handles: [
      { kind: "ahXY", fields: { gdRefY: "adj1", minY: "0", maxY: "12500" }, position: ["l", "y1"] },
      {
        kind: "ahXY",
        fields: { gdRefX: "adj2", minX: "-10000", maxX: "10000" },
        position: ["xAdj", "b"],
      },
    ],
    paths: [
      {
        commands: [
          ["moveTo", "x2", "y1"],
          ["cubicBezTo", "x3", "y2", "x4", "y3", "x5", "y1"],
          ["cubicBezTo", "x6", "y2", "x7", "y3", "x8", "y1"],
        ],
      },
      {
        commands: [
          ["moveTo", "x9", "y4"],
          ["cubicBezTo", "x10", "y5", "x11", "y6", "x12", "y4"],
          ["cubicBezTo", "x13", "y5", "x14", "y6", "x15", "y4"],
        ],
      },
    ],
    family: "envelope",
    tracks: [],
    bands: [{ topPathIndex: 0, bottomPathIndex: 1 }],
  },
  textFadeDown: {
    guides: [
      ["a", "pin", "0", "adj", "49999"],
      ["dx", "*/", "a", "w", "100000"],
      ["x1", "+-", "l", "dx", "0"],
      ["x2", "+-", "r", "0", "dx"],
    ],
    handles: [
      { kind: "ahXY", fields: { gdRefX: "adj", minX: "0", maxX: "49999" }, position: ["x1", "b"] },
    ],
    paths: [
      {
        commands: [
          ["moveTo", "l", "t"],
          ["lnTo", "r", "t"],
        ],
      },
      {
        commands: [
          ["moveTo", "x1", "b"],
          ["lnTo", "x2", "b"],
        ],
      },
    ],
    family: "envelope",
    tracks: [],
    bands: [{ topPathIndex: 0, bottomPathIndex: 1 }],
  },
  textFadeLeft: {
    guides: [
      ["a", "pin", "0", "adj", "49999"],
      ["dy", "*/", "a", "h", "100000"],
      ["y1", "+-", "t", "dy", "0"],
      ["y2", "+-", "b", "0", "dy"],
    ],
    handles: [
      { kind: "ahXY", fields: { gdRefY: "adj", minY: "0", maxY: "49999" }, position: ["l", "y1"] },
    ],
    paths: [
      {
        commands: [
          ["moveTo", "l", "y1"],
          ["lnTo", "r", "t"],
        ],
      },
      {
        commands: [
          ["moveTo", "l", "y2"],
          ["lnTo", "r", "b"],
        ],
      },
    ],
    family: "envelope",
    tracks: [],
    bands: [{ topPathIndex: 0, bottomPathIndex: 1 }],
  },
  textFadeRight: {
    guides: [
      ["a", "pin", "0", "adj", "49999"],
      ["dy", "*/", "a", "h", "100000"],
      ["y1", "+-", "t", "dy", "0"],
      ["y2", "+-", "b", "0", "dy"],
    ],
    handles: [
      { kind: "ahXY", fields: { gdRefY: "adj", minY: "0", maxY: "49999" }, position: ["r", "y1"] },
    ],
    paths: [
      {
        commands: [
          ["moveTo", "l", "t"],
          ["lnTo", "r", "y1"],
        ],
      },
      {
        commands: [
          ["moveTo", "l", "b"],
          ["lnTo", "r", "y2"],
        ],
      },
    ],
    family: "envelope",
    tracks: [],
    bands: [{ topPathIndex: 0, bottomPathIndex: 1 }],
  },
  textFadeUp: {
    guides: [
      ["a", "pin", "0", "adj", "49999"],
      ["dx", "*/", "a", "w", "100000"],
      ["x1", "+-", "l", "dx", "0"],
      ["x2", "+-", "r", "0", "dx"],
    ],
    handles: [
      { kind: "ahXY", fields: { gdRefX: "adj", minX: "0", maxX: "49999" }, position: ["x1", "t"] },
    ],
    paths: [
      {
        commands: [
          ["moveTo", "x1", "t"],
          ["lnTo", "x2", "t"],
        ],
      },
      {
        commands: [
          ["moveTo", "l", "b"],
          ["lnTo", "r", "b"],
        ],
      },
    ],
    family: "envelope",
    tracks: [],
    bands: [{ topPathIndex: 0, bottomPathIndex: 1 }],
  },
  textInflate: {
    guides: [
      ["a", "pin", "0", "adj", "20000"],
      ["dy", "*/", "a", "h", "100000"],
      ["gd", "*/", "dy", "1", "3"],
      ["gd0", "+-", "0", "0", "gd"],
      ["gd1", "+-", "h", "0", "gd0"],
      ["ty", "+-", "t", "dy", "0"],
      ["by", "+-", "b", "0", "dy"],
      ["y0", "+-", "t", "gd0", "0"],
      ["y1", "+-", "t", "gd1", "0"],
      ["x0", "+-", "l", "wd3", "0"],
      ["x1", "+-", "r", "0", "wd3"],
    ],
    handles: [
      { kind: "ahXY", fields: { gdRefY: "adj", minY: "0", maxY: "20000" }, position: ["l", "ty"] },
    ],
    paths: [
      {
        commands: [
          ["moveTo", "l", "ty"],
          ["cubicBezTo", "x0", "y0", "x1", "y0", "r", "ty"],
        ],
      },
      {
        commands: [
          ["moveTo", "l", "by"],
          ["cubicBezTo", "x0", "y1", "x1", "y1", "r", "by"],
        ],
      },
    ],
    family: "envelope",
    tracks: [],
    bands: [{ topPathIndex: 0, bottomPathIndex: 1 }],
  },
  textInflateBottom: {
    guides: [
      ["a", "pin", "60000", "adj", "100000"],
      ["dy", "*/", "a", "h", "100000"],
      ["ty", "+-", "t", "dy", "0"],
    ],
    handles: [
      {
        kind: "ahXY",
        fields: { gdRefY: "adj", minY: "60000", maxY: "100000" },
        position: ["l", "ty"],
      },
    ],
    paths: [
      {
        commands: [
          ["moveTo", "l", "t"],
          ["lnTo", "r", "t"],
        ],
      },
      {
        commands: [
          ["moveTo", "l", "ty"],
          ["quadBezTo", "hc", "b", "r", "ty"],
        ],
      },
    ],
    family: "envelope",
    tracks: [],
    bands: [{ topPathIndex: 0, bottomPathIndex: 1 }],
  },
  textInflateTop: {
    guides: [
      ["a", "pin", "0", "adj", "50000"],
      ["dy", "*/", "a", "h", "100000"],
      ["ty", "+-", "t", "dy", "0"],
    ],
    handles: [
      { kind: "ahXY", fields: { gdRefY: "adj", minY: "0", maxY: "50000" }, position: ["l", "ty"] },
    ],
    paths: [
      {
        commands: [
          ["moveTo", "l", "ty"],
          ["quadBezTo", "hc", "t", "r", "ty"],
        ],
      },
      {
        commands: [
          ["moveTo", "l", "b"],
          ["lnTo", "r", "b"],
        ],
      },
    ],
    family: "envelope",
    tracks: [],
    bands: [{ topPathIndex: 0, bottomPathIndex: 1 }],
  },
  textPlain: {
    guides: [
      ["a", "pin", "30000", "adj", "70000"],
      ["mid", "*/", "a", "w", "100000"],
      ["midDir", "+-", "mid", "0", "hc"],
      ["dl", "+-", "mid", "0", "l"],
      ["dr", "+-", "r", "0", "mid"],
      ["dl2", "*/", "dl", "2", "1"],
      ["dr2", "*/", "dr", "2", "1"],
      ["dx", "?:", "midDir", "dr2", "dl2"],
      ["xr", "+-", "l", "dx", "0"],
      ["xl", "+-", "r", "0", "dx"],
      ["tlx", "?:", "midDir", "l", "xl"],
      ["trx", "?:", "midDir", "xr", "r"],
      ["blx", "?:", "midDir", "xl", "l"],
      ["brx", "?:", "midDir", "r", "xr"],
    ],
    handles: [
      {
        kind: "ahXY",
        fields: { gdRefX: "adj", minX: "30000", maxX: "70000" },
        position: ["mid", "b"],
      },
    ],
    paths: [
      {
        commands: [
          ["moveTo", "tlx", "t"],
          ["lnTo", "trx", "t"],
        ],
      },
      {
        commands: [
          ["moveTo", "blx", "b"],
          ["lnTo", "brx", "b"],
        ],
      },
    ],
    family: "envelope",
    tracks: [],
    bands: [{ topPathIndex: 0, bottomPathIndex: 1 }],
  },
  textRingInside: {
    guides: [
      ["a", "pin", "50000", "adj", "99000"],
      ["dy", "*/", "a", "h", "100000"],
      ["y", "+-", "t", "dy", "0"],
      ["r", "*/", "dy", "1", "2"],
      ["y1", "+-", "t", "r", "0"],
      ["y2", "+-", "b", "0", "r"],
    ],
    handles: [
      {
        kind: "ahXY",
        fields: { gdRefY: "adj", minY: "50000", maxY: "99000" },
        position: ["hc", "y"],
      },
    ],
    paths: [
      {
        commands: [
          ["moveTo", "l", "y1"],
          ["arcTo", "wd2", "r", "10800000", "21599999"],
        ],
      },
      {
        commands: [
          ["moveTo", "l", "y2"],
          ["arcTo", "wd2", "r", "10800000", "21599999"],
        ],
      },
    ],
    family: "envelope",
    tracks: [],
    bands: [{ topPathIndex: 0, bottomPathIndex: 1 }],
  },
  textRingOutside: {
    guides: [
      ["a", "pin", "50000", "adj", "99000"],
      ["dy", "*/", "a", "h", "100000"],
      ["y", "+-", "t", "dy", "0"],
      ["r", "*/", "dy", "1", "2"],
      ["y1", "+-", "t", "r", "0"],
      ["y2", "+-", "b", "0", "r"],
    ],
    handles: [
      {
        kind: "ahXY",
        fields: { gdRefY: "adj", minY: "50000", maxY: "99000" },
        position: ["hc", "y"],
      },
    ],
    paths: [
      {
        commands: [
          ["moveTo", "l", "y1"],
          ["arcTo", "wd2", "r", "10800000", "-21599999"],
        ],
      },
      {
        commands: [
          ["moveTo", "l", "y2"],
          ["arcTo", "wd2", "r", "10800000", "-21599999"],
        ],
      },
    ],
    family: "envelope",
    tracks: [],
    bands: [{ topPathIndex: 0, bottomPathIndex: 1 }],
  },
  textSlantDown: {
    guides: [
      ["a", "pin", "28569", "adj", "100000"],
      ["dy", "*/", "a", "h", "100000"],
      ["y1", "+-", "t", "dy", "0"],
      ["y2", "+-", "b", "0", "dy"],
    ],
    handles: [
      {
        kind: "ahXY",
        fields: { gdRefY: "adj", minY: "28569", maxY: "100000" },
        position: ["l", "y1"],
      },
    ],
    paths: [
      {
        commands: [
          ["moveTo", "l", "t"],
          ["lnTo", "r", "y2"],
        ],
      },
      {
        commands: [
          ["moveTo", "l", "y1"],
          ["lnTo", "r", "b"],
        ],
      },
    ],
    family: "envelope",
    tracks: [],
    bands: [{ topPathIndex: 0, bottomPathIndex: 1 }],
  },
  textSlantUp: {
    guides: [
      ["a", "pin", "0", "adj", "71431"],
      ["dy", "*/", "a", "h", "100000"],
      ["y1", "+-", "t", "dy", "0"],
      ["y2", "+-", "b", "0", "dy"],
    ],
    handles: [
      { kind: "ahXY", fields: { gdRefY: "adj", minY: "0", maxY: "71431" }, position: ["l", "y1"] },
    ],
    paths: [
      {
        commands: [
          ["moveTo", "l", "y1"],
          ["lnTo", "r", "t"],
        ],
      },
      {
        commands: [
          ["moveTo", "l", "b"],
          ["lnTo", "r", "y2"],
        ],
      },
    ],
    family: "envelope",
    tracks: [],
    bands: [{ topPathIndex: 0, bottomPathIndex: 1 }],
  },
  textStop: {
    guides: [
      ["a", "pin", "14286", "adj", "50000"],
      ["dx", "*/", "w", "1", "3"],
      ["dy", "*/", "a", "h", "100000"],
      ["x1", "+-", "l", "dx", "0"],
      ["x2", "+-", "r", "0", "dx"],
      ["y1", "+-", "t", "dy", "0"],
      ["y2", "+-", "b", "0", "dy"],
    ],
    handles: [
      {
        kind: "ahXY",
        fields: { gdRefY: "adj", minY: "14286", maxY: "50000" },
        position: ["l", "dy"],
      },
    ],
    paths: [
      {
        commands: [
          ["moveTo", "l", "y1"],
          ["lnTo", "x1", "t"],
          ["lnTo", "x2", "t"],
          ["lnTo", "r", "y1"],
        ],
      },
      {
        commands: [
          ["moveTo", "l", "y2"],
          ["lnTo", "x1", "b"],
          ["lnTo", "x2", "b"],
          ["lnTo", "r", "y2"],
        ],
      },
    ],
    family: "envelope",
    tracks: [],
    bands: [{ topPathIndex: 0, bottomPathIndex: 1 }],
  },
  textTriangle: {
    guides: [
      ["a", "pin", "0", "adj", "100000"],
      ["y", "*/", "a", "h", "100000"],
    ],
    handles: [
      { kind: "ahXY", fields: { gdRefY: "adj", minY: "0", maxY: "100000" }, position: ["l", "y"] },
    ],
    paths: [
      {
        commands: [
          ["moveTo", "l", "y"],
          ["lnTo", "hc", "t"],
          ["lnTo", "r", "y"],
        ],
      },
      {
        commands: [
          ["moveTo", "l", "b"],
          ["lnTo", "r", "b"],
        ],
      },
    ],
    family: "envelope",
    tracks: [],
    bands: [{ topPathIndex: 0, bottomPathIndex: 1 }],
  },
  textTriangleInverted: {
    guides: [
      ["a", "pin", "0", "adj", "100000"],
      ["y", "*/", "a", "h", "100000"],
    ],
    handles: [
      { kind: "ahXY", fields: { gdRefY: "adj", minY: "0", maxY: "100000" }, position: ["l", "y"] },
    ],
    paths: [
      {
        commands: [
          ["moveTo", "l", "t"],
          ["lnTo", "r", "t"],
        ],
      },
      {
        commands: [
          ["moveTo", "l", "y"],
          ["lnTo", "hc", "b"],
          ["lnTo", "r", "y"],
        ],
      },
    ],
    family: "envelope",
    tracks: [],
    bands: [{ topPathIndex: 0, bottomPathIndex: 1 }],
  },
  textWave1: {
    guides: [
      ["a1", "pin", "0", "adj1", "20000"],
      ["a2", "pin", "-10000", "adj2", "10000"],
      ["y1", "*/", "h", "a1", "100000"],
      ["dy2", "*/", "y1", "10", "3"],
      ["y2", "+-", "y1", "0", "dy2"],
      ["y3", "+-", "y1", "dy2", "0"],
      ["y4", "+-", "b", "0", "y1"],
      ["y5", "+-", "y4", "0", "dy2"],
      ["y6", "+-", "y4", "dy2", "0"],
      ["of", "*/", "w", "a2", "100000"],
      ["of2", "*/", "w", "a2", "50000"],
      ["x1", "abs", "of"],
      ["dx2", "?:", "of2", "0", "of2"],
      ["x2", "+-", "l", "0", "dx2"],
      ["dx5", "?:", "of2", "of2", "0"],
      ["x5", "+-", "r", "0", "dx5"],
      ["dx3", "+/", "dx2", "x5", "3"],
      ["x3", "+-", "x2", "dx3", "0"],
      ["x4", "+/", "x3", "x5", "2"],
      ["x6", "+-", "l", "dx5", "0"],
      ["x10", "+-", "r", "dx2", "0"],
      ["x7", "+-", "x6", "dx3", "0"],
      ["x8", "+/", "x7", "x10", "2"],
      ["x9", "+-", "r", "0", "x1"],
      ["xAdj", "+-", "hc", "of", "0"],
    ],
    handles: [
      { kind: "ahXY", fields: { gdRefY: "adj1", minY: "0", maxY: "20000" }, position: ["l", "y1"] },
      {
        kind: "ahXY",
        fields: { gdRefX: "adj2", minX: "-10000", maxX: "10000" },
        position: ["xAdj", "b"],
      },
    ],
    paths: [
      {
        commands: [
          ["moveTo", "x2", "y1"],
          ["cubicBezTo", "x3", "y2", "x4", "y3", "x5", "y1"],
        ],
      },
      {
        commands: [
          ["moveTo", "x6", "y4"],
          ["cubicBezTo", "x7", "y5", "x8", "y6", "x10", "y4"],
        ],
      },
    ],
    family: "envelope",
    tracks: [],
    bands: [{ topPathIndex: 0, bottomPathIndex: 1 }],
  },
  textWave2: {
    guides: [
      ["a1", "pin", "0", "adj1", "20000"],
      ["a2", "pin", "-10000", "adj2", "10000"],
      ["y1", "*/", "h", "a1", "100000"],
      ["dy2", "*/", "y1", "10", "3"],
      ["y2", "+-", "y1", "0", "dy2"],
      ["y3", "+-", "y1", "dy2", "0"],
      ["y4", "+-", "b", "0", "y1"],
      ["y5", "+-", "y4", "0", "dy2"],
      ["y6", "+-", "y4", "dy2", "0"],
      ["of", "*/", "w", "a2", "100000"],
      ["of2", "*/", "w", "a2", "50000"],
      ["x1", "abs", "of"],
      ["dx2", "?:", "of2", "0", "of2"],
      ["x2", "+-", "l", "0", "dx2"],
      ["dx5", "?:", "of2", "of2", "0"],
      ["x5", "+-", "r", "0", "dx5"],
      ["dx3", "+/", "dx2", "x5", "3"],
      ["x3", "+-", "x2", "dx3", "0"],
      ["x4", "+/", "x3", "x5", "2"],
      ["x6", "+-", "l", "dx5", "0"],
      ["x10", "+-", "r", "dx2", "0"],
      ["x7", "+-", "x6", "dx3", "0"],
      ["x8", "+/", "x7", "x10", "2"],
      ["x9", "+-", "r", "0", "x1"],
      ["xAdj", "+-", "hc", "of", "0"],
    ],
    handles: [
      { kind: "ahXY", fields: { gdRefY: "adj1", minY: "0", maxY: "20000" }, position: ["l", "y1"] },
      {
        kind: "ahXY",
        fields: { gdRefX: "adj2", minX: "-10000", maxX: "10000" },
        position: ["xAdj", "b"],
      },
    ],
    paths: [
      {
        commands: [
          ["moveTo", "x2", "y1"],
          ["cubicBezTo", "x3", "y3", "x4", "y2", "x5", "y1"],
        ],
      },
      {
        commands: [
          ["moveTo", "x6", "y4"],
          ["cubicBezTo", "x7", "y6", "x8", "y5", "x10", "y4"],
        ],
      },
    ],
    family: "envelope",
    tracks: [],
    bands: [{ topPathIndex: 0, bottomPathIndex: 1 }],
  },
  textWave4: {
    guides: [
      ["a1", "pin", "0", "adj1", "12500"],
      ["a2", "pin", "-10000", "adj2", "10000"],
      ["y1", "*/", "h", "a1", "100000"],
      ["dy2", "*/", "y1", "10", "3"],
      ["y2", "+-", "y1", "0", "dy2"],
      ["y3", "+-", "y1", "dy2", "0"],
      ["y4", "+-", "b", "0", "y1"],
      ["y5", "+-", "y4", "0", "dy2"],
      ["y6", "+-", "y4", "dy2", "0"],
      ["of", "*/", "w", "a2", "100000"],
      ["of2", "*/", "w", "a2", "50000"],
      ["x1", "abs", "of"],
      ["dx2", "?:", "of2", "0", "of2"],
      ["x2", "+-", "l", "0", "dx2"],
      ["dx8", "?:", "of2", "of2", "0"],
      ["x8", "+-", "r", "0", "dx8"],
      ["dx3", "+/", "dx2", "x8", "6"],
      ["x3", "+-", "x2", "dx3", "0"],
      ["dx4", "+/", "dx2", "x8", "3"],
      ["x4", "+-", "x2", "dx4", "0"],
      ["x5", "+/", "x2", "x8", "2"],
      ["x6", "+-", "x5", "dx3", "0"],
      ["x7", "+/", "x6", "x8", "2"],
      ["x9", "+-", "l", "dx8", "0"],
      ["x15", "+-", "r", "dx2", "0"],
      ["x10", "+-", "x9", "dx3", "0"],
      ["x11", "+-", "x9", "dx4", "0"],
      ["x12", "+/", "x9", "x15", "2"],
      ["x13", "+-", "x12", "dx3", "0"],
      ["x14", "+/", "x13", "x15", "2"],
      ["x16", "+-", "r", "0", "x1"],
      ["xAdj", "+-", "hc", "of", "0"],
    ],
    handles: [
      { kind: "ahXY", fields: { gdRefY: "adj1", minY: "0", maxY: "12500" }, position: ["l", "y1"] },
      {
        kind: "ahXY",
        fields: { gdRefX: "adj2", minX: "-10000", maxX: "10000" },
        position: ["xAdj", "b"],
      },
    ],
    paths: [
      {
        commands: [
          ["moveTo", "x2", "y1"],
          ["cubicBezTo", "x3", "y3", "x4", "y2", "x5", "y1"],
          ["cubicBezTo", "x6", "y3", "x7", "y2", "x8", "y1"],
        ],
      },
      {
        commands: [
          ["moveTo", "x9", "y4"],
          ["cubicBezTo", "x10", "y6", "x11", "y5", "x12", "y4"],
          ["cubicBezTo", "x13", "y6", "x14", "y5", "x15", "y4"],
        ],
      },
    ],
    family: "envelope",
    tracks: [],
    bands: [{ topPathIndex: 0, bottomPathIndex: 1 }],
  },
};
