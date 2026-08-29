// Cloudflare Worker: Shopee Phone Checker Proxy
// Deploy ke Cloudflare Workers (gratis, 100k req/day)
//
// CARA DEPLOY:
// 1. Buka https://dash.cloudflare.com → Workers & Pages → Create
// 2. Paste kode ini → Deploy
// 3. Copy URL worker (contoh: shopee-proxy.username.workers.dev)
// 4. Masukkan URL ke environment variable Vercel: SHOPEE_PROXY_URL
//
// Atau langsung update hardcoded URL di src/index.tsx

const ALLOWED_ORIGINS = ['*'];

function corsHeaders(origin) {
  return {
    'Access-Control-Allow-Origin': ALLOWED_ORIGINS.includes('*') ? '*' : origin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

export default {
  async fetch(request, env) {
    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: corsHeaders(request.headers.get('Origin')),
      });
    }

    // Only accept POST
    if (request.method !== 'POST') {
      return new Response(JSON.stringify({ error: 'Method not allowed' }), {
        status: 405,
        headers: { 'Content-Type': 'application/json', ...corsHeaders() },
      });
    }

    try {
      const body = await request.json();
      const { phone } = body;

      if (!phone) {
        return new Response(JSON.stringify({ error: 'Phone number required' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json', ...corsHeaders() },
        });
      }

      // Normalize phone
      let raw = String(phone).trim().replace(/[^0-9]/g, '');
      let national = raw;
      if (national.startsWith('62')) national = '0' + national.slice(2);
      let intl = raw;
      if (intl.startsWith('0')) intl = '62' + intl.slice(1);
      if (!intl.startsWith('62')) intl = '62' + intl;

      const shopeeHeaders = {
        'Accept': 'application/json, text/plain, */*',
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'X-Shopee-Language': 'id',
        'X-API-Source': 'pc',
        'Referer': 'https://shopee.co.id/buyer/login',
        'Origin': 'https://shopee.co.id',
        'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7',
      };

      // Strategy 1: check_phone_number_registered (V4)
      let data = null;
      try {
        const res1 = await fetch('https://shopee.co.id/api/v4/account/check_phone_number_registered', {
          method: 'POST',
          headers: shopeeHeaders,
          body: JSON.stringify({ phone_number: intl }),
        });
        if (res1.ok) {
          const t = await res1.text();
          try { data = JSON.parse(t); } catch {}
          if (data && !data.error) {
            return new Response(JSON.stringify({
              success: true,
              phone: intl,
              registered: data?.data?.is_registered === true || data?.error === 10001,
              available: data?.data?.is_registered === false && data?.error === 0,
              status_text: data?.data?.is_registered ? 'TERDAFTAR' : data?.error === 0 ? 'BELUM TERDAFTAR' : 'UNKNOWN',
              source: 'check_phone_number_registered',
              raw: data,
            }), {
              status: 200,
              headers: { 'Content-Type': 'application/json', ...corsHeaders() },
            });
          }
        }
      } catch {}

      // Strategy 2: request_otp (check without sending)
      try {
        const res2 = await fetch('https://shopee.co.id/api/v4/account/basic/request_otp', {
          method: 'POST',
          headers: {
            ...shopeeHeaders,
            'User-Agent': 'Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.6261.119 Mobile Safari/537.36',
            'X-API-Source': 'rn',
            'X-Requested-With': 'com.shopee.id',
          },
          body: JSON.stringify({ phone: national, country_code: '+62', type: 2, action_type: 0 }),
        });
        const t2 = await res2.text();
        let d2 = {};
        try { d2 = JSON.parse(t2); } catch {}
        
        if (d2 && d2.error !== undefined) {
          // error 0 = success (number exists, OTP sent)
          // error 10001 = phone not registered
          // error 10002 = invalid phone
          const isReg = d2.error === 0 || d2.data?.is_registered === true;
          const isNotReg = d2.error === 10001 || d2.error === 10002 || d2.data?.is_registered === false;
          const isCaptcha = d2.error === 10003 || d2.error === 10004 || d2.captcha_url;
          
          return new Response(JSON.stringify({
            success: true,
            phone: intl,
            registered: isReg,
            available: isNotReg,
            status_text: isReg ? 'TERDAFTAR (OTP bisa dikirim)' : isNotReg ? 'BELUM TERDAFTAR' : isCaptcha ? 'CAPTCHA REQUIRED' : 'STATUS UNKNOWN',
            source: 'request_otp',
            raw: d2,
          }), {
            status: 200,
            headers: { 'Content-Type': 'application/json', ...corsHeaders() },
          });
        }
      } catch {}

      // Strategy 3: get_account_info_by_phone
      try {
        const res3 = await fetch('https://shopee.co.id/api/v4/account/basic/get_account_info_by_phone', {
          method: 'POST',
          headers: shopeeHeaders,
          body: JSON.stringify({ phone: national, phone_number: intl }),
        });
        const t3 = await res3.text();
        let d3 = {};
        try { d3 = JSON.parse(t3); } catch {}
        
        if (d3 && (d3.data || d3.error !== 'error_not_found')) {
          const isReg = d3.data?.userid > 0 || d3.data?.user_id > 0 || d3.data?.is_registered === true || d3.data?.username;
          return new Response(JSON.stringify({
            success: true,
            phone: intl,
            registered: !!isReg,
            available: !isReg && d3.error === 0,
            status_text: isReg ? 'TERDAFTAR' : d3.error === 0 ? 'BELUM TERDAFTAR' : 'STATUS UNKNOWN',
            source: 'get_account_info_by_phone',
            raw: d3,
          }), {
            status: 200,
            headers: { 'Content-Type': 'application/json', ...corsHeaders() },
          });
        }
      } catch {}

      // All strategies failed
      return new Response(JSON.stringify({
        success: true,
        phone: intl,
        registered: false,
        available: false,
        status_text: 'CAPTCHA / ANTI-BOT - Silakan coba lagi atau cek manual di Shopee',
        source: 'all_failed',
        raw: data,
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json', ...corsHeaders() },
      });

    } catch (err) {
      return new Response(JSON.stringify({ error: err.message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', ...corsHeaders() },
      });
    }
  },
};
