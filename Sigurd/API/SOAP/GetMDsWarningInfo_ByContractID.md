# GetMDsWarningInfo_ByContractID

Предупреждения по приборам учёта для конкретного лицевого счёта: адрес, группа услуг, последние показания, дата поверки и её статус.

## HTTP-запрос

```
POST https://asuse-test.ie.corp/IVR.asmx
```

## Заголовки

| Заголовок | Значение |
|-----------|----------|
| `Content-Type` | `text/xml; charset=utf-8` |
| `SOAPAction` | `http://tempuri.org/GetMDsWarningInfo_ByContractID` |

## Параметры метода

| Параметр | Тип | Обязательный | Описание |
|----------|-----|-------------|----------|
| `contractID` | string (uuid) | да | Идентификатор ЛС (напр. `4a6722c6-9235-11e2-8708-0050569b0089`) |

## Пример запроса (SOAP 1.1)

```xml
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:tem="http://tempuri.org/">
  <soapenv:Header/>
  <soapenv:Body>
    <tem:GetMDsWarningInfo_ByContractID>
      <tem:contractID>4a6722c6-9235-11e2-8708-0050569b0089</tem:contractID>
    </tem:GetMDsWarningInfo_ByContractID>
  </soapenv:Body>
</soapenv:Envelope>
```

## Модель ответа

```
GetMDsWarningInfo_ByContractIDResult {
  MDWarningInfo[] {
    AddressOfMD (string) — адрес
    DicServiceGroupNumber (integer) — номер группы услуг
    LastReadings (number) — последние показания
    NextVerificationDeadline (string) — дата следующей поверки
    IsReadingsTooOld (boolean) — признак, что показания устарели
    VerificationStatus (string) — статус поверки (Verificated / Expired)
  }
}
```

## Пример ответа

```xml
<GetMDsWarningInfo_ByContractIDResponse xmlns="http://tempuri.org/">
  <GetMDsWarningInfo_ByContractIDResult>
    <MDWarningInfo>
      <AddressOfMD>Энергетик, Улица Приморская, дом 61, квартира 74</AddressOfMD>
      <DicServiceGroupNumber>1</DicServiceGroupNumber>
      <LastReadings>198</LastReadings>
      <NextVerificationDeadline>2034-01-01T00:00:00</NextVerificationDeadline>
      <IsReadingsTooOld>true</IsReadingsTooOld>
      <VerificationStatus>Verificated</VerificationStatus>
    </MDWarningInfo>
    <MDWarningInfo>
      <AddressOfMD>Энергетик, Улица Приморская, дом 61, квартира 74</AddressOfMD>
      <DicServiceGroupNumber>2</DicServiceGroupNumber>
      <LastReadings>1</LastReadings>
      <NextVerificationDeadline>2029-12-04T00:00:00</NextVerificationDeadline>
      <IsReadingsTooOld>true</IsReadingsTooOld>
      <VerificationStatus>Verificated</VerificationStatus>
    </MDWarningInfo>
  </GetMDsWarningInfo_ByContractIDResult>
</GetMDsWarningInfo_ByContractIDResponse>
```

## Пример curl

```bash
curl -X POST https://asuse-test.ie.corp/IVR.asmx \
  -H "Content-Type: text/xml; charset=utf-8" \
  -H "SOAPAction: http://tempuri.org/GetMDsWarningInfo_ByContractID" \
  -d '<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:tem="http://tempuri.org/">
        <soapenv:Header/>
        <soapenv:Body>
          <tem:GetMDsWarningInfo_ByContractID>
            <tem:contractID>4a6722c6-9235-11e2-8708-0050569b0089</tem:contractID>
          </tem:GetMDsWarningInfo_ByContractID>
        </soapenv:Body>
      </soapenv:Envelope>'
```
