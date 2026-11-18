export type PeriodView =
  | "monthly"
  | "quarterly"
  | "yearly"
  | "financial-year";

export type DashboardPeriod = {
  view: PeriodView;
  key: string;
  label: string;
  startDate: string;
  endDate: string;
  bucketMonths: string[];
};

function nextMonth(month: string, count = 1): string {
  const [year, monthNumber] = month.split("-").map(Number);
  const date = new Date(Date.UTC(year, monthNumber - 1 + count, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function monthName(month: string): string {
  const [year, monthNumber] = month.split("-").map(Number);
  return new Intl.DateTimeFormat("en-AU", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, monthNumber - 1, 1)));
}

function financialYearLabel(startYear: number): string {
  return `FY ${startYear}-${String(startYear + 1).slice(-2)}`;
}

export function periodKeyForMonth(
  month: string,
  view: PeriodView,
): string {
  const match = /^(\d{4})-(\d{2})$/.exec(month);
  if (!match) {
    throw new Error(`Invalid month: ${month}`);
  }

  const year = Number(match[1]);
  const monthNumber = Number(match[2]);
  if (monthNumber < 1 || monthNumber > 12) {
    throw new Error(`Invalid month: ${month}`);
  }

  switch (view) {
    case "monthly":
      return month;
    case "quarterly": {
      const financialYearStart = monthNumber >= 7 ? year : year - 1;
      const quarter = Math.floor(((monthNumber + 5) % 12) / 3) + 1;
      return `${financialYearStart}-Q${quarter}`;
    }
    case "yearly":
      return String(year);
    case "financial-year":
      return String(monthNumber >= 7 ? year : year - 1);
  }
}

function createPeriod(view: PeriodView, key: string): DashboardPeriod {
  let startMonth: string;
  let endMonth: string;
  let label: string;

  switch (view) {
    case "monthly":
      startMonth = key;
      endMonth = nextMonth(key);
      label = monthName(key);
      break;
    case "quarterly": {
      const match = /^(\d{4})-Q([1-4])$/.exec(key);
      if (!match) throw new Error(`Invalid quarter: ${key}`);
      const financialYearStart = Number(match[1]);
      const quarter = Number(match[2]);
      const startMonthNumber = [7, 10, 1, 4][quarter - 1];
      const startYear = quarter < 3 ? financialYearStart : financialYearStart + 1;
      startMonth = `${startYear}-${String(startMonthNumber).padStart(2, "0")}`;
      endMonth = nextMonth(startMonth, 3);
      label = `Q${quarter} ${financialYearLabel(financialYearStart)}`;
      break;
    }
    case "yearly":
      startMonth = `${key}-01`;
      endMonth = `${Number(key) + 1}-01`;
      label = key;
      break;
    case "financial-year": {
      const startYear = Number(key);
      startMonth = `${key}-07`;
      endMonth = `${startYear + 1}-07`;
      label = financialYearLabel(startYear);
      break;
    }
  }

  const startDate = `${startMonth}-01`;
  const endDate = `${endMonth}-01`;
  const bucketMonths: string[] = [];
  for (let month = startMonth; month < endMonth; month = nextMonth(month)) {
    bucketMonths.push(month);
  }

  return { view, key, label, startDate, endDate, bucketMonths };
}

export function getPeriods(
  months: readonly string[],
  view: PeriodView,
): DashboardPeriod[] {
  const keys = [...new Set(months.map((month) => periodKeyForMonth(month, view)))].sort();
  return keys.map((key) => createPeriod(view, key));
}
