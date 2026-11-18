import { createHash } from "node:crypto";

export function transactionId(
  date: string,
  amountCents: number,
  description: string,
  duplicateIndex: number,
): string {
  const key = JSON.stringify([
    date.trim(),
    amountCents,
    description.trim(),
    duplicateIndex,
  ]);
  return createHash("sha256").update(key).digest("hex");
}
