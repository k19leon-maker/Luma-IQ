import type { Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import {
  clearB2CSession,
  ensureB2CSession,
  replaceB2CMessages,
} from '../services/b2c-session.service';

const messageSchema = z.object({
  role: z.enum(['psychologist', 'client']),
  text: z.string().min(1).max(7000),
});

const stateSchema = z.object({
  email: z.string().email().nullable().optional(),
  phone: z.string().max(80).nullable().optional(),
  profile: z.record(z.unknown()).nullable().optional(),
  diagnosticAnswers: z.record(z.unknown()).nullable().optional(),
  clientData: z.record(z.unknown()).nullable().optional(),
  messages: z.array(messageSchema).max(50).optional(),
});

function jsonUpdate(value: Record<string, unknown> | null | undefined) {
  if (value === undefined) return undefined;
  if (value === null) return Prisma.JsonNull;
  return value as Prisma.InputJsonValue;
}

export const b2cSessionController = {
  async getState(req: Request, res: Response): Promise<void> {
    const session = await ensureB2CSession(req, res);
    const messages = await prisma.b2CChatMessage.findMany({
      where: { sessionId: session.id },
      orderBy: { createdAt: 'asc' },
      select: { id: true, role: true, text: true, createdAt: true },
    });
    res.json({
      email: session.email,
      phone: session.phone,
      profile: session.profile,
      diagnosticAnswers: session.diagnosticAnswers,
      clientData: session.clientData,
      messages,
      updatedAt: session.updatedAt,
    });
  },

  async saveState(req: Request, res: Response): Promise<void> {
    const parsed = stateSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.errors[0].message });
      return;
    }
    const session = await ensureB2CSession(req, res);
    const { messages, ...state } = parsed.data;
    await prisma.b2CSession.update({
      where: { id: session.id },
      data: {
        email: state.email,
        phone: state.phone,
        profile: jsonUpdate(state.profile),
        diagnosticAnswers: jsonUpdate(state.diagnosticAnswers),
        clientData: jsonUpdate(state.clientData),
      },
    });
    if (messages) await replaceB2CMessages(session.id, messages);
    res.json({ ok: true });
  },

  async deleteState(req: Request, res: Response): Promise<void> {
    await clearB2CSession(req, res);
    res.status(204).send();
  },
};
