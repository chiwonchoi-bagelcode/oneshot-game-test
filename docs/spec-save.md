# 저장 명세 (spec-save)

> 상태: **구현 확인**(`src/core/save.ts`, `tests/save.test.ts`, `e2e/regressions.spec.ts` R-08). 클라우드 저장·계정 연동은 **미구현**(웹 로컬 저장만).

## 위치와 형식
- `localStorage['junk-rocket-ruckus-v1']` — 본 저장(JSON). `…-v1.backup` — 직전 정상 저장.
- 스키마 버전 `SAVE_VERSION = 2`. 필드: `coins, gearsFound, gearsSpent, owned, equip, stages{cleared,methods,bestCoins,runs,escapes}, settings{…}, seenIntro, tutorialDone, learned, attempts, lastSettled, lastStage`.

## 읽기 (앱 시작 시 `initSave`)
| 상황 | 결과 `loadStatus` | 사용자 안내 |
|---|---|---|
| 저장 없음 | `new` | 없음 |
| 정상 | `ok` | 없음 |
| 구버전(v<2) | `migrated` (자동 저장) | "새 버전으로 옮겼어요" |
| 일부 값 이상(없는 부품·없는 무대·음수·범위 밖·타입 오류) | `repaired` (자동 저장) | "일부가 이상해서 고쳤어요" |
| 본 저장 파싱 실패 + 백업 정상 | `backup` | "직전 백업으로 되돌렸어요" |
| 둘 다 손상 | `corrupt-reset` (초기 상태) | "복구할 수 없어서 새로 시작해요" |
| 저장소 접근 불가 | `storage-unavailable` | "진행이 남지 않을 수 있어요" |

검증 규칙(`sanitize`): 알 수 없는 톱니·부품·무대 ID 삭제, 장착 부품은 보유+슬롯 일치 아니면 기본 부품, 숫자는 범위로 자름, `gearsSpent ≤ 찾은 톱니 수`, `lastSettled ≤ attempts`, 설정 값은 허용 목록·범위.

## 쓰기
- `persist()`는 직전 본 저장(파싱 가능한 경우만)을 백업 슬롯으로 옮긴 뒤 쓴다. 실패하면 `false`를 돌려주고 UI가 "저장하지 못했어요"를 알린다(예외를 삼키지 않음).
- 쓰는 시점: 정산(`finish`), 톱니 획득 즉시, 연구·장착, 설정 변경, 튜토리얼 단계 완료, 앱 숨김(`visibilitychange`)·`pagehide`.

## 경제 원장 시점 (R-04)
- **병뚜껑**: 한 판 동안 모은 양은 임시. 정산(`finish`) 때 한 번 지급(성공·실패·중도 포기 모두 주운 양은 지급, 성공 보상은 성공에만). 시도 번호당 한 번(`lastSettled`).
- **톱니**: 수집품이라 **줍는 순간 저장**된다. 이미 찾은 톱니는 반투명 "유령"으로 보이고 다시 주워도 재화가 생기지 않는다(R-09). 결과 화면에 "이미 찾은 톱니 n개"를 따로 표시.
- 결과·실패 확정 뒤에는 픽업·목표가 원장을 바꾸지 않는다(`ledgerOpen=false`).

## 초기화
- 설정 → "진행 초기화…" → 확인 대화상자(취소 가능). 진행만 지우고 **설정은 유지**, 본 저장·백업을 모두 지운 뒤 새 저장을 쓴다(백업에 옛 진행이 남지 않음 — `tests/save.test.ts`).

## 시험
- 단위: 왕복·백업 회전·잘린 JSON→백업·양쪽 손상·잘못된 타입/범위/ID·v1 이전·쓰기 거부·초기화·톱니 지출 상한.
- E2E: 손상 본 저장 + 정상 백업, 쓰레기 값, 구버전·없는 부품, 저장 거부(QuotaExceeded) 안내, 초기화 취소/확정 후 재실행.
