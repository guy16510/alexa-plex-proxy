import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { config as loadDotenv } from 'dotenv';

loadDotenv({ path: '.env.local', quiet: true });
loadDotenv({ path: '.env', quiet: true, override: false });

export function required(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing ${name}. Add it to .env.local (never commit that file).`);
  return value;
}

export function runJson(command, args, { env = process.env } = {}) {
  let output;
  try {
    output = execFileSync(command, args, { encoding: 'utf8', env, stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (error) {
    const detail = String(error.stderr || error.message).replace(/\s+/g, ' ').trim();
    throw new Error(`${command} ${args[0] ?? ''} failed: ${detail}`);
  }
  try { return JSON.parse(output); }
  catch { throw new Error(`${command} returned non-JSON output.`); }
}

export function askJson(args) {
  const profileArgs = process.env.ASK_PROFILE ? ['--profile', process.env.ASK_PROFILE] : [];
  return runJson('npx', ['--yes', 'ask-cli@2.30.7', 'smapi', ...args, ...profileArgs]);
}

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

export function modelHash(model) {
  return createHash('sha256').update(canonical(model)).digest('hex');
}

export function localModel() {
  return JSON.parse(readFileSync('interaction-model/en-US.json', 'utf8'));
}

export function findEndpointUris(manifest) {
  const custom = manifest?.manifest?.apis?.custom ?? manifest?.apis?.custom ?? {};
  return [custom.endpoint?.uri, ...Object.values(custom.regions ?? {}).map((region) => region?.endpoint?.uri)]
    .filter(Boolean);
}

export function interfaceTypes(manifest) {
  const custom = manifest?.manifest?.apis?.custom ?? manifest?.apis?.custom ?? {};
  return (custom.interfaces ?? []).map((item) => item.type).filter(Boolean).sort();
}
