import * as SPWidget from './widget';

// optionally append styles
// const cssUrl = window.sb_soundplayer_css_url;
// if (cssUrl) {
//     const head = document.getElementsByTagName('head')[0];
//     const css = document.createElement('link');
//     css.id = 'sb-soundplayer-widget-style';
//     css.setAttribute('rel', 'stylesheet');
//     css.setAttribute('type', 'text/css');
//     css.setAttribute('href', cssUrl);
//     head.appendChild(css);
// }

const elements = document.querySelectorAll('.sb-soundplayer-widget');

for (let i = 0, len = elements.length; i < len; i++) {
    const el = elements[i];
    const url = el.getAttribute('data-url');
    const layout = el.getAttribute('data-layout');

    SPWidget.create(el, { url, layout });
}
