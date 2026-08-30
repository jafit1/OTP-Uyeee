import { createClient } from '@libsql/client'
import path from 'path'
import os from 'os'

// On Vercel / Serverless environments, default to /tmp/local.db or :memory: because root filesystem is READ-ONLY!
const isVercel = !!process.env.VERCEL || process.env.NODE_ENV === 'production'
const fallbackDbPath = isVercel ? `file:${path.join(os.tmpdir(), 'local.db')}` : 'file:local.db'

const url = process.env.DATABASE_URL || fallbackDbPath
const authToken = process.env.DATABASE_AUTH_TOKEN

export const db = createClient({
  url,
  authToken,
})

// Fungsi untuk inisialisasi tabel pertama kali (safely wrapped)
export async function initDb() {
  try {
    await db.execute(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        balance REAL DEFAULT 0,
        role TEXT DEFAULT 'user',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `)
    
    await db.execute(`
      CREATE TABLE IF NOT EXISTS transactions (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        amount REAL NOT NULL,
        type TEXT NOT NULL,
        status TEXT DEFAULT 'PENDING',
        reference TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(user_id) REFERENCES users(id)
      );
    `)
  } catch (e) {
    console.error('Error initializing database tables:', e)
  }
}
