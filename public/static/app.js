(() => {
  const $ = (selector) => document.querySelector(selector)
  const state = { config: null, services: [], order: null, history: [] }
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
  function closeNotification() { const modal = $('#notification-modal'); modal.classList.remove('is-visible'); clearTimeout(message.timer); setTimeout(() => { if (!modal.classList.contains('is-visible')) modal.hidden = true }, 220) }
  function message(text, kind = 'error') { const modal = $('#notification-modal'); $('#notification-text').textContent = text; $('#notification-title').textContent = kind === 'success' ? 'Berhasil' : 'Perlu perhatian'; $('#notification-icon').textContent = kind === 'success' ? '✓' : '!'; modal.classList.toggle('is-success', kind === 'success'); modal.hidden = false; requestAnimationFrame(() => modal.classList.add('is-visible')); clearTimeout(message.timer); message.timer = setTimeout(closeNotification, 4200) }
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
  function addHistory(statusValue) { if (!state.order) return; const entry = { time: new Intl.DateTimeFormat('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(new Date()), service: $('#service-label').textContent || state.order.service_id, number: state.order.number, status: statusValue }; const current = state.history.findIndex(x => x.number === entry.number); if (current >= 0) state.history[current] = entry; else state.history.unshift(entry); state.history = state.history.slice(0, 30); refreshMetrics(); renderHistory() }
  function renderOrder() {
    const order = state.order
    const detailsContent = $('#order-details-content')
    const placeholder = $('#no-order-placeholder')
    
    if (!order) {
      if (detailsContent) detailsContent.hidden = true
      if (placeholder) placeholder.hidden = false
      return
    }

    if (placeholder) placeholder.hidden = true
    if (detailsContent) detailsContent.hidden = false

    const selectedService = state.services.find(s => String(s.id) === String(order.service_id))
    const serviceName = selectedService ? selectedService.name : `Layanan ${order.service_id}`

    $('#order-service').textContent = serviceName
    $('#order-number').textContent = order.number
    $('#otp-code').textContent = order.otp_code || 'Belum tersedia'
    
    const pill = $('#order-state')
    let stateText = order.status
    if (order.status === 'WAITING') stateText = 'MENUNGGU OTP'
    else if (order.status === 'RECEIVED') stateText = 'BERHASIL'
    else if (order.status === 'CANCELLED' || order.status === 'FAILED') stateText = 'DIBATALKAN'
    
    pill.textContent = stateText
    pill.className = `status-pill ${order.status === 'RECEIVED' ? 'is-success' : order.status === 'FAILED' || order.status === 'CANCELLED' ? 'is-failed' : 'is-waiting'}`
    
    $('#check-button').disabled = order.status === 'CANCELLED' || order.status === 'RECEIVED'
    $('#cancel-button').disabled = order.status === 'CANCELLED' || order.status === 'RECEIVED'
  }
  function busy(button, active, label) { if (active) { button.dataset.label = button.textContent; button.textContent = label; button.disabled = true } else { button.textContent = button.dataset.label; button.disabled = false } }
  function closeDropdowns() { document.querySelectorAll('.custom-select').forEach(dropdown => { dropdown.classList.remove('is-open'); dropdown.querySelector('.select-options').hidden = true; dropdown.querySelector('.select-trigger').setAttribute('aria-expanded', 'false') }) }
  function selectValue(dropdown, value, label) { const input = dropdown.querySelector('input'); input.value = value; dropdown.querySelector('.select-trigger span:first-child').textContent = label; dropdown.querySelectorAll('.select-option').forEach(option => { const selected = option.dataset.value === String(value); option.classList.toggle('is-selected', selected); option.setAttribute('aria-selected', String(selected)) }); closeDropdowns(); dropdown.dispatchEvent(new CustomEvent('selectionchange', { bubbles: true, detail: { value, label } })) }
  function setupDropdown(dropdown) { const trigger = dropdown.querySelector('.select-trigger'); const options = dropdown.querySelector('.select-options'); trigger.addEventListener('click', () => { if (trigger.disabled) return; const isOpen = dropdown.classList.toggle('is-open'); options.hidden = !isOpen; trigger.setAttribute('aria-expanded', String(isOpen)) }); options.addEventListener('click', (event) => { const option = event.target.closest('.select-option'); if (option) selectValue(dropdown, option.dataset.value, option.textContent) }) }
  document.querySelectorAll('.custom-select').forEach(setupDropdown)
  document.addEventListener('click', (event) => { if (!event.target.closest('.custom-select')) closeDropdowns() })

  $('#connect-button').addEventListener('click', async () => { const button = $('#connect-button'); const connection = config(); if (!connection.apiKey) return message('Masukkan API key terlebih dahulu.'); busy(button, true, 'Menghubungkan…'); try { const [services, balance] = await Promise.all([call('/api/otp/services', { providerConfig: connection }), call('/api/otp/balance', { providerConfig: connection })]); state.config = connection; state.services = services.services; saveStoredConfig(connection); $('#revoke-button').hidden = false; const serviceInput = $('#service-select'); const serviceTrigger = $('#service-trigger'); const serviceOptions = $('#service-options'); serviceOptions.innerHTML = state.services.map(item => `<button class="select-option" type="button" role="option" aria-selected="false" data-value="${escapeHtml(item.id)}">${escapeHtml(item.name)}</button>`).join(''); serviceInput.disabled = !state.services.length; serviceTrigger.disabled = !state.services.length; $('#order-button').disabled = !state.services.length; if (state.services.length) selectValue($('#service-dropdown'), state.services[0].id, state.services[0].name); $('#balance-box').hidden = false; $('#balance-value').textContent = new Intl.NumberFormat('id-ID').format(balance.available); status(`${state.services.length} layanan aktif`, 'is-success'); message('Provider & API Key berhasil tersimpan.', 'success') } catch (error) { status('Koneksi gagal', 'is-failed'); message(error.message) } finally { busy(button, false) } })
  $('#order-button').addEventListener('click', async () => {
    if (!state.config) return message('Hubungkan provider terlebih dahulu di Pengaturan.');
    const serviceId = $('#service-select').value;
    if (!serviceId) return message('Silakan pilih layanan terlebih dahulu.');
    const button = $('#order-button');
    busy(button, true, 'Membuat order…');
    try {
      state.order = await call('/api/otp/order', { providerConfig: state.config, serviceId });
      renderOrder();
      addHistory('WAITING');
      message('Order berhasil dibuat. Kode OTP siap dicek.', 'success');

      // Auto Shopee Check & Auto Cancel if enabled
      const autoCancel = $('#auto-cancel-registered')?.checked ?? true;
      if (autoCancel && state.order && state.order.number) {
        message('Memeriksa pendaftaran Shopee untuk nomor baru…', 'success');
        try {
          const checkRes = await call('/api/shopee/check', { phone: state.order.number });
          if (checkRes.registered) {
            message(`Nomor ${state.order.number} TERDAFTAR di Shopee! Membatalkan order otomatis...`);
            await call('/api/otp/action', { providerConfig: state.config, orderRef: state.order.order_id, action: 'cancel' });
            state.order.status = 'CANCELLED';
            renderOrder();
            addHistory('CANCELLED');
            message(`Nomor ${state.order.number} sudah terdaftar Shopee & berhasil dibatalkan otomatis!`);
            setTimeout(() => { state.order = null; renderOrder(); }, 2000);
          } else if (checkRes.available) {
            message(`Nomor ${state.order.number} BELUM TERDAFTAR di Shopee! Silakan lanjutkan.`, 'success');
          }
        } catch (e) {
          // ignore auto check error
        }
      }
    } catch (error) {
      let msg = error.message;
      if (msg.includes('balance') || msg.includes('saldo') || msg.includes('insufficient') || msg.includes('money') || msg.includes('credit') || msg.includes('tidak mencukupi') || msg.includes('400')) {
        msg = 'Saldo provider Anda tidak mencukupi atau transaksi ditolak oleh provider.';
      }
      message(msg);
    } finally {
      busy(button, false);
    }
  })
  $('#check-button').addEventListener('click', async () => { if (!state.order) return; const button = $('#check-button'); busy(button, true, 'Memeriksa…'); try { const data = await call('/api/otp/check', { providerConfig: state.config, token: state.order.token }); Object.assign(state.order, data); renderOrder(); addHistory(data.status); if (data.otp_code) message('Kode verifikasi berhasil diterima.', 'success') } catch (error) { message(error.message) } finally { busy(button, false) } })
  $('#cancel-button').addEventListener('click', async () => { if (!state.order || !confirm('Batalkan order ini?')) return; const button = $('#cancel-button'); busy(button, true, 'Membatalkan…'); try { await call('/api/otp/action', { providerConfig: state.config, orderRef: state.order.order_id, action: 'cancel' }); state.order.status = 'CANCELLED'; renderOrder(); addHistory('CANCELLED'); message('Order berhasil dibatalkan.', 'success'); setTimeout(() => { state.order = null; renderOrder(); }, 1500); } catch (error) { message(error.message) } finally { busy(button, false) } })
  $('#copy-button').addEventListener('click', async () => { if (!state.order) return; try { await navigator.clipboard.writeText(state.order.number); message('Nomor disalin ke clipboard.', 'success') } catch { message('Browser tidak mengizinkan clipboard.') } })
  $('#reveal-key').addEventListener('click', () => { const input = $('#api-key'); input.type = input.type === 'password' ? 'text' : 'password'; $('#reveal-key').textContent = input.type === 'password' ? 'Tampilkan' : 'Sembunyikan' })
  $('#auth-dropdown').addEventListener('selectionchange', () => { $('#header-field').hidden = $('#auth-mode').value !== 'x-api-key' })
  $('.nav-list').addEventListener('click', (event) => { const button = event.target.closest('.nav-link'); if (!button) return; document.querySelectorAll('.nav-link').forEach(x => x.classList.toggle('is-active', x === button)); const view = button.dataset.view; document.querySelectorAll('.view-panel').forEach(x => x.hidden = x.id !== `${view}-view`); $('#page-title').textContent = view === 'dashboard' ? 'Ringkasan aktivitas' : view === 'checker' ? 'Shopee Number Checker' : view === 'activity' ? 'Aktivitas terbaru' : 'Pengaturan tampilan' })
  $('#run-check-button').addEventListener('click', async () => {
    const input = $('#check-phone-input');
    const phone = input.value.trim();
    if (!phone) return message('Masukkan nomor telepon terlebih dahulu.');
    input.value = '';
    const button = $('#run-check-button');
    busy(button, true, 'Memeriksa…');
    try {
      const res = await call('/api/shopee/check', { phone });
      const box = $('#checker-result-box');
      const isReg = res.registered;
      const isAvail = res.available;
      
      box.className = 'active-order-box';
      box.innerHTML = `
        <div class="order-status-badge">
          <span class="status-pill ${isReg ? 'is-failed' : isAvail ? 'is-success' : 'is-waiting'}">${res.status_text}</span>
          <h3>Status Shopee</h3>
        </div>
        <div class="order-phone-display">
          <span class="label">Nomor Dicheck</span>
          <div class="phone-row">
            <strong>${res.phone}</strong>
          </div>
        </div>
        <div class="otp-result-box">
          <span class="label">Keterangan Shopee</span>
          <div class="otp-code-wrapper" style="font-size:16px;">
            ${isReg ? '❌ NOMOR SUDAH TERDAFTAR SHOPEE' : isAvail ? '✅ NOMOR BELUM TERDAFTAR (SIAP PAKAI)' : '⚠️ TIDAK DAPAT DIVERIFIKASI / CAPTCHA'}
          </div>
        </div>
      `;
      message(`Pengecekan nomor ${res.phone} selesai.`, 'success');
    } catch (err) {
      message(err.message);
    } finally {
      busy(button, false);
    }
  })
  $('#clear-history').addEventListener('click', () => { state.history = []; refreshMetrics(); renderHistory() })
  $('#notification-close').addEventListener('click', closeNotification)
  $('#notification-modal').addEventListener('click', (event) => { if (event.target.id === 'notification-modal') closeNotification() })
  document.addEventListener('keydown', (event) => { if (event.key === 'Escape') closeNotification() })
  $('#theme-toggle').addEventListener('click', () => { const current = document.documentElement.dataset.theme; setTheme(current === 'dark' ? 'light' : 'dark') })
  document.querySelectorAll('[data-theme-choice]').forEach(button => button.addEventListener('click', () => setTheme(button.dataset.themeChoice)))
  systemDark.addEventListener('change', () => { if (localStorage.getItem(themeKey) === 'system') setTheme('system') })
  const STORAGE_KEY = 'otp_provider_config'
  
  function saveStoredConfig(cfg) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg)) } catch {}
  }
  function getStoredConfig() {
    try { const raw = localStorage.getItem(STORAGE_KEY); return raw ? JSON.parse(raw) : null } catch { return null }
  }
  function removeStoredConfig() {
    try { localStorage.removeItem(STORAGE_KEY) } catch {}
  }

  async function autoConnect(saved) {
    if (!saved || !saved.apiKey) return
    $('#api-key').value = saved.apiKey
    if (saved.authMode) selectValue($('#auth-dropdown'), saved.authMode, saved.authMode === 'x-api-key' ? 'x-api-key header' : 'Bearer token')
    if (saved.apiKeyHeader) $('#header-name').value = saved.apiKeyHeader
    $('#revoke-button').hidden = false

    try {
      const [services, balance] = await Promise.all([call('/api/otp/services', { providerConfig: saved }), call('/api/otp/balance', { providerConfig: saved })]);
      state.config = saved;
      state.services = services.services;
      const serviceInput = $('#service-select');
      const serviceTrigger = $('#service-trigger');
      const serviceOptions = $('#service-options');
      serviceOptions.innerHTML = state.services.map(item => `<button class="select-option" type="button" role="option" aria-selected="false" data-value="${escapeHtml(item.id)}">${escapeHtml(item.name)}</button>`).join('');
      serviceInput.disabled = !state.services.length;
      serviceTrigger.disabled = !state.services.length;
      $('#order-button').disabled = !state.services.length;
      if (state.services.length) selectValue($('#service-dropdown'), state.services[0].id, state.services[0].name);
      $('#balance-box').hidden = false;
      $('#balance-value').textContent = new Intl.NumberFormat('id-ID').format(balance.available);
      status(`${state.services.length} layanan aktif`, 'is-success');
    } catch (error) {
      status('Tersimpan (Koneksi Gagal)', 'is-failed');
    }
  }

  $('#header-field').hidden = true; setTheme(); refreshMetrics(); renderHistory()
  const savedConfig = getStoredConfig()
  if (savedConfig) autoConnect(savedConfig)

  $('#revoke-button').addEventListener('click', () => {
    if (!confirm('Hapus API key dari penyimpanan lokal?')) return
    removeStoredConfig()
    state.config = null
    state.services = []
    $('#api-key').value = ''
    $('#service-select').disabled = true
    $('#service-trigger').disabled = true
    $('#service-label').textContent = 'Hubungkan provider di Pengaturan terlebih dahulu'
    $('#service-options').innerHTML = ''
    $('#order-button').disabled = true
    $('#balance-box').hidden = true
    $('#revoke-button').hidden = true
    status('Belum terhubung', '')
    message('API Key telah terhapus / direvoke.', 'success')
  })
})()
