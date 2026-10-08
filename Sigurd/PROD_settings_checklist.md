# Чек-лист: прод-настройки REST FL API (api.enplus.ru)

Вносится в UI платформы: **Settings -> Agents -> [агент] -> Settings**, на **прод-окружении**.

Единые замены:

| Поле | dev (сейчас) | prod |
|---|---|---|
| База URL | `https://webapisbytfl.dev.enplus.digital/api/service/sigurd/fl` | `https://api.enplus.ru/v2/webapifl/sbyt/api/service/sigurd/fl` |
| authorizationToken | `Basic U2lndXJkOjR3KTojQDAycTtvaXVhcTA3MmhhOWczNQ==` | `Basic U2lndXJkOk05NTA5MjtkcDpAKTAtMHI5Oy0zbXFrZjs5MDd4ejk4M1J5` |

Всего агентов: 23.

## 1. check_lk_registration

`Агенты интеграций\Дистанционные сервисы\check_lk_registration_settings.json`

- `url`: `https://webapisbytfl.dev.enplus.digital/api/service/sigurd/fl/{{slots.uid}}/info` -> `https://api.enplus.ru/v2/webapifl/sbyt/api/service/sigurd/fl/{{slots.uid}}/info`
- `authorizationToken`: `Basic U2lndXJkOjR3KTojQDAycTtvaXVhcTA3MmhhOWczNQ==` -> `Basic U2lndXJkOk05NTA5MjtkcDpAKTAtMHI5Oy0zbXFrZjs5MDd4ejk4M1J5`

## 2. contracts_by_address_lastname

`Агенты интеграций\Договорная работа\contracts_by_address_lastname_settings.json`

- `url`: `https://webapisbytfl.dev.enplus.digital/api/service/sigurd/fl/contracts_by_address_lastname?lastName={{slots.last_name}}&requestModel.cityName={{slots.city}}&requestModel.streetName={{slots.street}}&requestModel.houseName={{slots.house}}` -> `https://api.enplus.ru/v2/webapifl/sbyt/api/service/sigurd/fl/contracts_by_address_lastname?lastName={{slots.last_name}}&requestModel.cityName={{slots.city}}&requestModel.streetName={{slots.street}}&requestModel.houseName={{slots.house}}`
- `authorizationToken`: `Basic U2lndXJkOjR3KTojQDAycTtvaXVhcTA3MmhhOWczNQ==` -> `Basic U2lndXJkOk05NTA5MjtkcDpAKTAtMHI5Oy0zbXFrZjs5MDd4ejk4M1J5`

## 3. info_by_user_id

`Агенты интеграций\Договорная работа\info_by_user_id_settings.json`

- `infoUrl`: `https://webapisbytfl.dev.enplus.digital/api/service/sigurd/fl/{{slots.uid}}/info` -> `https://api.enplus.ru/v2/webapifl/sbyt/api/service/sigurd/fl/{{slots.uid}}/info`
- `disconnectionReportUrl`: `https://webapisbytfl.dev.enplus.digital/api/service/sigurd/fl/{user_id}/disconnection_report_info` -> `https://api.enplus.ru/v2/webapifl/sbyt/api/service/sigurd/fl/{user_id}/disconnection_report_info`
- `authorizationToken`: `Basic U2lndXJkOjR3KTojQDAycTtvaXVhcTA3MmhhOWczNQ==` -> `Basic U2lndXJkOk05NTA5MjtkcDpAKTAtMHI5Oy0zbXFrZjs5MDd4ejk4M1J5`

## 4. identification

`Агенты интеграций\Идентификация общая\identification_settings.json`

- `url`: `https://webapisbytfl.dev.enplus.digital/api/service/sigurd/fl/contracts_by_phone?phone={{slots.phone}}` -> `https://api.enplus.ru/v2/webapifl/sbyt/api/service/sigurd/fl/contracts_by_phone?phone={{slots.phone}}`
- `authorizationToken`: `Basic U2lndXJkOjR3KTojQDAycTtvaXVhcTA3MmhhOWczNQ==` -> `Basic U2lndXJkOk05NTA5MjtkcDpAKTAtMHI5Oy0zbXFrZjs5MDd4ejk4M1J5`
- `disconnectionReportUrl`: `https://webapisbytfl.dev.enplus.digital/api/service/sigurd/fl/{user_id}/disconnection_report_info` -> `https://api.enplus.ru/v2/webapifl/sbyt/api/service/sigurd/fl/{user_id}/disconnection_report_info`
- `infoUrl`: `https://webapisbytfl.dev.enplus.digital/api/service/sigurd/fl/{user_id}/info` -> `https://api.enplus.ru/v2/webapifl/sbyt/api/service/sigurd/fl/{user_id}/info`
- **ВНИМАНИЕ: ``stub: true``** - на проде выставить ``false``, иначе запросы не выполняются.

## 5. check_email_doc

`Агенты интеграций\Начисления\check_email_doc_settings.json`

- `url`: `https://webapisbytfl.dev.enplus.digital/api/service/sigurd/fl/{{slots.uid}}/info` -> `https://api.enplus.ru/v2/webapifl/sbyt/api/service/sigurd/fl/{{slots.uid}}/info`
- `authorizationToken`: `Basic U2lndXJkOjR3KTojQDAycTtvaXVhcTA3MmhhOWczNQ==` -> `Basic U2lndXJkOk05NTA5MjtkcDpAKTAtMHI5Oy0zbXFrZjs5MDd4ejk4M1J5`

## 6. check_overpayment

`Агенты интеграций\Начисления\check_overpayment_settings.json`

- `url`: `https://webapisbytfl.dev.enplus.digital/api/service/sigurd/fl/{{slots.uid}}/transactions` -> `https://api.enplus.ru/v2/webapifl/sbyt/api/service/sigurd/fl/{{slots.uid}}/transactions`
- `authorizationToken`: `Basic U2lndXJkOjR3KTojQDAycTtvaXVhcTA3MmhhOWczNQ==` -> `Basic U2lndXJkOk05NTA5MjtkcDpAKTAtMHI5Oy0zbXFrZjs5MDd4ejk4M1J5`

## 7. check_service_debt

`Агенты интеграций\Начисления\check_service_debt_settings.json`

- `url`: `https://webapisbytfl.dev.enplus.digital/api/service/sigurd/fl/{{slots.uid}}/transactions` -> `https://api.enplus.ru/v2/webapifl/sbyt/api/service/sigurd/fl/{{slots.uid}}/transactions`
- `authorizationToken`: `Basic U2lndXJkOjR3KTojQDAycTtvaXVhcTA3MmhhOWczNQ==` -> `Basic U2lndXJkOk05NTA5MjtkcDpAKTAtMHI5Oy0zbXFrZjs5MDd4ejk4M1J5`

## 8. check_water_devices

`Агенты интеграций\Начисления\check_water_devices_settings.json`

- `url`: `https://webapisbytfl.dev.enplus.digital/api/service/sigurd/fl/{{slots.uid}}/info` -> `https://api.enplus.ru/v2/webapifl/sbyt/api/service/sigurd/fl/{{slots.uid}}/info`
- `authorizationToken`: `Basic U2lndXJkOjR3KTojQDAycTtvaXVhcTA3MmhhOWczNQ==` -> `Basic U2lndXJkOk05NTA5MjtkcDpAKTAtMHI5Oy0zbXFrZjs5MDd4ejk4M1J5`

## 9. get_service_amount_to_pay

`Агенты интеграций\Начисления\get_service_amount_to_pay_settings.json`

- `url`: `https://webapisbytfl.dev.enplus.digital/api/service/sigurd/fl/{{slots.uid}}/transactions` -> `https://api.enplus.ru/v2/webapifl/sbyt/api/service/sigurd/fl/{{slots.uid}}/transactions`
- `authorizationToken`: `Basic U2lndXJkOjR3KTojQDAycTtvaXVhcTA3MmhhOWczNQ==` -> `Basic U2lndXJkOk05NTA5MjtkcDpAKTAtMHI5Oy0zbXFrZjs5MDd4ejk4M1J5`

## 10. get_total_debt

`Агенты интеграций\Начисления\get_total_debt_settings.json`

- `url`: `https://webapisbytfl.dev.enplus.digital/api/service/sigurd/fl/{{slots.uid}}/info` -> `https://api.enplus.ru/v2/webapifl/sbyt/api/service/sigurd/fl/{{slots.uid}}/info`
- `authorizationToken`: `Basic U2lndXJkOjR3KTojQDAycTtvaXVhcTA3MmhhOWczNQ==` -> `Basic U2lndXJkOk05NTA5MjtkcDpAKTAtMHI5Oy0zbXFrZjs5MDd4ejk4M1J5`

## 11. disabling_electro

`Агенты интеграций\Отключение ЭЭ\disabling_electro_settings.json`

- `url`: `https://webapisbytfl.dev.enplus.digital/api/service/sigurd/fl/{{slots.uid}}/disconnections_electro` -> `https://api.enplus.ru/v2/webapifl/sbyt/api/service/sigurd/fl/{{slots.uid}}/disconnections_electro`
- `authorizationToken`: `Basic U2lndXJkOjR3KTojQDAycTtvaXVhcTA3MmhhOWczNQ==` -> `Basic U2lndXJkOk05NTA5MjtkcDpAKTAtMHI5Oy0zbXFrZjs5MDd4ejk4M1J5`

## 12. ksrt_report

`Агенты интеграций\Отключение ЭЭ\ksrt_report_settings.json`

- `url`: `https://webapisbytfl.dev.enplus.digital/api/service/sigurd/fl/{{slots.uid}}/disconnection_report_info` -> `https://api.enplus.ru/v2/webapifl/sbyt/api/service/sigurd/fl/{{slots.uid}}/disconnection_report_info`
- `authorizationToken`: `Basic U2lndXJkOjR3KTojQDAycTtvaXVhcTA3MmhhOWczNQ==` -> `Basic U2lndXJkOk05NTA5MjtkcDpAKTAtMHI5Oy0zbXFrZjs5MDd4ejk4M1J5`

## 13. disabling_notifications

`Агенты интеграций\Отключения ТСН\disabling_notifications_settings.json`

- `notificationsUrl`: `https://webapisbytfl.dev.enplus.digital/api/service/sigurd/fl/{{slots.uid}}/notifications` -> `https://api.enplus.ru/v2/webapifl/sbyt/api/service/sigurd/fl/{{slots.uid}}/notifications`
- `infoUrl`: `https://webapisbytfl.dev.enplus.digital/api/service/sigurd/fl/{{slots.uid}}/info` -> `https://api.enplus.ru/v2/webapifl/sbyt/api/service/sigurd/fl/{{slots.uid}}/info`
- `authorizationToken`: `Basic U2lndXJkOjR3KTojQDAycTtvaXVhcTA3MmhhOWczNQ==` -> `Basic U2lndXJkOk05NTA5MjtkcDpAKTAtMHI5Oy0zbXFrZjs5MDd4ejk4M1J5`

## 14. disabling_tsn_plan

`Агенты интеграций\Отключения ТСН\disabling_tsn_plan_settings.json`

- `url`: `https://webapisbytfl.dev.enplus.digital/api/service/sigurd/fl/{{slots.uid}}/disconnections_heat` -> `https://api.enplus.ru/v2/webapifl/sbyt/api/service/sigurd/fl/{{slots.uid}}/disconnections_heat`
- `authorizationToken`: `Basic U2lndXJkOjR3KTojQDAycTtvaXVhcTA3MmhhOWczNQ==` -> `Basic U2lndXJkOk05NTA5MjtkcDpAKTAtMHI5Oy0zbXFrZjs5MDd4ejk4M1J5`

## 15. disabling_tsn

`Агенты интеграций\Отключения ТСН\disabling_tsn_settings.json`

- `url`: `https://webapisbytfl.dev.enplus.digital/api/service/sigurd/fl/{{slots.uid}}/disconnections_heat` -> `https://api.enplus.ru/v2/webapifl/sbyt/api/service/sigurd/fl/{{slots.uid}}/disconnections_heat`
- `authorizationToken`: `Basic U2lndXJkOjR3KTojQDAycTtvaXVhcTA3MmhhOWczNQ==` -> `Basic U2lndXJkOk05NTA5MjtkcDpAKTAtMHI5Oy0zbXFrZjs5MDd4ejk4M1J5`

## 16. check_device

`Агенты интеграций\Приборы учета\check_device_settings.json`

- `infoUrl`: `https://webapisbytfl.dev.enplus.digital/api/service/sigurd/fl/{{slots.uid}}/info` -> `https://api.enplus.ru/v2/webapifl/sbyt/api/service/sigurd/fl/{{slots.uid}}/info`
- `disconnectionReportUrl`: `https://webapisbytfl.dev.enplus.digital/api/service/sigurd/fl/{user_id}/disconnection_report_info` -> `https://api.enplus.ru/v2/webapifl/sbyt/api/service/sigurd/fl/{user_id}/disconnection_report_info`
- `authorizationToken`: `Basic U2lndXJkOjR3KTojQDAycTtvaXVhcTA3MmhhOWczNQ==` -> `Basic U2lndXJkOk05NTA5MjtkcDpAKTAtMHI5Oy0zbXFrZjs5MDd4ejk4M1J5`

## 17. check_housetype

`Агенты интеграций\Приборы учета\check_housetype_settings.json`

- `url`: `https://webapisbytfl.dev.enplus.digital/api/service/sigurd/fl/{{slots.uid}}/disconnection_report_info` -> `https://api.enplus.ru/v2/webapifl/sbyt/api/service/sigurd/fl/{{slots.uid}}/disconnection_report_info`
- `authorizationToken`: `Basic U2lndXJkOjR3KTojQDAycTtvaXVhcTA3MmhhOWczNQ==` -> `Basic U2lndXJkOk05NTA5MjtkcDpAKTAtMHI5Oy0zbXFrZjs5MDd4ejk4M1J5`

## 18. check_service_device_active

`Агенты интеграций\Приборы учета\check_service_device_active_settings.json`

- `infoUrl`: `https://webapisbytfl.dev.enplus.digital/api/service/sigurd/fl/{{slots.uid}}/info` -> `https://api.enplus.ru/v2/webapifl/sbyt/api/service/sigurd/fl/{{slots.uid}}/info`
- `disconnectionReportUrl`: `https://webapisbytfl.dev.enplus.digital/api/service/sigurd/fl/{user_id}/disconnection_report_info` -> `https://api.enplus.ru/v2/webapifl/sbyt/api/service/sigurd/fl/{user_id}/disconnection_report_info`
- `authorizationToken`: (пусто — заполнить) -> `Basic U2lndXJkOk05NTA5MjtkcDpAKTAtMHI5Oy0zbXFrZjs5MDd4ejk4M1J5`

## 19. check_service_device

`Агенты интеграций\Приборы учета\check_service_device_settings.json`

- `infoUrl`: `https://webapisbytfl.dev.enplus.digital/api/service/sigurd/fl/{{slots.uid}}/info` -> `https://api.enplus.ru/v2/webapifl/sbyt/api/service/sigurd/fl/{{slots.uid}}/info`
- `disconnectionReportUrl`: `https://webapisbytfl.dev.enplus.digital/api/service/sigurd/fl/{user_id}/disconnection_report_info` -> `https://api.enplus.ru/v2/webapifl/sbyt/api/service/sigurd/fl/{user_id}/disconnection_report_info`
- `authorizationToken`: (пусто — заполнить) -> `Basic U2lndXJkOk05NTA5MjtkcDpAKTAtMHI5Oy0zbXFrZjs5MDd4ejk4M1J5`

## 20. device_verification_check

`Агенты интеграций\Приборы учета\device_verification_check_settings.json`

- `url`: `https://webapisbytfl.dev.enplus.digital/api/service/sigurd/fl/{{slots.uid}}/info` -> `https://api.enplus.ru/v2/webapifl/sbyt/api/service/sigurd/fl/{{slots.uid}}/info`
- `authorizationToken`: `Basic U2lndXJkOjR3KTojQDAycTtvaXVhcTA3MmhhOWczNQ==` -> `Basic U2lndXJkOk05NTA5MjtkcDpAKTAtMHI5Oy0zbXFrZjs5MDd4ejk4M1J5`

## 21. get_all_last_readings

`Агенты интеграций\Приборы учета\get_all_last_readings_settings.json`

- `url`: `https://webapisbytfl.dev.enplus.digital/api/service/sigurd/fl/{{slots.uid}}/devices` -> `https://api.enplus.ru/v2/webapifl/sbyt/api/service/sigurd/fl/{{slots.uid}}/devices`
- `authorizationToken`: `Basic U2lndXJkOjR3KTojQDAycTtvaXVhcTA3MmhhOWczNQ==` -> `Basic U2lndXJkOk05NTA5MjtkcDpAKTAtMHI5Oy0zbXFrZjs5MDd4ejk4M1J5`

## 22. last_reading_get

`Агенты интеграций\Приборы учета\last_reading_get_settings.json`

- `url`: `https://webapisbytfl.dev.enplus.digital/api/service/sigurd/fl/{{slots.uid}}/devices` -> `https://api.enplus.ru/v2/webapifl/sbyt/api/service/sigurd/fl/{{slots.uid}}/devices`
- `authorizationToken`: `Basic U2lndXJkOjR3KTojQDAycTtvaXVhcTA3MmhhOWczNQ==` -> `Basic U2lndXJkOk05NTA5MjtkcDpAKTAtMHI5Oy0zbXFrZjs5MDd4ejk4M1J5`

## 23. check_network_organization

`Агенты интеграций\Проверка сетевой организации\check_network_organization_settings.json`

- `url`: `https://webapisbytfl.dev.enplus.digital/api/service/sigurd/fl/{{slots.uid}}/network_organization_data` -> `https://api.enplus.ru/v2/webapifl/sbyt/api/service/sigurd/fl/{{slots.uid}}/network_organization_data`
- `authorizationToken`: `Basic U2lndXJkOjR3KTojQDAycTtvaXVhcTA3MmhhOWczNQ==` -> `Basic U2lndXJkOk05NTA5MjtkcDpAKTAtMHI5Oy0zbXFrZjs5MDd4ejk4M1J5`

## Не входит в этот список (отдельные данные):

- SOAP-агенты: ``identification_phone_number``, ``identification_account_number``, ``submit-readings`` (хост ``asuse-test.ie.corp/IVR.asmx``) - прод-адрес будет отдельно.
- ЮЛ: ``find_account_by_inn`` (``webapisbytul.dev...``, токен-заглушка) - отдельный сервис.
- ``autodial_search`` (``autocalls.enplus.group``) - другой API.
