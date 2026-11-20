import { randomUUID } from "node:crypto";
import { readFile, rename, rm, writeFile } from "node:fs/promises";
import { categories, type Category } from "./categories.js";

export type RuleCategory = Exclude<Category, "Review">;

export type CategoryRule = {
  category: RuleCategory;
  keywords: string[];
};

const ruleCategories = categories.filter(
  (category): category is RuleCategory => category !== "Review",
);

export class InvalidCategoryRulesError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidCategoryRulesError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function validateCategoryRules(value: unknown): CategoryRule[] {
  if (!Array.isArray(value) || value.length !== ruleCategories.length) {
    throw new InvalidCategoryRulesError(
      "Rules must include each existing category exactly once.",
    );
  }

  const seenCategories = new Set<RuleCategory>();
  const rules = value.map((entry): CategoryRule => {
    if (!isRecord(entry) || typeof entry.category !== "string") {
      throw new InvalidCategoryRulesError("Each rule needs a category.");
    }

    const category = ruleCategories.find(
      (allowedCategory) => allowedCategory === entry.category,
    );
    if (!category || seenCategories.has(category)) {
      throw new InvalidCategoryRulesError(
        "Rules contain an unknown or duplicate category.",
      );
    }
    seenCategories.add(category);

    if (!Array.isArray(entry.keywords) || entry.keywords.length > 200) {
      throw new InvalidCategoryRulesError(
        `Keywords for ${category} must be a list of at most 200 terms.`,
      );
    }

    const seenKeywords = new Set<string>();
    const keywords = entry.keywords.map((value): string => {
      if (typeof value !== "string") {
        throw new InvalidCategoryRulesError(
          `Keywords for ${category} must be text.`,
        );
      }

      const keyword = value.trim();
      if (!keyword || keyword.length > 120) {
        throw new InvalidCategoryRulesError(
          `Keywords for ${category} must be 1 to 120 characters.`,
        );
      }

      const normalizedKeyword = keyword.toLowerCase();
      if (seenKeywords.has(normalizedKeyword)) {
        throw new InvalidCategoryRulesError(
          `Keywords for ${category} cannot contain duplicates.`,
        );
      }
      seenKeywords.add(normalizedKeyword);
      return keyword;
    });

    return { category, keywords };
  });

  if (seenCategories.size !== ruleCategories.length) {
    throw new InvalidCategoryRulesError(
      "Rules must include each existing category exactly once.",
    );
  }

  return rules;
}

export async function loadCategoryRules(
  filePath: string,
): Promise<CategoryRule[]> {
  const parsed: unknown = JSON.parse(await readFile(filePath, "utf8"));
  return validateCategoryRules(parsed);
}

export async function saveCategoryRules(
  filePath: string,
  value: unknown,
): Promise<CategoryRule[]> {
  const rules = validateCategoryRules(value);
  const temporaryPath = `${filePath}.${randomUUID()}.tmp`;

  try {
    await writeFile(temporaryPath, `${JSON.stringify(rules, null, 2)}\n`, {
      encoding: "utf8",
      flag: "wx",
      mode: 0o600,
    });
    await rename(temporaryPath, filePath);
  } finally {
    await rm(temporaryPath, { force: true });
  }

  return rules;
}

export function categorizeDescription(
  description: string,
  rules: readonly CategoryRule[],
): Category {
  const normalizedDescription = description.toLowerCase();
  return (
    rules.find((rule) =>
      rule.keywords.some((keyword) =>
        normalizedDescription.includes(keyword.toLowerCase()),
      ),
    )?.category ?? "Review"
  );
}
