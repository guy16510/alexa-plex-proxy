const APL_TOKEN_PREFIX = 'server-music';

function escapeText(value, fallback = '') {
  return String(value ?? fallback).replace(/[<>]/g, '');
}

function imageUrl(item) {
  return item?.imageUrl || item?.artUrl || '';
}

function sendEvent(...argumentsList) {
  return [{ type: 'SendEvent', arguments: argumentsList }];
}

function background(image, { blur = 28 } = {}) {
  return {
    type: 'Image',
    position: 'absolute',
    width: '100vw',
    height: '100vh',
    source: image || '',
    scale: 'best-fill',
    filters: image ? [{ type: 'Blur', radius: blur }] : [],
    overlayColor: '#88000000',
    overlayGradient: {
      type: 'linear',
      colorRange: ['#E8000000', '#66000000', '#EE000000'],
      inputRange: [0, 0.55, 1],
      angle: 90
    }
  };
}

function label(text, {
  id = undefined,
  fontSize = 28,
  color = '#FFFFFF',
  fontWeight = 'normal',
  maxLines = 1,
  opacity = 1,
  textAlign = 'left'
} = {}) {
  return {
    type: 'Text',
    ...(id ? { id } : {}),
    text: escapeText(text),
    fontSize,
    color,
    fontWeight,
    maxLines,
    opacity,
    textAlign
  };
}

function actionButton({ text, action, value = '', width = 116 }) {
  return {
    type: 'TouchWrapper',
    width,
    height: 58,
    onPress: sendEvent(action, value),
    item: {
      type: 'Frame',
      width: '100%',
      height: '100%',
      borderRadius: 29,
      backgroundColor: '#CC1F1F26',
      borderColor: '#55FFFFFF',
      borderWidth: 1,
      item: {
        type: 'Text',
        text: escapeText(text),
        fontSize: 20,
        color: '#FFFFFF',
        fontWeight: '700',
        textAlign: 'center',
        textAlignVertical: 'center'
      }
    }
  };
}

function mediaCard(item, { width = 190, compact = false } = {}) {
  const kind = item?.kind || 'any';
  const query = item?.query || item?.title || '';
  return {
    type: 'TouchWrapper',
    width,
    height: compact ? 150 : 230,
    onPress: sendEvent('play', kind, query),
    item: {
      type: 'Container',
      direction: 'column',
      width: '100%',
      height: '100%',
      items: [
        {
          type: 'Frame',
          width: compact ? 112 : 176,
          height: compact ? 112 : 176,
          borderRadius: compact ? 16 : 22,
          backgroundColor: '#33222222',
          item: {
            type: 'Image',
            width: '100%',
            height: '100%',
            source: imageUrl(item),
            scale: 'best-fill',
            borderRadius: compact ? 16 : 22
          }
        },
        label(item?.title, {
          fontSize: compact ? 17 : 20,
          fontWeight: '700',
          maxLines: 1
        }),
        label(item?.subtitle, {
          fontSize: compact ? 14 : 16,
          color: '#C7FFFFFF',
          maxLines: 1
        })
      ]
    }
  };
}

function section(title, items, { compact = false } = {}) {
  if (!Array.isArray(items) || items.length === 0) return null;
  return {
    type: 'Container',
    direction: 'column',
    spacing: compact ? 8 : 12,
    items: [
      label(title, {
        fontSize: compact ? 20 : 26,
        fontWeight: '700'
      }),
      {
        type: 'Sequence',
        scrollDirection: 'horizontal',
        height: compact ? 158 : 238,
        spacing: compact ? 10 : 16,
        items: items.map((item) => mediaCard(item, { compact }))
      }
    ]
  };
}

function homeContent(data, compact) {
  const sections = [
    section('Recently added', data.recentAlbums, { compact }),
    section('Favorites', data.favorites, { compact }),
    section('Playlists', data.playlists, { compact })
  ].filter(Boolean);

  if (sections.length === 0) {
    sections.push({
      type: 'Container',
      grow: 1,
      justifyContent: 'center',
      alignItems: 'center',
      items: [
        label('Your Plex library is ready.', {
          fontSize: compact ? 27 : 40,
          fontWeight: '700',
          textAlign: 'center'
        }),
        label('Say “play Benson Boone” or tap a control.', {
          fontSize: compact ? 18 : 24,
          color: '#CCFFFFFF',
          textAlign: 'center'
        })
      ]
    });
  }

  return sections;
}

export function supportsApl(handlerInput) {
  return Boolean(
    handlerInput?.requestEnvelope?.context?.System?.device?.supportedInterfaces?.['Alexa.Presentation.APL']
  );
}

export function aplDirective(document, datasources = {}, token = `${APL_TOKEN_PREFIX}:screen`) {
  return {
    type: 'Alexa.Presentation.APL.RenderDocument',
    token,
    document,
    datasources
  };
}

export function homeDocument(data = {}) {
  const fallbackImage = data.backgroundImage || data.current?.artUrl || imageUrl(data.recentAlbums?.[0]);
  const compactItems = homeContent(data, true);
  const normalItems = homeContent(data, false);

  return {
    type: 'APL',
    version: '1.8',
    import: [
      { name: 'alexa-viewport-profiles', version: '1.6.0' }
    ],
    theme: 'dark',
    mainTemplate: {
      parameters: [],
      item: {
        type: 'Container',
        width: '100vw',
        height: '100vh',
        items: [
          background(fallbackImage),
          {
            type: 'Container',
            when: '${@viewportProfile == @hubLandscapeSmall}',
            width: '100%',
            height: '100%',
            paddingLeft: 28,
            paddingRight: 28,
            paddingTop: 18,
            paddingBottom: 18,
            direction: 'column',
            items: [
              {
                type: 'Container',
                direction: 'row',
                justifyContent: 'spaceBetween',
                alignItems: 'center',
                items: [
                  label('SERVER MUSIC', { fontSize: 20, fontWeight: '700' }),
                  label('Plex, but less boring', { fontSize: 16, color: '#BFFFFFFF' })
                ]
              },
              {
                type: 'Sequence',
                grow: 1,
                scrollDirection: 'vertical',
                spacing: 12,
                items: compactItems
              }
            ]
          },
          {
            type: 'Container',
            when: '${@viewportProfile != @hubLandscapeSmall}',
            width: '100%',
            height: '100%',
            paddingLeft: 52,
            paddingRight: 52,
            paddingTop: 36,
            paddingBottom: 36,
            direction: 'column',
            items: [
              label('SERVER MUSIC', { fontSize: 26, fontWeight: '700' }),
              label('Your Plex library, dressed properly.', {
                fontSize: 40,
                fontWeight: '700',
                maxLines: 2
              }),
              {
                type: 'Sequence',
                grow: 1,
                scrollDirection: 'vertical',
                spacing: 24,
                items: normalItems
              }
            ]
          }
        ]
      }
    }
  };
}

function queueRow(track, position, current) {
  return {
    type: 'TouchWrapper',
    height: 64,
    onPress: sendEvent('queueSelect', String(position)),
    item: {
      type: 'Container',
      direction: 'row',
      alignItems: 'center',
      spacing: 14,
      paddingLeft: 10,
      paddingRight: 10,
      backgroundColor: current ? '#5519C37D' : '#22111111',
      borderRadius: 12,
      items: [
        label(current ? '▶' : String(position + 1), {
          fontSize: 18,
          color: current ? '#61F5B0' : '#AFFFFFFF',
          fontWeight: '700',
          textAlign: 'center'
        }),
        {
          type: 'Container',
          grow: 1,
          items: [
            label(track?.title, { fontSize: 19, fontWeight: current ? '700' : '500' }),
            label(track?.artist, { fontSize: 15, color: '#BFFFFFFF' })
          ]
        },
        label(track?.durationLabel, { fontSize: 14, color: '#99FFFFFF' })
      ]
    }
  };
}

export function queueDocument({ queue, track, artUrl, backgroundImage }) {
  const position = Math.max(0, Number(queue?.index) || 0);
  const visible = (queue?.tracks ?? []).slice(Math.max(0, position - 1), position + 6);
  const start = Math.max(0, position - 1);
  const rows = visible.map((item, index) => queueRow(item, start + index, start + index === position));

  return {
    type: 'APL',
    version: '1.8',
    import: [{ name: 'alexa-viewport-profiles', version: '1.6.0' }],
    theme: 'dark',
    mainTemplate: {
      parameters: [],
      item: {
        type: 'Container',
        width: '100vw',
        height: '100vh',
        items: [
          background(backgroundImage || artUrl),
          {
            type: 'Container',
            width: '100%',
            height: '100%',
            paddingLeft: 30,
            paddingRight: 30,
            paddingTop: 22,
            paddingBottom: 20,
            direction: 'row',
            spacing: 26,
            items: [
              {
                type: 'Container',
                width: '${@viewportProfile == @hubLandscapeSmall ? "31vw" : "34vw"}',
                direction: 'column',
                spacing: 12,
                items: [
                  {
                    type: 'Image',
                    width: '100%',
                    height: '${@viewportProfile == @hubLandscapeSmall ? "50vh" : "48vh"}',
                    source: artUrl || '',
                    scale: 'best-fill',
                    borderRadius: 24
                  },
                  label(track?.title, { fontSize: 27, fontWeight: '700', maxLines: 2 }),
                  label(track?.artist, { fontSize: 20, color: '#D6FFFFFF' }),
                  label(`${position + 1} of ${queue?.tracks?.length ?? 0}`, {
                    fontSize: 16,
                    color: '#AFFFFFFF'
                  }),
                  {
                    type: 'Container',
                    direction: 'row',
                    spacing: 9,
                    wrap: 'wrap',
                    items: [
                      actionButton({ text: 'Previous', action: 'previous', width: 104 }),
                      actionButton({ text: 'Next', action: 'next', width: 82 }),
                      actionButton({ text: '↶ 30', action: 'seek', value: '-30', width: 86 }),
                      actionButton({ text: '♥', action: 'favorite', width: 70 }),
                      actionButton({ text: '🚫', action: 'ban', width: 70 }),
                      actionButton({ text: '30 ↷', action: 'seek', value: '30', width: 86 }),
                      actionButton({ text: 'Lyrics', action: 'showLyrics', width: 102 }),
                      actionButton({ text: 'Radio', action: 'radio', width: 96 })
                    ]
                  }
                ]
              },
              {
                type: 'Container',
                grow: 1,
                direction: 'column',
                spacing: 10,
                items: [
                  label('UP NEXT', { fontSize: 21, fontWeight: '700', color: '#CCFFFFFF' }),
                  {
                    type: 'Sequence',
                    grow: 1,
                    scrollDirection: 'vertical',
                    spacing: 7,
                    items: rows
                  }
                ]
              }
            ]
          }
        ]
      }
    }
  };
}

export function lyricsDocument({
  track,
  artUrl,
  backgroundImage,
  previousLine = '',
  currentLine = 'No synchronized lyrics found.',
  nextLine = '',
  offsetLabel = 'Lyrics offset 0.0s',
  timeline = []
}) {
  const commands = [];
  for (const entry of timeline.slice(0, 25)) {
    commands.push(
      {
        type: 'SetValue',
        delay: Math.max(0, Number(entry.delayMs) || 0),
        componentId: 'previousLyric',
        property: 'text',
        value: escapeText(entry.previousLine)
      },
      {
        type: 'SetValue',
        componentId: 'currentLyric',
        property: 'text',
        value: escapeText(entry.currentLine)
      },
      {
        type: 'SetValue',
        componentId: 'nextLyric',
        property: 'text',
        value: escapeText(entry.nextLine)
      }
    );
  }

  return {
    type: 'APL',
    version: '1.8',
    import: [{ name: 'alexa-viewport-profiles', version: '1.6.0' }],
    theme: 'dark',
    mainTemplate: {
      parameters: [],
      item: {
        type: 'Container',
        width: '100vw',
        height: '100vh',
        ...(commands.length > 0 ? {
          onMount: [{
            type: 'Sequential',
            screenLock: true,
            commands
          }]
        } : {}),
        items: [
          background(backgroundImage || artUrl, { blur: 34 }),
          {
            type: 'Container',
            width: '100%',
            height: '100%',
            paddingLeft: 42,
            paddingRight: 42,
            paddingTop: 24,
            paddingBottom: 20,
            direction: 'column',
            justifyContent: 'spaceBetween',
            items: [
              {
                type: 'Container',
                direction: 'row',
                alignItems: 'center',
                spacing: 16,
                items: [
                  {
                    type: 'Image',
                    width: 68,
                    height: 68,
                    source: artUrl || '',
                    scale: 'best-fill',
                    borderRadius: 12
                  },
                  {
                    type: 'Container',
                    grow: 1,
                    items: [
                      label(track?.title, { fontSize: 24, fontWeight: '700' }),
                      label(track?.artist, { fontSize: 18, color: '#C7FFFFFF' })
                    ]
                  },
                  actionButton({ text: 'Queue', action: 'showQueue', width: 96 })
                ]
              },
              {
                type: 'Container',
                grow: 1,
                justifyContent: 'center',
                items: [
                  label(previousLine, {
                    id: 'previousLyric',
                    fontSize: '${@viewportProfile == @hubLandscapeSmall ? 20 : 26}',
                    color: '#88FFFFFF',
                    maxLines: 2,
                    textAlign: 'center'
                  }),
                  label(currentLine, {
                    id: 'currentLyric',
                    fontSize: '${@viewportProfile == @hubLandscapeSmall ? 34 : 52}',
                    fontWeight: '700',
                    maxLines: 3,
                    textAlign: 'center'
                  }),
                  label(nextLine, {
                    id: 'nextLyric',
                    fontSize: '${@viewportProfile == @hubLandscapeSmall ? 20 : 26}',
                    color: '#99FFFFFF',
                    maxLines: 2,
                    textAlign: 'center'
                  })
                ]
              },
              {
                type: 'Container',
                direction: 'row',
                justifyContent: 'center',
                alignItems: 'center',
                spacing: 12,
                items: [
                  actionButton({ text: 'Lyrics -1s', action: 'lyricsOffset', value: '-1000', width: 132 }),
                  label(offsetLabel, { fontSize: 16, color: '#BFFFFFFF', textAlign: 'center' }),
                  actionButton({ text: 'Lyrics +1s', action: 'lyricsOffset', value: '1000', width: 132 })
                ]
              }
            ]
          }
        ]
      }
    }
  };
}

export function confirmationDocument({ query, alternatives = [] }) {
  const cards = alternatives.slice(0, 3).map((item) => ({
    type: 'TouchWrapper',
    grow: 1,
    onPress: sendEvent('play', item.kind || 'any', item.query || item.title),
    item: {
      type: 'Container',
      width: '100%',
      height: '100%',
      direction: 'column',
      alignItems: 'center',
      spacing: 10,
      paddingLeft: 12,
      paddingRight: 12,
      items: [
        {
          type: 'Image',
          width: '${@viewportProfile == @hubLandscapeSmall ? 126 : 220}',
          height: '${@viewportProfile == @hubLandscapeSmall ? 126 : 220}',
          source: imageUrl(item),
          scale: 'best-fill',
          borderRadius: 22
        },
        label(item.title, {
          fontSize: '${@viewportProfile == @hubLandscapeSmall ? 19 : 26}',
          fontWeight: '700',
          maxLines: 2,
          textAlign: 'center'
        }),
        label(item.subtitle, {
          fontSize: '${@viewportProfile == @hubLandscapeSmall ? 14 : 18}',
          color: '#BFFFFFFF',
          maxLines: 1,
          textAlign: 'center'
        })
      ]
    }
  }));

  const bg = imageUrl(alternatives[0]);
  return {
    type: 'APL',
    version: '1.8',
    import: [{ name: 'alexa-viewport-profiles', version: '1.6.0' }],
    theme: 'dark',
    mainTemplate: {
      parameters: [],
      item: {
        type: 'Container',
        width: '100vw',
        height: '100vh',
        items: [
          background(bg),
          {
            type: 'Container',
            width: '100%',
            height: '100%',
            paddingLeft: 34,
            paddingRight: 34,
            paddingTop: 26,
            paddingBottom: 24,
            direction: 'column',
            spacing: 18,
            items: [
              label(`I heard “${query}”`, {
                fontSize: '${@viewportProfile == @hubLandscapeSmall ? 22 : 30}',
                color: '#CFFFFFFF'
              }),
              label('Which one did you mean?', {
                fontSize: '${@viewportProfile == @hubLandscapeSmall ? 31 : 46}',
                fontWeight: '700'
              }),
              {
                type: 'Container',
                grow: 1,
                direction: 'row',
                spacing: 18,
                items: cards
              }
            ]
          }
        ]
      }
    }
  };
}

export function addApl(builder, document, token) {
  return builder.addDirective(aplDirective(document, {}, token));
}
