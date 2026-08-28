import { NextResponse } from 'next/server';
import { checkOTP } from '@/lib/otpProvider';

export async function POST(request) {
  try {
    const body = await request.json();
    const { token, orderId, timeout, providerConfig } = body || {};

    const finalToken = token || orderId;
    if (!finalToken) {
      return NextResponse.json(
        { success: false, error: 'token wajib diisi.' },
        { status: 400 }
      );
    }

    const data = await checkOTP(finalToken, providerConfig || {}, timeout);
    return NextResponse.json(data, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error.message || 'Gagal cek OTP.' },
      { status: 500 }
    );
  }
}
