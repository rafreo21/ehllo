import { readFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';

const environment = process.argv[2];
if (!['staging', 'production'].includes(environment)) {
  console.error('Usage: node scripts/run-web-dev.mjs <staging|production>');
  process.exit(1);
}

if (environment === 'production' && process.env.EHLLO_ALLOW_PRODUCTION !== '1' && process.env.AFTERMEET_ALLOW_PRODUCTION !== '1') {
  console.error('Production access is locked. Set EHLLO_ALLOW_PRODUCTION=1 for this command only.');
  process.exit(1);
}

const filename = `.env.${environment}.local`;
const filepath = resolve(process.cwd(), filename);
let source;
try {
  source = readFileSync(filepath, 'utf8');
} catch {
  console.error(`Missing ${filename}. Copy .env.${environment}.example and add the ${environment} values.`);
  process.exit(1);
}

function parseEnv(text) {
  const values = {};
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const separator = line.indexOf('=');
    if (separator < 1) continue;
    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    values[key] = value;
  }
  return values;
}

const selected = parseEnv(source);
for (const required of ['NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY']) {
  if (!selected[required] || selected[required].startsWith('YOUR_') || selected[required].includes('YOUR_')) {
    console.error(`${filename} is missing a real ${required}.`);
    process.exit(1);
  }
}

const childEnv = { ...process.env };
for (const key of [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
  'SUPABASE_URL',
  'SUPABASE_ANON_KEY',
  'SUPABASE_PUBLISHABLE_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'SUPABASE_SECRET_KEY',
]) {
  delete childEnv[key];
}
Object.assign(childEnv, selected, {
  EHLLO_ENVIRONMENT: environment,
  // Legacy alias retained until all deployed jobs use EHLLO_ENVIRONMENT.
  AFTERMEET_ENVIRONMENT: environment,
  WRANGLER_LOG_PATH: '.wrangler/wrangler.log',
});

console.log(`Starting ehllo consumer web against ${environment}.`);
const executable = resolve(process.cwd(), 'node_modules/.bin/vinext');
const child = spawn(executable, ['dev'], { env: childEnv, stdio: 'inherit' });
child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 1);
});
