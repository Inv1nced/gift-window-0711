const byId = (id) => document.getElementById(id);
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
const easeOut = 'cubic-bezier(.23, 1, .32, 1)';
const runner = document.querySelector('.runner');
const introGift = byId('introGift');
const albumStart = byId('albumStart');
const photo = byId('photo');
const print = byId('print');
const photoDeck = byId('photoDeck');
const previous = byId('previous');
const next = byId('next');
const toGift = byId('toGift');
const lastGift = byId('lastGift');
const fade = byId('fade');

let privateKey;
let currentScene = byId('intro');
let metadata;
let index = 0;
let turning = false;
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
    const request = pictureUrl(`photo-${number + 1}`).catch((error) => {
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
    const [letter, face] = await Promise.all([decrypt('letter'), pictureUrl('head')]);
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
  void wait(1450).then(() => { introGift.disabled = false; });
}

introGift.addEventListener('click', async () => {
  introGift.disabled = true;
  introGift.classList.add('opening');
  await wait(240);
  await crossfade('letterCover', 'coverTitle', true);
});

byId('unroll').addEventListener('click', () => {
  activateScene('letter', 'letterTitle');
  void loadPhoto(1).catch(() => {});
});

albumStart.addEventListener('click', async () => {
  albumStart.disabled = true;
  try {
    await renderPhoto(0);
    activateScene('album', 'albumTitle');
    animatePrint(1);
  } catch {
    albumStart.textContent = 'Попробовать открыть фотографии ещё раз';
  } finally {
    albumStart.disabled = false;
  }
});

function animatePrint(direction) {
  if (reduced.matches) return null;
  return print.animate([
    { opacity: .38, transform: `translate(${direction * 17}%, 9%) rotate(${direction * 9}deg) rotateY(${direction * 24}deg)` },
    { opacity: 1, transform: 'none' }
  ], { duration: 570, easing: easeOut });
}

async function renderPhoto(number) {
  const url = await loadPhoto(number);
  const description = metadata.photos[number];
  photo.src = url;
  photo.alt = description;
  byId('caption').textContent = description;
  index = number;
  byId('counter').textContent = `${number + 1} / ${metadata.photos.length}`;
  previous.disabled = number === 0;
  next.disabled = number === metadata.photos.length - 1;
  toGift.hidden = !next.disabled;
  if (!next.disabled) void loadPhoto(number + 1).catch(() => {});
}

async function turn(direction) {
  const number = index + direction;
  if (turning || currentScene.id !== 'album' || number < 0 || number >= metadata.photos.length) return;
  turning = true;
  try {
    await renderPhoto(number);
    const animation = animatePrint(direction);
    if (animation) await animation.finished;
  } catch {
    byId('counter').textContent = 'Нажми ещё раз';
  } finally {
    turning = false;
  }
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
