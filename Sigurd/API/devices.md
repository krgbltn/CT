# devices

Информация о приборах учёта по лицевому счёту с последним показанием.

## HTTP-запрос

```
GET /api/service/sigurd/fl/{user_id}/devices
```

## Параметры пути

| Параметр | Тип | Описание |
|----------|-----|----------|
| `user_id` | string | Идентификатор пользователя (UserId) |

## Заголовки

| Заголовок | Значение |
|-----------|----------|
| `Accept` | `application/json` |
| `ES-Request-Source` | `Website` |
| `Authorization` | `Basic U2lndXJkOjR3KTojQDAycTtvaXVhcTA3MmhhOWczNQ==` |

## Модель ответа

```
Array[DeviceInfoWithReadings] {
  last_reading (TransferInfo, optional) — последние показания по ПУ:
    readings (Array[TransferInfoReading]) — показания
    reading_slot_wrapper (IReadingSlotWrapper) — слот для показаний
  id (string) — идентификатор ПУ
  number (string) — серийный номер ПУ
  type (string) — название типа ПУ
  scales (Array[MDScale]) — список шкал
  trans_factor (number) — коэффициент трансформации (для электросчётчиков)
  accuracy (string) — точность ПУ (процент погрешности)
  phases (integer) — количество фаз (для электросчётчиков)
  installed (string) — дата установки (для установленных), дата снятия (для снятых)
  installed_string (string) — дата установки/снятия (строка для отображения)
  checked (string) — дата последней поверки
  checked_string (string) — дата последней поверки (строка для отображения)
  next_check (string) — дата следующей поверки
  next_check_string (string) — дата следующей поверки (строка для отображения)
  service_code (integer) — код услуги
  service_name (string) — наименование услуги
  parent_name (string) — наименование родительской услуги
  service_alias_id (string) — идентификатор подключенной услуги (ContractAlias)
  service_active (boolean) — включена или отключена услуга
  installation_place (string) — место установки
  guid_position (string) — ИД позиции на энергоустановке
  owners (Array[Owner]) — лицо, ответственное за эксплуатацию
  is_smart (boolean) — интеллектуальный счётчик — да/нет
  status (string) — статус ПУ
  accepts_readings (boolean) — признак, что прибор может принимать показания
  is_interval (boolean) — признак, что прибор учёта является интервальным
  energy_kind (string) — тип энергии (для юрлиц)
  address (string) — «Объект учёта» — адрес
  is_complex (boolean) — является ли комплексным прибором учёта
  readings_accept_type (string) — принимает ли ПУ показания (расширенная версия)
  readings_accept_type_text (string) — объяснение, почему ПУ не принимает показания
  is_hot_water (boolean) — признак горячего водоснабжения
  is_installed (boolean) — признак, что прибор физически стоит на трубе
  is_permitted (boolean) — признак, что прибор допущен к эксплуатации (ЮЛ)
  admission_status (string) — статус допуска к эксплуатации (текстом)
  allow_vodomer (boolean) — разрешить распознавание показаний на стороне МП
  show_electric_info (boolean) — флаг для МП (фазность/коэф. трансформации)
  custom_name (string) — пользовательское наименование ПУ
  display_name (string) — отображаемое имя (по алгоритму)
  seal_number (string) — номер пломбы
  seal_location (string) — место установки пломбы
  seal_installed (boolean) — признак, что пломба установлена
}
```

## Пример curl

```bash
curl -X GET \
  --header 'Accept: application/json' \
  --header 'ES-Request-Source: Website' \
  --header 'Authorization: Basic U2lndXJkOjR3KTojQDAycTtvaXVhcTA3MmhhOWczNQ==' \
  'https://webapisbytfl.dev.enplus.digital/api/service/sigurd/fl/6907038b-9b49-11e4-a084-d8d385e6fca3/devices'
```
