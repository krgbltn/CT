# Отключение проверки сертификата (если требуется)
[System.Net.ServicePointManager]::ServerCertificateValidationCallback = { $true }

# URL веб-сервиса и пространство имён
$uri = "https://asuse-test.ie.corp/IVR.asmx"
$namespace = "http://tempuri.org/"

# Номера телефонов для обработки
$phoneNumbers = @("89027653860", "89645460801", "89501074005", "89148747257")

# Для каждого номера телефона
foreach ($phone in $phoneNumbers) {
    # Формирование SOAP-запроса
    $soapRequest = @"
<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema">
    <soap:Body>
        <GetContractsBalance_ByPhoneNumber xmlns="$namespace">
            <phoneNumber>$phone</phoneNumber>
        </GetContractsBalance_ByPhoneNumber>
    </soap:Body>
</soap:Envelope>
"@

    # Сохранение запроса в файл
    $requestFileName = "$phone-Запрос из PS.XML"
    $soapRequest | Out-File -FilePath $requestFileName -Encoding UTF8
    Write-Host "Создан файл запроса: $requestFileName"

    try {
        # Отправка SOAP-запроса
        $headers = @{
            "Content-Type" = "text/xml; charset=utf-8"
            "SOAPAction" = $namespace + "GetContractsBalance_ByPhoneNumber"
        }

        $response = Invoke-WebRequest -Uri $uri -Method Post -Body $soapRequest -Headers $headers -UseBasicParsing

        # Сохранение ответа в файл
        $responseFileName = "$phone-Ответ из PS.XML"
        $response.Content | Out-File -FilePath $responseFileName -Encoding UTF8
        Write-Host "Создан файл ответа: $responseFileName"
        
        # Вывод результата для информации
        Write-Host "Обработан номер: $phone (статус: $($response.StatusCode))" -ForegroundColor Green
    }
    catch {
        Write-Host "Ошибка при обработке номера $phone : $($_.Exception.Message)" -ForegroundColor Red
    }
    
    Write-Host "`n"  # Пустая строка для разделения
}

Write-Host "Обработка завершена!" -ForegroundColor Cyan