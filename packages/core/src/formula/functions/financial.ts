import { isFormulaError, type FormulaValue } from "../types.js";
import { excelSerialToDateParts } from "../date-system.js";
import type { FormulaFunctionContext, FormulaFunctionDefinition } from "./contracts.js";
import { defineFunction, finiteNumber, formulaError, scalar, values } from "./helpers.js";

function number(
  context: FormulaFunctionContext,
  index: number,
): number | ReturnType<typeof formulaError> {
  return finiteNumber(scalar(context.evaluateArgument(index)));
}

function paymentType(
  context: FormulaFunctionContext,
  index: number,
): 0 | 1 | ReturnType<typeof formulaError> {
  if (context.argumentCount <= index) return 0;
  const value = number(context, index);
  if (isFormulaError(value)) return value;
  return value !== 0 && value !== 1 ? formulaError("NUM") : value;
}

function argumentsFor(
  context: FormulaFunctionContext,
  required: number,
): number[] | ReturnType<typeof formulaError> {
  const result: number[] = [];
  for (let index = 0; index < required; index += 1) {
    const value = number(context, index);
    if (isFormulaError(value)) return value;
    result.push(value);
  }
  return result;
}

function fv(rate: number, nper: number, pmt: number, pv: number, type: number): FormulaValue {
  if (nper < 0) return formulaError("NUM");
  const result =
    rate === 0
      ? -(pv + pmt * nper)
      : -(pv * (1 + rate) ** nper + pmt * (1 + rate * type) * (((1 + rate) ** nper - 1) / rate));
  return Number.isFinite(result) ? result : formulaError("NUM");
}

function pv(rate: number, nper: number, pmt: number, future: number, type: number): FormulaValue {
  if (nper < 0) return formulaError("NUM");
  const result =
    rate === 0
      ? -(future + pmt * nper)
      : -(future + pmt * (1 + rate * type) * (((1 + rate) ** nper - 1) / rate)) /
        (1 + rate) ** nper;
  return Number.isFinite(result) ? result : formulaError("NUM");
}

function pmt(
  rate: number,
  nper: number,
  present: number,
  future: number,
  type: number,
): FormulaValue {
  if (nper <= 0) return formulaError("NUM");
  const result =
    rate === 0
      ? -(present + future) / nper
      : (-(future + present * (1 + rate) ** nper) * rate) /
        ((1 + rate * type) * ((1 + rate) ** nper - 1));
  return Number.isFinite(result) ? result : formulaError("NUM");
}

function nper(
  rate: number,
  payment: number,
  present: number,
  future: number,
  type: number,
): FormulaValue {
  if (rate === 0) return payment === 0 ? formulaError("NUM") : -(present + future) / payment;
  if (rate <= -1) return formulaError("NUM");
  const adjusted = (payment * (1 + rate * type)) / rate;
  const numerator = adjusted - future;
  const denominator = present + adjusted;
  const ratio = numerator / denominator;
  if (ratio <= 0 || !Number.isFinite(ratio)) return formulaError("NUM");
  const result = Math.log(ratio) / Math.log(1 + rate);
  return Number.isFinite(result) ? result : formulaError("NUM");
}

function rate(
  periods: number,
  payment: number,
  present: number,
  future: number,
  type: number,
  guess: number,
): FormulaValue {
  if (periods <= 0 || guess <= -1 || (payment === 0 && present * future >= 0))
    return formulaError("NUM");
  let current = guess;
  const cashFlow = (value: number) => {
    if (value <= -1) return Number.NaN;
    const growth = (1 + value) ** periods;
    const annuity =
      value === 0
        ? periods
        : Math.abs(value) < 1e-7
          ? periods + (periods * (periods - 1) * value) / 2
          : Math.expm1(periods * Math.log1p(value)) / value;
    return present * growth + payment * (1 + value * type) * annuity + future;
  };
  const tolerance =
    1e-10 * (Math.abs(present) + Math.abs(future) + Math.abs(payment) * periods + 1);
  let lower = -0.999999999;
  let upper = Math.max(guess, 0.1);
  let lowerResult = cashFlow(lower);
  let upperResult = cashFlow(upper);
  for (let attempt = 0; lowerResult * upperResult > 0 && attempt < 100; attempt += 1) {
    upper = upper * 2 + 0.1;
    upperResult = cashFlow(upper);
  }
  if (
    !Number.isFinite(lowerResult) ||
    !Number.isFinite(upperResult) ||
    lowerResult * upperResult > 0
  )
    return formulaError("NUM");
  if (Math.abs(lowerResult) <= tolerance) return lower;
  if (Math.abs(upperResult) <= tolerance) return upper;
  if (current <= lower || current >= upper) current = (lower + upper) / 2;
  for (let iteration = 0; iteration < 100; iteration += 1) {
    const result = cashFlow(current);
    if (Math.abs(result) <= tolerance) return current;
    const h = Math.max(1e-7, Math.abs(current) * 1e-6);
    const derivative = (cashFlow(current + h) - cashFlow(current - h)) / (2 * h);
    if (!Number.isFinite(result)) return formulaError("NUM");
    if (result * lowerResult > 0) {
      lower = current;
      lowerResult = result;
    } else {
      upper = current;
      upperResult = result;
    }
    const newton =
      Number.isFinite(derivative) && derivative !== 0 ? current - result / derivative : Number.NaN;
    const next =
      Number.isFinite(newton) && newton > lower && newton < upper ? newton : (lower + upper) / 2;
    if (Math.abs(next - current) < 1e-12) return next;
    current = next;
  }
  return formulaError("NUM");
}

function paymentParts(
  rateValue: number,
  period: number,
  periods: number,
  present: number,
  future: number,
  type: number,
): FormulaValue {
  if (period < 1 || period > periods || periods <= 0) return formulaError("NUM");
  return pmt(rateValue, periods, present, future, type);
}

function rangeNumbers(
  context: FormulaFunctionContext,
  index: number,
): number[] | ReturnType<typeof formulaError> {
  const result: number[] = [];
  for (const item of values(context.evaluateArgument(index))) {
    const number = finiteNumber(item);
    if (isFormulaError(number)) return number;
    result.push(number);
  }
  return result;
}

function irrNumbers(
  context: FormulaFunctionContext,
  index: number,
): number[] | ReturnType<typeof formulaError> {
  const result: number[] = [];
  for (const value of values(context.evaluateArgument(index))) {
    if (isFormulaError(value)) return value;
    if (typeof value === "number" && Number.isFinite(value)) result.push(value);
  }
  return result;
}

function dateSerials(
  context: FormulaFunctionContext,
  index: number,
): number[] | ReturnType<typeof formulaError> {
  const result: number[] = [];
  for (const value of values(context.evaluateArgument(index))) {
    const date = finiteNumber(value);
    if (isFormulaError(date)) return date;
    const day = Math.trunc(date);
    try {
      excelSerialToDateParts(day, context.dateSystem ?? "1900");
    } catch {
      return formulaError("VALUE");
    }
    result.push(day);
  }
  return result;
}

function irr(cashflows: readonly number[], guess: number): FormulaValue {
  if (
    cashflows.length === 0 ||
    !cashflows.some((value) => value > 0) ||
    !cashflows.some((value) => value < 0)
  )
    return formulaError("NUM");
  let current = guess;
  for (let iteration = 0; iteration < 100; iteration += 1) {
    let result = 0;
    let derivative = 0;
    for (let period = 0; period < cashflows.length; period += 1) {
      result += cashflows[period]! / (1 + current) ** period;
      if (period > 0) derivative -= (period * cashflows[period]!) / (1 + current) ** (period + 1);
    }
    if (!Number.isFinite(result) || !Number.isFinite(derivative) || derivative === 0)
      return formulaError("NUM");
    const next = current - result / derivative;
    if (next <= -1 || !Number.isFinite(next)) return formulaError("NUM");
    if (Math.abs(next - current) < 1e-10) return next;
    current = next;
  }
  return formulaError("NUM");
}

function xnpv(
  rateValue: number,
  cashflows: readonly number[],
  dates: readonly number[],
): FormulaValue {
  if (rateValue <= -1 || cashflows.length === 0 || cashflows.length !== dates.length)
    return formulaError("NUM");
  const first = dates[0]!;
  if (dates.some((date) => date < first)) return formulaError("NUM");
  const result = cashflows.reduce(
    (total, value, index) => total + value / (1 + rateValue) ** ((dates[index]! - first) / 365),
    0,
  );
  return Number.isFinite(result) ? result : formulaError("NUM");
}

function xirr(cashflows: readonly number[], dates: readonly number[], guess: number): FormulaValue {
  if (
    cashflows.length === 0 ||
    cashflows.length !== dates.length ||
    !cashflows.some((value) => value > 0) ||
    !cashflows.some((value) => value < 0) ||
    guess <= -1
  )
    return formulaError("NUM");
  let current = guess;
  const first = dates[0]!;
  if (dates.some((date) => date < first)) return formulaError("NUM");
  for (let iteration = 0; iteration < 100; iteration += 1) {
    let result = 0;
    let derivative = 0;
    for (let index = 0; index < cashflows.length; index += 1) {
      const years = (dates[index]! - first) / 365;
      result += cashflows[index]! / (1 + current) ** years;
      derivative -= (years * cashflows[index]!) / (1 + current) ** (years + 1);
    }
    if (!Number.isFinite(result) || !Number.isFinite(derivative) || derivative === 0)
      return formulaError("NUM");
    const next = current - result / derivative;
    if (next <= -1 || !Number.isFinite(next)) return formulaError("NUM");
    if (Math.abs(next - current) < 1e-10) return next;
    current = next;
  }
  return formulaError("NUM");
}

function depreciationArguments(
  context: FormulaFunctionContext,
  required: number,
): number[] | ReturnType<typeof formulaError> {
  const result = argumentsFor(context, required);
  if (isFormulaError(result)) return result;
  return result.some((value) => value < 0) ? formulaError("NUM") : result;
}

function cumulativePayment(
  rateValue: number,
  periods: number,
  present: number,
  start: number,
  end: number,
  type: number,
  interestOnly: boolean,
): FormulaValue {
  if (
    rateValue <= 0 ||
    !Number.isInteger(periods) ||
    periods <= 0 ||
    present <= 0 ||
    !Number.isInteger(start) ||
    !Number.isInteger(end) ||
    start < 1 ||
    end < start ||
    end > periods
  )
    return formulaError("NUM");
  const payment = pmt(rateValue, periods, present, 0, type);
  if (typeof payment !== "number") return isFormulaError(payment) ? payment : formulaError("NUM");
  let total = 0;
  for (let period = start; period <= end; period += 1) {
    const interest =
      period === 1 && type === 1
        ? 0
        : -(
            (rateValue === 0
              ? present + payment * (period - 1)
              : present * (1 + rateValue) ** (period - 1) +
                payment *
                  (1 + rateValue * type) *
                  (((1 + rateValue) ** (period - 1) - 1) / rateValue)) * rateValue
          );
    total += interestOnly ? interest : payment - interest;
  }
  return Number.isFinite(total) ? total : formulaError("NUM");
}

export const FINANCIAL_FUNCTIONS = [
  defineFunction(
    {
      name: "FV",
      category: "Financial",
      minArgs: 3,
      maxArgs: 5,
      arguments: [
        { name: "rate" },
        { name: "nper" },
        { name: "pmt" },
        { name: "pv", optional: true },
        { name: "type", optional: true },
      ],
      lazy: false,
    },
    (context) => {
      const values = argumentsFor(context, 3);
      if (isFormulaError(values)) return values;
      const present = context.argumentCount > 3 ? number(context, 3) : 0;
      const type = paymentType(context, 4);
      return isFormulaError(present)
        ? present
        : isFormulaError(type)
          ? type
          : fv(values[0]!, values[1]!, values[2]!, present, type);
    },
  ),
  ...(["CUMIPMT", "CUMPRINC"] as const).map((name) =>
    defineFunction(
      {
        name,
        category: "Financial",
        minArgs: 6,
        maxArgs: 6,
        arguments: [
          { name: "rate" },
          { name: "nper" },
          { name: "pv" },
          { name: "start_period" },
          { name: "end_period" },
          { name: "type" },
        ],
        lazy: false,
      },
      (context) => {
        const args = argumentsFor(context, 5);
        const type = paymentType(context, 5);
        if (isFormulaError(args) || isFormulaError(type)) return isFormulaError(args) ? args : type;
        return cumulativePayment(
          args[0]!,
          args[1]!,
          args[2]!,
          args[3]!,
          args[4]!,
          type,
          name === "CUMIPMT",
        );
      },
    ),
  ),
  defineFunction(
    {
      name: "XNPV",
      category: "Financial",
      minArgs: 3,
      maxArgs: 3,
      arguments: [{ name: "rate" }, { name: "values" }, { name: "dates" }],
      lazy: false,
    },
    (context) => {
      const rateValue = number(context, 0);
      const cashflows = rangeNumbers(context, 1);
      const dates = dateSerials(context, 2);
      return isFormulaError(rateValue)
        ? rateValue
        : isFormulaError(cashflows)
          ? cashflows
          : isFormulaError(dates)
            ? dates
            : xnpv(rateValue, cashflows, dates);
    },
  ),
  defineFunction(
    {
      name: "XIRR",
      category: "Financial",
      minArgs: 2,
      maxArgs: 3,
      arguments: [{ name: "values" }, { name: "dates" }, { name: "guess", optional: true }],
      lazy: false,
    },
    (context) => {
      const cashflows = rangeNumbers(context, 0);
      const dates = dateSerials(context, 1);
      const guess = context.argumentCount === 2 ? 0.1 : number(context, 2);
      return isFormulaError(cashflows)
        ? cashflows
        : isFormulaError(dates)
          ? dates
          : isFormulaError(guess)
            ? guess
            : xirr(cashflows, dates, guess);
    },
  ),
  defineFunction(
    {
      name: "SLN",
      category: "Financial",
      minArgs: 3,
      maxArgs: 3,
      arguments: [{ name: "cost" }, { name: "salvage" }, { name: "life" }],
      lazy: false,
    },
    (context) => {
      const values = depreciationArguments(context, 3);
      if (isFormulaError(values)) return values;
      const [cost, salvage, life] = values;
      return life === 0 ? formulaError("DIV0") : (cost! - salvage!) / life!;
    },
  ),
  defineFunction(
    {
      name: "SYD",
      category: "Financial",
      minArgs: 4,
      maxArgs: 4,
      arguments: [{ name: "cost" }, { name: "salvage" }, { name: "life" }, { name: "per" }],
      lazy: false,
    },
    (context) => {
      const values = depreciationArguments(context, 4);
      if (isFormulaError(values)) return values;
      const [cost, salvage, life, period] = values;
      if (life === 0) return formulaError("DIV0");
      if (period! < 1 || period! > life!) return formulaError("NUM");
      return ((cost! - salvage!) * (life! - period! + 1) * 2) / (life! * (life! + 1));
    },
  ),
  defineFunction(
    {
      name: "DDB",
      category: "Financial",
      minArgs: 4,
      maxArgs: 5,
      arguments: [
        { name: "cost" },
        { name: "salvage" },
        { name: "life" },
        { name: "period" },
        { name: "factor", optional: true },
      ],
      lazy: false,
    },
    (context) => {
      const values = depreciationArguments(context, 4);
      const factor = context.argumentCount === 4 ? 2 : number(context, 4);
      if (isFormulaError(values) || isFormulaError(factor))
        return isFormulaError(values) ? values : factor;
      const [cost, salvage, life, period] = values;
      if (life === 0) return formulaError("DIV0");
      if (period! < 1 || factor <= 0) return formulaError("NUM");
      let book = cost!;
      let depreciation = 0;
      for (let current = 1; current <= Math.ceil(period!); current += 1) {
        depreciation = Math.min((book * factor) / life!, book - salvage!);
        if (current === Math.ceil(period!) && period! % 1 !== 0)
          depreciation *= period! - Math.floor(period!);
        book -= depreciation;
      }
      return Math.max(0, depreciation);
    },
  ),
  defineFunction(
    {
      name: "RATE",
      category: "Financial",
      minArgs: 3,
      maxArgs: 6,
      arguments: [
        { name: "nper" },
        { name: "pmt" },
        { name: "pv" },
        { name: "fv", optional: true },
        { name: "type", optional: true },
        { name: "guess", optional: true },
      ],
      lazy: false,
    },
    (context) => {
      const required = argumentsFor(context, 3);
      const future = context.argumentCount > 3 ? number(context, 3) : 0;
      const type = paymentType(context, 4);
      const guess = context.argumentCount > 5 ? number(context, 5) : 0.1;
      if (
        isFormulaError(required) ||
        isFormulaError(future) ||
        isFormulaError(type) ||
        isFormulaError(guess)
      )
        return isFormulaError(required)
          ? required
          : isFormulaError(future)
            ? future
            : isFormulaError(type)
              ? type
              : guess;
      return rate(required[0]!, required[1]!, required[2]!, future, type, guess);
    },
  ),
  defineFunction(
    {
      name: "IPMT",
      category: "Financial",
      minArgs: 4,
      maxArgs: 6,
      arguments: [
        { name: "rate" },
        { name: "per" },
        { name: "nper" },
        { name: "pv" },
        { name: "fv", optional: true },
        { name: "type", optional: true },
      ],
      lazy: false,
    },
    (context) => {
      const required = argumentsFor(context, 4);
      const future = context.argumentCount > 4 ? number(context, 4) : 0;
      const type = paymentType(context, 5);
      if (isFormulaError(required) || isFormulaError(future) || isFormulaError(type))
        return isFormulaError(required) ? required : isFormulaError(future) ? future : type;
      const [rateValue, period, periods, present] = required;
      const payment = paymentParts(rateValue!, period!, periods!, present!, future, type);
      if (isFormulaError(payment)) return payment;
      if (typeof payment !== "number") return formulaError("NUM");
      if (period === 1 && type === 1) return 0;
      const previous = period! - 1;
      const balance =
        rateValue === 0
          ? present! + payment * previous
          : present! * (1 + rateValue!) ** previous +
            payment * (1 + rateValue! * type) * (((1 + rateValue!) ** previous - 1) / rateValue!);
      return Number.isFinite(balance) ? -balance * rateValue! : formulaError("NUM");
    },
  ),
  defineFunction(
    {
      name: "PPMT",
      category: "Financial",
      minArgs: 4,
      maxArgs: 6,
      arguments: [
        { name: "rate" },
        { name: "per" },
        { name: "nper" },
        { name: "pv" },
        { name: "fv", optional: true },
        { name: "type", optional: true },
      ],
      lazy: false,
    },
    (context) => {
      const required = argumentsFor(context, 4);
      const future = context.argumentCount > 4 ? number(context, 4) : 0;
      const type = paymentType(context, 5);
      if (isFormulaError(required) || isFormulaError(future) || isFormulaError(type))
        return isFormulaError(required) ? required : isFormulaError(future) ? future : type;
      const [rateValue, period, periods, present] = required;
      const payment = paymentParts(rateValue!, period!, periods!, present!, future, type);
      if (isFormulaError(payment)) return payment;
      if (typeof payment !== "number") return formulaError("NUM");
      if (period === 1 && type === 1) return payment;
      const previous = period! - 1;
      const balance =
        rateValue === 0
          ? present! + payment * previous
          : present! * (1 + rateValue!) ** previous +
            payment * (1 + rateValue! * type) * (((1 + rateValue!) ** previous - 1) / rateValue!);
      return Number.isFinite(balance) ? payment + balance * rateValue! : formulaError("NUM");
    },
  ),
  defineFunction(
    {
      name: "IRR",
      category: "Financial",
      minArgs: 1,
      maxArgs: 2,
      arguments: [{ name: "values" }, { name: "guess", optional: true }],
      lazy: false,
    },
    (context) => {
      const cashflows = irrNumbers(context, 0);
      const guess = context.argumentCount === 1 ? 0.1 : number(context, 1);
      return isFormulaError(cashflows)
        ? cashflows
        : isFormulaError(guess)
          ? guess
          : irr(cashflows, guess);
    },
  ),
  defineFunction(
    {
      name: "MIRR",
      category: "Financial",
      minArgs: 3,
      maxArgs: 3,
      arguments: [{ name: "values" }, { name: "finance_rate" }, { name: "reinvest_rate" }],
      lazy: false,
    },
    (context) => {
      const cashflows = rangeNumbers(context, 0);
      const finance = number(context, 1);
      const reinvest = number(context, 2);
      if (isFormulaError(cashflows) || isFormulaError(finance) || isFormulaError(reinvest))
        return isFormulaError(cashflows) ? cashflows : isFormulaError(finance) ? finance : reinvest;
      if (cashflows.length < 2 || finance <= -1 || reinvest <= -1) return formulaError("NUM");
      let positive = 0,
        negative = 0;
      for (let index = 0; index < cashflows.length; index += 1) {
        const value = cashflows[index]!;
        if (value > 0) positive += value * (1 + reinvest) ** (cashflows.length - index - 1);
        if (value < 0) negative += value / (1 + finance) ** index;
      }
      return positive === 0 || negative === 0
        ? formulaError("DIV0")
        : (positive / -negative) ** (1 / (cashflows.length - 1)) - 1;
    },
  ),
  defineFunction(
    {
      name: "PV",
      category: "Financial",
      minArgs: 3,
      maxArgs: 5,
      arguments: [
        { name: "rate" },
        { name: "nper" },
        { name: "pmt" },
        { name: "fv", optional: true },
        { name: "type", optional: true },
      ],
      lazy: false,
    },
    (context) => {
      const values = argumentsFor(context, 3);
      if (isFormulaError(values)) return values;
      const future = context.argumentCount > 3 ? number(context, 3) : 0;
      const type = paymentType(context, 4);
      return isFormulaError(future)
        ? future
        : isFormulaError(type)
          ? type
          : pv(values[0]!, values[1]!, values[2]!, future, type);
    },
  ),
  defineFunction(
    {
      name: "PMT",
      category: "Financial",
      minArgs: 3,
      maxArgs: 5,
      arguments: [
        { name: "rate" },
        { name: "nper" },
        { name: "pv" },
        { name: "fv", optional: true },
        { name: "type", optional: true },
      ],
      lazy: false,
    },
    (context) => {
      const values = argumentsFor(context, 3);
      if (isFormulaError(values)) return values;
      const future = context.argumentCount > 3 ? number(context, 3) : 0;
      const type = paymentType(context, 4);
      return isFormulaError(future)
        ? future
        : isFormulaError(type)
          ? type
          : pmt(values[0]!, values[1]!, values[2]!, future, type);
    },
  ),
  defineFunction(
    {
      name: "NPER",
      category: "Financial",
      minArgs: 3,
      maxArgs: 5,
      arguments: [
        { name: "rate" },
        { name: "pmt" },
        { name: "pv" },
        { name: "fv", optional: true },
        { name: "type", optional: true },
      ],
      lazy: false,
    },
    (context) => {
      const values = argumentsFor(context, 3);
      if (isFormulaError(values)) return values;
      const future = context.argumentCount > 3 ? number(context, 3) : 0;
      const type = paymentType(context, 4);
      return isFormulaError(future)
        ? future
        : isFormulaError(type)
          ? type
          : nper(values[0]!, values[1]!, values[2]!, future, type);
    },
  ),
] as const satisfies readonly FormulaFunctionDefinition[];
