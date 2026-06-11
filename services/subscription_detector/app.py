"""サブスクリプション検出 API サーバー"""

import os

from dotenv import load_dotenv
from flask import Flask, jsonify, request

from detector import KNOWN_SERVICES, detect_from_app_list, detect_subscriptions

load_dotenv()

app = Flask(__name__)
PORT = int(os.getenv("PORT", "5001"))


@app.route("/health", methods=["GET"])
def health():
    return jsonify({"status": "ok", "service": "subscription-detector"})


@app.route("/detect", methods=["POST"])
def detect():
    data = request.get_json() or {}
    transactions = data.get("transactions", [])
    if not transactions:
        return jsonify({"error": "transactions 配列が必要です"}), 400

    results = detect_subscriptions(transactions)
    return jsonify({
        "detected": [r.to_dict() for r in results],
        "count": len(results),
    })


@app.route("/detect/apps", methods=["POST"])
def detect_apps():
    data = request.get_json() or {}
    apps = data.get("apps", [])
    if not apps:
        return jsonify({"error": "apps 配列が必要です"}), 400

    results = detect_from_app_list(apps)
    return jsonify({
        "detected": [r.to_dict() for r in results],
        "count": len(results),
    })


@app.route("/services", methods=["GET"])
def list_services():
    return jsonify({
        "services": [
            {"name": s["name"], "category": s["category"], "default_amount": s["default_amount"], "cycle": s["cycle"]}
            for s in KNOWN_SERVICES
        ],
        "count": len(KNOWN_SERVICES),
    })


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=PORT, debug=True)
