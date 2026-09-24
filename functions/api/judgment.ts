import { maskSensitiveInfo } from "../lib/masking";
import { buildPrompt, RESPONSE_SCHEMA } from "../lib/prompt";
import { checkAndConsume, DEFAULT_DAILY_LIMIT } from "../lib/ratelimit";

interface Env {
  GEMINI_API_KEY: string;
  RATE_LIMIT_KV: KVNamespace;
  // 로컬 개발 편의용 오버라이드. .dev.vars에서만 설정하고 프로덕션에는 등록하지 않음
  // (미설정 시 DEFAULT_DAILY_LIMIT 사용).
  DAILY_LIMIT?: string;
  // "true"면 Gemini를 호출하지 않고 더미 판결문을 즉시 반환 (UI/레이아웃 테스트용).
  // .dev.vars에서만 설정. 프로덕션에는 절대 등록하지 않음.
  MOCK_MODE?: string;
}

interface JudgmentResult {
  judgment: "T" | "F";
  score: number;
  charge: string;
  ruling: string;
  reasoning: string;
  quote: string;
}

const MAX_STORY_LENGTH = 500;
// gemini-3.5-flash-lite는 내부적으로 thinking 과정을 거쳐 응답이 느린 편.
// 실측 결과 최소 프롬프트도 ~19초가 걸려 15초는 너무 짧았음 (2026-09-24).
const GEMINI_TIMEOUT_MS = 28000;
const GEMINI_ENDPOINT =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent";

class GeminiError extends Error {
  code: "rate_limited" | "upstream_error" | "parse_error";
  constructor(code: "rate_limited" | "upstream_error" | "parse_error", message: string) {
    super(message);
    this.code = code;
  }
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

function parseJudgment(text: string): JudgmentResult {
  let raw: Record<string, unknown>;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new GeminiError("parse_error", "판결문 형식이 올바르지 않습니다.");
  }

  const judgment = raw.judgment === "F" ? "F" : raw.judgment === "T" ? "T" : null;
  if (!judgment) throw new GeminiError("parse_error", "판결 결과가 비어 있습니다.");

  let score = Number(raw.score);
  if (!Number.isFinite(score)) score = 100;
  score = Math.max(0, Math.min(200, Math.round(score)));

  return {
    judgment,
    score,
    charge: typeof raw.charge === "string" ? raw.charge : "판단 보류죄",
    ruling: typeof raw.ruling === "string" ? raw.ruling : `피고인을 ${judgment}형으로 선고한다.`,
    reasoning:
      typeof raw.reasoning === "string" ? raw.reasoning : "이유 불충분으로 추가 심리가 필요합니다.",
    quote: typeof raw.quote === "string" ? raw.quote : "—",
  };
}

function buildMockResult(): JudgmentResult {
  const line = "이것은 UI 레이아웃 테스트용 더미 텍스트입니다. 실제 판결 내용이 아닙니다. ";
  const judgment: "T" | "F" = Math.random() < 0.5 ? "T" : "F";
  return {
    judgment,
    score: Math.floor(Math.random() * 201),
    charge: "더미테스트죄",
    ruling: `피고인을 ${judgment}형(테스트)으로 선고한다.`,
    reasoning: line.repeat(20),
    quote: "이것은 테스트용 인용구입니다",
  };
}

async function callGemini(env: Env, prompt: string): Promise<JudgmentResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), GEMINI_TIMEOUT_MS);

  try {
    const res = await fetch(GEMINI_ENDPOINT, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-goog-api-key": env.GEMINI_API_KEY,
      },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.9,
          responseMimeType: "application/json",
          responseSchema: RESPONSE_SCHEMA,
        },
      }),
      signal: controller.signal,
    });

    if (res.status === 429) {
      throw new GeminiError("rate_limited", "재판정이 혼잡합니다. 잠시 후 다시 시도해 주십시오.");
    }
    if (!res.ok) {
      throw new GeminiError("upstream_error", "판결 도중 오류가 발생했습니다. 다시 시도해 주십시오.");
    }

    const data: any = await res.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (typeof text !== "string") {
      throw new GeminiError("parse_error", "판결문을 해독하지 못했습니다.");
    }

    return parseJudgment(text);
  } finally {
    clearTimeout(timeout);
  }
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { request, env } = context;

  let body: { story?: unknown };
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: "요청 형식이 올바르지 않습니다." }, 400);
  }

  const story = typeof body.story === "string" ? body.story.trim() : "";
  if (!story) {
    return jsonResponse({ error: "진술 내용을 입력해 주십시오." }, 400);
  }
  if (story.length > MAX_STORY_LENGTH) {
    return jsonResponse({ error: `진술은 ${MAX_STORY_LENGTH}자 이내로 입력해 주십시오.` }, 400);
  }

  if (env.MOCK_MODE === "true") {
    // 실제 Gemini 응답 지연(~20초)을 재현해 로딩 화면(문구 순환 등)을 제대로 테스트하기 위함.
    await new Promise((resolve) => setTimeout(resolve, 20000));
    return jsonResponse(buildMockResult());
  }

  const ip = request.headers.get("CF-Connecting-IP") || "unknown";
  const dailyLimit = env.DAILY_LIMIT ? parseInt(env.DAILY_LIMIT, 10) : DEFAULT_DAILY_LIMIT;
  const rateLimit = await checkAndConsume(env.RATE_LIMIT_KV, ip, dailyLimit);
  if (!rateLimit.allowed) {
    return jsonResponse(
      { error: "오늘의 선고 요청 횟수를 모두 사용하셨습니다. 내일 다시 진술해 주십시오." },
      429
    );
  }

  const maskedStory = maskSensitiveInfo(story);
  const prompt = buildPrompt(maskedStory);

  try {
    const result = await callGemini(env, prompt);
    return jsonResponse(result);
  } catch (err) {
    if (err instanceof GeminiError && err.code === "parse_error") {
      try {
        const retryResult = await callGemini(env, prompt);
        return jsonResponse(retryResult);
      } catch {
        return jsonResponse({ error: "판결문을 정리하지 못했습니다. 다시 시도해 주십시오." }, 502);
      }
    }
    if (err instanceof GeminiError) {
      const status = err.code === "rate_limited" ? 429 : 502;
      return jsonResponse({ error: err.message }, status);
    }
    if (err instanceof Error && err.name === "AbortError") {
      return jsonResponse({ error: "판결이 지연되고 있습니다. 다시 시도해 주십시오." }, 504);
    }
    return jsonResponse({ error: "알 수 없는 오류가 발생했습니다." }, 500);
  }
};
