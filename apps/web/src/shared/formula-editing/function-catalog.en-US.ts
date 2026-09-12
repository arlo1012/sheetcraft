import { createFormulaFunctionCopy } from "./function-catalog-copy";

export const formulaArgumentLabelsEnUS: Record<string, string> = {
  number1: "number 1",
  number2: "number 2",
  number: "number",
  num_digits: "num_digits",
  divisor: "divisor",
  power: "power",
  significance: "significance",
  array1: "array 1",
  array2: "array 2",
  logical_test: "logical_test",
  value_if_true: "value_if_true",
  value_if_false: "value_if_false",
  value: "value",
  value_if_error: "value_if_error",
  value_if_na: "value_if_na",
  logical1: "logical 1",
  logical2: "logical 2",
  logical: "logical",
  logical_test1: "logical_test 1",
  value_if_true1: "value_if_true 1",
  expression: "expression",
  value1: "value 1",
  result1: "result 1",
  default: "default",
  value2: "value 2",
  range: "range",
  criteria: "criteria",
  criteria_range1: "criteria_range 1",
  criteria1: "criteria 1",
  sum_range: "sum_range",
  average_range: "average_range",
  array: "array",
  k: "k",
  ref: "ref",
  order: "order",
  row_num: "row_num",
  column_num: "column_num",
  lookup_value: "lookup_value",
  lookup_array: "lookup_array",
  match_type: "match_type",
  table_array: "table_array",
  col_index_num: "col_index_num",
  range_lookup: "range_lookup",
  row_index_num: "row_index_num",
  return_array: "return_array",
  if_not_found: "if_not_found",
  match_mode: "match_mode",
  search_mode: "search_mode",
  text: "text",
  num_chars: "num_chars",
  start_num: "start_num",
  text1: "text 1",
  text2: "text 2",
  delimiter: "delimiter",
  ignore_empty: "ignore_empty",
  old_text: "old_text",
  new_text: "new_text",
  instance_num: "instance_num",
  find_text: "find_text",
  within_text: "within_text",
  number_times: "number_times",
  format_text: "format_text",
  year: "year",
  month: "month",
  day: "day",
  hour: "hour",
  minute: "minute",
  second: "second",
  serial_number: "serial_number",
  end_date: "end_date",
  start_date: "start_date",
  months: "months",
  return_type: "return_type",
  rate: "rate",
  nper: "nper",
  pmt: "pmt",
  pv: "pv",
  type: "type",
  fv: "fv",
  places: "places",
};

export const formulaFunctionCopyEnUS = createFormulaFunctionCopy(
  {
    SUM: { description: "Adds a group of numbers.", example: "=SUM(1,2)" },
    PRODUCT: {
      description: "Multiplies a group of numbers.",
      example: "=PRODUCT(2,3)",
    },
    ABS: {
      description: "Returns a number's absolute value.",
      example: "=ABS(-3)",
    },
    INT: {
      description: "Rounds a number down to an integer.",
      example: "=INT(3.8)",
    },
    TRUNC: {
      description: "Truncates a number to an integer or decimal places.",
      example: "=TRUNC(3.86,1)",
    },
    ROUND: {
      description: "Rounds a number to the requested digits.",
      example: "=ROUND(3.86,1)",
    },
    ROUNDUP: {
      description: "Rounds a number away from zero.",
      example: "=ROUNDUP(3.81,1)",
    },
    ROUNDDOWN: {
      description: "Rounds a number toward zero.",
      example: "=ROUNDDOWN(3.89,1)",
    },
    MOD: {
      description: "Returns the remainder after division.",
      example: "=MOD(10,3)",
    },
    POWER: {
      description: "Returns a number raised to a power.",
      example: "=POWER(2,3)",
    },
    SQRT: {
      description: "Returns a number's square root.",
      example: "=SQRT(9)",
    },
    SIGN: { description: "Returns a number's sign.", example: "=SIGN(-2)" },
    CEILING: {
      description: "Rounds a number up to a multiple.",
      example: "=CEILING(4.2,1)",
    },
    FLOOR: {
      description: "Rounds a number down to a multiple.",
      example: "=FLOOR(4.8,1)",
    },
    SUMPRODUCT: {
      description: "Returns the sum of corresponding array products.",
      example: "=SUMPRODUCT(A1:A3,B1:B3)",
    },
    IF: {
      description: "Returns one value when a condition is true and another when it is false.",
      example: '=IF(A1>0,"Yes","No")',
    },
    IFERROR: {
      description: "Returns a value when an expression produces an error.",
      example: "=IFERROR(A1/B1,0)",
    },
    IFNA: {
      description: "Returns a value when an expression produces #N/A.",
      example: "=IFNA(A1,0)",
    },
    AND: {
      description: "Returns TRUE when every condition is true.",
      example: "=AND(A1>0,B1>0)",
    },
    OR: {
      description: "Returns TRUE when any condition is true.",
      example: "=OR(A1>0,B1>0)",
    },
    XOR: {
      description: "Returns TRUE when an odd number of conditions are true.",
      example: "=XOR(TRUE,FALSE)",
    },
    NOT: { description: "Reverses a logical value.", example: "=NOT(TRUE)" },
    TRUE: {
      description: "Returns the logical value TRUE.",
      example: "=TRUE()",
    },
    FALSE: {
      description: "Returns the logical value FALSE.",
      example: "=FALSE()",
    },
    IFS: {
      description: "Checks conditions and returns the first matching result.",
      example: '=IFS(A1>0,"positive",A1<0,"negative")',
    },
    SWITCH: {
      description: "Matches an expression to values and returns the matching result.",
      example: '=SWITCH(A1,1,"one","other")',
    },
    AVERAGE: {
      description: "Returns the arithmetic mean of numbers.",
      example: "=AVERAGE(1,2,3)",
    },
    COUNT: {
      description: "Counts numeric values in arguments.",
      example: "=COUNT(A1:A10)",
    },
    COUNTA: {
      description: "Counts non-empty values.",
      example: "=COUNTA(A1:A10)",
    },
    COUNTBLANK: {
      description: "Counts blank cells in a range.",
      example: "=COUNTBLANK(A1:A10)",
    },
    MIN: {
      description: "Returns the smallest number.",
      example: "=MIN(1,2,3)",
    },
    MAX: { description: "Returns the largest number.", example: "=MAX(1,2,3)" },
    COUNTIF: {
      description: "Counts cells that meet a condition.",
      example: '=COUNTIF(A1:A10,">0")',
    },
    COUNTIFS: {
      description: "Counts cells that meet multiple conditions.",
      example: '=COUNTIFS(A1:A10,">0")',
    },
    SUMIF: {
      description: "Adds values that meet a condition.",
      example: '=SUMIF(A1:A10,">0")',
    },
    SUMIFS: {
      description: "Adds values that meet multiple conditions.",
      example: '=SUMIFS(B1:B10,A1:A10,">0")',
    },
    AVERAGEIF: {
      description: "Returns the average of values that meet a condition.",
      example: '=AVERAGEIF(A1:A10,">0")',
    },
    AVERAGEIFS: {
      description: "Returns the average of values that meet multiple conditions.",
      example: '=AVERAGEIFS(B1:B10,A1:A10,">0")',
    },
    MEDIAN: {
      description: "Returns the median of numbers.",
      example: "=MEDIAN(1,2,3)",
    },
    LARGE: {
      description: "Returns the k-th largest value in an array.",
      example: "=LARGE(A1:A10,2)",
    },
    SMALL: {
      description: "Returns the k-th smallest value in an array.",
      example: "=SMALL(A1:A10,2)",
    },
    RANK: {
      description: "Returns a number's rank in a list.",
      example: "=RANK(A1,A1:A10)",
    },
    ISBLANK: {
      description: "Checks whether a value is blank.",
      example: "=ISBLANK(A1)",
    },
    ISNUMBER: {
      description: "Checks whether a value is a number.",
      example: "=ISNUMBER(A1)",
    },
    ISTEXT: {
      description: "Checks whether a value is text.",
      example: "=ISTEXT(A1)",
    },
    ISLOGICAL: {
      description: "Checks whether a value is logical.",
      example: "=ISLOGICAL(A1)",
    },
    ISERROR: {
      description: "Checks whether a value is any error.",
      example: "=ISERROR(A1)",
    },
    ISERR: {
      description: "Checks whether a value is an error except #N/A.",
      example: "=ISERR(A1)",
    },
    ISNA: {
      description: "Checks whether a value is #N/A.",
      example: "=ISNA(A1)",
    },
    NA: { description: "Returns the #N/A error value.", example: "=NA()" },
    INDEX: {
      description: "Returns a value at a position in an array or range.",
      example: "=INDEX(A1:C3,1,2)",
    },
    MATCH: {
      description: "Returns a value's relative position in an array.",
      example: "=MATCH(A1,A1:A10,0)",
    },
    VLOOKUP: {
      description: "Looks up a value in the first column and returns a value from that row.",
      example: "=VLOOKUP(A1,A1:C10,2,FALSE)",
    },
    HLOOKUP: {
      description: "Looks up a value in the first row and returns a value from that column.",
      example: "=HLOOKUP(A1,A1:C3,2,FALSE)",
    },
    XLOOKUP: {
      description: "Looks up a value and returns the matching value from another array.",
      example: "=XLOOKUP(A1,A1:A10,B1:B10)",
    },
    LEN: {
      description: "Returns the number of characters in text.",
      example: '=LEN("idea")',
    },
    LEFT: {
      description: "Returns characters from the left of text.",
      example: '=LEFT("idea",2)',
    },
    RIGHT: {
      description: "Returns characters from the right of text.",
      example: '=RIGHT("idea",2)',
    },
    MID: {
      description: "Returns characters from the middle of text.",
      example: '=MID("idea",2,2)',
    },
    UPPER: {
      description: "Converts text to uppercase.",
      example: '=UPPER("idea")',
    },
    LOWER: {
      description: "Converts text to lowercase.",
      example: '=LOWER("IDEA")',
    },
    TRIM: {
      description: "Removes extra spaces from text.",
      example: '=TRIM(" a  b ")',
    },
    CLEAN: {
      description: "Removes non-printing characters from text.",
      example: '=CLEAN("idea")',
    },
    CONCAT: { description: "Joins text items.", example: '=CONCAT("i","dea")' },
    CONCATENATE: {
      description: "Joins text items.",
      example: '=CONCATENATE("i","dea")',
    },
    TEXTJOIN: {
      description: "Joins text with a delimiter.",
      example: '=TEXTJOIN("-",TRUE,"i","dea")',
    },
    SUBSTITUTE: {
      description: "Replaces text occurrences with new text.",
      example: '=SUBSTITUTE("idea","i","I")',
    },
    REPLACE: {
      description: "Replaces characters at a position in text.",
      example: '=REPLACE("idea",2,1,"D")',
    },
    FIND: {
      description: "Returns a text position, matching case.",
      example: '=FIND("d","idea")',
    },
    SEARCH: {
      description: "Returns a text position without matching case.",
      example: '=SEARCH("D","idea")',
    },
    EXACT: {
      description: "Checks whether two text values are exactly equal.",
      example: '=EXACT("idea","idea")',
    },
    REPT: {
      description: "Repeats text a given number of times.",
      example: '=REPT("i",2)',
    },
    VALUE: {
      description: "Converts numeric text to a number.",
      example: '=VALUE("12")',
    },
    TEXT: {
      description: "Converts a value to formatted text.",
      example: '=TEXT(12,"0.00")',
    },
    DATE: {
      description: "Returns a date serial number from year, month, and day.",
      example: "=DATE(2026,9,12)",
    },
    TIME: {
      description: "Returns a time serial number from hours, minutes, and seconds.",
      example: "=TIME(12,30,0)",
    },
    YEAR: {
      description: "Returns the year of a date.",
      example: "=YEAR(DATE(2026,9,12))",
    },
    MONTH: {
      description: "Returns the month of a date.",
      example: "=MONTH(DATE(2026,9,12))",
    },
    DAY: {
      description: "Returns the day of a date.",
      example: "=DAY(DATE(2026,9,12))",
    },
    HOUR: {
      description: "Returns the hour of a time.",
      example: "=HOUR(TIME(12,30,0))",
    },
    MINUTE: {
      description: "Returns the minute of a time.",
      example: "=MINUTE(TIME(12,30,0))",
    },
    SECOND: {
      description: "Returns the second of a time.",
      example: "=SECOND(TIME(12,30,5))",
    },
    DAYS: {
      description: "Returns the days between two dates.",
      example: "=DAYS(DATE(2026,9,12),DATE(2026,9,1))",
    },
    EDATE: {
      description: "Returns a date a number of months before or after a start date.",
      example: "=EDATE(DATE(2026,1,1),1)",
    },
    EOMONTH: {
      description: "Returns the last day of a month before or after a start date.",
      example: "=EOMONTH(DATE(2026,1,1),0)",
    },
    WEEKDAY: {
      description: "Returns a weekday number for a date.",
      example: "=WEEKDAY(DATE(2026,9,12))",
    },
    TODAY: { description: "Returns the current date.", example: "=TODAY()" },
    NOW: {
      description: "Returns the current date and time.",
      example: "=NOW()",
    },
    FV: {
      description: "Returns an investment's future value.",
      example: "=FV(0.1,2,-100)",
    },
    PV: {
      description: "Returns an investment's present value.",
      example: "=PV(0.1,2,-100)",
    },
    PMT: {
      description: "Returns a loan payment per period.",
      example: "=PMT(0.1,2,1000)",
    },
    NPER: {
      description: "Returns the number of periods for an investment or loan.",
      example: "=NPER(0.1,-100,1000)",
    },
    BIN2DEC: {
      description: "Converts a binary number to decimal.",
      example: '=BIN2DEC("101")',
    },
    DEC2BIN: {
      description: "Converts a decimal number to binary.",
      example: "=DEC2BIN(5)",
    },
    HEX2DEC: {
      description: "Converts a hexadecimal number to decimal.",
      example: '=HEX2DEC("A")',
    },
    DEC2HEX: {
      description: "Converts a decimal number to hexadecimal.",
      example: "=DEC2HEX(10)",
    },
  },
  formulaArgumentLabelsEnUS,
);
