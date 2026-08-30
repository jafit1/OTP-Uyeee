import crypto from 'crypto'

export function generateTokopaySignature(merchantId: string, secretKey: string, refId: string): string {
  // Signature format: MD5(merchant_id + secret_key + ref_id)
  // Berdasarkan dokumentasi standar TokoPay: MD5(merchantId:secretKey:refId) 
  // Wait, the official tokopay signature is usually MD5(merchantId + ":" + secretKey + ":" + refId)
  const signString = `${merchantId}:${secretKey}:${refId}`
  return crypto.createHash('md5').update(signString).digest('hex')
}
