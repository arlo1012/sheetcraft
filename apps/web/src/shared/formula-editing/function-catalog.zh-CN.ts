import { createFormulaFunctionCopy } from "./function-catalog-copy";

export const formulaFunctionCopyZhCN = createFormulaFunctionCopy({
  SUM: { description: "返回一组数值的总和。", example: "=SUM(1,2)" },
  PRODUCT: { description: "返回一组数值的乘积。", example: "=PRODUCT(2,3)" },
  ABS: { description: "返回数字的绝对值。", example: "=ABS(-3)" },
  INT: { description: "将数字向下取整为整数。", example: "=INT(3.8)" },
  TRUNC: { description: "截去数字的小数部分。", example: "=TRUNC(3.86,1)" },
  ROUND: {
    description: "将数字按指定小数位数四舍五入。",
    example: "=ROUND(3.86,1)",
  },
  ROUNDUP: {
    description: "将数字向远离零的方向舍入。",
    example: "=ROUNDUP(3.81,1)",
  },
  ROUNDDOWN: {
    description: "将数字向零的方向舍入。",
    example: "=ROUNDDOWN(3.89,1)",
  },
  MOD: { description: "返回两数相除的余数。", example: "=MOD(10,3)" },
  POWER: { description: "返回数字的指定次幂。", example: "=POWER(2,3)" },
  SQRT: { description: "返回数字的平方根。", example: "=SQRT(9)" },
  SIGN: { description: "返回数字的正负号。", example: "=SIGN(-2)" },
  CEILING: {
    description: "将数字向上舍入到指定倍数。",
    example: "=CEILING(4.2,1)",
  },
  FLOOR: {
    description: "将数字向下舍入到指定倍数。",
    example: "=FLOOR(4.8,1)",
  },
  SUMPRODUCT: {
    description: "返回对应数组乘积之和。",
    example: "=SUMPRODUCT(A1:A3,B1:B3)",
  },
  IF: {
    description: "根据条件返回两个结果中的一个。",
    example: '=IF(A1>0,"是","否")',
  },
  IFERROR: {
    description: "当表达式产生错误时返回指定值。",
    example: "=IFERROR(A1/B1,0)",
  },
  IFNA: {
    description: "当表达式产生 #N/A 时返回指定值。",
    example: "=IFNA(A1,0)",
  },
  AND: { description: "全部条件为真时返回 TRUE。", example: "=AND(A1>0,B1>0)" },
  OR: { description: "任一条件为真时返回 TRUE。", example: "=OR(A1>0,B1>0)" },
  XOR: {
    description: "奇数个条件为真时返回 TRUE。",
    example: "=XOR(TRUE,FALSE)",
  },
  NOT: { description: "反转逻辑值。", example: "=NOT(TRUE)" },
  TRUE: { description: "返回逻辑值 TRUE。", example: "=TRUE()" },
  FALSE: { description: "返回逻辑值 FALSE。", example: "=FALSE()" },
  IFS: {
    description: "依次检查条件并返回首个匹配结果。",
    example: '=IFS(A1>0,"正",A1<0,"负")',
  },
  SWITCH: {
    description: "按表达式匹配值并返回对应结果。",
    example: '=SWITCH(A1,1,"一","其他")',
  },
  AVERAGE: {
    description: "返回一组数值的算术平均值。",
    example: "=AVERAGE(1,2,3)",
  },
  COUNT: { description: "计算参数中数值的个数。", example: "=COUNT(A1:A10)" },
  COUNTA: { description: "计算非空值的个数。", example: "=COUNTA(A1:A10)" },
  COUNTBLANK: {
    description: "计算范围内空白单元格的个数。",
    example: "=COUNTBLANK(A1:A10)",
  },
  MIN: { description: "返回一组数值中的最小值。", example: "=MIN(1,2,3)" },
  MAX: { description: "返回一组数值中的最大值。", example: "=MAX(1,2,3)" },
  COUNTIF: {
    description: "计算符合条件的单元格数量。",
    example: '=COUNTIF(A1:A10,">0")',
  },
  COUNTIFS: {
    description: "计算同时符合多个条件的单元格数量。",
    example: '=COUNTIFS(A1:A10,">0")',
  },
  SUMIF: {
    description: "对符合条件的值求和。",
    example: '=SUMIF(A1:A10,">0")',
  },
  SUMIFS: {
    description: "对符合多个条件的值求和。",
    example: '=SUMIFS(B1:B10,A1:A10,">0")',
  },
  AVERAGEIF: {
    description: "返回符合条件的值的平均值。",
    example: '=AVERAGEIF(A1:A10,">0")',
  },
  AVERAGEIFS: {
    description: "返回符合多个条件的值的平均值。",
    example: '=AVERAGEIFS(B1:B10,A1:A10,">0")',
  },
  MEDIAN: { description: "返回一组数值的中位数。", example: "=MEDIAN(1,2,3)" },
  LARGE: {
    description: "返回数组中第 k 个最大值。",
    example: "=LARGE(A1:A10,2)",
  },
  SMALL: {
    description: "返回数组中第 k 个最小值。",
    example: "=SMALL(A1:A10,2)",
  },
  RANK: {
    description: "返回数字在数值列表中的排名。",
    example: "=RANK(A1,A1:A10)",
  },
  ISBLANK: { description: "判断值是否为空白。", example: "=ISBLANK(A1)" },
  ISNUMBER: { description: "判断值是否为数字。", example: "=ISNUMBER(A1)" },
  ISTEXT: { description: "判断值是否为文本。", example: "=ISTEXT(A1)" },
  ISLOGICAL: { description: "判断值是否为逻辑值。", example: "=ISLOGICAL(A1)" },
  ISERROR: { description: "判断值是否为任意错误。", example: "=ISERROR(A1)" },
  ISERR: {
    description: "判断值是否为除 #N/A 外的错误。",
    example: "=ISERR(A1)",
  },
  ISNA: { description: "判断值是否为 #N/A 错误。", example: "=ISNA(A1)" },
  NA: { description: "返回 #N/A 错误值。", example: "=NA()" },
  INDEX: {
    description: "从数组或区域返回指定位置的值。",
    example: "=INDEX(A1:C3,1,2)",
  },
  MATCH: {
    description: "返回值在数组中的相对位置。",
    example: "=MATCH(A1,A1:A10,0)",
  },
  VLOOKUP: {
    description: "在首列查找并返回同一行的值。",
    example: "=VLOOKUP(A1,A1:C10,2,FALSE)",
  },
  HLOOKUP: {
    description: "在首行查找并返回同一列的值。",
    example: "=HLOOKUP(A1,A1:C3,2,FALSE)",
  },
  XLOOKUP: {
    description: "在数组中查找并返回匹配位置的值。",
    example: "=XLOOKUP(A1,A1:A10,B1:B10)",
  },
  LEN: { description: "返回文本中的字符数。", example: '=LEN("idea")' },
  LEFT: { description: "从文本左侧返回指定字符。", example: '=LEFT("idea",2)' },
  RIGHT: {
    description: "从文本右侧返回指定字符。",
    example: '=RIGHT("idea",2)',
  },
  MID: { description: "从文本中间返回指定字符。", example: '=MID("idea",2,2)' },
  UPPER: { description: "将文本转换为大写。", example: '=UPPER("idea")' },
  LOWER: { description: "将文本转换为小写。", example: '=LOWER("IDEA")' },
  TRIM: { description: "删除文本中多余的空格。", example: '=TRIM(" a  b ")' },
  CLEAN: {
    description: "删除文本中的不可打印字符。",
    example: '=CLEAN("idea")',
  },
  CONCAT: { description: "连接多个文本项。", example: '=CONCAT("i","dea")' },
  CONCATENATE: {
    description: "连接多个文本项。",
    example: '=CONCATENATE("i","dea")',
  },
  TEXTJOIN: {
    description: "使用分隔符连接文本项。",
    example: '=TEXTJOIN("-",TRUE,"i","dea")',
  },
  SUBSTITUTE: {
    description: "用新文本替换文本中的指定内容。",
    example: '=SUBSTITUTE("idea","i","I")',
  },
  REPLACE: {
    description: "按位置替换文本中的字符。",
    example: '=REPLACE("idea",2,1,"D")',
  },
  FIND: {
    description: "返回文本在另一文本中的起始位置，区分大小写。",
    example: '=FIND("d","idea")',
  },
  SEARCH: {
    description: "返回文本在另一文本中的起始位置，不区分大小写。",
    example: '=SEARCH("D","idea")',
  },
  EXACT: {
    description: "比较两个文本是否完全相同。",
    example: '=EXACT("idea","idea")',
  },
  REPT: { description: "按指定次数重复文本。", example: '=REPT("i",2)' },
  VALUE: {
    description: "将代表数字的文本转换为数值。",
    example: '=VALUE("12")',
  },
  TEXT: {
    description: "按指定格式将值转换为文本。",
    example: '=TEXT(12,"0.00")',
  },
  DATE: {
    description: "返回指定年月日的日期序列值。",
    example: "=DATE(2026,9,12)",
  },
  TIME: {
    description: "返回指定时分秒的时间序列值。",
    example: "=TIME(12,30,0)",
  },
  YEAR: { description: "返回日期的年份。", example: "=YEAR(DATE(2026,9,12))" },
  MONTH: {
    description: "返回日期的月份。",
    example: "=MONTH(DATE(2026,9,12))",
  },
  DAY: { description: "返回日期的天数。", example: "=DAY(DATE(2026,9,12))" },
  HOUR: { description: "返回时间的小时。", example: "=HOUR(TIME(12,30,0))" },
  MINUTE: {
    description: "返回时间的分钟。",
    example: "=MINUTE(TIME(12,30,0))",
  },
  SECOND: {
    description: "返回时间的秒数。",
    example: "=SECOND(TIME(12,30,5))",
  },
  DAYS: {
    description: "返回两个日期之间的天数。",
    example: "=DAYS(DATE(2026,9,12),DATE(2026,9,1))",
  },
  EDATE: {
    description: "返回起始日期前后指定月数的日期。",
    example: "=EDATE(DATE(2026,1,1),1)",
  },
  EOMONTH: {
    description: "返回起始日期前后指定月数的月末日期。",
    example: "=EOMONTH(DATE(2026,1,1),0)",
  },
  WEEKDAY: {
    description: "返回日期对应的星期序号。",
    example: "=WEEKDAY(DATE(2026,9,12))",
  },
  TODAY: { description: "返回当前日期。", example: "=TODAY()" },
  NOW: { description: "返回当前日期和时间。", example: "=NOW()" },
  FV: { description: "返回投资的未来值。", example: "=FV(0.1,2,-100)" },
  PV: { description: "返回投资的现值。", example: "=PV(0.1,2,-100)" },
  PMT: { description: "返回贷款每期的付款额。", example: "=PMT(0.1,2,1000)" },
  NPER: {
    description: "返回投资或贷款的期数。",
    example: "=NPER(0.1,-100,1000)",
  },
  BIN2DEC: {
    description: "将二进制数转换为十进制数。",
    example: '=BIN2DEC("101")',
  },
  DEC2BIN: {
    description: "将十进制数转换为二进制数。",
    example: "=DEC2BIN(5)",
  },
  HEX2DEC: {
    description: "将十六进制数转换为十进制数。",
    example: '=HEX2DEC("A")',
  },
  DEC2HEX: {
    description: "将十进制数转换为十六进制数。",
    example: "=DEC2HEX(10)",
  },
});
