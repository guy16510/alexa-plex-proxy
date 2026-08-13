import {
  askJson, findEndpointUris, interfaceTypes, localModel, modelHash, required, runJson
} from './deployment-lib.mjs';
import { execFileSync } from 'node:child_process';

const skillId = required('ALEXA_SKILL_ID');
const region = process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || required('AWS_REGION');
const stackName = process.env.STACK_NAME || 'alexa-plex-music';
const stage = process.env.ALEXA_SKILL_STAGE || 'development';
const locale = 'en-US';
const awsEnv = { ...process.env, AWS_REGION: region, AWS_DEFAULT_REGION: region };
const expectedCommitSha = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();

const stack = runJson('aws', ['cloudformation', 'describe-stacks', '--stack-name', stackName, '--region', region, '--output', 'json'], { env: awsEnv });
if (stack.Stacks?.[0]?.StackStatus !== 'UPDATE_COMPLETE' && stack.Stacks?.[0]?.StackStatus !== 'CREATE_COMPLETE') {
  throw new Error(`Stack ${stackName} is not healthy: ${stack.Stacks?.[0]?.StackStatus ?? 'missing'}`);
}
const outputs = Object.fromEntries((stack.Stacks[0].Outputs ?? []).map((item) => [item.OutputKey, item.OutputValue]));
const lambdaArn = outputs.SkillFunctionArn;
if (!lambdaArn) throw new Error('Stack output SkillFunctionArn is missing.');

const fn = runJson('aws', ['lambda', 'get-function-configuration', '--function-name', lambdaArn, '--region', region, '--output', 'json'], { env: awsEnv });
if (fn.Environment?.Variables?.ALEXA_SKILL_ID !== skillId) throw new Error('Lambda ALEXA_SKILL_ID does not match .env.local.');
if (fn.Environment?.Variables?.DEPLOYMENT_COMMIT_SHA !== expectedCommitSha) {
  throw new Error(`Lambda code drift detected: expected Git ${expectedCommitSha}, deployed marker is ${fn.Environment?.Variables?.DEPLOYMENT_COMMIT_SHA ?? 'missing'}.`);
}
if (fn.Runtime !== 'nodejs22.x' || fn.MemorySize !== 512 || fn.Timeout !== 30) throw new Error('Lambda runtime, memory, or timeout drift detected.');

const policy = runJson('aws', ['lambda', 'get-policy', '--function-name', lambdaArn, '--region', region, '--output', 'json'], { env: awsEnv });
const statements = JSON.parse(policy.Policy).Statement ?? [];
const alexaPermission = statements.some((item) => item.Principal?.Service === 'alexa-appkit.amazon.com'
  && String(
    item.Condition?.StringEquals?.['lambda:EventSourceToken']
    ?? item.Condition?.ArnLike?.['AWS:SourceArn']
    ?? item.Condition?.StringEquals?.['AWS:SourceArn']
    ?? ''
  ).includes(skillId));
if (!alexaPermission) throw new Error('AlexaSkill Lambda permission is missing or points at a different Skill ID.');

const deployedModelResponse = askJson(['get-interaction-model', '--skill-id', skillId, '--stage', stage, '--locale', locale]);
const deployedModel = deployedModelResponse.interactionModel ? deployedModelResponse : deployedModelResponse.body ?? deployedModelResponse;
const local = localModel();
if (modelHash(local) !== modelHash(deployedModel)) throw new Error(`Alexa ${stage} model drift detected: repository and deployed hashes differ.`);
if (deployedModel.interactionModel?.languageModel?.invocationName !== 'burns jukebox') throw new Error(`Alexa ${stage} invocation name is not exactly "burns jukebox".`);

const manifest = askJson(['get-skill-manifest', '--skill-id', skillId, '--stage', stage]);
const endpoints = findEndpointUris(manifest);
if (!endpoints.includes(lambdaArn)) throw new Error(`Alexa ${stage} endpoint does not match ${lambdaArn}.`);
const interfaces = interfaceTypes(manifest);
for (const expected of ['AUDIO_PLAYER', 'ALEXA_PRESENTATION_APL']) {
  if (!interfaces.includes(expected)) throw new Error(`Alexa ${stage} manifest is missing ${expected}.`);
}

const metadata = askJson(['get-interaction-model-metadata', '--skill-id', skillId, '--stage', stage, '--locale', locale]);
const metadataText = JSON.stringify(metadata);
if (/FAILED|ERROR/i.test(metadataText) || !/SUCCEEDED|SUCCESSFUL/i.test(metadataText)) {
  throw new Error(`Alexa ${stage} interaction model is not successfully built: ${metadataText}`);
}

console.log(JSON.stringify({
  verified: true,
  stackName,
  stackStatus: stack.Stacks[0].StackStatus,
  lambdaArn,
  lambdaLastModified: fn.LastModified,
  deployedCommitSha: expectedCommitSha,
  skillId,
  stage,
  locale,
  invocationName: 'burns jukebox',
  modelHash: modelHash(local),
  interfaces
}, null, 2));
