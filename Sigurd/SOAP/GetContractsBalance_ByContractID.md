# GetContractsBalance_ByContractID

Баланс (задолженность/переплата) по лицевому счёту с разбивкой по поставщикам и группам услуг.

## HTTP-запрос

```
POST https://asuse-test.ie.corp/IVR.asmx
```

## Заголовки

| Заголовок | Значение |
|-----------|----------|
| `Content-Type` | `text/xml; charset=utf-8` |
| `SOAPAction` | `http://tempuri.org/GetContractsBalance_ByContractID` |

## Параметры метода

| Параметр | Тип | Обязательный | Описание |
|----------|-----|-------------|----------|
| `ContractID` | string (uuid) | да | Идентификатор ЛС (напр. `4a6722c6-9235-11e2-8708-0050569b0089`) |

## Пример запроса (SOAP 1.1)

```xml
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema">
  <soap:Body>
    <GetContractsBalance_ByContractID xmlns="http://tempuri.org/">
      <ContractID>4a6722c6-9235-11e2-8708-0050569b0089</ContractID>
    </GetContractsBalance_ByContractID>
  </soap:Body>
</soap:Envelope>
```

## Модель ответа

```
GetContractsBalance_ByContractIDResult {
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
<GetContractsBalance_ByContractIDResponse xmlns="http://tempuri.org/">
  <GetContractsBalance_ByContractIDResult>
    <ContractAddressAndBalanceByDicServiceGroupAndContragent>
      <ContractNumber>41893</ContractNumber>
      <Settlement>Братск, Энергетик</Settlement>
      <Address>Улица Приморская, дом 61, квартира 74</Address>
      <ContragentName>ООО "Иркутскэнергосбыт"</ContragentName>
      <DicServiceGroupName>По услуге Электроснабжения</DicServiceGroupName>
      <Balance>7.12</Balance>
    </ContractAddressAndBalanceByDicServiceGroupAndContragent>
    <ContractAddressAndBalanceByDicServiceGroupAndContragent>
      <ContractNumber>41893</ContractNumber>
      <Settlement>Братск, Энергетик</Settlement>
      <Address>Улица Приморская, дом 61, квартира 74</Address>
      <ContragentName>ООО "Байкальская энергетическая компания"</ContragentName>
      <DicServiceGroupName>По услуге Теплоснабжения</DicServiceGroupName>
      <Balance>3863.10</Balance>
    </ContractAddressAndBalanceByDicServiceGroupAndContragent>
    <ContractAddressAndBalanceByDicServiceGroupAndContragent>
      <ContractNumber>41893</ContractNumber>
      <Settlement>Братск, Энергетик</Settlement>
      <Address>Улица Приморская, дом 61, квартира 74</Address>
      <ContragentName>Муниципальное унитарное предприятие "Братский Водоканал" Муниципального Образования Города Братска</ContragentName>
      <DicServiceGroupName>По услуге Водоотведения</DicServiceGroupName>
      <Balance>-428.37</Balance>
    </ContractAddressAndBalanceByDicServiceGroupAndContragent>
  </GetContractsBalance_ByContractIDResult>
</GetContractsBalance_ByContractIDResponse>
```

## Пример curl

```bash
curl -X POST https://asuse-test.ie.corp/IVR.asmx \
  -H "Content-Type: text/xml; charset=utf-8" \
  -H "SOAPAction: http://tempuri.org/GetContractsBalance_ByContractID" \
  -d '<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema">
        <soap:Body>
          <GetContractsBalance_ByContractID xmlns="http://tempuri.org/">
            <ContractID>4a6722c6-9235-11e2-8708-0050569b0089</ContractID>
          </GetContractsBalance_ByContractID>
        </soap:Body>
      </soap:Envelope>'
```
