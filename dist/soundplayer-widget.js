/******/ (function(modules) { // webpackBootstrap
/******/ 	// The module cache
/******/ 	var installedModules = {};

/******/ 	// The require function
/******/ 	function __webpack_require__(moduleId) {

/******/ 		// Check if module is in cache
/******/ 		if(installedModules[moduleId])
/******/ 			return installedModules[moduleId].exports;

/******/ 		// Create a new module (and put it into the cache)
/******/ 		var module = installedModules[moduleId] = {
/******/ 			exports: {},
/******/ 			id: moduleId,
/******/ 			loaded: false
/******/ 		};

/******/ 		// Execute the module function
/******/ 		modules[moduleId].call(module.exports, module, module.exports, __webpack_require__);

/******/ 		// Flag the module as loaded
/******/ 		module.loaded = true;

/******/ 		// Return the exports of the module
/******/ 		return module.exports;
/******/ 	}


/******/ 	// expose the modules object (__webpack_modules__)
/******/ 	__webpack_require__.m = modules;

/******/ 	// expose the module cache
/******/ 	__webpack_require__.c = installedModules;

/******/ 	// __webpack_public_path__
/******/ 	__webpack_require__.p = "";

/******/ 	// Load entry module and return exports
/******/ 	return __webpack_require__(0);
/******/ })
/************************************************************************/
/******/ ([
/* 0 */
/***/ function(module, exports, __webpack_require__) {

	'use strict';

	function _interopRequireWildcard(obj) { if (obj && obj.__esModule) { return obj; } else { var newObj = {}; if (obj != null) { for (var key in obj) { if (Object.prototype.hasOwnProperty.call(obj, key)) newObj[key] = obj[key]; } } newObj['default'] = obj; return newObj; } }

	__webpack_require__(1);

	var _widget = __webpack_require__(5);

	var SPWidget = _interopRequireWildcard(_widget);

	var elements = document.querySelectorAll('.sb-soundplayer-widget');

	for (var i = 0, len = elements.length; i < len; i++) {
	    var el = elements[i];
	    var url = el.getAttribute('data-url');
	    var layout = el.getAttribute('data-layout');

	    SPWidget.create(el, { url: url, layout: layout });
	}

/***/ },
/* 1 */
/***/ function(module, exports, __webpack_require__) {

	// style-loader: Adds some css to the DOM by adding a <style> tag

	// load the styles
	var content = __webpack_require__(2);
	if(typeof content === 'string') content = [[module.id, content, '']];
	// add the styles to the DOM
	var update = __webpack_require__(4)(content, {"singleton":true});
	if(content.locals) module.exports = content.locals;
	// Hot Module Replacement
	if(false) {
		// When the styles change, update the <style> tags
		if(!content.locals) {
			module.hot.accept("!!./../node_modules/css-loader/index.js!./../node_modules/cssnext-loader/index.js!./index.css", function() {
				var newContent = require("!!./../node_modules/css-loader/index.js!./../node_modules/cssnext-loader/index.js!./index.css");
				if(typeof newContent === 'string') newContent = [[module.id, newContent, '']];
				update(newContent);
			});
		}
		// When the module is disposed, remove the <style> tags
		module.hot.dispose(function() { update(); });
	}

/***/ },
/* 2 */
/***/ function(module, exports, __webpack_require__) {

	exports = module.exports = __webpack_require__(3)();
	exports.push([module.id, ".sb-soundplayer-widget {\n    color: #fff;\n    font-family: 'Avenir Next', 'Helvetica Neue', 'Helvetica', Arial, sans-serif;\n    background-color: #f5f5f5;\n    background-image: url('https://w.soundcloud.com/player/assets/images/logo-200x120-177df3dd.png');\n    background-repeat: no-repeat;\n    background-position: center center;\n    background-size: 100px 60px;\n    min-height: 240px;\n    overflow: hidden;\n    position: relative;\n    box-sizing: border-box;\n    border-radius: 3px;\n}\n.sb-soundplayer-widget *,\n.sb-soundplayer-widget *:before,\n.sb-soundplayer-widget *:after {\n    box-sizing: inherit;\n    margin: 0;\n    padding: 0;\n}\n.sb-soundplayer-widget-track-info {\n    color: #fff;\n    position: relative;\n    z-index: 1;\n    text-align: center;\n    padding-top: 80px;\n    padding-bottom: 45px;\n    text-transform: uppercase;\n    letter-spacing: .1em;\n}\n.sb-soundplayer-widget-user,\n.sb-soundplayer-widget-title {\n    margin: 5px 0;\n    -webkit-user-select: none;\n       -moz-user-select: none;\n        -ms-user-select: none;\n            user-select: none;\n    cursor: default;\n}\n.sb-soundplayer-widget-user {\n    font-size: 14px;\n}\n.sb-soundplayer-widget-title {\n    font-size: 20px;\n}\n.sb-soundplayer-widget-controls {\n    display: -webkit-box;\n    display: -webkit-flex;\n    display: -ms-flexbox;\n    display: flex;\n    -webkit-box-align: center;\n    -webkit-align-items: center;\n        -ms-flex-align: center;\n            align-items: center;\n    padding: 0 10px 15px;\n    position: relative;\n    z-index: 1;\n}\n.sb-soundplayer-widget-progress-container {\n    background-color: #000000;\n    background-color: rgba(0, 0, 0, .25);\n    width: 100%;\n    height: 8px;\n    overflow: hidden;\n    cursor: pointer;\n    border-radius: 3px;\n}\n.sb-soundplayer-widget-progress-inner {\n    background-color: #fff;\n    height: 100%;\n    -webkit-transition: width .2s ease-in;\n            transition: width .2s ease-in;\n}\n.sb-soundplayer-widget-cover {\n    background-position: center;\n    background-repeat: no-repeat;\n    background-size: cover;\n    border-radius: 3px;\n    position: relative;\n    min-height: 240px;\n}\n.sb-soundplayer-widget-overlay {\n    background-color: #000000;\n    background-color: rgba(0, 0, 0, .3);\n    position: absolute;\n    top: 0;\n    left: 0;\n    right: 0;\n    bottom: 0;\n    border-radius: 3px;\n}\n.sb-soundplayer-widget-play {\n    display: inline-block;\n    border: 1px solid transparent;\n    color: #fff;\n    font-size: 20px;\n    text-decoration: none;\n    line-height: 1;\n    padding: 8px 16px;\n    height: auto;\n    vertical-align: middle;\n    -webkit-box-flex: 0;\n    -webkit-flex: none;\n        -ms-flex: none;\n            flex: none;\n    margin-right: 12px;\n    position: relative;\n    z-index: 2;\n    background-color: transparent;\n    -webkit-transition-duration: .1s;\n            transition-duration: .1s;\n    -webkit-transition-timing-function: ease-out;\n            transition-timing-function: ease-out;\n    -webkit-transition-property: box-shadow;\n            transition-property: box-shadow;\n    -webkit-appearance: none;\n    border-radius: 3px;\n    cursor: pointer;\n}\n.sb-soundplayer-widget-play:before {\n    content: '';\n    display: block;\n    border: 1px solid transparent;\n    background-color: currentcolor;\n    position: absolute;\n    z-index: -1;\n    top: -1px;\n    right: -1px;\n    bottom: -1px;\n    left: -1px;\n    -webkit-transition-duration: .1s;\n            transition-duration: .1s;\n    -webkit-transition-timing-function: ease-out;\n            transition-timing-function: ease-out;\n    -webkit-transition-property: opacity;\n            transition-property: opacity;\n    opacity: 0;\n    border-radius: 3px;\n}\n.sb-soundplayer-widget-play:hover,\n.sb-soundplayer-widget-play:active {\n  box-shadow: none;\n}\n.sb-soundplayer-widget-play:hover:before,\n.sb-soundplayer-widget-play:focus:before {\n    opacity: .09375;\n}\n.sb-soundplayer-widget-play:focus {\n    outline: none;\n    border-color: transparent;\n    box-shadow: 0 0 0 2px;\n}\n.sb-soundplayer-widget-button-icon {\n    width: 1em;\n    height: 1em;\n    position: relative;\n    vertical-align: middle;\n}\n.sb-soundplayer-widget-cover-logo {\n    color: #fff;\n    width: 100px;\n    height: 14px;\n    position: absolute;\n    top: 10px;\n    right: 10px;\n    z-index: 1;\n}\n.sb-soundplayer-widget-timer {\n    -webkit-box-flex: 0;\n    -webkit-flex: none;\n        -ms-flex: none;\n            flex: none;\n    color: #fff;\n    font-size: 12px;\n    padding: 0 3px 0 15px;\n    -webkit-user-select: none;\n       -moz-user-select: none;\n        -ms-user-select: none;\n            user-select: none;\n    cursor: default;\n}\n.sb-soundplayer-widget-message {\n    color: #999;\n    font-size: 12px;\n    text-align: center;\n    position: absolute;\n    right: 0;\n    left: 0;\n    bottom: 10px;\n}\n.sb-soundplayer-widget-message a {\n    color: #666;\n}\n", ""]);

/***/ },
/* 3 */
/***/ function(module, exports, __webpack_require__) {

	/*
		MIT License http://www.opensource.org/licenses/mit-license.php
		Author Tobias Koppers @sokra
	*/
	// css base code, injected by the css-loader
	module.exports = function() {
		var list = [];

		// return the list of modules as css string
		list.toString = function toString() {
			var result = [];
			for(var i = 0; i < this.length; i++) {
				var item = this[i];
				if(item[2]) {
					result.push("@media " + item[2] + "{" + item[1] + "}");
				} else {
					result.push(item[1]);
				}
			}
			return result.join("");
		};

		// import a list of modules into the list
		list.i = function(modules, mediaQuery) {
			if(typeof modules === "string")
				modules = [[null, modules, ""]];
			var alreadyImportedModules = {};
			for(var i = 0; i < this.length; i++) {
				var id = this[i][0];
				if(typeof id === "number")
					alreadyImportedModules[id] = true;
			}
			for(i = 0; i < modules.length; i++) {
				var item = modules[i];
				// skip already imported module
				// this implementation is not 100% perfect for weird media query combinations
				//  when a module is imported multiple times with different media queries.
				//  I hope this will never occur (Hey this way we have smaller bundles)
				if(typeof item[0] !== "number" || !alreadyImportedModules[item[0]]) {
					if(mediaQuery && !item[2]) {
						item[2] = mediaQuery;
					} else if(mediaQuery) {
						item[2] = "(" + item[2] + ") and (" + mediaQuery + ")";
					}
					list.push(item);
				}
			}
		};
		return list;
	};


/***/ },
/* 4 */
/***/ function(module, exports, __webpack_require__) {

	/*
		MIT License http://www.opensource.org/licenses/mit-license.php
		Author Tobias Koppers @sokra
	*/
	var stylesInDom = {},
		memoize = function(fn) {
			var memo;
			return function () {
				if (typeof memo === "undefined") memo = fn.apply(this, arguments);
				return memo;
			};
		},
		isOldIE = memoize(function() {
			return /msie [6-9]\b/.test(window.navigator.userAgent.toLowerCase());
		}),
		getHeadElement = memoize(function () {
			return document.head || document.getElementsByTagName("head")[0];
		}),
		singletonElement = null,
		singletonCounter = 0;

	module.exports = function(list, options) {
		if(false) {
			if(typeof document !== "object") throw new Error("The style-loader cannot be used in a non-browser environment");
		}

		options = options || {};
		// Force single-tag solution on IE6-9, which has a hard limit on the # of <style>
		// tags it will allow on a page
		if (typeof options.singleton === "undefined") options.singleton = isOldIE();

		var styles = listToStyles(list);
		addStylesToDom(styles, options);

		return function update(newList) {
			var mayRemove = [];
			for(var i = 0; i < styles.length; i++) {
				var item = styles[i];
				var domStyle = stylesInDom[item.id];
				domStyle.refs--;
				mayRemove.push(domStyle);
			}
			if(newList) {
				var newStyles = listToStyles(newList);
				addStylesToDom(newStyles, options);
			}
			for(var i = 0; i < mayRemove.length; i++) {
				var domStyle = mayRemove[i];
				if(domStyle.refs === 0) {
					for(var j = 0; j < domStyle.parts.length; j++)
						domStyle.parts[j]();
					delete stylesInDom[domStyle.id];
				}
			}
		};
	}

	function addStylesToDom(styles, options) {
		for(var i = 0; i < styles.length; i++) {
			var item = styles[i];
			var domStyle = stylesInDom[item.id];
			if(domStyle) {
				domStyle.refs++;
				for(var j = 0; j < domStyle.parts.length; j++) {
					domStyle.parts[j](item.parts[j]);
				}
				for(; j < item.parts.length; j++) {
					domStyle.parts.push(addStyle(item.parts[j], options));
				}
			} else {
				var parts = [];
				for(var j = 0; j < item.parts.length; j++) {
					parts.push(addStyle(item.parts[j], options));
				}
				stylesInDom[item.id] = {id: item.id, refs: 1, parts: parts};
			}
		}
	}

	function listToStyles(list) {
		var styles = [];
		var newStyles = {};
		for(var i = 0; i < list.length; i++) {
			var item = list[i];
			var id = item[0];
			var css = item[1];
			var media = item[2];
			var sourceMap = item[3];
			var part = {css: css, media: media, sourceMap: sourceMap};
			if(!newStyles[id])
				styles.push(newStyles[id] = {id: id, parts: [part]});
			else
				newStyles[id].parts.push(part);
		}
		return styles;
	}

	function createStyleElement() {
		var styleElement = document.createElement("style");
		var head = getHeadElement();
		styleElement.type = "text/css";
		head.appendChild(styleElement);
		return styleElement;
	}

	function createLinkElement() {
		var linkElement = document.createElement("link");
		var head = getHeadElement();
		linkElement.rel = "stylesheet";
		head.appendChild(linkElement);
		return linkElement;
	}

	function addStyle(obj, options) {
		var styleElement, update, remove;

		if (options.singleton) {
			var styleIndex = singletonCounter++;
			styleElement = singletonElement || (singletonElement = createStyleElement());
			update = applyToSingletonTag.bind(null, styleElement, styleIndex, false);
			remove = applyToSingletonTag.bind(null, styleElement, styleIndex, true);
		} else if(obj.sourceMap &&
			typeof URL === "function" &&
			typeof URL.createObjectURL === "function" &&
			typeof URL.revokeObjectURL === "function" &&
			typeof Blob === "function" &&
			typeof btoa === "function") {
			styleElement = createLinkElement();
			update = updateLink.bind(null, styleElement);
			remove = function() {
				styleElement.parentNode.removeChild(styleElement);
				if(styleElement.href)
					URL.revokeObjectURL(styleElement.href);
			};
		} else {
			styleElement = createStyleElement();
			update = applyToTag.bind(null, styleElement);
			remove = function() {
				styleElement.parentNode.removeChild(styleElement);
			};
		}

		update(obj);

		return function updateStyle(newObj) {
			if(newObj) {
				if(newObj.css === obj.css && newObj.media === obj.media && newObj.sourceMap === obj.sourceMap)
					return;
				update(obj = newObj);
			} else {
				remove();
			}
		};
	}

	var replaceText = (function () {
		var textStore = [];

		return function (index, replacement) {
			textStore[index] = replacement;
			return textStore.filter(Boolean).join('\n');
		};
	})();

	function applyToSingletonTag(styleElement, index, remove, obj) {
		var css = remove ? "" : obj.css;

		if (styleElement.styleSheet) {
			styleElement.styleSheet.cssText = replaceText(index, css);
		} else {
			var cssNode = document.createTextNode(css);
			var childNodes = styleElement.childNodes;
			if (childNodes[index]) styleElement.removeChild(childNodes[index]);
			if (childNodes.length) {
				styleElement.insertBefore(cssNode, childNodes[index]);
			} else {
				styleElement.appendChild(cssNode);
			}
		}
	}

	function applyToTag(styleElement, obj) {
		var css = obj.css;
		var media = obj.media;
		var sourceMap = obj.sourceMap;

		if(media) {
			styleElement.setAttribute("media", media)
		}

		if(styleElement.styleSheet) {
			styleElement.styleSheet.cssText = css;
		} else {
			while(styleElement.firstChild) {
				styleElement.removeChild(styleElement.firstChild);
			}
			styleElement.appendChild(document.createTextNode(css));
		}
	}

	function updateLink(linkElement, obj) {
		var css = obj.css;
		var media = obj.media;
		var sourceMap = obj.sourceMap;

		if(sourceMap) {
			// http://stackoverflow.com/a/26603875
			css += "\n/*# sourceMappingURL=data:application/json;base64," + btoa(unescape(encodeURIComponent(JSON.stringify(sourceMap)))) + " */";
		}

		var blob = new Blob([css], { type: "text/css" });

		var oldSrc = linkElement.href;

		linkElement.href = URL.createObjectURL(blob);

		if(oldSrc)
			URL.revokeObjectURL(oldSrc);
	}


/***/ },
/* 5 */
/***/ function(module, exports, __webpack_require__) {

	/* WEBPACK VAR INJECTION */(function(process) {/** @jsx deku.dom */

	'use strict';

	Object.defineProperty(exports, '__esModule', {
	    value: true
	});
	exports.create = create;

	function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { 'default': obj }; }

	var _deku = __webpack_require__(7);

	var _deku2 = _interopRequireDefault(_deku);

	var _dekuSoundplayer = __webpack_require__(37);

	var _dekuSoundplayer2 = _interopRequireDefault(_dekuSoundplayer);

	var _soundcloudAudio = __webpack_require__(39);

	var _soundcloudAudio2 = _interopRequireDefault(_soundcloudAudio);

	var env = process.env.NODE_ENV || 'development';

	function create(el, opts) {
	    var clientId = opts.clientId || window.sb_soundplayer_client_id;
	    if (!clientId) {
	        console.error(['You must provide SoundCloud clientId for SoundPlayer widget', '', 'Example:', '<script>', 'var sb_soundplayer_client_id = "YOUR_CLIENT_ID";', '</script>', '', 'Register for an app and get clientId at https://developers.soundcloud.com/'].join('\n'));
	        return;
	    }

	    var soundCloudAudio = new _soundcloudAudio2['default'](clientId);

	    var app = _deku2['default'].tree(_deku2['default'].dom(_dekuSoundplayer2['default'], { url: opts.url, soundCloudAudio: soundCloudAudio }));

	    if (env === 'development') {
	        app.option('validateProps', true);
	    }

	    _deku2['default'].render(app, el);
	}
	/* WEBPACK VAR INJECTION */}.call(exports, __webpack_require__(6)))

/***/ },
/* 6 */
/***/ function(module, exports, __webpack_require__) {

	// shim for using process in browser

	var process = module.exports = {};
	var queue = [];
	var draining = false;
	var currentQueue;
	var queueIndex = -1;

	function cleanUpNextTick() {
	    draining = false;
	    if (currentQueue.length) {
	        queue = currentQueue.concat(queue);
	    } else {
	        queueIndex = -1;
	    }
	    if (queue.length) {
	        drainQueue();
	    }
	}

	function drainQueue() {
	    if (draining) {
	        return;
	    }
	    var timeout = setTimeout(cleanUpNextTick);
	    draining = true;

	    var len = queue.length;
	    while(len) {
	        currentQueue = queue;
	        queue = [];
	        while (++queueIndex < len) {
	            currentQueue[queueIndex].run();
	        }
	        queueIndex = -1;
	        len = queue.length;
	    }
	    currentQueue = null;
	    draining = false;
	    clearTimeout(timeout);
	}

	process.nextTick = function (fun) {
	    var args = new Array(arguments.length - 1);
	    if (arguments.length > 1) {
	        for (var i = 1; i < arguments.length; i++) {
	            args[i - 1] = arguments[i];
	        }
	    }
	    queue.push(new Item(fun, args));
	    if (queue.length === 1 && !draining) {
	        setTimeout(drainQueue, 0);
	    }
	};

	// v8 likes predictible objects
	function Item(fun, array) {
	    this.fun = fun;
	    this.array = array;
	}
	Item.prototype.run = function () {
	    this.fun.apply(null, this.array);
	};
	process.title = 'browser';
	process.browser = true;
	process.env = {};
	process.argv = [];
	process.version = ''; // empty string to avoid regexp issues
	process.versions = {};

	function noop() {}

	process.on = noop;
	process.addListener = noop;
	process.once = noop;
	process.off = noop;
	process.removeListener = noop;
	process.removeAllListeners = noop;
	process.emit = noop;

	process.binding = function (name) {
	    throw new Error('process.binding is not supported');
	};

	// TODO(shtylman)
	process.cwd = function () { return '/' };
	process.chdir = function (dir) {
	    throw new Error('process.chdir is not supported');
	};
	process.umask = function() { return 0; };


/***/ },
/* 7 */
/***/ function(module, exports, __webpack_require__) {

	/**
	 * Create the application.
	 */

	exports.tree =
	exports.scene =
	exports.deku = __webpack_require__(8)

	/**
	 * Render scenes to the DOM.
	 */

	if (typeof document !== 'undefined') {
	  exports.render = __webpack_require__(10)
	}

	/**
	 * Render scenes to a string
	 */

	exports.renderString = __webpack_require__(32)

	/**
	 * Create virtual elements.
	 */

	exports.element =
	exports.createElement =
	exports.dom = __webpack_require__(33)


/***/ },
/* 8 */
/***/ function(module, exports, __webpack_require__) {

	/**
	 * Module dependencies.
	 */

	var Emitter = __webpack_require__(9)

	/**
	 * Expose `scene`.
	 */

	module.exports = Application

	/**
	 * Create a new `Application`.
	 *
	 * @param {Object} element Optional initial element
	 */

	function Application (element) {
	  if (!(this instanceof Application)) return new Application(element)
	  this.options = {}
	  this.sources = {}
	  this.element = element
	}

	/**
	 * Mixin `Emitter`.
	 */

	Emitter(Application.prototype)

	/**
	 * Add a plugin
	 *
	 * @param {Function} plugin
	 */

	Application.prototype.use = function (plugin) {
	  plugin(this)
	  return this
	}

	/**
	 * Set an option
	 *
	 * @param {String} name
	 */

	Application.prototype.option = function (name, val) {
	  this.options[name] = val
	  return this
	}

	/**
	 * Set value used somewhere in the IO network.
	 */

	Application.prototype.set = function (name, data) {
	  this.sources[name] = data
	  this.emit('source', name, data)
	  return this
	}

	/**
	 * Mount a virtual element.
	 *
	 * @param {VirtualElement} element
	 */

	Application.prototype.mount = function (element) {
	  this.element = element
	  this.emit('mount', element)
	  return this
	}

	/**
	 * Remove the world. Unmount everything.
	 */

	Application.prototype.unmount = function () {
	  if (!this.element) return
	  this.element = null
	  this.emit('unmount')
	  return this
	}


/***/ },
/* 9 */
/***/ function(module, exports, __webpack_require__) {

	
	/**
	 * Expose `Emitter`.
	 */

	module.exports = Emitter;

	/**
	 * Initialize a new `Emitter`.
	 *
	 * @api public
	 */

	function Emitter(obj) {
	  if (obj) return mixin(obj);
	};

	/**
	 * Mixin the emitter properties.
	 *
	 * @param {Object} obj
	 * @return {Object}
	 * @api private
	 */

	function mixin(obj) {
	  for (var key in Emitter.prototype) {
	    obj[key] = Emitter.prototype[key];
	  }
	  return obj;
	}

	/**
	 * Listen on the given `event` with `fn`.
	 *
	 * @param {String} event
	 * @param {Function} fn
	 * @return {Emitter}
	 * @api public
	 */

	Emitter.prototype.on =
	Emitter.prototype.addEventListener = function(event, fn){
	  this._callbacks = this._callbacks || {};
	  (this._callbacks['$' + event] = this._callbacks['$' + event] || [])
	    .push(fn);
	  return this;
	};

	/**
	 * Adds an `event` listener that will be invoked a single
	 * time then automatically removed.
	 *
	 * @param {String} event
	 * @param {Function} fn
	 * @return {Emitter}
	 * @api public
	 */

	Emitter.prototype.once = function(event, fn){
	  function on() {
	    this.off(event, on);
	    fn.apply(this, arguments);
	  }

	  on.fn = fn;
	  this.on(event, on);
	  return this;
	};

	/**
	 * Remove the given callback for `event` or all
	 * registered callbacks.
	 *
	 * @param {String} event
	 * @param {Function} fn
	 * @return {Emitter}
	 * @api public
	 */

	Emitter.prototype.off =
	Emitter.prototype.removeListener =
	Emitter.prototype.removeAllListeners =
	Emitter.prototype.removeEventListener = function(event, fn){
	  this._callbacks = this._callbacks || {};

	  // all
	  if (0 == arguments.length) {
	    this._callbacks = {};
	    return this;
	  }

	  // specific event
	  var callbacks = this._callbacks['$' + event];
	  if (!callbacks) return this;

	  // remove all handlers
	  if (1 == arguments.length) {
	    delete this._callbacks['$' + event];
	    return this;
	  }

	  // remove specific handler
	  var cb;
	  for (var i = 0; i < callbacks.length; i++) {
	    cb = callbacks[i];
	    if (cb === fn || cb.fn === fn) {
	      callbacks.splice(i, 1);
	      break;
	    }
	  }
	  return this;
	};

	/**
	 * Emit `event` with the given args.
	 *
	 * @param {String} event
	 * @param {Mixed} ...
	 * @return {Emitter}
	 */

	Emitter.prototype.emit = function(event){
	  this._callbacks = this._callbacks || {};
	  var args = [].slice.call(arguments, 1)
	    , callbacks = this._callbacks['$' + event];

	  if (callbacks) {
	    callbacks = callbacks.slice(0);
	    for (var i = 0, len = callbacks.length; i < len; ++i) {
	      callbacks[i].apply(this, args);
	    }
	  }

	  return this;
	};

	/**
	 * Return array of callbacks for `event`.
	 *
	 * @param {String} event
	 * @return {Array}
	 * @api public
	 */

	Emitter.prototype.listeners = function(event){
	  this._callbacks = this._callbacks || {};
	  return this._callbacks['$' + event] || [];
	};

	/**
	 * Check if this emitter has `event` handlers.
	 *
	 * @param {String} event
	 * @return {Boolean}
	 * @api public
	 */

	Emitter.prototype.hasListeners = function(event){
	  return !! this.listeners(event).length;
	};


/***/ },
/* 10 */
/***/ function(module, exports, __webpack_require__) {

	/**
	 * Dependencies.
	 */

	var raf = __webpack_require__(12)
	var Pool = __webpack_require__(13)
	var walk = __webpack_require__(14)
	var isDom = __webpack_require__(15)
	var uid = __webpack_require__(16)
	var keypath = __webpack_require__(17)
	var type = __webpack_require__(18)
	var utils = __webpack_require__(11)
	var svg = __webpack_require__(19)
	var events = __webpack_require__(21)
	var defaults = utils.defaults
	var forEach = __webpack_require__(22)
	var assign = __webpack_require__(26)
	var reduce = __webpack_require__(27)
	var isPromise = __webpack_require__(31)

	/**
	 * These elements won't be pooled
	 */

	var avoidPooling = ['input', 'textarea'];

	/**
	 * Expose `dom`.
	 */

	module.exports = render

	/**
	 * Render an app to the DOM
	 *
	 * @param {Application} app
	 * @param {HTMLElement} container
	 * @param {Object} opts
	 *
	 * @return {Object}
	 */

	function render (app, container, opts) {
	  var frameId
	  var isRendering
	  var rootId = 'root'
	  var currentElement
	  var currentNativeElement
	  var connections = {}
	  var components = {}
	  var entities = {}
	  var pools = {}
	  var handlers = {}
	  var mountQueue = []
	  var children = {}
	  children[rootId] = {}

	  if (!isDom(container)) {
	    throw new Error('Container element must be a DOM element')
	  }

	  /**
	   * Rendering options. Batching is only ever really disabled
	   * when running tests, and pooling can be disabled if the user
	   * is doing something stupid with the DOM in their components.
	   */

	  var options = defaults(assign({}, app.options || {}, opts || {}), {
	    pooling: true,
	    batching: true,
	    validateProps: false
	  })

	  /**
	   * Listen to DOM events
	   */

	  addNativeEventListeners()

	  /**
	   * Watch for changes to the app so that we can update
	   * the DOM as needed.
	   */

	  app.on('unmount', onunmount)
	  app.on('mount', onmount)
	  app.on('source', onupdate)

	  /**
	   * If the app has already mounted an element, we can just
	   * render that straight away.
	   */

	  if (app.element) render()

	  /**
	   * Teardown the DOM rendering so that it stops
	   * rendering and everything can be garbage collected.
	   */

	  function teardown () {
	    removeNativeEventListeners()
	    removeNativeElement()
	    app.off('unmount', onunmount)
	    app.off('mount', onmount)
	    app.off('source', onupdate)
	  }

	  /**
	   * Swap the current rendered node with a new one that is rendered
	   * from the new virtual element mounted on the app.
	   *
	   * @param {VirtualElement} element
	   */

	  function onmount () {
	    invalidate()
	  }

	  /**
	   * If the app unmounts an element, we should clear out the current
	   * rendered element. This will remove all the entities.
	   */

	  function onunmount () {
	    removeNativeElement()
	    currentElement = null
	  }

	  /**
	   * Update all components that are bound to the source
	   *
	   * @param {String} name
	   * @param {*} data
	   */

	  function onupdate (name, data) {
	    if (!connections[name]) return;
	    connections[name].forEach(function(update) {
	      update(data)
	    })
	  }

	  /**
	   * Render and mount a component to the native dom.
	   *
	   * @param {Entity} entity
	   * @return {HTMLElement}
	   */

	  function mountEntity (entity) {
	    register(entity)
	    setSources(entity)
	    children[entity.id] = {}
	    entities[entity.id] = entity

	    // commit initial state and props.
	    commit(entity)

	    // callback before mounting.
	    trigger('beforeMount', entity, [entity.context])
	    trigger('beforeRender', entity, [entity.context])

	    // render virtual element.
	    var virtualElement = renderEntity(entity)
	    // create native element.
	    var nativeElement = toNative(entity.id, '0', virtualElement)

	    entity.virtualElement = virtualElement
	    entity.nativeElement = nativeElement

	    // Fire afterRender and afterMount hooks at the end
	    // of the render cycle
	    mountQueue.push(entity.id)

	    return nativeElement
	  }

	  /**
	   * Remove a component from the native dom.
	   *
	   * @param {Entity} entity
	   */

	  function unmountEntity (entityId) {
	    var entity = entities[entityId]
	    if (!entity) return
	    trigger('beforeUnmount', entity, [entity.context, entity.nativeElement])
	    unmountChildren(entityId)
	    removeAllEvents(entityId)
	    var componentEntities = components[entityId].entities;
	    delete componentEntities[entityId]
	    delete components[entityId]
	    delete entities[entityId]
	    delete children[entityId]
	  }

	  /**
	   * Render the entity and make sure it returns a node
	   *
	   * @param {Entity} entity
	   *
	   * @return {VirtualTree}
	   */

	  function renderEntity (entity) {
	    var component = entity.component
	    if (!component.render) throw new Error('Component needs a render function')
	    var result = component.render(entity.context, setState(entity))
	    if (!result) throw new Error('Render function must return an element.')
	    return result
	  }

	  /**
	   * Whenever setState or setProps is called, we mark the entity
	   * as dirty in the renderer. This lets us optimize the re-rendering
	   * and skip components that definitely haven't changed.
	   *
	   * @param {Entity} entity
	   *
	   * @return {Function} A curried function for updating the state of an entity
	   */

	  function setState (entity) {
	    return function (nextState) {
	      updateEntityStateAsync(entity, nextState)
	    }
	  }

	  /**
	   * Tell the app it's dirty and needs to re-render. If batching is disabled
	   * we can just trigger a render immediately, otherwise we'll wait until
	   * the next available frame.
	   */

	  function invalidate () {
	    if (!options.batching) {
	      if (!isRendering) render()
	    } else {
	      if (!frameId) frameId = raf(render)
	    }
	  }

	  /**
	   * Update the DOM. If the update fails we stop the loop
	   * so we don't get errors on every frame.
	   *
	   * @api public
	   */

	  function render () {
	    // If this is called synchronously we need to
	    // cancel any pending future updates
	    clearFrame()

	    // If the rendering from the previous frame is still going,
	    // we'll just wait until the next frame. Ideally renders should
	    // not take over 16ms to stay within a single frame, but this should
	    // catch it if it does.
	    if (isRendering) {
	      frameId = raf(render)
	      return
	    } else {
	      isRendering = true
	    }

	    // 1. If there isn't a native element rendered for the current mounted element
	    // then we need to create it from scratch.
	    // 2. If a new element has been mounted, we should diff them.
	    // 3. We should update check all child components for changes.
	    if (!currentNativeElement) {
	      currentElement = app.element
	      currentNativeElement = toNative(rootId, '0', currentElement)
	      if (container.children.length > 0) {
	        console.info('deku: The container element is not empty. These elements will be removed. Read more: http://cl.ly/b0Sr')
	      }
	      if (container === document.body) {
	        console.warn('deku: Using document.body is allowed but it can cause some issues. Read more: http://cl.ly/b0SC')
	      }
	      removeAllChildren(container);
	      container.appendChild(currentNativeElement)
	    } else if (currentElement !== app.element) {
	      currentNativeElement = patch(rootId, currentElement, app.element, currentNativeElement)
	      currentElement = app.element
	      updateChildren(rootId)
	    } else {
	      updateChildren(rootId)
	    }

	    // Call mount events on all new entities
	    flushMountQueue()

	    // Allow rendering again.
	    isRendering = false
	  }

	  /**
	   * Call hooks for all new entities that have been created in
	   * the last render from the bottom up.
	   */

	  function flushMountQueue () {
	    var entityId
	    while (entityId = mountQueue.pop()) {
	      var entity = entities[entityId]
	      trigger('afterRender', entity, [entity.context, entity.nativeElement])
	      triggerUpdate('afterMount', entity, [entity.context, entity.nativeElement, setState(entity)])
	    }
	  }

	  /**
	   * Clear the current scheduled frame
	   */

	  function clearFrame () {
	    if (!frameId) return
	    raf.cancel(frameId)
	    frameId = 0
	  }

	  /**
	   * Update a component.
	   *
	   * The entity is just the data object for a component instance.
	   *
	   * @param {String} id Component instance id.
	   */

	  function updateEntity (entityId) {
	    var entity = entities[entityId]
	    setSources(entity)

	    if (!shouldUpdate(entity)) return updateChildren(entityId)

	    var currentTree = entity.virtualElement
	    var nextProps = entity.pendingProps
	    var nextState = entity.pendingState
	    var previousState = entity.context.state
	    var previousProps = entity.context.props

	    // hook before rendering. could modify state just before the render occurs.
	    trigger('beforeUpdate', entity, [entity.context, nextProps, nextState])
	    trigger('beforeRender', entity, [entity.context])

	    // commit state and props.
	    commit(entity)

	    // re-render.
	    var nextTree = renderEntity(entity)

	    // if the tree is the same we can just skip this component
	    // but we should still check the children to see if they're dirty.
	    // This allows us to memoize the render function of components.
	    if (nextTree === currentTree) return updateChildren(entityId)

	    // apply new virtual tree to native dom.
	    entity.nativeElement = patch(entityId, currentTree, nextTree, entity.nativeElement)
	    entity.virtualElement = nextTree
	    updateChildren(entityId)

	    // trigger render hook
	    trigger('afterRender', entity, [entity.context, entity.nativeElement])

	    // trigger afterUpdate after all children have updated.
	    triggerUpdate('afterUpdate', entity, [entity.context, previousProps, previousState])
	  }

	  /**
	   * Update all the children of an entity.
	   *
	   * @param {String} id Component instance id.
	   */

	  function updateChildren (entityId) {
	    forEach(children[entityId], function (childId) {
	      updateEntity(childId)
	    })
	  }

	  /**
	   * Remove all of the child entities of an entity
	   *
	   * @param {Entity} entity
	   */

	  function unmountChildren (entityId) {
	    forEach(children[entityId], function (childId) {
	      unmountEntity(childId)
	    })
	  }

	  /**
	   * Remove the root element. If this is called synchronously we need to
	   * cancel any pending future updates.
	   */

	  function removeNativeElement () {
	    clearFrame()
	    removeElement(rootId, '0', currentNativeElement)
	    currentNativeElement = null
	  }

	  /**
	   * Create a native element from a virtual element.
	   *
	   * @param {String} entityId
	   * @param {String} path
	   * @param {Object} vnode
	   *
	   * @return {HTMLDocumentFragment}
	   */

	  function toNative (entityId, path, vnode) {
	    switch (vnode.type) {
	      case 'text': return toNativeText(vnode)
	      case 'element': return toNativeElement(entityId, path, vnode)
	      case 'component': return toNativeComponent(entityId, path, vnode)
	    }
	  }

	  /**
	   * Create a native text element from a virtual element.
	   *
	   * @param {Object} vnode
	   */

	  function toNativeText (vnode) {
	    return document.createTextNode(vnode.data)
	  }

	  /**
	   * Create a native element from a virtual element.
	   */

	  function toNativeElement (entityId, path, vnode) {
	    var attributes = vnode.attributes
	    var children = vnode.children
	    var tagName = vnode.tagName
	    var el

	    // create element either from pool or fresh.
	    if (!options.pooling || !canPool(tagName)) {
	      if (svg.isElement(tagName)) {
	        el = document.createElementNS(svg.namespace, tagName)
	      } else {
	        el = document.createElement(tagName)
	      }
	    } else {
	      var pool = getPool(tagName)
	      el = cleanup(pool.pop())
	      if (el.parentNode) el.parentNode.removeChild(el)
	    }

	    // set attributes.
	    forEach(attributes, function (value, name) {
	      setAttribute(entityId, path, el, name, value)
	    })

	    // store keys on the native element for fast event handling.
	    el.__entity__ = entityId
	    el.__path__ = path

	    // add children.
	    forEach(children, function (child, i) {
	      var childEl = toNative(entityId, path + '.' + i, child)
	      if (!childEl.parentNode) el.appendChild(childEl)
	    })

	    return el
	  }

	  /**
	   * Create a native element from a component.
	   */

	  function toNativeComponent (entityId, path, vnode) {
	    var child = new Entity(vnode.component, vnode.props, entityId)
	    children[entityId][path] = child.id
	    return mountEntity(child)
	  }

	  /**
	   * Patch an element with the diff from two trees.
	   */

	  function patch (entityId, prev, next, el) {
	    return diffNode('0', entityId, prev, next, el)
	  }

	  /**
	   * Create a diff between two trees of nodes.
	   */

	  function diffNode (path, entityId, prev, next, el) {
	    // Type changed. This could be from element->text, text->ComponentA,
	    // ComponentA->ComponentB etc. But NOT div->span. These are the same type
	    // (ElementNode) but different tag name.
	    if (prev.type !== next.type) return replaceElement(entityId, path, el, next)

	    switch (next.type) {
	      case 'text': return diffText(prev, next, el)
	      case 'element': return diffElement(path, entityId, prev, next, el)
	      case 'component': return diffComponent(path, entityId, prev, next, el)
	    }
	  }

	  /**
	   * Diff two text nodes and update the element.
	   */

	  function diffText (previous, current, el) {
	    if (current.data !== previous.data) el.data = current.data
	    return el
	  }

	  /**
	   * Diff the children of an ElementNode.
	   */

	  function diffChildren (path, entityId, prev, next, el) {
	    var positions = []
	    var hasKeys = false
	    var childNodes = Array.prototype.slice.apply(el.childNodes)
	    var leftKeys = reduce(prev.children, keyMapReducer, {})
	    var rightKeys = reduce(next.children, keyMapReducer, {})
	    var currentChildren = assign({}, children[entityId])

	    function keyMapReducer (acc, child) {
	      if (child.key != null) {
	        acc[child.key] = child
	        hasKeys = true
	      }
	      return acc
	    }

	    // Diff all of the nodes that have keys. This lets us re-used elements
	    // instead of overriding them and lets us move them around.
	    if (hasKeys) {

	      // Removals
	      forEach(leftKeys, function (leftNode, key) {
	        if (rightKeys[key] == null) {
	          var leftPath = path + '.' + leftNode.index
	          removeElement(
	            entityId,
	            leftPath,
	            childNodes[leftNode.index]
	          )
	        }
	      })

	      // Update nodes
	      forEach(rightKeys, function (rightNode, key) {
	        var leftNode = leftKeys[key]

	        // We only want updates for now
	        if (leftNode == null) return

	        var leftPath = path + '.' + leftNode.index

	        // Updated
	        positions[rightNode.index] = diffNode(
	          leftPath,
	          entityId,
	          leftNode,
	          rightNode,
	          childNodes[leftNode.index]
	        )
	      })

	      // Update the positions of all child components and event handlers
	      forEach(rightKeys, function (rightNode, key) {
	        var leftNode = leftKeys[key]

	        // We just want elements that have moved around
	        if (leftNode == null || leftNode.index === rightNode.index) return

	        var rightPath = path + '.' + rightNode.index
	        var leftPath = path + '.' + leftNode.index

	        // Update all the child component path positions to match
	        // the latest positions if they've changed. This is a bit hacky.
	        forEach(currentChildren, function (childId, childPath) {
	          if (leftPath === childPath) {
	            delete children[entityId][childPath]
	            children[entityId][rightPath] = childId
	          }
	        })
	      })

	      // Now add all of the new nodes last in case their path
	      // would have conflicted with one of the previous paths.
	      forEach(rightKeys, function (rightNode, key) {
	        var rightPath = path + '.' + rightNode.index
	        if (leftKeys[key] == null) {
	          positions[rightNode.index] = toNative(
	            entityId,
	            rightPath,
	            rightNode
	          )
	        }
	      })

	    } else {
	      var maxLength = Math.max(prev.children.length, next.children.length)

	      // Now diff all of the nodes that don't have keys
	      for (var i = 0; i < maxLength; i++) {
	        var leftNode = prev.children[i]
	        var rightNode = next.children[i]

	        // Removals
	        if (rightNode == null) {
	          removeElement(
	            entityId,
	            path + '.' + leftNode.index,
	            childNodes[leftNode.index]
	          )
	        }

	        // New Node
	        if (leftNode == null) {
	          positions[rightNode.index] = toNative(
	            entityId,
	            path + '.' + rightNode.index,
	            rightNode
	          )
	        }

	        // Updated
	        if (leftNode && rightNode) {
	          positions[leftNode.index] = diffNode(
	            path + '.' + leftNode.index,
	            entityId,
	            leftNode,
	            rightNode,
	            childNodes[leftNode.index]
	          )
	        }
	      }
	    }

	    // Reposition all the elements
	    forEach(positions, function (childEl, newPosition) {
	      var target = el.childNodes[newPosition]
	      if (childEl !== target) {
	        if (target) {
	          el.insertBefore(childEl, target)
	        } else {
	          el.appendChild(childEl)
	        }
	      }
	    })
	  }

	  /**
	   * Diff the attributes and add/remove them.
	   */

	  function diffAttributes (prev, next, el, entityId, path) {
	    var nextAttrs = next.attributes
	    var prevAttrs = prev.attributes

	    // add new attrs
	    forEach(nextAttrs, function (value, name) {
	      if (events[name] || !(name in prevAttrs) || prevAttrs[name] !== value) {
	        setAttribute(entityId, path, el, name, value)
	      }
	    })

	    // remove old attrs
	    forEach(prevAttrs, function (value, name) {
	      if (!(name in nextAttrs)) {
	        removeAttribute(entityId, path, el, name)
	      }
	    })
	  }

	  /**
	   * Update a component with the props from the next node. If
	   * the component type has changed, we'll just remove the old one
	   * and replace it with the new component.
	   */

	  function diffComponent (path, entityId, prev, next, el) {
	    if (next.component !== prev.component) {
	      return replaceElement(entityId, path, el, next)
	    } else {
	      var targetId = children[entityId][path]

	      // This is a hack for now
	      if (targetId) {
	        updateEntityProps(targetId, next.props)
	      }

	      return el
	    }
	  }

	  /**
	   * Diff two element nodes.
	   */

	  function diffElement (path, entityId, prev, next, el) {
	    if (next.tagName !== prev.tagName) return replaceElement(entityId, path, el, next)
	    diffAttributes(prev, next, el, entityId, path)
	    diffChildren(path, entityId, prev, next, el)
	    return el
	  }

	  /**
	   * Removes an element from the DOM and unmounts and components
	   * that are within that branch
	   *
	   * side effects:
	   *   - removes element from the DOM
	   *   - removes internal references
	   *
	   * @param {String} entityId
	   * @param {String} path
	   * @param {HTMLElement} el
	   */

	  function removeElement (entityId, path, el) {
	    var childrenByPath = children[entityId]
	    var childId = childrenByPath[path]
	    var entityHandlers = handlers[entityId] || {}
	    var removals = []

	    // If the path points to a component we should use that
	    // components element instead, because it might have moved it.
	    if (childId) {
	      var child = entities[childId]
	      el = child.nativeElement
	      unmountEntity(childId)
	      removals.push(path)
	    } else {

	      // Just remove the text node
	      if (!isElement(el)) return el.parentNode.removeChild(el)

	      // Then we need to find any components within this
	      // branch and unmount them.
	      forEach(childrenByPath, function (childId, childPath) {
	        if (childPath === path || isWithinPath(path, childPath)) {
	          unmountEntity(childId)
	          removals.push(childPath)
	        }
	      })

	      // Remove all events at this path or below it
	      forEach(entityHandlers, function (fn, handlerPath) {
	        if (handlerPath === path || isWithinPath(path, handlerPath)) {
	          removeEvent(entityId, handlerPath)
	        }
	      })
	    }

	    // Remove the paths from the object without touching the
	    // old object. This keeps the object using fast properties.
	    forEach(removals, function (path) {
	      delete children[entityId][path]
	    })

	    // Remove it from the DOM
	    el.parentNode.removeChild(el)

	    // Return all of the elements in this node tree to the pool
	    // so that the elements can be re-used.
	    if (options.pooling) {
	      walk(el, function (node) {
	        if (!isElement(node) || !canPool(node.tagName)) return
	        getPool(node.tagName.toLowerCase()).push(node)
	      })
	    }
	  }

	  /**
	   * Replace an element in the DOM. Removing all components
	   * within that element and re-rendering the new virtual node.
	   *
	   * @param {Entity} entity
	   * @param {String} path
	   * @param {HTMLElement} el
	   * @param {Object} vnode
	   *
	   * @return {void}
	   */

	  function replaceElement (entityId, path, el, vnode) {
	    var parent = el.parentNode
	    var index = Array.prototype.indexOf.call(parent.childNodes, el)

	    // remove the previous element and all nested components. This
	    // needs to happen before we create the new element so we don't
	    // get clashes on the component paths.
	    removeElement(entityId, path, el)

	    // then add the new element in there
	    var newEl = toNative(entityId, path, vnode)
	    var target = parent.childNodes[index]

	    if (target) {
	      parent.insertBefore(newEl, target)
	    } else {
	      parent.appendChild(newEl)
	    }

	    // walk up the tree and update all `entity.nativeElement` references.
	    if (entityId !== 'root' && path === '0') {
	      updateNativeElement(entityId, newEl)
	    }

	    return newEl
	  }

	  /**
	   * Update all entities in a branch that have the same nativeElement. This
	   * happens when a component has another component as it's root node.
	   *
	   * @param {String} entityId
	   * @param {HTMLElement} newEl
	   *
	   * @return {void}
	   */

	  function updateNativeElement (entityId, newEl) {
	    var target = entities[entityId]
	    if (target.ownerId === 'root') return
	    if (children[target.ownerId]['0'] === entityId) {
	      entities[target.ownerId].nativeElement = newEl
	      updateNativeElement(target.ownerId, newEl)
	    }
	  }

	  /**
	   * Set the attribute of an element, performing additional transformations
	   * dependning on the attribute name
	   *
	   * @param {HTMLElement} el
	   * @param {String} name
	   * @param {String} value
	   */

	  function setAttribute (entityId, path, el, name, value) {
	    if (events[name]) {
	      addEvent(entityId, path, events[name], value)
	      return
	    }
	    switch (name) {
	      case 'checked':
	      case 'disabled':
	      case 'selected':
	        el[name] = true
	        break
	      case 'innerHTML':
	      case 'value':
	        el[name] = value
	        break
	      case svg.isAttribute(name):
	        el.setAttributeNS(svg.namespace, name, value)
	        break
	      default:
	        el.setAttribute(name, value)
	        break
	    }
	  }

	  /**
	   * Remove an attribute, performing additional transformations
	   * dependning on the attribute name
	   *
	   * @param {HTMLElement} el
	   * @param {String} name
	   */

	  function removeAttribute (entityId, path, el, name) {
	    if (events[name]) {
	      removeEvent(entityId, path, events[name])
	      return
	    }
	    switch (name) {
	      case 'checked':
	      case 'disabled':
	      case 'selected':
	        el[name] = false
	        break
	      case 'innerHTML':
	      case 'value':
	        el[name] = ""
	        break
	      default:
	        el.removeAttribute(name)
	        break
	    }
	  }

	  /**
	   * Checks to see if one tree path is within
	   * another tree path. Example:
	   *
	   * 0.1 vs 0.1.1 = true
	   * 0.2 vs 0.3.5 = false
	   *
	   * @param {String} target
	   * @param {String} path
	   *
	   * @return {Boolean}
	   */

	  function isWithinPath (target, path) {
	    return path.indexOf(target + '.') === 0
	  }

	  /**
	   * Is the DOM node an element node
	   *
	   * @param {HTMLElement} el
	   *
	   * @return {Boolean}
	   */

	  function isElement (el) {
	    return !!el.tagName
	  }

	  /**
	   * Get the pool for a tagName, creating it if it
	   * doesn't exist.
	   *
	   * @param {String} tagName
	   *
	   * @return {Pool}
	   */

	  function getPool (tagName) {
	    var pool = pools[tagName]
	    if (!pool) {
	      var poolOpts = svg.isElement(tagName) ?
	        { namespace: svg.namespace, tagName: tagName } :
	        { tagName: tagName }
	      pool = pools[tagName] = new Pool(poolOpts)
	    }
	    return pool
	  }

	  /**
	   * Clean up previously used native element for reuse.
	   *
	   * @param {HTMLElement} el
	   */

	  function cleanup (el) {
	    removeAllChildren(el)
	    removeAllAttributes(el)
	    return el
	  }

	  /**
	   * Remove all the attributes from a node
	   *
	   * @param {HTMLElement} el
	   */

	  function removeAllAttributes (el) {
	    for (var i = el.attributes.length - 1; i >= 0; i--) {
	      var name = el.attributes[i].name
	      el.removeAttribute(name)
	    }
	  }

	  /**
	   * Remove all the child nodes from an element
	   *
	   * @param {HTMLElement} el
	   */

	  function removeAllChildren (el) {
	    while (el.firstChild) el.removeChild(el.firstChild)
	  }

	  /**
	   * Trigger a hook on a component.
	   *
	   * @param {String} name Name of hook.
	   * @param {Entity} entity The component instance.
	   * @param {Array} args To pass along to hook.
	   */

	  function trigger (name, entity, args) {
	    if (typeof entity.component[name] !== 'function') return
	    return entity.component[name].apply(null, args)
	  }

	  /**
	   * Trigger a hook on the component and allow state to be
	   * updated too.
	   *
	   * @param {String} name
	   * @param {Object} entity
	   * @param {Array} args
	   *
	   * @return {void}
	   */

	  function triggerUpdate (name, entity, args) {
	    var update = setState(entity)
	    args.push(update)
	    var result = trigger(name, entity, args)
	    if (result) {
	      updateEntityStateAsync(entity, result)
	    }
	  }

	  /**
	   * Update the entity state using a promise
	   *
	   * @param {Entity} entity
	   * @param {Promise} promise
	   */

	  function updateEntityStateAsync (entity, value) {
	    if (isPromise(value)) {
	      value.then(function (newState) {
	        updateEntityState(entity, newState)
	      })
	    } else {
	      updateEntityState(entity, value)
	    }
	  }

	  /**
	   * Update an entity to match the latest rendered vode. We always
	   * replace the props on the component when composing them. This
	   * will trigger a re-render on all children below this point.
	   *
	   * @param {Entity} entity
	   * @param {String} path
	   * @param {Object} vnode
	   *
	   * @return {void}
	   */

	  function updateEntityProps (entityId, nextProps) {
	    var entity = entities[entityId]
	    entity.pendingProps = nextProps
	    entity.dirty = true
	    invalidate()
	  }

	  /**
	   * Update component instance state.
	   */

	  function updateEntityState (entity, nextState) {
	    entity.pendingState = assign(entity.pendingState, nextState)
	    entity.dirty = true
	    invalidate()
	  }

	  /**
	   * Commit props and state changes to an entity.
	   */

	  function commit (entity) {
	    entity.context = {
	      state: entity.pendingState,
	      props: entity.pendingProps,
	      id: entity.id
	    }
	    entity.pendingState = assign({}, entity.context.state)
	    entity.pendingProps = assign({}, entity.context.props)
	    validateProps(entity.context.props, entity.propTypes)
	    entity.dirty = false
	  }

	  /**
	   * Try to avoid creating new virtual dom if possible.
	   *
	   * Later we may expose this so you can override, but not there yet.
	   */

	  function shouldUpdate (entity) {
	    if (!entity.dirty) return false
	    if (!entity.component.shouldUpdate) return true
	    var nextProps = entity.pendingProps
	    var nextState = entity.pendingState
	    var bool = entity.component.shouldUpdate(entity.context, nextProps, nextState)
	    return bool
	  }

	  /**
	   * Register an entity.
	   *
	   * This is mostly to pre-preprocess component properties and values chains.
	   *
	   * The end result is for every component that gets mounted,
	   * you create a set of IO nodes in the network from the `value` definitions.
	   *
	   * @param {Component} component
	   */

	  function register (entity) {
	    registerEntity(entity)
	    var component = entity.component
	    if (component.registered) return

	    // initialize sources once for a component type.
	    registerSources(entity)
	    component.registered = true
	  }

	  /**
	   * Add entity to data-structures related to components/entities.
	   *
	   * @param {Entity} entity
	   */

	  function registerEntity(entity) {
	    var component = entity.component
	    // all entities for this component type.
	    var entities = component.entities = component.entities || {}
	    // add entity to component list
	    entities[entity.id] = entity
	    // map to component so you can remove later.
	    components[entity.id] = component
	  }

	  /**
	   * Initialize sources for a component by type.
	   *
	   * @param {Entity} entity
	   */

	  function registerSources(entity) {
	    var component = components[entity.id]
	    // get 'class-level' sources.
	    // if we've already hooked it up, then we're good.
	    var sources = component.sources
	    if (sources) return
	    var entities = component.entities

	    // hook up sources.
	    var map = component.sourceToPropertyName = {}
	    component.sources = sources = []
	    var propTypes = component.propTypes
	    for (var name in propTypes) {
	      var data = propTypes[name]
	      if (!data) continue
	      if (!data.source) continue
	      sources.push(data.source)
	      map[data.source] = name
	    }

	    // send value updates to all component instances.
	    sources.forEach(function (source) {
	      connections[source] = connections[source] || []
	      connections[source].push(update)

	      function update (data) {
	        var prop = map[source]
	        for (var entityId in entities) {
	          var entity = entities[entityId]
	          var changes = {}
	          changes[prop] = data
	          updateEntityProps(entityId, assign(entity.pendingProps, changes))
	        }
	      }
	    })
	  }

	  /**
	   * Set the initial source value on the entity
	   *
	   * @param {Entity} entity
	   */

	  function setSources (entity) {
	    var component = entity.component
	    var map = component.sourceToPropertyName
	    var sources = component.sources
	    sources.forEach(function (source) {
	      var name = map[source]
	      if (entity.pendingProps[name] != null) return
	      entity.pendingProps[name] = app.sources[source] // get latest value plugged into global store
	    })
	  }

	  /**
	   * Add all of the DOM event listeners
	   */

	  function addNativeEventListeners () {
	    forEach(events, function (eventType) {
	      document.body.addEventListener(eventType, handleEvent, true)
	    })
	  }

	  /**
	   * Add all of the DOM event listeners
	   */

	  function removeNativeEventListeners () {
	    forEach(events, function (eventType) {
	      document.body.removeEventListener(eventType, handleEvent, true)
	    })
	  }

	  /**
	   * Handle an event that has occured within the container
	   *
	   * @param {Event} event
	   */

	  function handleEvent (event) {
	    var target = event.target
	    var eventType = event.type

	    // Walk up the DOM tree and see if there is a handler
	    // for this event type higher up.
	    while (target) {
	      var fn = keypath.get(handlers, [target.__entity__, target.__path__, eventType])
	      if (fn) {
	        event.delegateTarget = target
	        fn(event)
	        break
	      }
	      target = target.parentNode
	    }
	  }

	  /**
	   * Bind events for an element, and all it's rendered child elements.
	   *
	   * @param {String} path
	   * @param {String} event
	   * @param {Function} fn
	   */

	  function addEvent (entityId, path, eventType, fn) {
	    keypath.set(handlers, [entityId, path, eventType], function (e) {
	      var entity = entities[entityId]
	      if (entity) {
	        var update = setState(entity)
	        var result = fn.call(null, e, entity.context, update)
	        if (result) {
	          updateEntityStateAsync(entity, result)
	        }
	      } else {
	        fn.call(null, e)
	      }
	    })
	  }

	  /**
	   * Unbind events for a entityId
	   *
	   * @param {String} entityId
	   */

	  function removeEvent (entityId, path, eventType) {
	    var args = [entityId]
	    if (path) args.push(path)
	    if (eventType) args.push(eventType)
	    keypath.del(handlers, args)
	  }

	  /**
	   * Unbind all events from an entity
	   *
	   * @param {Entity} entity
	   */

	  function removeAllEvents (entityId) {
	    keypath.del(handlers, [entityId])
	  }

	  /**
	   * Validate the current properties. These simple validations
	   * make it easier to ensure the correct props are passed in.
	   *
	   * Available rules include:
	   *
	   * type: {String} string | array | object | boolean | number | date | function
	   *       {Array} An array of types mentioned above
	   *       {Function} fn(value) should return `true` to pass in
	   * expects: [] An array of values this prop could equal
	   * optional: Boolean
	   */

	  function validateProps (props, rules, optPrefix) {
	    var prefix = optPrefix || ''
	    if (!options.validateProps) return
	    forEach(rules, function (options, name) {
	      if (!options) {
	        throw new Error('deku: propTypes should have an options object for each type')
	      }

	      var propName = prefix ? prefix + '.' + name : name
	      var value = keypath.get(props, name)
	      var valueType = type(value)
	      var typeFormat = type(options.type)
	      var optional = (options.optional === true)

	      // If it's optional and doesn't exist
	      if (optional && value == null) {
	        return
	      }

	      // If it's required and doesn't exist
	      if (!optional && value == null) {
	        throw new TypeError('Missing property: ' + propName)
	      }

	      // It's a nested type
	      if (typeFormat === 'object') {
	        validateProps(value, options.type, propName)
	        return
	      }

	      // If it's the incorrect type
	      if (typeFormat === 'string' && valueType !== options.type) {
	        throw new TypeError('Invalid property type: ' + propName)
	      }

	      // If type is validate function
	      if (typeFormat === 'function' && !options.type(value)) {
	        throw new TypeError('Invalid property type: ' + propName)
	      }

	      // if type is array of possible types
	      if (typeFormat === 'array' && options.type.indexOf(valueType) < 0) {
	        throw new TypeError('Invalid property type: ' + propName)
	      }

	      // If it's an invalid value
	      if (options.expects && options.expects.indexOf(value) < 0) {
	        throw new TypeError('Invalid property value: ' + propName)
	      }
	    })

	    // Now check for props that haven't been defined
	    forEach(props, function (value, key) {
	      // props.children is always passed in, even if it's not defined
	      if (key === 'children') return
	      if (!rules[key]) throw new Error('Unexpected property: ' + key)
	    })
	  }

	  /**
	   * Used for debugging to inspect the current state without
	   * us needing to explicitly manage storing/updating references.
	   *
	   * @return {Object}
	   */

	  function inspect () {
	    return {
	      entities: entities,
	      pools: pools,
	      handlers: handlers,
	      connections: connections,
	      currentElement: currentElement,
	      options: options,
	      app: app,
	      container: container,
	      children: children
	    }
	  }

	  /**
	   * Return an object that lets us completely remove the automatic
	   * DOM rendering and export debugging tools.
	   */

	  return {
	    remove: teardown,
	    inspect: inspect
	  }
	}

	/**
	 * A rendered component instance.
	 *
	 * This manages the lifecycle, props and state of the component.
	 * It's basically just a data object for more straightfoward lookup.
	 *
	 * @param {Component} component
	 * @param {Object} props
	 */

	function Entity (component, props, ownerId) {
	  this.id = uid()
	  this.ownerId = ownerId
	  this.component = component
	  this.propTypes = component.propTypes || {}
	  this.context = {}
	  this.context.id = this.id;
	  this.context.props = defaults(props || {}, component.defaultProps || {})
	  this.context.state = this.component.initialState ? this.component.initialState(this.context.props) : {}
	  this.pendingProps = assign({}, this.context.props)
	  this.pendingState = assign({}, this.context.state)
	  this.dirty = false
	  this.virtualElement = null
	  this.nativeElement = null
	  this.displayName = component.name || 'Component'
	}

	/**
	 * Should we pool an element?
	 */

	function canPool(tagName) {
	  return avoidPooling.indexOf(tagName) < 0
	}

	/**
	 * Get a nested node using a path
	 *
	 * @param {HTMLElement} el   The root node '0'
	 * @param {String} path The path string eg. '0.2.43'
	 */

	function getNodeAtPath(el, path) {
	  var parts = path.split('.')
	  parts.shift()
	  while (parts.length) {
	    el = el.childNodes[parts.pop()]
	  }
	  return el
	}


/***/ },
/* 11 */
/***/ function(module, exports, __webpack_require__) {

	/**
	 * The npm 'defaults' module but without clone because
	 * it was requiring the 'Buffer' module which is huge.
	 *
	 * @param {Object} options
	 * @param {Object} defaults
	 *
	 * @return {Object}
	 */

	exports.defaults = function(options, defaults) {
	  Object.keys(defaults).forEach(function(key) {
	    if (typeof options[key] === 'undefined') {
	      options[key] = defaults[key]
	    }
	  })
	  return options
	}


/***/ },
/* 12 */
/***/ function(module, exports, __webpack_require__) {

	/**
	 * Expose `requestAnimationFrame()`.
	 */

	exports = module.exports = window.requestAnimationFrame
	  || window.webkitRequestAnimationFrame
	  || window.mozRequestAnimationFrame
	  || fallback;

	/**
	 * Fallback implementation.
	 */

	var prev = new Date().getTime();
	function fallback(fn) {
	  var curr = new Date().getTime();
	  var ms = Math.max(0, 16 - (curr - prev));
	  var req = setTimeout(fn, ms);
	  prev = curr;
	  return req;
	}

	/**
	 * Cancel.
	 */

	var cancel = window.cancelAnimationFrame
	  || window.webkitCancelAnimationFrame
	  || window.mozCancelAnimationFrame
	  || window.clearTimeout;

	exports.cancel = function(id){
	  cancel.call(window, id);
	};


/***/ },
/* 13 */
/***/ function(module, exports, __webpack_require__) {

	function Pool(params) {
	    if (typeof params !== 'object') {
	        throw new Error("Please pass parameters. Example -> new Pool({ tagName: \"div\" })");
	    }

	    if (typeof params.tagName !== 'string') {
	        throw new Error("Please specify a tagName. Example -> new Pool({ tagName: \"div\" })");
	    }

	    this.storage = [];
	    this.tagName = params.tagName.toLowerCase();
	    this.namespace = params.namespace;
	}

	Pool.prototype.push = function(el) {
	    if (el.tagName.toLowerCase() !== this.tagName) {
	        return;
	    }
	    
	    this.storage.push(el);
	};

	Pool.prototype.pop = function(argument) {
	    if (this.storage.length === 0) {
	        return this.create();
	    } else {
	        return this.storage.pop();
	    }
	};

	Pool.prototype.create = function() {
	    if (this.namespace) {
	        return document.createElementNS(this.namespace, this.tagName);
	    } else {
	        return document.createElement(this.tagName);
	    }
	};

	Pool.prototype.allocate = function(size) {
	    if (this.storage.length >= size) {
	        return;
	    }

	    var difference = size - this.storage.length;
	    for (var poolAllocIter = 0; poolAllocIter < difference; poolAllocIter++) {
	        this.storage.push(this.create());
	    }
	};

	if (typeof module !== 'undefined' && typeof module.exports !== 'undefined') {
	    module.exports = Pool;
	}


/***/ },
/* 14 */
/***/ function(module, exports, __webpack_require__) {

	var slice = Array.prototype.slice

	module.exports = iterativelyWalk

	function iterativelyWalk(nodes, cb) {
	    if (!('length' in nodes)) {
	        nodes = [nodes]
	    }
	    
	    nodes = slice.call(nodes)

	    while(nodes.length) {
	        var node = nodes.shift(),
	            ret = cb(node)

	        if (ret) {
	            return ret
	        }

	        if (node.childNodes && node.childNodes.length) {
	            nodes = slice.call(node.childNodes).concat(nodes)
	        }
	    }
	}


/***/ },
/* 15 */
/***/ function(module, exports, __webpack_require__) {

	/*global window*/

	/**
	 * Check if object is dom node.
	 *
	 * @param {Object} val
	 * @return {Boolean}
	 * @api public
	 */

	module.exports = function isNode(val){
	  if (!val || typeof val !== 'object') return false;
	  if (window && 'object' == typeof window.Node) return val instanceof window.Node;
	  return 'number' == typeof val.nodeType && 'string' == typeof val.nodeName;
	}


/***/ },
/* 16 */
/***/ function(module, exports, __webpack_require__) {

	/** generate unique id for selector */
	var counter = Date.now() % 1e9;

	module.exports = function getUid(){
		return (Math.random() * 1e9 >>> 0) + (counter++);
	};

/***/ },
/* 17 */
/***/ function(module, exports, __webpack_require__) {

	var __WEBPACK_AMD_DEFINE_FACTORY__, __WEBPACK_AMD_DEFINE_ARRAY__, __WEBPACK_AMD_DEFINE_RESULT__;(function (root, factory){
	  'use strict';

	  /*istanbul ignore next:cant test*/
	  if (typeof module === 'object' && typeof module.exports === 'object') {
	    module.exports = factory();
	  } else if (true) {
	    // AMD. Register as an anonymous module.
	    !(__WEBPACK_AMD_DEFINE_ARRAY__ = [], __WEBPACK_AMD_DEFINE_FACTORY__ = (factory), __WEBPACK_AMD_DEFINE_RESULT__ = (typeof __WEBPACK_AMD_DEFINE_FACTORY__ === 'function' ? (__WEBPACK_AMD_DEFINE_FACTORY__.apply(exports, __WEBPACK_AMD_DEFINE_ARRAY__)) : __WEBPACK_AMD_DEFINE_FACTORY__), __WEBPACK_AMD_DEFINE_RESULT__ !== undefined && (module.exports = __WEBPACK_AMD_DEFINE_RESULT__));
	  } else {
	    // Browser globals
	    root.objectPath = factory();
	  }
	})(this, function(){
	  'use strict';

	  var
	    toStr = Object.prototype.toString,
	    _hasOwnProperty = Object.prototype.hasOwnProperty;

	  function isEmpty(value){
	    if (!value) {
	      return true;
	    }
	    if (isArray(value) && value.length === 0) {
	      return true;
	    } else {
	      for (var i in value) {
	        if (_hasOwnProperty.call(value, i)) {
	          return false;
	        }
	      }
	      return true;
	    }
	  }

	  function toString(type){
	    return toStr.call(type);
	  }

	  function isNumber(value){
	    return typeof value === 'number' || toString(value) === "[object Number]";
	  }

	  function isString(obj){
	    return typeof obj === 'string' || toString(obj) === "[object String]";
	  }

	  function isObject(obj){
	    return typeof obj === 'object' && toString(obj) === "[object Object]";
	  }

	  function isArray(obj){
	    return typeof obj === 'object' && typeof obj.length === 'number' && toString(obj) === '[object Array]';
	  }

	  function isBoolean(obj){
	    return typeof obj === 'boolean' || toString(obj) === '[object Boolean]';
	  }

	  function getKey(key){
	    var intKey = parseInt(key);
	    if (intKey.toString() === key) {
	      return intKey;
	    }
	    return key;
	  }

	  function set(obj, path, value, doNotReplace){
	    if (isNumber(path)) {
	      path = [path];
	    }
	    if (isEmpty(path)) {
	      return obj;
	    }
	    if (isString(path)) {
	      return set(obj, path.split('.').map(getKey), value, doNotReplace);
	    }
	    var currentPath = path[0];

	    if (path.length === 1) {
	      var oldVal = obj[currentPath];
	      if (oldVal === void 0 || !doNotReplace) {
	        obj[currentPath] = value;
	      }
	      return oldVal;
	    }

	    if (obj[currentPath] === void 0) {
	      //check if we assume an array
	      if(isNumber(path[1])) {
	        obj[currentPath] = [];
	      } else {
	        obj[currentPath] = {};
	      }
	    }

	    return set(obj[currentPath], path.slice(1), value, doNotReplace);
	  }

	  function del(obj, path) {
	    if (isNumber(path)) {
	      path = [path];
	    }

	    if (isEmpty(obj)) {
	      return void 0;
	    }

	    if (isEmpty(path)) {
	      return obj;
	    }
	    if(isString(path)) {
	      return del(obj, path.split('.'));
	    }

	    var currentPath = getKey(path[0]);
	    var oldVal = obj[currentPath];

	    if(path.length === 1) {
	      if (oldVal !== void 0) {
	        if (isArray(obj)) {
	          obj.splice(currentPath, 1);
	        } else {
	          delete obj[currentPath];
	        }
	      }
	    } else {
	      if (obj[currentPath] !== void 0) {
	        return del(obj[currentPath], path.slice(1));
	      }
	    }

	    return obj;
	  }

	  var objectPath = {};

	  objectPath.has = function (obj, path) {
	    if (isEmpty(obj)) {
	      return false;
	    }

	    if (isNumber(path)) {
	      path = [path];
	    } else if (isString(path)) {
	      path = path.split('.');
	    }

	    if (isEmpty(path) || path.length === 0) {
	      return false;
	    }

	    for (var i = 0; i < path.length; i++) {
	      var j = path[i];
	      if ((isObject(obj) || isArray(obj)) && _hasOwnProperty.call(obj, j)) {
	        obj = obj[j];
	      } else {
	        return false;
	      }
	    }

	    return true;
	  };

	  objectPath.ensureExists = function (obj, path, value){
	    return set(obj, path, value, true);
	  };

	  objectPath.set = function (obj, path, value, doNotReplace){
	    return set(obj, path, value, doNotReplace);
	  };

	  objectPath.insert = function (obj, path, value, at){
	    var arr = objectPath.get(obj, path);
	    at = ~~at;
	    if (!isArray(arr)) {
	      arr = [];
	      objectPath.set(obj, path, arr);
	    }
	    arr.splice(at, 0, value);
	  };

	  objectPath.empty = function(obj, path) {
	    if (isEmpty(path)) {
	      return obj;
	    }
	    if (isEmpty(obj)) {
	      return void 0;
	    }

	    var value, i;
	    if (!(value = objectPath.get(obj, path))) {
	      return obj;
	    }

	    if (isString(value)) {
	      return objectPath.set(obj, path, '');
	    } else if (isBoolean(value)) {
	      return objectPath.set(obj, path, false);
	    } else if (isNumber(value)) {
	      return objectPath.set(obj, path, 0);
	    } else if (isArray(value)) {
	      value.length = 0;
	    } else if (isObject(value)) {
	      for (i in value) {
	        if (_hasOwnProperty.call(value, i)) {
	          delete value[i];
	        }
	      }
	    } else {
	      return objectPath.set(obj, path, null);
	    }
	  };

	  objectPath.push = function (obj, path /*, values */){
	    var arr = objectPath.get(obj, path);
	    if (!isArray(arr)) {
	      arr = [];
	      objectPath.set(obj, path, arr);
	    }

	    arr.push.apply(arr, Array.prototype.slice.call(arguments, 2));
	  };

	  objectPath.coalesce = function (obj, paths, defaultValue) {
	    var value;

	    for (var i = 0, len = paths.length; i < len; i++) {
	      if ((value = objectPath.get(obj, paths[i])) !== void 0) {
	        return value;
	      }
	    }

	    return defaultValue;
	  };

	  objectPath.get = function (obj, path, defaultValue){
	    if (isNumber(path)) {
	      path = [path];
	    }
	    if (isEmpty(path)) {
	      return obj;
	    }
	    if (isEmpty(obj)) {
	      return defaultValue;
	    }
	    if (isString(path)) {
	      return objectPath.get(obj, path.split('.'), defaultValue);
	    }

	    var currentPath = getKey(path[0]);

	    if (path.length === 1) {
	      if (obj[currentPath] === void 0) {
	        return defaultValue;
	      }
	      return obj[currentPath];
	    }

	    return objectPath.get(obj[currentPath], path.slice(1), defaultValue);
	  };

	  objectPath.del = function(obj, path) {
	    return del(obj, path);
	  };

	  return objectPath;
	});


/***/ },
/* 18 */
/***/ function(module, exports, __webpack_require__) {

	/**
	 * toString ref.
	 */

	var toString = Object.prototype.toString;

	/**
	 * Return the type of `val`.
	 *
	 * @param {Mixed} val
	 * @return {String}
	 * @api public
	 */

	module.exports = function(val){
	  switch (toString.call(val)) {
	    case '[object Date]': return 'date';
	    case '[object RegExp]': return 'regexp';
	    case '[object Arguments]': return 'arguments';
	    case '[object Array]': return 'array';
	    case '[object Error]': return 'error';
	  }

	  if (val === null) return 'null';
	  if (val === undefined) return 'undefined';
	  if (val !== val) return 'nan';
	  if (val && val.nodeType === 1) return 'element';

	  val = val.valueOf
	    ? val.valueOf()
	    : Object.prototype.valueOf.apply(val)

	  return typeof val;
	};


/***/ },
/* 19 */
/***/ function(module, exports, __webpack_require__) {

	var indexOf = __webpack_require__(20)

	/**
	 * This file lists the supported SVG elements used by the
	 * renderer. We may add better SVG support in the future
	 * that doesn't require whitelisting elements.
	 */

	exports.namespace = 'http://www.w3.org/2000/svg'

	/**
	 * Supported SVG elements
	 *
	 * @type {Array}
	 */

	exports.elements = [
	  'circle',
	  'defs',
	  'ellipse',
	  'g',
	  'line',
	  'linearGradient',
	  'mask',
	  'path',
	  'pattern',
	  'polygon',
	  'polyline',
	  'radialGradient',
	  'rect',
	  'stop',
	  'svg',
	  'text',
	  'tspan'
	]

	/**
	 * Supported SVG attributes
	 */

	exports.attributes = [
	  'cx',
	  'cy',
	  'd',
	  'dx',
	  'dy',
	  'fill',
	  'fillOpacity',
	  'fontFamily',
	  'fontSize',
	  'fx',
	  'fy',
	  'gradientTransform',
	  'gradientUnits',
	  'markerEnd',
	  'markerMid',
	  'markerStart',
	  'offset',
	  'opacity',
	  'patternContentUnits',
	  'patternUnits',
	  'points',
	  'preserveAspectRatio',
	  'r',
	  'rx',
	  'ry',
	  'spreadMethod',
	  'stopColor',
	  'stopOpacity',
	  'stroke',
	  'strokeDasharray',
	  'strokeLinecap',
	  'strokeOpacity',
	  'strokeWidth',
	  'textAnchor',
	  'transform',
	  'version',
	  'viewBox',
	  'x1',
	  'x2',
	  'x',
	  'y1',
	  'y2',
	  'y'
	]

	/**
	 * Is element's namespace SVG?
	 *
	 * @param {String} name
	 */

	exports.isElement = function (name) {
	  return indexOf(exports.elements, name) !== -1
	}

	/**
	 * Are element's attributes SVG?
	 *
	 * @param {String} attr
	 */

	exports.isAttribute = function (attr) {
	  return indexOf(exports.attributes, attr) !== -1
	}



/***/ },
/* 20 */
/***/ function(module, exports, __webpack_require__) {

	'use strict';

	/**
	 * # Index Of
	 *
	 * A faster `Array.prototype.indexOf()` implementation.
	 *
	 * @param  {Array}  subject   The array (or array-like) to search within.
	 * @param  {mixed}  target    The target item to search for.
	 * @param  {Number} fromIndex The position to start searching from, if known.
	 * @return {Number}           The position of the target in the subject, or -1 if it does not exist.
	 */
	module.exports = function fastIndexOf (subject, target, fromIndex) {
	  var length = subject.length,
	      i = 0;

	  if (typeof fromIndex === 'number') {
	    i = fromIndex;
	    if (i < 0) {
	      i += length;
	      if (i < 0) {
	        i = 0;
	      }
	    }
	  }

	  for (; i < length; i++) {
	    if (subject[i] === target) {
	      return i;
	    }
	  }
	  return -1;
	};


/***/ },
/* 21 */
/***/ function(module, exports, __webpack_require__) {

	/**
	 * All of the events can bind to
	 */

	module.exports = {
	  onBlur: 'blur',
	  onChange: 'change',
	  onClick: 'click',
	  onContextMenu: 'contextmenu',
	  onCopy: 'copy',
	  onCut: 'cut',
	  onDoubleClick: 'dblclick',
	  onDrag: 'drag',
	  onDragEnd: 'dragend',
	  onDragEnter: 'dragenter',
	  onDragExit: 'dragexit',
	  onDragLeave: 'dragleave',
	  onDragOver: 'dragover',
	  onDragStart: 'dragstart',
	  onDrop: 'drop',
	  onFocus: 'focus',
	  onInput: 'input',
	  onKeyDown: 'keydown',
	  onKeyPress: 'keypress',
	  onKeyUp: 'keyup',
	  onMouseDown: 'mousedown',
	  onMouseEnter: 'mouseenter',
	  onMouseLeave: 'mouseleave',
	  onMouseMove: 'mousemove',
	  onMouseOut: 'mouseout',
	  onMouseOver: 'mouseover',
	  onMouseUp: 'mouseup',
	  onPaste: 'paste',
	  onScroll: 'scroll',
	  onSubmit: 'submit',
	  onTouchCancel: 'touchcancel',
	  onTouchEnd: 'touchend',
	  onTouchMove: 'touchmove',
	  onTouchStart: 'touchstart',
	  onWheel: 'wheel'
	}


/***/ },
/* 22 */
/***/ function(module, exports, __webpack_require__) {

	'use strict';

	var forEachArray = __webpack_require__(23),
	    forEachObject = __webpack_require__(25);

	/**
	 * # ForEach
	 *
	 * A fast `.forEach()` implementation.
	 *
	 * @param  {Array|Object} subject     The array or object to iterate over.
	 * @param  {Function}     fn          The visitor function.
	 * @param  {Object}       thisContext The context for the visitor.
	 */
	module.exports = function fastForEach (subject, fn, thisContext) {
	  if (subject instanceof Array) {
	    return forEachArray(subject, fn, thisContext);
	  }
	  else {
	    return forEachObject(subject, fn, thisContext);
	  }
	};

/***/ },
/* 23 */
/***/ function(module, exports, __webpack_require__) {

	'use strict';

	var bindInternal3 = __webpack_require__(24);

	/**
	 * # For Each
	 *
	 * A fast `.forEach()` implementation.
	 *
	 * @param  {Array}    subject     The array (or array-like) to iterate over.
	 * @param  {Function} fn          The visitor function.
	 * @param  {Object}   thisContext The context for the visitor.
	 */
	module.exports = function fastForEach (subject, fn, thisContext) {
	  var length = subject.length,
	      iterator = thisContext !== undefined ? bindInternal3(fn, thisContext) : fn,
	      i;
	  for (i = 0; i < length; i++) {
	    iterator(subject[i], i, subject);
	  }
	};


/***/ },
/* 24 */
/***/ function(module, exports, __webpack_require__) {

	'use strict';

	/**
	 * Internal helper to bind a function known to have 3 arguments
	 * to a given context.
	 */
	module.exports = function bindInternal3 (func, thisContext) {
	  return function (a, b, c) {
	    return func.call(thisContext, a, b, c);
	  };
	};


/***/ },
/* 25 */
/***/ function(module, exports, __webpack_require__) {

	'use strict';

	var bindInternal3 = __webpack_require__(24);

	/**
	 * # For Each
	 *
	 * A fast object `.forEach()` implementation.
	 *
	 * @param  {Object}   subject     The object to iterate over.
	 * @param  {Function} fn          The visitor function.
	 * @param  {Object}   thisContext The context for the visitor.
	 */
	module.exports = function fastForEachObject (subject, fn, thisContext) {
	  var keys = Object.keys(subject),
	      length = keys.length,
	      iterator = thisContext !== undefined ? bindInternal3(fn, thisContext) : fn,
	      key, i;
	  for (i = 0; i < length; i++) {
	    key = keys[i];
	    iterator(subject[key], key, subject);
	  }
	};


/***/ },
/* 26 */
/***/ function(module, exports, __webpack_require__) {

	'use strict';

	/**
	 * Analogue of Object.assign().
	 * Copies properties from one or more source objects to
	 * a target object. Existing keys on the target object will be overwritten.
	 *
	 * > Note: This differs from spec in some important ways:
	 * > 1. Will throw if passed non-objects, including `undefined` or `null` values.
	 * > 2. Does not support the curious Exception handling behavior, exceptions are thrown immediately.
	 * > For more details, see:
	 * > https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object/assign
	 *
	 *
	 *
	 * @param  {Object} target      The target object to copy properties to.
	 * @param  {Object} source, ... The source(s) to copy properties from.
	 * @return {Object}             The updated target object.
	 */
	module.exports = function fastAssign (target) {
	  var totalArgs = arguments.length,
	      source, i, totalKeys, keys, key, j;

	  for (i = 1; i < totalArgs; i++) {
	    source = arguments[i];
	    keys = Object.keys(source);
	    totalKeys = keys.length;
	    for (j = 0; j < totalKeys; j++) {
	      key = keys[j];
	      target[key] = source[key];
	    }
	  }
	  return target;
	};


/***/ },
/* 27 */
/***/ function(module, exports, __webpack_require__) {

	'use strict';

	var reduceArray = __webpack_require__(28),
	    reduceObject = __webpack_require__(30);

	/**
	 * # Reduce
	 *
	 * A fast `.reduce()` implementation.
	 *
	 * @param  {Array|Object} subject      The array or object to reduce over.
	 * @param  {Function}     fn           The reducer function.
	 * @param  {mixed}        initialValue The initial value for the reducer, defaults to subject[0].
	 * @param  {Object}       thisContext  The context for the reducer.
	 * @return {Array|Object}              The array or object containing the results.
	 */
	module.exports = function fastReduce (subject, fn, initialValue, thisContext) {
	  if (subject instanceof Array) {
	    return reduceArray(subject, fn, initialValue, thisContext);
	  }
	  else {
	    return reduceObject(subject, fn, initialValue, thisContext);
	  }
	};

/***/ },
/* 28 */
/***/ function(module, exports, __webpack_require__) {

	'use strict';

	var bindInternal4 = __webpack_require__(29);

	/**
	 * # Reduce
	 *
	 * A fast `.reduce()` implementation.
	 *
	 * @param  {Array}    subject      The array (or array-like) to reduce.
	 * @param  {Function} fn           The reducer function.
	 * @param  {mixed}    initialValue The initial value for the reducer, defaults to subject[0].
	 * @param  {Object}   thisContext  The context for the reducer.
	 * @return {mixed}                 The final result.
	 */
	module.exports = function fastReduce (subject, fn, initialValue, thisContext) {
	  var length = subject.length,
	      iterator = thisContext !== undefined ? bindInternal4(fn, thisContext) : fn,
	      i, result;

	  if (initialValue === undefined) {
	    i = 1;
	    result = subject[0];
	  }
	  else {
	    i = 0;
	    result = initialValue;
	  }

	  for (; i < length; i++) {
	    result = iterator(result, subject[i], i, subject);
	  }

	  return result;
	};


/***/ },
/* 29 */
/***/ function(module, exports, __webpack_require__) {

	'use strict';

	/**
	 * Internal helper to bind a function known to have 4 arguments
	 * to a given context.
	 */
	module.exports = function bindInternal4 (func, thisContext) {
	  return function (a, b, c, d) {
	    return func.call(thisContext, a, b, c, d);
	  };
	};


/***/ },
/* 30 */
/***/ function(module, exports, __webpack_require__) {

	'use strict';

	var bindInternal4 = __webpack_require__(29);

	/**
	 * # Reduce
	 *
	 * A fast object `.reduce()` implementation.
	 *
	 * @param  {Object}   subject      The object to reduce over.
	 * @param  {Function} fn           The reducer function.
	 * @param  {mixed}    initialValue The initial value for the reducer, defaults to subject[0].
	 * @param  {Object}   thisContext  The context for the reducer.
	 * @return {mixed}                 The final result.
	 */
	module.exports = function fastReduceObject (subject, fn, initialValue, thisContext) {
	  var keys = Object.keys(subject),
	      length = keys.length,
	      iterator = thisContext !== undefined ? bindInternal4(fn, thisContext) : fn,
	      i, key, result;

	  if (initialValue === undefined) {
	    i = 1;
	    result = subject[keys[0]];
	  }
	  else {
	    i = 0;
	    result = initialValue;
	  }

	  for (; i < length; i++) {
	    key = keys[i];
	    result = iterator(result, subject[key], key, subject);
	  }

	  return result;
	};


/***/ },
/* 31 */
/***/ function(module, exports, __webpack_require__) {

	module.exports = isPromise;

	function isPromise(obj) {
	  return obj && (typeof obj === 'object' || typeof obj === 'function') && typeof obj.then === 'function';
	}


/***/ },
/* 32 */
/***/ function(module, exports, __webpack_require__) {

	var utils = __webpack_require__(11)
	var events = __webpack_require__(21)
	var defaults = utils.defaults

	/**
	 * Expose `stringify`.
	 */

	module.exports = function (app) {
	  if (!app.element) {
	    throw new Error('No element mounted')
	  }

	  /**
	   * Render to string.
	   *
	   * @param {Component} component
	   * @param {Object} [props]
	   * @return {String}
	   */

	  function stringify (component, optProps) {
	    var propTypes = component.propTypes || {}
	    var props = defaults(optProps || {}, component.defaultProps || {})
	    var state = component.initialState ? component.initialState(props) : {}

	    for (var name in propTypes) {
	      var options = propTypes[name]
	      if (options.source) {
	        props[name] = app.sources[options.source]
	      }
	    }

	    if (component.beforeMount) component.beforeMount({ props: props, state: state })
	    if (component.beforeRender) component.beforeRender({ props: props, state: state })
	    var node = component.render({ props: props, state: state })
	    return stringifyNode(node, '0')
	  }

	  /**
	   * Render a node to a string
	   *
	   * @param {Node} node
	   * @param {Tree} tree
	   *
	   * @return {String}
	   */

	  function stringifyNode (node, path) {
	    switch (node.type) {
	      case 'text': return node.data
	      case 'element':
	        var children = node.children
	        var attributes = node.attributes
	        var tagName = node.tagName
	        var innerHTML = attributes.innerHTML
	        var str = '<' + tagName + attrs(attributes) + '>'

	        if (innerHTML) {
	          str += innerHTML
	        } else {
	          for (var i = 0, n = children.length; i < n; i++) {
	            str += stringifyNode(children[i], path + '.' + i)
	          }
	        }

	        str += '</' + tagName + '>'
	        return str
	      case 'component': return stringify(node.component, node.props)
	    }

	    throw new Error('Invalid type')
	  }

	  return stringifyNode(app.element, '0')
	}

	/**
	 * HTML attributes to string.
	 *
	 * @param {Object} attributes
	 * @return {String}
	 * @api private
	 */

	function attrs (attributes) {
	  var str = ''
	  for (var key in attributes) {
	    if (key === 'innerHTML') continue
	    if (events[key]) continue
	    str += attr(key, attributes[key])
	  }
	  return str
	}

	/**
	 * HTML attribute to string.
	 *
	 * @param {String} key
	 * @param {String} val
	 * @return {String}
	 * @api private
	 */

	function attr (key, val) {
	  return ' ' + key + '="' + val + '"'
	}


/***/ },
/* 33 */
/***/ function(module, exports, __webpack_require__) {

	/**
	 * Module dependencies.
	 */

	var type = __webpack_require__(18)
	var slice = __webpack_require__(34)
	var flatten = __webpack_require__(36)

	/**
	 * This function lets us create virtual nodes using a simple
	 * syntax. It is compatible with JSX transforms so you can use
	 * JSX to write nodes that will compile to this function.
	 *
	 * let node = virtual('div', { id: 'foo' }, [
	 *   virtual('a', { href: 'http://google.com' }, 'Google')
	 * ])
	 *
	 * You can leave out the attributes or the children if either
	 * of them aren't needed and it will figure out what you're
	 * trying to do.
	 */

	module.exports = virtual

	/**
	 * Create virtual DOM trees.
	 *
	 * This creates the nicer API for the user.
	 * It translates that friendly API into an actual tree of nodes.
	 *
	 * @param {String|Function} type
	 * @param {Object} props
	 * @param {Array} children
	 * @return {Node}
	 * @api public
	 */

	function virtual (type, props, children) {
	  // Default to div with no args
	  if (!type) {
	    throw new Error('deku: Element needs a type. Read more: http://cl.ly/b0KZ')
	  }

	  // Skipped adding attributes and we're passing
	  // in children instead.
	  if (arguments.length === 2 && (typeof props === 'string' || Array.isArray(props))) {
	    children = props
	    props = {}
	  }

	  // Account for JSX putting the children as multiple arguments.
	  // This is essentially just the ES6 rest param
	  if (arguments.length > 2 && Array.isArray(arguments[2]) === false) {
	    children = slice(arguments, 2)
	  }

	  children = children || []
	  props = props || {}

	  // passing in a single child, you can skip
	  // using the array
	  if (!Array.isArray(children)) {
	    children = [ children ]
	  }

	  children = flatten(children, 1).reduce(normalize, [])

	  // pull the key out from the data.
	  var key = 'key' in props ? String(props.key) : null
	  delete props['key']

	  // if you pass in a function, it's a `Component` constructor.
	  // otherwise it's an element.
	  var node
	  if (typeof type === 'string') {
	    node = new ElementNode(type, props, key, children)
	  } else {
	    node = new ComponentNode(type, props, key, children)
	  }

	  // set the unique ID
	  node.index = 0

	  return node
	}

	/**
	 * Parse nodes into real `Node` objects.
	 *
	 * @param {Mixed} node
	 * @param {Integer} index
	 * @return {Node}
	 * @api private
	 */

	function normalize (acc, node) {
	  if (node == null) {
	    return acc
	  }
	  if (typeof node === 'string' || typeof node === 'number') {
	    var newNode = new TextNode(String(node))
	    newNode.index = acc.length
	    acc.push(newNode)
	  } else {
	    node.index = acc.length
	    acc.push(node)
	  }
	  return acc
	}

	/**
	 * Initialize a new `ComponentNode`.
	 *
	 * @param {Component} component
	 * @param {Object} props
	 * @param {String} key Used for sorting/replacing during diffing.
	 * @param {Array} children Child virtual nodes
	 * @api public
	 */

	function ComponentNode (component, props, key, children) {
	  this.key = key
	  this.props = props
	  this.type = 'component'
	  this.component = component
	  this.props.children = children || []
	}

	/**
	 * Initialize a new `ElementNode`.
	 *
	 * @param {String} tagName
	 * @param {Object} attributes
	 * @param {String} key Used for sorting/replacing during diffing.
	 * @param {Array} children Child virtual dom nodes.
	 * @api public
	 */

	function ElementNode (tagName, attributes, key, children) {
	  this.type = 'element'
	  this.attributes = parseAttributes(attributes)
	  this.tagName = tagName
	  this.children = children || []
	  this.key = key
	}

	/**
	 * Initialize a new `TextNode`.
	 *
	 * This is just a virtual HTML text object.
	 *
	 * @param {String} text
	 * @api public
	 */

	function TextNode (text) {
	  this.type = 'text'
	  this.data = String(text)
	}

	/**
	 * Parse attributes for some special cases.
	 *
	 * TODO: This could be more functional and allow hooks
	 * into the processing of the attributes at a component-level
	 *
	 * @param {Object} attributes
	 *
	 * @return {Object}
	 */

	function parseAttributes (attributes) {
	  // style: { 'text-align': 'left' }
	  if (attributes.style) {
	    attributes.style = parseStyle(attributes.style)
	  }

	  // class: { foo: true, bar: false, baz: true }
	  // class: ['foo', 'bar', 'baz']
	  if (attributes.class) {
	    attributes.class = parseClass(attributes.class)
	  }

	  // Remove attributes with false values
	  var filteredAttributes = {}
	  for (var key in attributes) {
	    var value = attributes[key]
	    if (value == null || value === false) continue
	    filteredAttributes[key] = value
	  }

	  return filteredAttributes
	}

	/**
	 * Parse a block of styles into a string.
	 *
	 * TODO: this could do a lot more with vendor prefixing,
	 * number values etc. Maybe there's a way to allow users
	 * to hook into this?
	 *
	 * @param {Object} styles
	 *
	 * @return {String}
	 */

	function parseStyle (styles) {
	  if (type(styles) === 'string') {
	    return styles
	  }
	  var str = ''
	  for (var name in styles) {
	    var value = styles[name]
	    str = str + name + ':' + value + ';'
	  }
	  return str;
	}

	/**
	 * Parse the class attribute so it's able to be
	 * set in a more user-friendly way
	 *
	 * @param {String|Object|Array} value
	 *
	 * @return {String}
	 */

	function parseClass (value) {
	  // { foo: true, bar: false, baz: true }
	  if (type(value) === 'object') {
	    var matched = []
	    for (var key in value) {
	      if (value[key]) matched.push(key)
	    }
	    value = matched
	  }

	  // ['foo', 'bar', 'baz']
	  if (type(value) === 'array') {
	    if (value.length === 0) {
	      return
	    }
	    value = value.join(' ')
	  }

	  return value
	}


/***/ },
/* 34 */
/***/ function(module, exports, __webpack_require__) {

	module.exports = exports = __webpack_require__(35);


/***/ },
/* 35 */
/***/ function(module, exports, __webpack_require__) {

	
	/**
	 * An Array.prototype.slice.call(arguments) alternative
	 *
	 * @param {Object} args something with a length
	 * @param {Number} slice
	 * @param {Number} sliceEnd
	 * @api public
	 */

	module.exports = function (args, slice, sliceEnd) {
	  var ret = [];
	  var len = args.length;

	  if (0 === len) return ret;

	  var start = slice < 0
	    ? Math.max(0, slice + len)
	    : slice || 0;

	  if (sliceEnd !== undefined) {
	    len = sliceEnd < 0
	      ? sliceEnd + len
	      : sliceEnd
	  }

	  while (len-- > start) {
	    ret[len - start] = args[len];
	  }

	  return ret;
	}



/***/ },
/* 36 */
/***/ function(module, exports, __webpack_require__) {

	/**
	 * Recursive flatten function with depth.
	 *
	 * @param  {Array}  array
	 * @param  {Array}  result
	 * @param  {Number} depth
	 * @return {Array}
	 */
	function flattenDepth (array, result, depth) {
	  for (var i = 0; i < array.length; i++) {
	    var value = array[i]

	    if (depth > 0 && Array.isArray(value)) {
	      flattenDepth(value, result, depth - 1)
	    } else {
	      result.push(value)
	    }
	  }

	  return result
	}

	/**
	 * Recursive flatten function. Omitting depth is slightly faster.
	 *
	 * @param  {Array} array
	 * @param  {Array} result
	 * @return {Array}
	 */
	function flattenForever (array, result) {
	  for (var i = 0; i < array.length; i++) {
	    var value = array[i]

	    if (Array.isArray(value)) {
	      flattenForever(value, result)
	    } else {
	      result.push(value)
	    }
	  }

	  return result
	}

	/**
	 * Flatten an array, with the ability to define a depth.
	 *
	 * @param  {Array}  array
	 * @param  {Number} depth
	 * @return {Array}
	 */
	module.exports = function (array, depth) {
	  if (depth == null) {
	    return flattenForever(array, [])
	  }

	  return flattenDepth(array, [], depth)
	}


/***/ },
/* 37 */
/***/ function(module, exports, __webpack_require__) {

	module.exports = __webpack_require__(38);


/***/ },
/* 38 */
/***/ function(module, exports, __webpack_require__) {

	/** @jsx deku.dom */
	'use strict';

	Object.defineProperty(exports, '__esModule', {
	    value: true
	});

	function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { 'default': obj }; }

	var _deku = __webpack_require__(7);

	var _deku2 = _interopRequireDefault(_deku);

	var _soundcloudAudio = __webpack_require__(39);

	var _soundcloudAudio2 = _interopRequireDefault(_soundcloudAudio);

	var _componentsPlayButton = __webpack_require__(40);

	var _componentsPlayButton2 = _interopRequireDefault(_componentsPlayButton);

	var _componentsProgress = __webpack_require__(42);

	var _componentsProgress2 = _interopRequireDefault(_componentsProgress);

	var _componentsTimer = __webpack_require__(43);

	var _componentsTimer2 = _interopRequireDefault(_componentsTimer);

	var _componentsIcons = __webpack_require__(41);

	var _utilsAudioStore = __webpack_require__(44);

	exports['default'] = {
	    propTypes: {
	        url: {
	            type: 'string'
	        },
	        soundCloudAudio: function soundCloudAudio(prop) {
	            return prop instanceof _soundcloudAudio2['default'];
	        }
	    },

	    initialState: function initialState() {
	        return {
	            duration: 0,
	            currentTime: 0,
	            seeking: false,
	            playing: false
	        };
	    },

	    afterMount: function afterMount(component, el, setState) {
	        var props = component.props;
	        var soundCloudAudio = props.soundCloudAudio;

	        soundCloudAudio.resolve(props.url, function (data) {
	            // TBD: support for playlists
	            var track = data.tracks ? data.tracks[0] : data;
	            setState({ track: track });
	        });

	        function onAudioStarted() {
	            setState({ playing: true });

	            (0, _utilsAudioStore.stopAllOther)(soundCloudAudio.playing);
	            (0, _utilsAudioStore.addToStore)(soundCloudAudio);
	        }

	        function getCurrentTime() {
	            setState({ currentTime: soundCloudAudio.audio.currentTime });
	        }

	        function getDuration() {
	            setState({ duration: soundCloudAudio.audio.duration });
	        }

	        function onSeekingTrack() {
	            setState({ seeking: true });
	        }

	        function onSeekedTrack() {
	            setState({ seeking: false });
	        }

	        function onAudioEnded() {
	            setState({ playing: false });
	        }

	        // https://developer.mozilla.org/en-US/docs/Web/Guide/Events/Media_events
	        soundCloudAudio.on('playing', onAudioStarted);
	        soundCloudAudio.on('timeupdate', getCurrentTime);
	        soundCloudAudio.on('loadedmetadata', getDuration);
	        soundCloudAudio.on('seeking', onSeekingTrack);
	        soundCloudAudio.on('seeked', onSeekedTrack);
	        soundCloudAudio.on('pause', onAudioEnded);
	        soundCloudAudio.on('ended', onAudioEnded);
	    },

	    beforeMount: function beforeMount(component) {
	        var props = component.props;

	        props.soundCloudAudio.unbindAll();
	    },

	    render: function render(component) {
	        var state = component.state;
	        var props = component.props;

	        if (!state.track) {
	            return _deku2['default'].dom('span', null);
	        }

	        if (state.track && !state.track.streamable) {
	            return _deku2['default'].dom(
	                'div',
	                { 'class': 'sb-soundplayer-widget-message' },
	                _deku2['default'].dom(
	                    'a',
	                    { href: state.track.permalink_url, target: '_blank' },
	                    state.track.title
	                ),
	                ' is not streamable!'
	            );
	        }

	        return _deku2['default'].dom(
	            'div',
	            { 'class': 'sb-soundplayer-widget-cover', style: {
	                    'background-image': 'url(' + state.track.artwork_url.replace('large', 't500x500') + ')'
	                } },
	            _deku2['default'].dom('div', { 'class': 'sb-soundplayer-widget-overlay' }),
	            _deku2['default'].dom(
	                'div',
	                { 'class': 'sb-soundplayer-widget-track-info' },
	                _deku2['default'].dom(
	                    'h3',
	                    { 'class': 'sb-soundplayer-widget-user' },
	                    state.track.user.username
	                ),
	                _deku2['default'].dom(
	                    'h2',
	                    { 'class': 'sb-soundplayer-widget-title' },
	                    state.track.title
	                )
	            ),
	            _deku2['default'].dom(
	                'a',
	                { href: state.track.permalink_url, target: '_blank' },
	                _deku2['default'].dom(_componentsIcons.SoundCloudLogoSVG, null)
	            ),
	            _deku2['default'].dom(
	                'div',
	                { 'class': 'sb-soundplayer-widget-controls' },
	                _deku2['default'].dom(_componentsPlayButton2['default'], {
	                    playing: state.playing,
	                    soundCloudAudio: props.soundCloudAudio
	                }),
	                _deku2['default'].dom(_componentsProgress2['default'], {
	                    value: state.currentTime / state.duration * 100 || 0,
	                    soundCloudAudio: props.soundCloudAudio
	                }),
	                _deku2['default'].dom(_componentsTimer2['default'], {
	                    duration: state.track.duration / 1000,
	                    currentTime: state.currentTime
	                })
	            )
	        );
	    }
	};
	module.exports = exports['default'];

/***/ },
/* 39 */
/***/ function(module, exports, __webpack_require__) {

	'use strict';

	function SoundCloud (clientId) {
	    if (!(this instanceof SoundCloud)) {
	        return new SoundCloud(clientId);
	    }

	    if (!clientId) {
	        throw new Error('SoundCloud API clientId is required, get it - https://developers.soundcloud.com/');
	    }

	    this._events = {};

	    this._clientId = clientId;
	    this._baseUrl = 'http://api.soundcloud.com';

	    this.playing = false;
	    this.duration = 0;

	    this.audio = document.createElement('audio');
	}

	SoundCloud.prototype.resolve = function (url, callback) {
	    if (!url) {
	        throw new Error('SoundCloud track or playlist url is required');
	    }

	    url = this._baseUrl+'/resolve.json?url='+url+'&client_id='+this._clientId;

	    this._jsonp(url, function (data) {
	        if (data.tracks) {
	            this._playlist = data;
	        } else {
	            this._track = data;
	        }

	        this.duration = data.duration/1000; // convert to seconds
	        callback(data);
	    }.bind(this));
	};

	SoundCloud.prototype._jsonp = function (url, callback) {
	    var target = document.getElementsByTagName('script')[0] || document.head;
	    var script = document.createElement('script');

	    var id = 'jsonp_callback_'+Math.round(100000*Math.random());
	    window[id] = function (data) {
	        if (script.parentNode) {
	            script.parentNode.removeChild(script);
	        }
	        window[id] = function () {};
	        callback(data);
	    };

	    script.src = url + (url.indexOf('?') >= 0 ? '&' : '?') + 'callback=' + id;
	    target.parentNode.insertBefore(script, target);
	};

	SoundCloud.prototype.on = function (e, fn) {
	    this._events[e] = fn;
	    this.audio.addEventListener(e, fn, false);
	};

	SoundCloud.prototype.off = function (e, fn) {
	    this._events[e] = null;
	    this.audio.removeEventListener(e, fn);
	};

	SoundCloud.prototype.unbindAll = function () {
	    for (var e in this._events) {
	        var fn = this._events[e];
	        if (fn) {
	            this.off(e, fn);
	        }
	    }
	};

	SoundCloud.prototype.preload = function (streamUrl) {
	    this._track = {stream_url: streamUrl};
	    this.audio.src = streamUrl+'?client_id='+this._clientId;
	};

	SoundCloud.prototype.play = function (options) {
	    options = options || {};
	    var src;

	    if (options.streamUrl) {
	        src = options.streamUrl;
	    } else if (this._playlist) {
	        var length = this._playlist.tracks.length;
	        if (length) {
	            this._playlistIndex = options.playlistIndex || 0;

	            // be silent if index is out of range
	            if (this._playlistIndex >= length || this._playlistIndex < 0) {
	                this._playlistIndex = 0;
	                return;
	            }
	            src = this._playlist.tracks[this._playlistIndex].stream_url;
	        }
	    } else if (this._track) {
	        src = this._track.stream_url;
	    }

	    if (!src) {
	        throw new Error('There is no tracks to play, use `streamUrl` option or `load` method');
	    }

	    src += '?client_id='+this._clientId;

	    if (src !== this.audio.src) {
	        this.audio.src = src;
	    }

	    this.playing = src;
	    this.audio.play();
	};

	SoundCloud.prototype.pause = function () {
	    this.audio.pause();
	    this.playing = false;
	};

	SoundCloud.prototype.stop = function () {
	    this.audio.pause();
	    this.audio.currentTime = 0;
	    this.playing = false;
	};

	SoundCloud.prototype.next = function () {
	    var tracksLength = this._playlist.tracks.length;
	    if (this._playlistIndex >= tracksLength-1) {
	        return;
	    }
	    if (this._playlist && tracksLength) {
	        this.play({playlistIndex: ++this._playlistIndex});
	    }
	};

	SoundCloud.prototype.previous = function () {
	    if (this._playlistIndex <= 0) {
	        return;
	    }
	    if (this._playlist && this._playlist.tracks.length) {
	        this.play({playlistIndex: --this._playlistIndex});
	    }
	};

	SoundCloud.prototype.seek = function (e) {
	    if (!this.audio.readyState) {
	        return false;
	    }
	    var percent = e.offsetX / e.target.offsetWidth || (e.layerX - e.target.offsetLeft) / e.target.offsetWidth;
	    this.audio.currentTime = percent * (this.audio.duration || 0);
	};

	module.exports = SoundCloud;


/***/ },
/* 40 */
/***/ function(module, exports, __webpack_require__) {

	/** @jsx deku.dom */
	'use strict';

	Object.defineProperty(exports, '__esModule', {
	    value: true
	});

	function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { 'default': obj }; }

	var _deku = __webpack_require__(7);

	var _deku2 = _interopRequireDefault(_deku);

	var _soundcloudAudio = __webpack_require__(39);

	var _soundcloudAudio2 = _interopRequireDefault(_soundcloudAudio);

	var _Icons = __webpack_require__(41);

	exports['default'] = {
	    defaultProps: {
	        playing: false,
	        seeking: false
	    },

	    propTypes: {
	        playing: {
	            type: 'boolean',
	            optional: true
	        },
	        seeking: {
	            type: 'boolean',
	            optional: true
	        },
	        soundCloudAudio: function soundCloudAudio(prop) {
	            return prop instanceof _soundcloudAudio2['default'];
	        }
	    },

	    render: function render(component) {
	        var props = component.props;

	        function handleClick(e) {
	            e.preventDefault();

	            var playing = props.playing;
	            var soundCloudAudio = props.soundCloudAudio;

	            if (!playing) {
	                soundCloudAudio && soundCloudAudio.play();
	            } else {
	                soundCloudAudio && soundCloudAudio.pause();
	            }
	        }

	        return _deku2['default'].dom(
	            'button',
	            { 'class': 'sb-soundplayer-widget-play', onClick: handleClick },
	            !props.playing ? _deku2['default'].dom(_Icons.PlayIconSVG, { onClick: handleClick }) : _deku2['default'].dom(_Icons.PauseIconSVG, { onClick: handleClick })
	        );
	    }
	};
	module.exports = exports['default'];

/***/ },
/* 41 */
/***/ function(module, exports, __webpack_require__) {

	/** @jsx deku.dom */
	'use strict';

	Object.defineProperty(exports, '__esModule', {
	    value: true
	});

	function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { 'default': obj }; }

	var _deku = __webpack_require__(7);

	var _deku2 = _interopRequireDefault(_deku);

	var iconPropTypes = {
	    onClick: {
	        type: 'function',
	        optional: true
	    }
	};

	// SoundCloud Logo
	var SoundCloudLogoSVG = {
	    propTypes: iconPropTypes,

	    shouldUpdate: function shouldUpdate() {
	        return false;
	    },

	    render: function render(component) {
	        var props = component.props;

	        return _deku2['default'].dom(
	            'svg',
	            {
	                'class': 'sb-soundplayer-widget-cover-logo',
	                xmlns: 'http://www.w3.org/2000/svg',
	                fill: 'currentColor',
	                onClick: props.onClick
	            },
	            _deku2['default'].dom('path', { d: 'M10.517 3.742c-.323 0-.49.363-.49.582 0 0-.244 3.591-.244 4.641 0 1.602.15 2.621.15 2.621 0 .222.261.401.584.401.321 0 .519-.179.519-.401 0 0 .398-1.038.398-2.639 0-1.837-.153-4.127-.284-4.592-.112-.395-.313-.613-.633-.613zm-1.996.268c-.323 0-.49.363-.49.582 0 0-.244 3.322-.244 4.372 0 1.602.119 2.621.119 2.621 0 .222.26.401.584.401.321 0 .581-.179.581-.401 0 0 .081-1.007.081-2.608 0-1.837-.206-4.386-.206-4.386 0-.218-.104-.581-.425-.581zm-2.021 1.729c-.324 0-.49.362-.49.582 0 0-.272 1.594-.272 2.644 0 1.602.179 2.559.179 2.559 0 .222.229.463.552.463.321 0 .519-.241.519-.463 0 0 .19-.944.19-2.546 0-1.837-.253-2.657-.253-2.657 0-.22-.104-.582-.425-.582zm-2.046-.358c-.323 0-.49.363-.49.582 0 0-.162 1.92-.162 2.97 0 1.602.069 2.496.069 2.496 0 .222.26.557.584.557.321 0 .581-.304.581-.526 0 0 .143-.936.143-2.538 0-1.837-.206-2.96-.206-2.96 0-.218-.198-.581-.519-.581zm-2.169 1.482c-.272 0-.232.218-.232.218v3.982s-.04.335.232.335c.351 0 .716-.832.716-2.348 0-1.245-.436-2.187-.716-2.187zm18.715-.976c-.289 0-.567.042-.832.116-.417-2.266-2.806-3.989-5.263-3.989-1.127 0-2.095.705-2.931 1.316v8.16s0 .484.5.484h8.526c1.655 0 3-1.55 3-3.155 0-1.607-1.346-2.932-3-2.932zm10.17.857c-1.077-.253-1.368-.389-1.368-.815 0-.3.242-.611.97-.611.621 0 1.106.253 1.542.699l.981-.951c-.641-.669-1.417-1.067-2.474-1.067-1.339 0-2.425.757-2.425 1.99 0 1.338.873 1.736 2.124 2.026 1.281.291 1.513.486 1.513.923 0 .514-.379.738-1.184.738-.65 0-1.26-.223-1.736-.777l-.98.873c.514.757 1.504 1.232 2.639 1.232 1.853 0 2.668-.873 2.668-2.163 0-1.477-1.193-1.845-2.27-2.097zm6.803-2.745c-1.853 0-2.949 1.435-2.949 3.502s1.096 3.501 2.949 3.501c1.852 0 2.949-1.434 2.949-3.501s-1.096-3.502-2.949-3.502zm0 5.655c-1.097 0-1.553-.941-1.553-2.153 0-1.213.456-2.153 1.553-2.153 1.096 0 1.551.94 1.551 2.153.001 1.213-.454 2.153-1.551 2.153zm8.939-1.736c0 1.086-.533 1.756-1.396 1.756-.864 0-1.388-.689-1.388-1.775v-3.897h-1.358v3.916c0 1.978 1.106 3.084 2.746 3.084 1.726 0 2.754-1.136 2.754-3.103v-3.897h-1.358v3.916zm8.142-.89l.019 1.485c-.087-.174-.31-.515-.475-.768l-2.703-3.692h-1.362v6.894h1.401v-2.988l-.02-1.484c.088.175.311.514.475.767l2.79 3.705h1.213v-6.894h-1.339v2.975zm5.895-2.923h-2.124v6.791h2.027c1.746 0 3.474-1.01 3.474-3.395 0-2.484-1.437-3.396-3.377-3.396zm-.097 5.472h-.67v-4.152h.719c1.436 0 2.028.688 2.028 2.076 0 1.242-.651 2.076-2.077 2.076zm7.909-4.229c.611 0 1 .271 1.242.737l1.26-.582c-.426-.883-1.202-1.503-2.483-1.503-1.775 0-3.016 1.435-3.016 3.502 0 2.143 1.191 3.501 2.968 3.501 1.232 0 2.047-.572 2.513-1.533l-1.145-.68c-.358.602-.718.864-1.329.864-1.019 0-1.611-.932-1.611-2.153-.001-1.261.583-2.153 1.601-2.153zm5.17-1.192h-1.359v6.791h4.083v-1.338h-2.724v-5.453zm6.396-.157c-1.854 0-2.949 1.435-2.949 3.502s1.095 3.501 2.949 3.501c1.853 0 2.95-1.434 2.95-3.501s-1.097-3.502-2.95-3.502zm0 5.655c-1.097 0-1.553-.941-1.553-2.153 0-1.213.456-2.153 1.553-2.153 1.095 0 1.55.94 1.55 2.153.001 1.213-.454 2.153-1.55 2.153zm8.557-1.736c0 1.086-.532 1.756-1.396 1.756-.864 0-1.388-.689-1.388-1.775v-3.794h-1.358v3.813c0 1.978 1.106 3.084 2.746 3.084 1.726 0 2.755-1.136 2.755-3.103v-3.794h-1.36v3.813zm5.449-3.907h-2.318v6.978h2.211c1.908 0 3.789-1.037 3.789-3.489 0-2.552-1.565-3.489-3.682-3.489zm-.108 5.623h-.729v-4.266h.783c1.565 0 2.21.706 2.21 2.133.001 1.276-.707 2.133-2.264 2.133z' })
	        );
	    }
	};

	// Player Button Icons
	var ButtonIconSVG = {
	    propTypes: iconPropTypes,

	    render: function render(component) {
	        var props = component.props;

	        return _deku2['default'].dom(
	            'svg',
	            {
	                'class': 'sb-soundplayer-widget-button-icon',
	                xmlns: 'http://www.w3.org/2000/svg',
	                viewBox: '0 0 32 32',
	                fill: 'currentColor',
	                onClick: props.onClick
	            },
	            props.children
	        );
	    }
	};

	// |> Play
	var PlayIconSVG = {
	    propTypes: iconPropTypes,

	    shouldUpdate: function shouldUpdate() {
	        return false;
	    },

	    render: function render(component) {
	        var props = component.props;

	        return _deku2['default'].dom(
	            ButtonIconSVG,
	            props,
	            _deku2['default'].dom('path', { d: 'M0 0 L32 16 L0 32 z' })
	        );
	    }
	};

	// || Pause
	var PauseIconSVG = {
	    propTypes: iconPropTypes,

	    shouldUpdate: function shouldUpdate() {
	        return false;
	    },

	    render: function render(component) {
	        var props = component.props;

	        return _deku2['default'].dom(
	            ButtonIconSVG,
	            props,
	            _deku2['default'].dom('path', { d: 'M0 0 H12 V32 H0 z M20 0 H32 V32 H20 z' })
	        );
	    }
	};

	// |>| Next
	var NextIconSVG = {
	    propTypes: {
	        onClick: {
	            type: 'function',
	            optional: true
	        }
	    },

	    shouldUpdate: function shouldUpdate() {
	        return false;
	    },

	    render: function render(component) {
	        var props = component.props;

	        return _deku2['default'].dom(
	            ButtonIconSVG,
	            props,
	            _deku2['default'].dom('path', { d: 'M4 4 L24 14 V4 H28 V28 H24 V18 L4 28 z ' })
	        );
	    }
	};

	// |<| Prev
	var PrevIconSVG = {
	    propTypes: {
	        onClick: {
	            type: 'function',
	            optional: true
	        }
	    },

	    shouldUpdate: function shouldUpdate() {
	        return false;
	    },

	    render: function render(component) {
	        var props = component.props;

	        return _deku2['default'].dom(
	            ButtonIconSVG,
	            props,
	            _deku2['default'].dom('path', { d: 'M4 4 H8 V14 L28 4 V28 L8 18 V28 H4 z ' })
	        );
	    }
	};

	exports['default'] = {
	    SoundCloudLogoSVG: SoundCloudLogoSVG,
	    PlayIconSVG: PlayIconSVG,
	    PauseIconSVG: PauseIconSVG,
	    NextIconSVG: NextIconSVG,
	    PrevIconSVG: PrevIconSVG
	};
	module.exports = exports['default'];

/***/ },
/* 42 */
/***/ function(module, exports, __webpack_require__) {

	/** @jsx deku.dom */
	'use strict';

	Object.defineProperty(exports, '__esModule', {
	    value: true
	});

	function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { 'default': obj }; }

	var _deku = __webpack_require__(7);

	var _deku2 = _interopRequireDefault(_deku);

	var _soundcloudAudio = __webpack_require__(39);

	var _soundcloudAudio2 = _interopRequireDefault(_soundcloudAudio);

	exports['default'] = {
	    defaultProps: {
	        value: 0
	    },

	    propTypes: {
	        value: {
	            type: 'number'
	        },

	        soundCloudAudio: function soundCloudAudio(prop) {
	            return prop instanceof _soundcloudAudio2['default'];
	        }
	    },

	    render: function render(component) {
	        var props = component.props;
	        var value = props.value;
	        var soundCloudAudio = props.soundCloudAudio;

	        if (value < 0) {
	            value = 0;
	        }

	        if (value > 100) {
	            value = 100;
	        }

	        var style = { width: '' + value + '%' };

	        function handleSeekTrack(e) {
	            var xPos = (e.pageX - e.delegateTarget.getBoundingClientRect().left) / e.delegateTarget.offsetWidth;

	            if (soundCloudAudio && !isNaN(soundCloudAudio.audio.duration)) {
	                soundCloudAudio.audio.currentTime = xPos * soundCloudAudio.audio.duration;
	            }
	        }

	        return _deku2['default'].dom(
	            'div',
	            { 'class': 'sb-soundplayer-widget-progress-container', onClick: handleSeekTrack },
	            _deku2['default'].dom('div', { 'class': 'sb-soundplayer-widget-progress-inner', style: style })
	        );
	    }
	};
	module.exports = exports['default'];

/***/ },
/* 43 */
/***/ function(module, exports, __webpack_require__) {

	/** @jsx deku.dom */
	'use strict';

	Object.defineProperty(exports, '__esModule', {
	    value: true
	});

	function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { 'default': obj }; }

	var _deku = __webpack_require__(7);

	var _deku2 = _interopRequireDefault(_deku);

	function prettyTime(time) {
	    var hours = Math.floor(time / 3600);
	    var mins = '0' + Math.floor(time % 3600 / 60);
	    var secs = '0' + Math.floor(time % 60);

	    mins = mins.substr(mins.length - 2);
	    secs = secs.substr(secs.length - 2);

	    if (!isNaN(secs)) {
	        if (hours) {
	            return '' + hours + ':' + mins + ':' + secs;
	        } else {
	            return '' + mins + ':' + secs;
	        }
	    } else {
	        return '00:00';
	    }
	}

	exports['default'] = {
	    defaultProps: {
	        duration: 0,
	        currentTime: 0
	    },

	    propTypes: {
	        duration: {
	            type: 'number'
	        },
	        currentTime: {
	            type: 'number'
	        }
	    },

	    render: function render(component) {
	        var props = component.props;

	        return _deku2['default'].dom(
	            'div',
	            { 'class': 'sb-soundplayer-widget-timer' },
	            prettyTime(props.currentTime),
	            ' / ',
	            prettyTime(props.duration)
	        );
	    }
	};
	module.exports = exports['default'];

/***/ },
/* 44 */
/***/ function(module, exports, __webpack_require__) {

	// handling multiple audio on the page helpers
	"use strict";

	Object.defineProperty(exports, "__esModule", {
	    value: true
	});
	exports.stopAllOther = stopAllOther;
	exports.addToStore = addToStore;
	var _audios = [];

	function stopAllOther(playing) {
	    _audios.forEach(function (soundCloudAudio) {
	        if (soundCloudAudio.playing && soundCloudAudio.playing !== playing) {
	            soundCloudAudio.stop();
	        }
	    });
	}

	function addToStore(soundCloudAudio) {
	    var isPresent = false;

	    for (var i = 0, len = _audios.length; i < len; i++) {
	        var _soundCloudAudio = _audios[i];
	        if (_soundCloudAudio.playing === soundCloudAudio.playing) {
	            isPresent = true;
	            break;
	        }
	    }

	    if (!isPresent) {
	        _audios.push(soundCloudAudio);
	    }
	}

/***/ }
/******/ ]);