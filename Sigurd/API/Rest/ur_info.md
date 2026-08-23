# ur_info (ЮЛ)

Получение информации по лицевым счетам идентифицированного клиента-юрлица.

## HTTP-запрос

```
GET /api/service/sigurd/ur/{user_id}/info
```

## Параметры пути

| Параметр | Тип | Описание |
|----------|-----|----------|
| `user_id` | string (uuid) | Идентификатор пользователя (UserId из abonents_by_phone / abonents_by_inn) |

## Заголовки

| Заголовок | Значение |
|-----------|----------|
| `Accept` | `application/json` |
| `ES-Request-Source` | `Website` |
| `Authorization` | `Basic <токен>` — значение уточнить у бэкенда ЮЛ |

## Модель ответа

Массив `ContractInfo`:

```
ContractInfo {
  id (string, uuid) — уникальный идентификатор договора
  number (string) — номер договора (ЛС)
  contract_date (string) — дата заключения договора, дд.мм.гггг
  status (string) — статус договора
  service (integer) — код услуги
  service_name (string) — наименование услуги
  department_id (string, uuid) — идентификатор отделения для договора
  division_id (string, uuid) — идентификатор участка для договора
  balance (number) — баланс по договору: отрицательный — долг, положительный — переплата
  business_process_status (string) — статус бизнес-процесса по техприсоединению:
    None | Signing | Checking | UnderConsideration | Signed | Active | Revoked
  is_tech_connection_active (boolean) — активен ли БП ТП по техприсоединению в данный момент
  allowed_actions (Array[string]) — доступные действия по договору
  is_temporary (boolean) — временный (сезонный) договор
  hidden (boolean) — скрытый договор абонента
}
```

## Пример curl

```bash
curl -X GET \
  --header 'Accept: application/json' \
  --header 'ES-Request-Source: Website' \
  --header 'Authorization: Basic <токен>' \
  'https://webapisbytul.dev.enplus.digital/api/service/sigurd/ur/6907038b-9b49-11e4-a084-d8d385e6fca3/info'
```
