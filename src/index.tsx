import { Hono } from 'hono'
import { renderer } from './renderer.js'

type ProviderConfig = {
  apiKey?: string
  authMode?: 'bearer' | 'x-api-key'
  apiKeyHeader?: string
}

const PROVIDER_BASE_URL = 'https://dehuyzotp.shop'
const DEFAULT_ENDPOINTS = {
  services: '/api/services',
  balance: '/api/balance',
  order: '/api/rent',
  check: '/api/sms/{token}',
  retry: '/api/rent/{token}/retry',
  status: '/api/order/{id}',
  action: '/api/order/{id}',
}

const app = new Hono()
app.use(renderer)

function safePath(path: string) {
  if (!path.startsWith('/api/') || path.includes('..') || path.includes('://')) {
    throw new Error('Path endpoint tidak valid.')
  }
  return path
}

function providerConfig(input: ProviderConfig = {}) {
  const apiKey = String(input.apiKey || '').trim()
  if (!apiKey) throw new Error('API key wajib diisi.')
  return {
    apiKey,
    authMode: input.authMode === 'x-api-key' ? 'x-api-key' : 'bearer',
    apiKeyHeader: String(input.apiKeyHeader || 'x-api-key').replace(/[^a-zA-Z0-9-]/g, '') || 'x-api-key',
  }
}

async function requestProvider(config: ReturnType<typeof providerConfig>, path: string, options: RequestInit = {}) {
  const headers = new Headers(options.headers)
  headers.set('Accept', 'application/json')
  if (options.method && !['GET', 'DELETE'].includes(options.method)) headers.set('Content-Type', 'application/json')
  if (config.authMode === 'x-api-key') headers.set(config.apiKeyHeader, config.apiKey)
  else headers.set('Authorization', `Bearer ${config.apiKey}`)
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 15000)
  try {
    const response = await fetch(`${PROVIDER_BASE_URL}${safePath(path)}`, { ...options, headers, signal: controller.signal })
    const text = await response.text()
    let data: unknown = text
    try { data = text ? JSON.parse(text) : {} } catch {}
    if (!response.ok) {
      const detail = typeof data === 'object' && data ? JSON.stringify(data).slice(0, 240) : text.slice(0, 240)
      throw new Error(response.status === 401 || response.status === 403 ? 'API key tidak valid.' : `Provider error (${response.status}). ${detail}`)
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

app.post('/api/otp/services', async (c) => {
  try {
    const body = await c.req.json<{ providerConfig?: ProviderConfig }>()
    const raw = await requestProvider(providerConfig(body.providerConfig), DEFAULT_ENDPOINTS.services, { method: 'GET' })
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

app.post('/api/otp/balance', async (c) => {
  try {
    const body = await c.req.json<{ providerConfig?: ProviderConfig }>()
    const raw = await requestProvider(providerConfig(body.providerConfig), DEFAULT_ENDPOINTS.balance, { method: 'GET' })
    const balance = Number(raw.balance ?? 0)
    const reserved = Number(raw.reserved ?? 0)
    return c.json({ success: true, balance, reserved, available: Number(raw.available ?? balance - reserved) })
  } catch (error) { const result = apiError(error); return c.json(result, result.status as 400) }
})

app.post('/api/otp/order', async (c) => {
  try {
    const body = await c.req.json<{ providerConfig?: ProviderConfig; serviceId?: string }>()
    if (!body.serviceId) return c.json({ success: false, error: 'Pilih layanan.' }, 400)
    const service_id = isNaN(Number(body.serviceId)) ? body.serviceId : Number(body.serviceId)
    const raw = await requestProvider(providerConfig(body.providerConfig), DEFAULT_ENDPOINTS.order, {
      method: 'POST',
      body: JSON.stringify({ service_id, service: service_id })
    })
    const token = String(raw.token || raw.id || '')
    const number = String(raw.phone || raw.number || '')
    if (!token || !number) throw new Error(String(raw.message || raw.error || 'Respons tidak lengkap.'))
    return c.json({ success: true, token, order_id: raw.order_id || token, number, service_id: body.serviceId, status: 'WAITING', expires_at: raw.expires_at || null })
  } catch (error) { const result = apiError(error); return c.json(result, result.status as 400) }
})

app.post('/api/otp/check', async (c) => {
  try {
    const body = await c.req.json<{ providerConfig?: ProviderConfig; token?: string }>()
    if (!body.token) return c.json({ success: false, error: 'Token tidak ditemukan.' }, 400)
    const path = DEFAULT_ENDPOINTS.check.replace('{token}', encodeURIComponent(body.token))
    const raw = await requestProvider(providerConfig(body.providerConfig), path, { method: 'GET' })
    const otp = raw.otp ? String(raw.otp) : null
    const state = String(raw.state || '').toLowerCase()
    const status = otp || ['success', 'received', 'done'].includes(state) ? 'RECEIVED' : ['cancel', 'cancelled', 'failed', 'expired'].includes(state) ? 'FAILED' : 'WAITING'
    return c.json({ success: true, status, otp_code: otp, message: raw.message || (otp ? 'Kode diterima.' : 'Menunggu OTP.') })
  } catch (error) { const result = apiError(error); return c.json(result, result.status as 400) }
})

app.post('/api/otp/action', async (c) => {
  try {
    const body = await c.req.json<{ providerConfig?: ProviderConfig; orderRef?: string; action?: string }>()
    if (!body.orderRef || !['done', 'cancel'].includes(String(body.action))) return c.json({ success: false, error: 'Order/aksi tidak valid.' }, 400)
    const path = DEFAULT_ENDPOINTS.action.replace('{id}', encodeURIComponent(body.orderRef))
    const raw = await requestProvider(providerConfig(body.providerConfig), path, { method: 'POST', body: JSON.stringify({ action: body.action }) })
    return c.json({ success: true, action: body.action, refunded: Number(raw.refunded || 0) })
  } catch (error) { const result = apiError(error); return c.json(result, result.status as 400) }
})

// Cloudflare Worker proxy URL (set di Vercel env: SHOPEE_PROXY_URL)
// Contoh: https://shopee-proxy.username.workers.dev
const SHOPEE_PROXY_URL = process.env.SHOPEE_PROXY_URL || ''

// Telegram Bot Checker API URL (set di Vercel env: TELEGRAM_CHECKER_URL)
// Contoh: https://your-domain.com (via Cloudflare Tunnel)
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
  // Strategy 1: check_phone_number_registered
  try {
    const res = await fetch('https://shopee.co.id/api/v4/account/check_phone_number_registered', {
      method: 'POST', headers,
      body: JSON.stringify({ phone_number: intl }),
    })
    const t = await res.text()
    let d: any = {}; try { d = JSON.parse(t) } catch {}
    if (d && d.error !== 'error_not_found' && d.error !== undefined) {
      return { registered: d?.data?.is_registered === true, available: d?.data?.is_registered === false && d.error === 0, raw: d, source: 'check_phone' }
    }
  } catch {}

  // Strategy 2: request_otp (check without sending - only if proxy available, skip direct)
  // Strategy 3: get_account_info_by_phone
  try {
    const res = await fetch('https://shopee.co.id/api/v4/account/basic/get_account_info_by_phone', {
      method: 'POST', headers,
      body: JSON.stringify({ phone: national, phone_number: intl }),
    })
    const t = await res.text()
    let d: any = {}; try { d = JSON.parse(t) } catch {}
    if (d && d.error !== 'error_not_found') {
      const isReg = d.data?.userid > 0 || d.data?.user_id > 0 || d.data?.is_registered === true || d.data?.username
      return { registered: !!isReg, available: !isReg && d.error === 0, raw: d, source: 'get_account_info' }
    }
  } catch {}

  // Strategy 4: wallet transfer lookup
  try {
    const res = await fetch('https://shopee.co.id/api/v4/wallet/transfer/check_user_by_phone', {
      method: 'POST', headers,
      body: JSON.stringify({ phone: national }),
    })
    const t = await res.text()
    let d: any = {}; try { d = JSON.parse(t) } catch {}
    if (d && d.error !== 'error_not_found') {
      const isReg = d.data?.userid > 0 || d.data?.user_id > 0 || d.data?.is_registered === true
      return { registered: !!isReg, available: !isReg && d.error === 0, raw: d, source: 'wallet_check' }
    }
  } catch {}

  return null
}

app.post('/api/shopee/check', async (c) => {
  try {
    const body = await c.req.json<{ phone?: string }>()
    let rawPhone = String(body.phone || '').trim().replace(/[^0-9]/g, '')
    if (!rawPhone) return c.json({ success: false, error: 'Nomor telepon tidak boleh kosong.' }, 400)

    let national = rawPhone
    if (national.startsWith('62')) national = '0' + national.slice(2)

    let intl = rawPhone
    if (intl.startsWith('0')) intl = '62' + intl.slice(1)
    if (!intl.startsWith('62')) intl = '62' + intl

    // Strategy 1: Telegram Bot Checker (paling akurat, bypass semua anti-bot)
    if (TELEGRAM_CHECKER_URL) {
      try {
        const tgRes = await fetch(`${TELEGRAM_CHECKER_URL}/check`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phone: national }),
          signal: AbortSignal.timeout(35000),
        })
        if (tgRes.ok) {
          const tgData = await tgRes.json() as any
          if (tgData?.success) {
            return c.json({
              success: true,
              phone: tgData.phone || intl,
              registered: tgData.registered,
              available: tgData.available,
              status_text: tgData.status_text,
              detail: tgData.detail || '',
              source: 'telegram_bot',
              raw: tgData.raw,
            })
          }
        }
      } catch {}
    }

    // Strategy 2: Try Cloudflare Worker proxy (IP CDN tidak diblokir Shopee)
    if (SHOPEE_PROXY_URL) {
      try {
        const proxyRes = await fetch(SHOPEE_PROXY_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phone: national }),
          signal: AbortSignal.timeout(10000),
        })
        if (proxyRes.ok) {
          const proxyData = await proxyRes.json() as any
          if (proxyData?.success && proxyData?.source !== 'all_failed') {
            return c.json(proxyData)
          }
        }
      } catch {}
    }

    // Strategy 3: Direct check (mungkin berhasil dari IP tertentu)
    const direct = await shopeeCheckDirect(national, intl)
    if (direct) {
      return c.json({
        success: true,
        phone: intl,
        registered: direct.registered,
        available: direct.available,
        status_text: direct.registered ? 'TERDAFTAR (UNAVAILABLE)' : direct.available ? 'BELUM TERDAFTAR (AVAILABLE)' : 'STATUS UNKNOWN',
        source: direct.source,
        raw: direct.raw,
      })
    }

    // Strategy 4: All failed - report as CAPTCHA/blocked
    return c.json({
      success: true,
      phone: intl,
      registered: false,
      available: false,
      status_text: 'CAPTCHA / ANTI-BOT - Shopee memblokir server. Setup Telegram Checker untuk fix.',
      source: 'all_failed',
    })
  } catch (error) {
    const result = apiError(error)
    return c.json(result, result.status as 400)
  }
})

app.get('/', (c) => c.render(
  <main class="app-shell">
    <aside class="sidebar" aria-label="Navigasi utama">
      <a class="brand" href="#dashboard" aria-label="OTP Uyeee Dashboard"><span class="brand-mark">O</span><span class="brand-name">OTP Uyeee</span></a>
      <nav class="nav-list">
        <button class="nav-link is-active" data-icon="⌂" data-tooltip="Ringkasan" aria-label="Ringkasan" data-view="dashboard"><span class="nav-label">Ringkasan</span></button>
        <button class="nav-link" data-icon="🔍" data-tooltip="Shopee Checker" aria-label="Shopee Checker" data-view="checker"><span class="nav-label">Shopee Checker</span></button>
        <button class="nav-link" data-icon="◷" data-tooltip="Aktivitas" aria-label="Aktivitas" data-view="activity"><span class="nav-label">Aktivitas</span></button>
        <button class="nav-link" data-icon="⚙" data-tooltip="Pengaturan" aria-label="Pengaturan" data-view="settings"><span class="nav-label">Pengaturan</span></button>
      </nav>
      <div class="sidebar-footer"><span class="live-dot"></span> Sistem siap digunakan</div>
    </aside>
    <section class="workspace">
      <header class="topbar"><div><p class="eyebrow">PUSAT VERIFIKASI</p><h1 id="page-title">Ringkasan aktivitas</h1></div><div class="topbar-actions"><span id="connection-status" class="status-pill">Belum terhubung</span><button id="theme-toggle" class="icon-button" type="button" aria-label="Ganti tema">☾</button></div></header>
      <div id="notification-modal" class="notification-modal" role="presentation" hidden><section class="notification-card"><span id="notification-icon" class="notification-icon">!</span><p id="notification-text" class="notification-text"></p><button id="notification-close" class="notification-close" type="button" aria-label="Tutup">×</button></section></div>
      <div id="confirm-overlay" class="confirm-overlay" hidden><div class="confirm-box"><h3 id="confirm-title">Konfirmasi</h3><p id="confirm-text"></p><div class="confirm-actions"><button id="confirm-cancel" class="confirm-cancel" type="button">Batal</button><button id="confirm-ok" class="confirm-ok" type="button">Ya, Batalkan</button></div></div></div>
      
      <div id="deposit-modal" class="confirm-overlay" hidden>
        <div class="confirm-box" style="max-width:380px;">
          <h3>Isi Saldo (Deposit QRIS)</h3>
          <p class="muted" style="margin-bottom:15px; font-size:12px;">Top-up saldo akan langsung ditambahkan ke provider API (dehuyzotp.shop). Silakan scan QRIS di bawah ini melalui DANA/OVO/Gopay/ShopeePay/BCA, lalu konfirmasi ke Admin.</p>
          
          <div style="background:#fff; padding:15px; border-radius:10px; text-align:center; margin-bottom:15px;">
            <img src="https://i.ibb.co.com/84NswyQG/QRIS-Admin.png" alt="QRIS" style="width:100%; max-width:200px; margin:0 auto; border-radius:8px;" onerror="this.src='data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAxMDAgMTAwIj48cmVjdCB3aWR0aD0iMTAwIiBoZWlnaHQ9IjEwMCIgZmlsbD0iI2Y1ZjdmYiIvPjx0ZXh0IHg9IjUwIiB5PSI1MCIgZm9udC1mYW1pbHk9InNhbnMtc2VyaWYiIGZvbnQtc2l6ZT0iMTAiIHRleHQtYW5jaG9yPSJtaWRkbGUiIGFsaWdubWVudC1iYXNlbGluZT0ibWlkZGxlIiBmaWxsPSIjNjg3MzhhIj5HQU1CQVIgUVJJUzwvdGV4dD48L3N2Zz4='"/>
            <p style="margin-top:10px; font-size:11px; color:#162033; font-weight:700;">A.N. ADMIN OTP UYEEE</p>
          </div>

          <label class="field-label" style="margin-top:0;">Nominal Transfer (Rp)</label>
          <input id="deposit-amount" type="number" placeholder="Contoh: 20000" autocomplete="off" data-lpignore="true" style="margin-bottom:15px;" />
          
          <div class="confirm-actions">
            <button id="deposit-cancel" class="confirm-cancel" type="button">Tutup</button>
            <button id="deposit-confirm" class="button button-primary" type="button" style="margin:0;">Konfirmasi via WA</button>
          </div>
        </div>
      </div>
      <section id="dashboard-view" class="view-panel">
        <section class="metrics" aria-label="Statistik order"><article class="metric-card"><span>Total order</span><strong id="metric-total">0</strong><small>Dalam sesi ini</small></article><article class="metric-card"><span>Berhasil</span><strong id="metric-success">0</strong><small>Kode telah diterima</small></article><article class="metric-card"><span>Menunggu</span><strong id="metric-waiting">0</strong><small>Perlu ditindaklanjuti</small></article></section>
        <div class="content-grid">
          <section class="panel order-panel">
            <div class="panel-heading"><div><p class="eyebrow">ORDER LAYANAN</p><h2>Pilih Layanan</h2></div><div style="display:flex; align-items:center; gap:8px;"><div id="balance-box" class="balance-box-pill" hidden><span>Saldo:</span> <strong id="balance-value">—</strong></div><button id="deposit-btn" class="button button-primary" style="margin:0; padding:4px 10px; font-size:11px; min-height:28px; width:auto;" hidden>+ Deposit</button></div></div>
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

      <section id="checker-view" class="view-panel" hidden>
        <div class="content-grid">
          <section class="panel">
            <div class="panel-heading"><div><p class="eyebrow">FILTER NOMOR SHOPEE</p><h2>Cek Pendaftaran Shopee</h2></div><span class="step">🔎</span></div>
            <p class="muted">Periksa apakah nomor HP sudah terdaftar di Shopee. Jika terhubung dengan Order OTP, nomor yang sudah terdaftar akan otomatis dibatalkan!</p>
            
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
      <section id="activity-view" class="view-panel" hidden><section class="panel"><div class="panel-heading"><div><p class="eyebrow">RIWAYAT SESI</p><h2>Aktivitas terbaru</h2></div><button id="clear-history" class="text-button" type="button">Bersihkan</button></div><div class="table-wrap"><table><thead><tr><th>Waktu</th><th>Layanan</th><th>Nomor</th><th>Status</th></tr></thead><tbody id="history-body"><tr><td colspan={4} class="empty-state">Belum ada aktivitas.</td></tr></tbody></table></div></section></section>
      <section id="settings-view" class="view-panel" hidden>
        <section class="panel connection-panel" style="margin-bottom: 20px;">
          <div class="panel-heading"><div><p class="eyebrow">KONEKSI PROVIDER</p><h2>Hubungkan API Key</h2></div><span class="step">🔑</span></div>
          <p class="muted">Masukkan API key provider untuk mengaktifkan layanan dan saldo. Key hanya disimpan di memori sesi browser.</p>
          <label class="field-label" for="api-key">API key provider</label>
          <div class="input-row"><input id="api-key" type="password" autocomplete="new-password" data-lpignore="true" data-1p-ignore="true" placeholder="Masukkan API key"/><button id="reveal-key" class="text-button" type="button">Tampilkan</button></div>
          <div class="field-grid">
            <label class="field-label">Metode autentikasi
              <div id="auth-dropdown" class="custom-select"><input id="auth-mode" type="hidden" value="bearer" /><button id="auth-trigger" class="select-trigger" type="button" aria-haspopup="listbox" aria-expanded="false"><span id="auth-label">Bearer token</span><span class="select-chevron">⌄</span></button><div id="auth-options" class="select-options" role="listbox" hidden><button class="select-option is-selected" type="button" role="option" aria-selected="true" data-value="bearer">Bearer token</button><button class="select-option" type="button" role="option" aria-selected="false" data-value="x-api-key">x-api-key header</button></div></div>
            </label>
            <label id="header-field" class="field-label">Nama header<input id="header-name" value="x-api-key" autocomplete="off" data-lpignore="true" data-1p-ignore="true" /></label>
          </div>
          <div class="button-group" style="margin-top: 15px;">
            <button id="connect-button" class="button button-primary" type="button" style="flex: 1;">Uji & Simpan Provider</button>
            <button id="revoke-button" class="button button-danger" type="button" style="flex: 0 0 auto; width: auto;" hidden>Hapus / Revoke Key</button>
          </div>
        </section>

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
    <script src="/static/app.js" defer></script>
  </main>
))

export default app
