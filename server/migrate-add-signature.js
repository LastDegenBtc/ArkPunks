/**
 * Migration: Add server_signature column to punks table
 */

import Database from 'better-sqlite3'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const dbPath = path.join(__dirname, 'database', 'arkade-punks-v2.db')

console.log('🔧 Migrating database schema...')
console.log(`📂 Database: ${dbPath}\n`)

const db = new Database(dbPath)
db.pragma('journal_mode = WAL')

try {
  // Check if column already exists
  const tableInfo = db.prepare('PRAGMA table_info(punks)').all()
  const hasSignatureColumn = tableInfo.some(col => col.name === 'server_signature')

  if (hasSignatureColumn) {
    console.log('✅ Column server_signature already exists - no migration needed')
  } else {
    console.log('➕ Adding server_signature column to punks table...')
    db.prepare('ALTER TABLE punks ADD COLUMN server_signature TEXT').run()
    console.log('✅ Column added successfully!')
  }

  // Verify
  const updatedInfo = db.prepare('PRAGMA table_info(punks)').all()
  console.log('\n📊 Current punks table schema:')
  updatedInfo.forEach(col => {
    console.log(`   - ${col.name}: ${col.type}${col.pk ? ' (PRIMARY KEY)' : ''}`)
  })

  console.log('\n🎉 Migration complete!')

} catch (error) {
  console.error('❌ Migration failed:', error)
  process.exit(1)
} finally {
  db.close()
}
