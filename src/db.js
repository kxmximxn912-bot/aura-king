import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';

const dbPath = process.env.DB_PATH || './data/aura.sqlite';
fs.mkdirSync(path.dirname(dbPath), { recursive: true });
export const db = new Database(dbPath);
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    nickname TEXT,
    joined_at TEXT NOT NULL,
    last_seen_at TEXT NOT NULL,
    points INTEGER NOT NULL DEFAULT 0,
    attendance_count INTEGER NOT NULL DEFAULT 0,
    title TEXT NOT NULL DEFAULT '새벽의 방문자'
  );
  CREATE TABLE IF NOT EXISTS attendance (
    user_id TEXT NOT NULL,
    day TEXT NOT NULL,
    created_at TEXT NOT NULL,
    PRIMARY KEY (user_id, day)
  );
  CREATE TABLE IF NOT EXISTS notices (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    body TEXT NOT NULL,
    created_at TEXT NOT NULL,
    active INTEGER NOT NULL DEFAULT 1
  );
  CREATE TABLE IF NOT EXISTS admins (user_id TEXT PRIMARY KEY, created_at TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS banned_words (word TEXT PRIMARY KEY, created_at TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS inquiries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    kind TEXT NOT NULL,
    body TEXT NOT NULL,
    answer TEXT,
    status TEXT NOT NULL DEFAULT 'open',
    created_at TEXT NOT NULL,
    answered_at TEXT
  );
  CREATE TABLE IF NOT EXISTS logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    command TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
`);

const now = () => new Date().toISOString();

export function ensureUser(id) {
  const existing = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  if (existing) {
    db.prepare('UPDATE users SET last_seen_at = ? WHERE id = ?').run(now(), id);
    return existing;
  }
  db.prepare('INSERT INTO users (id, joined_at, last_seen_at) VALUES (?, ?, ?)').run(id, now(), now());
  return db.prepare('SELECT * FROM users WHERE id = ?').get(id);
}

export function logCommand(userId, command) {
  db.prepare('INSERT INTO logs (user_id, command, created_at) VALUES (?, ?, ?)').run(userId, command, now());
}

export function isAdmin(id) {
  const envAdmins = (process.env.ADMIN_IDS || 'TeamnTo').split(',').map(x => x.trim()).filter(Boolean);
  return envAdmins.includes(id) || Boolean(db.prepare('SELECT 1 FROM admins WHERE user_id = ?').get(id));
}

export function getUser(id) { return db.prepare('SELECT * FROM users WHERE id = ?').get(id); }
export function setNickname(id, nickname) { db.prepare('UPDATE users SET nickname = ? WHERE id = ?').run(nickname.slice(0, 30), id); }

export function attend(id) {
  const day = new Date().toISOString().slice(0, 10);
  const already = db.prepare('SELECT 1 FROM attendance WHERE user_id = ? AND day = ?').get(id, day);
  if (already) return { already: true, user: getUser(id) };
  const reward = 10;
  const tx = db.transaction(() => {
    db.prepare('INSERT INTO attendance (user_id, day, created_at) VALUES (?, ?, ?)').run(id, day, now());
    db.prepare('UPDATE users SET points = points + ?, attendance_count = attendance_count + 1 WHERE id = ?').run(reward, id);
  });
  tx();
  return { already: false, user: getUser(id), reward };
}

export function rankings(limit = 10) {
  return db.prepare('SELECT id, nickname, points, attendance_count FROM users ORDER BY points DESC, attendance_count DESC LIMIT ?').all(limit);
}

export function latestNotice() { return db.prepare('SELECT body, created_at FROM notices WHERE active = 1 ORDER BY id DESC LIMIT 1').get(); }
export function setNotice(body) {
  db.prepare('UPDATE notices SET active = 0 WHERE active = 1').run();
  db.prepare('INSERT INTO notices (body, created_at) VALUES (?, ?)').run(body.slice(0, 1000), now());
}
export function deleteNotice() { db.prepare('UPDATE notices SET active = 0 WHERE active = 1').run(); }

export function listBannedWords() { return db.prepare('SELECT word FROM banned_words ORDER BY word').all().map(x => x.word); }
export function addBannedWord(word) { db.prepare('INSERT OR IGNORE INTO banned_words (word, created_at) VALUES (?, ?)').run(word, now()); }
export function deleteBannedWord(word) { db.prepare('DELETE FROM banned_words WHERE word = ?').run(word); }
export function hasBannedWord(text) { return listBannedWords().some(word => text.includes(word)); }

export function addInquiry(userId, kind, body) {
  const result = db.prepare('INSERT INTO inquiries (user_id, kind, body, created_at) VALUES (?, ?, ?, ?)').run(userId, kind, body.slice(0, 1000), now());
  return result.lastInsertRowid;
}
export function listInquiries() { return db.prepare('SELECT id, user_id, kind, body, status, answer, created_at FROM inquiries ORDER BY id DESC LIMIT 20').all(); }
export function answerInquiry(id, answer) {
  return db.prepare('UPDATE inquiries SET answer = ?, status = \'answered\', answered_at = ? WHERE id = ?').run(answer.slice(0, 1000), now(), id).changes > 0;
}
export function addAdmin(id) { db.prepare('INSERT OR IGNORE INTO admins (user_id, created_at) VALUES (?, ?)').run(id, now()); }
export function removeAdmin(id) { db.prepare('DELETE FROM admins WHERE user_id = ?').run(id); }
export function listAdmins() { return db.prepare('SELECT user_id, created_at FROM admins ORDER BY created_at').all(); }
export function stats() { return { users: db.prepare('SELECT COUNT(*) AS n FROM users').get().n, commands: db.prepare('SELECT COUNT(*) AS n FROM logs').get().n, inquiries: db.prepare('SELECT COUNT(*) AS n FROM inquiries').get().n }; }
