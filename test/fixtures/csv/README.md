# CSV fixtures

Every file here is made up: the merchants, account numbers and amounts are invented. The files
copy the structure of common exports (column names, order, delimiters, date and amount formats),
not any real person's data. Each one contains four monthly charges from "Streamflix" on the 5th
of January to April 2026, one incoming payment and some other spending.

| File                                  | Layout                                                                         |
| ------------------------------------- | ------------------------------------------------------------------------------ |
| `us-card-negative-purchases.csv`      | US card: transaction and post dates, purchases negative                        |
| `us-card-positive-purchases.csv`      | US card: date, description, amount, purchases positive                         |
| `us-card-debit-credit-columns.csv`    | US card: ISO dates, card number column, separate debit and credit columns      |
| `us-bank-preamble.csv`                | US bank: summary lines above the header, quoted amounts with thousands commas  |
| `us-bank-no-header.csv`               | US bank: no header row; date, amount, flag, check number, description          |
| `uk-bank-money-out-in.csv`            | UK app bank: day/month dates, name column, amount plus money out and money in  |
| `eu-app-bank-iso-datetime.csv`        | European app bank: dates with times, fee and balance columns                   |
| `eu-app-bank-quoted.csv`              | European app bank: every field quoted, partner name, amount in EUR             |
| `de-bank-semicolon-decimal-comma.csv` | German bank: semicolons, DD.MM.YY dates, decimal comma, many columns           |
| `nl-bank-direction-column.csv`        | Dutch bank: YYYYMMDD dates, positive amounts with an "Af Bij" direction column |
| `fr-bank-semicolon.csv`               | French bank: semicolons, separate debit and credit columns, space thousands    |
| `es-bank-tab-separated.csv`           | Spanish bank: tab separated, decimal comma, balance column                     |
| `it-bank-semicolon.csv`               | Italian bank: semicolons, separate "Uscite" and "Entrate" columns              |
| `pt-bank-semicolon.csv`               | Portuguese bank: semicolons, DD-MM-YYYY dates                                  |
| `generic-month-names.csv`             | Generic: "Jan 5, 2026" dates, payee column, dollar amounts in parentheses      |
