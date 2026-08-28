import { NextResponse } from 'next/server';
import { fetchBalance } from '@/lib/otpProvider';

export async function POST(request) {
  try {
    const body = await request.json();
    const { providerConfig } = body || {};

    const data = await fetchBalance(providerConfig || {});
    return NextResponse.json(data, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error.message || 'Gagal mengambil saldo provider.' },
      { status: 500 }
    );
  }
}
