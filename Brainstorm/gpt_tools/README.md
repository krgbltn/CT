# Brainstorm: Миграция с кнопочного роутинга на LLM-классификацию

## Задача

На проекте Brainstorm (компания, продающая и обслуживающая диагностическое оборудование для автомобилей) клиент в чате выбирал кнопкой тип оборудования, после чего диалог переключался на соответствующего GPT-агента. Задача — убрать кнопки, оставить одного GPT-агента, который сам классифицирует продукт из вопроса пользователя через LLM и ищет информацию только в контексте этого продукта.

## Что было до

5 отдельных не-модульных JS-агентов в `Brainstorm/`, каждый ~600 строк, с идентичной логикой, различающиеся только `record_type` и `aiai2_name`:

| Агент | record_type | aiai2_name |
|---|---|---|
| gpt_qwen_mix.js | grunbaum | aiassist2 |
| gpt_qwen_mix_autell.js | autell | ai_autell |
| gpt_qwen_mix_brainstorm.js | jaltest | ai_brainstorm |
| gpt_qwen_mix_diag.js | autel_diag | ai_autel_diag |
| gpt_qwen_mix_launch.js | launch | ai_launch |

Flow: пользователь → aiassist2 (с кнопками) → выбор оборудования → /switchredirect → GPT-агент → getContext(record_type=...) → rag() → ответ → /switchredirect обратно на aiassist2 → кнопки снова.

Проблемы: 5 копий кода, нет tool calling, нет слотов, ловушка редиректов обратно к кнопкам.

## Структура файлов

```
Brainstorm/gpt_tools/
├── gpt_core.js                # Ядро gpt-modular (собрано из modules/core/*.js)
├── gpt_qwen.js                # Модель Qwen (из modules/models/qwen.js)
├── gpt_brainstorm.js          # Клиентский скрипт — основная логика агента
├── gpt_brainstorm_settings.json # Настройки агента
└── README.md                  # Этот файл
```

## Что сделано

### gpt_brainstorm.js

Единый клиентский скрипт на базе модульной архитектуры gpt-modular.

**Ключевые компоненты:**

1. **PRODUCTS** — читаются из `agentSettings.products` (вынесены в настройки). Каждый продукт имеет `name`, `description`, `queue` (значение слота для маршрутизации на операторов).

2. **Tool `search_in_knowledge_base`** — LLM вызывает его, передавая `product` (record_type) и `queries` (поисковые запросы). Функция:
   - Делает POST на contextsearch с нужным `record_type`
   - Форматирует контекст для LLM
   - Записывает `queue` слот через `slotManager.setSlot("queue", PRODUCTS[product].queue)`

3. **Tool `transfer_to_operator`** — обёрнут в `scenario(null)`. Читает `queue` слот, делает `/switchredirect` на статью оператора с `FilledSlots: { queue }`. Используется ТОЛЬКО после неудачной переформулировки вопроса или при явной просьбе пользователя.

4. **Промпт** — инструктирует LLM:
   - Определить продукт из вопроса
   - Если продукт ясен → вызвать search_in_knowledge_base
   - Если продукт не ясен → задать уточняющий вопрос
   - Если ответ не найден → попросить переформулировать
   - Если переформулировка не помогла → transfer_to_operator

5. **`_main`** — вызывает `_mainBody` с `use_rag: false, use_rephrase: false, use_smalltalk: true`. Весь RAG идёт через tool, не автоматически.

### gpt_brainstorm_settings.json

Настройки агента в формате gpt-modular. Содержит:
- `api` — URL сервисов (contextsearch, craftgpt, auth_token)
- `llm_settings` — параметры LLM (temperature, timeout и т.д.)
- `context_settings` — параметры поиска (MAX_CONTEXTS=10, RECORD_TYPE=null — т.к. record_type определяется LLM динамически)
- `agent_parameters` — флаги (DO_REPHRASE=false, MAX_CYCLES=5 и т.д.)
- `products` — маппинг продуктов с name, description, queue
- `articles` — ID статьи для transfer_to_operator

### gpt_core.js и gpt_qwen.js

Скопированы из репозитория `Craft/jsagent-scripts-main-scripts-gpt/scripts-gpt/gpt-modular/`:
- `gpt_core.js` — собран из `modules/core/10_globals.js` .. `80_main.js` через `build.sh`
- `gpt_qwen.js` — взят из `modules/models/qwen.js`

## Использовано

- Модульная архитектура `scripts-gpt/gpt-modular/` — ядро (gpt_core.js), модели (qwen.js), tool calling (70_tools_loop.js), слоты (55_slots.js), контекст-серч (50_context.js)
- Паттерн клиента `gpt_tools.js` (Kaspersky) — пример tool definitions, availableFunctions, TOOLS массива
- Маппинг product → record_type → queue слот для маршрутизации на операторов (значения: tpmsman, сервисное, диагностическое, autel, другое)
- Статья-заглушка `article-abae67bd-9f73-4157-afbb-582248506ae9` для transfer_to_operator (одинаковая для всех агентов, распределение по очередям происходит внутри сценария по слоту queue)

---

## План запуска

### Шаг 1. Создание JS-агентов в CraftTalk

В интерфейсе CraftTalk: **Settings → Project → Agents → JS agent**

Создать 3 JS-агента:

#### 1.1 `gpt_core` (модуль)
- Содержимое: скопировать из `Brainstorm/gpt_tools/gpt_core.js`
- Поставить галку **"Является ли данный script модулем"** → Да

#### 1.2 `gpt_qwen` (модуль)
- Содержимое: скопировать из `Brainstorm/gpt_tools/gpt_qwen.js`
- Поставить галку **"Является ли данный script модулем"** → Да

#### 1.3 `gpt_brainstorm` (главный агент)
- Содержимое: скопировать из `Brainstorm/gpt_tools/gpt_brainstorm.js`
- В поле **"Подключаемые js-script модули"** указать: `gpt_core,gpt_qwen`
- Галка "Является модулем" — НЕ ставить

### Шаг 2. Настройка параметров агента `gpt_brainstorm`

Заполнить поля агента значениями из `gpt_brainstorm_settings.json`:
- `customer_id`: `brainstorm`
- `agent_name`: `gpt_brainstorm`
- `url_context_search`: `http://contextsearch:8801`
- `url_llm`: `http://craftgpt:3020`
- `llm_auth_token`: `SKfLcuNKrmGzbP9pKgVpi7aMq8ciESn1Xgzm6xAq8y8`
- Остальные параметры — согласно JSON (llm_settings, context_settings, agent_parameters, products, articles)

### Шаг 3. Настройка aiassist2

В интерфейсе CraftTalk найти текущий `aiassist2`:

1. **Убрать кнопки** выбора оборудования из артикулов (AUTEL TPMS, LAUNCH, JALTEST и т.д.)
2. **Настроить роутинг** — при старте диалога переключать на `gpt_brainstorm`:
   - Либо через дефолтного агента
   - Либо через `/switchredirect gpt_brainstorm` в приветственном артикуле
3. Настроить артикул `article-abae67bd-9f73-4157-afbb-582248506ae9` — сценарий должен читать слот `queue` и маршрутизировать на нужную группу операторов:
   - `tpmsman` → операторы TPMS
   - `autel` → операторы AUTEL
   - `диагностическое` → операторы диагностики
   - `другое` → оператор по умолчанию

### Шаг 4. Тестирование

Проверить сценарии:

| Вопрос | Ожидание |
|---|---|
| "Как обновить прошивку на TS508?" | product=autell, поиск в autell, ответ из контекста |
| "Как пользоваться MaxiSYS MS906?" | product=autel_diag, поиск в autel_diag |
| "Какие датчики TPMSMAN поддерживаются?" | product=grunbaum, поиск в grunbaum |
| "Как настроить X-431 PAD V?" | product=launch, поиск в launch |
| "Привет" | smalltalk, без вызова инструмента |
| "У меня Topdon, помогите" | "Мы не поддерживаем данное оборудование" |
| "Как откалибровать датчик?" (без указания продукта) | Уточняющий вопрос: какое оборудование? |
| "Мой вопрос не решён" (после неудачного ответа) | transfer_to_operator с queue слотом |

### Шаг 5. Мониторинг

- Проверять логи на предмет ошибок contextsearch
- Следить за корректностью классификации продуктов LLM
- При необходимости корректировать промпт или описания продуктов в settings.json

### Статус

- Старые агенты `gpt_qwen_mix*.js` — не изменены, не удалены (оставлены как fallback)
- Redirect_back_to_aia2 закомментирован (планируется добавить позже)
