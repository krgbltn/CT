# API методы Sigurd (ФЛ)

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

## Общие заголовки

| Заголовок | Значение |
|-----------|----------|
| `Accept` | `application/json` |
| `ES-Request-Source` | `Website` |
| `Authorization` | `Basic U2lndXJkOjR3KTojQDAycTtvaXVhcTA3MmhhOWczNQ==` |

## Базовый URL

```
https://webapisbytfl.dev.enplus.digital
```
