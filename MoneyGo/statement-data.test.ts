import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, test } from "node:test";
import {
  matchInternalTransfers,
  readStatements,
} from "./statement-data.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  );
});

test("loads all statement CSVs, counts card purchases, and sums account balances", async () => {
  const root = await mkdtemp(join(tmpdir(), "moneygo-statements-"));
  temporaryDirectories.push(root);
  const statementsDirectory = join(root, "statements");
  const nestedDirectory = join(statementsDirectory, "savings");
  await mkdir(nestedDirectory, { recursive: true });

  await writeFile(
    join(statementsDirectory, "card.csv"),
    [
      '03/01/2026,"-10.00","Coffee shop Card xx2349","90.00"',
      '02/01/2026,"-20.00","Transfer to savings","100.00"',
      '01/01/2026,"+120.00","Salary","120.00"',
    ].join("\n"),
  );
  await writeFile(
    join(statementsDirectory, "card_1.csv"),
    '31/12/2025,"-5.00","Older coffee Card xx2349","95.00"',
  );
  await writeFile(
    join(nestedDirectory, "savings.csv"),
    [
      '02/01/2026,"+20.00","Transfer from card","120.00"',
      '02/01/2026,"-20.00","Groceries","100.00"',
      '01/01/2026,"+120.00","Deposit","120.00"',
    ].join("\n"),
  );

  const statements = await readStatements(statementsDirectory);
  const combinedBalanceCents = statements.accounts.reduce(
    (total, account) => total + account.balanceCents,
    0,
  );
  const spendingTransactions = statements.transactions.filter(
    (transaction) => transaction.isSpend,
  );
  const incomeTransactions = statements.transactions.filter(
    (transaction) => transaction.isIncome,
  );
  const transfers = matchInternalTransfers(statements.transactions);

  assert.equal(statements.accounts.length, 2);
  assert.equal(statements.accounts.find((account) => account.id === "card")?.balanceCents, 9_000);
  assert.equal(combinedBalanceCents, 21_000);
  assert.deepEqual(
    incomeTransactions.map((transaction) => transaction.description),
    ["Salary", "Deposit"],
  );
  assert.deepEqual(
    spendingTransactions.map((transaction) => [
      transaction.accountName,
      transaction.description,
      transaction.amountCents,
    ]),
    [
      ["card", "Older coffee Card xx2349", -500],
      ["card", "Coffee shop Card xx2349", -1_000],
    ],
  );
  assert.deepEqual(
    transfers.map((transfer) => [
      transfer.date,
      transfer.amountCents,
      transfer.fromAccount,
      transfer.toAccount,
    ]),
    [["2026-01-02", 2_000, "card", "savings"]],
  );
});

test("excludes matched card-savings transfers but counts unmatched card transfers", async () => {
  const root = await mkdtemp(join(tmpdir(), "moneygo-transfers-"));
  temporaryDirectories.push(root);
  const statementsDirectory = join(root, "statements");
  await mkdir(statementsDirectory, { recursive: true });

  await writeFile(
    join(statementsDirectory, "card.csv"),
    [
      '19/06/2026,"-2505.00","Transfer To Apx CommBank App House","+1537.09"',
      '18/06/2026,"-50.00","Transfer to savings","4042.09"',
    ].join("\n"),
  );
  await writeFile(
    join(statementsDirectory, "savings.csv"),
    '18/06/2026,"+50.00","Transfer from card","50.00"',
  );

  const statements = await readStatements(statementsDirectory);
  const cardTransactions = statements.transactions.filter(
    (transaction) => transaction.accountName === "card",
  );

  assert.deepEqual(
    cardTransactions.map((transaction) => [
      transaction.description,
      transaction.isSpend,
    ]),
    [
      ["Transfer to savings", false],
      ["Transfer To Apx CommBank App House", true],
    ],
  );
  assert.equal(
    statements.transactions.find(
      (transaction) => transaction.accountName === "savings",
    )?.isIncome,
    false,
  );
});
