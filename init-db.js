import { initDb } from './src/db.js'

async function main() {
  console.log('Menginisialisasi Database...')
  try {
    await initDb()
    console.log('Database berhasil dibuat dan di-setup!')
  } catch (e) {
    console.error('Gagal menginisialisasi DB:', e)
  }
}

main()
