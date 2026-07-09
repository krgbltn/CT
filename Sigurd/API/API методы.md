# API методы Sigurd (ФЛ)

| Метод | URL | Описание |
|-------|-----|----------|
| GET | `/api/service/sigurd/fl/contracts_by_phone?phone={phone}` | Поиск договоров по номеру телефона |
| GET | `/api/service/sigurd/fl/{user_id}/disconnections_heat` | Информация об отключении горячего водоснабжения (ГВС) |
| GET | `/api/service/sigurd/fl/{user_id}/disconnections_electro` | Информация об отключении электроэнергии (ЭЭ) |
| GET | `/api/service/sigurd/fl/{user_id}/info` | Подробная информация по лицевому счёту |
| GET | `/api/service/sigurd/fl/{user_id}/disconnection_report_info` | Информация для создания заявки на отключение |
| GET | `/api/service/sigurd/fl/{user_id}/notifications` | Список уведомлений абонента |

## Общие заголовки

| Заголовок | Значение |
|-----------|----------|
| `Accept` | `application/json` |
| `ES-Request-Source` | `Website` |
| `Authorization` | `Basic U2lndXJkOjR3KTojQDAycTtvaXVhcTA3MmhhOWczNQ==` |
