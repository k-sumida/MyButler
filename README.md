# MyButler 🎩

買い物・ToDoメモ、LINE通知、サブスクリプション管理を行う生活管理Webアプリです。

## 機能

- **メモ管理**: 「買い物」「ToDo」リストから選択してメモを作成
- **LINE通知**: 指定した日付にLINEでリマインダー通知
- **サブスク管理**: 音楽・動画配信等のサブスクリプションを一覧管理（月額/年額、更新日）
- **自動検出**: 取引データからサブスクリプションを自動検出（Python）
- **ユーザー認証**: ID/パスワードによるログイン、個人データの保護

## 技術スタック

| レイヤー | 技術 |
|---------|------|
| フロントエンド | React + Vite |
| APIサーバー | Node.js (Express) |
| 通知サービス | Python (LINE Messaging API) |
| サブスク検出 | Python (Flask) |
| データベース | SQLite (共有) |

## セットアップ

### 前提条件

- Node.js 18+
- Python 3.10+
- npm

### クイックスタート

```powershell
# 1. セットアップ（依存関係インストール + DB初期化）
.\start.ps1

# 2. 各サービスを別ターミナルで起動
npm run dev:backend        # API (http://localhost:3001)
npm run dev:frontend       # UI  (http://localhost:5173)
npm run dev:detector       # サブスク検出 (http://localhost:5001)
npm run dev:notification   # LINE通知スケジューラー
```

### 環境変数

`backend/.env`（`backend/.env.example` からコピー）:

```
PORT=3001
JWT_SECRET=your-secret-key
DB_PATH=../data/mybutler.db
SUBSCRIPTION_DETECTOR_URL=http://localhost:5001
```

`services/notification/.env`:

```
LINE_CHANNEL_ACCESS_TOKEN=your-line-token
DB_PATH=../../data/mybutler.db
```

## LINE連携

1. [LINE Developers](https://developers.line.biz/) でMessaging APIチャネルを作成
2. チャネルアクセストークンを `services/notification/.env` に設定
3. アプリの「設定」画面でLINE User IDを登録
4. トークン未設定時はドライランモード（コンソール出力のみ）

## プロジェクト構成

```
MyButler/
├── backend/                  # Node.js API
│   └── src/
│       ├── routes/           # auth, memos, subscriptions
│       ├── middleware/       # JWT認証
│       └── db.js             # SQLite
├── frontend/                 # React UI
│   └── src/pages/            # Dashboard, Subscriptions, Settings
├── services/
│   ├── notification/         # Python LINE通知
│   └── subscription_detector/ # Python サブスク自動検出
├── data/                     # SQLiteデータベース
└── start.ps1                 # セットアップスクリプト
```

## API エンドポイント

| メソッド | パス | 説明 |
|---------|------|------|
| POST | /api/auth/register | ユーザー登録 |
| POST | /api/auth/login | ログイン |
| GET | /api/memos | メモ一覧 |
| POST | /api/memos | メモ作成 |
| GET | /api/subscriptions | サブスク一覧 |
| POST | /api/subscriptions/detect | 自動検出 |
