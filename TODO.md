# TODO — 대한팩폭고등법원

[(기획서)](<./(기획서) 대한팩폭고등법원.md>) · [설계문서](./설계문서.md) · [backlog](./backlog.md) 기준. 체크박스는 실행 순서.

> **환경 참고**: Node.js 22 전환, `npm install`, 타입체크 모두 통과. Wrangler 로그인 완료, KV 네임스페이스 발급 완료(`852460fbf618469e8ea11733eed5efc4`), Gemini API 키 발급 완료. `wrangler pages dev`로 로컬 E2E 테스트까지 마쳤습니다.
>
> **⚠️ 중요 변경**: 실제 키로 테스트한 결과 `gemini-2.5-flash-lite` 모델이 **신규 사용자에게 404로 차단**되어 있음을 확인했습니다 (Google 공지: "no longer available to new users"). 대체 모델 `gemini-3.5-flash-lite`로 교체해 정상 동작 확인함. 기획서/설계문서의 모델명도 갱신 필요.

---

## Phase 0. 프로젝트 환경 구축 — 완료

- [o] 원본 프로토타입 아티팩트 HTML/CSS/JS 원본 확보 (`아티팩트_대한팩폭고등법원.html`)
- [o] Node.js 22로 전환 (nvm use 22)
- [o] `npm install` 실행, `npx tsc --noEmit` 타입 체크 통과
- [o] Cloudflare 로그인 완료
- [o] 디렉터리 구조 세팅: `public/`, `functions/api/`, `functions/lib/`
- [o] `wrangler.toml` 작성 — KV 네임스페이스 id 반영 완료 (`852460fbf618469e8ea11733eed5efc4`)
- [o] `package.json` / `tsconfig.json` 작성
- [o] KV 네임스페이스 생성 완료
- [o] `.gitignore` 설정 — `.dev.vars` 포함 확인
- [o] Gemini API 키 발급 완료
- [o] `GEMINI_API_KEY`를 `.dev.vars`에 등록 (로컬 테스트용, git 제외 확인됨)
- [ ] **(사용자 액션)** Cloudflare Pages 프로젝트 생성 (대시보드 또는 `wrangler pages project create`) — 아직 프로덕션 배포 전이라 미착수
- [ ] **(사용자 액션, 배포 전 필수)** `GEMINI_API_KEY`를 Cloudflare Pages 환경변수(Secret)로 등록 — `.dev.vars`는 로컬 전용, 배포 시 별도 등록 필요

> ⚠️ **주의 기록**: 최초에 `public/.env`에 키를 넣으셨는데, `public/`은 Cloudflare Pages가 정적 파일로 그대로 서빙하는 폴더라 배포 시 키가 그대로 노출될 뻔했습니다. `.dev.vars`(프로젝트 루트, gitignore 처리됨)로 옮겼습니다. 다행히 git 커밋 이력이 없어 실제 유출은 없었습니다.

## Phase 1. 프론트엔드 이식 — 완료

- [o] 원본 아티팩트 HTML/CSS를 `public/index.html`로 이관
- [o] 폰트 CDN 연결 확인 (Song Myung, Noto Serif KR, Nanum Gothic Coding)
- [o] 다크모드 대응 및 모바일 반응형 CSS 규칙 그대로 이식
- [o] 법원명 "대한팩폭고등법원" 텍스트 유지 (`<title>`도 통일)
- [o] `claude.use('sample')` 호출부를 `fetch('/api/judgment', ...)`로 교체
- [o] 응답 JSON 필드명 `judgment` 기준으로 렌더링 로직 수정
- [o] 사연 입력 textarea 500자 제한(프론트 `maxlength` + 실시간 글자 수 카운터) 추가
- [o] 예시 3종 버튼 동작 유지
- [o] 로딩 상태("심리 중입니다") 애니메이션이 실제 fetch 대기 중 표출되도록 연결
- [o] "다시 진술하기" 버튼 → 입력 화면 복귀 동작 유지

## Phase 2. 서버리스 함수 `/api/judgment` 개발 — 완료, 실제 Gemini 호출 검증됨

- [o] `functions/api/judgment.ts` 작성
- [o] 입력 검증 (빈 문자열, 500자 초과 차단) — curl로 동작 확인
- [o] 민감정보 마스킹 모듈 작성 (`functions/lib/masking.ts`)
  - [o] 공인 블록리스트 골격 (현재는 예시 placeholder — **사용자 액션**: 실제 마스킹할 공인 이름 목록 채워 넣기)
  - [o] 일반 이름 휴리스틱 (성씨 30종 + 조사 패턴) — "김민수가" → "김*수가" 정상 마스킹 확인
  - [o] 지명 마스킹 (행정구역 접미사 패턴)
  - [o] **실사용 테스트 중 발견한 오탐지 수정**: "강아지", "고양이", "남자친구", "이야기", "이유"가 성씨+조사 패턴에 우연히 걸려 마스킹되던 버그 → `COMMON_WORD_EXCEPTIONS` 예외 목록 추가로 패치 (이 앱 도메인 특성상 반려동물/연애 단어가 자주 나와 영향이 컸음)
  - [ ] 마스킹 로직 정식 단위 테스트 코드화 — 미착수 (수동 검증만 완료)
- [o] 프롬프트 조립 함수 작성 (`functions/lib/prompt.ts`, 원본 프로토타입 문구 재사용 + judgment 필드명 통일)
- [o] 프롬프트에 "마스킹된 이름 복원 금지" 지시문 포함
- [o] **모델 교체**: `gemini-2.5-flash-lite` → `gemini-3.5-flash-lite` (신규 API 키에 2.5 Flash-Lite가 404로 막혀 있음을 실측 확인, Google이 3.5 Flash-Lite로의 이전을 공식 안내)
- [o] Gemini API 호출 구현 (`generateContent`, `x-goog-api-key`, `responseMimeType: application/json`)
- [o] `responseSchema`로 JSON 스키마 강제
- [o] Gemini 응답 파싱/정제 (원본 응답 비노출)
- [o] 파싱 실패 시 1회 재시도, 재실패 시 에러 메시지 반환
- [o] 타임아웃 15초 설정 (`AbortController`)
- [o] Gemini 429 → "재판정이 혼잡합니다" 메시지 매핑
- [o] **모델 폴백 체인** (2026-09-25): `gemini-3.5-flash-lite` → `gemini-3.1-flash-lite` 순 429 시 자동 재시도 (`callGeminiWithFallback`), 사용자에겐 미노출. `gemma-4-26b-a4b-it`도 3순위로 시도해봤으나 응답 시간 편차(25초~300초+)가 너무 커서 제외 — 설계문서 참고
- [o] 실제 Gemini API 키로 로컬 호출 성공 확인 (예시 1·2 사연으로 실제 판결문 생성 확인)

## Phase 3. 레이트리밋 (Cloudflare KV) — 로직 검증 완료, 실서버 연동은 부분 검증

- [o] KV 키 설계: `rl:{IP}` (`CF-Connecting-IP` 기준)
- [o] 하루 허용 호출 횟수 확정: **10회** (최초 7회 → 2026-09-25 Gemini RPD 500 실측 확인 후 10회로 상향, `functions/lib/ratelimit.ts` 참고)
- [o] TTL 정책 확정: **24시간 롤링** (마지막 요청 시점 기준 재설정 — 자정 리셋보다 구현이 단순하고 정확도 요구가 낮아 채택)
- [o] `functions/lib/ratelimit.ts` — KV 조회/증가/거부 로직 작성
- [o] `/api/judgment`에 레이트리밋 체크 연결 (초과 시 429 응답)
- [o] 로직 자체는 Mock KV로 9회 연속 호출 시뮬레이션해 7회 허용/8회부터 차단 확인
- [o] 실제 KV 바인딩 기준 검증 — 로컬 테스트 누적으로 하루 한도 소진되어 "오늘의 선고 요청 횟수를 모두 사용하셨습니다" 응답 실제 발생 확인

## Phase 4. 통합 테스트 — 핵심 플로우 검증 완료, 일부 잔여

- [o] `wrangler pages dev`로 로컬 개발 서버 실행 확인
- [o] 예시 사연 2종(강아지, 이별) End-to-End 테스트 — 정상 판결문 생성 확인
- [o] 예시 3(생일 서프라이즈) 테스트 — 로컬은 레이트리밋으로 막혔으나, 프로덕션 배포 후 정상 판결문 생성 확인
- [o] 에러 케이스: 빈 입력 → "진술 내용을 입력해 주십시오" 정상 반환 확인
- [o] 에러 케이스: 500자 초과 입력 → "진술은 500자 이내로 입력해 주십시오" 정상 반환 확인
- [ ] 에러 케이스: Gemini API 429/타임아웃 시뮬레이션 — 미실행 (Mock 없이는 실제 유발이 어려움, 코드 리뷰로 분기 로직만 확인한 상태)
- [ ] 에러 케이스: Gemini 응답이 JSON 형식을 벗어나는 경우 — 미실행 (위와 동일 사유)
- [o] 마스킹 로직 실사용 문장으로 재검증 (오탐지 발견 및 수정, 위 Phase 2 참고)
- [o] 레이트리밋 로직 검증 — Mock + 실제 KV 모두 확인 (위 Phase 3 참고)
- [o] 브라우저에서 UI 직접 확인 — 사용자 확인 완료 ("대 한 팩 폭 고 등 법 원" 폰트 크기 15px→19px 조정 반영)
- [ ] 모바일 화면 크기 반응형 확인 — 미실행
- [ ] 다크모드 전환 확인 — 미실행

## Phase 5. 배포 — 완료

- [o] Cloudflare 계정(`sevenspear@naver.com`) 이메일 인증 완료
- [o] Cloudflare Pages 프로젝트 생성 (`tfcourt`)
- [o] `GEMINI_API_KEY`를 Cloudflare Pages Secret으로 등록 (production 환경)
- [o] Cloudflare Pages 프로덕션 배포 — **https://tfcourt.pages.dev**
- [o] 배포 환경에서 환경변수/KV 바인딩 정상 적용 확인 (`wrangler kv key list`로 `rl:{IP}` 키 기록 확인)
- [o] 프로덕션 URL 전체 플로우 재확인 (빈 입력 검증 400, 예시 3 사연으로 실제 판결문 생성 200 확인)

> 참고: 배포 직후 발급되는 해시 URL(`https://<hash>.tfcourt.pages.dev`)은 전파 지연으로 잠시 접속이 안 될 수 있음 — 고정 URL `https://tfcourt.pages.dev`는 바로 정상 동작했음.
> (2026-09-25) 프로젝트명을 `tfcourt` → `judgekitty`로 변경, 프로덕션 URL이 `https://judgekitty.pages.dev`로 바뀜. 위 항목들은 변경 당시 기록이라 원문 그대로 둠.

## Phase 6. 배포 후 모니터링 — 미착수

- [ ] Gemini 콘솔 RPD 소진 추이 모니터링 체계 확인
- [ ] Cloudflare 대시보드에서 Pages Functions 호출 수 / KV 사용량 확인

---

## Backlog (1차 범위 밖 — [backlog.md](./backlog.md) 참고, 착수하지 않음)

- [ ] 개인정보 국외 이전 고지 — 정확한 법률 문구 확정 (**실사용자 공개 전 필수**)
- [ ] 결과 이미지 저장/공유 기능
- [ ] 인기 판결 모음 / 랭킹
- [ ] 판사 캐릭터 다양화 (톤 선택 옵션)
