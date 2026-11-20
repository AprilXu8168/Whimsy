export const categories = [
  "Groceries",
  "House",
  "Dining",
  "Wellness",
  "OutOfPlan",
  "Insurance",
  "Transport",
  "Bills",
  "Entertainment",
  "Review",
] as const;

export type Category = (typeof categories)[number];

export function isCategory(value: unknown): value is Category {
  return (
    typeof value === "string" &&
    categories.some((category) => category === value)
  );
}
