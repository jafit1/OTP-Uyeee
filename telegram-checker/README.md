# Telegram Checker Setup Guide

## 1. Dapatkan API Credentials Telegram
1. Buka https://my.telegram.org
2. Login dengan nomor HP kamu
3. Klik **API development tools**
4. Isi form (app title, platform, dll) → **Create application**
5. Catat **App api_id** dan **App api_hash**

## 2. Setup di Komputer Kamu
```bash
cd D:\Project\otp-uyeee\telegram-checker

# Install dependencies
pip install -r requirements.txt

# Buat file .env (copy dari .env.example)
copy .env.example .env
```

Edit file `.env`:
```
TG_API_ID=12345678          # isi dari my.telegram.org
TG_API_HASH=abcdef12345678  # isi dari my.telegram.org
TG_BOT_USERNAME=sopipiceknope_bot
```

## 3. Jalankan Bot Checker
```bash
python bot.py
```

Pertama kali jalan, Telethon akan minta **nomor HP** dan **kode verifikasi** dari Telegram. Login sekali saja, session tersimpan.

## 4. Expose ke Internet (Cloudflare Tunnel)
Agar Vercel bisa akses bot checker di komputer kamu:

```bash
# Install cloudflared (Windows)
winget install Cloudflare.cloudflared

# Login ke Cloudflare
cloudflared tunnel login

# Buat tunnel
cloudflared tunnel create shopee-checker

# Route DNS
cloudflared tunnel route dns shopee-checker shopee-checker.maxluno47.workers.dev

# Jalankan tunnel (point ke port 5000)
cloudflared tunnel run --url http://localhost:5000 shopee-checker
```

Atau cara cepat tanpa buat tunnel permanent:
```bash
cloudflared tunnel --url http://localhost:5000
```
Ini akan kasih URL random seperti `https://xxx-yyy-zzz.trycloudflare.com`

## 5. Set URL di Vercel
Setelah dapat URL dari Cloudflare Tunnel, set di Vercel:
```bash
npx vercel env add TELEGRAM_CHECKER_URL production --value "https://shopee-checker.maxluno47.workers.dev"
npx vercel deploy --prod
```

## 6. Test
Buka https://otp-uyeee.vercel.app → Shopee Checker → masukkan nomor → cek!

---

## Troubleshooting
- **Bot tidak merespons**: Pastikan `python bot.py` sedang jalan
- **Timeout**: Cek koneksi internet, pastikan bot Telegram tidak sedang busy
- **Session expired**: Hapus file `shopee_checker.session` lalu jalankan ulang `python bot.py`
