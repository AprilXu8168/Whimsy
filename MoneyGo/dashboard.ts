import { watch } from "node:fs";
import { createServer } from "node:http";
import { readFile, rename, stat, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import {
  categories,
  isCategory,
  type Category,
} from "./categories.js";
import {
  categorizeDescription,
  InvalidCategoryRulesError,
  loadCategoryRules,
  saveCategoryRules,
  type CategoryRule,
} from "./category-rules.js";
import { loadCategoryOverrides } from "./category-overrides.js";
import {
  readStatements,
  type StatementData,
} from "./statement-data.js";
import {
  InvalidStatementUploadError,
  saveStatementUpload,
  type StatementAccountType,
} from "./statement-upload.js";
import { transactionId } from "./transaction-id.js";

type Transaction = {
  id: string;
  account: string;
  accountNewestFirst: boolean;
  accountSequence: number;
  date: string;
  amountCents: number;
  balanceCents: number;
  description: string;
  category: Category;
  isSpend: boolean;
  isIncome: boolean;
};

const scriptDirectory = fileURLToPath(new URL(".", import.meta.url));
const statementsDirectory = join(scriptDirectory, "statements");
const dashboardPath = join(scriptDirectory, "dashboard.html");
const settingsPath = join(scriptDirectory, "settings.html");
const categoryOverridesPath = join(
  scriptDirectory,
  "category-overrides.json",
);
const categoryRulesPath = join(scriptDirectory, "category-rules.json");
const temporaryOverridesPath = `${categoryOverridesPath}.tmp`;
const maximumStatementUploadBytes = 10 * 1024 * 1024;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function readJsonBody(
  request: AsyncIterable<Buffer | string>,
  maximumBytes = 4096,
): Promise<unknown> {
  const chunks: string[] = [];
  let length = 0;

  for await (const chunk of request) {
    const text = chunk.toString();
    length += Buffer.byteLength(text);
    if (length > maximumBytes) {
      throw new Error("Request body is too large.");
    }
    chunks.push(text);
  }

  return JSON.parse(chunks.join(""));
}

class UploadTooLargeError extends Error {}

async function readStatementUpload(
  request: AsyncIterable<Buffer | string>,
): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let length = 0;

  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    length += buffer.length;
    if (length > maximumStatementUploadBytes) {
      throw new UploadTooLargeError("Statement upload exceeds the 10 MB limit.");
    }
    chunks.push(buffer);
  }

  if (length === 0) {
    throw new Error("The uploaded statement is empty.");
  }
  return Buffer.concat(chunks, length);
}

function isSameOrigin(request: {
  headers: { origin?: string; host?: string };
}): boolean {
  const { origin, host } = request.headers;
  return !origin || (!!host && origin === `http://${host}`);
}

const inputPaths = process.argv.slice(2);
let statementData: StatementData;
let transactions: Transaction[] = [];
let transactionsById = new Map<string, Transaction>();
let categoryOverrides: Record<string, Category> = {};
let categoryRules: CategoryRule[] = [];
let dataVersion = 0;
let statementReloadError: string | null = null;

async function reloadDashboardData(): Promise<void> {
  const nextStatementData = await readStatements(statementsDirectory, inputPaths);
  const nextCategoryOverrides = await loadCategoryOverrides(
    categoryOverridesPath,
  );
  const duplicateCounts = new Map<string, number>();
  const nextTransactions: Transaction[] = nextStatementData.transactions.map(
    (statementTransaction) => {
      const transactionKey = JSON.stringify([
        statementTransaction.account,
        statementTransaction.sourceDate,
        statementTransaction.amountCents,
        statementTransaction.description,
      ]);
      const duplicateIndex = duplicateCounts.get(transactionKey) ?? 0;
      duplicateCounts.set(transactionKey, duplicateIndex + 1);
      const id = transactionId(
        statementTransaction.sourceDate,
        statementTransaction.amountCents,
        statementTransaction.description,
        duplicateIndex,
      );

      return {
        id,
        account: statementTransaction.account,
        accountNewestFirst: statementTransaction.accountNewestFirst,
        accountSequence: statementTransaction.accountSequence,
        date: statementTransaction.date,
        amountCents: statementTransaction.amountCents,
        balanceCents: statementTransaction.balanceCents,
        description: statementTransaction.description,
        category:
          nextCategoryOverrides[id] ??
          categorizeDescription(statementTransaction.description, categoryRules),
        isSpend: statementTransaction.isSpend,
        isIncome: statementTransaction.isIncome,
      };
    },
  );

  statementData = nextStatementData;
  transactions = nextTransactions;
  transactionsById = new Map(
    nextTransactions.map((transaction) => [transaction.id, transaction]),
  );
  categoryOverrides = nextCategoryOverrides;
  dataVersion += 1;
}

categoryRules = await loadCategoryRules(categoryRulesPath);
await reloadDashboardData();

let reloadTimer: ReturnType<typeof setTimeout> | undefined;
let reloadQueue: Promise<void> = Promise.resolve();

function scheduleDashboardReload(): void {
  if (reloadTimer) clearTimeout(reloadTimer);
  reloadTimer = setTimeout(() => {
    reloadTimer = undefined;
    reloadQueue = reloadQueue.then(async () => {
      try {
        await reloadDashboardData();
        statementReloadError = null;
        console.log("Reloaded dashboard data after a statement change.");
      } catch (error) {
        statementReloadError =
          error instanceof Error ? error.message : String(error);
        console.error("Could not reload changed statements:", error);
      }
    });
  }, 250);
}

const watchPaths = new Set<string>();
if (inputPaths.length === 0) {
  watchPaths.add(statementsDirectory);
} else {
  for (const inputPath of inputPaths) {
    const resolvedPath = resolve(inputPath);
    const pathInfo = await stat(resolvedPath);
    watchPaths.add(
      pathInfo.isDirectory() ? resolvedPath : dirname(resolvedPath),
    );
  }
}
const statementWatchers = [...watchPaths].map((path) => {
  const watcher = watch(path, { recursive: true }, () => {
    scheduleDashboardReload();
  });
  watcher.on("error", (error) => {
    statementReloadError = error.message;
    console.error(`Could not watch statement path "${path}":`, error);
  });
  return watcher;
});

let port = Number(process.env.PORT ?? 4173);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error("PORT must be a valid TCP port number.");
}
let categorySaveQueue: Promise<void> = Promise.resolve();
let categoryRulesSaveQueue: Promise<void> = Promise.resolve();
let statementUploadQueue: Promise<void> = Promise.resolve();

function queueStatementUpload(
  account: StatementAccountType,
  contents: Buffer,
): Promise<string> {
  const operation = statementUploadQueue.then(() =>
    saveStatementUpload(statementsDirectory, account, contents),
  );
  statementUploadQueue = operation.then(
    () => undefined,
    () => undefined,
  );
  return operation;
}

function queueCategoryRulesSave(value: unknown): Promise<CategoryRule[]> {
  const operation = categoryRulesSaveQueue.then(async () => {
    const rules = await saveCategoryRules(categoryRulesPath, value);
    categoryRules = rules;
    for (const transaction of transactions) {
      if (categoryOverrides[transaction.id] === undefined) {
        transaction.category = categorizeDescription(
          transaction.description,
          rules,
        );
      }
    }
    dataVersion += 1;
    return rules;
  });
  categoryRulesSaveQueue = operation.then(
    () => undefined,
    () => undefined,
  );
  return operation;
}

function saveCategoryOverride(
  transaction: Transaction,
  category: Category,
): Promise<void> {
  const operation = categorySaveQueue.then(async () => {
    const previous = categoryOverrides[transaction.id];
    categoryOverrides[transaction.id] = category;
    transaction.category = category;

    try {
      await writeFile(
        temporaryOverridesPath,
        JSON.stringify(categoryOverrides, null, 2),
        { encoding: "utf8", mode: 0o600 },
      );
      await rename(temporaryOverridesPath, categoryOverridesPath);
    } catch (error) {
      if (previous) {
        categoryOverrides[transaction.id] = previous;
        transaction.category = previous;
      } else {
        delete categoryOverrides[transaction.id];
        transaction.category = categorizeDescription(
          transaction.description,
          categoryRules,
        );
      }
      throw error;
    }
  });
  categorySaveQueue = operation.then(
    () => undefined,
    () => undefined,
  );
  return operation;
}

const dashboardBundle = await build({
  entryPoints: [join(scriptDirectory, "dashboard-client.ts")],
  bundle: true,
  format: "iife",
  target: "es2022",
  write: false,
  minify: true,
});
const dashboardScript = dashboardBundle.outputFiles[0]?.contents;

if (!dashboardScript) {
  throw new Error("Could not compile the dashboard TypeScript.");
}

const settingsBundle = await build({
  entryPoints: [join(scriptDirectory, "settings-client.ts")],
  bundle: true,
  format: "iife",
  target: "es2022",
  write: false,
  minify: true,
});
const settingsScript = settingsBundle.outputFiles[0]?.contents;

if (!settingsScript) {
  throw new Error("Could not compile the settings TypeScript.");
}

const server = createServer(async (request, response) => {
  const pathname = new URL(request.url ?? "/", "http://0.0.0.0").pathname;

  try {
    if (pathname === "/" || pathname === "/index.html") {
      response.writeHead(200, {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "no-store",
        "x-content-type-options": "nosniff",
        "content-security-policy":
          "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
      });
      response.end(await readFile(dashboardPath));
      return;
    }

    if (pathname === "/settings" || pathname === "/settings.html") {
      response.writeHead(200, {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "no-store",
        "x-content-type-options": "nosniff",
        "content-security-policy":
          "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
      });
      response.end(await readFile(settingsPath));
      return;
    }

    if (pathname === "/dashboard.js") {
      response.writeHead(200, {
        "content-type": "text/javascript; charset=utf-8",
        "cache-control": "no-store",
        "x-content-type-options": "nosniff",
      });
      response.end(dashboardScript);
      return;
    }

    if (pathname === "/settings.js") {
      response.writeHead(200, {
        "content-type": "text/javascript; charset=utf-8",
        "cache-control": "no-store",
        "x-content-type-options": "nosniff",
      });
      response.end(settingsScript);
      return;
    }

    const uploadRoute = /^\/api\/statements\/(card|savings)$/.exec(pathname);
    const uploadAccount = uploadRoute?.[1];
    if (uploadAccount === "card" || uploadAccount === "savings") {
      if (request.method !== "POST") {
        response.writeHead(405, { allow: "POST" });
        response.end();
        return;
      }
      if (!isSameOrigin(request)) {
        response.writeHead(403);
        response.end();
        return;
      }
      if (
        request.headers["content-type"]?.split(";")[0].trim() !== "text/csv"
      ) {
        response.writeHead(415, {
          "content-type": "application/json; charset=utf-8",
        });
        response.end(JSON.stringify({ error: "Upload a CSV file." }));
        return;
      }

      let contents: Buffer;
      try {
        contents = await readStatementUpload(request);
      } catch (error) {
        const tooLarge = error instanceof UploadTooLargeError;
        response.writeHead(tooLarge ? 413 : 400, {
          "content-type": "application/json; charset=utf-8",
        });
        response.end(
          JSON.stringify({
            error:
              error instanceof Error
                ? error.message
                : "Could not read the uploaded statement.",
          }),
        );
        return;
      }

      try {
        const fileName = await queueStatementUpload(uploadAccount, contents);
        response.writeHead(201, {
          "content-type": "application/json; charset=utf-8",
          "cache-control": "no-store",
          "x-content-type-options": "nosniff",
        });
        response.end(JSON.stringify({ account: uploadAccount, fileName }));
      } catch (error) {
        const invalidUpload = error instanceof InvalidStatementUploadError;
        if (!invalidUpload) {
          console.error("Could not save uploaded statement:", error);
        }
        response.writeHead(invalidUpload ? 400 : 500, {
          "content-type": "application/json; charset=utf-8",
        });
        response.end(
          JSON.stringify({
            error:
              error instanceof Error
                ? error.message
                : "Could not save the uploaded statement.",
          }),
        );
      }
      return;
    }

    if (pathname === "/api/transactions") {
      response.writeHead(200, {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "no-store",
        "x-content-type-options": "nosniff",
      });
      response.end(
        JSON.stringify({
          revision: dataVersion,
          refreshError: statementReloadError,
          categories,
          accounts: statementData.accounts,
          transactions,
        }),
      );
      return;
    }

    if (pathname === "/api/category-rules") {
      if (request.method === "GET") {
        response.writeHead(200, {
          "content-type": "application/json; charset=utf-8",
          "cache-control": "no-store",
          "x-content-type-options": "nosniff",
        });
        response.end(JSON.stringify({ rules: categoryRules }));
        return;
      }

      if (request.method !== "POST") {
        response.writeHead(405, { allow: "GET, POST" });
        response.end();
        return;
      }
      if (!isSameOrigin(request)) {
        response.writeHead(403);
        response.end();
        return;
      }
      if (!request.headers["content-type"]?.startsWith("application/json")) {
        response.writeHead(415);
        response.end();
        return;
      }

      let payload: unknown;
      try {
        payload = await readJsonBody(request, 256 * 1024);
      } catch (error) {
        response.writeHead(400, {
          "content-type": "application/json; charset=utf-8",
        });
        response.end(
          JSON.stringify({
            error:
              error instanceof Error ? error.message : "Invalid category rules.",
          }),
        );
        return;
      }

      if (!isRecord(payload) || !Array.isArray(payload.rules)) {
        response.writeHead(400, {
          "content-type": "application/json; charset=utf-8",
        });
        response.end(JSON.stringify({ error: "Invalid category rules." }));
        return;
      }

      try {
        const rules = await queueCategoryRulesSave(payload.rules);
        response.writeHead(200, {
          "content-type": "application/json; charset=utf-8",
          "cache-control": "no-store",
          "x-content-type-options": "nosniff",
        });
        response.end(JSON.stringify({ rules }));
      } catch (error) {
        const invalidRules = error instanceof InvalidCategoryRulesError;
        if (!invalidRules) {
          console.error("Could not save category rules:", error);
        }
        response.writeHead(invalidRules ? 400 : 500, {
          "content-type": "application/json; charset=utf-8",
        });
        response.end(
          JSON.stringify({
            error:
              error instanceof Error
                ? error.message
                : "Could not save category rules.",
          }),
        );
      }
      return;
    }

    if (pathname === "/api/categories") {
      if (request.method !== "POST") {
        response.writeHead(405, { allow: "POST" });
        response.end();
        return;
      }

      if (!isSameOrigin(request)) {
        response.writeHead(403);
        response.end();
        return;
      }

      if (!request.headers["content-type"]?.startsWith("application/json")) {
        response.writeHead(415);
        response.end();
        return;
      }

      let payload: unknown;
      try {
        payload = await readJsonBody(request);
      } catch {
        response.writeHead(400, { "content-type": "text/plain; charset=utf-8" });
        response.end("Invalid category update.");
        return;
      }

      if (!isRecord(payload) || typeof payload.id !== "string") {
        response.writeHead(400, { "content-type": "text/plain; charset=utf-8" });
        response.end("Invalid category update.");
        return;
      }

      const transaction = transactionsById.get(payload.id);
      if (!transaction || !isCategory(payload.category)) {
        response.writeHead(400, { "content-type": "text/plain; charset=utf-8" });
        response.end("Unknown transaction or category.");
        return;
      }

      await saveCategoryOverride(transaction, payload.category);
      response.writeHead(200, {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "no-store",
        "x-content-type-options": "nosniff",
      });
      response.end(
        JSON.stringify({ id: transaction.id, category: transaction.category }),
      );
      return;
    }

    response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    response.end("Not found");
  } catch (error) {
    console.error("Dashboard request failed:", error);
    if (!response.headersSent) {
      response.writeHead(500, {
        "content-type": "text/plain; charset=utf-8",
      });
    }
    response.end("Could not load the dashboard resource.");
  }
});

server.on("error", (error) => {
  if (
    !server.listening &&
    "code" in error &&
    error.code === "EADDRINUSE" &&
    port < 65535
  ) {
    const unavailablePort = port;
    port += 1;
    console.warn(
      `Port ${unavailablePort} is already in use; trying ${port}.`,
    );
    server.listen(port, "0.0.0.0");
    return;
  }

  console.error("Could not start the dashboard server:", error);
  process.exitCode = 1;
});

server.on("listening", () => {
  console.log(`MoneyGo dashboard: http://0.0.0.0:${port}`);
  console.log(
    `Using local statements: ${statementData.accounts.map((account) => account.name).join(", ")}`,
  );
  console.log("Watching statement files for changes.");
  console.log("Press Ctrl+C to stop the server.");
});

server.on("close", () => {
  if (reloadTimer) clearTimeout(reloadTimer);
  for (const watcher of statementWatchers) watcher.close();
});

server.listen(port, "0.0.0.0");
