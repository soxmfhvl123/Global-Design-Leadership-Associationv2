# GDLA Admin Backend (Cloudflare Worker)

`worker.js`와 `wrangler.toml`이 저장소 **루트**에 있어요 — Cloudflare의 "Git에 연결" 배포 방식은
루트 디렉토리 기준으로 `wrangler.toml`을 찾아서 `npx wrangler deploy`를 실행하기 때문이에요.
즉, 이 저장소에 `git push`할 때마다 Cloudflare가 자동으로 Worker를 다시 배포해줘요 (별도로
wrangler를 설치하거나 터미널에서 배포 명령을 실행할 필요가 없어요).

## 비밀값(Secret) 등록 — 반드시 본인이 Cloudflare 대시보드에서 직접 입력

Worker 배포가 끝나면, 그 Worker 페이지 → **Settings** → **Variables and Secrets**
(대시보드 버전에 따라 이름이 조금 다를 수 있어요)로 가서 아래 3개를 "Secret" 타입으로 추가하세요:

- `GITHUB_TOKEN` → 새로 발급받은 GitHub Personal Access Token
  (github.com/settings/personal-access-tokens/new → "Only select repositories" →
  이 저장소 선택 → Repository permissions: **Contents: Read and write**)
- `ADMIN_PASSWORD` → 팀 전체가 admin.html에 로그인할 때 쓸 공용 비밀번호
- `SESSION_SECRET` → 아무 무작위 긴 문자열 (계정과 무관한 값이라 Claude가 생성해준 걸 써도 안전해요)

추가 후 저장하면 (필요하면) Worker가 다시 배포돼요.

## Worker 주소 확인 & admin.html에 연결

Worker 페이지 상단에 표시되는 주소를 복사하세요
(`https://<worker-이름>.<계정 서브도메인>.workers.dev` 형태). 그 주소를 `admin.html`의
`WORKER_URL` 상수에 붙여넣고 커밋/푸시하면 끝이에요.

## 나중에 값 바꾸고 싶을 때

- 비밀번호 변경: Settings → Variables and Secrets에서 `ADMIN_PASSWORD` 값 수정
- 새 팀원 추가: `worker.js`의 `TEAM` 배열에 한 줄 추가 → 커밋 & 푸시하면 자동 재배포
- GitHub 토큰 재발급: `GITHUB_TOKEN` 시크릿 값만 교체
