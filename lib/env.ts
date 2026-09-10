function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env var ${name}`);
  }
  return value;
}

export function resendEnv() {
  return {
    apiKey: required("RESEND_API_KEY"),
    webhookSecret: required("RESEND_WEBHOOK_SECRET"),
    from: required("RESEND_FROM"),
  };
}

export function muxEnv() {
  return {
    tokenId: required("MUX_TOKEN_ID"),
    tokenSecret: required("MUX_TOKEN_SECRET"),
    webhookSecret: required("MUX_WEBHOOK_SECRET"),
  };
}

export function redisEnv() {
  const url =
    process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
  const token =
    process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) {
    throw new Error(
      "Missing KV_REST_API_URL/TOKEN or UPSTASH_REDIS_REST_URL/TOKEN",
    );
  }
  return { url, token };
}

export function inboundAddress(from = process.env.RESEND_FROM): string {
  const fallback = "coverage@inbound.ctey.dev";
  if (!from) return fallback;
  const angled = from.match(/<([^>]+)>/);
  return (angled?.[1] ?? from).trim() || fallback;
}
