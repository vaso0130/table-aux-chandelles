# 重產 offline-files.json：首頁「離線版・把牌面圖全部存起來」要抓的圖檔清單（版控中的牌面圖與牌背）。
# 新增或改名牌面圖後跑一次：powershell -File make-offline-list.ps1
Set-Location $PSScriptRoot
$files = git ls-files | Where-Object { $_ -match '^cards[^/]*/[^/]+\.(jpg|png|webp)$' }
$bytes = 0; foreach ($f in $files) { $bytes += (Get-Item -LiteralPath $f).Length }
$json = [ordered]@{ bytes = $bytes; files = @($files) } | ConvertTo-Json -Compress
[IO.File]::WriteAllText((Join-Path $PSScriptRoot 'offline-files.json'), $json, (New-Object Text.UTF8Encoding $false))
"{0} 個檔案，{1:N1} MB" -f $files.Count, ($bytes / 1MB)
