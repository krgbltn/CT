# E2E-тесты клиентских скриптов

Эти тесты прогоняют реальный код агентов (`gpt_tools`, `gpt_ida_qwen`,
`gpt_rupost`) через **реальный jsagent** и **реальный craftgpt**.
`botmediator` и `contextsearch` подменяются на заглушку (mock-сервер),
которая запускается прямо в процессе теста.

## Что проверяется

`common.test.js` параметризован по 3 клиентам и проверяет общую функциональность:

| Кейс | Что проверяет |
|---|---|
| `greeting` | Smalltalk без контекста — приходит хотя бы одна непустая реплика |
| `rag_answer` | Ответ по контексту с маркерным словом |
| `show_references` | `SHOW_REFERENCES=true` — отдельная реплика «Ссылки для информации» |
| `show_thinking` | `SHOW_THINKING=true` — реплика с `Meta.isThinking=true` |
| `rephrase` | `DO_REPHRASE=true` — один вызов `/search`, в `text` приходит список запросов |
| `reasoning не показывается` | `ENABLE_THINKING_RAG=true`+`SHOW_THINKING=false` — нет user-facing реплик с `Meta.isThinking=true` |
| `history` (3 теста, без RuPost) | Multi-turn: `USE_HISTORY=false` — getDialog/getDialogId не зовутся, маркер из turn 1 не помнится; `USE_HISTORY=true, MEDIATOR=false` — только getDialogId, маркер помнится через craftgpt по dialog_id; `USE_HISTORY=true, MEDIATOR=true` — оба эндпоинта, история из медиатора, маркер помнится |
| `scenario emit` (только клиенты с оператором) | Запрос на оператора → `/switchredirect` в репликах |

`gpt_ida_qwen.test.js` — IDA-специфика:
- `URL_REPLACE_FROM/TO` подменяет домен в ответе LLM
- `SHARE_ID` → ссылки `/app/share/{id}/article/`
- `use_rag=false` слот → `contextsearch` не вызывается
- `DEFINE_TOPIC=true` → `dialog_topic_title` попадает в `FilledSlots`

`mcp.test.js` — MCP-инструменты:
- Тест поднимает локальный MCP-сервер (`helpers/mcp-test-server.js`, порт
  `E2E_MCP_PORT`, по умолчанию 9998) с инструментами `add`/`multiply` и
  журналом запросов. Сервер написан на `@modelcontextprotocol/sdk`
  (devDependency этого репозитория), транспорт — Streamable HTTP (stateless).
- Через `settingsOverrides.mcp_servers` сервер подключается агенту
  `gpt_tools` (alias `calc` → тулзы `calc__add`, `calc__multiply`),
  промпт подменяется на «калькулятор, сам не считает».
- Агент считает `(7 + 5) * 3`; по журналу проверяется `tools/list` и оба
  `tools/call` с аргументами, по ответу — что итог (36) дошёл до пользователя.
- Требует jsagent, собранный с поддержкой MCP (`src/mcp-client.ts`,
  глобал `mcp` в sandbox) — иначе агент молча пропустит регистрацию тулзов.

`gpt_rupost.test.js` — RuPost-специфика:
- `LLM_ANSWER_HISTORY` накапливает реплики через `;`
- Если `LLM_ANSWER_HISTORY` уже был передан в slots — он становится началом, а не затирается. Это проверяет порядок `mergeSlots → updateAccumulatedSlot` в кастомном `_sendReply`
- 2-turn цикл сценария tracking: turn 1 даёт `/switchredirect`, turn 2 со слотом `scenario_result` отправляет результат пользователю как `markdownReply` (через хук `onScenarioCompleted`)
- Тот же паттерн для ops_search

## Что нужно запустить локально

E2E **не входит** в `npm test` — запускается отдельной командой и требует
поднятых внешних сервисов. Если переменные окружения не выставлены или
jsagent недоступен — тесты не запускаются (выводят предупреждение).

### 1. jsagent (порт 3366)

```bash
cd /home/nokados/jsagent
docker-compose up -d redis     # Redis для agentStorage (если ещё не запущен)
npm run serve                  # запуск сервиса в foreground
```

### 2. craftgpt (LLM)

URL — любой работающий. Тесты используют его как настоящий LLM, без заглушки.
Проверка ответа делается по маркерному слову, которое мы сами кладём в
контекст (`BANANA42`, `CHERRY99` и т.п.) — модель почти всегда цитирует
такой уникальный токен.

### 3. Запуск

Один раз настрой `.env` (он в git не попадает):

```bash
cd /home/nokados/jsagent-scripts/scripts-gpt/gpt-modular/__tests__/e2e
cp .env.example .env
# отредактируй .env — поставь E2E_CRAFTGPT_URL и E2E_CRAFTGPT_TOKEN
```

Запуск:

```bash
cd /home/nokados/jsagent-scripts/scripts-gpt/gpt-modular
npm run test:e2e
```

Переменные из `.env` подхватятся автоматически через `dotenv` в
`helpers/config.js`. Их также можно переопределить обычным `export` или
прямо в команде: `E2E_CRAFTGPT_URL=... npm run test:e2e`.

#### Один файл

```bash
npx vitest run --config vitest.e2e.config.js __tests__/e2e/common.test.js
npx vitest run --config vitest.e2e.config.js __tests__/e2e/gpt_ida_qwen.test.js
npx vitest run --config vitest.e2e.config.js __tests__/e2e/gpt_rupost.test.js
```

#### Один тест по имени

```bash
npx vitest run --config vitest.e2e.config.js \
  __tests__/e2e/common.test.js -t "rag_answer"
```

## Архитектура

```
vitest test ──┐                          ┌── jsagent (port 3366) ── craftgpt
              │                          │
              ├── POST /test/setup       │      │
              │   POST /test/replies     │      │ POST /search
              │   POST /test/clear       │      │ GET  /mediator/...
              ▼                          ▼      ▼
        ┌─────────────────────────────────────────┐
        │  mock-server.js (port 9999)             │
        │  – /agents/choose → отдаёт core+qwen    │
        │  – /search → берёт ответы из очереди    │
        │  – /api/send-message → ловит реплики    │
        │  – /test/* → setup / replies / clear    │
        └─────────────────────────────────────────┘
```

- **mock-server.js** запускается перед всеми тестами файла (`beforeAll`)
  и выключается после (`afterAll`).
- **agent-registry.js** читает с диска `gpt_core.js` (собранный) и
  `modules/models/qwen.js` — они отдаются как **модули jsagent-а** через
  `POST /mediator/customers/.../agents/choose`. Сам клиентский скрипт
  отдаётся в `IncomingMessage.agent_params` напрямую с
  `agent-modules: "module:qwen,module:core"`.
- **pipeline.js** — `runTurn(...)` для одного сообщения, `runDialog(...)`
  для нескольких сообщений подряд (нужен для сценариев — turn 2 видит
  историю первого).

## Подмена URL в settings

`agent-registry.js` копирует исходный `*_settings.json` клиента и
подменяет `api.*`:

| Ключ | Куда указывает |
|---|---|
| `api.url_mediator_service` | `http://localhost:9999/webhooks/mediator/messages` |
| `api.url_context_search` | `http://localhost:9999` |
| `api.url_llm` | `E2E_CRAFTGPT_URL` |
| `api.llm_auth_token` | `E2E_CRAFTGPT_TOKEN` (если задан) |
| `api.base_url` | `http://localhost:9999` (на этом домене строятся ссылки в references) |

`settingsOverrides` в `runTurn(...)` мерджится поверх — секции
(`agent_parameters`, `standard_messages` и т.п.) объединяются по верхнему
уровню, остальное заменяется целиком.

## Как добавить новый тест

1. Если тест общий для всех клиентов — добавь в `common.test.js` внутри
   `describe.each(CLIENTS)`. Для кейсов, которые нужны только клиентам
   с переводом на оператора (то есть не для IDA) — `describe.each(CLIENTS_WITH_OPERATOR)`.
2. Если специфика одного клиента — в его `<client>.test.js`.
3. Подготовь `contextsearchResponses` — массив, из которого mock-сервер
   будет брать по одному ответу на каждый вызов `/search`. Если нужно
   проверить текст ответа агента — положи в контекст уникальное маркерное
   слово, по которому потом проверять.
4. Используй `settingsOverrides.agent_parameters.<KEY>` для включения
   фич (`SHOW_REFERENCES`, `SHOW_THINKING`, `DO_REPHRASE`,
   `URL_REPLACE_FROM`, `SHARE_ID` и т.п.).
5. Для нескольких turn-ов — `runDialog({ ..., turns: [{...}, {...}] })`.
   Между turn-ами история сохраняется на mock-сервере.
6. В конце single-turn теста — `clearDialog({ dialogId: r.dialogId })`,
   чтобы не копить состояние.

## Что смотреть, если тест упал

LLM может ответить по-разному от запуска к запуску. Поэтому проверки в
основном структурные (число реплик, наличие `/switchredirect`,
кол-во вызовов `contextsearch`). Проверки по содержанию используем только
там, где в контекст положено уникальное маркерное слово — модель почти
всегда его цитирует.

При падении смотри в сообщение об ошибке: туда выводятся
`r.replies`, `r.contextsearchCalls`, `r.history`, `r.jsagentResponse` —
обычно сразу видно, что пошло не так.
