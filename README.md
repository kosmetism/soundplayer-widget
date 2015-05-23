# Embeddable SoundCloud Players

![](http://img.shields.io/badge/Status-Work%20In%20Progress-FA572C.svg?style=flat-square)

> The proof-of-concept of modern component-based and functional approaches in order to build high-quality customized embeddable widgets. Under the hood of **Soundplayer Widget**  there are [Deku](https://github.com/segmentio/deku) for components and [SoundCloud Audio](https://github.com/voronianski/soundcloud-audio.js) for HTML5 Audio API.

### [Online Generator](http://labs.voronianski.com/soundplayer-widget-generator)

## Manual Setup 

**I.** Get SoundCloud API client id from https://developers.soundcloud.com.

**II.** Include the script into your html page:

```html
<script>
/* * * CONFIGURATION VARIABLES * * */
var sb_soundplayer_client_id = 'YOUR-CLIENT-ID';

/* * * DON'T EDIT BELOW THIS LINE * * */
(function(d, s, id) {
    var js, fjs = d.getElementsByTagName(s)[0];
    if (d.getElementById(id)) return;
    js = d.createElement(s);
    js.id = id;
    js.src = "http://cdn/path/to/soundplayer-widget.min.js";
    fjs.parentNode.insertBefore(js, fjs);
})(document, 'script', 'sb-soundplayer-widget-sdk');
</script>
```

**III.** Insert widget into the place where you want it to be shown on the page with necessary SoundCloud track or playlist link in `data-url`:

```html
<div data-url="https://soundcloud.com/shura/shura-indecision-12-edit-1" class="sb-soundplayer-widget"></div>
```

**IV.** Enjoy! :sunglasses: :fireworks: :dancer:

## Why Deku and not React?!

Article on this topic (and about the whole process of development) is coming soon..

## Browser support

Dependency on [Deku](https://github.com/segmentio/deku) which (due to its' tiny size) doesn't support legacy [browsers](https://github.com/segmentio/deku/#tests) means that _SoundPlayer_ has the same range of supported browsers.

![Chrome](https://raw.github.com/alrra/browser-logos/master/chrome/chrome_48x48.png) | ![Firefox](https://raw.github.com/alrra/browser-logos/master/firefox/firefox_48x48.png) | ![IE](https://raw.github.com/alrra/browser-logos/master/internet-explorer/internet-explorer_48x48.png) | ![Safari](https://raw.github.com/alrra/browser-logos/master/safari/safari_48x48.png)
--- | --- | --- | --- | --- |
39+ ✔ | 34+ ✔ | 10+ ✔ | 7+ ✔ |

## To Do

- [ ] support for multiple different style layouts
- [ ] global SDK object (for purposes like subscribe to audio events etc.)

Have a [suggestion](https://github.com/soundblogs/embed-soundplayer-widget/issues)?

---

**MIT Licensed**
