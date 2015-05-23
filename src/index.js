// query all elements with class `.soundplayer-widget`
// get `data-url` and `data-layout` attrs of every element
// pass data to constructor function and render deku widget

import * as SPWidget from './widget';

let elements = document.querySelectorAll('.sb-soundplayer-widget');

for (let i = 0, len = elements.length; i < len; i++) {
    let el = elements[i];

    let url = el.getAttribute('data-url');
    let layout = el.getAttribute('data-layout');

    SPWidget.create(el, { url, layout });
}
