import { readdir, readFile, stat } from "node:fs/promises";
import { basename, extname, join, relative, resolve } from "node:path";
import { parse } from "csv-parse/sync";

export type StatementTransaction = {
  account: string;
  accountName: string;
  accountNewestFirst: boolean;
  accountSequence: number;
  sourceDate: string;
  date: string;
  amountCents: number;
  balanceCents: number;
  description: string;
  isSpend: boolean;
  isIncome: boolean;
};

export type StatementAccount = {
  id: string;
  name: string;
  balanceCents: number;
};

export type StatementData = {
  accounts: StatementAccount[];
  transactions: StatementTransaction[];
};

type ParsedStatementTransaction = StatementTransaction & {
  statementFile: string;
  sourceSequence: number;
};

export type InternalTransfer = {
  date: string;
  amountCents: number;
  fromAccount: string;
  toAccount: string;
};

type TransferPair = {
  outflow: StatementTransaction;
  inflow: StatementTransaction;
};

const headerAliases = {
  date: ["date", "transaction date"],
  amount: ["amount", "transaction amount"],
  description: ["description", "transaction description", "details"],
  balance: ["balance", "closing balance"],
};

function normalizeHeader(value: string): string {
  return value.trim().toLowerCase().replace(/[_-]+/g, " ");
}

function getColumnIndexes(firstRow: string[], fileName: string): {
  date: number;
  amount: number;
  description: number;
  balance: number;
  firstDataRow: number;
} {
  const normalizedHeaders = firstRow.map(normalizeHeader);
  const headerIndexes = {
    date: normalizedHeaders.findIndex((value) =>
      headerAliases.date.includes(value),
    ),
    amount: normalizedHeaders.findIndex((value) =>
      headerAliases.amount.includes(value),
    ),
    description: normalizedHeaders.findIndex((value) =>
      headerAliases.description.includes(value),
    ),
    balance: normalizedHeaders.findIndex((value) =>
      headerAliases.balance.includes(value),
    ),
  };
  const hasHeader = Object.values(headerIndexes).some((index) => index >= 0);

  if (hasHeader) {
    if (Object.values(headerIndexes).some((index) => index < 0)) {
      throw new Error(
        `CSV header in ${fileName} must include date, amount, description, and balance columns.`,
      );
    }

    return { ...headerIndexes, firstDataRow: 1 };
  }

  return { date: 0, amount: 1, description: 2, balance: 3, firstDataRow: 0 };
}

function parseDate(value: string, fileName: string, lineNumber: number): string {
  const auDate = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(value.trim());
  const isoDate = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  const year = Number(auDate?.[3] ?? isoDate?.[1]);
  const month = Number(auDate?.[2] ?? isoDate?.[2]);
  const day = Number(auDate?.[1] ?? isoDate?.[3]);
  const parsed = new Date(Date.UTC(year, month - 1, day));

  if (
    (!auDate && !isoDate) ||
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    throw new Error(`Invalid date in ${fileName} on CSV line ${lineNumber}.`);
  }

  return `${year.toString().padStart(4, "0")}-${month
    .toString()
    .padStart(2, "0")}-${day.toString().padStart(2, "0")}`;
}

function parseCents(value: string, fileName: string, lineNumber: number): number {
  const cleaned = value.replace(/[$,\s]/g, "");
  const match = /^([+-]?)(\d+)(?:\.(\d{1,2}))?$/.exec(cleaned);

  if (!match) {
    throw new Error(
      `Invalid amount or balance in ${fileName} on CSV line ${lineNumber}.`,
    );
  }

  const cents = Number(match[2]) * 100 + Number((match[3] ?? "").padEnd(2, "0"));
  if (!Number.isSafeInteger(cents)) {
    throw new Error(
      `Amount or balance is too large in ${fileName} on CSV line ${lineNumber}.`,
    );
  }

  return match[1] === "-" ? -cents : cents;
}

async function findCsvFiles(path: string): Promise<string[]> {
  const pathInfo = await stat(path);
  if (pathInfo.isFile()) {
    if (extname(path).toLowerCase() !== ".csv") {
      throw new Error(`Statement file must be a CSV: ${path}`);
    }
    return [path];
  }

  if (!pathInfo.isDirectory()) {
    throw new Error(`Statement path is not a file or directory: ${path}`);
  }

  const entries = await readdir(path, { withFileTypes: true });
  const nestedFiles = await Promise.all(
    entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => findCsvFiles(join(path, entry.name))),
  );
  const csvFiles = entries
    .filter(
      (entry) => entry.isFile() && extname(entry.name).toLowerCase() === ".csv",
    )
    .map((entry) => join(path, entry.name));

  return [...csvFiles, ...nestedFiles.flat()];
}

function findMatchedTransferPairs(
  transactions: readonly StatementTransaction[],
): TransferPair[] {
  const transferGroups = new Map<
    string,
    { outflows: StatementTransaction[]; inflows: StatementTransaction[] }
  >();

  for (const transaction of transactions) {
    if (
      !/\btransfer\b/i.test(transaction.description) ||
      transaction.amountCents === 0
    ) {
      continue;
    }

    const key = `${transaction.date}:${Math.abs(transaction.amountCents)}`;
    const group = transferGroups.get(key) ?? {
      outflows: [],
      inflows: [],
    };
    if (transaction.amountCents < 0) {
      group.outflows.push(transaction);
    } else {
      group.inflows.push(transaction);
    }
    transferGroups.set(key, group);
  }

  const matches: TransferPair[] = [];
  for (const { outflows, inflows } of transferGroups.values()) {
    const usedInflows = new Set<number>();
    for (const outflow of outflows) {
      const inflowIndex = inflows.findIndex(
        (inflow, index) =>
          !usedInflows.has(index) &&
          inflow.account !== outflow.account &&
          ((outflow.accountName.toLowerCase() === "card" &&
            inflow.accountName.toLowerCase() === "savings") ||
            (outflow.accountName.toLowerCase() === "savings" &&
              inflow.accountName.toLowerCase() === "card")),
      );
      if (inflowIndex < 0) continue;

      const inflow = inflows[inflowIndex];
      usedInflows.add(inflowIndex);
      matches.push({ outflow, inflow });
    }
  }

  return matches.sort((a, b) =>
    a.outflow.date.localeCompare(b.outflow.date),
  );
}

export function matchInternalTransfers(
  transactions: readonly StatementTransaction[],
): InternalTransfer[] {
  return findMatchedTransferPairs(transactions).map(({ outflow, inflow }) => ({
    date: outflow.date,
    amountCents: Math.abs(outflow.amountCents),
    fromAccount: outflow.accountName,
    toAccount: inflow.accountName,
  }));
}

export async function readStatements(
  statementDirectory: string,
  inputPaths: string[] = [],
): Promise<StatementData> {
  const searchPaths =
    inputPaths.length > 0
      ? inputPaths.map((path) => resolve(path))
      : [resolve(statementDirectory)];
  const files = (
    await Promise.all(searchPaths.map((path) => findCsvFiles(path)))
  )
    .flat()
    .sort();
  const uniqueFiles = [...new Set(files)];

  if (uniqueFiles.length === 0) {
    throw new Error(`No CSV statement files found in ${statementDirectory}.`);
  }

  const accountLatestTransactions = new Map<
    string,
    { date: string; balanceCents: number; name: string }
  >();
  const transactions: ParsedStatementTransaction[] = [];

  for (const filePath of uniqueFiles) {
    const fileName = basename(filePath);
    const rows = parse(await readFile(filePath), {
      bom: true,
      skip_empty_lines: true,
    }) as string[][];

    if (rows.length === 0) {
      throw new Error(`The statement CSV is empty: ${fileName}`);
    }

    const columns = getColumnIndexes(rows[0], fileName);
    const accountStem = fileName
      .replace(/\.csv$/i, "")
      .replace(/[_-]\d+$/, "");
    const accountFolder = relative(statementDirectory, filePath)
      .split("\\")
      .slice(0, -1)
      .join("/");
    const accountId = [accountFolder, accountStem]
      .filter(Boolean)
      .join("/");
    const parsedRows: Omit<
      StatementTransaction,
      | "account"
      | "accountName"
      | "accountNewestFirst"
      | "isSpend"
      | "isIncome"
    >[] = [];

    for (let index = columns.firstDataRow; index < rows.length; index += 1) {
      const row = rows[index];
      const lineNumber = index + 1;
      const sourceDate = row[columns.date]?.trim() ?? "";
      const amountText = row[columns.amount]?.trim() ?? "";
      const description = row[columns.description]?.trim() ?? "";
      const balanceText = row[columns.balance]?.trim() ?? "";

      if (!sourceDate || !amountText || !description || !balanceText) {
        throw new Error(
          `Date, amount, description, and balance are required in ${fileName} on CSV line ${lineNumber}.`,
        );
      }

      parsedRows.push({
        accountSequence: index - columns.firstDataRow,
        sourceDate,
        date: parseDate(sourceDate, fileName, lineNumber),
        amountCents: parseCents(amountText, fileName, lineNumber),
        description,
        balanceCents: parseCents(balanceText, fileName, lineNumber),
      });
    }

    if (parsedRows.length === 0) {
      throw new Error(`The statement CSV contains no transactions: ${fileName}`);
    }

    const accountNewestFirst =
      parsedRows[0].date >= parsedRows[parsedRows.length - 1].date;
    const latestTransaction = accountNewestFirst
      ? parsedRows[0]
      : parsedRows[parsedRows.length - 1];
    const previousLatest = accountLatestTransactions.get(accountId);
    if (!previousLatest || latestTransaction.date >= previousLatest.date) {
      accountLatestTransactions.set(accountId, {
        date: latestTransaction.date,
        balanceCents: latestTransaction.balanceCents,
        name: accountStem,
      });
    }

    for (const transaction of parsedRows) {
      const isCardAccount = accountStem.toLowerCase() === "card";
      transactions.push({
        ...transaction,
        account: accountId,
        accountName: accountStem,
        accountNewestFirst,
        statementFile: filePath,
        sourceSequence: transaction.accountSequence,
        isSpend: isCardAccount && transaction.amountCents < 0,
        isIncome: transaction.amountCents > 0,
      });
    }
  }

  const transactionsByAccount = new Map<string, ParsedStatementTransaction[]>();
  for (const transaction of transactions) {
    const accountTransactions =
      transactionsByAccount.get(transaction.account) ?? [];
    accountTransactions.push(transaction);
    transactionsByAccount.set(transaction.account, accountTransactions);
  }

  for (const accountTransactions of transactionsByAccount.values()) {
    accountTransactions.sort((a, b) => {
      const dateOrder = a.date.localeCompare(b.date);
      if (dateOrder !== 0) return dateOrder;
      const fileOrder = a.statementFile.localeCompare(b.statementFile);
      if (fileOrder !== 0) return fileOrder;
      return a.accountNewestFirst
        ? b.sourceSequence - a.sourceSequence
        : a.sourceSequence - b.sourceSequence;
    });
    accountTransactions.forEach((transaction, sequence) => {
      transaction.accountSequence = sequence;
      transaction.accountNewestFirst = false;
    });
  }

  transactions.sort((a, b) => {
    const dateOrder = a.date.localeCompare(b.date);
    if (dateOrder !== 0) return dateOrder;
    if (a.account !== b.account) return a.account.localeCompare(b.account);
    return a.accountSequence - b.accountSequence;
  });

  for (const { outflow, inflow } of findMatchedTransferPairs(transactions)) {
    outflow.isSpend = false;
    outflow.isIncome = false;
    inflow.isSpend = false;
    inflow.isIncome = false;
  }

  const publicTransactions: StatementTransaction[] = transactions.map(
    ({
      statementFile: _statementFile,
      sourceSequence: _sourceSequence,
      ...transaction
    }) => transaction,
  );
  const accounts: StatementAccount[] = [...accountLatestTransactions].map(
    ([id, account]) => ({
      id,
      name: account.name,
      balanceCents: account.balanceCents,
    }),
  );
  return { accounts, transactions: publicTransactions };
}
