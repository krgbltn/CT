# device_history

Получить показания по прибору учёта `device_id` по потребителю `user_id` между двумя датами.

## HTTP-запрос

```
GET /api/service/sigurd/fl/{user_id}/device_history/{device_id}
```

## Параметры пути

| Параметр | Тип | Описание |
|----------|-----|----------|
| `user_id` | string | Идентификатор пользователя (UserId) |
| `device_id` | string | Идентификатор прибора учёта |

## Параметры запроса

| Параметр | Тип | Обязательный | Описание |
|----------|-----|-------------|----------|
| `dates.date_from` | string | нет | Начальная дата (date-time) |
| `dates.date_to` | string | нет | Конечная дата (date-time) |

## Заголовки

| Заголовок | Значение |
|-----------|----------|
| `Accept` | `application/json` |
| `ES-Request-Source` | `Website` |
| `Authorization` | `Basic U2lndXJkOjR3KTojQDAycTtvaXVhcTA3MmhhOWczNQ==` |

## Модель ответа

```
Array[TransferInfoReading] {
  id (string) — идентификатор документа
  position (integer) — позиция в документе
  scale (MDScale) — информация о шкале:
    id (string) — идентификатор шкалы
    deviceid (string) — идентификатор прибора учёта
    name (string) — название шкалы
    unit (string) — единица измерения шкалы
    only_consumption (boolean) — только расход, без значения
    before_point (integer) — количество цифр до запятой
    after_point (integer) — количество цифр после запятой
    code (string) — код шкалы 1С
  value (number) — значение показания
  consumption (number) — расход относительно предыдущего показания
  status_transfer (string) — источник показания
  status_enter (string) — статус в АСРН
  approved (boolean) — статус в АСРН (как в БД)
  date (string) — дата передачи показания
  is_deleted (boolean) — признак, что показание было удалено
  deletion_allowed (boolean) — разрешено ли удалять показание
  is_fake (boolean) — признак, что показание добавлено искусственно
}
```

## Пример curl

```bash
curl -X GET \
  --header 'Accept: application/json' \
  --header 'ES-Request-Source: Website' \
  --header 'Authorization: Basic U2lndXJkOjR3KTojQDAycTtvaXVhcTA3MmhhOWczNQ==' \
  'https://webapisbytfl.dev.enplus.digital/api/service/sigurd/fl/6907038b-9b49-11e4-a084-d8d385e6fca3/device_history/00000000-0000-0000-0000-000000000000?dates.date_from=2025-01-01T00:00:00&dates.date_to=2025-12-31T23:59:59'
```
