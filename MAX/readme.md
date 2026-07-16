## **Важно!**

Текущая реализация завязана на webhook пушей от Max.

В данной задаче [ДОКУМЕНТАЦИИ](https://cloud.craft-talk.com/app/project/docs/knowledge-base/article/view/article-692dfb00-ff95-428e-bc55-b5c7f5c092b2/e90ee4a4-9489-4f02-ba4b-49d72d792f97) необходимо обновлять агентов и описание.

## **Подключение интеграционного канала Max:**

**1. Создать jsagent'ы**

Для обработки входящих сообощений с кодом из файла incoming_jsagent_max_(тег заказчика).js <br>
Для обработки исходящих сообощений с кодом из файла outgoing_jsagent_max_(тег заказчика).js <br>
<br>
**2. В настройках jsagent для обработки входящих сообщений в поле "Дополнительные настройки агента" указать:**

```json
{
  "incoming_api": "http://<HOST>/webhooks/integration_channel/<CHANNEL_ID>",
  "authorization_token_incoming": "<INCOMING_TOKEN>",
  "slots": {
    "maxChatId": "chat_id_max",
    "maxUserId": "user_id_max",
    "maxFirstName": "sys_firstname",
    "maxLastName": "sys_lastname",
    "maxUserName": "user_name_max",
    "deep_linking_token": "deep_linking_token"
  },
  "maxBotHost": "<MAX_BOT_HOST>",
  "maxBotToken": "<MAX_BOT_TOKEN>",
  "removeButtonsAfterClick": "true | false",
  "evaluationMessage": "<EVALUATION_MESSAGE>",
  "update_slot_user": "true | false",
  "proxy": {
    "host": "127.0.0.1",
    "port": 8080
  }
}
```

**\<HOST\>** - ChannelService.Host, например, opbot-channels:8082 <br>
**\<CHANNEL_ID\>** - Id канала, в котором настраивается интеграция <br>
**\<INCOMING_TOKEN\>** - Токен для входящих сообщений. Должен совпадать с "Токен для входящих сообщений" в настройках
канала. Если пустой, тогда указать "" <br>
**\<slots\>** - нужные слоты для интеграции <br>
**\<MAX_BOT_HOST\>** - Домен (хост) max бота, например `https://platform-api2.max.ru` <br>
**\<MAX_BOT_TOKEN\>** - Токен max бота <br>
**removeButtonsAfterClick** - Переключатель для обновления сообщения после нажатия любой кнопки. Если не указывается или указан как `true`, то после нажатия сообщение обновляется: к тексту добавляется выбранная кнопка (с ✅), все вложения (кнопки, изображения) удаляются. Если указан как `false`, сообщение не меняется.
**\<EVALUATION_MESSAGE\>** - Сообщение, которое отображается при нажатии кнопки оценки диалога (score). Если не указан: `"Спасибо за вашу оценку:"`. Для остальных кнопок используется оригинальный текст сообщения <br>
**proxy** - Блок настроек прокси. Опицонально. `proxy.host` - хост прокси сервера. `proxy.port` - порт прокси сервера<br>
**update_slot_user** - Переключатель для обновления данных клиента из канала. Если не указывается или указан как false, то данные клиента берутся из канала только при первом обращении. Если указан как true, то данные клиента берутся из канала при каждом обращении.<br>

**3. В настройках jsagent для обработки исходящих сообщений в поле "Дополнительные настройки агента" указать:**

```json
{
  "maxBotToken": "<MAX_BOT_TOKEN>",
  "maxBotHost": "<MAX_BOT_HOST>",
  "slots": {
    "maxChatId": "chat_id_max",
    "maxUserId": "user_id_max",
    "maxFirstName": "sys_firstname",
    "maxLastName": "sys_lastname",
    "maxUserName": "user_name_max",
    "deep_linking_token": "deep_linking_token"
  },
  "host": "<HOST>",
  "customerId": "<CUSTOMER_ID>",
  "incomingAgent": "<INCOMING_JSAGENT>",
  "webhook_events": "<webhook_events>",
  "button_text": "<button_text>",
  "has_score": "true | false",
  "has_combination_keyboards": "true | false",
  "disableLinkPreview": "true | false",
  "proxy": {
    "host": "127.0.0.1",
    "port": 8080
  },
  "incomingProcessor": "<HOST>/api/v1/max/<CUSTOMER_ID>/<CHANNEL_ID>/<INCOMING_JSAGENT>",
  "fileStorageUrl": "<FILESTORAGE_URL>",
  "enableFinishMessage": "true | false"
}
```

**\<MAX_BOT_TOKEN\>** - Токен max бота <br>
**\<MAX_BOT_HOST\>** - Домен (хост) max бота, например `https://botapi.max.ru` <br>
**\<INCOMING_JSAGENT\>** - Id jsagent, в котором находится код из файла incoming_jsagent.js <br>
**\<CUSTOMER_ID\>** - Id проекта (Id кастомера) <br>
**\<HOST\>** - host jsagent, например, `https://cloud.craft-talk.com/` <br>
**\<slots\>** - нужные слоты для интеграции <br>
**\<webhook_events\>** - нужные события от MAX: (`["message_created", "message_callback", "bot_started", "bot_stopped", "bot_removed"]`) <br>
**\<button_text\>** - Сообщение, которое будет отсылаться с кнопками, если не указан текст: `Нажмите интересующую вас кнопку` <br>
**has_score** - Переключатель для оценки диалога. Если не указывается или указан как `false`, то оценка не отправится. Если указан как `true`, то - отправится  <br>
**has_combination_keyboards** - Переключатель для объединения нескольких клавиатур. Если не указывается или указан как `false`, то не объединяться. Если указан как `true`, то - объединятся  <br>
**disableLinkPreview** - Если `true`, сервер не будет генерировать превью для ссылок в тексте сообщения. Если не указывается или указан как `false` - будет генерировать<br>
**proxy** - Блок настроек прокси. Опицонально. `proxy.host` - хост прокси сервера. `proxy.port` - порт прокси сервера<br>
**incomingProcessor** - Вебхук обработчика входящих сообщений. Опционально<br>
**FILESTORAGE_URL** - URL сервиса filestorage<br>
**enableFinishMessage** - Отправка кнопки перезапуска диалога после завершения. При включении этой опции после завершения диалога клиент будет видеть сообщение с кнопкой «Начать». <br>
Чтобы кнопка «Начать» корректно перезапускала диалог, необходимо выполнить следующие настройки:
- Агент приветствия установленный на канале.
  В поле «Переключить, если агент Приветствия не получил данные для вызова» выберите агента типа «Интеллектуальный бот».
- Интеллектуальный бот.
  В поле «Статья, если бот не знает ответ» выберите статью, которая должна запускаться при нажатии кнопки «Начать».

**4. Создать канал с типом integration_channel**<br>
**5. Указать в настройках канала "Токен для входящих сообщений". Можно оставить пустым.**<br>
**6. В поле "Вебхук" в настройках канала указать:**<br><br>
http://\<HOST\>/integration_channel <br>
**\<HOST\>** - host jsagent, например, opbot-jsagent:3366<br><br>
**7. В поле "Настройки канала" указать:**

```json
{
  "edit_message": "true | false",
  "delete_message": "true | false",
  "quote_message": "true | false",
  "request_settings": [
    {
      "name": "customer_id",
      "type": "string",
      "value": "<CUSTOMER_ID>"
    },
    {
      "name": "outgoing_agent_id",
      "type": "string",
      "value": "<OUTGOING_JSAGENT>"
    },
    {
      "name": "file_storage_webhook",
      "type": "string",
      "value": "<HOST_FILE_STORAGE_WEBHOOK>"
    }
  ],
  "general_settings": [
    {
      "name": "customer_id",
      "type": "string",
      "value": "<CUSTOMER_ID>"
    },
    {
      "name": "outgoing_agent_id",
      "type": "string",
      "value": "<OUTGOING_JSAGENT>"
    }
  ]
}
```

**edit_message** - Переключатель для функции редактирования сообщений. Если указан как `false`, то редактирования сообщения выключено. Если указан как `true`, то - включено <br>
**delete_message** - Переключатель для функции удаления сообщений. Если указан как `false`, то удаления сообщения выключено. Если указан как `true`, то - включено <br>
**quote_message** - Переключатель для функции цитирования сообщений. Если указан как `false`, то цитирования сообщения выключено. Если указан как `true`, то - включено <br>
**\<CUSTOMER_ID\>** - Id проекта. (Id кастомера). <br>
**\<OUTGOING_JSAGENT\>** - Id jsagent, в котором находится код из файла outgoing_jsagent.js <br>
**\<HOST_FILE_STORAGE_WEBHOOK\>** - webhook сервиса хранения файлов, например http://localhost:8100 <br>

**8. Создать слоты на проекте:**
Слоты для заполнения:

| **Id слота**:       | **Название слота**:                     |
|---------------------|-----------------------------------------|
| chat_id_max         | ID чата с клиентом                      |
| user_id_max         | ID юзера в канале                       |
| user_name_max       | Юзернейм                                |
| deep_linking_token  | Произвольный параметр в ссылке на бота  |

