import { setTimeout as delay } from 'node:timers/promises';
import { askJson, localModel, required } from './deployment-lib.mjs';

const skillId = required('ALEXA_SKILL_ID');
const stage = process.env.ALEXA_SKILL_STAGE || 'development';
const locale = 'en-US';
if (stage !== 'development') throw new Error('Automated model writes are restricted to ALEXA_SKILL_STAGE=development. Promote/certify explicitly.');

askJson([
  'set-interaction-model', '--skill-id', skillId, '--stage', stage, '--locale', locale,
  '--interaction-model', `file:${new URL('../interaction-model/en-US.json', import.meta.url).pathname}`
]);

let lastMetadata;
for (let attempt = 0; attempt < 30; attempt += 1) {
  lastMetadata = askJson(['get-interaction-model-metadata', '--skill-id', skillId, '--stage', stage, '--locale', locale]);
  const status = JSON.stringify(lastMetadata);
  if (/FAILED|ERROR/i.test(status)) throw new Error(`Alexa model build failed: ${status}`);
  if (/SUCCEEDED|SUCCESSFUL/i.test(status)) {
    console.log(`Alexa ${stage} model built successfully with invocation "${localModel().interactionModel.languageModel.invocationName}".`);
    process.exit(0);
  }
  await delay(2000);
}
throw new Error(`Alexa model build did not finish within 60 seconds: ${JSON.stringify(lastMetadata)}`);
