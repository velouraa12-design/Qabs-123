import { spawn } from 'node:child_process';

// Public previews must never point at Staging, Production, or a real payment backend.
// Staging builds must set VITE_QABS_API_BASE_URL explicitly in their own command/job.
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const child = spawn(npm, ['run', 'build'], {
  stdio: 'inherit',
  env: {
    ...process.env,
    VITE_QABS_ENV: 'preview',
    VITE_QABS_API_BASE_URL: ''
  }
});

child.on('error', error => {
  console.error(error);
  process.exitCode = 1;
});
child.on('exit', (code, signal) => {
  if (signal) process.exitCode = 1;
  else process.exitCode = code ?? 1;
});
