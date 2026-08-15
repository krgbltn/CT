# GetMDInfo_By_ContractIDAndNomenclatureCode

Информация о приборе учёта (ПУ) по лицевому счёту и коду номенклатуры (услуги): серийный номер, место установки, дата поверки, шкалы и последние показания.

## HTTP-запрос

```
POST https://asuse-test.ie.corp/IVR.asmx
```

## Заголовки

| Заголовок | Значение |
|-----------|----------|
| `Content-Type` | `text/xml; charset=utf-8` |
| `SOAPAction` | `http://tempuri.org/GetMDInfo_By_ContractIDAndNomenclatureCode` |

## Параметры метода

| Параметр | Тип | Обязательный | Описание |
|----------|-----|-------------|----------|
| `ContractStrGUID` | string (uuid) | да | Идентификатор ЛС |
| `NomenclatureCode` | string | да | Код номенклатуры (услуги), напр. `2` (электроэнергия) |

## Пример запроса (SOAP 1.1)

```xml
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:tem="http://tempuri.org/">
  <soapenv:Header/>
  <soapenv:Body>
    <tem:GetMDInfo_By_ContractIDAndNomenclatureCode>
      <tem:ContractStrGUID>4a6722c6-9235-11e2-8708-0050569b0089</tem:ContractStrGUID>
      <tem:NomenclatureCode>2</tem:NomenclatureCode>
    </tem:GetMDInfo_By_ContractIDAndNomenclatureCode>
  </soapenv:Body>
</soapenv:Envelope>
```

## Модель ответа

```
GetMDInfo_By_ContractIDAndNomenclatureCodeResult {
  MDInfo {
    MDSerialNumber (string) — серийный номер прибора учёта
    MDInstallationLocation (string) — место установки ПУ
    MDNextVerificationDeadline (string) — дата следующей поверки
    MDScales {
      MDScaleInfo[] {
        MDScaleID (string) — идентификатор шкалы
        MDScaleName (string) — наименование шкалы (ед. изм.)
        MDSDigitsAfterDot (integer) — количество знаков после запятой
        LastReadings (number) — последние показания
        LastReadingsDate (string) — дата последних показаний
        ReadingsExist (boolean) — признак наличия показаний
        MaxAcceptableNewMDReadingValue (number) — максимально допустимое новое показание
      }
    }
  }
}
```

## Пример ответа

```xml
<GetMDInfo_By_ContractIDAndNomenclatureCodeResponse xmlns="http://tempuri.org/">
  <GetMDInfo_By_ContractIDAndNomenclatureCodeResult>
    <MDInfo>
      <MDSerialNumber>166</MDSerialNumber>
      <MDInstallationLocation>Санузел</MDInstallationLocation>
      <MDNextVerificationDeadline>2029-12-04T00:00:00</MDNextVerificationDeadline>
      <MDScales>
        <MDScaleInfo>
          <MDScaleID>B73879A3-B7F0-11E8-80BE-9457A553D5EB</MDScaleID>
          <MDScaleName>м3</MDScaleName>
          <MDSDigitsAfterDot>0</MDSDigitsAfterDot>
          <LastReadings>1</LastReadings>
          <LastReadingsDate>2025-09-24T08:35:40</LastReadingsDate>
          <ReadingsExist>true</ReadingsExist>
          <MaxAcceptableNewMDReadingValue>491</MaxAcceptableNewMDReadingValue>
        </MDScaleInfo>
      </MDScales>
    </MDInfo>
  </GetMDInfo_By_ContractIDAndNomenclatureCodeResult>
</GetMDInfo_By_ContractIDAndNomenclatureCodeResponse>
```

## Пример curl

```bash
curl -X POST https://asuse-test.ie.corp/IVR.asmx \
  -H "Content-Type: text/xml; charset=utf-8" \
  -H "SOAPAction: http://tempuri.org/GetMDInfo_By_ContractIDAndNomenclatureCode" \
  -d '<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:tem="http://tempuri.org/">
        <soapenv:Header/>
        <soapenv:Body>
          <tem:GetMDInfo_By_ContractIDAndNomenclatureCode>
            <tem:ContractStrGUID>4a6722c6-9235-11e2-8708-0050569b0089</tem:ContractStrGUID>
            <tem:NomenclatureCode>2</tem:NomenclatureCode>
          </tem:GetMDInfo_By_ContractIDAndNomenclatureCode>
        </soapenv:Body>
      </soapenv:Envelope>'
```
