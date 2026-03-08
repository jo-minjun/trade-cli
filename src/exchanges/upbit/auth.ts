import { createHmac, createHash, randomUUID } from "node:crypto";

function base64url(data: string): string {
  return Buffer.from(data).toString("base64url");
}

export function createUpbitToken(accessKey: string, secretKey: string, queryString?: string): string {
  const header = base64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));

  const payload: Record<string, string> = {
    access_key: accessKey,
    nonce: randomUUID(),
  };

  if (queryString) {
    const queryHash = createHash("sha512").update(queryString, "utf-8").digest("hex");
    payload.query_hash = queryHash;
    payload.query_hash_alg = "SHA512";
  }

  const payloadEncoded = base64url(JSON.stringify(payload));
  const signature = createHmac("sha256", secretKey)
    .update(`${header}.${payloadEncoded}`)
    .digest("base64url");

  return `${header}.${payloadEncoded}.${signature}`;
}
