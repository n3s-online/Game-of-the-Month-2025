import click from '../../assets/click.ogg';
import logo from './logo.webp';
import music from './music.ogg';
import win from '../../assets/win.ogg';
import {FONT, UI_BLACK, UI_WHITE} from '../../shared/style.ts';
import {Graph, makeGraph} from './graph.ts';
import {canvas, context, overlay, setOverlay} from '../../dom.ts';
import {clamp, distance, interpolateColor, isPointOnLine, linesIntersect} from '../../util.ts';
import {setupMusic, setupSoundEffect} from '../../audio.ts';
import {setupStorage} from '../../shared/storage.ts';
import {bigIntToString, booleanToBitArray, numberToBitArray, stringToBigInt} from '../../shared/serialization.ts';

const TOWER_TYPES = ['start', 'end', 'small repeater', 'large repeater', 'spy', 'encryptor', 'decryptor'] as const;

namespace PingState {
    interface Ping {
        from: number;
        to: number;
        unencrypted: boolean;
        encrypted: boolean;
        distance: number;
    }

    export interface Standby {
        type: 'standby';
    }

    export interface Waiting {
        type: 'waiting';
        timeoutId: number;
    }

    export interface Pinging {
        type: 'pinging';
        pings: Ping[];
        endsHit: Set<number>;
        visitedUnencrypted: Set<number>;
        visitedEncrypted: Set<number>;
    }

    export interface Pulsing {
        type: 'pulsing';
        endPulses: Map<number, number>; // tower index to time remaining
    }

    export type Any = Standby | Waiting | Pinging | Pulsing;
}

namespace Tooltip {
    export interface None {
        type: 'none';
    }

    export interface Tower {
        type: 'tower';
        index: number;
    }

    export interface Connection {
        type: 'connection';
        from: number;
        to: number;
        encrypted: boolean;
    }

    export type Any = None | Tower | Connection;
}

namespace EditorState {
    export interface None {
        type: 'none';
    }

    export interface Editing {
        type: 'editing';
    }

    export interface Menu {
        type: 'menu';
    }

    export interface Testing {
        type: 'testing';
        level: Level;
    }

    export type Any = None | Editing | Menu | Testing;
}

interface Tower {
    type: (typeof TOWER_TYPES)[number];
    x: number;
    y: number;
}

interface Wall {
    x1: number;
    y1: number;
    x2: number;
    y2: number;
    fixed1: boolean;
    fixed2: boolean;
}

interface Text {
    content: string;
    x: number;
    y: number;
}

interface Level {
    towers: Tower[];
    walls: Wall[];
    texts: Text[];
}

export function february() {
    type ConnectionStatus = {unencrypted: boolean; encrypted: boolean};

    const BACKGROUND_COLOR = '#0e1c0c';
    const CONNECTION_COLOR = '#ffb500';
    const DECRYPTOR_COLOR = '#ff0073';
    const ENCRYPTOR_COLOR = '#eb00ff';
    const END_COLOR = '#ff8538';
    const REPEATER_COLOR = '#9f9fff';
    const REPEATER_PREVIEW_COLOR = '#9f9fff55';
    const SPY_COLOR = '#ff6363';
    const START_COLOR = '#00ff00';
    const WALL_COLOR = '#d5c2c2';

    const CONNECTION_LINE_WIDTH = 5;
    const DRAG_EXTRA_RADIUS = 25;
    const END_PULSE_DURATION = 1;
    const FONT_HEIGHT_OFFSET = 35;
    const LARGE_REPEATER_CONNECTION_RADIUS = 200;
    const LARGE_REPEATER_RADIUS = 25;
    const LINE_DASH_ENCRYPTED = [5, 10];
    const LINE_DASH_SPY = [1, 20];
    const MAX_TOWERS = 250;
    const MAX_WALLS = 50;
    const PING_SPEED_MULTIPLIER = 0.2;
    const RECTANGLE_SIZE = 10;
    const REPEATER_PREVIEW_WIDTH = 1;
    const SMALL_REPEATER_CONNECTION_RADIUS = 100;
    const SMALL_REPEATER_RADIUS = 15;
    const TOOL_TIP_HEIGHT = 30;
    const TRIANGLE_SIZE = 12;
    const WALL_HANDLE_RADIUS = 15;
    const WALL_LINE_WIDTH = 3;

    const BLANK_LEVEL = <Level>{towers: [], walls: [], texts: []};
    const EDITOR_TEMPLATE_LEVEL = <Level>{
        ...BLANK_LEVEL,
        towers: [
            {type: 'start', x: 200, y: 150},
            {type: 'end', x: 400, y: 450},
        ],
    };
    const EDITOR_LIBRARY_TOWERS: Tower[] = [
        {type: 'large repeater', x: 210, y: 235},
        {type: 'small repeater', x: 260, y: 235},
        {type: 'spy', x: 295, y: 235},
        {type: 'encryptor', x: 330, y: 235},
        {type: 'decryptor', x: 365, y: 235},
        {type: 'end', x: 400, y: 235},
    ];
    const EDITOR_LIBRARY_WALLS = [
        {x1: 200, y1: 285, x2: 240, y2: 285, fixed1: true, fixed2: true},
        {x1: 280, y1: 285, x2: 320, y2: 285, fixed1: false, fixed2: true},
        {x1: 360, y1: 285, x2: 400, y2: 285, fixed1: false, fixed2: false},
    ];
    const EDITOR_LIBRARY_DRAGGABLES = setupLibraryDraggables();
    const LEVELS: Level[] = fillLevels([
        // 1
        {
            towers: [
                {type: 'small repeater', x: 250, y: 325},
                {type: 'large repeater', x: 300, y: 325},
                {type: 'start', x: 500, y: 100},
                {type: 'end', x: 500, y: 500},
            ],
            texts: [
                {content: 'Repeaters →', x: 150, y: 325},
                {content: 'Start →', x: 425, y: 100},
                {content: 'End →', x: 430, y: 500},
                {content: 'Drag repeaters to establish', x: 200, y: 225},
                {content: 'an unencrypted connection', x: 200, y: 250},
                {content: 'between the start and end', x: 200, y: 275},
            ],
        },
        // 2
        {
            towers: [
                {type: 'start', x: 100, y: 500},
                {type: 'end', x: 500, y: 100},
                {type: 'small repeater', x: 265, y: 467.5},
                {type: 'small repeater', x: 335, y: 467.5},
                {type: 'large repeater', x: 300, y: 440},
                {type: 'large repeater', x: 300, y: 495},
                {type: 'large repeater', x: 300, y: 550},
            ],
            walls: [
                {x1: 200, y1: 175, x2: 200, y2: 600, fixed1: true, fixed2: true},
                {x1: 400, y1: 0, x2: 400, y2: 425, fixed1: true, fixed2: true},
            ],
            texts: [],
        },
        // 3
        {
            towers: [
                {type: 'small repeater', x: 500, y: 115},
                {type: 'large repeater', x: 460, y: 50},
                {type: 'large repeater', x: 540, y: 50},
                {type: 'start', x: 75, y: 75},
                {type: 'end', x: 500, y: 500},
                {type: 'spy', x: 300, y: 300},
            ],
            texts: [
                {content: 'Spy →', x: 240, y: 300},
                {content: 'Unencrypted connections', x: 200, y: 475},
                {content: 'cannot be established', x: 200, y: 500},
                {content: 'near spies', x: 200, y: 525},
            ],
        },
        // 4
        {
            towers: [
                {type: 'small repeater', x: 500, y: 50},
                {type: 'small repeater', x: 550, y: 100},
                {type: 'large repeater', x: 500, y: 100},
                {type: 'large repeater', x: 550, y: 50},
                {type: 'start', x: 300, y: 75},
                {type: 'end', x: 300, y: 525},
                {type: 'spy', x: 25, y: 361},
                {type: 'spy', x: 179, y: 293},
                {type: 'spy', x: 238, y: 211},
                {type: 'spy', x: 417, y: 353},
                {type: 'spy', x: 377, y: 413},
                {type: 'spy', x: 572, y: 305},
            ],
        },
        // 5
        {
            towers: [
                {type: 'small repeater', x: 400, y: 250},
                {type: 'small repeater', x: 450, y: 175},
                {type: 'small repeater', x: 450, y: 325},
                {type: 'large repeater', x: 225, y: 250},
                {type: 'start', x: 50, y: 250},
                {type: 'end', x: 550, y: 75},
                {type: 'end', x: 550, y: 425},
            ],
            texts: [
                {content: 'Unencrypted connections', x: 300, y: 475},
                {content: 'must be established to', x: 300, y: 500},
                {content: 'all end towers', x: 300, y: 525},
            ],
        },
        // 6
        {
            towers: [
                {type: 'small repeater', x: 485, y: 95},
                {type: 'small repeater', x: 513, y: 115},
                {type: 'small repeater', x: 547, y: 115},
                {type: 'small repeater', x: 575, y: 95},
                {type: 'large repeater', x: 560, y: 45},
                {type: 'large repeater', x: 500, y: 45},
                {type: 'start', x: 300, y: 300},
                {type: 'end', x: 300, y: 100},
                {type: 'end', x: 300, y: 500},
                {type: 'spy', x: 350, y: 200},
                {type: 'spy', x: 250, y: 400},
                {type: 'spy', x: 400, y: 345},
                {type: 'spy', x: 125, y: 300},
                {type: 'spy', x: 100, y: 450},
            ],
            texts: [
                {content: 'End towers also', x: 150, y: 525},
                {content: 'act as repeaters', x: 150, y: 550},
            ],
        },
        // 7
        {
            towers: [
                {type: 'large repeater', x: 300, y: 225},
                {type: 'start', x: 125, y: 300},
                {type: 'end', x: 475, y: 300},
                {type: 'spy', x: 300, y: 375},
            ],
            walls: [{x1: 300, y1: 50, x2: 300, y2: 100, fixed1: false, fixed2: false}],
            texts: [
                {content: '← Wall', x: 370, y: 75},
                {content: 'Drag wall handles', x: 300, y: 475},
                {content: 'to block connections', x: 300, y: 500},
            ],
        },
        // 8
        {
            towers: [
                {type: 'large repeater', x: 500, y: 115},
                {type: 'large repeater', x: 460, y: 50},
                {type: 'large repeater', x: 540, y: 50},
                {type: 'start', x: 75, y: 75},
                {type: 'end', x: 525, y: 525},
                {type: 'spy', x: 150, y: 150},
                {type: 'spy', x: 350, y: 250},
                {type: 'spy', x: 300, y: 500},
                {type: 'spy', x: 500, y: 400},
                {type: 'spy', x: 150, y: 350},
                {type: 'spy', x: 300, y: 50},
                {type: 'spy', x: 100, y: 500},
            ],
            walls: [
                {x1: 400, y1: 40, x2: 400, y2: 125, fixed1: false, fixed2: false},
                {x1: 450, y1: 175, x2: 550, y2: 175, fixed1: false, fixed2: false},
            ],
        },
        // 9
        {
            towers: [
                {type: 'small repeater', x: 50, y: 500},
                {type: 'small repeater', x: 100, y: 500},
                {type: 'small repeater', x: 100, y: 550},
                {type: 'large repeater', x: 50, y: 550},
                {type: 'start', x: 100, y: 300},
                {type: 'end', x: 500, y: 100},
                {type: 'end', x: 500, y: 200},
                {type: 'end', x: 500, y: 300},
                {type: 'end', x: 500, y: 400},
                {type: 'end', x: 500, y: 500},
                {type: 'spy', x: 398, y: 456},
                {type: 'spy', x: 347, y: 124},
                {type: 'spy', x: 185, y: 245},
                {type: 'spy', x: 186, y: 435},
            ],
            walls: [
                {
                    x1: 100,
                    y1: 450,
                    x2: 150,
                    y2: 500,
                    fixed1: false,
                    fixed2: false,
                },
            ],
            texts: [],
        },
        // 10
        {
            towers: [
                {type: 'small repeater', x: 300, y: 75},
                {type: 'large repeater', x: 250, y: 525},
                {type: 'large repeater', x: 350, y: 525},
                {type: 'start', x: 75, y: 300},
                {type: 'end', x: 525, y: 300},
                {type: 'spy', x: 175, y: 300},
                {type: 'spy', x: 250, y: 300},
                {type: 'spy', x: 325, y: 300},
                {type: 'spy', x: 575, y: 400},
            ],
            walls: [
                {x1: 0, y1: 175, x2: 600, y2: 175, fixed1: true, fixed2: true},
                {x1: 0, y1: 425, x2: 600, y2: 425, fixed1: true, fixed2: true},
                {x1: 175, y1: 175, x2: 175, y2: 237.5, fixed1: true, fixed2: false},
                {x1: 325, y1: 175, x2: 325, y2: 237.5, fixed1: true, fixed2: false},
            ],
        },
        // 11
        {
            towers: [
                {type: 'small repeater', x: 275, y: 100},
                {type: 'small repeater', x: 325, y: 50},
                {type: 'large repeater', x: 275, y: 50},
                {type: 'large repeater', x: 325, y: 100},
                {type: 'start', x: 200, y: 300},
                {type: 'end', x: 398, y: 295},
                {type: 'spy', x: 278, y: 234},
                {type: 'spy', x: 200, y: 188},
                {type: 'spy', x: 339, y: 212},
                {type: 'spy', x: 274, y: 372},
                {type: 'spy', x: 559, y: 25},
                {type: 'spy', x: 156, y: 458},
                {type: 'spy', x: 530, y: 458},
                {type: 'spy', x: 75, y: 325},
                {type: 'spy', x: 494, y: 408},
                {type: 'spy', x: 500, y: 173},
                {type: 'spy', x: 37, y: 195},
                {type: 'spy', x: 350, y: 509},
                {type: 'spy', x: 39, y: 572},
            ],
            walls: [
                {x1: 300, y1: 300, x2: 275, y2: 275, fixed1: true, fixed2: false},
                {x1: 325, y1: 275, x2: 300, y2: 300, fixed1: false, fixed2: true},
                {x1: 275, y1: 325, x2: 300, y2: 300, fixed1: false, fixed2: true},
                {x1: 325, y1: 325, x2: 300, y2: 300, fixed1: false, fixed2: true},
            ],
        },
        // 12
        {
            towers: [
                {type: 'small repeater', x: 75, y: 250},
                {type: 'small repeater', x: 75, y: 300},
                {type: 'small repeater', x: 75, y: 350},
                {type: 'start', x: 300, y: 75},
                {type: 'end', x: 450, y: 525},
                {type: 'encryptor', x: 325, y: 150},
                {type: 'decryptor', x: 425, y: 450},
                {type: 'spy', x: 300, y: 300},
                {type: 'spy', x: 450, y: 300},
            ],
            texts: [
                {content: '← Encrypt', x: 415, y: 150},
                {content: '← Decrypt', x: 515, y: 450},
                {content: 'Encrypted connections', x: 200, y: 475},
                {content: '(dashed lines) can be', x: 200, y: 500},
                {content: 'established near spies', x: 200, y: 525},
            ],
        },
        // 13
        {
            towers: [
                {type: 'small repeater', x: 250, y: 50},
                {type: 'small repeater', x: 300, y: 50},
                {type: 'small repeater', x: 350, y: 50},
                {type: 'start', x: 225, y: 300},
                {type: 'end', x: 375, y: 300},
                {type: 'encryptor', x: 50, y: 300},
                {type: 'decryptor', x: 550, y: 300},
                {type: 'spy', x: 300, y: 375},
                {type: 'spy', x: 300, y: 225},
            ],
            texts: [
                {content: 'Start and end towers also', x: 300, y: 475},
                {content: 'act as repeaters', x: 300, y: 500},
            ],
        },
        // 14
        {
            towers: [
                {type: 'small repeater', x: 300, y: 150},
                {type: 'small repeater', x: 225, y: 475},
                {type: 'small repeater', x: 375, y: 475},
                {type: 'large repeater', x: 300, y: 475},
                {type: 'start', x: 150, y: 150},
                {type: 'end', x: 375, y: 150},
                {type: 'encryptor', x: 225, y: 150},
                {type: 'decryptor', x: 150, y: 300},
                {type: 'spy', x: 300, y: 225},
                {type: 'spy', x: 300, y: 75},
            ],
            walls: [{x1: 0, y1: 225, x2: 275, y2: 225, fixed1: true, fixed2: true}],
        },
        // 15
        {
            towers: [
                {type: 'small repeater', x: 525, y: 250},
                {type: 'small repeater', x: 500, y: 300},
                {type: 'small repeater', x: 525, y: 350},
                {type: 'large repeater', x: 550, y: 300},
                {type: 'start', x: 200, y: 300},
                {type: 'end', x: 400, y: 300},
                {type: 'encryptor', x: 300, y: 50},
                {type: 'decryptor', x: 325, y: 500},
                {type: 'spy', x: 300, y: 300},
                {type: 'spy', x: 400, y: 150},
                {type: 'spy', x: 200, y: 450},
                {type: 'spy', x: 550, y: 550},
            ],
        },
        // 16
        {
            towers: [
                {type: 'small repeater', x: 50, y: 500},
                {type: 'small repeater', x: 100, y: 500},
                {type: 'small repeater', x: 150, y: 500},
                {type: 'small repeater', x: 200, y: 500},
                {type: 'large repeater', x: 50, y: 550},
                {type: 'large repeater', x: 125, y: 550},
                {type: 'large repeater', x: 200, y: 550},
                {type: 'start', x: 575, y: 125},
                {type: 'end', x: 475, y: 25},
                {type: 'end', x: 72, y: 293},
                {type: 'encryptor', x: 550, y: 550},
                {type: 'decryptor', x: 237, y: 33},
                {type: 'spy', x: 300, y: 300},
                {type: 'spy', x: 228, y: 201},
                {type: 'spy', x: 118, y: 19},
                {type: 'spy', x: 154, y: 115},
                {type: 'spy', x: 187, y: 316},
            ],
            walls: [
                {x1: 600, y1: 0, x2: 350, y2: 250, fixed1: true, fixed2: true},
                {x1: 125, y1: 475, x2: 250, y2: 350, fixed1: true, fixed2: true},
            ],
            texts: [],
        },
        // 17
        {
            towers: [
                {type: 'small repeater', x: 550, y: 500},
                {type: 'small repeater', x: 500, y: 550},
                {type: 'large repeater', x: 550, y: 550},
                {type: 'start', x: 200, y: 550},
                {type: 'end', x: 465, y: 38},
                {type: 'encryptor', x: 200, y: 375},
                {type: 'decryptor', x: 300, y: 100},
                {type: 'spy', x: 400, y: 114},
                {type: 'spy', x: 290, y: 270},
                {type: 'spy', x: 250, y: 463},
            ],
            walls: [{x1: 550, y1: 450, x2: 450, y2: 550, fixed1: false, fixed2: false}],
        },
        // 18
        {
            towers: [
                {type: 'small repeater', x: 575, y: 550},
                {type: 'small repeater', x: 550, y: 550},
                {type: 'small repeater', x: 575, y: 575},
                {type: 'small repeater', x: 475, y: 575},
                {type: 'small repeater', x: 550, y: 575},
                {type: 'small repeater', x: 525, y: 575},
                {type: 'small repeater', x: 475, y: 550},
                {type: 'small repeater', x: 500, y: 525},
                {type: 'small repeater', x: 500, y: 550},
                {type: 'small repeater', x: 525, y: 525},
                {type: 'small repeater', x: 525, y: 550},
                {type: 'small repeater', x: 550, y: 525},
                {type: 'small repeater', x: 500, y: 575},
                {type: 'start', x: 550, y: 50},
                {type: 'end', x: 300, y: 300},
                {type: 'end', x: 50, y: 550},
                {type: 'end', x: 50, y: 336},
                {type: 'encryptor', x: 300, y: 50},
                {type: 'decryptor', x: 291, y: 540},
                {type: 'decryptor', x: 550, y: 300},
                {type: 'decryptor', x: 50, y: 174},
                {type: 'spy', x: 555, y: 155},
                {type: 'spy', x: 230, y: 127},
                {type: 'spy', x: 424, y: 187},
                {type: 'spy', x: 25, y: 451},
                {type: 'spy', x: 184, y: 319},
                {type: 'spy', x: 163, y: 55},
                {type: 'spy', x: 76, y: 73},
                {type: 'spy', x: 268, y: 435},
                {type: 'spy', x: 397, y: 519},
                {type: 'spy', x: 512, y: 455},
                {type: 'spy', x: 339, y: 178},
                {type: 'spy', x: 176, y: 462},
                {type: 'spy', x: 575, y: 402},
                {type: 'spy', x: 194, y: 183},
                {type: 'spy', x: 131, y: 396},
                {type: 'spy', x: 397, y: 238},
            ],
        },
    ]);

    const musicAudio = setupMusic(music);
    const clickAudio = setupSoundEffect(click);
    const winAudio = setupSoundEffect(win);
    const storage = setupStorage('february');

    let levelIndex = 0;
    let level = BLANK_LEVEL;
    let levelComplete = false;
    let dragging: {index: number; type: 'tower' | 'wall1' | 'wall2'} | undefined;
    let tooltip: Tooltip.Any;
    let lastTime = 0;
    let done = false;
    let pingState: PingState.Any = {type: 'standby'};
    let pointerPosition: {x: number; y: number} = {x: 0, y: 0};
    let graph = makeGraph<ConnectionStatus>();
    let editor: EditorState.Any = {type: 'none'};

    function fillLevels(levels: Partial<Level>[]) {
        return levels.map(level => ({
            towers: level.towers ?? [],
            walls: level.walls ?? [],
            texts: level.texts ?? [],
        }));
    }

    function loadLevel(index: number) {
        clearPingState();
        levelIndex = index;
        level = structuredClone(LEVELS[levelIndex]);
        levelComplete = false;
        updateConnectionGraph();
        setLevelOverlay();
    }

    function getLevelBits(l: Level) {
        return [
            ...numberToBitArray(l.towers.length, 8),
            ...l.towers.flatMap(tower => [
                ...numberToBitArray(TOWER_TYPES.indexOf(tower.type), 3),
                ...numberToBitArray(tower.x, 10),
                ...numberToBitArray(tower.y, 10),
            ]),
            ...numberToBitArray(l.walls.length, 5),
            ...l.walls.flatMap(wall => [
                ...numberToBitArray(wall.x1, 10),
                ...numberToBitArray(wall.y1, 10),
                ...numberToBitArray(wall.x2, 10),
                ...numberToBitArray(wall.y2, 10),
                ...booleanToBitArray(wall.fixed1),
                ...booleanToBitArray(wall.fixed2),
            ]),
        ];
    }

    function serializeLevel() {
        return (
            '`' +
            bigIntToString(
                BigInt(
                    `0b${[
                        1, // Always start with a 1 so leading zeros are not erased
                        ...getLevelBits(editor.type === 'testing' ? editor.level : level), // Base puzzle
                        ...(editor.type === 'testing' ? getLevelBits(level) : []), // Optional solution
                    ].join('')}`,
                ),
            ) +
            '`'
        );
    }

    function levelFromBits(readBits: (numBits?: number) => string) {
        const numTowers = parseInt(readBits(8), 2);
        if (numTowers > MAX_TOWERS) throw Error();

        const towers: Tower[] = [...Array(numTowers)].map(() => {
            const typeIndex = parseInt(readBits(3), 2);
            const x = parseInt(readBits(10), 2);
            const y = parseInt(readBits(10), 2);
            return {type: TOWER_TYPES[typeIndex], x, y};
        });

        if (towers.filter(({type}) => type === 'start').length !== 1) throw Error();

        const numWalls = parseInt(readBits(5), 2);
        if (numWalls > MAX_WALLS) throw Error();

        const walls: Wall[] = [...Array(numWalls)].map(() => {
            const x1 = parseInt(readBits(10), 2);
            const y1 = parseInt(readBits(10), 2);
            const x2 = parseInt(readBits(10), 2);
            const y2 = parseInt(readBits(10), 2);
            const fixed1 = readBits(1) === '1';
            const fixed2 = readBits(1) === '1';
            return {x1, y1, x2, y2, fixed1, fixed2};
        });

        return {towers, walls, texts: []};
    }

    function deserializeLevel(serialized: string) {
        const bits = stringToBigInt(serialized.replace(/`/g, '')).toString(2);

        let offset = 0;
        function readBits(numBits?: number) {
            if (numBits === undefined) return bits.slice(offset);
            offset += numBits;
            return bits.slice(offset - numBits, offset);
        }

        readBits(1); // The first bit is always 1 so leading zeros are not erased

        const baseLevel = levelFromBits(readBits);

        let hasValidSolution = false;
        if (offset < bits.length) {
            level = levelFromBits(readBits);
            updateConnectionGraph();
            if (
                level.towers.length === baseLevel.towers.length &&
                level.walls.length === baseLevel.walls.length &&
                level.towers.every((tower, index) => tower.type === baseLevel.towers[index].type) &&
                level.walls.every(
                    (wall, index) =>
                        wall.fixed1 === baseLevel.walls[index].fixed1 && wall.fixed2 === baseLevel.walls[index].fixed2,
                ) &&
                level.towers
                    .flatMap((tower, index) => (tower.type === 'end' ? [index] : []))
                    .every(index => getTowerStatus(index).unencrypted)
            ) {
                hasValidSolution = true;
            }
        }

        level = baseLevel;
        updateConnectionGraph();

        return hasValidSolution;
    }

    function loadLevelFromCode() {
        const code = prompt('Enter level code to import:');
        if (code === null) return false;
        try {
            if (!deserializeLevel(code)) alert('Warning: this level may not have a valid solution.');
        } catch (error) {
            alert('Invalid level :(');
            return false;
        }
        updateConnectionGraph();
        return true;
    }

    function openMenu() {
        clearPingState();
        level = BLANK_LEVEL;
        graph = makeGraph();
        tooltip = {type: 'none'};
        editor = {type: 'none'};
        dragging = undefined;

        const nextLevel = +(storage.get('nextLevel') ?? '0');

        setOverlay(`
            <div style="display: flex; flex-direction: column; align-items: center">
                <img src="${logo}" alt="Relay" width="400">
                <div style="display: flex; flex-direction: column; gap: 25px; align-items: center">
                    <div style="display: flex; gap: 5px; width: 500px; flex-wrap: wrap; justify-content: center">
                        ${LEVELS.map((_, index) => `<button class="light" style="width: 70px; height: 35px; ${nextLevel === index ? 'border-width: 5px; border-style: dashed; padding: 0' : ''}" ${nextLevel < index ? 'disabled' : ''}>${index + 1} ${nextLevel > index ? '🏆' : ''}</button>`).join('')}
                    </div>
                    <div style="display: flex; gap: 5px">
                        <button>LEVEL EDITOR</button>
                        <button>PLAY LEVEL FROM CODE</button>
                    </div>
                </div>
            </div>
        `);

        overlay.querySelectorAll('button').forEach(button =>
            button.addEventListener('click', () => {
                clickAudio.play();

                switch (button.textContent) {
                    case 'LEVEL EDITOR':
                        clearPingState();
                        editor = {type: 'editing'};
                        try {
                            deserializeLevel(storage.get('editorLevel'));
                        } catch (error) {
                            level = structuredClone(EDITOR_TEMPLATE_LEVEL);
                        }
                        levelComplete = false;
                        updateConnectionGraph();
                        setEditorOverlay();
                        break;
                    case 'PLAY LEVEL FROM CODE':
                        if (loadLevelFromCode()) {
                            levelIndex = -1;
                            setLevelOverlay();
                            checkWin();
                        }
                        break;
                    default:
                        loadLevel(parseInt(button.textContent!) - 1);
                        break;
                }
            }),
        );
    }

    function setLevelOverlay() {
        setOverlay(`
            <button id="february-menu-button" class="light" style="margin: 5px 0 0 5px">Menu</button>
        `);

        (document.getElementById('february-menu-button') as HTMLButtonElement).addEventListener('click', () => {
            clickAudio.play();
            openMenu();
        });
    }

    function setEditorOverlay() {
        if (editor.type === 'editing') {
            setOverlay(`
                <button id="february-menu-button" class="light" style="margin: 5px 0 0 5px">MENU</button>
            `);

            (document.getElementById('february-menu-button') as HTMLButtonElement).addEventListener('click', () => {
                clickAudio.play();
                editor = {type: 'menu'};
                setEditorOverlay();
            });

            return;
        }

        setOverlay(`
            <button class="light" style="margin: 5px 0 0 5px; position: absolute; pointer-events: none">MENU</button>
            <div class="center">
                <div style="position: relative; top: 45px; width: 240px; height: 60px; display: grid; grid-template-columns: 1fr 1fr; gap: 5px;">
                    <button>TEST</button>
                    <button>IMPORT</button>
                    <button>MAIN MENU</button>
                    <button>CLEAR</button>
                </div>
            </div>
        `);

        overlay.querySelectorAll('button').forEach(button =>
            button.addEventListener('click', () => {
                clickAudio.play();

                switch (button.textContent) {
                    case 'TEST':
                        if (
                            isLevelComplete() &&
                            !confirm(
                                'Warning: your level is already solved. Make sure your level is in an unsolved state before entering test mode, or else it will instantly be marked as complete. Would you like to enter test mode anyway?',
                            )
                        )
                            return;

                        editor = {type: 'testing', level: structuredClone(level)};
                        setOverlay(`
                            <button id="february-back-button" class="light" style="margin: 5px 0 0 5px">BACK</button>
                        `);
                        (document.getElementById('february-back-button') as HTMLButtonElement).addEventListener(
                            'click',
                            () => {
                                clickAudio.play();
                                level = (editor as EditorState.Testing).level;
                                editor = {type: 'menu'};
                                setEditorOverlay();
                                updateConnectionGraph();
                            },
                        );
                        checkWin();
                        break;
                    case 'CLEAR':
                        if (!confirm('Are you sure you want to clear the level?')) break;
                        level = structuredClone(EDITOR_TEMPLATE_LEVEL);
                        updateConnectionGraph();
                        editor = {type: 'editing'};
                        setEditorOverlay();
                        storage.set('editorLevel', serializeLevel());
                        break;
                    case 'IMPORT':
                        loadLevelFromCode();
                        break;
                    case 'MAIN MENU':
                        openMenu();
                        break;
                }
            }),
        );
    }

    function clearPingState() {
        if (pingState.type === 'waiting') clearTimeout(pingState.timeoutId);
        pingState = {type: 'standby'};
    }

    function addPing(from: number, to: number, unencrypted: boolean, encrypted: boolean) {
        (pingState as PingState.Pinging).pings.push({from, to, unencrypted, encrypted, distance: 0});
    }

    function sendStartPing(graph: Graph<ConnectionStatus>) {
        const startIndex = level.towers.findIndex(tower => tower.type === 'start');
        if (startIndex === -1 || !canEmitUnencrypted(startIndex)) return;
        pingState = {
            type: 'pinging',
            pings: [],
            endsHit: new Set(),
            visitedUnencrypted: new Set([startIndex]),
            visitedEncrypted: new Set(),
        };
        for (const [neighbor] of graph.getNeighbors(startIndex)) {
            addPing(startIndex, neighbor, true, false);
        }
    }

    function isLevelComplete() {
        const endTowersIndexes = level.towers.flatMap((tower, index) => (tower.type === 'end' ? [index] : []));

        // This is true if we're not on a valid level, like the menu
        if (endTowersIndexes.length === 0) return;

        return endTowersIndexes.every(index => getTowerStatus(index).unencrypted);
    }

    function checkWin() {
        if (levelComplete || editor.type === 'editing' || editor.type === 'menu') return;

        if (isLevelComplete()) {
            winAudio.play();
            levelComplete = true;

            if (editor.type === 'none' && +(storage.get('nextLevel') ?? '0') <= levelIndex) {
                storage.set('nextLevel', levelIndex + 1);
            }

            const buttons =
                editor.type === 'none'
                    ? `
                        <button class="light">MENU</button>
                        ${levelIndex === -1 || levelIndex === LEVELS.length - 1 ? '' : '<button class="light">NEXT</button>'}
                    `
                    : `
                        <button id="february-back-button" class="light">BACK</button>
                        <button id="february-copy-button" class="light">COPY CODE</button>
                        <button id="february-submit-button" class="light">SUBMIT</button>
                    `;

            setOverlay(`
                <div style="display: flex; flex-direction: column; gap: 10px; background-color: ${BACKGROUND_COLOR}; border: 1px solid var(--ui-white); padding: 15px; align-items: center; margin: 5px 0 0 5px; width: fit-content">
                    Level complete 🏆
                    <div style="display: flex; gap: 5px">${buttons}</div>
                </div>
            `);

            overlay.querySelectorAll('button').forEach(button =>
                button.addEventListener('click', () => {
                    clickAudio.play();

                    switch (button.textContent) {
                        case 'MENU':
                            openMenu();
                            break;
                        case 'NEXT':
                            loadLevel(levelIndex + 1);
                            break;
                        case 'BACK':
                            level = (editor as EditorState.Testing).level;
                            levelComplete = false;
                            editor = {type: 'menu'};
                            setEditorOverlay();
                            updateConnectionGraph();
                            break;
                        case 'COPY CODE':
                            window.navigator.clipboard.writeText(serializeLevel()).then(() => {
                                button.innerText = 'COPIED!';
                                setTimeout(() => (button.innerText = 'COPY CODE'), 1000);
                            });
                            break;
                        case 'SUBMIT':
                            window.open(
                                `https://docs.google.com/forms/d/e/1FAIpQLSdYsmMjlxA-qHJraxo_7k9BX1SAq5igL5HO_7LPbxCMUn3azQ/viewform?&entry.1088058743=${encodeURIComponent(serializeLevel())}`,
                            );
                            break;
                    }
                }),
            );
        }
    }

    function getDoubleLineOffsets(from: {x: number; y: number}, to: {x: number; y: number}) {
        const angle = Math.atan2(from.y - to.y, from.x - to.x);
        const reverse = angle < -Math.PI / 2 || angle > Math.PI / 2; // Ensure the encrypted line is always "on top"
        const perpendicularAngle1 = angle + ((reverse ? -1 : 1) * Math.PI) / 2;
        const perpendicularAngle2 = angle + ((reverse ? 1 : -1) * Math.PI) / 2;
        return {
            fromX1: from.x + CONNECTION_LINE_WIDTH * Math.cos(perpendicularAngle1),
            fromY1: from.y + CONNECTION_LINE_WIDTH * Math.sin(perpendicularAngle1),
            toX1: to.x + CONNECTION_LINE_WIDTH * Math.cos(perpendicularAngle1),
            toY1: to.y + CONNECTION_LINE_WIDTH * Math.sin(perpendicularAngle1),
            fromX2: from.x + CONNECTION_LINE_WIDTH * Math.cos(perpendicularAngle2),
            fromY2: from.y + CONNECTION_LINE_WIDTH * Math.sin(perpendicularAngle2),
            toX2: to.x + CONNECTION_LINE_WIDTH * Math.cos(perpendicularAngle2),
            toY2: to.y + CONNECTION_LINE_WIDTH * Math.sin(perpendicularAngle2),
        };
    }

    function getLines() {
        const lines: {
            x1: number;
            y1: number;
            x2: number;
            y2: number;
            from: number;
            to: number;
            type: 'encrypted' | 'unencrypted' | 'spy';
        }[] = [];
        for (const [from, to, status] of graph) {
            const fromTower = level.towers[from];
            const toTower = level.towers[to];
            const hasSpy = fromTower.type === 'spy' || toTower.type === 'spy';

            if (hasSpy && status.encrypted) continue;

            if (!status.unencrypted && !status.encrypted) {
                if (!hasSpy) continue;
                lines.push({x1: fromTower.x, y1: fromTower.y, x2: toTower.x, y2: toTower.y, from, to, type: 'spy'});
                continue;
            }

            if (status.unencrypted && status.encrypted) {
                const {fromX1, fromY1, fromX2, fromY2, toX1, toY1, toX2, toY2} = getDoubleLineOffsets(
                    fromTower,
                    toTower,
                );
                lines.push({x1: fromX1, y1: fromY1, x2: toX1, y2: toY1, from, to, type: 'unencrypted'});
                lines.push({x1: fromX2, y1: fromY2, x2: toX2, y2: toY2, from, to, type: 'encrypted'});
                continue;
            }

            const type = status.encrypted ? 'encrypted' : 'unencrypted';
            lines.push({x1: fromTower.x, y1: fromTower.y, x2: toTower.x, y2: toTower.y, from, to, type});
        }

        return lines;
    }

    function isHoveringConnection({from, to, type}: ReturnType<typeof getLines>[number]) {
        return (
            tooltip.type === 'connection' &&
            tooltip.from === from &&
            tooltip.to === to &&
            tooltip.encrypted === (type === 'encrypted')
        );
    }

    function drawPreview(index: number, tower: Tower, radius: number) {
        if (dragging !== undefined) {
            context.strokeStyle =
                dragging.type === 'tower' && dragging.index === index ? REPEATER_COLOR : REPEATER_PREVIEW_COLOR;
            context.setLineDash([]);
            context.lineWidth = REPEATER_PREVIEW_WIDTH;
            context.beginPath();
            context.arc(tower.x, tower.y, radius - REPEATER_PREVIEW_WIDTH, 0, 2 * Math.PI);
            context.stroke();
        }
    }

    function drawPing(fromX1: number, toX1: number, fromY1: number, toY1: number, progress: number) {
        context.beginPath();
        context.arc(
            fromX1 + (toX1 - fromX1) * progress,
            fromY1 + (toY1 - fromY1) * progress,
            CONNECTION_LINE_WIDTH,
            0,
            2 * Math.PI,
        );
        context.fill();
    }

    function drawTowers(towers: Iterable<[number, Tower]>) {
        for (const [index, tower] of towers) {
            context.beginPath();
            switch (tower.type) {
                case 'start':
                    context.fillStyle = START_COLOR;
                    context.rect(
                        tower.x - RECTANGLE_SIZE,
                        tower.y - RECTANGLE_SIZE,
                        RECTANGLE_SIZE * 2,
                        RECTANGLE_SIZE * 2,
                    );
                    context.fill();
                    break;
                case 'end':
                    context.fillStyle = interpolateColor(
                        END_COLOR,
                        UI_WHITE,
                        pingState.type === 'pulsing'
                            ? (pingState.endPulses.get(index) ?? 0)
                            : pingState.type === 'pinging' && pingState.endsHit.has(index)
                              ? 1
                              : 0,
                    );
                    context.translate(tower.x, tower.y);
                    context.rotate((45 * Math.PI) / 180);
                    context.rect(-RECTANGLE_SIZE, -RECTANGLE_SIZE, RECTANGLE_SIZE * 2, RECTANGLE_SIZE * 2);
                    context.fill();
                    context.setTransform(1, 0, 0, 1, 0, 0);
                    break;
                case 'small repeater':
                    context.fillStyle = REPEATER_COLOR;
                    context.arc(tower.x, tower.y, SMALL_REPEATER_RADIUS, 0, 2 * Math.PI);
                    context.fill();
                    drawPreview(index, tower, SMALL_REPEATER_CONNECTION_RADIUS);
                    break;
                case 'large repeater':
                    context.fillStyle = REPEATER_COLOR;
                    context.arc(tower.x, tower.y, LARGE_REPEATER_RADIUS, 0, 2 * Math.PI);
                    context.fill();
                    drawPreview(index, tower, LARGE_REPEATER_CONNECTION_RADIUS);
                    break;
                case 'encryptor':
                    context.fillStyle = ENCRYPTOR_COLOR;
                    context.moveTo(tower.x, tower.y - TRIANGLE_SIZE);
                    context.lineTo(tower.x + TRIANGLE_SIZE, tower.y + TRIANGLE_SIZE);
                    context.lineTo(tower.x - TRIANGLE_SIZE, tower.y + TRIANGLE_SIZE);
                    context.fill();
                    break;
                case 'decryptor':
                    context.fillStyle = DECRYPTOR_COLOR;
                    context.moveTo(tower.x, tower.y + TRIANGLE_SIZE);
                    context.lineTo(tower.x + TRIANGLE_SIZE, tower.y - TRIANGLE_SIZE);
                    context.lineTo(tower.x - TRIANGLE_SIZE, tower.y - TRIANGLE_SIZE);
                    context.fill();
                    break;
                case 'spy':
                    context.fillStyle = SPY_COLOR;
                    context.arc(tower.x, tower.y, 10, Math.PI / 8, Math.PI * (7 / 8));
                    context.fill();
                    context.beginPath();
                    context.arc(tower.x, tower.y, 10, Math.PI * (9 / 8), Math.PI * (15 / 8));
                    context.moveTo(tower.x, tower.y);
                    context.arc(tower.x, tower.y, 3, 0, 2 * Math.PI);
                    context.fill();
                    break;
            }
        }
    }

    function drawWalls(walls: Wall[]) {
        context.lineWidth = WALL_LINE_WIDTH;
        context.strokeStyle = WALL_COLOR;
        context.fillStyle = WALL_COLOR;
        context.setLineDash([]);
        for (const {x1, y1, x2, y2, fixed1, fixed2} of walls) {
            context.beginPath();
            context.arc(x1, y1, WALL_HANDLE_RADIUS, 0, Math.PI * 2);
            if (fixed1) {
                if (['editing', 'menu'].includes(editor.type)) {
                    context.setLineDash([5]);
                    context.stroke();
                    context.setLineDash([]);
                }
            } else {
                context.fill();
            }
            context.beginPath();
            context.moveTo(x1, y1);
            context.lineTo(x2, y2);
            context.stroke();

            context.beginPath();
            context.arc(x2, y2, WALL_HANDLE_RADIUS, 0, Math.PI * 2);
            if (fixed2) {
                if (['editing', 'menu'].includes(editor.type)) {
                    context.setLineDash([5]);
                    context.stroke();
                    context.setLineDash([]);
                }
            } else {
                context.fill();
            }
        }
    }

    function draw(now: number) {
        context.fillStyle = BACKGROUND_COLOR;
        context.fillRect(0, 0, canvas.width, canvas.height);

        context.fillStyle = '#FFFFFF0A';
        context.textBaseline = 'middle';
        context.textAlign = 'center';
        if (level !== BLANK_LEVEL && editor.type === 'none' && levelIndex >= 0) {
            const text = (levelIndex + 1).toString();
            context.font = `350px ${FONT}`;
            context.fillText(text, canvas.width / 2, canvas.height / 2 + FONT_HEIGHT_OFFSET);
        }

        if (editor.type === 'testing') {
            context.font = `80px ${FONT}`;
            context.fillText('TEST MODE', canvas.width / 2, canvas.height / 2);
        }

        const {towers, walls, texts} = level;

        context.fillStyle = UI_WHITE;
        context.font = `24px ${FONT}`;
        context.textBaseline = 'middle';
        context.textAlign = 'center';
        for (const {content, x, y} of texts) {
            context.fillText(content, x, y);
        }

        context.lineWidth = CONNECTION_LINE_WIDTH;
        const lines = getLines();
        for (const line of lines) {
            context.strokeStyle =
                line.type === 'spy'
                    ? SPY_COLOR
                    : isHoveringConnection(line)
                      ? UI_WHITE
                      : isLevelComplete()
                        ? START_COLOR
                        : CONNECTION_COLOR;
            context.setLineDash(
                line.type === 'encrypted' ? LINE_DASH_ENCRYPTED : line.type === 'spy' ? LINE_DASH_SPY : [],
            );
            context.beginPath();
            context.moveTo(line.x1, line.y1);
            context.lineTo(line.x2, line.y2);
            context.stroke();
        }

        if (pingState.type === 'pinging') {
            context.fillStyle = UI_WHITE;
            for (const ping of pingState.pings) {
                // Remove the ping if the connection no longer exists.
                if (graph.getData(ping.from, ping.to) === undefined) {
                    pingState.pings.splice(pingState.pings.indexOf(ping), 1);
                    continue;
                }

                ping.distance += (now - lastTime) * PING_SPEED_MULTIPLIER;
                const progress =
                    ping.distance /
                    distance(towers[ping.from].x, towers[ping.from].y, towers[ping.to].x, towers[ping.to].y);

                // If the ping made it to the end, delete it and add new pings from the next tower
                if (progress >= 1) {
                    const toType = towers[ping.to].type;
                    if (ping.unencrypted || toType === 'decryptor') pingState.visitedUnencrypted.add(ping.to);
                    if (ping.encrypted || toType === 'encryptor') pingState.visitedEncrypted.add(ping.to);
                    pingState.pings.splice(pingState.pings.indexOf(ping), 1);

                    if (ping.unencrypted && towers[ping.to].type === 'end') pingState.endsHit.add(ping.to);

                    for (const [neighbor, status] of graph.getNeighbors(ping.to)) {
                        if (!status.unencrypted && !status.encrypted) continue;
                        const sendUnencrypted =
                            (ping.unencrypted || toType === 'decryptor') &&
                            canEmitUnencrypted(ping.to) &&
                            !pingState.visitedUnencrypted.has(neighbor);
                        const sendEncrypted =
                            (ping.encrypted || toType === 'encryptor') && !pingState.visitedEncrypted.has(neighbor);
                        if (!(sendUnencrypted || sendEncrypted)) continue;
                        if (sendUnencrypted) pingState.visitedUnencrypted.add(neighbor);
                        if (sendEncrypted) pingState.visitedEncrypted.add(neighbor);
                        addPing(ping.to, neighbor, sendUnencrypted, sendEncrypted);
                    }
                }

                const from = towers[ping.from];
                const to = towers[ping.to];
                const status = graph.getData(ping.from, ping.to);
                if (status === undefined) continue;
                if (status.unencrypted && status.encrypted) {
                    const {fromX1, fromY1, fromX2, fromY2, toX1, toY1, toX2, toY2} = getDoubleLineOffsets(from, to);
                    if (ping.unencrypted) drawPing(fromX1, toX1, fromY1, toY1, progress);
                    if (ping.encrypted) drawPing(fromX2, toX2, fromY2, toY2, progress);
                } else {
                    drawPing(from.x, to.x, from.y, to.y, progress);
                }
            }
        }

        if (pingState.type === 'pinging') {
            if (pingState.pings.length === 0) {
                pingState = {
                    type: 'pulsing',
                    endPulses: new Map([...pingState.endsHit].map(index => [index, END_PULSE_DURATION])),
                };
            }
        } else if (pingState.type === 'pulsing') {
            if (pingState.endPulses.size === 0) pingState = {type: 'standby'};
            else {
                for (const [index, time] of pingState.endPulses) {
                    pingState.endPulses.set(index, time - (now - lastTime) / 1000);
                    if (time <= 0) pingState.endPulses.delete(index);
                }
            }
        } else if (pingState.type === 'standby') {
            pingState = {type: 'waiting', timeoutId: setTimeout(() => sendStartPing(graph), 1000)};
        }

        if (editor.type === 'editing' && dragging !== undefined) {
            context.textAlign = 'left';
            context.textBaseline = 'top';
            context.fillText('🗑️', 5, 12);
        }

        drawTowers(towers.entries());
        drawWalls(walls);

        if (tooltip.type !== 'none') {
            const {type, x, y} =
                tooltip.type === 'tower'
                    ? level.towers[tooltip.index]
                    : {type: tooltip.encrypted ? 'Encrypted connection' : 'Unencrypted connection', ...pointerPosition};
            context.font = `18px ${FONT}`;
            const textWidth = context.measureText(type).width;
            const left = x + textWidth + 50 > canvas.width;

            context.textAlign = left ? 'right' : 'left';
            context.textBaseline = 'middle';
            context.fillStyle = UI_WHITE;
            context.fillRect(
                x + (left ? -textWidth - 35 : 20),
                y - TOOL_TIP_HEIGHT / 2,
                textWidth + 15,
                TOOL_TIP_HEIGHT,
            );
            context.strokeStyle = UI_BLACK;
            context.lineWidth = 3;
            context.strokeRect(
                x + (left ? -textWidth - 35 : 20),
                y - TOOL_TIP_HEIGHT / 2,
                textWidth + 15,
                TOOL_TIP_HEIGHT,
            );
            context.fillStyle = UI_BLACK;
            context.fillText(type[0].toUpperCase() + type.slice(1), x + (left ? -27.5 : 27.5), y + 2);
        }

        if (editor.type === 'menu') {
            context.fillStyle = BACKGROUND_COLOR;
            context.fillRect(canvas.width / 2 - 130, canvas.height / 2 - 100, 260, 200);
            context.strokeStyle = UI_WHITE;
            context.setLineDash([]);
            context.strokeRect(canvas.width / 2 - 130, canvas.height / 2 - 100, 260, 200);

            if (level.towers.length < MAX_TOWERS) drawTowers(EDITOR_LIBRARY_TOWERS.map(tower => [-1, tower]));
            if (level.walls.length < MAX_WALLS) drawWalls(EDITOR_LIBRARY_WALLS);
        }

        lastTime = now;
        if (!done) requestAnimationFrame(draw);
    }

    function lineIntersectsWall(x1: number, y1: number, x2: number, y2: number) {
        for (const wall of level.walls) {
            if (linesIntersect(x1, y1, x2, y2, wall.x1, wall.y1, wall.x2, wall.y2)) {
                return true;
            }
        }
        return false;
    }

    function addConnectionStatus(a: number, b: number, status: ConnectionStatus) {
        if (!status.unencrypted && !status.encrypted) return;

        const current = graph.getData(a, b);
        graph.connect(a, b, {
            unencrypted: current?.unencrypted || status.unencrypted,
            encrypted: current?.encrypted || status.encrypted,
        });
    }

    function updateConnectionStatuses() {
        // Emit unencrypted from start
        const startIndex = level.towers.findIndex(tower => tower.type === 'start');
        if (canEmitUnencrypted(startIndex)) {
            for (const [a, b] of graph.search(startIndex, index => canEmitUnencrypted(index))) {
                graph.connect(a, b, {unencrypted: true, encrypted: false});
            }
        }

        // Emit encrypted from encryptors
        for (const tower of level.towers.filter(tower => tower.type === 'encryptor')) {
            const towerIndex = level.towers.indexOf(tower);
            const status = getTowerStatus(towerIndex);
            if (!status.unencrypted && !status.encrypted) continue;

            for (const [a, b] of graph.search(towerIndex, index => level.towers[index].type !== 'spy')) {
                if (level.towers[a].type === 'spy' || level.towers[b].type === 'spy') continue;
                addConnectionStatus(a, b, {unencrypted: false, encrypted: true});
            }
        }

        // Emit unencrypted from decryptors
        for (const tower of level.towers.filter(tower => tower.type === 'decryptor')) {
            const towerIndex = level.towers.indexOf(tower);
            const status = getTowerStatus(towerIndex);
            if (!status.unencrypted && !status.encrypted) continue;

            for (const [a, b] of graph.search(towerIndex, canEmitUnencrypted)) {
                addConnectionStatus(a, b, {unencrypted: true, encrypted: false});
            }
        }
    }

    function updateConnectionGraph() {
        graph = makeGraph<ConnectionStatus>();

        for (const [index, tower] of level.towers.entries()) {
            if (tower.type === 'spy') continue;
            for (const [otherIndex, other] of level.towers.entries()) {
                if (index === otherIndex) continue;
                const radius =
                    tower.type === 'large repeater'
                        ? LARGE_REPEATER_CONNECTION_RADIUS
                        : SMALL_REPEATER_CONNECTION_RADIUS;
                if (
                    distance(tower.x, tower.y, other.x, other.y) >= radius ||
                    lineIntersectsWall(tower.x, tower.y, other.x, other.y)
                )
                    continue;

                graph.connect(index, otherIndex, {unencrypted: false, encrypted: false});
            }
        }

        updateConnectionStatuses();
    }

    function canEmitUnencrypted(index: number) {
        if (level.towers[index].type === 'spy') return false;
        return [...graph.getNeighbors(index)].every(([neighbor]) => level.towers[neighbor].type !== 'spy');
    }

    function getTowerStatus(index: number) {
        const neighbors = [...graph.getNeighbors(index)];
        return {
            unencrypted: neighbors.some(([, status]) => status.unencrypted),
            encrypted: neighbors.some(([, status]) => status.encrypted),
        };
    }

    function* generateDraggables(all: boolean): Generator<typeof dragging & {x: number; y: number; radius: number}> {
        for (const [index, {type, x, y}] of level.towers.entries()) {
            if (!all && !type.endsWith('repeater')) continue;
            const radius = type === 'small repeater' ? SMALL_REPEATER_RADIUS : LARGE_REPEATER_RADIUS;
            yield {type: 'tower', index, x, y, radius: radius};
        }

        for (const [index, {x1, y1, x2, y2, fixed1, fixed2}] of level.walls.entries()) {
            if (all || !fixed1) yield {type: 'wall1', index, x: x1, y: y1, radius: WALL_HANDLE_RADIUS};
            if (all || !fixed2) yield {type: 'wall2', index, x: x2, y: y2, radius: WALL_HANDLE_RADIUS};
        }
    }

    function setupLibraryDraggables() {
        const result: ({
            x: number;
            y: number;
            radius: number;
        } & (
            | {
                  type: Tower['type'];
              }
            | {
                  type: 'wall1' | 'wall2';
                  fixed1: boolean;
                  fixed2: boolean;
                  otherX: number;
                  otherY: number;
              }
        ))[] = [];

        for (const {type, x, y} of EDITOR_LIBRARY_TOWERS) {
            const radius = type === 'large repeater' ? LARGE_REPEATER_RADIUS : SMALL_REPEATER_RADIUS;
            result.push({type, x, y, radius});
        }

        for (const {x1, y1, x2, y2, fixed1, fixed2} of EDITOR_LIBRARY_WALLS) {
            result.push({
                type: 'wall1',
                x: x1,
                y: y1,
                otherX: x2,
                otherY: y2,
                radius: LARGE_REPEATER_RADIUS,
                fixed1,
                fixed2,
            });
            result.push({
                type: 'wall2',
                x: x2,
                y: y2,
                otherX: x1,
                otherY: y1,
                radius: LARGE_REPEATER_RADIUS,
                fixed1,
                fixed2,
            });
        }

        return result;
    }

    function getClosest<T extends {x: number; y: number; radius: number}>(
        draggables: Iterable<T>,
        x: number,
        y: number,
        extraRadius = 0,
    ) {
        let closest: {dragging: T; distance: number} | undefined;
        for (const draggable of draggables) {
            const dist = distance(x, y, draggable.x, draggable.y);
            if (dist <= draggable.radius + extraRadius && dist < (closest?.distance ?? Infinity)) {
                closest = {dragging: draggable, distance: dist};
            }
        }
        return closest?.dragging;
    }

    function updateTooltip(x: number, y: number) {
        if (editor.type !== 'none') return;
        const hovering = getClosest(generateDraggables(true), x, y, 0);
        if (hovering === undefined) {
            for (const {x1, x2, y1, y2, from, to, type} of getLines()) {
                if (type === 'spy') continue;
                if (isPointOnLine({x: x1, y: y1}, {x: x2, y: y2}, {x, y}, CONNECTION_LINE_WIDTH * 3)) {
                    tooltip = {type: 'connection', from, to, encrypted: type === 'encrypted'};
                    return;
                }
            }
            tooltip = {type: 'none'};
        } else {
            tooltip = {type: 'tower', index: hovering.index};
        }
    }

    function onPointerDown(event: PointerEvent) {
        if (levelComplete || !overlay.contains(event.target as Node)) return;

        const {offsetX: x, offsetY: y} = event;
        pointerPosition = {x, y};

        if (editor.type === 'menu') {
            const closest = getClosest(EDITOR_LIBRARY_DRAGGABLES, x, y);
            if (closest !== undefined) {
                if (closest.type === 'wall1' || closest.type === 'wall2') {
                    if (level.walls.length >= MAX_WALLS) return;
                    level.walls.push({
                        x1: closest.type === 'wall1' ? x : closest.otherX,
                        y1: closest.type === 'wall1' ? y : closest.otherY,
                        x2: closest.type === 'wall1' ? closest.otherX : x,
                        y2: closest.type === 'wall1' ? closest.otherY : y,
                        fixed1: closest.fixed1,
                        fixed2: closest.fixed2,
                    });
                    dragging = {type: closest.type, index: level.walls.length - 1};
                } else {
                    if (level.towers.length > MAX_TOWERS) return;
                    level.towers.push({type: closest.type as Tower['type'], x: x, y: y});
                    dragging = {type: 'tower', index: level.towers.length - 1};
                }
                setOverlay(``);
                editor = {type: 'editing'};
                updateConnectionGraph();
            } else if ((event.target as HTMLElement).tagName !== 'BUTTON') {
                editor = {type: 'editing'};
                setEditorOverlay();
            }
            return;
        }

        if (event.target !== overlay) return;

        const closest = getClosest(generateDraggables(editor.type === 'editing'), x, y, DRAG_EXTRA_RADIUS);

        if (closest !== undefined) {
            // Clear the overlay to make room for the trash cans
            if (editor.type === 'editing') setOverlay(``);

            dragging = closest;
            tooltip = {type: 'none'};
            return;
        }

        if (event.pointerType !== 'mouse') updateTooltip(x, y);
    }

    function onPointerMove(event: PointerEvent) {
        const {offsetX: x, offsetY: y} = event;
        pointerPosition = {x, y};

        if (editor.type === 'menu') {
            const closest = getClosest(EDITOR_LIBRARY_DRAGGABLES, x, y);
            overlay.style.cursor =
                !levelComplete &&
                closest !== undefined &&
                ((closest.type.startsWith('wall') && level.walls.length < MAX_WALLS) ||
                    (!closest.type.startsWith('wall') && level.towers.length < MAX_TOWERS))
                    ? 'grab'
                    : '';
        } else {
            const closest = getClosest(generateDraggables(false), x, y);
            overlay.style.cursor = !levelComplete && closest !== undefined ? 'grab' : '';
            if (closest === undefined && dragging === undefined) {
                updateTooltip(x, y);
                return;
            }
        }

        if (dragging === undefined || event.target !== overlay) return;
        if (dragging.type === 'wall1') {
            const radius = level.walls[dragging.index].fixed1 ? 0 : WALL_HANDLE_RADIUS;
            level.walls[dragging.index].x1 = Math.floor(clamp(x, radius, canvas.width - radius));
            level.walls[dragging.index].y1 = Math.floor(clamp(y, radius, canvas.width - radius));
        } else if (dragging.type === 'wall2') {
            const radius = level.walls[dragging.index].fixed2 ? 0 : WALL_HANDLE_RADIUS;
            level.walls[dragging.index].x2 = Math.floor(clamp(x, radius, canvas.width - radius));
            level.walls[dragging.index].y2 = Math.floor(clamp(y, radius, canvas.width - radius));
        } else {
            const tower = level.towers[dragging.index];
            const radius = tower.type === 'large repeater' ? LARGE_REPEATER_RADIUS : SMALL_REPEATER_RADIUS;
            tower.x = Math.floor(clamp(x, radius, canvas.width - radius));
            tower.y = Math.floor(clamp(y, radius, canvas.height - radius));
        }
        updateConnectionGraph();
    }

    function onPointerUp(event: PointerEvent) {
        if ((event.target as HTMLElement).tagName === 'BUTTON') return;
        if (editor.type === 'editing' && dragging !== undefined && pointerPosition.x < 80 && pointerPosition.y < 45) {
            if (dragging.type === 'tower') {
                if (level.towers[dragging.index].type === 'start') {
                    level.towers[dragging.index].x = canvas.width / 2;
                    level.towers[dragging.index].y = canvas.height / 2;
                } else level.towers.splice(dragging.index, 1);
            } else {
                level.walls.splice(dragging.index, 1);
            }
            updateConnectionGraph();
        }
        dragging = undefined;
        if (['editing', 'menu'].includes(editor.type)) {
            storage.set('editorLevel', serializeLevel());
            setEditorOverlay();
        }
        checkWin();
    }

    context.lineCap = 'round';
    requestAnimationFrame(draw);
    openMenu();

    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('pointermove', onPointerMove);
    document.addEventListener('pointerup', onPointerUp);
    musicAudio.play();
    return () => {
        done = true;
        document.removeEventListener('pointerdown', onPointerDown);
        document.removeEventListener('pointermove', onPointerMove);
        document.removeEventListener('pointerup', onPointerUp);
        musicAudio.pause();
    };
}
