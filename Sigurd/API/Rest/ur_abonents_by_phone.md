# abonents_by_phone (ЮЛ)

Получение идентификационных данных юрлица и его лицевых счетов по номеру телефона.

## HTTP-запрос

```
GET /api/service/sigurd/ur/abonents_by_phone?phone={phone}
```

## Параметры запроса

| Параметр | Тип | Описание |
|----------|-----|----------|
| `phone` | string | Номер телефона абонента |

## Заголовки

| Заголовок | Значение |
|-----------|----------|
| `Accept` | `application/json` |
| `ES-Request-Source` | `Website` |
| `Authorization` | `Basic <токен>` — значение уточнить у бэкенда ЮЛ |

## Модель ответа

Массив `CompanyObjectAuthData`:

```
CompanyObjectAuthData {
  UserId (string) — идентификатор пользователя
  IsRegistered (boolean) — флаг, что пользователь зарегистрирован
  WebProperties (Array[CompanyContractObjectAuthData]) — список ЛС юрлица для авторизации:
    ContractId (string) — идентификатор договора (ЛС)
    ContractNo (string) — номер договора (ЛС)
}
```

## Пример curl

```bash
curl -X GET \
  --header 'Accept: application/json' \
  --header 'ES-Request-Source: Website' \
  --header 'Authorization: Basic <токен>' \
  'https://webapisbytul.dev.enplus.digital/api/service/sigurd/ur/abonents_by_phone?phone=79025151311'
```
