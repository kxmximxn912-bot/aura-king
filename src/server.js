import 'dotenv/config';
import express from 'express';
import OpenAI from 'openai';
import {
  ensureUser, logCommand, isAdmin, getUser, setNickname, attend, rankings,
  latestNotice, setNotice, deleteNotice, listBannedWords, addBannedWord,
  deleteBannedWord, hasBannedWord, addInquiry, listInquiries, answerInquiry,
  addAdmin, removeAdmin, listAdmins, stats
} from './db.js';

const app = express();
app.use(express.json({ limit: '256kb' }));
const PORT = Number(process.env.PORT || 3000);
const VERSION = process.env.BOT_VERSION || '1.0.0';
const AUTH_URL = process.env.AUTH_URL || 'https://example.com/verify';
const openai = process.env.OPENAI_API_KEY ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) : null;

const kakao = text => ({ version: '2.0', template: { outputs: [{ simpleText: { text } }] } });
const HELP = `『아우라의 왕』 명령어 안내\n\n기본: /help /ai 질문 /내아이디 /내정보 /출석 /랭킹 /공지 /핑 /버전\n인증: /인증 /복구 /인증상태 /인증도움말\n활동: /프로필 /닉네임 이름 /가입일 /활동량 /내랭킹 /내포인트 /내출석\n게임: /주사위 /동전 /가위바위보 선택 /랜덤 항목1,항목2\n유틸: /시간 /날짜 /계산 식 /랜덤이름 /랜덤닉네임\nAI: /번역 문장 /요약 내용 /맞춤법 문장 /영작 문장 /단어 단어 /아이디어 주제\n문의: /신고 내용 /문의 내용\n관리자: /공지설정 내용 /공지삭제 /금칙어추가 단어 /금칙어삭제 단어 /금칙어목록 /관리자목록 /관리자추가 ID /관리자삭제 ID /통계 /로그`;

function inputFrom(body) {
  const userRequest = body?.userRequest || {};
  const utterance = String(userRequest.utterance || body?.utterance || '').trim();
  const id = String(userRequest.user?.id || body?.user?.id || userRequest.user?.properties?.plusfriendUserKey || 'anonymous');
  return { utterance, id };
}
function arg(text) { return text.replace(/^\/\S+\s*/, '').trim(); }
function adminOnly(id) { return isAdmin(id) ? null : '관리자 전용 명령어입니다.'; }
function formatUser(u) { return `닉네임: ${u.nickname || '미설정'}\n포인트: ${u.points}P\n출석: ${u.attendance_count}회\n칭호: ${u.title}`; }

async function aiAnswer(command, content) {
  if (!content) return '질문이나 내용을 함께 입력해 주세요. 예: /ai 오늘 할 일을 정리해줘';
  if (!openai) return 'AI 기능이 아직 설정되지 않았습니다. Render 환경변수 OPENAI_API_KEY와 OPENAI_MODEL을 등록해 주세요.';
  const prompts = {
    '/번역': '다음 문장을 자연스러운 영어로 번역해줘. 번역문만 답해줘:',
    '/영작': '다음 내용을 자연스러운 영어 문장으로 작성해줘:',
    '/요약': '다음 내용을 핵심만 한국어로 요약해줘:',
    '/맞춤법': '다음 문장의 맞춤법과 띄어쓰기를 고쳐줘. 설명 없이 교정문만 답해줘:',
    '/아이디어': '다음 주제에 대한 실용적인 아이디어를 5개 제안해줘:',
    '/단어': '다음 단어의 뜻, 발음, 예문을 한국어로 안내해줘:'
  };
  const system = prompts[command] || '사용자의 질문에 정확하고 안전하게 한국어로 답해줘.';
  try {
    const response = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
      messages: [{ role: 'system', content: system }, { role: 'user', content }],
      max_tokens: 700
    });
    return response.choices?.[0]?.message?.content?.trim() || 'AI 응답을 받지 못했습니다.';
  } catch (error) {
    console.error('OpenAI error:', error.message);
    return 'AI 요청 처리 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.';
  }
}

async function handle(utterance, id) {
  const command = (utterance.match(/^\/\S+/)?.[0] || '').toLowerCase();
  if (!command) return '명령어는 /help에서 확인할 수 있습니다.';
  logCommand(id, command);
  if (hasBannedWord(utterance) && !isAdmin(id)) return '보안 필터에 의해 처리할 수 없는 단어가 포함되어 있습니다.';

  if (command === '/help') return HELP;
  if (command === '/핑') return '퐁! 서버 정상 응답 · ' + new Date().toISOString();
  if (command === '/버전') return `『아우라의 왕』 v${VERSION}\nKakao Skill API 정상 작동 중`;
  if (command === '/내아이디') return `현재 식별자: ${id}\n※ 카카오가 제공하는 식별자만 표시하며 비밀번호·토큰은 수집하지 않습니다.`;
  if (command === '/내정보' || command === '/프로필') return formatUser(getUser(id));
  if (command === '/출석') { const r = attend(id); return r.already ? `오늘은 이미 출석했습니다.\n현재 ${r.user.points}P` : `출석 완료! +${r.reward}P\n연속 활동을 이어가 보세요.\n현재 ${r.user.points}P`; }
  if (command === '/랭킹' || command === '/출석랭킹') return rankings().map((u, i) => `${i + 1}위 ${u.nickname || u.id.slice(0, 8)} · ${u.points}P · 출석 ${u.attendance_count}회`).join('\n') || '아직 랭킹 데이터가 없습니다.';
  if (command === '/공지') { const n = latestNotice(); return n ? `📢 공지\n${n.body}` : '등록된 공지가 없습니다.'; }
  if (command === '/닉네임') { const name = arg(utterance); if (!name) return '사용법: /닉네임 새이름'; setNickname(id, name); return `닉네임을 '${name.slice(0, 30)}'으로 변경했습니다.`; }
  if (command === '/가입일') return `가입일: ${getUser(id).joined_at}`;
  if (command === '/활동량') { const u = getUser(id); return `활동량\n명령어 사용 기록은 서버에 최소한으로 저장됩니다.\n출석 ${u.attendance_count}회 · 보유 ${u.points}P`; }
  if (command === '/내랭킹') { const list = rankings(100); const rank = list.findIndex(x => x.id === id); return rank < 0 ? '아직 랭킹에 등록되지 않았습니다.' : `현재 ${rank + 1}위\n${formatUser(getUser(id))}`; }
  if (command === '/내포인트' || command === '/잔액') return `현재 잔액: ${getUser(id).points}P`;
  if (command === '/인증' || command === '/복구' || command === '/인증상태' || command === '/인증도움말') return `인증 안내\n1. 공식 인증 링크를 엽니다.\n2. 필요한 최소 정보만 입력합니다.\n3. 완료 후 /복구를 입력합니다.\n\n링크: ${AUTH_URL}\n비밀번호·OTP·쿠키·세션 토큰은 절대 요구하지 않습니다.`;
  if (command === '/주사위') return `주사위 결과: ${Math.floor(Math.random() * 6) + 1}`;
  if (command === '/동전') return `동전 결과: ${Math.random() < 0.5 ? '앞면' : '뒷면'}`;
  if (command === '/가위바위보') { const choices = ['가위', '바위', '보']; const mine = arg(utterance); if (!choices.includes(mine)) return '사용법: /가위바위보 가위|바위|보'; const bot = choices[Math.floor(Math.random() * 3)]; const result = mine === bot ? '무승부' : ((mine === '가위' && bot === '보') || (mine === '바위' && bot === '가위') || (mine === '보' && bot === '바위') ? '승리' : '패배'); return `나: ${mine}\n아우라: ${bot}\n결과: ${result}`; }
  if (command === '/랜덤') { const items = arg(utterance).split(/[,，]/).map(x => x.trim()).filter(Boolean); return items.length ? `랜덤 선택: ${items[Math.floor(Math.random() * items.length)]}` : '사용법: /랜덤 항목1, 항목2, 항목3'; }
  if (command === '/시간') return `현재 시간: ${new Date().toLocaleTimeString('ko-KR', { timeZone: 'Asia/Seoul' })}`;
  if (command === '/날짜') return `현재 날짜: ${new Date().toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul' })}`;
  if (command === '/계산') { const expression = arg(utterance); if (!/^[0-9+\-*/().%\s]+$/.test(expression)) return '숫자와 사칙연산만 계산할 수 있습니다.'; try { return `계산 결과: ${Function(`"use strict"; return (${expression})`)()}`; } catch { return '계산식을 확인해 주세요.'; } }
  if (command === '/랜덤이름' || command === '/랜덤닉네임') { const a = ['푸른', '빛나는', '고요한', '용감한', '신비한']; const b = ['별', '여우', '기사', '파도', '왕관']; return `추천 이름: ${a[Math.floor(Math.random() * a.length)]}${b[Math.floor(Math.random() * b.length)]}`; }
  if (['/ai', '/번역', '/요약', '/맞춤법', '/영작', '/단어', '/아이디어'].includes(command)) return await aiAnswer(command, arg(utterance));
  if (command === '/신고' || command === '/문의') { const body = arg(utterance); if (!body) return `사용법: ${command} 내용`; const no = addInquiry(id, command === '/신고' ? 'report' : 'inquiry', body); return `접수되었습니다. 접수번호 #${no}\n관리자가 확인하겠습니다.`; }

  const adminError = adminOnly(id);
  if (['/공지설정', '/공지삭제', '/금칙어추가', '/금칙어삭제', '/금칙어목록', '/관리자목록', '/관리자추가', '/관리자삭제', '/통계', '/로그'].includes(command)) {
    if (adminError) return adminError;
    if (command === '/공지설정') { setNotice(arg(utterance)); return '공지를 등록했습니다.'; }
    if (command === '/공지삭제') { deleteNotice(); return '공지를 삭제했습니다.'; }
    if (command === '/금칙어추가') { addBannedWord(arg(utterance)); return '금칙어를 추가했습니다.'; }
    if (command === '/금칙어삭제') { deleteBannedWord(arg(utterance)); return '금칙어를 삭제했습니다.'; }
    if (command === '/금칙어목록') return listBannedWords().join(', ') || '등록된 금칙어가 없습니다.';
    if (command === '/관리자목록') return listAdmins().map(x => x.user_id).join('\n') || '추가 관리자가 없습니다. 기본 관리자: ' + (process.env.ADMIN_IDS || 'TeamnTo');
    if (command === '/관리자추가') { addAdmin(arg(utterance)); return '관리자를 추가했습니다.'; }
    if (command === '/관리자삭제') { removeAdmin(arg(utterance)); return '관리자 권한을 제거했습니다.'; }
    if (command === '/통계') { const s = stats(); return `사용자 ${s.users}명\n명령어 ${s.commands}회\n문의·신고 ${s.inquiries}건`; }
    if (command === '/로그') return '관리자 로그는 개인정보 최소 수집 원칙에 따라 요약 통계로만 제공합니다.';
  }
  if (command === '/test') return `테스트 메시지: ${arg(utterance) || '(내용 없음)'}`;
  return '알 수 없는 명령어입니다. /help를 입력해 사용 가능한 명령어를 확인해 주세요.';
}

app.get('/', (_req, res) => res.json({ name: '아우라의 왕', status: 'ok', version: VERSION }));
app.get('/health', (_req, res) => res.json({ ok: true, service: 'aura-king-kakao-bot' }));
app.post('/kakao/skill', async (req, res) => {
  try {
    const { utterance, id } = inputFrom(req.body);
    ensureUser(id);
    const text = await handle(utterance, id);
    res.json(kakao(text));
  } catch (error) {
    console.error('Skill error:', error);
    res.status(200).json(kakao('처리 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.'));
  }
});
app.use((_req, res) => res.status(404).json({ error: 'not_found' }));
app.listen(PORT, () => console.log(`Aura King bot listening on ${PORT}`));
