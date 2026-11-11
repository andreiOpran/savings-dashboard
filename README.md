# Economii

A private savings dashboard that replaces the **Economii** sheet of `Economii_moto.xlsx`.

- **Monthly history**: each month record the total in your accounts; the ING salary savings (from the salary split) are subtracted automatically, and de primit is recorded too. Balance = accounts − ING, real total = balance + de primit. Chart of balance, real total, and what the goals need.
- **De primit**: money people owe you, ticked off when received.
- **Goals**: budgets with line items (Motor, Echipament, RCA…), per-item *paid* ticks, RON or EUR, progress bars.
- **Salary split**: the "Numar salariu" block (savings → stocks / XTB / ING).
- Amount fields accept spreadsheet-style formulas: `2600+150`, `51*40`, `250*7+200*4`.
- Live EUR→RON (ECB rate via frankfurter.dev) replaces `GOOGLEFINANCE("CURRENCY:EURRON")`.
- **Past goals**: finished goals (e.g. last summer's Vacanta) are kept for reference, out of the totals; *Use as template* copies one into a new plan.
- **Română / English**: switch in the top bar (react-i18next). Strings live in `src/locales/ro.json` and `src/locales/en.json`; a test keeps both in sync.

## Data & privacy

All data stays in the browser's `localStorage`. Nothing is sent anywhere except the exchange-rate request.
Use **Export backup** regularly; **Import backup** restores it (or moves it to another device).

Personal data files (`*.xlsx`, `economii*.json`, `data/`) are git-ignored — never commit them.

## Importing the spreadsheet

```bash
pip install openpyxl
python3 scripts/import_xlsx.py Economii_moto.xlsx > economii.json
```

Then open the app → **Import backup** → pick `economii.json`.

## Development

```bash
npm install
npm run dev     # http://localhost:5173
npm test        # unit tests (formula evaluator + calculations)
npm run build   # static site in dist/ (relative paths, GitHub Pages-ready)
```

## Using it on your phone (private claude.ai Artifact)

```bash
npm run build:artifact   # → dist/economii-artifact.html, one self-contained page
```

Published as a private Artifact on claude.ai, the app:
- saves your data to a private per-user record on your claude.ai account, so every device you open it on shows the same data (browser storage is only a local cache there);
- exports backups through the claude.ai save dialog;
- uses a hand-typed EUR/RON rate, because hosted pages can't call outside services.

Only the app code is published; your data never goes into the page.

