/**
 * Sales History API
 *
 * Returns all completed sales from escrow system
 */

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { getAllListingsIncludingSold } from './_lib/escrowStore'

interface SaleResponse {
  punkId: string
  price: string // bigint as string
  buyer: string // buyerArkAddress
  seller: string // sellerArkAddress
  timestamp: number // soldAt
  punkTransferTxid?: string
  paymentTransferTxid?: string
  compressedMetadata?: string // Compressed punk metadata (hex)
}

interface StatsResponse {
  floorPrice: string // bigint as string
  highestSale: string // bigint as string
  totalVolume: string // bigint as string
  totalSales: number
  averagePrice: string // bigint as string
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Allow CORS
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') {
    return res.status(200).end()
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    console.log('📊 Fetching sales history...')

    // Get all listings from blob (including sold)
    let allListings
    try {
      allListings = await getAllListingsIncludingSold()
      console.log(`   Total listings in store: ${allListings.length}`)
    } catch (blobError: any) {
      console.error('❌ Failed to read from Vercel Blob:', blobError.message)
      console.error('   Error details:', blobError)
      throw new Error(`Vercel Blob error: ${blobError.message}`)
    }

    // Filter for sold listings only
    const soldListings = allListings.filter(l => l.status === 'sold' && l.soldAt && l.buyerAddress)
    console.log(`   Sold listings: ${soldListings.length}`)

    // Convert to sales response format
    const sales: SaleResponse[] = soldListings
      .map(listing => ({
        punkId: listing.punkId,
        price: listing.price,
        buyer: listing.buyerAddress!,
        seller: listing.sellerArkAddress,
        timestamp: listing.soldAt!,
        punkTransferTxid: listing.punkTransferTxid,
        paymentTransferTxid: listing.paymentTransferTxid,
        compressedMetadata: listing.compressedMetadata
      }))
      .sort((a, b) => b.timestamp - a.timestamp) // Most recent first

    // Calculate market stats
    const stats: StatsResponse = calculateStats(sales)

    console.log('✅ Sales history fetched successfully')
    console.log(`   Total sales: ${sales.length}`)
    console.log(`   Total volume: ${stats.totalVolume} sats`)

    return res.status(200).json({
      success: true,
      sales,
      stats
    })

  } catch (error: any) {
    console.error('❌ Error fetching sales:', error)
    console.error('   Full error:', error)

    // If Vercel Blob is not configured, return empty stats
    if (error.message?.includes('Vercel Blob not configured') ||
        error.message?.includes('BLOB_READ_WRITE_TOKEN')) {
      console.log('⚠️ Vercel Blob not configured, returning empty stats')
      return res.status(200).json({
        success: true,
        sales: [],
        stats: {
          floorPrice: '0',
          highestSale: '0',
          totalVolume: '0',
          totalSales: 0,
          averagePrice: '0'
        }
      })
    }

    return res.status(500).json({
      error: 'Failed to fetch sales',
      details: error.message
    })
  }
}

function calculateStats(sales: SaleResponse[]): StatsResponse {
  if (sales.length === 0) {
    return {
      floorPrice: '0',
      highestSale: '0',
      totalVolume: '0',
      totalSales: 0,
      averagePrice: '0'
    }
  }

  const prices = sales.map(s => BigInt(s.price))

  const floorPrice = prices.reduce((min, p) => p < min ? p : min, prices[0])
  const highestSale = prices.reduce((max, p) => p > max ? p : max, prices[0])
  const totalVolume = prices.reduce((sum, p) => sum + p, 0n)
  const averagePrice = totalVolume / BigInt(sales.length)

  return {
    floorPrice: floorPrice.toString(),
    highestSale: highestSale.toString(),
    totalVolume: totalVolume.toString(),
    totalSales: sales.length,
    averagePrice: averagePrice.toString()
  }
}
