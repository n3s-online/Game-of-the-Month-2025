/*
 * words.txt was created with the following process:
 *     1. Starting with:
 *         - enable1.txt (Public Domain) https://norvig.com/ngrams/enable1.txt
 *         - en_full.txt (MIT) https://raw.githubusercontent.com/hermitdave/FrequencyWords/refs/heads/master/content/2018/en/en_full.txt
 *     2. Remove words that are 3 characters or fewer, or 21 characters or more, as they are not used in this game
 *     3. Sort words in enable1 by their frequency in en_full.txt
 *     4. Append remaining words to the end, sorted alphabetically
 *     5. Remove words that can only be interpreted as slurs
 *     6. Move non-family-friendly words to bottom
 *         - This prevents the computer from typing them unless absolutely necessary
 *     7. Add some real words that weren't in enable1 for some reason
 */
import wordsList from './words.txt';

import arrow from './images/arrow.webp';
import background from './images/background.webp';
import backspace from './images/backspace.webp';
import click from '../../assets/click.ogg';
import hiss from '../../assets/hiss.ogg';
import intro from './music/intro.ogg';
import logo from './images/logo.webp';
import loop from './music/loop.ogg';
import lose from '../../assets/lose.ogg';
import scribble1 from './sounds/scribble1.ogg';
import scribble2 from './sounds/scribble2.ogg';
import scribble3 from './sounds/scribble3.ogg';
import win from '../../assets/win.ogg';
import {UI_BLACK} from '../../shared/style.ts';
import {audioContext, downloadAndDecode, setupSoundEffect} from '../../audio.ts';
import {canvas, context, setOverlay} from '../../dom.ts';
import {choice, setupBufferSource} from '../../util.ts';
import {setupStorage} from '../../shared/storage.ts';

namespace State {
    export interface Menu {
        type: 'menu';
    }

    export interface Play {
        type: 'play';
        mode: 'computer' | 'friend';
        turn: 'player1' | 'player2';
        roundNumber: number;
        currentWord: string;
        player1Letters: string[];
        player2Letters: string[];
        mustUse: Set<string>;
        mustUseHistory: Set<string>;
        backspacesAllowed: number;
        firstTurn: boolean;
        wordHistory: string[];
        lastValidWord?: string;
        computerIntervalId?: number;
        aboutToPress?: string;
        timer?: {
            startTime: number;
            intervalId: number;
            pauseTime?: number;
        };
    }

    export type Any = Menu | Play;
}

export function july() {
    // Sorted by frequency
    const LETTERS = 'etaoinsrhdlucmfywgpbvkxqjz';
    const HARD_LETTERS = 'fywvkxqjz';

    const BUTTON_COLOR = '#eae6d1';
    const DISABLED_COLOR = '#b9a9a9';
    const WARNING_COLOR = '#ef3f3f';
    const SUCCESS_COLOR = '#56962b';
    const COMPUTER_PRESS_COLOR = '#597df3';
    const PAPER_VERTICAL_LINE_COLOR = '#ff1616';
    const PAPER_HORIZONTAL_LINE_COLOR = '#2f49f1';

    const FONT_STYLE = "font-family: 'Gloria Hallelujah', cursive";

    const TURN_TIMER_OPTIONS = [undefined, 10, 30, 60];
    const COMPUTER_DELAY = 500;
    const MIN_WORD_LENGTH = 4;
    const MAX_WORD_LENGTH = 20;

    let done = false;
    let introSource: ReturnType<typeof setupBufferSource> | undefined;
    let loopSource: ReturnType<typeof setupBufferSource> | undefined;
    let introStartTime: number | undefined;

    downloadAndDecode(intro).then(buffer => {
        if (done) return;
        introSource = setupBufferSource(buffer);
        introSource.source.loop = false;
        introSource.gain.gain.setValueAtTime(1, audioContext.currentTime);
        introStartTime = audioContext.currentTime;
    });
    downloadAndDecode(loop).then(buffer => {
        if (done) return;
        loopSource = setupBufferSource(buffer, (introStartTime ?? audioContext.currentTime) + 15.5381);
        loopSource.gain.gain.setValueAtTime(1, audioContext.currentTime);
    });

    const clickAudio = setupSoundEffect(click);
    const loseAudio = setupSoundEffect(lose);
    const winAudio = setupSoundEffect(win);
    const hissAudio = setupSoundEffect(hiss);
    const scribbleAudios = [scribble1, scribble2, scribble3].map(src => setupSoundEffect(src));

    const storage = setupStorage('july');

    let words: string[] | undefined;
    let state: State.Any = {type: 'menu'};
    let turnTimer: number | undefined;

    fetch(wordsList).then(async response => {
        words = (await response.text()).split('\n');
        (document.getElementById('july-play-computer-button') as HTMLButtonElement).disabled = false;
        (document.getElementById('july-play-friend-button') as HTMLButtonElement).disabled = false;
    });

    function playScribble() {
        choice(scribbleAudios).play(Math.random() / 10 + 1);
    }

    function position(top: number) {
        return `${FONT_STYLE}; color: var(--ui-black); position: absolute; top: ${top}px; left: 50%; transform: translateX(-50%)`;
    }

    function button(disabled?: boolean) {
        return `${FONT_STYLE}; background-color: ${disabled ? DISABLED_COLOR : BUTTON_COLOR}; border: 2px solid var(--ui-black); color: var(--ui-black); font-weight: bold;`;
    }

    function clearIntervals() {
        if (state.type === 'play') {
            if (state.computerIntervalId !== undefined) clearInterval(state.computerIntervalId);
            if (state.timer !== undefined) clearInterval(state.timer.intervalId);
        }
    }

    function getTargetWordLength() {
        return Math.floor(((state as State.Play).roundNumber - 1) / 3) + MIN_WORD_LENGTH;
    }

    function getChapterAndPage(roundNumber = (state as State.Play).roundNumber) {
        return {chapter: Math.floor((roundNumber - 1) / 3) + 1, page: ((roundNumber - 1) % 3) + 1};
    }

    function getRemainingTime() {
        if (state.type !== 'play' || state.timer === undefined || turnTimer === undefined) return 0;

        return turnTimer * 1000 - (Date.now() - state.timer.startTime);
    }

    function getValidWords(updateLastValidWord = false) {
        const {currentWord, mustUse, player1Letters, player2Letters, turn, firstTurn} = state as State.Play;

        const validWords = words!.filter(word => {
            return (
                word.length === getTargetWordLength() &&
                word.startsWith(currentWord) &&
                [...mustUse].every(letter => word.includes(letter)) &&
                (firstTurn || (turn === 'player1' ? player1Letters : player2Letters).includes(word[currentWord.length]))
            );
        });

        if (updateLastValidWord && validWords.length > 0) (state as State.Play).lastValidWord = validWords[0];

        return validWords;
    }

    function hasValidWords() {
        return getValidWords(true).length > 0;
    }

    function gameOver(reason: string, win = false) {
        (win ? winAudio : loseAudio).play();

        clearIntervals();

        const {currentWord, lastValidWord, mode, roundNumber, wordHistory} = state as State.Play;
        const {chapter, page} = getChapterAndPage(roundNumber - 1);
        const [chapterString, pageString] = [chapter, page].map(
            n => `<strong style="${FONT_STYLE}">${n === 0 ? '-' : n}</strong>`,
        );

        const score = roundNumber - 1;
        const highScoreKey = `highScore-${mode}-${turnTimer}`;
        let highScore = storage.get(highScoreKey) ?? 0;
        const newHighScore = score > highScore;

        if (newHighScore) {
            storage.set(highScoreKey, score);
            highScore = score;
        }

        setOverlay(`
            <div class="center" style="display: flex; flex-direction: column; gap: 20px">
                <h1 style="${position(20)}; font-size: 48px; color: ${win ? SUCCESS_COLOR : WARNING_COLOR}; width: 100%; text-align: center">${reason}</h1>
                <h3 style="${position(90)}; width: 100%; text-align: center">${win ? '' : `Word: <strong style="${FONT_STYLE}; text-transform: uppercase">${currentWord}</strong> / `}Ch. ${chapterString} P. ${pageString} / Score: <strong style="${FONT_STYLE}">${score}</strong></h3>
                <p style="${position(125)}; width: 100%; text-align: center">${win ? 'You reached the end of the game!' : `You could have played "${lastValidWord!.toUpperCase()}"`}</p>
                <p style="${position(155)}; width: 100%; text-align: center">High score: ${highScore}${newHighScore ? ' <strong>(NEW!)</strong>' : ''}</p>
                <div style="${position(500)}; display: flex; gap: 5px">
                    <button id="july-menu-button" style="${button()}; padding: 20px">MENU</button>
                    <button id="july-new-game-button" style="${button()}; padding: 20px; width: 200px">NEW GAME</button>
                    <button id="july-share-button" style="${button()}; padding: 20px">SHARE</button>
                </div>
                ${getKeyboardsHtml(185, true)}
            </div>
        `);

        document.getElementById('july-menu-button')!.addEventListener('click', () => {
            clickAudio.play();
            mainMenu();
        });
        document.getElementById('july-new-game-button')!.addEventListener('click', () => startGame(mode));
        document.getElementById('july-share-button')!.addEventListener('click', () => {
            clickAudio.play();

            navigator.clipboard
                .writeText(
                    `⌨️ Key Pals\n\n` +
                        (win ? '🏆 Perfect game!\n' : '') +
                        `💯 Score: ${roundNumber - 1}\n` +
                        `2️⃣ Partner: ${mode === 'computer' ? 'Computer 🤖' : 'Human 😀'}\n` +
                        `⏳ Timer: ${turnTimer === undefined ? 'Off' : `${turnTimer}s`}\n` +
                        `📖 Words:\n` +
                        `${wordHistory
                            .map((word, index) => {
                                const {chapter, page} = getChapterAndPage(index + 1);
                                return `- Ch. ${chapter} P. ${page}: ${word.toUpperCase()}`;
                            })
                            .join('\n')}`,
                )
                .then(() => {
                    const shareButton = document.getElementById('july-share-button')!;
                    shareButton.textContent = 'COPIED!';
                    setTimeout(() => (shareButton.textContent = 'SHARE'), 1000);
                });
        });
    }

    function endComputerTurn() {
        if (state.type !== 'play') return;

        state.aboutToPress = undefined;
        clearInterval(state.computerIntervalId);
        state.computerIntervalId = undefined;
    }

    function getComputerChoice(word: string) {
        if (state.type !== 'play') return 'pass';

        if (state.currentWord === word) return 'submit';

        const nextLetter = word[state.currentWord.length];
        if (state.player2Letters.includes(nextLetter)) return nextLetter;

        return 'pass';
    }

    function computerStep(word: string) {
        if (state.type !== 'play') return;

        if (state.aboutToPress !== undefined) {
            switch (state.aboutToPress) {
                case 'submit':
                    endComputerTurn();
                    submitWord();
                    return;
                case 'pass':
                    endComputerTurn();
                    changeTurn();
                    return;
            }

            playScribble();
            state.currentWord += state.aboutToPress;
            state.aboutToPress = undefined;
            updateOverlay();
            return;
        }

        state.aboutToPress = getComputerChoice(word);
        updateOverlay();
    }

    function takeComputerTurn() {
        if (state.type !== 'play') return;
        const {currentWord, player2Letters, mustUse, firstTurn} = state;

        const word = words!.filter(
            word =>
                word.length === getTargetWordLength() &&
                word.startsWith(currentWord) &&
                (firstTurn || player2Letters.includes(word[currentWord.length])) &&
                [...mustUse].every(letter => word.includes(letter)),
        )[0];

        state.computerIntervalId = setInterval(() => computerStep(word), COMPUTER_DELAY);
    }

    function changeTurn() {
        if (state.type !== 'play') return;

        clickAudio.play();

        state.turn = state.turn === 'player1' ? 'player2' : 'player1';
        state.backspacesAllowed = 0;
        state.firstTurn = false;

        if (!hasValidWords()) {
            gameOver('No valid words remain!');
            return;
        }

        if (state.timer !== undefined) state.timer.startTime = Date.now();

        if (state.mode === 'computer' && state.turn === 'player2') takeComputerTurn();

        updateOverlay();
    }

    function getKeyboardsHtml(top: number, disabled = false) {
        const {turn, currentWord, player2Letters, player1Letters, mustUse, backspacesAllowed, mode, aboutToPress} =
            state as State.Play;

        return `
            <div style="${position(top)}; display: flex; gap: 25px" id="july-letter-buttons">
                ${[
                    {key: 'player1', letters: player1Letters},
                    {key: 'player2', letters: player2Letters},
                ]
                    .map(({key, letters}) => {
                        const allDisabled = disabled || turn !== key || (mode === 'computer' && turn === 'player2');
                        const backspaceDisabled = allDisabled || backspacesAllowed === 0;
                        const currentTurn = turn === key && !disabled;
                        return `
                            <div style="display: flex; flex-direction: column; align-items: center; gap: 5px">
                                <span style="${FONT_STYLE}; ${currentTurn ? 'font-weight: bold' : ''}">${currentTurn ? '>>> ' : ''}${key === 'player1' ? (mode === 'friend' ? 'Player 1' : 'You') : mode === 'friend' ? 'Player 2' : 'Computer'}${currentTurn ? ' <<<' : ''}</span>
                                <div style="display: flex; gap: 5px; flex-wrap: wrap; width: 270px; justify-content: center">
                                    ${letters
                                        .map(letter => {
                                            const disabled = allDisabled || currentWord.length >= getTargetWordLength();
                                            return `<button style="${button(disabled)}; width: 60px; height: 60px; font-size: 24px; ${letter === aboutToPress ? `background-color: ${COMPUTER_PRESS_COLOR}` : mustUse.has(letter) ? (currentWord.includes(letter) ? `color: ${SUCCESS_COLOR}; border-color: ${SUCCESS_COLOR}` : `color: ${WARNING_COLOR}; border-color: ${WARNING_COLOR}`) : ''}" ${disabled ? 'disabled' : ''}>${letter}</button>`;
                                        })
                                        .join('')}
                                    <button style="${button(backspaceDisabled)}; width: 60px; height: 60px; display: flex; justify-content: center; align-items: center" ${backspaceDisabled ? 'disabled' : ''}>
                                        <img width="30" src="${backspace}" />
                                    </button>
                                </div>
                            </div>
                        `;
                    })
                    .join('')}
            </div>
        `;
    }

    function submitWord() {
        if (state.type !== 'play') return;

        if (state.timer !== undefined) state.timer.pauseTime = Date.now();

        if (
            state.currentWord.length === getTargetWordLength() &&
            words!.includes(state.currentWord) &&
            [...state.mustUse].every(letter => (state as State.Play).currentWord.includes(letter))
        ) {
            winAudio.play();
            state.wordHistory.push(state.currentWord);
            const {chapter, page} = getChapterAndPage();
            setOverlay(`
                <div class="center" style="display: flex; flex-direction: column; gap: 10px">
                    <h1 style="${position(73)}; font-weight: bold; font-size: 32px; color: ${SUCCESS_COLOR}; width: 100%; text-align: center">Chapter ${chapter}, Page ${page} Complete!</h1>
                    <h3 style="${position(120)}; width: 100%; text-align: center">Word: <strong style="${FONT_STYLE}; text-transform: uppercase">${state.currentWord}</strong></h3>
                    ${getKeyboardsHtml(185, true)}
                    <button id="july-next-round-button" style="${position(500)}; ${button()}; padding: 20px">NEXT ROUND</button>
                </div>
            `);
            document.getElementById('july-next-round-button')!.addEventListener('click', nextRound);
            return;
        }

        gameOver('Invalid word!');
    }

    function updateOverlay() {
        const {turn, currentWord, backspacesAllowed, firstTurn, mode, aboutToPress, mustUse} = state as State.Play;

        const passDisabled =
            (!firstTurn && backspacesAllowed === 0) ||
            currentWord.length === getTargetWordLength() ||
            (mode === 'computer' && turn === 'player2');
        const submitDisabled =
            currentWord.length !== getTargetWordLength() ||
            ![...mustUse].every(letter => currentWord.includes(letter)) ||
            (mode === 'computer' && turn === 'player2');
        const {chapter, page} = getChapterAndPage();

        setOverlay(`
            <button id="july-menu-button" style="${button()}; position: absolute; top: 5px; left: 5px" ${mode === 'computer' && turn === 'player2' ? 'disabled' : ''}>MENU</button>
            ${turnTimer !== undefined ? `<div id="july-turn-timer" style="${button()}; position: absolute; top: 5px; right: 5px; font-weight: bold; width: 50px; text-align: center">${Math.ceil(getRemainingTime() / 1000)}s</div>` : ''}
            <h1 style="font-weight: bold; font-size: 32px; text-decoration: underline; ${position(40)}">Chapter ${chapter}, Page ${page}</h1>
            <div style="text-align: center; width: 100%; ${position(95)}">Make a ${getTargetWordLength()} letter word containing ${[...mustUse].map(letter => `<strong style="${FONT_STYLE}">${letter.toUpperCase()}</strong>`).join(' and ')}${mode === 'friend' ? `. <u style="${FONT_STYLE}">No communication!</u>` : ''}</div>
            <h2 style="${position(114)}; width: 100%; text-align: center">Word: <span style="text-transform: uppercase; display: inline-flex">${[...currentWord.padEnd(getTargetWordLength(), '_')].map(letter => `<strong style="${FONT_STYLE}; width: 25px; text-align: center">${letter}</strong>`).join('')}</span></h2>
            ${getKeyboardsHtml(185)}
            <div style="display: flex; gap: 5px; ${position(500)}">
                <button id="july-pass-button" style="${button(passDisabled)}; width: 300px; padding: 20px; ${aboutToPress === 'pass' ? `background-color: ${COMPUTER_PRESS_COLOR}` : ''}" ${passDisabled ? 'disabled' : ''}>${turn === 'player2' ? `<img src="${arrow}" width="12"> ` : ''}PASS TO ${turn === 'player1' ? (mode === 'computer' ? 'COMPUTER' : 'PLAYER 2') : mode === 'computer' ? 'PLAYER' : 'PLAYER 1'}${turn === 'player1' ? ` <img src="${arrow}" width="12" style="transform: scaleX(-1)">` : ''}</button>
                <button id="july-submit-button" style="${button(submitDisabled)}; width: 200px; padding: 20px; ${aboutToPress === 'submit' ? `background-color: ${COMPUTER_PRESS_COLOR}` : ''}" ${submitDisabled ? 'disabled' : ''}>SUBMIT "${currentWord}"</button>
            </div>
            ${submitDisabled && currentWord.length === getTargetWordLength() && !(mode === 'computer' && turn === 'player2') ? `<div style="${position(565)}; font-weight: bold; color: ${WARNING_COLOR}">Required letters not used!</div>` : ''}
        `);

        function submitLetter(letter: string) {
            if (state.type !== 'play') return;

            playScribble();

            if (letter.trim() === '') {
                if (backspacesAllowed === 0) return;
                --state.backspacesAllowed;
                state.currentWord = currentWord.slice(0, -1);
                updateOverlay();
                return;
            }

            ++state.backspacesAllowed;
            state.currentWord += letter.toLowerCase();

            getValidWords();
            updateOverlay();
        }

        document
            .querySelectorAll('#july-letter-buttons button')
            .forEach(button => button.addEventListener('click', () => submitLetter(button.textContent!)));

        document.getElementById('july-menu-button')!.addEventListener('click', () => {
            if (state.type !== 'play') return;

            clickAudio.play();

            if (state.timer !== undefined) state.timer.pauseTime = Date.now();

            setOverlay(`
                <div class="center" style="display: flex; flex-direction: column; gap: 10px; text-align: center">
                    <h3 style="${position(210)}; width: 100%">Are you sure you want to return to the menu?</h3>
                    <span style="${position(245)}; width: 100%">Your current game will be lost.</span>
                    <div style="display: flex; gap: 5px">
                        <button id="july-cancel-button" style="${button()}">CANCEL</button>
                        <button id="july-menu-button" style="${button()}">MENU</button>
                    </div>
                </div>
            `);

            document.getElementById('july-cancel-button')!.addEventListener('click', () => {
                if (state.type !== 'play') return;

                clickAudio.play();

                if (state.timer !== undefined) {
                    state.timer.startTime += Date.now() - state.timer.pauseTime!;
                    state.timer.pauseTime = undefined;
                }

                updateOverlay();
            });
            document.getElementById('july-menu-button')!.addEventListener('click', () => {
                clickAudio.play();
                mainMenu();
            });
        });
        document.getElementById('july-pass-button')!.addEventListener('click', changeTurn);
        document.getElementById('july-submit-button')!.addEventListener('click', submitWord);
    }

    function nextRound() {
        if (state.type !== 'play') return;

        clickAudio.play();

        state.currentWord = '';
        ++state.roundNumber;
        state.turn = state.roundNumber % 2 === 1 ? 'player1' : 'player2';
        state.backspacesAllowed = 0;
        state.firstTurn = true;

        if (state.roundNumber % 3 === 1) {
            state.mustUseHistory.clear();

            if (getTargetWordLength() > MAX_WORD_LENGTH) {
                gameOver('Perfect game!', true);
                return;
            }

            setOverlay(`
                <div class="center" style="display: flex; flex-direction: column; gap: 20px; text-align: center">
                    <h1 style="${position(150)}; font-size: 64px; font-weight: bold; width: 100%">Chapter ${getChapterAndPage().chapter}</h1>
                    <h2 style="${position(248)}; font-size: 36px; width: 100%">${getTargetWordLength()} letter words</h2>
                    <button id="july-continue-button" style="${position(325)}; ${button()}; padding: 20px; width: 200px">Continue</button>
                </div>
            `);

            document.getElementById('july-continue-button')!.addEventListener('click', () => {
                clickAudio.play();
                setupRound();
            });

            return;
        }

        setupRound();
    }

    function setupRound() {
        if (state.type !== 'play') return;

        if (state.timer !== undefined) {
            state.timer.startTime = Date.now();
            state.timer.pauseTime = undefined;
        }

        const index = (state.roundNumber - 1) % 3;
        const letters = LETTERS.slice([0, 6, 12][index], [14, 20, 26][index]);
        const player1Letters = [...state.player1Letters].filter(letter => letters.includes(letter));
        const player2Letters = [...state.player2Letters].filter(letter => letters.includes(letter));

        do {
            const player1Letter = choice(player1Letters);
            const player2Letter = choice(player2Letters);
            const mustUseKey = `${player1Letter}${player2Letter}`;
            const mustUseLetters = [player1Letter, player2Letter];

            if (
                state.mustUseHistory.has(mustUseKey) ||
                mustUseLetters.filter(letter => HARD_LETTERS.includes(letter)).length === 2
            ) {
                continue;
            }

            state.mustUse = new Set(mustUseLetters);
            if (hasValidWords()) {
                state.mustUseHistory.add(mustUseKey);
                break;
            }
        } while (true);

        updateOverlay();

        if (state.mode === 'computer' && state.turn === 'player2') takeComputerTurn();
    }

    function startGame(mode: State.Play['mode']) {
        clickAudio.play();

        state = {
            type: 'play',
            mode,
            turn: 'player1',
            roundNumber: 0,
            currentWord: '',
            player1Letters: [],
            player2Letters: [],
            mustUse: new Set(),
            mustUseHistory: new Set<string>(),
            backspacesAllowed: 0,
            firstTurn: true,
            wordHistory: [],
            ...(turnTimer === undefined
                ? {}
                : {
                      timer: {
                          startTime: Date.now(),
                          intervalId: setInterval(() => {
                              if (
                                  state.type !== 'play' ||
                                  state.timer === undefined ||
                                  state.timer.pauseTime !== undefined
                              ) {
                                  return;
                              }

                              const timerElement = document.getElementById('july-turn-timer');
                              if (timerElement === null) return;

                              const remainingMs = getRemainingTime();
                              if (remainingMs !== null && remainingMs <= 0) {
                                  gameOver('Timer expired');
                                  return;
                              }

                              const seconds = Math.ceil(remainingMs / 1000);
                              if (seconds <= 5) hissAudio.play();

                              timerElement.style.color = seconds <= 5 ? WARNING_COLOR : UI_BLACK;
                              timerElement.textContent = `${seconds}s`;
                          }, 1000),
                      },
                  }),
        };

        const letters = new Set(LETTERS);
        for (let i = 0; i < 13; ++i) {
            const letter = choice([...letters]);
            state.player1Letters.push(letter);
            letters.delete(letter);
        }
        state.player1Letters.sort();
        for (let i = 0; i < 13; ++i) {
            const letter = choice([...letters]);
            state.player2Letters.push(letter);
            letters.delete(letter);
        }
        state.player2Letters.sort();

        nextRound();
    }

    function howToPlay() {
        clickAudio.play();

        setOverlay(`
            <div style="text-align: center">
                <h1 style="${position(14)}; width: 100%">How to Play Key Pals</h1>
                <ol style="${position(67)}; line-height: 30px; text-align: left; width: 500px; margin-left: 20px">
                    <li style="${FONT_STYLE}">Two players are each assigned half of the alphabet and <strong style="${FONT_STYLE}">are not allowed to communicate</strong> during the game</li>
                    <li style="${FONT_STYLE}">Each round, the goal is to write a word of the requested length that also uses the two required letters at least once</li>
                    <li style="${FONT_STYLE}">On each player's turn, they can add any number of letters to the word</li>
                    <li style="${FONT_STYLE}">Players can pass the turn to the other player at any time as long as they have entered at least one letter, or it is the first turn of the round</li>
                    <li style="${FONT_STYLE}">Players can only backspace letters they've played the same turn</li>
                    <li style="${FONT_STYLE}">Submit a valid word to advance to the next round</li>
                    <li style="${FONT_STYLE}">If an invalid word is submitted, or no valid words remain after passing the turn, the game ends</li>
                </ol>
                <button id="july-back-button" style="${position(525)}; ${button()}; padding: 20px">BACK</button>
            </div>
        `);

        document.getElementById('july-back-button')!.addEventListener('click', () => {
            clickAudio.play();
            mainMenu();
        });
    }

    function mainMenu() {
        clearIntervals();

        state = {type: 'menu'};

        setOverlay(`
            <div class="center" style="display: flex; flex-direction: column; gap: 20px">
                <img src="${logo}" alt="Key Pals" width="455" />
                <button id="july-how-to-play-button" style="${button()}; padding: 20px">ℹ️ HOW TO PLAY</button>
                <div style="display: flex; flex-direction: column; align-items: center">
                    <span style="${FONT_STYLE}; color: var(--ui-black)">Turn Timer</span>
                    <div style="display: flex; gap: 5px" id="july-turn-timer-buttons">
                        ${TURN_TIMER_OPTIONS.map(option => {
                            const label = option === undefined ? 'OFF' : `${option}s`;
                            return `<button style="${button(option === turnTimer)}; padding: 10px; text-transform: none">${label}</button>`;
                        }).join('')}
                    </div>
                </div>
                <div style="display: flex; gap: 5px">
                    <div style="display: flex; flex-direction: column; align-items: center">
                        <button ${words === undefined ? 'disabled' : ''} id="july-play-computer-button" style="${button()}; padding: 20px">🤖 PLAY WITH COMPUTER</button>
                        <span style="${FONT_STYLE}; color: var(--ui-black)">High score: ${storage.get(`highScore-computer-${turnTimer}`) ?? '-'}</span>
                    </div>
                    <div style="display: flex; flex-direction: column; align-items: center">
                        <button ${words === undefined ? 'disabled' : ''} id="july-play-friend-button" style="${button()}; padding: 20px">😀 PLAY WITH FRIEND</button>
                        <span style="${FONT_STYLE}; color: var(--ui-black)">High score: ${storage.get(`highScore-friend-${turnTimer}`) ?? '-'}</span>
                    </div>
                </div>
                <button id="july-music-credits-button" class="link" style="${FONT_STYLE}; color: var(--ui-black); margin-top: 15px">Key Pals Music Credits</button>
            </div>
        `);

        document.getElementById('july-how-to-play-button')!.addEventListener('click', howToPlay);
        document.getElementById('july-play-computer-button')!.addEventListener('click', () => startGame('computer'));
        document.getElementById('july-play-friend-button')!.addEventListener('click', () => startGame('friend'));
        document.getElementById('july-music-credits-button')!.addEventListener('click', () => {
            clickAudio.play();
            setOverlay(`
                <h1 style="${position(105)}; width: 100%; text-align: center">Key Pals Music Credits</h1>
                <span style="${position(185)}"><a href="https://instagram.com/arieschtruth" target="_blank" style="${FONT_STYLE}; color: var(--ui-black)">Ari Eschtruth</a> - Composer, Producer</span>
                <span style="${position(245)}"><a href="https://instagram.com/mikeweedrums" target="_blank" style="${FONT_STYLE}; color: var(--ui-black)">Mike Wee</a> - Drums, Drum Engineering</span>
                <span style="${position(305)}"><a href="https://instagram.com/dearhoney.art" target="_blank" style="${FONT_STYLE}; color: var(--ui-black)">Heaven Parkinson</a> - Flute, Handclaps</span>
                <button id="july-back-button" style="${button()}; ${position(365)}">BACK</button>
            `);

            (document.getElementById('july-back-button') as HTMLButtonElement).addEventListener('click', () => {
                clickAudio.play();
                mainMenu();
            });
        });

        const buttons = document.querySelectorAll('#july-turn-timer-buttons button') as NodeListOf<HTMLButtonElement>;
        buttons.forEach((element, index) =>
            element.addEventListener('click', () => {
                clickAudio.play();

                turnTimer = TURN_TIMER_OPTIONS[index];

                buttons.forEach((otherElement, otherIndex) => {
                    otherElement.style.backgroundColor = index === otherIndex ? DISABLED_COLOR : BUTTON_COLOR;
                });

                document.querySelector('#july-play-computer-button + span')!.textContent =
                    `High score: ${storage.get(`highScore-computer-${turnTimer}`) ?? '-'}`;
                document.querySelector('#july-play-friend-button + span')!.textContent =
                    `High score: ${storage.get(`highScore-friend-${turnTimer}`) ?? '-'}`;
            }),
        );
    }

    function onBlur() {
        if (done) return;
        audioContext.suspend();
    }

    function onFocus() {
        if (done) return;
        audioContext.resume();
    }

    window.addEventListener('blur', onBlur);
    window.addEventListener('focus', onFocus);

    mainMenu();

    const backgroundImage = new Image();
    backgroundImage.src = background;
    backgroundImage.onload = () => {
        context.drawImage(backgroundImage, 0, 0, canvas.width, canvas.height);
        context.strokeStyle = PAPER_VERTICAL_LINE_COLOR;
        context.beginPath();
        context.moveTo(50, 0);
        context.lineTo(50, canvas.height);
        context.stroke();

        context.strokeStyle = PAPER_HORIZONTAL_LINE_COLOR;
        for (let y = 0; y < canvas.height; y += 30) {
            context.beginPath();
            context.moveTo(0, y);
            context.lineTo(canvas.width, y);
            context.stroke();
        }
    };

    return () => {
        done = true;
        introSource?.source.stop();
        loopSource?.source.stop();
        window.removeEventListener('blur', onBlur);
        window.removeEventListener('focus', onFocus);
        clearIntervals();
    };
}
