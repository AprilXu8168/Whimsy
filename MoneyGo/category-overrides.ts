import { readFile } from "node:fs/promises";
import { isCategory, type Category } from "./categories.js";

export async function loadCategoryOverrides(
  filePath: string,
): Promise<Record<string, Category>> {
  try {
    const parsed: unknown = JSON.parse(await readFile(filePath, "utf8"));
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      throw new Error("Category overrides must be a JSON object.");
    }

    const overrides: Record<string, Category> = {};
    for (const [id, category] of Object.entries(parsed)) {
      if (!/^[a-f0-9]{64}$/.test(id) || !isCategory(category)) {
        throw new Error("Category overrides contain an invalid entry.");
      }
      overrides[id] = category;
    }
    return overrides;
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "ENOENT"
    ) {
      return {};
    }
    throw error;
  }
}
