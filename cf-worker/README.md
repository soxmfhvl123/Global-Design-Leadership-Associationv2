# GDLA Admin Backend (Cloudflare Worker) — 배포 방법

이 폴더에는 `worker.js`와 `wrangler.toml` 두 파일이 있어요. 이걸 배포하면 실제 GitHub 토큰과
비밀번호가 전부 서버(Cloudflare) 안에만 저장되고, `admin.html`은 그 서버를 통해서만 사이트를
수정하게 돼요. 브라우저(관리자 페이지)에는 토큰이 전혀 노출되지 않아요.

**주의**: 이 배포 과정에는 실제 비밀번호/토큰을 입력하는 단계가 있어요. 이건 본인(계정 소유자)이
직접 터미널에서 입력해야 해요 — 제가 대신 입력해드릴 수 없어요 (보안상 제가 실제 토큰이나
비밀번호를 다루지 않는 게 원칙이에요).

## 0. 준비물

- Node.js가 설치되어 있어야 해요 (이미 있으면 스킵).
- Cloudflare 계정 (무료 플랜으로 충분해요): https://dash.cloudflare.com/sign-up
- 새로 발급한 GitHub Personal Access Token (기존에 채팅에 붙여넣었던 토큰은 이미 노출됐으니
  **꼭 새로 발급**하세요):
  1. https://github.com/settings/personal-access-tokens/new 접속
  2. "Only select repositories" → `Global-Design-Leadership-Associationv2` 선택
  3. Repository permissions → **Contents: Read and write**
  4. 발급된 토큰을 잠시 메모장에 복사해두기 (한 번만 보여줘요)

## 1. 이 두 파일을 로컬 폴더로 옮기기

`worker.js`, `wrangler.toml` 두 파일을 새 폴더(예: `cf-worker`)에 넣으세요.

## 2. Wrangler 설치 & 로그인 (터미널에서 직접 실행)

```bash
npm install -g wrangler
cd cf-worker
wrangler login
```

`wrangler login`을 실행하면 브라우저가 열리고 Cloudflare 계정으로 로그인/승인하게 돼요.

## 3. 비밀값(Secret) 등록 — 본인이 직접 입력

```bash
wrangler secret put GITHUB_TOKEN
# → 방금 새로 발급한 GitHub 토큰 붙여넣기 (ghp_... 또는 github_pat_...)

wrangler secret put ADMIN_PASSWORD
# → 팀 전체가 로그인할 때 쓸 공용 비밀번호 (예: 1111, 또는 더 안전한 값)

wrangler secret put SESSION_SECRET
# → 아무 임의의 긴 문자열. 터미널에서 openssl rand -hex 32 로 만들어서 붙여넣으면 편해요.
```

이 세 값은 Cloudflare 서버에만 저장되고, 이후로는 다시 볼 수 없어요 (재설정만 가능).

## 4. 배포

```bash
wrangler deploy
```

성공하면 터미널에 아래처럼 Worker 주소가 출력돼요:

```
https://gdla-admin.<your-subdomain>.workers.dev
```

이 주소를 복사하세요.

## 5. admin.html에 Worker 주소 붙여넣기

`admin.html` 안에서 아래 줄을 찾아서:

```js
const WORKER_URL = 'https://gdla-admin.YOUR-SUBDOMAIN.workers.dev';
```

`YOUR-SUBDOMAIN` 부분을 4번에서 복사한 실제 주소로 바꾸고 저장하세요.

## 6. 커밋 & 푸시

`admin.html`을 저장소 루트에 커밋하고 (`git push`는 항상 본인이 직접 실행해야 해요),
`https://soxmfhvl123.github.io/Global-Design-Leadership-Associationv2/admin.html` 에서
아래처럼 로그인해보세요:

- Name: `piia` (또는 다른 팀원의 첫 이름 — niina / cathy / jeremy / mariana / phillip / kat / lauren / caleb)
- Password: 3번에서 등록한 `ADMIN_PASSWORD` 값

## 나중에 값 바꾸고 싶을 때

- 비밀번호 변경: `wrangler secret put ADMIN_PASSWORD` 다시 실행 (덮어쓰기)
- 새 팀원 추가: `worker.js`의 `TEAM` 배열에 한 줄 추가 → `wrangler deploy` 다시 실행
- GitHub 토큰 재발급: `wrangler secret put GITHUB_TOKEN` 다시 실행
