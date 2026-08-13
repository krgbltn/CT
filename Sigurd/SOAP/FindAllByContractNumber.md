# FindAllByContractNumber

Поиск лицевых счетов (договоров) по номеру ЛС (цифровой части).

## HTTP-запрос

```
POST https://asuse-test.ie.corp/IVR.asmx
```

## Заголовки

| Заголовок | Значение |
|-----------|----------|
| `Content-Type` | `text/xml; charset=utf-8` |
| `SOAPAction` | `http://tempuri.org/FindAllByContractNumber` |

## Параметры метода

| Параметр | Тип | Обязательный | Описание |
|----------|-----|-------------|----------|
| `contractNumber` | string | нет | Номер ЛС (вместе с префиксом, напр. `КСОО00041893`) |
| `contractNumberDigits` | string | да* | Цифровая часть номера ЛС (напр. `41893`) |

> **Примечание.** В итоге используется параметр `contractNumberDigits` — поиск по цифровой части номера. Параметр `contractNumber` (полный номер) не заполняется.

## Пример запроса (SOAP 1.1)

```xml
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:tem="http://tempuri.org/">
  <soapenv:Header/>
  <soapenv:Body>
    <tem:FindAllByContractNumber>
      <tem:contractNumberDigits>41893</tem:contractNumberDigits>
    </tem:FindAllByContractNumber>
  </soapenv:Body>
</soapenv:Envelope>
```

## Модель ответа

```
FindAllByContractNumberResult {
  ContractInfo[] {
    ID (string) — идентификатор ЛС
    No (string) — номер ЛС
    Adress (string) — адрес
    City (string) — населённый пункт
    Residents (integer) — количество проживающих
    FullArea (number) — общая площадь
    DateUpdate (string) — дата обновления
    Stove (string) — тип плиты
    Status (string) — статус ЛС
    AbonentName (string) — фамилия абонента
    FirstName (string) — имя
    Patronimic (string) — отчество
    DivisionID (string) — идентификатор отделения
  }
}
```

## Пример ответа

```xml
<FindAllByContractNumberResponse xmlns="http://tempuri.org/">
  <FindAllByContractNumberResult>
    <ContractInfo>
      <ID>4a6722c6-9235-11e2-8708-0050569b0089</ID>
      <No>41893</No>
      <Adress>Улица Приморская, дом 61, квартира 74</Adress>
      <City>Энергетик</City>
      <Residents>4</Residents>
      <FullArea>65.10</FullArea>
      <DateUpdate>2026-03-13T09:30:03.72</DateUpdate>
      <Stove>Электрическая</Stove>
      <Status>Действует</Status>
      <AbonentName>Евгений</AbonentName>
      <FirstName>Соколов</FirstName>
      <Patronimic>Васильевич</Patronimic>
      <DivisionID>d343ff05-91ee-11e2-8708-0050569b0089</DivisionID>
    </ContractInfo>
  </FindAllByContractNumberResult>
</FindAllByContractNumberResponse>
```

## Пример curl

```bash
curl -X POST https://asuse-test.ie.corp/IVR.asmx \
  -H "Content-Type: text/xml; charset=utf-8" \
  -H "SOAPAction: http://tempuri.org/FindAllByContractNumber" \
  -d '<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:tem="http://tempuri.org/">
        <soapenv:Header/>
        <soapenv:Body>
          <tem:FindAllByContractNumber>
            <tem:contractNumberDigits>41893</tem:contractNumberDigits>
          </tem:FindAllByContractNumber>
        </soapenv:Body>
      </soapenv:Envelope>'
```
