# Форматирование XML-файлов в читаемый вид
$xmlFiles = Get-ChildItem -Path . -Filter *.xml -File

if ($xmlFiles.Count -eq 0) {
    Write-Host "XML-файлы не найдены в текущей директории." -ForegroundColor Yellow
    exit
}

foreach ($file in $xmlFiles) {
    try {
        # Загружаем XML-документ
        $xml = New-Object System.Xml.XmlDocument
        $xml.Load($file.FullName)
        
        # Настройки форматирования
        $settings = New-Object System.Xml.XmlWriterSettings
        $settings.Indent = $true
        $settings.IndentChars = "    "  # Используем табуляцию
        $settings.NewLineChars = "`n"  # Используем перевод строки
        
        # Сохраняем с форматированием
        $writer = [System.Xml.XmlWriter]::Create($file.FullName, $settings)
        $xml.Save($writer)
        $writer.Close()
        
        Write-Host "Файл '$($file.Name)' отформатирован успешно." -ForegroundColor Green
    }
    catch {
        Write-Host "Ошибка при обработке файла '$($file.Name)': $($_.Exception.Message)" -ForegroundColor Red
    }
}

Write-Host "`nОбработка завершена. Обработано файлов: $($xmlFiles.Count)" -ForegroundColor Cyan