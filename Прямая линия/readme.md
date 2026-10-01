# Direct Line REST

| Task | Entrypoint | Customer |
| --- | --- | --- |
| Прямая линия | `directline_rest.js` | Не указан |

Агент отправляет обращение в `POST /v1/appeals`.

Источники полей:

| Поле API | Источник |
| --- | --- |
| `dialog_id` | `message.dialog_id`; при отсутствии - `agentApi.getDialogId` по данным пользователя и проекта |
| `client_id` | `message.user.omni_user_id` |
| `date_question` | `message.timestamps.sent_from_channel`, преобразованное в UTC ISO 8601 |
| Остальные поля | Слоты, идентификаторы которых заданы в `slotIds` |

При включённом `debugMode` агент отправляет `debugRequestBody` вместо данных сообщения. Тело запроса и весь ответ API записываются в логи; Bearer-токен не логируется. При `503` агент выполняет повторы по настройкам `maxRetries` и `retryDelayMs`.

После успешной отправки агент переключает диалог на `aiAssistAgentId` и передаёт ему `articleId` как `intent_id`. При ошибке агент передаёт `errorArticleId`.
