import { AwsClient } from "aws4fetch";
import { CloudflareBindings } from "../index.js";

/** Build an AwsClient pre-configured from the worker's env bindings. */
export function getS3Client(env: CloudflareBindings) {
  return new AwsClient({
    accessKeyId: env.S3_ACCESS_KEY_ID,
    secretAccessKey: env.S3_SECRET_ACCESS_KEY,
    service: "s3",
    region: env.S3_REGION || "us-east-1",
  });
}

/** Resolve the base URL for a given object key, taking both AWS and R2/MinIO into account. */
export function resolveS3Url(
  env: CloudflareBindings,
  objectKey: string
): URL {
  const isAws = env.S3_ENDPOINT.includes(".amazonaws.com");
  const endpoint = env.S3_ENDPOINT.endsWith("/")
    ? env.S3_ENDPOINT.slice(0, -1)
    : env.S3_ENDPOINT;

  if (isAws) {
    return new URL(
      `https://${env.S3_BUCKET_NAME}.s3.${env.S3_REGION}.amazonaws.com/${objectKey}`
    );
  }
  return new URL(`${endpoint}/${env.S3_BUCKET_NAME}/${objectKey}`);
}

/** Resolve the list-objects URL (with a prefix filter). */
export function resolveS3ListUrl(
  env: CloudflareBindings,
  prefix: string,
  continuationToken?: string
): URL {
  const isAws = env.S3_ENDPOINT.includes(".amazonaws.com");
  const endpoint = env.S3_ENDPOINT.endsWith("/")
    ? env.S3_ENDPOINT.slice(0, -1)
    : env.S3_ENDPOINT;

  let urlStr: string;
  if (isAws) {
    urlStr = `https://${env.S3_BUCKET_NAME}.s3.${env.S3_REGION}.amazonaws.com/?list-type=2&prefix=${encodeURIComponent(prefix)}`;
  } else {
    urlStr = `${endpoint}/${env.S3_BUCKET_NAME}?list-type=2&prefix=${encodeURIComponent(prefix)}`;
  }

  if (continuationToken) {
    urlStr += `&continuation-token=${encodeURIComponent(continuationToken)}`;
  }

  return new URL(urlStr);
}

/**
 * Generate a presigned PUT URL for a single file upload.
 * Used by the deploy /init endpoint.
 */
export async function getPresignedPutUrl(
  env: CloudflareBindings,
  objectKey: string,
  contentType: string
): Promise<string> {
  const aws = getS3Client(env);
  const url = resolveS3Url(env, objectKey);

  const signed = await aws.sign(url, {
    method: "PUT",
    headers: { "Content-Type": contentType },
    aws: { signQuery: true },
  });

  return signed.url;
}

/**
 * Delete all S3 objects under a given prefix (e.g. `__outputs/my-project/`).
 * Handles pagination automatically.
 */
export async function deleteS3Prefix(
  env: CloudflareBindings,
  prefix: string
): Promise<void> {
  const aws = getS3Client(env);

  let hasMore = true;
  let continuationToken: string | undefined;

  while (hasMore) {
    const listUrl = resolveS3ListUrl(env, prefix, continuationToken);
    const listReq = await aws.sign(listUrl, { method: "GET" });
    const listRes = await fetch(listReq);

    if (!listRes.ok) {
      throw new Error(`S3 List Failed: ${await listRes.text()}`);
    }

    const xmlText = await listRes.text();

    // Simple regex extraction — avoids a heavy XML parser dependency
    const keys = [...xmlText.matchAll(/<Key>(.*?)<\/Key>/g)].map((m) => m[1]);
    const isTruncatedMatch = xmlText.match(/<IsTruncated>(true|false)<\/IsTruncated>/);
    hasMore = isTruncatedMatch ? isTruncatedMatch[1] === "true" : false;
    const nextTokenMatch = xmlText.match(/<NextContinuationToken>(.*?)<\/NextContinuationToken>/);
    continuationToken = nextTokenMatch ? nextTokenMatch[1] : undefined;

    for (const key of keys) {
      // Encode each path segment individually so slashes are preserved
      const safeKey = key.split('/').map(encodeURIComponent).join('/');
      const deleteUrl = resolveS3Url(env, safeKey);
      const delReq = await aws.sign(deleteUrl, { method: "DELETE" });
      await fetch(delReq); // best-effort; ignore individual failures
    }
  }
}
