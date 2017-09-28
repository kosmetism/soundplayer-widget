# <img src="http://www.officialpsds.com/images/thumbs/Soundcloud-Logo-psd47614.png" width="75" align="left">&nbsp;Embeddable SoundCloud Players

[![npm version](http://badge.fury.io/js/soundplayer-widget.svg)](http://badge.fury.io/js/soundplayer-widget)
[![Dependency Status](http://david-dm.org/soundblogs/soundplayer-widget.svg)](http://david-dm.org/soundblogs/soundplayer-widget)
[![Download Count](http://img.shields.io/npm/dm/soundplayer-widget.svg?style=flat)](http://www.npmjs.com/package/soundplayer-widget)

> The proof of concept in building of component-based, high-quality embeddable widgets. Under the hood **Soundplayer Widget** consists of [deku.js](https://github.com/segmentio/deku) for [components](https://github.com/soundblogs/deku-soundplayer) and [soundcloud-audio.js](https://github.com/voronianski/soundcloud-audio.js) for HTML5 Audio API.

### [Demo](http://labs.voronianski.com/get-soundplayer)

## Manual Setup 

**I.** Register for an app and get SoundCloud API clientId at https://developers.soundcloud.com.

**II.** Include the script into your html page:

```html
<script>
/* * * CONFIGURATION VARIABLES * * */
var sb_soundplayer_client_id = 'YOUR_CLIENT_ID';

/* * * DON'T EDIT BELOW THIS LINE * * */
(function(d, s, id) {
    if (d.getElementById(id)) return;
    var fjs = d.getElementsByTagName(s)[0],
        js = fjs.parentNode.insertBefore(d.createElement(s), fjs);
    js.id = id;
    js.src = '//cdnjs.cloudflare.com/ajax/libs/soundplayer-widget/0.4.2/soundplayer-widget.min.js';
})(document, 'script', 'sb-soundplayer-widget-sdk');
</script>
```

**III.** Insert widget into the place where you want it to be shown on the page with necessary SoundCloud track or playlist link in `data-url`:

```html
<div data-url="https://soundcloud.com/shura/shura-indecision-12-edit-1" class="sb-soundplayer-widget"></div>
```

**IV.** Enjoy! :sunglasses: :fireworks: :dancer:

##### Soundplayer Widget is also available on [npm](https://www.npmjs.com/package/soundplayer-widget):

```bash
npm install soundplayer-widget --save
```

## Browser support

Dependency on [Deku](https://github.com/segmentio/deku) which (due to its' tiny size) doesn't support legacy [browsers](https://github.com/segmentio/deku/#tests). It means that _SoundPlayer_ has the same range of supported browsers:

Chrome | Firefox | IE/Edge | Safari
--- | --- | --- | --- | --- 
39+ ✔ | 34+ ✔ | 10+ ✔ | 7+ ✔

Markdown | Less | Pretty
--- | --- | ---
*Still* | `renders` | **nicely**
1 | 2 | 3

---

**MIT Licensed**
