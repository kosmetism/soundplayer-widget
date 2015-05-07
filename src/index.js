// query all elements with class `.soundplayer-widget`
// get `data-url` and `data-layout` attrs of every element
// pass data to constructor function and render deku widget

import * as SPWidget from './widget';

let elements = document.querySelectorAll('.soundplayer-widget');

for (let i = 0, len = elements.length; i < len; i++) {
    let el = elements[i];

    SPWidget.create(el, {
        url: el.getAttribute('data-url'),
        layout: el.getAttribute('data-layout')
    });
}
