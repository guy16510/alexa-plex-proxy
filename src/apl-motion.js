function walk(node, visitor) {
  if (!node || typeof node !== 'object') return;
  visitor(node);
  if (Array.isArray(node)) {
    for (const item of node) walk(item, visitor);
    return;
  }
  for (const value of Object.values(node)) {
    if (value && typeof value === 'object') walk(value, visitor);
  }
}

function findImages(document) {
  const images = [];
  walk(document?.mainTemplate?.item, (node) => {
    if (node?.type === 'Image') images.push(node);
  });
  return images;
}

function animateTransform(componentId, duration, fromScale, toScale, repeatCount = 99) {
  return {
    type: 'AnimateItem',
    componentId,
    duration,
    easing: 'ease-in-out',
    repeatCount,
    repeatMode: 'reverse',
    value: [{
      property: 'transform',
      from: [{ scale: fromScale }],
      to: [{ scale: toScale }]
    }]
  };
}

function equalizerOverlay() {
  const heights = [18, 30, 23, 36, 26];
  return {
    type: 'Container',
    id: 'decorativeEqualizer',
    position: 'absolute',
    right: 22,
    bottom: 16,
    height: 44,
    direction: 'row',
    alignItems: 'end',
    spacing: 5,
    opacity: 0.42,
    items: heights.map((height, index) => ({
      type: 'Frame',
      id: `equalizerBar${index + 1}`,
      width: 5,
      height,
      borderRadius: 3,
      backgroundColor: '#E8FFFFFF',
      transform: [{ scaleY: 0.45 }]
    }))
  };
}

function addOnMount(root, commands) {
  if (!root || commands.length === 0) return;
  const existing = Array.isArray(root.onMount) ? root.onMount : [];
  root.onMount = [...existing, ...commands];
}

export function applyVisualMotion(document, token = '') {
  if (!document?.mainTemplate?.item || document.type !== 'APL') return document;
  const root = document.mainTemplate.item;
  const images = findImages(document);
  const background = images.find((image) => image.position === 'absolute');
  const foreground = images.find((image) => image !== background && image.width && image.height);
  const commands = [];

  if (background) {
    background.id ||= 'visualBackground';
    commands.push(animateTransform(background.id, 9000, 1, 1.045));
  }
  if (foreground && !String(token).includes(':home:')) {
    foreground.id ||= 'visualCover';
    commands.push(animateTransform(foreground.id, 7200, 1, 1.025));
  }

  if (String(token).includes(':queue:') || String(token).includes(':lyrics:')) {
    root.items ??= [];
    if (Array.isArray(root.items) && !root.items.some((item) => item?.id === 'decorativeEqualizer')) {
      root.items.push(equalizerOverlay());
      const durations = [620, 810, 540, 930, 700];
      for (let index = 0; index < durations.length; index += 1) {
        commands.push(animateTransform(`equalizerBar${index + 1}`, durations[index], 0.38, 1, 99));
      }
    }
  }

  addOnMount(root, commands);
  return document;
}

export const VisualMotionResponseInterceptor = {
  process(_handlerInput, response) {
    for (const directive of response?.directives ?? []) {
      if (directive?.type !== 'Alexa.Presentation.APL.RenderDocument') continue;
      applyVisualMotion(directive.document, directive.token);
    }
  }
};
