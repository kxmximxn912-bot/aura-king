# 『아우라의 왕』 카카오톡 챗봇



Kakao i Open Builder의 스킬 서버용 Node.js 프로젝트입니다. `/kakao/skill`에서 카카오 스킬 요청을 받고, SQLite에 사용자·출석·포인트·공지·관리자·금칙어를 저장합니다.



## 포함 기능



- 기본: `/help`, `/ai`, `/내아이디`, `/내정보`, `/출석`, `/랭킹`, `/공지`, `/핑`, `/버전`, `/test`
- 
- 인증 안내: `/인증`, `/복구`, `/인증상태`, `/인증도움말`
- 
- 활동: `/프로필`, `/닉네임`, `/가입일`, `/활동량`, `/내랭킹`, `/내포인트`
- 
- 게임·유틸: 주사위, 동전, 가위바위보, 랜덤, 시간, 날짜, 계산, 랜덤 이름
- 
- AI: `/ai`, `/번역`, `/요약`, `/맞춤법`, `/영작`, `/단어`, `/아이디어`
- 
- 관리자: 공지, 금칙어, 관리자 목록, 통계
- 
- 문의·신고 접수 및 개인정보 최소 수집
- 


## 로컬 실행



```bash

cp .env.example .env

# .env에 OPENAI_API_KEY, OPENAI_MODEL, AUTH_URL 입력

npm install

npm start

```



테스트:



```bash

curl http://localhost:3000/health

curl -X POST http://localhost:3000/kakao/skill \\

  -H 'Content-Type: application/json' \\

  -d '{"userRequest":{"utterance":"/출석","user":{"id":"demo-user"}}}'

```



## Render 배포



1. 이 폴더를 GitHub 저장소에 올립니다. `.env`와 실제 API 키는 올리지 않습니다.
2. 
2. Render에서 **New > Blueprint**를 선택하고 저장소를 연결하면 `render.yaml`이 서비스를 생성합니다.
3. 
3. Render 환경변수에서 `OPENAI_API_KEY`, `OPENAI_MODEL`, `AUTH_URL`을 입력합니다.
4. 
4. 배포 후 `https://서비스명.onrender.com/health`가 `{"ok":true}`인지 확인합니다.
5. 
5. Kakao i Open Builder의 스킬 URL에 다음을 입력합니다.
6. 


```text

https://서비스명.onrender.com/kakao/skill

```



## 주의



- `TeamnTo`는 기본 관리자 ID로 설정되어 있습니다. 실제 카카오 사용자 식별자가 다르면 `ADMIN_IDS`에 쉼표로 추가하세요.
- 
- `/인증`은 `AUTH_URL`을 그대로 안내할 뿐, 비밀번호·OTP·쿠키·세션 토큰을 수집하지 않습니다. 반드시 관리자가 검증한 공식 링크만 넣으세요.
- 
- 카카오 공식 챗봇은 일반 카카오톡 계정처럼 모든 참여자를 강제 퇴장시키거나 임의 초대할 수 없습니다. 따라서 기획의 `/allkick`은 의도적으로 구현하지 않았습니다.
- 
- Render 무료 플랜은 영구 디스크 및 운영 정책이 변경될 수 있으므로, 실제 운영 전 Render 플랜과 데이터 보존 조건을 확인하세요.
- 
















