# MoneyGo

MoneyGo records spending and assigns a category to each transaction in a CommBank statement.

## Download a statement

The optional TypeScript helper opens NetBank in a visible browser. Sign in and complete any MFA yourself, then select last month's statement and click its download button. CSV and PDF downloads are saved in the `statements` folder here. The helper does not read or store your password, and it does not select the statement for you.

From this folder, install the dependencies and browser once:

```sh
npm install
npx playwright install chromium
```

Then start the helper:

```sh
npm run download:statement
```

Press Ctrl+C in the terminal when you are done. If NetBank does not work in the automated browser, download the statement through your usual browser and save it in this folder instead.

## Categorize spending

The categorizer reads all `.csv` files under `statements/` (including subfolders) in the headerless CommBank format (date, amount, description, balance). It counts negative transactions from card statements as spending, excludes transfers, and does not count transactions from other account files as spending. Other account files are still used to calculate the combined balance from each account's latest statement balance. Merchant keyword matching is case-insensitive. Unmatched card spending is marked `Review`; keyword rules are in `categories.ts`.

Run it from this folder:

```sh
npm run categorize:spends
```

To use specific statement CSV files instead:

```sh
npm run categorize:spends -- statements/card.csv statements/savings.csv
```

The result is written to `spending_log.csv`. The command logs each processing step, lists transfers matched across accounts by same date and equal/opposite amount (counted once), reports card spend, and prints each ending balance plus the combined balance. Unpaired transfers remain excluded from spending but are not included in the matched-transfer total. Review transactions labeled `Review` and add merchant keywords to the rules as needed.

## View monthly charts

To refresh `spending_log.csv` from the statements folder and then start the dashboard:

```sh
npm start
```

Manually downloaded CSVs in `statements/` are scanned each time `npm start` runs. Numbered copies such as `card.csv` and `card_1.csv` are treated as statements for the same account; the account balance comes from the newest transaction across those files. Open [http://127.0.0.1:4173](http://127.0.0.1:4173) in your browser. The month selector lists the months present in all statement files and initially selects the latest month with card spending. The dashboard shows spending from card statements (excluding transfers), daily combined closing balance, and a pie chart of card spending by category, with a consistent distinct color for each category.

Use the category dropdown in the expenses table to change a spend's category. Changes are saved locally in the ignored `category-overrides.json` file, update the category chart, and are reused by the spending categorizer. The dashboard binds only to your computer and does not send statement data to an external service. Stop it with Ctrl+C. After adding or replacing a statement while the dashboard is running, restart with `npm start` and refresh the browser.

To load specific statement CSV files:

```sh
npm run dashboard -- statements/card.csv statements/savings.csv
```

The dashboard expects the headerless CommBank CSV columns: date, amount, description, balance. By default, it loads all `.csv` files under `statements/`. Restart the dashboard after replacing a CSV.

