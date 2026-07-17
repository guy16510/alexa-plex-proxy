const MODES = new Set(['clean', 'spicy']);

const CLEAN = {
  launch: [
    'Server Music is ready. What should I play?',
    'Your Plex library is ready. What are we listening to?'
  ],
  playing: [
    'Playing {title} from Plex.',
    'Starting {title}.'
  ],
  shuffling: [
    'Shuffling {title} from Plex.',
    'Mixing up {title}.'
  ],
  notFound: [
    'I could not find {query} in your Plex music library.',
    'Plex could not find {query}.'
  ],
  emptyQueue: [
    'There is nothing queued. Ask Server Music to play an artist, song, album, playlist, genre, or decade.'
  ],
  pause: ['Paused.'],
  resume: ['Resuming playback.'],
  next: ['Skipping to the next track.'],
  previous: ['Going back to the previous track.'],
  startOver: ['Starting this track over.'],
  shuffleOn: ['Shuffle is on.'],
  shuffleOff: ['Shuffle is off.'],
  loopOn: ['Loop is on.'],
  loopOff: ['Loop is off.'],
  nowPlaying: ['This is {title} by {artist}, from the album {album}.'],
  help: [
    'Try saying play Queen, play nineties music, start track radio, like this song, or add this to my Road Trip playlist.'
  ],
  fallback: [
    'I can play an artist, album, song, playlist, genre, decade, or track radio. I can also rate songs and add them to playlists.'
  ],
  liked: ['I rated {title} a ten out of ten.'],
  disliked: ['I rated {title} zero out of ten.'],
  rated: ['I rated {title} {rating} out of ten.'],
  playlistAdded: ['I added {title} to {playlist}.'],
  playlistMissing: ['I could not find an editable Plex playlist named {playlist}.'],
  radio: ['Starting track radio from {title}.'],
  status: [
    'Plex is {plexStatus}. The queue has {queueCount} tracks. Lyrics are {lyricsStatus}. Playlist writes are {playlistStatus}.'
  ],
  stopped: ['Stopping playback.'],
  error: ['Server Music hit an error. Check the Lambda logs and Plex remote access.']
};

const SPICY = {
  launch: [
    'Server Music is awake, caffeinated, and wearing irresponsibly tight pants. What are we playing?',
    'The jukebox is open for business, and its standards remain dangerously low. What do you want?',
    'Plex is warmed up and making questionable eye contact. Name your poison.'
  ],
  playing: [
    'Playing {title}. Try not to make it weird. Actually, make it a little weird.',
    '{title} is going in. The queue consented enthusiastically.',
    'Sliding {title} into the speakers. Very tasteful. Mildly suspicious.'
  ],
  shuffling: [
    'Shuffling {title}. Order has left the building without pants.',
    'Mixing up {title}. Chaos, but make it sexy.',
    'Shuffling {title}. The queue is now making poor but exciting decisions.'
  ],
  notFound: [
    'I could not find {query}. Plex checked everywhere, including under the suspiciously sticky couch.',
    '{query} is not in the library. Either it escaped, or we never seduced it into Plex.',
    'No luck finding {query}. The jukebox is embarrassed, but somehow still smug.'
  ],
  emptyQueue: [
    'The queue is empty, naked, and judging us. Ask me to play something.',
    'Nothing is queued. The speakers are lonely and making it everyone else’s problem.'
  ],
  pause: [
    'Paused. The speakers are taking a cold shower.',
    'Paused. Everybody keep their hands where Alexa can see them.'
  ],
  resume: [
    'Resuming. The speakers have made several questionable choices.',
    'Back at it. Apparently restraint was never part of the plan.'
  ],
  next: [
    'Skipping ahead. That track knows what it did.',
    'Next track. No hard feelings, just aggressively selective taste.'
  ],
  previous: [
    'Going back. Apparently we enjoy repeating our mistakes.',
    'Previous track. A tasteful little walk of shame.'
  ],
  startOver: [
    'Starting over. Again, but with more confidence and fewer clothes.',
    'From the top. Let’s pretend the first time was just foreplay.'
  ],
  shuffleOn: [
    'Shuffle is on. Order has left the building without pants.',
    'Shuffle enabled. The queue is officially unsupervised.'
  ],
  shuffleOff: [
    'Shuffle is off. We are pretending to be responsible adults again.',
    'Shuffle disabled. Back to boring, consensual chronology.'
  ],
  loopOn: [
    'Loop is on. We are now trapped together, romantically and musically.',
    'Loop enabled. This relationship just became alarmingly committed.'
  ],
  loopOff: [
    'Loop is off. Commitment issues restored.',
    'Loop disabled. The song is free to leave after one last awkward glance.'
  ],
  nowPlaying: [
    'This is {title} by {artist}, from {album}. You have excellent taste, occasionally.',
    '{title}, by {artist}, from the album {album}. Try to act casual.'
  ],
  help: [
    'Try saying play Queen, play nineties music, start track radio, like this song, or add this to my Road Trip playlist. I contain multitudes and several bad ideas.'
  ],
  fallback: [
    'I can play artists, albums, songs, playlists, genres, decades, and track radio. I can also rate songs and put them into playlists, because apparently I am the responsible one here.'
  ],
  liked: [
    'Rated {title} a ten. Absolutely shameless behavior.',
    '{title} gets a perfect ten. Buy it dinner first.'
  ],
  disliked: [
    'Rated {title} a zero. Brutal, but the jukebox respects boundaries.',
    '{title} gets zero. I have seen gentler breakups.'
  ],
  rated: [
    'Rated {title} {rating} out of ten. The judgment has been entered into the horny little database.',
    '{title} gets {rating} out of ten. Harsh, fair, and weirdly attractive.'
  ],
  playlistAdded: [
    'Added {title} to {playlist}. They are getting cozy.',
    '{title} is now inside {playlist}. Everybody behaved professionally, mostly.'
  ],
  playlistMissing: [
    'I could not find an editable playlist named {playlist}. It may be smart, missing, or playing hard to get.',
    'No writable playlist called {playlist}. Plex is being coy again.'
  ],
  radio: [
    'Starting track radio from {title}. Let’s see what else has the same dangerous energy.',
    'Building a radio around {title}. Similar vibes, fewer emotional consequences.'
  ],
  status: [
    'Plex is {plexStatus}, the queue has {queueCount} tracks, lyrics are {lyricsStatus}, playlist writes are {playlistStatus}, and nothing is currently on fire. Very disappointing.'
  ],
  stopped: [
    'Stopping playback. The speakers will think about what they have done.',
    'Stopped. Everyone put your pants back on.'
  ],
  error: [
    'Server Music tripped over its own pants. Check the Lambda logs and Plex remote access.',
    'Something broke. The music stopped, the mood died, and CloudWatch has the gossip.'
  ]
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
