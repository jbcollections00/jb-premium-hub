import { S3Client } from '@aws-sdk/client-s3';

// ⚙️ CLOUDFLARE R2 CONFIGURATIONS
export const R2_ACCOUNT_ID = 'e2a8ec01ba710d3a37379dc00ef1e91e';
export const R2_BUCKET_NAME = 'jb-collections-hub';
export const R2_PUBLIC_DOMAIN = 'https://pub-0edb47f7f09d41ab9a7601f407e787b0.r2.dev';

// API Credentials
const ACCESS_KEY_ID = 'fec161009e0a70a074169ca75767bf97';
const SECRET_ACCESS_KEY = 'f8491eddbf4ff0d2d90de43a4c2bdef1d3c07c09a4a3ce273b7109fc580a41b4';

// Backup export para sa lumang code references
export const r2PublicDomain = R2_PUBLIC_DOMAIN;

// S3 Client Instance
export const r2Client = new S3Client({
  region: 'auto',
  endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: ACCESS_KEY_ID,
    secretAccessKey: SECRET_ACCESS_KEY,
  },
});