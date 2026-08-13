# transactions

Взаиморасчёты по лицевому счёту с ID `{user_id}`: расшифровка сальдо и квитанции.

## HTTP-запрос

```
GET /api/service/sigurd/fl/{user_id}/transactions
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
UserTransactionsResponse {
  transactions (Array[TransactionInfoPL]) — взаиморасчёты:
    transactions (Array[TransactionsFL]) — взаиморасчёты по месяцам:
      date (string) — дата начала месяца
      payment (number) — оплачено
      accrual (number) — начислено
    accountid (string) — идентификатор ЛС (GDS.ContractId)
    account (string) — «Договор» (GDS.No)
    subcontractor (string) — короткое наименование контрагента
    debt (number) — задолженность (+ =&gt; долг, - =&gt; переплата)
    signature (string) — текст строчки
    signature_mobile (string) — текст строки для МП
    signature_debt (string) — текст строки «Задолженность», «Задолженность, в т.ч. пени», «Переплата»
    service_name (string) — наименование услуги
  bills (Array[BillInfo]) — квитанции
}
```

## Пример curl

```bash
curl -X GET \
  --header 'Accept: application/json' \
  --header 'ES-Request-Source: Website' \
  --header 'Authorization: Basic U2lndXJkOjR3KTojQDAycTtvaXVhcTA3MmhhOWczNQ==' \
  'https://webapisbytfl.dev.enplus.digital/api/service/sigurd/fl/6907038b-9b49-11e4-a084-d8d385e6fca3/transactions'
```
