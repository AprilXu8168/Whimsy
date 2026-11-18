export const categoryRules = [
  {
    category: "Groceries",
    keywords: ["BUNNINGS", "COLES", "SUPERMA", "TARGET"],
  },
  {
    category: "House",
    keywords: ["apx nab", "House", "RATE"],
  },
  {
    category: "Dining",
    keywords: ["McDonalds", "Dominos", "TASTY KITCHEN", "uber eats", "uber *eats",],
  },
  {
    category: "Wellness",
    keywords: ["DENTAL", "ICEWORLD", "ICE SKATING", "PLINEPH", "DR JAMES BARTON", "ETHOS"],
  },
  {
    category: "OutOfPlan",
    keywords: ["Debit Excess", "Overdraw Fee"],
  },
  {
    category: "Insurance",
    keywords: ["AAMI", "MEDIBANK", "ALLIANZ"],
  },
  {
    category: "Transport",
    keywords: ["7 ELEVEN", "G-Force", "TRANSLINK", "REGO"],
  },
  {
    category: "Bills",
    keywords: ["Optus", "UNITYWATER", "ENERGY"],
  },
  {
    category: "Entertainment",
    keywords: ["AMAZON", "Apple", "PET CIRCLE", "SHEIN", "TEMU", "Daiso"],
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
