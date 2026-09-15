cls
# URL SOAP веб-сервиса
$wsdlUrl = "https://asuse-test.ie.corp/IVR.asmx?wsdl"
$serviceUrl = "https://asuse-test.ie.corp/IVR.asmx"

# Значения параметров
$contractStrGUIDs = @(
    "7dc89e76-92f1-11e2-8708-0050569b0089",
    "4a6722c6-9235-11e2-8708-0050569b0089",
    "cb19c04c-fda6-11e6-80ce-002481f90c3a",
    "9c11ee6a-a8ab-11e2-ab44-001f29ceb871",
    "f0e4aeb2-9318-11e2-8708-0050569b0089",
    "7d25e68d-a8d7-11e2-ab44-001f29ceb871"
)

# Создаем прокси-объект для веб-сервиса
try {
    Write-Host "Создание прокси-объекта для веб-сервиса..." -ForegroundColor Green
    $webProxy = New-WebServiceProxy -Uri $wsdlUrl -UseDefaultCredential
    Write-Host "Прокси-объект создан успешно" -ForegroundColor Green
}
catch {
    Write-Host "Ошибка при создании прокси-объекта: $_" -ForegroundColor Red
    exit 1
}

# Функция для создания SOAP запроса
function Create-SOAPRequest {
    param(
        [string]$contractStrGUID
    )
    
    $soapRequest = @"
<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" 
               xmlns:xsd="http://www.w3.org/2001/XMLSchema" 
               xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
    <soap:Body>
        <GetMDsWarningInfo_ByContractID xmlns="http://tempuri.org/">
            <contractID>$contractStrGUID</contractID>
        </GetMDsWarningInfo_ByContractID>
    </soap:Body>
</soap:Envelope>
"@
    
    return $soapRequest
}

# Функция для отправки SOAP запроса напрямую через HTTP
function Send-SOAPRequest {
    param(
        [string]$contractStrGUID
    )
    
    $soapRequest = Create-SOAPRequest -contractStrGUID $contractStrGUID
    
    $headers = @{
        "Content-Type" = "text/xml;charset=utf-8"
        "SOAPAction" = "http://tempuri.org/GetMDsWarningInfo_ByContractID"
    }
    
    try {
        $response = Invoke-WebRequest -Uri $serviceUrl -Method Post -Body $soapRequest -Headers $headers -UseDefaultCredential
        return $response.Content
    }
    catch {
        Write-Host "Ошибка при отправке SOAP запроса: $_" -ForegroundColor Red
        return $null
    }
}

# Альтернативная реализация через WebClient
function Send-SOAPRequestWebClient {
    param(
        [string]$contractStrGUID
    )
    
    $soapRequest = Create-SOAPRequest -contractStrGUID $contractStrGUID
    
    try {
        $webClient = New-Object System.Net.WebClient
        $webClient.Headers.Add("Content-Type", "text/xml; charset=utf-8")
        $webClient.Headers.Add("SOAPAction", "http://tempuri.org/GetMDsWarningInfo_ByContractID")
        
        $response = $webClient.UploadString($serviceUrl, $soapRequest)
        return $response
    }
    catch {
        Write-Host "Ошибка при отправке SOAP запроса через WebClient: $_" -ForegroundColor Red
        return $null
    }
}

# Основной цикл обработки всех комбинаций
$totalCombinations = $contractStrGUIDs.Count
$current = 0


foreach ($contractStrGUID in $contractStrGUIDs) {
    $current++
    $progress = [math]::Round(($current / $totalCombinations) * 100, 2)
        
    Write-Host "`nОбработка комбинации $current из $totalCombinations ($progress%)" -ForegroundColor Yellow
    Write-Host "ContractStrGUID: $contractStrGUID" -ForegroundColor Cyan
        
    # Генерация имен файлов
    $requestFileName = "$contractStrGUID-Запрос из PS.XML"
    $responseFileName = "$contractStrGUID-Ответ из PS.XML"
        
    # Создание SOAP запроса
    $soapRequest = Create-SOAPRequest -contractStrGUID $contractStrGUID
        
    # Сохранение запроса в файл
    try {
        $soapRequest | Out-File -FilePath $requestFileName -Encoding UTF8
        Write-Host "Сохранен файл запроса: $requestFileName" -ForegroundColor Green
    }
    catch {
        Write-Host "Ошибка при сохранении файла запроса: $_" -ForegroundColor Red
        continue
    }
        
    # Отправка запроса и получение ответа (пробуем несколько способов)
    $soapResponse = $null
        
    # Способ 1: Использование WebClient (часто более надежный для SOAP)
    Write-Host "Отправка запроса через WebClient..." -ForegroundColor Gray
    $soapResponse = Send-SOAPRequestWebClient -contractStrGUID $contractStrGUID
        
    # Если первый способ не сработал, пробуем второй
    if (-not $soapResponse) {
        Write-Host "Попытка отправки через Invoke-WebRequest..." -ForegroundColor Gray
        $soapResponse = Send-SOAPRequest -contractStrGUID $contractStrGUID
    }
        
    # Если оба способа не сработали, пробуем использовать прокси-объект
    if (-not $soapResponse -and $webProxy) {
        try {
            Write-Host "Попытка отправки через прокси-объект..." -ForegroundColor Gray
            $soapResponse = $webProxy.GetMDInfo_By_ContractIDAndNomenclatureCode($contractStrGUID)
                
            # Конвертируем ответ в XML строку, если это объект
            if ($soapResponse -and ($soapResponse -is [System.Xml.XmlNode] -or $soapResponse -is [System.Xml.XmlElement])) {
                $soapResponse = $soapResponse.OuterXml
            }
            elseif ($soapResponse) {
                # Если это другой тип объекта, конвертируем в строку
                $soapResponse = $soapResponse | ConvertTo-Xml -NoTypeInformation -Depth 10 | Out-String
            }
        }
        catch {
            Write-Host "Ошибка при вызове метода через прокси: $_" -ForegroundColor Red
        }
    }
        
    # Сохранение ответа в файл
    if ($soapResponse) {
        try {
            # Если ответ не XML, пробуем его форматировать
            if ($soapResponse -match '^<') {
                # Это XML, сохраняем как есть
                $soapResponse | Out-File -FilePath $responseFileName -Encoding UTF8
            }
            else {
                # Пробуем конвертировать в XML
                try {
                    $xml = [xml]$soapResponse
                    $xml.OuterXml | Out-File -FilePath $responseFileName -Encoding UTF8
                }
                catch {
                    # Если не XML, сохраняем как текст
                    $soapResponse | Out-File -FilePath $responseFileName -Encoding UTF8
                }
            }
            Write-Host "Сохранен файл ответа: $responseFileName" -ForegroundColor Green
        }
        catch {
            Write-Host "Ошибка при сохранении файла ответа: $_" -ForegroundColor Red
        }
    }
    else {
        Write-Host "Не удалось получить ответ от сервера" -ForegroundColor Red
        # Создаем пустой файл ответа
        "Пустой ответ или ошибка соединения" | Out-File -FilePath $responseFileName -Encoding UTF8
    }
        
    # Небольшая пауза между запросами
    Start-Sleep -Milliseconds 100
}


Write-Host "`nОбработка всех комбинаций завершена!" -ForegroundColor Green
Write-Host "Создано файлов запросов: $($contractStrGUIDs.Count)" -ForegroundColor Green
Write-Host "Создано файлов ответов: $($contractStrGUIDs.Count)" -ForegroundColor Green