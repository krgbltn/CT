# notifications_heat

Получить уведомления по отключению теплоэнергии, где дата самого отключения больше текущей.

## HTTP-запрос

```
GET /api/service/sigurd/fl/{user_id}/notifications_heat
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
Array[NotificationInfoDisconnection] {
  NotificationDisconnectionType (string) — тип отключения (INVALID / ELECTRO / HEAT)
  DisconnectionStartDate (string) — дата начала отключения
  DisconnectionEndDate (string) — дата конца отключения
  Read (boolean) — флаг, что уведомление прочитано
  IsImportant (boolean) — флаг, что уведомление является важным
  is_delivered (boolean) — флаг, что уведомление доставлено на МП
  Id (string) — идентификатор уведомления
  abonent_id (string) — идентификатор абонента
  Date (string) — дата уведомления
  Content (string) — текст уведомления
  Subject (string) — тема уведомления
  Priority (integer) — приоритет (ниже число — выше приоритет)
}
```

## Пример curl

```bash
curl -X GET \
  --header 'Accept: application/json' \
  --header 'ES-Request-Source: Website' \
  --header 'Authorization: Basic U2lndXJkOjR3KTojQDAycTtvaXVhcTA3MmhhOWczNQ==' \
  'https://webapisbytfl.dev.enplus.digital/api/service/sigurd/fl/6907038b-9b49-11e4-a084-d8d385e6fca3/notifications_heat'
```
