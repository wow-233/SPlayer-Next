#!/usr/bin/env bash
# 同步官方上游（SPlayer-Dev/SPlayer-Next dev）到自用分支
# 用法：Git Bash 里运行  bash scripts/sync-upstream.sh
set -e
cd "$(dirname "$0")/.."

BRANCH=$(git branch --show-current)
echo "[sync] 当前分支: $BRANCH"

echo "[sync] 拉取官方仓库..."
git fetch origin

BASE=$(git merge-base HEAD origin/dev)
UPSTREAM=$(git rev-parse origin/dev)
if [ "$BASE" = "$UPSTREAM" ]; then
  echo "[sync] 官方 dev 无新提交，已是最新同步（基线 $(git log -1 --format=%cs "$BASE")）"
  exit 0
fi

BEHIND=$(git rev-list --count HEAD..origin/dev)
echo "[sync] 官方 dev 有 $BEHIND 个新提交，开始 rebase..."
if ! git diff-index --quiet HEAD --; then
  echo "[sync] ❌ 工作区有未提交改动，请先提交或暂存（git stash）"
  exit 1
fi

if git rebase origin/dev; then
  echo "[sync] rebase 成功"
  if git diff --quiet "HEAD@{1}" HEAD -- pnpm-lock.yaml; then
    echo "[sync] 依赖无变化，跳过安装"
  else
    echo "[sync] lockfile 有变化，重新安装依赖..."
    pnpm install
  fi
  echo "[sync] 类型检查..."
  pnpm typecheck
  echo "[sync] 测试..."
  pnpm test
  echo "[sync] ✅ 完成。建议跑一次 pnpm dev 冒烟后再日常使用。"
else
  echo ""
  echo "[sync] ❌ rebase 出现冲突，现场已保留："
  git diff --name-only --diff-filter=U
  echo "[sync] 处理方式："
  echo "[sync]   1) 把仓库交给 AI 继续解决（推荐）"
  echo "[sync]   2) 手动解决后：git add -A && git rebase --continue"
  echo "[sync]   3) 放弃本次同步：git rebase --abort"
  exit 1
fi
