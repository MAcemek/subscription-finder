# Contributing to Subscription Finder

Thanks for contributing. Please be respectful in issues, reviews and code.

## Never share real bank data

Do not attach real statements or transactions to issues or pull requests, and do not add them to
the repository. If a file is not read correctly, describe its column names and its date and
amount formats, or make a small file with the same layout and made-up values.

## Setup

You need Node.js 22.12 or later (`.nvmrc` says 24).

```bash
npm ci
npm run all
```

`npm run all` runs the format check, lint, type check, tests and build, the same as CI.

| Script              | What it does                                                    |
| ------------------- | --------------------------------------------------------------- |
| `npm run dev`       | Starts the development server.                                  |
| `npm test`          | Runs the tests with Vitest, including a production build check. |
| `npm run lint`      | Runs ESLint.                                                    |
| `npm run format`    | Formats everything with Prettier.                               |
| `npm run typecheck` | Type-checks with `tsc` (no output files).                       |
| `npm run build`     | Builds the site into `dist/`.                                   |
| `npm run preview`   | Serves `dist/` at <http://localhost:4173/subscription-finder/>. |

## How the code is organized

- `src/csv/`: decoding, CSV parsing, and detection of columns, dates and amounts.
- `src/detect/`: merchant names, exclusion rules, combining files and finding recurring
  payments.
- `src/app.ts`: the user interface, built with small DOM helpers from `src/dom.ts`.
- `src/export.ts`, `src/format.ts`, `src/storage.ts`: CSV export, formatting and the optional
  saved checklist.
- `src/sample/sample.csv`: the made-up sample data. `test/sample.test.ts` lists what it should
  find.
- `test/fixtures/csv/`: made-up files in common export layouts.

## Rules

- The app must never make a network request. `test/dist.test.ts` checks the build for links to
  other sites and for network APIs, and the Content-Security-Policy in `vite.config.ts` blocks
  them.
- Set text with `textContent`, never with `innerHTML`. Bank descriptions are untrusted input.
- Keep source files ASCII. Write other characters as `\u` escapes.
- New detection rules need tests, and every result must stay explainable to the user.

## Pull requests

Fill in the pull request template, link the issue you are fixing, and include tests.
