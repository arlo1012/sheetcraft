import type { FormulaRuntimeValue, FormulaValue } from "../../formula/types.js";

/**
 * Independent, hand-calculated cases for the 98 functions without a calculation
 * scenario in the existing Core formula tests (including three parser-only names).
 * Do not generate these expected
 * values with Core, an XLSX cached value, or another call to the same function.
 * Existing scenario tests remain the authority for the other 142 functions.
 */
export type RegistryCoverageCase = Readonly<{
  name: string;
  formula: string;
  expected?: FormulaRuntimeValue;
  numericInterval?: readonly [number, number];
  integer?: boolean;
  precision?: number;
}>;

export const REGISTRY_COVERAGE_CELLS: readonly (readonly FormulaValue[])[] = [
  [1, "x", 10, "label", "Kind", "Amount", null, "Kind"],
  [2, "y", 20, true, "x", 10, null, "x"],
  [3, "x", 30, null, "x", 20],
  [4, null, 40, "", "y", 30],
];

export const REGISTRY_COVERAGE_CASES: readonly RegistryCoverageCase[] = [
  { name: "PRODUCT", formula: "=PRODUCT(A1:A4)", expected: 24 },
  { name: "ABS", formula: "=ABS(-3.5)", expected: 3.5 },
  { name: "INT", formula: "=INT(-3.5)", expected: -4 },
  { name: "POWER", formula: "=POWER(2,3)", expected: 8 },
  { name: "SQRT", formula: "=SQRT(81)", expected: 9 },
  { name: "SIGN", formula: "=SIGN(-8)", expected: -1 },
  { name: "RAND", formula: "=RAND()", numericInterval: [0, 1] },
  { name: "RANDBETWEEN", formula: "=RANDBETWEEN(-3,2)", numericInterval: [-3, 3], integer: true },
  { name: "MROUND", formula: "=MROUND(-10,-3)", expected: -9 },
  { name: "CEILING.MATH", formula: "=CEILING.MATH(-5.5,2)", expected: -4 },
  { name: "FLOOR.MATH", formula: "=FLOOR.MATH(-5.5,2)", expected: -6 },
  { name: "ISO.CEILING", formula: "=ISO.CEILING(-4.3,2)", expected: -4 },
  { name: "QUOTIENT", formula: "=QUOTIENT(-10,3)", expected: -3 },
  { name: "EVEN", formula: "=EVEN(-3.1)", expected: -4 },
  { name: "ODD", formula: "=ODD(-2.1)", expected: -3 },
  { name: "TAN", formula: "=TAN(0)", expected: 0 },
  { name: "ACOS", formula: "=ACOS(1)", expected: 0 },
  { name: "ATAN", formula: "=ATAN(1)", expected: 0.7853981633974483 },
  { name: "SINH", formula: "=SINH(0)", expected: 0 },
  { name: "COSH", formula: "=COSH(0)", expected: 1 },
  { name: "TANH", formula: "=TANH(0)", expected: 0 },
  { name: "ASINH", formula: "=ASINH(0)", expected: 0 },
  { name: "ACOSH", formula: "=ACOSH(1)", expected: 0 },
  { name: "ATANH", formula: "=ATANH(0)", expected: 0 },
  { name: "LOG10", formula: "=LOG10(1000)", expected: 3 },
  { name: "SQRTPI", formula: "=SQRTPI(1)", expected: 1.7724538509055159 },
  { name: "OR", formula: "=OR(FALSE,0,TRUE)", expected: true },
  { name: "NOT", formula: "=NOT(0)", expected: true },
  { name: "TRUE", formula: "=TRUE()", expected: true },
  { name: "FALSE", formula: "=FALSE()", expected: false },
  { name: "COUNTA", formula: "=COUNTA(D1:D4)", expected: 3 },
  { name: "COUNTBLANK", formula: "=COUNTBLANK(D1:D4)", expected: 2 },
  { name: "COUNTIFS", formula: '=COUNTIFS(B1:B4,"x",A1:A4,">1")', expected: 1 },
  { name: "AVERAGEIFS", formula: '=AVERAGEIFS(C1:C4,B1:B4,"x")', expected: 20 },
  { name: "RANK.EQ", formula: "=RANK.EQ(2,{1;2;2;4})", expected: 2 },
  { name: "RANK.AVG", formula: "=RANK.AVG(2,{1;2;2;4})", expected: 2.5 },
  { name: "VAR.S", formula: "=VAR.S(A1:A4)", expected: 1.6666666666666667 },
  { name: "VAR.P", formula: "=VAR.P(A1:A4)", expected: 1.25 },
  { name: "STDEV.S", formula: "=STDEV.S(A1:A4)", expected: 1.2909944487358056 },
  { name: "STDEV.P", formula: "=STDEV.P(A1:A4)", expected: 1.118033988749895 },
  { name: "DEVSQ", formula: "=DEVSQ(A1:A4)", expected: 5 },
  { name: "GEOMEAN", formula: "=GEOMEAN(1,4)", expected: 2 },
  { name: "HARMEAN", formula: "=HARMEAN(1,3)", expected: 1.5 },
  { name: "PERCENTILE.INC", formula: "=PERCENTILE.INC(A1:A4,0.25)", expected: 1.75 },
  { name: "PERCENTILE.EXC", formula: "=PERCENTILE.EXC(A1:A4,0.25)", expected: 1.25 },
  { name: "QUARTILE.EXC", formula: "=QUARTILE.EXC(A1:A4,1)", expected: 1.25 },
  { name: "PERCENTRANK.INC", formula: "=PERCENTRANK.INC(A1:A4,2.5)", expected: 0.5 },
  { name: "PERCENTRANK.EXC", formula: "=PERCENTRANK.EXC(A1:A4,2.5)", expected: 0.5 },
  { name: "MODE.SNGL", formula: "=MODE.SNGL(1,2,2,3)", expected: 2 },
  { name: "STDEV", formula: "=STDEV(A1:A4)", expected: 1.2909944487358056 },
  { name: "STDEVP", formula: "=STDEVP(A1:A4)", expected: 1.118033988749895 },
  { name: "VARP", formula: "=VARP(A1:A4)", expected: 1.25 },
  { name: "PERCENTRANK", formula: "=PERCENTRANK(A1:A4,2.5)", expected: 0.5 },
  { name: "DAVERAGE", formula: '=DAVERAGE(E1:F4,"Amount",H1:H2)', expected: 15 },
  { name: "DMAX", formula: '=DMAX(E1:F4,"Amount",H1:H2)', expected: 20 },
  { name: "DMIN", formula: '=DMIN(E1:F4,"Amount",H1:H2)', expected: 10 },
  { name: "DPRODUCT", formula: '=DPRODUCT(E1:F4,"Amount",H1:H2)', expected: 200 },
  { name: "DSTDEV", formula: '=DSTDEV(E1:F4,"Amount",H1:H2)', expected: 7.0710678118654755 },
  { name: "DSTDEVP", formula: '=DSTDEVP(E1:F4,"Amount",H1:H2)', expected: 5 },
  { name: "DVARP", formula: '=DVARP(E1:F4,"Amount",H1:H2)', expected: 25 },
  {
    name: "DROP",
    formula: "=DROP({1,2;3,4},1)",
    expected: { kind: "formula-array", rows: [[3, 4]] },
  },
  {
    name: "VSTACK",
    formula: "=VSTACK({1,2},{3,4})",
    expected: {
      kind: "formula-array",
      rows: [
        [1, 2],
        [3, 4],
      ],
    },
  },
  {
    name: "CHOOSECOLS",
    formula: "=CHOOSECOLS({1,2;3,4},2,1)",
    expected: {
      kind: "formula-array",
      rows: [
        [2, 1],
        [4, 3],
      ],
    },
  },
  {
    name: "CHOOSEROWS",
    formula: "=CHOOSEROWS({1,2;3,4},-1)",
    expected: { kind: "formula-array", rows: [[3, 4]] },
  },
  {
    name: "TRANSPOSE",
    formula: "=TRANSPOSE({1,2,3;4,5,6})",
    expected: {
      kind: "formula-array",
      rows: [
        [1, 4],
        [2, 5],
        [3, 6],
      ],
    },
  },
  { name: "ISBLANK", formula: "=ISBLANK(Z1)", expected: true },
  { name: "ISNUMBER", formula: '=ISNUMBER("3")', expected: false },
  { name: "ISTEXT", formula: '=ISTEXT("3")', expected: true },
  { name: "ISLOGICAL", formula: "=ISLOGICAL(TRUE)", expected: true },
  { name: "ISERROR", formula: "=ISERROR(#N/A)", expected: true },
  { name: "ISNA", formula: "=ISNA(#N/A)", expected: true },
  { name: "N", formula: '=N("3")', expected: 0 },
  { name: "TYPE", formula: "=TYPE(TRUE)", expected: 4 },
  { name: "ERROR.TYPE", formula: "=ERROR.TYPE(#DIV/0!)", expected: 2 },
  { name: "ISNONTEXT", formula: "=ISNONTEXT(Z1)", expected: true },
  { name: "CHOOSE", formula: '=CHOOSE(2,"first","second")', expected: "second" },
  { name: "AREAS", formula: "=AREAS(A1:B4)", expected: 1 },
  { name: "ROWS", formula: "=ROWS(A1:B4)", expected: 4 },
  { name: "COLUMNS", formula: "=COLUMNS(A1:B4)", expected: 2 },
  { name: "UPPER", formula: '=UPPER("aBc")', expected: "ABC" },
  { name: "LOWER", formula: '=LOWER("aBc")', expected: "abc" },
  { name: "TRIM", formula: '=TRIM("  a   b  ")', expected: "a b" },
  { name: "CLEAN", formula: '=CLEAN("a\tb\nc")', expected: "abc" },
  { name: "CONCATENATE", formula: '=CONCATENATE("a",2,TRUE)', expected: "a2TRUE" },
  { name: "REPLACE", formula: '=REPLACE("abcdef",2,3,"X")', expected: "aXef" },
  { name: "EXACT", formula: '=EXACT("a","A")', expected: false },
  { name: "REPT", formula: '=REPT("ab",3)', expected: "ababab" },
  { name: "YEAR", formula: "=YEAR(45351)", expected: 2024 },
  { name: "MONTH", formula: "=MONTH(45351)", expected: 2 },
  { name: "DAY", formula: "=DAY(45351)", expected: 29 },
  { name: "HOUR", formula: "=HOUR(0.5)", expected: 12 },
  { name: "MINUTE", formula: "=MINUTE(0.53125)", expected: 45 },
  { name: "SECOND", formula: "=SECOND(0.5003472222222223)", expected: 30 },
  { name: "DAYS", formula: "=DAYS(45351,45350)", expected: 1 },
  { name: "OCT2DEC", formula: '=OCT2DEC("17")', expected: 15 },
  { name: "BIN2HEX", formula: '=BIN2HEX("1111",4)', expected: "000F" },
  { name: "OCT2BIN", formula: '=OCT2BIN("17",5)', expected: "01111" },
  { name: "HEX2OCT", formula: '=HEX2OCT("F",3)', expected: "017" },
];
