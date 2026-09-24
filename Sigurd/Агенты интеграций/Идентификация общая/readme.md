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

- uid = [0].UserId
- contract_no = [0].WebProperties.ContractNo
- address = [0].WebProperties.Address

## Заполняемые слоты

- uid — идентификатор лицевого счёта (UUID)
- contract_no — номер лицевого счёта
- address — полный адрес
- status_ls — статус ЛС из `GET /info.status`
- city — город из `GET /info.account.house.address_object.city`
- house_type — тип дома (OTHER/MKD/PRIVATE), из GET /disconnection_report_info
- city_1 — населённый пункт из `city1Values`, найденный в полном адресе выбранного ЛС
- id_step — внутренний слот машины состояний (confirm_single / ask_multiple)
- id_selected_index — индекс выбранного контракта
- id_contracts_data — сериализованный список контрактов

## Дополнительные запросы

GET /{user_id}/disconnection_report_info — для получения house_type (тип дома)
GET /{user_id}/info — для получения city (город из account.house.address_object.city)

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

- Положительный ответ (да/ага/верно и т.д.) → заполнить слоты из контракта, определить city_1 по адресу, получить status_ls и house_type, перейти на nextArticle
- Отрицательный ответ (нет/не/другой и т.д.) → перевод на оператора
- Непонятный ответ → повторить вопрос

#### ask_multiple (несколько ЛС, ожидаем адрес)

- fuzzy-сопоставление текста пользователя с адресами контрактов (findContractByText)
  - Разбить текст на слова, исключить стоп-слова и слова короче 3 символов
  - Проверить, что все слова найдены в адресе контракта
- Если совпадение найдено → заполнить слоты, определить city_1 по адресу, получить status_ls и house_type, перейти на nextArticle
- Если совпадения нет → перевод на оператора

## Настройки (agentSettings)

- url — URL запроса с шаблоном {{slots.phone}}
- method — GET
- nextArticle — статья для продолжения сценария
- operatorArticle — статья для перевода на оператора
- city1Values — алфавитный список населённых пунктов для заполнения слота city_1; при совпадениях приоритетно самое длинное значение
- slotsMapping — маппинг полей ответа на слоты
- disconnectionReportUrl — URL для получения house_type
- authorizationToken — Basic auth токен
- headers — HTTP заголовки
- stub / stubResponse — заглушка для тестирования

## Перевод на оператора

Диалог направляется через `classifier` в статью `operatorArticle`.

Срабатывает при:
- Ошибка запроса к API
- Нет контрактов в ответе
- Пользователь отказался от предложенного адреса
- Не удалось сопоставить адрес при нескольких ЛС
- Нет данных контрактов в слотах при последующем вызове

## Заглушка (stub)

В development-режиме агент может использовать stubResponse — массив из 6 тестовых контрактов. Включается параметром stub: true в настройках.
