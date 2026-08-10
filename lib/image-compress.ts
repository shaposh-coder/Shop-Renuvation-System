import sharp from 'sharp'

export type CompressedImage = {
  buffer: Buffer
  contentType: string
  extension: string
}

/**
 * Compress images for cheaper R2 storage.
 * Non-images are returned unchanged (PDF etc.).
 */
export async function compressAttachment(
  input: Buffer,
  mimeType: string,
  fileName = 'file'
): Promise<CompressedImage> {
  const lowerMime = (mimeType || '').toLowerCase()
  const lowerName = fileName.toLowerCase()
  const isImage =
    lowerMime.startsWith('image/') ||
    /\.(jpe?g|png|webp|gif|heic|bmp|tiff?)$/i.test(lowerName)

  if (!isImage) {
    const extension = lowerName.includes('.')
      ? lowerName.split('.').pop() || 'bin'
      : 'bin'
    return {
      buffer: input,
      contentType: mimeType || 'application/octet-stream',
      extension,
    }
  }

  // Animated GIF / keep as-is if sharp can't usefully convert
  if (lowerMime.includes('gif') || lowerName.endsWith('.gif')) {
    return { buffer: input, contentType: 'image/gif', extension: 'gif' }
  }

  const image = sharp(input, { failOn: 'none' }).rotate()
  const meta = await image.metadata()
  const width = meta.width ?? 0

  let pipeline = image
  if (width > 1600) {
    pipeline = pipeline.resize({
      width: 1600,
      withoutEnlargement: true,
    })
  }

  // Prefer WebP for strong savings; fall back to JPEG if needed
  try {
    const buffer = await pipeline.webp({ quality: 72, effort: 4 }).toBuffer()
    return { buffer, contentType: 'image/webp', extension: 'webp' }
  } catch {
    const buffer = await sharp(input, { failOn: 'none' })
      .rotate()
      .resize({ width: 1600, withoutEnlargement: true })
      .jpeg({ quality: 75, mozjpeg: true })
      .toBuffer()
    return { buffer, contentType: 'image/jpeg', extension: 'jpg' }
  }
}
