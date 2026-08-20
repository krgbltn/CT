# Sigurd — методы API (REST и SOAP)

Единый справочник по методам интеграции Sigurd. Интеграция состоит из двух независимых поверхностей:

| Поверхность | Сервис | Транспорт |
|-------------|--------|-----------|
| **REST API** | `webapisbytfl.dev.enplus.digital` | HTTP JSON |
| **SOAP API** | `https://asuse-test.ie.corp/IVR.asmx` | SOAP 1.1 XML |

---

# REST API (ФЛ)

Базовый URL:

```
https://webapisbytfl.dev.enplus.digital
```

## Общие заголовки REST

| Заголовок | Значение |
|-----------|----------|
| `Accept` | `application/json` |
| `ES-Request-Source` | `Website` |
| `Authorization` | `Basic U2lndXJkOjR3KTojQDAycTtvaXVhcTA3MmhhOWczNQ==` |

## Сводная таблица REST

| Метод | URL | Описание |
|-------|-----|----------|
| GET | `/api/service/sigurd/fl/contracts_by_phone?phone={phone}` | Поиск договоров по номеру телефона |
| GET | `/api/service/sigurd/fl/contracts_by_number?number={number}` | Получение идентификаторов ЛС по номеру ЛС (только для Витрины КЦ) |
| GET | `/api/service/sigurd/fl/contracts_by_number_lastname?number={number}&lastName={lastName}` | Получение идентификаторов ЛС по номеру ЛС и фамилии |
| GET | `/api/service/sigurd/fl/contracts_by_address` | Получение идентификаторов ЛС по адресу (только для Витрины КЦ) |
| GET | `/api/service/sigurd/fl/contracts_by_address_lastname` | Получение идентификаторов ЛС по адресу и фамилии |
| GET | `/api/service/sigurd/fl/{user_id}/disconnections_heat` | Информация об отключении горячего водоснабжения (ТЭ) |
| GET | `/api/service/sigurd/fl/{user_id}/disconnections_electro` | Информация об отключении электроэнергии (ЭЭ) |
| GET | `/api/service/sigurd/fl/{user_id}/info` | Подробная информация по лицевому счёту |
| GET | `/api/service/sigurd/fl/{user_id}/disconnection_report_info` | Информация для создания заявки на отключение |
| POST | `/api/service/sigurd/fl/{user_id}/disconnection_report_info` | Оформление заявки в КСРТ |
| GET | `/api/service/sigurd/fl/{user_id}/device_history/{device_id}` | Показания по прибору учёта за период |
| GET | `/api/service/sigurd/fl/{user_id}/transactions` | Взаиморасчёты по лицевому счёту |
| GET | `/api/service/sigurd/fl/{user_id}/notifications` | Список уведомлений абонента |
| GET | `/api/service/sigurd/fl/{user_id}/notifications_electro` | Уведомления об отключении электроэнергии |
| GET | `/api/service/sigurd/fl/{user_id}/notifications_heat` | Уведомления об отключении теплоэнергии |
| GET | `/api/service/sigurd/fl/{user_id}/devices` | Информация о приборах учёта |
| GET | `/api/service/sigurd/fl/{user_id}/specialist_requests` | Заявки на вызов специалиста |
| GET | `/api/service/sigurd/fl/{user_id}/ksrt_requests` | Заявки КСРТ |
| POST | `/api/service/sigurd/fl/{user_id}/cancel_ksrt/{request_id}` | Отмена заявки в КСРТ |
| GET | `/api/service/sigurd/fl/{user_id}/network_organization_data` | Данные о сетевой организации |
| POST | `/api/service/sigurd/fl/{user_id}/send_account_number` | Отправка номера лицевого счёта |
| GET | `/api/service/sigurd/fl/{user_id}/reconciliation_act_data` | Данные для оформления акта сверки |
| POST | `/api/service/sigurd/fl/{user_id}/reconciliation_act` | Оформить акт сверки |

---

## contracts_by_phone

Поиск договоров (лицевых счетов) по номеру телефона.

```
GET /api/service/sigurd/fl/contracts_by_phone?phone={phone}
```

### Параметры запроса

| Параметр | Тип | Обязательный | Описание |
|----------|-----|-------------|----------|
| `phone` | string | да | Номер телефона (например, 79025151311) |

### Модель ответа

```
CustomerObjectAuthData {
  WebProperties (CustomerContractObjectAuthData, optional):
    Address (string) — адрес ЛС
    ContractNo (string) — номер ЛС
    GroupId (string) — идентификатор группы ЛС
  UserId (string) — идентификатор пользователя
  IsRegistered (boolean) — признак регистрации пользователя
}
```

### Пример curl

```bash
curl -X GET \
  --header 'Accept: application/json' \
  --header 'ES-Request-Source: Website' \
  --header 'Authorization: Basic U2lndXJkOjR3KTojQDAycTtvaXVhcTA3MmhhOWczNQ==' \
  'https://webapisbytfl.dev.enplus.digital/api/service/sigurd/fl/contracts_by_phone?phone=79025151311'
```

### Пример ответа

```json
[
  {
    "WebProperties": {
      "Address": "664074, обл Иркутская, г Иркутск, ул Чернышевского, дом № 8 кв. 29",
      "ContractNo": "ЕТСОО167639",
      "GroupId": null
    },
    "UserId": "6907038b-9b49-11e4-a084-d8d385e6fca3",
    "IsRegistered": true
  },
  {
    "WebProperties": {
      "Address": "666025, обл Иркутская, р-н Шелеховский, с Шаманка, ул Набережная, дом № 3 кв. 2",
      "ContractNo": "ШСРО00076005",
      "GroupId": "df2402f0-cb31-47d1-8e94-6bbb5a75e1ab"
    },
    "UserId": "480d16ad-d596-11e2-b3f3-001f29ceb871",
    "IsRegistered": true
  }
]
```

---

## contracts_by_number

Получение идентификаторов лицевых счетов по номеру ЛС (только для Витрины КЦ).

```
GET /api/service/sigurd/fl/contracts_by_number?number={number}
```

### Параметры запроса

| Параметр | Тип | Обязательный | Описание |
|----------|-----|-------------|----------|
| `number` | string | да | Номер лицевого счёта |

### Модель ответа

```
Array[CustomerObjectAuthData] {
  WebProperties (CustomerContractObjectAuthData, optional):
    Address (string) — адрес ЛС
    ContractNo (string) — номер ЛС
    GroupId (string) — идентификатор группы ЛС
  UserId (string) — идентификатор пользователя
  IsRegistered (boolean) — признак регистрации пользователя
}
```

### Пример curl

```bash
curl -X GET \
  --header 'Accept: application/json' \
  --header 'ES-Request-Source: Website' \
  --header 'Authorization: Basic U2lndXJkOjR3KTojQDAycTtvaXVhcTA3MmhhOWczNQ==' \
  'https://webapisbytfl.dev.enplus.digital/api/service/sigurd/fl/contracts_by_number?number=ЕТСОО167639'
```

---

## contracts_by_number_lastname

Получение идентификаторов лицевых счетов по номеру ЛС и фамилии.

```
GET /api/service/sigurd/fl/contracts_by_number_lastname?number={number}&lastName={lastName}
```

### Параметры запроса

| Параметр | Тип | Обязательный | Описание |
|----------|-----|-------------|----------|
| `number` | string | да | Номер лицевого счёта |
| `lastName` | string | да | Фамилия |

### Модель ответа

```
Array[CustomerObjectAuthData] {
  WebProperties (CustomerContractObjectAuthData, optional):
    Address (string) — адрес ЛС
    ContractNo (string) — номер ЛС
    GroupId (string) — идентификатор группы ЛС
  UserId (string) — идентификатор пользователя
  IsRegistered (boolean) — признак регистрации пользователя
}
```

### Пример curl

```bash
curl -X GET \
  --header 'Accept: application/json' \
  --header 'ES-Request-Source: Website' \
  --header 'Authorization: Basic U2lndXJkOjR3KTojQDAycTtvaXVhcTA3MmhhOWczNQ==' \
  'https://webapisbytfl.dev.enplus.digital/api/service/sigurd/fl/contracts_by_number_lastname?number=ЕТСОО167639&lastName=Черепанова'
```

---

## contracts_by_address

Получение идентификаторов лицевых счетов по адресу (только для Витрины КЦ).

```
GET /api/service/sigurd/fl/contracts_by_address?requestModel.cityName={cityName}&requestModel.streetName={streetName}&requestModel.houseName={houseName}
```

### Параметры запроса

| Параметр | Тип | Обязательный | Описание |
|----------|-----|-------------|----------|
| `requestModel.cityName` | string | да | Наименование города |
| `requestModel.streetName` | string | да | Наименование улицы |
| `requestModel.houseName` | string | да | Наименование дома |
| `requestModel.corpName` | string | нет | Наименование корпуса дома |
| `requestModel.flatName` | string | нет | Наименование квартиры |
| `requestModel.search_all_flats` | boolean | нет | Искать по всем квартирам |

### Модель ответа

```
Array[CustomerObjectAuthData] {
  WebProperties (CustomerContractObjectAuthData, optional):
    Address (string) — адрес ЛС
    ContractNo (string) — номер ЛС
    GroupId (string) — идентификатор группы ЛС
  UserId (string) — идентификатор пользователя
  IsRegistered (boolean) — признак регистрации пользователя
}
```

### Пример curl

```bash
curl -X GET \
  --header 'Accept: application/json' \
  --header 'ES-Request-Source: Website' \
  --header 'Authorization: Basic U2lndXJkOjR3KTojQDAycTtvaXVhcTA3MmhhOWczNQ==' \
  'https://webapisbytfl.dev.enplus.digital/api/service/sigurd/fl/contracts_by_address?requestModel.cityName=Иркутск&requestModel.streetName=Чернышевского&requestModel.houseName=8'
```

---

## contracts_by_address_lastname

Получение идентификаторов лицевых счетов по адресу и фамилии.

```
GET /api/service/sigurd/fl/contracts_by_address_lastname?lastName={lastName}&requestModel.cityName={cityName}&requestModel.streetName={streetName}&requestModel.houseName={houseName}
```

### Параметры запроса

| Параметр | Тип | Обязательный | Описание |
|----------|-----|-------------|----------|
| `lastName` | string | да | Фамилия |
| `requestModel.cityName` | string | да | Наименование города |
| `requestModel.streetName` | string | да | Наименование улицы |
| `requestModel.houseName` | string | да | Наименование дома |
| `requestModel.corpName` | string | нет | Наименование корпуса дома |
| `requestModel.flatName` | string | нет | Наименование квартиры |
| `requestModel.search_all_flats` | boolean | нет | Искать по всем квартирам |

### Модель ответа

```
Array[CustomerObjectAuthData] {
  WebProperties (CustomerContractObjectAuthData, optional):
    Address (string) — адрес ЛС
    ContractNo (string) — номер ЛС
    GroupId (string) — идентификатор группы ЛС
  UserId (string) — идентификатор пользователя
  IsRegistered (boolean) — признак регистрации пользователя
}
```

### Пример curl

```bash
curl -X GET \
  --header 'Accept: application/json' \
  --header 'ES-Request-Source: Website' \
  --header 'Authorization: Basic U2lndXJkOjR3KTojQDAycTtvaXVhcTA3MmhhOWczNQ==' \
  'https://webapisbytfl.dev.enplus.digital/api/service/sigurd/fl/contracts_by_address_lastname?lastName=Черепанова&requestModel.cityName=Иркутск&requestModel.streetName=Чернышевского&requestModel.houseName=8'
```

---

## disconnections_heat

Информация об отключении горячего водоснабжения (ГВС) по лицевому счёту.

```
GET /api/service/sigurd/fl/{user_id}/disconnections_heat
```

### Параметры пути

| Параметр | Тип | Описание |
|----------|-----|----------|
| `user_id` | string | Идентификатор пользователя (UserId) |

### Модель ответа

```
CustomerDisconnectionsSurveyModel {
  disconnection (CustomerDisconnectionsSurveyDisconnection, optional):
    text (string) — текст для отображения в МП
    address (string) — адрес
    type (string) — вид (ELECTRO / HEAT / INVALID)
    work_type (string) — вид работ (аварийные, плановые)
    date_start (string) — дата начала отключения (строка)
    date_start_dt (string) — дата начала отключения (DateTime)
    date_end (string) — дата окончания отключения (строка)
    date_end_dt (string) — дата окончания отключения (DateTime)
    duration (string) — длительность
  house_type (string) — вид здания (OTHER / MKD / PRIVATE)
  debt (boolean) — наличие ограничения в связи с задолженностью
}
```

### Пример curl

```bash
curl -X GET \
  --header 'Accept: application/json' \
  --header 'ES-Request-Source: Website' \
  --header 'Authorization: Basic U2lndXJkOjR3KTojQDAycTtvaXVhcTA3MmhhOWczNQ==' \
  'https://webapisbytfl.dev.enplus.digital/api/service/sigurd/fl/6907038b-9b49-11e4-a084-d8d385e6fca3/disconnections_heat'
```

### Пример ответа

```json
{
  "disconnection": {
    "text": "Отключение горячего водоснабжения по Вашему адресу проводится с 13.06.2023 10:00 до 12.02.2030 00:00. Причина: Плановое отключение.",
    "address": "г Иркутск, ул Чернышевского, дом № 8",
    "type": "HEAT",
    "work_type": "Плановое отключение",
    "date_start": "13.06.2023 10:00",
    "date_start_dt": "2023-06-13T10:00:00",
    "date_end": "12.02.2030 00:00",
    "date_end_dt": "2030-02-12T00:00:00",
    "duration": ""
  },
  "house_type": "MKD",
  "debt": false
}
```

---

## disconnections_electro

Информация об отключении электроэнергии (ЭЭ) по лицевому счёту.

```
GET /api/service/sigurd/fl/{user_id}/disconnections_electro
```

### Параметры пути

| Параметр | Тип | Описание |
|----------|-----|----------|
| `user_id` | string | Идентификатор пользователя (UserId) |

### Модель ответа

```
CustomerDisconnectionsSurveyModel {
  disconnection (CustomerDisconnectionsSurveyDisconnection, optional):
    text (string) — текст для отображения в МП
    address (string) — адрес
    type (string) — вид (ELECTRO / HEAT / INVALID)
    work_type (string) — вид работ (аварийные, плановые)
    date_start (string) — дата начала отключения (строка)
    date_start_dt (string) — дата начала отключения (DateTime)
    date_end (string) — дата окончания отключения (строка)
    date_end_dt (string) — дата окончания отключения (DateTime)
    duration (string) — длительность
  house_type (string) — вид здания (OTHER / MKD / PRIVATE)
  debt (boolean) — наличие ограничения в связи с задолженностью
}
```

### Пример curl

```bash
curl -X GET \
  --header 'Accept: application/json' \
  --header 'ES-Request-Source: Website' \
  --header 'Authorization: Basic U2lndXJkOjR3KTojQDAycTtvaXVhcTA3MmhhOWczNQ==' \
  'https://webapisbytfl.dev.enplus.digital/api/service/sigurd/fl/6907038b-9b49-11e4-a084-d8d385e6fca3/disconnections_electro'
```

### Пример ответа

```json
{
  "disconnection": null,
  "house_type": "MKD",
  "debt": false
}
```

---

## info

Подробная информация по лицевому счёту: данные владельца, приборы учёта, начисления, баланс, информация о техприсоединении и др.

```
GET /api/service/sigurd/fl/{user_id}/info
```

### Параметры пути

| Параметр | Тип | Описание |
|----------|-----|----------|
| `user_id` | string | Идентификатор пользователя (UserId) |

### Модель ответа

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

### Пример curl

```bash
curl -X GET \
  --header 'Accept: application/json' \
  --header 'ES-Request-Source: Website' \
  --header 'Authorization: Basic U2lndXJkOjR3KTojQDAycTtvaXVhcTA3MmhhOWczNQ==' \
  'https://webapisbytfl.dev.enplus.digital/api/service/sigurd/fl/6907038b-9b49-11e4-a084-d8d385e6fca3/info'
```

### Пример ответа

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

---

## disconnection_report_info — GET

Информация для создания заявки на отключение: данные об отключении, контакты сетевой организации, признак доступности подачи заявки в КСРТ.

```
GET /api/service/sigurd/fl/{user_id}/disconnection_report_info
```

### Параметры пути

| Параметр | Тип | Описание |
|----------|-----|----------|
| `user_id` | string | Идентификатор пользователя (UserId) |

### Модель ответа

```
DisconnectionRequestInfo {
  contractid (string) — идентификатор договора
  contractno (string) — номер договора (ЛС)
  phone (string) — контактный телефон
  housetype (string) — тип дома (OTHER / MKD / PRIVATE)
  disconnection (CustomerDisconnectionsSurveyDisconnection, optional):
    text (string) — текст для отображения
    address (string) — адрес
    type (string) — вид (ELECTRO / HEAT / INVALID)
    work_type (string) — вид работ
    date_start (string) — дата начала
    date_end (string) — дата окончания
  hasrequest (boolean) — признак наличия актуальной заявки
  requesttext (string) — текст сообщения при наличии заявки
  request_allowed (boolean) — доступно ли создание заявки в КСРТ
  network_organization_data (DisconnectionRequestNetworkOrganizationData):
    request_allowed (boolean)
    network_organization_contacts (Array[NetworkOrganizationContact]):
      networkorganizationid (string)
      contact_type (string) — Telegram / Phone
      contact (string) — значение способа связи
      message (string) — сообщение перед способом связи
  address (string) — адрес
}
```

### Пример curl

```bash
curl -X GET \
  --header 'Accept: application/json' \
  --header 'ES-Request-Source: Website' \
  --header 'Authorization: Basic U2lndXJkOjR3KTojQDAycTtvaXVhcTA3MmhhOWczNQ==' \
  'https://webapisbytfl.dev.enplus.digital/api/service/sigurd/fl/6907038b-9b49-11e4-a084-d8d385e6fca3/disconnection_report_info'
```

### Пример ответа

```json
{
  "contractid": "6907038b-9b49-11e4-a084-d8d385e6fca3",
  "contractno": "ЕТСОО167639",
  "phone": "79025151311",
  "housetype": "MKD",
  "disconnection": null,
  "hasrequest": false,
  "requesttext": "",
  "network_organization_data": {
    "request_allowed": false,
    "network_organization_contacts": [
      {
        "networkorganizationid": "00000000-0000-0000-0000-000000000000",
        "contact_type": "Phone",
        "contact": "8-800-100-9777",
        "message": "Просьба обратиться в контакт-центр"
      }
    ]
  },
  "request_allowed": false,
  "address": "664074, обл Иркутская, г Иркутск, ул Чернышевского, дом № 8 кв. 29"
}
```

---

## disconnection_report_info — POST

Оформление заявки в КСРТ.

```
POST /api/service/sigurd/fl/{user_id}/disconnection_report_info
```

### Параметры пути

| Параметр | Тип | Описание |
|----------|-----|----------|
| `user_id` | string | Идентификатор пользователя (UserId) |

### Тело запроса

```
DisconnectionRequestData {
  isbuilding (boolean) — отсутствие э/э во всём доме/у соседей тоже
  iscounter (boolean) — об отключении счётчика
  isfrequent (boolean) — о частых отключениях (readOnly, считается от Message)
  message (string) — дополнительная информация (INVALID / NoPower / FrequentShutdowns / Other / LightFlashes / NoPhase / LowVoltage)
  comment (string) — комментарий
  phone (string) — номер телефона
}
```

### Модель ответа

Без тела ответа (status 200 OK).

### Пример curl

```bash
curl -X POST \
  --header 'Accept: application/json' \
  --header 'Content-Type: application/json' \
  --header 'ES-Request-Source: Website' \
  --header 'Authorization: Basic U2lndXJkOjR3KTojQDAycTtvaXVhcTA3MmhhOWczNQ==' \
  --data '{
    "isbuilding": false,
    "iscounter": false,
    "message": "NoPower",
    "comment": "",
    "phone": "79025151311"
  }' \
  'https://webapisbytfl.dev.enplus.digital/api/service/sigurd/fl/6907038b-9b49-11e4-a084-d8d385e6fca3/disconnection_report_info'
```

---

## device_history

Получить показания по прибору учёта `device_id` по потребителю `user_id` между двумя датами.

```
GET /api/service/sigurd/fl/{user_id}/device_history/{device_id}
```

### Параметры пути

| Параметр | Тип | Описание |
|----------|-----|----------|
| `user_id` | string | Идентификатор пользователя (UserId) |
| `device_id` | string | Идентификатор прибора учёта |

### Параметры запроса

| Параметр | Тип | Обязательный | Описание |
|----------|-----|-------------|----------|
| `dates.date_from` | string | нет | Начальная дата (date-time) |
| `dates.date_to` | string | нет | Конечная дата (date-time) |

### Модель ответа

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

### Пример curl

```bash
curl -X GET \
  --header 'Accept: application/json' \
  --header 'ES-Request-Source: Website' \
  --header 'Authorization: Basic U2lndXJkOjR3KTojQDAycTtvaXVhcTA3MmhhOWczNQ==' \
  'https://webapisbytfl.dev.enplus.digital/api/service/sigurd/fl/6907038b-9b49-11e4-a084-d8d385e6fca3/device_history/00000000-0000-0000-0000-000000000000?dates.date_from=2025-01-01T00:00:00&dates.date_to=2025-12-31T23:59:59'
```

---

## transactions

Взаиморасчёты по лицевому счёту с ID `{user_id}`: расшифровка сальдо и квитанции.

```
GET /api/service/sigurd/fl/{user_id}/transactions
```

### Параметры пути

| Параметр | Тип | Описание |
|----------|-----|----------|
| `user_id` | string | Идентификатор пользователя (UserId) |

### Модель ответа

```
UserTransactionsResponse {
  transactions (Array[TransactionInfoPL]) — взаиморасчёты:
    transactions (Array[TransactionsFL]) — взаиморасчёты по месяцам:
      date (string) — дата начала месяца
      payment (number) — оплачено
      accrual (number) — начислено
    accountid (string) — идентификатор ЛС (GDS.ContractId)
    account (string) — «Договор» (GDS.No)
    subcontractor (string) — короткое наименование контрагента
    debt (number) — задолженность (+ => долг, - => переплата)
    signature (string) — текст строчки
    signature_mobile (string) — текст строки для МП
    signature_debt (string) — текст строки «Задолженность», «Задолженность, в т.ч. пени», «Переплата»
    service_name (string) — наименование услуги
  bills (Array[BillInfo]) — квитанции
}
```

### Пример curl

```bash
curl -X GET \
  --header 'Accept: application/json' \
  --header 'ES-Request-Source: Website' \
  --header 'Authorization: Basic U2lndXJkOjR3KTojQDAycTtvaXVhcTA3MmhhOWczNQ==' \
  'https://webapisbytfl.dev.enplus.digital/api/service/sigurd/fl/6907038b-9b49-11e4-a084-d8d385e6fca3/transactions'
```

---

## notifications

Список уведомлений абонента.

```
GET /api/service/sigurd/fl/{user_id}/notifications
```

### Параметры пути

| Параметр | Тип | Описание |
|----------|-----|----------|
| `user_id` | string | Идентификатор пользователя (UserId) |

### Модель ответа

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

### Пример curl

```bash
curl -X GET \
  --header 'Accept: application/json' \
  --header 'ES-Request-Source: Website' \
  --header 'Authorization: Basic U2lndXJkOjR3KTojQDAycTtvaXVhcTA3MmhhOWczNQ==' \
  'https://webapisbytfl.dev.enplus.digital/api/service/sigurd/fl/6907038b-9b49-11e4-a084-d8d385e6fca3/notifications'
```

### Пример ответа

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

---

## notifications_electro

Получить уведомления по отключению электроэнергии, где дата самого отключения больше текущей.

```
GET /api/service/sigurd/fl/{user_id}/notifications_electro
```

### Параметры пути

| Параметр | Тип | Описание |
|----------|-----|----------|
| `user_id` | string | Идентификатор пользователя (UserId) |

### Модель ответа

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

### Пример curl

```bash
curl -X GET \
  --header 'Accept: application/json' \
  --header 'ES-Request-Source: Website' \
  --header 'Authorization: Basic U2lndXJkOjR3KTojQDAycTtvaXVhcTA3MmhhOWczNQ==' \
  'https://webapisbytfl.dev.enplus.digital/api/service/sigurd/fl/6907038b-9b49-11e4-a084-d8d385e6fca3/notifications_electro'
```

---

## notifications_heat

Получить уведомления по отключению теплоэнергии, где дата самого отключения больше текущей.

```
GET /api/service/sigurd/fl/{user_id}/notifications_heat
```

### Параметры пути

| Параметр | Тип | Описание |
|----------|-----|----------|
| `user_id` | string | Идентификатор пользователя (UserId) |

### Модель ответа

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

### Пример curl

```bash
curl -X GET \
  --header 'Accept: application/json' \
  --header 'ES-Request-Source: Website' \
  --header 'Authorization: Basic U2lndXJkOjR3KTojQDAycTtvaXVhcTA3MmhhOWczNQ==' \
  'https://webapisbytfl.dev.enplus.digital/api/service/sigurd/fl/6907038b-9b49-11e4-a084-d8d385e6fca3/notifications_heat'
```

---

## devices

Информация о приборах учёта по лицевому счёту с последним показанием.

```
GET /api/service/sigurd/fl/{user_id}/devices
```

### Параметры пути

| Параметр | Тип | Описание |
|----------|-----|----------|
| `user_id` | string | Идентификатор пользователя (UserId) |

### Модель ответа

```
Array[DeviceInfoWithReadings] {
  last_reading (TransferInfo, optional) — последние показания по ПУ:
    readings (Array[TransferInfoReading]) — показания
    reading_slot_wrapper (IReadingSlotWrapper) — слот для показаний
  id (string) — идентификатор ПУ
  number (string) — серийный номер ПУ
  type (string) — название типа ПУ
  scales (Array[MDScale]) — список шкал
  trans_factor (number) — коэффициент трансформации (для электросчётчиков)
  accuracy (string) — точность ПУ (процент погрешности)
  phases (integer) — количество фаз (для электросчётчиков)
  installed (string) — дата установки (для установленных), дата снятия (для снятых)
  installed_string (string) — дата установки/снятия (строка для отображения)
  checked (string) — дата последней поверки
  checked_string (string) — дата последней поверки (строка для отображения)
  next_check (string) — дата следующей поверки
  next_check_string (string) — дата следующей поверки (строка для отображения)
  service_code (integer) — код услуги
  service_name (string) — наименование услуги
  parent_name (string) — наименование родительской услуги
  service_alias_id (string) — идентификатор подключенной услуги (ContractAlias)
  service_active (boolean) — включена или отключена услуга
  installation_place (string) — место установки
  guid_position (string) — ИД позиции на энергоустановке
  owners (Array[Owner]) — лицо, ответственное за эксплуатацию
  is_smart (boolean) — интеллектуальный счётчик — да/нет
  status (string) — статус ПУ
  accepts_readings (boolean) — признак, что прибор может принимать показания
  is_interval (boolean) — признак, что прибор учёта является интервальным
  energy_kind (string) — тип энергии (для юрлиц)
  address (string) — «Объект учёта» — адрес
  is_complex (boolean) — является ли комплексным прибором учёта
  readings_accept_type (string) — принимает ли ПУ показания (расширенная версия)
  readings_accept_type_text (string) — объяснение, почему ПУ не принимает показания
  is_hot_water (boolean) — признак горячего водоснабжения
  is_installed (boolean) — признак, что прибор физически стоит на трубе
  is_permitted (boolean) — признак, что прибор допущен к эксплуатации (ЮЛ)
  admission_status (string) — статус допуска к эксплуатации (текстом)
  allow_vodomer (boolean) — разрешить распознавание показаний на стороне МП
  show_electric_info (boolean) — флаг для МП (фазность/коэф. трансформации)
  custom_name (string) — пользовательское наименование ПУ
  display_name (string) — отображаемое имя (по алгоритму)
  seal_number (string) — номер пломбы
  seal_location (string) — место установки пломбы
  seal_installed (boolean) — признак, что пломба установлена
}
```

### Пример curl

```bash
curl -X GET \
  --header 'Accept: application/json' \
  --header 'ES-Request-Source: Website' \
  --header 'Authorization: Basic U2lndXJkOjR3KTojQDAycTtvaXVhcTA3MmhhOWczNQ==' \
  'https://webapisbytfl.dev.enplus.digital/api/service/sigurd/fl/6907038b-9b49-11e4-a084-d8d385e6fca3/devices'
```

---

## specialist_requests

Информация о заявках на вызов специалиста.

```
GET /api/service/sigurd/fl/{user_id}/specialist_requests
```

### Параметры пути

| Параметр | Тип | Описание |
|----------|-----|----------|
| `user_id` | string | Идентификатор пользователя (UserId) |

### Модель ответа

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

### Пример curl

```bash
curl -X GET \
  --header 'Accept: application/json' \
  --header 'ES-Request-Source: Website' \
  --header 'Authorization: Basic U2lndXJkOjR3KTojQDAycTtvaXVhcTA3MmhhOWczNQ==' \
  'https://webapisbytfl.dev.enplus.digital/api/service/sigurd/fl/6907038b-9b49-11e4-a084-d8d385e6fca3/specialist_requests'
```

---

## ksrt_requests

Информация о заявках КСРТ.

```
GET /api/service/sigurd/fl/{user_id}/ksrt_requests
```

### Параметры пути

| Параметр | Тип | Описание |
|----------|-----|----------|
| `user_id` | string | Идентификатор пользователя (UserId) |

### Модель ответа

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

### Пример curl

```bash
curl -X GET \
  --header 'Accept: application/json' \
  --header 'ES-Request-Source: Website' \
  --header 'Authorization: Basic U2lndXJkOjR3KTojQDAycTtvaXVhcTA3MmhhOWczNQ==' \
  'https://webapisbytfl.dev.enplus.digital/api/service/sigurd/fl/6907038b-9b49-11e4-a084-d8d385e6fca3/ksrt_requests'
```

---

## cancel_ksrt

Отменить заявку в КСРТ.

```
POST /api/service/sigurd/fl/{user_id}/cancel_ksrt/{request_id}
```

### Параметры пути

| Параметр | Тип | Описание |
|----------|-----|----------|
| `user_id` | string | Идентификатор пользователя (UserId) |
| `request_id` | string | Идентификатор заявки |

### Модель ответа

Без тела ответа (status 200 OK).

### Пример curl

```bash
curl -X POST \
  --header 'Accept: application/json' \
  --header 'ES-Request-Source: Website' \
  --header 'Authorization: Basic U2lndXJkOjR3KTojQDAycTtvaXVhcTA3MmhhOWczNQ==' \
  'https://webapisbytfl.dev.enplus.digital/api/service/sigurd/fl/6907038b-9b49-11e4-a084-d8d385e6fca3/cancel_ksrt/00000000-0000-0000-0000-000000000000'
```

---

## network_organization_data

Получить данные о сетевой организации для «Витрины КЦ».

```
GET /api/service/sigurd/fl/{user_id}/network_organization_data
```

### Параметры пути

| Параметр | Тип | Описание |
|----------|-----|----------|
| `user_id` | string | Идентификатор пользователя (UserId) |

### Модель ответа

```
NetworkOrganizationDataContactCenter {
  Id (string) — идентификатор сетевой организации
  Name (string) — наименование сетевой организации
  Contacts (Array[NetworkOrganizationContact]) — способы связи с сетевой организацией:
    networkorganizationid (string) — идентификатор сетевой организации (для связи ApiSettings и 1C)
    contact_type (string) — вид способа связи (Telegram / Phone / Email / Max)
    contact (string) — значение способа связи
    message (string) — сообщение перед способом связи
}
```

### Пример curl

```bash
curl -X GET \
  --header 'Accept: application/json' \
  --header 'ES-Request-Source: Website' \
  --header 'Authorization: Basic U2lndXJkOjR3KTojQDAycTtvaXVhcTA3MmhhOWczNQ==' \
  'https://webapisbytfl.dev.enplus.digital/api/service/sigurd/fl/6907038b-9b49-11e4-a084-d8d385e6fca3/network_organization_data'
```

---

## send_account_number

Отправить номер лицевого счёта на контактные данные (email или смс).

```
POST /api/service/sigurd/fl/{user_id}/send_account_number
```

### Параметры пути

| Параметр | Тип | Описание |
|----------|-----|----------|
| `user_id` | string | Идентификатор пользователя (UserId) |

### Тело запроса

```
CustomerContact {
  target (string) — значение контактных данных
  target_type (string) — вид контактных данных (INVALID / EMAIL / SMS)
}
```

### Модель ответа

Без тела ответа (status 200 OK).

### Пример curl

```bash
curl -X POST \
  --header 'Accept: application/json' \
  --header 'Content-Type: application/json' \
  --header 'ES-Request-Source: Website' \
  --header 'Authorization: Basic U2lndXJkOjR3KTojQDAycTtvaXVhcTA3MmhhOWczNQ==' \
  --data '{
    "target": "79025151311",
    "target_type": "SMS"
  }' \
  'https://webapisbytfl.dev.enplus.digital/api/service/sigurd/fl/6907038b-9b49-11e4-a084-d8d385e6fca3/send_account_number'
```

---

## reconciliation_act_data

Получить данные для оформления акта сверки: диапазон дат и элементы для селектора.

```
GET /api/service/sigurd/fl/{user_id}/reconciliation_act_data
```

### Параметры пути

| Параметр | Тип | Описание |
|----------|-----|----------|
| `user_id` | string | Идентификатор пользователя (UserId) |

### Модель ответа

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

### Пример curl

```bash
curl -X GET \
  --header 'Accept: application/json' \
  --header 'ES-Request-Source: Website' \
  --header 'Authorization: Basic U2lndXJkOjR3KTojQDAycTtvaXVhcTA3MmhhOWczNQ==' \
  'https://webapisbytfl.dev.enplus.digital/api/service/sigurd/fl/6907038b-9b49-11e4-a084-d8d385e6fca3/reconciliation_act_data'
```

---

## reconciliation_act

Оформить акт сверки: отправить акт на указанный email.

```
POST /api/service/sigurd/fl/{user_id}/reconciliation_act
```

### Параметры пути

| Параметр | Тип | Описание |
|----------|-----|----------|
| `user_id` | string | Идентификатор пользователя (UserId) |

### Тело запроса

```
ReconciliationActRequestModel {
  selected_value (string) — выбранная цель для акта сверки (услуга/поставщик услуг/получатель платежа)
  email (string) — электронная почта, на которую надо направить акт
  count_peni (boolean) — флаг «Учитывать пени»
  date_from (string) — стартовая дата
  date_to (string) — конечная дата
  startdatenormalized (string) — нормализованная стартовая дата (начало дня)
  enddatenormalized (string) — нормализованная конечная дата (конец дня)
  enddatenormalizedsql (string) — нормализованная конечная дата с обнулёнными миллисекундами
}
```

### Модель ответа

Без тела ответа (status 200 OK).

### Пример curl

```bash
curl -X POST \
  --header 'Accept: application/json' \
  --header 'Content-Type: application/json' \
  --header 'ES-Request-Source: Website' \
  --header 'Authorization: Basic U2lndXJkOjR3KTojQDAycTtvaXVhcTA3MmhhOWczNQ==' \
  --data '{
    "selected_value": "",
    "email": "user@example.com",
    "count_peni": false,
    "date_from": "2025-01-01T00:00:00",
    "date_to": "2025-12-31T00:00:00"
  }' \
  'https://webapisbytfl.dev.enplus.digital/api/service/sigurd/fl/6907038b-9b49-11e4-a084-d8d385e6fca3/reconciliation_act'
```

---

# SOAP API (IVR.asmx)

SOAP-сервис: `https://asuse-test.ie.corp/IVR.asmx` (SOAP 1.1).

## Общие заголовки SOAP

| Заголовок | Значение |
|-----------|----------|
| `Content-Type` | `text/xml; charset=utf-8` |
| `SOAPAction` | `http://tempuri.org/<Метод>` |

## Базовая структура запроса (SOAP 1.1)

```xml
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:tem="http://tempuri.org/">
  <soapenv:Header/>
  <soapenv:Body>
    <tem:<Метод>>
      <tem:<Параметр1>значение</tem:<Параметр1>>
    </tem:<Метод>>
  </soapenv:Body>
</soapenv:Envelope>
```

## Сводная таблица SOAP

| Метод | Параметры запроса | Назначение |
|-------|-------------------|------------|
| `FindAllByContractNumber` | `contractNumberDigits` | Поиск ЛС по цифровой части номера |
| `GetContractsInfo_By_Phone` | `PhoneNumber` | Поиск ЛС по номеру телефона |
| `GetContractsBalance_ByPhoneNumber` | `phoneNumber` | Баланс по ЛС абонента (телефон) с разбивкой по поставщикам и услугам |
| `GetContractsBalance_ByContractID` | `ContractID` | Баланс по ЛС (ID) с разбивкой по поставщикам и услугам |
| `GetMDInfo_By_ContractIDAndNomenclatureCode` | `ContractStrGUID`, `NomenclatureCode` | Информация о приборе учёта (серийный номер, шкалы, показания) |
| `GetMDsWarningInfo_ByTel` | `telephoneNumber` | Предупреждения по приборам учёта (телефон) |
| `GetMDsWarningInfo_ByContractID` | `contractID` | Предупреждения по приборам учёта (ЛС) |
| `InputOfReadingsWithDot` | `MDScale_ID`, `MDScale_NewReadings` | Передача показаний по шкале ПУ |

---

## FindAllByContractNumber

Поиск лицевых счетов (договоров) по номеру ЛС (цифровой части).

```
POST https://asuse-test.ie.corp/IVR.asmx
SOAPAction: http://tempuri.org/FindAllByContractNumber
```

### Параметры метода

| Параметр | Тип | Обязательный | Описание |
|----------|-----|-------------|----------|
| `contractNumber` | string | нет | Номер ЛС (вместе с префиксом, напр. `КСОО00041893`) |
| `contractNumberDigits` | string | да* | Цифровая часть номера ЛС (напр. `41893`) |

> **Примечание.** В итоге используется параметр `contractNumberDigits` — поиск по цифровой части номера. Параметр `contractNumber` (полный номер) не заполняется.

### Пример запроса (SOAP 1.1)

```xml
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:tem="http://tempuri.org/">
  <soapenv:Header/>
  <soapenv:Body>
    <tem:FindAllByContractNumber>
      <tem:contractNumberDigits>41893</tem:contractNumberDigits>
    </tem:FindAllByContractNumber>
  </soapenv:Body>
</soapenv:Envelope>
```

### Модель ответа

```
FindAllByContractNumberResult {
  ContractInfo[] {
    ID (string) — идентификатор ЛС
    No (string) — номер ЛС
    Adress (string) — адрес
    City (string) — населённый пункт
    Residents (integer) — количество проживающих
    FullArea (number) — общая площадь
    DateUpdate (string) — дата обновления
    Stove (string) — тип плиты
    Status (string) — статус ЛС
    AbonentName (string) — фамилия абонента
    FirstName (string) — имя
    Patronimic (string) — отчество
    DivisionID (string) — идентификатор отделения
  }
}
```

### Пример ответа

```xml
<FindAllByContractNumberResponse xmlns="http://tempuri.org/">
  <FindAllByContractNumberResult>
    <ContractInfo>
      <ID>4a6722c6-9235-11e2-8708-0050569b0089</ID>
      <No>41893</No>
      <Adress>Улица Приморская, дом 61, квартира 74</Adress>
      <City>Энергетик</City>
      <Residents>4</Residents>
      <FullArea>65.10</FullArea>
      <DateUpdate>2026-03-13T09:30:03.72</DateUpdate>
      <Stove>Электрическая</Stove>
      <Status>Действует</Status>
      <AbonentName>Евгений</AbonentName>
      <FirstName>Соколов</FirstName>
      <Patronimic>Васильевич</Patronimic>
      <DivisionID>d343ff05-91ee-11e2-8708-0050569b0089</DivisionID>
    </ContractInfo>
  </FindAllByContractNumberResult>
</FindAllByContractNumberResponse>
```

### Пример curl

```bash
curl -X POST https://asuse-test.ie.corp/IVR.asmx \
  -H "Content-Type: text/xml; charset=utf-8" \
  -H "SOAPAction: http://tempuri.org/FindAllByContractNumber" \
  -d '<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:tem="http://tempuri.org/">
        <soapenv:Header/>
        <soapenv:Body>
          <tem:FindAllByContractNumber>
            <tem:contractNumberDigits>41893</tem:contractNumberDigits>
          </tem:FindAllByContractNumber>
        </soapenv:Body>
      </soapenv:Envelope>'
```

---

## GetContractsInfo_By_Phone

Поиск лицевых счетов (договоров) по номеру телефона.

```
POST https://asuse-test.ie.corp/IVR.asmx
SOAPAction: http://tempuri.org/GetContractsInfo_By_Phone
```

### Параметры метода

| Параметр | Тип | Обязательный | Описание |
|----------|-----|-------------|----------|
| `PhoneNumber` | string | да | Номер телефона (напр. `89501074005`) |

### Пример запроса (SOAP 1.1)

```xml
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:tem="http://tempuri.org/">
  <soapenv:Header/>
  <soapenv:Body>
    <tem:GetContractsInfo_By_Phone>
      <tem:PhoneNumber>89501074005</tem:PhoneNumber>
    </tem:GetContractsInfo_By_Phone>
  </soapenv:Body>
</soapenv:Envelope>
```

### Модель ответа

```
GetContractsInfo_By_PhoneResult {
  ContractInfo[] {
    ID (string) — идентификатор ЛС
    No (string) — номер ЛС
    Adress (string) — адрес
    City (string) — населённый пункт
    Residents (integer) — количество проживающих
    FullArea (number) — общая площадь
    DateUpdate (string) — дата обновления
    Stove (string) — тип плиты
    Status (string) — статус ЛС
    AbonentName (string) — фамилия абонента
    FirstName (string) — имя
    Patronimic (string) — отчество
    DivisionID (string) — идентификатор отделения
  }
}
```

### Пример ответа

```xml
<GetContractsInfo_By_PhoneResponse xmlns="http://tempuri.org/">
  <GetContractsInfo_By_PhoneResult>
    <ContractInfo>
      <ID>f0e4aeb2-9318-11e2-8708-0050569b0089</ID>
      <No>ХХ06Т0002706</No>
      <Adress>Улица Лозовая, дом 3</Adress>
      <City>Братск</City>
      <Residents>2</Residents>
      <FullArea>205.60</FullArea>
      <DateUpdate>2026-03-13T10:00:50.623</DateUpdate>
      <Stove>Электрическая</Stove>
      <Status>Действует</Status>
      <AbonentName>Елена</AbonentName>
      <FirstName>Молчанова</FirstName>
      <Patronimic>Николаевна</Patronimic>
      <DivisionID>81632451-16f5-11e4-90a7-d8d385e60d7d</DivisionID>
    </ContractInfo>
  </GetContractsInfo_By_PhoneResult>
</GetContractsInfo_By_PhoneResponse>
```

### Пример curl

```bash
curl -X POST https://asuse-test.ie.corp/IVR.asmx \
  -H "Content-Type: text/xml; charset=utf-8" \
  -H "SOAPAction: http://tempuri.org/GetContractsInfo_By_Phone" \
  -d '<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:tem="http://tempuri.org/">
        <soapenv:Header/>
        <soapenv:Body>
          <tem:GetContractsInfo_By_Phone>
            <tem:PhoneNumber>89501074005</tem:PhoneNumber>
          </tem:GetContractsInfo_By_Phone>
        </soapenv:Body>
      </soapenv:Envelope>'
```

---

## GetContractsBalance_ByPhoneNumber

Баланс (задолженность/переплата) по всем лицевым счетам абонента, привязанным к номеру телефона, с разбивкой по поставщикам и группам услуг.

```
POST https://asuse-test.ie.corp/IVR.asmx
SOAPAction: http://tempuri.org/GetContractsBalance_ByPhoneNumber
```

### Параметры метода

| Параметр | Тип | Обязательный | Описание |
|----------|-----|-------------|----------|
| `phoneNumber` | string | да | Номер телефона (напр. `89025165900`) |

### Пример запроса (SOAP 1.1)

```xml
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema">
  <soap:Body>
    <GetContractsBalance_ByPhoneNumber xmlns="http://tempuri.org/">
      <phoneNumber>89025165900</phoneNumber>
    </GetContractsBalance_ByPhoneNumber>
  </soap:Body>
</soap:Envelope>
```

### Модель ответа

```
GetContractsBalance_ByPhoneNumberResult {
  ContractAddressAndBalanceByDicServiceGroupAndContragent[] {
    ContractNumber (string) — номер ЛС
    Settlement (string) — населённый пункт
    Address (string) — адрес
    ContragentName (string) — наименование контрагента (поставщика)
    DicServiceGroupName (string) — группа услуг (электро/тепло/водоотведение и т.д.)
    Balance (number) — баланс по данной услуге
  }
}
```

### Пример ответа

```xml
<GetContractsBalance_ByPhoneNumberResponse xmlns="http://tempuri.org/">
  <GetContractsBalance_ByPhoneNumberResult>
    <ContractAddressAndBalanceByDicServiceGroupAndContragent>
      <ContractNumber>147727</ContractNumber>
      <Settlement>Иркутск</Settlement>
      <Address>Иркутск, Улица Лермонтова, дом 81, 21, квартира 83</Address>
      <ContragentName>ООО "Иркутскэнергосбыт"</ContragentName>
      <DicServiceGroupName>По услуге электроснабжения</DicServiceGroupName>
      <Balance>0.00</Balance>
    </ContractAddressAndBalanceByDicServiceGroupAndContragent>
    <ContractAddressAndBalanceByDicServiceGroupAndContragent>
      <ContractNumber>147727</ContractNumber>
      <Settlement>Иркутск</Settlement>
      <Address>Иркутск, Улица Лермонтова, дом 81, 21, квартира 83</Address>
      <ContragentName>другими поставщиками услуг</ContragentName>
      <DicServiceGroupName>По услуге теплоснабжения</DicServiceGroupName>
      <Balance>0.00</Balance>
    </ContractAddressAndBalanceByDicServiceGroupAndContragent>
  </GetContractsBalance_ByPhoneNumberResult>
</GetContractsBalance_ByPhoneNumberResponse>
```

### Пример curl

```bash
curl -X POST https://asuse-test.ie.corp/IVR.asmx \
  -H "Content-Type: text/xml; charset=utf-8" \
  -H "SOAPAction: http://tempuri.org/GetContractsBalance_ByPhoneNumber" \
  -d '<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema">
        <soap:Body>
          <GetContractsBalance_ByPhoneNumber xmlns="http://tempuri.org/">
            <phoneNumber>89025165900</phoneNumber>
          </GetContractsBalance_ByPhoneNumber>
        </soap:Body>
      </soap:Envelope>'
```

---

## GetContractsBalance_ByContractID

Баланс (задолженность/переплата) по лицевому счёту с разбивкой по поставщикам и группам услуг.

```
POST https://asuse-test.ie.corp/IVR.asmx
SOAPAction: http://tempuri.org/GetContractsBalance_ByContractID
```

### Параметры метода

| Параметр | Тип | Обязательный | Описание |
|----------|-----|-------------|----------|
| `ContractID` | string (uuid) | да | Идентификатор ЛС (напр. `4a6722c6-9235-11e2-8708-0050569b0089`) |

### Пример запроса (SOAP 1.1)

```xml
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema">
  <soap:Body>
    <GetContractsBalance_ByContractID xmlns="http://tempuri.org/">
      <ContractID>4a6722c6-9235-11e2-8708-0050569b0089</ContractID>
    </GetContractsBalance_ByContractID>
  </soap:Body>
</soap:Envelope>
```

### Модель ответа

```
GetContractsBalance_ByContractIDResult {
  ContractAddressAndBalanceByDicServiceGroupAndContragent[] {
    ContractNumber (string) — номер ЛС
    Settlement (string) — населённый пункт
    Address (string) — адрес
    ContragentName (string) — наименование контрагента (поставщика)
    DicServiceGroupName (string) — группа услуг (электро/тепло/водоотведение и т.д.)
    Balance (number) — баланс по данной услуге
  }
}
```

### Пример ответа

```xml
<GetContractsBalance_ByContractIDResponse xmlns="http://tempuri.org/">
  <GetContractsBalance_ByContractIDResult>
    <ContractAddressAndBalanceByDicServiceGroupAndContragent>
      <ContractNumber>41893</ContractNumber>
      <Settlement>Братск, Энергетик</Settlement>
      <Address>Улица Приморская, дом 61, квартира 74</Address>
      <ContragentName>ООО "Иркутскэнергосбыт"</ContragentName>
      <DicServiceGroupName>По услуге Электроснабжения</DicServiceGroupName>
      <Balance>7.12</Balance>
    </ContractAddressAndBalanceByDicServiceGroupAndContragent>
    <ContractAddressAndBalanceByDicServiceGroupAndContragent>
      <ContractNumber>41893</ContractNumber>
      <Settlement>Братск, Энергетик</Settlement>
      <Address>Улица Приморская, дом 61, квартира 74</Address>
      <ContragentName>ООО "Байкальская энергетическая компания"</ContragentName>
      <DicServiceGroupName>По услуге Теплоснабжения</DicServiceGroupName>
      <Balance>3863.10</Balance>
    </ContractAddressAndBalanceByDicServiceGroupAndContragent>
    <ContractAddressAndBalanceByDicServiceGroupAndContragent>
      <ContractNumber>41893</ContractNumber>
      <Settlement>Братск, Энергетик</Settlement>
      <Address>Улица Приморская, дом 61, квартира 74</Address>
      <ContragentName>Муниципальное унитарное предприятие "Братский Водоканал" Муниципального Образования Города Братска</ContragentName>
      <DicServiceGroupName>По услуге Водоотведения</DicServiceGroupName>
      <Balance>-428.37</Balance>
    </ContractAddressAndBalanceByDicServiceGroupAndContragent>
  </GetContractsBalance_ByContractIDResult>
</GetContractsBalance_ByContractIDResponse>
```

### Пример curl

```bash
curl -X POST https://asuse-test.ie.corp/IVR.asmx \
  -H "Content-Type: text/xml; charset=utf-8" \
  -H "SOAPAction: http://tempuri.org/GetContractsBalance_ByContractID" \
  -d '<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema">
        <soap:Body>
          <GetContractsBalance_ByContractID xmlns="http://tempuri.org/">
            <ContractID>4a6722c6-9235-11e2-8708-0050569b0089</ContractID>
          </GetContractsBalance_ByContractID>
        </soap:Body>
      </soap:Envelope>'
```

---

## GetMDInfo_By_ContractIDAndNomenclatureCode

Информация о приборе учёта (ПУ) по лицевому счёту и коду номенклатуры (услуги): серийный номер, место установки, дата поверки, шкалы и последние показания.

```
POST https://asuse-test.ie.corp/IVR.asmx
SOAPAction: http://tempuri.org/GetMDInfo_By_ContractIDAndNomenclatureCode
```

### Параметры метода

| Параметр | Тип | Обязательный | Описание |
|----------|-----|-------------|----------|
| `ContractStrGUID` | string (uuid) | да | Идентификатор ЛС |
| `NomenclatureCode` | string | да | Код номенклатуры (услуги), напр. `2` (электроэнергия) |

### Пример запроса (SOAP 1.1)

```xml
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:tem="http://tempuri.org/">
  <soapenv:Header/>
  <soapenv:Body>
    <tem:GetMDInfo_By_ContractIDAndNomenclatureCode>
      <tem:ContractStrGUID>4a6722c6-9235-11e2-8708-0050569b0089</tem:ContractStrGUID>
      <tem:NomenclatureCode>2</tem:NomenclatureCode>
    </tem:GetMDInfo_By_ContractIDAndNomenclatureCode>
  </soapenv:Body>
</soapenv:Envelope>
```

### Модель ответа

```
GetMDInfo_By_ContractIDAndNomenclatureCodeResult {
  MDInfo {
    MDSerialNumber (string) — серийный номер прибора учёта
    MDInstallationLocation (string) — место установки ПУ
    MDNextVerificationDeadline (string) — дата следующей поверки
    MDScales {
      MDScaleInfo[] {
        MDScaleID (string) — идентификатор шкалы
        MDScaleName (string) — наименование шкалы (ед. изм.)
        MDSDigitsAfterDot (integer) — количество знаков после запятой
        LastReadings (number) — последние показания
        LastReadingsDate (string) — дата последних показаний
        ReadingsExist (boolean) — признак наличия показаний
        MaxAcceptableNewMDReadingValue (number) — максимально допустимое новое показание
      }
    }
  }
}
```

### Пример ответа

```xml
<GetMDInfo_By_ContractIDAndNomenclatureCodeResponse xmlns="http://tempuri.org/">
  <GetMDInfo_By_ContractIDAndNomenclatureCodeResult>
    <MDInfo>
      <MDSerialNumber>166</MDSerialNumber>
      <MDInstallationLocation>Санузел</MDInstallationLocation>
      <MDNextVerificationDeadline>2029-12-04T00:00:00</MDNextVerificationDeadline>
      <MDScales>
        <MDScaleInfo>
          <MDScaleID>B73879A3-B7F0-11E8-80BE-9457A553D5EB</MDScaleID>
          <MDScaleName>м3</MDScaleName>
          <MDSDigitsAfterDot>0</MDSDigitsAfterDot>
          <LastReadings>1</LastReadings>
          <LastReadingsDate>2025-09-24T08:35:40</LastReadingsDate>
          <ReadingsExist>true</ReadingsExist>
          <MaxAcceptableNewMDReadingValue>491</MaxAcceptableNewMDReadingValue>
        </MDScaleInfo>
      </MDScales>
    </MDInfo>
  </GetMDInfo_By_ContractIDAndNomenclatureCodeResult>
</GetMDInfo_By_ContractIDAndNomenclatureCodeResponse>
```

### Пример curl

```bash
curl -X POST https://asuse-test.ie.corp/IVR.asmx \
  -H "Content-Type: text/xml; charset=utf-8" \
  -H "SOAPAction: http://tempuri.org/GetMDInfo_By_ContractIDAndNomenclatureCode" \
  -d '<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:tem="http://tempuri.org/">
        <soapenv:Header/>
        <soapenv:Body>
          <tem:GetMDInfo_By_ContractIDAndNomenclatureCode>
            <tem:ContractStrGUID>4a6722c6-9235-11e2-8708-0050569b0089</tem:ContractStrGUID>
            <tem:NomenclatureCode>2</tem:NomenclatureCode>
          </tem:GetMDInfo_By_ContractIDAndNomenclatureCode>
        </soapenv:Body>
      </soapenv:Envelope>'
```

---

## GetMDsWarningInfo_ByTel

Предупреждения по приборам учёта для всех лицевых счетов, привязанных к номеру телефона: адрес, группа услуг, последние показания, дата поверки и её статус.

```
POST https://asuse-test.ie.corp/IVR.asmx
SOAPAction: http://tempuri.org/GetMDsWarningInfo_ByTel
```

### Параметры метода

| Параметр | Тип | Обязательный | Описание |
|----------|-----|-------------|----------|
| `telephoneNumber` | string | да | Номер телефона (напр. `89501074005`) |

### Пример запроса (SOAP 1.1)

```xml
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:tem="http://tempuri.org/">
  <soapenv:Header/>
  <soapenv:Body>
    <tem:GetMDsWarningInfo_ByTel>
      <tem:telephoneNumber>89501074005</tem:telephoneNumber>
    </tem:GetMDsWarningInfo_ByTel>
  </soapenv:Body>
</soapenv:Envelope>
```

### Модель ответа

```
GetMDsWarningInfo_ByTelResult {
  MDWarningInfo[] {
    AddressOfMD (string) — адрес
    DicServiceGroupNumber (integer) — номер группы услуг
    LastReadings (number) — последние показания
    NextVerificationDeadline (string) — дата следующей поверки
    IsReadingsTooOld (boolean) — признак, что показания устарели
    VerificationStatus (string) — статус поверки (Verificated / Expired)
  }
}
```

### Пример ответа

```xml
<GetMDsWarningInfo_ByTelResponse xmlns="http://tempuri.org/">
  <GetMDsWarningInfo_ByTelResult>
    <MDWarningInfo>
      <AddressOfMD>Братск, Улица Лозовая, дом 3</AddressOfMD>
      <DicServiceGroupNumber>1</DicServiceGroupNumber>
      <LastReadings>122304</LastReadings>
      <NextVerificationDeadline>2023-07-01T00:00:00</NextVerificationDeadline>
      <IsReadingsTooOld>true</IsReadingsTooOld>
      <VerificationStatus>Expired</VerificationStatus>
    </MDWarningInfo>
    <MDWarningInfo>
      <AddressOfMD>Братск, Улица Лозовая, дом 3</AddressOfMD>
      <DicServiceGroupNumber>4</DicServiceGroupNumber>
      <LastReadings>406</LastReadings>
      <NextVerificationDeadline>2027-04-16T00:00:00</NextVerificationDeadline>
      <IsReadingsTooOld>true</IsReadingsTooOld>
      <VerificationStatus>Verificated</VerificationStatus>
    </MDWarningInfo>
  </GetMDsWarningInfo_ByTelResult>
</GetMDsWarningInfo_ByTelResponse>
```

### Пример curl

```bash
curl -X POST https://asuse-test.ie.corp/IVR.asmx \
  -H "Content-Type: text/xml; charset=utf-8" \
  -H "SOAPAction: http://tempuri.org/GetMDsWarningInfo_ByTel" \
  -d '<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:tem="http://tempuri.org/">
        <soapenv:Header/>
        <soapenv:Body>
          <tem:GetMDsWarningInfo_ByTel>
            <tem:telephoneNumber>89501074005</tem:telephoneNumber>
          </tem:GetMDsWarningInfo_ByTel>
        </soapenv:Body>
      </soapenv:Envelope>'
```

---

## GetMDsWarningInfo_ByContractID

Предупреждения по приборам учёта для конкретного лицевого счёта: адрес, группа услуг, последние показания, дата поверки и её статус.

```
POST https://asuse-test.ie.corp/IVR.asmx
SOAPAction: http://tempuri.org/GetMDsWarningInfo_ByContractID
```

### Параметры метода

| Параметр | Тип | Обязательный | Описание |
|----------|-----|-------------|----------|
| `contractID` | string (uuid) | да | Идентификатор ЛС (напр. `4a6722c6-9235-11e2-8708-0050569b0089`) |

### Пример запроса (SOAP 1.1)

```xml
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:tem="http://tempuri.org/">
  <soapenv:Header/>
  <soapenv:Body>
    <tem:GetMDsWarningInfo_ByContractID>
      <tem:contractID>4a6722c6-9235-11e2-8708-0050569b0089</tem:contractID>
    </tem:GetMDsWarningInfo_ByContractID>
  </soapenv:Body>
</soapenv:Envelope>
```

### Модель ответа

```
GetMDsWarningInfo_ByContractIDResult {
  MDWarningInfo[] {
    AddressOfMD (string) — адрес
    DicServiceGroupNumber (integer) — номер группы услуг
    LastReadings (number) — последние показания
    NextVerificationDeadline (string) — дата следующей поверки
    IsReadingsTooOld (boolean) — признак, что показания устарели
    VerificationStatus (string) — статус поверки (Verificated / Expired)
  }
}
```

### Пример ответа

```xml
<GetMDsWarningInfo_ByContractIDResponse xmlns="http://tempuri.org/">
  <GetMDsWarningInfo_ByContractIDResult>
    <MDWarningInfo>
      <AddressOfMD>Энергетик, Улица Приморская, дом 61, квартира 74</AddressOfMD>
      <DicServiceGroupNumber>1</DicServiceGroupNumber>
      <LastReadings>198</LastReadings>
      <NextVerificationDeadline>2034-01-01T00:00:00</NextVerificationDeadline>
      <IsReadingsTooOld>true</IsReadingsTooOld>
      <VerificationStatus>Verificated</VerificationStatus>
    </MDWarningInfo>
    <MDWarningInfo>
      <AddressOfMD>Энергетик, Улица Приморская, дом 61, квартира 74</AddressOfMD>
      <DicServiceGroupNumber>2</DicServiceGroupNumber>
      <LastReadings>1</LastReadings>
      <NextVerificationDeadline>2029-12-04T00:00:00</NextVerificationDeadline>
      <IsReadingsTooOld>true</IsReadingsTooOld>
      <VerificationStatus>Verificated</VerificationStatus>
    </MDWarningInfo>
  </GetMDsWarningInfo_ByContractIDResult>
</GetMDsWarningInfo_ByContractIDResponse>
```

### Пример curl

```bash
curl -X POST https://asuse-test.ie.corp/IVR.asmx \
  -H "Content-Type: text/xml; charset=utf-8" \
  -H "SOAPAction: http://tempuri.org/GetMDsWarningInfo_ByContractID" \
  -d '<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:tem="http://tempuri.org/">
        <soapenv:Header/>
        <soapenv:Body>
          <tem:GetMDsWarningInfo_ByContractID>
            <tem:contractID>4a6722c6-9235-11e2-8708-0050569b0089</tem:contractID>
          </tem:GetMDsWarningInfo_ByContractID>
        </soapenv:Body>
      </soapenv:Envelope>'
```

---

## InputOfReadingsWithDot

Передача показаний по шкале прибора учёта (значение с точкой).

```
POST https://asuse-test.ie.corp/IVR.asmx
SOAPAction: http://tempuri.org/InputOfReadingsWithDot
```

### Параметры метода

| Параметр | Тип | Обязательный | Описание |
|----------|-----|-------------|----------|
| `MDScale_ID` | string (uuid) | да | Идентификатор шкалы прибора учёта |
| `MDScale_NewReadings` | number | да | Новое показание |

### Пример запроса (SOAP 1.1)

```xml
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:tem="http://tempuri.org/">
  <soapenv:Header/>
  <soapenv:Body>
    <tem:InputOfReadingsWithDot>
      <tem:MDScale_ID>FF6EFA85-D8F7-11E8-80C0-9457A553D5EB</tem:MDScale_ID>
      <tem:MDScale_NewReadings>205</tem:MDScale_NewReadings>
    </tem:InputOfReadingsWithDot>
  </soapenv:Body>
</soapenv:Envelope>
```

### Модель ответа

```
InputOfReadingsWithDotResult {
  (integer) — результат передачи показаний (1 — успешно)
}
```

### Пример ответа

```xml
<InputOfReadingsWithDotResponse xmlns="http://tempuri.org/">
  <InputOfReadingsWithDotResult>1</InputOfReadingsWithDotResult>
</InputOfReadingsWithDotResponse>
```

### Пример curl

```bash
curl -X POST https://asuse-test.ie.corp/IVR.asmx \
  -H "Content-Type: text/xml; charset=utf-8" \
  -H "SOAPAction: http://tempuri.org/InputOfReadingsWithDot" \
  -d '<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:tem="http://tempuri.org/">
        <soapenv:Header/>
        <soapenv:Body>
          <tem:InputOfReadingsWithDot>
            <tem:MDScale_ID>FF6EFA85-D8F7-11E8-80C0-9457A553D5EB</tem:MDScale_ID>
            <tem:MDScale_NewReadings>205</tem:MDScale_NewReadings>
          </tem:InputOfReadingsWithDot>
        </soapenv:Body>
      </soapenv:Envelope>'
```

---

# Общие модели SOAP

### ContractInfo

```
ContractInfo {
  ID (string) — идентификатор ЛС
  No (string) — номер ЛС
  Adress (string) — адрес
  City (string) — населённый пункт
  Residents (integer) — количество проживающих
  FullArea (number) — общая площадь
  DateUpdate (string) — дата обновления
  Stove (string) — тип плиты
  Status (string) — статус ЛС
  AbonentName (string) — фамилия абонента
  FirstName (string) — имя
  Patronimic (string) — отчество
  DivisionID (string) — идентификатор отделения
}
```

### ContractAddressAndBalanceByDicServiceGroupAndContragent

```
ContractAddressAndBalanceByDicServiceGroupAndContragent {
  ContractNumber (string) — номер ЛС
  Settlement (string) — населённый пункт
  Address (string) — адрес
  ContragentName (string) — наименование контрагента (поставщика)
  DicServiceGroupName (string) — группа услуг
  Balance (number) — баланс по услуге
}
```

### MDWarningInfo

```
MDWarningInfo {
  AddressOfMD (string) — адрес
  DicServiceGroupNumber (integer) — номер группы услуг
  LastReadings (number) — последние показания
  NextVerificationDeadline (string) — дата следующей поверки
  IsReadingsTooOld (boolean) — признак, что показания устарели
  VerificationStatus (string) — статус поверки (Verificated / Expired)
}
```

### MDInfo / MDScaleInfo

```
MDInfo {
  MDSerialNumber (string) — серийный номер прибора учёта
  MDInstallationLocation (string) — место установки ПУ
  MDNextVerificationDeadline (string) — дата следующей поверки
  MDScales {
    MDScaleInfo[] {
      MDScaleID (string) — идентификатор шкалы
      MDScaleName (string) — наименование шкалы (ед. изм.)
      MDSDigitsAfterDot (integer) — количество знаков после запятой
      LastReadings (number) — последние показания
      LastReadingsDate (string) — дата последних показаний
      ReadingsExist (boolean) — признак наличия показаний
      MaxAcceptableNewMDReadingValue (number) — максимально допустимое новое показание
    }
  }
}
```
