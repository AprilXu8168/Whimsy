import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:net";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

type TransactionsResponse = {
  revision: number;
  usingDemoStatements: boolean;
  accounts: { id: string; name: string; balanceCents: number }[];
  transactions: { description: string }[];
};

async function getAvailablePort(): Promise<number> {
  const listener = createServer();
  await new Promise<void>((resolve, reject) => {
    listener.once("error", reject);
    listener.listen(0, "127.0.0.1", resolve);
  });

  const address = listener.address();
  if (!address || typeof address === "string") {
    listener.close();
    throw new Error("Could not determine an available test port.");
  }

  await new Promise<void>((resolve, reject) => {
    listener.close((error) => (error ? reject(error) : resolve()));
  });
  return address.port;
}

test("starts with no statements and guides the user to upload one", async (t) => {
  const projectDirectory = fileURLToPath(new URL("../", import.meta.url));
  const temporaryDirectory = await mkdtemp(
    join(tmpdir(), "moneygo-empty-statements-"),
  );
  t.after(() => rm(temporaryDirectory, { recursive: true, force: true }));
  const statementsDirectory = join(temporaryDirectory, "statements");
  await mkdir(statementsDirectory);

  const port = await getAvailablePort();
  const serverProcess = spawn(
    process.execPath,
    ["--import", "tsx", "index.ts", statementsDirectory],
    {
      cwd: projectDirectory,
      env: { ...process.env, PORT: String(port) },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  let serverOutput = "";
  serverProcess.stdout?.on("data", (chunk: Buffer) => {
    serverOutput += chunk.toString();
  });
  serverProcess.stderr?.on("data", (chunk: Buffer) => {
    serverOutput += chunk.toString();
  });
  t.after(async () => {
    if (serverProcess.exitCode === null && serverProcess.signalCode === null) {
      serverProcess.kill("SIGTERM");
      await once(serverProcess, "exit");
    }
  });

  const deadline = Date.now() + 10_000;
  let data: TransactionsResponse | undefined;
  while (Date.now() < deadline) {
    if (serverProcess.exitCode !== null) {
      throw new Error(`Dashboard exited unexpectedly:\n${serverOutput}`);
    }

    try {
      const response = await fetch(
        `http://127.0.0.1:${port}/api/transactions`,
      );
      if (response.ok) {
        data = (await response.json()) as TransactionsResponse;
        break;
      }
    } catch {
      // The server may not have finished starting yet.
    }

    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  assert.ok(data, `Timed out waiting for dashboard startup:\n${serverOutput}`);
  assert.deepEqual(data.accounts, []);
  assert.deepEqual(data.transactions, []);
  assert.equal(data.usingDemoStatements, false);

  const dashboardResponse = await fetch(`http://127.0.0.1:${port}/`);
  assert.equal(dashboardResponse.status, 200);
  const dashboardHtml = await dashboardResponse.text();
  assert.match(dashboardHtml, /No statements uploaded yet/);
  assert.match(dashboardHtml, /href="\/settings">Upload a statement/);
});

test("reloads the transaction API when a watched statement changes", async (t) => {
  const projectDirectory = fileURLToPath(new URL("../", import.meta.url));
  const temporaryDirectory = await mkdtemp(
    join(tmpdir(), "moneygo-live-reload-"),
  );
  t.after(() => rm(temporaryDirectory, { recursive: true, force: true }));

  const statementPath = join(temporaryDirectory, "card.csv");
  await writeFile(
    statementPath,
    '01/01/2026,"-10.00","First item","90.00"\n',
  );

  const port = await getAvailablePort();
  const serverProcess = spawn(
    process.execPath,
    ["--import", "tsx", "dashboard.ts", statementPath],
    {
      cwd: projectDirectory,
      env: { ...process.env, PORT: String(port) },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  let serverOutput = "";
  serverProcess.stdout?.on("data", (chunk: Buffer) => {
    serverOutput += chunk.toString();
  });
  serverProcess.stderr?.on("data", (chunk: Buffer) => {
    serverOutput += chunk.toString();
  });
  t.after(async () => {
    if (serverProcess.exitCode === null && serverProcess.signalCode === null) {
      serverProcess.kill("SIGTERM");
      await once(serverProcess, "exit");
    }
  });

  const endpoint = `http://127.0.0.1:${port}/api/transactions`;
  async function waitForData(
    predicate: (data: TransactionsResponse) => boolean,
  ): Promise<TransactionsResponse> {
    const deadline = Date.now() + 10_000;
    while (Date.now() < deadline) {
      if (serverProcess.exitCode !== null) {
        throw new Error(`Dashboard exited unexpectedly:\n${serverOutput}`);
      }

      try {
        const response = await fetch(endpoint);
        if (response.ok) {
          const data = (await response.json()) as TransactionsResponse;
          if (predicate(data)) return data;
        }
      } catch {
        // The server may not have finished starting yet.
      }

      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    throw new Error(`Timed out waiting for dashboard data:\n${serverOutput}`);
  }

  const initial = await waitForData((data) => data.revision > 0);
  const categoryRulesResponse = await fetch(
    `http://127.0.0.1:${port}/api/category-rules`,
  );
  assert.equal(categoryRulesResponse.status, 200);
  const categoryRulesPayload = (await categoryRulesResponse.json()) as {
    rules: { category: string; keywords: string[] }[];
  };
  assert.ok(
    categoryRulesPayload.rules.some((rule) => rule.category === "Groceries"),
  );

  const invalidCategoryRulesResponse = await fetch(
    `http://127.0.0.1:${port}/api/category-rules`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ rules: [] }),
    },
  );
  assert.equal(invalidCategoryRulesResponse.status, 400);

  const settingsResponse = await fetch(`http://127.0.0.1:${port}/settings`);
  assert.equal(settingsResponse.status, 200);
  const settingsHtml = await settingsResponse.text();
  assert.match(settingsHtml, /Upload a statement/);
  assert.match(settingsHtml, /Category rules/);

  const settingsScriptResponse = await fetch(
    `http://127.0.0.1:${port}/settings.js`,
  );
  assert.equal(settingsScriptResponse.status, 200);
  assert.match(
    settingsScriptResponse.headers.get("content-type") ?? "",
    /javascript/,
  );

  const crossOriginUpload = await fetch(
    `http://127.0.0.1:${port}/api/statements/card`,
    {
      method: "POST",
      headers: {
        "content-type": "text/csv",
        origin: "http://untrusted.example",
      },
      body: '01/01/2026,"-10.00","Test","90.00"\n',
    },
  );
  assert.equal(crossOriginUpload.status, 403);

  const invalidUpload = await fetch(
    `http://127.0.0.1:${port}/api/statements/card`,
    {
      method: "POST",
      headers: { "content-type": "text/csv" },
      body: "not a valid statement",
    },
  );
  assert.equal(invalidUpload.status, 400);
  assert.match(
    ((await invalidUpload.json()) as { error: string }).error,
    /valid statement CSV/,
  );

  await writeFile(
    statementPath,
    [
      '01/01/2026,"-10.00","First item","90.00"',
      '02/01/2026,"-20.00","Second item","70.00"',
    ].join("\n"),
  );

  const updated = await waitForData(
    (data) =>
      data.revision > initial.revision &&
      data.transactions.some(
        (transaction) => transaction.description === "Second item",
      ),
  );

  assert.ok(updated.revision > initial.revision);
  assert.ok(
    updated.transactions.some(
      (transaction) => transaction.description === "Second item",
    ),
  );
});
