# Блок-схема приема показаний

| Task | Entrypoint | Customer |
|---|---|---|
| Блок-схема общего приема и исправления | Идентификация ЛС; статьи `input`, `correction`, `error`, `finish` | СИГУРД |

Редактируемая версия: [scenario-flowchart.drawio](scenario-flowchart.drawio), два листа. Реплики и настройка платформы: [scenario-plan.md](scenario-plan.md). Синие блоки - сценарий, зеленые - JS-контроллер, красные - техническая ошибка или помощь.

## 1. Основной цикл

Схема начинается после успешной идентификации и предусмотренного подтверждения адреса. Неуспешная идентификация остается в существующей цепочке.

```mermaid
flowchart TD
    A(["Выбран ЛС: account_id, номер, адрес"]) --> B["Вводная реплика один раз на ЛС"]
    B --> C{"Начнем прием?"}
    C -- Да --> INIT["Контроллер: action = init"]
    C -- Нет --> OTHER{"Другой лицевой счет?"}
    INIT --> RESULT{"Результат контроллера"}

    RESULT -- ready --> METER["Новая шкала: начать цикл попыток сценария.<br/>Назвать услугу, последние 3 цифры, шкалу, прошлое показание"]
    METER --> READY{"Готовы назвать показание?"}
    READY -- Нет --> SKIP["Контроллер: skip_service = true,<br/>action = process.<br/>Пропустить оставшиеся шкалы этого прибора"]
    SKIP --> RESULT
    READY -- Да --> TYPE{"scale_type?"}
    TYPE -- true --> WHOLE["Запросить целую часть до запятой"]
    TYPE -- false --> DECIMAL["Запросить показание с поддержкой дроби"]
    WHOLE --> CONFIRM{"Повторить current_new_reading.<br/>Клиент подтвердил?"}
    DECIMAL --> CONFIRM
    CONFIRM -- Нет --> CLEAR["Очистить введенное значение"]
    CLEAR --> TYPE
    CONFIRM -- Да --> PROCESS["Контроллер: action = process.<br/>Проверить значение; если корректно - отправить шкалу"]
    PROCESS --> RESULT

    RESULT -- accepted --> ACCEPT["Сценарий: показание этой шкалы принято"]
    ACCEPT --> NEXT["Контроллер: action = next"]
    NEXT --> RESULT

    RESULT -- invalid --> FIX["Статья исправления - лист 2"]
    FIX -- "Первая ошибка; клиент согласен исправить" --> TYPE
    FIX -- "Отказ или повторная ошибка" --> HELP["Существующий маршрут помощи / оператора"]

    RESULT -- "Очередь закончилась" --> FINISH["Итог по счетчикам шкал.<br/>Не объявлять успех, если передач не было"]
    FINISH --> OTHER
    RESULT -- "Техническая ошибка / неизвестный результат" --> ERROR["Статья технической ошибки.<br/>Без автоматического повтора отправки"]
    ERROR --> HELP
    OTHER -- Да --> ACCOUNT["Запросить номер ЛС и выполнить идентификацию"]
    ACCOUNT --> A
    OTHER -- Нет --> END(["Завершение диалога"])

    classDef scenario fill:#e8f0ff,stroke:#456da8,color:#172b4d;
    classDef controller fill:#e4f4e8,stroke:#44885b,color:#173c25;
    classDef problem fill:#fce5e5,stroke:#b65a5a,color:#6b2222;
    class A,B,C,OTHER,METER,READY,TYPE,WHOLE,DECIMAL,CONFIRM,CLEAR,ACCEPT,FIX,FINISH,ACCOUNT,END scenario;
    class INIT,RESULT,SKIP,PROCESS,NEXT controller;
    class HELP,ERROR problem;
```

Все вызовы `process` и `next` передают `account_id` и текущий `readings_step_id`. После ответа контроллера используется полученный ID. На следующую шкалу слоты переключаются только при `next`, после реплики об успехе. Пропуск касается прибора, успешная передача - одной шкалы.

## 2. Исправление значения

```mermaid
flowchart TD
    INVALID(["reading_status = invalid.<br/>Те же прибор и шкала; обновленный ID шага"]) --> CODE{"reading_error?"}
    CODE -- 1 --> LOW["Меньше предыдущего показания"]
    CODE -- 2 --> HIGH["Превышен расход или максимум API"]
    CODE -- 3 --> FORMAT["Некорректный формат числа"]
    CODE -- 4 --> PRECISION["Слишком много дробных знаков"]
    LOW --> SAY["Озвучить причину ошибки"]
    HIGH --> SAY
    FORMAT --> SAY
    PRECISION --> SAY
    SAY --> USED{"Повторная попытка уже использована?<br/>Проверяется внутри сценария"}
    USED -- Да --> HELP["Существующий маршрут помощи / оператора"]
    USED -- Нет --> ASK{"Хотите изменить показание?"}
    ASK -- Нет --> HELP
    ASK -- Да --> RETRY["Внутри сценария отметить использование повтора.<br/>Очистить current_new_reading"]
    RETRY --> INPUT["Вернуться к вводу по scale_type на листе 1.<br/>Получить значение и подтверждение,<br/>вызвать process с обновленным ID шага"]

    classDef scenario fill:#e8f0ff,stroke:#456da8,color:#172b4d;
    classDef problem fill:#fce5e5,stroke:#b65a5a,color:#6b2222;
    class INVALID,CODE,LOW,HIGH,FORMAT,PRECISION,SAY,USED,ASK,RETRY,INPUT scenario;
    class HELP problem;
```

Счетчик попыток существует только в сценарии и должен сохраняться через переходы между агентами. Контроллер его не получает. Исправление возвращает к вводу той же шкалы, без повторного входа в блок новой шкалы и без сброса попыток. Ответ «нет» при подтверждении числа также возвращает к вводу; он не является пропуском или проверенной агентом ошибкой.
