import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import {
  categorizeDescription,
  loadCategoryRules,
} from "../category-rules.js";

const categoryRules = await loadCategoryRules(
  fileURLToPath(new URL("../category-rules.json", import.meta.url)),
);

test("category matching ignores merchant keyword capitalization", () => {
  assert.equal(
    categorizeDescription("BUNNINGS NORTH LAKES Card xx2349", categoryRules),
    "Groceries",
  );
  assert.equal(
    categorizeDescription("Apple APPLE.COM/BILL", categoryRules),
    "Entertainment",
  );
  assert.equal(
    categorizeDescription("Direct Debit AAMI INSURANCE", categoryRules),
    "Insurance",
  );
});

test("matches the Uber Eats descriptor used in CommBank statements", () => {
  assert.equal(
    categorizeDescription("UBER *EATS HELP.UBER.C", categoryRules),
    "Dining",
  );
});
