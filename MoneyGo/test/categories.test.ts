import assert from "node:assert/strict";
import { test } from "node:test";
import { categorizeDescription } from "../categories.js";

test("category matching ignores merchant keyword capitalization", () => {
  assert.equal(
    categorizeDescription("BUNNINGS NORTH LAKES Card xx2349"),
    "Groceries",
  );
  assert.equal(
    categorizeDescription("Apple APPLE.COM/BILL"),
    "Entertainment",
  );
  assert.equal(
    categorizeDescription("Direct Debit AAMI INSURANCE"),
    "Insurance",
  );
});

test("matches the Uber Eats descriptor used in CommBank statements", () => {
  assert.equal(categorizeDescription("UBER *EATS HELP.UBER.C"), "Dining");
});
