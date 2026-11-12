# Economii — savings dashboard

A private, single-user web app that replaced the "Economii" sheet of a personal
spreadsheet. It tracks a monthly balance, money owed to the owner ("de primit"),
goals, and how saved salaries are split between a bank account (ING), stocks and
a broker's free funds (XTB). Currency is RON, with some amounts in EUR.

The owner uses it mostly from a phone, in Romanian. Keep the domain words they
use: **De primit**, **Goals**, **Sold**, ING, XTB.

## Commands

```bash
npm install
npm run dev             # local dev server
npm test                # vitest: formulas, calculations, migrations, translations
npm run build           # typecheck + static build in dist/
npm run build:artifact  # dist/economii-artifact.html: one self-contained page
```

Run `npx tsc -b && npm test` before committing. Work happens on the branch
`claude/economii-web-app-08t83m`.

## Never commit personal data

The repo holds code only. `.gitignore` excludes `*.xlsx`, `economii*.json` and
`data/`. Do not put real names, amounts or balances in source, tests, placeholders
or docs; use neutral examples. Before publishing the artifact page, grep it for
personal values.

## Layout of the code

| File | Role |
|---|---|
| `src/types.ts` | Data model (`AppData`): settings, plan (salaries + XTB exchanges), receivables, goals, snapshots |
| `src/calc.ts` | All money maths: goal stats, history rows, salary split, `setReceived` |
| `src/expr.ts` | Safe arithmetic evaluator; amount fields accept `2600+150`, `51*40` (no `eval`) |
| `src/storage.ts` | Load/save, backup import/export, **migrations** of older data formats, cloud sync |
| `src/runtime.ts` | Bridge to the claude.ai Artifact runtime (`window.claude`); everything is `null` elsewhere |
| `src/i18n.ts`, `src/locales/{ro,en}.json` | react-i18next; every UI string lives in the two JSON files |
| `src/components/` | `History` (month form + months table), `HistoryChart` (hand-written SVG), `Goals`, `Receivables`, `SalaryPlan` (summary + salary/XTB logs), `ExprInput`, `ConfirmButton` |
| `scripts/import_xlsx.py` | Converts the original spreadsheet to a backup JSON |
| `scripts/build-artifact.mjs` | Inlines the build into one HTML page for publishing |

## How the numbers work

- **Month (snapshot)**: stores the total in all accounts (`expr`), the ING
  deduction (`ingExpr`), de primit for that month (`receivablesExpr`) and the goals
  total at the time (`goals`).
  `balance = accounts − ING`, `real total = balance + de primit`,
  `free after goals = real total − goals`.
- **Why ING is subtracted**: salary savings kept on ING are not counted in the
  balance. The salary split computes that amount; the month form pre-fills it.
- **Salary split**: each salary is a monthly entry (lei saved, € invested, rate
  paid). XTB transfers are separate exchanges with their own rate. Rates are fixed
  once logged. `ING = total saved − Σ(€ × own rate) for investments and XTB`.
- **De primit**: ticking an entry moves its amount from de primit into the current
  month's accounts, as visible formula terms (`…+2750`, `…-2750`), so the real
  total does not change. **Unticking means "owes me again"** and must not touch
  past months; only the Undo button shown right after a tick reverses the move.
- **Goals**: items are ticked when paid; a negative item is money received towards
  the goal. Archived ("past") goals are kept for reference, out of all totals, and
  can be copied as a template.
- **Fallbacks**: a month without `receivablesExpr` or `goals` uses today's value.
  New months always store their own.

## Rules that are easy to break

- **Migrations**: stored data may be in any older format. `parseData` must upgrade
  it without changing computed totals (notably the ING amount), and be idempotent.
  Add a test for every format change.
- **Translations**: add each new string to both `ro.json` and `en.json`. Romanian
  plurals need `_one`, `_few` and `_other`. `i18n.test.ts` fails otherwise.
- **No `alert`/`confirm`/`prompt`**: the hosted viewer never shows them. Use
  `ConfirmButton` (two-step delete) or an inline bar.
- **No clipped text or sideways scroll**: labels wrap (`TextInput` is an
  auto-growing textarea), amount inputs size to their content. Check at 360px.
- **Responsive layout**: below 860px one section shows at a time, picked from the
  bottom tab bar (`data-section` / `data-tab`). On desktop the rows are: summary
  tiles, chart, Goals (full width), De primit | salary summary (equal height),
  salaries + XTB logs (full width), months table.
- **Colours** come from CSS tokens in `styles.css`, defined for light and dark.

## Hosting

The app is published as a private claude.ai Artifact:
https://claude.ai/artifact/M5nkKZrffNPpzHn6KG7Gpq

- Built with `npm run build:artifact`, then published to that same URL with the
  capabilities `db`, `user` and `downloads`.
- There, data syncs to the viewer's private record (`data/users/<id>/economii`,
  a document `{ json, savedAt }`), so phone and laptop share it. `localStorage` is
  the cache, and the only storage when run elsewhere.
- Hosted pages cannot call outside services, so EUR/RON is typed by hand there;
  elsewhere it is fetched from frankfurter.dev.
- A plain `npm run build` also works on any static host; without a backend each
  browser keeps its own data. Self-hosting on a VPS (Tailscale, small sync backend)
  was discussed but not built.

## Ideas discussed, not built yet

1. A guided "monthly check-in": salary, then accounts total, then de primit review.
2. Paying a goal item should subtract from the current month's accounts (mirror of
   the de primit behaviour), with undo.
3. Per-account balances instead of one typed total.
4. "Needs attention" reminders on the overview (month or salary not recorded).
5. Partial payments for de primit and goal items.
6. Tappable summary tiles and chart points that open the matching section.
7. A quick-add button on phones; section links in the desktop top bar.
8. Past months' "free after goals" still follows today's goals total unless the
   month stored its own.
