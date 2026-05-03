import request from 'supertest';
import { app } from './index';

describe('GET /health', () => {
  it('returns 200 with status ok, db status, and uptime', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.db).toMatch(/^(ok|error)$/);
    expect(typeof res.body.uptime).toBe('number');
  });
});
