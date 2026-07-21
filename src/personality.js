const MODES = new Set(['clean', 'spicy']);

const CLEAN = {
  launch: ['Burns Jukebox is ready. What should I play?', 'Your Plex library is ready. What are we listening to?'],
  playing: ['Playing {title}.', 'Starting {title}.'],
  shuffling: ['Shuffling {title}.', 'Mixing up {title}.'],
  notFound: ['I could not find {query} in Plex.', 'Plex could not find {query}.'],
  missingQuery: ['I did not catch what you wanted to play.'],
  missingGenre: ['Which genre should I play?'],
  missingDecade: ['Which decade should I play?'],
  emptyQueue: ['There is nothing queued. Ask me to play something.'],
  pause: ['Paused.'],
  resume: ['Resuming.'],
  next: ['Skipping to the next track.'],
  previous: ['Going back one track.'],
  lastTrack: ['That was the last track.'],
  firstTrack: ['That is the first track.'],
  startOver: ['Starting this track over.'],
  seekForward: ['Skipping ahead {seconds} seconds.'],
  seekBackward: ['Going back {seconds} seconds.'],
  shuffleOn: ['Shuffle is on.'],
  shuffleOff: ['Shuffle is off.'],
  loopOn: ['Loop is on.'],
  loopOff: ['Loop is off.'],
  nowPlaying: ['This is {title} by {artist}, from the album {album}.'],
  help: ['Try play an artist, skip this song, favorite this, never play this again, or skip ahead thirty seconds.'],
  fallback: ['I can play music, control playback, rate tracks, and manage playlists.'],
  liked: ['I favorited {title}.'],
  disliked: ['I blocked {title} and skipped it.'],
  rated: ['I rated {title} {rating} out of ten.'],
  invalidRating: ['Give me a rating from zero to ten.'],
  playlistAdded: ['I added {title} to {playlist}.'],
  missingPlaylist: ['Which playlist should I use?'],
  playlistMissing: ['I could not find an editable Plex playlist named {playlist}.'],
  playlistWritesDisabled: ['Playlist writes are disabled.'],
  radio: ['Starting track radio from {title}.'],
  status: ['Plex is {plexStatus}. The queue has {queueCount} tracks. Lyrics are {lyricsStatus}. Playlist writes are {playlistStatus}.'],
  stopped: ['Stopping playback.'],
  error: ['Burns Jukebox hit an error. Check the Lambda logs and Plex remote access.']
};

const SPICY = {
  launch: [
    'Jukebox is awake. What the hell are we playing?',
    'Plex is up. Name your poison.',
    'All right, hit me with some music.'
  ],
  playing: [
    'Found it. Playing {title}. Hell yes.',
    '{title}. Crank that shit.',
    'Playing {title}. Good fucking choice.',
    '{title} is on. Let’s make bad decisions.'
  ],
  shuffling: [
    'Shuffling {title}. Let chaos drive.',
    '{title}, scrambled to hell.',
    'Shuffle on. Order can fuck off.'
  ],
  notFound: [
    'Oh shit, where did I put {query}?',
    'I’m losing my damn mind. I can’t find {query}.',
    '{query}? Must be in my other pants.',
    'Fuck. {query} vanished again.',
    'Nope. Plex ate {query}.',
    'I checked everywhere. {query} is hiding like an asshole.'
  ],
  missingQuery: [
    'I missed that. Say the damn name again.',
    'What the hell am I playing?',
    'The microphones shit the bed. Try again.'
  ],
  missingGenre: ['Which genre, you indecisive bastard?', 'Name a genre. Any damn genre.'],
  missingDecade: ['Which decade are we raiding?', 'Pick a decade, time traveler.'],
  emptyQueue: ['The queue is empty as hell.', 'Nothing queued. Feed the damn jukebox.'],
  pause: ['Paused. Everybody calm the fuck down.', 'Paused. Tiny music timeout.'],
  resume: ['Back at it. Fuck restraint.', 'Resuming. Let’s get loud again.'],
  next: ['Skipping. That song knows what it did.', 'Next. Get this shit out of here.', 'Gone. Next victim.'],
  previous: ['Going back. Apparently mistakes deserve seconds.', 'Back one. Nostalgic little bastard.'],
  lastTrack: ['That was the last track. We killed the queue.', 'Queue is dead. Nice work.'],
  firstTrack: ['That is the first track. Time says fuck off.', 'Already at the beginning, genius.'],
  startOver: ['From the top. Do it properly this time.', 'Restarting. Again, with feeling.'],
  seekForward: ['Jumping ahead {seconds} seconds. Screw the boring part.', 'Skipping {seconds} seconds. Bye, filler.'],
  seekBackward: ['Going back {seconds} seconds. You missed the good shit.', 'Rewinding {seconds} seconds. Pay attention.'],
  shuffleOn: ['Shuffle on. Order can eat shit.', 'Shuffle enabled. Chaos wins.'],
  shuffleOff: ['Shuffle off. Boring order restored.', 'Shuffle disabled. Back in line, assholes.'],
  loopOn: ['Loop on. We live here now.', 'Loop enabled. Escape denied.'],
  loopOff: ['Loop off. Freedom, finally.', 'Loop disabled. Commitment avoided.'],
  nowPlaying: ['{title} by {artist}, from {album}. Damn good pick.', '{title}, {artist}. That’s the shit.'],
  help: ['Say play an artist, skip this shit, favorite it, ban it forever, or jump ahead thirty seconds.'],
  fallback: ['I play music and boss Plex around. Try saying something useful.'],
  liked: ['Favorited {title}. That shit stays.', '{title} gets the big thumbs up.'],
  disliked: ['Blocked {title}. Never playing that shit again.', '{title} is dead to us. Skipping it.', 'Thumbs down. Banished forever.'],
  rated: ['{title} gets {rating} out of ten. Judgment delivered.', 'Rated {title} a {rating}. Brutal.'],
  invalidRating: ['Zero to ten, mathlete.', 'Pick zero through ten. Don’t make this weird.'],
  playlistAdded: ['Stuffed {title} into {playlist}.', '{title} is in {playlist}. Done.'],
  missingPlaylist: ['Which damn playlist?', 'Name the playlist, boss.'],
  playlistMissing: ['Can’t find writable playlist {playlist}. Plex is being an asshole.', '{playlist} is missing or read-only. Shit.'],
  playlistWritesDisabled: ['Playlist writes are off. Bureaucratic bullshit.', 'Can’t write playlists. The switch is off.'],
  radio: ['Starting radio from {title}. Let’s see what other shit fits.', '{title} radio. Similar trouble incoming.'],
  status: ['Plex is {plexStatus}. {queueCount} tracks queued. Lyrics {lyricsStatus}. Playlist writes {playlistStatus}. Nothing is on fire.'],
  stopped: ['Stopped. Party’s fucking over.', 'Music off. Silence wins.'],
  error: ['Something broke. CloudWatch has the dirty details.', 'Well, shit. Check Lambda and Plex.', 'The jukebox ate shit. Logs know why.']
};

function interpolate(template, values) {
  return template.replace(/\{([a-zA-Z0-9_]+)\}/g, (_, key) => String(values[key] ?? ''));
}

export function createResponder({ mode = 'spicy', random = Math.random } = {}) {
  const normalizedMode = MODES.has(mode) ? mode : 'spicy';
  const catalog = normalizedMode === 'clean' ? CLEAN : SPICY;
  return function respond(key, values = {}) {
    const options = catalog[key] ?? CLEAN[key] ?? [String(key)];
    const index = Math.min(options.length - 1, Math.floor(Math.max(0, random()) * options.length));
    return interpolate(options[index], values);
  };
}
