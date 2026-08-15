# GetContractsInfo_By_Phone

Поиск лицевых счетов (договоров) по номеру телефона.

## HTTP-запрос

```
POST https://asuse-test.ie.corp/IVR.asmx
```

## Заголовки

| Заголовок | Значение |
|-----------|----------|
| `Content-Type` | `text/xml; charset=utf-8` |
| `SOAPAction` | `http://tempuri.org/GetContractsInfo_By_Phone` |

## Параметры метода

| Параметр | Тип | Обязательный | Описание |
|----------|-----|-------------|----------|
| `PhoneNumber` | string | да | Номер телефона (напр. `89501074005`) |

## Пример запроса (SOAP 1.1)

```xml
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:tem="http://tempuri.org/">
  <soapenv:Header/>
  <soapenv:Body>
    <tem:GetContractsInfo_By_Phone>
      <tem:PhoneNumber>89501074005</tem:PhoneNumber>
    </tem:GetContractsInfo_By_Phone>
  </soapenv:Body>
</soapenv:Envelope>
```

## Модель ответа

```
GetContractsInfo_By_PhoneResult {
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
<GetContractsInfo_By_PhoneResponse xmlns="http://tempuri.org/">
  <GetContractsInfo_By_PhoneResult>
    <ContractInfo>
      <ID>f0e4aeb2-9318-11e2-8708-0050569b0089</ID>
      <No>ХХ06Т0002706</No>
      <Adress>Улица Лозовая, дом 3</Adress>
      <City>Братск</City>
      <Residents>2</Residents>
      <FullArea>205.60</FullArea>
      <DateUpdate>2026-03-13T10:00:50.623</DateUpdate>
      <Stove>Электрическая</Stove>
      <Status>Действует</Status>
      <AbonentName>Елена</AbonentName>
      <FirstName>Молчанова</FirstName>
      <Patronimic>Николаевна</Patronimic>
      <DivisionID>81632451-16f5-11e4-90a7-d8d385e60d7d</DivisionID>
    </ContractInfo>
  </GetContractsInfo_By_PhoneResult>
</GetContractsInfo_By_PhoneResponse>
```

## Пример curl

```bash
curl -X POST https://asuse-test.ie.corp/IVR.asmx \
  -H "Content-Type: text/xml; charset=utf-8" \
  -H "SOAPAction: http://tempuri.org/GetContractsInfo_By_Phone" \
  -d '<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:tem="http://tempuri.org/">
        <soapenv:Header/>
        <soapenv:Body>
          <tem:GetContractsInfo_By_Phone>
            <tem:PhoneNumber>89501074005</tem:PhoneNumber>
          </tem:GetContractsInfo_By_Phone>
        </soapenv:Body>
      </soapenv:Envelope>'
```
