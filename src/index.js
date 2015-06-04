import '../cssnext/index.css';
import * as SPWidget from './widget';

const elements = document.querySelectorAll('.sb-soundplayer-widget');

for (let i = 0, len = elements.length; i < len; i++) {
    const el = elements[i];
    const url = el.getAttribute('data-url');
    const layout = el.getAttribute('data-layout');

    SPWidget.create(el, { url, layout });
}
