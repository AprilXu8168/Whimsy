import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  NoStatementDataError,
  NoStatementFilesError,
} from "./statement-data.js";

const scriptDirectory = fileURLToPath(new URL(".", import.meta.url));
await mkdir(join(scriptDirectory, "statements"), { recursive: true });

console.log("[1/2] Scanning statements and refreshing spending_log.csv.");
try {
  await import("./categorize-spends.js");
} catch (error) {
  if (
    !(error instanceof NoStatementFilesError) &&
    !(error instanceof NoStatementDataError)
  ) {
    throw error;
  }
  console.log(
    "No local statement transactions found. The dashboard will use demo statements if available.",
  );
}

console.log("[2/2] Starting the dashboard.");
await import("./dashboard.js");

export {};