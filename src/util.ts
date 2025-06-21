import {audioContext, musicGain} from './audio.ts';

export function randomInt(min: number, max: number, generator: () => number = Math.random) {
    return Math.floor(generator() * (max - min + 1)) + min;
}

export function choice<T>(array: T[], generator: () => number = Math.random) {
    return array[randomInt(0, array.length - 1, generator)];
}

export function weightedChoice<T>(array: T[], weights: number[], generator: () => number = Math.random) {
    let random = generator();
    for (const [index, item] of array.entries()) {
        if (random < weights[index]) return item;
        random -= weights[index];
    }
    return array.at(-1)!;
}

export function distance(x1: number, y1: number, x2: number, y2: number) {
    return Math.sqrt((x1 - x2) ** 2 + (y1 - y2) ** 2);
}

export function clamp(value: number, min: number, max: number) {
    return Math.max(Math.min(value, max), min);
}

function isCounterClockwise(l1x1: number, l1y1: number, l1x2: number, l1y2: number, l2x1: number, l2y1: number) {
    return (l2y1 - l1y1) * (l1x2 - l1x1) > (l1y2 - l1y1) * (l2x1 - l1x1);
}

export function linesIntersect(
    l1x1: number,
    l1y1: number,
    l1x2: number,
    l1y2: number,
    l2x1: number,
    l2y1: number,
    l2x2: number,
    l2y2: number,
) {
    // Inspired by https://stackoverflow.com/questions/3838329
    return (
        isCounterClockwise(l1x1, l1y1, l2x1, l2y1, l2x2, l2y2) !==
            isCounterClockwise(l1x2, l1y2, l2x1, l2y1, l2x2, l2y2) &&
        isCounterClockwise(l1x1, l1y1, l1x2, l1y2, l2x1, l2y1) !==
            isCounterClockwise(l1x1, l1y1, l1x2, l1y2, l2x2, l2y2)
    );
}

function getLineIntersectionPoint(
    l1x1: number,
    l1y1: number,
    l1x2: number,
    l1y2: number,
    l2x1: number,
    l2y1: number,
    l2x2: number,
    l2y2: number,
): {x: number; y: number} | undefined {
    const denominator = (l2y2 - l2y1) * (l1x2 - l1x1) - (l2x2 - l2x1) * (l1y2 - l1y1);
    if (Math.abs(denominator) < 1e-10) return undefined;
    const intersection1 = ((l2x2 - l2x1) * (l1y1 - l2y1) - (l2y2 - l2y1) * (l1x1 - l2x1)) / denominator;
    const intersection2 = ((l1x2 - l1x1) * (l1y1 - l2y1) - (l1y2 - l1y1) * (l1x1 - l2x1)) / denominator;
    if (intersection1 < 0 || intersection1 > 1 || intersection2 < 0 || intersection2 > 1) return undefined;
    return {x: l1x1 + intersection1 * (l1x2 - l1x1), y: l1y1 + intersection1 * (l1y2 - l1y1)};
}

export function getRectangleIntersection(
    lineX1: number,
    lineY1: number,
    lineX2: number,
    lineY2: number,
    x: number,
    y: number,
    width: number,
    height: number,
) {
    const result = [
        {point: getLineIntersectionPoint(lineX1, lineY1, lineX2, lineY2, x, y, x + width, y), type: 'y'},
        {
            point: getLineIntersectionPoint(lineX1, lineY1, lineX2, lineY2, x + width, y, x + width, y + height),
            type: 'x',
        },
        {
            point: getLineIntersectionPoint(lineX1, lineY1, lineX2, lineY2, x + width, y + height, x, y + height),
            type: 'y',
        },
        {point: getLineIntersectionPoint(lineX1, lineY1, lineX2, lineY2, x, y + height, x, y), type: 'x'},
    ]
        .filter(({point}) => point !== undefined)
        .map(({point, type}) => ({
            point: point!,
            type: type as 'x' | 'y',
            distance: distance(lineX1, lineY1, point!.x, point!.y),
        }))
        .sort((a, b) => a.distance - b.distance);
    if (result.length === 0) return;
    return {
        ...result[0],
        corner:
            result.length >= 2 && result[0].point.x === result[1].point.x && result[0].point.y === result[1].point.y,
    };
}

export function isPointOnLine(
    a: {x: number; y: number},
    b: {x: number; y: number},
    point: {x: number; y: number},
    width: number,
) {
    // Inspired by a result from Google's overview
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const lineLengthSquared = dx * dx + dy * dy;

    const t =
        lineLengthSquared > 0
            ? Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / lineLengthSquared))
            : 0;
    const x = a.x + t * dx;
    const y = a.y + t * dy;

    return Math.sqrt((point.x - x) * (point.x - x) + (point.y - y) * (point.y - y)) <= width / 2;
}

function parseColor(color: string) {
    return color
        .slice(1)
        .match(/.{2}/g)!
        .map(value => parseInt(value, 16));
}

export function interpolateColor(a: string, b: string, amount: number) {
    return `rgb(${parseColor(a).map((value, i) => {
        const other = parseColor(b)[i];
        return Math.round(value + (other - value) * amount);
    })})`;
}

export function modulo(a: number, b: number) {
    return ((a % b) + b) % b;
}

export function setupBufferSource(buffer: AudioBuffer, when?: number) {
    const gain = audioContext.createGain();
    gain.gain.value = 0;
    gain.connect(musicGain);

    const source = audioContext.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    source.connect(gain);
    source.start(when);

    return {source, gain};
}
