// 설계문서 "레이트리밋 저장소: Cloudflare KV" 참고.
// 정책: IP 기준, 24시간 롤링 TTL (마지막 요청 시점부터 24시간 후 리셋).
// 목적이 "정확히 N회"가 아니라 "무료 티어 총량 보호"이므로 KV의 최종 일관성 오차는 허용.
//
// Gemini 무료 티어 하루 호출 한도(RPD) 참고 (2026-09-25, AI Studio에서 실측 확인):
// - gemini-3.5-flash-lite / gemini-3.1-flash-lite 각각 RPM 15 / TPM 250K / RPD 500,
//   judgment.ts에서 앞 모델이 429면 뒤 모델로 자동 폴백하므로 계정 전체로는 사실상
//   하루 1,000회까지 버팀 (당초 기준이었던 gemini-2.5-flash-lite는 신규 사용자에게
//   차단(404)되어 위 두 모델로 교체했음).
// - 아래 DEFAULT_DAILY_LIMIT=10은 그 1,000회를 사용자 1인당 배분한 값(보수적 마진 포함,
//   1000/10=100명이 하루 한도 꽉 채워도 버티는 수준). 그 이상 트래픽이 늘면 무료 티어
//   폴백을 더 추가하기보다 유료 플랜 전환이 정공법 (backlog.md 참고).

export const DEFAULT_DAILY_LIMIT = 10;
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
