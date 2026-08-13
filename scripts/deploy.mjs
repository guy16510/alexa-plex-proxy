import { config as loadDotenv } from 'dotenv';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { URL } from 'node:url';

loadDotenv({ quiet: true });
const required = ['ALEXA_SKILL_ID', 'PLEX_TOKEN', 'PLEX_URL'];
for (const name of required) if (!process.env[name]?.trim()) throw new Error(`Missing ${name} in .env`);
const region = process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION;
if (!region) throw new Error('Missing AWS_REGION or AWS_DEFAULT_REGION in .env');
const plexUrl = new URL(process.env.PLEX_URL);
if (plexUrl.protocol !== 'https:') throw new Error('PLEX_URL must use HTTPS');
const stackName = process.env.STACK_NAME || 'alexa-plex-music';
const alexaStage = process.env.ALEXA_STAGE || 'development';
const alexaLocale = process.env.ALEXA_LOCALE || 'en-US';
const askProfileArgs = process.env.ASK_PROFILE?.trim()
  ? ['--profile', process.env.ASK_PROFILE.trim()]
  : [];
const interactionModel = JSON.parse(
  readFileSync(new URL('../interaction-model/en-US.json', import.meta.url), 'utf8')
);
const expectedInvocationName = interactionModel?.interactionModel?.languageModel?.invocationName;
if (!expectedInvocationName) throw new Error('Interaction model is missing an invocation name');

const commandEnvironment = {
  ...process.env,
  AWS_REGION: region,
  AWS_DEFAULT_REGION: region
};

const run = (command, args, options = {}) => {
  try {
    return execFileSync(command, args, {
      stdio: 'inherit',
      env: commandEnvironment,
      ...options
    });
  } catch (error) {
    if (error?.code === 'ENOENT') throw new Error(`${command} is required but was not found in PATH.`);
    throw new Error(`${command} failed; see the command output above.`);
  }
};

const runJson = (command, args) => {
  try {
    const output = execFileSync(command, args, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'inherit'],
      env: commandEnvironment
    }).trim();
    return JSON.parse(output);
  } catch (error) {
    if (error?.code === 'ENOENT') throw new Error(`${command} is required but was not found in PATH.`);
    if (error instanceof SyntaxError) throw new Error(`${command} returned invalid JSON.`);
    throw new Error(`${command} failed; see the command output above.`);
  }
};

const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

const deployAlexaInteractionModel = async () => {
  const commonArgs = [
    '--skill-id', process.env.ALEXA_SKILL_ID,
    '--stage', alexaStage,
    '--locale', alexaLocale,
    ...askProfileArgs
  ];

  run('ask', [
    'smapi',
    'set-interaction-model',
    ...commonArgs,
    '--interaction-model', JSON.stringify(interactionModel)
  ]);

  const deadline = Date.now() + 90_000;
  await sleep(2_000);

  while (Date.now() < deadline) {
    const status = runJson('ask', [
      'smapi',
      'get-skill-status',
      '--skill-id', process.env.ALEXA_SKILL_ID,
      '--resource', 'interactionModel',
      ...askProfileArgs
    ]);
    const localeStatus = status?.interactionModel?.[alexaLocale];
    const buildStatus = localeStatus?.lastUpdateRequest?.status;

    if (buildStatus === 'FAILED') {
      const errors = localeStatus?.lastUpdateRequest?.errors ?? [];
      const details = errors
        .map((error) => error?.message ?? error?.code ?? JSON.stringify(error))
        .join('; ');
      throw new Error(`Alexa interaction model build failed${details ? `: ${details}` : '.'}`);
    }

    if (buildStatus === 'SUCCEEDED') {
      const deployed = runJson('ask', [
        'smapi',
        'get-interaction-model',
        ...commonArgs
      ]);
      const deployedInvocationName = deployed?.interactionModel?.languageModel?.invocationName;
      if (deployedInvocationName === expectedInvocationName) {
        console.log(`Alexa interaction model deployed and verified: ${deployedInvocationName} (${alexaStage}/${alexaLocale})`);
        return;
      }
    }

    await sleep(2_000);
  }

  throw new Error(`Timed out waiting for Alexa interaction model build for ${alexaLocale}.`);
};

const originPort = plexUrl.port || '32400';
const params = [
  `AlexaSkillId=${process.env.ALEXA_SKILL_ID}`,
  `PlexOriginDomain=${plexUrl.hostname}`,
  `PlexOriginPort=${originPort}`,
  `PlexToken=${process.env.PLEX_TOKEN}`,
  `PlexMusicLibrary=${process.env.PLEX_MUSIC_LIBRARY || 'Music'}`,
  `MaxQueueTracks=${process.env.MAX_QUEUE_TRACKS || '150'}`,
  `MaxAudioBitrate=${process.env.MAX_AUDIO_BITRATE || '192'}`,
  `TranscodePolicy=${process.env.TRANSCODE_POLICY || 'auto'}`,
  `QueueTtlHours=${process.env.QUEUE_TTL_HOURS || '24'}`,
  `LyricsMode=${process.env.LYRICS_MODE || 'plex-lrclib'}`,
  `LyricsRequestTimeoutMs=${process.env.LYRICS_REQUEST_TIMEOUT_MS || '2500'}`,
  `PersonalityMode=${process.env.PERSONALITY_MODE || 'spicy'}`,
  `RadioTrackLimit=${process.env.RADIO_TRACK_LIMIT || '50'}`,
  `AllowPlaylistWrites=${process.env.ALLOW_PLAYLIST_WRITES || 'true'}`
];

run('aws', ['sts', 'get-caller-identity', '--region', region, '--output', 'json']);
run('npm', ['test']);
run('npm', ['run', 'check']);
run('npm', ['run', 'validate:model']);
run('sam', ['validate', '--lint']);
run('sam', ['build']);
// PlexToken is a NoEcho parameter. Never echo this command or the parameter list.
run('sam', [
  'deploy',
  '--stack-name', stackName,
  '--region', region,
  '--resolve-s3',
  '--capabilities', 'CAPABILITY_IAM',
  '--no-confirm-changeset',
  '--no-fail-on-empty-changeset',
  '--parameter-overrides',
  ...params
]);
run('aws', [
  'cloudformation',
  'describe-stacks',
  '--stack-name', stackName,
  '--region', region,
  '--query', 'Stacks[0].Outputs',
  '--output', 'table'
]);
await deployAlexaInteractionModel();
