#!/usr/bin/env bash
# 전체 파이프라인 일체 자동화 — Claude/외부 LLM 호출 0.
#
# 단계:
#   1. (옵션) 학교 마스터 갱신   --schools
#   2. (옵션) 학교 상세 갱신     --info
#   3. (옵션) UUID 매핑 갱신     --ids   (collect_school_ids + _fix_unmapped_ids)
#   4. 학폭 스크래핑 (cd 69/75/66 × 4-way 병렬, macOS Vision OCR)
#   5. merge (cd별 base)
#   6. build_web_data
#   7. gh-pages 배포            --no-deploy 로 스킵 가능
#
# 의존:
#   - bun, python3, gh, git
#   - python: PIL, pyobjc-framework-Vision (pip install pyobjc-framework-Vision Pillow)
#
# 사용:
#   bash scripts/run_pipeline.sh                          # 학폭만 + 머지 + 빌드 + 배포
#   bash scripts/run_pipeline.sh --schools --info --ids   # 마스터 + 상세 + UUID도 갱신
#   bash scripts/run_pipeline.sh --no-deploy              # 배포 스킵
#   bash scripts/run_pipeline.sh --skip-violence          # 학폭 스킵 (이미 끝났을 때)
#   bash scripts/run_pipeline.sh --cd 69                  # 특정 cd만 (기본: 69 75 66 모두)

set -euo pipefail

cd "$(dirname "$0")/.."
ROOT="$(pwd)"
LOGS="$ROOT/logs"
mkdir -p "$LOGS"

DO_SCHOOLS=0; DO_INFO=0; DO_IDS=0; DO_DEPLOY=1; DO_VIOLENCE=1
CDS=(69 75 66)  # 심의 / 자체해결 / 예방교육
i=0; argv=("$@")
while (( i < ${#argv[@]} )); do
  arg="${argv[$i]}"
  case "$arg" in
    --schools)        DO_SCHOOLS=1 ;;
    --info)           DO_INFO=1 ;;
    --ids)            DO_IDS=1 ;;
    --no-deploy)      DO_DEPLOY=0 ;;
    --skip-violence)  DO_VIOLENCE=0 ;;
    --cd)             CDS=("${argv[$((i+1))]}"); i=$((i+1)) ;;
    *) echo "unknown: $arg"; exit 1 ;;
  esac
  i=$((i+1))
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
  step "미매핑 보정 (주소 disambiguation)"
  bun src/_fix_unmapped_ids.ts || true
fi

# ── 4. 학폭 4-way 병렬 (cd별 순차) ──────────
if (( DO_VIOLENCE )); then
  # 매핑 학교 수 → 4 등분 자동 슬라이스
  TOTAL=$(bun -e 'const ids = await Bun.file("data/school_ids.json").json(); console.log(Object.keys(ids).length)')
  CHUNK=$(( (TOTAL + 3) / 4 ))
  F0=0;            L0=$CHUNK
  F1=$CHUNK;       L1=$CHUNK
  F2=$((CHUNK*2)); L2=$CHUNK
  F3=$((CHUNK*3)); L3=$((TOTAL - F3))
  echo "전체 ${TOTAL} 학교 → 슬라이스 $CHUNK / $CHUNK / $CHUNK / $L3"

  for cd in "${CDS[@]}"; do
    step "학폭 cd=$cd 4-way 병렬 스크래핑"
    pkill -f "bun.*collect_violence" 2>/dev/null || true
    sleep 1

    PIDS=()
    bun src/collect_violence.ts --cd "$cd" --part 0 --from $F0 --limit $L0 >> "$LOGS/violence_${cd}_0.log" 2>&1 & PIDS+=($!)
    bun src/collect_violence.ts --cd "$cd" --part 1 --from $F1 --limit $L1 >> "$LOGS/violence_${cd}_1.log" 2>&1 & PIDS+=($!)
    bun src/collect_violence.ts --cd "$cd" --part 2 --from $F2 --limit $L2 >> "$LOGS/violence_${cd}_2.log" 2>&1 & PIDS+=($!)
    bun src/collect_violence.ts --cd "$cd" --part 3 --from $F3 --limit $L3 >> "$LOGS/violence_${cd}_3.log" 2>&1 & PIDS+=($!)

    echo "PIDs: ${PIDS[*]} — logs/violence_${cd}_{0..3}.log"
    for pid in "${PIDS[@]}"; do wait "$pid" || true; done
    echo "→ cd=$cd 4 인스턴스 종료"
  done
fi

# ── 5. 머지 ─────────────────────────────────
declare -A CD_BASE=( [69]=violence [75]=self_resolved [66]=prevention_edu )
for cd in "${CDS[@]}"; do
  base="${CD_BASE[$cd]:-gs$cd}"
  step "${base}_part_*.json 머지"
  bun src/merge_violence.ts --base "$base"
done

# ── 6. 빌드 ─────────────────────────────────
step "web/public/data.json 빌드"
bun src/build_web_data.ts

# ── 7. 배포 ─────────────────────────────────
if (( DO_DEPLOY )); then
  step "GitHub Pages 배포"
  bash scripts/deploy.sh

  step "main 브랜치 커밋·푸시"
  git add \
    data/violence.json data/self_resolved.json data/prevention_edu.json \
    data/schools.json data/school_info.json data/school_ids.json \
    web/public/data.json 2>/dev/null || true
  if ! git diff --cached --quiet; then
    git -c user.name="pipeline-bot" -c user.email="pipeline@local" commit -qm "데이터 갱신: $(date '+%Y-%m-%d %H:%M')"
    git push -q
    echo "→ main 푸시 완료"
  else
    echo "→ 데이터 변경 없음"
  fi
fi

echo -e "\n✓ 파이프라인 완료 ($(ts))"
