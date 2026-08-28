import { NextResponse } from 'next/server';
import { updateOrderAction } from '@/lib/otpProvider';

export async function POST(request) {
  try {
    const body = await request.json();
    const { orderRef, orderId, token, action, providerConfig } = body || {};

    const ref = orderRef || orderId || token;
    if (!ref) {
      return NextResponse.json(
        { success: false, error: 'orderRef (order_id atau token) wajib diisi.' },
        { status: 400 }
      );
    }

    const data = await updateOrderAction(ref, action, providerConfig || {});
    return NextResponse.json(data, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error.message || 'Gagal menjalankan action order.' },
      { status: 500 }
    );
  }
}
