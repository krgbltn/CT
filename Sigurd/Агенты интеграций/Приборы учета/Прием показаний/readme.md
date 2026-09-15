# Прием показаний приборов учета

Набор JS-агентов для поиска лицевых счетов, получения информации о приборах учета и передачи введенных показаний в SOAP API СИГУРД.

| Task | Entrypoint | Customer |
|---|---|---|
| Поиск ЛС по телефону | `identification_phone_number.js` | СИГУРД |
| Поиск ЛС по номеру | `identification_account_number.js` | СИГУРД |
| Передача показаний | `submit-readings.js` | СИГУРД |

## Агенты

### identification_phone_number

Файлы: `identification_phone_number.js`, `identification_phone_number_settings.json`.

Ищет лицевые счета по телефону вызовом `GetContractsInfo_By_Phone`. Для выбранного ЛС запрашивает приборы вызовом `GetMDInfo_By_ContractIDAndNomenclatureCode`: `1` для отопления, `2` для ГВС, `21` для ХВС и `24` для электроэнергии.

По умолчанию телефон берется из слота `sys_phone`. Для тестирования можно установить `useHardcodedPhone: true` и задать номер в `hardcodedPhone`.

Если идентификация по телефону неуспешна, агент передает `successful_identification: "false"` в статью `nextArticle`. Сценарий платформы должен направить диалог к `identification_account_number` для поиска по номеру ЛС.

### identification_account_number

Файлы: `identification_account_number.js`, `identification_account_number_settings.json`.

Ищет ЛС по цифровой части номера из слота `account_number` вызовом `FindAllByContractNumber`. Дальнейшая обработка приборов идентична агенту поиска по телефону.

### submit-readings

Файлы: `submit-readings.js`, `submit-readings_settings.json`.

Получает введенные значения из слотов `readings_*` и отправляет каждую заполненную пару «GUID шкалы - показание» вызовом `InputOfReadingsWithDot`. Передача считается успешной только при значении `InputOfReadingsWithDotResult = 1`.

При ошибке SOAP-запроса, неверном ответе или неполной паре слотов агент направляет диалог к `routingagent`.

При `debug: true` агент не вызывает API и не выполняет переходы. Вместо этого выводит в чат полные XML-запросы `InputOfReadingsWithDot`, подготовленные для каждой передачи.

## Последовательность сценария

1. Сначала `identification_phone_number` ищет ЛС по телефону. Если ЛС не найден, сценарий по `successful_identification=false` запускает `identification_account_number`.
2. Агент поиска получает список ЛС и сохраняет его в своем `dialogStorage`.
3. Для текущего ЛС он передает в сценарий номера приборов, предыдущие показания и GUID одной шкалы на услугу. Для отопления выбирается шкала `Гкал`, для ГВС - шкала `м3`; для ХВС и электроэнергии используется первая шкала первого прибора в ответе.
4. Сценарий запрашивает новые показания в слотах `readings_*` и запускает `submit-readings`.
5. Агент отправки передает заполненные показания.
6. Если слот `has_next_account` равен `true`, агент отправки возвращает диалог к ID из слота `readings_lookup_agent`. Агент поиска обрабатывает следующий ЛС.
7. После последнего ЛС агент отправки направляет диалог к `aiAgent` на `nextArticle` из своих настроек.

`dialogStorage` доступен только тому агенту, который его записал. Поэтому агент отправки не читает список ЛС напрямую, а использует слот `has_next_account`.

## Слоты

| Назначение | Слот |
|---|---|
| Идентифицированный ЛС | `account_number` |
| Успех идентификации | `successful_identification` |
| Номер ПУ электроэнергии | `number_electricity_meter` |
| Предыдущее / новое показание электроэнергии | `recent_electricity` / `readings_electricity` |
| GUID шкалы электроэнергии | `scale_id_electricity` |
| Номер ПУ ГВС | `number_hot_water` |
| Предыдущее / новое показание ГВС | `recent_hot_water` / `readings_hot_water` |
| GUID шкалы ГВС | `scale_id_hot_water` |
| Номер ПУ ХВС | `number_cold_water` |
| Предыдущее / новое показание ХВС | `recent_cold_water` / `readings_cold_water` |
| GUID шкалы ХВС | `scale_id_cold_water` |
| Номер ПУ отопления | `number_heating` |
| Предыдущее / новое показание отопления | `recent_heating` / `readings_heating` |
| GUID шкалы отопления | `scale_id_heating` |
| Наличие следующего ЛС | `has_next_account` |
| Агент поиска для следующего ЛС | `readings_lookup_agent` |

Слоты `scale_electricity`, `scale_hot_water`, `scale_cold_water`, `scale_heating` используются сценарием как признаки шкалы. Для SOAP-передачи нужны отдельные технические слоты `scale_id_*`.

## Настройки submit-readings

- `aiAgent` - ID агента ИИ, по умолчанию `ai_pribor`.
- `routingAgent` - ID агента маршрутизации ошибок, по умолчанию `routingagent`.
- `nextArticle` - финальная статья после успешной передачи показаний по последнему ЛС.
- `debug` - при `true` отправка отключена, подготовленные данные выводятся в чат.

Оба агента поиска записывают ID возврата в слот `readings_lookup_agent` из собственной настройки `returnLookupAgent`. Значения по умолчанию: `identification_phone_number` и `identification_account_number`; при публикации замените их, если ID экземпляров на платформе отличаются.

## SOAP API

- `GetContractsInfo_By_Phone` - поиск ЛС по телефону.
- `FindAllByContractNumber` - поиск ЛС по цифровой части номера.
- `GetMDInfo_By_ContractIDAndNomenclatureCode` - получение прибора и шкалы.
- `InputOfReadingsWithDot` - передача нового показания.

Описание методов: `API/SOAP/`.
