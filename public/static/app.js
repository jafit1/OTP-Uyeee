(() => {
  const $ = (selector) => document.querySelector(selector)
  const state = { config: null, services: [], orders: [], history: [] }
  const themeKey = 'veriflow-theme'
  const systemDark = window.matchMedia('(prefers-color-scheme: dark)')

  function resolveTheme(choice) { return choice === 'system' ? (systemDark.matches ? 'dark' : 'light') : choice }
  function setTheme(choice) {
    const selected = choice || localStorage.getItem(themeKey) || 'system'
    document.documentElement.dataset.theme = resolveTheme(selected)
    localStorage.setItem(themeKey, selected)
    $('#theme-toggle').textContent = document.documentElement.dataset.theme === 'dark' ? '☀' : '☾'
    document.querySelectorAll('[data-theme-choice]').forEach((button) => button.classList.toggle('is-selected', button.dataset.themeChoice === selected))
  }

  // Notification (elegant, top-center, small)
  function closeNotification() { const modal = $('#notification-modal'); modal.classList.remove('is-visible'); clearTimeout(message.timer); setTimeout(() => { if (!modal.classList.contains('is-visible')) modal.hidden = true }, 200) }
  function message(text, kind = 'error') {
    const modal = $('#notification-modal')
    const icon = $('#notification-icon')
    $('#notification-text').textContent = text
    icon.textContent = kind === 'success' ? '✓' : '!'
    modal.classList.toggle('is-success', kind === 'success')
    modal.hidden = false
    requestAnimationFrame(() => modal.classList.add('is-visible'))
    clearTimeout(message.timer)
    message.timer = setTimeout(closeNotification, 3500)
  }

  // Custom Confirm Modal
  function showConfirm(title, text) {
    return new Promise(resolve => {
      const overlay = $('#confirm-overlay')
      $('#confirm-title').textContent = title
      $('#confirm-text').textContent = text
      overlay.hidden = false
      requestAnimationFrame(() => overlay.classList.add('is-visible'))
      const onOk = () => { cleanup(); resolve(true) }
      const onCancel = () => { cleanup(); resolve(false) }
      const cleanup = () => {
        overlay.classList.remove('is-visible')
        setTimeout(() => { overlay.hidden = true }, 180)
        $('#confirm-ok').removeEventListener('click', onOk)
        $('#confirm-cancel').removeEventListener('click', onCancel)
      }
      $('#confirm-ok').addEventListener('click', onOk)
      $('#confirm-cancel').addEventListener('click', onCancel)
    })
  }

  function config() { return { apiKey: $('#api-key').value.trim(), authMode: $('#auth-mode').value, apiKeyHeader: $('#header-name').value.trim() || 'x-api-key' } }
  async function call(path, body) {
    const response = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    const data = await response.json().catch(() => ({ success: false, error: 'Server mengirim respons yang tidak valid.' }))
    if (!response.ok || !data.success) throw new Error(data.error || 'Request gagal diproses.')
    return data
  }
  function status(text, type = '') { const item = $('#connection-status'); item.textContent = text; item.className = `status-pill ${type}` }
  function refreshMetrics() { $('#metric-total').textContent = state.history.length; $('#metric-success').textContent = state.history.filter(x => x.status === 'RECEIVED').length; $('#metric-waiting').textContent = state.history.filter(x => x.status === 'WAITING').length }
  function renderHistory() { const body = $('#history-body'); if (!state.history.length) { body.innerHTML = '<tr><td colspan="4" class="empty-state">Belum ada aktivitas.</td></tr>'; return }; body.innerHTML = state.history.map(x => `<tr><td>${x.time}</td><td>${escapeHtml(x.service)}</td><td>${escapeHtml(x.number)}</td><td class="table-status">${x.status}</td></tr>`).join('') }
  function escapeHtml(value) { return String(value).replace(/[&<>"']/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#039;' }[char])) }
  
  function addHistoryEntry(orderObj, statusValue) {
    if (!orderObj) return
    const entry = {
      time: new Intl.DateTimeFormat('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(new Date()),
      service: orderObj.service_name || orderObj.service_id,
      number: orderObj.number,
      status: statusValue
    }
    const current = state.history.findIndex(x => x.number === entry.number)
    if (current >= 0) state.history[current] = entry
    else state.history.unshift(entry)
    state.history = state.history.slice(0, 50)
    refreshMetrics()
    renderHistory()
  }

  // Multi-Order Rendering & Timer
  function renderOrders() {
    const grid = $('#orders-grid')
    const placeholder = $('#no-order-placeholder')
    const checkAllBtn = $('#check-all-button')

    if (!state.orders.length) {
      if (placeholder) placeholder.hidden = false
      if (grid) grid.innerHTML = ''
      if (checkAllBtn) checkAllBtn.style.display = 'none'
      return
    }

    if (placeholder) placeholder.hidden = true
    if (checkAllBtn) checkAllBtn.style.display = 'inline-flex'

    grid.innerHTML = state.orders.map(order => {
      const isDone = order.status === 'RECEIVED' || order.status === 'CANCELLED' || order.status === 'FAILED'
      const statusClass = order.status === 'RECEIVED' ? 'is-success' : isDone ? 'is-failed' : 'is-waiting'
      const statusLabel = order.status === 'WAITING' ? 'MENUNGGU OTP' : order.status === 'RECEIVED' ? 'BERHASIL' : 'DIBATALKAN'
      const remainingSec = Math.max(0, Math.floor((order.expireTime - Date.now()) / 1000))
      const mins = String(Math.floor(remainingSec / 60)).padStart(2, '0')
      const secs = String(remainingSec % 60).padStart(2, '0')
      const timerStr = isDone ? '' : `⏱ ${mins}:${secs}`

      return `
        <div class="order-card" data-token="${escapeHtml(order.token)}">
          <div class="order-card-header">
            <div>
              <span class="status-pill ${statusClass}">${statusLabel}</span>
              <div class="order-card-title" style="margin-top:4px;">${escapeHtml(order.service_name)}</div>
            </div>
            ${timerStr ? `<div class="order-card-timer ${remainingSec === 0 ? 'is-expired' : ''}">${timerStr}</div>` : ''}
          </div>
          <div class="order-card-phone">
            <span>${escapeHtml(order.number)}</span>
            <button class="copy-icon btn-copy-card" type="button" data-phone="${escapeHtml(order.number)}" title="Salin Nomor">📋</button>
          </div>
          <div class="order-card-otp">
            ${order.otp_code ? escapeHtml(order.otp_code) : '<span style="font-size:12px;color:var(--muted);font-weight:500;">Menunggu kode...</span>'}
          </div>
          <div class="order-card-actions">
            <button class="button button-primary btn-check-card" type="button" ${isDone ? 'disabled' : ''}>🔄 Cek OTP</button>
            <button class="button button-danger btn-cancel-card" type="button" ${isDone ? 'disabled' : ''}>❌ Batal</button>
          </div>
        </div>
      `
    }).join('')
  }

  // Timer Tick Every Second
  setInterval(() => {
    state.orders.forEach(order => {
      if (order.status !== 'WAITING') return
      const tokenEscaped = String(order.token).replace(/"/g, '\\"')
      const cardTimer = document.querySelector(`.order-card[data-token="${tokenEscaped}"] .order-card-timer`)
      if (!cardTimer) return
      
      const remainingSec = Math.max(0, Math.floor((order.expireTime - Date.now()) / 1000))
      const mins = String(Math.floor(remainingSec / 60)).padStart(2, '0')
      const secs = String(remainingSec % 60).padStart(2, '0')
      
      cardTimer.textContent = `⏱ ${mins}:${secs}`
      if (remainingSec === 0) cardTimer.classList.add('is-expired')
    })
  }, 1000)

  // Auto Poll WAITING orders every 5s
  setInterval(async () => {
    if (!state.config) return
    const waitingOrders = state.orders.filter(o => o.status === 'WAITING')
    for (const order of waitingOrders) {
      try {
        const data = await call('/api/otp/check', { providerConfig: state.config, token: order.token })
        if (data.status !== order.status || data.otp_code !== order.otp_code) {
          order.status = data.status
          order.otp_code = data.otp_code
          renderOrders()
          addHistoryEntry(order, data.status)
          if (data.otp_code) message(`Kode OTP untuk ${order.number} diterima! (${data.otp_code})`, 'success')
        }
      } catch (e) { /* ignore polling error */ }
    }
  }, 5000)

  function busy(button, active, label) { if (active) { button.dataset.label = button.textContent; button.textContent = label; button.disabled = true } else { button.textContent = button.dataset.label; button.disabled = false } }

  // Service Search Bar & Prices Display
  function renderServiceOptions(filter = '') {
    const options = $('#service-options')
    const filtered = state.services.filter(s => s.name.toLowerCase().includes(filter.toLowerCase()))
    if (!filtered.length) {
      options.innerHTML = '<div style="padding:10px;color:var(--muted);font-size:12px;text-align:center;">Layanan tidak ditemukan</div>'
    } else {
      options.innerHTML = filtered.map(item => {
        const priceStr = item.price ? `<span class="option-meta"><span class="service-price">Rp ${Number(item.price).toLocaleString('id-ID')}</span>${item.count ? `<span class="service-count">(${item.count})</span>` : ''}</span>` : ''
        return `<button class="select-option" type="button" role="option" aria-selected="false" data-value="${escapeHtml(item.id)}"><span>${escapeHtml(item.name)}</span>${priceStr}</button>`
      }).join('')
    }
  }

  function setupSearchBar() {
    const searchInput = $('#service-search')
    const options = $('#service-options')
    const dropdown = $('#service-dropdown')

    searchInput.addEventListener('focus', () => {
      if (searchInput.disabled) return
      renderServiceOptions(searchInput.value)
      options.hidden = false
      dropdown.classList.add('is-open')
    })

    searchInput.addEventListener('input', () => {
      renderServiceOptions(searchInput.value)
      options.hidden = false
    })

    options.addEventListener('click', (event) => {
      const option = event.target.closest('.select-option')
      if (!option) return
      const value = option.dataset.value
      const label = option.querySelector('span')?.textContent || option.textContent
      $('#service-select').value = value
      searchInput.value = label
      options.hidden = true
      dropdown.classList.remove('is-open')
    })

    document.addEventListener('click', (event) => {
      if (!event.target.closest('#service-dropdown')) {
        options.hidden = true
        dropdown.classList.remove('is-open')
      }
    })
  }
  setupSearchBar()

  // Quantity Control
  $('#qty-minus')?.addEventListener('click', () => {
    const input = $('#order-qty')
    const current = Math.max(1, parseInt(input.value || '1', 10) - 1)
    input.value = current
  })
  $('#qty-plus')?.addEventListener('click', () => {
    const input = $('#order-qty')
    const current = Math.min(20, parseInt(input.value || '1', 10) + 1)
    input.value = current
  })

  // Existing dropdown setup for auth mode
  function closeDropdowns() { document.querySelectorAll('.custom-select:not(#service-dropdown)').forEach(dropdown => { dropdown.classList.remove('is-open'); dropdown.querySelector('.select-options').hidden = true; dropdown.querySelector('.select-trigger')?.setAttribute('aria-expanded', 'false') }) }
  function selectValue(dropdown, value, label) { const input = dropdown.querySelector('input[type="hidden"]'); if (input) input.value = value; const trigger = dropdown.querySelector('.select-trigger'); if (trigger) { const span = trigger.querySelector('span:first-child'); if (span) span.textContent = label; } dropdown.querySelectorAll('.select-option').forEach(option => { const selected = option.dataset.value === String(value); option.classList.toggle('is-selected', selected); option.setAttribute('aria-selected', String(selected)) }); closeDropdowns(); dropdown.dispatchEvent(new CustomEvent('selectionchange', { bubbles: true, detail: { value, label } })) }
  function setupDropdown(dropdown) { const trigger = dropdown.querySelector('.select-trigger'); const options = dropdown.querySelector('.select-options'); if (!trigger || !options) return; trigger.addEventListener('click', () => { if (trigger.disabled) return; const isOpen = dropdown.classList.toggle('is-open'); options.hidden = !isOpen; trigger.setAttribute('aria-expanded', String(isOpen)) }); options.addEventListener('click', (event) => { const option = event.target.closest('.select-option'); if (option) selectValue(dropdown, option.dataset.value, option.textContent) }) }
  document.querySelectorAll('.custom-select:not(#service-dropdown)').forEach(setupDropdown)
  document.addEventListener('click', (event) => { if (!event.target.closest('.custom-select')) closeDropdowns() })

  $('#connect-button').addEventListener('click', async () => {
    const button = $('#connect-button')
    const connection = config()
    if (!connection.apiKey) return message('Masukkan API key terlebih dahulu.')
    busy(button, true, 'Menghubungkan…')
    try {
      const [services, balance] = await Promise.all([call('/api/otp/services', { providerConfig: connection }), call('/api/otp/balance', { providerConfig: connection })])
      state.config = connection
      state.services = services.services
      saveStoredConfig(connection)
      $('#revoke-button').hidden = false
      const searchInput = $('#service-search')
      searchInput.disabled = !state.services.length
      searchInput.placeholder = state.services.length ? `Cari di ${state.services.length} layanan...` : 'Tidak ada layanan'
      renderServiceOptions()
      $('#order-button').disabled = !state.services.length
      $('#balance-box').hidden = false
      $('#deposit-btn').hidden = false
      $('#balance-value').textContent = new Intl.NumberFormat('id-ID').format(balance.available)
      status(`${state.services.length} layanan aktif`, 'is-success')
      message('Provider & API Key berhasil tersimpan.', 'success')
    } catch (error) {
      status('Koneksi gagal', 'is-failed')
      message(error.message)
    } finally {
      busy(button, false)
    }
  })

  // Multi-Order Support
  $('#order-button').addEventListener('click', async () => {
    if (!state.config) return message('Hubungkan provider terlebih dahulu di Pengaturan.')
    const serviceId = $('#service-select').value
    if (!serviceId) return message('Silakan pilih layanan terlebih dahulu.')
    const qty = parseInt($('#order-qty').value || '1', 10)
    const button = $('#order-button')
    busy(button, true, `Membuat ${qty} order...`)
    
    const selectedService = state.services.find(s => String(s.id) === String(serviceId))
    const serviceName = selectedService ? selectedService.name : `Layanan ${serviceId}`
    const isShopee = serviceName.toLowerCase().includes('shopee')
    const autoCancel = $('#auto-cancel-registered')?.checked ?? true

    let createdCount = 0
    try {
      for (let i = 0; i < qty; i++) {
        try {
          const res = await call('/api/otp/order', { providerConfig: state.config, serviceId })
          const orderObj = {
            token: res.token,
            order_id: res.order_id,
            number: res.number,
            service_id: serviceId,
            service_name: serviceName,
            status: 'WAITING',
            otp_code: null,
            expireTime: Date.now() + 15 * 60 * 1000
          }
          state.orders.unshift(orderObj)
          renderOrders()
          addHistoryEntry(orderObj, 'WAITING')
          createdCount++

          // Auto Shopee Check & Auto Cancel per order
          if (isShopee && autoCancel && res.number) {
            (async () => {
              try {
                const checkRes = await call('/api/shopee/check', { phone: res.number })
                if (checkRes.registered) {
                  await call('/api/otp/action', { providerConfig: state.config, orderRef: res.order_id, action: 'cancel' })
                  orderObj.status = 'CANCELLED'
                  renderOrders()
                  addHistoryEntry(orderObj, 'CANCELLED')
                  message(`Nomor ${res.number} terdaftar Shopee — dibatalkan otomatis.`)
                } else if (checkRes.available) {
                  message(`Nomor ${res.number} aman (belum terdaftar Shopee).`, 'success')
                }
              } catch (e) {}
            })()
          }
        } catch (e) {
          message(`Gagal order ke-${i+1}: ${e.message}`)
        }
      }
      if (createdCount > 0) {
        message(`Berhasil membuat ${createdCount} order nomor.`, 'success')
      }
    } finally {
      busy(button, false)
    }
  })

  // Event Delegation for Grid Card Buttons
  $('#orders-grid')?.addEventListener('click', async (event) => {
    const card = event.target.closest('.order-card')
    if (!card) return
    const token = card.dataset.token
    const order = state.orders.find(o => o.token === token)
    if (!order) return

    if (event.target.closest('.btn-copy-card')) {
      const phone = event.target.closest('.btn-copy-card').dataset.phone
      try { await navigator.clipboard.writeText(phone); message('Nomor disalin.', 'success') } catch { message('Clipboard tidak tersedia.') }
    } else if (event.target.closest('.btn-check-card')) {
      const btn = event.target.closest('.btn-check-card')
      busy(btn, true, 'Cek…')
      try {
        const data = await call('/api/otp/check', { providerConfig: state.config, token: order.token })
        order.status = data.status
        order.otp_code = data.otp_code
        renderOrders()
        addHistoryEntry(order, data.status)
        if (data.otp_code) message('Kode verifikasi diterima.', 'success')
        else message('Kode belum tersedia.')
      } catch (err) { message(err.message) } finally { busy(btn, false) }
    } else if (event.target.closest('.btn-cancel-card')) {
      const yes = await showConfirm('Batalkan Order?', `Nomor ${order.number} akan dibatalkan.`)
      if (!yes) return
      const btn = event.target.closest('.btn-cancel-card')
      busy(btn, true, 'Batal…')
      try {
        await call('/api/otp/action', { providerConfig: state.config, orderRef: order.order_id, action: 'cancel' })
        order.status = 'CANCELLED'
        renderOrders()
        addHistoryEntry(order, 'CANCELLED')
        message('Order dibatalkan.', 'success')
      } catch (err) { message(err.message) } finally { busy(btn, false) }
    }
  })

  // Check All Button
  $('#check-all-button')?.addEventListener('click', async () => {
    const waitingOrders = state.orders.filter(o => o.status === 'WAITING')
    if (!waitingOrders.length) return message('Tidak ada order yang menunggu.')
    const btn = $('#check-all-button')
    busy(btn, true, 'Memeriksa…')
    try {
      for (const order of waitingOrders) {
        try {
          const data = await call('/api/otp/check', { providerConfig: state.config, token: order.token })
          order.status = data.status
          order.otp_code = data.otp_code
          addHistoryEntry(order, data.status)
        } catch (e) {}
      }
      renderOrders()
      message('Pengecekan selesai.', 'success')
    } finally { busy(btn, false) }
  })

  $('#reveal-key').addEventListener('click', () => { const input = $('#api-key'); input.type = input.type === 'password' ? 'text' : 'password'; $('#reveal-key').textContent = input.type === 'password' ? 'Tampilkan' : 'Sembunyikan' })
  $('#auth-dropdown').addEventListener('selectionchange', () => { $('#header-field').hidden = $('#auth-mode').value !== 'x-api-key' })
  $('.nav-list').addEventListener('click', (event) => { const button = event.target.closest('.nav-link'); if (!button) return; document.querySelectorAll('.nav-link').forEach(x => x.classList.toggle('is-active', x === button)); const view = button.dataset.view; document.querySelectorAll('.view-panel').forEach(x => x.hidden = x.id !== `${view}-view`); $('#page-title').textContent = view === 'dashboard' ? 'Ringkasan aktivitas' : view === 'checker' ? 'Shopee Number Checker' : view === 'activity' ? 'Aktivitas terbaru' : 'Pengaturan tampilan' })

  // Shopee Checker
  $('#run-check-button').addEventListener('click', async () => {
    const input = $('#check-phone-input')
    const phone = input.value.trim()
    if (!phone) return message('Masukkan nomor telepon.')
    input.value = ''
    const button = $('#run-check-button')
    busy(button, true, 'Memeriksa…')
    try {
      const res = await call('/api/shopee/check', { phone })
      const box = $('#checker-result-box')
      const isReg = res.registered
      const isAvail = res.available
      box.className = 'active-order-box'
      box.innerHTML = `
        <div class="order-status-badge">
          <span class="status-pill ${isReg ? 'is-failed' : isAvail ? 'is-success' : 'is-waiting'}">${res.status_text}</span>
          <h3>Status Shopee</h3>
        </div>
        <div class="order-phone-display">
          <span class="label">Nomor</span>
          <div class="phone-row"><strong>${res.phone}</strong></div>
        </div>
        <div class="otp-result-box">
          <span class="label">Keterangan</span>
          <div class="otp-code-wrapper" style="font-size:14px;">
            ${isReg ? '❌ SUDAH TERDAFTAR SHOPEE' : isAvail ? '✅ BELUM TERDAFTAR (SIAP PAKAI)' : '⚠️ TIDAK BISA DIVERIFIKASI'}
          </div>
        </div>`
      message(`Cek ${res.phone} selesai.`, 'success')
    } catch (err) { message(err.message) } finally { busy(button, false) }
  })

  $('#clear-history').addEventListener('click', () => { state.history = []; refreshMetrics(); renderHistory() })
  $('#notification-close').addEventListener('click', closeNotification)
  $('#notification-modal').addEventListener('click', (event) => { if (event.target.id === 'notification-modal') closeNotification() })
  document.addEventListener('keydown', (event) => { if (event.key === 'Escape') closeNotification() })
  $('#theme-toggle').addEventListener('click', () => { const current = document.documentElement.dataset.theme; setTheme(current === 'dark' ? 'light' : 'dark') })
  document.querySelectorAll('[data-theme-choice]').forEach(button => button.addEventListener('click', () => setTheme(button.dataset.themeChoice)))
  systemDark.addEventListener('change', () => { if (localStorage.getItem(themeKey) === 'system') setTheme('system') })

  const STORAGE_KEY = 'otp_provider_config'
  function saveStoredConfig(cfg) { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg)) } catch {} }
  function getStoredConfig() { try { const raw = localStorage.getItem(STORAGE_KEY); return raw ? JSON.parse(raw) : null } catch { return null } }
  function removeStoredConfig() { try { localStorage.removeItem(STORAGE_KEY) } catch {} }

  async function autoConnect(saved) {
    if (!saved || !saved.apiKey) return
    $('#api-key').value = saved.apiKey
    if (saved.authMode) selectValue($('#auth-dropdown'), saved.authMode, saved.authMode === 'x-api-key' ? 'x-api-key header' : 'Bearer token')
    if (saved.apiKeyHeader) $('#header-name').value = saved.apiKeyHeader
    $('#revoke-button').hidden = false

    try {
      const [services, balance] = await Promise.all([call('/api/otp/services', { providerConfig: saved }), call('/api/otp/balance', { providerConfig: saved })])
      state.config = saved
      state.services = services.services
      const searchInput = $('#service-search')
      searchInput.disabled = !state.services.length
      searchInput.placeholder = state.services.length ? `Cari di ${state.services.length} layanan...` : 'Tidak ada layanan'
      renderServiceOptions()
      $('#order-button').disabled = !state.services.length
      $('#balance-box').hidden = false
      $('#deposit-btn').hidden = false
      $('#balance-value').textContent = new Intl.NumberFormat('id-ID').format(balance.available)
      status(`${state.services.length} layanan aktif`, 'is-success')
    } catch (error) {
      status('Tersimpan (Koneksi Gagal)', 'is-failed')
    }
  }

  $('#header-field').hidden = true; setTheme(); refreshMetrics(); renderHistory()
  const savedConfig = getStoredConfig()
  if (savedConfig) autoConnect(savedConfig)

  $('#revoke-button').addEventListener('click', async () => {
    const yes = await showConfirm('Hapus API Key?', 'API key akan dihapus dari browser ini.')
    if (!yes) return
    removeStoredConfig()
    state.config = null
    state.services = []
    state.orders = []
    renderOrders()
    $('#api-key').value = ''
    const searchInput = $('#service-search')
    searchInput.disabled = true
    searchInput.value = ''
    searchInput.placeholder = 'Hubungkan provider di Pengaturan'
    $('#service-select').value = ''
    $('#service-options').innerHTML = ''
    $('#order-button').disabled = true
    $('#balance-box').hidden = true
    $('#deposit-btn').hidden = true
    $('#revoke-button').hidden = true
    status('Belum terhubung', '')
    message('API Key dihapus.', 'success')
  })

  // Deposit Logic
  $('#deposit-btn')?.addEventListener('click', () => {
    const modal = $('#deposit-modal')
    modal.hidden = false
    requestAnimationFrame(() => modal.classList.add('is-visible'))
  })
  
  $('#deposit-cancel')?.addEventListener('click', () => {
    const modal = $('#deposit-modal')
    modal.classList.remove('is-visible')
    setTimeout(() => { modal.hidden = true }, 180)
  })

  $('#deposit-confirm')?.addEventListener('click', () => {
    const amount = $('#deposit-amount').value.trim()
    if (!amount || isNaN(amount) || Number(amount) < 10000) {
      return message('Minimal deposit adalah Rp 10.000')
    }
    
    // Redirect ke WhatsApp Admin (Ganti dengan nomor WhatsApp Anda!)
    const adminPhone = '6281234567890' 
    const apiKey = state.config?.apiKey ? state.config.apiKey.substring(0, 8) + '...' : 'Unknown'
    const text = `Halo Admin, saya ingin Deposit Saldo OTP UYEEE.\n\n*Nominal:* Rp ${Number(amount).toLocaleString('id-ID')}\n*API Key ID:* ${apiKey}\n\nSaya telah mentransfer via QRIS sesuai nominal. Berikut bukti transfernya:`
    const waUrl = `https://wa.me/${adminPhone}?text=${encodeURIComponent(text)}`
    
    window.open(waUrl, '_blank')
    $('#deposit-cancel').click()
  })

})()