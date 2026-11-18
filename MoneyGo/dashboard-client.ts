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
  categories: Category[];
  accounts: { id: string; name: string; balanceCents: number }[];
  transactions: Transaction[];
};

const currency = new Intl.NumberFormat("en-AU", {
  style: "currency",
  currency: "AUD",
});
const periodSelect =
  document.querySelector<HTMLSelectElement>("#period-select");
const periodTabs = [
  ...document.querySelectorAll<HTMLButtonElement>("[data-period-view]"),
];
const status = document.querySelector<HTMLParagraphElement>("#status");
const saveStatus =
  document.querySelector<HTMLParagraphElement>("#save-status");
const balanceSummary =
  document.querySelector<HTMLParagraphElement>("#balance-summary");
const spendingTitle =
  document.querySelector<HTMLHeadingElement>("#spending-title");
const balanceTitle =
  document.querySelector<HTMLHeadingElement>("#balance-title");
const spendingSummary =
  document.querySelector<HTMLParagraphElement>("#spending-summary");
const balanceSectionSummary =
  document.querySelector<HTMLParagraphElement>("#balance-section-summary");
const categorySummary =
  document.querySelector<HTMLParagraphElement>("#category-summary");
const reviewSummary =
  document.querySelector<HTMLParagraphElement>("#review-summary");
const incomeSummary =
  document.querySelector<HTMLParagraphElement>("#income-summary");
const expensesSummary =
  document.querySelector<HTMLParagraphElement>("#expenses-summary");
const spendingCanvas =
  document.querySelector<HTMLCanvasElement>("#spending-chart");
const balanceCanvas =
  document.querySelector<HTMLCanvasElement>("#balance-chart");
const categoryCanvas =
  document.querySelector<HTMLCanvasElement>("#category-chart");
const categoryLegend =
  document.querySelector<HTMLUListElement>("#category-legend");
const expensesBody =
  document.querySelector<HTMLTableSectionElement>("#expenses-body");
const incomeBody =
  document.querySelector<HTMLTableSectionElement>("#income-body");
const incomeTableWrap =
  document.querySelector<HTMLDivElement>("#income-table-wrap");
const toggleIncomeTable =
  document.querySelector<HTMLButtonElement>("#toggle-income-table");
const expensesTitle =
  document.querySelector<HTMLHeadingElement>("#expenses-title");
const expensesTableWrap =
  document.querySelector<HTMLDivElement>("#expenses-table-wrap");
const toggleExpensesTable =
  document.querySelector<HTMLButtonElement>("#toggle-expenses-table");
const clearExpenseFilter =
  document.querySelector<HTMLButtonElement>("#clear-expense-filter");
const reviewBody =
  document.querySelector<HTMLTableSectionElement>("#review-body");
const reviewSection =
  document.querySelector<HTMLElement>("#review-section");
const reviewTableWrap =
  document.querySelector<HTMLDivElement>("#review-table-wrap");
const toggleReviewTable =
  document.querySelector<HTMLButtonElement>("#toggle-review-table");

if (
  !periodSelect ||
  periodTabs.length === 0 ||
  !status ||
  !saveStatus ||
  !balanceSummary ||
  !spendingTitle ||
  !balanceTitle ||
  !spendingSummary ||
  !balanceSectionSummary ||
  !categorySummary ||
  !reviewSummary ||
  !incomeSummary ||
  !expensesSummary ||
  !spendingCanvas ||
  !balanceCanvas ||
  !categoryCanvas ||
  !categoryLegend ||
  !expensesBody ||
  !incomeBody ||
  !incomeTableWrap ||
  !toggleIncomeTable ||
  !expensesTitle ||
  !expensesTableWrap ||
  !toggleExpensesTable ||
  !clearExpenseFilter ||
  !reviewBody ||
  !reviewSection ||
  !reviewTableWrap ||
  !toggleReviewTable
) {
  throw new Error("Dashboard page is missing a required element.");
}

let allTransactions: Transaction[] = [];
let accountCount = 0;
let categoryNames: Category[] = [];
let availableMonths: string[] = [];
let currentPeriods: DashboardPeriod[] = [];
let periodView: PeriodView = "monthly";
let spendingChart: Chart | undefined;
let balanceChart: Chart | undefined;
let categoryChart: Chart<"pie", number[], string> | undefined;
let selectedExpenseCategory: Category | null = null;

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

function chartOptions(
  beginAtZero: boolean,
  xAxisTitle: string,
): ChartOptions<"bar" | "line"> {
  return {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { intersect: false, mode: "index" },
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: (context) =>
            `${context.dataset.label}: ${currency.format(context.parsed.y / 100)}`,
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
}

function renderCategoryChart(period: DashboardPeriod): void {
  const totals = new Map(categoryNames.map((category) => [category, 0]));
  let spendingCount = 0;
  let spendingTotalCents = 0;

  for (const transaction of allTransactions) {
    if (
      transaction.date >= period.startDate &&
      transaction.date < period.endDate &&
      transaction.isSpend &&
      transaction.amountCents < 0
    ) {
      spendingCount += 1;
      spendingTotalCents -= transaction.amountCents;
      totals.set(
        transaction.category,
        (totals.get(transaction.category) ?? 0) -
          transaction.amountCents,
      );
    }
  }

  categorySummary.textContent = formatSectionSummary(
    spendingCount,
    "expense",
    "expenses",
    "Total spent",
    spendingTotalCents,
  );

  const chartCategories = categoryNames.filter(
    (category) => (totals.get(category) ?? 0) > 0,
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
  expensesTitle.textContent = selectedExpenseCategory
    ? `Expenses and categories: ${selectedExpenseCategory}`
    : "Expenses and categories";
  clearExpenseFilter.hidden = selectedExpenseCategory === null;
  const expenses = chronologicalTransactions(
    allTransactions.filter(
      (transaction) =>
        transaction.isSpend &&
        transaction.amountCents < 0 &&
        transaction.date >= period.startDate &&
        transaction.date < period.endDate &&
        (!selectedExpenseCategory ||
          transaction.category === selectedExpenseCategory),
    ),
  ).reverse();
  const totalSpentCents = expenses.reduce(
    (total, transaction) => total - transaction.amountCents,
    0,
  );
  expensesSummary.textContent = formatSectionSummary(
    expenses.length,
    "expense",
    "expenses",
    "Total spent",
    totalSpentCents,
  );

  expensesBody.replaceChildren();
  if (expenses.length === 0) {
    const row = document.createElement("tr");
    const cell = document.createElement("td");
    cell.colSpan = 4;
    cell.textContent = "No expenses for this period.";
    row.append(cell);
    expensesBody.append(row);
    return;
  }

  for (const transaction of expenses) {
    expensesBody.append(createExpenseRow(transaction));
  }
}

function renderIncome(period: DashboardPeriod): void {
  const incomes = chronologicalTransactions(
    allTransactions.filter(
      (transaction) =>
        transaction.isIncome &&
        transaction.amountCents > 0 &&
        transaction.date >= period.startDate &&
        transaction.date < period.endDate,
    ),
  ).reverse();
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
  const reviewTransactions = chronologicalTransactions(
    allTransactions.filter(
      (transaction) =>
        transaction.isSpend &&
        transaction.amountCents < 0 &&
        transaction.category === "Review" &&
        transaction.date >= period.startDate &&
        transaction.date < period.endDate,
    ),
  ).reverse();

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
  reviewSection.hidden = reviewTransactions.length === 0;
  if (reviewTransactions.length === 0) {
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

  spendingChart = new Chart(spendingCanvas, {
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
    options: chartOptions(true, axisTitle),
  });

  balanceChart = new Chart(balanceCanvas, {
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
    options: chartOptions(false, axisTitle),
  });

  renderCategoryChart(period);
  renderExpenses(period);
  renderIncome(period);
  renderReviewTodos(period);
  status.textContent = "";
}

function renderPeriodOptions(view: PeriodView): void {
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

  periodSelect.value = periodKeyForMonth(latestMonth, view);
  renderPeriod();
}

async function start(): Promise<void> {
  try {
    const response = await fetch("/api/transactions");
    if (!response.ok) {
      throw new Error("Could not load statement data.");
    }

    const payload = (await response.json()) as TransactionResponse;
    allTransactions = payload.transactions;
    accountCount = payload.accounts.length;
    categoryNames = payload.categories;
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

    periodSelect.addEventListener("change", renderPeriod);
    for (const button of periodTabs) {
      button.addEventListener("click", () => {
        const view = button.dataset.periodView;
        if (!isPeriodView(view)) {
          throw new Error("Dashboard contains an invalid period tab.");
        }
        for (const tab of periodTabs) {
          tab.setAttribute("aria-pressed", String(tab === button));
        }
        renderPeriodOptions(view);
      });
    }

    renderPeriodOptions(periodView);
  } catch (error) {
    status.textContent =
      error instanceof Error ? error.message : "Could not load dashboard.";
  }
}

toggleExpensesTable.addEventListener("click", () => {
  setTableExpanded(
    expensesTableWrap,
    toggleExpensesTable,
    expensesTableWrap.hidden,
  );
});
toggleReviewTable.addEventListener("click", () => {
  setTableExpanded(
    reviewTableWrap,
    toggleReviewTable,
    reviewTableWrap.hidden,
  );
});
toggleIncomeTable.addEventListener("click", () => {
  setTableExpanded(incomeTableWrap, toggleIncomeTable, incomeTableWrap.hidden);
});
clearExpenseFilter.addEventListener("click", () => {
  selectedExpenseCategory = null;
  renderExpenses(getSelectedPeriod());
});

void start();
