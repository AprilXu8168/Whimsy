import Chart from "chart.js/auto";
import type { ChartOptions } from "chart.js";
import type { Category } from "./categories.js";
import {
  getPeriods,
  periodKeyForMonth,
  type DashboardPeriod,
  type PeriodView,
} from "./periods.js";

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

type TransactionResponse = {
  revision: number;
  refreshError: string | null;
  categories: Category[];
  accounts: { id: string; name: string; balanceCents: number }[];
  transactions: Transaction[];
};

type TableControls = {
  sortButtons: HTMLButtonElement[];
  sortBy: "date" | "amount";
  sortDirection: "ascending" | "descending";
};

const currency = new Intl.NumberFormat("en-AU", {
  style: "currency",
  currency: "AUD",
});

function getRequiredElement<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) {
    throw new Error(`Dashboard page is missing required element: ${selector}`);
  }
  return element;
}

function getTableControls(name: string): TableControls {
  const sortButtons = [
    ...document.querySelectorAll<HTMLButtonElement>(
      `[data-sort-table="${name}"]`,
    ),
  ];
  if (sortButtons.length === 0) {
    throw new Error(`Dashboard is missing ${name} table sort buttons.`);
  }

  return {
    sortButtons,
    sortBy: "date",
    sortDirection: "descending",
  };
}

const periodSelect =
  getRequiredElement<HTMLSelectElement>("#period-select");
const periodTabs = [
  ...document.querySelectorAll<HTMLButtonElement>("[data-period-view]"),
];
if (periodTabs.length === 0) {
  throw new Error("Dashboard page is missing required period tabs.");
}
const status = getRequiredElement<HTMLParagraphElement>("#status");
const saveStatus =
  getRequiredElement<HTMLParagraphElement>("#save-status");
const balanceSummary =
  getRequiredElement<HTMLParagraphElement>("#balance-summary");
const spendingTitle =
  getRequiredElement<HTMLHeadingElement>("#spending-title");
const balanceTitle =
  getRequiredElement<HTMLHeadingElement>("#balance-title");
const spendingSummary =
  getRequiredElement<HTMLParagraphElement>("#spending-summary");
const balanceSectionSummary =
  getRequiredElement<HTMLParagraphElement>("#balance-section-summary");
const categorySummary =
  getRequiredElement<HTMLParagraphElement>("#category-summary");
const reviewSummary =
  getRequiredElement<HTMLParagraphElement>("#review-summary");
const incomeSummary =
  getRequiredElement<HTMLParagraphElement>("#income-summary");
const expensesSummary =
  getRequiredElement<HTMLParagraphElement>("#expenses-summary");
const spendingCanvas =
  getRequiredElement<HTMLCanvasElement>("#spending-chart");
const balanceCanvas =
  getRequiredElement<HTMLCanvasElement>("#balance-chart");
const categoryCanvas =
  getRequiredElement<HTMLCanvasElement>("#category-chart");
const categoryLegend =
  getRequiredElement<HTMLUListElement>("#category-legend");
const expensesBody =
  getRequiredElement<HTMLTableSectionElement>("#expenses-body");
const incomeBody =
  getRequiredElement<HTMLTableSectionElement>("#income-body");
const incomeTableWrap =
  getRequiredElement<HTMLDivElement>("#income-table-wrap");
const toggleIncomeTable =
  getRequiredElement<HTMLButtonElement>("#toggle-income-table");
const expensesTitle =
  getRequiredElement<HTMLHeadingElement>("#expenses-title");
const expensesTableWrap =
  getRequiredElement<HTMLDivElement>("#expenses-table-wrap");
const toggleExpensesTable =
  getRequiredElement<HTMLButtonElement>("#toggle-expenses-table");
const clearExpenseFilter =
  getRequiredElement<HTMLButtonElement>("#clear-expense-filter");
const reviewBody =
  getRequiredElement<HTMLTableSectionElement>("#review-body");
const reviewSection =
  getRequiredElement<HTMLElement>("#review-section");
const reviewTableWrap =
  getRequiredElement<HTMLDivElement>("#review-table-wrap");
const toggleReviewTable =
  getRequiredElement<HTMLButtonElement>("#toggle-review-table");
const reviewTableControls = getTableControls("review");
const incomeTableControls = getTableControls("income");
const expensesTableControls = getTableControls("expenses");

let allTransactions: Transaction[] = [];
let accountCount = 0;
let categoryNames: Category[] = [];
let availableMonths: string[] = [];
let dataRevision = 0;
let currentPeriods: DashboardPeriod[] = [];
let periodView: PeriodView = "monthly";
let spendingChart: Chart<"bar", number[], string> | undefined;
let balanceChart: Chart<"line", number[], string> | undefined;
let categoryChart: Chart<"pie", number[], string> | undefined;
let selectedExpenseCategory: Category | null = null;
let selectedExpenseDate: string | null = null;

const categoryColors: Record<Category, string> = {
  Groceries: "#2e7d32",
  House: "#546e7a",
  Dining: "#ef6c00",
  Wellness: "#00897b",
  OutOfPlan: "#6d4c41",
  Insurance: "#7b1fa2",
  Transport: "#1565c0",
  Bills: "#c62828",
  Entertainment: "#ad1457",
  Review: "#757575",
};

function isPeriodView(value: string | undefined): value is PeriodView {
  return (
    value === "monthly" ||
    value === "quarterly" ||
    value === "yearly" ||
    value === "financial-year"
  );
}

function chronologicalTransactions(
  transactions: Transaction[],
): Transaction[] {
  return [...transactions].sort((a, b) => {
    const dateOrder = a.date.localeCompare(b.date);
    if (dateOrder !== 0) return dateOrder;
    if (a.account !== b.account) return a.account.localeCompare(b.account);
    return a.accountNewestFirst
      ? b.accountSequence - a.accountSequence
      : a.accountSequence - b.accountSequence;
  });
}

function periodChartData(period: DashboardPeriod): {
  labels: string[];
  spending: number[];
  balances: number[];
} {
  const allChronological = chronologicalTransactions(allTransactions);
  const periodTransactions = allChronological.filter(
    (transaction) =>
      transaction.date >= period.startDate &&
      transaction.date < period.endDate,
  );

  const accountBalances = new Map<string, number>();
  const accountIds = new Set(allChronological.map(({ account }) => account));
  for (const account of accountIds) {
    const accountTransactions = allChronological.filter(
      (transaction) => transaction.account === account,
    );
    const previousTransaction = accountTransactions
      .filter((transaction) => transaction.date < period.startDate)
      .at(-1);
    const firstTransaction = accountTransactions[0];
    if (previousTransaction) {
      accountBalances.set(account, previousTransaction.balanceCents);
    } else if (firstTransaction) {
      accountBalances.set(
        account,
        firstTransaction.balanceCents - firstTransaction.amountCents,
      );
    }
  }
  const labels =
    period.view === "monthly"
      ? Array.from(
          {
            length: new Date(
              Date.UTC(
                Number(period.bucketMonths[0].slice(0, 4)),
                Number(period.bucketMonths[0].slice(5, 7)),
                0,
              ),
            ).getUTCDate(),
          },
          (_, index) => String(index + 1),
        )
      : period.bucketMonths.map((month) =>
          new Intl.DateTimeFormat("en-AU", {
            month: "short",
            timeZone: "UTC",
          }).format(
            new Date(
              Date.UTC(
                Number(month.slice(0, 4)),
                Number(month.slice(5, 7)) - 1,
                1,
              ),
            ),
          ),
        );
  const transactionsByBucket = labels.map(() => [] as Transaction[]);
  const spending = labels.map(() => 0);

  for (const transaction of periodTransactions) {
    const bucketIndex =
      period.view === "monthly"
        ? Number(transaction.date.slice(8, 10)) - 1
        : period.bucketMonths.indexOf(transaction.date.slice(0, 7));
    if (bucketIndex < 0 || bucketIndex >= labels.length) continue;

    transactionsByBucket[bucketIndex].push(transaction);
    if (transaction.isSpend && transaction.amountCents < 0) {
      spending[bucketIndex] += -transaction.amountCents;
    }
  }

  const balances = transactionsByBucket.map((bucketTransactions) => {
    for (const transaction of bucketTransactions) {
      accountBalances.set(transaction.account, transaction.balanceCents);
    }
    return [...accountBalances.values()].reduce(
      (total, balance) => total + balance,
      0,
    );
  });

  return { labels, spending, balances };
}

function chartOptions<T extends "bar" | "line">(
  beginAtZero: boolean,
  xAxisTitle: string,
): ChartOptions<T> {
  const options: ChartOptions<"bar" | "line"> = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { intersect: false, mode: "index" },
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: (context) =>
            context.parsed.y == null
              ? `${context.dataset.label}: unavailable`
              : `${context.dataset.label}: ${currency.format(context.parsed.y / 100)}`,
        },
      },
    },
    scales: {
      x: {
        title: { display: true, text: xAxisTitle },
        grid: { display: false },
      },
      y: {
        beginAtZero,
        ticks: {
          callback: (value) => currency.format(Number(value) / 100),
        },
      },
    },
  };
  return options as ChartOptions<T>;
}

function renderCategoryChart(period: DashboardPeriod): void {
  const totals = new Map(categoryNames.map((category) => [category, 0]));
  let spendingTotalCents = 0;

  for (const transaction of allTransactions) {
    if (
      transaction.date >= period.startDate &&
      transaction.date < period.endDate &&
      transaction.isSpend &&
      transaction.amountCents < 0
    ) {
      spendingTotalCents -= transaction.amountCents;
      totals.set(
        transaction.category,
        (totals.get(transaction.category) ?? 0) -
          transaction.amountCents,
      );
    }
  }

  const chartCategories = categoryNames.filter(
    (category) => (totals.get(category) ?? 0) > 0,
  );

  categorySummary.textContent = formatSectionSummary(
    chartCategories.length,
    "category",
    "categories",
    "Total spent",
    spendingTotalCents,
  );

  categoryLegend.replaceChildren();
  if (chartCategories.length === 0) {
    const item = document.createElement("li");
    item.textContent = "No spending in this period.";
    categoryLegend.append(item);
  } else {
    for (const category of chartCategories) {
      const item = document.createElement("li");
      const swatch = document.createElement("span");
      swatch.className = "category-color-swatch";
      swatch.style.backgroundColor = categoryColors[category];
      swatch.setAttribute("aria-hidden", "true");
      const label = document.createElement("span");
      label.textContent =
        `${category}: ${currency.format((totals.get(category) ?? 0) / 100)}`;
      item.append(swatch, label);
      categoryLegend.append(item);
    }
  }

  categoryChart?.destroy();
  categoryChart = new Chart(categoryCanvas, {
    type: "pie",
    data: {
      labels: chartCategories,
      datasets: [
        {
          label: "Spent",
          data: chartCategories.map((category) => totals.get(category) ?? 0),
          backgroundColor: chartCategories.map(
            (category) => categoryColors[category],
          ),
          borderColor: "#ffffff",
          borderWidth: 2,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (context) => {
              const total = context.dataset.data.reduce(
                (sum, value) => sum + value,
                0,
              );
              const percentage =
                total > 0 ? (context.parsed / total) * 100 : 0;
              return `${context.label}: ${percentage.toFixed(1)}%`;
            },
          },
        },
      },
    },
  });
}

function setTableExpanded(
  table: HTMLDivElement,
  toggle: HTMLButtonElement,
  expanded: boolean,
): void {
  table.hidden = !expanded;
  toggle.setAttribute("aria-expanded", String(expanded));
  toggle.textContent = expanded ? "Collapse table" : "Expand table";
}

function formatTransactionDate(date: string): string {
  const [year, month, day] = date.split("-").map(Number);
  return new Intl.DateTimeFormat("en-AU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

function formatSectionSummary(
  count: number,
  singular: string,
  plural: string,
  amountLabel: string,
  amountCents: number,
): string {
  return `${count} ${count === 1 ? singular : plural} | ${amountLabel}: ${currency.format(amountCents / 100)}`;
}

function sortTableTransactions(
  transactions: Transaction[],
  controls: TableControls,
  amount: (transaction: Transaction) => number,
): Transaction[] {
  const direction = controls.sortDirection === "ascending" ? 1 : -1;
  return [...transactions].sort((a, b) => {
    const comparison =
      controls.sortBy === "date"
        ? a.date.localeCompare(b.date)
        : amount(a) - amount(b);
    return comparison * direction;
  });
}

function updateSortButtons(controls: TableControls): void {
  for (const button of controls.sortButtons) {
    const key = button.dataset.sortKey;
    if (key !== "date" && key !== "amount") {
      throw new Error("Dashboard contains an invalid table sort key.");
    }

    const label = button.dataset.sortLabel ?? (key === "date" ? "Date" : "Amount");
    const active = controls.sortBy === key;
    button.textContent = active
      ? `${label} (${controls.sortDirection})`
      : label;
    button.setAttribute(
      "aria-label",
      active ? `${label}, sorted ${controls.sortDirection}` : `Sort by ${label}`,
    );
    button.closest("th")?.setAttribute(
      "aria-sort",
      active ? controls.sortDirection : "none",
    );
  }
}

function bindTableControls(
  controls: TableControls,
  render: () => void,
): void {
  for (const button of controls.sortButtons) {
    button.addEventListener("click", () => {
      const key = button.dataset.sortKey;
      if (key !== "date" && key !== "amount") {
        throw new Error("Dashboard contains an invalid table sort key.");
      }

      if (controls.sortBy === key) {
        controls.sortDirection =
          controls.sortDirection === "ascending" ? "descending" : "ascending";
      } else {
        controls.sortBy = key;
        controls.sortDirection = "descending";
      }
      updateSortButtons(controls);
      render();
    });
  }

  updateSortButtons(controls);
}

async function saveCategory(
  transaction: Transaction,
  select: HTMLSelectElement,
  previousCategory: Category,
): Promise<void> {
  select.disabled = true;
  saveStatus.textContent = "Saving category...";

  try {
    const response = await fetch("/api/categories", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        id: transaction.id,
        category: select.value,
      }),
    });
    if (!response.ok) {
      throw new Error("Could not save this category.");
    }

    const result = (await response.json()) as {
      id: string;
      category: Category;
    };
    transaction.category = result.category;
    const period = getSelectedPeriod();
    renderCategoryChart(period);
    renderExpenses(period);
    renderReviewTodos(period);
    saveStatus.textContent = "Category saved on this computer.";
  } catch (error) {
    select.value = previousCategory;
    saveStatus.textContent =
      error instanceof Error ? error.message : "Could not save this category.";
  } finally {
    select.disabled = false;
  }
}

function createExpenseRow(
  transaction: Transaction,
  description = transaction.description,
): HTMLTableRowElement {
  const row = document.createElement("tr");
  const dateCell = document.createElement("td");
  dateCell.textContent = formatTransactionDate(transaction.date);
  const descriptionCell = document.createElement("td");
  descriptionCell.textContent = description;
  const amountCell = document.createElement("td");
  amountCell.className = "amount";
  amountCell.textContent = currency.format(-transaction.amountCents / 100);
  const categoryCell = document.createElement("td");
  const select = document.createElement("select");
  select.className = "category-select";
  select.setAttribute(
    "aria-label",
    `Category for ${description}`,
  );

  for (const category of categoryNames) {
    const option = document.createElement("option");
    option.value = category;
    option.textContent = category;
    select.append(option);
  }
  select.value = transaction.category;
  select.addEventListener("change", () => {
    void saveCategory(transaction, select, transaction.category);
  });

  categoryCell.append(select);
  row.append(dateCell, descriptionCell, amountCell, categoryCell);
  return row;
}

function renderExpenses(period: DashboardPeriod): void {
  const activeFilters = [
    selectedExpenseDate && formatTransactionDate(selectedExpenseDate),
    selectedExpenseCategory,
  ].filter((filter): filter is string => filter !== null);
  expensesTitle.textContent = activeFilters.length
    ? `Expenses and categories: ${activeFilters.join(" · ")}`
    : "Expenses and categories";
  clearExpenseFilter.hidden = activeFilters.length === 0;
  const expenses = chronologicalTransactions(
    allTransactions.filter(
      (transaction) =>
        transaction.isSpend &&
        transaction.amountCents < 0 &&
        transaction.date >= period.startDate &&
        transaction.date < period.endDate &&
        (!selectedExpenseDate || transaction.date === selectedExpenseDate) &&
        (!selectedExpenseCategory ||
          transaction.category === selectedExpenseCategory),
    ),
  );
  const sortedExpenses = sortTableTransactions(
    expenses,
    expensesTableControls,
    (transaction) => -transaction.amountCents,
  );
  const totalSpentCents = sortedExpenses.reduce(
    (total, transaction) => total - transaction.amountCents,
    0,
  );
  expensesSummary.textContent = formatSectionSummary(
    sortedExpenses.length,
    "expense",
    "expenses",
    "Total spent",
    totalSpentCents,
  );

  expensesBody.replaceChildren();
  if (sortedExpenses.length === 0) {
    const row = document.createElement("tr");
    const cell = document.createElement("td");
    cell.colSpan = 4;
    cell.textContent = "No expenses for this selection.";
    row.append(cell);
    expensesBody.append(row);
    return;
  }

  for (const transaction of sortedExpenses) {
    expensesBody.append(createExpenseRow(transaction));
  }
}

function renderIncome(period: DashboardPeriod): void {
  const incomes = sortTableTransactions(
    allTransactions.filter(
      (transaction) =>
        transaction.isIncome &&
        transaction.amountCents > 0 &&
        transaction.date >= period.startDate &&
        transaction.date < period.endDate,
    ),
    incomeTableControls,
    (transaction) => transaction.amountCents,
  );
  const totalIncomeCents = incomes.reduce(
    (total, transaction) => total + transaction.amountCents,
    0,
  );
  incomeSummary.textContent = formatSectionSummary(
    incomes.length,
    "credit",
    "credits",
    "Total received",
    totalIncomeCents,
  );

  incomeBody.replaceChildren();
  if (incomes.length === 0) {
    const row = document.createElement("tr");
    const cell = document.createElement("td");
    cell.colSpan = 3;
    cell.textContent = "No income or credits for this period.";
    row.append(cell);
    incomeBody.append(row);
    return;
  }

  for (const transaction of incomes) {
    const row = document.createElement("tr");
    const dateCell = document.createElement("td");
    dateCell.textContent = formatTransactionDate(transaction.date);
    const descriptionCell = document.createElement("td");
    descriptionCell.textContent = transaction.description;
    const amountCell = document.createElement("td");
    amountCell.className = "amount";
    amountCell.textContent = currency.format(transaction.amountCents / 100);
    row.append(dateCell, descriptionCell, amountCell);
    incomeBody.append(row);
  }
}

function renderReviewTodos(period: DashboardPeriod): void {
  const periodReviewTransactions = allTransactions.filter(
    (transaction) =>
      transaction.isSpend &&
      transaction.amountCents < 0 &&
      transaction.category === "Review" &&
      transaction.date >= period.startDate &&
      transaction.date < period.endDate,
  );
  const reviewTransactions = sortTableTransactions(
    periodReviewTransactions,
    reviewTableControls,
    (transaction) => -transaction.amountCents,
  );

  const totalReviewCents = reviewTransactions.reduce(
    (total, transaction) => total - transaction.amountCents,
    0,
  );
  reviewSummary.textContent = formatSectionSummary(
    reviewTransactions.length,
    "item to review",
    "items to review",
    "Total to review",
    totalReviewCents,
  );

  reviewBody.replaceChildren();
  reviewSection.hidden = periodReviewTransactions.length === 0;
  if (reviewTransactions.length === 0) {
    const row = document.createElement("tr");
    const cell = document.createElement("td");
    cell.colSpan = 4;
    cell.textContent = "No review items for this period.";
    row.append(cell);
    reviewBody.append(row);
    return;
  }

  for (const transaction of reviewTransactions) {
    const description = transaction.description
      .replace(/\s*Value Date:.*$/i, "")
      .trim();
    reviewBody.append(createExpenseRow(transaction, description));
  }
}

categoryCanvas.addEventListener("click", (event) => {
  const chart = categoryChart;
  if (!chart) return;

  const element = chart.getElementsAtEventForMode(
    event,
    "nearest",
    { intersect: true },
    true,
  )[0];
  if (!element) return;

  const categoryLabel = chart.data.labels?.[element.index];
  const category = categoryNames.find(
    (candidate) => candidate === categoryLabel,
  );
  if (!category) return;

  selectedExpenseCategory =
    selectedExpenseCategory === category ? null : category;
  setTableExpanded(expensesTableWrap, toggleExpensesTable, true);
  renderExpenses(getSelectedPeriod());
  expensesTitle.scrollIntoView({ behavior: "smooth", block: "start" });
});

function getSelectedPeriod(): DashboardPeriod {
  const period = currentPeriods.find(
    (candidate) => candidate.key === periodSelect.value,
  );
  if (!period) {
    throw new Error("The selected period is not available.");
  }
  return period;
}

function renderPeriod(): void {
  const period = getSelectedPeriod();
  const { labels, spending, balances } = periodChartData(period);
  const spendCount = allTransactions.filter(
    (transaction) =>
      transaction.isSpend &&
      transaction.amountCents < 0 &&
      transaction.date >= period.startDate &&
      transaction.date < period.endDate,
  ).length;
  spendingSummary.textContent = formatSectionSummary(
    spendCount,
    "transaction",
    "transactions",
    "Total spent",
    spending.reduce((total, amount) => total + amount, 0),
  );
  balanceSectionSummary.textContent =
    `${accountCount} ${accountCount === 1 ? "account" : "accounts"} | ` +
    `Closing balance at period end: ${currency.format((balances.at(-1) ?? 0) / 100)}`;
  const monthly = period.view === "monthly";
  const axisTitle = monthly ? "Day of month" : "Month";
  spendingTitle.textContent = monthly ? "Daily spending" : "Monthly spending";
  balanceTitle.textContent = monthly
    ? "Daily closing balance"
    : "Monthly closing balance";

  spendingChart?.destroy();
  balanceChart?.destroy();

  spendingChart = new Chart<"bar", number[], string>(spendingCanvas, {
    type: "bar",
    data: {
      labels,
      datasets: [
        {
          label: "Spent",
          data: spending,
          backgroundColor: "#3678b8",
          borderRadius: 3,
        },
      ],
    },
    options: chartOptions<"bar">(true, axisTitle),
  });
  spendingCanvas.style.cursor = "pointer";

  balanceChart = new Chart<"line", number[], string>(balanceCanvas, {
    type: "line",
    data: {
      labels,
      datasets: [
        {
          label: "Balance",
          data: balances,
          borderColor: "#19856b",
          backgroundColor: "#19856b22",
          pointRadius: 2,
          tension: 0.15,
          fill: false,
        },
      ],
    },
    options: chartOptions<"line">(false, axisTitle),
  });

  renderCategoryChart(period);
  renderExpenses(period);
  renderIncome(period);
  renderReviewTodos(period);
  status.textContent = "";
}

function renderPeriodOptions(
  view: PeriodView,
  preferredPeriodKey?: string,
): void {
  periodView = view;
  currentPeriods = getPeriods(availableMonths, view);
  periodSelect.replaceChildren();

  for (const period of currentPeriods) {
    const option = document.createElement("option");
    option.value = period.key;
    option.textContent = period.label;
    periodSelect.append(option);
  }

  const latestSpendMonth = allTransactions
    .filter((transaction) => transaction.isSpend && transaction.amountCents < 0)
    .map((transaction) => transaction.date.slice(0, 7))
    .sort()
    .at(-1);
  const latestMonth = latestSpendMonth ?? availableMonths.at(-1);
  if (!latestMonth) {
    throw new Error("The statement contains no months.");
  }

  periodSelect.value =
    currentPeriods.find((period) => period.key === preferredPeriodKey)?.key ??
    periodKeyForMonth(latestMonth, view);
  renderPeriod();
}

function nearestSpendingBarIndex(
  event: MouseEvent,
  chart: Chart<"bar", number[], string>,
): number | undefined {
  const bounds = spendingCanvas.getBoundingClientRect();
  if (bounds.width === 0) return undefined;

  const x = ((event.clientX - bounds.left) * chart.width) / bounds.width;
  if (x < chart.chartArea.left || x > chart.chartArea.right) {
    return undefined;
  }

  const bars = chart.getDatasetMeta(0).data;
  let nearestIndex: number | undefined;
  let nearestDistance = Number.POSITIVE_INFINITY;
  bars.forEach((bar, index) => {
    const distance = Math.abs(bar.x - x);
    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearestIndex = index;
    }
  });
  return nearestIndex;
}

function selectPeriodView(
  view: PeriodView,
  preferredPeriodKey?: string,
): void {
  selectedExpenseDate = null;
  for (const tab of periodTabs) {
    tab.setAttribute(
      "aria-pressed",
      String(tab.dataset.periodView === view),
    );
  }
  renderPeriodOptions(view, preferredPeriodKey);
}

function applyTransactionResponse(
  payload: TransactionResponse,
  preferredPeriodKey?: string,
): void {
  allTransactions = payload.transactions;
  accountCount = payload.accounts.length;
  categoryNames = payload.categories;
  dataRevision = payload.revision;

  const combinedBalanceCents = payload.accounts.reduce(
    (total, account) => total + account.balanceCents,
    0,
  );
  balanceSummary.textContent =
    `Combined balance (${payload.accounts.length} accounts): ` +
    currency.format(combinedBalanceCents / 100);
  availableMonths = [
    ...new Set(
      allTransactions.map((transaction) => transaction.date.slice(0, 7)),
    ),
  ].sort();

  if (availableMonths.length === 0) {
    throw new Error("The statement contains no transactions.");
  }

  renderPeriodOptions(periodView, preferredPeriodKey);
}

let checkingForUpdates = false;

async function checkForStatementUpdates(): Promise<void> {
  if (checkingForUpdates) return;
  checkingForUpdates = true;

  try {
    const response = await fetch("/api/transactions");
    if (!response.ok) {
      throw new Error("Could not check for statement updates.");
    }

    const payload = (await response.json()) as TransactionResponse;
    const hasChanged = payload.revision !== dataRevision;
    if (hasChanged) {
      applyTransactionResponse(payload, periodSelect.value);
    }

    if (payload.refreshError) {
      status.textContent =
        `Could not reload changed statements: ${payload.refreshError}`;
    } else if (hasChanged) {
      status.textContent = "Statement data refreshed.";
    }
  } catch (error) {
    status.textContent =
      error instanceof Error
        ? error.message
        : "Could not check for statement updates.";
  } finally {
    checkingForUpdates = false;
  }
}

async function start(): Promise<void> {
  try {
    const response = await fetch("/api/transactions");
    if (!response.ok) {
      throw new Error("Could not load statement data.");
    }

    const payload = (await response.json()) as TransactionResponse;
    periodSelect.addEventListener("change", () => {
      selectedExpenseDate = null;
      renderPeriod();
    });
    for (const button of periodTabs) {
      button.addEventListener("click", () => {
        const view = button.dataset.periodView;
        if (!isPeriodView(view)) {
          throw new Error("Dashboard contains an invalid period tab.");
        }
        selectPeriodView(view);
      });
    }

    applyTransactionResponse(payload);
    bindTableControls(reviewTableControls, () =>
      renderReviewTodos(getSelectedPeriod()),
    );
    bindTableControls(incomeTableControls, () =>
      renderIncome(getSelectedPeriod()),
    );
    bindTableControls(expensesTableControls, () =>
      renderExpenses(getSelectedPeriod()),
    );
    window.setInterval(() => {
      void checkForStatementUpdates();
    }, 3000);
  } catch (error) {
    status.textContent =
      error instanceof Error ? error.message : "Could not load dashboard.";
  }
}

toggleExpensesTable.addEventListener("click", () => {
  setTableExpanded(
    expensesTableWrap,
    toggleExpensesTable,
    Boolean(expensesTableWrap.hidden),
  );
});
toggleReviewTable.addEventListener("click", () => {
  setTableExpanded(
    reviewTableWrap,
    toggleReviewTable,
    Boolean(reviewTableWrap.hidden),
  );
});
toggleIncomeTable.addEventListener("click", () => {
  setTableExpanded(
    incomeTableWrap,
    toggleIncomeTable,
    Boolean(incomeTableWrap.hidden),
  );
});
clearExpenseFilter.addEventListener("click", () => {
  selectedExpenseCategory = null;
  selectedExpenseDate = null;
  renderExpenses(getSelectedPeriod());
});

spendingCanvas.addEventListener("click", (event) => {
  const chart = spendingChart;
  if (!chart) return;

  const index = nearestSpendingBarIndex(event, chart);
  if (index === undefined) return;

  const period = getSelectedPeriod();
  if (period.view === "monthly") {
    const month = period.bucketMonths[0];
    const day = String(index + 1).padStart(2, "0");
    selectedExpenseDate = `${month}-${day}`;
    selectedExpenseCategory = null;
    renderExpenses(period);
    setTableExpanded(expensesTableWrap, toggleExpensesTable, true);
    expensesTitle.scrollIntoView({ behavior: "smooth", block: "start" });
    return;
  }

  const month = period.bucketMonths[index];
  if (!month || !availableMonths.includes(month)) return;
  selectedExpenseCategory = null;
  selectPeriodView("monthly", month);
});

void start();
