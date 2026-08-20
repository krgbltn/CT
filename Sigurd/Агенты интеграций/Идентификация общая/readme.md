# Агент identification

Идентификация клиента по номеру телефона. Общий агент, используется во всех скриптах.

## Файлы

- `identification.js`
- `identification_settings.json`

## Метод API

REST GET /contracts/by_phone

## Входные данные

phone — номер телефона (из слота `phone`)

## Поля ответа

- UserId
- WebProperties.ContractNo
- WebProperties.Address
- WebProperties.GroupId
- WebProperties.IsRegistered

## JSONPath для slotsMapping

- user_id_tst = [0].UserId
- contract_no = [0].WebProperties.ContractNo
- address = [0].WebProperties.Address

## Заполняемые слоты

- user_id_tst — идентификатор лицевого счёта (UUID)
- contract_no — номер лицевого счёта
- address — полный адрес
- house_type — тип дома (OTHER/MKD/PRIVATE), из GET /disconnection_report_info
- id_step — внутренний слот машины состояний (confirm_single / ask_multiple)
- id_selected_index — индекс выбранного контракта
- id_contracts_data — сериализованный список контрактов

## Дополнительные запросы

GET /{user_id}/disconnection_report_info — для получения house_type (тип дома)

## Логика

### Первый вызов

1. Отправить GET /contracts_by_phone?phone={phone}
2. Если ответ пустой или не массив — вернуть final_answer='error', перевод на оператора
3. Если один лицевой счет:
   - Извлечь часть адреса начиная с улицы (extractStreetAddress)
   - Спросить: "Вы обращаетесь по адресу {streetPart}?"
   - Установить слоты: id_step=confirm_single, id_selected_index=0, id_contracts_data=JSON
4. Если несколько лицевых счетов:
   - Спросить: "Назовите адрес, по которому Вы обращаетесь."
   - Установить слоты: id_step=ask_multiple, id_contracts_data=JSON

### Последующие вызовы (машина состояний)

#### confirm_single (один ЛС, ожидаем подтверждение)

- Положительный ответ (да/ага/верно и т.д.) → заполнить слоты из контракта, получить house_type, перейти на nextArticle
- Отрицательный ответ (нет/не/другой и т.д.) → перевод на оператора
- Непонятный ответ → повторить вопрос

#### ask_multiple (несколько ЛС, ожидаем адрес)

- fuzzy-сопоставление текста пользователя с адресами контрактов (findContractByText)
  - Разбить текст на слова, исключить стоп-слова и слова короче 3 символов
  - Проверить, что все слова найдены в адресе контракта
- Если совпадение найдено → заполнить слоты, получить house_type, перейти на nextArticle
- Если совпадения нет → перевод на оператора

## Настройки (agentSettings)

- url — URL запроса с шаблоном {{slots.phone}}
- method — GET
- nextArticle — статья для продолжения сценария
- operatorArticle — статья для перевода на оператора
- slotsMapping — маппинг полей ответа на слоты
- disconnectionReportUrl — URL для получения house_type
- authorizationToken — Basic auth токен
- headers — HTTP заголовки
- stub / stubResponse — заглушка для тестирования

## Перевод на оператора

/switchredirect aiassist2 intent_id="article-d6585ce7-c4e9-4e42-97d2-bc4142e8ae1d"

Срабатывает при:
- Ошибка запроса к API
- Нет контрактов в ответе
- Пользователь отказался от предложенного адреса
- Не удалось сопоставить адрес при нескольких ЛС
- Нет данных контрактов в слотах при последующем вызове

## Заглушка (stub)

В development-режиме агент может использовать stubResponse — массив из 6 тестовых контрактов. Включается параметром stub: true в настройках.
