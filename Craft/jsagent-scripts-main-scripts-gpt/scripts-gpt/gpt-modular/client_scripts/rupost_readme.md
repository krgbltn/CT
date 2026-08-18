| **Задача**:                                                 | **Точка входа**: | **Заказчик**:         |
|-------------------------------------------------------------|------------------|-----------------------|
| [GPT_PR-6](https://youtrack.craft-talk.ru/issue/GPT_PR-6)   | Workplace        | Почта России          |
| [GPT_PR-10](https://youtrack.craft-talk.ru/issue/GPT_PR-10) | Workplace      | Почта России |
| [GPT_PR-16](https://youtrack.craft-talk.ru/issue/GPT_PR-16) | Workplace      | Почта России |
| [GPT_PR-47](https://youtrack.craft-talk.ru/issue/GPT_PR-47) | Workplace      | Почта России |
| [GPT_PR-64](https://youtrack.craft-talk.ru/issue/GPT_PR-64) | Workplace      | Почта России |
| [GPT_PR-68](https://youtrack.craft-talk.ru/issue/GPT_PR-68) | Workplace      | Почта России |
| [GPT_PR-73](https://youtrack.craft-talk.ru/issue/GPT_PR-73)  | Workplace      | Почта России |

## **Назначение js-агента gpt_rupost:**
- отвечать на любые вопросы клиентов, используя актуальную базу знаний компании (RAG);
- автоматически подтягивать и использовать релевантный контекст из базы знаний для каждого запроса;
- самостоятельно вызывать необходимые инструменты (tools) для выполнения действий: отслеживание отправлений, поиск отделений, перевод на оператора и т.д.;
- работать с историей диалога, слотами и накопленной информацией;
- определять намерение пользователя и сразу запускать нужные действия без лишних уточняющих вопросов;
- при необходимости переводить диалог на живого оператора.

## **Настройка js-агента gpt_rupost:**

**1. Создать jsagent'ы**
Для работы с ЛЛМ моделью почты России создать агента gpt_rupost.js <br>

**2. В настройках jsagent'ов указать:**

```json
{
  "api": {
    "base_url": "<BASE_DOMAIN>",
    "url_context_search": "<CONTEXT_SEARCH_URL>",
    "url_llm": "<LLM_SERVICE_URL>",
    "llm_auth_token": "<LLM_AUTH_TOKEN>",
    "url_mediator_service": "<MEDIATOR_WEBHOOK_URL>"
  },
  "customer_id": "<CUSTOMER_ID>",
  "agent_name": "<AGENT_NAME>",
  "proxy": {
    "USE_PROXY": false,
    "url": "<PROXY_URL>",
    "port": "<PROXY_PORT>"
  },
  "llm_settings": {
    "timeout": 200,
    "temperature": 0.6,
    "temperature_smalltalk": 0.7,
    "top_p": 0.95,
    "top_k": 20,
    "min_p": 0
  },
  "context_settings": {
    "LAST_CONTEXT_PRICE": 0.19,
    "OTHER_CONTEXT_PRICE": 3.1,
    "ADD_OTHER_CONTEXT": true,
    "MAX_CONTEXTS": -1,
    "FILTERS": "<FILTERS>",
    "RECORD_TYPE": "<RECORD_TYPE>"
  },
  "agent_parameters": {
    "DO_REPHRASE": false,
    "REPHRASE_N_GENERATIONS": 4,
    "REPHRASE_SAMPLES_PER_GENERATION": 8,
    "ENABLE_THINKING_SMALLTALK": true,
    "ENABLE_THINKING_RAG": true,
    "SHOW_THINKING": false,
    "MAX_CYCLES": 5,
    "SMALLTALK_IF_NO_CONTEXT": true,
    "SHOW_CONTEXT": false,
    "SHOW_REFERENCES": false,
    "USE_HISTORY": true,
    "DEBUG": false,
    "THINK": "/think",
    "NO_THINK": "/no_think"
  },
  "roles": {
    "USER": "user",
    "BOT": "assistant",
    "OPERATOR": "operator"
  },
  "keys": {
    "QUEUE_KEY": "function_queue",
    "N_CYCLES_KEY": "n_cycles"
  },
  "user_slots": [
    {
      "id": "<SLOT_ID_1>",
      "description": "<SLOT_DESCRIPTION_1>"
    }
  ],
  "agent_slots": {
    "SCENARIO_RESULT": "<SCENARIO_RESULT_SLOT>",
    "SCENARIO_SOURCE": "<SCENARIO_SOURCE_SLOT>",
    "LLM_ANSWER_HISTORY": "<LLM_HISTORY_SLOT>",
    "TRACK_NUMBER": "<TRACK_NUMBER_SLOT>",
    "INDEX_OPS": "<OPS_INDEX_SLOT>"
  },
  "articles": {
    "TRANSFER_FOR_OPERATOR": {
      "ID": "<ARTICLE_ID_1>",
      "NAME": "<ARTICLE_NAME_1>"
    },
    "START_OPS_SEARCH": {
      "ID": "<ARTICLE_ID_2>",
      "NAME": "<ARTICLE_NAME_2>"
    },
    "START_RUPOST_TRACKING": {
      "ID": "<ARTICLE_ID_3>",
      "NAME": "<ARTICLE_NAME_3>"
    }
  },
  "standard_messages": {
    "DEFAULT_ERROR_MSG": "<ERROR_MESSAGE>",
    "TIMEOUT_ERROR_MSG": "<TIMEOUT_MESSAGE>",
    "MESSAGE_CANCEL_WAITING": "<CANCEL_MESSAGE>",
    "NO_CONTEXT_TEXT": "<NO_CONTEXT_MESSAGE>"
  },
  "trans_map": {
    "а": "a",
    "б": "b",
    "в": "v",
    "г": "g",
    "д": "d",
    "е": "e",
    "ё": "yo",
    "ж": "zh",
    "з": "z",
    "и": "i",
    "й": "y",
    "к": "k",
    "л": "l",
    "м": "m",
    "н": "n",
    "о": "o",
    "п": "p",
    "р": "r",
    "с": "s",
    "т": "t",
    "у": "u",
    "ф": "f",
    "х": "kh",
    "ц": "ts",
    "ч": "ch",
    "ш": "sh",
    "щ": "shch",
    "ъ": "",
    "ы": "y",
    "ь": "",
    "э": "e",
    "ю": "yu",
    "я": "ya"
  }
}
```

где:

#### API настройки:

- `base_url` - основной домен системы
- `url_context_search` - URL сервиса поиска контекста
- `url_llm` - URL LLM сервиса
- `llm_auth_token` - токен авторизации для LLM сервиса
- `url_mediator_service` - URL вебхука медиатор-сервиса

#### Основные параметры:

- `customer_id` - идентификатор клиента
- `agent_name` - название этого агента в системе
- `proxy` - настройки прокси (USE_PROXY: true/false, url, port)

#### LLM настройки:

- `timeout` - таймаут в секундах
- `temperature` - температура для основных запросов (0.0-1.0)
- `temperature_smalltalk` - температура для светских бесед (0.0-1.0)
- `top_p` - параметр top_p для sampling
- `top_k` - параметр top_k для sampling
- `min_p` - параметр min_p для sampling

#### Настройки контекста:

- `LAST_CONTEXT_PRICE` - стоимость последнего контекста
- `OTHER_CONTEXT_PRICE` - стоимость другого контекста
- `ADD_OTHER_CONTEXT` - добавлять ли другой контекст
- `ADD_COMPLEX_SCENARIOS_TO_TOOLS` - добавлять ли сложные сценарии в тулзы
- `MAX_CONTEXTS` - максимальное количество контекстов (-1 - без ограничений)
- `MAX_COMPLEX_QUESTION_EXAMPLES_LENGTH` - максимальная длина примеров вопросов в сложных сценариях(по умолчанию, 1000)
- `RECORD_TYPE` - тип записи статей, которые хотим находить контекстным поиском (`null` — искать по всем типам)
- `FILTERS` - фильтры для contextsearch. filter[][]
- ```
  type filter = {
        "field": "intent_id"|"customer_id"|"record_type"|"tags"|"symbol_code"|"catalog_symbol_code",
        "condition": "must"|"must_not",
        "values": string[]
      }
  filter[][], где каждый подмассив - это группа фильтров объединённая условием AND. Между группами условие OR
    [
        // intent_id = (abc OR sdf)
        [
            {
                "field": "intent_id",
                "condition": "must",
                "values": ["abc","sdf"]
            }
        ]
        // OR
        // customer_id != cust_1 AND symbol_code = (123 OR 345 OR 456)
        [
            {
                "field": "customer_id",
                "condition": "must_not",
                "values": ["cust_1"]
            },
            {
                "field": "symbol_code",
                "condition": "must",
                "values": ["123","345","456"]
            }
        ]
    ]
```

#### Параметры агента:

- `DO_REPHRASE` - выполнять перефразирование
- `REPHRASE_N_GENERATIONS` - количество генераций для перефразирования
- `REPHRASE_SAMPLES_PER_GENERATION` - сэмплов на генерацию
- `ENABLE_THINKING_SMALLTALK` - включить размышления для smalltalk
- `ENABLE_THINKING_RAG` - включить размышления для RAG
- `SHOW_THINKING` - показывать процесс размышлений
- `MAX_CYCLES` - максимальное количество циклов
- `SMALLTALK_IF_NO_CONTEXT` - использовать smalltalk если нет контекста
- `SHOW_CONTEXT` - показывать контекст
- `SHOW_REFERENCES` - показывать ссылки
- `USE_HISTORY` - использовать историю диалога
- `DEBUG` - режим отладки
- `THINK` - команда для включения размышлений
- `NO_THINK` - команда для отключения размышлений

#### Роли и ключи:

- `roles` - маппинг ролей в системе
- `keys` - ключи для внутренних процессов

#### Слоты:

- `user_slots` - пользовательские слоты данных
- `agent_slots` - слоты агента

#### Статьи и сообщения:

- `articles` - предопределенные статьи и сценарии
- `standard_messages` - стандартные системные сообщения
- `trans_map` - таблица транслитерации
