import { S3Client, GetObjectCommand, PutObjectCommand } from 'npm:@aws-sdk/client-s3@3'

export interface MinioConfig {
  endpoint: string
  accessKey: string
  secretKey: string
  bucket: string
}

export function getMinioConfig(): MinioConfig | null {
  const endpoint = Deno.env.get('MINIO_ENDPOINT')
  const accessKey = Deno.env.get('MINIO_ACCESS_KEY')
  const secretKey = Deno.env.get('MINIO_SECRET_KEY')
  const bucket = Deno.env.get('MINIO_BUCKET')
  if (!endpoint || !accessKey || !secretKey || !bucket) return null
  return { endpoint, accessKey, secretKey, bucket }
}

export function createMinioClient(cfg: MinioConfig): S3Client {
  return new S3Client({
    region: 'us-east-1',
    endpoint: cfg.endpoint,
    forcePathStyle: true,
    credentials: { accessKeyId: cfg.accessKey, secretAccessKey: cfg.secretKey },
  })
}

const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000

async function readObject(client: S3Client, bucket: string, key: string): Promise<string | null> {
  try {
    const res = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }))
    if (!res.Body) return null
    return await res.Body.transformToString()
  } catch (err) {
    const name = (err as { name?: string }).name
    if (name === 'NoSuchKey' || name === 'NotFound') return null
    throw err
  }
}

async function writeObject(client: S3Client, bucket: string, key: string, body: string): Promise<void> {
  await client.send(new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    Body: body,
    ContentType: 'text/markdown; charset=utf-8',
  }))
}

export async function appendTopicEntry(opts: {
  client: S3Client
  bucket: string
  userId: string
  slug: string
  topicName: string
  isSeed: boolean
  entry: string
  firstSeenAt: string
}): Promise<void> {
  const { client, bucket, userId, slug, topicName, isSeed, entry, firstSeenAt } = opts
  const currentKey = `topics/${userId}/${slug}.md`
  const archiveKey = `topics/${userId}/${slug}-archive.md`

  const existing = await readObject(client, bucket, currentKey)

  if (!existing) {
    const header =
      `# ${topicName}\nfirst_seen: ${firstSeenAt}\nis_seed: ${isSeed}\n\n## Run History\n\n`
    await writeObject(client, bucket, currentKey, header + entry + '\n')
    return
  }

  const cutoff = Date.now() - NINETY_DAYS_MS
  const { kept, archived } = rotateEntries(existing, cutoff)

  if (archived.length > 0) {
    const previousArchive = (await readObject(client, bucket, archiveKey)) ?? ''
    await writeObject(client, bucket, archiveKey, previousArchive + archived.join('\n') + '\n')
  }

  await writeObject(client, bucket, currentKey, kept + entry + '\n')
}

export function rotateEntries(content: string, cutoffMs: number): { kept: string; archived: string[] } {
  const blockRegex = /^### (\d{4}-\d{2}-\d{2}T[\d:.Z+-]+)\n([\s\S]*?)(?=\n### |\n*$)/gm
  const archived: string[] = []
  const keptBlocks: string[] = []
  let lastIndex = 0
  let header = ''
  let m: RegExpExecArray | null

  while ((m = blockRegex.exec(content)) !== null) {
    if (header === '') header = content.slice(0, m.index)
    const ts = Date.parse(m[1])
    if (ts < cutoffMs) archived.push(m[0])
    else keptBlocks.push(m[0])
    lastIndex = blockRegex.lastIndex
  }

  if (header === '') header = content.slice(0, lastIndex || content.length)
  const kept = keptBlocks.length > 0 ? header + keptBlocks.join('\n\n') + '\n\n' : header
  return { kept, archived }
}

export function formatEntry(opts: {
  runAt: string
  signalCount: number
  sources: Record<string, { count: number; avg_score: number }>
  topSignalTitle: string | null
  topSignalScore: number | null
  topSignalSource: string | null
}): string {
  const sourcesStr = Object.entries(opts.sources)
    .map(([k, v]) => `${k}(count=${v.count},avg=${v.avg_score.toFixed(1)})`)
    .join(' ')
  const topLine = opts.topSignalTitle != null
    ? `- top_signal: "${opts.topSignalTitle}" (score=${opts.topSignalScore ?? '?'}, source=${opts.topSignalSource ?? '?'})`
    : '- top_signal: (none)'
  return `### ${opts.runAt}\n- signal_count: ${opts.signalCount}\n- sources: ${sourcesStr}\n${topLine}\n`
}

export function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}
