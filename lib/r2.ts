import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'

function required(name: string) {
  const value = process.env[name]?.trim()
  if (!value) {
    throw new Error(`Missing env var: ${name}`)
  }
  return value
}

export function getR2Config() {
  const accountId = required('R2_ACCOUNT_ID')
  const accessKeyId = required('R2_ACCESS_KEY_ID')
  const secretAccessKey = required('R2_SECRET_ACCESS_KEY')
  const bucket = required('R2_BUCKET_NAME')
  const publicBaseUrl = required('R2_PUBLIC_BASE_URL').replace(/\/$/, '')

  return {
    accountId,
    accessKeyId,
    secretAccessKey,
    bucket,
    publicBaseUrl,
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
  }
}

export function createR2Client() {
  const { endpoint, accessKeyId, secretAccessKey } = getR2Config()
  return new S3Client({
    region: 'auto',
    endpoint,
    credentials: {
      accessKeyId,
      secretAccessKey,
    },
  })
}

export async function uploadBufferToR2(params: {
  key: string
  body: Buffer
  contentType: string
}) {
  const { bucket, publicBaseUrl } = getR2Config()
  const client = createR2Client()

  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: params.key,
      Body: params.body,
      ContentType: params.contentType,
      CacheControl: 'public, max-age=31536000, immutable',
    })
  )

  return `${publicBaseUrl}/${params.key.split('/').map(encodeURIComponent).join('/')}`
}
