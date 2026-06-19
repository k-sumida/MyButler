"""LINE通知スケジューラー - 指定日のメモをLINEで通知する"""

import os
import sqlite3
import time
from datetime import datetime
from pathlib import Path

import requests
from dotenv import load_dotenv

load_dotenv()

DB_PATH = os.getenv("DB_PATH", str(Path(__file__).resolve().parents[2] / "data" / "mybutler.db"))
LINE_TOKEN = os.getenv("LINE_CHANNEL_ACCESS_TOKEN", "")
CHECK_INTERVAL = int(os.getenv("CHECK_INTERVAL_MINUTES", "1")) * 60


def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def send_line_message(user_id: str, message: str) -> bool:
    if not LINE_TOKEN:
        print(f"[SKIP] LINE_CHANNEL_ACCESS_TOKEN未設定のため送信しません (user={user_id})")
        return False

    url = "https://api.line.me/v2/bot/message/push"
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {LINE_TOKEN}",
    }
    payload = {
        "to": user_id,
        "messages": [{"type": "text", "text": message}],
    }
    try:
        resp = requests.post(url, json=payload, headers=headers, timeout=10)
        resp.raise_for_status()
        return True
    except requests.RequestException as e:
        print(f"LINE送信エラー: {e}")
        return False


def check_and_notify():
    now = datetime.now()
    now_label = now.strftime("%Y-%m-%d %H:%M")
    conn = get_db()
    cursor = conn.cursor()

    cursor.execute("""
        SELECT m.id, m.type, m.title, m.content, m.due_date,
               COALESCE(m.due_time, '09:00') AS due_time,
               m.deadline_date,
               u.line_user_id, u.username
        FROM memos m
        JOIN users u ON m.user_id = u.id
        WHERE m.completed = 0
          AND m.notified = 0
          AND u.line_user_id IS NOT NULL
          AND u.line_user_id != ''
          AND datetime(m.due_date || ' ' || COALESCE(m.due_time, '09:00')) <= datetime('now', 'localtime')
    """)

    rows = cursor.fetchall()
    sent_count = 0
    for row in rows:
        type_label = "買い物" if row["type"] == "shopping" else "やること"
        item_label = "買うもの" if row["type"] == "shopping" else "やること"
        message = (
            f"【MyButler リマインダー】\n"
            f"ユーザー: {row['username']}\n"
            f"種類: {type_label}\n"
            f"{item_label}: {row['title']}\n"
        )
        if row["deadline_date"]:
            message += f"期日: {row['deadline_date']}\n"
        if row["content"]:
            message += f"内容: {row['content']}\n"
        message += f"通知: {row['due_date']} {row['due_time']}"

        if send_line_message(row["line_user_id"], message):
            cursor.execute("UPDATE memos SET notified = 1 WHERE id = ?", (row["id"],))
            print(f"通知送信: {row['username']} - {row['title']} ({row['due_date']} {row['due_time']})")
            sent_count += 1

    conn.commit()
    conn.close()

    if sent_count:
        print(f"{sent_count}件の通知を処理しました")
    else:
        print(f"[{now_label}] 通知対象なし")


def run_scheduler():
    print(f"MyButler LINE通知スケジューラー起動 (間隔: {CHECK_INTERVAL}秒)")
    print(f"DB: {DB_PATH}")
    if not LINE_TOKEN:
        print("警告: LINE_CHANNEL_ACCESS_TOKEN未設定 - ドライラン モードで動作します")

    while True:
        try:
            check_and_notify()
        except Exception as e:
            print(f"エラー: {e}")
        time.sleep(CHECK_INTERVAL)


if __name__ == "__main__":
    run_scheduler()
