import './style.css';
import {initSettings} from './settings.ts';
import {loadGame} from './gameManager.ts';
import {makeTextbox} from './makeTextbox.ts';
import click from './assets/click.ogg';
import {settingsMusicVolumeInput, settingsSoundEffectsVolumeInput} from './dom.ts';
import {preload} from './preload.ts';

initSettings();
preload();

if (+settingsSoundEffectsVolumeInput.value === 0 && +settingsMusicVolumeInput.value === 0) {
    loadGame();
} else {
    // Test playing audio to see if the user needs to click first
    const audio = new Audio(click);
    audio.volume = 0;
    audio
        .play()
        .then(loadGame)
        .catch(() => {
            const callback = makeTextbox('Click/tap to start', () => {
                callback();
                loadGame();
            })();
        });
}
