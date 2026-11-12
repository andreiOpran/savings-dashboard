#!/usr/bin/env python3
"""
Convert the "Economii" sheet of Economii_moto.xlsx into an Economii backup JSON
that the web app can import (Settings → Import backup).

    pip install openpyxl
    python3 scripts/import_xlsx.py Economii_moto.xlsx > economii.json

The output contains personal data: it is git-ignored on purpose, don't commit it.
"""
import json
import re
import sys
import uuid
from datetime import datetime

import openpyxl

REF = re.compile(r"\$?([A-Z]{1,3})\$?(\d+)")


def uid():
    return uuid.uuid4().hex[:8]


def num_str(v):
    if isinstance(v, float) and v.is_integer():
        v = int(v)
    return str(v)


class Sheet:
    def __init__(self, ws, wsv):
        self.ws, self.wsv = ws, wsv

    def text(self, coord):
        v = self.ws[coord].value
        return v.strip() if isinstance(v, str) else v

    def value(self, coord):
        return self.wsv[coord].value

    def expr(self, coord):
        """Keep simple arithmetic formulas as-is; resolve cell refs; fall back to the cached value."""
        raw = self.ws[coord].value
        if raw is None:
            return None
        if not isinstance(raw, str) or not raw.startswith("="):
            return num_str(raw)
        body = raw[1:].strip()
        if re.search(r"[A-Za-z_]{2,}\(", body):  # functions (SUM, GOOGLEFINANCE, …)
            v = self.value(coord)
            return num_str(v) if v is not None else "0"
        body = REF.sub(lambda m: num_str(self.value(f"{m.group(1)}{m.group(2)}") or 0), body)
        return body.replace(" ", "")


def find_header(s, title):
    for cell in s.ws[1]:
        if isinstance(cell.value, str) and cell.value.strip().lower() == title.lower():
            return cell
    return None


def pairs_below(s, header, stop_at_total=True, max_gap=3):
    """Yield (label, expr, row) pairs in header's column and the column to its right."""
    col = header.column_letter
    vcol = openpyxl.utils.get_column_letter(header.column + 1)
    gap = 0
    for r in range(2, s.ws.max_row + 1):
        label = s.text(f"{col}{r}")
        if label in (None, ""):
            gap += 1
            if gap >= max_gap:
                return
            continue
        gap = 0
        if stop_at_total and str(label).lower() == "total":
            return
        yield str(label), s.expr(f"{vcol}{r}") or "0", r


def section_goal(s, title, currency="RON", count=True):
    h = find_header(s, title)
    if not h:
        return None
    items, paid_amounts = [], []
    for label, expr, _ in pairs_below(s, h):
        if label.lower() == "platit":
            inner = expr.lstrip("-").strip("()")
            paid_amounts = [float(x) for x in inner.split("+") if x]
            continue
        items.append({"id": uid(), "label": label, "expr": expr, "paid": False})
    # Turn the "Platit = -(a+b+c)" row into per-item paid flags.
    for amount in paid_amounts:
        for it in items:
            if not it["paid"]:
                try:
                    if abs(float(eval_simple(it["expr"])) - amount) < 0.005:
                        it["paid"] = True
                        break
                except ValueError:
                    pass
    return {"id": uid(), "name": title, "currency": currency, "items": items,
            "countInTotal": count, "archived": False}


def eval_simple(expr):
    if not re.fullmatch(r"[0-9+\-*/(). ]+", expr):
        raise ValueError(expr)
    return eval(expr, {"__builtins__": {}}, {})  # digits/operators only, validated above


def main(path):
    wb = openpyxl.load_workbook(path)
    wv = openpyxl.load_workbook(path, data_only=True)
    s = Sheet(wb["Economii"], wv["Economii"])

    # EUR/RON as last seen by Google Sheets
    eur_ron = 5.0
    if "Stocks" in wv.sheetnames and isinstance(wv["Stocks"]["Q2"].value, (int, float)):
        eur_ron = round(float(wv["Stocks"]["Q2"].value), 4)

    # Salary plan (A1:E2). The sheet converts EUR with a fixed 5. These are the legacy
    # fields; the app turns them into individual exchanges at that rate on import.
    plan = {
        "salaries": int(s.value("A2") or 0),
        "savingsPerSalary": "2500",
        "investPerSalaryEur": "200",
        "xtbFreeEur": s.expr("D2") or "0",
        "eurRate": "5",
    }
    m = re.fullmatch(r"=A2\*(\d+(?:\.\d+)?)", str(s.text("B2") or ""))
    if m:
        plan["savingsPerSalary"] = m.group(1)
    m = re.fullmatch(r"=A2\*(\d+(?:\.\d+)?)", str(s.text("C2") or ""))
    if m:
        plan["investPerSalaryEur"] = m.group(1)

    # De primit
    receivables = []
    h = find_header(s, "DE PRIMIT")
    if h:
        for label, expr, _ in pairs_below(s, h, max_gap=1):
            receivables.append({"id": uid(), "label": label, "expr": expr, "currency": "RON",
                                "received": False})

    # Goals: the simple ones from the Goals list + one goal per detailed section.
    goals = []
    h = find_header(s, "Goals")
    section_titles = {"motor": "Motor Rares", "echipament": "Echipament"}
    if h:
        vcol = openpyxl.utils.get_column_letter(h.column + 1)
        for label, _, r in pairs_below(s, h):
            raw = str(s.text(f"{vcol}{r}") or "")
            key = label.lower()
            if key in section_titles:
                currency = "EUR" if "EURRON" in raw else "RON"
                g = section_goal(s, section_titles[key], currency)
                if g:
                    goals.append(g)
                continue
            body = raw.lstrip("=").replace(" ", "")
            paid = re.fullmatch(r"(.+)-\(\1\)", body)  # "x-(x)" = fully paid
            expr = paid.group(1) if paid else (s.expr(f"{vcol}{r}") or "0")
            goals.append({"id": uid(), "name": label, "currency": "RON",
                          "items": [{"id": uid(), "label": label, "expr": expr, "paid": bool(paid)}],
                          "countInTotal": True, "archived": False})
    # Vacanta is a finished trip kept for reference (and as a template for the next one).
    vac = section_goal(s, "Vacanta", "RON", count=False)
    if vac:
        vac["archived"] = True
        goals.append(vac)

    # History (Data / Actual rows)
    snapshots = []
    for r in range(1, s.ws.max_row + 1):
        if str(s.text(f"A{r}") or "").lower() == "data":
            for c in range(2, s.ws.max_column + 1):
                d = s.ws.cell(r, c).value
                if not isinstance(d, datetime):
                    continue
                coord = f"{openpyxl.utils.get_column_letter(c)}{r + 1}"
                raw = str(s.text(coord) or "")
                # "=32119-E2": accounts total minus the ING salary savings (salary split, E2).
                m = re.fullmatch(r"=\s*(\d+(?:\.\d+)?)\s*-\s*\$?E\$?2\s*", raw)
                if m:
                    snapshots.append({"month": d.strftime("%Y-%m"), "expr": m.group(1),
                                      "ingExpr": num_str(s.value("E2") or 0)})
                    continue
                e = s.expr(coord)
                if e is not None:
                    snapshots.append({"month": d.strftime("%Y-%m"), "expr": e})
            break

    out = {
        "version": 1,
        "settings": {"eurRon": eur_ron, "autoRate": True},
        "plan": plan,
        "receivables": receivables,
        "goals": goals,
        "snapshots": snapshots,
    }
    json.dump(out, sys.stdout, indent=2, ensure_ascii=False)
    print()


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    main(sys.argv[1])
