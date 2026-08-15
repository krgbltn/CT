# GetMDsWarningInfo_ByTel

Предупреждения по приборам учёта для всех лицевых счетов, привязанных к номеру телефона: адрес, группа услуг, последние показания, дата поверки и её статус.

## HTTP-запрос

```
POST https://asuse-test.ie.corp/IVR.asmx
```

## Заголовки

| Заголовок | Значение |
|-----------|----------|
| `Content-Type` | `text/xml; charset=utf-8` |
| `SOAPAction` | `http://tempuri.org/GetMDsWarningInfo_ByTel` |

## Параметры метода

| Параметр | Тип | Обязательный | Описание |
|----------|-----|-------------|----------|
| `telephoneNumber` | string | да | Номер телефона (напр. `89501074005`) |

## Пример запроса (SOAP 1.1)

```xml
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:tem="http://tempuri.org/">
  <soapenv:Header/>
  <soapenv:Body>
    <tem:GetMDsWarningInfo_ByTel>
      <tem:telephoneNumber>89501074005</tem:telephoneNumber>
    </tem:GetMDsWarningInfo_ByTel>
  </soapenv:Body>
</soapenv:Envelope>
```

## Модель ответа

```
GetMDsWarningInfo_ByTelResult {
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
<GetMDsWarningInfo_ByTelResponse xmlns="http://tempuri.org/">
  <GetMDsWarningInfo_ByTelResult>
    <MDWarningInfo>
      <AddressOfMD>Братск, Улица Лозовая, дом 3</AddressOfMD>
      <DicServiceGroupNumber>1</DicServiceGroupNumber>
      <LastReadings>122304</LastReadings>
      <NextVerificationDeadline>2023-07-01T00:00:00</NextVerificationDeadline>
      <IsReadingsTooOld>true</IsReadingsTooOld>
      <VerificationStatus>Expired</VerificationStatus>
    </MDWarningInfo>
    <MDWarningInfo>
      <AddressOfMD>Братск, Улица Лозовая, дом 3</AddressOfMD>
      <DicServiceGroupNumber>4</DicServiceGroupNumber>
      <LastReadings>406</LastReadings>
      <NextVerificationDeadline>2027-04-16T00:00:00</NextVerificationDeadline>
      <IsReadingsTooOld>true</IsReadingsTooOld>
      <VerificationStatus>Verificated</VerificationStatus>
    </MDWarningInfo>
  </GetMDsWarningInfo_ByTelResult>
</GetMDsWarningInfo_ByTelResponse>
```

## Пример curl

```bash
curl -X POST https://asuse-test.ie.corp/IVR.asmx \
  -H "Content-Type: text/xml; charset=utf-8" \
  -H "SOAPAction: http://tempuri.org/GetMDsWarningInfo_ByTel" \
  -d '<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:tem="http://tempuri.org/">
        <soapenv:Header/>
        <soapenv:Body>
          <tem:GetMDsWarningInfo_ByTel>
            <tem:telephoneNumber>89501074005</tem:telephoneNumber>
          </tem:GetMDsWarningInfo_ByTel>
        </soapenv:Body>
      </soapenv:Envelope>'
```
