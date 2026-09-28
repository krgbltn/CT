# Шаблон Qwen GPT с тулзами

| Задача | Точка входа | Клиент |
|---|---|---|
| BASE-GPT-TOOLS | `gpt_tools_qwen.js` | Шаблон |

Переиспользуемый Qwen GPT-агент для проектов CraftTalk. Использует RAG из `gpt_core.js` и содержит две сценарные тулзы: перевод на оператора и завершение диалога.

## Файлы

| Файл | Назначение |
|---|---|
| `gpt_tools_qwen.js` | Промпты, функции тулзов, `availableFunctions` и OpenAI-схемы тулзов. |
| `gpt_tools_qwen_settings.json` | Настройки проекта и окружения. |
| `qwen.js` | Модуль модели Qwen: обработка `<think>` и настройка модели. |
| `gpt_core.js` | Сгенерированный общий модуль RAG, слотов, истории и цикла тулзов. |

Шаблон содержит совместимые копии `qwen.js` и `gpt_core.js`, поэтому все требуемые модули можно публиковать вместе с новым проектом. `gpt_core.js` генерируется из поддерживаемых исходников `gpt-modular/modules/core`; не изменяйте его в проектном агенте.

## Создание Проекта

1. Скопируйте файлы шаблона в папку нового проекта и переименуйте их для проекта.
2. Замените `LLM_SYSTEM_TEMPLATE` на проектный промпт. Сохраните явные правила вызова каждой тулзы.
3. Заполните все плейсхолдеры в `gpt_tools_qwen_settings.json`: API URL, токен LLM, `customer_id`, `agent_name`, `RECORD_TYPE`, фильтры каталогов и ID статей.
4. Укажите в `articles.TRANSFER_FOR_OPERATOR.ID` статью сценария оператора, а в `articles.FINISH_DIALOG.ID` статью сценария завершения.
5. Локализуйте `standard_messages` под язык проекта.
6. Перед публикацией выполните проверки из раздела [Проверка](#проверка).

## Базовые Тулзы

Обе базовые тулзы являются сценарными без ожидания результата. `scenario(null)` означает, что GPT-агент не ждёт результата сценария. `switchredirect()` передаёт диалог в `aiassist2` и открывает статью с настроенным `intent_id`.

```js
const transfer_to_operator = scenario(null)(function () {
    return switchredirect(ARTICLES.TRANSFER_FOR_OPERATOR.ID)
})

const finish_dialog = scenario(null)(function () {
    return switchredirect(ARTICLES.FINISH_DIALOG.ID)
})
```

- `transfer_to_operator` используется при явном запросе оператора, жалобе, агрессии и нерешённых вопросах.
- `finish_dialog` используется при явном прощании и подтверждённом завершении диалога.
- Не отправляйте текстовый ответ вместе с вызовом любой из этих тулзов.

## Добавление Тулзы

1. Добавьте статью сценария в настройки `articles`. Пример:

```json
"START_ORDER_STATUS": {
  "ID": "article-<project-article-id>",
  "NAME": "Статус заказа"
}
```

2. Добавьте функцию сценария в `gpt_tools_qwen.js`:

```js
const transfer_to_order_status = scenario(null)(function () {
    return switchredirect(ARTICLES.START_ORDER_STATUS.ID)
})
```

3. Зарегистрируйте её в `availableFunctions`:

```js
const availableFunctions = {
    transfer_to_operator,
    finish_dialog,
    transfer_to_order_status,
}
```

4. Добавьте OpenAI-схему тулзы в `TOOLS`:

```js
{
    type: 'function',
    function: {
        name: 'transfer_to_order_status',
        description: 'Переводит диалог в сценарий проверки статуса заказа.',
        parameters: { type: 'object', properties: {}, required: [] },
    },
}
```

5. Добавьте в системный промпт понятные условия вызова новой тулзы.

## Изменение Логики Тулзы

Меняйте только клиентский скрипт, если общая логика `gpt_core.js` не должна измениться для всех проектов.

- Изменяйте целевой сценарий через соответствующую настройку `articles.<КЛЮЧ>.ID`.
- Добавляйте аргументы тулзы одновременно в функцию и её схему `parameters`.
- Перед переводом записывайте значения в слоты через `slotManager.setSlot(slotId, value)`.
- Используйте `scenario(null)` для окончательного перевода без результата.
- Используйте `scenario(AGENT_SLOTS.SCENARIO_RESULT)`, если сценарий должен вернуть данные GPT-агенту через слот.
- Добавляйте проверку аргументов перед `switchredirect()`, если тулза требует входные значения.

Пример с обязательным аргументом и слотом:

```js
const transfer_to_tracking = scenario(AGENT_SLOTS.SCENARIO_RESULT)(function ({ track_number }) {
    if (!track_number) return 'ERROR: требуется track_number'
    slotManager.setSlot(AGENT_SLOTS.TRACK_NUMBER, track_number)
    return switchredirect(ARTICLES.START_TRACKING.ID)
})
```

Перед использованием примера объявите `TRACK_NUMBER` и `START_TRACKING` в настройках.

## Проверка

Выполните из папки шаблона:

```powershell
node --check gpt_tools_qwen.js
```

Если менялась общая логика core, выполните поддерживаемые модульные тесты из `scripts-gpt/gpt-modular`:

```powershell
npm test
```

После публикации проекта проверьте в тестовом диалоге:

1. Запрос оператора вызывает `transfer_to_operator` и открывает настроенную статью оператора.
2. Прощание вызывает `finish_dialog` и открывает настроенную статью завершения.
3. Обычный FAQ-вопрос получает ответ из RAG без вызова тулзы.
