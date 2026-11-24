import { randomUUID } from "node:crypto";
import {
  link,
  mkdir,
  mkdtemp,
  readdir,
  rm,
  unlink,
  writeFile,
} from "node:fs/promises";
import { basename, join } from "node:path";
import { tmpdir } from "node:os";
import { readStatements } from "./statement-data.js";

export type StatementAccountType = "card" | "savings";

export class InvalidStatementUploadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidStatementUploadError";
  }
}

async function findCsvFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const nestedFiles = await Promise.all(
    entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => findCsvFiles(join(directory, entry.name))),
  );
  const csvFiles = entries
    .filter(
      (entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".csv"),
    )
    .map((entry) => join(directory, entry.name));

  return [...csvFiles, ...nestedFiles.flat()];
}

function getAccountFileIndex(
  filePath: string,
  account: StatementAccountType,
): number | undefined {
  const match = new RegExp(`^${account}(?:_(\\d+))?\\.csv$`, "i").exec(
    basename(filePath),
  );
  if (!match) return undefined;
  return match[1] === undefined ? 0 : Number(match[1]);
}

async function validateUpload(
  account: StatementAccountType,
  contents: Buffer,
): Promise<void> {
  const validationDirectory = await mkdtemp(
    join(tmpdir(), "moneygo-statement-"),
  );

  try {
    const validationPath = join(validationDirectory, `${account}.csv`);
    await writeFile(validationPath, contents, { mode: 0o600 });
    try {
      await readStatements(validationDirectory, [validationPath]);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "The CSV could not be parsed.";
      throw new InvalidStatementUploadError(
        `Upload a valid statement CSV: ${message}`,
      );
    }
  } finally {
    await rm(validationDirectory, { recursive: true, force: true });
  }
}

export async function saveStatementUpload(
  statementsDirectory: string,
  account: StatementAccountType,
  contents: Buffer,
): Promise<string> {
  await validateUpload(account, contents);
  await mkdir(statementsDirectory, { recursive: true });
  const existingFiles = await findCsvFiles(statementsDirectory);
  const usedIndexes = new Set(
    existingFiles
      .map((filePath) => getAccountFileIndex(filePath, account))
      .filter((index): index is number => index !== undefined),
  );
  const temporaryPath = join(
    statementsDirectory,
    `.upload-${randomUUID()}.tmp`,
  );
  let temporaryFileExists = true;

  try {
    await writeFile(temporaryPath, contents, {
      flag: "wx",
      mode: 0o600,
    });

    for (let index = 0; ; index += 1) {
      if (usedIndexes.has(index)) continue;
      const fileName =
        index === 0 ? `${account}.csv` : `${account}_${index}.csv`;
      try {
        await link(temporaryPath, join(statementsDirectory, fileName));
        await unlink(temporaryPath);
        temporaryFileExists = false;
        return fileName;
      } catch (error) {
        if (
          typeof error === "object" &&
          error !== null &&
          "code" in error &&
          error.code === "EEXIST"
        ) {
          usedIndexes.add(index);
          continue;
        }
        throw error;
      }
    }
  } finally {
    if (temporaryFileExists) {
      await rm(temporaryPath, { force: true });
    }
  }
}
