import crypto from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';

const SECRET = process.env.SESSION_SECRET || 'dev-only-change-me';
const COOKIE = 'jj_session';
const MAX_AGE_MS = 1000 * 60 * 60 * 12;

export function hashPassword(pw: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(pw, salt, 32).toString('hex');
  return `${salt}:${hash}`;
}
export function verifyPassword(pw: string, stored: string): boolean {
  const [salt, hash] = stored.split(':');
  if (!salt || !hash) return false;
  const test = crypto.scryptSync(pw, salt, 32);
  return crypto.timingSafeEqual(test, Buffer.from(hash, 'hex'));
}

function sign(payload: string) {
  return crypto.createHmac('sha256', SECRET).update(payload).digest('base64url');
}
export function issueSession(res: Response, userId: number) {
  const payload = Buffer.from(JSON.stringify({ uid: userId, exp: Date.now() + MAX_AGE_MS })).toString('base64url');
  res.cookie(COOKIE, `${payload}.${sign(payload)}`, { httpOnly: true, sameSite: 'lax', maxAge: MAX_AGE_MS });
}
export function clearSession(res: Response) {
  res.clearCookie(COOKIE);
}
function readCookie(req: Request): string | undefined {
  const raw = req.headers.cookie || '';
  for (const part of raw.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === COOKIE) return decodeURIComponent(v.join('='));
  }
}
export function sessionUserId(req: Request): number | undefined {
  const c = readCookie(req);
  if (!c) return;
  const [payload, sig] = c.split('.');
  if (!payload || !sig || sign(payload) !== sig) return;
  try {
    const { uid, exp } = JSON.parse(Buffer.from(payload, 'base64url').toString());
    if (exp < Date.now()) return;
    return uid;
  } catch {
    return;
  }
}

export interface SessionUser {
  id: number;
  name: string;
  username: string;
  is_admin: number;
  role_id: number | null;
  menus: string[];
  verify: string[];
}
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user: SessionUser;
    }
  }
}

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export function requireAuth(loadUser: (id: number) => SessionUser | undefined) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const uid = sessionUserId(req);
    const user = uid ? loadUser(uid) : undefined;
    if (!user) return next(new HttpError(401, 'Not signed in'));
    req.user = user;
    next();
  };
}

export function canMenu(user: SessionUser, key: string) {
  return !!user.is_admin || user.menus.includes(key);
}
export function canVerify(user: SessionUser, key: string) {
  return !!user.is_admin || user.verify.includes(key);
}
export function needMenu(...keys: string[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (keys.some((k) => canMenu(req.user, k))) return next();
    next(new HttpError(403, 'No permission for this menu'));
  };
}
