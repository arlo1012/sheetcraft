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
export const TEXT_WARP_PRESET_NAMES = Object.freeze([
  "textArchDown",
  "textArchDownPour",
  "textArchUp",
  "textArchUpPour",
  "textButton",
  "textButtonPour",
  "textCanDown",
  "textCanUp",
  "textCascadeDown",
  "textCascadeUp",
  "textChevron",
  "textChevronInverted",
  "textCircle",
  "textCirclePour",
  "textCurveDown",
  "textCurveUp",
  "textDeflate",
  "textDeflateBottom",
  "textDeflateInflate",
  "textDeflateInflateDeflate",
  "textDeflateTop",
  "textDoubleWave1",
  "textFadeDown",
  "textFadeLeft",
  "textFadeRight",
  "textFadeUp",
  "textInflate",
  "textInflateBottom",
  "textInflateTop",
  "textPlain",
  "textRingInside",
  "textRingOutside",
  "textSlantDown",
  "textSlantUp",
  "textStop",
  "textTriangle",
  "textTriangleInverted",
  "textWave1",
  "textWave2",
  "textWave4",
] as const);
export type TextWarpPresetName = (typeof TEXT_WARP_PRESET_NAMES)[number];
export const TEXT_WARP_PRESET_DEFAULTS: Readonly<
  Record<TextWarpPresetName, Readonly<Record<string, number>>>
> = Object.freeze({
  textArchDown: Object.freeze({ adj: 0 }),
  textArchDownPour: Object.freeze({ adj1: 0, adj2: 25000 }),
  textArchUp: Object.freeze({ adj: 10800000 }),
  textArchUpPour: Object.freeze({ adj1: 10800000, adj2: 50000 }),
  textButton: Object.freeze({ adj: 10800000 }),
  textButtonPour: Object.freeze({ adj1: 10800000, adj2: 50000 }),
  textCanDown: Object.freeze({ adj: 14286 }),
  textCanUp: Object.freeze({ adj: 85714 }),
  textCascadeDown: Object.freeze({ adj: 44444 }),
  textCascadeUp: Object.freeze({ adj: 44444 }),
  textChevron: Object.freeze({ adj: 25000 }),
  textChevronInverted: Object.freeze({ adj: 75000 }),
  textCircle: Object.freeze({ adj: 10800000 }),
  textCirclePour: Object.freeze({ adj1: 10800000, adj2: 50000 }),
  textCurveDown: Object.freeze({ adj: 45977 }),
  textCurveUp: Object.freeze({ adj: 45977 }),
  textDeflate: Object.freeze({ adj: 18750 }),
  textDeflateBottom: Object.freeze({ adj: 50000 }),
  textDeflateInflate: Object.freeze({ adj: 35000 }),
  textDeflateInflateDeflate: Object.freeze({ adj: 25000 }),
  textDeflateTop: Object.freeze({ adj: 50000 }),
  textDoubleWave1: Object.freeze({ adj1: 6250, adj2: 0 }),
  textFadeDown: Object.freeze({ adj: 33333 }),
  textFadeLeft: Object.freeze({ adj: 33333 }),
  textFadeRight: Object.freeze({ adj: 33333 }),
  textFadeUp: Object.freeze({ adj: 33333 }),
  textInflate: Object.freeze({ adj: 18750 }),
  textInflateBottom: Object.freeze({ adj: 60000 }),
  textInflateTop: Object.freeze({ adj: 40000 }),
  textPlain: Object.freeze({ adj: 50000 }),
  textRingInside: Object.freeze({ adj: 60000 }),
  textRingOutside: Object.freeze({ adj: 60000 }),
  textSlantDown: Object.freeze({ adj: 44445 }),
  textSlantUp: Object.freeze({ adj: 55555 }),
  textStop: Object.freeze({ adj: 25000 }),
  textTriangle: Object.freeze({ adj: 50000 }),
  textTriangleInverted: Object.freeze({ adj: 50000 }),
  textWave1: Object.freeze({ adj1: 12500, adj2: 0 }),
  textWave2: Object.freeze({ adj1: 12500, adj2: 0 }),
  textWave4: Object.freeze({ adj1: 6250, adj2: 0 }),
});
