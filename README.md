# <img src="http://www.officialpsds.com/images/thumbs/Soundcloud-Logo-psd47614.png" width="75" align="left">&nbsp;Embeddable SoundCloud Players

[![npm version](http://badge.fury.io/js/soundplayer-widget.svg)](http://badge.fury.io/js/soundplayer-widget)
[![Dependency Status](http://david-dm.org/soundblogs/embed-soundplayer-widget.svg)](http://david-dm.org/soundblogs/embed-soundplayer-widget)

<!-- [![Download Count](http://img.shields.io/npm/dm/soundplayer-widget.svg?style=flat)](http://www.npmjs.com/package/soundplayer-widget) -->

<!-- ![](http://img.shields.io/badge/Status-Work%20In%20Progress-FA572C.svg?style=flat-square) -->

> The proof of concept in building of component-based, high-quality embeddable widgets. Under the hood **Soundplayer Widget** consists of [Deku](https://github.com/segmentio/deku) for components and [SoundCloud Audio](https://github.com/voronianski/soundcloud-audio.js) for HTML5 Audio API.

<!-- ### [Get Player Online](http://labs.voronianski.com/soundplayer-widget-generator) -->

## Manual Setup 

**I.** Register for an app and get SoundCloud API clientId at https://developers.soundcloud.com.

**II.** Include the script into your html page:

```html
<script>
/* * * CONFIGURATION VARIABLES * * */
var sb_soundplayer_client_id = 'YOUR_CLIENT_ID';

/* * * DON'T EDIT BELOW THIS LINE * * */
(function(d, s, id, cdn) {
    var js, css, fjs = d.getElementsByTagName(s)[0];
    if (d.getElementById(id)) return;
    js = d.createElement(s);
    js.id = id;
    js.src = cdn+'/soundplayer-widget.min.js';
    css = d.createElement('link');
    css.setAttribute('rel', 'stylesheet');
    css.setAttribute('type', 'text/css');
    css.setAttribute('href', cdn+'/soundplayer-widget.min.css');
    fjs.parentNode.insertBefore(css, fjs)
    fjs.parentNode.insertBefore(js, fjs);
})(document, 'script', 'sb-soundplayer-widget-sdk', '//cdnjs.cloudflare.com/ajax/libs/soundplayer-widget/0.1.1');
</script>
```

**III.** Insert widget into the place where you want it to be shown on the page with necessary SoundCloud track or playlist link in `data-url`:

```html
<div data-url="https://soundcloud.com/shura/shura-indecision-12-edit-1" class="sb-soundplayer-widget"></div>
```

**IV.** Enjoy! :sunglasses: :fireworks: :dancer:

===
Soundplayer Widget is also available on [npm](https://www.npmjs.com/package/soundplayer-widget):

```bash
npm install soundplayer-widget --save
```

## Why Deku and not React?!

Article on this topic (and about the whole process of development) is coming soon..

## Browser support

Dependency on [Deku](https://github.com/segmentio/deku) which (due to its' tiny size) doesn't support legacy [browsers](https://github.com/segmentio/deku/#tests) means that _SoundPlayer_ has the same range of supported browsers.

![Chrome](https://raw.github.com/alrra/browser-logos/master/chrome/chrome_48x48.png) | ![Firefox](https://raw.github.com/alrra/browser-logos/master/firefox/firefox_48x48.png) | ![IE](https://raw.github.com/alrra/browser-logos/master/internet-explorer/internet-explorer_48x48.png) | ![Safari](https://raw.github.com/alrra/browser-logos/master/safari/safari_48x48.png)
--- | --- | --- | --- | --- |
39+ ✔ | 34+ ✔ | 10+ ✔ | 7+ ✔ |

## To Do

- [ ] playlists support
- [ ] support for multiple different style layouts
- [ ] global SDK object (for purposes like subscribe to audio events etc.)

Have a [suggestion](https://github.com/soundblogs/embed-soundplayer-widget/issues)?

---

**MIT Licensed**
