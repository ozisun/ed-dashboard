#!/usr/bin/env python3
"""掃描 data/nhi_ed_YYYY-MM-DD.csv，產生 data/index.json。

日期鍵只取自檔名。本腳本不改 CSV，也不連線健保署。
"""

from __future__ import annotations

import json
import re
import sys
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / "data"
FILENAME = re.compile(r"^nhi_ed_(\d{4}-\d{2}-\d{2})\.csv$")


def collect_dates(data_dir: Path) -> list[str]:
    dates: list[str] = []
    if not data_dir.is_dir():
        return dates
    for path in sorted(data_dir.iterdir()):
        if not path.is_file():
            continue
        match = FILENAME.match(path.name)
        if not match:
            continue
        date = match.group(1)
        try:
            datetime.strptime(date, "%Y-%m-%d")
        except ValueError:
            print(f"略過無效日期檔名：{path.name}", file=sys.stderr)
            continue
        dates.append(date)
    # 新到舊，方便前端預設讀第一筆。
    return sorted(set(dates), reverse=True)


def main() -> None:
    dates = collect_dates(DATA_DIR)
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    out = DATA_DIR / "index.json"
    payload = {"dates": dates}
    out.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(f"wrote {out.relative_to(ROOT)} ({len(dates)} dates)")
    for date in dates:
        print(date)


if __name__ == "__main__":
    main()
