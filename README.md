# 奇美急診壅塞儀表板

純靜態網站，彙整衛生福利部中央健康保險署公開的重度級急救責任醫院急診即時資料，比較永康奇美與成大醫院的待住院、待加護病房人數。非官方彙整，僅供內部管理參考。

部署後網址：<https://ozisun.github.io/ed-dashboard/>

## 目錄

- `index.html`、`assets/`：儀表板（原生 HTML / CSS / JavaScript，沒有建置步驟）
- `data/nhi_ed_YYYY-MM-DD.csv`：每日原始資料，請保持檔案內容不變（含醫院代碼前導 0）
- `data/index.json`：日期清單，由腳本產生
- `scripts/build_index.py`：掃描 CSV 檔名並寫出 `data/index.json`（只使用 Python 標準函式庫）
- `.github/workflows/pages.yml`：推送到 `main` 時部署 GitHub Pages

## 每天更新

新增一個檔案即可：

```text
data/nhi_ed_YYYY-MM-DD.csv
```

檔名中的日期就是該天的日期鍵（CSV 裡的「抓取日期」格式若略有不同，網站會略過、仍以檔名為準）。commit 並推送到 `main` 後，GitHub Actions 會執行 `python scripts/build_index.py`，再部署整個靜態站（含 `data/`）。不需要、也不要在 Actions 裡抓取健保署資料。

本機可先產生索引：

```bash
python3 scripts/build_index.py
```

## 排名

只在人數有數字的醫院中計算。空白不列入（目前為台大兒醫、馬偕兒醫、彰基兒醫、中國兒醫）。名次 = 1 + 人數嚴格大於該院的醫院數，同數字並列同名次。人數為 0 時只顯示「0 人」，不顯示排名。

## GitHub Pages

此流程以 GitHub Actions 部署。若網站沒有出現，請到儲存庫 **Settings → Pages**，將 **Source** 設為 **GitHub Actions**。
