import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { expo } = require('../app.config.js');
const eas = require('../eas.json');

assert.equal(process.env.APP_VARIANT ?? 'staging', 'staging', 'Parity checks must run against staging.');
assert.equal(expo.ios.bundleIdentifier, expo.android.package, 'iOS and Android staging identities must match.');
assert.equal(eas.build.staging.channel, eas.build['staging-simulator'].channel, 'Staging channels must match.');
assert.equal(eas.build.staging.channel, 'staging', 'Both builds must target the staging channel.');
assert.equal(expo.runtimeVersion?.policy, 'appVersion', 'Staging must derive one shared runtime from app version.');
assert.ok(expo.version, 'A shared app version is required.');

console.log(`Platform parity configuration OK: ${expo.version} · ${eas.build.staging.channel} · ${expo.ios.bundleIdentifier}`);
