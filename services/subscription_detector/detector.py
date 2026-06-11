"""サブスクリプション自動検出サービス"""

import re
from dataclasses import dataclass

# 既知のサブスクリプションサービスデータベース
KNOWN_SERVICES = [
    {"patterns": [r"netflix", r"ネットフリックス"], "name": "Netflix", "category": "動画配信", "default_amount": 1490, "cycle": "monthly"},
    {"patterns": [r"spotify", r"スポティファイ"], "name": "Spotify", "category": "音楽配信", "default_amount": 980, "cycle": "monthly"},
    {"patterns": [r"apple\s*music", r"アップルミュージック", r"apple\.com/bill"], "name": "Apple Music", "category": "音楽配信", "default_amount": 1080, "cycle": "monthly"},
    {"patterns": [r"amazon\s*prime", r"アマゾンプライム", r"prime\s*video"], "name": "Amazon Prime", "category": "動画配信", "default_amount": 600, "cycle": "monthly"},
    {"patterns": [r"disney\+", r"disney\s*plus", r"ディズニー"], "name": "Disney+", "category": "動画配信", "default_amount": 1140, "cycle": "monthly"},
    {"patterns": [r"youtube\s*premium", r"ユーチューブプレミアム", r"google\s*youtube"], "name": "YouTube Premium", "category": "動画配信", "default_amount": 1280, "cycle": "monthly"},
    {"patterns": [r"hulu", r"フールー"], "name": "Hulu", "category": "動画配信", "default_amount": 1026, "cycle": "monthly"},
    {"patterns": [r"u-next", r"ユーネクスト"], "name": "U-NEXT", "category": "動画配信", "default_amount": 2189, "cycle": "monthly"},
    {"patterns": [r"dazn"], "name": "DAZN", "category": "スポーツ配信", "default_amount": 4200, "cycle": "monthly"},
    {"patterns": [r"abema", r"アベマ"], "name": "ABEMAプレミアム", "category": "動画配信", "default_amount": 960, "cycle": "monthly"},
    {"patterns": [r"line\s*music", r"ラインミュージック"], "name": "LINE MUSIC", "category": "音楽配信", "default_amount": 980, "cycle": "monthly"},
    {"patterns": [r"awa", r"アワ"], "name": "AWA", "category": "音楽配信", "default_amount": 980, "cycle": "monthly"},
    {"patterns": [r"icloud", r"アイクラウド"], "name": "iCloud+", "category": "クラウドストレージ", "default_amount": 130, "cycle": "monthly"},
    {"patterns": [r"google\s*one", r"グーグルワン"], "name": "Google One", "category": "クラウドストレージ", "default_amount": 250, "cycle": "monthly"},
    {"patterns": [r"microsoft\s*365", r"office\s*365"], "name": "Microsoft 365", "category": "生産性", "default_amount": 1490, "cycle": "monthly"},
    {"patterns": [r"adobe", r"アドビ"], "name": "Adobe Creative Cloud", "category": "生産性", "default_amount": 6480, "cycle": "monthly"},
    {"patterns": [r"dropbox"], "name": "Dropbox", "category": "クラウドストレージ", "default_amount": 1500, "cycle": "monthly"},
    {"patterns": [r"nintendo\s*switch\s*online", r"ニンテンドー"], "name": "Nintendo Switch Online", "category": "ゲーム", "default_amount": 306, "cycle": "monthly"},
    {"patterns": [r"playstation\s*plus", r"ps\s*plus"], "name": "PlayStation Plus", "category": "ゲーム", "default_amount": 850, "cycle": "monthly"},
    {"patterns": [r"xbox\s*game\s*pass"], "name": "Xbox Game Pass", "category": "ゲーム", "default_amount": 1100, "cycle": "monthly"},
    {"patterns": [r"chatgpt", r"openai"], "name": "ChatGPT Plus", "category": "AI", "default_amount": 3000, "cycle": "monthly"},
    {"patterns": [r"notion"], "name": "Notion", "category": "生産性", "default_amount": 1000, "cycle": "monthly"},
]


@dataclass
class DetectedSubscription:
    service_name: str
    category: str
    billing_cycle: str
    amount: float
    currency: str
    confidence: float
    matched_text: str

    def to_dict(self):
        return {
            "service_name": self.service_name,
            "category": self.category,
            "billing_cycle": self.billing_cycle,
            "amount": self.amount,
            "currency": self.currency,
            "confidence": self.confidence,
            "matched_text": self.matched_text,
        }


def extract_amount(text: str) -> float | None:
    patterns = [
        r"¥\s*([\d,]+)",
        r"([\d,]+)\s*円",
        r"JPY\s*([\d,]+)",
        r"\$\s*([\d.]+)",
    ]
    for pattern in patterns:
        match = re.search(pattern, text, re.IGNORECASE)
        if match:
            return float(match.group(1).replace(",", ""))
    return None


def detect_subscriptions(transactions: list[dict]) -> list[DetectedSubscription]:
    """取引データからサブスクリプションを自動検出する"""
    detected: list[DetectedSubscription] = []
    seen_services: set[str] = set()

    for tx in transactions:
        description = tx.get("description", "") + " " + tx.get("merchant", "")
        description_lower = description.lower()

        for service in KNOWN_SERVICES:
            if service["name"] in seen_services:
                continue

            for pattern in service["patterns"]:
                if re.search(pattern, description_lower, re.IGNORECASE):
                    amount = tx.get("amount") or extract_amount(description) or service["default_amount"]
                    cycle = "yearly" if tx.get("billing_cycle") == "yearly" else service["cycle"]

                    detected.append(DetectedSubscription(
                        service_name=service["name"],
                        category=service["category"],
                        billing_cycle=cycle,
                        amount=float(amount),
                        currency=tx.get("currency", "JPY"),
                        confidence=0.85 if tx.get("amount") else 0.7,
                        matched_text=description.strip(),
                    ))
                    seen_services.add(service["name"])
                    break

    return detected


def detect_from_app_list(apps: list[str]) -> list[DetectedSubscription]:
    """インストール済みアプリ名リストからサブスクリプションを推定する"""
    transactions = [{"description": app, "merchant": app} for app in apps]
    results = detect_subscriptions(transactions)
    for r in results:
        r.confidence = 0.6
    return results
