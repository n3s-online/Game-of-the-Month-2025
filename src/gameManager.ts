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

const games = [
    january,
    february,
    march,
    april,
    may,
    june,
    july,
    makeTextbox('Coming Saturday August 16th'),
    makeTextbox('Coming Saturday September 20th'),
    makeTextbox('Coming Saturday October 18th'),
    makeTextbox('Coming Saturday November 15th'),
    makeTextbox('Coming Saturday December 20th'),
];

const defaultMonthIndex = 6;

let monthIndex: number;
let callback: (() => void) | undefined = undefined;

function updateMonthFromHash() {
    if (location.hash === '') {
        monthIndex = defaultMonthIndex;
        return;
    }

    const hashMonth = new Date(`${location.hash.slice(1)} 1 2025`).getMonth();
    monthIndex = isNaN(hashMonth) || hashMonth < 0 || hashMonth > 11 ? defaultMonthIndex : hashMonth;
}

function getMonthString() {
    return new Date(2025, monthIndex).toLocaleString('en-US', {month: 'long'});
}

export function openPage(runner: () => () => void) {
    if (callback !== undefined) {
        callback();
        callback = undefined;
    }
    clearOverlay();
    context.reset();
    startStatic(() => (callback = runner()));
}

export function loadGame() {
    monthSpan.textContent = getMonthString();

    prevButton.disabled = monthIndex === 0;
    nextButton.disabled = monthIndex === games.length - 1;

    openPage(games[monthIndex]);
}

prevButton.addEventListener('click', () => {
    --monthIndex;
    location.hash = getMonthString();
});

nextButton.addEventListener('click', () => {
    ++monthIndex;
    location.hash = getMonthString();
});

window.addEventListener('hashchange', () => {
    updateMonthFromHash();
    loadGame();
});

updateMonthFromHash();
