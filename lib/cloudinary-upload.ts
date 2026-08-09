/**
 * Upload an attachment via the server API route (Cloudinary).
 * Returns a public HTTPS URL to store in attachment_urls.
 */
export async function uploadAttachmentToCloudinary(
  file: File,
  folder: string
): Promise<string> {
  const formData = new FormData()
  formData.append('file', file)
  formData.append('folder', folder)

  const response = await fetch('/api/upload', {
    method: 'POST',
    body: formData,
  })

  const payload = (await response.json().catch(() => null)) as
    | { url?: string; error?: string }
    | null

  if (!response.ok || !payload?.url) {
    throw new Error(payload?.error || 'Cloudinary upload failed.')
  }

  return payload.url
}
