# Economii

A private savings dashboard that replaces the **Economii** sheet of `Economii_moto.xlsx`.

- **Monthly history**: record your balance *and* de primit each month (real total = balance + de primit); chart of balance, real total, and what the goals need.
- **De primit**: money people owe you, ticked off when received.
- **Goals**: budgets with line items (Motor, Echipament, Vacanta, RCA…), per-item *paid* ticks, RON or EUR, progress bars.
- **Salary split**: the "Numar salariu" block (savings → stocks / XTB / ING).
- Amount fields accept spreadsheet-style formulas: `2600+150`, `51*40`, `250*7+200*4`.
- Live EUR→RON (ECB rate via frankfurter.dev) replaces `GOOGLEFINANCE("CURRENCY:EURRON")`.

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
