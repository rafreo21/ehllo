import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const self = 'scripts/check-committed-secrets.mjs';
const files = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' })
  .split('\0')
  .filter(Boolean)
  .filter((file) => file !== self);

const secretPrefix = ['sb', 'secret'].join('_') + '_';
const findings = [];

function report(file, line, category) {
  findings.push({ file, line, category });
}

for (const file of files) {
  let content;
  try {
    content = readFileSync(file, 'utf8');
  } catch {
    continue;
  }
  if (content.includes('\0')) continue;

  content.split(/\r?\n/).forEach((line, index) => {
    if (line.includes(secretPrefix)) report(file, index + 1, 'Supabase secret key');
    if (/SUPABASE_(?:SERVICE_ROLE_KEY|SECRET_KEY)\s*[=:]\s*["']?(?!\s*(?:$|YOUR_|REPLACE_|<))/i.test(line)) {
      report(file, index + 1, 'privileged Supabase assignment');
    }
    for (const token of line.match(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g) ?? []) {
      try {
        const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));
        if (payload?.role === 'service_role') report(file, index + 1, 'Supabase service-role JWT');
      } catch {
        // Not a decodable JWT payload.
      }
    }
  });
}

if (findings.length) {
  console.error('Committed privileged credentials detected:');
  for (const finding of findings) {
    console.error(`- ${finding.file}:${finding.line} (${finding.category})`);
  }
  console.error('Rotate exposed credentials and replace them with environment-managed secrets.');
  process.exit(1);
}

console.log(`Secret check passed across ${files.length} tracked files.`);
