import januaryLogo from './games/january/logo.webp';
import februaryLogo from './games/february/logo.webp';
import marchLogo from './games/march/logo.webp';
import aprilLogo from './games/april/logo.png';
import mayLogo from './games/may/logo.webp';
import juneLogo from './games/june/logo.webp';

const preloaded = [];
function preloadImage(src: string) {
    const image = new Image();
    image.src = src;
    preloaded.push(image);
}

export function preload() {
    preloadImage(januaryLogo);
    preloadImage(februaryLogo);
    preloadImage(marchLogo);
    preloadImage(aprilLogo);
    preloadImage(mayLogo);
    preloadImage(juneLogo);
}
