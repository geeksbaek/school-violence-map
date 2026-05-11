#!/usr/bin/env bash
# 전체 파이프라인 일체 자동화 — Claude/외부 LLM 호출 0.
#
# 단계:
#   1. (옵션) 학교 마스터 갱신   --schools
#   2. (옵션) 학교 상세 갱신     --info
#   3. (옵션) UUID 매핑 갱신     --ids
#   4. 학폭 스크래핑 (4-way 병렬, macOS Vision OCR)
#   5. merge_violence
#   6. build_web_data
#   7. gh-pages 배포            --no-deploy 로 스킵 가능
#
# 의존:
#   - bun, python3, gh, git
#   - python: PIL, pyobjc-framework-Vision (pip install pyobjc-framework-Vision Pillow)
#
# 사용:
#   bash scripts/run_pipeline.sh                # 학폭만 + 머지 + 빌드 + 배포
#   bash scripts/run_pipeline.sh --schools --info --ids   # 마스터 + 상세 + UUID도 갱신
#   bash scripts/run_pipeline.sh --no-deploy    # 배포 스킵
#   bash scripts/run_pipeline.sh --skip-violence # 학폭 스킵 (이미 끝났을 때)

set -euo pipefail

cd "$(dirname "$0")/.."
ROOT="$(pwd)"
LOGS="$ROOT/logs"
mkdir -p "$LOGS"

DO_SCHOOLS=0; DO_INFO=0; DO_IDS=0; DO_DEPLOY=1; DO_VIOLENCE=1
for arg in "$@"; do
  case "$arg" in
    --schools)        DO_SCHOOLS=1 ;;
    --info)           DO_INFO=1 ;;
    --ids)            DO_IDS=1 ;;
    --no-deploy)      DO_DEPLOY=0 ;;
    --skip-violence)  DO_VIOLENCE=0 ;;
    *) echo "unknown: $arg"; exit 1 ;;
  esac
done

ts() { date '+%H:%M:%S'; }
step() { echo -e "\n━━━ [$(ts)] $1 ━━━"; }

# ── 1. 학교 마스터 ───────────────────────────
if (( DO_SCHOOLS )); then
  step "학교 마스터 수집"
  bun src/collect_schools.ts
fi

# ── 2. 학교 상세 ────────────────────────────
if (( DO_INFO )); then
  step "학교 상세 17 apiType 수집"
  bun src/collect_info.ts
fi

# ── 3. UUID 매핑 ────────────────────────────
if (( DO_IDS )); then
  step "검색 인터페이스 SHL_IDF_CD 매핑"
  bun src/collect_school_ids.ts
fi

# ── 4. 학폭 4-way 병렬 ──────────────────────
if (( DO_VIOLENCE )); then
  step "학폭 4-way 병렬 스크래핑 (macOS Vision OCR)"

  # 기존 인스턴스 정리
  pkill -f "bun.*collect_violence" 2>/dev/null || true
  sleep 1

  PIDS=()
  bun src/collect_violence.ts --part 0 --from 0   --limit 175 >> "$LOGS/violence_0.log" 2>&1 &
  PIDS+=($!)
  bun src/collect_violence.ts --part 1 --from 175 --limit 175 >> "$LOGS/violence_1.log" 2>&1 &
  PIDS+=($!)
  bun src/collect_violence.ts --part 2 --from 350 --limit 175 >> "$LOGS/violence_2.log" 2>&1 &
  PIDS+=($!)
  bun src/collect_violence.ts --part 3 --from 525 --limit 200 >> "$LOGS/violence_3.log" 2>&1 &
  PIDS+=($!)

  echo "PIDs: ${PIDS[*]} — logs/violence_{0..3}.log"
  echo "진행 상황: tail -f $LOGS/violence_*.log"

  # 모든 인스턴스 종료 대기
  for pid in "${PIDS[@]}"; do
    wait "$pid" || true
  done
  echo "→ 4 인스턴스 모두 종료"
fi

# ── 5. 머지 ─────────────────────────────────
step "violence_part_*.json 머지"
bun src/merge_violence.ts

# ── 6. 빌드 ─────────────────────────────────
step "web/public/data.json 빌드"
bun src/build_web_data.ts

# ── 7. 배포 ─────────────────────────────────
if (( DO_DEPLOY )); then
  step "GitHub Pages 배포"
  bash scripts/deploy.sh

  step "main 브랜치 커밋·푸시"
  git add data/violence.json data/schools.json data/school_info.json data/school_ids.json web/public/data.json 2>/dev/null || true
  if ! git diff --cached --quiet; then
    git -c user.name="pipeline-bot" -c user.email="pipeline@local" commit -qm "데이터 갱신: $(date '+%Y-%m-%d %H:%M')"
    git push -q
    echo "→ main 푸시 완료"
  else
    echo "→ 데이터 변경 없음"
  fi
fi

echo -e "\n✓ 파이프라인 완료 ($(ts))"
