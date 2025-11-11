/**
 * Generate punk #10c01753 image for logo and favicon
 */
import { generatePunkImage } from './src/utils/generator'
import * as fs from 'fs'
import * as path from 'path'

const PUNK_ID = '10c01753a99b60fb5bf8067b4d5bef03cb30e4d3e9ee8babfe66d13ff7685b66'

async function generateLogo() {
  console.log('🎨 Generating logo from punk #10c01753...')

  try {
    // Generate punk image (returns base64 data URL)
    const imageDataUrl = await generatePunkImage(PUNK_ID)

    // Extract base64 data
    const base64Data = imageDataUrl.replace(/^data:image\/png;base64,/, '')

    // Create public folder if it doesn't exist
    const publicDir = path.join(process.cwd(), 'public')
    if (!fs.existsSync(publicDir)) {
      fs.mkdirSync(publicDir, { recursive: true })
      console.log('✅ Created public folder')
    }

    // Save as logo.png
    const logoPath = path.join(publicDir, 'logo.png')
    fs.writeFileSync(logoPath, Buffer.from(base64Data, 'base64'))
    console.log(`✅ Saved logo to ${logoPath}`)

    // Save as favicon.ico (PNG format is fine, browsers support it)
    const faviconPath = path.join(publicDir, 'favicon.ico')
    fs.writeFileSync(faviconPath, Buffer.from(base64Data, 'base64'))
    console.log(`✅ Saved favicon to ${faviconPath}`)

    console.log('🎉 Logo and favicon generated successfully!')
  } catch (error) {
    console.error('❌ Failed to generate logo:', error)
    process.exit(1)
  }
}

generateLogo()
