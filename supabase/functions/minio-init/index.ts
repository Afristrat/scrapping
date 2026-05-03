import {
  CreateBucketCommand,
  HeadBucketCommand,
  PutBucketLifecycleConfigurationCommand,
  S3Client,
} from 'npm:@aws-sdk/client-s3@3'

import { createMinioClient, getMinioConfig } from '../_shared/minio.ts'

/**
 * minio-init — Edge function one-shot pour initialiser le bucket MinIO du
 * tenant si manquant. Idempotente : si le bucket existe déjà, no-op.
 *
 * Authentification : nécessite un app_admin authentifié (founder Kairos).
 *
 * Pourquoi : le topic-classifier (Wave 5) écrit les fenêtres glissantes 90 j
 * dans MinIO. Si le bucket n'existe pas, chaque write loggue
 * `NoSuchBucket` en erreur. Cette fn permet de créer le bucket sans devoir
 * accéder au dashboard MinIO manuellement.
 *
 * Lifecycle policy auto : objects expirent après 100 jours (90 j de données +
 * 10 j de buffer pour récupération).
 */

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

async function ensureBucket(
  client: S3Client,
  bucket: string,
): Promise<{ created: boolean; existed: boolean }> {
  try {
    await client.send(new HeadBucketCommand({ Bucket: bucket }))
    return { created: false, existed: true }
  } catch (err) {
    const name = (err as { name?: string }).name ?? ''
    const status = (err as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode
    if (name === 'NotFound' || name === 'NoSuchBucket' || status === 404) {
      await client.send(new CreateBucketCommand({ Bucket: bucket }))
      return { created: true, existed: false }
    }
    throw err
  }
}

async function applyLifecycle(client: S3Client, bucket: string): Promise<void> {
  try {
    await client.send(
      new PutBucketLifecycleConfigurationCommand({
        Bucket: bucket,
        LifecycleConfiguration: {
          Rules: [
            {
              ID: 'expire-after-100-days',
              Status: 'Enabled',
              Filter: {},
              Expiration: { Days: 100 },
            },
          ],
        },
      }),
    )
  } catch (err) {
    // Lifecycle non bloquant : certaines installations MinIO ne le supportent
    // pas selon la version. On loggue mais on n'échoue pas.
    console.warn('lifecycle config failed', (err as Error).message)
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS })
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ ok: false, error: 'method_not_allowed' }), {
      status: 405,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  }

  const cfg = getMinioConfig()
  if (!cfg) {
    return new Response(
      JSON.stringify({
        ok: false,
        error: 'minio_secrets_missing',
        detail:
          'Les 4 secrets MINIO_ENDPOINT, MINIO_ACCESS_KEY, MINIO_SECRET_KEY, MINIO_BUCKET doivent être set sur le projet Supabase.',
      }),
      { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } },
    )
  }

  const client = createMinioClient(cfg)
  try {
    const status = await ensureBucket(client, cfg.bucket)
    if (status.created) {
      await applyLifecycle(client, cfg.bucket)
    }
    return new Response(
      JSON.stringify({
        ok: true,
        bucket: cfg.bucket,
        endpoint: cfg.endpoint,
        created: status.created,
        existed: status.existed,
        lifecycle_applied: status.created,
      }),
      { status: 200, headers: { ...CORS, 'Content-Type': 'application/json' } },
    )
  } catch (err) {
    const name = (err as { name?: string }).name ?? 'Error'
    const message = (err as Error).message
    return new Response(
      JSON.stringify({
        ok: false,
        error: 'minio_create_failed',
        detail: `${name}: ${message}`,
      }),
      { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } },
    )
  }
})
