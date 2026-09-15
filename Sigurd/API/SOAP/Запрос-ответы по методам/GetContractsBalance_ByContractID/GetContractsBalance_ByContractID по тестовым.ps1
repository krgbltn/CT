cls
# Отключение проверки SSL-сертификата (если используется самоподписанный сертификат)
[System.Net.ServicePointManager]::ServerCertificateValidationCallback = {$true}

# URL SOAP-сервиса
$soapUrl = "https://asuse-test.ie.corp/IVR.asmx"

# Список ContractID
$contractIDs = @(
    "7dc89e76-92f1-11e2-8708-0050569b0089",
    "4a6722c6-9235-11e2-8708-0050569b0089",
    "cb19c04c-fda6-11e6-80ce-002481f90c3a",
    "9c11ee6a-a8ab-11e2-ab44-001f29ceb871",
    "f0e4aeb2-9318-11e2-8708-0050569b0089",
    "7d25e68d-a8d7-11e2-ab44-001f29ceb871"
)

# SOAP-конверт
$soapEnvelopeTemplate = @'
<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" 
               xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" 
               xmlns:xsd="http://www.w3.org/2001/XMLSchema">
    <soap:Body>
        <GetContractsBalance_ByContractID xmlns="http://tempuri.org/">
            <ContractID>{0}</ContractID>
        </GetContractsBalance_ByContractID>
    </soap:Body>
</soap:Envelope>
'@

# Заголовки для SOAP-запроса
$headers = @{
    "Content-Type" = "text/xml; charset=utf-8"
    "SOAPAction" = "http://tempuri.org/GetContractsBalance_ByContractID"
}

foreach ($contractID in $contractIDs) {
    try {
        # Формирование SOAP-запроса
        $soapRequest = $soapEnvelopeTemplate -f $contractID
        
        # Сохранение запроса в файл
        $requestFileName = "$contractID-Запрос из PS.xml"
        $soapRequest | Out-File -FilePath $requestFileName -Encoding UTF8
        Write-Host "Сохранен запрос: $requestFileName" -ForegroundColor Green
        
        # Выполнение SOAP-запроса
        Write-Host "Отправка запроса для ContractID: $contractID" -ForegroundColor Yellow
        
        $response = Invoke-WebRequest -Uri $soapUrl -Method Post -Body $soapRequest -Headers $headers -UseBasicParsing
        
        # Сохранение ответа в файл
        $responseFileName = "$contractID-Ответ из PS.xml"
        $response.Content | Out-File -FilePath $responseFileName -Encoding UTF8
        
        Write-Host "Сохранен ответ: $responseFileName" -ForegroundColor Green
        Write-Host "Статус код: $($response.StatusCode)" -ForegroundColor Cyan
        Write-Host "---" -ForegroundColor Gray
        
    } catch {
        Write-Host "Ошибка при обработке ContractID: $contractID" -ForegroundColor Red
        Write-Host "Сообщение об ошибке: $_" -ForegroundColor Red
        Write-Host "---" -ForegroundColor Gray
    }
}

Write-Host "Обработка завершена!" -ForegroundColor Green