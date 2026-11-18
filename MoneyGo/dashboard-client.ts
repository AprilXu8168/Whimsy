import Chart from "chart.js/auto";
import type { ChartOptions } from "chart.js";
import type { Category } from "./categories.js";

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
const monthSelect = document.querySelector<HTMLSelectElement>("#month-select");
const status = document.querySelector<HTMLParagraphElement>("#status");
const saveStatus =
  document.querySelector<HTMLParagraphElement>("#save-status");
const balanceSummary =
  document.querySelector<HTMLParagraphElement>("#balance-summary");
const spendingCanvas =
  document.querySelector<HTMLCanvasElement>("#spending-chart");
const balanceCanvas =
  document.querySelector<HTMLCanvasElement>("#balance-chart");
const categoryCanvas =
  document.querySelector<HTMLCanvasElement>("#category-chart");
const expensesBody =
  document.querySelector<HTMLTableSectionElement>("#expenses-body");

if (
  !monthSelect ||
  !status ||
  !saveStatus ||
  !balanceSummary ||
  !spendingCanvas ||
  !balanceCanvas ||
  !categoryCanvas ||
  !expensesBody
) {
  throw new Error("Dashboard page is missing a required element.");
}

let allTransactions: Transaction[] = [];
let categoryNames: Category[] = [];
let spendingChart: Chart | undefined;
let balanceChart: Chart | undefined;
let categoryChart: Chart<"pie", number[], string> | undefined;

const categoryColors: Record<Category, string> = {
  Groceries: "#2e7d32",
  Debt: "#546e7a",
  Dining: "#ef6c00",
  Insurance: "#7b1fa2",
  Transport: "#1565c0",
  Bills: "#c62828",
  Entertainment: "#ad1457",
  Review: "#757575",
};

function monthName(month: string): string {
  const [year, monthNumber] = month.split("-").map(Number);
  return new Intl.DateTimeFormat("en-AU", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, monthNumber - 1, 1)));
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

function monthChartData(month: string): {
  days: number[];
  spending: number[];
  balances: number[];
} {
  const allChronological = chronologicalTransactions(allTransactions);
  const monthStart = `${month}-01`;
  const monthTransactions = allChronological.filter((transaction) =>
    transaction.date.startsWith(month),
  );
  const firstMonthTransaction = monthTransactions[0];

  if (!firstMonthTransaction) {
    throw new Error("No transactions found for the selected month.");
  }

  const accountBalances = new Map<string, number>();
  const accountIds = new Set(allChronological.map(({ account }) => account));
  for (const account of accountIds) {
    const accountTransactions = allChronological.filter(
      (transaction) => transaction.account === account,
    );
    const previousTransaction = accountTransactions
      .filter((transaction) => transaction.date < monthStart)
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
  const [year, monthNumber] = month.split("-").map(Number);
  const daysInMonth = new Date(
    Date.UTC(year, monthNumber, 0),
  ).getUTCDate();
  const spentByDay = new Map<number, number>();
  const transactionsByDay = new Map<number, Transaction[]>();

  for (const transaction of monthTransactions) {
    const day = Number(transaction.date.slice(8, 10));
    if (transaction.isSpend) {
      spentByDay.set(
        day,
        (spentByDay.get(day) ?? 0) +
          Math.max(0, -transaction.amountCents),
      );
    }
    const dayTransactions = transactionsByDay.get(day) ?? [];
    dayTransactions.push(transaction);
    transactionsByDay.set(day, dayTransactions);
  }

  const days = Array.from({ length: daysInMonth }, (_, index) => index + 1);
  const spending = days.map((day) => spentByDay.get(day) ?? 0);
  const balances = days.map((day) => {
    for (const transaction of transactionsByDay.get(day) ?? []) {
      accountBalances.set(transaction.account, transaction.balanceCents);
    }
    return [...accountBalances.values()].reduce(
      (total, balance) => total + balance,
      0,
    );
  });

  return { days, spending, balances };
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

function renderCategoryChart(month: string): void {
  const totals = new Map(categoryNames.map((category) => [category, 0]));

  for (const transaction of allTransactions) {
    if (
      transaction.date.startsWith(month) &&
      transaction.isSpend &&
      transaction.amountCents < 0
    ) {
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
        legend: { display: true, position: "bottom" },
        tooltip: {
          callbacks: {
            label: (context) =>
              `${context.label}: ${currency.format(context.parsed / 100)}`,
          },
        },
      },
    },
  });
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

async function saveCategory(
  transaction: Transaction,
  select: HTMLSelectElement,
  previousCategory: string,
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
    select.value = result.category;
    renderCategoryChart(monthSelect.value);
    saveStatus.textContent = "Category saved on this computer.";
  } catch (error) {
    select.value = previousCategory;
    saveStatus.textContent =
      error instanceof Error ? error.message : "Could not save this category.";
  } finally {
    select.disabled = false;
  }
}

function renderExpenses(month: string): void {
  const expenses = chronologicalTransactions(
    allTransactions.filter(
      (transaction) =>
        transaction.isSpend &&
        transaction.amountCents < 0 &&
        transaction.date.startsWith(month),
    ),
  ).reverse();

  expensesBody.replaceChildren();
  if (expenses.length === 0) {
    const row = document.createElement("tr");
    const cell = document.createElement("td");
    cell.colSpan = 4;
    cell.textContent = "No expenses for this month.";
    row.append(cell);
    expensesBody.append(row);
    return;
  }

  for (const transaction of expenses) {
    const row = document.createElement("tr");
    const dateCell = document.createElement("td");
    dateCell.textContent = formatTransactionDate(transaction.date);
    const descriptionCell = document.createElement("td");
    descriptionCell.textContent = transaction.description;
    const amountCell = document.createElement("td");
    amountCell.className = "amount";
    amountCell.textContent = currency.format(-transaction.amountCents / 100);
    const categoryCell = document.createElement("td");
    const select = document.createElement("select");
    select.className = "category-select";
    select.setAttribute(
      "aria-label",
      `Category for ${transaction.description}`,
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
    expensesBody.append(row);
  }
}

function renderMonth(): void {
  const month = monthSelect.value;
  const { days, spending, balances } = monthChartData(month);
  const labels = days.map(String);

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
    options: chartOptions(true, "Day of month"),
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
    options: chartOptions(false, "Day of month"),
  });

  renderCategoryChart(month);
  renderExpenses(month);
  status.textContent = "";
}

async function start(): Promise<void> {
  try {
    const response = await fetch("/api/transactions");
    if (!response.ok) {
      throw new Error("Could not load statement data.");
    }

    const payload = (await response.json()) as TransactionResponse;
    allTransactions = payload.transactions;
    categoryNames = payload.categories;
    const combinedBalanceCents = payload.accounts.reduce(
      (total, account) => total + account.balanceCents,
      0,
    );
    balanceSummary.textContent =
      `Combined balance (${payload.accounts.length} accounts): ` +
      currency.format(combinedBalanceCents / 100);
    const months = [
      ...new Set(
        allTransactions.map((transaction) => transaction.date.slice(0, 7)),
      ),
    ].sort();

    if (months.length === 0) {
      throw new Error("The statement contains no transactions.");
    }

    for (const month of months) {
      const option = document.createElement("option");
      option.value = month;
      option.textContent = monthName(month);
      monthSelect.append(option);
    }

    const latestSpendingMonth = allTransactions
      .filter((transaction) => transaction.isSpend && transaction.amountCents < 0)
      .map((transaction) => transaction.date.slice(0, 7))
      .sort()
      .at(-1);
    const latestMonth = latestSpendingMonth ?? months.at(-1);
    if (!latestMonth) {
      throw new Error("The statement contains no months.");
    }

    monthSelect.value = latestMonth;
    monthSelect.addEventListener("change", renderMonth);
    renderMonth();
  } catch (error) {
    status.textContent =
      error instanceof Error ? error.message : "Could not load dashboard.";
  }
}

void start();
