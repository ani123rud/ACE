import fs from 'fs/promises';
import path from 'path';

const BACKEND = (process.env.STORAGE_BACKEND || 'local').toLowerCase();
const LOCAL_ROOT = process.env.LOCAL_STORAGE_ROOT || path.join(process.cwd(), 'server', 'data', 'files');

async function ensureDir(dir) {
  try { await fs.mkdir(dir, { recursive: true }); } catch {}
}

export async function putObject(key, data, contentType = 'application/octet-stream') {
  if (BACKEND === 's3') {
    // Optional S3 support; if SDK not installed, silently fall back to local
    try {
      const { S3Client, PutObjectCommand } = await import('@aws-sdk/client-s3');
      const client = new S3Client({ region: process.env.AWS_REGION || 'us-east-1' });
      const Bucket = process.env.S3_BUCKET;
      if (!Bucket) throw new Error('S3_BUCKET not set');
      await client.send(new PutObjectCommand({ Bucket, Key: key, Body: data, ContentType: contentType }));
      const publicUrlBase = process.env.S3_PUBLIC_URL_BASE || `https://${Bucket}.s3.amazonaws.com/`;
      return { key, url: publicUrlBase.replace(/\/$/, '/') + key };
    } catch {
      // fallthrough to local
    }
  }
  const dest = path.join(LOCAL_ROOT, key);
  await ensureDir(path.dirname(dest));
  const buf = typeof data === 'string' || data instanceof Uint8Array ? data : Buffer.from(data);
  await fs.writeFile(dest, buf);
  return { key, url: `/files/${key}` };
}

export async function getLocalRoot() { await ensureDir(LOCAL_ROOT); return LOCAL_ROOT; }
