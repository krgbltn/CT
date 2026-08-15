# specialist_requests

Информация о заявках на вызов специалиста.

## HTTP-запрос

```
GET /api/service/sigurd/fl/{user_id}/specialist_requests
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
Array[OutRequestInfo] {
  id (string) — ИД обращения
  account (string) — номер ЛС
  department (string) — наименование отделения (группы отделений)
  request_date (string) — дата обращения
  account_id (string) — ИД лицевого счёта
  request_type (string) — вид обращения (INVALID / EMAIL / KSRT / SPECIALIST)
  is_cancellable (boolean) — можно ли отменить это обращение
  is_cancelled (boolean) — признак, что обращение отменено
  department_id (string) — ИД отделения (группы отделений)
  answer (string) — предпочитаемый способ получения ответа (INVALID / EMAIL / SMS / RUSSIAN_POST / OFFICE)
  title (string) — тема обращения
  body (string) — тело обращения
  address (string) — адрес потребителя
  email (string) — электронная почта для получения ответа
  phone (string) — номер телефона для получения ответа
  extra_data (Dictionary[string,string]) — дополнительные данные по заявке
}
```

## Пример curl

```bash
curl -X GET \
  --header 'Accept: application/json' \
  --header 'ES-Request-Source: Website' \
  --header 'Authorization: Basic U2lndXJkOjR3KTojQDAycTtvaXVhcTA3MmhhOWczNQ==' \
  'https://webapisbytfl.dev.enplus.digital/api/service/sigurd/fl/6907038b-9b49-11e4-a084-d8d385e6fca3/specialist_requests'
```
