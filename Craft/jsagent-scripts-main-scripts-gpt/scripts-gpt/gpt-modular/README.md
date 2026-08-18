# GPT Scripts

## Что происходит?

jsagent gpt разбит на модули и покрыт тестами.

### Модули

Есть **core-модули** с функционалом и **models-модули** с кодом, специфичным под модель.

Для удобства все core-модули автоматически при коммите конкатенируются в `gpt_core.js`, который можно использовать как единый модуль. Я старался разделить модули независимо, так чтобы ненужный можно было выбросить без потери функциональности, но не тестировал такие кейсы; ожидаемый кейс — подключать `gpt_core.js`.

То есть сначала подключаются core всегда, потом — в зависимости от выбранной модели — `qwen` / `gigachat` / `default`. После — основной клиентский скрипт с логикой под проект. Клиентский скрипт может переопределить любую функцию из модулей, так что гибкость должна остаться. Сейчас переписаны 3 клиента под новую систему: основной `gpt_tools`, `gpt_ida_qwen` и `gpt_rupost`.

### Тесты

Юнит-тесты на vitest, end-to-end тесты тоже на vitest и express для мокания contextsearch и ботмедиатора.

> **TODO:** добавить ссылку на документацию про использование js-agent как модули.

## Структура

```
scripts-gpt/gpt-modular/
├── modules/
│   ├── core/        # 10_globals.js ... 80_main.js — собираются в gpt_core.js
│   └── models/      # qwen.js, gigachat.js, default.js
├── client_scripts/  # gpt_tools, gpt_ida_qwen, gpt_rupost + их *_settings.json
├── __tests__/       # юнит + e2e
├── gpt_core.js      # генерируется build.sh
├── build.sh
├── package.json
└── vitest.config.js, vitest.e2e.config.js
```

### Core-модули (`modules/core/`)

Порядок загрузки задаётся номером в имени файла:

| # | Файл | Содержимое |
|---|------|------------|
| 10 | `globals.js` | `ITEM_TYPES`, общие переменные, утилиты (`translit`, `validateHttpUrl`) |
| 20 | `http.js` | URL LLM-эндпоинтов, `_callLLM`, `PROXY`, `AGENT` |
| 30 | `dialog.js` | `ResponseFormatter`, `buildLLMHistory`, `prepareHistoryWithReasoning`, `processScenarios`, `getDialog` |
| 40 | `references.js` | `getReferences`, `getTitleWithUrl` |
| 50 | `context.js` | `getContext`, `getContextFromScenarios` |
| 55 | `slots.js` | `SlotManager`, `slotManager`, `getSlotValue`, `getSlots` |
| 60 | `rag.js` | `smalltalk`, `rag`, `rephrase`, `applyPromptOverrides` |
| 65 | `mcp.js` | `MCP_SERVERS`, `registerMcpTools` — превращает MCP-серверы в тулзы |
| 70 | `tools_loop.js` | `SwitchRedirectPropagate`, `scenario`, `switchredirect`, `RedisQueue`, tool execution loop |
| 80 | `main.js` | `_sendReply`, `_printResponse`, `sendMessageToLLM`, `main`, `_mainBody`, `runEntrypoint` |

### Модули моделей (`modules/models/`)

Каждый файл предоставляет класс `MessageProcessor` с `fromModelFormat()` / `toModelFormat()` и функцию `applyModelConfig()`.

| Файл | Описание |
|------|----------|
| `qwen.js` | Qwen3 — извлечение reasoning из `<think>` тегов, `/think` и `/no_think` суффиксы |
| `gigachat.js` | GigaChat — без reasoning |
| `default.js` | Модель по умолчанию — без reasoning |

### Клиентские скрипты (`client_scripts/`)

Каждый определяет промпты, tool-функции, `availableFunctions`, `TOOLS` и `_main()`, затем вызывает `applyPromptOverrides()`, `applyModelConfig()` и `runEntrypoint()`.

| Скрипт | Модель | Описание |
|--------|--------|----------|
| `gpt_tools.js` | qwen | Базовый скрипт с тулзами. Настройки: `gpt_tools_settings.json` |
| `gpt_ida_qwen.js` | qwen | IDA — переопределяет `extractThinkContent` (замена URL), `getReferences` (SHARE_ID), добавляет `define_topic`, слот-переключатели в `_main` |
| `gpt_rupost.js` | default | Почта России — значительные переопределения: `_sendReply`, `prepareHistory`, `smalltalk`, `rag`, `sendMessageToLLM`, `main`, `_main`, `RupostRedisQueue` |

Если поведение не покрывается настройками, его можно переопределить в клиентском скрипте, объявив одноимённую функцию заново — последнее объявление выигрывает в общей области видимости. Так в `gpt_rupost.js` переопределены ключевые функции пайплайна.

## Сборка

```bash
bash scripts-gpt/gpt-modular/build.sh
```

Генерирует `gpt_core.js` из `modules/core/[0-9]*.js`.

### Pre-commit хук

После клонирования репозитория один раз выполни:

```bash
git config core.hooksPath .githooks
```

Хук автоматически пересобирает `gpt_core.js` при коммите изменений в `modules/core/`.

## Тестирование

```bash
cd scripts-gpt/gpt-modular
npm install
npm test            # юнит-тесты (vitest run)
npm run test:watch  # юнит-тесты в watch-режиме
npm run test:e2e    # e2e (нужны поднятые jsagent + craftgpt)
```

Подробности по e2e — в `__tests__/e2e/README.md`.

## Фичи

- История из ботмедиатора
- Тулзы (tool calls loop)
- Поиск по сценариям: простые и сложные
- Подстановка слотов
- RAG с rephrase
- Smalltalk fallback
- Think / no_think для моделей с reasoning
- Поддержка тестового скрипта

---

## Настройки

Каждый клиентский скрипт читает конфиг из своего `*_settings.json`. Ниже — описание всех полей.

### `api`

| Поле | Тип | Описание |
|------|-----|----------|
| `base_url` | string | Основной домен системы (используется в ссылках на статьи) |
| `url_llm` | string | URL craftgpt-сервиса (LLM) |
| `url_context_search` | string | URL contextsearch-сервиса |
| `url_mediator_service` | string | URL вебхука ботмедиатора (для истории диалога) |
| `llm_auth_token` | string | Bearer-токен для craftgpt |
| `reject_unauthorized` | bool, `true` | Проверять TLS-сертификат при HTTPS-запросах |

### `customer_id`, `agent_name`

| Поле | Тип | Описание |
|------|-----|----------|
| `customer_id` | string | Идентификатор клиента (проекта) в платформе |
| `agent_name` | string | Имя этого агента (используется в `switchredirect` обратно на себя) |

### `proxy`

| Поле | Тип | По умолчанию | Описание |
|------|-----|--------------|----------|
| `USE_PROXY` | bool | `false` | Включить прокси для исходящих HTTP |
| `url` | string | — | Адрес прокси-сервера |
| `port` | number | — | Порт прокси |

### `llm_settings`

| Поле | Тип | По умолчанию | Описание |
|------|-----|--------------|----------|
| `timeout` | number | `60` | Таймаут одного LLM-запроса (сек) |
| `temperature` | number | `0.6` | Температура для основного RAG-запроса |
| `temperature_smalltalk` | number | `0.7` | Температура для smalltalk |
| `top_p` | number | `0.95` | nucleus sampling |
| `top_k` | number | `20` | top-k sampling |
| `min_p` | number | `0.0` | min_p sampling |
| `max_tokens` | number \| null | `null` | Лимит токенов генерации; `null` — craftgpt применит свой дефолт (`config.max_tokens`) |

### `context_settings`

| Поле | Тип | По умолчанию | Описание |
|------|-----|--------------|----------|
| `LAST_CONTEXT_PRICE` | number | `0.19` | Цена за контекст найденный для последнего (текущего) пользовательского сообщения |
| `OTHER_CONTEXT_PRICE` | number | `3.1` | Цена за остальные контексты |
| `ADD_OTHER_CONTEXT` | bool | `true` | Добавлять ли контексты помимо последнего |
| `MAX_CONTEXTS` | number | `25` | Максимум статей в контексте (`-1` — без ограничений) |
| `MAX_COMPLEX_SCENARIOS` | number | `5` | Максимум сложных сценариев |
| `MAX_COMPLEX_QUESTION_EXAMPLES_LENGTH` | number | `1000` | Максимальная длина примеров вопросов в сложном сценарии |
| `CONTEXT_FROM_SCENARIOS` | bool | `false` | Искать контекст внутри сценариев |
| `ADD_COMPLEX_SCENARIOS_TO_TOOLS` | bool | `false` | Прокидывать сложные сценарии как тулзы |
| `FILTERS` | array | `[]` | Фильтры для contextsearch. Формат: `[[{field, condition, values}]]` — внешний массив = OR-группы, внутренний = AND |
| `RECORD_TYPE` | string\|null | `null` | Тип записей, в которых ищем контекст. `null` — искать по всем типам |
| `CATALOG_IDS` | string[]\|null | `null` | Список ID каталогов для фильтра. Передаётся в contextsearch как `catalog_symbol_code` |
| `TAGS` | string[]\|null | `null` | Список тегов для фильтра. Передаётся в contextsearch как `tags` |
| `SIMPLE_INCLUDE_QUESTIONS` | bool | `false` | Включать список вопросов простого сценария в контекст |
| `SIMPLE_MAX_QUESTIONS` | number | `5` | Максимум вопросов из простого сценария |
| `SIMPLE_INCLUDE_CONDITIONS` | bool | `false` | Включать условия (conditions) простого сценария |
| `SIMPLE_TITLE_WITH_URL` | bool | `true` | Заголовок простого сценария с URL |

### `agent_parameters`

Общие:

| Поле | Тип | По умолчанию | Описание |
|------|-----|--------------|----------|
| `DEBUG` | bool | `false` | Включить debug-логи и debug-реплики |
| `SHOW_THINKING` | bool | `false` | Отправлять reasoning-сообщения пользователю (с meta `isThinking: true`) |
| `SHOW_REFERENCES` | bool | `false` | Отдельная реплика «Ссылки для информации» со списком источников |
| `SHOW_CONTEXT` | bool | `false` | Дублировать найденный контекст в debug-реплику |
| `USE_HISTORY` | bool | `true` | Учитывать историю диалога |
| `HISTORY_FROM_BOT_MEDIATOR` | bool | `false` | Брать историю из ботмедиатора (иначе — из craftgpt по `dialog_id`) |
| `MAX_CYCLES` | number | `5` | Максимум итераций tools-loop |
| `TOOL_DONE_MESSAGE` | string | `"Done"` | Сообщение, отправляемое в `tool_responses` при пустом результате тулзы |

RAG / rephrase:

| Поле | Тип | По умолчанию | Описание |
|------|-----|--------------|----------|
| `DO_REPHRASE` | bool | `false` | Перефразировать вопрос пользователя перед поиском |
| `REPHRASE_N_GENERATIONS` | number | `4` | Количество генераций для перефразирования |
| `REPHRASE_SAMPLES_PER_GENERATION` | number | `4` | Сэмплов в одной генерации |
| `ENABLE_THINKING_RAG` | bool | `true` | Включить reasoning для RAG-запроса |
| `ENABLE_THINKING_SMALLTALK` | bool | `true` | Включить reasoning для smalltalk |
| `SMALLTALK_IF_NO_CONTEXT` | bool | `true` | Падать в smalltalk, если контекст не найден |

IDA-specific (`gpt_ida_qwen`):

| Поле | Тип | По умолчанию | Описание |
|------|-----|--------------|----------|
| `SHARE_ID` | string\|null | `null` | Если задан — ссылки на статьи делаются через `/app/share/{SHARE_ID}/article/` |
| `URL_REPLACE_FROM` | string\|null | `null` | Подстрока для замены в ответе LLM (обычно `https://OLD-DOMAIN`) |
| `URL_REPLACE_TO` | string\|null | `null` | На что заменять (`https://NEW-DOMAIN`) |
| `DEFINE_TOPIC` | bool | `false` | Дополнительно определять тему диалога и класть в слот `dialog_topic_title` |
| `USE_RAG` | bool | `true` | Если `false` — не вызывать contextsearch |

### `standard_messages`

| Поле | По умолчанию | Описание |
|------|--------------|----------|
| `DEFAULT_ERROR_MSG` | `"Что-то пошло не так, попробуйте еще раз."` | Реплика при необработанной ошибке |
| `TIMEOUT_ERROR_MSG` | `"Извините за задержку!..."` | Реплика при таймауте LLM |
| `NO_CONTEXT_TEXT` | `"К сожалению я не знаю ответ на ваш вопрос..."` | Ответ, когда контекст не найден и `SMALLTALK_IF_NO_CONTEXT=false` |
| `MESSAGE_CANCEL_WAITING` | `"Готов ответить на ваш следующий вопрос!..."` | После прерывания tools-цикла кнопкой «Прервать» |
| `MESSAGE_WHILE_WAITING_ERROR` | (см. код) | Сообщение при попытке задать новый вопрос, пока обрабатывается предыдущий. Содержит кнопку «Прервать» |

### `slots`

| Поле | Тип | Описание |
|------|-----|----------|
| `agent_slots` | object | Маппинг логических имён слотов на физические в платформе. Ключи: `SCENARIO_RESULT`, `SCENARIO_SOURCE`, `LLM_ANSWER_HISTORY`, и клиент-специфичные |
| `use_slots` | bool | Учитывать пользовательские слоты в промпте |
| `user_slots_placeholder` | string | Заголовок секции со слотами в промпте (например `"## Слоты:"`) |
| `user_slots` | array | Массив `{id, description}` — описания слотов для подстановки в промпт |

### `articles`

Маппинг логических имён статей на их идентификаторы в БЗ. Используется клиентским скриптом для маршрутизации (например, статья «Отсутствие операторов»).

| Поле | Тип | Описание |
|------|-----|----------|
| `<NAME>.ID` | string | ID статьи в КБ |
| `<NAME>.NAME` | string | Человекочитаемое имя |

### `mcp_servers`

Список удалённых [MCP](https://modelcontextprotocol.io)-серверов. На каждое входящее сообщение `registerMcpTools()` (модуль `65_mcp.js`) запрашивает у каждого включённого сервера список инструментов (`tools/list`) и превращает их в стандартные тулзы: спецификация уходит в LLM в составе `TOOLS`, а вызов маршрутизируется в `mcp.callTool` (помощник `mcp` инжектируется платформой jsagent). Имя тулзы префиксуется алиасом сервера: `<alias>__<tool>`. Недоступный сервер логируется и пропускается, не ломая обработку сообщения.

Поддерживаются только удалённые транспорты: `http` (Streamable HTTP) и `sse`.

| Поле | Тип | Описание |
|------|-----|----------|
| `alias` | string | Префикс имён тулз этого сервера (для уникальности) |
| `transport` | string | `"http"` (по умолчанию) или `"sse"` |
| `url` | string | URL MCP-эндпоинта |
| `headers` | object | Необязательные HTTP-заголовки (например `Authorization`) |
| `enabled` | boolean | `false` — сервер игнорируется |
| `tool_filter` | string[] | Необязательный allow-list имён инструментов; пусто — берутся все |

```json
"mcp_servers": [
  { "alias": "weather", "transport": "http", "url": "https://example.com/mcp",
    "headers": { "Authorization": "Bearer <token>" }, "enabled": true, "tool_filter": [] }
]
```

### `prompts.*`

Промпты задаются прямо в клиентском скрипте (`LLM_SYSTEM_TEMPLATE`, `LLM_SYSTEM_TEMPLATE_SMALLTALK`, и т. п.). Любое поле в секции `prompts` подменяет соответствующий шаблон в коде через `applyPromptOverrides()`:

| Поле | Подменяет |
|------|-----------|
| `prompts.system_template` | `LLM_SYSTEM_TEMPLATE` (RAG) |
| `prompts.system_template_smalltalk` | `LLM_SYSTEM_TEMPLATE_SMALLTALK` |
| `prompts.rag_template` | `RAG_TEMPLATE` |
| `prompts.smalltalk_template` | `SMALLTALK_TEMPLATE` |
| `prompts.rag_document_template` | `RAG_DOCUMENT_TEMPLATE` |
| `prompts.system_template_topic` | (IDA) `LLM_SYSTEM_TEMPLATE_TOPIC` |
