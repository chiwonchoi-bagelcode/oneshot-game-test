# 계측 명세 (spec-telemetry)

> 상태: **구현 확인(로컬 기록만)**. 서버 전송·분석 SDK·동의 화면은 **미구현** — 실제 수집 전 개인정보 처리방침·동의·보관 기간을 정해야 한다(**검증 대기: 법무**).

- 구현: `src/core/telemetry.ts`. 이벤트는 기기 안 `localStorage['junk-rocket-ruckus-events']` 링 버퍼(최근 300개)에만 남고 네트워크로 나가지 않는다. QA가 세션을 내보내는 용도이자, 나중에 SDK를 붙일 자리다.
- 모든 이벤트 공통 속성: `schema`(1), `content`(콘텐츠 버전), `physics`(물리 버전), `economy`(경제 버전), `session`(무작위 세션 ID, 개인 식별 정보 없음), `t`.
- 중복 방지: `track(name, props, dedupe)` — 같은 dedupe 키는 한 번만 기록(예: `flight_end:<attempt>`).

| 이벤트 | 시점 | 주요 속성 |
|---|---|---|
| `app_open` | 앱 시작 | `load`(저장 로드 상태), `storage` |
| `flight_start` | 판 시작 | `attempt, level, body, engine, tank, nose, fins, retry` |
| `flight_end` | 정산 1회 | `attempt, level, result(success/fail/abandon), cause, reason, escaped, fuel_left, hull_left, hits, big_hits, broken, max_alt, time` |
| `currency_source` | 병뚜껑 정산 / 톱니 획득 | `currency(cap/gear), amount, reason, attempt, id` |
| `currency_sink` | 부품 연구 | `part, coins, gears, balance` |
| `part_equip` | 장착 변경 | `part, slot` |
| `build_autofix` | 불법 조합 자동 수리 | `parts` |
| `onboarding_step_complete` | 조작 안내 단계 완료 | `step(thrust/coast/brake/target), attempt, t` |
| `save_reset` | 진행 초기화 | — |

지표 정의 예(소프트런치용 제안, 미검증): 첫 성공까지 시도 수 = 첫 `flight_end.result=success`의 attempt, 공략 다양성 = 무대별 서로 다른 `cause` 수, 퇴장률 = `escaped=true` / 성공, 실패 사유 분포 = `reason` 빈도.
