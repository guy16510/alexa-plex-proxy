import { config as loadDotenv } from 'dotenv';
import { execFileSync } from 'node:child_process';
import { URL } from 'node:url';

loadDotenv({ quiet: true });
const required = ['ALEXA_SKILL_ID', 'PLEX_TOKEN', 'PLEX_URL'];
for (const name of required) if (!process.env[name]?.trim()) throw new Error(`Missing ${name} in .env`);
const region = process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION;
if (!region) throw new Error('Missing AWS_REGION or AWS_DEFAULT_REGION in .env');
const plexUrl = new URL(process.env.PLEX_URL);
if (plexUrl.protocol !== 'https:') throw new Error('PLEX_URL must use HTTPS');
const stackName = process.env.STACK_NAME || 'alexa-plex-music';
const run = (command, args, options = {}) => {
  try {
    return execFileSync(command, args, {
      stdio: 'inherit',
      env: { ...process.env, AWS_REGION: region, AWS_DEFAULT_REGION: region },
      ...options
    });
  } catch {
    throw new Error(`${command} failed; see the command output above.`);
  }
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
