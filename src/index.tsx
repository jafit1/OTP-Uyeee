import { Hono } from 'hono'
import { getCookie, setCookie, deleteCookie } from 'hono/cookie'
import { renderer } from './renderer.js'
import { db, initDb } from './db.js'
import { hashPassword, comparePassword, createToken, verifyToken } from './auth.js'

// Inisialisasi Database saat booting
initDb().catch(console.error)

const PROVIDER_BASE_URL = 'https://dehuyzotp.shop'
const MASTER_API_KEY = process.env.PROVIDER_API_KEY || 'otpk_fbb504f27e0e357b6725dae255954934ac2d5e79bacdeb63' // Fallback / Master Key Admin

const DEFAULT_ENDPOINTS = {
  services: '/api/services',
  balance: '/api/balance',
  order: '/api/rent',
  check: '/api/sms/{token}',
  retry: '/api/rent/{token}/retry',
  status: '/api/order/{id}',
  action: '/api/order/{id}',
}

type Env = {
  Variables: {
    user: { id: string; email: string; role: string }
  }
}

const app = new Hono<Env>()
app.use(renderer)

function safePath(path: string) {
  if (!path.startsWith('/api/') || path.includes('..') || path.includes('://')) {
    throw new Error('Path endpoint tidak valid.')
  }
  return path
}

async function requestProvider(path: string, options: RequestInit = {}) {
  const headers = new Headers(options.headers)
  headers.set('Accept', 'application/json')
  if (options.method && !['GET', 'DELETE'].includes(options.method)) headers.set('Content-Type', 'application/json')
  headers.set('Authorization', `Bearer ${MASTER_API_KEY}`)

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 15000)
  try {
    const response = await fetch(`${PROVIDER_BASE_URL}${safePath(path)}`, { ...options, headers, signal: controller.signal })
    const text = await response.text()
    let data: unknown = text
    try { data = text ? JSON.parse(text) : {} } catch {}
    if (!response.ok) {
      const detail = typeof data === 'object' && data ? JSON.stringify(data).slice(0, 240) : text.slice(0, 240)
      throw new Error(`Provider error (${response.status}). ${detail}`)
    }
    return data as Record<string, unknown>
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw new Error('Provider timeout.')
    throw error
  } finally { clearTimeout(timeout) }
}

function apiError(error: unknown, status = 400) {
  return { success: false, error: error instanceof Error ? error.message : 'Terjadi kesalahan.', status }
}

// ── Middleware Autentikasi ──
async function authMiddleware(c: any, next: any) {
  const token = getCookie(c, 'auth_token')
  if (!token) return c.json({ success: false, error: 'Sesi berakhir, silakan login kembali.' }, 401)
  const user = await verifyToken(token)
  if (!user) return c.json({ success: false, error: 'Token tidak valid, silakan login kembali.' }, 401)
  c.set('user', user)
  await next()
}

// ── Auth Endpoints ──
app.post('/api/auth/register', async (c) => {
  try {
    const { email, password } = await c.req.json()
    if (!email || !password || password.length < 6) {
      return c.json({ success: false, error: 'Email valid & Password minimal 6 karakter wajib diisi.' }, 400)
    }

    const check = await db.execute({ sql: 'SELECT id FROM users WHERE email = ?', args: [email.toLowerCase().trim()] })
    if (check.rows.length > 0) {
      return c.json({ success: false, error: 'Email sudah terdaftar. Silakan login.' }, 400)
    }

    const id = 'usr_' + Math.random().toString(36).substring(2, 10)
    const password_hash = await hashPassword(password)
    
    await db.execute({
      sql: 'INSERT INTO users (id, email, password_hash, balance) VALUES (?, ?, ?, 0)',
      args: [id, email.toLowerCase().trim(), password_hash]
    })

    const token = await createToken({ id, email: email.toLowerCase().trim(), role: 'user' }, true)
    setCookie(c, 'auth_token', token, { path: '/', httpOnly: true, maxAge: 30 * 24 * 3600, sameSite: 'Lax' })

    return c.json({ success: true, user: { id, email, balance: 0 } })
  } catch (error) { const result = apiError(error); return c.json(result, result.status as 400) }
})

app.post('/api/auth/login', async (c) => {
  try {
    const { email, password, rememberMe } = await c.req.json()
    if (!email || !password) return c.json({ success: false, error: 'Email dan password wajib diisi.' }, 400)

    const res = await db.execute({ sql: 'SELECT * FROM users WHERE email = ?', args: [email.toLowerCase().trim()] })
    if (res.rows.length === 0) return c.json({ success: false, error: 'Email atau password salah.' }, 400)

    const user = res.rows[0] as any
    const valid = await comparePassword(password, user.password_hash)
    if (!valid) return c.json({ success: false, error: 'Email atau password salah.' }, 400)

    const token = await createToken({ id: user.id, email: user.email, role: user.role }, !!rememberMe)
    setCookie(c, 'auth_token', token, {
      path: '/',
      httpOnly: true,
      maxAge: rememberMe ? 30 * 24 * 3600 : 24 * 3600,
      sameSite: 'Lax'
    })

    return c.json({ success: true, user: { id: user.id, email: user.email, balance: user.balance } })
  } catch (error) { const result = apiError(error); return c.json(result, result.status as 400) }
})

app.get('/api/auth/me', authMiddleware, async (c) => {
  try {
    const u = c.get('user')
    const res = await db.execute({ sql: 'SELECT id, email, balance, role FROM users WHERE id = ?', args: [u.id] })
    if (res.rows.length === 0) return c.json({ success: false, error: 'User tidak ditemukan.' }, 404)
    const user = res.rows[0]
    return c.json({ success: true, user })
  } catch (error) { const result = apiError(error); return c.json(result, result.status as 400) }
})

app.post('/api/auth/logout', async (c) => {
  deleteCookie(c, 'auth_token')
  return c.json({ success: true })
})

// ── OTP Services Endpoints (Memakai Saldo DB User) ──
app.get('/api/otp/services', async (c) => {
  try {
    const raw = await requestProvider(DEFAULT_ENDPOINTS.services, { method: 'GET' })
    const items = Array.isArray(raw) ? raw : Array.isArray(raw.services) ? raw.services : Array.isArray(raw.data) ? raw.data : []
    const services = items.map((item: any, index) => ({
      id: String(item?.id ?? item?.service_id ?? item?.code ?? index + 1),
      name: String(item?.name ?? item?.service_name ?? item?.service ?? `Layanan ${index + 1}`),
      price: Number(item?.price || item?.harga || item?.rate || 0),
      count: Number(item?.count || item?.stok || item?.stock || 0),
    }))
    return c.json({ success: true, services })
  } catch (error) { const result = apiError(error); return c.json(result, result.status as 400) }
})

app.post('/api/otp/order', authMiddleware, async (c) => {
  try {
    const user = c.get('user')
    const body = await c.req.json<{ serviceId?: string; price?: number }>()
    if (!body.serviceId) return c.json({ success: false, error: 'Pilih layanan.' }, 400)

    // Cek saldo user di database
    const uRes = await db.execute({ sql: 'SELECT balance FROM users WHERE id = ?', args: [user.id] })
    const currentBalance = Number(uRes.rows[0]?.balance || 0)
    const price = Number(body.price || 0)

    if (currentBalance < price) {
      return c.json({ success: false, error: `Saldo tidak mencukupi (Butuh Rp ${price.toLocaleString('id-ID')}, Saldo Anda Rp ${currentBalance.toLocaleString('id-ID')}). Silakan deposit terlebih dahulu.` }, 400)
    }

    const service_id = isNaN(Number(body.serviceId)) ? body.serviceId : Number(body.serviceId)
    const raw = await requestProvider(DEFAULT_ENDPOINTS.order, {
      method: 'POST',
      body: JSON.stringify({ service_id, service: service_id })
    })
    const token = String(raw.token || raw.id || '')
    const number = String(raw.phone || raw.number || '')
    if (!token || !number) throw new Error(String(raw.message || raw.error || 'Respons provider tidak lengkap.'))

    // Potong Saldo User & Catat Transaksi
    if (price > 0) {
      await db.execute({ sql: 'UPDATE users SET balance = balance - ? WHERE id = ?', args: [price, user.id] })
      await db.execute({
        sql: 'INSERT INTO transactions (id, user_id, amount, type, status, reference) VALUES (?, ?, ?, ?, ?, ?)',
        args: ['tx_' + Math.random().toString(36).substring(2, 10), user.id, -price, 'ORDER', 'SUCCESS', token]
      })
    }

    return c.json({ success: true, token, order_id: raw.order_id || token, number, service_id: body.serviceId, status: 'WAITING', expires_at: raw.expires_at || null })
  } catch (error) { const result = apiError(error); return c.json(result, result.status as 400) }
})

app.post('/api/otp/check', authMiddleware, async (c) => {
  try {
    const body = await c.req.json<{ token?: string }>()
    if (!body.token) return c.json({ success: false, error: 'Token tidak ditemukan.' }, 400)
    const path = DEFAULT_ENDPOINTS.check.replace('{token}', encodeURIComponent(body.token))
    const raw = await requestProvider(path, { method: 'GET' })
    const otp = raw.otp ? String(raw.otp) : null
    const state = String(raw.state || '').toLowerCase()
    const status = otp || ['success', 'received', 'done'].includes(state) ? 'RECEIVED' : ['cancel', 'cancelled', 'failed', 'expired'].includes(state) ? 'FAILED' : 'WAITING'
    return c.json({ success: true, status, otp_code: otp, message: raw.message || (otp ? 'Kode diterima.' : 'Menunggu OTP.') })
  } catch (error) { const result = apiError(error); return c.json(result, result.status as 400) }
})

app.post('/api/otp/action', authMiddleware, async (c) => {
  try {
    const user = c.get('user')
    const body = await c.req.json<{ orderRef?: string; action?: string; price?: number }>()
    if (!body.orderRef || !['done', 'cancel'].includes(String(body.action))) return c.json({ success: false, error: 'Order/aksi tidak valid.' }, 400)
    const path = DEFAULT_ENDPOINTS.action.replace('{id}', encodeURIComponent(body.orderRef))
    const raw = await requestProvider(path, { method: 'POST', body: JSON.stringify({ action: body.action }) })

    // Refund Saldo jika Cancel
    if (body.action === 'cancel' && body.price) {
      const price = Number(body.price)
      await db.execute({ sql: 'UPDATE users SET balance = balance + ? WHERE id = ?', args: [price, user.id] })
      await db.execute({
        sql: 'INSERT INTO transactions (id, user_id, amount, type, status, reference) VALUES (?, ?, ?, ?, ?, ?)',
        args: ['tx_' + Math.random().toString(36).substring(2, 10), user.id, price, 'REFUND', 'SUCCESS', body.orderRef]
      })
    }

    return c.json({ success: true, action: body.action, refunded: Number(raw.refunded || 0) })
  } catch (error) { const result = apiError(error); return c.json(result, result.status as 400) }
})

// ── Deposit QRIS Menggunakan TokoPay ──
import { generateTokopaySignature } from './tokopay.js'

const TOKOPAY_MERCHANT_ID = process.env.TOKOPAY_MERCHANT_ID || ''
const TOKOPAY_SECRET_KEY = process.env.TOKOPAY_SECRET_KEY || ''

app.post('/api/deposit/create', authMiddleware, async (c) => {
  try {
    const user = c.get('user')
    const { amount } = await c.req.json()
    const baseAmount = Number(amount)
    
    // TokoPay minimum transaksi biasanya Rp 1.000 atau Rp 5.000 (tergantung metode)
    if (isNaN(baseAmount) || baseAmount < 5000) {
      return c.json({ success: false, error: 'Minimal deposit Rp 5.000' }, 400)
    }

    if (!TOKOPAY_MERCHANT_ID || !TOKOPAY_SECRET_KEY) {
      return c.json({ success: false, error: 'Sistem TokoPay belum dikonfigurasi oleh Admin.' }, 500)
    }

    const txId = 'dep_' + Math.random().toString(36).substring(2, 12)
    const signature = generateTokopaySignature(TOKOPAY_MERCHANT_ID, TOKOPAY_SECRET_KEY, txId)

    // Request ke API TokoPay untuk membuat QRIS
    const reqBody = {
      merchant_id: TOKOPAY_MERCHANT_ID,
      kode_channel: 'QRIS',
      reff_id: txId,
      amount: baseAmount,
      customer_name: user.email.split('@')[0],
      customer_email: user.email,
      customer_phone: '081234567890',
      redirect_url: 'https://otp-uyeee.vercel.app',
      expired_time: 15, // 15 menit
      signature: signature
    }

    const res = await fetch('https://api.tokopay.id/v1/order', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(reqBody)
    })
    
    const data = await res.json()
    
    if (data.status !== 'Success' && data.status !== 'Sukses' && data.status !== 'success' && data.status !== true) {
      throw new Error(data.error_msg || data.message || 'Gagal membuat QRIS TokoPay')
    }

    const totalPay = data.data.total_bayar || baseAmount
    const qrUrl = data.data.qr_link || data.data.qr_url || data.data.checkout_url || data.data.pay_url

    // Simpan pending transaksi
    await db.execute({
      sql: 'INSERT INTO transactions (id, user_id, amount, type, status, reference) VALUES (?, ?, ?, ?, ?, ?)',
      args: [txId, user.id, totalPay, 'DEPOSIT', 'PENDING', qrUrl]
    })

    return c.json({
      success: true,
      deposit: {
        id: txId,
        base_amount: baseAmount,
        total_pay: totalPay,
        qr_image: qrUrl,
        checkout_url: data.data.checkout_url || qrUrl,
        note: `Silakan scan QRIS di atas melalui DANA/OVO/Gopay/BCA. Saldo akan otomatis bertambah setelah pembayaran berhasil.`
      }
    })
  } catch (error) { const result = apiError(error); return c.json(result, result.status as 400) }
})

// ── Webhook Callback dari TokoPay ──
app.post('/api/deposit/webhook', async (c) => {
  try {
    const body = await c.req.json()
    // Contoh payload TokoPay: { status: 'Success', reff_id: 'dep_xxx', amount: 10000, signature: 'xxx' }
    
    const txId = body.reff_id || body.ref_id
    const status = (body.status || '').toLowerCase()
    
    if (status === 'success' || status === 'dibayar' || status === 'paid') {
      // Cari transaksi
      const resTx = await db.execute({ sql: 'SELECT * FROM transactions WHERE id = ? AND status = ?', args: [txId, 'PENDING'] })
      if (resTx.rows.length === 0) {
        return c.json({ success: true, message: 'Transaction already processed or not found' })
      }
      
      const tx = resTx.rows[0] as any
      const amount = Number(tx.amount)
      
      // Update transaksi jadi SUCCESS
      await db.execute({ sql: 'UPDATE transactions SET status = ? WHERE id = ?', args: ['SUCCESS', txId] })
      
      // Tambahkan saldo user
      await db.execute({ sql: 'UPDATE users SET balance = balance + ? WHERE id = ?', args: [amount, tx.user_id] })
      
      return c.json({ success: true, message: 'Deposit successful' })
    }
    
    return c.json({ success: true, message: 'Status not success, ignored' })
  } catch (error) { 
    return c.json({ success: false, error: 'Internal server error' }, 500) 
  }
})

// ── Shopee Checker APIs ──
const SHOPEE_PROXY_URL = process.env.SHOPEE_PROXY_URL || ''
const TELEGRAM_CHECKER_URL = process.env.TELEGRAM_CHECKER_URL || ''

function shopeeHeaders() {
  return {
    'Accept': 'application/json, text/plain, */*',
    'Content-Type': 'application/json',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    'X-Shopee-Language': 'id',
    'X-API-Source': 'pc',
    'Referer': 'https://shopee.co.id/buyer/login',
    'Origin': 'https://shopee.co.id',
    'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7',
  }
}

async function shopeeCheckDirect(national: string, intl: string) {
  const headers = shopeeHeaders()
  try {
    const res = await fetch('https://shopee.co.id/api/v4/account/check_phone_number_registered', {
      method: 'POST', headers, body: JSON.stringify({ phone: national })
    })
    if (res.ok) {
      const data = await res.json()
      if (data && typeof data.error === 'number') {
        const isReg = data.error === 0 || data.data?.is_registered === true
        return { registered: isReg, available: !isReg, status_text: isReg ? 'TERDAFTAR' : 'BELUM TERDAFTAR', detail: 'Direct API v4' }
      }
    }
  } catch {}
  return null
}

app.post('/api/shopee/check', async (c) => {
  try {
    const body = await c.req.json<{ phone?: string }>()
    const raw = String(body.phone || '').trim().replace(/[^0-9]/g, '')
    if (!raw || raw.length < 8) return c.json({ success: false, error: 'Nomor telepon tidak valid.' }, 400)
    let national = raw
    if (national.startsWith('62')) national = '0' + national.slice(2)
    const intl = national.startsWith('0') ? '62' + national.slice(1) : national

    if (TELEGRAM_CHECKER_URL) {
      try {
        const res = await fetch(`${TELEGRAM_CHECKER_URL.replace(/\/$/, '')}/check`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone: national })
        })
        if (res.ok) {
          const data = await res.json()
          return c.json({ success: true, phone: national, registered: data.registered, available: data.available, status_text: data.status_text, detail: `Telegram Bot (${data.detail || ''})` })
        }
      } catch {}
    }

    const direct = await shopeeCheckDirect(national, intl)
    if (direct) return c.json({ success: true, phone: national, ...direct })

    return c.json({ success: false, error: 'Layanan Shopee Checker sedang tidak dapat diakses.' }, 500)
  } catch (error) { const result = apiError(error); return c.json(result, result.status as 400) }
})

// ── HTML RENDERER UI DENGAN MODAL LOGIN/REGISTER ──
app.get('*', (c) => {
  return c.html(`
<!DOCTYPE html>
<html lang="id" data-theme="system">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>OTP Uyeee — Platform Verifikasi Kode OTP Instan</title>
  <link rel="stylesheet" href="/static/style.css" />
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
</head>
<body>
  <div id="app" class="app-shell">
    <aside class="sidebar" aria-label="Navigasi utama">
      <a class="brand" href="#dashboard" aria-label="OTP Uyeee Dashboard"><span class="brand-mark">O</span><span class="brand-name">OTP Uyeee</span></a>
      <nav class="nav-list">
        <button class="nav-link is-active" data-icon="⌂" data-tooltip="Ringkasan" aria-label="Ringkasan" data-view="dashboard"><span class="nav-label">Ringkasan</span></button>
        <button class="nav-link" data-icon="🔍" data-tooltip="Shopee Checker" aria-label="Shopee Checker" data-view="checker"><span class="nav-label">Shopee Checker</span></button>
        <button class="nav-link" data-icon="◷" data-tooltip="Aktivitas" aria-label="Aktivitas" data-view="activity"><span class="nav-label">Aktivitas</span></button>
        <button class="nav-link" data-icon="⚙" data-tooltip="Pengaturan" aria-label="Pengaturan" data-view="settings"><span class="nav-label">Pengaturan</span></button>
      </nav>
      <div class="sidebar-footer"><span class="live-dot"></span> Sistem Siap</div>
    </aside>
    <section class="workspace">
      <header class="topbar">
        <div><p class="eyebrow">PUSAT VERIFIKASI</p><h1 id="page-title">Ringkasan aktivitas</h1></div>
        <div class="topbar-actions">
          <div id="user-profile-badge" style="display:none; align-items:center; gap:8px;">
            <span id="user-email-display" class="status-pill" style="font-weight:700;">user@example.com</span>
            <button id="logout-btn" class="icon-button" type="button" title="Keluar Akun">🚪</button>
          </div>
          <button id="theme-toggle" class="icon-button" type="button" aria-label="Ganti tema">☾</button>
        </div>
      </header>
      
      <div id="notification-modal" class="notification-modal" role="presentation" hidden><section class="notification-card"><span id="notification-icon" class="notification-icon">!</span><p id="notification-text" class="notification-text"></p><button id="notification-close" class="notification-close" type="button" aria-label="Tutup">×</button></section></div>
      <div id="confirm-overlay" class="confirm-overlay" hidden><div class="confirm-box"><h3 id="confirm-title">Konfirmasi</h3><p id="confirm-text"></p><div class="confirm-actions"><button id="confirm-cancel" class="confirm-cancel" type="button">Batal</button><button id="confirm-ok" class="confirm-ok" type="button">Ya, Batalkan</button></div></div></div>
      
      <!-- AUTH MODAL / OVERLAY (LOGIN & REGISTER) -->
      <div id="auth-modal" class="confirm-overlay" style="z-index:99999; background: var(--bg); backdrop-filter: none; opacity: 1;">
        <div class="confirm-box" style="max-width:380px; box-shadow: 0 20px 40px rgba(0,0,0,0.3); border: 1px solid var(--brand);">
          <h3 id="auth-form-title">Masuk ke OTP Uyeee</h3>
          <p id="auth-form-desc" class="muted" style="margin-bottom:15px; font-size:12px;">Masukkan email & password akun Anda untuk melanjutkan.</p>
          
          <div id="auth-fields">
            <label class="field-label" style="margin-top:0;">Email</label>
            <input id="auth-email" type="email" placeholder="nama@email.com" autocomplete="email" style="margin-bottom:10px;" />
            
            <label class="field-label" style="margin-top:0;">Password</label>
            <input id="auth-password" type="password" placeholder="Minimal 6 karakter" autocomplete="current-password" style="margin-bottom:12px;" />
            
            <label id="remember-me-label" class="field-label" style="display:flex; align-items:center; gap:8px; cursor:pointer; margin-top:0; margin-bottom:15px;">
              <input id="auth-remember" type="checkbox" checked style="width:auto;" />
              <span>Ingat Saya (30 Hari)</span>
            </label>
          </div>
          
          <div class="confirm-actions" style="flex-direction:column; gap:8px;">
            <button id="auth-submit-btn" class="button button-primary" type="button" style="margin:0;">Masuk Sekarang</button>
            <button id="auth-switch-btn" class="button button-quiet" type="button" style="margin:0; font-size:11px;">Belum punya akun? Daftar disini</button>
          </div>
        </div>
      </div>

      <!-- DEPOSIT QRIS OTOMATIS MODAL -->
      <div id="deposit-modal" class="confirm-overlay" hidden>
        <div class="confirm-box" style="max-width:400px;">
          <h3>Isi Saldo (QRIS Otomatis)</h3>
          <p class="muted" style="margin-bottom:15px; font-size:12px;">Saldo akan otomatis masuk ke akun Anda detik itu juga setelah Anda menyelesaikan pembayaran via DANA/Gopay/OVO/ShopeePay/M-Banking.</p>
          
          <div id="deposit-form-step">
            <label class="field-label" style="margin-top:0;">Nominal Isi Saldo (Rp)</label>
            <input id="deposit-amount-input" type="number" placeholder="Minimal 5000" style="margin-bottom:15px;" />
            <div class="confirm-actions">
              <button id="deposit-close-btn" class="confirm-cancel" type="button">Batal</button>
              <button id="deposit-create-btn" class="button button-primary" type="button" style="margin:0;">Buat Kode QRIS</button>
            </div>
          </div>

          <div id="deposit-qr-step" hidden>
            <div style="background:#fff; padding:15px; border-radius:10px; text-align:center; margin-bottom:15px;">
              <img id="deposit-qr-img" src="" alt="QRIS" style="width:100%; max-width:220px; margin:0 auto; border-radius:8px; display:block;" />
              <p style="margin-top:10px; font-size:11px; color:#162033; font-weight:700;">QRIS TOKOPAY / ALL PAYMENT</p>
            </div>
            
            <div style="background:var(--surface-soft); padding:12px; border-radius:8px; font-size:12px; margin-bottom:15px;">
              <div style="display:flex; justify-content:space-between; font-size:14px; font-weight:800;"><span>TOTAL DIBAYAR:</span><strong id="dep-total-val" style="color:var(--success);">Rp 0</strong></div>
            </div>

            <p id="deposit-note-text" style="font-size:11px; color:var(--waiting); margin-bottom:15px; font-weight:600; text-align:center;"></p>
            <div class="confirm-actions">
              <a id="deposit-checkout-link" href="#" target="_blank" class="button button-primary" style="margin:0; text-align:center; text-decoration:none;">Buka Halaman Pembayaran</a>
              <button id="deposit-done-btn" class="button button-quiet" type="button" style="margin:0;">Tutup</button>
            </div>
          </div>
        </div>
      </div>

      <!-- DASHBOARD VIEW -->
      <section id="dashboard-view" class="view-panel">
        <section class="metrics" aria-label="Statistik order">
          <article class="metric-card"><span>Total order</span><strong id="metric-total">0</strong><small>Dalam sesi ini</small></article>
          <article class="metric-card"><span>Berhasil</span><strong id="metric-success">0</strong><small>Kode telah diterima</small></article>
          <article class="metric-card"><span>Menunggu</span><strong id="metric-waiting">0</strong><small>Perlu ditindaklanjuti</small></article>
        </section>

        <div class="content-grid">
          <section class="panel order-panel">
            <div class="panel-heading">
              <div><p class="eyebrow">ORDER LAYANAN</p><h2>Pilih Layanan</h2></div>
              <div style="display:flex; align-items:center; gap:8px;">
                <div id="balance-box" class="balance-box-pill"><span>Saldo:</span> <strong id="balance-value">Rp 0</strong></div>
                <button id="deposit-btn" class="button button-primary" style="margin:0; padding:4px 10px; font-size:11px; min-height:28px; width:auto;">+ Deposit</button>
              </div>
            </div>
            <p class="muted">Pilih aplikasi/layanan yang ingin Anda dapatkan nomor OTP-nya.</p>
            <div id="order-form-container">
              <label class="field-label" for="service-search">Daftar Layanan Tersedia</label>
              <div id="service-dropdown" class="custom-select">
                <input id="service-select" type="hidden" disabled />
                <input id="service-search" class="select-trigger" type="text" placeholder="Ketik untuk cari layanan..." disabled autocomplete="off" data-lpignore="true" data-1p-ignore="true" />
                <div id="service-options" class="select-options" role="listbox" hidden></div>
              </div>
              <div class="order-qty-row">
                <div class="qty-input-wrap">
                  <button id="qty-minus" class="qty-btn" type="button">-</button>
                  <input id="order-qty" type="number" min="1" max="20" value="1" readonly />
                  <button id="qty-plus" class="qty-btn" type="button">+</button>
                </div>
                <button id="order-button" class="button button-primary" type="button" style="margin-top:0;" disabled>Minta Nomor Baru</button>
              </div>
            </div>
          </section>

          <section class="panel active-order-panel">
            <div class="panel-heading">
              <div><p class="eyebrow">MONITOR OTP</p><h2>Status & Kode OTP</h2></div>
              <button id="check-all-button" class="text-button" type="button" style="display:none; font-size:12px;">🔄 Cek Semua</button>
            </div>
            <div id="active-order-box" class="active-order-box">
              <div id="no-order-placeholder" class="placeholder-state">
                <span class="placeholder-icon">📱</span>
                <p>Belum ada order aktif. Silakan pilih layanan di sebelah kiri untuk meminta nomor.</p>
              </div>
              <div id="orders-grid" class="orders-grid"></div>
            </div>
          </section>
        </div>
      </section>

      <!-- CHECKER VIEW -->
      <section id="checker-view" class="view-panel" hidden>
        <div class="content-grid">
          <section class="panel">
            <div class="panel-heading"><div><p class="eyebrow">CEK NOMOR MANUAL</p><h2>Shopee Registration Checker</h2></div></div>
            <p class="muted">Periksa apakah nomor HP sudah terdaftar di Shopee sebelum membuat order OTP.</p>
            <label class="field-label" for="check-phone-input">Nomor Telepon (Cek Manual)</label>
            <div class="input-row">
              <input id="check-phone-input" type="text" placeholder="Contoh: 08123456789 atau 628123456789" autocomplete="off" data-lpignore="true" data-1p-ignore="true" />
              <button id="run-check-button" class="button button-primary" type="button" style="margin-top:0; width:auto; min-width:110px;">Cek Nomor</button>
            </div>
            <div style="margin-top:20px; padding-top:15px; border-top:1px solid var(--line);">
              <label class="field-label" style="display:flex; align-items:center; gap:8px; cursor:pointer;">
                <input id="auto-cancel-registered" type="checkbox" checked style="width:auto;" />
                <span>Otomatis Batalkan Order OTP jika Nomor Terdaftar Shopee</span>
              </label>
            </div>
          </section>
          <section class="panel">
            <div class="panel-heading"><div><p class="eyebrow">HASIL PENGECEKAN</p><h2>Detail Status Nomor</h2></div></div>
            <div id="checker-result-box" class="placeholder-state">
              <span class="placeholder-icon">🔎</span>
              <p>Masukkan nomor HP dan klik 'Cek Nomor' untuk melihat status pendaftaran di Shopee.</p>
            </div>
          </section>
        </div>
      </section>

      <!-- ACTIVITY VIEW -->
      <section id="activity-view" class="view-panel" hidden>
        <section class="panel">
          <div class="panel-heading"><div><p class="eyebrow">RIWAYAT SESI</p><h2>Aktivitas terbaru</h2></div><button id="clear-history" class="text-button" type="button">Bersihkan</button></div>
          <div class="table-wrap"><table><thead><tr><th>Waktu</th><th>Layanan</th><th>Nomor</th><th>Status</th></tr></thead><tbody id="history-body"><tr><td colspan="4" class="empty-state">Belum ada aktivitas.</td></tr></tbody></table></div>
        </section>
      </section>

      <!-- SETTINGS VIEW -->
      <section id="settings-view" class="view-panel" hidden>
        <section class="panel settings-card">
          <p class="eyebrow">PREFERENSI TAMPILAN</p><h2>Tema Aplikasi</h2>
          <p class="muted">Pilih tema visual yang Anda sukai. Preferensi disimpan secara otomatis.</p>
          <div class="theme-options">
            <button class="theme-choice" data-theme-choice="light" type="button">☀ Terang</button>
            <button class="theme-choice" data-theme-choice="dark" type="button">☾ Gelap</button>
            <button class="theme-choice" data-theme-choice="system" type="button">◐ Ikuti sistem</button>
            <button class="theme-choice" data-theme-choice="google" type="button">G Google</button>
            <button class="theme-choice" data-theme-choice="ocean" type="button">◈ Ocean</button>
            <button class="theme-choice" data-theme-choice="forest" type="button">♣ Forest</button>
            <button class="theme-choice" data-theme-choice="sunset" type="button">☼ Sunset</button>
            <button class="theme-choice" data-theme-choice="midnight" type="button">✦ Midnight</button>
          </div>
        </section>
      </section>
    </section>
  </div>
  <script src="/static/app.js" defer></script>
</body>
</html>
  `)
})

export default app
