import {startStatic} from './static.ts';
import {clearOverlay, context, monthSpan, nextButton, prevButton} from './dom.ts';
import {makeTextbox} from './makeTextbox.ts';
import {january} from './games/january';
import {february} from './games/february';
import {march} from './games/march';
import {april} from './games/april';
import {may} from './games/may';
import {june} from './games/june';
import {july} from './games/july';
import {august} from './games/august';
import {september} from './games/september';
import {october} from './games/october';
import GameWorker from './shared/worker.ts?worker';
import {gameMetadata, homepageMetadata} from './gameMetadata.ts';
import {updateMetaTags} from './seo.ts';

const games = [
    january,
    february,
    march,
    april,
    may,
    june,
    july,
    august,
    september,
    october,
    makeTextbox('Coming Saturday November 29th'),
    makeTextbox('Coming Saturday December 27th'),
];

const defaultMonthIndex = 9;

const worker = new GameWorker();

let monthIndex: number;
let callback: (() => void) | undefined = undefined;

function updateMonthFromPath() {
    const path = location.pathname;

    // Homepage
    if (path === '/' || path === '') {
        monthIndex = defaultMonthIndex;
        updateMetaTags(homepageMetadata);
        return;
    }

    // Find game by path
    const gameIndex = gameMetadata.findIndex(game => game.path === path);

    if (gameIndex !== -1) {
        monthIndex = gameIndex;
        updateMetaTags(gameMetadata[gameIndex]);
    } else {
        // Invalid path, redirect to homepage
        monthIndex = defaultMonthIndex;
        navigateToGame(defaultMonthIndex);
    }
}

function getMonthString() {
    return new Date(2025, monthIndex).toLocaleString('en-US', {month: 'long'});
}

function navigateToGame(index: number) {
    const path = gameMetadata[index]?.path || '/';
    history.pushState(null, '', path);
    updateMetaTags(gameMetadata[index] || homepageMetadata);
}

export function openPage(runner: (worker: Worker) => () => void) {
    if (callback !== undefined) {
        callback();
        callback = undefined;
    }
    clearOverlay();
    context.reset();
    startStatic(() => (callback = runner(worker)));
}

export function loadGame() {
    monthSpan.textContent = getMonthString();

    prevButton.disabled = monthIndex === 0;
    nextButton.disabled = monthIndex === games.length - 1;

    openPage(games[monthIndex]);
}

prevButton.addEventListener('click', () => {
    --monthIndex;
    navigateToGame(monthIndex);
    loadGame();
});

nextButton.addEventListener('click', () => {
    ++monthIndex;
    navigateToGame(monthIndex);
    loadGame();
});

// Handle browser back/forward buttons
window.addEventListener('popstate', () => {
    updateMonthFromPath();
    loadGame();
});

// Backwards compatibility: redirect hash URLs to path URLs
function handleHashRedirect() {
    const hash = location.hash;
    if (hash && hash !== '') {
        // Extract month name from hash (e.g., "#February" -> "February")
        const monthName = hash.slice(1);
        const monthDate = new Date(`${monthName} 1 2025`);
        const monthNum = monthDate.getMonth();

        // If valid month, redirect to path-based URL
        if (!isNaN(monthNum) && monthNum >= 0 && monthNum <= 11) {
            const targetPath = gameMetadata[monthNum]?.path || '/';
            history.replaceState(null, '', targetPath);
            updateMetaTags(gameMetadata[monthNum] || homepageMetadata);
        } else {
            // Invalid hash, clear it
            history.replaceState(null, '', '/');
            updateMetaTags(homepageMetadata);
        }
    }
}

// Check for hash on initial load and redirect if needed
handleHashRedirect();

// Initialize from current path
updateMonthFromPath();
