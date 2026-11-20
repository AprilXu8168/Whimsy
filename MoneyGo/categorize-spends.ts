import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Category } from "./categories.js";
import {
  categorizeDescription,
  loadCategoryRules,
} from "./category-rules.js";
import { loadCategoryOverrides } from "./category-overrides.js";
import {
  matchInternalTransfers,
  readStatements,
} from "./statement-data.js";
import { transactionId } from "./transaction-id.js";

type Expense = {
  date: string;
  description: string;
  amount: string;
  category: Category;
};

const scriptDirectory = fileURLToPath(new URL(".", import.meta.url));
const statementsDirectory = join(scriptDirectory, "statements");
const outputPath = join(scriptDirectory, "spending_log.csv");
const categoryOverrides = await loadCategoryOverrides(
  join(scriptDirectory, "category-overrides.json"),
);
const categoryRules = await loadCategoryRules(
  join(scriptDirectory, "category-rules.json"),
);

function toCsvField(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}

const statementData = await readStatements(
  statementsDirectory,
  process.argv.slice(2),
);
console.log(
  `[1/4] Loaded ${statementData.transactions.length} transactions across ${statementData.accounts.length} accounts.`,
);
const matchedTransfers = matchInternalTransfers(statementData.transactions);
const transferTransactionCount = statementData.transactions.filter(
  (transaction) => /\btransfer\b/i.test(transaction.description),
).length;
const matchedTransferCents = matchedTransfers.reduce(
  (total, transfer) => total + transfer.amountCents,
  0,
);
const unmatchedTransferCount =
  transferTransactionCount - matchedTransfers.length * 2;
console.log(
  `[2/4] Matched ${matchedTransfers.length} transfers across accounts by same date and equal/opposite amount, totaling $${(matchedTransferCents / 100).toFixed(2)} (counted once).`,
);
for (const transfer of matchedTransfers) {
  console.log(
    `  ${transfer.date}: ${transfer.fromAccount} -> ${transfer.toAccount}: $${(transfer.amountCents / 100).toFixed(2)}`,
  );
}
if (unmatchedTransferCount > 0) {
  console.log(
    `  ${unmatchedTransferCount} transfer row(s) were unpaired; unmatched card debits remain eligible for spending.`,
  );
}

const expenses: Expense[] = [];
const totals = new Map<string, number>();
const duplicateCounts = new Map<string, number>();
let totalSpendCents = 0;

for (const transaction of statementData.transactions) {
  const duplicateKey = JSON.stringify([
    transaction.account,
    transaction.sourceDate,
    transaction.amountCents,
    transaction.description,
  ]);
  const duplicateIndex = duplicateCounts.get(duplicateKey) ?? 0;
  duplicateCounts.set(duplicateKey, duplicateIndex + 1);
  const id = transactionId(
    transaction.sourceDate,
    transaction.amountCents,
    transaction.description,
    duplicateIndex,
  );

  if (!transaction.isSpend) {
    continue;
  }

  const category =
    categoryOverrides[id] ??
    categorizeDescription(transaction.description, categoryRules);
  expenses.push({
    date: transaction.sourceDate,
    description: transaction.description,
    amount: `-${(Math.abs(transaction.amountCents) / 100).toFixed(2)}`,
    category,
  });
  totals.set(
    category,
    (totals.get(category) ?? 0) + Math.abs(transaction.amountCents),
  );
  totalSpendCents += Math.abs(transaction.amountCents);
}

const output = [
  ["date", "description", "amount", "category"].map(toCsvField).join(","),
  ...[...expenses].reverse().map((expense) =>
    [expense.date, expense.description, expense.amount, expense.category]
      .map(toCsvField)
      .join(","),
  ),
].join("\n");

await writeFile(outputPath, `${output}\n`, "utf8");

const combinedBalanceCents = statementData.accounts.reduce(
  (total, account) => total + account.balanceCents,
  0,
);
console.log(
  `[3/4] Counted ${expenses.length} eligible card expenses; transfers and debits from other accounts are excluded.`,
);
console.log("[4/4] Wrote spending_log.csv.");
console.log(`Total card spend: $${(totalSpendCents / 100).toFixed(2)}`);
for (const [category, totalCents] of [...totals].sort(([a], [b]) =>
  a.localeCompare(b),
)) {
  console.log(`${category}: $${(totalCents / 100).toFixed(2)}`);
}
for (const account of statementData.accounts) {
  console.log(
    `  ${account.name} ending balance: $${(account.balanceCents / 100).toFixed(2)}`,
  );
}
console.log(`Combined balance: $${(combinedBalanceCents / 100).toFixed(2)}`);
