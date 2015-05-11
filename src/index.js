// query all elements with class `.soundplayer-widget`
// get `data-url` and `data-layout` attrs of every element
// pass data to constructor function and render deku widget

import * as SPWidget from './widget';
import SoundCloudAudio from 'soundcloud-audio';

let elements = document.querySelectorAll('.sb-soundplayer-widget');

let audioStore = [];

for (let i = 0, len = elements.length; i < len; i++) {
    let el = elements[i];
    let clientId = el.getAttribute('data-clientid');
    let url = el.getAttribute('data-url');
    let soundCloudAudio = new SoundCloudAudio(clientId);

    audioStore.push({ url, soundCloudAudio });

    SPWidget.create(el, { url, soundCloudAudio });
}
