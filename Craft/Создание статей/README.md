# Craft-Talk: импорт статей и примеров вопросов

Рабочая база знаний по External API Craft-Talk для проекта **asopov** (Сигурд).
Используется, когда приходит задача «добавить статьи в базу знаний» (обычно из Excel).

## Как пользоваться (быстрый старт)

1. Прочитать `docs/1_структура_базы_знаний.md` и `docs/4_workflow_импорта.md`.
2. Взять данные: ProjectId, CatalogCode (через `GET /catalog/catalogs`, пример — `reference/catalogs.json`),
   токен, Excel (маппинг колонок).
3. Скопировать `scripts/config.example.json` → `config_<источник>.json`, заполнить.
4. Запустить импорт:
   ```powershell
   $env:CRAFTTALK_TOKEN='<токен>'
   python scripts/import_from_excel.py scripts/config_21vek.json --limit 2   # сухой прогон
   python scripts/import_from_excel.py scripts/config_21vek.json            # полный
   ```
5. Проверить: `python scripts/check_state.py scripts/config_21vek.json --tree`.
   Пересобрать CSV-отчёт по фактическому состоянию:
   `python scripts/check_state.py scripts/config_21vek.json --report import_report.csv`
   (в отчёте, пересобранном по состоянию, нет MarkupBatchId — батчи разметки API не отдаёт;
   батчи есть только в отчёте самого импорта).
6. Отчёт импорта — CSV (в конфиге `report`).

## Структура папки

```
Создание статей\
├── README.md                         этот файл
├── docs\
│   ├── 1_структура_базы_знаний.md    каталоги/категории/статьи, иерархия, Id vs SymbolCode
│   ├── 2_api_методы.md               методы API + тела запросов
│   ├── 3_грабли_и_ограничения.md     баги и обходы (читать обязательно!)
│   └── 4_workflow_импорта.md         пошаговый порядок импорта
├── scripts\
│   ├── crafttalk_client.py           клиент API (токен из env, urllib, payload)
│   ├── import_from_excel.py          универсальный импорт (Excel → статьи + разметка)
│   ├── check_state.py                проверка дерева и счётчиков
│   ├── config.example.json           шаблон конфига
│   └── config_21vek.json             готовый конфиг последнего импорта (21 век)
└── reference\
    ├── external_v0_swagger.json      OpenAPI-спецификация external API
    ├── catalogs.json                 ответ GET /catalog/catalogs
    └── официальная_документация_API.md  текст docx «Работа с базой знаний»
```

## Ключевые факты (кратко)

- Хост: `https://cloud.craft-talk.ru/api/external`, авторизация `Bearer <token>`.
- Токен — только через env `CRAFTTALK_TOKEN`, не хранить в файлах/коде.
- Темы-контейнеры публикуются (Active); вложенные статьи-вопросы остаются черновиками (Draft).
- «Примеры вопросов» = **разметка интентов** (`POST /markup/add` по `IntentSymbolCode` статьи).
- Поле `Questions[]` в `article/update` на проде не работает (500) — не использовать.
- `ParentItemId` вложенной статьи = **Id категории** из `/catalog/categories` (не `Article.Id`).
- Детали и все грабли — в `docs/3_грабли_и_ограничения.md`.

## Последний выполненный импорт (референс)

- 17 тем (Active) + 109 статей-вопросов (Draft) + 1650 фраз разметки в каталог
  `classifier-19d9ad70-4cbc-4857-87e7-258c0af93eff`, ExtSourceId=`21vek`.
- Отчёт: `D:\сигурд\21 век\import_report.csv`.
- Рабочий (частный) вариант скрипта: `D:\сигурд\21 век\import_21vek_to_crafttalk.py`.
