# notifications

Список уведомлений абонента.

## HTTP-запрос

```
GET /api/service/sigurd/fl/{user_id}/notifications
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
NotificationInfo {
  id (string) — идентификатор уведомления
  abonent_id (string) — идентификатор абонента
  date (string) — дата уведомления
  subject (string) — тема уведомления
  content (string) — текст уведомления
  read (boolean) — флаг прочитано/не прочитано
  isimportant (boolean) — флаг важности
  is_delivered (boolean) — флаг доставки на МП
  priority (integer) — приоритет (ниже число — выше приоритет)
}
```

## Пример curl

```bash
curl -X GET \
  --header 'Accept: application/json' \
  --header 'ES-Request-Source: Website' \
  --header 'Authorization: Basic U2lndXJkOjR3KTojQDAycTtvaXVhcTA3MmhhOWczNQ==' \
  'https://webapisbytfl.dev.enplus.digital/api/service/sigurd/fl/6907038b-9b49-11e4-a084-d8d385e6fca3/notifications'
```

## Пример ответа

```json
[
  {
    "read": false,
    "isimportant": true,
    "is_delivered": false,
    "id": "335345dc-d8a1-491d-a660-f2bf54dc6c7a",
    "abonent_id": "ede44c7c-9af7-11e4-a084-d8d385e6fca3",
    "date": "2025-12-16T14:31:00.157",
    "content": "Средний приоритет и важное",
    "subject": "Тест",
    "priority": 400
  },
  {
    "read": false,
    "isimportant": false,
    "is_delivered": false,
    "id": "5c7b287d-6a42-4078-95c5-b3a8562f6324",
    "abonent_id": "ede44c7c-9af7-11e4-a084-d8d385e6fca3",
    "date": "2025-10-24T08:33:08.783",
    "content": "Напоминаем о наличии задолженности в сумме 2699.75 руб. на 24.10.2025 по л/с ЕТСОО167639. Не забудьте произвести оплату. Если Вы уже оплатили долг, то просто закройте это сообщение.",
    "subject": null,
    "priority": 0
  }
]
```
