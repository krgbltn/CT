# SOAP — универсальный агент

Универсальный JSAgent для вызова методов SOAP-сервиса IVR (`https://asuse-test.ie.corp/IVR.asmx`). Работает по принципу `rest.js`: вся бизнес-логика описана в дополнительных настройках (`soap_settings.json`), код один на все методы.

## Назначение

Позволяет вызывать любой метод SOAP-сервиса без изменения кода, меняя только конфиг:

- `FindAllByContractNumber` — поиск ЛС по цифровой части номера
- `GetContractsInfo_By_Phone` — поиск ЛС по телефону
- `GetContractsBalance_ByPhoneNumber` / `GetContractsBalance_ByContractID` — баланс
- `GetMDsWarningInfo_ByTel` / `GetMDsWarningInfo_ByContractID` — предупреждения по приборам учёта
- `InputOfReadingsWithDot` — приём показаний
- `GetAllDivisions` — список подразделений

## Установка

1. Создать JSAgent-агент с точкой входа `message`.
2. Вставить код из `soap.js`.
3. Заполнить дополнительные настройки агента содержимым `soap_settings.json` (под свой метод).
4. Добавить агента в место сценария.

## Настройки (`soap_settings.json`)

| Поле | Описание |
|------|----------|
| `url` | URL SOAP-эндпоинта, напр. `https://asuse-test.ie.corp/IVR.asmx` |
| `methodName` | Имя вызываемого метода, напр. `GetContractsInfo_By_Phone` |
| `targetNamespace` | Namespace методов (по умолчанию `http://tempuri.org/`) |
| `soapVersion` | `"1.1"` или `"1.2"`. Для IVR-сервиса — `"1.1"` (заголовок `SOAPAction` + `Content-Type: text/xml; charset=utf-8`) |
| `parameters` | `[{ "name", "value", "type" }]`. `value` поддерживает шаблоны `{{slots.x}}`, `{{message.x}}`, `||`-fallback. `type: "number"` — преобразует в число |
| `resultPath` | Путь к узлу результата в распарсенном ответе, напр. `soap:Envelope.soap:Body.GetContractsInfo_By_PhoneResponse.GetContractsInfo_By_PhoneResult.ContractInfo` |
| `slotsMapping` | `[{ "slotId", "path", "defaultValue" }]` — маппинг полей результата в слоты проекта. Если результат — массив, берётся первый элемент |
| `nextArticle` | Символьный код статьи для `/switchredirect aiassist2 intent_id="..."` |
| `operatorArticle` | (опционально) Статья перевода на оператора при ошибке/SOAP Fault, вместо `nextArticle` |
| `authorizationToken` | (опционально) HTTP-заголовок Authorization |
| `headers` | (опционально) Дополнительные HTTP-заголовки |
| `stub` / `stubResponse` | Режим тестирования без вызова сервера. В проде `"stub": false` |

## Шаблонизация

В `parameters` и `url` поддерживаются выражения:

- `{{slots.slot_id}}` — значение заполненного слота
- `{{message.путь}}` — поле входящего сообщения
- `{{slots.a}} || {{slots.b}}` — берётся первое непустое значение

## Примеры конфигов под разные методы

### Поиск ЛС по телефону (`GetContractsInfo_By_Phone`)

```json
{
  "url": "https://asuse-test.ie.corp/IVR.asmx",
  "methodName": "GetContractsInfo_By_Phone",
  "targetNamespace": "http://tempuri.org/",
  "soapVersion": "1.1",
  "parameters": [
    { "name": "PhoneNumber", "value": "{{slots.sys_phone}}" }
  ],
  "resultPath": "soap:Envelope.soap:Body.GetContractsInfo_By_PhoneResponse.GetContractsInfo_By_PhoneResult.ContractInfo",
  "slotsMapping": [
    { "slotId": "account_number", "path": "No", "defaultValue": "" }
  ],
  "nextArticle": "article-c45ef64c-075d-4d0e-8da9-98d8914df244",
  "stub": false
}
```

### Баланс по номеру телефона (`GetContractsBalance_ByPhoneNumber`)

```json
{
  "url": "https://asuse-test.ie.corp/IVR.asmx",
  "methodName": "GetContractsBalance_ByPhoneNumber",
  "targetNamespace": "http://tempuri.org/",
  "soapVersion": "1.1",
  "parameters": [
    { "name": "phoneNumber", "value": "{{slots.sys_phone}}" }
  ],
  "resultPath": "soap:Envelope.soap:Body.GetContractsBalance_ByPhoneNumberResponse.GetContractsBalance_ByPhoneNumberResult.ContractAddressAndBalanceByDicServiceGroupAndContragent",
  "slotsMapping": [
    { "slotId": "contract_number", "path": "ContractNumber" },
    { "slotId": "balance", "path": "Balance" }
  ],
  "nextArticle": "article-c45ef64c-075d-4d0e-8da9-98d8914df244",
  "stub": false
}
```

### Предупреждения по приборам учёта по телефону (`GetMDsWarningInfo_ByTel`)

```json
{
  "url": "https://asuse-test.ie.corp/IVR.asmx",
  "methodName": "GetMDsWarningInfo_ByTel",
  "targetNamespace": "http://tempuri.org/",
  "soapVersion": "1.1",
  "parameters": [
    { "name": "telephoneNumber", "value": "{{slots.sys_phone}}" }
  ],
  "resultPath": "soap:Envelope.soap:Body.GetMDsWarningInfo_ByTelResponse.GetMDsWarningInfo_ByTelResult.MDWarningInfo",
  "slotsMapping": [
    { "slotId": "address_md", "path": "AddressOfMD" },
    { "slotId": "last_readings", "path": "LastReadings" }
  ],
  "nextArticle": "article-c45ef64c-075d-4d0e-8da9-98d8914df244",
  "stub": false
}
```

> **Примечание о приборах учёта.** Полный workflow «договоры → приборы учёта по 4 номенклатурам → пагинация по ЛС» (слоты `number_electricity_meter`, `recent_hot_water`, `scale_*` и т.д.) реализован в специализированном скрипте `d/get-by-phone_last.js`. Универсальный агент делает один метод за вызов.

## Обработка ошибок

- Пустой ответ или SOAP Fault → перевод в `operatorArticle` (если задан) или `nextArticle` со слотом `final_answer: "error"`.
- Ошибки отдельных запросов логируются с телом `error.response?.data`.
- `https.Agent` использует `rejectUnauthorized: false` (подходит для внутреннего сертификата `asuse-test.ie.corp`).