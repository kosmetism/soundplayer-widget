# Embedded Soundplayer Widget

![](http://img.shields.io/badge/Status-Work%20In%20Progress-FA572C.svg?style=flat)

Include the script into your html page:

```html
<script>
(function(d, s, id) {
   var js, fjs = d.getElementsByTagName(s)[0];
   if (d.getElementById(id)) return;
   js = d.createElement(s);
   js.id = id;
   js.src = "http://cdn/path/to/soundplayer-widget.min.js";
   fjs.parentNode.insertBefore(js, fjs);
})(document, 'script', 'soundplayer-widget');
</script>
```
