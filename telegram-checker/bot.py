import os
import re
import asyncio
import threading
from flask import Flask, request, jsonify
from dotenv import load_dotenv
from telethon import TelegramClient

load_dotenv()

API_ID = int(os.getenv("TG_API_ID", "0"))
API_HASH = os.getenv("TG_API_HASH", "")
BOT_USERNAME = os.getenv("TG_BOT_USERNAME", "sopipiceknope_bot")
SESSION_NAME = os.getenv("TG_SESSION", "shopee_checker")
LISTEN_TIMEOUT = int(os.getenv("TG_LISTEN_TIMEOUT", "30"))

if not API_ID or not API_HASH:
    raise RuntimeError("Set TG_API_ID and TG_API_HASH di file .env")

client = TelegramClient(SESSION_NAME, API_ID, API_HASH)
app = Flask(__name__)

# Shared event loop running in background thread
_loop = None
_loop_ready = threading.Event()

def _start_loop():
    global _loop
    _loop = asyncio.new_event_loop()
    asyncio.set_event_loop(_loop)
    _loop_ready.set()
    _loop.run_forever()

def _run(coro):
    future = asyncio.run_coroutine_threadsafe(coro, _loop)
    return future.result(timeout=40)

def _parse_response(text, phone):
    pattern = r'📱\s*(\d+)\s*:\s*(✅|❌)\s*(.+)'
    match = re.search(pattern, text)
    if match:
        found_phone = match.group(1)
        icon = match.group(2)
        status = match.group(3).strip()
        registered = icon == "✅"
        return {"success": True, "phone": found_phone, "registered": registered, "available": not registered, "status_text": "TERDAFTAR" if registered else "BELUM TERDAFTAR", "detail": status, "raw": text}
    if "belum terdaftar" in text.lower():
        return {"success": True, "phone": phone, "registered": False, "available": True, "status_text": "BELUM TERDAFTAR", "raw": text}
    if "terdaftar" in text.lower() and "belum" not in text.lower():
        return {"success": True, "phone": phone, "registered": True, "available": False, "status_text": "TERDAFTAR", "raw": text}
    return {"success": True, "phone": phone, "registered": False, "available": False, "status_text": "STATUS UNKNOWN", "raw": text}

async def _check_async(phone):
    bot = await client.get_entity(BOT_USERNAME)
    await client.send_message(bot, phone)
    start_time = asyncio.get_event_loop().time()
    while asyncio.get_event_loop().time() - start_time < LISTEN_TIMEOUT:
        await asyncio.sleep(0.5)
        messages = await client.get_messages(bot, limit=5)
        for msg in messages:
            if msg.sender_id == bot.id and msg.text:
                text = msg.text
                if phone in text or ('62' in text and phone.replace('0', '62', 1) in text):
                    return _parse_response(text, phone)
    return {"error": "Timeout - bot tidak merespons dalam 30 detik", "phone": phone}

def normalize_phone(phone):
    phone = re.sub(r'[^0-9]', '', str(phone))
    if phone.startswith('0'): phone = '62' + phone[1:]
    if not phone.startswith('62'): phone = '62' + phone
    return phone

@app.route("/health", methods=["GET"])
def health():
    return jsonify({"status": "ok", "bot": BOT_USERNAME})

@app.route("/check", methods=["POST"])
def check_phone():
    data = request.get_json(force=True)
    phone = normalize_phone(data.get("phone", ""))
    if not phone or phone == "62":
        return jsonify({"error": "phone required"}), 400
    try:
        return jsonify(_run(_check_async(phone)))
    except Exception as e:
        return jsonify({"error": str(e), "phone": phone}), 500

@app.route("/check_batch", methods=["POST"])
def check_batch():
    data = request.get_json(force=True)
    phones = data.get("phones", [])
    if not phones or not isinstance(phones, list):
        return jsonify({"error": "phones array required"}), 400
    results = []
    for p in phones[:20]:
        pn = normalize_phone(p)
        try:
            results.append(_run(_check_async(pn)))
        except Exception as e:
            results.append({"error": str(e), "phone": pn})
    return jsonify({"results": results})

if __name__ == "__main__":
    t = threading.Thread(target=_start_loop, daemon=True)
    t.start()
    _loop_ready.wait()

    async def _init():
        await client.start()
        me = await client.get_me()
        print(f"[TG] Login sebagai: {me.first_name} (@{me.username})")

    _run(_init())
    print(f"[*] Listening for Shopee checks via @{BOT_USERNAME}")
    print("[*] Starting Flask API on port 5000...")
    app.run(host="0.0.0.0", port=5000, debug=False)
