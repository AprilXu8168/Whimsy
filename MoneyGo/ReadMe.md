# MoneyGo

MoneyGo records spending and assigns a category to each transaction in a CommBank statement.

## Download a statement

The optional TypeScript helper opens NetBank in a visible browser. Sign in and complete any MFA yourself, then select last month's statement and click its download button. CSV and PDF downloads are saved in the `statements` folder here. The helper does not read or store your password, and it does not select the statement for you.

From this folder, install the dependencies and browser once:

```sh
npm install
npx playwright install chromium
```

## Categorize spending

The categorizer reads all `.csv` files under `statements/` (including subfolders) in the headerless CommBank format (date, amount, description, balance). Rows matching on account, date, amount, description, and resulting balance are treated as duplicate exports and counted once. Otherwise-identical transactions with different resulting balances remain separate. It counts negative transactions from card statements as spending, except for transfers matched between the card and savings statements by same date and equal/opposite amount. Unmatched card debits containing “Transfer” remain eligible for spending. Other account transactions are not counted as spending, but are used to calculate the combined balance from each account's latest statement balance. Merchant keyword matching is case-insensitive. Unmatched card spending is marked `Review`; keyword rules are in `categories.ts`.

Run it from this folder:

```sh
npm run categorize:spends
```

To use specific statement CSV files instead:

```sh
npm run categorize:spends -- statements/card.csv statements/savings.csv
```

The result is written to `spending_log.csv`. The command logs each processing step, lists matched card-to-savings transfers (excluded from spending), reports card spend, and prints each ending balance plus the combined balance. Unpaired transfer rows are not included in the matched-transfer total; unmatched card debits remain eligible for spending. Review transactions labeled `Review` and add merchant keywords to the rules as needed.

## View monthly charts

To refresh `spending_log.csv` from the statements folder and then start the dashboard:

```sh
npm start
```

Click a daily spending bar or its date label to filter the expenses table to that date and jump to the table; the category pie chart continues to show totals for the selected period. In quarterly, yearly, or financial-year views, click a monthly bar or label to switch to that month. Click a slice in the category pie chart to additionally filter the expenses table to that category. Click the selected slice again or choose **Show all expenses** to clear the filters. The TODO, income, and expenses tables each have a **Collapse table**/**Expand table** button.

Each table can be sorted independently by clicking its Date or amount column heading; click again to reverse the order. Tables start sorted by newest date first.

Manually downloaded CSVs in `statements/` are scanned each time `npm start` runs. Numbered copies such as `card.csv` and `card_1.csv` are treated as statements for the same account; the account balance comes from the newest transaction across those files. Open the dashboard URL printed in the terminal (normally [http://0.0.0.0:4173](http://0.0.0.0:4173)). If that port is occupied, the server tries the next port. The dashboard has Monthly, Quarterly, Yearly, and Financial year views, and initially selects the latest month with card spending. Quarterly and Financial year periods follow the Australian July-June financial year; Yearly uses calendar years. Monthly charts group by day, and the longer periods group by month. The dashboard shows spending from card statements (excluding transfers), combined closing balances, a pie chart of spending by category with a visible color key and total for each category in the selected period (hover over a slice to see its percentage), and a separate table of positive credits from all accounts excluding transfers. Refunds and interest appear in the credits table. Data sections show their item counts and totals for the selected period.

Use the category dropdown in either the TODO review list or the expenses table to change a spend's category. The TODO list follows the selected dashboard time frame, hides when no matching items remain, removes an item after its category is changed, and omits any `Value Date:` suffix from displayed descriptions. Changes are saved locally in the ignored `category-overrides.json` file, update the category chart, and are reused by the spending categorizer. The dashboard watches the statement directories it loads. After a CSV change is successfully read, its API data reloads and open dashboard pages update automatically within a few seconds. If a CSV is temporarily invalid while being edited, the last successfully loaded data remains available and the page displays the reload error. Stop the server with Ctrl+C.

The dashboard currently listens on all VM network interfaces so another computer can reach it. It has no login, so allow access only from a network you trust. Statement data is not sent to an external service.

To load specific statement CSV files:

```sh
npm run dashboard -- statements/card.csv statements/savings.csv
```

The dashboard expects the headerless CommBank CSV columns: date, amount, description, balance. By default, it loads all `.csv` files under `statements/`. It watches those files and reloads the data when they change; the open page checks for updates every three seconds.

