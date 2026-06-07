import { NextRequest, NextResponse } from 'next/server'
import { list, put } from '@vercel/blob'

// Required env var:
//   BLOB_READ_WRITE_TOKEN: set automatically when the Vercel Blob store is linked

type WaitlistEntry = {
  email: string
  timestamp: number
}

const BLOB_PATH = 'waitlist.json'

async function readWaitlist(): Promise<WaitlistEntry[]> {
  try {
    const { blobs } = await list({ prefix: BLOB_PATH })
    if (blobs.length === 0) return []
    const res = await fetch(blobs[0].url, { cache: 'no-store' })
    return await res.json()
  } catch {
    return []
  }
}

async function writeWaitlist(entries: WaitlistEntry[]): Promise<void> {
  await put(BLOB_PATH, JSON.stringify(entries), {
    access: 'public',
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: 'application/json',
  })
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)

  if (!body || typeof body.email !== 'string' || !body.email.includes('@')) {
    return NextResponse.json({ error: 'Invalid email' }, { status: 400 })
  }

  const entry: WaitlistEntry = {
    email: body.email.trim().toLowerCase().slice(0, 200),
    timestamp: Date.now(),
  }

  const current = await readWaitlist()

  // Silently deduplicate by email
  const exists = current.some(e => e.email === entry.email)
  if (!exists) {
    await writeWaitlist([...current, entry])
  }

  return NextResponse.json({ ok: true })
}

export async function GET() {
  // Simple read endpoint for reviewing signups
  const entries = await readWaitlist()
  return NextResponse.json(entries)
}
