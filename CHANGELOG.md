# Changelog

All notable changes to this project are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project follows
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2026-10-19

### Added

- Single-page app that finds recurring payments in bank and credit card CSV files, entirely in
  the browser, published on GitHub Pages.
- CSV reading with automatic delimiter, encoding, header row, date format and amount format
  detection, column names in seven languages, and a column picker for files it cannot read on
  its own.
- Several files at once, with rows from overlapping exports counted once.
- Weekly, two-weekly, monthly, quarterly and yearly patterns, with subscriptions and bills,
  confidence levels and an explanation for every result.
- Price increases, double charges, recently started subscriptions and patterns that look
  stopped.
- Monthly and yearly totals, a cancel or keep checklist, CSV export and a print layout.
- Optional "Remember my checklist on this device", off by default.
- Bundled made-up sample data, also available at `#sample`.
- A strict Content-Security-Policy that blocks all network requests, and a test that checks the
  build for links to other sites.
