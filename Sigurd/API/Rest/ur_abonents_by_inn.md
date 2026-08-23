# abonents_by_inn (ЮЛ)

Получение идентификационных данных юрлица и его лицевых счетов по ИНН.

## HTTP-запрос

```
GET /api/service/sigurd/ur/abonents_by_inn?inn={inn}
```

## Параметры запроса

| Параметр | Тип | Описание |
|----------|-----|----------|
| `inn` | string | ИНН организации |

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
  'https://webapisbytul.dev.enplus.digital/api/service/sigurd/ur/abonents_by_inn?inn=3801111111'
```
