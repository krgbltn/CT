| **Задача**: | **Точка входа**: | **Заказчик**: |
|-------------|------------------|---------------|
| [KCSIGURD-45](https://youtrack.craft-talk.ru/issue/KCSIGURD-45) | integration_channel, workplace | [SIGURD] |

### Описание

**incoming_sigurd-webhook.js** — Скрипт обработки входящих сообщений от микросервиса sigurd-microservice.

**outgoing_sigurd-webhook.js** — Скрипт обработки исходящих сообщений от платформы. Маппит `messageType` → `event` и отправляет webhook обратно в микросервис. Обрабатывает: `1` (reply/end), `16` (end), `18` (operator_connected).

**outgoing_sigurd-webhook_settings.json** — Конфиг outgoing-скрипта: URL микросервиса, channelId, customerId, routingTopics, группы операторов.

### Варианты подключения

**Вариант 1: Напрямую через канал (integration_channel)**

Микросервис шлёт сообщения напрямую в канал платформы (`PLATFORM_WEBHOOK_URL`). Входящий jsagent не участвует. Outgoing-скрипт ловит ответ бота из канала и отправляет webhook обратно в микросервис.

```
Телефония → sigurd-service → POST в integration_channel → платформа/бот → outgoing-скрипт → webhook → sigurd-service
```

**Вариант 2: Через агента (jsagent)**

Микросервис шлёт сообщения на URL входящего jsagent (`AGENT_URL`). Входящий скрипт форвардит сообщение в канал. Outgoing-скрипт ловит ответ бота и отправляет webhook обратно в микросервис.

```
Телефония → sigurd-service → POST в incoming jsagent → incoming форвардит в канал → платформа/бот → outgoing-скрипт → webhook → sigurd-service
```

### Ссылки

**Репозиторий микросервиса**: [sigurd-microservice](https://gitlab.crafttalk.ru/crafttalk/customers/irkutskenergo/telephony-bridge-sigurd)

### Подключение

**1. Создать jsagent'ы**

Для обработки входящих сообщений с кодом из файла `incoming_sigurd-webhook.js`
Для обработки исходящих сообщений с кодом из файла `outgoing_sigurd-webhook.js`

**2. В настройках jsagent для обработки входящих сообщений** в поле "Дополнительные настройки агента" указать:

```json
{
  "incoming_api": "http://<HOST>/webhooks/integration_channel/<CHANNEL_ID>",
  "authorization_token_incoming": "<INCOMING_TOKEN>"
}
```

**\<HOST\>** — ChannelService.Host, например `opbot-channels:8082`
**\<CHANNEL_ID\>** — Id канала
**\<INCOMING_TOKEN\>** — Токен для входящих сообщений. Если пустой, указать `""`

**3. В настройках jsagent для обработки исходящих сообщений** в поле "Дополнительные настройки агента" указать:

```json
{
  "microserviceUrl": "http://<MICROSERVICE_HOST>:<PORT>",
  "channelId": "<CHANNEL_ID>",
  "channelAuthToken": "<INCOMING_TOKEN>",
  "customerId": "<CUSTOMER_ID>",
  "slots": {
    "userId": "<USER_ID_SLOT>"
  },
  "callIdSlotId": "call_id_sigurd",
  "sessionIdSlotId": "session_id_sigurd",
  "routingText": "Перевожу Ваш звонок на специалиста...",
  "routingTopics": {
    "Отключение ТСН":       { "topic": "Отключение ТСН",       "groups": [{ "id": 321, "name": "Теплоэнергия" }] },
    "Договорная работа":    { "topic": "Договорная работа",    "groups": [{ "id": 381, "name": "Долг" }] },
    "Отключение ЭЭ":        { "topic": "Отключение ЭЭ",        "groups": [{ "id": 301, "name": "Отключение ЭЭ" }] },
    "Дистанционные сервисы":{ "topic": "Дистанционные сервисы", "groups": [{ "id": 381, "name": "Долг" }] },
    "Юридические лица":     { "topic": "Юридические лица",     "groups": [{ "id": 381, "name": "Долг" }] },
    "Работа с возражениями":{ "topic": "Работа с возражениями", "groups": [{ "id": 411, "name": "Разное" }] },
    "Начисление":           { "topic": "Начисление",           "groups": [{ "id": 381, "name": "Долг" }] },
    "Справочная информация":{ "topic": "Справочная информация", "groups": [{ "id": 401, "name": "Справка" }] },
    "Передача показаний":   { "topic": "Передача показаний",   "groups": [{ "id": 331, "name": "Показания" }] },
    "Сервисный центр":      { "topic": "Сервисный центр",      "groups": [{ "id": 391, "name": "Техприсоединение" }] },
    "Не определена":        { "topic": "Не определена",        "groups": [{ "id": 411, "name": "Разное" }] },
    "Обследование ПУ-Пломба":{ "topic": "Обследование ПУ-Пломба", "groups": [{ "id": 351, "name": "Обследование ПУ-Пломба" }] },
    "Поверка ПУ":           { "topic": "Поверка ПУ",           "groups": [{ "id": 361, "name": "Поверка ПУ" }] },
    "Замена":               { "topic": "Замена",               "groups": [{ "id": 341, "name": "Замена" }] },
    "Качество ЭЭ":          { "topic": "Качество ЭЭ",          "groups": [{ "id": 311, "name": "Качество ЭЭ" }] }
  }
}
```

**\<MICROSERVICE_HOST\>** — хост микросервиса sigurd
**\<PORT\>** — порт микросервиса (по умолчанию 8090)
**\<CHANNEL_ID\>** — Id канала
**\<CUSTOMER_ID\>** — Id проекта
**routingText** — текст при переводе на оператора
**routingTopics** — маппинг тем на группы операторов

**4. Создать канал с типом `integration_channel`**
**5. Указать в настройках канала "Токен для входящих сообщений"** (можно оставить пустым)
**6. В поле "Вебхук" в настройках канала указать:**

```
http://<HOST>/integration_channel
```

**\<HOST\>** — host jsagent, например `opbot-jsagent:3366`

**7. В поле "Настройки канала" указать:**

```json
{
  "request_settings": [
    { "name": "customer_id", "type": "string", "value": "<CUSTOMER_ID>" },
    { "name": "outgoing_agent_id", "type": "string", "value": "<OUTGOING_JSAGENT>" }
  ],
  "general_settings": [
    { "name": "customer_id", "type": "string", "value": "<CUSTOMER_ID>" },
    { "name": "outgoing_agent_id", "type": "string", "value": "<OUTGOING_JSAGENT>" }
  ]
}
```

**8. Создать слоты на проекте:**

| **Id слота** | **Название слота** |
|-------------|-------------------|
| call_id_sigurd | ID звонка (sigurd) |
| session_id_sigurd | ID сессии (sigurd) |
| sys_omniuserid | Omni User ID |

### Маппинг сообщений

| messageType | Webhook event | Действие |
|-------------|---------------|----------|
| 1 | `reply` | Вернуть текст ответа бота |
| 1 (+ DialogFinishReason) | `end` | Завершить звонок |
| 16 | `end` | Завершить звонок |
| 18 | `operator_connected` | Перевод на оператора + finishDialog |
