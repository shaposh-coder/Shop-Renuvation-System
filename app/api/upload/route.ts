import { NextRequest, NextResponse } from 'next/server'
import { compressAttachment } from '@/lib/image-compress'
import { uploadBufferToR2 } from '@/lib/r2'

export const runtime = 'nodejs'

function sanitizeFolderSegment(value: string) {
  return value.replace(/[^a-zA-Z0-9/_-]/g, '').replace(/^\/+|\/+$/g, '')
}

function randomName() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const file = formData.get('file')

    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'No file provided.' }, { status: 400 })
    }

    if (file.size <= 0) {
      return NextResponse.json({ error: 'Empty file.' }, { status: 400 })
    }

    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json({ error: 'File too large (max 10MB).' }, { status: 400 })
    }

    const folderInput = String(formData.get('folder') || 'misc')
    const folder = sanitizeFolderSegment(folderInput) || 'misc'
    const prefix = sanitizeFolderSegment(process.env.R2_FOLDER_PREFIX || 'rms-attachments') || 'rms-attachments'

    const inputBuffer = Buffer.from(await file.arrayBuffer())
    const compressed = await compressAttachment(inputBuffer, file.type || '', file.name || 'file')
    const key = `${prefix}/${folder}/${randomName()}.${compressed.extension}`

    const url = await uploadBufferToR2({
      key,
      body: compressed.buffer,
      contentType: compressed.contentType,
    })

    return NextResponse.json({
      url,
      bytes_in: inputBuffer.length,
      bytes_out: compressed.buffer.length,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'R2 upload failed.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
