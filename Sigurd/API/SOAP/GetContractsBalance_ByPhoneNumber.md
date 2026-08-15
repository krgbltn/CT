# GetContractsBalance_ByPhoneNumber

Баланс (задолженность/переплата) по всем лицевым счетам абонента, привязанным к номеру телефона, с разбивкой по поставщикам и группам услуг.

## HTTP-запрос

```
POST https://asuse-test.ie.corp/IVR.asmx
```

## Заголовки

| Заголовок | Значение |
|-----------|----------|
| `Content-Type` | `text/xml; charset=utf-8` |
| `SOAPAction` | `http://tempuri.org/GetContractsBalance_ByPhoneNumber` |

## Параметры метода

| Параметр | Тип | Обязательный | Описание |
|----------|-----|-------------|----------|
| `phoneNumber` | string | да | Номер телефона (напр. `89025165900`) |

## Пример запроса (SOAP 1.1)

```xml
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema">
  <soap:Body>
    <GetContractsBalance_ByPhoneNumber xmlns="http://tempuri.org/">
      <phoneNumber>89025165900</phoneNumber>
    </GetContractsBalance_ByPhoneNumber>
  </soap:Body>
</soap:Envelope>
```

## Модель ответа

```
GetContractsBalance_ByPhoneNumberResult {
  ContractAddressAndBalanceByDicServiceGroupAndContragent[] {
    ContractNumber (string) — номер ЛС
    Settlement (string) — населённый пункт
    Address (string) — адрес
    ContragentName (string) — наименование контрагента (поставщика)
    DicServiceGroupName (string) — группа услуг (электро/тепло/водоотведение и т.д.)
    Balance (number) — баланс по данной услуге
  }
}
```

## Пример ответа

```xml
<GetContractsBalance_ByPhoneNumberResponse xmlns="http://tempuri.org/">
  <GetContractsBalance_ByPhoneNumberResult>
    <ContractAddressAndBalanceByDicServiceGroupAndContragent>
      <ContractNumber>147727</ContractNumber>
      <Settlement>Иркутск</Settlement>
      <Address>Иркутск, Улица Лермонтова, дом 81, 21, квартира 83</Address>
      <ContragentName>ООО "Иркутскэнергосбыт"</ContragentName>
      <DicServiceGroupName>По услуге электроснабжения</DicServiceGroupName>
      <Balance>0.00</Balance>
    </ContractAddressAndBalanceByDicServiceGroupAndContragent>
    <ContractAddressAndBalanceByDicServiceGroupAndContragent>
      <ContractNumber>147727</ContractNumber>
      <Settlement>Иркутск</Settlement>
      <Address>Иркутск, Улица Лермонтова, дом 81, 21, квартира 83</Address>
      <ContragentName>другими поставщиками услуг</ContragentName>
      <DicServiceGroupName>По услуге теплоснабжения</DicServiceGroupName>
      <Balance>0.00</Balance>
    </ContractAddressAndBalanceByDicServiceGroupAndContragent>
  </GetContractsBalance_ByPhoneNumberResult>
</GetContractsBalance_ByPhoneNumberResponse>
```

## Пример curl

```bash
curl -X POST https://asuse-test.ie.corp/IVR.asmx \
  -H "Content-Type: text/xml; charset=utf-8" \
  -H "SOAPAction: http://tempuri.org/GetContractsBalance_ByPhoneNumber" \
  -d '<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema">
        <soap:Body>
          <GetContractsBalance_ByPhoneNumber xmlns="http://tempuri.org/">
            <phoneNumber>89025165900</phoneNumber>
          </GetContractsBalance_ByPhoneNumber>
        </soap:Body>
      </soap:Envelope>'
```
