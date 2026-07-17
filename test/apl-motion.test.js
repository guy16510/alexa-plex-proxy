import test from 'node:test';
import assert from 'node:assert/strict';
import { applyVisualMotion, VisualMotionResponseInterceptor } from '../src/apl-motion.js';

function document() {
  return {
    type: 'APL',
    version: '1.8',
    mainTemplate: {
      item: {
        type: 'Container',
        items: [
          {
            type: 'Image',
            position: 'absolute',
            width: '100vw',
            height: '100vh',
            source: 'https://example.test/background.jpg'
          },
          {
            type: 'Image',
            width: 300,
            height: 300,
            source: 'https://example.test/cover.jpg'
          }
        ]
      }
    }
  };
}

test('adds slow background and cover motion without changing image sources', () => {
  const value = document();
  applyVisualMotion(value, 'server-music:queue:q1:0');
  const [background, cover] = value.mainTemplate.item.items;
  assert.equal(background.source, 'https://example.test/background.jpg');
  assert.equal(cover.source, 'https://example.test/cover.jpg');
  assert.equal(background.id, 'visualBackground');
  assert.equal(cover.id, 'visualCover');
  assert.ok(value.mainTemplate.item.onMount.some((command) => command.componentId === 'visualBackground'));
  assert.ok(value.mainTemplate.item.onMount.some((command) => command.componentId === 'visualCover'));
});

test('adds a decorative equalizer only to queue and lyric screens', () => {
  const queue = document();
  applyVisualMotion(queue, 'server-music:queue:q1:0');
  assert.ok(queue.mainTemplate.item.items.some((item) => item.id === 'decorativeEqualizer'));
  assert.equal(queue.mainTemplate.item.onMount.filter((command) => String(command.componentId).startsWith('equalizerBar')).length, 5);

  const home = document();
  applyVisualMotion(home, 'server-music:home:1');
  assert.equal(home.mainTemplate.item.items.some((item) => item.id === 'decorativeEqualizer'), false);
});

test('preserves existing lyric onMount commands', () => {
  const value = document();
  value.mainTemplate.item.onMount = [{ type: 'Sequential', commands: [{ type: 'SetValue' }] }];
  applyVisualMotion(value, 'server-music:lyrics:q1:0');
  assert.equal(value.mainTemplate.item.onMount[0].type, 'Sequential');
  assert.ok(value.mainTemplate.item.onMount.some((command) => command.type === 'AnimateItem'));
});

test('response interceptor ignores non-APL directives and mutates APL in place', () => {
  const apl = document();
  const response = {
    directives: [
      { type: 'AudioPlayer.Play' },
      {
        type: 'Alexa.Presentation.APL.RenderDocument',
        token: 'server-music:queue:q1:0',
        document: apl
      }
    ]
  };
  VisualMotionResponseInterceptor.process({}, response);
  assert.equal(response.directives[0].type, 'AudioPlayer.Play');
  assert.equal(apl.mainTemplate.item.items[0].id, 'visualBackground');
});

test('motion enhancement is safe for malformed or absent documents', () => {
  assert.equal(applyVisualMotion(null, 'x'), null);
  const invalid = { type: 'APL' };
  assert.equal(applyVisualMotion(invalid, 'x'), invalid);
  assert.doesNotThrow(() => VisualMotionResponseInterceptor.process({}, {}));
});
