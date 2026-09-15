cls
# URL веб-сервиса и пространство имён
$serviceUrl = "https://asuse-test.ie.corp/IVR.asmx"
$namespace = "http://tempuri.org/"

# Массив номеров телефонов
$phoneNumbers = @("89027653860", "89645460801", "89501074005", "89148747257")

# Функция для вызова SOAP веб-сервиса
function Invoke-SoapRequest {
    param(
        [string]$phoneNumber
    )
    
    # Формируем SOAP-запрос
    $soapRequest = @"
<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema">
  <soap:Body>
    <GetMDsWarningInfo_ByTel xmlns="$namespace">
      <telephoneNumber>$phoneNumber</telephoneNumber>
    </GetMDsWarningInfo_ByTel>
  </soap:Body>
</soap:Envelope>
"@
    
    # Сохраняем запрос в файл
    $requestFileName = "$phoneNumber-Запрос из PS.xml"
    $soapRequest | Out-File -FilePath $requestFileName -Encoding UTF8
    Write-Host "Сохранен запрос: $requestFileName" -ForegroundColor Yellow
    
    # Заголовки для SOAP-запроса
    $headers = @{
        "Content-Type" = "text/xml; charset=utf-8"
        "SOAPAction" = "$namespace" + "GetMDsWarningInfo_ByTel"
    }
    
    try {
        # Отправляем SOAP-запрос
        $response = Invoke-WebRequest -Uri $serviceUrl -Method Post -Body $soapRequest -Headers $headers -ContentType "text/xml; charset=utf-8"
        
        # Сохраняем ответ в файл
        $responseFileName = "$phoneNumber-Ответ из PS.xml"
        $response.Content | Out-File -FilePath $responseFileName -Encoding UTF8
        Write-Host "Сохранен ответ: $responseFileName" -ForegroundColor Yellow
        
        # Парсим ответ
        $xmlResponse = [xml]$response.Content
        $result = $xmlResponse.Envelope.Body.GetMDsWarningInfo_ByTel.GetMDWarningInfo_ByTelResult
        
        Write-Host "Результат для $phoneNumber : $result" -ForegroundColor Green
        return $result
    }
    catch {
        Write-Host "Ошибка при вызове веб-сервиса для $phoneNumber : $_" -ForegroundColor Red
        
        # Сохраняем ошибку в файл
        $responseFileName = "$phoneNumber-Ответ из PS.xml"
        "Ошибка: $_" | Out-File -FilePath $responseFileName -Encoding UTF8
        return $null
    }
}

# Основной цикл обработки
Write-Host "Начало обработки SOAP веб-сервиса" -ForegroundColor Cyan

foreach ($phone in $phoneNumbers) {
    Write-Host "`nОбработка номера: $phone" -ForegroundColor Cyan
    $result = Invoke-SoapRequest -phoneNumber $phone
}

Write-Host "`nОбработка завершена!" -ForegroundColor Green