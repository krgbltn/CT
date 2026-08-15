# reconciliation_act_data

Получить данные для оформления акта сверки: диапазон дат и элементы для селектора.

## HTTP-запрос

```
GET /api/service/sigurd/fl/{user_id}/reconciliation_act_data
```

## Параметры пути

| Параметр | Тип | Описание |
|----------|-----|----------|
| `user_id` | string | Идентификатор пользователя (UserId) |

## Заголовки

| Заголовок | Значение |
|-----------|----------|
| `Accept` | `application/json` |
| `ES-Request-Source` | `Website` |
| `Authorization` | `Basic U2lndXJkOjR3KTojQDAycTtvaXVhcTA3MmhhOWczNQ==` |

## Модель ответа

```
ReconciliationActInfo {
  contract_id (string) — ИД ЛС
  begin_date_min (string) — минимальная начальная дата для акта сверки
  begin_date_default (string) — начальная дата в дэйтпикере при открытии окна
  end_date_default (string) — конечная дата в дэйтпикере при открытии окна
  selector_label (string) — название поля для выбора контрагента/услуги
  count_peni_default (boolean) — дефолтное значение чекбокса «учитывать пени»
  items (Array[ReconciliationActSelectorItem]) — элементы для выбора в селекторе:
    name (string) — наименование для отображения в селекторе
    value (string) — значение для отправки на сервер
}
```

## Пример curl

```bash
curl -X GET \
  --header 'Accept: application/json' \
  --header 'ES-Request-Source: Website' \
  --header 'Authorization: Basic U2lndXJkOjR3KTojQDAycTtvaXVhcTA3MmhhOWczNQ==' \
  'https://webapisbytfl.dev.enplus.digital/api/service/sigurd/fl/6907038b-9b49-11e4-a084-d8d385e6fca3/reconciliation_act_data'
```
