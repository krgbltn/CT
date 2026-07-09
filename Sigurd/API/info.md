# info

Подробная информация по лицевому счёту: данные владельца, приборы учёта, начисления, баланс, информация о техприсоединении и др.

## HTTP-запрос

```
GET /api/service/sigurd/fl/{user_id}/info
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
UserInfoExtended {
  id (string) — ID ЛС
  first_name (string) — имя
  second_name (string) — отчество
  last_name (string) — фамилия
  phone (string) — номер телефона
  email (string) — электронная почта
  email_doc (boolean) — отправлять квитанции по Email
  email_info (boolean) — информирование по Email
  sms_info (boolean) — информирование по СМС
  send_push (boolean) — отправлять пуш-уведомления
  status (string) — статус лицевого счёта
  account (AccountInfoExtended):
    id (string) — Contract.ID
    number (string) — номер ЛС
    owner (string) — ФИО владельца
    balance (number) — суммарное сальдо
    devices (Array[DeviceInfoWithReadings]) — приборы учёта
    last_bill (BillInfo) — последняя квитанция
    accruals (Array[AccrualInfoPL]) — расшифровка начислений
    house (HouseInfo) — информация о здании
    accounts (Array[AccountServiceInfo]) — договоры и услуги
    ...
  tech_connection_info (PLTechConnectionInfo):
    hasactivebusinessprocess (boolean)
    hasfinishedbusinessprocess (boolean)
    techconnectiondocuments (Array)
    projectdocuments (Array)
}
```

## Пример curl

```bash
curl -X GET \
  --header 'Accept: application/json' \
  --header 'ES-Request-Source: Website' \
  --header 'Authorization: Basic U2lndXJkOjR3KTojQDAycTtvaXVhcTA3MmhhOWczNQ==' \
  'https://webapisbytfl.dev.enplus.digital/api/service/sigurd/fl/6907038b-9b49-11e4-a084-d8d385e6fca3/info'
```

## Пример ответа

```json
{
  "account": {
    "devices": [],
    "payment_links": [],
    "connected_services": [],
    "last_bill": null,
    "specialist_request_services": [],
    "balance": 0,
    "accruals": [],
    "owner": "Черепанова Алена Юрьевна",
    "department_id": "6071895b-da65-4f0a-a2ad-9e163b5c2c06",
    "department_name": "Левобережное отделение (г. Иркутск)",
    "division_id": "f59a8382-235d-11e9-80c2-9457a553d5eb",
    "accounts": [],
    "is_telecom_available": true,
    "has_telecom_account": false,
    "id": "6907038b-9b49-11e4-a084-d8d385e6fca3",
    "abonent_id": "ede44c7c-9af7-11e4-a084-d8d385e6fca3",
    "number": "ЕТСОО167639",
    "house": {
      "address": "664074, обл Иркутская, г Иркутск, ул Чернышевского, дом № 8 кв. 29",
      "area": 80.4,
      "rooms": 3,
      "people": 1,
      "address_object": {
        "full_address": "664074, обл Иркутская, г Иркутск, ул Чернышевского, дом № 8, кв. 29",
        "city": "Иркутск",
        "street": "Чернышевского",
        "street_identifier": "ул",
        "building_number": "8",
        "building_litera": "",
        "building_corp": "",
        "flat_number": "29",
        "city_address": "г. Иркутск, ул. Чернышевского, д. 8, кв. 29",
        "street_address": "ул. Чернышевского, д. 8, кв. 29"
      }
    },
    "is_owner_registered": true,
    "display_name": null,
    "has_active_business_process": false
  },
  "tech_connection_info": {
    "hasactivebusinessprocess": false,
    "hasfinishedbusinessprocess": false,
    "techconnectiondocuments": [],
    "projectdocuments": []
  },
  "id": "6907038b-9b49-11e4-a084-d8d385e6fca3",
  "first_name": "Алена",
  "second_name": "Юрьевна",
  "last_name": "Черепанова",
  "phone": "79025151311",
  "email": "",
  "email_doc": false,
  "email_info": false,
  "sms_info": false,
  "send_push": false,
  "status": "Действует"
}
```
