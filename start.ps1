# MyButler 起動スクリプト (Windows PowerShell)
Write-Host "=== MyButler 起動 ===" -ForegroundColor Cyan

# .env ファイルのコピー
if (-not (Test-Path "backend\.env")) {
    Copy-Item "backend\.env.example" "backend\.env"
    Write-Host "backend\.env を作成しました" -ForegroundColor Yellow
}

# 依存関係インストール
Write-Host "依存関係をインストール中..." -ForegroundColor Yellow
Set-Location backend; npm install; Set-Location ..
Set-Location frontend; npm install; Set-Location ..

# Python依存関係
pip install -r services/subscription_detector/requirements.txt -q
pip install -r services/notification/requirements.txt -q

# DB初期化
Set-Location backend; npm run init-db; Set-Location ..

Write-Host ""
Write-Host "以下のコマンドを別々のターミナルで実行してください:" -ForegroundColor Green
Write-Host "  1. npm run dev:backend       (Node.js API - port 3001)"
Write-Host "  2. npm run dev:frontend      (React UI - port 5173)"
Write-Host "  3. npm run dev:detector      (Python サブスク検出 - port 5001)"
Write-Host "  4. npm run dev:notification  (Python LINE通知)"
Write-Host ""
Write-Host "ブラウザで http://localhost:5173 を開いてください" -ForegroundColor Cyan
