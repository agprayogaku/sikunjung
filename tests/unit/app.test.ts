import request from 'supertest';
import { createApp } from '../../src/app';

describe('App Bootstrap & Healthcheck', () => {
  const app = createApp();

  it('GET /health mengembalikan status 200 OK dan identitas SIKUNJUNG', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.service).toBe('SIKUNJUNG');
  });

  it('GET / mengembalikan halaman pembuka dengan stylesheet global.css dan toggle dark mode', async () => {
    const res = await request(app).get('/');
    expect(res.status).toBe(200);
    expect(res.text).toContain('SIKUNJUNG');
    expect(res.text).toContain('/css/global.css');
    expect(res.text).toContain('theme-toggle-btn');
    expect(res.text).not.toContain('/admin/login');
    expect(res.text).not.toContain('Portal Petugas');
    expect(res.text).not.toContain('Login Petugas Lapas');
  });

  it('mengirim CSP dengan nonce yang sama untuk script inline', async () => {
    const res = await request(app).get('/');
    expect(res.status).toBe(200);

    const csp = String(res.header['content-security-policy'] ?? '');
    const nonceMatch = csp.match(/'nonce-([^']+)'/);
    expect(nonceMatch).not.toBeNull();
    expect(res.text).toContain(`nonce="${nonceMatch![1]}"`);
    expect(csp).toContain("script-src-attr 'none'");
  });
});
