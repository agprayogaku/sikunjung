const fs = require('fs');
const os = require('os');
const path = require('path');

const root = path.join(os.tmpdir(), `sikunjung-jest-${process.pid}`);
const marker = path.join(os.tmpdir(), 'sikunjung-jest-root.txt');

process.env.NODE_ENV = 'test';
process.env.STORAGE_ROOT = root;
process.env.TZ = 'Asia/Jakarta';
process.env.SESSION_SECRET = 'test-session-secret-0123456789abcdef0123456789abcdef';
process.env.CSRF_SECRET = 'test-csrf-secret-0123456789abcdef0123456789abcdef';
process.env.ADMIN_MASTER_USERNAME = 'master';
process.env.ADMIN_MASTER_INITIAL_PASSWORD = 'TestMasterPassword123!';
process.env.BASE_URL = 'http://localhost:3000';

fs.mkdirSync(root, { recursive: true });
fs.writeFileSync(marker, root, 'utf8');
