# AI Harness — 업스트림 동기화 가이드

- 작성일: 2026-04-20
- 레포: https://github.com/Thanlee1216/vscode.git

---

## 브랜치 구조

```
main          ← MS vscode 원본 동기화 전용 (직접 수정 금지)
ai-harness    ← 우리 커스텀 작업 브랜치 (실질적 메인)
```

- `main`은 항상 MS 원본과 동일한 상태를 유지
- 모든 커스텀 작업은 `ai-harness` 브랜치에서 진행
- feature 브랜치는 `ai-harness`에서 따고, `ai-harness`로 머지

## Remote 설정

```
origin    → https://github.com/Thanlee1216/vscode.git    (내 fork — push 대상)
upstream  → https://github.com/microsoft/vscode.git      (MS 원본 — fetch 전용)
```

최초 설정 (이미 완료):
```bash
git remote add upstream https://github.com/microsoft/vscode.git
```

## 업스트림 동기화 절차

### 1단계: main 브랜치를 MS 원본과 동기화

```bash
git checkout main
git fetch upstream
git merge upstream/main
git push origin main
```

### 2단계: ai-harness에 최신 변경사항 반영

```bash
git checkout ai-harness
git merge main
```

여기서 충돌이 발생할 수 있음. 충돌 해결 후:

```bash
git add .
git commit -m "merge: upstream vscode X.XXX.X"
git push origin ai-harness
```

## 충돌 발생 시 주의사항

### 충돌 가능성 높은 파일
- `product.json` — 브랜딩 변경했으므로 MS가 필드를 추가/변경하면 충돌
- `src/vs/workbench/contrib/void/` — 우리가 추가한 폴더라 충돌 없음 (신규 파일)
- void 이식 시 수정한 VS Code 원본 파일들 — 등록 코드, contribution point 등

### 충돌 해결 원칙
1. `product.json`: MS가 추가한 새 필드는 수용, 우리 브랜딩 필드는 유지
2. 우리가 추가한 코드 블록: 주석으로 `// ─── AI Harness ───` 표시해두면 찾기 쉬움
3. 확신 없으면 `git merge --abort`로 되돌리고 파일별로 확인

## 업스트림 주기

- 권장: 월 1회 (VS Code는 매월 릴리스)
- 최소: 분기 1회
- 너무 오래 미루면 충돌이 누적되어 해결이 어려워짐

## 특정 버전으로 동기화하고 싶을 때

```bash
git fetch upstream --tags
git checkout main
git merge 1.120.0          # 특정 태그로 머지
git push origin main
```

## 긴급 롤백

ai-harness에서 업스트림 머지가 꼬였을 때:

```bash
git checkout ai-harness
git reflog                  # 머지 전 커밋 해시 확인
git reset --hard <커밋해시>  # 머지 전으로 되돌림
git push --force origin ai-harness
```
