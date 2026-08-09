import { NextRequest, NextResponse } from 'next/server'
import { v2 as cloudinary } from 'cloudinary'

export const runtime = 'nodejs'

const cloudName = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME
const apiKey = process.env.CLOUDINARY_API_KEY
const apiSecret = process.env.CLOUDINARY_API_SECRET
const rootFolder = process.env.CLOUDINARY_FOLDER || 'rms-entry-attachments'

cloudinary.config({
  cloud_name: cloudName,
  api_key: apiKey,
  api_secret: apiSecret,
  secure: true,
})

type CloudinaryUploadResult = {
  secure_url: string
}

function sanitizeFolderSegment(value: string) {
  return value.replace(/[^a-zA-Z0-9/_-]/g, '').replace(/^\/+|\/+$/g, '')
}

export async function POST(request: NextRequest) {
  if (!cloudName || !apiKey || !apiSecret) {
    return NextResponse.json(
      {
        error:
          'Cloudinary is not configured. Set NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET.',
      },
      { status: 500 }
    )
  }

  try {
    const formData = await request.formData()
    const file = formData.get('file')

    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'No file provided.' }, { status: 400 })
    }

    if (file.size <= 0) {
      return NextResponse.json({ error: 'Empty file.' }, { status: 400 })
    }

    // Soft limit ~10MB per file
    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json({ error: 'File too large (max 10MB).' }, { status: 400 })
    }

    const folderInput = String(formData.get('folder') || 'misc')
    const folder = `${sanitizeFolderSegment(rootFolder)}/${sanitizeFolderSegment(folderInput) || 'misc'}`

    const bytes = await file.arrayBuffer()
    const buffer = Buffer.from(bytes)

    const result = await new Promise<CloudinaryUploadResult>((resolve, reject) => {
      cloudinary.uploader
        .upload_stream(
          {
            folder,
            resource_type: 'auto',
            use_filename: true,
            unique_filename: true,
            overwrite: false,
          },
          (error, uploadResult) => {
            if (error || !uploadResult?.secure_url) {
              reject(error || new Error('Upload failed without URL.'))
              return
            }
            resolve(uploadResult as CloudinaryUploadResult)
          }
        )
        .end(buffer)
    })

    return NextResponse.json({ url: result.secure_url })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Cloudinary upload failed.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
