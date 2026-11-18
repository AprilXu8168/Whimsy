import assert from "node:assert/strict";
import { test } from "node:test";
import { getPeriods, periodKeyForMonth } from "./periods.js";

test("groups quarters using Australian financial-year boundaries", () => {
  assert.equal(periodKeyForMonth("2026-09", "quarterly"), "2026-Q1");
  assert.equal(periodKeyForMonth("2026-10", "quarterly"), "2026-Q2");
  assert.equal(periodKeyForMonth("2027-01", "quarterly"), "2026-Q3");
  assert.equal(periodKeyForMonth("2027-04", "quarterly"), "2026-Q4");
});

test("builds the correct date ranges and monthly buckets for FY and calendar periods", () => {
  const [financialYear] = getPeriods(["2026-10"], "financial-year");
  assert.equal(financialYear.label, "FY 2026-27");
  assert.equal(financialYear.startDate, "2026-07-01");
  assert.equal(financialYear.endDate, "2027-07-01");
  assert.deepEqual(financialYear.bucketMonths, [
    "2026-07",
    "2026-08",
    "2026-09",
    "2026-10",
    "2026-11",
    "2026-12",
    "2027-01",
    "2027-02",
    "2027-03",
    "2027-04",
    "2027-05",
    "2027-06",
  ]);

  const [quarter] = getPeriods(["2026-10"], "quarterly");
  assert.equal(quarter.label, "Q2 FY 2026-27");
  assert.equal(quarter.startDate, "2026-10-01");
  assert.equal(quarter.endDate, "2027-01-01");
});
