# SOAP методы Sigurd (IVR.asmx)

SOAP-сервис: `https://asuse-test.ie.corp/IVR.asmx` (SOAP 1.1, `Content-Type: text/xml; charset=utf-8`, заголовок `SOAPAction: http://tempuri.org/<Метод>`).

| Метод | Параметры запроса | Назначение |
|-------|-------------------|------------|
| `FindAllByContractNumber` | `contractNumberDigits` | Поиск ЛС по цифровой части номера |
| `GetContractsInfo_By_Phone` | `PhoneNumber` | Поиск ЛС по номеру телефона |
| `GetContractsBalance_ByPhoneNumber` | `phoneNumber` | Баланс по ЛС абонента (телефон) с разбивкой по поставщикам и услугам |
| `GetContractsBalance_ByContractID` | `ContractID` | Баланс по ЛС (ID) с разбивкой по поставщикам и услугам |
| `GetMDInfo_By_ContractIDAndNomenclatureCode` | `ContractStrGUID`, `NomenclatureCode` | Информация о приборе учёта (серийный номер, шкалы, показания) |
| `GetMDsWarningInfo_ByTel` | `telephoneNumber` | Предупреждения по приборам учёта (телефон) |
| `GetMDsWarningInfo_ByContractID` | `contractID` | Предупреждения по приборам учёта (ЛС) |
| `InputOfReadingsWithDot` | `MDScale_ID`, `MDScale_NewReadings` | Передача показаний по шкале ПУ |

## Общие заголовки

| Заголовок | Значение |
|-----------|----------|
| `Content-Type` | `text/xml; charset=utf-8` |
| `SOAPAction` | `http://tempuri.org/<Метод>` |

## Базовая структура запроса (SOAP 1.1)

```xml
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:tem="http://tempuri.org/">
  <soapenv:Header/>
  <soapenv:Body>
    <tem:<Метод>>
      <tem:<Параметр1>значение</tem:<Параметр1>>
    </tem:<Метод>>
  </soapenv:Body>
</soapenv:Envelope>
```

## Общие модели

### ContractInfo

```
ContractInfo {
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
```

### ContractAddressAndBalanceByDicServiceGroupAndContragent

```
ContractAddressAndBalanceByDicServiceGroupAndContragent {
  ContractNumber (string) — номер ЛС
  Settlement (string) — населённый пункт
  Address (string) — адрес
  ContragentName (string) — наименование контрагента (поставщика)
  DicServiceGroupName (string) — группа услуг
  Balance (number) — баланс по услуге
}
```

### MDWarningInfo

```
MDWarningInfo {
  AddressOfMD (string) — адрес
  DicServiceGroupNumber (integer) — номер группы услуг
  LastReadings (number) — последние показания
  NextVerificationDeadline (string) — дата следующей поверки
  IsReadingsTooOld (boolean) — признак, что показания устарели
  VerificationStatus (string) — статус поверки (Verificated / Expired)
}
```
