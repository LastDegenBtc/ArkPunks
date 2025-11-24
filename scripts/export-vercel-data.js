/**
 * Export all data from Vercel Blob to local JSON files
 *
 * Exports:
 * - ownership.json: punk ownership table (CRITICAL - 2016 punks)
 * - listings.json: active marketplace listings
 * - registry.json: minted punks registry
 * - whitelist.json: auto-whitelist entries
 */

import { list } from '@vercel/blob'
import { writeFileSync, mkdirSync, readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const EXPORT_DIR = join(__dirname, '../data-export')

// Load .env file manually
try {
  const envPath = join(__dirname, '../.env')
  const envContent = readFileSync(envPath, 'utf-8')
  envContent.split('\n').forEach(line => {
    const match = line.match(/^([^=]+)=(.*)$/)
    if (match) {
      const key = match[1].trim()
      const value = match[2].trim().replace(/^["']|["']$/g, '')
      process.env[key] = value
    }
  })
  console.log('✅ Loaded .env file')
} catch (error) {
  console.warn('⚠️  Could not load .env file:', error.message)
}

const BLOBS_TO_EXPORT = [
  { filename: 'punk-ownership.json', output: 'ownership.json', description: 'Punk ownership table' },
  { filename: 'escrow-listings.json', output: 'listings.json', description: 'Escrow marketplace listings' },
  { filename: 'punk-registry.json', output: 'registry.json', description: 'Minted punks registry' },
  { filename: 'auto-whitelist.json', output: 'whitelist.json', description: 'Auto-whitelist entries' }
]

async function exportBlob(blobFilename, outputFilename, description) {
  try {
    console.log(`\n📦 Exporting ${description}...`)
    console.log(`   Looking for blob: ${blobFilename}`)

    const { blobs } = await list()
    const blob = blobs.find(b => b.pathname === blobFilename)

    if (!blob) {
      console.warn(`   ⚠️  Blob not found: ${blobFilename}`)
      return null
    }

    const url = blob.downloadUrl || blob.url
    console.log(`   Fetching from: ${url.slice(0, 60)}...`)

    const response = await fetch(url)
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`)
    }

    const data = await response.json()

    // Create export directory if it doesn't exist
    mkdirSync(EXPORT_DIR, { recursive: true })

    const outputPath = join(EXPORT_DIR, outputFilename)
    writeFileSync(outputPath, JSON.stringify(data, null, 2))

    console.log(`   ✅ Exported to: ${outputPath}`)

    // Show summary based on data structure
    if (data.ownership) {
      const count = Object.keys(data.ownership).length
      console.log(`   📊 ${count} punks with owners`)
    } else if (data.listings) {
      const count = Object.keys(data.listings).length
      console.log(`   📊 ${count} listings`)
    } else if (data.entries) {
      console.log(`   📊 ${data.entries.length} entries`)
    }

    return data

  } catch (error) {
    console.error(`   ❌ Error exporting ${blobFilename}:`, error.message)
    return null
  }
}

async function main() {
  console.log('🚀 Starting Vercel Blob data export...')
  console.log(`Export directory: ${EXPORT_DIR}`)

  const results = {}

  for (const blob of BLOBS_TO_EXPORT) {
    const data = await exportBlob(blob.filename, blob.output, blob.description)
    results[blob.output] = data
  }

  console.log('\n' + '='.repeat(60))
  console.log('📊 Export Summary:')
  console.log('='.repeat(60))

  if (results['ownership.json']) {
    const count = Object.keys(results['ownership.json'].ownership || {}).length
    console.log(`✅ Ownership: ${count} punks`)
  } else {
    console.log(`❌ Ownership: FAILED TO EXPORT`)
  }

  if (results['listings.json']) {
    const count = Object.keys(results['listings.json'].listings || {}).length
    console.log(`✅ Listings: ${count} active listings`)
  } else {
    console.log(`⚠️  Listings: Not found or failed`)
  }

  if (results['registry.json']) {
    const count = (results['registry.json'].entries || []).length
    console.log(`✅ Registry: ${count} minted punks`)
  } else {
    console.log(`⚠️  Registry: Not found or failed`)
  }

  if (results['whitelist.json']) {
    const count = (results['whitelist.json'].entries || []).length
    console.log(`✅ Whitelist: ${count} entries`)
  } else {
    console.log(`⚠️  Whitelist: Not found or failed`)
  }

  console.log('='.repeat(60))
  console.log('\n✅ Export complete! Data saved to:', EXPORT_DIR)
}

main().catch(error => {
  console.error('❌ Fatal error:', error)
  process.exit(1)
})
