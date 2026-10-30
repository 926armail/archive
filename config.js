// Откуда брать реестр.
// Вариант А (Google Таблица): Файл → Поделиться → Опубликовать в интернете → лист → CSV,
// вставьте полученную ссылку в SHEET_CSV_URL. Сайт будет читать таблицу напрямую.
// Вариант Б (Excel): оставьте SHEET_CSV_URL пустым и загрузите в репозиторий файл data.csv
// (Excel: Сохранить как → CSV UTF-8).
window.APP_CONFIG = {
  SHEET_CSV_URL: "https://docs.google.com/spreadsheets/d/e/2PACX-1vTyrB2uz2-QBSyb2eTTEsHCITmGaEbQgtdDl9dnTafWRcXQdsLFOEwldIT3iPy_2_tcP5afMSSaueNM/pub?gid=1113589695&single=true&output=csv",
  LOCAL_CSV: "data.csv",
  TITLE: "Поиск папки в архиве"
};
