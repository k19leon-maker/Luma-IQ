import jwt from 'jsonwebtoken';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../../src/app';
import { env } from '../../src/config/env';

function authHeader(userId = 'user-1') {
  return `Bearer ${jwt.sign({ sub: userId }, env.JWT_SECRET)}`;
}

describe('files integration', () => {
  it('rejects files whose content signature does not match the extension', async () => {
    const res = await request(createApp())
      .post('/api/v1/files/extract-text')
      .set('Authorization', authHeader())
      .attach('file', Buffer.from('not a real pdf', 'utf8'), {
        filename: 'materials.pdf',
        contentType: 'application/pdf',
      })
      .expect(400);

    expect(res.body.error).toContain('PDF');
  });
});
