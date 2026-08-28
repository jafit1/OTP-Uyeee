import { NextResponse } from 'next/server';
import { retryOTP } from '@/lib/otpProvider';

export async function POST(request) {
  try {
    const body = await request.json();
    const { token, providerConfig } = body || {};

    if (!token) {
      return NextResponse.json(
        { success: false, error: 'token wajib diisi.' },
        { status: 400 }
      );
    }

    const data = await retryOTP(token, providerConfig || {});
    return NextResponse.json(data, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error.message || 'Gagal retry OTP.' },
      { status: 500 }
    );
  }
}
