# Echo Show visual experience

The visual layer uses Plex as its only media catalog and artwork source. It does not search the public internet for artists, albums, tracks, playlists, or cover art.

## Screen composition

APL builds the final screen on the Echo Show from:

- Plex artwork resized through `/photo/:/transcode`
- Device-side blur and dark gradient overlays
- Large cover art and across-the-room typography
- A slow background zoom and subtle cover-art breathing animation
- A decorative equalizer on queue and lyric screens

The equalizer is intentionally decorative. Alexa does not provide the skill with live frequency data, so presenting it as audio-reactive would be fake.

## Artwork caching

Audio, Plex APIs, and all other private paths remain uncached through `PlexNoCachePolicy`.

Only deterministic resized artwork requests matching `/photo/:/transcode*` use `PlexArtworkCachePolicy`:

- Minimum TTL: 1 hour
- Default TTL: 1 day
- Maximum TTL: 7 days
- Every transformation query parameter is part of the cache key

This avoids repeatedly resizing the same covers while preventing audio streams from being cached or replayed incorrectly. Plex artwork paths normally change when the underlying image changes, and the bounded maximum TTL provides an additional refresh limit.

## Motion behavior

Motion is added by a response interceptor after each APL document is built. That keeps the home, queue, lyrics, and confirmation documents focused on layout and makes the effect easy to disable without touching playback.

The interceptor:

- Ignores non-APL responses
- Preserves existing lyric scheduling commands
- Animates only opacity or transforms supported by APL `AnimateItem`
- Adds decorative equalizer bars only to queue and lyric screens
- Leaves all image URLs and playback directives unchanged

## Regression boundaries

The visual polish does not modify:

- Audio URLs
- Audio offsets
- Queue ordering
- Playback tokens
- Plex ratings
- Permanent track bans
- Voice-only responses
- AudioPlayer metadata or captions

CloudFormation tests confirm the default distribution behavior remains no-cache and only the Plex artwork transcode path receives the artwork cache policy.
