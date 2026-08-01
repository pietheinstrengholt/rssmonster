export const BOOTSTRAP_ICON_SPRITE_ID = 'BootstrapIcons';

// This function injects the trusted build-time icon sprite once for global SVG references.
export const injectBootstrapIcons = spriteMarkup => {
  if (typeof document === 'undefined' || !document.body) return false;
  if (document.getElementById(BOOTSTRAP_ICON_SPRITE_ID)) return true;

  const container = document.createElement('div');
  container.innerHTML = String(spriteMarkup || '').trim();
  const sprite = container.firstElementChild;
  if (!sprite || sprite.tagName.toLowerCase() !== 'svg') return false;

  sprite.id = BOOTSTRAP_ICON_SPRITE_ID;
  sprite.setAttribute('aria-hidden', 'true');
  sprite.style.display = 'none';
  document.body.append(sprite);
  return true;
};
