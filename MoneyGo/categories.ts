export const categoryRules = [
  {
    category: "Groceries",
    keywords: ["BUNNINGS", "COLES", "SUPERMA"],
  },
  {
    category: "Debt",
    keywords: ["ETHOS", "apx nab", "PLINEPH"],
  },
  {
    category: "Dining",
    keywords: [
      "McDonalds",
      "Dominos",
      "TASTY KITCHEN",
      "uber eats",
      "uber *eats",
    ],
  },
  {
    category: "Insurance",
    keywords: ["AAMI", "MEDIBANK", "ALLIANZ"],
  },
  {
    category: "Transport",
    keywords: ["7 ELEVEN", "G-Force"],
  },
  {
    category: "Bills",
    keywords: ["Optus", "UNITYWATER", "ENERGY"],
  },
  {
    category: "Entertainment",
    keywords: ["AMAZON", "Apple", "PET CIRCLE"],
  },
] as const;

export const categories = [
  ...categoryRules.map((rule) => rule.category),
  "Review",
] as const;

export type Category = (typeof categories)[number];

export function isCategory(value: unknown): value is Category {
  return (
    typeof value === "string" &&
    categories.some((category) => category === value)
  );
}

export function categorizeDescription(description: string): Category {
  const normalized = description.toLowerCase();
  return (
    categoryRules.find((rule) =>
      rule.keywords.some((keyword) =>
        normalized.includes(keyword.toLowerCase()),
      ),
    )?.category ?? "Review"
  );
}
