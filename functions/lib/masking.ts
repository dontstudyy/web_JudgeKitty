// 기획서 4-1절 / 설계문서 "민감정보 마스킹 로직" 참고.
// 목표는 완벽 차단이 아니라 노출 위험의 실질적 감소 (규칙 기반 1차 처리).

// TODO: 실제 운영 전, 고위험 공인(정치인 등) 이름을 여기에 채워 넣을 것.
// 예시 형태만 남겨둔 placeholder 목록이며, 특정 인물을 의도적으로 겨냥한 목록이 아님.
const PUBLIC_FIGURE_BLOCKLIST: string[] = [
  // "홍길동",
];

const SURNAMES = [
  "김", "이", "박", "최", "정", "강", "조", "윤", "장", "임",
  "한", "오", "서", "신", "권", "황", "안", "송", "류", "전",
  "홍", "고", "문", "양", "손", "배", "백", "허", "남", "심",
  "노", "하", "곽", "성", "차", "주", "우", "구", "민", "유",
];

const PARTICLES = ["에게", "한테", "이", "가", "은", "는", "을", "를", "님", "씨"];
const REGION_SUFFIXES = ["시", "도", "구", "동", "읍", "면", "리"];

// 성씨+조사 패턴에 우연히 걸리는 흔한 일반명사 예외 목록 (완전한 목록이 아니며,
// 이 서비스의 사연(반려동물/연애 등) 도메인에서 실사용 검증 중 발견된 것부터 추가).
const COMMON_WORD_EXCEPTIONS = new Set([
  "강아지", "고양이", "남자친구", "이야기", "이유",
]);

function maskMiddle(name: string): string {
  if (name.length <= 1) return name;
  if (name.length === 2) return `${name[0]}*`;
  return `${name[0]}${"*".repeat(name.length - 2)}${name[name.length - 1]}`;
}

function buildNamePattern(): RegExp {
  const surnameGroup = SURNAMES.join("|");
  const particleGroup = PARTICLES.sort((a, b) => b.length - a.length).join("|");
  // (성씨)(1~3음절)(조사) — 앞뒤로 한글이 이어지지 않는 경우만 매칭
  return new RegExp(
    `(?<![가-힣])(${surnameGroup})([가-힣]{1,3})(${particleGroup})(?![가-힣])`,
    "g"
  );
}

function buildRegionPattern(): RegExp {
  const suffixGroup = REGION_SUFFIXES.join("|");
  return new RegExp(`(?<![가-힣])([가-힣]{1,3})(${suffixGroup})(?![가-힣])`, "g");
}

export function maskSensitiveInfo(text: string): string {
  let result = text;

  for (const figure of PUBLIC_FIGURE_BLOCKLIST) {
    if (figure.length < 2) continue;
    result = result.split(figure).join(maskMiddle(figure));
  }

  result = result.replace(buildNamePattern(), (match, surname, rest, particle) => {
    const fullName = surname + rest;
    if (COMMON_WORD_EXCEPTIONS.has(fullName)) return match;
    return maskMiddle(fullName) + particle;
  });

  result = result.replace(buildRegionPattern(), (_match, place, suffix) => {
    return maskMiddle(place) + suffix;
  });

  return result;
}
