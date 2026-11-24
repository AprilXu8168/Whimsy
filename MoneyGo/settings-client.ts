import { isCategory, type Category } from "./categories.js";
import { categoryColors } from "./category-colors.js";

type CategoryRule = {
  category: Category;
  keywords: string[];
};

type StatusElements = {
  panel: HTMLDivElement;
  title: HTMLElement;
  message: HTMLParagraphElement;
  link?: HTMLAnchorElement;
};

const form = document.querySelector<HTMLFormElement>("#statement-upload-form");
const accountSelect =
  document.querySelector<HTMLSelectElement>("#account-type");
const fileInput =
  document.querySelector<HTMLInputElement>("#statement-file");
const uploadButton =
  document.querySelector<HTMLButtonElement>("#upload-button");
const uploadStatus = {
  panel: document.querySelector<HTMLDivElement>("#upload-status"),
  title: document.querySelector<HTMLElement>("#status-title"),
  message: document.querySelector<HTMLParagraphElement>("#status-message"),
  link: document.querySelector<HTMLAnchorElement>("#status-link"),
};
const rulesForm =
  document.querySelector<HTMLFormElement>("#category-rules-form");
const rulesList =
  document.querySelector<HTMLDivElement>("#category-rules-list");
const saveRulesButton =
  document.querySelector<HTMLButtonElement>("#save-rules-button");
const rulesStatus = {
  panel: document.querySelector<HTMLDivElement>("#rules-status"),
  title: document.querySelector<HTMLElement>("#rules-status-title"),
  message:
    document.querySelector<HTMLParagraphElement>("#rules-status-message"),
  link: document.querySelector<HTMLAnchorElement>("#rules-status-link"),
};

if (
  !form ||
  !accountSelect ||
  !fileInput ||
  !uploadButton ||
  !uploadStatus.panel ||
  !uploadStatus.title ||
  !uploadStatus.message ||
  !uploadStatus.link ||
  !rulesForm ||
  !rulesList ||
  !saveRulesButton ||
  !rulesStatus.panel ||
  !rulesStatus.title ||
  !rulesStatus.message ||
  !rulesStatus.link
) {
  throw new Error("Settings page is missing required controls.");
}

const uploadStatusElements: StatusElements = {
  panel: uploadStatus.panel,
  title: uploadStatus.title,
  message: uploadStatus.message,
  link: uploadStatus.link,
};
const rulesStatusElements: StatusElements = {
  panel: rulesStatus.panel,
  title: rulesStatus.title,
  message: rulesStatus.message,
  link: rulesStatus.link,
};
const uploadForm = form;
const uploadAccountSelect = accountSelect;
const statementFileInput = fileInput;
const statementUploadButton = uploadButton;
const categoryRulesForm = rulesForm;
const categoryRulesList = rulesList;
const categoryRulesSaveButton = saveRulesButton;

function showStatus(
  elements: StatusElements,
  state: "pending" | "success" | "error",
  title: string,
  message: string,
): void {
  elements.panel.className = `status status--${state}`;
  elements.panel.hidden = false;
  elements.title.textContent = title;
  elements.message.textContent = message;
  if (elements.link) elements.link.hidden = state !== "success";
}

function responseError(payload: unknown, fallback: string): string {
  if (
    typeof payload === "object" &&
    payload !== null &&
    "error" in payload &&
    typeof payload.error === "string"
  ) {
    return payload.error;
  }
  return fallback;
}

function parseRules(payload: unknown): CategoryRule[] {
  if (
    typeof payload !== "object" ||
    payload === null ||
    !("rules" in payload) ||
    !Array.isArray(payload.rules)
  ) {
    throw new Error("The server returned invalid category rules.");
  }

  return payload.rules.map((rule: unknown) => {
    if (
      typeof rule !== "object" ||
      rule === null ||
      !("category" in rule) ||
      !isCategory(rule.category) ||
      !("keywords" in rule) ||
      !Array.isArray(rule.keywords) ||
      !rule.keywords.every((keyword: unknown) => typeof keyword === "string")
    ) {
      throw new Error("The server returned invalid category rules.");
    }
    return { category: rule.category, keywords: rule.keywords };
  });
}

function createKeywordRow(
  category: string,
  keyword: string,
  index: number,
): HTMLDivElement {
  const row = document.createElement("div");
  row.className = "keyword-row";

  const input = document.createElement("input");
  input.type = "text";
  input.className = "keyword-input";
  input.maxLength = 120;
  input.spellcheck = false;
  input.dataset.category = category;
  input.value = keyword;
  input.size = Math.max(8, keyword.length + 2);
  input.setAttribute("aria-label", `Keyword ${index + 1} for ${category}`);
  input.addEventListener("input", () => {
    input.size = Math.max(8, input.value.length + 2);
  });

  const removeButton = document.createElement("button");
  removeButton.type = "button";
  removeButton.className = "remove-keyword-button";
  removeButton.textContent = "×";
  removeButton.setAttribute(
    "aria-label",
    `Remove keyword ${index + 1} from ${category}`,
  );
  removeButton.title = `Remove keyword ${index + 1}`;
  removeButton.addEventListener("click", () => {
    row.remove();
    const keywordList = row.parentElement;
    if (!keywordList) {
      throw new Error("Could not find the category keyword list.");
    }
    updateKeywordLabels(keywordList, category);
  });

  row.append(input, removeButton);
  return row;
}

function updateKeywordLabels(keywordList: HTMLElement, category: string): void {
  const rows = keywordList.querySelectorAll<HTMLDivElement>(".keyword-row");
  rows.forEach((row, index) => {
    const input = row.querySelector<HTMLInputElement>(".keyword-input");
    const removeButton =
      row.querySelector<HTMLButtonElement>(".remove-keyword-button");
    if (!input || !removeButton) {
      throw new Error("Category rules contain an invalid keyword row.");
    }
    input.setAttribute("aria-label", `Keyword ${index + 1} for ${category}`);
    removeButton.setAttribute(
      "aria-label",
      `Remove keyword ${index + 1} from ${category}`,
    );
  });
}

function renderRules(rules: CategoryRule[]): void {
  categoryRulesList.replaceChildren();
  for (const rule of rules) {
    const item = document.createElement("section");
    item.className = "rule-item";
    item.dataset.category = rule.category;
    item.style.setProperty("--category-color", categoryColors[rule.category]);

    const category = document.createElement("h3");
    category.className = "rule-category";
    category.textContent = rule.category;

    const help = document.createElement("p");
    help.className = "rule-help";
    help.textContent = "Add, edit, or remove matching keywords.";

    const keywordList = document.createElement("div");
    keywordList.className = "rule-keywords";
    for (const [index, keyword] of rule.keywords.entries()) {
      keywordList.append(createKeywordRow(rule.category, keyword, index));
    }

    const addButton = document.createElement("button");
    addButton.type = "button";
    addButton.className = "add-keyword-button";
    addButton.textContent = "Add keyword";
    addButton.addEventListener("click", () => {
      const row = createKeywordRow(
        rule.category,
        "",
        keywordList.children.length,
      );
      keywordList.append(row);
      updateKeywordLabels(keywordList, rule.category);
      row.querySelector<HTMLInputElement>(".keyword-input")?.focus();
    });

    item.append(category, help, keywordList, addButton);
    categoryRulesList.append(item);
  }
}

async function loadRules(): Promise<void> {
  categoryRulesSaveButton.disabled = true;
  try {
    const response = await fetch("/api/category-rules");
    const payload: unknown = await response.json();
    if (!response.ok) {
      throw new Error(responseError(payload, "Could not load category rules."));
    }
    renderRules(parseRules(payload));
    categoryRulesSaveButton.disabled = false;
  } catch (error) {
    showStatus(
      rulesStatusElements,
      "error",
      "Could not load category rules",
      error instanceof Error ? error.message : "Try refreshing the page.",
    );
  }
}

uploadForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const file = statementFileInput.files?.[0];
  if (!file) {
    showStatus(
      uploadStatusElements,
      "error",
      "Choose a statement",
      "Select a CSV file to continue.",
    );
    return;
  }

  statementUploadButton.disabled = true;
  statementUploadButton.textContent = "Uploading...";
  showStatus(
    uploadStatusElements,
    "pending",
    "Uploading statement",
    "Validating the CSV and saving it to your statements folder.",
  );

  try {
    const response = await fetch(
      `/api/statements/${uploadAccountSelect.value}`,
      {
        method: "POST",
        headers: { "content-type": "text/csv" },
        body: file,
      },
    );
    const payload: unknown = await response.json();
    if (
      !response.ok ||
      typeof payload !== "object" ||
      payload === null ||
      !("fileName" in payload) ||
      typeof payload.fileName !== "string"
    ) {
      throw new Error(
        responseError(payload, "Could not upload the statement."),
      );
    }

    showStatus(
      uploadStatusElements,
      "success",
      "Upload successful",
      `${payload.fileName} has been saved. Your dashboard will refresh shortly.`,
    );
    statementFileInput.value = "";
  } catch (error) {
    showStatus(
      uploadStatusElements,
      "error",
      "Upload unsuccessful",
      error instanceof Error ? error.message : "Could not upload the statement.",
    );
  } finally {
    statementUploadButton.disabled = false;
    statementUploadButton.textContent = "Upload statement";
  }
});

statementFileInput.addEventListener("change", () => {
  uploadStatusElements.panel.hidden = true;
});

categoryRulesForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const rules = Array.from(
    categoryRulesList.querySelectorAll<HTMLElement>(".rule-item"),
  ).map((item) => ({
    category: item.dataset.category ?? "",
    keywords: Array.from(
      item.querySelectorAll<HTMLInputElement>(".keyword-input"),
    )
      .map((input) => input.value.trim())
      .filter(Boolean),
  }));

  categoryRulesSaveButton.disabled = true;
  categoryRulesSaveButton.textContent = "Saving...";
  showStatus(
    rulesStatusElements,
    "pending",
    "Saving category rules",
    "Updating the dashboard and saving your changes.",
  );

  try {
    const response = await fetch("/api/category-rules", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ rules }),
    });
    const payload: unknown = await response.json();
    if (!response.ok) {
      throw new Error(responseError(payload, "Could not save category rules."));
    }
    renderRules(parseRules(payload));
    showStatus(
      rulesStatusElements,
      "success",
      "Category rules saved",
      "The dashboard has been updated. Future spending reports will use these rules too.",
    );
  } catch (error) {
    showStatus(
      rulesStatusElements,
      "error",
      "Could not save category rules",
      error instanceof Error ? error.message : "Try again.",
    );
  } finally {
    categoryRulesSaveButton.disabled = false;
    categoryRulesSaveButton.textContent = "Save category rules";
  }
});

void loadRules();
