'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

const CHECK_INTERVAL_MS = 6000;
const STATUS_SYNC_INTERVAL_MS = 12000;
const BASE_RETRY_DELAY_MS = 700;
const MAX_RETRY_ATTEMPTS = 3;
const PROVIDER_BASE_URL = 'https://dehuyzotp.shop';

const MENU = ['Dashboard', 'Order Monitor', 'API Logs', 'Provider Settings'];
const AUTH_OPTIONS = [
  { id: 'bearer', label: 'Bearer Token' },
  { id: 'x-api-key', label: 'x-api-key Header' },
  { id: 'none', label: 'No Auth' }
];

const PALETTES = [
  {
    id: 'midnight-dark',
    name: 'Midnight Dark',
    preview: ['#09090B', '#18181B', '#27272A', '#A1A1AA'],
    page: 'bg-zinc-950 text-zinc-100',
    stats: ['bg-zinc-900 text-zinc-100', 'bg-zinc-900 text-zinc-100', 'bg-zinc-900 text-zinc-100', 'bg-zinc-900 text-zinc-100'],
    primaryBtn: 'bg-zinc-200 text-zinc-900',
    secondaryBtn: 'bg-zinc-800 text-zinc-100',
    panelA: 'bg-zinc-900/90 text-zinc-100 border-zinc-700',
    panelB: 'bg-zinc-900/90 text-zinc-100 border-zinc-700',
    activeTab: 'bg-zinc-800 text-zinc-100',
    accents: ['bg-zinc-200 text-zinc-900', 'bg-zinc-700 text-zinc-100', 'bg-zinc-800 text-zinc-100', 'bg-zinc-600 text-zinc-100']
  },
  {
    id: 'ocean-blue-white',
    name: 'Ocean Blue White',
    preview: ['#EAF3FF', '#FFFFFF', '#2563EB', '#1E40AF'],
    page: 'bg-sky-50 text-slate-900',
    stats: ['bg-white text-slate-900 border-sky-300', 'bg-white text-slate-900 border-sky-300', 'bg-white text-slate-900 border-sky-300', 'bg-white text-slate-900 border-sky-300'],
    primaryBtn: 'bg-blue-600 text-white',
    secondaryBtn: 'bg-white text-blue-700 border-blue-300',
    panelA: 'bg-white text-slate-900 border-sky-300',
    panelB: 'bg-gradient-to-br from-white to-sky-100 text-slate-900 border-sky-300',
    activeTab: 'bg-blue-600 text-white',
    accents: ['bg-blue-600 text-white', 'bg-sky-500 text-white', 'bg-white text-blue-700', 'bg-blue-800 text-white']
  },
  {
    id: 'google-colors',
    name: 'Google Colors',
    preview: ['#4285F4', '#EA4335', '#FBBC05', '#34A853'],
    page: 'bg-slate-100 text-slate-900',
    stats: ['bg-white text-slate-900 border-slate-300', 'bg-white text-slate-900 border-slate-300', 'bg-white text-slate-900 border-slate-300', 'bg-white text-slate-900 border-slate-300'],
    primaryBtn: 'bg-[#4285F4] text-white',
    secondaryBtn: 'bg-white text-slate-800 border-slate-300',
    panelA: 'bg-white text-slate-900 border-slate-300',
    panelB: 'bg-white text-slate-900 border-slate-300',
    activeTab: 'bg-[#4285F4] text-white',
    accents: ['bg-[#4285F4] text-white', 'bg-[#EA4335] text-white', 'bg-[#34A853] text-white', 'bg-[#FBBC05] text-slate-900']
  }
];

const FALLBACK_SERVICES = [
  { id: '1', name: 'Service #1' },
  { id: '2', name: 'Service #2' },
  { id: '3', name: 'Service #3' }
];

function formatTime(date = new Date()) {
  return new Intl.DateTimeFormat('id-ID', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  }).format(date);
}

function formatDuration(ms = 0) {
  if (!ms || ms <= 0) return '-';
  const totalSec = Math.round(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}m ${sec}s`;
}

function waitMs(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function withAccent(services, palette) {
  const accentCycle = palette.accents || [
    palette.primaryBtn,
    palette.secondaryBtn,
    'bg-zinc-700 text-zinc-100',
    'bg-zinc-800 text-zinc-100'
  ];
  return services.map((item, idx) => ({
    ...item,
    label: item.name,
    accent: accentCycle[idx % accentCycle.length]
  }));
}

function LoadingDots() {
  return (
    <span className="loading-dots inline-flex items-center gap-1" aria-hidden="true">
      <span>•</span>
      <span>•</span>
      <span>•</span>
    </span>
  );
}

function SkeletonBlock({ className }) {
  return <div className={`skeleton rounded-md ${className}`} />;
}

export default function OtpDashboard() {
  const [activeMenu, setActiveMenu] = useState('Dashboard');
  const [paletteId, setPaletteId] = useState(PALETTES[0].id);
  const [apiKey, setApiKey] = useState('');
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [authMenuOpen, setAuthMenuOpen] = useState(false);
  const [manualOverride, setManualOverride] = useState({
    enabled: false,
    authMode: 'bearer',
    apiKeyHeader: 'x-api-key',
    endpoints: {
      services: '',
      order: '',
      check: ''
    }
  });

  const [connection, setConnection] = useState({
    connected: false,
    status: 'Belum diuji',
    detected: null
  });

  const [serviceMenuOpen, setServiceMenuOpen] = useState(false);
  const [services, setServices] = useState(FALLBACK_SERVICES);
  const [serviceId, setServiceId] = useState(FALLBACK_SERVICES[0].id);

  const [order, setOrder] = useState(null);
  const [history, setHistory] = useState([]);
  const [logs, setLogs] = useState([]);
  const [otpState, setOtpState] = useState({ status: 'IDLE', otp_code: null, message: null });
  const [balance, setBalance] = useState({ balance: 0, reserved: 0, available: 0 });

  const [loadingConnect, setLoadingConnect] = useState(false);
  const [loadingOrder, setLoadingOrder] = useState(false);
  const [loadingCheck, setLoadingCheck] = useState(false);
  const [loadingRetry, setLoadingRetry] = useState(false);
  const [loadingAction, setLoadingAction] = useState(false);
  const [bootstrapping, setBootstrapping] = useState(true);

  const [autoCheck, setAutoCheck] = useState(false);
  const [nextCheckInMs, setNextCheckInMs] = useState(CHECK_INTERVAL_MS);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');
  const [isTabActive, setIsTabActive] = useState(true);
  const [logQuery, setLogQuery] = useState('');
  const [logTypeFilter, setLogTypeFilter] = useState('ALL');
  const [logStatusFilter, setLogStatusFilter] = useState('ALL');

  const [numberPanelPulse, setNumberPanelPulse] = useState(false);
  const [otpStatusPulse, setOtpStatusPulse] = useState(false);

  const dropdownRef = useRef(null);
  const authDropdownRef = useRef(null);
  const lastSyncSignatureRef = useRef('');

  const palette = useMemo(
    () => PALETTES.find((p) => p.id === paletteId) || PALETTES[0],
    [paletteId]
  );

  const decoratedServices = useMemo(() => withAccent(services, palette), [services, palette]);

  const selectedService = useMemo(
    () => decoratedServices.find((service) => service.id === serviceId) || decoratedServices[0],
    [decoratedServices, serviceId]
  );

  const stats = useMemo(() => {
    const totalOrder = history.length;
    const received = history.filter((item) => item.status === 'RECEIVED').length;
    const waiting = history.filter(
      (item) => item.status === 'WAITING' || item.status === 'PENDING_OTP'
    ).length;
    const successRate = totalOrder ? Math.round((received / totalOrder) * 100) : 0;

    return { totalOrder, received, waiting, successRate };
  }, [history]);

  const slaStats = useMemo(() => {
    const doneOrders = history.filter((item) => item.status === 'RECEIVED');
    const leadTimes = doneOrders
      .map((item) => {
        if (!item.ordered_at_ms || !item.received_at_ms) return null;
        return Math.max(0, item.received_at_ms - item.ordered_at_ms);
      })
      .filter((value) => Number.isFinite(value));

    const avgMs = leadTimes.length
      ? Math.round(leadTimes.reduce((sum, value) => sum + value, 0) / leadTimes.length)
      : 0;

    const perServiceMap = history.reduce((acc, item) => {
      const key = String(item.service_id || 'unknown');
      if (!acc[key]) {
        acc[key] = { service_id: key, total: 0, success: 0 };
      }
      acc[key].total += 1;
      if (item.status === 'RECEIVED') acc[key].success += 1;
      return acc;
    }, {});

    const perService = Object.values(perServiceMap)
      .map((item) => ({
        ...item,
        rate: item.total ? Math.round((item.success / item.total) * 100) : 0
      }))
      .sort((a, b) => b.rate - a.rate);

    const perHourMap = doneOrders.reduce((acc, item) => {
      if (!item.received_at_ms) return acc;
      const hourDate = new Date(item.received_at_ms);
      const hourLabel = `${String(hourDate.getHours()).padStart(2, '0')}:00`;
      if (!acc[hourLabel]) {
        acc[hourLabel] = { hour: hourLabel, count: 0, totalMs: 0, avgMs: 0 };
      }
      acc[hourLabel].count += 1;
      acc[hourLabel].totalMs += item.elapsed_ms || 0;
      acc[hourLabel].avgMs = Math.round(acc[hourLabel].totalMs / acc[hourLabel].count);
      return acc;
    }, {});

    const perHour = Object.values(perHourMap)
      .sort((a, b) => a.hour.localeCompare(b.hour))
      .slice(-6);

    const peakHour = perHour.reduce((best, current) => {
      if (!best) return current;
      return current.count > best.count ? current : best;
    }, null);

    return {
      avgMs,
      avgText: formatDuration(avgMs),
      totalDone: doneOrders.length,
      perService,
      perHour,
      peakHour
    };
  }, [history]);

  const logTypes = useMemo(() => ['ALL', ...Array.from(new Set(logs.map((log) => log.type)))], [logs]);
  const logStatuses = useMemo(() => ['ALL', ...Array.from(new Set(logs.map((log) => log.status)))], [logs]);

  const filteredLogs = useMemo(() => {
    const query = logQuery.trim().toLowerCase();
    return logs.filter((log) => {
      if (logTypeFilter !== 'ALL' && log.type !== logTypeFilter) return false;
      if (logStatusFilter !== 'ALL' && log.status !== logStatusFilter) return false;
      if (!query) return true;

      const haystack = `${log.type} ${log.status} ${log.message} ${JSON.stringify(log.payload || {})}`.toLowerCase();
      return haystack.includes(query);
    });
  }, [logs, logQuery, logTypeFilter, logStatusFilter]);

  const countdownSec = Math.max(0.1, nextCheckInMs / 1000).toFixed(1);
  const countdownPct = Math.max(0, Math.min(100, (nextCheckInMs / CHECK_INTERVAL_MS) * 100));

  function addLog(type, status, message, payload = null) {
    setLogs((prev) =>
      [
        {
          id: `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
          time: formatTime(),
          type,
          status,
          message,
          payload
        },
        ...prev
      ].slice(0, 50)
    );
  }

  async function postJsonWithBackoff(url, body, options = {}) {
    const maxAttempts = options.maxAttempts || MAX_RETRY_ATTEMPTS;
    const baseDelayMs = options.baseDelayMs || BASE_RETRY_DELAY_MS;
    let lastError = null;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body || {})
        });

        const data = await response.json();
        if (!response.ok || !data.success) {
          throw new Error(data.error || `HTTP ${response.status}`);
        }

        return data;
      } catch (errorObj) {
        lastError = errorObj;
        if (attempt >= maxAttempts) break;

        const delayMs = baseDelayMs * 2 ** (attempt - 1);
        if (typeof options.onRetry === 'function') {
          options.onRetry({ attempt, delayMs, error: errorObj });
        }
        await waitMs(delayMs);
      }
    }

    throw lastError || new Error('Request gagal setelah retry.');
  }

  function updateManualOverride(path, value) {
    setManualOverride((prev) => {
      if (!path.includes('.')) {
        return { ...prev, [path]: value };
      }

      const [group, key] = path.split('.');
      return {
        ...prev,
        [group]: {
          ...prev[group],
          [key]: value
        }
      };
    });
  }

  function buildProviderConfig() {
    const detected = connection.detected || {};
    const detectedEndpoints = detected.endpoints || {};

    const finalAuthMode = manualOverride.enabled
      ? manualOverride.authMode
      : detected.authMode || '';

    const finalApiKeyHeader = manualOverride.enabled
      ? manualOverride.apiKeyHeader
      : detected.apiKeyHeader || 'x-api-key';

    const finalEndpoints = {
      services: manualOverride.enabled
        ? manualOverride.endpoints.services || detectedEndpoints.services || ''
        : detectedEndpoints.services || '',
      order: manualOverride.enabled
        ? manualOverride.endpoints.order || detectedEndpoints.order || ''
        : detectedEndpoints.order || '',
      check: manualOverride.enabled
        ? manualOverride.endpoints.check || detectedEndpoints.check || ''
        : detectedEndpoints.check || ''
    };

    const cleanedEndpoints = Object.fromEntries(
      Object.entries(finalEndpoints).filter(([, value]) => String(value || '').trim().length > 0)
    );

    return {
      baseUrl: PROVIDER_BASE_URL,
      apiKey,
      authMode: finalAuthMode,
      apiKeyHeader: finalApiKeyHeader,
      endpoints: cleanedEndpoints
    };
  }

  function upsertHistory(payload = {}) {
    const trackId = payload.token || payload.order_id;
    if (!trackId) return;

    setHistory((prev) => {
      const index = prev.findIndex((item) => item.track_id === trackId);
      const existing = index >= 0 ? prev[index] : null;

      const nextStatus = payload.status ?? existing?.status ?? 'WAITING';
      const nextOtp = payload.otp_code ?? existing?.otp_code ?? null;
      const orderedAtMs = payload.ordered_at_ms ?? existing?.ordered_at_ms ?? Date.now();
      const receivedAtMs = payload.received_at_ms
        ?? existing?.received_at_ms
        ?? (nextStatus === 'RECEIVED' && nextOtp ? Date.now() : null);

      const nextItem = {
        track_id: trackId,
        order_id: payload.order_id ?? existing?.order_id ?? '-',
        token: payload.token ?? existing?.token ?? '-',
        number: payload.number ?? existing?.number ?? '-',
        service_id: payload.service_id ?? existing?.service_id ?? '-',
        status: nextStatus,
        otp_code: nextOtp,
        ordered_at_ms: orderedAtMs,
        received_at_ms: receivedAtMs,
        elapsed_ms: receivedAtMs ? Math.max(0, receivedAtMs - orderedAtMs) : null,
        timestamp: formatTime()
      };

      if (index < 0) return [nextItem, ...prev].slice(0, 50);

      const updated = [...prev];
      updated[index] = nextItem;
      return updated;
    });
  }

  async function refreshBalance(providerConfig) {
    try {
      const response = await fetch('/api/otp/balance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ providerConfig })
      });

      const data = await response.json();
      if (!response.ok || !data.success) return;

      setBalance({
        balance: Number(data.balance || 0),
        reserved: Number(data.reserved || 0),
        available: Number(data.available || 0)
      });

      addLog('BALANCE', 'SUCCESS', 'Saldo provider berhasil di-refresh', data.raw || data);
    } catch {
      // optional endpoint, silently ignore
    }
  }

  async function testConnection() {
    if (!apiKey.trim()) {
      setError('Isi API key dulu ya.');
      return;
    }

    setLoadingConnect(true);
    setError('');

    try {
      const providerConfig = {
        ...buildProviderConfig(),
        apiKey: apiKey.trim()
      };

      const response = await fetch('/api/otp/services', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ providerConfig })
      });

      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Gagal konek ke provider.');
      }

      const serviceList = Array.isArray(data.services) && data.services.length > 0
        ? data.services
        : FALLBACK_SERVICES;

      setServices(serviceList);
      setServiceId(serviceList[0].id);
      setConnection({
        connected: true,
        status: `Terkoneksi (${serviceList.length} layanan terbaca)`,
        detected: data.detected || null
      });

      await refreshBalance(providerConfig);
      addLog('CONNECT', 'SUCCESS', 'Koneksi provider berhasil', data.detected || data);
    } catch (err) {
      setConnection({ connected: false, status: 'Gagal konek', detected: null });
      setError(err.message);
      addLog('CONNECT', 'ERROR', err.message);
    } finally {
      setLoadingConnect(false);
      setBootstrapping(false);
    }
  }

  async function handleOrderNumber() {
    if (!connection.connected) {
      setError('Tes koneksi provider dulu sebelum request nomor.');
      return;
    }

    setLoadingOrder(true);
    setError('');
    setOtpState({ status: 'IDLE', otp_code: null, message: null });

    try {
      const response = await fetch('/api/otp/order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          serviceId,
          providerConfig: buildProviderConfig()
        })
      });

      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Gagal meminta nomor OTP.');
      }

      if (!data.token || !data.number) {
        throw new Error('Response provider tidak lengkap: token/phone tidak ditemukan.');
      }

      const nowMs = Date.now();
      lastSyncSignatureRef.current = '';
      setOrder({ ...data, ordered_at_ms: nowMs });
      setNumberPanelPulse(true);
      setTimeout(() => setNumberPanelPulse(false), 260);
      setNextCheckInMs(CHECK_INTERVAL_MS);

      setConnection((prev) => ({
        ...prev,
        detected: data.detected || prev.detected
      }));

      upsertHistory({
        token: data.token,
        order_id: data.order_id,
        number: data.number,
        service_id: data.service_id,
        status: data.status,
        otp_code: null,
        ordered_at_ms: nowMs
      });

      addLog('ORDER', 'SUCCESS', `Order nomor untuk ${serviceId} berhasil`, data.raw || data);
    } catch (err) {
      setError(err.message);
      addLog('ORDER', 'ERROR', err.message);
    } finally {
      setLoadingOrder(false);
    }
  }

  async function handleCheckOtp() {
    if (!order?.token || loadingCheck) return;

    setLoadingCheck(true);
    setError('');

    try {
      const data = await postJsonWithBackoff(
        '/api/otp/check',
        {
          token: order.token,
          timeout: 60,
          providerConfig: buildProviderConfig()
        },
        {
          onRetry: ({ attempt, delayMs }) => {
            addLog('CHECK_OTP', 'INFO', `Retry ${attempt}/${MAX_RETRY_ATTEMPTS - 1} dalam ${Math.round(delayMs / 1000)}s`);
          }
        }
      );

      setOtpState({
        status: data.status,
        otp_code: data.otp_code,
        message: data.message
      });

      setOtpStatusPulse(true);
      setTimeout(() => setOtpStatusPulse(false), 260);
      setNextCheckInMs(CHECK_INTERVAL_MS);

      setConnection((prev) => ({
        ...prev,
        detected: data.detected || prev.detected
      }));

      upsertHistory({
        token: order.token,
        order_id: order.order_id,
        number: order.number,
        service_id: order.service_id,
        status: data.status,
        otp_code: data.otp_code,
        ordered_at_ms: order.ordered_at_ms
      });

      addLog('CHECK_OTP', 'SUCCESS', `Status: ${data.status}`, data.raw || data);
    } catch (err) {
      setError(err.message);
      addLog('CHECK_OTP', 'ERROR', err.message);
    } finally {
      setLoadingCheck(false);
    }
  }

  async function syncOrderStatus() {
    if (!order?.token) return;

    try {
      const data = await postJsonWithBackoff(
        '/api/otp/status',
        {
          orderRef: order.order_id || order.token,
          providerConfig: buildProviderConfig()
        },
        {
          onRetry: ({ attempt, delayMs }) => {
            addLog('STATUS_SYNC', 'INFO', `Retry ${attempt}/${MAX_RETRY_ATTEMPTS - 1} dalam ${Math.round(delayMs / 1000)}s`);
          }
        }
      );

      const nextOrder = {
        ...order,
        order_id: data.order_id || order.order_id,
        token: data.token || order.token,
        number: data.number || order.number,
        service_id: data.service_id || order.service_id,
        status: data.status || order.status,
        ordered_at_ms: order.ordered_at_ms || Date.now()
      };

      const signature = `${nextOrder.status}|${data.otp_code || ''}|${nextOrder.number}`;
      const hasMeaningfulChange = signature !== lastSyncSignatureRef.current;

      setOrder(nextOrder);
      upsertHistory({
        token: nextOrder.token,
        order_id: nextOrder.order_id,
        number: nextOrder.number,
        service_id: nextOrder.service_id,
        status: data.status,
        otp_code: data.otp_code,
        ordered_at_ms: nextOrder.ordered_at_ms
      });

      if (hasMeaningfulChange) {
        setOtpState((prev) => ({
          status: data.status || prev.status,
          otp_code: data.otp_code ?? prev.otp_code,
          message: data.otp_code
            ? 'OTP terdeteksi dari auto status sync.'
            : `Status order sinkron: ${data.status || 'WAITING'}`
        }));
        lastSyncSignatureRef.current = signature;
        addLog('STATUS_SYNC', 'SUCCESS', `Status sinkron: ${data.status || '-'}`, data.raw || data);
      }
    } catch (err) {
      addLog('STATUS_SYNC', 'ERROR', err.message || 'Auto sync status gagal');
    }
  }

  async function handleRetryOtp() {
    if (!order?.token || loadingRetry) return;

    setLoadingRetry(true);
    setError('');

    try {
      const response = await fetch('/api/otp/retry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: order.token,
          providerConfig: buildProviderConfig()
        })
      });

      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Gagal retry OTP.');
      }

      const merged = {
        ...order,
        token: data.token || order.token,
        order_id: data.order_id || order.order_id,
        number: data.number || order.number,
        expires_at: data.expires_at || order.expires_at,
        status: data.status || 'PENDING_OTP',
        ordered_at_ms: Date.now()
      };

      lastSyncSignatureRef.current = '';
      setOrder(merged);
      setOtpState({ status: 'WAITING', otp_code: null, message: 'Retry dikirim. Tunggu OTP baru.' });
      setNextCheckInMs(CHECK_INTERVAL_MS);
      upsertHistory(merged);
      addLog('RETRY', 'SUCCESS', 'Retry OTP berhasil dipanggil', data.raw || data);
    } catch (err) {
      setError(err.message);
      addLog('RETRY', 'ERROR', err.message);
    } finally {
      setLoadingRetry(false);
    }
  }

  async function handleOrderAction(action) {
    if ((!order?.order_id && !order?.token) || loadingAction) return;
    if (action === 'done' && !otpState.otp_code) {
      setError('Action DONE hanya bisa dipakai setelah OTP benar-benar diterima.');
      return;
    }

    setLoadingAction(true);
    setError('');

    try {
      const response = await fetch('/api/otp/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderRef: order.order_id || order.token,
          action,
          providerConfig: buildProviderConfig()
        })
      });

      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Gagal menjalankan action order.');
      }

      const nextStatus = action === 'done' ? 'RECEIVED' : 'CANCELLED';
      setOtpState((prev) => ({
        ...prev,
        status: nextStatus,
        message: action === 'done' ? 'Order ditandai DONE.' : `Order dibatalkan. Refund: ${data.refunded ?? 0}`
      }));

      upsertHistory({
        token: order.token,
        order_id: order.order_id,
        number: order.number,
        service_id: order.service_id,
        status: nextStatus,
        otp_code: otpState.otp_code
      });

      addLog('ORDER_ACTION', 'SUCCESS', `Action ${action} berhasil`, data.raw || data);
      await refreshBalance(buildProviderConfig());
    } catch (err) {
      setError(err.message);
      addLog('ORDER_ACTION', 'ERROR', err.message);
    } finally {
      setLoadingAction(false);
    }
  }

  async function copyNumber() {
    if (!order?.number) return;
    await navigator.clipboard.writeText(order.number);
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  }

  function exportLogsAsJson() {
    const payload = {
      exported_at: new Date().toISOString(),
      total_logs: logs.length,
      logs
    };

    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `otp-uyeee-logs-${Date.now()}.json`;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
  }

  function exportLogsAsCsv() {
    const escapeCsv = (value) => {
      const text = String(value ?? '');
      if (text.includes(',') || text.includes('"') || text.includes('\n')) {
        return `"${text.replaceAll('"', '""')}"`;
      }
      return text;
    };

    const header = ['time', 'type', 'status', 'message', 'payload'];
    const rows = filteredLogs.map((log) => [
      log.time,
      log.type,
      log.status,
      log.message,
      JSON.stringify(log.payload || {})
    ]);

    const csvText = [header, ...rows]
      .map((row) => row.map((col) => escapeCsv(col)).join(','))
      .join('\n');

    const blob = new Blob([csvText], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `otp-uyeee-logs-${Date.now()}.csv`;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
  }

  function clearSession() {
    lastSyncSignatureRef.current = '';
    setOrder(null);
    setOtpState({ status: 'IDLE', otp_code: null, message: null });
    setAutoCheck(false);
    setNextCheckInMs(CHECK_INTERVAL_MS);
    addLog('SESSION', 'INFO', 'Session direset user');
  }

  useEffect(() => {
    if (!error) return;
    const timer = setTimeout(() => {
      setError('');
    }, 4200);

    return () => clearTimeout(timer);
  }, [error]);

  useEffect(() => {
    const onVisibilityChange = () => {
      const active = document.visibilityState === 'visible';
      setIsTabActive(active);
      if (!active) {
        addLog('APP_STATE', 'INFO', 'Tab tidak aktif: auto polling & auto sync dijeda.');
      } else {
        addLog('APP_STATE', 'INFO', 'Tab aktif kembali: auto polling & auto sync dilanjutkan.');
      }
    };

    onVisibilityChange();
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => document.removeEventListener('visibilitychange', onVisibilityChange);
  }, []);

  useEffect(() => {
    const savedPalette = localStorage.getItem('otp-uyeee-palette');
    const savedApiKey = localStorage.getItem('otp-uyeee-api-key');
    const savedOverride = localStorage.getItem('otp-uyeee-manual-override');

    if (savedPalette && PALETTES.some((item) => item.id === savedPalette)) {
      setPaletteId(savedPalette);
    } else {
      setPaletteId(PALETTES[0].id);
      localStorage.setItem('otp-uyeee-palette', PALETTES[0].id);
    }
    if (savedApiKey) setApiKey(savedApiKey);
    if (savedOverride) {
      try {
        setManualOverride((prev) => ({
          ...prev,
          ...JSON.parse(savedOverride),
          endpoints: {
            ...prev.endpoints,
            ...(JSON.parse(savedOverride)?.endpoints || {})
          }
        }));
      } catch {
        // ignore parse error
      }
    }

    setBootstrapping(false);
  }, []);

  useEffect(() => {
    localStorage.setItem('otp-uyeee-palette', paletteId);
  }, [paletteId]);

  useEffect(() => {
    localStorage.setItem('otp-uyeee-api-key', apiKey);
  }, [apiKey]);

  useEffect(() => {
    localStorage.setItem('otp-uyeee-manual-override', JSON.stringify(manualOverride));
  }, [manualOverride]);

  useEffect(() => {
    if (!autoCheck || !order?.token || !isTabActive) return;

    const pollTimer = setInterval(() => {
      handleCheckOtp();
    }, CHECK_INTERVAL_MS);

    return () => clearInterval(pollTimer);
  }, [autoCheck, order?.token, isTabActive]);

  useEffect(() => {
    if (!autoCheck || !order?.token || !isTabActive) {
      setNextCheckInMs(CHECK_INTERVAL_MS);
      return;
    }

    const countdownTimer = setInterval(() => {
      setNextCheckInMs((prev) => {
        if (prev <= 200) return CHECK_INTERVAL_MS;
        return prev - 200;
      });
    }, 200);

    return () => clearInterval(countdownTimer);
  }, [autoCheck, order?.token, isTabActive]);

  useEffect(() => {
    if (!order?.token || !isTabActive) return;

    syncOrderStatus();
    const syncTimer = setInterval(() => {
      syncOrderStatus();
    }, STATUS_SYNC_INTERVAL_MS);

    return () => clearInterval(syncTimer);
  }, [order?.token, isTabActive]);

  useEffect(() => {
    function onClickOutside(event) {
      if (!dropdownRef.current?.contains(event.target)) {
        setServiceMenuOpen(false);
      }
      if (!authDropdownRef.current?.contains(event.target)) {
        setAuthMenuOpen(false);
      }
    }

    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  return (
    <main className={`mx-auto min-h-screen max-w-[1700px] overflow-x-hidden overflow-y-auto px-2 py-2 md:h-screen md:px-3 md:py-3 ${palette.page}`}>
      <header className="neo-glass neo-panel mb-2 p-2.5 md:p-3">
        <div className="flex flex-wrap items-center justify-between gap-2.5">
          <div>
            <p className="neo-badge mb-2">OTP Uyeee</p>
            <h1 className="text-lg font-black leading-tight md:text-2xl">Soft Brutalism OTP Command Center</h1>
            <p className="mt-1 text-[11px] font-semibold text-zinc-400">
              Compact mode + endpoint resmi token-based: /api/rent → /api/sms/{token}.
            </p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <button className="neo-btn bg-zinc-800 text-zinc-100 text-sm" onClick={testConnection} disabled={loadingConnect}>
              {loadingConnect ? (
                <>
                  Testing <LoadingDots />
                </>
              ) : (
                'Test Connection'
              )}
            </button>
            <button className={`neo-btn ${palette.secondaryBtn} text-sm`} onClick={() => setActiveMenu('Provider Settings')}>
              Provider Settings
            </button>
          </div>
        </div>

        <nav className="mt-2 flex flex-wrap gap-1.5">
          {MENU.map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setActiveMenu(item)}
              className={`neo-menu-item ${activeMenu === item ? `border-zinc-500 ${palette.activeTab}` : ''}`}
            >
              {item}
            </button>
          ))}
        </nav>
      </header>

      {error ? (
        <div className="pointer-events-none fixed right-3 top-3 z-50 w-[min(92vw,520px)] rounded-lg border-2 border-red-500/60 bg-red-950/95 px-3 py-2 text-xs font-bold text-red-100 shadow-neo">
          <p>{error}</p>
          {error.toLowerCase().includes('saldo provider tidak cukup') ? (
            <p className="mt-1 text-[11px] font-semibold text-red-200">
              Hint: top up saldo provider dulu, lalu klik <b>Test Koneksi</b> lagi.
            </p>
          ) : null}
        </div>
      ) : null}

      {activeMenu === 'Dashboard' ? (
        <div className="scroll-hidden flex min-h-0 flex-col overflow-y-auto md:h-[calc(100vh-128px)]">
          <section className="mb-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {bootstrapping ? (
              [...Array(4)].map((_, idx) => (
                <article key={idx} className="neo-stat">
                  <SkeletonBlock className="h-4 w-24" />
                  <SkeletonBlock className="mt-3 h-8 w-20" />
                </article>
              ))
            ) : (
              <>
                <article className={`neo-stat ${palette.stats[0]}`}>
                  <p className="text-xs font-extrabold uppercase">Total Order</p>
                  <p className="mt-1 text-xl font-black">{stats.totalOrder}</p>
                </article>
                <article className={`neo-stat ${palette.stats[1]}`}>
                  <p className="text-xs font-extrabold uppercase">OTP Received</p>
                  <p className="mt-1 text-xl font-black">{stats.received}</p>
                </article>
                <article className={`neo-stat ${palette.stats[2]}`}>
                  <p className="text-xs font-extrabold uppercase">Waiting OTP</p>
                  <p className="mt-1 text-xl font-black">{stats.waiting}</p>
                </article>
                <article className={`neo-stat ${palette.stats[3]}`}>
                  <p className="text-xs font-extrabold uppercase">Saldo Available</p>
                  <p className="mt-2 text-sm font-black">Rp {balance.available.toLocaleString('id-ID')}</p>
                </article>
              </>
            )}
          </section>


          <section className="grid gap-2 md:min-h-0 md:flex-1 lg:grid-cols-[1.15fr_1fr_1fr]">
            <article className={`neo-card neo-panel ${palette.panelA} p-3 md:p-3.5`}>
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-lg font-black">Request OTP Number</h2>
                <span className="rounded-md border-2 border-zinc-600 bg-zinc-800 px-2 py-1 text-xs font-extrabold">
                  {selectedService?.label}
                </span>
              </div>

              <div ref={dropdownRef} className="relative">
                <p className="mb-2 text-xs font-extrabold uppercase">Service (custom dropdown)</p>
                <button
                  type="button"
                  onClick={() => setServiceMenuOpen((prev) => !prev)}
                  className="neo-input flex items-center justify-between"
                  aria-haspopup="listbox"
                  aria-expanded={serviceMenuOpen}
                >
                  <span>{selectedService?.label || 'Pilih service'}</span>
                  <span className="text-lg">▾</span>
                </button>

                {serviceMenuOpen ? (
                  <ul
                    className="scroll-hidden absolute z-20 mt-2 max-h-60 w-full overflow-auto rounded-lg border-2 border-zinc-700 bg-zinc-900 p-2 shadow-neo"
                    role="listbox"
                  >
                    {decoratedServices.map((service) => (
                      <li key={service.id}>
                        <button
                          type="button"
                          className={`w-full rounded-md border-2 px-3 py-2 text-left text-sm font-bold transition hover:-translate-y-[1px] hover:shadow-neo-sm ${
                            serviceId === service.id
                              ? 'border-zinc-500 bg-zinc-700 text-zinc-100'
                              : 'border-transparent bg-zinc-900 text-zinc-300'
                          }`}
                          onClick={() => {
                            setServiceId(service.id);
                            setServiceMenuOpen(false);
                          }}
                        >
                          {service.label}
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>

              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={handleOrderNumber}
                  disabled={loadingOrder || !connection.connected}
                  className={`neo-btn ${selectedService?.accent ?? palette.primaryBtn}`}
                >
                  {loadingOrder ? (
                    <>
                      Memproses <LoadingDots />
                    </>
                  ) : (
                    'Request Nomor'
                  )}
                </button>
                <button type="button" onClick={clearSession} className="neo-btn bg-zinc-800 text-zinc-100">
                  Reset Session
                </button>
              </div>
            </article>

            <article className={`neo-card neo-panel ${palette.panelA} p-3 md:p-3.5`}>
              <h2 className="text-lg font-black">Nomor Aktif & OTP Inbox</h2>
              <p className="mt-1 text-xs font-bold uppercase tracking-wide">Order ID: {order?.order_id ?? '-'} · Token: {order?.token ?? '-'}</p>

              <div className={`neo-panel mt-3 rounded-lg border-2 border-zinc-700 bg-zinc-900 p-3 ${numberPanelPulse ? 'scale-[1.01]' : ''}`}>
                <p className="text-[11px] font-extrabold uppercase text-zinc-400">Nomor Virtual</p>
                {loadingOrder && !order?.number ? (
                  <SkeletonBlock className="mt-3 h-10 w-full" />
                ) : (
                  <p className="mt-2 break-all text-xl font-black md:text-2xl">{order?.number ?? 'Belum ada nomor'}</p>
                )}
                <button type="button" className="neo-btn mt-3 w-full bg-zinc-800 text-zinc-100" onClick={copyNumber} disabled={!order?.number}>
                  {copied ? 'Tersalin ✓' : 'Copy Nomor'}
                </button>
              </div>

              <div className="neo-panel mt-3 rounded-lg border-2 border-zinc-700 bg-zinc-900 p-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs font-extrabold uppercase">OTP Realtime Check</p>
                  <label className="inline-flex cursor-pointer items-center gap-2 text-xs font-extrabold">
                    <input
                      type="checkbox"
                      className="h-4 w-4 accent-ink"
                      checked={autoCheck}
                      onChange={(event) => setAutoCheck(event.target.checked)}
                      disabled={!order?.token}
                    />
                    Auto 6s
                  </label>
                </div>

                <div className={`mt-2 rounded-md border-2 border-zinc-700 p-2.5 text-2xl font-black tracking-widest ${otpState.status === 'RECEIVED' ? 'bg-emerald-900/50 text-emerald-200' : 'bg-zinc-800 text-zinc-100'} ${otpStatusPulse ? 'status-pop' : ''}`}>
                  {loadingCheck && !otpState.otp_code ? <SkeletonBlock className="h-8 w-full" /> : otpState.otp_code ?? '------'}
                </div>
                <p className="mt-2 min-h-8 text-xs font-semibold text-zinc-300">{otpState.message ?? 'Belum ada update OTP.'}</p>

                {autoCheck && order?.token ? (
                  <div className="mt-1 rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2">
                    <div className="flex items-center justify-between text-xs font-bold">
                      <span>Next check in {isTabActive ? '' : '(paused: tab inactive)'}</span>
                      <span>{countdownSec}s</span>
                    </div>
                    <div className="otp-progress-track">
                      <div className="otp-progress-bar" style={{ width: `${countdownPct}%` }} />
                    </div>
                  </div>
                ) : null}

                <button type="button" className={`neo-btn mt-3 w-full ${palette.primaryBtn}`} onClick={handleCheckOtp} disabled={!order?.token || loadingCheck}>
                  {loadingCheck ? (
                    <>
                      Checking <LoadingDots />
                    </>
                  ) : (
                    'Cek Inbox / OTP'
                  )}
                </button>

                <div className="mt-3 grid gap-2 sm:grid-cols-3">
                  <button type="button" className="neo-btn-sm bg-zinc-800 text-zinc-100" onClick={handleRetryOtp} disabled={!order?.token || loadingRetry}>
                    {loadingRetry ? 'Retrying...' : 'Retry OTP'}
                  </button>
                  <button
                    type="button"
                    className="neo-btn-sm bg-emerald-700 text-emerald-100"
                    onClick={() => handleOrderAction('done')}
                    disabled={(!order?.order_id && !order?.token) || loadingAction || !otpState.otp_code}
                    title={!otpState.otp_code ? 'Done aktif setelah OTP diterima' : 'Tandai order selesai'}
                  >
                    {loadingAction ? 'Processing...' : 'Done'}
                  </button>
                  <button
                    type="button"
                    className="neo-btn-sm bg-rose-800 text-rose-100"
                    onClick={() => handleOrderAction('cancel')}
                    disabled={(!order?.order_id && !order?.token) || loadingAction}
                  >
                    {loadingAction ? 'Processing...' : 'Cancel'}
                  </button>
                </div>
              </div>
            </article>

            <article className={`neo-card neo-panel ${palette.panelB} p-3 md:p-3.5 min-h-0`}>
              <h2 className="text-lg font-black">Order Monitor</h2>
              <p className="mt-1 text-sm font-semibold">Ringkas 8 order terbaru.</p>

              <div className="scroll-hidden mt-3 max-h-full space-y-2 overflow-auto pr-1">
                {history.length === 0 ? (
                  <div className="rounded-md border-2 border-dashed border-zinc-700 bg-zinc-900 p-3 text-sm font-semibold text-zinc-300">
                    Belum ada data. Tes koneksi lalu request nomor.
                  </div>
                ) : (
                  history.slice(0, 8).map((item) => (
                    <div key={item.track_id} className="rounded-lg border-2 border-zinc-700 bg-zinc-900 p-2.5 shadow-neo-sm">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-xs font-extrabold uppercase">{item.service_id}</p>
                        <span className="rounded-md border border-zinc-600 bg-zinc-800 px-2 py-0.5 text-[11px] font-black text-zinc-200">{item.status}</span>
                      </div>
                      <p className="mt-1 truncate text-sm font-bold">{item.number}</p>
                      <p className="mt-1 truncate text-[11px] font-semibold">Token: {item.token}</p>
                      <p className="mt-1 text-[11px] font-semibold">Lead Time: {item.elapsed_ms ? formatDuration(item.elapsed_ms) : '-'}</p>
                    </div>
                  ))
                )}
              </div>
            </article>
          </section>

          <section className="mt-2 grid gap-2 lg:grid-cols-3">
            <article className={`neo-card ${palette.panelA} p-3`}>
              <p className="text-xs font-extrabold uppercase">SLA: Rata-rata Waktu OTP</p>
              <p className="mt-1 text-xl font-black">{slaStats.avgText}</p>
              <p className="mt-1 text-xs font-semibold">Dari {slaStats.totalDone} order sukses (status RECEIVED).</p>
            </article>
            <article className={`neo-card ${palette.panelA} p-3`}>
              <p className="text-xs font-extrabold uppercase">SLA: Success Rate per Service</p>
              <div className="mt-2 space-y-2">
                {slaStats.perService.length === 0 ? (
                  <p className="text-xs font-semibold">Belum ada data service.</p>
                ) : (
                  slaStats.perService.slice(0, 3).map((svc) => (
                    <div key={svc.service_id} className="flex items-center justify-between rounded border-2 border-zinc-700 bg-zinc-800 px-2 py-1 text-xs font-bold">
                      <span>{svc.service_id}</span>
                      <span>{svc.rate}% ({svc.success}/{svc.total})</span>
                    </div>
                  ))
                )}
              </div>
            </article>
            <article className={`neo-card ${palette.panelA} p-3`}>
              <p className="text-xs font-extrabold uppercase">Mini Chart: OTP Sukses per Jam</p>
              <p className="mt-1 text-xs font-semibold">
                Peak hour: {slaStats.peakHour ? `${slaStats.peakHour.hour} (${slaStats.peakHour.count} OTP)` : '-'}
              </p>
              <div className="mt-3 space-y-2">
                {slaStats.perHour.length === 0 ? (
                  <p className="text-xs font-semibold">Belum ada data jam sukses.</p>
                ) : (
                  slaStats.perHour.map((slot) => {
                    const maxCount = Math.max(...slaStats.perHour.map((item) => item.count), 1);
                    const width = Math.max(8, Math.round((slot.count / maxCount) * 100));
                    return (
                      <div key={slot.hour}>
                        <div className="mb-1 flex items-center justify-between text-[11px] font-bold">
                          <span>{slot.hour}</span>
                          <span>{slot.count} OTP · avg {formatDuration(slot.avgMs)}</span>
                        </div>
                        <div className="h-3 rounded border-2 border-zinc-700 bg-zinc-800">
                          <div className="h-full rounded-sm bg-zinc-200" style={{ width: `${width}%` }} />
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </article>
          </section>
        </div>
      ) : null}

      {activeMenu === 'Order Monitor' ? (
        <section className="neo-card p-4 md:p-4">
          <h2 className="text-xl font-black">Order Monitor</h2>
          <p className="mt-1 text-sm font-semibold">Riwayat order lengkap (lokal session).</p>

          <div className="scroll-hidden mt-4 max-h-[65vh] space-y-3 overflow-auto pr-1 md:max-h-[70vh]">
            {history.length === 0 ? (
              <div className="rounded-md border-2 border-dashed border-zinc-700 bg-zinc-900 p-3 text-sm font-semibold text-zinc-300">
                Belum ada order.
              </div>
            ) : (
              history.map((item) => (
                <article key={item.track_id} className="rounded-lg border-2 border-zinc-700 bg-zinc-900 p-3 shadow-neo-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-black uppercase">{item.service_id}</p>
                    <span className="rounded-md border border-zinc-600 bg-zinc-800 px-2 py-1 text-xs font-black text-zinc-200">{item.status}</span>
                  </div>
                  <p className="mt-2 text-sm font-bold">Order: {item.order_id}</p>
                  <p className="text-xs font-semibold">Token: {item.token}</p>
                  <p className="text-sm font-semibold">Nomor: {item.number}</p>
                  <p className="text-xs font-semibold">OTP: {item.otp_code ?? '-'}</p>
                  <p className="text-xs font-semibold">Lead Time: {item.elapsed_ms ? formatDuration(item.elapsed_ms) : '-'}</p>
                  <p className="mt-2 text-xs font-semibold">Update: {item.timestamp}</p>
                </article>
              ))
            )}
          </div>
        </section>
      ) : null}

      {activeMenu === 'API Logs' ? (
        <section className="neo-card p-4 md:p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-xl font-black">API Logs</h2>
            <div className="flex items-center gap-2">
              <button className="neo-btn-sm bg-zinc-800 text-zinc-100" onClick={exportLogsAsJson} disabled={logs.length === 0}>Export JSON</button>
              <button className="neo-btn-sm bg-zinc-800 text-zinc-100" onClick={exportLogsAsCsv} disabled={filteredLogs.length === 0}>Export CSV (Filtered)</button>
              <button className="neo-btn-sm bg-zinc-800 text-zinc-100" onClick={() => setLogs([])}>Clear Logs</button>
            </div>
          </div>
          <p className="mt-1 text-sm font-semibold">Observability logs dengan filter type/status, search, dan export.</p>

          <div className="mt-4 grid gap-2 md:grid-cols-4">
            <input
              className="neo-input"
              placeholder="Search message/payload..."
              value={logQuery}
              onChange={(e) => setLogQuery(e.target.value)}
            />
            <div>
              <span className="mb-1 block text-[11px] font-extrabold uppercase">Type</span>
              <div className="scroll-hidden flex gap-1 overflow-auto pb-1">
                {logTypes.map((type) => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => setLogTypeFilter(type)}
                    className={`neo-btn-sm whitespace-nowrap ${logTypeFilter === type ? 'bg-zinc-700 text-zinc-100' : 'bg-zinc-900 text-zinc-300'}`}
                  >
                    {type}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <span className="mb-1 block text-[11px] font-extrabold uppercase">Status</span>
              <div className="scroll-hidden flex gap-1 overflow-auto pb-1">
                {logStatuses.map((status) => (
                  <button
                    key={status}
                    type="button"
                    onClick={() => setLogStatusFilter(status)}
                    className={`neo-btn-sm whitespace-nowrap ${logStatusFilter === status ? 'bg-zinc-700 text-zinc-100' : 'bg-zinc-900 text-zinc-300'}`}
                  >
                    {status}
                  </button>
                ))}
              </div>
            </div>
            <div className="rounded-md border-2 border-zinc-700 bg-zinc-900 px-3 py-2 text-xs font-bold text-zinc-300">
              Showing {filteredLogs.length}/{logs.length} logs
            </div>
          </div>

          <div className="scroll-hidden mt-4 max-h-[65vh] space-y-3 overflow-auto pr-1 md:max-h-[70vh]">
            {filteredLogs.length === 0 ? (
              <div className="rounded-md border-2 border-dashed border-zinc-700 bg-zinc-900 p-3 text-sm font-semibold text-zinc-300">
                Tidak ada log yang cocok dengan filter.
              </div>
            ) : (
              filteredLogs.map((log) => (
                <article key={log.id} className="rounded-lg border-2 border-zinc-700 bg-zinc-900 p-3 shadow-neo-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="rounded-md border border-zinc-600 bg-zinc-800 px-2 py-0.5 text-xs font-black text-zinc-200">{log.type}</span>
                      <span className={`rounded-md border border-zinc-600 px-2 py-0.5 text-xs font-black ${log.status === 'SUCCESS' ? 'bg-emerald-900/40 text-emerald-200' : log.status === 'ERROR' ? 'bg-rose-900/40 text-rose-200' : 'bg-zinc-800 text-zinc-200'}`}>
                        {log.status}
                      </span>
                    </div>
                    <span className="text-xs font-bold">{log.time}</span>
                  </div>
                  <p className="mt-2 text-sm font-semibold">{log.message}</p>
                  {log.payload ? (
                    <pre className="scroll-hidden mt-2 max-h-56 overflow-auto rounded-md border-2 border-zinc-700 bg-zinc-950 p-3 text-xs font-semibold text-zinc-300">
{JSON.stringify(log.payload, null, 2)}
                    </pre>
                  ) : null}
                </article>
              ))
            )}
          </div>
        </section>
      ) : null}

      {activeMenu === 'Provider Settings' ? (
        <section className="grid gap-4 lg:grid-cols-2">
          <article className="neo-card p-4 md:p-4">
            <h2 className="text-xl font-black">Provider Settings</h2>
            <p className="mt-1 text-sm font-semibold">
              Cukup isi API key, klik test, lalu sistem baca layanan provider otomatis.
            </p>

            <label className="mt-4 block">
              <span className="mb-2 block text-xs font-extrabold uppercase">API Key</span>
              <input
                className="neo-input"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="Tempel API key dehuyzotp di sini"
              />
            </label>

            <div className="mt-4 rounded-lg border-2 border-zinc-700 bg-zinc-900 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-xs font-extrabold uppercase">Advanced Override (Opsional)</p>
                  <p className="text-xs font-semibold">Aktifkan untuk override path default docs resmi.</p>
                </div>
                <button
                  type="button"
                  className={`neo-btn-sm ${manualOverride.enabled ? 'bg-zinc-700 text-zinc-100' : 'bg-zinc-800 text-zinc-200'}`}
                  onClick={() => updateManualOverride('enabled', !manualOverride.enabled)}
                >
                  {manualOverride.enabled ? 'ON' : 'OFF'}
                </button>
              </div>

              {manualOverride.enabled ? (
                <div className="mt-3 space-y-3">
                  <div ref={authDropdownRef} className="relative">
                    <p className="mb-1 text-xs font-extrabold uppercase">Auth Mode</p>
                    <button
                      type="button"
                      onClick={() => setAuthMenuOpen((prev) => !prev)}
                      className="neo-input flex items-center justify-between"
                    >
                      <span>
                        {AUTH_OPTIONS.find((item) => item.id === manualOverride.authMode)?.label || 'Pilih Auth'}
                      </span>
                      <span>▾</span>
                    </button>

                    {authMenuOpen ? (
                      <ul className="scroll-hidden absolute z-20 mt-2 w-full overflow-auto rounded-lg border-2 border-zinc-700 bg-zinc-900 p-2 shadow-neo">
                        {AUTH_OPTIONS.map((item) => (
                          <li key={item.id}>
                            <button
                              type="button"
                              className={`w-full rounded-md border-2 px-3 py-2 text-left text-sm font-bold ${manualOverride.authMode === item.id ? 'border-zinc-500 bg-zinc-700 text-zinc-100' : 'border-transparent bg-zinc-900 text-zinc-300'}`}
                              onClick={() => {
                                updateManualOverride('authMode', item.id);
                                setAuthMenuOpen(false);
                              }}
                            >
                              {item.label}
                            </button>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </div>

                  <label className="block">
                    <span className="mb-1 block text-xs font-extrabold uppercase">API Key Header</span>
                    <input
                      className="neo-input"
                      value={manualOverride.apiKeyHeader}
                      onChange={(e) => updateManualOverride('apiKeyHeader', e.target.value)}
                      placeholder="x-api-key"
                    />
                  </label>

                  <div className="grid gap-3 md:grid-cols-3">
                    <label>
                      <span className="mb-1 block text-xs font-extrabold uppercase">Services Path</span>
                      <input
                        className="neo-input"
                        value={manualOverride.endpoints.services}
                        onChange={(e) => updateManualOverride('endpoints.services', e.target.value)}
                        placeholder="/api/services"
                      />
                    </label>
                    <label>
                      <span className="mb-1 block text-xs font-extrabold uppercase">Order Path</span>
                      <input
                        className="neo-input"
                        value={manualOverride.endpoints.order}
                        onChange={(e) => updateManualOverride('endpoints.order', e.target.value)}
                        placeholder="/api/rent"
                      />
                    </label>
                    <label>
                      <span className="mb-1 block text-xs font-extrabold uppercase">Check Path</span>
                      <input
                        className="neo-input"
                        value={manualOverride.endpoints.check}
                        onChange={(e) => updateManualOverride('endpoints.check', e.target.value)}
                        placeholder="/api/sms/{token}"
                      />
                    </label>
                  </div>
                </div>
              ) : null}
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <button className={`neo-btn ${palette.primaryBtn}`} onClick={testConnection} disabled={loadingConnect}>
                {loadingConnect ? (
                  <>
                    Testing <LoadingDots />
                  </>
                ) : (
                  'Test Koneksi'
                )}
              </button>
              <button
                className="neo-btn bg-zinc-800 text-zinc-100"
                onClick={() => {
                  setApiKey('');
                  setConnection({ connected: false, status: 'Belum diuji', detected: null });
                  setBalance({ balance: 0, reserved: 0, available: 0 });
                  setManualOverride({
                    enabled: false,
                    authMode: 'bearer',
                    apiKeyHeader: 'x-api-key',
                    endpoints: { services: '', order: '', check: '' }
                  });
                  localStorage.removeItem('otp-uyeee-api-key');
                  localStorage.removeItem('otp-uyeee-manual-override');
                }}
              >
                Clear API Key
              </button>
            </div>

            <div className="mt-4 rounded-lg border-2 border-zinc-700 bg-zinc-900 p-3">
              <p className="text-xs font-extrabold uppercase text-zinc-400">Status Koneksi</p>
              <p className={`mt-2 text-sm font-black ${connection.connected ? 'text-emerald-300' : 'text-zinc-200'}`}>{connection.status}</p>
              <p className="mt-2 text-xs font-semibold">Base URL tetap: {PROVIDER_BASE_URL}</p>
              {connection.detected ? (
                <div className="mt-3 rounded-md border border-zinc-700 bg-zinc-950 p-2 text-xs font-semibold text-zinc-300">
                  <p>Auth: {connection.detected.authMode || '-'}</p>
                  <p>Services: {connection.detected.endpoints?.services || '-'}</p>
                  <p>Order: {connection.detected.endpoints?.order || '-'}</p>
                  <p>Check: {connection.detected.endpoints?.check || '-'}</p>
                  <p>Balance: {connection.detected.endpoints?.balance || '/api/balance'}</p>
                  <p>Action: {connection.detected.endpoints?.orderAction || '/api/order/{id}'}</p>
                </div>
              ) : null}
            </div>
          </article>

          <article className="neo-card p-4 md:p-4">
            <h2 className="text-xl font-black">Pilih Color Palette</h2>
            <p className="mt-1 text-sm font-semibold">
              Pilih style warna yang paling kamu suka. Saya kasih 4 opsi premium.
            </p>

            <div className="mt-4 space-y-3">
              {PALETTES.map((item) => (
                <button
                  type="button"
                  key={item.id}
                  onClick={() => setPaletteId(item.id)}
                  className={`w-full rounded-lg border-2 p-3 text-left transition ${paletteId === item.id ? 'border-zinc-500 bg-zinc-800 shadow-neo-sm' : 'border-zinc-700 bg-zinc-900'}`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-black">{item.name}</p>
                    <span className="text-xs font-extrabold">{paletteId === item.id ? 'Dipakai' : 'Pakai'}</span>
                  </div>
                  <div className="mt-2 flex gap-2">
                    {item.preview.map((hex) => (
                      <span key={hex} className="h-5 w-10 rounded border border-zinc-700" style={{ backgroundColor: hex }} />
                    ))}
                  </div>
                </button>
              ))}
            </div>
          </article>
        </section>
      ) : null}
    </main>
  );
}
