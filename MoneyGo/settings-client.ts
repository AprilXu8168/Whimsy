type CategoryRule = {
  category: string;
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
      typeof rule.category !== "string" ||
      !("keywords" in rule) ||
      !Array.isArray(rule.keywords) ||
      !rule.keywords.every((keyword: unknown) => typeof keyword === "string")
    ) {
      throw new Error("The server returned invalid category rules.");
    }
    return { category: rule.category, keywords: rule.keywords };
  });
}

function renderRules(rules: CategoryRule[]): void {
  categoryRulesList.replaceChildren();
  for (const rule of rules) {
    const item = document.createElement("div");
    item.className = "rule-item";

    const label = document.createElement("label");
    const category = document.createElement("span");
    category.className = "rule-category";
    category.textContent = rule.category;

    const help = document.createElement("span");
    help.className = "rule-help";
    help.textContent = "One keyword per line";

    const textarea = document.createElement("textarea");
    textarea.rows = 4;
    textarea.spellcheck = false;
    textarea.dataset.category = rule.category;
    textarea.value = rule.keywords.join("\n");

    label.append(category, help, textarea);
    item.append(label);
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
    categoryRulesList.querySelectorAll<HTMLTextAreaElement>(
      "textarea[data-category]",
    ),
  ).map((textarea) => ({
    category: textarea.dataset.category ?? "",
    keywords: textarea.value
      .split(/\r?\n/)
      .map((keyword) => keyword.trim())
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
