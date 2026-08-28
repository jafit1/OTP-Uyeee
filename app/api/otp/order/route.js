import { NextResponse } from 'next/server';
import { orderNumber } from '@/lib/otpProvider';

export async function POST(request) {
  try {
    const body = await request.json();
    const { serviceId, providerConfig } = body || {};

    if (!serviceId && serviceId !== 0) {
      return NextResponse.json(
        { success: false, error: 'serviceId wajib diisi.' },
        { status: 400 }
      );
    }

    const data = await orderNumber(serviceId, providerConfig || {});
    return NextResponse.json(data, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error.message || 'Gagal order nomor OTP.' },
      { status: 500 }
    );
  }
}
