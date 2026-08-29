import os
import re
import asyncio
import logging
from threading import Thread
from flask import Flask, request, jsonify
from dotenv import load_dotenv
from telethon import TelegramClient
from telethon.tl.types import PeerUser

load_dotenv()

# ─── Config ─────────────────────────────────────────────
API_ID = int(os.getenv("TG_API_ID", "0"))
API_HASH = os.getenv("TG_API_HASH", "")
BOT_USERNAME = os.getenv("TG_BOT_USERNAME", "sopipiceknope_bot")
SESSION_NAME = os.getenv("TG_SESSION", "shopee_checker")
LISTEN_TIMEOUT = int(os.getenv("TG_LISTEN_TIMEOUT", "30"))

if not API_ID or not API_HASH:
    raise RuntimeError("Set TG_API_ID and TG_API_HASH di file .env (dari my.telegram.org)")

# ─── Telethon Client ────────────────────────────────────
client = TelegramClient(SESSION_NAME, API_ID, API_HASH)
loop = asyncio.new_event_loop()

def start_loop(loop):
    asyncio.set_event_loop(loop)
    loop.run_forever()

Thread(target=start_loop, args=(loop,), daemon=True).start()

async def _init_client():
    await client.start()
    me = await client.get_me()
    print(f"[TG] Login sebagai: {me.first_name} (@{me.username})")

def run_async(coro):
    future = asyncio.run_coroutine_threadsafe(coro, loop)
    return future.result(timeout=60)

# ─── Shopee Check via Telegram Bot ──────────────────────
async def check_shopee_via_bot(phone: str) -> dict:
    """Kirim nomor ke bot Telegram dan baca balasannya"""
    bot = await client.get_entity(BOT_USERNAME)

    # Kirim nomor langsung (tanpa command)
    await client.send_message(bot, phone)

    # Tunggu balasan dari bot (max 30 detik)
    start_time = asyncio.get_event_loop().time()
    while asyncio.get_event_loop().time() - start_time < LISTEN_TIMEOUT:
        await asyncio.sleep(0.5)

        # Ambil message terakhir dari bot
        messages = await client.get_messages(bot, limit=5)
        for msg in messages:
            if msg.sender_id == bot.id and msg.text:
                text = msg.text
                # Cek apakah pesan ini untuk nomor kita
                if phone in text or ('62' in text and phone.replace('0', '62', 1) in text):
                    return _parse_response(text, phone)

    return {"error": "Timeout - bot tidak merespons dalam 30 detik", "phone": phone}

def _parse_response(text: str, phone: str) -> dict:
    """Parse response text dari bot"""
    # Pattern: 📱 628xxxxx : ✅ Terdaftar / ❌ Belum Terdaftar
    pattern = r'📱\s*(\d+)\s*:\s*(✅|❌)\s*(.+)'
    match = re.search(pattern, text)

    if match:
        found_phone = match.group(1)
        icon = match.group(2)
        status = match.group(3).strip()

        registered = icon == "✅"
        return {
            "success": True,
            "phone": found_phone,
            "registered": registered,
            "available": not registered,
            "status_text": "TERDAFTAR" if registered else "BELUM TERDAFTAR",
            "detail": status,
            "raw": text,
        }

    # Fallback: cari kata kunci
    if "terdaftar" in text.lower() and "belum" not in text.lower():
        return {"success": True, "phone": phone, "registered": True, "available": False, "status_text": "TERDAFTAR", "raw": text}
    if "belum terdaftar" in text.lower():
        return {"success": True, "phone": phone, "registered": False, "available": True, "status_text": "BELUM TERDAFTAR", "raw": text}

    return {"success": True, "phone": phone, "registered": False, "available": False, "status_text": "STATUS UNKNOWN", "raw": text}

# ─── Flask API ──────────────────────────────────────────
app = Flask(__name__)

@app.route("/health", methods=["GET"])
def health():
    return jsonify({"status": "ok", "bot": BOT_USERNAME})

@app.route("/check", methods=["POST"])
def check_phone():
    data = request.get_json(force=True)
    phone = str(data.get("phone", "")).strip()

    if not phone:
        return jsonify({"error": "phone required"}), 400

    # Normalize
    phone = re.sub(r'[^0-9]', '', phone)
    if phone.startswith('0'):
        phone = '62' + phone[1:]
    if not phone.startswith('62'):
        phone = '62' + phone

    try:
        result = run_async(check_shopee_via_bot(phone))
        return jsonify(result)
    except Exception as e:
        return jsonify({"error": str(e), "phone": phone}), 500

@app.route("/check_batch", methods=["POST"])
def check_batch():
    """Check multiple phones at once"""
    data = request.get_json(force=True)
    phones = data.get("phones", [])

    if not phones or not isinstance(phones, list):
        return jsonify({"error": "phones array required"}), 400

    results = []
    for p in phones[:20]:
        p = re.sub(r'[^0-9]', '', str(p))
        if p.startswith('0'): p = '62' + p[1:]
        if not p.startswith('62'): p = '62' + p

        try:
            r = run_async(check_shopee_via_bot(p))
            results.append(r)
        except Exception as e:
            results.append({"error": str(e), "phone": p})

    return jsonify({"results": results})

# ─── Main ───────────────────────────────────────────────
if __name__ == "__main__":
    print("[*] Connecting to Telegram...")
    run_async(_init_client())
    print(f"[*] Listening for Shopee checks via @{BOT_USERNAME}")
    print("[*] Starting Flask API on port 5000...")
    app.run(host="0.0.0.0", port=5000, debug=False)
