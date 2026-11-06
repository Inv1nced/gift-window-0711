const byId = (id) => document.getElementById(id);
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
const runner = document.querySelector('.runner');
const introGift = byId('introGift');
const albumStart = byId('albumStart');
const photoDeck = byId('photoDeck');
const previous = byId('previous');
const next = byId('next');
const toGift = byId('toGift');
const lastGift = byId('lastGift');
const fade = byId('fade');
const fireworksVideo = byId('fireworksVideo');
const fireworksToggle = byId('fireworksToggle');
const photoCases = [];

let privateKey;
let currentScene = byId('intro');
let metadata;
let index = 0;
let turning = false;
let fireworksEnabled = true;
const pictures = new Map();

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, reduced.matches ? 0 : ms));

async function decrypt(name) {
  const response = await fetch(`assets/${name}.bin`);
  if (!response.ok) throw new Error(`Could not load ${name}`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  return crypto.subtle.decrypt({ name: 'AES-GCM', iv: bytes.subarray(0, 12) }, privateKey, bytes.subarray(12));
}

async function pictureUrl(name) {
  const buffer = await decrypt(name);
  const url = URL.createObjectURL(new Blob([buffer], { type: 'image/jpeg' }));
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    return url;
  } catch (error) {
    URL.revokeObjectURL(url);
    throw error;
  }
}

function loadPhoto(number) {
  if (!pictures.has(number)) {
    const request = pictureUrl(metadata.photos[number].name).catch((error) => {
      pictures.delete(number);
      throw error;
    });
    pictures.set(number, request);
  }
  return pictures.get(number);
}

function showError(message) {
  byId('introErrorText').textContent = message;
  byId('introError').hidden = false;
}

function activateScene(id, heading) {
  currentScene.hidden = true;
  currentScene = byId(id);
  currentScene.hidden = false;
  window.scrollTo(0, 0);
  byId(heading).focus({ preventScroll: true });
  syncFireworks();
}

async function crossfade(id, heading, light = false) {
  fade.classList.toggle('lit', light);
  fade.classList.add('active');
  await wait(450);
  byId('story').hidden = id === 'intro';
  activateScene(id, heading);
  fade.classList.remove('active');
}

async function init() {
  const key = new URLSearchParams(location.hash.slice(1)).get('k');
  if (!key || !/^[\w-]{43}$/.test(key)) {
    showError('Открой полную ссылку на открытку, которую тебе прислал Олег.');
    return;
  }

  try {
    const raw = Uint8Array.from(atob(key.replace(/-/g, '+').replace(/_/g, '/')), (char) => char.charCodeAt(0));
    privateKey = await crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['decrypt']);
    const [letter, face] = await Promise.all([decrypt('letter-v2'), pictureUrl('head-v2')]);
    metadata = JSON.parse(new TextDecoder().decode(letter));
    const paragraphs = metadata.letter.map((line) => {
      const paragraph = document.createElement('p');
      paragraph.textContent = line;
      return paragraph;
    });
    byId('letterText').replaceChildren(...paragraphs);
    byId('head').setAttribute('href', face);
    startRunner();
    void loadPhoto(0).catch(() => {});
  } catch {
    showError('Не получилось открыть открытку. Проверь ссылку и попробуй обновить страницу.');
  }
}

function startRunner() {
  runner.classList.add('ready');
  void wait(1700).then(() => { introGift.disabled = false; });
}

introGift.addEventListener('click', async () => {
  introGift.disabled = true;
  introGift.classList.add('opening');
  byId('intro').classList.add('gift-zoom');
  await wait(310);
  await crossfade('letterCover', 'coverTitle', true);
});

byId('unroll').addEventListener('click', () => {
  activateScene('letter', 'letterTitle');
  void loadPhoto(1).catch(() => {});
});

function syncFireworks() {
  const mayPlay = !reduced.matches && currentScene.id === 'album';
  fireworksToggle.hidden = !mayPlay;
  fireworksToggle.setAttribute('aria-pressed', String(fireworksEnabled));
  if (mayPlay && fireworksEnabled && !document.hidden) {
    void fireworksVideo.play().catch(() => {});
  } else {
    fireworksVideo.pause();
  }
}

fireworksVideo.muted = true;
fireworksToggle.addEventListener('click', () => {
  fireworksEnabled = !fireworksEnabled;
  syncFireworks();
});
document.addEventListener('visibilitychange', syncFireworks);
reduced.addEventListener('change', syncFireworks);

function prepareAlbum() {
  if (photoCases.length) return;
  const inserts = ['#462e5a', '#384653', '#37315f', '#5d393c', '#2b4843', '#443454', '#694b33', '#3f3551'];
  const fragment = document.createDocumentFragment();
  metadata.photos.forEach(({ description }, number) => {
    const item = document.createElement('button');
    const spine = document.createElement('span');
    const window = document.createElement('span');
    const image = document.createElement('img');
    item.type = 'button';
    item.className = 'photo-case';
    item.tabIndex = -1;
    item.setAttribute('aria-label', description);
    item.style.setProperty('--insert', inserts[number % inserts.length]);
    spine.className = 'case-spine';
    window.className = 'case-window';
    image.alt = '';
    window.append(image);
    item.append(spine, window);
    item.addEventListener('click', () => void selectPhoto(number));
    photoCases.push({ item, image });
    fragment.append(item);
  });
  photoDeck.append(fragment);
}

function fillCase(number) {
  const { image } = photoCases[number];
  if (image.hasAttribute('src')) return Promise.resolve();
  return loadPhoto(number).then((url) => { image.src = url; });
}

function arrangeCases() {
  photoCases.forEach(({ item }, number) => {
    const delta = number - index;
    const distance = Math.abs(delta);
    const active = distance === 0;
    item.setAttribute('aria-current', String(active));
    item.style.setProperty('--x', `calc(var(--case-gap) * ${delta})`);
    item.style.setProperty('--y', active ? '-5px' : `${37 - 17 * delta}px`);
    item.style.setProperty('--yaw', active ? '0deg' : '-45deg');
    item.style.setProperty('--tilt', active ? '0deg' : '-12deg');
    item.style.setProperty('--scale', active ? '1' : String(.85 - distance * .016));
    item.style.setProperty('--layer', String(photoCases.length - distance + (active ? 2 : 0)));
    item.style.setProperty('--visibility', active ? '1' : String(.95 - distance * .05));
  });
  fireworksVideo.style.setProperty('--sky-shift', `${(index - 3.5) * -2.5}px`);
  byId('counter').textContent = `${index + 1} / ${photoCases.length}`;
  previous.disabled = index === 0;
  next.disabled = index === photoCases.length - 1;
  toGift.hidden = !next.disabled;
}

albumStart.addEventListener('click', async () => {
  albumStart.disabled = true;
  try {
    prepareAlbum();
    await fillCase(0);
    index = 0;
    arrangeCases();
    activateScene('album', 'albumTitle');
    const deckIntro = photoDeck.animate([
      { opacity: .45, transform: 'translateY(5%) scale(.97)' },
      { opacity: 1, transform: 'none' }
    ], { duration: reduced.matches ? 0 : 480, easing: 'cubic-bezier(.23, 1, .32, 1)' });
    void deckIntro.finished.then(() => {
      photoCases.forEach((_, number) => { void fillCase(number).catch(() => {}); });
    });
  } catch {
    albumStart.textContent = 'Попробовать открыть фотографии ещё раз';
  } finally {
    albumStart.disabled = false;
  }
});

async function selectPhoto(number) {
  if (turning || currentScene.id !== 'album' || number === index || !photoCases[number]) return;
  turning = true;
  try {
    await fillCase(number);
    index = number;
    arrangeCases();
  } catch {
    byId('counter').textContent = 'Нажми ещё раз';
  } finally {
    turning = false;
  }
}

function turn(direction) {
  return selectPhoto(index + direction);
}

previous.addEventListener('click', () => void turn(-1));
next.addEventListener('click', () => void turn(1));
let touchStart;
photoDeck.addEventListener('touchstart', (event) => {
  const touch = event.changedTouches[0];
  touchStart = [touch.clientX, touch.clientY];
}, { passive: true });
photoDeck.addEventListener('touchend', (event) => {
  if (!touchStart) return;
  const touch = event.changedTouches[0];
  const dx = touch.clientX - touchStart[0];
  const dy = touch.clientY - touchStart[1];
  touchStart = undefined;
  if (Math.abs(dx) > 42 && Math.abs(dx) > Math.abs(dy) * 1.4) void turn(dx < 0 ? 1 : -1);
}, { passive: true });
document.addEventListener('keydown', (event) => {
  if (currentScene.id !== 'album') return;
  if (event.key === 'ArrowLeft') void turn(-1);
  if (event.key === 'ArrowRight') void turn(1);
});

toGift.addEventListener('click', () => {
  activateScene('finale', 'lastTitle');
  void openFinalGift();
});

async function openFinalGift() {
  lastGift.classList.add('opening');
  await wait(670);
  lastGift.hidden = true;
  byId('lastTitle').hidden = true;
  byId('flowers').hidden = false;
  const colors = ['#d68aa7', '#f5d6b1', '#b298cd', '#f8e7ca'];
  const petals = Array.from({ length: 16 }, (_, i) => {
    const petal = document.createElement('i');
    const angle = i / 16 * Math.PI * 2;
    const distance = 100 + i % 4 * 23;
    petal.className = 'petal';
    petal.style.setProperty('--petal', colors[i % colors.length]);
    petal.style.setProperty('--x', `${Math.cos(angle) * distance}px`);
    petal.style.setProperty('--y', `${Math.sin(angle) * distance - 45}px`);
    petal.style.setProperty('--spin', `${i * 41}deg`);
    petal.style.setProperty('--delay', `${i * 25}ms`);
    return petal;
  });
  byId('petals').replaceChildren(...petals);
  await wait(820);
  byId('wish').hidden = false;
  byId('wishTitle').focus({ preventScroll: true });
}

byId('replay').addEventListener('click', async () => {
  runner.classList.remove('ready');
  byId('intro').classList.remove('gift-zoom');
  introGift.classList.remove('opening');
  lastGift.classList.remove('opening');
  lastGift.hidden = false;
  byId('lastTitle').hidden = false;
  byId('flowers').hidden = true;
  byId('wish').hidden = true;
  await crossfade('intro', 'introGift');
  startRunner();
});

void init();
