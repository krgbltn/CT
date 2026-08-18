| **Задача**:                                                                   | **Точка входа**: | **Заказчик**:         |
|-------------------------------------------------------------------------------|------------------|-----------------------|
| [KasperTranslate-80](https://youtrack.craft-talk.ru/issue/KasperTranslate-80) | BotMediator      | Касперский-переводчик |

## **Настройка js-агентов определителя и переводчика языка:**

**1. Создать jsagent'ы**
Для определения языка в тексте gpt_dialog_language.js <br>
Для перевода текста gpt_translator.js <br>

**2. В настройках jsagent'ов указать:**

```json
{
  "url_llm": "http://<HOST>",
  "llm_auth_token": "<TOKEN>",
  "llm_timeout": 200,
  "llm_temperature": 0.0
}
```

где

- `url_llm` - где HOST - размещение llm, например https://craftgpt.craft-talk.com;
- `llm_auth_token` - где TOKEN, для авторизации может быть пустым;
- `llm_timeout` - LLM таймаут в секундах;
- `llm_temperature` - LLM температура;
