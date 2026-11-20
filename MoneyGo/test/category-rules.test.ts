import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import {
  categorizeDescription,
  loadCategoryRules,
  saveCategoryRules,
  validateCategoryRules,
} from "../category-rules.js";

const defaultRulesPath = fileURLToPath(
  new URL("../category-rules.json", import.meta.url),
);

test("saves editable rules and uses the updated rules for categorization", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "moneygo-category-rules-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const filePath = join(directory, "category-rules.json");
  const rules = await loadCategoryRules(defaultRulesPath);
  const updatedRules = rules.map((rule) =>
    rule.category === "Groceries"
      ? { ...rule, keywords: ["MY LOCAL SHOP"] }
      : rule,
  );

  await saveCategoryRules(filePath, updatedRules);

  const loadedRules = await loadCategoryRules(filePath);
  assert.deepEqual(loadedRules, updatedRules);
  assert.equal(
    categorizeDescription("my local shop north", loadedRules),
    "Groceries",
  );
});

test("keeps the first matching category as the priority", async () => {
  const rules = await loadCategoryRules(defaultRulesPath);
  const overlappingRules = rules.map((rule) =>
    rule.category === "Groceries" || rule.category === "House"
      ? { ...rule, keywords: [...rule.keywords, "SHARED MERCHANT"] }
      : rule,
  );

  assert.equal(
    categorizeDescription("Shared merchant purchase", overlappingRules),
    "Groceries",
  );
});

test("rejects incomplete or duplicate category rules", async () => {
  const rules = await loadCategoryRules(defaultRulesPath);
  assert.throws(
    () => validateCategoryRules(rules.slice(1)),
    /each existing category/,
  );
  assert.throws(
    () =>
      validateCategoryRules(
        rules.map((rule) =>
          rule.category === "House"
            ? { ...rule, category: "Groceries" }
            : rule,
        ),
      ),
    /unknown or duplicate category/,
  );
});

test("rejects duplicate keywords without changing saved rules", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "moneygo-category-rules-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const filePath = join(directory, "category-rules.json");
  const rules = await loadCategoryRules(defaultRulesPath);
  const invalidRules = rules.map((rule) =>
    rule.category === "Dining"
      ? { ...rule, keywords: ["Same term", "same TERM"] }
      : rule,
  );

  await assert.rejects(saveCategoryRules(filePath, invalidRules), /duplicates/);
});
