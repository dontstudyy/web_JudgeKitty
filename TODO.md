# TODO — 대한팩폭고등법원

[(기획서)](<./(기획서) 대한팩폭고등법원.md>) · [설계문서](./설계문서.md) · [backlog](./backlog.md) 기준. 체크박스는 실행 순서.

---

## Phase 0. 프로젝트 환경 구축

- [ ] 원본 프로토타입 아티팩트([링크](https://claude.ai/artifact/EQzA5QQx8KQEKJLSbQzQH4)) 열어 HTML/CSS/JS 원본 확보
- [ ] Cloudflare 계정 생성 및 Wrangler CLI 설치/로그인
- [ ] Cloudflare Pages 프로젝트 생성 (대시보드 또는 `wrangler pages project create`)
- [ ] 디렉터리 구조 세팅: `public/`(정적 페이지), `functions/api/`(서버리스 함수)
- [ ] `wrangler.toml` 작성 — Pages 프로젝트 설정
- [ ] Cloudflare KV 네임스페이스 생성 (레이트리밋 카운터용) 및 `wrangler.toml`에 바인딩 추가
- [ ] `.gitignore` 설정 (`node_modules`, `.wrangler`, `.env` 등)
- [ ] Gemini API 키 발급 (Google AI Studio, 카드 등록 없이)
- [ ] `GEMINI_API_KEY`를 Cloudflare Pages 환경변수(Secret)로 등록 — 코드에 하드코딩 금지

## Phase 1. 프론트엔드 이식

- [ ] 원본 아티팩트의 HTML/CSS를 `public/index.html`로 이관
- [ ] 폰트 CDN 연결 확인: Song Myung, Noto Serif KR, Nanum Gothic Coding
- [ ] 다크모드 대응 및 모바일 반응형 CSS 규칙 그대로 이식되었는지 확인
- [ ] 법원명 "대한팩폭고등법원" 텍스트 유지 확인
- [ ] 프론트 JS의 `claude.use('sample')` 호출부를 `fetch('/api/judgment', { method: 'POST', body: JSON.stringify({ story }) })`로 교체
- [ ] 응답 JSON 필드명을 `judgment`(T/F) 기준으로 렌더링 로직 수정 — 죄목/주문/도장 스탬프/T-F 게이지/이유/인용구 매핑
- [ ] 사연 입력 textarea 길이 제한(500자 권장) 프론트 검증 추가
- [ ] 예시 3종 버튼 동작 확인
- [ ] 로딩 상태("재판 진행중") 애니메이션이 실제 fetch 응답 대기 중 표출되는지 연결
- [ ] "다시 진술하기" 버튼 → 입력 화면 복귀 동작 확인

## Phase 2. 서버리스 함수 `/api/judgment` 개발

- [ ] `functions/api/judgment.ts` 파일 생성, 기본 요청/응답 골격 작성
- [ ] 입력 검증: 빈 문자열 차단, 과도한 길이(500자 초과 등) 차단
- [ ] 민감정보 마스킹 모듈 작성 (4-1절, [설계문서](./설계문서.md) "민감정보 마스킹 로직" 참고)
  - [ ] 공인 블록리스트 하드코딩 (정치인 등 고위험 이름) + 가운데 글자 마스킹 로직
  - [ ] 일반 이름 휴리스틱: 한국 성씨 + 조사 패턴으로 2~4음절 고유명사 탐지 후 마스킹
  - [ ] 지명 마스킹: 행정구역 접미사(시/도/구/동/읍/면/리) 기반 탐지
  - [ ] 마스킹 로직 단위 테스트 케이스 작성 (탐지 성공/실패 사례 모두)
- [ ] 프롬프트 조립 함수 작성 — 판사 페르소나 프롬프트(원본 프로토타입 문구 재사용) + 마스킹된 사연 삽입
- [ ] 프롬프트에 "마스킹된 이름을 원래대로 추측·복원하지 말 것" 지시문 포함
- [ ] Gemini API 호출 구현 (`generateContent`, `x-goog-api-key` 헤더, `responseMimeType: application/json`)
- [ ] 가능하면 `responseSchema`로 JSON 스키마(`judgment`, `score`, `charge`, `ruling`, `reasoning`, `quote`) 강제
- [ ] Gemini 응답 파싱 및 정제 — 원본 응답 그대로 클라이언트에 노출하지 않기
- [ ] 파싱 실패 시 1회 재시도 로직, 재시도도 실패하면 사용자에게 재시도 요청 메시지 반환
- [ ] 타임아웃 설정(15초) 및 초과 시 에러 처리
- [ ] Gemini 429(rate limit) 응답 시 "재판정이 혼잡합니다" 메시지로 매핑

## Phase 3. 레이트리밋 (Cloudflare KV)

- [ ] KV 키 설계: `CF-Connecting-IP` 헤더 기준 IP를 키로 사용
- [ ] 하루 허용 호출 횟수 확정 (backlog 세부값 결정 — 5~10회 중 택1)
- [ ] KV 키 TTL 정책 확정 (자정 리셋 vs 24시간 롤링, backlog 참고) 및 구현
- [ ] 요청마다 KV에서 카운트 조회 → 초과 시 429 형태로 거부 응답
- [ ] 정상 요청 처리 후 KV 카운트 증가 (`put`)
- [ ] KV 최종 일관성(최대 ~60초 지연) 감안한 동작 확인 — 카운트 오차가 서비스에 지장 없는지 확인

## Phase 4. 통합 테스트

- [ ] 로컬 개발 서버 실행 (`wrangler pages dev`)
- [ ] 예시 사연 3종으로 End-to-End 테스트 (입력 → 판결문 화면까지)
- [ ] 에러 케이스 테스트: 빈 입력, 500자 초과 입력
- [ ] 에러 케이스 테스트: Gemini API 실패/429 시뮬레이션
- [ ] 에러 케이스 테스트: Gemini 응답이 JSON 형식을 벗어나는 경우 (파싱 실패 폴백 문구 확정 필요 — 기획서 리스크 항목)
- [ ] 마스킹 로직 실사용 문장으로 재검증 (실명 포함 사연 여러 건)
- [ ] 레이트리밋 동작 테스트: 허용 횟수 초과 시 정상적으로 차단되는지
- [ ] 모바일 화면 크기에서 반응형 레이아웃 확인
- [ ] 다크모드 전환 확인

## Phase 5. 배포

- [ ] Cloudflare Pages 프로덕션 배포 (`프로젝트명.pages.dev`)
- [ ] 배포 환경에서 환경변수(`GEMINI_API_KEY`)와 KV 바인딩이 정상 적용됐는지 확인
- [ ] 프로덕션 URL에서 전체 플로우 재확인 (로컬 테스트와 별개로)

## Phase 6. 배포 후 모니터링

- [ ] Gemini 콘솔에서 RPD(하루 1,000회) 소진 추이 모니터링 체계 확인
- [ ] Cloudflare 대시보드에서 Pages Functions 호출 수 / KV 사용량 확인

---

## Backlog (1차 범위 밖 — [backlog.md](./backlog.md) 참고, 착수하지 않음)

- [ ] 개인정보 국외 이전 고지 — 정확한 법률 문구 확정 (메커니즘은 확정, 문구만 보류 — **실사용자 공개 전 필수**)
- [ ] 결과 이미지 저장/공유 기능
- [ ] 인기 판결 모음 / 랭킹 (별도 DB, Cloudflare KV 또는 D1)
- [ ] 판사 캐릭터 다양화 (톤 선택 옵션)
