# Анализ истории диалога

## 1. Описание

Этот модуль предназначен для разбора и визуализации истории диалога из CraftTalk. Он помогает автоматически сформировать представление о структуре диалога, элементах интерфейса и действиях пользователя.

Основные задачи:
- получить историю диалога по `DIALOG_ID`
- распарсить данные
- отрендерить сообщения, команды, условия, формы и другие элементы

## 2. Установка и подготовка

1. Убедитесь, что у вас установлен Python 3.8+ (скачать можно с [python.org](https://www.python.org/downloads/)).
2. Перейдите в папку проекта `Истории диалога`.
3. Установите зависимости:

```bash
python -m pip install -r requirements.txt
```

Для работы скриптов необходимо задать следующие параметры:

- `ACCESS_TOKEN` — ключ доступа к API CraftTalk.
  1. Откройте инструменты разработчика в браузере.
  2. В разделе `Сеть` найдите запросы к API CraftTalk.
  3. Перейдите в `Cookie`.
  4. Найдите ключ `CraftTalk.Auth`.
  5. Скопируйте значение ключа `CraftTalk.Auth` в `ACCESS_TOKEN`.

- `PROJECT_ID` — идентификатор проекта.
  1. В URL CraftTalk обычно есть шаблон вида `https://{домен}/app/project/<project_id>/...`.
  2. Например, для `https://cloud.craft-talk.com/app/project/docs/knowledge-base` проектом будет `docs`.
  3. Задайте переменную `PROJECT_ID` этим значением.

- `DOMAIN` — домен сервиса CraftTalk.
  1. Если URL `https://cloud.craft-talk.com/app/project/docs/knowledge-base`, то `DOMAIN = https://cloud.craft-talk.com`.
  2. Домен должен содержать протокол и не заканчиваться слешем.

- `IS_SSL` — флаг проверки SSL-сертификата.
  - `True` — использовать HTTPS и проверять сертификат сервера.
  - `False` — отключить проверку SSL (удобно для тестовых сред с самоподписанными сертификатами).

- `DIALOG_ID` — идентификатор диалога, который нужно анализировать.

## 3. Пример использования

Ссылка на видео: https://drive.google.com/file/d/1hYA-suIilrq2o8y2AZyVCZoxizkeoJMQ/view?usp=sharing

### Быстрый пример

```python
from src.HistoryMessagesRender import HistoryMessagesRender

ACCESS_TOKEN = "ваш_токен"
DOMAIN = "https://cloud.craft-talk.com"
PROJECT_ID = "docs"
IS_SSL = True
DIALOG_ID = "01234567-89ab-cdef-0123-456789abcdef"

renderer = HistoryMessagesRender(ACCESS_TOKEN, DOMAIN, PROJECT_ID, IS_SSL)
renderer.render_history_messages(DIALOG_ID)
```

## 4. Структура проекта

Корневая структура модуля:

- `src/` — основная логика
  - `HistoryMessagesRender.py` — здесь находится логика обработки истории диалога и её рендеринг
  - `API/CrafttalkAPI.py` — работа с API CraftTalk
  - `ElementRender/` — рендеры элементов сценария

- `test/` — тесты