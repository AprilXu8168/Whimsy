import assert from "node:assert/strict";
import { mkdtemp, mkdir, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, test } from "node:test";
import {
  InvalidStatementUploadError,
  saveStatementUpload,
} from "../statement-upload.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  );
});

test("saves a valid card upload to the next unused filename", async () => {
  const root = await mkdtemp(join(tmpdir(), "moneygo-upload-card-"));
  temporaryDirectories.push(root);
  const statementsDirectory = join(root, "statements");
  await mkdir(statementsDirectory);
  await Promise.all(
    ["card.csv", "card_1.csv", "card_3.csv"].map((fileName) =>
      writeFile(join(statementsDirectory, fileName), "existing"),
    ),
  );

  const fileName = await saveStatementUpload(
    statementsDirectory,
    "card",
    Buffer.from('01/01/2026,"-12.00","COLES","88.00"\n'),
  );

  assert.equal(fileName, "card_2.csv");
  assert.match(
    await readdir(statementsDirectory).then((files) => files.join(",")),
    /card_2\.csv/,
  );
});

test("savings uploads use their own sequence", async () => {
  const root = await mkdtemp(join(tmpdir(), "moneygo-upload-savings-"));
  temporaryDirectories.push(root);
  const statementsDirectory = join(root, "statements");
  await mkdir(statementsDirectory);
  await writeFile(join(statementsDirectory, "savings.csv"), "existing");

  const fileName = await saveStatementUpload(
    statementsDirectory,
    "savings",
    Buffer.from('01/01/2026,"+12.00","Deposit","112.00"\n'),
  );

  assert.equal(fileName, "savings_1.csv");
});

test("rejects invalid CSV without creating a statement", async () => {
  const root = await mkdtemp(join(tmpdir(), "moneygo-upload-invalid-"));
  temporaryDirectories.push(root);
  const statementsDirectory = join(root, "statements");
  await mkdir(statementsDirectory);

  await assert.rejects(
    saveStatementUpload(
      statementsDirectory,
      "card",
      Buffer.from("not a valid statement"),
    ),
    InvalidStatementUploadError,
  );
  assert.deepEqual(await readdir(statementsDirectory), []);
});
