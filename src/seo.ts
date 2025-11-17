import {GameMetadata} from './gameMetadata.ts';

const BASE_URL = 'https://gotm.doteye.online';

export function updateMetaTags(metadata: GameMetadata) {
    // Update page title
    document.title = metadata.title;

    // Update or create meta description
    updateMetaTag('name', 'description', metadata.description);

    // Update Open Graph tags
    updateMetaTag('property', 'og:title', metadata.title);
    updateMetaTag('property', 'og:description', metadata.description);
    updateMetaTag('property', 'og:url', `${BASE_URL}${metadata.path}`);

    // Update Twitter Card tags
    updateMetaTag('name', 'twitter:card', 'summary_large_image');
    updateMetaTag('name', 'twitter:title', metadata.title);
    updateMetaTag('name', 'twitter:description', metadata.description);
    updateMetaTag('name', 'twitter:image', `${BASE_URL}/ogImage.png`);

    // Update canonical URL
    updateCanonicalLink(`${BASE_URL}${metadata.path}`);
}

function updateMetaTag(attr: 'name' | 'property', value: string, content: string) {
    let element = document.querySelector(`meta[${attr}="${value}"]`);
    if (!element) {
        element = document.createElement('meta');
        element.setAttribute(attr, value);
        document.head.appendChild(element);
    }
    element.setAttribute('content', content);
}

function updateCanonicalLink(url: string) {
    let link = document.querySelector('link[rel="canonical"]') as HTMLLinkElement;
    if (!link) {
        link = document.createElement('link');
        link.rel = 'canonical';
        document.head.appendChild(link);
    }
    link.href = url;
}
