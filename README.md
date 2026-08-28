# OTP Uyeee

Dashboard OTP modern bergaya **Soft Brutalism / Neo-brutalism** dengan stack **Next.js App Router + Tailwind CSS**.
Aplikasi ini bertindak sebagai wrapper/proxy frontend-backend ke provider OTP (default: `https://dehuyzotp.shop`) dengan flow resmi token-based.
Versi terbaru sudah dioptimasi ke **layout compact one-page** dengan **tema dark maskulin** dan opsi palet monokrom.

---

## 1) Tujuan Proyek

- Menyediakan UX OTP yang terasa seperti produk jadi (bukan form sederhana)
- Mempermudah operator untuk:
  - test koneksi provider
  - pilih layanan realtime
  - order nomor
  - copy nomor
  - polling OTP manual/auto
  - retry OTP
  - aksi order (`done` / `cancel`)
  - monitoring log API terpisah

---

## 2) Fitur yang Saat Ini Sudah Selesai

1. **Branding OTP Uyeee** + UI Soft Brutalism modern
2. **Menu fungsional penuh**:
   - Dashboard
   - Order Monitor
   - API Logs
   - Provider Settings
3. **Custom dropdown** (tanpa native browser select)
4. **Provider Settings sederhana** (cukup API key + test koneksi)
5. **Advanced Override opsional** untuk auth/path endpoint
6. **Integrasi endpoint resmi docs provider**:
   - `GET /api/services`
   - `GET /api/balance`
   - `POST /api/rent`
   - `GET /api/sms/{token}?timeout=60`
   - `POST /api/rent/{token}/retry`
   - `GET /api/order/{id}`
   - `POST /api/order/{id}` (action `done|cancel`)
7. **Flow token-based** pada frontend:
   - polling OTP pakai `token`
   - mapping response pakai `phone`, `order_id`, `token`
8. **OTP polling otomatis** + countdown + progress bar
9. **Auto-sync status background** via endpoint internal `POST /api/otp/status` (interval berkala)
10. **Guard action DONE**: tombol Done aktif hanya jika OTP sudah benar-benar diterima
11. **Metrik SLA realtime**:
    - rata-rata waktu OTP masuk (lead time)
    - success rate per service
12. **Retry/backoff cerdas** untuk check OTP & status sync (exponential delay)
13. **Pause otomatis saat tab tidak aktif**:
    - auto polling OTP dijeda
    - auto status sync dijeda
14. **Export API logs** langsung dari menu API Logs:
    - JSON (semua logs)
    - CSV (berdasarkan hasil filter aktif)
15. **Observability filter pack** di API Logs:
    - filter tipe log (chip button)
    - filter status log (chip button)
    - pencarian keyword pada message/payload
    - counter hasil filter (`showing filtered/total`)
16. **Mini chart SLA per jam** (OTP sukses per jam + peak hour)
17. **Skeleton loading** dan animasi tombol halus
18. **API logs dipisah** dari monitor order
19. **Scrollbar visual disembunyikan** pada panel scroll
20. **GitHub-ready** (`.gitignore`, struktur rapi, dokumentasi)
21. **Compact one-page layout**: density diperkecil agar panel utama muat nyaman dalam satu layar desktop
   - urutan dashboard dioptimasi agar panel OTP/request lebih fokus di area utama
   - panel SLA diposisikan di bagian bawah dashboard
22. **Palette pack menarik**: Midnight Dark, Ocean Blue White, Google Colors (pilihan gelap, biru-putih, dan warna khas Google)
23. **Auto device adaptation**: layout otomatis menyesuaikan mobile/tablet/desktop (mobile scroll-friendly, desktop one-page compact)
24. **Notif error model toast popup**: pesan error muncul sebagai popup floating dan hilang otomatis dalam beberapa detik

---

## 3) Struktur Folder

```bash
.
├── app
│   ├── api
│   │   └── otp
│   │       ├── action/route.js
│   │       ├── balance/route.js
│   │       ├── check/route.js
│   │       ├── order/route.js
│   │       ├── retry/route.js
│   │       ├── services/route.js
│   │       └── status/route.js
│   ├── globals.css
│   ├── layout.js
│   └── page.js
├── components
│   └── OtpDashboard.jsx
├── lib
│   └── otpProvider.js
├── .env.example
├── .gitignore
├── jsconfig.json
├── next.config.js
├── package.json
├── postcss.config.js
└── tailwind.config.js
```

---

## 4) URI Fungsional Saat Ini

## Frontend

- `GET /`
  - Halaman utama OTP Uyeee Dashboard

## Backend API (internal app)

Semua endpoint menerima body JSON dengan `providerConfig` (opsional override), contoh minimal:

```json
{
  "providerConfig": {
    "baseUrl": "https://dehuyzotp.shop",
    "apiKey": "YOUR_API_KEY"
  }
}
```

1. `POST /api/otp/services`
   - Tujuan: test koneksi + ambil daftar layanan

2. `POST /api/otp/balance`
   - Tujuan: ambil saldo provider

3. `POST /api/otp/order`
   - Body:
   ```json
   {
     "serviceId": "1",
     "providerConfig": {
       "baseUrl": "https://dehuyzotp.shop",
       "apiKey": "YOUR_API_KEY"
     }
   }
   ```
   - Output utama: `order_id`, `token`, `number/phone`

4. `POST /api/otp/check`
   - Body:
   ```json
   {
     "token": "wh_rnt_xxx",
     "timeout": 60,
     "providerConfig": {
       "baseUrl": "https://dehuyzotp.shop",
       "apiKey": "YOUR_API_KEY"
     }
   }
   ```
   - Output utama: `status`, `otp_code`, `message`

5. `POST /api/otp/retry`
   - Body: `{ "token": "...", "providerConfig": {...} }`

6. `POST /api/otp/status`
   - Body: `{ "orderRef": "order_id_atau_token", "providerConfig": {...} }`
   - Dipakai untuk auto-sync status background di dashboard

7. `POST /api/otp/action`
   - Body:
   ```json
   {
     "orderRef": "order_id_atau_token",
     "action": "done",
     "providerConfig": {
       "baseUrl": "https://dehuyzotp.shop",
       "apiKey": "YOUR_API_KEY"
     }
   }
   ```

---

## 5) Data Model & Struktur State

### Active Order (frontend state)

```ts
{
  order_id: string | number | null,
  token: string | null,
  number: string | null,
  service_id: string | number,
  status: string,
  expires_at: number | null,
  ordered_at_ms: number | null
}
```

### History Item

```ts
{
  track_id: string,        // token || order_id
  order_id: string | number,
  token: string,
  number: string,
  service_id: string,
  status: string,
  otp_code: string | null,
  ordered_at_ms: number,
  received_at_ms: number | null,
  elapsed_ms: number | null,
  timestamp: string
}
```

### Storage Service yang Digunakan

- **Tidak ada database internal** pada versi ini
- Session data disimpan di state React (runtime browser)
- API key / preferensi UI disimpan di `localStorage`
- Data observability (filter/search log) disimpan di state client (tidak dipersist)

---

## 6) Konfigurasi Environment

Copy `.env.example` ke `.env.local`:

```bash
OTP_PROVIDER_BASE_URL=https://dehuyzotp.shop
OTP_PROVIDER_API_KEY=your_api_key
```

Jalankan:

```bash
npm install
npm run dev
```

Buka `http://localhost:3000`

---

## 7) Public URLs

- **Local Dev**: `http://localhost:3000`
- **Provider Docs Referensi**: `https://dehuyzotp.shop/api/docs`
- **Production Deploy OTP Uyeee**: belum diset di repositori ini (isi setelah deploy)

---

## 8) Fitur yang Belum Diimplementasikan

1. Persistensi riwayat order ke database (saat ini masih in-memory state)
2. E2E automated tests (Playwright/Cypress) dan unit test provider adapter
3. Multi-provider profile management (lebih dari satu base URL/API key)
4. Dashboard analytics lanjutan (chart tren SLA multi-range per hari/minggu)
5. Controls observability lanjutan (retention policy, live stream mode, alert threshold)
6. Preset layout density (compact/comfortable) yang bisa dipilih user

---

## 9) Rekomendasi Next Step

1. Tambah tabel persistence (order + logs) bila ingin data tidak hilang saat refresh
2. Tambah queue polling adaptif (`timeout` dinamis) untuk efisiensi API call
3. Tambah panel “Order Detail” berbasis endpoint `/api/otp/status`
4. Tambah retention policy untuk logs (mis. max 500/1000 + purge by age)
5. Visualkan metrik SLA lanjutan ke chart tren per service/periode
6. Tambah alert rule sederhana (mis. success rate service < threshold)
7. Tambah toggle density UI (compact/comfortable) untuk preferensi operator
8. Deploy ke production domain lalu update bagian **Public URLs** di README

---

## 10) Catatan Operasional

- Auth provider default: `Authorization: Bearer <API_KEY>`
- Jika provider mengembalikan HTML (bukan JSON), biasanya base URL/path endpoint tidak tepat
- Error saldo/API key/method mismatch sudah dinormalisasi ke pesan yang lebih jelas di UI/log
- Auto polling + auto sync akan pause otomatis saat tab browser tidak aktif
- API Logs mendukung filter type/status + search + export CSV hasil filter
