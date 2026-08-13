# InputOfReadingsWithDot

Передача показаний по шкале прибора учёта (значение с точкой).

## HTTP-запрос

```
POST https://asuse-test.ie.corp/IVR.asmx
```

## Заголовки

| Заголовок | Значение |
|-----------|----------|
| `Content-Type` | `text/xml; charset=utf-8` |
| `SOAPAction` | `http://tempuri.org/InputOfReadingsWithDot` |

## Параметры метода

| Параметр | Тип | Обязательный | Описание |
|----------|-----|-------------|----------|
| `MDScale_ID` | string (uuid) | да | Идентификатор шкалы прибора учёта |
| `MDScale_NewReadings` | number | да | Новое показание |

## Пример запроса (SOAP 1.1)

```xml
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:tem="http://tempuri.org/">
  <soapenv:Header/>
  <soapenv:Body>
    <tem:InputOfReadingsWithDot>
      <tem:MDScale_ID>FF6EFA85-D8F7-11E8-80C0-9457A553D5EB</tem:MDScale_ID>
      <tem:MDScale_NewReadings>205</tem:MDScale_NewReadings>
    </tem:InputOfReadingsWithDot>
  </soapenv:Body>
</soapenv:Envelope>
```

## Модель ответа

```
InputOfReadingsWithDotResult {
  (integer) — результат передачи показаний (1 — успешно)
}
```

## Пример ответа

```xml
<InputOfReadingsWithDotResponse xmlns="http://tempuri.org/">
  <InputOfReadingsWithDotResult>1</InputOfReadingsWithDotResult>
</InputOfReadingsWithDotResponse>
```

## Пример curl

```bash
curl -X POST https://asuse-test.ie.corp/IVR.asmx \
  -H "Content-Type: text/xml; charset=utf-8" \
  -H "SOAPAction: http://tempuri.org/InputOfReadingsWithDot" \
  -d '<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:tem="http://tempuri.org/">
        <soapenv:Header/>
        <soapenv:Body>
          <tem:InputOfReadingsWithDot>
            <tem:MDScale_ID>FF6EFA85-D8F7-11E8-80C0-9457A553D5EB</tem:MDScale_ID>
            <tem:MDScale_NewReadings>205</tem:MDScale_NewReadings>
          </tem:InputOfReadingsWithDot>
        </soapenv:Body>
      </soapenv:Envelope>'
```
