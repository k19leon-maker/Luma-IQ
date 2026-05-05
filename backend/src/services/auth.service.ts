import bcrypt from 'bcryptjs';
import jwt, { SignOptions } from 'jsonwebtoken';
import { prisma } from '../lib/prisma';
import { env } from '../config/env';

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

export interface AuthUser {
  id: string;
  email: string;
  name: string | null;
  avatarUrl: string | null;
  role: string;
}

function signAccess(userId: string): string {
  const options: SignOptions = { expiresIn: env.JWT_EXPIRES_IN as SignOptions['expiresIn'] };
  return jwt.sign({ sub: userId }, env.JWT_SECRET, options);
}

function signRefresh(userId: string): string {
  const options: SignOptions = { expiresIn: env.JWT_REFRESH_EXPIRES_IN as SignOptions['expiresIn'] };
  return jwt.sign({ sub: userId }, env.JWT_REFRESH_SECRET, options);
}

function toAuthUser(user: { id: string; email: string; name: string | null; avatarUrl: string | null; role: string }): AuthUser {
  return { id: user.id, email: user.email, name: user.name, avatarUrl: user.avatarUrl, role: user.role };
}

export const authService = {
  async register(email: string, password: string, name?: string): Promise<{ user: AuthUser; tokens: TokenPair }> {
    const normalizedEmail = email.trim().toLowerCase();
    const existing = await prisma.user.findUnique({ where: { email: normalizedEmail } });
    if (existing) {
      throw Object.assign(new Error('Пользователь с таким email уже существует'), { status: 409 });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const user = await prisma.user.create({
      data: { email: normalizedEmail, passwordHash, name: name ?? null },
    });

    const tokens = await authService.issueTokens(user.id);
    return { user: toAuthUser(user), tokens };
  },

  async login(email: string, password: string): Promise<{ user: AuthUser; tokens: TokenPair }> {
    const user = await prisma.user.findUnique({ where: { email: email.trim().toLowerCase() } });
    if (!user || !user.passwordHash) {
      throw Object.assign(new Error('Неверный email или пароль'), { status: 401 });
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      throw Object.assign(new Error('Неверный email или пароль'), { status: 401 });
    }

    const tokens = await authService.issueTokens(user.id);
    return { user: toAuthUser(user), tokens };
  },

  async refresh(token: string): Promise<{ user: AuthUser; tokens: TokenPair }> {
    let payload: { sub: string };
    try {
      payload = jwt.verify(token, env.JWT_REFRESH_SECRET) as { sub: string };
    } catch {
      throw Object.assign(new Error('Невалидный refresh token'), { status: 401 });
    }

    const stored = await prisma.refreshToken.findUnique({ where: { token } });
    if (!stored || stored.expiresAt < new Date()) {
      throw Object.assign(new Error('Refresh token не найден или истёк'), { status: 401 });
    }

    // Rotate: delete old token
    await prisma.refreshToken.delete({ where: { token } });

    const user = await prisma.user.findUniqueOrThrow({ where: { id: payload.sub } });
    const tokens = await authService.issueTokens(user.id);
    return { user: toAuthUser(user), tokens };
  },

  async logout(refreshToken: string): Promise<void> {
    await prisma.refreshToken.deleteMany({ where: { token: refreshToken } });
  },

  async findOrCreateGoogleUser(profile: {
    id: string;
    email: string;
    name?: string;
    avatarUrl?: string;
  }): Promise<{ user: AuthUser; tokens: TokenPair }> {
    let user = await prisma.user.findFirst({
      where: { OR: [{ googleId: profile.id }, { email: profile.email }] },
    });

    if (user) {
      if (!user.googleId) {
        user = await prisma.user.update({
          where: { id: user.id },
          data: { googleId: profile.id, isVerified: true },
        });
      }
    } else {
      user = await prisma.user.create({
        data: {
          email: profile.email,
          googleId: profile.id,
          name: profile.name ?? null,
          avatarUrl: profile.avatarUrl ?? null,
          isVerified: true,
        },
      });
    }

    const tokens = await authService.issueTokens(user.id);
    return { user: toAuthUser(user), tokens };
  },

  async issueTokens(userId: string): Promise<TokenPair> {
    const accessToken = signAccess(userId);
    const refreshToken = signRefresh(userId);

    // Parse JWT_REFRESH_EXPIRES_IN (e.g. "30d", "7d") to derive DB expiry
    const raw = env.JWT_REFRESH_EXPIRES_IN;
    const days = raw.endsWith('d') ? parseInt(raw, 10) : 30;
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + days);

    await prisma.refreshToken.create({
      data: { token: refreshToken, userId, expiresAt },
    });

    return { accessToken, refreshToken };
  },

  async getUserById(id: string): Promise<AuthUser | null> {
    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) return null;
    return toAuthUser(user);
  },
};
