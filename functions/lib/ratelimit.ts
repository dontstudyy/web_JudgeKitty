// 설계문서 "레이트리밋 저장소: Cloudflare KV" 참고.
// 정책: IP 기준, 24시간 롤링 TTL (마지막 요청 시점부터 24시간 후 리셋).
// 목적이 "정확히 N회"가 아니라 "무료 티어 총량 보호"이므로 KV의 최종 일관성 오차는 허용.

export const DEFAULT_DAILY_LIMIT = 7;
const WINDOW_SECONDS = 60 * 60 * 24;

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
}

export async function checkAndConsume(
  kv: KVNamespace,
  ip: string,
  dailyLimit: number = DEFAULT_DAILY_LIMIT
): Promise<RateLimitResult> {
  const key = `rl:${ip}`;
  const current = await kv.get(key);
  const count = current ? parseInt(current, 10) : 0;

  if (count >= dailyLimit) {
    return { allowed: false, remaining: 0 };
  }

  await kv.put(key, String(count + 1), { expirationTtl: WINDOW_SECONDS });
  return { allowed: true, remaining: dailyLimit - (count + 1) };
}
