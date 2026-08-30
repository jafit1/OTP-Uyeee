(() => {
  const $ = (selector) => document.querySelector(selector)
  const state = { user: null, services: [], orders: [], history: [] }
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

  async function call(path, body, method = 'POST') {
    const opts = { method, headers: { 'Content-Type': 'application/json' } }
    if (body) opts.body = JSON.stringify(body)
    const response = await fetch(path, opts)
    const data = await response.json().catch(() => ({ success: false, error: 'Server mengirim respons tidak valid.' }))
    if (!response.ok || !data.success) throw new Error(data.error || 'Request gagal diproses.')
    return data
  }

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
    if (!state.user) return
    const waitingOrders = state.orders.filter(o => o.status === 'WAITING')
    for (const order of waitingOrders) {
      try {
        const data = await call('/api/otp/check', { token: order.token })
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
        return `<button class="select-option" type="button" role="option" aria-selected="false" data-value="${escapeHtml(item.id)}" data-price="${item.price || 0}"><span>${escapeHtml(item.name)}</span>${priceStr}</button>`
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
      const price = option.dataset.price
      const label = option.querySelector('span')?.textContent || option.textContent
      $('#service-select').value = value
      $('#service-select').dataset.price = price
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

  // Multi-Order Support
  $('#order-button').addEventListener('click', async () => {
    if (!state.user) return message('Silakan login terlebih dahulu.')
    const serviceId = $('#service-select').value
    const price = Number($('#service-select').dataset.price || 0)
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
          const res = await call('/api/otp/order', { serviceId, price })
          const orderObj = {
            token: res.token,
            order_id: res.order_id,
            number: res.number,
            service_id: serviceId,
            service_name: serviceName,
            price,
            status: 'WAITING',
            otp_code: null,
            expireTime: Date.now() + 15 * 60 * 1000
          }
          state.orders.unshift(orderObj)
          renderOrders()
          addHistoryEntry(orderObj, 'WAITING')
          createdCount++
          
          // Refresh User Balance from Auth Me
          refreshUserData()

          // Auto Shopee Check & Auto Cancel per order
          if (isShopee && autoCancel && res.number) {
            (async () => {
              try {
                const checkRes = await call('/api/shopee/check', { phone: res.number })
                if (checkRes.registered) {
                  await call('/api/otp/action', { orderRef: res.order_id, action: 'cancel', price })
                  orderObj.status = 'CANCELLED'
                  renderOrders()
                  addHistoryEntry(orderObj, 'CANCELLED')
                  refreshUserData()
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
        const data = await call('/api/otp/check', { token: order.token })
        order.status = data.status
        order.otp_code = data.otp_code
        renderOrders()
        addHistoryEntry(order, data.status)
        if (data.otp_code) message('Kode verifikasi diterima.', 'success')
        else message('Kode belum tersedia.')
      } catch (err) { message(err.message) } finally { busy(btn, false) }
    } else if (event.target.closest('.btn-cancel-card')) {
      const yes = await showConfirm('Batalkan Order?', `Nomor ${order.number} akan dibatalkan. Saldo akan dikembalikan.`)
      if (!yes) return
      const btn = event.target.closest('.btn-cancel-card')
      busy(btn, true, 'Batal…')
      try {
        await call('/api/otp/action', { orderRef: order.order_id, action: 'cancel', price: order.price || 0 })
        order.status = 'CANCELLED'
        renderOrders()
        addHistoryEntry(order, 'CANCELLED')
        refreshUserData()
        message('Order dibatalkan. Saldo telah dikembalikan.', 'success')
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
          const data = await call('/api/otp/check', { token: order.token })
          order.status = data.status
          order.otp_code = data.otp_code
          addHistoryEntry(order, data.status)
        } catch (e) {}
      }
      renderOrders()
      message('Pengecekan selesai.', 'success')
    } finally { busy(btn, false) }
  })

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

  // ── AUTHENTICATION & LOGIN/REGISTER MODAL LOGIC ──
  let isRegisterMode = false

  function toggleAuthModal(show = true) {
    const modal = $('#auth-modal')
    if (show) {
      modal.hidden = false
      requestAnimationFrame(() => modal.classList.add('is-visible'))
    } else {
      modal.classList.remove('is-visible')
      setTimeout(() => { modal.hidden = true }, 180)
    }
  }

  $('#auth-switch-btn')?.addEventListener('click', () => {
    isRegisterMode = !isRegisterMode
    $('#auth-form-title').textContent = isRegisterMode ? 'Daftar Akun Baru' : 'Masuk ke OTP Uyeee'
    $('#auth-form-desc').textContent = isRegisterMode ? 'Buat akun baru untuk mulai memesan OTP instan.' : 'Masukkan email & password akun Anda untuk melanjutkan.'
    $('#auth-submit-btn').textContent = isRegisterMode ? 'Daftar Sekarang' : 'Masuk Sekarang'
    $('#auth-switch-btn').textContent = isRegisterMode ? 'Sudah punya akun? Login disini' : 'Belum punya akun? Daftar disini'
    $('#remember-me-label').style.display = isRegisterMode ? 'none' : 'flex'
  })

  $('#auth-submit-btn')?.addEventListener('click', async () => {
    const email = $('#auth-email').value.trim()
    const password = $('#auth-password').value.trim()
    const rememberMe = $('#auth-remember').checked

    if (!email || !password) return message('Email dan password wajib diisi.')
    if (password.length < 6) return message('Password minimal 6 karakter.')

    const button = $('#auth-submit-btn')
    busy(button, true, isRegisterMode ? 'Mendaftar...' : 'Memproses...')

    try {
      const path = isRegisterMode ? '/api/auth/register' : '/api/auth/login'
      const res = await call(path, { email, password, rememberMe })
      state.user = res.user
      toggleAuthModal(false)
      message(isRegisterMode ? 'Pendaftaran berhasil!' : 'Berhasil masuk ke akun.', 'success')
      await initUserSession()
    } catch (err) {
      message(err.message)
    } finally {
      busy(button, false)
    }
  })

  $('#logout-btn')?.addEventListener('click', async () => {
    const yes = await showConfirm('Keluar Akun?', 'Anda harus login kembali untuk memesan OTP.')
    if (!yes) return
    try {
      await call('/api/auth/logout', null)
      state.user = null
      state.orders = []
      renderOrders()
      location.reload()
    } catch (e) {}
  })

  async function refreshUserData() {
    try {
      const res = await call('/api/auth/me', null, 'GET')
      if (res.user) {
        state.user = res.user
        $('#balance-value').textContent = `Rp ${Number(res.user.balance || 0).toLocaleString('id-ID')}`
        $('#user-email-display').textContent = res.user.email
      }
    } catch (e) {}
  }

  async function initUserSession() {
    try {
      const res = await call('/api/auth/me', null, 'GET')
      if (res.user) {
        state.user = res.user
        $('#user-profile-badge').style.display = 'flex'
        $('#user-email-display').textContent = res.user.email
        $('#balance-value').textContent = `Rp ${Number(res.user.balance || 0).toLocaleString('id-ID')}`
        toggleAuthModal(false)

        // Load Services List
        const sRes = await call('/api/otp/services', null, 'GET')
        state.services = sRes.services
        const searchInput = $('#service-search')
        searchInput.disabled = !state.services.length
        searchInput.placeholder = state.services.length ? `Cari di ${state.services.length} layanan...` : 'Tidak ada layanan'
        renderServiceOptions()
        $('#order-button').disabled = !state.services.length
      } else {
        toggleAuthModal(true)
      }
    } catch (e) {
      toggleAuthModal(true)
    }
  }

  // ── DEPOSIT KODE UNIK QRIS LOGIC ──
  $('#deposit-btn')?.addEventListener('click', () => {
    const modal = $('#deposit-modal')
    $('#deposit-form-step').hidden = false
    $('#deposit-qr-step').hidden = true
    modal.hidden = false
    requestAnimationFrame(() => modal.classList.add('is-visible'))
  })

  $('#deposit-close-btn')?.addEventListener('click', () => {
    const modal = $('#deposit-modal')
    modal.classList.remove('is-visible')
    setTimeout(() => { modal.hidden = true }, 180)
  })

  $('#deposit-create-btn')?.addEventListener('click', async () => {
    const amount = $('#deposit-amount-input').value.trim()
    if (!amount || isNaN(amount) || Number(amount) < 5000) {
      return message('Minimal isi saldo Rp 5.000')
    }
    const button = $('#deposit-create-btn')
    busy(button, true, 'Memproses...')
    try {
      const res = await call('/api/deposit/create', { amount: Number(amount) })
      const dep = res.deposit

      $('#deposit-qr-img').src = dep.qr_image
      $('#dep-total-val').textContent = `Rp ${Number(dep.total_pay).toLocaleString('id-ID')}`
      $('#deposit-note-text').textContent = dep.note
      $('#deposit-checkout-link').href = dep.checkout_url

      $('#deposit-form-step').hidden = true
      $('#deposit-qr-step').hidden = false
    } catch (err) {
      message(err.message)
    } finally {
      busy(button, false)
    }
  })

  $('#deposit-done-btn')?.addEventListener('click', () => {
    $('#deposit-close-btn').click()
    refreshUserData()
  })

  setTheme(); refreshMetrics(); renderHistory(); initUserSession()
})()
