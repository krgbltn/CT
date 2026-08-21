# Агенты интеграций: Проверка сетевой организации

Скрипт: Проверка сетевой организации (общий для всех скриптов)

## Агенты

| № | Агент | ID агента | Статус |
|---|-------|-----------|--------|
| 1 | check_network_organization | check_network_organization | Реализовано |

---

## 1. check_network_organization

Получение данных о сетевой организации по user_id.

Файлы: `check_network_organization.js`, `check_network_organization_settings.json`

Метод API: REST GET /{user_id}/network_organization_data

Входные данные: user_id (из слота, configurable)

Поля ответа:
- Id (string) — идентификатор сетевой организации
- Name (string) — наименование сетевой организации
- Contacts (Array) — способы связи (Telegram / Phone / Email / Max)

JSONPath для slotsMapping:
- network_organization_id = Id

Заполняемые слоты: network_organization_id

targetArticle: из слота next_article (fallback: nextArticle из настроек)

Таблица организаций:

| Id | Name | Description |
|----|------|-------------|
| 1 | ИЭСК (ЮЭС, ВЭС, СЭС, ЦЭС, ЗЭС) | Иркутская электросетевая компания |
| 2 | БЭСК | Братская электросетевая компания |
| 3 | ОКЭ | ОГУЭП Облкоммунэнерго |
| 4 | Другое | Нет нужного источника |

Перевод на оператора при ошибке: /switchredirect aiassist2 intent_id="article-d6585ce7-c4e9-4e42-97d2-bc4142e8ae1d"

---

## Общая информация

Базовый URL API: https://webapisbytfl.dev.enplus.digital

Авторизация: Basic U2lndXJkOjR3KTojQDAycTtvaXVhcTA3MmhhOWczNQ==

Заголовки:
- ES-Request-Source: Website
- Accept: application/json

Статья для перевода на оператора (operatorArticle): article-d6585ce7-c4e9-4e42-97d2-bc4142e8ae1d
