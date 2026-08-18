| **Задача**:                                                                   | **Точка входа**: | **Заказчик**:         |
|-------------------------------------------------------------------------------|------------------|-----------------------|
| [KasperTranslate-8](https://youtrack.craft-talk.ru/issue/KasperTranslate-8)   | BotMediator      | Касперский-переводчик |
| [KasperTranslate-44](https://youtrack.craft-talk.ru/issue/KasperTranslate-44) | BotMediator      | Касперский-переводчик |
| [KasperTranslate-53](https://youtrack.craft-talk.ru/issue/KasperTranslate-53) | BotMediator      | Касперский-переводчик |
| [KasperTranslate-59](https://youtrack.craft-talk.ru/issue/KasperTranslate-59) | BotMediator      | Касперский-переводчик |

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
  "llm_temperature": 0.0,
  "no_think": "/no_think"
}
```

где

- `url_llm` - где HOST - размещение llm, например https://craftgpt.craft-talk.com;
- `llm_auth_token` - где TOKEN, для авторизации может быть пустым;
- `llm_timeout` - LLM таймаут в секундах;
- `llm_temperature` - LLM температура;
- `no_think` - Поле отвечающие за размышление LLM: 
  - _"/no_think"_ - если указано это значение, ответ будет без размышлений и быстрее.
  - Если не указать ответ будет дольше, но лучше.
