# REST — универсальный агент

Универсальный JSAgent для вызова любых REST/HTTP-методов с JSON (напр. сервис Sigurd ФЛ `https://webapisbytfl.dev.enplus.digital`). Работает по принципу `soap.js`: вся бизнес-логика описана в дополнительных настройках (`rest_settings.json`), код один на все методы.

## Назначение

Позволяет вызывать любой REST-метод без изменения кода, меняя только конфиг:

- `/api/service/sigurd/fl/{user_id}/info` — данные по ЛС (в т.ч. проверка регистрации владельца в ЛК через `account.is_owner_registered`)
- `/api/service/sigurd/fl/contracts_by_phone` — поиск ЛС по телефону
- `/api/service/sigurd/fl/{user_id}/transactions` — взаиморасчёты
- `/api/service/sigurd/fl/{user_id}/devices` — приборы учёта
- любые внешние HTTP API с JSON-обменом

## Установка

1. Создать JSAgent-агент с точкой входа `message`.
2. Вставить код из `rest.js`.
3. Заполнить дополнительные настройки агента содержимым `rest_settings.json` (под свой метод).
4. Добавить агента в место сценария.

## Настройки (`rest_settings.json`)

| Поле | Описание |
|------|----------|
| `url` | URL запроса, поддерживает шаблоны `{{slots.x}}` / `{{message.x}}`, напр. `https://webapisbytfl.dev.enplus.digital/api/service/sigurd/fl/{{slots.user_id_tst}}/info` |
| `method` | HTTP-метод (по умолчанию `"post"`) |
| `headers` | HTTP-заголовки: `Accept`, `ES-Request-Source`, `Authorization` и т.д. |
| `requestBody` | Тело запроса (объект). Шаблоны работают рекурсивно во всех строковых значениях, включая вложенные объекты и массивы |
| `slotsMapping` | `[{ "slotId", "path", "defaultValue" }]` — маппинг полей JSON-ответа в слоты проекта. Объекты сериализуются в JSON-строку |
| `nextArticle` | Символьный код статьи для `/switchredirect aiassist2 intent_id="..."`. Ответ агента — всегда переход в эту статью с заполненными слотами |

## Шаблонизация

В `url` и `requestBody` поддерживаются выражения:

- `{{slots.slot_id}}` — значение заполненного слота
- `{{message.путь}}` — поле входящего сообщения, напр. `{{message.user.omni_user_id}}`
- `{{slots.a}} || {{slots.b}}` — берётся первое непустое значение; в качестве fallback можно использовать обычный текст: `{{slots.sys_firstname}} || Имя`
- Если строка целиком состоит из одного выражения — подставляется значение с сохранением типа (число, объект); при интерполяции внутри другой строки значение приводится к строке (объекты — через JSON)

## Пути в `slotsMapping`

Поле `path` описывает путь к значению в JSON-ответе:

| Путь | Куда указывает |
|------|----------------|
| `account.is_owner_registered` | Вложенные поля объекта |
| `arr[1]` | Элемент массива по индексу |
| `user['meta']` или `user["meta"]` | Поле с любым именем |
| `$` (или пусто) | Корень ответа |

При отсутствии значения по пути (или `null`) подставляется `defaultValue`; если и его нет — слот не заполняется, а факт пишется в лог (`warn`).

## Примеры конфигов

### Проверка регистрации владельца в ЛК (GET)

```json
{
  "url": "https://webapisbytfl.dev.enplus.digital/api/service/sigurd/fl/{{slots.user_id_tst}}/info",
  "method": "get",
  "headers": {
    "Accept": "application/json",
    "ES-Request-Source": "Website",
    "Authorization": "Basic U2lndXJkOjR3KTojQDAycTtvaXVhcTA3MmhhOWczNQ=="
  },
  "slotsMapping": [
    { "slotId": "is_owner_registered", "path": "account.is_owner_registered", "defaultValue": "" }
  ],
  "nextArticle": "article-aba26765-2c58-47c8-b5c3-7aca6143c44f"
}
```

### POST с телом из шаблонов и fallback'ами

```json
{
  "url": "http://localhost:3366/test",
  "nextArticle": "next_intent",
  "slotsMapping": [
    { "slotId": "call_id", "path": "callId" },
    { "slotId": "arr_first", "path": "arr[1]" },
    { "slotId": "ext_user_id", "path": "user.id", "defaultValue": "" }
  ],
  "requestBody": {
    "user": "{{message.user.omni_user_id}}",
    "field_3": "{{slots.sys_firstname}} || {{Имя}}"
  }
}
```

> **Примечание.** Значение `{{Имя}}` не является слотом или полем сообщения — выражение без префиксов `slots.` / `message.` трактуется как текстовая константа и подходит для fallback-значений.

## Обработка ошибок

- Специализированной статьи перевода на оператора нет: при ошибке запроса агент логирует ошибку и уходит в `nextArticle` **без слотов**. Нужен перевод на оператора — реализуйте ветку по пустому слоту в статье/сценарии либо возьмите `soap.js`, где есть `operatorArticle`.
- Ошибки HTTP логируются с телом `error.response?.data`.
- `https.Agent` использует `rejectUnauthorized: false` (подходит для внутренних сертификатов стендов Sigurd).
