(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
/**
 * Module dependencies.
 */

var Emitter = require('component-emitter')

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
  if (this.sources[name] === data) return
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

},{"component-emitter":9}],2:[function(require,module,exports){
/**
 * Create the application.
 */

exports.tree =
exports.scene =
exports.deku = require('./application')

/**
 * Render scenes to the DOM.
 */

if (typeof document !== 'undefined') {
  exports.render = require('./render')
}

/**
 * Render scenes to a string
 */

exports.renderString = require('./stringify')

/**
 * Create virtual elements.
 */

exports.element =
exports.dom = require('./virtual')

},{"./application":1,"./render":3,"./stringify":4,"./virtual":7}],3:[function(require,module,exports){
/**
 * Dependencies.
 */

var raf = require('component-raf')
var Pool = require('dom-pool')
var walk = require('dom-walk')
var isDom = require('is-dom')
var uid = require('get-uid')
var throttle = require('per-frame')
var keypath = require('object-path')
var type = require('component-type')
var fast = require('fast.js')
var utils = require('./utils')
var svg = require('./svg')
var defaults = utils.defaults
var forEach = fast.forEach
var assign = fast.assign
var reduce = fast.reduce

/**
 * All of the events can bind to
 */

var events = {
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
  onKeyUp: 'keyup',
  onMouseDown: 'mousedown',
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
  onTouchStart: 'touchstart'
}

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
  var entities = {}
  var pools = {}
  var handlers = {}
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
    connections[name](data)
  }

  /**
   * Render and mount a component to the native dom.
   *
   * @param {Entity} entity
   * @return {HTMLElement}
   */

  function mountEntity (entity) {
    register(entity)
    setDefaults(entity)
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

    // callback after mounting.
    trigger('afterRender', entity, [entity.context, nativeElement])
    trigger('afterMount', entity, [entity.context, nativeElement, setState(entity)])

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
      updateEntityState(entity, nextState)
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
      container.appendChild(currentNativeElement)
    } else if (currentElement !== app.element) {
      currentNativeElement = patch(rootId, currentElement, app.element, currentNativeElement)
      currentElement = app.element
      updateChildren(rootId)
    } else {
      updateChildren(rootId)
    }

    // Allow rendering again.
    isRendering = false
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

    // apply new virtual tree to native dom.
    entity.nativeElement = patch(entityId, currentTree, nextTree, entity.nativeElement)
    entity.virtualElement = nextTree
    updateChildren(entityId)

    // trigger render hook
    trigger('afterRender', entity, [entity.context, entity.nativeElement])

    // trigger afterUpdate after all children have updated.
    trigger('afterUpdate', entity, [entity.context, previousProps, previousState, setState(entity)])
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
    var child = new Entity(vnode.component, vnode.props)
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
   * Create a diff between two tress of nodes.
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

    // update all `entity.nativeElement` references.
    forEach(entities, function (entity) {
      if (entity.nativeElement === el) {
        entity.nativeElement = newEl
      }
    })

    return newEl
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
      case 'value':
        el.value = value
        break
      case 'innerHTML':
        el.innerHTML = value
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
    el.removeAttribute(name)
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
    entity.component[name].apply(null, args)
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
    entity.context.state = entity.pendingState
    entity.context.props = entity.pendingProps
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
    var component = entity.component
    // all entities for this component type.
    var entities = component.entities = component.entities || {}
    // add entity to component list
    entities[entity.id] = entity

    // get 'class-level' sources.
    var sources = component.sources
    if (sources) return

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
      connections[source] = update

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

  function setDefaults (entity) {
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
    var entityId = target.__entity__
    var eventType = event.type

    // Walk up the DOM tree and see if there is a handler
    // for this event type higher up.
    while (target && target.__entity__ === entityId) {
      var fn = keypath.get(handlers, [entityId, target.__path__, eventType])
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
    keypath.set(handlers, [entityId, path, eventType], throttle(function (e) {
      var entity = entities[entityId]
      if (entity) {
        fn.call(null, e, entity.context, setState(entity))
      } else {
        fn.call(null, e)
      }
    }))
  }

  /**
   * Unbind events for a entityId
   *
   * @param {String} entityId
   */

  function removeEvent (entityId, path, eventType) {
    keypath.del(handlers, [entityId, path, eventType])
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
   * type: string | array | object | boolean | number | date | function
   * expects: [] An array of values this prop could equal
   * optional: Boolean
   */

  function validateProps (props, rules) {
    if (!options.validateProps) return

    // TODO: Only validate in dev mode
    forEach(rules, function (options, name) {
      if (name === 'children') return
      var value = props[name]
      var optional = (options.optional === true)
      if (optional && value == null) {
        return
      }
      if (!optional && value == null) {
        throw new Error('Missing prop named: ' + name)
      }
      if (options.type && type(value) !== options.type) {
        throw new Error('Invalid type for prop named: ' + name)
      }
      if (options.expects && options.expects.indexOf(value) < 0) {
        throw new Error('Invalid value for prop named: ' + name + '. Must be one of ' + options.expects.toString())
      }
    })

    // Now check for props that haven't been defined
    forEach(props, function (value, key) {
      if (key === 'children') return
      if (!rules[key]) throw new Error('Unexpected prop named: ' + key)
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

function Entity (component, props) {
  this.id = uid()
  this.component = component
  this.propTypes = component.propTypes || {}
  this.context = {}
  this.context.id = this.id;
  this.context.props = defaults(props || {}, component.defaultProps || {})
  this.context.state = this.component.initialState ? this.component.initialState() : {}
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
},{"./svg":5,"./utils":6,"component-raf":10,"component-type":11,"dom-pool":12,"dom-walk":13,"fast.js":41,"get-uid":57,"is-dom":58,"object-path":59,"per-frame":60}],4:[function(require,module,exports){
var utils = require('./utils')
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
    var state = component.initialState ? component.initialState() : {}
    var props = defaults(optProps, component.defaultProps || {})

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

},{"./utils":6}],5:[function(require,module,exports){
var fast = require('fast.js')
var indexOf = fast.indexOf

/**
 * This file lists the supported SVG elements used by the
 * renderer. We may add better SVG support in the future
 * that doesn't require whitelisting elements.
 */

exports.namespace  = 'http://www.w3.org/2000/svg'

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


},{"fast.js":41}],6:[function(require,module,exports){
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

},{}],7:[function(require,module,exports){
/**
 * Module dependencies.
 */

var type = require('component-type')
var slice = require('sliced')
var flatten = require('array-flatten')

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
    throw new Error('Element needs a type. https://gist.github.com/anthonyshort/77ced43b5defe39908af')
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

},{"array-flatten":8,"component-type":11,"sliced":61}],8:[function(require,module,exports){
/**
 * Recursive flatten function. Fastest implementation for array flattening.
 *
 * @param  {Array}  array
 * @param  {Array}  result
 * @param  {Number} depth
 * @return {Array}
 */
function flatten (array, result, depth) {
  for (var i = 0; i < array.length; i++) {
    if (depth > 0 && Array.isArray(array[i])) {
      flatten(array[i], result, depth - 1);
    } else {
      result.push(array[i]);
    }
  }

  return result;
}

/**
 * Flatten an array, with the ability to define a depth.
 *
 * @param  {Array}  array
 * @param  {Number} depth
 * @return {Array}
 */
module.exports = function (array, depth) {
  return flatten(array, [], depth || Infinity);
};

},{}],9:[function(require,module,exports){

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

},{}],10:[function(require,module,exports){
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

},{}],11:[function(require,module,exports){
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

},{}],12:[function(require,module,exports){
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

},{}],13:[function(require,module,exports){
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

},{}],14:[function(require,module,exports){
'use strict';

/**
 * # Clone Array
 *
 * Clone an array or array like object (e.g. `arguments`).
 * This is the equivalent of calling `Array.prototype.slice.call(arguments)`, but
 * significantly faster.
 *
 * @param  {Array} input The array or array-like object to clone.
 * @return {Array}       The cloned array.
 */
module.exports = function fastCloneArray (input) {
  var length = input.length,
      sliced = new Array(length),
      i;
  for (i = 0; i < length; i++) {
    sliced[i] = input[i];
  }
  return sliced;
};

},{}],15:[function(require,module,exports){
'use strict';

/**
 * # Concat
 *
 * Concatenate multiple arrays.
 *
 * > Note: This function is effectively identical to `Array.prototype.concat()`.
 *
 *
 * @param  {Array|mixed} item, ... The item(s) to concatenate.
 * @return {Array}                 The array containing the concatenated items.
 */
module.exports = function fastConcat () {
  var length = arguments.length,
      arr = [],
      i, item, childLength, j;

  for (i = 0; i < length; i++) {
    item = arguments[i];
    if (Array.isArray(item)) {
      childLength = item.length;
      for (j = 0; j < childLength; j++) {
        arr.push(item[j]);
      }
    }
    else {
      arr.push(item);
    }
  }
  return arr;
};

},{}],16:[function(require,module,exports){
'use strict';

var bindInternal3 = require('../function/bindInternal3');

/**
 * # Every
 *
 * A fast `.every()` implementation.
 *
 * @param  {Array}    subject     The array (or array-like) to iterate over.
 * @param  {Function} fn          The visitor function.
 * @param  {Object}   thisContext The context for the visitor.
 * @return {Boolean}              true if all items in the array passes the truth test.
 */
module.exports = function fastEvery (subject, fn, thisContext) {
  var length = subject.length,
      iterator = thisContext !== undefined ? bindInternal3(fn, thisContext) : fn,
      i;
  for (i = 0; i < length; i++) {
    if (!iterator(subject[i], i, subject)) {
      return false;
    }
  }
  return true;
};

},{"../function/bindInternal3":35}],17:[function(require,module,exports){
'use strict';

/**
 * # Fill
 * Fill an array with values, optionally starting and stopping at a given index.
 *
 * > Note: unlike the specced Array.prototype.fill(), this version does not support
 * > negative start / end arguments.
 *
 * @param  {Array}   subject The array to fill.
 * @param  {mixed}   value   The value to insert.
 * @param  {Integer} start   The start position, defaults to 0.
 * @param  {Integer} end     The end position, defaults to subject.length
 * @return {Array}           The now filled subject.
 */
module.exports = function fastFill (subject, value, start, end) {
  var length = subject.length,
      i;
  if (start === undefined) {
    start = 0;
  }
  if (end === undefined) {
    end = length;
  }
  for (i = start; i < end; i++) {
    subject[i] = value;
  }
  return subject;
};
},{}],18:[function(require,module,exports){
'use strict';

var bindInternal3 = require('../function/bindInternal3');

/**
 * # Filter
 *
 * A fast `.filter()` implementation.
 *
 * @param  {Array}    subject     The array (or array-like) to filter.
 * @param  {Function} fn          The filter function.
 * @param  {Object}   thisContext The context for the filter.
 * @return {Array}                The array containing the results.
 */
module.exports = function fastFilter (subject, fn, thisContext) {
  var length = subject.length,
      result = [],
      iterator = thisContext !== undefined ? bindInternal3(fn, thisContext) : fn,
      i;
  for (i = 0; i < length; i++) {
    if (iterator(subject[i], i, subject)) {
      result.push(subject[i]);
    }
  }
  return result;
};

},{"../function/bindInternal3":35}],19:[function(require,module,exports){
'use strict';

var bindInternal3 = require('../function/bindInternal3');

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

},{"../function/bindInternal3":35}],20:[function(require,module,exports){
'use strict';

exports.clone = require('./clone');
exports.concat = require('./concat');
exports.every = require('./every');
exports.filter = require('./filter');
exports.forEach = require('./forEach');
exports.indexOf = require('./indexOf');
exports.lastIndexOf = require('./lastIndexOf');
exports.map = require('./map');
exports.pluck = require('./pluck');
exports.reduce = require('./reduce');
exports.reduceRight = require('./reduceRight');
exports.some = require('./some');
exports.fill = require('./fill');
},{"./clone":14,"./concat":15,"./every":16,"./fill":17,"./filter":18,"./forEach":19,"./indexOf":21,"./lastIndexOf":22,"./map":23,"./pluck":24,"./reduce":25,"./reduceRight":26,"./some":27}],21:[function(require,module,exports){
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

},{}],22:[function(require,module,exports){
'use strict';

/**
 * # Last Index Of
 *
 * A faster `Array.prototype.lastIndexOf()` implementation.
 *
 * @param  {Array}  subject The array (or array-like) to search within.
 * @param  {mixed}  target  The target item to search for.
 * @param  {Number} fromIndex The position to start searching backwards from, if known.
 * @return {Number}         The last position of the target in the subject, or -1 if it does not exist.
 */
module.exports = function fastLastIndexOf (subject, target, fromIndex) {
  var length = subject.length,
      i = length - 1;

  if (typeof fromIndex === 'number') {
    i = fromIndex;
    if (i < 0) {
      i += length;
    }
  }
  for (; i >= 0; i--) {
    if (subject[i] === target) {
      return i;
    }
  }
  return -1;
};

},{}],23:[function(require,module,exports){
'use strict';

var bindInternal3 = require('../function/bindInternal3');

/**
 * # Map
 *
 * A fast `.map()` implementation.
 *
 * @param  {Array}    subject     The array (or array-like) to map over.
 * @param  {Function} fn          The mapper function.
 * @param  {Object}   thisContext The context for the mapper.
 * @return {Array}                The array containing the results.
 */
module.exports = function fastMap (subject, fn, thisContext) {
  var length = subject.length,
      result = new Array(length),
      iterator = thisContext !== undefined ? bindInternal3(fn, thisContext) : fn,
      i;
  for (i = 0; i < length; i++) {
    result[i] = iterator(subject[i], i, subject);
  }
  return result;
};

},{"../function/bindInternal3":35}],24:[function(require,module,exports){
'use strict';

/**
 * # Pluck
 * Pluck the property with the given name from an array of objects.
 *
 * @param  {Array}  input The values to pluck from.
 * @param  {String} field The name of the field to pluck.
 * @return {Array}        The plucked array of values.
 */
module.exports = function fastPluck (input, field) {
  var length = input.length,
      plucked = [],
      count = 0,
      value, i;

  for (i = 0; i < length; i++) {
    value = input[i];
    if (value != null && value[field] !== undefined) {
      plucked[count++] = value[field];
    }
  }
  return plucked;
};
},{}],25:[function(require,module,exports){
'use strict';

var bindInternal4 = require('../function/bindInternal4');

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

},{"../function/bindInternal4":36}],26:[function(require,module,exports){
'use strict';

var bindInternal4 = require('../function/bindInternal4');

/**
 * # Reduce Right
 *
 * A fast `.reduceRight()` implementation.
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
    i = length - 2;
    result = subject[length - 1];
  }
  else {
    i = length - 1;
    result = initialValue;
  }

  for (; i >= 0; i--) {
    result = iterator(result, subject[i], i, subject);
  }

  return result;
};

},{"../function/bindInternal4":36}],27:[function(require,module,exports){
'use strict';

var bindInternal3 = require('../function/bindInternal3');

/**
 * # Some
 *
 * A fast `.some()` implementation.
 *
 * @param  {Array}    subject     The array (or array-like) to iterate over.
 * @param  {Function} fn          The visitor function.
 * @param  {Object}   thisContext The context for the visitor.
 * @return {Boolean}              true if at least one item in the array passes the truth test.
 */
module.exports = function fastSome (subject, fn, thisContext) {
  var length = subject.length,
      iterator = thisContext !== undefined ? bindInternal3(fn, thisContext) : fn,
      i;
  for (i = 0; i < length; i++) {
    if (iterator(subject[i], i, subject)) {
      return true;
    }
  }
  return false;
};

},{"../function/bindInternal3":35}],28:[function(require,module,exports){
'use strict';

var cloneArray = require('./array/clone');
var cloneObject = require('./object/clone');

/**
 * # Clone
 *
 * Clone an item. Primitive values will be returned directly,
 * arrays and objects will be shallow cloned. If you know the
 * type of input you're dealing with, call `.cloneArray()` or `.cloneObject()`
 * instead.
 *
 * @param  {mixed} input The input to clone.
 * @return {mixed}       The cloned input.
 */
module.exports = function clone (input) {
  if (!input || typeof input !== 'object') {
    return input;
  }
  else if (Array.isArray(input)) {
    return cloneArray(input);
  }
  else {
    return cloneObject(input);
  }
};

},{"./array/clone":14,"./object/clone":44}],29:[function(require,module,exports){
'use strict';

var filterArray = require('./array/filter'),
    filterObject = require('./object/filter');

/**
 * # Filter
 *
 * A fast `.filter()` implementation.
 *
 * @param  {Array|Object} subject     The array or object to filter.
 * @param  {Function}     fn          The filter function.
 * @param  {Object}       thisContext The context for the filter.
 * @return {Array|Object}             The array or object containing the filtered results.
 */
module.exports = function fastFilter (subject, fn, thisContext) {
  if (subject instanceof Array) {
    return filterArray(subject, fn, thisContext);
  }
  else {
    return filterObject(subject, fn, thisContext);
  }
};
},{"./array/filter":18,"./object/filter":45}],30:[function(require,module,exports){
'use strict';

var forEachArray = require('./array/forEach'),
    forEachObject = require('./object/forEach');

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
},{"./array/forEach":19,"./object/forEach":46}],31:[function(require,module,exports){
'use strict';

var applyWithContext = require('./applyWithContext');
var applyNoContext = require('./applyNoContext');

/**
 * # Apply
 *
 * Faster version of `Function::apply()`, optimised for 8 arguments or fewer.
 *
 *
 * @param  {Function} subject   The function to apply.
 * @param  {Object} thisContext The context for the function, set to undefined or null if no context is required.
 * @param  {Array} args         The arguments for the function.
 * @return {mixed}              The result of the function invocation.
 */
module.exports = function fastApply (subject, thisContext, args) {
  return thisContext !== undefined ? applyWithContext(subject, thisContext, args) : applyNoContext(subject, args);
};

},{"./applyNoContext":32,"./applyWithContext":33}],32:[function(require,module,exports){
'use strict';

/**
 * Internal helper for applying a function without a context.
 */
module.exports = function applyNoContext (subject, args) {
  switch (args.length) {
    case 0:
      return subject();
    case 1:
      return subject(args[0]);
    case 2:
      return subject(args[0], args[1]);
    case 3:
      return subject(args[0], args[1], args[2]);
    case 4:
      return subject(args[0], args[1], args[2], args[3]);
    case 5:
      return subject(args[0], args[1], args[2], args[3], args[4]);
    case 6:
      return subject(args[0], args[1], args[2], args[3], args[4], args[5]);
    case 7:
      return subject(args[0], args[1], args[2], args[3], args[4], args[5], args[6]);
    case 8:
      return subject(args[0], args[1], args[2], args[3], args[4], args[5], args[6], args[7]);
    default:
      return subject.apply(undefined, args);
  }
};

},{}],33:[function(require,module,exports){
'use strict';

/**
 * Internal helper for applying a function with a context.
 */
module.exports = function applyWithContext (subject, thisContext, args) {
  switch (args.length) {
    case 0:
      return subject.call(thisContext);
    case 1:
      return subject.call(thisContext, args[0]);
    case 2:
      return subject.call(thisContext, args[0], args[1]);
    case 3:
      return subject.call(thisContext, args[0], args[1], args[2]);
    case 4:
      return subject.call(thisContext, args[0], args[1], args[2], args[3]);
    case 5:
      return subject.call(thisContext, args[0], args[1], args[2], args[3], args[4]);
    case 6:
      return subject.call(thisContext, args[0], args[1], args[2], args[3], args[4], args[5]);
    case 7:
      return subject.call(thisContext, args[0], args[1], args[2], args[3], args[4], args[5], args[6]);
    case 8:
      return subject.call(thisContext, args[0], args[1], args[2], args[3], args[4], args[5], args[6], args[7]);
    default:
      return subject.apply(thisContext, args);
  }
};

},{}],34:[function(require,module,exports){
'use strict';

var applyWithContext = require('./applyWithContext');
var applyNoContext = require('./applyNoContext');

/**
 * # Bind
 * Analogue of `Function::bind()`.
 *
 * ```js
 * var bind = require('fast.js').bind;
 * var bound = bind(myfunc, this, 1, 2, 3);
 *
 * bound(4);
 * ```
 *
 *
 * @param  {Function} fn          The function which should be bound.
 * @param  {Object}   thisContext The context to bind the function to.
 * @param  {mixed}    args, ...   Additional arguments to pre-bind.
 * @return {Function}             The bound function.
 */
module.exports = function fastBind (fn, thisContext) {
  var boundLength = arguments.length - 2,
      boundArgs;

  if (boundLength > 0) {
    boundArgs = new Array(boundLength);
    for (var i = 0; i < boundLength; i++) {
      boundArgs[i] = arguments[i + 2];
    }
    if (thisContext !== undefined) {
      return function () {
        var length = arguments.length,
            args = new Array(boundLength + length),
            i;
        for (i = 0; i < boundLength; i++) {
          args[i] = boundArgs[i];
        }
        for (i = 0; i < length; i++) {
          args[boundLength + i] = arguments[i];
        }
        return applyWithContext(fn, thisContext, args);
      };
    }
    else {
      return function () {
        var length = arguments.length,
            args = new Array(boundLength + length),
            i;
        for (i = 0; i < boundLength; i++) {
          args[i] = boundArgs[i];
        }
        for (i = 0; i < length; i++) {
          args[boundLength + i] = arguments[i];
        }
        return applyNoContext(fn, args);
      };
    }
  }
  if (thisContext !== undefined) {
    return function () {
      return applyWithContext(fn, thisContext, arguments);
    };
  }
  else {
    return function () {
      return applyNoContext(fn, arguments);
    };
  }
};

},{"./applyNoContext":32,"./applyWithContext":33}],35:[function(require,module,exports){
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

},{}],36:[function(require,module,exports){
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

},{}],37:[function(require,module,exports){
'use strict';

exports.apply = require('./apply');
exports.bind = require('./bind');
exports.partial = require('./partial');
exports.partialConstructor = require('./partialConstructor');
exports.try = require('./try');

},{"./apply":31,"./bind":34,"./partial":38,"./partialConstructor":39,"./try":40}],38:[function(require,module,exports){
'use strict';

var applyWithContext = require('./applyWithContext');

/**
 * # Partial Application
 *
 * Partially apply a function. This is similar to `.bind()`,
 * but with one important difference - the returned function is not bound
 * to a particular context. This makes it easy to add partially
 * applied methods to objects. If you need to bind to a context,
 * use `.bind()` instead.
 *
 * > Note: This function does not support partial application for
 * constructors, for that see `partialConstructor()`
 *
 *
 * @param  {Function} fn          The function to partially apply.
 * @param  {mixed}    args, ...   Arguments to pre-bind.
 * @return {Function}             The partially applied function.
 */
module.exports = function fastPartial (fn) {
  var boundLength = arguments.length - 1,
      boundArgs;

  boundArgs = new Array(boundLength);
  for (var i = 0; i < boundLength; i++) {
    boundArgs[i] = arguments[i + 1];
  }
  return function () {
    var length = arguments.length,
        args = new Array(boundLength + length),
        i;
    for (i = 0; i < boundLength; i++) {
      args[i] = boundArgs[i];
    }
    for (i = 0; i < length; i++) {
      args[boundLength + i] = arguments[i];
    }
    return applyWithContext(fn, this, args);
  };
};

},{"./applyWithContext":33}],39:[function(require,module,exports){
'use strict';

var applyWithContext = require('./applyWithContext');

/**
 * # Partial Constructor
 *
 * Partially apply a constructor function. The returned function
 * will work with or without the `new` keyword.
 *
 *
 * @param  {Function} fn          The constructor function to partially apply.
 * @param  {mixed}    args, ...   Arguments to pre-bind.
 * @return {Function}             The partially applied constructor.
 */
module.exports = function fastPartialConstructor (fn) {
  var boundLength = arguments.length - 1,
      boundArgs;

  boundArgs = new Array(boundLength);
  for (var i = 0; i < boundLength; i++) {
    boundArgs[i] = arguments[i + 1];
  }
  return function partialed () {
    var length = arguments.length,
        args = new Array(boundLength + length),
        i;
    for (i = 0; i < boundLength; i++) {
      args[i] = boundArgs[i];
    }
    for (i = 0; i < length; i++) {
      args[boundLength + i] = arguments[i];
    }

    var thisContext = Object.create(fn.prototype),
        result = applyWithContext(fn, thisContext, args);

    if (result != null && (typeof result === 'object' || typeof result === 'function')) {
      return result;
    }
    else {
      return thisContext;
    }
  };
};

},{"./applyWithContext":33}],40:[function(require,module,exports){
'use strict';

/**
 * # Try
 *
 * Allows functions to be optimised by isolating `try {} catch (e) {}` blocks
 * outside the function declaration. Returns either the result of the function or an Error
 * object if one was thrown. The caller should then check for `result instanceof Error`.
 *
 * ```js
 * var result = fast.try(myFunction);
 * if (result instanceof Error) {
 *    console.log('something went wrong');
 * }
 * else {
 *   console.log('result:', result);
 * }
 * ```
 *
 * @param  {Function} fn The function to invoke.
 * @return {mixed}       The result of the function, or an `Error` object.
 */
module.exports = function fastTry (fn) {
  try {
    return fn();
  }
  catch (e) {
    if (!(e instanceof Error)) {
      return new Error(e);
    }
    else {
      return e;
    }
  }
};

},{}],41:[function(require,module,exports){
'use strict';

/**
 * # Constructor
 *
 * Provided as a convenient wrapper around Fast functions.
 *
 * ```js
 * var arr = fast([1,2,3,4,5,6]);
 *
 * var result = arr.filter(function (item) {
 *   return item % 2 === 0;
 * });
 *
 * result instanceof Fast; // true
 * result.length; // 3
 * ```
 *
 *
 * @param {Array} value The value to wrap.
 */
function Fast (value) {
  if (!(this instanceof Fast)) {
    return new Fast(value);
  }
  this.value = value || [];
}

module.exports = exports = Fast;

Fast.array = require('./array');
Fast['function'] = Fast.fn = require('./function');
Fast.object = require('./object');
Fast.string = require('./string');


Fast.apply = Fast['function'].apply;
Fast.bind = Fast['function'].bind;
Fast.partial = Fast['function'].partial;
Fast.partialConstructor = Fast['function'].partialConstructor;
Fast['try'] = Fast.attempt = Fast['function']['try'];

Fast.assign = Fast.object.assign;
Fast.cloneObject = Fast.object.clone; // @deprecated use fast.object.clone()
Fast.keys = Fast.object.keys;
Fast.values = Fast.object.values;


Fast.clone = require('./clone');
Fast.map = require('./map');
Fast.filter = require('./filter');
Fast.forEach = require('./forEach');
Fast.reduce = require('./reduce');
Fast.reduceRight = require('./reduceRight');


Fast.cloneArray = Fast.array.clone; // @deprecated use fast.array.clone()

Fast.concat = Fast.array.concat;
Fast.some = Fast.array.some;
Fast.every = Fast.array.every;
Fast.indexOf = Fast.array.indexOf;
Fast.lastIndexOf = Fast.array.lastIndexOf;
Fast.pluck = Fast.array.pluck;
Fast.fill = Fast.array.fill;

Fast.intern = Fast.string.intern;


/**
 * # Concat
 *
 * Concatenate multiple arrays.
 *
 * @param  {Array|mixed} item, ... The item(s) to concatenate.
 * @return {Fast}                  A new Fast object, containing the results.
 */
Fast.prototype.concat = function Fast$concat () {
  var length = this.value.length,
      arr = new Array(length),
      i, item, childLength, j;

  for (i = 0; i < length; i++) {
    arr[i] = this.value[i];
  }

  length = arguments.length;
  for (i = 0; i < length; i++) {
    item = arguments[i];
    if (Array.isArray(item)) {
      childLength = item.length;
      for (j = 0; j < childLength; j++) {
        arr.push(item[j]);
      }
    }
    else {
      arr.push(item);
    }
  }
  return new Fast(arr);
};

/**
 * Fast Map
 *
 * @param  {Function} fn          The visitor function.
 * @param  {Object}   thisContext The context for the visitor, if any.
 * @return {Fast}                 A new Fast object, containing the results.
 */
Fast.prototype.map = function Fast$map (fn, thisContext) {
  return new Fast(Fast.map(this.value, fn, thisContext));
};

/**
 * Fast Filter
 *
 * @param  {Function} fn          The filter function.
 * @param  {Object}   thisContext The context for the filter function, if any.
 * @return {Fast}                 A new Fast object, containing the results.
 */
Fast.prototype.filter = function Fast$filter (fn, thisContext) {
  return new Fast(Fast.filter(this.value, fn, thisContext));
};

/**
 * Fast Reduce
 *
 * @param  {Function} fn           The reducer function.
 * @param  {mixed}    initialValue The initial value, if any.
 * @param  {Object}   thisContext  The context for the reducer, if any.
 * @return {mixed}                 The final result.
 */
Fast.prototype.reduce = function Fast$reduce (fn, initialValue, thisContext) {
  return Fast.reduce(this.value, fn, initialValue, thisContext);
};


/**
 * Fast Reduce Right
 *
 * @param  {Function} fn           The reducer function.
 * @param  {mixed}    initialValue The initial value, if any.
 * @param  {Object}   thisContext  The context for the reducer, if any.
 * @return {mixed}                 The final result.
 */
Fast.prototype.reduceRight = function Fast$reduceRight (fn, initialValue, thisContext) {
  return Fast.reduceRight(this.value, fn, initialValue, thisContext);
};

/**
 * Fast For Each
 *
 * @param  {Function} fn          The visitor function.
 * @param  {Object}   thisContext The context for the visitor, if any.
 * @return {Fast}                 The Fast instance.
 */
Fast.prototype.forEach = function Fast$forEach (fn, thisContext) {
  Fast.forEach(this.value, fn, thisContext);
  return this;
};

/**
 * Fast Some
 *
 * @param  {Function} fn          The matcher predicate.
 * @param  {Object}   thisContext The context for the matcher, if any.
 * @return {Boolean}              True if at least one element matches.
 */
Fast.prototype.some = function Fast$some (fn, thisContext) {
  return Fast.some(this.value, fn, thisContext);
};

/**
 * Fast Every
 *
 * @param  {Function} fn          The matcher predicate.
 * @param  {Object}   thisContext The context for the matcher, if any.
 * @return {Boolean}              True if at all elements match.
 */
Fast.prototype.every = function Fast$every (fn, thisContext) {
  return Fast.some(this.value, fn, thisContext);
};

/**
 * Fast Index Of
 *
 * @param  {mixed}  target    The target to lookup.
 * @param  {Number} fromIndex The index to start searching from, if known.
 * @return {Number}           The index of the item, or -1 if no match found.
 */
Fast.prototype.indexOf = function Fast$indexOf (target, fromIndex) {
  return Fast.indexOf(this.value, target, fromIndex);
};


/**
 * Fast Last Index Of
 *
 * @param  {mixed}  target    The target to lookup.
 * @param  {Number} fromIndex The index to start searching from, if known.
 * @return {Number}           The last index of the item, or -1 if no match found.
 */
Fast.prototype.lastIndexOf = function Fast$lastIndexOf (target, fromIndex) {
  return Fast.lastIndexOf(this.value, target, fromIndex);
};

/**
 * Reverse
 *
 * @return {Fast} A new Fast instance, with the contents reversed.
 */
Fast.prototype.reverse = function Fast$reverse () {
  return new Fast(this.value.reverse());
};

/**
 * Value Of
 *
 * @return {Array} The wrapped value.
 */
Fast.prototype.valueOf = function Fast$valueOf () {
  return this.value;
};

/**
 * To JSON
 *
 * @return {Array} The wrapped value.
 */
Fast.prototype.toJSON = function Fast$toJSON () {
  return this.value;
};

/**
 * Item Length
 */
Object.defineProperty(Fast.prototype, 'length', {
  get: function () {
    return this.value.length;
  }
});

},{"./array":20,"./clone":28,"./filter":29,"./forEach":30,"./function":37,"./map":42,"./object":47,"./reduce":53,"./reduceRight":54,"./string":55}],42:[function(require,module,exports){
'use strict';

var mapArray = require('./array/map'),
    mapObject = require('./object/map');

/**
 * # Map
 *
 * A fast `.map()` implementation.
 *
 * @param  {Array|Object} subject     The array or object to map over.
 * @param  {Function}     fn          The mapper function.
 * @param  {Object}       thisContext The context for the mapper.
 * @return {Array|Object}             The array or object containing the results.
 */
module.exports = function fastMap (subject, fn, thisContext) {
  if (subject instanceof Array) {
    return mapArray(subject, fn, thisContext);
  }
  else {
    return mapObject(subject, fn, thisContext);
  }
};
},{"./array/map":23,"./object/map":49}],43:[function(require,module,exports){
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

},{}],44:[function(require,module,exports){
'use strict';

/**
 * # Clone Object
 *
 * Shallow clone a simple object.
 *
 * > Note: Prototypes and non-enumerable properties will not be copied!
 *
 * @param  {Object} input The object to clone.
 * @return {Object}       The cloned object.
 */
module.exports = function fastCloneObject (input) {
  var keys = Object.keys(input),
      total = keys.length,
      cloned = {},
      i, key;

  for (i = 0; i < total; i++) {
    key = keys[i];
    cloned[key] = input[key];
  }

  return cloned;
};

},{}],45:[function(require,module,exports){
'use strict';

var bindInternal3 = require('../function/bindInternal3');

/**
 * # Filter
 *
 * A fast object `.filter()` implementation.
 *
 * @param  {Object}   subject     The object to filter.
 * @param  {Function} fn          The filter function.
 * @param  {Object}   thisContext The context for the filter.
 * @return {Object}               The new object containing the filtered results.
 */
module.exports = function fastFilterObject (subject, fn, thisContext) {
  var keys = Object.keys(subject),
      length = keys.length,
      result = {},
      iterator = thisContext !== undefined ? bindInternal3(fn, thisContext) : fn,
      i, key;
  for (i = 0; i < length; i++) {
    key = keys[i];
    if (iterator(subject[key], key, subject)) {
      result[key] = subject[key];
    }
  }
  return result;
};

},{"../function/bindInternal3":35}],46:[function(require,module,exports){
'use strict';

var bindInternal3 = require('../function/bindInternal3');

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

},{"../function/bindInternal3":35}],47:[function(require,module,exports){
'use strict';

exports.assign = require('./assign');
exports.clone = require('./clone');
exports.filter = require('./filter');
exports.forEach = require('./forEach');
exports.map = require('./map');
exports.reduce = require('./reduce');
exports.reduceRight = require('./reduceRight');
exports.keys = require('./keys');
exports.values = require('./values');
},{"./assign":43,"./clone":44,"./filter":45,"./forEach":46,"./keys":48,"./map":49,"./reduce":50,"./reduceRight":51,"./values":52}],48:[function(require,module,exports){
'use strict';

/**
 * Object.keys() shim for ES3 environments.
 *
 * @param  {Object} obj The object to get keys for.
 * @return {Array}      The array of keys.
 */
module.exports = typeof Object.keys === "function" ? Object.keys : /* istanbul ignore next */ function fastKeys (obj) {
  var keys = [];
  for (var key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      keys.push(key);
    }
  }
  return keys;
};
},{}],49:[function(require,module,exports){
'use strict';

var bindInternal3 = require('../function/bindInternal3');

/**
 * # Map
 *
 * A fast object `.map()` implementation.
 *
 * @param  {Object}   subject     The object to map over.
 * @param  {Function} fn          The mapper function.
 * @param  {Object}   thisContext The context for the mapper.
 * @return {Object}               The new object containing the results.
 */
module.exports = function fastMapObject (subject, fn, thisContext) {
  var keys = Object.keys(subject),
      length = keys.length,
      result = {},
      iterator = thisContext !== undefined ? bindInternal3(fn, thisContext) : fn,
      i, key;
  for (i = 0; i < length; i++) {
    key = keys[i];
    result[key] = iterator(subject[key], key, subject);
  }
  return result;
};

},{"../function/bindInternal3":35}],50:[function(require,module,exports){
'use strict';

var bindInternal4 = require('../function/bindInternal4');

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

},{"../function/bindInternal4":36}],51:[function(require,module,exports){
'use strict';

var bindInternal4 = require('../function/bindInternal4');

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
module.exports = function fastReduceRightObject (subject, fn, initialValue, thisContext) {
  var keys = Object.keys(subject),
      length = keys.length,
      iterator = thisContext !== undefined ? bindInternal4(fn, thisContext) : fn,
      i, key, result;

  if (initialValue === undefined) {
    i = length - 2;
    result = subject[keys[length - 1]];
  }
  else {
    i = length - 1;
    result = initialValue;
  }

  for (; i >= 0; i--) {
    key = keys[i];
    result = iterator(result, subject[key], key, subject);
  }

  return result;
};

},{"../function/bindInternal4":36}],52:[function(require,module,exports){
'use strict';

/**
 * # Values
 * Return all the (enumerable) property values for an object.
 * Like Object.keys() but for values.
 *
 * @param  {Object} obj The object to retrieve values from.
 * @return {Array}      An array containing property values.
 */
module.exports = function fastValues (obj) {
  var keys = Object.keys(obj),
      length = keys.length,
      values = new Array(length);

  for (var i = 0; i < length; i++) {
    values[i] = obj[keys[i]];
  }
  return values;
};
},{}],53:[function(require,module,exports){
'use strict';

var reduceArray = require('./array/reduce'),
    reduceObject = require('./object/reduce');

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
},{"./array/reduce":25,"./object/reduce":50}],54:[function(require,module,exports){
'use strict';

var reduceRightArray = require('./array/reduceRight'),
    reduceRightObject = require('./object/reduceRight');

/**
 * # Reduce Right
 *
 * A fast `.reduceRight()` implementation.
 *
 * @param  {Array|Object} subject      The array or object to reduce over.
 * @param  {Function}     fn           The reducer function.
 * @param  {mixed}        initialValue The initial value for the reducer, defaults to subject[0].
 * @param  {Object}       thisContext  The context for the reducer.
 * @return {Array|Object}              The array or object containing the results.
 */
module.exports = function fastReduceRight (subject, fn, initialValue, thisContext) {
  if (subject instanceof Array) {
    return reduceRightArray(subject, fn, initialValue, thisContext);
  }
  else {
    return reduceRightObject(subject, fn, initialValue, thisContext);
  }
};
},{"./array/reduceRight":26,"./object/reduceRight":51}],55:[function(require,module,exports){
'use strict';

exports.intern = require('./intern');
},{"./intern":56}],56:[function(require,module,exports){
'use strict';

// Compilers such as V8 use string interning to make string comparison very fast and efficient,
// as efficient as comparing two references to the same object.
//
//
// V8 does its best to intern strings automatically where it can, for instance:
// ```js
//   var greeting = "hello world";
// ```
// With this, comparison will be very fast:
// ```js
//   if (greeting === "hello world") {}
// ```
// However, there are several cases where V8 cannot intern the string, and instead
// must resort to byte-wise comparison. This can be signficantly slower for long strings.
// The most common example is string concatenation:
// ```js
//   function subject () { return "world"; };
//   var greeting = "hello " + subject();
// ```
// In this case, V8 cannot intern the string. So this comparison is *much* slower:
// ```js
//  if (greeting === "hello world") {}
// ```



// At the moment, the fastest, safe way of interning a string is to
// use it as a key in an object, and then use that key.
//
// Note: This technique comes courtesy of Petka Antonov - http://jsperf.com/istrn/11
//
// We create a container object in hash mode.
// Most strings being interned will not be valid fast property names,
// so we ensure hash mode now to avoid transitioning the object mode at runtime.
var container = {'- ': true};
delete container['- '];


/**
 * Intern a string to make comparisons faster.
 *
 * > Note: This is a relatively expensive operation, you
 * shouldn't usually do the actual interning at runtime, instead
 * use this at compile time to make future work faster.
 *
 * @param  {String} string The string to intern.
 * @return {String}        The interned string.
 */
module.exports = function fastIntern (string) {
  container[string] = true;
  var interned = Object.keys(container)[0];
  delete container[interned];
  return interned;
};
},{}],57:[function(require,module,exports){
/** generate unique id for selector */
var counter = Date.now() % 1e9;

module.exports = function getUid(){
	return (Math.random() * 1e9 >>> 0) + (counter++);
};
},{}],58:[function(require,module,exports){
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

},{}],59:[function(require,module,exports){
(function (root, factory){
  'use strict';

  /*istanbul ignore next:cant test*/
  if (typeof module === 'object' && typeof module.exports === 'object') {
    module.exports = factory();
  } else if (typeof define === 'function' && define.amd) {
    // AMD. Register as an anonymous module.
    define([], factory);
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

},{}],60:[function(require,module,exports){
/**
 * Module Dependencies.
 */

var raf = require('raf');

/**
 * Export `throttle`.
 */

module.exports = throttle;

/**
 * Executes a function at most once per animation frame. Kind of like
 * throttle, but it throttles at ~60Hz.
 *
 * @param {Function} fn - the Function to throttle once per animation frame
 * @return {Function}
 * @public
 */

function throttle(fn) {
  var rtn;
  var ignoring = false;

  return function queue() {
    if (ignoring) return rtn;
    ignoring = true;

    raf(function() {
      ignoring = false;
    });

    rtn = fn.apply(this, arguments);
    return rtn;
  };
}

},{"raf":10}],61:[function(require,module,exports){
module.exports = exports = require('./lib/sliced');

},{"./lib/sliced":62}],62:[function(require,module,exports){

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


},{}],63:[function(require,module,exports){
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

},{}],64:[function(require,module,exports){
'use strict';

Object.defineProperty(exports, '__esModule', {
    value: true
});

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { 'default': obj }; }

/** @jsx deku.dom */

var _deku = require('deku');

var _deku2 = _interopRequireDefault(_deku);

var PlayButton = {
    defaultProps: {
        playing: false,
        seeking: false
    },

    propTypes: {
        playing: {
            type: 'boolean'
        },
        seeking: {
            type: 'boolean'
        }
    },

    render: function render(component) {
        var props = component.props;

        function handleClick(e) {
            e.preventDefault();

            var playing = props.playing;
            var soundCloudAudio = props.soundCloudAudio;
            var onTogglePlay = props.onTogglePlay;

            if (!playing) {
                soundCloudAudio && soundCloudAudio.play();
            } else {
                soundCloudAudio && soundCloudAudio.pause();
            }

            onTogglePlay && onTogglePlay(e);
        }

        return _deku2['default'].dom(
            'button',
            { 'class': 'sb-soundplayer-widget-play', onClick: handleClick },
            props.playing ? 'Pause' : 'Play'
        );
    }
};

exports['default'] = PlayButton;
module.exports = exports['default'];

},{"deku":2}],65:[function(require,module,exports){
'use strict';

Object.defineProperty(exports, '__esModule', {
    value: true
});

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { 'default': obj }; }

/** @jsx deku.dom */

var _deku = require('deku');

var _deku2 = _interopRequireDefault(_deku);

var Progress = {
    defaultProps: {
        value: 0
    },

    propTypes: {
        value: {
            type: 'number'
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
            var xPos = (e.pageX - e.currentTarget.getBoundingClientRect().left) / e.currentTarget.offsetWidth;

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

exports['default'] = Progress;
module.exports = exports['default'];

},{"deku":2}],66:[function(require,module,exports){
'use strict';

Object.defineProperty(exports, '__esModule', {
    value: true
});

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { 'default': obj }; }

/** @jsx deku.dom */

var _deku = require('deku');

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

var Timer = {
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

exports['default'] = Timer;
module.exports = exports['default'];

},{"deku":2}],67:[function(require,module,exports){
"use strict";

Object.defineProperty(exports, "__esModule", {
    value: true
});
exports.stopAllOther = stopAllOther;
exports.addToStore = addToStore;
// handling multiple audio on the page helpers
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

},{}],68:[function(require,module,exports){
'use strict';

Object.defineProperty(exports, '__esModule', {
    value: true
});
exports.create = create;

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { 'default': obj }; }

function _defineProperty(obj, key, value) { return Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); }

/** @jsx deku.dom */

var _deku = require('deku');

var _deku2 = _interopRequireDefault(_deku);

var _soundcloudAudio = require('soundcloud-audio');

var _soundcloudAudio2 = _interopRequireDefault(_soundcloudAudio);

var _componentsPlayButton = require('./components/PlayButton');

var _componentsPlayButton2 = _interopRequireDefault(_componentsPlayButton);

var _componentsProgress = require('./components/Progress');

var _componentsProgress2 = _interopRequireDefault(_componentsProgress);

var _componentsTimer = require('./components/Timer');

var _componentsTimer2 = _interopRequireDefault(_componentsTimer);

var _utilsAudioStore = require('./utils/audioStore');

var Widget = {
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
            setState(_defineProperty({}, data.tracks ? 'playlist' : 'track', data));
        });

        function onAudioStarted() {
            setState({ playing: true });

            _utilsAudioStore.stopAllOther(soundCloudAudio.playing);
            _utilsAudioStore.addToStore(soundCloudAudio);
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

        console.log('render');

        return _deku2['default'].dom(
            'div',
            { 'class': 'sb-soundplayer-widget-cover', style: state.track ? {
                    'background-image': 'url(' + state.track.artwork_url.replace('large', 't500x500') + ')'
                } : {
                    'background-color': '#f2f2f2'
                } },
            state.track ? _deku2['default'].dom(
                'div',
                null,
                _deku2['default'].dom('div', { 'class': 'sb-soundplayer-widget-overlay' }),
                _deku2['default'].dom(
                    'h2',
                    { 'class': 'sb-soundplayer-widget-title' },
                    state.track.title
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
                        duration: state.duration,
                        currentTime: state.currentTime
                    })
                )
            ) : _deku2['default'].dom(
                'div',
                null,
                'Loading..'
            )
        );
    }
};

function create(el, opts) {
    var soundCloudAudio = new _soundcloudAudio2['default'](opts.clientId);

    var app = _deku2['default'].scene(_deku2['default'].dom(Widget, { url: opts.url, soundCloudAudio: soundCloudAudio }));

    _deku2['default'].render(app, el);
}

},{"./components/PlayButton":64,"./components/Progress":65,"./components/Timer":66,"./utils/audioStore":67,"deku":2,"soundcloud-audio":63}],69:[function(require,module,exports){
'use strict';

function _interopRequireWildcard(obj) { if (obj && obj.__esModule) { return obj; } else { var newObj = {}; if (obj != null) { for (var key in obj) { if (Object.prototype.hasOwnProperty.call(obj, key)) newObj[key] = obj[key]; } } newObj['default'] = obj; return newObj; } }

// query all elements with class `.soundplayer-widget`
// get `data-url` and `data-layout` attrs of every element
// pass data to constructor function and render deku widget

var _widget = require('./widget');

var SPWidget = _interopRequireWildcard(_widget);

var elements = document.querySelectorAll('.sb-soundplayer-widget');

for (var i = 0, len = elements.length; i < len; i++) {
    var el = elements[i];

    var url = el.getAttribute('data-url');
    var clientId = el.getAttribute('data-clientid');

    SPWidget.create(el, { url: url, clientId: clientId });
}

},{"./widget":68}]},{},[69])
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm5vZGVfbW9kdWxlcy9icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCJub2RlX21vZHVsZXMvZGVrdS9saWIvYXBwbGljYXRpb24uanMiLCJub2RlX21vZHVsZXMvZGVrdS9saWIvaW5kZXguanMiLCJub2RlX21vZHVsZXMvZGVrdS9saWIvcmVuZGVyLmpzIiwibm9kZV9tb2R1bGVzL2Rla3UvbGliL3N0cmluZ2lmeS5qcyIsIm5vZGVfbW9kdWxlcy9kZWt1L2xpYi9zdmcuanMiLCJub2RlX21vZHVsZXMvZGVrdS9saWIvdXRpbHMuanMiLCJub2RlX21vZHVsZXMvZGVrdS9saWIvdmlydHVhbC5qcyIsIm5vZGVfbW9kdWxlcy9kZWt1L25vZGVfbW9kdWxlcy9hcnJheS1mbGF0dGVuL2FycmF5LWZsYXR0ZW4uanMiLCJub2RlX21vZHVsZXMvZGVrdS9ub2RlX21vZHVsZXMvY29tcG9uZW50LWVtaXR0ZXIvaW5kZXguanMiLCJub2RlX21vZHVsZXMvZGVrdS9ub2RlX21vZHVsZXMvY29tcG9uZW50LXJhZi9pbmRleC5qcyIsIm5vZGVfbW9kdWxlcy9kZWt1L25vZGVfbW9kdWxlcy9jb21wb25lbnQtdHlwZS9pbmRleC5qcyIsIm5vZGVfbW9kdWxlcy9kZWt1L25vZGVfbW9kdWxlcy9kb20tcG9vbC9Qb29sLmpzIiwibm9kZV9tb2R1bGVzL2Rla3Uvbm9kZV9tb2R1bGVzL2RvbS13YWxrL2luZGV4LmpzIiwibm9kZV9tb2R1bGVzL2Rla3Uvbm9kZV9tb2R1bGVzL2Zhc3QuanMvYXJyYXkvY2xvbmUuanMiLCJub2RlX21vZHVsZXMvZGVrdS9ub2RlX21vZHVsZXMvZmFzdC5qcy9hcnJheS9jb25jYXQuanMiLCJub2RlX21vZHVsZXMvZGVrdS9ub2RlX21vZHVsZXMvZmFzdC5qcy9hcnJheS9ldmVyeS5qcyIsIm5vZGVfbW9kdWxlcy9kZWt1L25vZGVfbW9kdWxlcy9mYXN0LmpzL2FycmF5L2ZpbGwuanMiLCJub2RlX21vZHVsZXMvZGVrdS9ub2RlX21vZHVsZXMvZmFzdC5qcy9hcnJheS9maWx0ZXIuanMiLCJub2RlX21vZHVsZXMvZGVrdS9ub2RlX21vZHVsZXMvZmFzdC5qcy9hcnJheS9mb3JFYWNoLmpzIiwibm9kZV9tb2R1bGVzL2Rla3Uvbm9kZV9tb2R1bGVzL2Zhc3QuanMvYXJyYXkvaW5kZXguanMiLCJub2RlX21vZHVsZXMvZGVrdS9ub2RlX21vZHVsZXMvZmFzdC5qcy9hcnJheS9pbmRleE9mLmpzIiwibm9kZV9tb2R1bGVzL2Rla3Uvbm9kZV9tb2R1bGVzL2Zhc3QuanMvYXJyYXkvbGFzdEluZGV4T2YuanMiLCJub2RlX21vZHVsZXMvZGVrdS9ub2RlX21vZHVsZXMvZmFzdC5qcy9hcnJheS9tYXAuanMiLCJub2RlX21vZHVsZXMvZGVrdS9ub2RlX21vZHVsZXMvZmFzdC5qcy9hcnJheS9wbHVjay5qcyIsIm5vZGVfbW9kdWxlcy9kZWt1L25vZGVfbW9kdWxlcy9mYXN0LmpzL2FycmF5L3JlZHVjZS5qcyIsIm5vZGVfbW9kdWxlcy9kZWt1L25vZGVfbW9kdWxlcy9mYXN0LmpzL2FycmF5L3JlZHVjZVJpZ2h0LmpzIiwibm9kZV9tb2R1bGVzL2Rla3Uvbm9kZV9tb2R1bGVzL2Zhc3QuanMvYXJyYXkvc29tZS5qcyIsIm5vZGVfbW9kdWxlcy9kZWt1L25vZGVfbW9kdWxlcy9mYXN0LmpzL2Nsb25lLmpzIiwibm9kZV9tb2R1bGVzL2Rla3Uvbm9kZV9tb2R1bGVzL2Zhc3QuanMvZmlsdGVyLmpzIiwibm9kZV9tb2R1bGVzL2Rla3Uvbm9kZV9tb2R1bGVzL2Zhc3QuanMvZm9yRWFjaC5qcyIsIm5vZGVfbW9kdWxlcy9kZWt1L25vZGVfbW9kdWxlcy9mYXN0LmpzL2Z1bmN0aW9uL2FwcGx5LmpzIiwibm9kZV9tb2R1bGVzL2Rla3Uvbm9kZV9tb2R1bGVzL2Zhc3QuanMvZnVuY3Rpb24vYXBwbHlOb0NvbnRleHQuanMiLCJub2RlX21vZHVsZXMvZGVrdS9ub2RlX21vZHVsZXMvZmFzdC5qcy9mdW5jdGlvbi9hcHBseVdpdGhDb250ZXh0LmpzIiwibm9kZV9tb2R1bGVzL2Rla3Uvbm9kZV9tb2R1bGVzL2Zhc3QuanMvZnVuY3Rpb24vYmluZC5qcyIsIm5vZGVfbW9kdWxlcy9kZWt1L25vZGVfbW9kdWxlcy9mYXN0LmpzL2Z1bmN0aW9uL2JpbmRJbnRlcm5hbDMuanMiLCJub2RlX21vZHVsZXMvZGVrdS9ub2RlX21vZHVsZXMvZmFzdC5qcy9mdW5jdGlvbi9iaW5kSW50ZXJuYWw0LmpzIiwibm9kZV9tb2R1bGVzL2Rla3Uvbm9kZV9tb2R1bGVzL2Zhc3QuanMvZnVuY3Rpb24vaW5kZXguanMiLCJub2RlX21vZHVsZXMvZGVrdS9ub2RlX21vZHVsZXMvZmFzdC5qcy9mdW5jdGlvbi9wYXJ0aWFsLmpzIiwibm9kZV9tb2R1bGVzL2Rla3Uvbm9kZV9tb2R1bGVzL2Zhc3QuanMvZnVuY3Rpb24vcGFydGlhbENvbnN0cnVjdG9yLmpzIiwibm9kZV9tb2R1bGVzL2Rla3Uvbm9kZV9tb2R1bGVzL2Zhc3QuanMvZnVuY3Rpb24vdHJ5LmpzIiwibm9kZV9tb2R1bGVzL2Rla3Uvbm9kZV9tb2R1bGVzL2Zhc3QuanMvaW5kZXguanMiLCJub2RlX21vZHVsZXMvZGVrdS9ub2RlX21vZHVsZXMvZmFzdC5qcy9tYXAuanMiLCJub2RlX21vZHVsZXMvZGVrdS9ub2RlX21vZHVsZXMvZmFzdC5qcy9vYmplY3QvYXNzaWduLmpzIiwibm9kZV9tb2R1bGVzL2Rla3Uvbm9kZV9tb2R1bGVzL2Zhc3QuanMvb2JqZWN0L2Nsb25lLmpzIiwibm9kZV9tb2R1bGVzL2Rla3Uvbm9kZV9tb2R1bGVzL2Zhc3QuanMvb2JqZWN0L2ZpbHRlci5qcyIsIm5vZGVfbW9kdWxlcy9kZWt1L25vZGVfbW9kdWxlcy9mYXN0LmpzL29iamVjdC9mb3JFYWNoLmpzIiwibm9kZV9tb2R1bGVzL2Rla3Uvbm9kZV9tb2R1bGVzL2Zhc3QuanMvb2JqZWN0L2luZGV4LmpzIiwibm9kZV9tb2R1bGVzL2Rla3Uvbm9kZV9tb2R1bGVzL2Zhc3QuanMvb2JqZWN0L2tleXMuanMiLCJub2RlX21vZHVsZXMvZGVrdS9ub2RlX21vZHVsZXMvZmFzdC5qcy9vYmplY3QvbWFwLmpzIiwibm9kZV9tb2R1bGVzL2Rla3Uvbm9kZV9tb2R1bGVzL2Zhc3QuanMvb2JqZWN0L3JlZHVjZS5qcyIsIm5vZGVfbW9kdWxlcy9kZWt1L25vZGVfbW9kdWxlcy9mYXN0LmpzL29iamVjdC9yZWR1Y2VSaWdodC5qcyIsIm5vZGVfbW9kdWxlcy9kZWt1L25vZGVfbW9kdWxlcy9mYXN0LmpzL29iamVjdC92YWx1ZXMuanMiLCJub2RlX21vZHVsZXMvZGVrdS9ub2RlX21vZHVsZXMvZmFzdC5qcy9yZWR1Y2UuanMiLCJub2RlX21vZHVsZXMvZGVrdS9ub2RlX21vZHVsZXMvZmFzdC5qcy9yZWR1Y2VSaWdodC5qcyIsIm5vZGVfbW9kdWxlcy9kZWt1L25vZGVfbW9kdWxlcy9mYXN0LmpzL3N0cmluZy9pbmRleC5qcyIsIm5vZGVfbW9kdWxlcy9kZWt1L25vZGVfbW9kdWxlcy9mYXN0LmpzL3N0cmluZy9pbnRlcm4uanMiLCJub2RlX21vZHVsZXMvZGVrdS9ub2RlX21vZHVsZXMvZ2V0LXVpZC9pbmRleC5qcyIsIm5vZGVfbW9kdWxlcy9kZWt1L25vZGVfbW9kdWxlcy9pcy1kb20vaW5kZXguanMiLCJub2RlX21vZHVsZXMvZGVrdS9ub2RlX21vZHVsZXMvb2JqZWN0LXBhdGgvaW5kZXguanMiLCJub2RlX21vZHVsZXMvZGVrdS9ub2RlX21vZHVsZXMvcGVyLWZyYW1lL2luZGV4LmpzIiwibm9kZV9tb2R1bGVzL2Rla3Uvbm9kZV9tb2R1bGVzL3NsaWNlZC9pbmRleC5qcyIsIm5vZGVfbW9kdWxlcy9kZWt1L25vZGVfbW9kdWxlcy9zbGljZWQvbGliL3NsaWNlZC5qcyIsIm5vZGVfbW9kdWxlcy9zb3VuZGNsb3VkLWF1ZGlvL2luZGV4LmpzIiwiL1VzZXJzL2RtaXRyaS9naXRodWIvc291bmRwbGF5ZXItd2lkZ2V0L3NyYy9jb21wb25lbnRzL1BsYXlCdXR0b24uanMiLCIvVXNlcnMvZG1pdHJpL2dpdGh1Yi9zb3VuZHBsYXllci13aWRnZXQvc3JjL2NvbXBvbmVudHMvUHJvZ3Jlc3MuanMiLCIvVXNlcnMvZG1pdHJpL2dpdGh1Yi9zb3VuZHBsYXllci13aWRnZXQvc3JjL2NvbXBvbmVudHMvVGltZXIuanMiLCIvVXNlcnMvZG1pdHJpL2dpdGh1Yi9zb3VuZHBsYXllci13aWRnZXQvc3JjL3V0aWxzL2F1ZGlvU3RvcmUuanMiLCIvVXNlcnMvZG1pdHJpL2dpdGh1Yi9zb3VuZHBsYXllci13aWRnZXQvc3JjL3dpZGdldC5qcyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTtBQ0FBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN0RkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUM1QkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDOXZDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN6R0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzNHQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNsQkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN2UEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDOUJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNqS0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNsQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNsQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNwREE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDeEJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3JCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDaENBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDekJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDNUJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUMxQkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDckJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNkQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNqQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzdCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN4QkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3ZCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDbkNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNuQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN6QkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDM0JBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDdEJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3JCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ25CQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDN0JBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUM3QkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3ZFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDWEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ1hBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDUEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDMUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzdDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDbkNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDalBBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDdEJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDbENBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDekJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDNUJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN2QkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNWQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2hCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDMUJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDckNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDckNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDbkJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN2QkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3ZCQTtBQUNBO0FBQ0E7O0FDRkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN2REE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ0xBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2ZBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUM3UUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNyQ0E7QUFDQTs7QUNEQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNqQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7Ozs7Ozs7Ozs7O29CQzNKaUIsTUFBTTs7OztBQUV2QixJQUFNLFVBQVUsR0FBRztBQUNmLGdCQUFZLEVBQUU7QUFDVixlQUFPLEVBQUUsS0FBSztBQUNkLGVBQU8sRUFBRSxLQUFLO0tBQ2pCOztBQUVELGFBQVMsRUFBRTtBQUNQLGVBQU8sRUFBRTtBQUNMLGdCQUFJLEVBQUUsU0FBUztTQUNsQjtBQUNELGVBQU8sRUFBRTtBQUNMLGdCQUFJLEVBQUUsU0FBUztTQUNsQjtLQUNKOztBQUVELFVBQU0sRUFBQSxnQkFBQyxTQUFTLEVBQUU7WUFDTixLQUFLLEdBQUssU0FBUyxDQUFuQixLQUFLOztBQUViLGlCQUFTLFdBQVcsQ0FBRSxDQUFDLEVBQUU7QUFDckIsYUFBQyxDQUFDLGNBQWMsRUFBRSxDQUFDOztnQkFFWCxPQUFPLEdBQW9DLEtBQUssQ0FBaEQsT0FBTztnQkFBRSxlQUFlLEdBQW1CLEtBQUssQ0FBdkMsZUFBZTtnQkFBRSxZQUFZLEdBQUssS0FBSyxDQUF0QixZQUFZOztBQUU5QyxnQkFBSSxDQUFDLE9BQU8sRUFBRTtBQUNWLCtCQUFlLElBQUksZUFBZSxDQUFDLElBQUksRUFBRSxDQUFDO2FBQzdDLE1BQU07QUFDSCwrQkFBZSxJQUFJLGVBQWUsQ0FBQyxLQUFLLEVBQUUsQ0FBQzthQUM5Qzs7QUFFRCx3QkFBWSxJQUFJLFlBQVksQ0FBQyxDQUFDLENBQUMsQ0FBQztTQUNuQzs7QUFFRCxlQUNJOztjQUFRLFNBQU0sNEJBQTRCLEVBQUMsT0FBTyxFQUFFLFdBQVcsQUFBQztZQUMzRCxLQUFLLENBQUMsT0FBTyxHQUFHLE9BQU8sR0FBRyxNQUFNO1NBQzVCLENBQ1g7S0FDTDtDQUNKLENBQUM7O3FCQUVhLFVBQVU7Ozs7Ozs7Ozs7Ozs7O29CQzFDUixNQUFNOzs7O0FBRXZCLElBQU0sUUFBUSxHQUFHO0FBQ2IsZ0JBQVksRUFBRTtBQUNWLGFBQUssRUFBRSxDQUFDO0tBQ1g7O0FBRUQsYUFBUyxFQUFFO0FBQ1AsYUFBSyxFQUFFO0FBQ0gsZ0JBQUksRUFBRSxRQUFRO1NBQ2pCO0tBQ0o7O0FBRUQsVUFBTSxFQUFBLGdCQUFDLFNBQVMsRUFBRTtZQUNSLEtBQUssR0FBSyxTQUFTLENBQW5CLEtBQUs7WUFDTCxLQUFLLEdBQXNCLEtBQUssQ0FBaEMsS0FBSztZQUFFLGVBQWUsR0FBSyxLQUFLLENBQXpCLGVBQWU7O0FBRTVCLFlBQUksS0FBSyxHQUFHLENBQUMsRUFBRTtBQUNYLGlCQUFLLEdBQUcsQ0FBQyxDQUFDO1NBQ2I7O0FBRUQsWUFBSSxLQUFLLEdBQUcsR0FBRyxFQUFFO0FBQ2IsaUJBQUssR0FBRyxHQUFHLENBQUM7U0FDZjs7QUFFRCxZQUFJLEtBQUssR0FBRyxFQUFDLEtBQUssT0FBSyxLQUFLLE1BQUcsRUFBQyxDQUFDOztBQUVqQyxpQkFBUyxlQUFlLENBQUUsQ0FBQyxFQUFFO0FBQ3pCLGdCQUFNLElBQUksR0FBRyxDQUFDLENBQUMsQ0FBQyxLQUFLLEdBQUcsQ0FBQyxDQUFDLGFBQWEsQ0FBQyxxQkFBcUIsRUFBRSxDQUFDLElBQUksQ0FBQSxHQUFJLENBQUMsQ0FBQyxhQUFhLENBQUMsV0FBVyxDQUFDOztBQUVwRyxnQkFBSSxlQUFlLElBQUksQ0FBQyxLQUFLLENBQUMsZUFBZSxDQUFDLEtBQUssQ0FBQyxRQUFRLENBQUMsRUFBRTtBQUMzRCwrQkFBZSxDQUFDLEtBQUssQ0FBQyxXQUFXLEdBQUksSUFBSSxHQUFHLGVBQWUsQ0FBQyxLQUFLLENBQUMsUUFBUSxBQUFDLENBQUM7YUFDL0U7U0FDSjs7QUFFRCxlQUNJOztjQUFLLFNBQU0sMENBQTBDLEVBQUMsT0FBTyxFQUFFLGVBQWUsQUFBQztZQUMzRSwrQkFBSyxTQUFNLHNDQUFzQyxFQUFDLEtBQUssRUFBRSxLQUFLLEFBQUMsR0FBRztTQUNoRSxDQUNSO0tBQ0w7Q0FDSixDQUFDOztxQkFFYSxRQUFROzs7Ozs7Ozs7Ozs7OztvQkMzQ04sTUFBTTs7OztBQUV2QixTQUFTLFVBQVUsQ0FBRSxJQUFJLEVBQUU7QUFDdkIsUUFBSSxLQUFLLEdBQUcsSUFBSSxDQUFDLEtBQUssQ0FBQyxJQUFJLEdBQUcsSUFBSSxDQUFDLENBQUM7QUFDcEMsUUFBSSxJQUFJLEdBQUcsR0FBRyxHQUFHLElBQUksQ0FBQyxLQUFLLENBQUMsQUFBQyxJQUFJLEdBQUcsSUFBSSxHQUFJLEVBQUUsQ0FBQyxDQUFDO0FBQ2hELFFBQUksSUFBSSxHQUFHLEdBQUcsR0FBRyxJQUFJLENBQUMsS0FBSyxDQUFFLElBQUksR0FBRyxFQUFFLENBQUUsQ0FBQzs7QUFFekMsUUFBSSxHQUFHLElBQUksQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLE1BQU0sR0FBRyxDQUFDLENBQUMsQ0FBQztBQUNwQyxRQUFJLEdBQUcsSUFBSSxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsTUFBTSxHQUFHLENBQUMsQ0FBQyxDQUFDOztBQUVwQyxRQUFJLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxFQUFFO0FBQ2QsWUFBSSxLQUFLLEVBQUU7QUFDUCx3QkFBVSxLQUFLLFNBQUksSUFBSSxTQUFJLElBQUksQ0FBRztTQUNyQyxNQUFNO0FBQ0gsd0JBQVUsSUFBSSxTQUFJLElBQUksQ0FBRztTQUM1QjtLQUNKLE1BQU07QUFDSCxlQUFPLE9BQU8sQ0FBQztLQUNsQjtDQUNKOztBQUVELElBQU0sS0FBSyxHQUFHO0FBQ1YsZ0JBQVksRUFBRTtBQUNWLGdCQUFRLEVBQUUsQ0FBQztBQUNYLG1CQUFXLEVBQUUsQ0FBQztLQUNqQjs7QUFFRCxhQUFTLEVBQUU7QUFDUCxnQkFBUSxFQUFFO0FBQ04sZ0JBQUksRUFBRSxRQUFRO1NBQ2pCO0FBQ0QsbUJBQVcsRUFBRTtBQUNULGdCQUFJLEVBQUUsUUFBUTtTQUNqQjtLQUNKOztBQUVELFVBQU0sRUFBQSxnQkFBQyxTQUFTLEVBQUU7WUFDTixLQUFLLEdBQUssU0FBUyxDQUFuQixLQUFLOztBQUViLGVBQ0k7O2NBQUssU0FBTSw2QkFBNkI7WUFDbkMsVUFBVSxDQUFDLEtBQUssQ0FBQyxXQUFXLENBQUM7O1lBQUssVUFBVSxDQUFDLEtBQUssQ0FBQyxRQUFRLENBQUM7U0FDM0QsQ0FDUjtLQUNMO0NBQ0osQ0FBQzs7cUJBRWEsS0FBSzs7Ozs7Ozs7O1FDOUNKLFlBQVksR0FBWixZQUFZO1FBUVosVUFBVSxHQUFWLFVBQVU7O0FBVjFCLElBQUksT0FBTyxHQUFHLEVBQUUsQ0FBQzs7QUFFVixTQUFTLFlBQVksQ0FBRSxPQUFPLEVBQUU7QUFDbkMsV0FBTyxDQUFDLE9BQU8sQ0FBQyxVQUFDLGVBQWUsRUFBSztBQUNqQyxZQUFJLGVBQWUsQ0FBQyxPQUFPLElBQUksZUFBZSxDQUFDLE9BQU8sS0FBSyxPQUFPLEVBQUU7QUFDaEUsMkJBQWUsQ0FBQyxJQUFJLEVBQUUsQ0FBQztTQUMxQjtLQUNKLENBQUMsQ0FBQztDQUNOOztBQUVNLFNBQVMsVUFBVSxDQUFFLGVBQWUsRUFBRTtBQUN6QyxRQUFJLFNBQVMsR0FBRyxLQUFLLENBQUM7O0FBRXRCLFNBQUssSUFBSSxDQUFDLEdBQUcsQ0FBQyxFQUFFLEdBQUcsR0FBRyxPQUFPLENBQUMsTUFBTSxFQUFFLENBQUMsR0FBRyxHQUFHLEVBQUUsQ0FBQyxFQUFFLEVBQUU7QUFDaEQsWUFBSSxnQkFBZ0IsR0FBRyxPQUFPLENBQUMsQ0FBQyxDQUFDLENBQUM7QUFDbEMsWUFBSSxnQkFBZ0IsQ0FBQyxPQUFPLEtBQUssZUFBZSxDQUFDLE9BQU8sRUFBRTtBQUN0RCxxQkFBUyxHQUFHLElBQUksQ0FBQztBQUNqQixrQkFBTTtTQUNUO0tBQ0o7O0FBRUQsUUFBSSxDQUFDLFNBQVMsRUFBRTtBQUNaLGVBQU8sQ0FBQyxJQUFJLENBQUMsZUFBZSxDQUFDLENBQUM7S0FDakM7Q0FDSjs7Ozs7Ozs7UUN1RmUsTUFBTSxHQUFOLE1BQU07Ozs7Ozs7O29CQTlHTCxNQUFNOzs7OytCQUNLLGtCQUFrQjs7OztvQ0FFdkIseUJBQXlCOzs7O2tDQUMzQix1QkFBdUI7Ozs7K0JBQzFCLG9CQUFvQjs7OzsrQkFFRyxvQkFBb0I7O0FBRTdELElBQU0sTUFBTSxHQUFHO0FBQ1gsZ0JBQVksRUFBQSx3QkFBRztBQUNYLGVBQU87QUFDSCxvQkFBUSxFQUFFLENBQUM7QUFDWCx1QkFBVyxFQUFFLENBQUM7QUFDZCxtQkFBTyxFQUFFLEtBQUs7QUFDZCxtQkFBTyxFQUFFLEtBQUs7U0FDakIsQ0FBQztLQUNMOztBQUVELGNBQVUsRUFBQSxvQkFBQyxTQUFTLEVBQUUsRUFBRSxFQUFFLFFBQVEsRUFBRTtZQUN4QixLQUFLLEdBQUssU0FBUyxDQUFuQixLQUFLO1lBQ0wsZUFBZSxHQUFLLEtBQUssQ0FBekIsZUFBZTs7QUFFdkIsdUJBQWUsQ0FBQyxPQUFPLENBQUMsS0FBSyxDQUFDLEdBQUcsRUFBRSxVQUFDLElBQUksRUFBSztBQUN6QyxvQkFBUSxxQkFDSCxJQUFJLENBQUMsTUFBTSxHQUFHLFVBQVUsR0FBRyxPQUFPLEVBQUcsSUFBSSxFQUM1QyxDQUFDO1NBQ04sQ0FBQyxDQUFDOztBQUVILGlCQUFTLGNBQWMsR0FBSTtBQUN2QixvQkFBUSxDQUFDLEVBQUMsT0FBTyxFQUFFLElBQUksRUFBQyxDQUFDLENBQUM7O0FBRTFCLDZCQXpCSCxZQUFZLENBeUJJLGVBQWUsQ0FBQyxPQUFPLENBQUMsQ0FBQztBQUN0Qyw2QkExQlcsVUFBVSxDQTBCVixlQUFlLENBQUMsQ0FBQztTQUMvQjs7QUFFRCxpQkFBUyxjQUFjLEdBQUk7QUFDdkIsb0JBQVEsQ0FBQyxFQUFDLFdBQVcsRUFBRSxlQUFlLENBQUMsS0FBSyxDQUFDLFdBQVcsRUFBQyxDQUFDLENBQUM7U0FDOUQ7O0FBRUQsaUJBQVMsV0FBVyxHQUFJO0FBQ3BCLG9CQUFRLENBQUMsRUFBQyxRQUFRLEVBQUUsZUFBZSxDQUFDLEtBQUssQ0FBQyxRQUFRLEVBQUMsQ0FBQyxDQUFDO1NBQ3hEOztBQUVELGlCQUFTLGNBQWMsR0FBSTtBQUN2QixvQkFBUSxDQUFDLEVBQUMsT0FBTyxFQUFFLElBQUksRUFBQyxDQUFDLENBQUM7U0FDN0I7O0FBRUQsaUJBQVMsYUFBYSxHQUFJO0FBQ3RCLG9CQUFRLENBQUMsRUFBQyxPQUFPLEVBQUUsS0FBSyxFQUFDLENBQUMsQ0FBQztTQUM5Qjs7QUFFRCxpQkFBUyxZQUFZLEdBQUk7QUFDckIsb0JBQVEsQ0FBQyxFQUFDLE9BQU8sRUFBRSxLQUFLLEVBQUMsQ0FBQyxDQUFDO1NBQzlCOzs7QUFHRCx1QkFBZSxDQUFDLEVBQUUsQ0FBQyxTQUFTLEVBQUUsY0FBYyxDQUFDLENBQUM7QUFDOUMsdUJBQWUsQ0FBQyxFQUFFLENBQUMsWUFBWSxFQUFFLGNBQWMsQ0FBQyxDQUFDO0FBQ2pELHVCQUFlLENBQUMsRUFBRSxDQUFDLGdCQUFnQixFQUFFLFdBQVcsQ0FBQyxDQUFDO0FBQ2xELHVCQUFlLENBQUMsRUFBRSxDQUFDLFNBQVMsRUFBRSxjQUFjLENBQUMsQ0FBQztBQUM5Qyx1QkFBZSxDQUFDLEVBQUUsQ0FBQyxRQUFRLEVBQUUsYUFBYSxDQUFDLENBQUM7QUFDNUMsdUJBQWUsQ0FBQyxFQUFFLENBQUMsT0FBTyxFQUFFLFlBQVksQ0FBQyxDQUFDO0FBQzFDLHVCQUFlLENBQUMsRUFBRSxDQUFDLE9BQU8sRUFBRSxZQUFZLENBQUMsQ0FBQztLQUM3Qzs7QUFHRCxlQUFXLEVBQUEscUJBQUMsU0FBUyxFQUFFO1lBQ1gsS0FBSyxHQUFLLFNBQVMsQ0FBbkIsS0FBSzs7QUFDYixhQUFLLENBQUMsZUFBZSxDQUFDLFNBQVMsRUFBRSxDQUFDO0tBQ3JDOztBQUVELFVBQU0sRUFBQSxnQkFBQyxTQUFTLEVBQUU7WUFDUixLQUFLLEdBQVksU0FBUyxDQUExQixLQUFLO1lBQUUsS0FBSyxHQUFLLFNBQVMsQ0FBbkIsS0FBSzs7QUFFbEIsZUFBTyxDQUFDLEdBQUcsQ0FBQyxRQUFRLENBQUMsQ0FBQzs7QUFFdEIsZUFDSTs7Y0FBSyxTQUFNLDZCQUE2QixFQUFDLEtBQUssRUFBRSxLQUFLLENBQUMsS0FBSyxHQUFHO0FBQzFELHNDQUFrQixXQUFTLEtBQUssQ0FBQyxLQUFLLENBQUMsV0FBVyxDQUFDLE9BQU8sQ0FBQyxPQUFPLEVBQUUsVUFBVSxDQUFDLE1BQUc7aUJBQ3JGLEdBQUc7QUFDQSxzQ0FBa0IsRUFBRSxTQUFTO2lCQUNoQyxBQUFDO1lBQ0csS0FBSyxDQUFDLEtBQUssR0FDUjs7O2dCQUNJLCtCQUFLLFNBQU0sK0JBQStCLEdBQUc7Z0JBQzdDOztzQkFBSSxTQUFNLDZCQUE2QjtvQkFBRSxLQUFLLENBQUMsS0FBSyxDQUFDLEtBQUs7aUJBQU07Z0JBQ2hFOztzQkFBSyxTQUFNLGdDQUFnQztvQkFDdkM7QUFDSSwrQkFBTyxFQUFFLEtBQUssQ0FBQyxPQUFPLEFBQUM7QUFDdkIsdUNBQWUsRUFBRSxLQUFLLENBQUMsZUFBZSxBQUFDO3NCQUN6QztvQkFDRjtBQUNJLDZCQUFLLEVBQUUsS0FBSyxDQUFDLFdBQVcsR0FBRyxLQUFLLENBQUMsUUFBUSxHQUFHLEdBQUcsSUFBSSxDQUFDLEFBQUM7QUFDckQsdUNBQWUsRUFBRSxLQUFLLENBQUMsZUFBZSxBQUFDO3NCQUN6QztvQkFDRjtBQUNJLGdDQUFRLEVBQUUsS0FBSyxDQUFDLFFBQVEsQUFBQztBQUN6QixtQ0FBVyxFQUFFLEtBQUssQ0FBQyxXQUFXLEFBQUM7c0JBQ2pDO2lCQUNBO2FBQ0osR0FFTjs7OzthQUFvQixBQUN2QjtTQUNDLENBQ1I7S0FDTDtDQUNKLENBQUM7O0FBRUssU0FBUyxNQUFNLENBQUUsRUFBRSxFQUFFLElBQUksRUFBRTtBQUM5QixRQUFJLGVBQWUsR0FBRyxpQ0FBb0IsSUFBSSxDQUFDLFFBQVEsQ0FBQyxDQUFDOztBQUV6RCxRQUFJLEdBQUcsR0FBRyxrQkFBSyxLQUFLLENBQ2hCLHNCQUFDLE1BQU0sSUFBQyxHQUFHLEVBQUUsSUFBSSxDQUFDLEdBQUcsQUFBQyxFQUFDLGVBQWUsRUFBRSxlQUFlLEFBQUMsR0FBRyxDQUM5RCxDQUFDOztBQUVGLHNCQUFLLE1BQU0sQ0FBQyxHQUFHLEVBQUUsRUFBRSxDQUFDLENBQUM7Q0FDeEIiLCJmaWxlIjoiZ2VuZXJhdGVkLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXNDb250ZW50IjpbIihmdW5jdGlvbiBlKHQsbixyKXtmdW5jdGlvbiBzKG8sdSl7aWYoIW5bb10pe2lmKCF0W29dKXt2YXIgYT10eXBlb2YgcmVxdWlyZT09XCJmdW5jdGlvblwiJiZyZXF1aXJlO2lmKCF1JiZhKXJldHVybiBhKG8sITApO2lmKGkpcmV0dXJuIGkobywhMCk7dmFyIGY9bmV3IEVycm9yKFwiQ2Fubm90IGZpbmQgbW9kdWxlICdcIitvK1wiJ1wiKTt0aHJvdyBmLmNvZGU9XCJNT0RVTEVfTk9UX0ZPVU5EXCIsZn12YXIgbD1uW29dPXtleHBvcnRzOnt9fTt0W29dWzBdLmNhbGwobC5leHBvcnRzLGZ1bmN0aW9uKGUpe3ZhciBuPXRbb11bMV1bZV07cmV0dXJuIHMobj9uOmUpfSxsLGwuZXhwb3J0cyxlLHQsbixyKX1yZXR1cm4gbltvXS5leHBvcnRzfXZhciBpPXR5cGVvZiByZXF1aXJlPT1cImZ1bmN0aW9uXCImJnJlcXVpcmU7Zm9yKHZhciBvPTA7bzxyLmxlbmd0aDtvKyspcyhyW29dKTtyZXR1cm4gc30pIiwiLyoqXG4gKiBNb2R1bGUgZGVwZW5kZW5jaWVzLlxuICovXG5cbnZhciBFbWl0dGVyID0gcmVxdWlyZSgnY29tcG9uZW50LWVtaXR0ZXInKVxuXG4vKipcbiAqIEV4cG9zZSBgc2NlbmVgLlxuICovXG5cbm1vZHVsZS5leHBvcnRzID0gQXBwbGljYXRpb25cblxuLyoqXG4gKiBDcmVhdGUgYSBuZXcgYEFwcGxpY2F0aW9uYC5cbiAqXG4gKiBAcGFyYW0ge09iamVjdH0gZWxlbWVudCBPcHRpb25hbCBpbml0aWFsIGVsZW1lbnRcbiAqL1xuXG5mdW5jdGlvbiBBcHBsaWNhdGlvbiAoZWxlbWVudCkge1xuICBpZiAoISh0aGlzIGluc3RhbmNlb2YgQXBwbGljYXRpb24pKSByZXR1cm4gbmV3IEFwcGxpY2F0aW9uKGVsZW1lbnQpXG4gIHRoaXMub3B0aW9ucyA9IHt9XG4gIHRoaXMuc291cmNlcyA9IHt9XG4gIHRoaXMuZWxlbWVudCA9IGVsZW1lbnRcbn1cblxuLyoqXG4gKiBNaXhpbiBgRW1pdHRlcmAuXG4gKi9cblxuRW1pdHRlcihBcHBsaWNhdGlvbi5wcm90b3R5cGUpXG5cbi8qKlxuICogQWRkIGEgcGx1Z2luXG4gKlxuICogQHBhcmFtIHtGdW5jdGlvbn0gcGx1Z2luXG4gKi9cblxuQXBwbGljYXRpb24ucHJvdG90eXBlLnVzZSA9IGZ1bmN0aW9uIChwbHVnaW4pIHtcbiAgcGx1Z2luKHRoaXMpXG4gIHJldHVybiB0aGlzXG59XG5cbi8qKlxuICogU2V0IGFuIG9wdGlvblxuICpcbiAqIEBwYXJhbSB7U3RyaW5nfSBuYW1lXG4gKi9cblxuQXBwbGljYXRpb24ucHJvdG90eXBlLm9wdGlvbiA9IGZ1bmN0aW9uIChuYW1lLCB2YWwpIHtcbiAgdGhpcy5vcHRpb25zW25hbWVdID0gdmFsXG4gIHJldHVybiB0aGlzXG59XG5cbi8qKlxuICogU2V0IHZhbHVlIHVzZWQgc29tZXdoZXJlIGluIHRoZSBJTyBuZXR3b3JrLlxuICovXG5cbkFwcGxpY2F0aW9uLnByb3RvdHlwZS5zZXQgPSBmdW5jdGlvbiAobmFtZSwgZGF0YSkge1xuICBpZiAodGhpcy5zb3VyY2VzW25hbWVdID09PSBkYXRhKSByZXR1cm5cbiAgdGhpcy5zb3VyY2VzW25hbWVdID0gZGF0YVxuICB0aGlzLmVtaXQoJ3NvdXJjZScsIG5hbWUsIGRhdGEpXG4gIHJldHVybiB0aGlzXG59XG5cbi8qKlxuICogTW91bnQgYSB2aXJ0dWFsIGVsZW1lbnQuXG4gKlxuICogQHBhcmFtIHtWaXJ0dWFsRWxlbWVudH0gZWxlbWVudFxuICovXG5cbkFwcGxpY2F0aW9uLnByb3RvdHlwZS5tb3VudCA9IGZ1bmN0aW9uIChlbGVtZW50KSB7XG4gIHRoaXMuZWxlbWVudCA9IGVsZW1lbnRcbiAgdGhpcy5lbWl0KCdtb3VudCcsIGVsZW1lbnQpXG4gIHJldHVybiB0aGlzXG59XG5cbi8qKlxuICogUmVtb3ZlIHRoZSB3b3JsZC4gVW5tb3VudCBldmVyeXRoaW5nLlxuICovXG5cbkFwcGxpY2F0aW9uLnByb3RvdHlwZS51bm1vdW50ID0gZnVuY3Rpb24gKCkge1xuICBpZiAoIXRoaXMuZWxlbWVudCkgcmV0dXJuXG4gIHRoaXMuZWxlbWVudCA9IG51bGxcbiAgdGhpcy5lbWl0KCd1bm1vdW50JylcbiAgcmV0dXJuIHRoaXNcbn1cbiIsIi8qKlxuICogQ3JlYXRlIHRoZSBhcHBsaWNhdGlvbi5cbiAqL1xuXG5leHBvcnRzLnRyZWUgPVxuZXhwb3J0cy5zY2VuZSA9XG5leHBvcnRzLmRla3UgPSByZXF1aXJlKCcuL2FwcGxpY2F0aW9uJylcblxuLyoqXG4gKiBSZW5kZXIgc2NlbmVzIHRvIHRoZSBET00uXG4gKi9cblxuaWYgKHR5cGVvZiBkb2N1bWVudCAhPT0gJ3VuZGVmaW5lZCcpIHtcbiAgZXhwb3J0cy5yZW5kZXIgPSByZXF1aXJlKCcuL3JlbmRlcicpXG59XG5cbi8qKlxuICogUmVuZGVyIHNjZW5lcyB0byBhIHN0cmluZ1xuICovXG5cbmV4cG9ydHMucmVuZGVyU3RyaW5nID0gcmVxdWlyZSgnLi9zdHJpbmdpZnknKVxuXG4vKipcbiAqIENyZWF0ZSB2aXJ0dWFsIGVsZW1lbnRzLlxuICovXG5cbmV4cG9ydHMuZWxlbWVudCA9XG5leHBvcnRzLmRvbSA9IHJlcXVpcmUoJy4vdmlydHVhbCcpXG4iLCIvKipcbiAqIERlcGVuZGVuY2llcy5cbiAqL1xuXG52YXIgcmFmID0gcmVxdWlyZSgnY29tcG9uZW50LXJhZicpXG52YXIgUG9vbCA9IHJlcXVpcmUoJ2RvbS1wb29sJylcbnZhciB3YWxrID0gcmVxdWlyZSgnZG9tLXdhbGsnKVxudmFyIGlzRG9tID0gcmVxdWlyZSgnaXMtZG9tJylcbnZhciB1aWQgPSByZXF1aXJlKCdnZXQtdWlkJylcbnZhciB0aHJvdHRsZSA9IHJlcXVpcmUoJ3Blci1mcmFtZScpXG52YXIga2V5cGF0aCA9IHJlcXVpcmUoJ29iamVjdC1wYXRoJylcbnZhciB0eXBlID0gcmVxdWlyZSgnY29tcG9uZW50LXR5cGUnKVxudmFyIGZhc3QgPSByZXF1aXJlKCdmYXN0LmpzJylcbnZhciB1dGlscyA9IHJlcXVpcmUoJy4vdXRpbHMnKVxudmFyIHN2ZyA9IHJlcXVpcmUoJy4vc3ZnJylcbnZhciBkZWZhdWx0cyA9IHV0aWxzLmRlZmF1bHRzXG52YXIgZm9yRWFjaCA9IGZhc3QuZm9yRWFjaFxudmFyIGFzc2lnbiA9IGZhc3QuYXNzaWduXG52YXIgcmVkdWNlID0gZmFzdC5yZWR1Y2VcblxuLyoqXG4gKiBBbGwgb2YgdGhlIGV2ZW50cyBjYW4gYmluZCB0b1xuICovXG5cbnZhciBldmVudHMgPSB7XG4gIG9uQmx1cjogJ2JsdXInLFxuICBvbkNoYW5nZTogJ2NoYW5nZScsXG4gIG9uQ2xpY2s6ICdjbGljaycsXG4gIG9uQ29udGV4dE1lbnU6ICdjb250ZXh0bWVudScsXG4gIG9uQ29weTogJ2NvcHknLFxuICBvbkN1dDogJ2N1dCcsXG4gIG9uRG91YmxlQ2xpY2s6ICdkYmxjbGljaycsXG4gIG9uRHJhZzogJ2RyYWcnLFxuICBvbkRyYWdFbmQ6ICdkcmFnZW5kJyxcbiAgb25EcmFnRW50ZXI6ICdkcmFnZW50ZXInLFxuICBvbkRyYWdFeGl0OiAnZHJhZ2V4aXQnLFxuICBvbkRyYWdMZWF2ZTogJ2RyYWdsZWF2ZScsXG4gIG9uRHJhZ092ZXI6ICdkcmFnb3ZlcicsXG4gIG9uRHJhZ1N0YXJ0OiAnZHJhZ3N0YXJ0JyxcbiAgb25Ecm9wOiAnZHJvcCcsXG4gIG9uRm9jdXM6ICdmb2N1cycsXG4gIG9uSW5wdXQ6ICdpbnB1dCcsXG4gIG9uS2V5RG93bjogJ2tleWRvd24nLFxuICBvbktleVVwOiAna2V5dXAnLFxuICBvbk1vdXNlRG93bjogJ21vdXNlZG93bicsXG4gIG9uTW91c2VNb3ZlOiAnbW91c2Vtb3ZlJyxcbiAgb25Nb3VzZU91dDogJ21vdXNlb3V0JyxcbiAgb25Nb3VzZU92ZXI6ICdtb3VzZW92ZXInLFxuICBvbk1vdXNlVXA6ICdtb3VzZXVwJyxcbiAgb25QYXN0ZTogJ3Bhc3RlJyxcbiAgb25TY3JvbGw6ICdzY3JvbGwnLFxuICBvblN1Ym1pdDogJ3N1Ym1pdCcsXG4gIG9uVG91Y2hDYW5jZWw6ICd0b3VjaGNhbmNlbCcsXG4gIG9uVG91Y2hFbmQ6ICd0b3VjaGVuZCcsXG4gIG9uVG91Y2hNb3ZlOiAndG91Y2htb3ZlJyxcbiAgb25Ub3VjaFN0YXJ0OiAndG91Y2hzdGFydCdcbn1cblxuLyoqXG4gKiBUaGVzZSBlbGVtZW50cyB3b24ndCBiZSBwb29sZWRcbiAqL1xuXG52YXIgYXZvaWRQb29saW5nID0gWydpbnB1dCcsICd0ZXh0YXJlYSddO1xuXG4vKipcbiAqIEV4cG9zZSBgZG9tYC5cbiAqL1xuXG5tb2R1bGUuZXhwb3J0cyA9IHJlbmRlclxuXG4vKipcbiAqIFJlbmRlciBhbiBhcHAgdG8gdGhlIERPTVxuICpcbiAqIEBwYXJhbSB7QXBwbGljYXRpb259IGFwcFxuICogQHBhcmFtIHtIVE1MRWxlbWVudH0gY29udGFpbmVyXG4gKiBAcGFyYW0ge09iamVjdH0gb3B0c1xuICpcbiAqIEByZXR1cm4ge09iamVjdH1cbiAqL1xuXG5mdW5jdGlvbiByZW5kZXIgKGFwcCwgY29udGFpbmVyLCBvcHRzKSB7XG4gIHZhciBmcmFtZUlkXG4gIHZhciBpc1JlbmRlcmluZ1xuICB2YXIgcm9vdElkID0gJ3Jvb3QnXG4gIHZhciBjdXJyZW50RWxlbWVudFxuICB2YXIgY3VycmVudE5hdGl2ZUVsZW1lbnRcbiAgdmFyIGNvbm5lY3Rpb25zID0ge31cbiAgdmFyIGVudGl0aWVzID0ge31cbiAgdmFyIHBvb2xzID0ge31cbiAgdmFyIGhhbmRsZXJzID0ge31cbiAgdmFyIGNoaWxkcmVuID0ge31cbiAgY2hpbGRyZW5bcm9vdElkXSA9IHt9XG5cbiAgaWYgKCFpc0RvbShjb250YWluZXIpKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKCdDb250YWluZXIgZWxlbWVudCBtdXN0IGJlIGEgRE9NIGVsZW1lbnQnKVxuICB9XG5cbiAgLyoqXG4gICAqIFJlbmRlcmluZyBvcHRpb25zLiBCYXRjaGluZyBpcyBvbmx5IGV2ZXIgcmVhbGx5IGRpc2FibGVkXG4gICAqIHdoZW4gcnVubmluZyB0ZXN0cywgYW5kIHBvb2xpbmcgY2FuIGJlIGRpc2FibGVkIGlmIHRoZSB1c2VyXG4gICAqIGlzIGRvaW5nIHNvbWV0aGluZyBzdHVwaWQgd2l0aCB0aGUgRE9NIGluIHRoZWlyIGNvbXBvbmVudHMuXG4gICAqL1xuXG4gIHZhciBvcHRpb25zID0gZGVmYXVsdHMoYXNzaWduKHt9LCBhcHAub3B0aW9ucyB8fCB7fSwgb3B0cyB8fCB7fSksIHtcbiAgICBwb29saW5nOiB0cnVlLFxuICAgIGJhdGNoaW5nOiB0cnVlLFxuICAgIHZhbGlkYXRlUHJvcHM6IGZhbHNlXG4gIH0pXG5cbiAgLyoqXG4gICAqIExpc3RlbiB0byBET00gZXZlbnRzXG4gICAqL1xuXG4gIGFkZE5hdGl2ZUV2ZW50TGlzdGVuZXJzKClcblxuICAvKipcbiAgICogV2F0Y2ggZm9yIGNoYW5nZXMgdG8gdGhlIGFwcCBzbyB0aGF0IHdlIGNhbiB1cGRhdGVcbiAgICogdGhlIERPTSBhcyBuZWVkZWQuXG4gICAqL1xuXG4gIGFwcC5vbigndW5tb3VudCcsIG9udW5tb3VudClcbiAgYXBwLm9uKCdtb3VudCcsIG9ubW91bnQpXG4gIGFwcC5vbignc291cmNlJywgb251cGRhdGUpXG5cbiAgLyoqXG4gICAqIElmIHRoZSBhcHAgaGFzIGFscmVhZHkgbW91bnRlZCBhbiBlbGVtZW50LCB3ZSBjYW4ganVzdFxuICAgKiByZW5kZXIgdGhhdCBzdHJhaWdodCBhd2F5LlxuICAgKi9cblxuICBpZiAoYXBwLmVsZW1lbnQpIHJlbmRlcigpXG5cbiAgLyoqXG4gICAqIFRlYXJkb3duIHRoZSBET00gcmVuZGVyaW5nIHNvIHRoYXQgaXQgc3RvcHNcbiAgICogcmVuZGVyaW5nIGFuZCBldmVyeXRoaW5nIGNhbiBiZSBnYXJiYWdlIGNvbGxlY3RlZC5cbiAgICovXG5cbiAgZnVuY3Rpb24gdGVhcmRvd24gKCkge1xuICAgIHJlbW92ZU5hdGl2ZUV2ZW50TGlzdGVuZXJzKClcbiAgICByZW1vdmVOYXRpdmVFbGVtZW50KClcbiAgICBhcHAub2ZmKCd1bm1vdW50Jywgb251bm1vdW50KVxuICAgIGFwcC5vZmYoJ21vdW50Jywgb25tb3VudClcbiAgICBhcHAub2ZmKCdzb3VyY2UnLCBvbnVwZGF0ZSlcbiAgfVxuXG4gIC8qKlxuICAgKiBTd2FwIHRoZSBjdXJyZW50IHJlbmRlcmVkIG5vZGUgd2l0aCBhIG5ldyBvbmUgdGhhdCBpcyByZW5kZXJlZFxuICAgKiBmcm9tIHRoZSBuZXcgdmlydHVhbCBlbGVtZW50IG1vdW50ZWQgb24gdGhlIGFwcC5cbiAgICpcbiAgICogQHBhcmFtIHtWaXJ0dWFsRWxlbWVudH0gZWxlbWVudFxuICAgKi9cblxuICBmdW5jdGlvbiBvbm1vdW50ICgpIHtcbiAgICBpbnZhbGlkYXRlKClcbiAgfVxuXG4gIC8qKlxuICAgKiBJZiB0aGUgYXBwIHVubW91bnRzIGFuIGVsZW1lbnQsIHdlIHNob3VsZCBjbGVhciBvdXQgdGhlIGN1cnJlbnRcbiAgICogcmVuZGVyZWQgZWxlbWVudC4gVGhpcyB3aWxsIHJlbW92ZSBhbGwgdGhlIGVudGl0aWVzLlxuICAgKi9cblxuICBmdW5jdGlvbiBvbnVubW91bnQgKCkge1xuICAgIHJlbW92ZU5hdGl2ZUVsZW1lbnQoKVxuICAgIGN1cnJlbnRFbGVtZW50ID0gbnVsbFxuICB9XG5cbiAgLyoqXG4gICAqIFVwZGF0ZSBhbGwgY29tcG9uZW50cyB0aGF0IGFyZSBib3VuZCB0byB0aGUgc291cmNlXG4gICAqXG4gICAqIEBwYXJhbSB7U3RyaW5nfSBuYW1lXG4gICAqIEBwYXJhbSB7Kn0gZGF0YVxuICAgKi9cblxuICBmdW5jdGlvbiBvbnVwZGF0ZSAobmFtZSwgZGF0YSkge1xuICAgIGNvbm5lY3Rpb25zW25hbWVdKGRhdGEpXG4gIH1cblxuICAvKipcbiAgICogUmVuZGVyIGFuZCBtb3VudCBhIGNvbXBvbmVudCB0byB0aGUgbmF0aXZlIGRvbS5cbiAgICpcbiAgICogQHBhcmFtIHtFbnRpdHl9IGVudGl0eVxuICAgKiBAcmV0dXJuIHtIVE1MRWxlbWVudH1cbiAgICovXG5cbiAgZnVuY3Rpb24gbW91bnRFbnRpdHkgKGVudGl0eSkge1xuICAgIHJlZ2lzdGVyKGVudGl0eSlcbiAgICBzZXREZWZhdWx0cyhlbnRpdHkpXG4gICAgY2hpbGRyZW5bZW50aXR5LmlkXSA9IHt9XG4gICAgZW50aXRpZXNbZW50aXR5LmlkXSA9IGVudGl0eVxuXG4gICAgLy8gY29tbWl0IGluaXRpYWwgc3RhdGUgYW5kIHByb3BzLlxuICAgIGNvbW1pdChlbnRpdHkpXG5cbiAgICAvLyBjYWxsYmFjayBiZWZvcmUgbW91bnRpbmcuXG4gICAgdHJpZ2dlcignYmVmb3JlTW91bnQnLCBlbnRpdHksIFtlbnRpdHkuY29udGV4dF0pXG4gICAgdHJpZ2dlcignYmVmb3JlUmVuZGVyJywgZW50aXR5LCBbZW50aXR5LmNvbnRleHRdKVxuXG4gICAgLy8gcmVuZGVyIHZpcnR1YWwgZWxlbWVudC5cbiAgICB2YXIgdmlydHVhbEVsZW1lbnQgPSByZW5kZXJFbnRpdHkoZW50aXR5KVxuICAgIC8vIGNyZWF0ZSBuYXRpdmUgZWxlbWVudC5cbiAgICB2YXIgbmF0aXZlRWxlbWVudCA9IHRvTmF0aXZlKGVudGl0eS5pZCwgJzAnLCB2aXJ0dWFsRWxlbWVudClcblxuICAgIGVudGl0eS52aXJ0dWFsRWxlbWVudCA9IHZpcnR1YWxFbGVtZW50XG4gICAgZW50aXR5Lm5hdGl2ZUVsZW1lbnQgPSBuYXRpdmVFbGVtZW50XG5cbiAgICAvLyBjYWxsYmFjayBhZnRlciBtb3VudGluZy5cbiAgICB0cmlnZ2VyKCdhZnRlclJlbmRlcicsIGVudGl0eSwgW2VudGl0eS5jb250ZXh0LCBuYXRpdmVFbGVtZW50XSlcbiAgICB0cmlnZ2VyKCdhZnRlck1vdW50JywgZW50aXR5LCBbZW50aXR5LmNvbnRleHQsIG5hdGl2ZUVsZW1lbnQsIHNldFN0YXRlKGVudGl0eSldKVxuXG4gICAgcmV0dXJuIG5hdGl2ZUVsZW1lbnRcbiAgfVxuXG4gIC8qKlxuICAgKiBSZW1vdmUgYSBjb21wb25lbnQgZnJvbSB0aGUgbmF0aXZlIGRvbS5cbiAgICpcbiAgICogQHBhcmFtIHtFbnRpdHl9IGVudGl0eVxuICAgKi9cblxuICBmdW5jdGlvbiB1bm1vdW50RW50aXR5IChlbnRpdHlJZCkge1xuICAgIHZhciBlbnRpdHkgPSBlbnRpdGllc1tlbnRpdHlJZF1cbiAgICBpZiAoIWVudGl0eSkgcmV0dXJuXG4gICAgdHJpZ2dlcignYmVmb3JlVW5tb3VudCcsIGVudGl0eSwgW2VudGl0eS5jb250ZXh0LCBlbnRpdHkubmF0aXZlRWxlbWVudF0pXG4gICAgdW5tb3VudENoaWxkcmVuKGVudGl0eUlkKVxuICAgIHJlbW92ZUFsbEV2ZW50cyhlbnRpdHlJZClcbiAgICBkZWxldGUgZW50aXRpZXNbZW50aXR5SWRdXG4gICAgZGVsZXRlIGNoaWxkcmVuW2VudGl0eUlkXVxuICB9XG5cbiAgLyoqXG4gICAqIFJlbmRlciB0aGUgZW50aXR5IGFuZCBtYWtlIHN1cmUgaXQgcmV0dXJucyBhIG5vZGVcbiAgICpcbiAgICogQHBhcmFtIHtFbnRpdHl9IGVudGl0eVxuICAgKlxuICAgKiBAcmV0dXJuIHtWaXJ0dWFsVHJlZX1cbiAgICovXG5cbiAgZnVuY3Rpb24gcmVuZGVyRW50aXR5IChlbnRpdHkpIHtcbiAgICB2YXIgY29tcG9uZW50ID0gZW50aXR5LmNvbXBvbmVudFxuICAgIGlmICghY29tcG9uZW50LnJlbmRlcikgdGhyb3cgbmV3IEVycm9yKCdDb21wb25lbnQgbmVlZHMgYSByZW5kZXIgZnVuY3Rpb24nKVxuICAgIHZhciByZXN1bHQgPSBjb21wb25lbnQucmVuZGVyKGVudGl0eS5jb250ZXh0LCBzZXRTdGF0ZShlbnRpdHkpKVxuICAgIGlmICghcmVzdWx0KSB0aHJvdyBuZXcgRXJyb3IoJ1JlbmRlciBmdW5jdGlvbiBtdXN0IHJldHVybiBhbiBlbGVtZW50LicpXG4gICAgcmV0dXJuIHJlc3VsdFxuICB9XG5cbiAgLyoqXG4gICAqIFdoZW5ldmVyIHNldFN0YXRlIG9yIHNldFByb3BzIGlzIGNhbGxlZCwgd2UgbWFyayB0aGUgZW50aXR5XG4gICAqIGFzIGRpcnR5IGluIHRoZSByZW5kZXJlci4gVGhpcyBsZXRzIHVzIG9wdGltaXplIHRoZSByZS1yZW5kZXJpbmdcbiAgICogYW5kIHNraXAgY29tcG9uZW50cyB0aGF0IGRlZmluaXRlbHkgaGF2ZW4ndCBjaGFuZ2VkLlxuICAgKlxuICAgKiBAcGFyYW0ge0VudGl0eX0gZW50aXR5XG4gICAqXG4gICAqIEByZXR1cm4ge0Z1bmN0aW9ufSBBIGN1cnJpZWQgZnVuY3Rpb24gZm9yIHVwZGF0aW5nIHRoZSBzdGF0ZSBvZiBhbiBlbnRpdHlcbiAgICovXG5cbiAgZnVuY3Rpb24gc2V0U3RhdGUgKGVudGl0eSkge1xuICAgIHJldHVybiBmdW5jdGlvbiAobmV4dFN0YXRlKSB7XG4gICAgICB1cGRhdGVFbnRpdHlTdGF0ZShlbnRpdHksIG5leHRTdGF0ZSlcbiAgICB9XG4gIH1cblxuICAvKipcbiAgICogVGVsbCB0aGUgYXBwIGl0J3MgZGlydHkgYW5kIG5lZWRzIHRvIHJlLXJlbmRlci4gSWYgYmF0Y2hpbmcgaXMgZGlzYWJsZWRcbiAgICogd2UgY2FuIGp1c3QgdHJpZ2dlciBhIHJlbmRlciBpbW1lZGlhdGVseSwgb3RoZXJ3aXNlIHdlJ2xsIHdhaXQgdW50aWxcbiAgICogdGhlIG5leHQgYXZhaWxhYmxlIGZyYW1lLlxuICAgKi9cblxuICBmdW5jdGlvbiBpbnZhbGlkYXRlICgpIHtcbiAgICBpZiAoIW9wdGlvbnMuYmF0Y2hpbmcpIHtcbiAgICAgIGlmICghaXNSZW5kZXJpbmcpIHJlbmRlcigpXG4gICAgfSBlbHNlIHtcbiAgICAgIGlmICghZnJhbWVJZCkgZnJhbWVJZCA9IHJhZihyZW5kZXIpXG4gICAgfVxuICB9XG5cbiAgLyoqXG4gICAqIFVwZGF0ZSB0aGUgRE9NLiBJZiB0aGUgdXBkYXRlIGZhaWxzIHdlIHN0b3AgdGhlIGxvb3BcbiAgICogc28gd2UgZG9uJ3QgZ2V0IGVycm9ycyBvbiBldmVyeSBmcmFtZS5cbiAgICpcbiAgICogQGFwaSBwdWJsaWNcbiAgICovXG5cbiAgZnVuY3Rpb24gcmVuZGVyICgpIHtcbiAgICAvLyBJZiB0aGlzIGlzIGNhbGxlZCBzeW5jaHJvbm91c2x5IHdlIG5lZWQgdG9cbiAgICAvLyBjYW5jZWwgYW55IHBlbmRpbmcgZnV0dXJlIHVwZGF0ZXNcbiAgICBjbGVhckZyYW1lKClcblxuICAgIC8vIElmIHRoZSByZW5kZXJpbmcgZnJvbSB0aGUgcHJldmlvdXMgZnJhbWUgaXMgc3RpbGwgZ29pbmcsXG4gICAgLy8gd2UnbGwganVzdCB3YWl0IHVudGlsIHRoZSBuZXh0IGZyYW1lLiBJZGVhbGx5IHJlbmRlcnMgc2hvdWxkXG4gICAgLy8gbm90IHRha2Ugb3ZlciAxNm1zIHRvIHN0YXkgd2l0aGluIGEgc2luZ2xlIGZyYW1lLCBidXQgdGhpcyBzaG91bGRcbiAgICAvLyBjYXRjaCBpdCBpZiBpdCBkb2VzLlxuICAgIGlmIChpc1JlbmRlcmluZykge1xuICAgICAgZnJhbWVJZCA9IHJhZihyZW5kZXIpXG4gICAgICByZXR1cm5cbiAgICB9IGVsc2Uge1xuICAgICAgaXNSZW5kZXJpbmcgPSB0cnVlXG4gICAgfVxuXG4gICAgLy8gMS4gSWYgdGhlcmUgaXNuJ3QgYSBuYXRpdmUgZWxlbWVudCByZW5kZXJlZCBmb3IgdGhlIGN1cnJlbnQgbW91bnRlZCBlbGVtZW50XG4gICAgLy8gdGhlbiB3ZSBuZWVkIHRvIGNyZWF0ZSBpdCBmcm9tIHNjcmF0Y2guXG4gICAgLy8gMi4gSWYgYSBuZXcgZWxlbWVudCBoYXMgYmVlbiBtb3VudGVkLCB3ZSBzaG91bGQgZGlmZiB0aGVtLlxuICAgIC8vIDMuIFdlIHNob3VsZCB1cGRhdGUgY2hlY2sgYWxsIGNoaWxkIGNvbXBvbmVudHMgZm9yIGNoYW5nZXMuXG4gICAgaWYgKCFjdXJyZW50TmF0aXZlRWxlbWVudCkge1xuICAgICAgY3VycmVudEVsZW1lbnQgPSBhcHAuZWxlbWVudFxuICAgICAgY3VycmVudE5hdGl2ZUVsZW1lbnQgPSB0b05hdGl2ZShyb290SWQsICcwJywgY3VycmVudEVsZW1lbnQpXG4gICAgICBjb250YWluZXIuYXBwZW5kQ2hpbGQoY3VycmVudE5hdGl2ZUVsZW1lbnQpXG4gICAgfSBlbHNlIGlmIChjdXJyZW50RWxlbWVudCAhPT0gYXBwLmVsZW1lbnQpIHtcbiAgICAgIGN1cnJlbnROYXRpdmVFbGVtZW50ID0gcGF0Y2gocm9vdElkLCBjdXJyZW50RWxlbWVudCwgYXBwLmVsZW1lbnQsIGN1cnJlbnROYXRpdmVFbGVtZW50KVxuICAgICAgY3VycmVudEVsZW1lbnQgPSBhcHAuZWxlbWVudFxuICAgICAgdXBkYXRlQ2hpbGRyZW4ocm9vdElkKVxuICAgIH0gZWxzZSB7XG4gICAgICB1cGRhdGVDaGlsZHJlbihyb290SWQpXG4gICAgfVxuXG4gICAgLy8gQWxsb3cgcmVuZGVyaW5nIGFnYWluLlxuICAgIGlzUmVuZGVyaW5nID0gZmFsc2VcbiAgfVxuXG4gIC8qKlxuICAgKiBDbGVhciB0aGUgY3VycmVudCBzY2hlZHVsZWQgZnJhbWVcbiAgICovXG5cbiAgZnVuY3Rpb24gY2xlYXJGcmFtZSAoKSB7XG4gICAgaWYgKCFmcmFtZUlkKSByZXR1cm5cbiAgICByYWYuY2FuY2VsKGZyYW1lSWQpXG4gICAgZnJhbWVJZCA9IDBcbiAgfVxuXG4gIC8qKlxuICAgKiBVcGRhdGUgYSBjb21wb25lbnQuXG4gICAqXG4gICAqIFRoZSBlbnRpdHkgaXMganVzdCB0aGUgZGF0YSBvYmplY3QgZm9yIGEgY29tcG9uZW50IGluc3RhbmNlLlxuICAgKlxuICAgKiBAcGFyYW0ge1N0cmluZ30gaWQgQ29tcG9uZW50IGluc3RhbmNlIGlkLlxuICAgKi9cblxuICBmdW5jdGlvbiB1cGRhdGVFbnRpdHkgKGVudGl0eUlkKSB7XG4gICAgdmFyIGVudGl0eSA9IGVudGl0aWVzW2VudGl0eUlkXVxuICAgIGlmICghc2hvdWxkVXBkYXRlKGVudGl0eSkpIHJldHVybiB1cGRhdGVDaGlsZHJlbihlbnRpdHlJZClcblxuICAgIHZhciBjdXJyZW50VHJlZSA9IGVudGl0eS52aXJ0dWFsRWxlbWVudFxuICAgIHZhciBuZXh0UHJvcHMgPSBlbnRpdHkucGVuZGluZ1Byb3BzXG4gICAgdmFyIG5leHRTdGF0ZSA9IGVudGl0eS5wZW5kaW5nU3RhdGVcbiAgICB2YXIgcHJldmlvdXNTdGF0ZSA9IGVudGl0eS5jb250ZXh0LnN0YXRlXG4gICAgdmFyIHByZXZpb3VzUHJvcHMgPSBlbnRpdHkuY29udGV4dC5wcm9wc1xuXG4gICAgLy8gaG9vayBiZWZvcmUgcmVuZGVyaW5nLiBjb3VsZCBtb2RpZnkgc3RhdGUganVzdCBiZWZvcmUgdGhlIHJlbmRlciBvY2N1cnMuXG4gICAgdHJpZ2dlcignYmVmb3JlVXBkYXRlJywgZW50aXR5LCBbZW50aXR5LmNvbnRleHQsIG5leHRQcm9wcywgbmV4dFN0YXRlXSlcbiAgICB0cmlnZ2VyKCdiZWZvcmVSZW5kZXInLCBlbnRpdHksIFtlbnRpdHkuY29udGV4dF0pXG5cbiAgICAvLyBjb21taXQgc3RhdGUgYW5kIHByb3BzLlxuICAgIGNvbW1pdChlbnRpdHkpXG5cbiAgICAvLyByZS1yZW5kZXIuXG4gICAgdmFyIG5leHRUcmVlID0gcmVuZGVyRW50aXR5KGVudGl0eSlcblxuICAgIC8vIGFwcGx5IG5ldyB2aXJ0dWFsIHRyZWUgdG8gbmF0aXZlIGRvbS5cbiAgICBlbnRpdHkubmF0aXZlRWxlbWVudCA9IHBhdGNoKGVudGl0eUlkLCBjdXJyZW50VHJlZSwgbmV4dFRyZWUsIGVudGl0eS5uYXRpdmVFbGVtZW50KVxuICAgIGVudGl0eS52aXJ0dWFsRWxlbWVudCA9IG5leHRUcmVlXG4gICAgdXBkYXRlQ2hpbGRyZW4oZW50aXR5SWQpXG5cbiAgICAvLyB0cmlnZ2VyIHJlbmRlciBob29rXG4gICAgdHJpZ2dlcignYWZ0ZXJSZW5kZXInLCBlbnRpdHksIFtlbnRpdHkuY29udGV4dCwgZW50aXR5Lm5hdGl2ZUVsZW1lbnRdKVxuXG4gICAgLy8gdHJpZ2dlciBhZnRlclVwZGF0ZSBhZnRlciBhbGwgY2hpbGRyZW4gaGF2ZSB1cGRhdGVkLlxuICAgIHRyaWdnZXIoJ2FmdGVyVXBkYXRlJywgZW50aXR5LCBbZW50aXR5LmNvbnRleHQsIHByZXZpb3VzUHJvcHMsIHByZXZpb3VzU3RhdGUsIHNldFN0YXRlKGVudGl0eSldKVxuICB9XG5cbiAgLyoqXG4gICAqIFVwZGF0ZSBhbGwgdGhlIGNoaWxkcmVuIG9mIGFuIGVudGl0eS5cbiAgICpcbiAgICogQHBhcmFtIHtTdHJpbmd9IGlkIENvbXBvbmVudCBpbnN0YW5jZSBpZC5cbiAgICovXG5cbiAgZnVuY3Rpb24gdXBkYXRlQ2hpbGRyZW4gKGVudGl0eUlkKSB7XG4gICAgZm9yRWFjaChjaGlsZHJlbltlbnRpdHlJZF0sIGZ1bmN0aW9uIChjaGlsZElkKSB7XG4gICAgICB1cGRhdGVFbnRpdHkoY2hpbGRJZClcbiAgICB9KVxuICB9XG5cbiAgLyoqXG4gICAqIFJlbW92ZSBhbGwgb2YgdGhlIGNoaWxkIGVudGl0aWVzIG9mIGFuIGVudGl0eVxuICAgKlxuICAgKiBAcGFyYW0ge0VudGl0eX0gZW50aXR5XG4gICAqL1xuXG4gIGZ1bmN0aW9uIHVubW91bnRDaGlsZHJlbiAoZW50aXR5SWQpIHtcbiAgICBmb3JFYWNoKGNoaWxkcmVuW2VudGl0eUlkXSwgZnVuY3Rpb24gKGNoaWxkSWQpIHtcbiAgICAgIHVubW91bnRFbnRpdHkoY2hpbGRJZClcbiAgICB9KVxuICB9XG5cbiAgLyoqXG4gICAqIFJlbW92ZSB0aGUgcm9vdCBlbGVtZW50LiBJZiB0aGlzIGlzIGNhbGxlZCBzeW5jaHJvbm91c2x5IHdlIG5lZWQgdG9cbiAgICogY2FuY2VsIGFueSBwZW5kaW5nIGZ1dHVyZSB1cGRhdGVzLlxuICAgKi9cblxuICBmdW5jdGlvbiByZW1vdmVOYXRpdmVFbGVtZW50ICgpIHtcbiAgICBjbGVhckZyYW1lKClcbiAgICByZW1vdmVFbGVtZW50KHJvb3RJZCwgJzAnLCBjdXJyZW50TmF0aXZlRWxlbWVudClcbiAgICBjdXJyZW50TmF0aXZlRWxlbWVudCA9IG51bGxcbiAgfVxuXG4gIC8qKlxuICAgKiBDcmVhdGUgYSBuYXRpdmUgZWxlbWVudCBmcm9tIGEgdmlydHVhbCBlbGVtZW50LlxuICAgKlxuICAgKiBAcGFyYW0ge1N0cmluZ30gZW50aXR5SWRcbiAgICogQHBhcmFtIHtTdHJpbmd9IHBhdGhcbiAgICogQHBhcmFtIHtPYmplY3R9IHZub2RlXG4gICAqXG4gICAqIEByZXR1cm4ge0hUTUxEb2N1bWVudEZyYWdtZW50fVxuICAgKi9cblxuICBmdW5jdGlvbiB0b05hdGl2ZSAoZW50aXR5SWQsIHBhdGgsIHZub2RlKSB7XG4gICAgc3dpdGNoICh2bm9kZS50eXBlKSB7XG4gICAgICBjYXNlICd0ZXh0JzogcmV0dXJuIHRvTmF0aXZlVGV4dCh2bm9kZSlcbiAgICAgIGNhc2UgJ2VsZW1lbnQnOiByZXR1cm4gdG9OYXRpdmVFbGVtZW50KGVudGl0eUlkLCBwYXRoLCB2bm9kZSlcbiAgICAgIGNhc2UgJ2NvbXBvbmVudCc6IHJldHVybiB0b05hdGl2ZUNvbXBvbmVudChlbnRpdHlJZCwgcGF0aCwgdm5vZGUpXG4gICAgfVxuICB9XG5cbiAgLyoqXG4gICAqIENyZWF0ZSBhIG5hdGl2ZSB0ZXh0IGVsZW1lbnQgZnJvbSBhIHZpcnR1YWwgZWxlbWVudC5cbiAgICpcbiAgICogQHBhcmFtIHtPYmplY3R9IHZub2RlXG4gICAqL1xuXG4gIGZ1bmN0aW9uIHRvTmF0aXZlVGV4dCAodm5vZGUpIHtcbiAgICByZXR1cm4gZG9jdW1lbnQuY3JlYXRlVGV4dE5vZGUodm5vZGUuZGF0YSlcbiAgfVxuXG4gIC8qKlxuICAgKiBDcmVhdGUgYSBuYXRpdmUgZWxlbWVudCBmcm9tIGEgdmlydHVhbCBlbGVtZW50LlxuICAgKi9cblxuICBmdW5jdGlvbiB0b05hdGl2ZUVsZW1lbnQgKGVudGl0eUlkLCBwYXRoLCB2bm9kZSkge1xuICAgIHZhciBhdHRyaWJ1dGVzID0gdm5vZGUuYXR0cmlidXRlc1xuICAgIHZhciBjaGlsZHJlbiA9IHZub2RlLmNoaWxkcmVuXG4gICAgdmFyIHRhZ05hbWUgPSB2bm9kZS50YWdOYW1lXG4gICAgdmFyIGVsXG5cbiAgICAvLyBjcmVhdGUgZWxlbWVudCBlaXRoZXIgZnJvbSBwb29sIG9yIGZyZXNoLlxuICAgIGlmICghb3B0aW9ucy5wb29saW5nIHx8ICFjYW5Qb29sKHRhZ05hbWUpKSB7XG4gICAgICBpZiAoc3ZnLmlzRWxlbWVudCh0YWdOYW1lKSkge1xuICAgICAgICBlbCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnROUyhzdmcubmFtZXNwYWNlLCB0YWdOYW1lKVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgZWwgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KHRhZ05hbWUpXG4gICAgICB9XG4gICAgfSBlbHNlIHtcbiAgICAgIHZhciBwb29sID0gZ2V0UG9vbCh0YWdOYW1lKVxuICAgICAgZWwgPSBjbGVhbnVwKHBvb2wucG9wKCkpXG4gICAgICBpZiAoZWwucGFyZW50Tm9kZSkgZWwucGFyZW50Tm9kZS5yZW1vdmVDaGlsZChlbClcbiAgICB9XG5cbiAgICAvLyBzZXQgYXR0cmlidXRlcy5cbiAgICBmb3JFYWNoKGF0dHJpYnV0ZXMsIGZ1bmN0aW9uICh2YWx1ZSwgbmFtZSkge1xuICAgICAgc2V0QXR0cmlidXRlKGVudGl0eUlkLCBwYXRoLCBlbCwgbmFtZSwgdmFsdWUpXG4gICAgfSlcblxuICAgIC8vIHN0b3JlIGtleXMgb24gdGhlIG5hdGl2ZSBlbGVtZW50IGZvciBmYXN0IGV2ZW50IGhhbmRsaW5nLlxuICAgIGVsLl9fZW50aXR5X18gPSBlbnRpdHlJZFxuICAgIGVsLl9fcGF0aF9fID0gcGF0aFxuXG4gICAgLy8gYWRkIGNoaWxkcmVuLlxuICAgIGZvckVhY2goY2hpbGRyZW4sIGZ1bmN0aW9uIChjaGlsZCwgaSkge1xuICAgICAgdmFyIGNoaWxkRWwgPSB0b05hdGl2ZShlbnRpdHlJZCwgcGF0aCArICcuJyArIGksIGNoaWxkKVxuICAgICAgaWYgKCFjaGlsZEVsLnBhcmVudE5vZGUpIGVsLmFwcGVuZENoaWxkKGNoaWxkRWwpXG4gICAgfSlcblxuICAgIHJldHVybiBlbFxuICB9XG5cbiAgLyoqXG4gICAqIENyZWF0ZSBhIG5hdGl2ZSBlbGVtZW50IGZyb20gYSBjb21wb25lbnQuXG4gICAqL1xuXG4gIGZ1bmN0aW9uIHRvTmF0aXZlQ29tcG9uZW50IChlbnRpdHlJZCwgcGF0aCwgdm5vZGUpIHtcbiAgICB2YXIgY2hpbGQgPSBuZXcgRW50aXR5KHZub2RlLmNvbXBvbmVudCwgdm5vZGUucHJvcHMpXG4gICAgY2hpbGRyZW5bZW50aXR5SWRdW3BhdGhdID0gY2hpbGQuaWRcbiAgICByZXR1cm4gbW91bnRFbnRpdHkoY2hpbGQpXG4gIH1cblxuICAvKipcbiAgICogUGF0Y2ggYW4gZWxlbWVudCB3aXRoIHRoZSBkaWZmIGZyb20gdHdvIHRyZWVzLlxuICAgKi9cblxuICBmdW5jdGlvbiBwYXRjaCAoZW50aXR5SWQsIHByZXYsIG5leHQsIGVsKSB7XG4gICAgcmV0dXJuIGRpZmZOb2RlKCcwJywgZW50aXR5SWQsIHByZXYsIG5leHQsIGVsKVxuICB9XG5cbiAgLyoqXG4gICAqIENyZWF0ZSBhIGRpZmYgYmV0d2VlbiB0d28gdHJlc3Mgb2Ygbm9kZXMuXG4gICAqL1xuXG4gIGZ1bmN0aW9uIGRpZmZOb2RlIChwYXRoLCBlbnRpdHlJZCwgcHJldiwgbmV4dCwgZWwpIHtcbiAgICAvLyBUeXBlIGNoYW5nZWQuIFRoaXMgY291bGQgYmUgZnJvbSBlbGVtZW50LT50ZXh0LCB0ZXh0LT5Db21wb25lbnRBLFxuICAgIC8vIENvbXBvbmVudEEtPkNvbXBvbmVudEIgZXRjLiBCdXQgTk9UIGRpdi0+c3Bhbi4gVGhlc2UgYXJlIHRoZSBzYW1lIHR5cGVcbiAgICAvLyAoRWxlbWVudE5vZGUpIGJ1dCBkaWZmZXJlbnQgdGFnIG5hbWUuXG4gICAgaWYgKHByZXYudHlwZSAhPT0gbmV4dC50eXBlKSByZXR1cm4gcmVwbGFjZUVsZW1lbnQoZW50aXR5SWQsIHBhdGgsIGVsLCBuZXh0KVxuXG4gICAgc3dpdGNoIChuZXh0LnR5cGUpIHtcbiAgICAgIGNhc2UgJ3RleHQnOiByZXR1cm4gZGlmZlRleHQocHJldiwgbmV4dCwgZWwpXG4gICAgICBjYXNlICdlbGVtZW50JzogcmV0dXJuIGRpZmZFbGVtZW50KHBhdGgsIGVudGl0eUlkLCBwcmV2LCBuZXh0LCBlbClcbiAgICAgIGNhc2UgJ2NvbXBvbmVudCc6IHJldHVybiBkaWZmQ29tcG9uZW50KHBhdGgsIGVudGl0eUlkLCBwcmV2LCBuZXh0LCBlbClcbiAgICB9XG4gIH1cblxuICAvKipcbiAgICogRGlmZiB0d28gdGV4dCBub2RlcyBhbmQgdXBkYXRlIHRoZSBlbGVtZW50LlxuICAgKi9cblxuICBmdW5jdGlvbiBkaWZmVGV4dCAocHJldmlvdXMsIGN1cnJlbnQsIGVsKSB7XG4gICAgaWYgKGN1cnJlbnQuZGF0YSAhPT0gcHJldmlvdXMuZGF0YSkgZWwuZGF0YSA9IGN1cnJlbnQuZGF0YVxuICAgIHJldHVybiBlbFxuICB9XG5cbiAgLyoqXG4gICAqIERpZmYgdGhlIGNoaWxkcmVuIG9mIGFuIEVsZW1lbnROb2RlLlxuICAgKi9cblxuICBmdW5jdGlvbiBkaWZmQ2hpbGRyZW4gKHBhdGgsIGVudGl0eUlkLCBwcmV2LCBuZXh0LCBlbCkge1xuICAgIHZhciBwb3NpdGlvbnMgPSBbXVxuICAgIHZhciBoYXNLZXlzID0gZmFsc2VcbiAgICB2YXIgY2hpbGROb2RlcyA9IEFycmF5LnByb3RvdHlwZS5zbGljZS5hcHBseShlbC5jaGlsZE5vZGVzKVxuICAgIHZhciBsZWZ0S2V5cyA9IHJlZHVjZShwcmV2LmNoaWxkcmVuLCBrZXlNYXBSZWR1Y2VyLCB7fSlcbiAgICB2YXIgcmlnaHRLZXlzID0gcmVkdWNlKG5leHQuY2hpbGRyZW4sIGtleU1hcFJlZHVjZXIsIHt9KVxuICAgIHZhciBjdXJyZW50Q2hpbGRyZW4gPSBhc3NpZ24oe30sIGNoaWxkcmVuW2VudGl0eUlkXSlcblxuICAgIGZ1bmN0aW9uIGtleU1hcFJlZHVjZXIgKGFjYywgY2hpbGQpIHtcbiAgICAgIGlmIChjaGlsZC5rZXkgIT0gbnVsbCkge1xuICAgICAgICBhY2NbY2hpbGQua2V5XSA9IGNoaWxkXG4gICAgICAgIGhhc0tleXMgPSB0cnVlXG4gICAgICB9XG4gICAgICByZXR1cm4gYWNjXG4gICAgfVxuXG4gICAgLy8gRGlmZiBhbGwgb2YgdGhlIG5vZGVzIHRoYXQgaGF2ZSBrZXlzLiBUaGlzIGxldHMgdXMgcmUtdXNlZCBlbGVtZW50c1xuICAgIC8vIGluc3RlYWQgb2Ygb3ZlcnJpZGluZyB0aGVtIGFuZCBsZXRzIHVzIG1vdmUgdGhlbSBhcm91bmQuXG4gICAgaWYgKGhhc0tleXMpIHtcblxuICAgICAgLy8gUmVtb3ZhbHNcbiAgICAgIGZvckVhY2gobGVmdEtleXMsIGZ1bmN0aW9uIChsZWZ0Tm9kZSwga2V5KSB7XG4gICAgICAgIGlmIChyaWdodEtleXNba2V5XSA9PSBudWxsKSB7XG4gICAgICAgICAgdmFyIGxlZnRQYXRoID0gcGF0aCArICcuJyArIGxlZnROb2RlLmluZGV4XG4gICAgICAgICAgcmVtb3ZlRWxlbWVudChcbiAgICAgICAgICAgIGVudGl0eUlkLFxuICAgICAgICAgICAgbGVmdFBhdGgsXG4gICAgICAgICAgICBjaGlsZE5vZGVzW2xlZnROb2RlLmluZGV4XVxuICAgICAgICAgIClcbiAgICAgICAgfVxuICAgICAgfSlcblxuICAgICAgLy8gVXBkYXRlIG5vZGVzXG4gICAgICBmb3JFYWNoKHJpZ2h0S2V5cywgZnVuY3Rpb24gKHJpZ2h0Tm9kZSwga2V5KSB7XG4gICAgICAgIHZhciBsZWZ0Tm9kZSA9IGxlZnRLZXlzW2tleV1cblxuICAgICAgICAvLyBXZSBvbmx5IHdhbnQgdXBkYXRlcyBmb3Igbm93XG4gICAgICAgIGlmIChsZWZ0Tm9kZSA9PSBudWxsKSByZXR1cm5cblxuICAgICAgICB2YXIgbGVmdFBhdGggPSBwYXRoICsgJy4nICsgbGVmdE5vZGUuaW5kZXhcblxuICAgICAgICAvLyBVcGRhdGVkXG4gICAgICAgIHBvc2l0aW9uc1tyaWdodE5vZGUuaW5kZXhdID0gZGlmZk5vZGUoXG4gICAgICAgICAgbGVmdFBhdGgsXG4gICAgICAgICAgZW50aXR5SWQsXG4gICAgICAgICAgbGVmdE5vZGUsXG4gICAgICAgICAgcmlnaHROb2RlLFxuICAgICAgICAgIGNoaWxkTm9kZXNbbGVmdE5vZGUuaW5kZXhdXG4gICAgICAgIClcbiAgICAgIH0pXG5cbiAgICAgIC8vIFVwZGF0ZSB0aGUgcG9zaXRpb25zIG9mIGFsbCBjaGlsZCBjb21wb25lbnRzIGFuZCBldmVudCBoYW5kbGVyc1xuICAgICAgZm9yRWFjaChyaWdodEtleXMsIGZ1bmN0aW9uIChyaWdodE5vZGUsIGtleSkge1xuICAgICAgICB2YXIgbGVmdE5vZGUgPSBsZWZ0S2V5c1trZXldXG5cbiAgICAgICAgLy8gV2UganVzdCB3YW50IGVsZW1lbnRzIHRoYXQgaGF2ZSBtb3ZlZCBhcm91bmRcbiAgICAgICAgaWYgKGxlZnROb2RlID09IG51bGwgfHwgbGVmdE5vZGUuaW5kZXggPT09IHJpZ2h0Tm9kZS5pbmRleCkgcmV0dXJuXG5cbiAgICAgICAgdmFyIHJpZ2h0UGF0aCA9IHBhdGggKyAnLicgKyByaWdodE5vZGUuaW5kZXhcbiAgICAgICAgdmFyIGxlZnRQYXRoID0gcGF0aCArICcuJyArIGxlZnROb2RlLmluZGV4XG5cbiAgICAgICAgLy8gVXBkYXRlIGFsbCB0aGUgY2hpbGQgY29tcG9uZW50IHBhdGggcG9zaXRpb25zIHRvIG1hdGNoXG4gICAgICAgIC8vIHRoZSBsYXRlc3QgcG9zaXRpb25zIGlmIHRoZXkndmUgY2hhbmdlZC4gVGhpcyBpcyBhIGJpdCBoYWNreS5cbiAgICAgICAgZm9yRWFjaChjdXJyZW50Q2hpbGRyZW4sIGZ1bmN0aW9uIChjaGlsZElkLCBjaGlsZFBhdGgpIHtcbiAgICAgICAgICBpZiAobGVmdFBhdGggPT09IGNoaWxkUGF0aCkge1xuICAgICAgICAgICAgZGVsZXRlIGNoaWxkcmVuW2VudGl0eUlkXVtjaGlsZFBhdGhdXG4gICAgICAgICAgICBjaGlsZHJlbltlbnRpdHlJZF1bcmlnaHRQYXRoXSA9IGNoaWxkSWRcbiAgICAgICAgICB9XG4gICAgICAgIH0pXG4gICAgICB9KVxuXG4gICAgICAvLyBOb3cgYWRkIGFsbCBvZiB0aGUgbmV3IG5vZGVzIGxhc3QgaW4gY2FzZSB0aGVpciBwYXRoXG4gICAgICAvLyB3b3VsZCBoYXZlIGNvbmZsaWN0ZWQgd2l0aCBvbmUgb2YgdGhlIHByZXZpb3VzIHBhdGhzLlxuICAgICAgZm9yRWFjaChyaWdodEtleXMsIGZ1bmN0aW9uIChyaWdodE5vZGUsIGtleSkge1xuICAgICAgICB2YXIgcmlnaHRQYXRoID0gcGF0aCArICcuJyArIHJpZ2h0Tm9kZS5pbmRleFxuICAgICAgICBpZiAobGVmdEtleXNba2V5XSA9PSBudWxsKSB7XG4gICAgICAgICAgcG9zaXRpb25zW3JpZ2h0Tm9kZS5pbmRleF0gPSB0b05hdGl2ZShcbiAgICAgICAgICAgIGVudGl0eUlkLFxuICAgICAgICAgICAgcmlnaHRQYXRoLFxuICAgICAgICAgICAgcmlnaHROb2RlXG4gICAgICAgICAgKVxuICAgICAgICB9XG4gICAgICB9KVxuXG4gICAgfSBlbHNlIHtcbiAgICAgIHZhciBtYXhMZW5ndGggPSBNYXRoLm1heChwcmV2LmNoaWxkcmVuLmxlbmd0aCwgbmV4dC5jaGlsZHJlbi5sZW5ndGgpXG5cbiAgICAgIC8vIE5vdyBkaWZmIGFsbCBvZiB0aGUgbm9kZXMgdGhhdCBkb24ndCBoYXZlIGtleXNcbiAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgbWF4TGVuZ3RoOyBpKyspIHtcbiAgICAgICAgdmFyIGxlZnROb2RlID0gcHJldi5jaGlsZHJlbltpXVxuICAgICAgICB2YXIgcmlnaHROb2RlID0gbmV4dC5jaGlsZHJlbltpXVxuXG4gICAgICAgIC8vIFJlbW92YWxzXG4gICAgICAgIGlmIChyaWdodE5vZGUgPT0gbnVsbCkge1xuICAgICAgICAgIHJlbW92ZUVsZW1lbnQoXG4gICAgICAgICAgICBlbnRpdHlJZCxcbiAgICAgICAgICAgIHBhdGggKyAnLicgKyBsZWZ0Tm9kZS5pbmRleCxcbiAgICAgICAgICAgIGNoaWxkTm9kZXNbbGVmdE5vZGUuaW5kZXhdXG4gICAgICAgICAgKVxuICAgICAgICB9XG5cbiAgICAgICAgLy8gTmV3IE5vZGVcbiAgICAgICAgaWYgKGxlZnROb2RlID09IG51bGwpIHtcbiAgICAgICAgICBwb3NpdGlvbnNbcmlnaHROb2RlLmluZGV4XSA9IHRvTmF0aXZlKFxuICAgICAgICAgICAgZW50aXR5SWQsXG4gICAgICAgICAgICBwYXRoICsgJy4nICsgcmlnaHROb2RlLmluZGV4LFxuICAgICAgICAgICAgcmlnaHROb2RlXG4gICAgICAgICAgKVxuICAgICAgICB9XG5cbiAgICAgICAgLy8gVXBkYXRlZFxuICAgICAgICBpZiAobGVmdE5vZGUgJiYgcmlnaHROb2RlKSB7XG4gICAgICAgICAgcG9zaXRpb25zW2xlZnROb2RlLmluZGV4XSA9IGRpZmZOb2RlKFxuICAgICAgICAgICAgcGF0aCArICcuJyArIGxlZnROb2RlLmluZGV4LFxuICAgICAgICAgICAgZW50aXR5SWQsXG4gICAgICAgICAgICBsZWZ0Tm9kZSxcbiAgICAgICAgICAgIHJpZ2h0Tm9kZSxcbiAgICAgICAgICAgIGNoaWxkTm9kZXNbbGVmdE5vZGUuaW5kZXhdXG4gICAgICAgICAgKVxuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuXG4gICAgLy8gUmVwb3NpdGlvbiBhbGwgdGhlIGVsZW1lbnRzXG4gICAgZm9yRWFjaChwb3NpdGlvbnMsIGZ1bmN0aW9uIChjaGlsZEVsLCBuZXdQb3NpdGlvbikge1xuICAgICAgdmFyIHRhcmdldCA9IGVsLmNoaWxkTm9kZXNbbmV3UG9zaXRpb25dXG4gICAgICBpZiAoY2hpbGRFbCAhPT0gdGFyZ2V0KSB7XG4gICAgICAgIGlmICh0YXJnZXQpIHtcbiAgICAgICAgICBlbC5pbnNlcnRCZWZvcmUoY2hpbGRFbCwgdGFyZ2V0KVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIGVsLmFwcGVuZENoaWxkKGNoaWxkRWwpXG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9KVxuICB9XG5cbiAgLyoqXG4gICAqIERpZmYgdGhlIGF0dHJpYnV0ZXMgYW5kIGFkZC9yZW1vdmUgdGhlbS5cbiAgICovXG5cbiAgZnVuY3Rpb24gZGlmZkF0dHJpYnV0ZXMgKHByZXYsIG5leHQsIGVsLCBlbnRpdHlJZCwgcGF0aCkge1xuICAgIHZhciBuZXh0QXR0cnMgPSBuZXh0LmF0dHJpYnV0ZXNcbiAgICB2YXIgcHJldkF0dHJzID0gcHJldi5hdHRyaWJ1dGVzXG5cbiAgICAvLyBhZGQgbmV3IGF0dHJzXG4gICAgZm9yRWFjaChuZXh0QXR0cnMsIGZ1bmN0aW9uICh2YWx1ZSwgbmFtZSkge1xuICAgICAgaWYgKGV2ZW50c1tuYW1lXSB8fCAhKG5hbWUgaW4gcHJldkF0dHJzKSB8fCBwcmV2QXR0cnNbbmFtZV0gIT09IHZhbHVlKSB7XG4gICAgICAgIHNldEF0dHJpYnV0ZShlbnRpdHlJZCwgcGF0aCwgZWwsIG5hbWUsIHZhbHVlKVxuICAgICAgfVxuICAgIH0pXG5cbiAgICAvLyByZW1vdmUgb2xkIGF0dHJzXG4gICAgZm9yRWFjaChwcmV2QXR0cnMsIGZ1bmN0aW9uICh2YWx1ZSwgbmFtZSkge1xuICAgICAgaWYgKCEobmFtZSBpbiBuZXh0QXR0cnMpKSB7XG4gICAgICAgIHJlbW92ZUF0dHJpYnV0ZShlbnRpdHlJZCwgcGF0aCwgZWwsIG5hbWUpXG4gICAgICB9XG4gICAgfSlcbiAgfVxuXG4gIC8qKlxuICAgKiBVcGRhdGUgYSBjb21wb25lbnQgd2l0aCB0aGUgcHJvcHMgZnJvbSB0aGUgbmV4dCBub2RlLiBJZlxuICAgKiB0aGUgY29tcG9uZW50IHR5cGUgaGFzIGNoYW5nZWQsIHdlJ2xsIGp1c3QgcmVtb3ZlIHRoZSBvbGQgb25lXG4gICAqIGFuZCByZXBsYWNlIGl0IHdpdGggdGhlIG5ldyBjb21wb25lbnQuXG4gICAqL1xuXG4gIGZ1bmN0aW9uIGRpZmZDb21wb25lbnQgKHBhdGgsIGVudGl0eUlkLCBwcmV2LCBuZXh0LCBlbCkge1xuICAgIGlmIChuZXh0LmNvbXBvbmVudCAhPT0gcHJldi5jb21wb25lbnQpIHtcbiAgICAgIHJldHVybiByZXBsYWNlRWxlbWVudChlbnRpdHlJZCwgcGF0aCwgZWwsIG5leHQpXG4gICAgfSBlbHNlIHtcbiAgICAgIHZhciB0YXJnZXRJZCA9IGNoaWxkcmVuW2VudGl0eUlkXVtwYXRoXVxuXG4gICAgICAvLyBUaGlzIGlzIGEgaGFjayBmb3Igbm93XG4gICAgICBpZiAodGFyZ2V0SWQpIHtcbiAgICAgICAgdXBkYXRlRW50aXR5UHJvcHModGFyZ2V0SWQsIG5leHQucHJvcHMpXG4gICAgICB9XG5cbiAgICAgIHJldHVybiBlbFxuICAgIH1cbiAgfVxuXG4gIC8qKlxuICAgKiBEaWZmIHR3byBlbGVtZW50IG5vZGVzLlxuICAgKi9cblxuICBmdW5jdGlvbiBkaWZmRWxlbWVudCAocGF0aCwgZW50aXR5SWQsIHByZXYsIG5leHQsIGVsKSB7XG4gICAgaWYgKG5leHQudGFnTmFtZSAhPT0gcHJldi50YWdOYW1lKSByZXR1cm4gcmVwbGFjZUVsZW1lbnQoZW50aXR5SWQsIHBhdGgsIGVsLCBuZXh0KVxuICAgIGRpZmZBdHRyaWJ1dGVzKHByZXYsIG5leHQsIGVsLCBlbnRpdHlJZCwgcGF0aClcbiAgICBkaWZmQ2hpbGRyZW4ocGF0aCwgZW50aXR5SWQsIHByZXYsIG5leHQsIGVsKVxuICAgIHJldHVybiBlbFxuICB9XG5cbiAgLyoqXG4gICAqIFJlbW92ZXMgYW4gZWxlbWVudCBmcm9tIHRoZSBET00gYW5kIHVubW91bnRzIGFuZCBjb21wb25lbnRzXG4gICAqIHRoYXQgYXJlIHdpdGhpbiB0aGF0IGJyYW5jaFxuICAgKlxuICAgKiBzaWRlIGVmZmVjdHM6XG4gICAqICAgLSByZW1vdmVzIGVsZW1lbnQgZnJvbSB0aGUgRE9NXG4gICAqICAgLSByZW1vdmVzIGludGVybmFsIHJlZmVyZW5jZXNcbiAgICpcbiAgICogQHBhcmFtIHtTdHJpbmd9IGVudGl0eUlkXG4gICAqIEBwYXJhbSB7U3RyaW5nfSBwYXRoXG4gICAqIEBwYXJhbSB7SFRNTEVsZW1lbnR9IGVsXG4gICAqL1xuXG4gIGZ1bmN0aW9uIHJlbW92ZUVsZW1lbnQgKGVudGl0eUlkLCBwYXRoLCBlbCkge1xuICAgIHZhciBjaGlsZHJlbkJ5UGF0aCA9IGNoaWxkcmVuW2VudGl0eUlkXVxuICAgIHZhciBjaGlsZElkID0gY2hpbGRyZW5CeVBhdGhbcGF0aF1cbiAgICB2YXIgcmVtb3ZhbHMgPSBbXVxuXG4gICAgLy8gSWYgdGhlIHBhdGggcG9pbnRzIHRvIGEgY29tcG9uZW50IHdlIHNob3VsZCB1c2UgdGhhdFxuICAgIC8vIGNvbXBvbmVudHMgZWxlbWVudCBpbnN0ZWFkLCBiZWNhdXNlIGl0IG1pZ2h0IGhhdmUgbW92ZWQgaXQuXG4gICAgaWYgKGNoaWxkSWQpIHtcbiAgICAgIHZhciBjaGlsZCA9IGVudGl0aWVzW2NoaWxkSWRdXG4gICAgICBlbCA9IGNoaWxkLm5hdGl2ZUVsZW1lbnRcbiAgICAgIHVubW91bnRFbnRpdHkoY2hpbGRJZClcbiAgICAgIHJlbW92YWxzLnB1c2gocGF0aClcbiAgICB9IGVsc2Uge1xuXG4gICAgICAvLyBKdXN0IHJlbW92ZSB0aGUgdGV4dCBub2RlXG4gICAgICBpZiAoIWlzRWxlbWVudChlbCkpIHJldHVybiBlbC5wYXJlbnROb2RlLnJlbW92ZUNoaWxkKGVsKVxuXG4gICAgICAvLyBUaGVuIHdlIG5lZWQgdG8gZmluZCBhbnkgY29tcG9uZW50cyB3aXRoaW4gdGhpc1xuICAgICAgLy8gYnJhbmNoIGFuZCB1bm1vdW50IHRoZW0uXG4gICAgICBmb3JFYWNoKGNoaWxkcmVuQnlQYXRoLCBmdW5jdGlvbiAoY2hpbGRJZCwgY2hpbGRQYXRoKSB7XG4gICAgICAgIGlmIChjaGlsZFBhdGggPT09IHBhdGggfHwgaXNXaXRoaW5QYXRoKHBhdGgsIGNoaWxkUGF0aCkpIHtcbiAgICAgICAgICB1bm1vdW50RW50aXR5KGNoaWxkSWQpXG4gICAgICAgICAgcmVtb3ZhbHMucHVzaChjaGlsZFBhdGgpXG4gICAgICAgIH1cbiAgICAgIH0pXG4gICAgfVxuXG4gICAgLy8gUmVtb3ZlIHRoZSBwYXRocyBmcm9tIHRoZSBvYmplY3Qgd2l0aG91dCB0b3VjaGluZyB0aGVcbiAgICAvLyBvbGQgb2JqZWN0LiBUaGlzIGtlZXBzIHRoZSBvYmplY3QgdXNpbmcgZmFzdCBwcm9wZXJ0aWVzLlxuICAgIGZvckVhY2gocmVtb3ZhbHMsIGZ1bmN0aW9uIChwYXRoKSB7XG4gICAgICBkZWxldGUgY2hpbGRyZW5bZW50aXR5SWRdW3BhdGhdXG4gICAgfSlcblxuICAgIC8vIFJlbW92ZSBpdCBmcm9tIHRoZSBET01cbiAgICBlbC5wYXJlbnROb2RlLnJlbW92ZUNoaWxkKGVsKVxuXG4gICAgLy8gUmV0dXJuIGFsbCBvZiB0aGUgZWxlbWVudHMgaW4gdGhpcyBub2RlIHRyZWUgdG8gdGhlIHBvb2xcbiAgICAvLyBzbyB0aGF0IHRoZSBlbGVtZW50cyBjYW4gYmUgcmUtdXNlZC5cbiAgICBpZiAob3B0aW9ucy5wb29saW5nKSB7XG4gICAgICB3YWxrKGVsLCBmdW5jdGlvbiAobm9kZSkge1xuICAgICAgICBpZiAoIWlzRWxlbWVudChub2RlKSB8fCAhY2FuUG9vbChub2RlLnRhZ05hbWUpKSByZXR1cm5cbiAgICAgICAgZ2V0UG9vbChub2RlLnRhZ05hbWUudG9Mb3dlckNhc2UoKSkucHVzaChub2RlKVxuICAgICAgfSlcbiAgICB9XG4gIH1cblxuICAvKipcbiAgICogUmVwbGFjZSBhbiBlbGVtZW50IGluIHRoZSBET00uIFJlbW92aW5nIGFsbCBjb21wb25lbnRzXG4gICAqIHdpdGhpbiB0aGF0IGVsZW1lbnQgYW5kIHJlLXJlbmRlcmluZyB0aGUgbmV3IHZpcnR1YWwgbm9kZS5cbiAgICpcbiAgICogQHBhcmFtIHtFbnRpdHl9IGVudGl0eVxuICAgKiBAcGFyYW0ge1N0cmluZ30gcGF0aFxuICAgKiBAcGFyYW0ge0hUTUxFbGVtZW50fSBlbFxuICAgKiBAcGFyYW0ge09iamVjdH0gdm5vZGVcbiAgICpcbiAgICogQHJldHVybiB7dm9pZH1cbiAgICovXG5cbiAgZnVuY3Rpb24gcmVwbGFjZUVsZW1lbnQgKGVudGl0eUlkLCBwYXRoLCBlbCwgdm5vZGUpIHtcbiAgICB2YXIgcGFyZW50ID0gZWwucGFyZW50Tm9kZVxuICAgIHZhciBpbmRleCA9IEFycmF5LnByb3RvdHlwZS5pbmRleE9mLmNhbGwocGFyZW50LmNoaWxkTm9kZXMsIGVsKVxuXG4gICAgLy8gcmVtb3ZlIHRoZSBwcmV2aW91cyBlbGVtZW50IGFuZCBhbGwgbmVzdGVkIGNvbXBvbmVudHMuIFRoaXNcbiAgICAvLyBuZWVkcyB0byBoYXBwZW4gYmVmb3JlIHdlIGNyZWF0ZSB0aGUgbmV3IGVsZW1lbnQgc28gd2UgZG9uJ3RcbiAgICAvLyBnZXQgY2xhc2hlcyBvbiB0aGUgY29tcG9uZW50IHBhdGhzLlxuICAgIHJlbW92ZUVsZW1lbnQoZW50aXR5SWQsIHBhdGgsIGVsKVxuXG4gICAgLy8gdGhlbiBhZGQgdGhlIG5ldyBlbGVtZW50IGluIHRoZXJlXG4gICAgdmFyIG5ld0VsID0gdG9OYXRpdmUoZW50aXR5SWQsIHBhdGgsIHZub2RlKVxuICAgIHZhciB0YXJnZXQgPSBwYXJlbnQuY2hpbGROb2Rlc1tpbmRleF1cblxuICAgIGlmICh0YXJnZXQpIHtcbiAgICAgIHBhcmVudC5pbnNlcnRCZWZvcmUobmV3RWwsIHRhcmdldClcbiAgICB9IGVsc2Uge1xuICAgICAgcGFyZW50LmFwcGVuZENoaWxkKG5ld0VsKVxuICAgIH1cblxuICAgIC8vIHVwZGF0ZSBhbGwgYGVudGl0eS5uYXRpdmVFbGVtZW50YCByZWZlcmVuY2VzLlxuICAgIGZvckVhY2goZW50aXRpZXMsIGZ1bmN0aW9uIChlbnRpdHkpIHtcbiAgICAgIGlmIChlbnRpdHkubmF0aXZlRWxlbWVudCA9PT0gZWwpIHtcbiAgICAgICAgZW50aXR5Lm5hdGl2ZUVsZW1lbnQgPSBuZXdFbFxuICAgICAgfVxuICAgIH0pXG5cbiAgICByZXR1cm4gbmV3RWxcbiAgfVxuXG4gIC8qKlxuICAgKiBTZXQgdGhlIGF0dHJpYnV0ZSBvZiBhbiBlbGVtZW50LCBwZXJmb3JtaW5nIGFkZGl0aW9uYWwgdHJhbnNmb3JtYXRpb25zXG4gICAqIGRlcGVuZG5pbmcgb24gdGhlIGF0dHJpYnV0ZSBuYW1lXG4gICAqXG4gICAqIEBwYXJhbSB7SFRNTEVsZW1lbnR9IGVsXG4gICAqIEBwYXJhbSB7U3RyaW5nfSBuYW1lXG4gICAqIEBwYXJhbSB7U3RyaW5nfSB2YWx1ZVxuICAgKi9cblxuICBmdW5jdGlvbiBzZXRBdHRyaWJ1dGUgKGVudGl0eUlkLCBwYXRoLCBlbCwgbmFtZSwgdmFsdWUpIHtcbiAgICBpZiAoZXZlbnRzW25hbWVdKSB7XG4gICAgICBhZGRFdmVudChlbnRpdHlJZCwgcGF0aCwgZXZlbnRzW25hbWVdLCB2YWx1ZSlcbiAgICAgIHJldHVyblxuICAgIH1cbiAgICBzd2l0Y2ggKG5hbWUpIHtcbiAgICAgIGNhc2UgJ3ZhbHVlJzpcbiAgICAgICAgZWwudmFsdWUgPSB2YWx1ZVxuICAgICAgICBicmVha1xuICAgICAgY2FzZSAnaW5uZXJIVE1MJzpcbiAgICAgICAgZWwuaW5uZXJIVE1MID0gdmFsdWVcbiAgICAgICAgYnJlYWtcbiAgICAgIGNhc2Ugc3ZnLmlzQXR0cmlidXRlKG5hbWUpOlxuICAgICAgICBlbC5zZXRBdHRyaWJ1dGVOUyhzdmcubmFtZXNwYWNlLCBuYW1lLCB2YWx1ZSlcbiAgICAgICAgYnJlYWtcbiAgICAgIGRlZmF1bHQ6XG4gICAgICAgIGVsLnNldEF0dHJpYnV0ZShuYW1lLCB2YWx1ZSlcbiAgICAgICAgYnJlYWtcbiAgICB9XG4gIH1cblxuICAvKipcbiAgICogUmVtb3ZlIGFuIGF0dHJpYnV0ZSwgcGVyZm9ybWluZyBhZGRpdGlvbmFsIHRyYW5zZm9ybWF0aW9uc1xuICAgKiBkZXBlbmRuaW5nIG9uIHRoZSBhdHRyaWJ1dGUgbmFtZVxuICAgKlxuICAgKiBAcGFyYW0ge0hUTUxFbGVtZW50fSBlbFxuICAgKiBAcGFyYW0ge1N0cmluZ30gbmFtZVxuICAgKi9cblxuICBmdW5jdGlvbiByZW1vdmVBdHRyaWJ1dGUgKGVudGl0eUlkLCBwYXRoLCBlbCwgbmFtZSkge1xuICAgIGlmIChldmVudHNbbmFtZV0pIHtcbiAgICAgIHJlbW92ZUV2ZW50KGVudGl0eUlkLCBwYXRoLCBldmVudHNbbmFtZV0pXG4gICAgICByZXR1cm5cbiAgICB9XG4gICAgZWwucmVtb3ZlQXR0cmlidXRlKG5hbWUpXG4gIH1cblxuICAvKipcbiAgICogQ2hlY2tzIHRvIHNlZSBpZiBvbmUgdHJlZSBwYXRoIGlzIHdpdGhpblxuICAgKiBhbm90aGVyIHRyZWUgcGF0aC4gRXhhbXBsZTpcbiAgICpcbiAgICogMC4xIHZzIDAuMS4xID0gdHJ1ZVxuICAgKiAwLjIgdnMgMC4zLjUgPSBmYWxzZVxuICAgKlxuICAgKiBAcGFyYW0ge1N0cmluZ30gdGFyZ2V0XG4gICAqIEBwYXJhbSB7U3RyaW5nfSBwYXRoXG4gICAqXG4gICAqIEByZXR1cm4ge0Jvb2xlYW59XG4gICAqL1xuXG4gIGZ1bmN0aW9uIGlzV2l0aGluUGF0aCAodGFyZ2V0LCBwYXRoKSB7XG4gICAgcmV0dXJuIHBhdGguaW5kZXhPZih0YXJnZXQgKyAnLicpID09PSAwXG4gIH1cblxuICAvKipcbiAgICogSXMgdGhlIERPTSBub2RlIGFuIGVsZW1lbnQgbm9kZVxuICAgKlxuICAgKiBAcGFyYW0ge0hUTUxFbGVtZW50fSBlbFxuICAgKlxuICAgKiBAcmV0dXJuIHtCb29sZWFufVxuICAgKi9cblxuICBmdW5jdGlvbiBpc0VsZW1lbnQgKGVsKSB7XG4gICAgcmV0dXJuICEhZWwudGFnTmFtZVxuICB9XG5cbiAgLyoqXG4gICAqIEdldCB0aGUgcG9vbCBmb3IgYSB0YWdOYW1lLCBjcmVhdGluZyBpdCBpZiBpdFxuICAgKiBkb2Vzbid0IGV4aXN0LlxuICAgKlxuICAgKiBAcGFyYW0ge1N0cmluZ30gdGFnTmFtZVxuICAgKlxuICAgKiBAcmV0dXJuIHtQb29sfVxuICAgKi9cblxuICBmdW5jdGlvbiBnZXRQb29sICh0YWdOYW1lKSB7XG4gICAgdmFyIHBvb2wgPSBwb29sc1t0YWdOYW1lXVxuICAgIGlmICghcG9vbCkge1xuICAgICAgdmFyIHBvb2xPcHRzID0gc3ZnLmlzRWxlbWVudCh0YWdOYW1lKSA/XG4gICAgICAgIHsgbmFtZXNwYWNlOiBzdmcubmFtZXNwYWNlLCB0YWdOYW1lOiB0YWdOYW1lIH0gOlxuICAgICAgICB7IHRhZ05hbWU6IHRhZ05hbWUgfVxuICAgICAgcG9vbCA9IHBvb2xzW3RhZ05hbWVdID0gbmV3IFBvb2wocG9vbE9wdHMpXG4gICAgfVxuICAgIHJldHVybiBwb29sXG4gIH1cblxuICAvKipcbiAgICogQ2xlYW4gdXAgcHJldmlvdXNseSB1c2VkIG5hdGl2ZSBlbGVtZW50IGZvciByZXVzZS5cbiAgICpcbiAgICogQHBhcmFtIHtIVE1MRWxlbWVudH0gZWxcbiAgICovXG5cbiAgZnVuY3Rpb24gY2xlYW51cCAoZWwpIHtcbiAgICByZW1vdmVBbGxDaGlsZHJlbihlbClcbiAgICByZW1vdmVBbGxBdHRyaWJ1dGVzKGVsKVxuICAgIHJldHVybiBlbFxuICB9XG5cbiAgLyoqXG4gICAqIFJlbW92ZSBhbGwgdGhlIGF0dHJpYnV0ZXMgZnJvbSBhIG5vZGVcbiAgICpcbiAgICogQHBhcmFtIHtIVE1MRWxlbWVudH0gZWxcbiAgICovXG5cbiAgZnVuY3Rpb24gcmVtb3ZlQWxsQXR0cmlidXRlcyAoZWwpIHtcbiAgICBmb3IgKHZhciBpID0gZWwuYXR0cmlidXRlcy5sZW5ndGggLSAxOyBpID49IDA7IGktLSkge1xuICAgICAgdmFyIG5hbWUgPSBlbC5hdHRyaWJ1dGVzW2ldLm5hbWVcbiAgICAgIGVsLnJlbW92ZUF0dHJpYnV0ZShuYW1lKVxuICAgIH1cbiAgfVxuXG4gIC8qKlxuICAgKiBSZW1vdmUgYWxsIHRoZSBjaGlsZCBub2RlcyBmcm9tIGFuIGVsZW1lbnRcbiAgICpcbiAgICogQHBhcmFtIHtIVE1MRWxlbWVudH0gZWxcbiAgICovXG5cbiAgZnVuY3Rpb24gcmVtb3ZlQWxsQ2hpbGRyZW4gKGVsKSB7XG4gICAgd2hpbGUgKGVsLmZpcnN0Q2hpbGQpIGVsLnJlbW92ZUNoaWxkKGVsLmZpcnN0Q2hpbGQpXG4gIH1cblxuICAvKipcbiAgICogVHJpZ2dlciBhIGhvb2sgb24gYSBjb21wb25lbnQuXG4gICAqXG4gICAqIEBwYXJhbSB7U3RyaW5nfSBuYW1lIE5hbWUgb2YgaG9vay5cbiAgICogQHBhcmFtIHtFbnRpdHl9IGVudGl0eSBUaGUgY29tcG9uZW50IGluc3RhbmNlLlxuICAgKiBAcGFyYW0ge0FycmF5fSBhcmdzIFRvIHBhc3MgYWxvbmcgdG8gaG9vay5cbiAgICovXG5cbiAgZnVuY3Rpb24gdHJpZ2dlciAobmFtZSwgZW50aXR5LCBhcmdzKSB7XG4gICAgaWYgKHR5cGVvZiBlbnRpdHkuY29tcG9uZW50W25hbWVdICE9PSAnZnVuY3Rpb24nKSByZXR1cm5cbiAgICBlbnRpdHkuY29tcG9uZW50W25hbWVdLmFwcGx5KG51bGwsIGFyZ3MpXG4gIH1cblxuICAvKipcbiAgICogVXBkYXRlIGFuIGVudGl0eSB0byBtYXRjaCB0aGUgbGF0ZXN0IHJlbmRlcmVkIHZvZGUuIFdlIGFsd2F5c1xuICAgKiByZXBsYWNlIHRoZSBwcm9wcyBvbiB0aGUgY29tcG9uZW50IHdoZW4gY29tcG9zaW5nIHRoZW0uIFRoaXNcbiAgICogd2lsbCB0cmlnZ2VyIGEgcmUtcmVuZGVyIG9uIGFsbCBjaGlsZHJlbiBiZWxvdyB0aGlzIHBvaW50LlxuICAgKlxuICAgKiBAcGFyYW0ge0VudGl0eX0gZW50aXR5XG4gICAqIEBwYXJhbSB7U3RyaW5nfSBwYXRoXG4gICAqIEBwYXJhbSB7T2JqZWN0fSB2bm9kZVxuICAgKlxuICAgKiBAcmV0dXJuIHt2b2lkfVxuICAgKi9cblxuICBmdW5jdGlvbiB1cGRhdGVFbnRpdHlQcm9wcyAoZW50aXR5SWQsIG5leHRQcm9wcykge1xuICAgIHZhciBlbnRpdHkgPSBlbnRpdGllc1tlbnRpdHlJZF1cbiAgICBlbnRpdHkucGVuZGluZ1Byb3BzID0gbmV4dFByb3BzXG4gICAgZW50aXR5LmRpcnR5ID0gdHJ1ZVxuICAgIGludmFsaWRhdGUoKVxuICB9XG5cbiAgLyoqXG4gICAqIFVwZGF0ZSBjb21wb25lbnQgaW5zdGFuY2Ugc3RhdGUuXG4gICAqL1xuXG4gIGZ1bmN0aW9uIHVwZGF0ZUVudGl0eVN0YXRlIChlbnRpdHksIG5leHRTdGF0ZSkge1xuICAgIGVudGl0eS5wZW5kaW5nU3RhdGUgPSBhc3NpZ24oZW50aXR5LnBlbmRpbmdTdGF0ZSwgbmV4dFN0YXRlKVxuICAgIGVudGl0eS5kaXJ0eSA9IHRydWVcbiAgICBpbnZhbGlkYXRlKClcbiAgfVxuXG4gIC8qKlxuICAgKiBDb21taXQgcHJvcHMgYW5kIHN0YXRlIGNoYW5nZXMgdG8gYW4gZW50aXR5LlxuICAgKi9cblxuICBmdW5jdGlvbiBjb21taXQgKGVudGl0eSkge1xuICAgIGVudGl0eS5jb250ZXh0LnN0YXRlID0gZW50aXR5LnBlbmRpbmdTdGF0ZVxuICAgIGVudGl0eS5jb250ZXh0LnByb3BzID0gZW50aXR5LnBlbmRpbmdQcm9wc1xuICAgIGVudGl0eS5wZW5kaW5nU3RhdGUgPSBhc3NpZ24oe30sIGVudGl0eS5jb250ZXh0LnN0YXRlKVxuICAgIGVudGl0eS5wZW5kaW5nUHJvcHMgPSBhc3NpZ24oe30sIGVudGl0eS5jb250ZXh0LnByb3BzKVxuICAgIHZhbGlkYXRlUHJvcHMoZW50aXR5LmNvbnRleHQucHJvcHMsIGVudGl0eS5wcm9wVHlwZXMpXG4gICAgZW50aXR5LmRpcnR5ID0gZmFsc2VcbiAgfVxuXG4gIC8qKlxuICAgKiBUcnkgdG8gYXZvaWQgY3JlYXRpbmcgbmV3IHZpcnR1YWwgZG9tIGlmIHBvc3NpYmxlLlxuICAgKlxuICAgKiBMYXRlciB3ZSBtYXkgZXhwb3NlIHRoaXMgc28geW91IGNhbiBvdmVycmlkZSwgYnV0IG5vdCB0aGVyZSB5ZXQuXG4gICAqL1xuXG4gIGZ1bmN0aW9uIHNob3VsZFVwZGF0ZSAoZW50aXR5KSB7XG4gICAgaWYgKCFlbnRpdHkuZGlydHkpIHJldHVybiBmYWxzZVxuICAgIGlmICghZW50aXR5LmNvbXBvbmVudC5zaG91bGRVcGRhdGUpIHJldHVybiB0cnVlXG4gICAgdmFyIG5leHRQcm9wcyA9IGVudGl0eS5wZW5kaW5nUHJvcHNcbiAgICB2YXIgbmV4dFN0YXRlID0gZW50aXR5LnBlbmRpbmdTdGF0ZVxuICAgIHZhciBib29sID0gZW50aXR5LmNvbXBvbmVudC5zaG91bGRVcGRhdGUoZW50aXR5LmNvbnRleHQsIG5leHRQcm9wcywgbmV4dFN0YXRlKVxuICAgIHJldHVybiBib29sXG4gIH1cblxuICAvKipcbiAgICogUmVnaXN0ZXIgYW4gZW50aXR5LlxuICAgKlxuICAgKiBUaGlzIGlzIG1vc3RseSB0byBwcmUtcHJlcHJvY2VzcyBjb21wb25lbnQgcHJvcGVydGllcyBhbmQgdmFsdWVzIGNoYWlucy5cbiAgICpcbiAgICogVGhlIGVuZCByZXN1bHQgaXMgZm9yIGV2ZXJ5IGNvbXBvbmVudCB0aGF0IGdldHMgbW91bnRlZCxcbiAgICogeW91IGNyZWF0ZSBhIHNldCBvZiBJTyBub2RlcyBpbiB0aGUgbmV0d29yayBmcm9tIHRoZSBgdmFsdWVgIGRlZmluaXRpb25zLlxuICAgKlxuICAgKiBAcGFyYW0ge0NvbXBvbmVudH0gY29tcG9uZW50XG4gICAqL1xuXG4gIGZ1bmN0aW9uIHJlZ2lzdGVyIChlbnRpdHkpIHtcbiAgICB2YXIgY29tcG9uZW50ID0gZW50aXR5LmNvbXBvbmVudFxuICAgIC8vIGFsbCBlbnRpdGllcyBmb3IgdGhpcyBjb21wb25lbnQgdHlwZS5cbiAgICB2YXIgZW50aXRpZXMgPSBjb21wb25lbnQuZW50aXRpZXMgPSBjb21wb25lbnQuZW50aXRpZXMgfHwge31cbiAgICAvLyBhZGQgZW50aXR5IHRvIGNvbXBvbmVudCBsaXN0XG4gICAgZW50aXRpZXNbZW50aXR5LmlkXSA9IGVudGl0eVxuXG4gICAgLy8gZ2V0ICdjbGFzcy1sZXZlbCcgc291cmNlcy5cbiAgICB2YXIgc291cmNlcyA9IGNvbXBvbmVudC5zb3VyY2VzXG4gICAgaWYgKHNvdXJjZXMpIHJldHVyblxuXG4gICAgdmFyIG1hcCA9IGNvbXBvbmVudC5zb3VyY2VUb1Byb3BlcnR5TmFtZSA9IHt9XG4gICAgY29tcG9uZW50LnNvdXJjZXMgPSBzb3VyY2VzID0gW11cbiAgICB2YXIgcHJvcFR5cGVzID0gY29tcG9uZW50LnByb3BUeXBlc1xuICAgIGZvciAodmFyIG5hbWUgaW4gcHJvcFR5cGVzKSB7XG4gICAgICB2YXIgZGF0YSA9IHByb3BUeXBlc1tuYW1lXVxuICAgICAgaWYgKCFkYXRhKSBjb250aW51ZVxuICAgICAgaWYgKCFkYXRhLnNvdXJjZSkgY29udGludWVcbiAgICAgIHNvdXJjZXMucHVzaChkYXRhLnNvdXJjZSlcbiAgICAgIG1hcFtkYXRhLnNvdXJjZV0gPSBuYW1lXG4gICAgfVxuXG4gICAgLy8gc2VuZCB2YWx1ZSB1cGRhdGVzIHRvIGFsbCBjb21wb25lbnQgaW5zdGFuY2VzLlxuICAgIHNvdXJjZXMuZm9yRWFjaChmdW5jdGlvbiAoc291cmNlKSB7XG4gICAgICBjb25uZWN0aW9uc1tzb3VyY2VdID0gdXBkYXRlXG5cbiAgICAgIGZ1bmN0aW9uIHVwZGF0ZSAoZGF0YSkge1xuICAgICAgICB2YXIgcHJvcCA9IG1hcFtzb3VyY2VdXG4gICAgICAgIGZvciAodmFyIGVudGl0eUlkIGluIGVudGl0aWVzKSB7XG4gICAgICAgICAgdmFyIGVudGl0eSA9IGVudGl0aWVzW2VudGl0eUlkXVxuICAgICAgICAgIHZhciBjaGFuZ2VzID0ge31cbiAgICAgICAgICBjaGFuZ2VzW3Byb3BdID0gZGF0YVxuICAgICAgICAgIHVwZGF0ZUVudGl0eVByb3BzKGVudGl0eUlkLCBhc3NpZ24oZW50aXR5LnBlbmRpbmdQcm9wcywgY2hhbmdlcykpXG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9KVxuICB9XG5cbiAgLyoqXG4gICAqIFNldCB0aGUgaW5pdGlhbCBzb3VyY2UgdmFsdWUgb24gdGhlIGVudGl0eVxuICAgKlxuICAgKiBAcGFyYW0ge0VudGl0eX0gZW50aXR5XG4gICAqL1xuXG4gIGZ1bmN0aW9uIHNldERlZmF1bHRzIChlbnRpdHkpIHtcbiAgICB2YXIgY29tcG9uZW50ID0gZW50aXR5LmNvbXBvbmVudFxuICAgIHZhciBtYXAgPSBjb21wb25lbnQuc291cmNlVG9Qcm9wZXJ0eU5hbWVcbiAgICB2YXIgc291cmNlcyA9IGNvbXBvbmVudC5zb3VyY2VzXG4gICAgc291cmNlcy5mb3JFYWNoKGZ1bmN0aW9uIChzb3VyY2UpIHtcbiAgICAgIHZhciBuYW1lID0gbWFwW3NvdXJjZV1cbiAgICAgIGlmIChlbnRpdHkucGVuZGluZ1Byb3BzW25hbWVdICE9IG51bGwpIHJldHVyblxuICAgICAgZW50aXR5LnBlbmRpbmdQcm9wc1tuYW1lXSA9IGFwcC5zb3VyY2VzW3NvdXJjZV0gLy8gZ2V0IGxhdGVzdCB2YWx1ZSBwbHVnZ2VkIGludG8gZ2xvYmFsIHN0b3JlXG4gICAgfSlcbiAgfVxuXG4gIC8qKlxuICAgKiBBZGQgYWxsIG9mIHRoZSBET00gZXZlbnQgbGlzdGVuZXJzXG4gICAqL1xuXG4gIGZ1bmN0aW9uIGFkZE5hdGl2ZUV2ZW50TGlzdGVuZXJzICgpIHtcbiAgICBmb3JFYWNoKGV2ZW50cywgZnVuY3Rpb24gKGV2ZW50VHlwZSkge1xuICAgICAgZG9jdW1lbnQuYm9keS5hZGRFdmVudExpc3RlbmVyKGV2ZW50VHlwZSwgaGFuZGxlRXZlbnQsIHRydWUpXG4gICAgfSlcbiAgfVxuXG4gIC8qKlxuICAgKiBBZGQgYWxsIG9mIHRoZSBET00gZXZlbnQgbGlzdGVuZXJzXG4gICAqL1xuXG4gIGZ1bmN0aW9uIHJlbW92ZU5hdGl2ZUV2ZW50TGlzdGVuZXJzICgpIHtcbiAgICBmb3JFYWNoKGV2ZW50cywgZnVuY3Rpb24gKGV2ZW50VHlwZSkge1xuICAgICAgZG9jdW1lbnQuYm9keS5yZW1vdmVFdmVudExpc3RlbmVyKGV2ZW50VHlwZSwgaGFuZGxlRXZlbnQsIHRydWUpXG4gICAgfSlcbiAgfVxuXG4gIC8qKlxuICAgKiBIYW5kbGUgYW4gZXZlbnQgdGhhdCBoYXMgb2NjdXJlZCB3aXRoaW4gdGhlIGNvbnRhaW5lclxuICAgKlxuICAgKiBAcGFyYW0ge0V2ZW50fSBldmVudFxuICAgKi9cblxuICBmdW5jdGlvbiBoYW5kbGVFdmVudCAoZXZlbnQpIHtcbiAgICB2YXIgdGFyZ2V0ID0gZXZlbnQudGFyZ2V0XG4gICAgdmFyIGVudGl0eUlkID0gdGFyZ2V0Ll9fZW50aXR5X19cbiAgICB2YXIgZXZlbnRUeXBlID0gZXZlbnQudHlwZVxuXG4gICAgLy8gV2FsayB1cCB0aGUgRE9NIHRyZWUgYW5kIHNlZSBpZiB0aGVyZSBpcyBhIGhhbmRsZXJcbiAgICAvLyBmb3IgdGhpcyBldmVudCB0eXBlIGhpZ2hlciB1cC5cbiAgICB3aGlsZSAodGFyZ2V0ICYmIHRhcmdldC5fX2VudGl0eV9fID09PSBlbnRpdHlJZCkge1xuICAgICAgdmFyIGZuID0ga2V5cGF0aC5nZXQoaGFuZGxlcnMsIFtlbnRpdHlJZCwgdGFyZ2V0Ll9fcGF0aF9fLCBldmVudFR5cGVdKVxuICAgICAgaWYgKGZuKSB7XG4gICAgICAgIGV2ZW50LmRlbGVnYXRlVGFyZ2V0ID0gdGFyZ2V0XG4gICAgICAgIGZuKGV2ZW50KVxuICAgICAgICBicmVha1xuICAgICAgfVxuICAgICAgdGFyZ2V0ID0gdGFyZ2V0LnBhcmVudE5vZGVcbiAgICB9XG4gIH1cblxuICAvKipcbiAgICogQmluZCBldmVudHMgZm9yIGFuIGVsZW1lbnQsIGFuZCBhbGwgaXQncyByZW5kZXJlZCBjaGlsZCBlbGVtZW50cy5cbiAgICpcbiAgICogQHBhcmFtIHtTdHJpbmd9IHBhdGhcbiAgICogQHBhcmFtIHtTdHJpbmd9IGV2ZW50XG4gICAqIEBwYXJhbSB7RnVuY3Rpb259IGZuXG4gICAqL1xuXG4gIGZ1bmN0aW9uIGFkZEV2ZW50IChlbnRpdHlJZCwgcGF0aCwgZXZlbnRUeXBlLCBmbikge1xuICAgIGtleXBhdGguc2V0KGhhbmRsZXJzLCBbZW50aXR5SWQsIHBhdGgsIGV2ZW50VHlwZV0sIHRocm90dGxlKGZ1bmN0aW9uIChlKSB7XG4gICAgICB2YXIgZW50aXR5ID0gZW50aXRpZXNbZW50aXR5SWRdXG4gICAgICBpZiAoZW50aXR5KSB7XG4gICAgICAgIGZuLmNhbGwobnVsbCwgZSwgZW50aXR5LmNvbnRleHQsIHNldFN0YXRlKGVudGl0eSkpXG4gICAgICB9IGVsc2Uge1xuICAgICAgICBmbi5jYWxsKG51bGwsIGUpXG4gICAgICB9XG4gICAgfSkpXG4gIH1cblxuICAvKipcbiAgICogVW5iaW5kIGV2ZW50cyBmb3IgYSBlbnRpdHlJZFxuICAgKlxuICAgKiBAcGFyYW0ge1N0cmluZ30gZW50aXR5SWRcbiAgICovXG5cbiAgZnVuY3Rpb24gcmVtb3ZlRXZlbnQgKGVudGl0eUlkLCBwYXRoLCBldmVudFR5cGUpIHtcbiAgICBrZXlwYXRoLmRlbChoYW5kbGVycywgW2VudGl0eUlkLCBwYXRoLCBldmVudFR5cGVdKVxuICB9XG5cbiAgLyoqXG4gICAqIFVuYmluZCBhbGwgZXZlbnRzIGZyb20gYW4gZW50aXR5XG4gICAqXG4gICAqIEBwYXJhbSB7RW50aXR5fSBlbnRpdHlcbiAgICovXG5cbiAgZnVuY3Rpb24gcmVtb3ZlQWxsRXZlbnRzIChlbnRpdHlJZCkge1xuICAgIGtleXBhdGguZGVsKGhhbmRsZXJzLCBbZW50aXR5SWRdKVxuICB9XG5cbiAgLyoqXG4gICAqIFZhbGlkYXRlIHRoZSBjdXJyZW50IHByb3BlcnRpZXMuIFRoZXNlIHNpbXBsZSB2YWxpZGF0aW9uc1xuICAgKiBtYWtlIGl0IGVhc2llciB0byBlbnN1cmUgdGhlIGNvcnJlY3QgcHJvcHMgYXJlIHBhc3NlZCBpbi5cbiAgICpcbiAgICogQXZhaWxhYmxlIHJ1bGVzIGluY2x1ZGU6XG4gICAqXG4gICAqIHR5cGU6IHN0cmluZyB8IGFycmF5IHwgb2JqZWN0IHwgYm9vbGVhbiB8IG51bWJlciB8IGRhdGUgfCBmdW5jdGlvblxuICAgKiBleHBlY3RzOiBbXSBBbiBhcnJheSBvZiB2YWx1ZXMgdGhpcyBwcm9wIGNvdWxkIGVxdWFsXG4gICAqIG9wdGlvbmFsOiBCb29sZWFuXG4gICAqL1xuXG4gIGZ1bmN0aW9uIHZhbGlkYXRlUHJvcHMgKHByb3BzLCBydWxlcykge1xuICAgIGlmICghb3B0aW9ucy52YWxpZGF0ZVByb3BzKSByZXR1cm5cblxuICAgIC8vIFRPRE86IE9ubHkgdmFsaWRhdGUgaW4gZGV2IG1vZGVcbiAgICBmb3JFYWNoKHJ1bGVzLCBmdW5jdGlvbiAob3B0aW9ucywgbmFtZSkge1xuICAgICAgaWYgKG5hbWUgPT09ICdjaGlsZHJlbicpIHJldHVyblxuICAgICAgdmFyIHZhbHVlID0gcHJvcHNbbmFtZV1cbiAgICAgIHZhciBvcHRpb25hbCA9IChvcHRpb25zLm9wdGlvbmFsID09PSB0cnVlKVxuICAgICAgaWYgKG9wdGlvbmFsICYmIHZhbHVlID09IG51bGwpIHtcbiAgICAgICAgcmV0dXJuXG4gICAgICB9XG4gICAgICBpZiAoIW9wdGlvbmFsICYmIHZhbHVlID09IG51bGwpIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdNaXNzaW5nIHByb3AgbmFtZWQ6ICcgKyBuYW1lKVxuICAgICAgfVxuICAgICAgaWYgKG9wdGlvbnMudHlwZSAmJiB0eXBlKHZhbHVlKSAhPT0gb3B0aW9ucy50eXBlKSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcignSW52YWxpZCB0eXBlIGZvciBwcm9wIG5hbWVkOiAnICsgbmFtZSlcbiAgICAgIH1cbiAgICAgIGlmIChvcHRpb25zLmV4cGVjdHMgJiYgb3B0aW9ucy5leHBlY3RzLmluZGV4T2YodmFsdWUpIDwgMCkge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ0ludmFsaWQgdmFsdWUgZm9yIHByb3AgbmFtZWQ6ICcgKyBuYW1lICsgJy4gTXVzdCBiZSBvbmUgb2YgJyArIG9wdGlvbnMuZXhwZWN0cy50b1N0cmluZygpKVxuICAgICAgfVxuICAgIH0pXG5cbiAgICAvLyBOb3cgY2hlY2sgZm9yIHByb3BzIHRoYXQgaGF2ZW4ndCBiZWVuIGRlZmluZWRcbiAgICBmb3JFYWNoKHByb3BzLCBmdW5jdGlvbiAodmFsdWUsIGtleSkge1xuICAgICAgaWYgKGtleSA9PT0gJ2NoaWxkcmVuJykgcmV0dXJuXG4gICAgICBpZiAoIXJ1bGVzW2tleV0pIHRocm93IG5ldyBFcnJvcignVW5leHBlY3RlZCBwcm9wIG5hbWVkOiAnICsga2V5KVxuICAgIH0pXG4gIH1cblxuICAvKipcbiAgICogVXNlZCBmb3IgZGVidWdnaW5nIHRvIGluc3BlY3QgdGhlIGN1cnJlbnQgc3RhdGUgd2l0aG91dFxuICAgKiB1cyBuZWVkaW5nIHRvIGV4cGxpY2l0bHkgbWFuYWdlIHN0b3JpbmcvdXBkYXRpbmcgcmVmZXJlbmNlcy5cbiAgICpcbiAgICogQHJldHVybiB7T2JqZWN0fVxuICAgKi9cblxuICBmdW5jdGlvbiBpbnNwZWN0ICgpIHtcbiAgICByZXR1cm4ge1xuICAgICAgZW50aXRpZXM6IGVudGl0aWVzLFxuICAgICAgcG9vbHM6IHBvb2xzLFxuICAgICAgaGFuZGxlcnM6IGhhbmRsZXJzLFxuICAgICAgY29ubmVjdGlvbnM6IGNvbm5lY3Rpb25zLFxuICAgICAgY3VycmVudEVsZW1lbnQ6IGN1cnJlbnRFbGVtZW50LFxuICAgICAgb3B0aW9uczogb3B0aW9ucyxcbiAgICAgIGFwcDogYXBwLFxuICAgICAgY29udGFpbmVyOiBjb250YWluZXIsXG4gICAgICBjaGlsZHJlbjogY2hpbGRyZW5cbiAgICB9XG4gIH1cblxuICAvKipcbiAgICogUmV0dXJuIGFuIG9iamVjdCB0aGF0IGxldHMgdXMgY29tcGxldGVseSByZW1vdmUgdGhlIGF1dG9tYXRpY1xuICAgKiBET00gcmVuZGVyaW5nIGFuZCBleHBvcnQgZGVidWdnaW5nIHRvb2xzLlxuICAgKi9cblxuICByZXR1cm4ge1xuICAgIHJlbW92ZTogdGVhcmRvd24sXG4gICAgaW5zcGVjdDogaW5zcGVjdFxuICB9XG59XG5cbi8qKlxuICogQSByZW5kZXJlZCBjb21wb25lbnQgaW5zdGFuY2UuXG4gKlxuICogVGhpcyBtYW5hZ2VzIHRoZSBsaWZlY3ljbGUsIHByb3BzIGFuZCBzdGF0ZSBvZiB0aGUgY29tcG9uZW50LlxuICogSXQncyBiYXNpY2FsbHkganVzdCBhIGRhdGEgb2JqZWN0IGZvciBtb3JlIHN0cmFpZ2h0Zm93YXJkIGxvb2t1cC5cbiAqXG4gKiBAcGFyYW0ge0NvbXBvbmVudH0gY29tcG9uZW50XG4gKiBAcGFyYW0ge09iamVjdH0gcHJvcHNcbiAqL1xuXG5mdW5jdGlvbiBFbnRpdHkgKGNvbXBvbmVudCwgcHJvcHMpIHtcbiAgdGhpcy5pZCA9IHVpZCgpXG4gIHRoaXMuY29tcG9uZW50ID0gY29tcG9uZW50XG4gIHRoaXMucHJvcFR5cGVzID0gY29tcG9uZW50LnByb3BUeXBlcyB8fCB7fVxuICB0aGlzLmNvbnRleHQgPSB7fVxuICB0aGlzLmNvbnRleHQuaWQgPSB0aGlzLmlkO1xuICB0aGlzLmNvbnRleHQucHJvcHMgPSBkZWZhdWx0cyhwcm9wcyB8fCB7fSwgY29tcG9uZW50LmRlZmF1bHRQcm9wcyB8fCB7fSlcbiAgdGhpcy5jb250ZXh0LnN0YXRlID0gdGhpcy5jb21wb25lbnQuaW5pdGlhbFN0YXRlID8gdGhpcy5jb21wb25lbnQuaW5pdGlhbFN0YXRlKCkgOiB7fVxuICB0aGlzLnBlbmRpbmdQcm9wcyA9IGFzc2lnbih7fSwgdGhpcy5jb250ZXh0LnByb3BzKVxuICB0aGlzLnBlbmRpbmdTdGF0ZSA9IGFzc2lnbih7fSwgdGhpcy5jb250ZXh0LnN0YXRlKVxuICB0aGlzLmRpcnR5ID0gZmFsc2VcbiAgdGhpcy52aXJ0dWFsRWxlbWVudCA9IG51bGxcbiAgdGhpcy5uYXRpdmVFbGVtZW50ID0gbnVsbFxuICB0aGlzLmRpc3BsYXlOYW1lID0gY29tcG9uZW50Lm5hbWUgfHwgJ0NvbXBvbmVudCdcbn1cblxuLyoqXG4gKiBTaG91bGQgd2UgcG9vbCBhbiBlbGVtZW50P1xuICovXG5cbmZ1bmN0aW9uIGNhblBvb2wodGFnTmFtZSkge1xuICByZXR1cm4gYXZvaWRQb29saW5nLmluZGV4T2YodGFnTmFtZSkgPCAwXG59XG5cbi8qKlxuICogR2V0IGEgbmVzdGVkIG5vZGUgdXNpbmcgYSBwYXRoXG4gKlxuICogQHBhcmFtIHtIVE1MRWxlbWVudH0gZWwgICBUaGUgcm9vdCBub2RlICcwJ1xuICogQHBhcmFtIHtTdHJpbmd9IHBhdGggVGhlIHBhdGggc3RyaW5nIGVnLiAnMC4yLjQzJ1xuICovXG5cbmZ1bmN0aW9uIGdldE5vZGVBdFBhdGgoZWwsIHBhdGgpIHtcbiAgdmFyIHBhcnRzID0gcGF0aC5zcGxpdCgnLicpXG4gIHBhcnRzLnNoaWZ0KClcbiAgd2hpbGUgKHBhcnRzLmxlbmd0aCkge1xuICAgIGVsID0gZWwuY2hpbGROb2Rlc1twYXJ0cy5wb3AoKV1cbiAgfVxuICByZXR1cm4gZWxcbn0iLCJ2YXIgdXRpbHMgPSByZXF1aXJlKCcuL3V0aWxzJylcbnZhciBkZWZhdWx0cyA9IHV0aWxzLmRlZmF1bHRzXG5cbi8qKlxuICogRXhwb3NlIGBzdHJpbmdpZnlgLlxuICovXG5cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gKGFwcCkge1xuICBpZiAoIWFwcC5lbGVtZW50KSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKCdObyBlbGVtZW50IG1vdW50ZWQnKVxuICB9XG5cbiAgLyoqXG4gICAqIFJlbmRlciB0byBzdHJpbmcuXG4gICAqXG4gICAqIEBwYXJhbSB7Q29tcG9uZW50fSBjb21wb25lbnRcbiAgICogQHBhcmFtIHtPYmplY3R9IFtwcm9wc11cbiAgICogQHJldHVybiB7U3RyaW5nfVxuICAgKi9cblxuICBmdW5jdGlvbiBzdHJpbmdpZnkgKGNvbXBvbmVudCwgb3B0UHJvcHMpIHtcbiAgICB2YXIgcHJvcFR5cGVzID0gY29tcG9uZW50LnByb3BUeXBlcyB8fCB7fVxuICAgIHZhciBzdGF0ZSA9IGNvbXBvbmVudC5pbml0aWFsU3RhdGUgPyBjb21wb25lbnQuaW5pdGlhbFN0YXRlKCkgOiB7fVxuICAgIHZhciBwcm9wcyA9IGRlZmF1bHRzKG9wdFByb3BzLCBjb21wb25lbnQuZGVmYXVsdFByb3BzIHx8IHt9KVxuXG4gICAgZm9yICh2YXIgbmFtZSBpbiBwcm9wVHlwZXMpIHtcbiAgICAgIHZhciBvcHRpb25zID0gcHJvcFR5cGVzW25hbWVdXG4gICAgICBpZiAob3B0aW9ucy5zb3VyY2UpIHtcbiAgICAgICAgcHJvcHNbbmFtZV0gPSBhcHAuc291cmNlc1tvcHRpb25zLnNvdXJjZV1cbiAgICAgIH1cbiAgICB9XG5cbiAgICBpZiAoY29tcG9uZW50LmJlZm9yZU1vdW50KSBjb21wb25lbnQuYmVmb3JlTW91bnQoeyBwcm9wczogcHJvcHMsIHN0YXRlOiBzdGF0ZSB9KVxuICAgIGlmIChjb21wb25lbnQuYmVmb3JlUmVuZGVyKSBjb21wb25lbnQuYmVmb3JlUmVuZGVyKHsgcHJvcHM6IHByb3BzLCBzdGF0ZTogc3RhdGUgfSlcbiAgICB2YXIgbm9kZSA9IGNvbXBvbmVudC5yZW5kZXIoeyBwcm9wczogcHJvcHMsIHN0YXRlOiBzdGF0ZSB9KVxuICAgIHJldHVybiBzdHJpbmdpZnlOb2RlKG5vZGUsICcwJylcbiAgfVxuXG4gIC8qKlxuICAgKiBSZW5kZXIgYSBub2RlIHRvIGEgc3RyaW5nXG4gICAqXG4gICAqIEBwYXJhbSB7Tm9kZX0gbm9kZVxuICAgKiBAcGFyYW0ge1RyZWV9IHRyZWVcbiAgICpcbiAgICogQHJldHVybiB7U3RyaW5nfVxuICAgKi9cblxuICBmdW5jdGlvbiBzdHJpbmdpZnlOb2RlIChub2RlLCBwYXRoKSB7XG4gICAgc3dpdGNoIChub2RlLnR5cGUpIHtcbiAgICAgIGNhc2UgJ3RleHQnOiByZXR1cm4gbm9kZS5kYXRhXG4gICAgICBjYXNlICdlbGVtZW50JzpcbiAgICAgICAgdmFyIGNoaWxkcmVuID0gbm9kZS5jaGlsZHJlblxuICAgICAgICB2YXIgYXR0cmlidXRlcyA9IG5vZGUuYXR0cmlidXRlc1xuICAgICAgICB2YXIgdGFnTmFtZSA9IG5vZGUudGFnTmFtZVxuICAgICAgICB2YXIgaW5uZXJIVE1MID0gYXR0cmlidXRlcy5pbm5lckhUTUxcbiAgICAgICAgdmFyIHN0ciA9ICc8JyArIHRhZ05hbWUgKyBhdHRycyhhdHRyaWJ1dGVzKSArICc+J1xuXG4gICAgICAgIGlmIChpbm5lckhUTUwpIHtcbiAgICAgICAgICBzdHIgKz0gaW5uZXJIVE1MXG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgZm9yICh2YXIgaSA9IDAsIG4gPSBjaGlsZHJlbi5sZW5ndGg7IGkgPCBuOyBpKyspIHtcbiAgICAgICAgICAgIHN0ciArPSBzdHJpbmdpZnlOb2RlKGNoaWxkcmVuW2ldLCBwYXRoICsgJy4nICsgaSlcbiAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICBzdHIgKz0gJzwvJyArIHRhZ05hbWUgKyAnPidcbiAgICAgICAgcmV0dXJuIHN0clxuICAgICAgY2FzZSAnY29tcG9uZW50JzogcmV0dXJuIHN0cmluZ2lmeShub2RlLmNvbXBvbmVudCwgbm9kZS5wcm9wcylcbiAgICB9XG5cbiAgICB0aHJvdyBuZXcgRXJyb3IoJ0ludmFsaWQgdHlwZScpXG4gIH1cblxuICByZXR1cm4gc3RyaW5naWZ5Tm9kZShhcHAuZWxlbWVudCwgJzAnKVxufVxuXG4vKipcbiAqIEhUTUwgYXR0cmlidXRlcyB0byBzdHJpbmcuXG4gKlxuICogQHBhcmFtIHtPYmplY3R9IGF0dHJpYnV0ZXNcbiAqIEByZXR1cm4ge1N0cmluZ31cbiAqIEBhcGkgcHJpdmF0ZVxuICovXG5cbmZ1bmN0aW9uIGF0dHJzIChhdHRyaWJ1dGVzKSB7XG4gIHZhciBzdHIgPSAnJ1xuICBmb3IgKHZhciBrZXkgaW4gYXR0cmlidXRlcykge1xuICAgIGlmIChrZXkgPT09ICdpbm5lckhUTUwnKSBjb250aW51ZVxuICAgIHN0ciArPSBhdHRyKGtleSwgYXR0cmlidXRlc1trZXldKVxuICB9XG4gIHJldHVybiBzdHJcbn1cblxuLyoqXG4gKiBIVE1MIGF0dHJpYnV0ZSB0byBzdHJpbmcuXG4gKlxuICogQHBhcmFtIHtTdHJpbmd9IGtleVxuICogQHBhcmFtIHtTdHJpbmd9IHZhbFxuICogQHJldHVybiB7U3RyaW5nfVxuICogQGFwaSBwcml2YXRlXG4gKi9cblxuZnVuY3Rpb24gYXR0ciAoa2V5LCB2YWwpIHtcbiAgcmV0dXJuICcgJyArIGtleSArICc9XCInICsgdmFsICsgJ1wiJ1xufVxuIiwidmFyIGZhc3QgPSByZXF1aXJlKCdmYXN0LmpzJylcbnZhciBpbmRleE9mID0gZmFzdC5pbmRleE9mXG5cbi8qKlxuICogVGhpcyBmaWxlIGxpc3RzIHRoZSBzdXBwb3J0ZWQgU1ZHIGVsZW1lbnRzIHVzZWQgYnkgdGhlXG4gKiByZW5kZXJlci4gV2UgbWF5IGFkZCBiZXR0ZXIgU1ZHIHN1cHBvcnQgaW4gdGhlIGZ1dHVyZVxuICogdGhhdCBkb2Vzbid0IHJlcXVpcmUgd2hpdGVsaXN0aW5nIGVsZW1lbnRzLlxuICovXG5cbmV4cG9ydHMubmFtZXNwYWNlICA9ICdodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZydcblxuLyoqXG4gKiBTdXBwb3J0ZWQgU1ZHIGVsZW1lbnRzXG4gKlxuICogQHR5cGUge0FycmF5fVxuICovXG5cbmV4cG9ydHMuZWxlbWVudHMgPSBbXG4gICdjaXJjbGUnLFxuICAnZGVmcycsXG4gICdlbGxpcHNlJyxcbiAgJ2cnLFxuICAnbGluZScsXG4gICdsaW5lYXJHcmFkaWVudCcsXG4gICdtYXNrJyxcbiAgJ3BhdGgnLFxuICAncGF0dGVybicsXG4gICdwb2x5Z29uJyxcbiAgJ3BvbHlsaW5lJyxcbiAgJ3JhZGlhbEdyYWRpZW50JyxcbiAgJ3JlY3QnLFxuICAnc3RvcCcsXG4gICdzdmcnLFxuICAndGV4dCcsXG4gICd0c3Bhbidcbl1cblxuLyoqXG4gKiBTdXBwb3J0ZWQgU1ZHIGF0dHJpYnV0ZXNcbiAqL1xuXG5leHBvcnRzLmF0dHJpYnV0ZXMgPSBbXG4gICdjeCcsXG4gICdjeScsXG4gICdkJyxcbiAgJ2R4JyxcbiAgJ2R5JyxcbiAgJ2ZpbGwnLFxuICAnZmlsbE9wYWNpdHknLFxuICAnZm9udEZhbWlseScsXG4gICdmb250U2l6ZScsXG4gICdmeCcsXG4gICdmeScsXG4gICdncmFkaWVudFRyYW5zZm9ybScsXG4gICdncmFkaWVudFVuaXRzJyxcbiAgJ21hcmtlckVuZCcsXG4gICdtYXJrZXJNaWQnLFxuICAnbWFya2VyU3RhcnQnLFxuICAnb2Zmc2V0JyxcbiAgJ29wYWNpdHknLFxuICAncGF0dGVybkNvbnRlbnRVbml0cycsXG4gICdwYXR0ZXJuVW5pdHMnLFxuICAncG9pbnRzJyxcbiAgJ3ByZXNlcnZlQXNwZWN0UmF0aW8nLFxuICAncicsXG4gICdyeCcsXG4gICdyeScsXG4gICdzcHJlYWRNZXRob2QnLFxuICAnc3RvcENvbG9yJyxcbiAgJ3N0b3BPcGFjaXR5JyxcbiAgJ3N0cm9rZScsXG4gICdzdHJva2VEYXNoYXJyYXknLFxuICAnc3Ryb2tlTGluZWNhcCcsXG4gICdzdHJva2VPcGFjaXR5JyxcbiAgJ3N0cm9rZVdpZHRoJyxcbiAgJ3RleHRBbmNob3InLFxuICAndHJhbnNmb3JtJyxcbiAgJ3ZlcnNpb24nLFxuICAndmlld0JveCcsXG4gICd4MScsXG4gICd4MicsXG4gICd4JyxcbiAgJ3kxJyxcbiAgJ3kyJyxcbiAgJ3knXG5dXG5cbi8qKlxuICogSXMgZWxlbWVudCdzIG5hbWVzcGFjZSBTVkc/XG4gKlxuICogQHBhcmFtIHtTdHJpbmd9IG5hbWVcbiAqL1xuXG5leHBvcnRzLmlzRWxlbWVudCA9IGZ1bmN0aW9uIChuYW1lKSB7XG4gIHJldHVybiBpbmRleE9mKGV4cG9ydHMuZWxlbWVudHMsIG5hbWUpICE9PSAtMVxufVxuXG4vKipcbiAqIEFyZSBlbGVtZW50J3MgYXR0cmlidXRlcyBTVkc/XG4gKlxuICogQHBhcmFtIHtTdHJpbmd9IGF0dHJcbiAqL1xuXG5leHBvcnRzLmlzQXR0cmlidXRlID0gZnVuY3Rpb24gKGF0dHIpIHtcbiAgcmV0dXJuIGluZGV4T2YoZXhwb3J0cy5hdHRyaWJ1dGVzLCBhdHRyKSAhPT0gLTFcbn1cblxuIiwiLyoqXG4gKiBUaGUgbnBtICdkZWZhdWx0cycgbW9kdWxlIGJ1dCB3aXRob3V0IGNsb25lIGJlY2F1c2VcbiAqIGl0IHdhcyByZXF1aXJpbmcgdGhlICdCdWZmZXInIG1vZHVsZSB3aGljaCBpcyBodWdlLlxuICpcbiAqIEBwYXJhbSB7T2JqZWN0fSBvcHRpb25zXG4gKiBAcGFyYW0ge09iamVjdH0gZGVmYXVsdHNcbiAqXG4gKiBAcmV0dXJuIHtPYmplY3R9XG4gKi9cblxuZXhwb3J0cy5kZWZhdWx0cyA9IGZ1bmN0aW9uKG9wdGlvbnMsIGRlZmF1bHRzKSB7XG4gIE9iamVjdC5rZXlzKGRlZmF1bHRzKS5mb3JFYWNoKGZ1bmN0aW9uKGtleSkge1xuICAgIGlmICh0eXBlb2Ygb3B0aW9uc1trZXldID09PSAndW5kZWZpbmVkJykge1xuICAgICAgb3B0aW9uc1trZXldID0gZGVmYXVsdHNba2V5XVxuICAgIH1cbiAgfSlcbiAgcmV0dXJuIG9wdGlvbnNcbn1cbiIsIi8qKlxuICogTW9kdWxlIGRlcGVuZGVuY2llcy5cbiAqL1xuXG52YXIgdHlwZSA9IHJlcXVpcmUoJ2NvbXBvbmVudC10eXBlJylcbnZhciBzbGljZSA9IHJlcXVpcmUoJ3NsaWNlZCcpXG52YXIgZmxhdHRlbiA9IHJlcXVpcmUoJ2FycmF5LWZsYXR0ZW4nKVxuXG4vKipcbiAqIFRoaXMgZnVuY3Rpb24gbGV0cyB1cyBjcmVhdGUgdmlydHVhbCBub2RlcyB1c2luZyBhIHNpbXBsZVxuICogc3ludGF4LiBJdCBpcyBjb21wYXRpYmxlIHdpdGggSlNYIHRyYW5zZm9ybXMgc28geW91IGNhbiB1c2VcbiAqIEpTWCB0byB3cml0ZSBub2RlcyB0aGF0IHdpbGwgY29tcGlsZSB0byB0aGlzIGZ1bmN0aW9uLlxuICpcbiAqIGxldCBub2RlID0gdmlydHVhbCgnZGl2JywgeyBpZDogJ2ZvbycgfSwgW1xuICogICB2aXJ0dWFsKCdhJywgeyBocmVmOiAnaHR0cDovL2dvb2dsZS5jb20nIH0sICdHb29nbGUnKVxuICogXSlcbiAqXG4gKiBZb3UgY2FuIGxlYXZlIG91dCB0aGUgYXR0cmlidXRlcyBvciB0aGUgY2hpbGRyZW4gaWYgZWl0aGVyXG4gKiBvZiB0aGVtIGFyZW4ndCBuZWVkZWQgYW5kIGl0IHdpbGwgZmlndXJlIG91dCB3aGF0IHlvdSdyZVxuICogdHJ5aW5nIHRvIGRvLlxuICovXG5cbm1vZHVsZS5leHBvcnRzID0gdmlydHVhbFxuXG4vKipcbiAqIENyZWF0ZSB2aXJ0dWFsIERPTSB0cmVlcy5cbiAqXG4gKiBUaGlzIGNyZWF0ZXMgdGhlIG5pY2VyIEFQSSBmb3IgdGhlIHVzZXIuXG4gKiBJdCB0cmFuc2xhdGVzIHRoYXQgZnJpZW5kbHkgQVBJIGludG8gYW4gYWN0dWFsIHRyZWUgb2Ygbm9kZXMuXG4gKlxuICogQHBhcmFtIHtTdHJpbmd8RnVuY3Rpb259IHR5cGVcbiAqIEBwYXJhbSB7T2JqZWN0fSBwcm9wc1xuICogQHBhcmFtIHtBcnJheX0gY2hpbGRyZW5cbiAqIEByZXR1cm4ge05vZGV9XG4gKiBAYXBpIHB1YmxpY1xuICovXG5cbmZ1bmN0aW9uIHZpcnR1YWwgKHR5cGUsIHByb3BzLCBjaGlsZHJlbikge1xuICAvLyBEZWZhdWx0IHRvIGRpdiB3aXRoIG5vIGFyZ3NcbiAgaWYgKCF0eXBlKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKCdFbGVtZW50IG5lZWRzIGEgdHlwZS4gaHR0cHM6Ly9naXN0LmdpdGh1Yi5jb20vYW50aG9ueXNob3J0Lzc3Y2VkNDNiNWRlZmUzOTkwOGFmJylcbiAgfVxuXG4gIC8vIFNraXBwZWQgYWRkaW5nIGF0dHJpYnV0ZXMgYW5kIHdlJ3JlIHBhc3NpbmdcbiAgLy8gaW4gY2hpbGRyZW4gaW5zdGVhZC5cbiAgaWYgKGFyZ3VtZW50cy5sZW5ndGggPT09IDIgJiYgKHR5cGVvZiBwcm9wcyA9PT0gJ3N0cmluZycgfHwgQXJyYXkuaXNBcnJheShwcm9wcykpKSB7XG4gICAgY2hpbGRyZW4gPSBwcm9wc1xuICAgIHByb3BzID0ge31cbiAgfVxuXG4gIC8vIEFjY291bnQgZm9yIEpTWCBwdXR0aW5nIHRoZSBjaGlsZHJlbiBhcyBtdWx0aXBsZSBhcmd1bWVudHMuXG4gIC8vIFRoaXMgaXMgZXNzZW50aWFsbHkganVzdCB0aGUgRVM2IHJlc3QgcGFyYW1cbiAgaWYgKGFyZ3VtZW50cy5sZW5ndGggPiAyICYmIEFycmF5LmlzQXJyYXkoYXJndW1lbnRzWzJdKSA9PT0gZmFsc2UpIHtcbiAgICBjaGlsZHJlbiA9IHNsaWNlKGFyZ3VtZW50cywgMilcbiAgfVxuXG4gIGNoaWxkcmVuID0gY2hpbGRyZW4gfHwgW11cbiAgcHJvcHMgPSBwcm9wcyB8fCB7fVxuXG4gIC8vIHBhc3NpbmcgaW4gYSBzaW5nbGUgY2hpbGQsIHlvdSBjYW4gc2tpcFxuICAvLyB1c2luZyB0aGUgYXJyYXlcbiAgaWYgKCFBcnJheS5pc0FycmF5KGNoaWxkcmVuKSkge1xuICAgIGNoaWxkcmVuID0gWyBjaGlsZHJlbiBdXG4gIH1cblxuICBjaGlsZHJlbiA9IGZsYXR0ZW4oY2hpbGRyZW4sIDEpLnJlZHVjZShub3JtYWxpemUsIFtdKVxuXG4gIC8vIHB1bGwgdGhlIGtleSBvdXQgZnJvbSB0aGUgZGF0YS5cbiAgdmFyIGtleSA9ICdrZXknIGluIHByb3BzID8gU3RyaW5nKHByb3BzLmtleSkgOiBudWxsXG4gIGRlbGV0ZSBwcm9wc1sna2V5J11cblxuICAvLyBpZiB5b3UgcGFzcyBpbiBhIGZ1bmN0aW9uLCBpdCdzIGEgYENvbXBvbmVudGAgY29uc3RydWN0b3IuXG4gIC8vIG90aGVyd2lzZSBpdCdzIGFuIGVsZW1lbnQuXG4gIHZhciBub2RlXG4gIGlmICh0eXBlb2YgdHlwZSA9PT0gJ3N0cmluZycpIHtcbiAgICBub2RlID0gbmV3IEVsZW1lbnROb2RlKHR5cGUsIHByb3BzLCBrZXksIGNoaWxkcmVuKVxuICB9IGVsc2Uge1xuICAgIG5vZGUgPSBuZXcgQ29tcG9uZW50Tm9kZSh0eXBlLCBwcm9wcywga2V5LCBjaGlsZHJlbilcbiAgfVxuXG4gIC8vIHNldCB0aGUgdW5pcXVlIElEXG4gIG5vZGUuaW5kZXggPSAwXG5cbiAgcmV0dXJuIG5vZGVcbn1cblxuLyoqXG4gKiBQYXJzZSBub2RlcyBpbnRvIHJlYWwgYE5vZGVgIG9iamVjdHMuXG4gKlxuICogQHBhcmFtIHtNaXhlZH0gbm9kZVxuICogQHBhcmFtIHtJbnRlZ2VyfSBpbmRleFxuICogQHJldHVybiB7Tm9kZX1cbiAqIEBhcGkgcHJpdmF0ZVxuICovXG5cbmZ1bmN0aW9uIG5vcm1hbGl6ZSAoYWNjLCBub2RlKSB7XG4gIGlmIChub2RlID09IG51bGwpIHtcbiAgICByZXR1cm4gYWNjXG4gIH1cbiAgaWYgKHR5cGVvZiBub2RlID09PSAnc3RyaW5nJyB8fCB0eXBlb2Ygbm9kZSA9PT0gJ251bWJlcicpIHtcbiAgICB2YXIgbmV3Tm9kZSA9IG5ldyBUZXh0Tm9kZShTdHJpbmcobm9kZSkpXG4gICAgbmV3Tm9kZS5pbmRleCA9IGFjYy5sZW5ndGhcbiAgICBhY2MucHVzaChuZXdOb2RlKVxuICB9IGVsc2Uge1xuICAgIG5vZGUuaW5kZXggPSBhY2MubGVuZ3RoXG4gICAgYWNjLnB1c2gobm9kZSlcbiAgfVxuICByZXR1cm4gYWNjXG59XG5cbi8qKlxuICogSW5pdGlhbGl6ZSBhIG5ldyBgQ29tcG9uZW50Tm9kZWAuXG4gKlxuICogQHBhcmFtIHtDb21wb25lbnR9IGNvbXBvbmVudFxuICogQHBhcmFtIHtPYmplY3R9IHByb3BzXG4gKiBAcGFyYW0ge1N0cmluZ30ga2V5IFVzZWQgZm9yIHNvcnRpbmcvcmVwbGFjaW5nIGR1cmluZyBkaWZmaW5nLlxuICogQHBhcmFtIHtBcnJheX0gY2hpbGRyZW4gQ2hpbGQgdmlydHVhbCBub2Rlc1xuICogQGFwaSBwdWJsaWNcbiAqL1xuXG5mdW5jdGlvbiBDb21wb25lbnROb2RlIChjb21wb25lbnQsIHByb3BzLCBrZXksIGNoaWxkcmVuKSB7XG4gIHRoaXMua2V5ID0ga2V5XG4gIHRoaXMucHJvcHMgPSBwcm9wc1xuICB0aGlzLnR5cGUgPSAnY29tcG9uZW50J1xuICB0aGlzLmNvbXBvbmVudCA9IGNvbXBvbmVudFxuICB0aGlzLnByb3BzLmNoaWxkcmVuID0gY2hpbGRyZW4gfHwgW11cbn1cblxuLyoqXG4gKiBJbml0aWFsaXplIGEgbmV3IGBFbGVtZW50Tm9kZWAuXG4gKlxuICogQHBhcmFtIHtTdHJpbmd9IHRhZ05hbWVcbiAqIEBwYXJhbSB7T2JqZWN0fSBhdHRyaWJ1dGVzXG4gKiBAcGFyYW0ge1N0cmluZ30ga2V5IFVzZWQgZm9yIHNvcnRpbmcvcmVwbGFjaW5nIGR1cmluZyBkaWZmaW5nLlxuICogQHBhcmFtIHtBcnJheX0gY2hpbGRyZW4gQ2hpbGQgdmlydHVhbCBkb20gbm9kZXMuXG4gKiBAYXBpIHB1YmxpY1xuICovXG5cbmZ1bmN0aW9uIEVsZW1lbnROb2RlICh0YWdOYW1lLCBhdHRyaWJ1dGVzLCBrZXksIGNoaWxkcmVuKSB7XG4gIHRoaXMudHlwZSA9ICdlbGVtZW50J1xuICB0aGlzLmF0dHJpYnV0ZXMgPSBwYXJzZUF0dHJpYnV0ZXMoYXR0cmlidXRlcylcbiAgdGhpcy50YWdOYW1lID0gdGFnTmFtZVxuICB0aGlzLmNoaWxkcmVuID0gY2hpbGRyZW4gfHwgW11cbiAgdGhpcy5rZXkgPSBrZXlcbn1cblxuLyoqXG4gKiBJbml0aWFsaXplIGEgbmV3IGBUZXh0Tm9kZWAuXG4gKlxuICogVGhpcyBpcyBqdXN0IGEgdmlydHVhbCBIVE1MIHRleHQgb2JqZWN0LlxuICpcbiAqIEBwYXJhbSB7U3RyaW5nfSB0ZXh0XG4gKiBAYXBpIHB1YmxpY1xuICovXG5cbmZ1bmN0aW9uIFRleHROb2RlICh0ZXh0KSB7XG4gIHRoaXMudHlwZSA9ICd0ZXh0J1xuICB0aGlzLmRhdGEgPSBTdHJpbmcodGV4dClcbn1cblxuLyoqXG4gKiBQYXJzZSBhdHRyaWJ1dGVzIGZvciBzb21lIHNwZWNpYWwgY2FzZXMuXG4gKlxuICogVE9ETzogVGhpcyBjb3VsZCBiZSBtb3JlIGZ1bmN0aW9uYWwgYW5kIGFsbG93IGhvb2tzXG4gKiBpbnRvIHRoZSBwcm9jZXNzaW5nIG9mIHRoZSBhdHRyaWJ1dGVzIGF0IGEgY29tcG9uZW50LWxldmVsXG4gKlxuICogQHBhcmFtIHtPYmplY3R9IGF0dHJpYnV0ZXNcbiAqXG4gKiBAcmV0dXJuIHtPYmplY3R9XG4gKi9cblxuZnVuY3Rpb24gcGFyc2VBdHRyaWJ1dGVzIChhdHRyaWJ1dGVzKSB7XG4gIC8vIHN0eWxlOiB7ICd0ZXh0LWFsaWduJzogJ2xlZnQnIH1cbiAgaWYgKGF0dHJpYnV0ZXMuc3R5bGUpIHtcbiAgICBhdHRyaWJ1dGVzLnN0eWxlID0gcGFyc2VTdHlsZShhdHRyaWJ1dGVzLnN0eWxlKVxuICB9XG5cbiAgLy8gY2xhc3M6IHsgZm9vOiB0cnVlLCBiYXI6IGZhbHNlLCBiYXo6IHRydWUgfVxuICAvLyBjbGFzczogWydmb28nLCAnYmFyJywgJ2JheiddXG4gIGlmIChhdHRyaWJ1dGVzLmNsYXNzKSB7XG4gICAgYXR0cmlidXRlcy5jbGFzcyA9IHBhcnNlQ2xhc3MoYXR0cmlidXRlcy5jbGFzcylcbiAgfVxuXG4gIC8vIFJlbW92ZSBhdHRyaWJ1dGVzIHdpdGggZmFsc2UgdmFsdWVzXG4gIHZhciBmaWx0ZXJlZEF0dHJpYnV0ZXMgPSB7fVxuICBmb3IgKHZhciBrZXkgaW4gYXR0cmlidXRlcykge1xuICAgIHZhciB2YWx1ZSA9IGF0dHJpYnV0ZXNba2V5XVxuICAgIGlmICh2YWx1ZSA9PSBudWxsIHx8IHZhbHVlID09PSBmYWxzZSkgY29udGludWVcbiAgICBmaWx0ZXJlZEF0dHJpYnV0ZXNba2V5XSA9IHZhbHVlXG4gIH1cblxuICByZXR1cm4gZmlsdGVyZWRBdHRyaWJ1dGVzXG59XG5cbi8qKlxuICogUGFyc2UgYSBibG9jayBvZiBzdHlsZXMgaW50byBhIHN0cmluZy5cbiAqXG4gKiBUT0RPOiB0aGlzIGNvdWxkIGRvIGEgbG90IG1vcmUgd2l0aCB2ZW5kb3IgcHJlZml4aW5nLFxuICogbnVtYmVyIHZhbHVlcyBldGMuIE1heWJlIHRoZXJlJ3MgYSB3YXkgdG8gYWxsb3cgdXNlcnNcbiAqIHRvIGhvb2sgaW50byB0aGlzP1xuICpcbiAqIEBwYXJhbSB7T2JqZWN0fSBzdHlsZXNcbiAqXG4gKiBAcmV0dXJuIHtTdHJpbmd9XG4gKi9cblxuZnVuY3Rpb24gcGFyc2VTdHlsZSAoc3R5bGVzKSB7XG4gIGlmICh0eXBlKHN0eWxlcykgPT09ICdzdHJpbmcnKSB7XG4gICAgcmV0dXJuIHN0eWxlc1xuICB9XG4gIHZhciBzdHIgPSAnJ1xuICBmb3IgKHZhciBuYW1lIGluIHN0eWxlcykge1xuICAgIHZhciB2YWx1ZSA9IHN0eWxlc1tuYW1lXVxuICAgIHN0ciA9IHN0ciArIG5hbWUgKyAnOicgKyB2YWx1ZSArICc7J1xuICB9XG4gIHJldHVybiBzdHI7XG59XG5cbi8qKlxuICogUGFyc2UgdGhlIGNsYXNzIGF0dHJpYnV0ZSBzbyBpdCdzIGFibGUgdG8gYmVcbiAqIHNldCBpbiBhIG1vcmUgdXNlci1mcmllbmRseSB3YXlcbiAqXG4gKiBAcGFyYW0ge1N0cmluZ3xPYmplY3R8QXJyYXl9IHZhbHVlXG4gKlxuICogQHJldHVybiB7U3RyaW5nfVxuICovXG5cbmZ1bmN0aW9uIHBhcnNlQ2xhc3MgKHZhbHVlKSB7XG4gIC8vIHsgZm9vOiB0cnVlLCBiYXI6IGZhbHNlLCBiYXo6IHRydWUgfVxuICBpZiAodHlwZSh2YWx1ZSkgPT09ICdvYmplY3QnKSB7XG4gICAgdmFyIG1hdGNoZWQgPSBbXVxuICAgIGZvciAodmFyIGtleSBpbiB2YWx1ZSkge1xuICAgICAgaWYgKHZhbHVlW2tleV0pIG1hdGNoZWQucHVzaChrZXkpXG4gICAgfVxuICAgIHZhbHVlID0gbWF0Y2hlZFxuICB9XG5cbiAgLy8gWydmb28nLCAnYmFyJywgJ2JheiddXG4gIGlmICh0eXBlKHZhbHVlKSA9PT0gJ2FycmF5Jykge1xuICAgIGlmICh2YWx1ZS5sZW5ndGggPT09IDApIHtcbiAgICAgIHJldHVyblxuICAgIH1cbiAgICB2YWx1ZSA9IHZhbHVlLmpvaW4oJyAnKVxuICB9XG5cbiAgcmV0dXJuIHZhbHVlXG59XG4iLCIvKipcbiAqIFJlY3Vyc2l2ZSBmbGF0dGVuIGZ1bmN0aW9uLiBGYXN0ZXN0IGltcGxlbWVudGF0aW9uIGZvciBhcnJheSBmbGF0dGVuaW5nLlxuICpcbiAqIEBwYXJhbSAge0FycmF5fSAgYXJyYXlcbiAqIEBwYXJhbSAge0FycmF5fSAgcmVzdWx0XG4gKiBAcGFyYW0gIHtOdW1iZXJ9IGRlcHRoXG4gKiBAcmV0dXJuIHtBcnJheX1cbiAqL1xuZnVuY3Rpb24gZmxhdHRlbiAoYXJyYXksIHJlc3VsdCwgZGVwdGgpIHtcbiAgZm9yICh2YXIgaSA9IDA7IGkgPCBhcnJheS5sZW5ndGg7IGkrKykge1xuICAgIGlmIChkZXB0aCA+IDAgJiYgQXJyYXkuaXNBcnJheShhcnJheVtpXSkpIHtcbiAgICAgIGZsYXR0ZW4oYXJyYXlbaV0sIHJlc3VsdCwgZGVwdGggLSAxKTtcbiAgICB9IGVsc2Uge1xuICAgICAgcmVzdWx0LnB1c2goYXJyYXlbaV0pO1xuICAgIH1cbiAgfVxuXG4gIHJldHVybiByZXN1bHQ7XG59XG5cbi8qKlxuICogRmxhdHRlbiBhbiBhcnJheSwgd2l0aCB0aGUgYWJpbGl0eSB0byBkZWZpbmUgYSBkZXB0aC5cbiAqXG4gKiBAcGFyYW0gIHtBcnJheX0gIGFycmF5XG4gKiBAcGFyYW0gIHtOdW1iZXJ9IGRlcHRoXG4gKiBAcmV0dXJuIHtBcnJheX1cbiAqL1xubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiAoYXJyYXksIGRlcHRoKSB7XG4gIHJldHVybiBmbGF0dGVuKGFycmF5LCBbXSwgZGVwdGggfHwgSW5maW5pdHkpO1xufTtcbiIsIlxuLyoqXG4gKiBFeHBvc2UgYEVtaXR0ZXJgLlxuICovXG5cbm1vZHVsZS5leHBvcnRzID0gRW1pdHRlcjtcblxuLyoqXG4gKiBJbml0aWFsaXplIGEgbmV3IGBFbWl0dGVyYC5cbiAqXG4gKiBAYXBpIHB1YmxpY1xuICovXG5cbmZ1bmN0aW9uIEVtaXR0ZXIob2JqKSB7XG4gIGlmIChvYmopIHJldHVybiBtaXhpbihvYmopO1xufTtcblxuLyoqXG4gKiBNaXhpbiB0aGUgZW1pdHRlciBwcm9wZXJ0aWVzLlxuICpcbiAqIEBwYXJhbSB7T2JqZWN0fSBvYmpcbiAqIEByZXR1cm4ge09iamVjdH1cbiAqIEBhcGkgcHJpdmF0ZVxuICovXG5cbmZ1bmN0aW9uIG1peGluKG9iaikge1xuICBmb3IgKHZhciBrZXkgaW4gRW1pdHRlci5wcm90b3R5cGUpIHtcbiAgICBvYmpba2V5XSA9IEVtaXR0ZXIucHJvdG90eXBlW2tleV07XG4gIH1cbiAgcmV0dXJuIG9iajtcbn1cblxuLyoqXG4gKiBMaXN0ZW4gb24gdGhlIGdpdmVuIGBldmVudGAgd2l0aCBgZm5gLlxuICpcbiAqIEBwYXJhbSB7U3RyaW5nfSBldmVudFxuICogQHBhcmFtIHtGdW5jdGlvbn0gZm5cbiAqIEByZXR1cm4ge0VtaXR0ZXJ9XG4gKiBAYXBpIHB1YmxpY1xuICovXG5cbkVtaXR0ZXIucHJvdG90eXBlLm9uID1cbkVtaXR0ZXIucHJvdG90eXBlLmFkZEV2ZW50TGlzdGVuZXIgPSBmdW5jdGlvbihldmVudCwgZm4pe1xuICB0aGlzLl9jYWxsYmFja3MgPSB0aGlzLl9jYWxsYmFja3MgfHwge307XG4gICh0aGlzLl9jYWxsYmFja3NbJyQnICsgZXZlbnRdID0gdGhpcy5fY2FsbGJhY2tzWyckJyArIGV2ZW50XSB8fCBbXSlcbiAgICAucHVzaChmbik7XG4gIHJldHVybiB0aGlzO1xufTtcblxuLyoqXG4gKiBBZGRzIGFuIGBldmVudGAgbGlzdGVuZXIgdGhhdCB3aWxsIGJlIGludm9rZWQgYSBzaW5nbGVcbiAqIHRpbWUgdGhlbiBhdXRvbWF0aWNhbGx5IHJlbW92ZWQuXG4gKlxuICogQHBhcmFtIHtTdHJpbmd9IGV2ZW50XG4gKiBAcGFyYW0ge0Z1bmN0aW9ufSBmblxuICogQHJldHVybiB7RW1pdHRlcn1cbiAqIEBhcGkgcHVibGljXG4gKi9cblxuRW1pdHRlci5wcm90b3R5cGUub25jZSA9IGZ1bmN0aW9uKGV2ZW50LCBmbil7XG4gIGZ1bmN0aW9uIG9uKCkge1xuICAgIHRoaXMub2ZmKGV2ZW50LCBvbik7XG4gICAgZm4uYXBwbHkodGhpcywgYXJndW1lbnRzKTtcbiAgfVxuXG4gIG9uLmZuID0gZm47XG4gIHRoaXMub24oZXZlbnQsIG9uKTtcbiAgcmV0dXJuIHRoaXM7XG59O1xuXG4vKipcbiAqIFJlbW92ZSB0aGUgZ2l2ZW4gY2FsbGJhY2sgZm9yIGBldmVudGAgb3IgYWxsXG4gKiByZWdpc3RlcmVkIGNhbGxiYWNrcy5cbiAqXG4gKiBAcGFyYW0ge1N0cmluZ30gZXZlbnRcbiAqIEBwYXJhbSB7RnVuY3Rpb259IGZuXG4gKiBAcmV0dXJuIHtFbWl0dGVyfVxuICogQGFwaSBwdWJsaWNcbiAqL1xuXG5FbWl0dGVyLnByb3RvdHlwZS5vZmYgPVxuRW1pdHRlci5wcm90b3R5cGUucmVtb3ZlTGlzdGVuZXIgPVxuRW1pdHRlci5wcm90b3R5cGUucmVtb3ZlQWxsTGlzdGVuZXJzID1cbkVtaXR0ZXIucHJvdG90eXBlLnJlbW92ZUV2ZW50TGlzdGVuZXIgPSBmdW5jdGlvbihldmVudCwgZm4pe1xuICB0aGlzLl9jYWxsYmFja3MgPSB0aGlzLl9jYWxsYmFja3MgfHwge307XG5cbiAgLy8gYWxsXG4gIGlmICgwID09IGFyZ3VtZW50cy5sZW5ndGgpIHtcbiAgICB0aGlzLl9jYWxsYmFja3MgPSB7fTtcbiAgICByZXR1cm4gdGhpcztcbiAgfVxuXG4gIC8vIHNwZWNpZmljIGV2ZW50XG4gIHZhciBjYWxsYmFja3MgPSB0aGlzLl9jYWxsYmFja3NbJyQnICsgZXZlbnRdO1xuICBpZiAoIWNhbGxiYWNrcykgcmV0dXJuIHRoaXM7XG5cbiAgLy8gcmVtb3ZlIGFsbCBoYW5kbGVyc1xuICBpZiAoMSA9PSBhcmd1bWVudHMubGVuZ3RoKSB7XG4gICAgZGVsZXRlIHRoaXMuX2NhbGxiYWNrc1snJCcgKyBldmVudF07XG4gICAgcmV0dXJuIHRoaXM7XG4gIH1cblxuICAvLyByZW1vdmUgc3BlY2lmaWMgaGFuZGxlclxuICB2YXIgY2I7XG4gIGZvciAodmFyIGkgPSAwOyBpIDwgY2FsbGJhY2tzLmxlbmd0aDsgaSsrKSB7XG4gICAgY2IgPSBjYWxsYmFja3NbaV07XG4gICAgaWYgKGNiID09PSBmbiB8fCBjYi5mbiA9PT0gZm4pIHtcbiAgICAgIGNhbGxiYWNrcy5zcGxpY2UoaSwgMSk7XG4gICAgICBicmVhaztcbiAgICB9XG4gIH1cbiAgcmV0dXJuIHRoaXM7XG59O1xuXG4vKipcbiAqIEVtaXQgYGV2ZW50YCB3aXRoIHRoZSBnaXZlbiBhcmdzLlxuICpcbiAqIEBwYXJhbSB7U3RyaW5nfSBldmVudFxuICogQHBhcmFtIHtNaXhlZH0gLi4uXG4gKiBAcmV0dXJuIHtFbWl0dGVyfVxuICovXG5cbkVtaXR0ZXIucHJvdG90eXBlLmVtaXQgPSBmdW5jdGlvbihldmVudCl7XG4gIHRoaXMuX2NhbGxiYWNrcyA9IHRoaXMuX2NhbGxiYWNrcyB8fCB7fTtcbiAgdmFyIGFyZ3MgPSBbXS5zbGljZS5jYWxsKGFyZ3VtZW50cywgMSlcbiAgICAsIGNhbGxiYWNrcyA9IHRoaXMuX2NhbGxiYWNrc1snJCcgKyBldmVudF07XG5cbiAgaWYgKGNhbGxiYWNrcykge1xuICAgIGNhbGxiYWNrcyA9IGNhbGxiYWNrcy5zbGljZSgwKTtcbiAgICBmb3IgKHZhciBpID0gMCwgbGVuID0gY2FsbGJhY2tzLmxlbmd0aDsgaSA8IGxlbjsgKytpKSB7XG4gICAgICBjYWxsYmFja3NbaV0uYXBwbHkodGhpcywgYXJncyk7XG4gICAgfVxuICB9XG5cbiAgcmV0dXJuIHRoaXM7XG59O1xuXG4vKipcbiAqIFJldHVybiBhcnJheSBvZiBjYWxsYmFja3MgZm9yIGBldmVudGAuXG4gKlxuICogQHBhcmFtIHtTdHJpbmd9IGV2ZW50XG4gKiBAcmV0dXJuIHtBcnJheX1cbiAqIEBhcGkgcHVibGljXG4gKi9cblxuRW1pdHRlci5wcm90b3R5cGUubGlzdGVuZXJzID0gZnVuY3Rpb24oZXZlbnQpe1xuICB0aGlzLl9jYWxsYmFja3MgPSB0aGlzLl9jYWxsYmFja3MgfHwge307XG4gIHJldHVybiB0aGlzLl9jYWxsYmFja3NbJyQnICsgZXZlbnRdIHx8IFtdO1xufTtcblxuLyoqXG4gKiBDaGVjayBpZiB0aGlzIGVtaXR0ZXIgaGFzIGBldmVudGAgaGFuZGxlcnMuXG4gKlxuICogQHBhcmFtIHtTdHJpbmd9IGV2ZW50XG4gKiBAcmV0dXJuIHtCb29sZWFufVxuICogQGFwaSBwdWJsaWNcbiAqL1xuXG5FbWl0dGVyLnByb3RvdHlwZS5oYXNMaXN0ZW5lcnMgPSBmdW5jdGlvbihldmVudCl7XG4gIHJldHVybiAhISB0aGlzLmxpc3RlbmVycyhldmVudCkubGVuZ3RoO1xufTtcbiIsIi8qKlxuICogRXhwb3NlIGByZXF1ZXN0QW5pbWF0aW9uRnJhbWUoKWAuXG4gKi9cblxuZXhwb3J0cyA9IG1vZHVsZS5leHBvcnRzID0gd2luZG93LnJlcXVlc3RBbmltYXRpb25GcmFtZVxuICB8fCB3aW5kb3cud2Via2l0UmVxdWVzdEFuaW1hdGlvbkZyYW1lXG4gIHx8IHdpbmRvdy5tb3pSZXF1ZXN0QW5pbWF0aW9uRnJhbWVcbiAgfHwgZmFsbGJhY2s7XG5cbi8qKlxuICogRmFsbGJhY2sgaW1wbGVtZW50YXRpb24uXG4gKi9cblxudmFyIHByZXYgPSBuZXcgRGF0ZSgpLmdldFRpbWUoKTtcbmZ1bmN0aW9uIGZhbGxiYWNrKGZuKSB7XG4gIHZhciBjdXJyID0gbmV3IERhdGUoKS5nZXRUaW1lKCk7XG4gIHZhciBtcyA9IE1hdGgubWF4KDAsIDE2IC0gKGN1cnIgLSBwcmV2KSk7XG4gIHZhciByZXEgPSBzZXRUaW1lb3V0KGZuLCBtcyk7XG4gIHByZXYgPSBjdXJyO1xuICByZXR1cm4gcmVxO1xufVxuXG4vKipcbiAqIENhbmNlbC5cbiAqL1xuXG52YXIgY2FuY2VsID0gd2luZG93LmNhbmNlbEFuaW1hdGlvbkZyYW1lXG4gIHx8IHdpbmRvdy53ZWJraXRDYW5jZWxBbmltYXRpb25GcmFtZVxuICB8fCB3aW5kb3cubW96Q2FuY2VsQW5pbWF0aW9uRnJhbWVcbiAgfHwgd2luZG93LmNsZWFyVGltZW91dDtcblxuZXhwb3J0cy5jYW5jZWwgPSBmdW5jdGlvbihpZCl7XG4gIGNhbmNlbC5jYWxsKHdpbmRvdywgaWQpO1xufTtcbiIsIi8qKlxuICogdG9TdHJpbmcgcmVmLlxuICovXG5cbnZhciB0b1N0cmluZyA9IE9iamVjdC5wcm90b3R5cGUudG9TdHJpbmc7XG5cbi8qKlxuICogUmV0dXJuIHRoZSB0eXBlIG9mIGB2YWxgLlxuICpcbiAqIEBwYXJhbSB7TWl4ZWR9IHZhbFxuICogQHJldHVybiB7U3RyaW5nfVxuICogQGFwaSBwdWJsaWNcbiAqL1xuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uKHZhbCl7XG4gIHN3aXRjaCAodG9TdHJpbmcuY2FsbCh2YWwpKSB7XG4gICAgY2FzZSAnW29iamVjdCBEYXRlXSc6IHJldHVybiAnZGF0ZSc7XG4gICAgY2FzZSAnW29iamVjdCBSZWdFeHBdJzogcmV0dXJuICdyZWdleHAnO1xuICAgIGNhc2UgJ1tvYmplY3QgQXJndW1lbnRzXSc6IHJldHVybiAnYXJndW1lbnRzJztcbiAgICBjYXNlICdbb2JqZWN0IEFycmF5XSc6IHJldHVybiAnYXJyYXknO1xuICAgIGNhc2UgJ1tvYmplY3QgRXJyb3JdJzogcmV0dXJuICdlcnJvcic7XG4gIH1cblxuICBpZiAodmFsID09PSBudWxsKSByZXR1cm4gJ251bGwnO1xuICBpZiAodmFsID09PSB1bmRlZmluZWQpIHJldHVybiAndW5kZWZpbmVkJztcbiAgaWYgKHZhbCAhPT0gdmFsKSByZXR1cm4gJ25hbic7XG4gIGlmICh2YWwgJiYgdmFsLm5vZGVUeXBlID09PSAxKSByZXR1cm4gJ2VsZW1lbnQnO1xuXG4gIHZhbCA9IHZhbC52YWx1ZU9mXG4gICAgPyB2YWwudmFsdWVPZigpXG4gICAgOiBPYmplY3QucHJvdG90eXBlLnZhbHVlT2YuYXBwbHkodmFsKVxuXG4gIHJldHVybiB0eXBlb2YgdmFsO1xufTtcbiIsImZ1bmN0aW9uIFBvb2wocGFyYW1zKSB7XHJcbiAgICBpZiAodHlwZW9mIHBhcmFtcyAhPT0gJ29iamVjdCcpIHtcclxuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXCJQbGVhc2UgcGFzcyBwYXJhbWV0ZXJzLiBFeGFtcGxlIC0+IG5ldyBQb29sKHsgdGFnTmFtZTogXFxcImRpdlxcXCIgfSlcIik7XHJcbiAgICB9XHJcblxyXG4gICAgaWYgKHR5cGVvZiBwYXJhbXMudGFnTmFtZSAhPT0gJ3N0cmluZycpIHtcclxuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXCJQbGVhc2Ugc3BlY2lmeSBhIHRhZ05hbWUuIEV4YW1wbGUgLT4gbmV3IFBvb2woeyB0YWdOYW1lOiBcXFwiZGl2XFxcIiB9KVwiKTtcclxuICAgIH1cclxuXHJcbiAgICB0aGlzLnN0b3JhZ2UgPSBbXTtcclxuICAgIHRoaXMudGFnTmFtZSA9IHBhcmFtcy50YWdOYW1lLnRvTG93ZXJDYXNlKCk7XHJcbiAgICB0aGlzLm5hbWVzcGFjZSA9IHBhcmFtcy5uYW1lc3BhY2U7XHJcbn1cclxuXHJcblBvb2wucHJvdG90eXBlLnB1c2ggPSBmdW5jdGlvbihlbCkge1xyXG4gICAgaWYgKGVsLnRhZ05hbWUudG9Mb3dlckNhc2UoKSAhPT0gdGhpcy50YWdOYW1lKSB7XHJcbiAgICAgICAgcmV0dXJuO1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICB0aGlzLnN0b3JhZ2UucHVzaChlbCk7XHJcbn07XHJcblxyXG5Qb29sLnByb3RvdHlwZS5wb3AgPSBmdW5jdGlvbihhcmd1bWVudCkge1xyXG4gICAgaWYgKHRoaXMuc3RvcmFnZS5sZW5ndGggPT09IDApIHtcclxuICAgICAgICByZXR1cm4gdGhpcy5jcmVhdGUoKTtcclxuICAgIH0gZWxzZSB7XHJcbiAgICAgICAgcmV0dXJuIHRoaXMuc3RvcmFnZS5wb3AoKTtcclxuICAgIH1cclxufTtcclxuXHJcblBvb2wucHJvdG90eXBlLmNyZWF0ZSA9IGZ1bmN0aW9uKCkge1xyXG4gICAgaWYgKHRoaXMubmFtZXNwYWNlKSB7XHJcbiAgICAgICAgcmV0dXJuIGRvY3VtZW50LmNyZWF0ZUVsZW1lbnROUyh0aGlzLm5hbWVzcGFjZSwgdGhpcy50YWdOYW1lKTtcclxuICAgIH0gZWxzZSB7XHJcbiAgICAgICAgcmV0dXJuIGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQodGhpcy50YWdOYW1lKTtcclxuICAgIH1cclxufTtcclxuXHJcblBvb2wucHJvdG90eXBlLmFsbG9jYXRlID0gZnVuY3Rpb24oc2l6ZSkge1xyXG4gICAgaWYgKHRoaXMuc3RvcmFnZS5sZW5ndGggPj0gc2l6ZSkge1xyXG4gICAgICAgIHJldHVybjtcclxuICAgIH1cclxuXHJcbiAgICB2YXIgZGlmZmVyZW5jZSA9IHNpemUgLSB0aGlzLnN0b3JhZ2UubGVuZ3RoO1xyXG4gICAgZm9yICh2YXIgcG9vbEFsbG9jSXRlciA9IDA7IHBvb2xBbGxvY0l0ZXIgPCBkaWZmZXJlbmNlOyBwb29sQWxsb2NJdGVyKyspIHtcclxuICAgICAgICB0aGlzLnN0b3JhZ2UucHVzaCh0aGlzLmNyZWF0ZSgpKTtcclxuICAgIH1cclxufTtcclxuXHJcbmlmICh0eXBlb2YgbW9kdWxlICE9PSAndW5kZWZpbmVkJyAmJiB0eXBlb2YgbW9kdWxlLmV4cG9ydHMgIT09ICd1bmRlZmluZWQnKSB7XHJcbiAgICBtb2R1bGUuZXhwb3J0cyA9IFBvb2w7XHJcbn1cclxuIiwidmFyIHNsaWNlID0gQXJyYXkucHJvdG90eXBlLnNsaWNlXG5cbm1vZHVsZS5leHBvcnRzID0gaXRlcmF0aXZlbHlXYWxrXG5cbmZ1bmN0aW9uIGl0ZXJhdGl2ZWx5V2Fsayhub2RlcywgY2IpIHtcbiAgICBpZiAoISgnbGVuZ3RoJyBpbiBub2RlcykpIHtcbiAgICAgICAgbm9kZXMgPSBbbm9kZXNdXG4gICAgfVxuICAgIFxuICAgIG5vZGVzID0gc2xpY2UuY2FsbChub2RlcylcblxuICAgIHdoaWxlKG5vZGVzLmxlbmd0aCkge1xuICAgICAgICB2YXIgbm9kZSA9IG5vZGVzLnNoaWZ0KCksXG4gICAgICAgICAgICByZXQgPSBjYihub2RlKVxuXG4gICAgICAgIGlmIChyZXQpIHtcbiAgICAgICAgICAgIHJldHVybiByZXRcbiAgICAgICAgfVxuXG4gICAgICAgIGlmIChub2RlLmNoaWxkTm9kZXMgJiYgbm9kZS5jaGlsZE5vZGVzLmxlbmd0aCkge1xuICAgICAgICAgICAgbm9kZXMgPSBzbGljZS5jYWxsKG5vZGUuY2hpbGROb2RlcykuY29uY2F0KG5vZGVzKVxuICAgICAgICB9XG4gICAgfVxufVxuIiwiJ3VzZSBzdHJpY3QnO1xuXG4vKipcbiAqICMgQ2xvbmUgQXJyYXlcbiAqXG4gKiBDbG9uZSBhbiBhcnJheSBvciBhcnJheSBsaWtlIG9iamVjdCAoZS5nLiBgYXJndW1lbnRzYCkuXG4gKiBUaGlzIGlzIHRoZSBlcXVpdmFsZW50IG9mIGNhbGxpbmcgYEFycmF5LnByb3RvdHlwZS5zbGljZS5jYWxsKGFyZ3VtZW50cylgLCBidXRcbiAqIHNpZ25pZmljYW50bHkgZmFzdGVyLlxuICpcbiAqIEBwYXJhbSAge0FycmF5fSBpbnB1dCBUaGUgYXJyYXkgb3IgYXJyYXktbGlrZSBvYmplY3QgdG8gY2xvbmUuXG4gKiBAcmV0dXJuIHtBcnJheX0gICAgICAgVGhlIGNsb25lZCBhcnJheS5cbiAqL1xubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiBmYXN0Q2xvbmVBcnJheSAoaW5wdXQpIHtcbiAgdmFyIGxlbmd0aCA9IGlucHV0Lmxlbmd0aCxcbiAgICAgIHNsaWNlZCA9IG5ldyBBcnJheShsZW5ndGgpLFxuICAgICAgaTtcbiAgZm9yIChpID0gMDsgaSA8IGxlbmd0aDsgaSsrKSB7XG4gICAgc2xpY2VkW2ldID0gaW5wdXRbaV07XG4gIH1cbiAgcmV0dXJuIHNsaWNlZDtcbn07XG4iLCIndXNlIHN0cmljdCc7XG5cbi8qKlxuICogIyBDb25jYXRcbiAqXG4gKiBDb25jYXRlbmF0ZSBtdWx0aXBsZSBhcnJheXMuXG4gKlxuICogPiBOb3RlOiBUaGlzIGZ1bmN0aW9uIGlzIGVmZmVjdGl2ZWx5IGlkZW50aWNhbCB0byBgQXJyYXkucHJvdG90eXBlLmNvbmNhdCgpYC5cbiAqXG4gKlxuICogQHBhcmFtICB7QXJyYXl8bWl4ZWR9IGl0ZW0sIC4uLiBUaGUgaXRlbShzKSB0byBjb25jYXRlbmF0ZS5cbiAqIEByZXR1cm4ge0FycmF5fSAgICAgICAgICAgICAgICAgVGhlIGFycmF5IGNvbnRhaW5pbmcgdGhlIGNvbmNhdGVuYXRlZCBpdGVtcy5cbiAqL1xubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiBmYXN0Q29uY2F0ICgpIHtcbiAgdmFyIGxlbmd0aCA9IGFyZ3VtZW50cy5sZW5ndGgsXG4gICAgICBhcnIgPSBbXSxcbiAgICAgIGksIGl0ZW0sIGNoaWxkTGVuZ3RoLCBqO1xuXG4gIGZvciAoaSA9IDA7IGkgPCBsZW5ndGg7IGkrKykge1xuICAgIGl0ZW0gPSBhcmd1bWVudHNbaV07XG4gICAgaWYgKEFycmF5LmlzQXJyYXkoaXRlbSkpIHtcbiAgICAgIGNoaWxkTGVuZ3RoID0gaXRlbS5sZW5ndGg7XG4gICAgICBmb3IgKGogPSAwOyBqIDwgY2hpbGRMZW5ndGg7IGorKykge1xuICAgICAgICBhcnIucHVzaChpdGVtW2pdKTtcbiAgICAgIH1cbiAgICB9XG4gICAgZWxzZSB7XG4gICAgICBhcnIucHVzaChpdGVtKTtcbiAgICB9XG4gIH1cbiAgcmV0dXJuIGFycjtcbn07XG4iLCIndXNlIHN0cmljdCc7XG5cbnZhciBiaW5kSW50ZXJuYWwzID0gcmVxdWlyZSgnLi4vZnVuY3Rpb24vYmluZEludGVybmFsMycpO1xuXG4vKipcbiAqICMgRXZlcnlcbiAqXG4gKiBBIGZhc3QgYC5ldmVyeSgpYCBpbXBsZW1lbnRhdGlvbi5cbiAqXG4gKiBAcGFyYW0gIHtBcnJheX0gICAgc3ViamVjdCAgICAgVGhlIGFycmF5IChvciBhcnJheS1saWtlKSB0byBpdGVyYXRlIG92ZXIuXG4gKiBAcGFyYW0gIHtGdW5jdGlvbn0gZm4gICAgICAgICAgVGhlIHZpc2l0b3IgZnVuY3Rpb24uXG4gKiBAcGFyYW0gIHtPYmplY3R9ICAgdGhpc0NvbnRleHQgVGhlIGNvbnRleHQgZm9yIHRoZSB2aXNpdG9yLlxuICogQHJldHVybiB7Qm9vbGVhbn0gICAgICAgICAgICAgIHRydWUgaWYgYWxsIGl0ZW1zIGluIHRoZSBhcnJheSBwYXNzZXMgdGhlIHRydXRoIHRlc3QuXG4gKi9cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gZmFzdEV2ZXJ5IChzdWJqZWN0LCBmbiwgdGhpc0NvbnRleHQpIHtcbiAgdmFyIGxlbmd0aCA9IHN1YmplY3QubGVuZ3RoLFxuICAgICAgaXRlcmF0b3IgPSB0aGlzQ29udGV4dCAhPT0gdW5kZWZpbmVkID8gYmluZEludGVybmFsMyhmbiwgdGhpc0NvbnRleHQpIDogZm4sXG4gICAgICBpO1xuICBmb3IgKGkgPSAwOyBpIDwgbGVuZ3RoOyBpKyspIHtcbiAgICBpZiAoIWl0ZXJhdG9yKHN1YmplY3RbaV0sIGksIHN1YmplY3QpKSB7XG4gICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuICB9XG4gIHJldHVybiB0cnVlO1xufTtcbiIsIid1c2Ugc3RyaWN0JztcblxuLyoqXG4gKiAjIEZpbGxcbiAqIEZpbGwgYW4gYXJyYXkgd2l0aCB2YWx1ZXMsIG9wdGlvbmFsbHkgc3RhcnRpbmcgYW5kIHN0b3BwaW5nIGF0IGEgZ2l2ZW4gaW5kZXguXG4gKlxuICogPiBOb3RlOiB1bmxpa2UgdGhlIHNwZWNjZWQgQXJyYXkucHJvdG90eXBlLmZpbGwoKSwgdGhpcyB2ZXJzaW9uIGRvZXMgbm90IHN1cHBvcnRcbiAqID4gbmVnYXRpdmUgc3RhcnQgLyBlbmQgYXJndW1lbnRzLlxuICpcbiAqIEBwYXJhbSAge0FycmF5fSAgIHN1YmplY3QgVGhlIGFycmF5IHRvIGZpbGwuXG4gKiBAcGFyYW0gIHttaXhlZH0gICB2YWx1ZSAgIFRoZSB2YWx1ZSB0byBpbnNlcnQuXG4gKiBAcGFyYW0gIHtJbnRlZ2VyfSBzdGFydCAgIFRoZSBzdGFydCBwb3NpdGlvbiwgZGVmYXVsdHMgdG8gMC5cbiAqIEBwYXJhbSAge0ludGVnZXJ9IGVuZCAgICAgVGhlIGVuZCBwb3NpdGlvbiwgZGVmYXVsdHMgdG8gc3ViamVjdC5sZW5ndGhcbiAqIEByZXR1cm4ge0FycmF5fSAgICAgICAgICAgVGhlIG5vdyBmaWxsZWQgc3ViamVjdC5cbiAqL1xubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiBmYXN0RmlsbCAoc3ViamVjdCwgdmFsdWUsIHN0YXJ0LCBlbmQpIHtcbiAgdmFyIGxlbmd0aCA9IHN1YmplY3QubGVuZ3RoLFxuICAgICAgaTtcbiAgaWYgKHN0YXJ0ID09PSB1bmRlZmluZWQpIHtcbiAgICBzdGFydCA9IDA7XG4gIH1cbiAgaWYgKGVuZCA9PT0gdW5kZWZpbmVkKSB7XG4gICAgZW5kID0gbGVuZ3RoO1xuICB9XG4gIGZvciAoaSA9IHN0YXJ0OyBpIDwgZW5kOyBpKyspIHtcbiAgICBzdWJqZWN0W2ldID0gdmFsdWU7XG4gIH1cbiAgcmV0dXJuIHN1YmplY3Q7XG59OyIsIid1c2Ugc3RyaWN0JztcblxudmFyIGJpbmRJbnRlcm5hbDMgPSByZXF1aXJlKCcuLi9mdW5jdGlvbi9iaW5kSW50ZXJuYWwzJyk7XG5cbi8qKlxuICogIyBGaWx0ZXJcbiAqXG4gKiBBIGZhc3QgYC5maWx0ZXIoKWAgaW1wbGVtZW50YXRpb24uXG4gKlxuICogQHBhcmFtICB7QXJyYXl9ICAgIHN1YmplY3QgICAgIFRoZSBhcnJheSAob3IgYXJyYXktbGlrZSkgdG8gZmlsdGVyLlxuICogQHBhcmFtICB7RnVuY3Rpb259IGZuICAgICAgICAgIFRoZSBmaWx0ZXIgZnVuY3Rpb24uXG4gKiBAcGFyYW0gIHtPYmplY3R9ICAgdGhpc0NvbnRleHQgVGhlIGNvbnRleHQgZm9yIHRoZSBmaWx0ZXIuXG4gKiBAcmV0dXJuIHtBcnJheX0gICAgICAgICAgICAgICAgVGhlIGFycmF5IGNvbnRhaW5pbmcgdGhlIHJlc3VsdHMuXG4gKi9cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gZmFzdEZpbHRlciAoc3ViamVjdCwgZm4sIHRoaXNDb250ZXh0KSB7XG4gIHZhciBsZW5ndGggPSBzdWJqZWN0Lmxlbmd0aCxcbiAgICAgIHJlc3VsdCA9IFtdLFxuICAgICAgaXRlcmF0b3IgPSB0aGlzQ29udGV4dCAhPT0gdW5kZWZpbmVkID8gYmluZEludGVybmFsMyhmbiwgdGhpc0NvbnRleHQpIDogZm4sXG4gICAgICBpO1xuICBmb3IgKGkgPSAwOyBpIDwgbGVuZ3RoOyBpKyspIHtcbiAgICBpZiAoaXRlcmF0b3Ioc3ViamVjdFtpXSwgaSwgc3ViamVjdCkpIHtcbiAgICAgIHJlc3VsdC5wdXNoKHN1YmplY3RbaV0pO1xuICAgIH1cbiAgfVxuICByZXR1cm4gcmVzdWx0O1xufTtcbiIsIid1c2Ugc3RyaWN0JztcblxudmFyIGJpbmRJbnRlcm5hbDMgPSByZXF1aXJlKCcuLi9mdW5jdGlvbi9iaW5kSW50ZXJuYWwzJyk7XG5cbi8qKlxuICogIyBGb3IgRWFjaFxuICpcbiAqIEEgZmFzdCBgLmZvckVhY2goKWAgaW1wbGVtZW50YXRpb24uXG4gKlxuICogQHBhcmFtICB7QXJyYXl9ICAgIHN1YmplY3QgICAgIFRoZSBhcnJheSAob3IgYXJyYXktbGlrZSkgdG8gaXRlcmF0ZSBvdmVyLlxuICogQHBhcmFtICB7RnVuY3Rpb259IGZuICAgICAgICAgIFRoZSB2aXNpdG9yIGZ1bmN0aW9uLlxuICogQHBhcmFtICB7T2JqZWN0fSAgIHRoaXNDb250ZXh0IFRoZSBjb250ZXh0IGZvciB0aGUgdmlzaXRvci5cbiAqL1xubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiBmYXN0Rm9yRWFjaCAoc3ViamVjdCwgZm4sIHRoaXNDb250ZXh0KSB7XG4gIHZhciBsZW5ndGggPSBzdWJqZWN0Lmxlbmd0aCxcbiAgICAgIGl0ZXJhdG9yID0gdGhpc0NvbnRleHQgIT09IHVuZGVmaW5lZCA/IGJpbmRJbnRlcm5hbDMoZm4sIHRoaXNDb250ZXh0KSA6IGZuLFxuICAgICAgaTtcbiAgZm9yIChpID0gMDsgaSA8IGxlbmd0aDsgaSsrKSB7XG4gICAgaXRlcmF0b3Ioc3ViamVjdFtpXSwgaSwgc3ViamVjdCk7XG4gIH1cbn07XG4iLCIndXNlIHN0cmljdCc7XG5cbmV4cG9ydHMuY2xvbmUgPSByZXF1aXJlKCcuL2Nsb25lJyk7XG5leHBvcnRzLmNvbmNhdCA9IHJlcXVpcmUoJy4vY29uY2F0Jyk7XG5leHBvcnRzLmV2ZXJ5ID0gcmVxdWlyZSgnLi9ldmVyeScpO1xuZXhwb3J0cy5maWx0ZXIgPSByZXF1aXJlKCcuL2ZpbHRlcicpO1xuZXhwb3J0cy5mb3JFYWNoID0gcmVxdWlyZSgnLi9mb3JFYWNoJyk7XG5leHBvcnRzLmluZGV4T2YgPSByZXF1aXJlKCcuL2luZGV4T2YnKTtcbmV4cG9ydHMubGFzdEluZGV4T2YgPSByZXF1aXJlKCcuL2xhc3RJbmRleE9mJyk7XG5leHBvcnRzLm1hcCA9IHJlcXVpcmUoJy4vbWFwJyk7XG5leHBvcnRzLnBsdWNrID0gcmVxdWlyZSgnLi9wbHVjaycpO1xuZXhwb3J0cy5yZWR1Y2UgPSByZXF1aXJlKCcuL3JlZHVjZScpO1xuZXhwb3J0cy5yZWR1Y2VSaWdodCA9IHJlcXVpcmUoJy4vcmVkdWNlUmlnaHQnKTtcbmV4cG9ydHMuc29tZSA9IHJlcXVpcmUoJy4vc29tZScpO1xuZXhwb3J0cy5maWxsID0gcmVxdWlyZSgnLi9maWxsJyk7IiwiJ3VzZSBzdHJpY3QnO1xuXG4vKipcbiAqICMgSW5kZXggT2ZcbiAqXG4gKiBBIGZhc3RlciBgQXJyYXkucHJvdG90eXBlLmluZGV4T2YoKWAgaW1wbGVtZW50YXRpb24uXG4gKlxuICogQHBhcmFtICB7QXJyYXl9ICBzdWJqZWN0ICAgVGhlIGFycmF5IChvciBhcnJheS1saWtlKSB0byBzZWFyY2ggd2l0aGluLlxuICogQHBhcmFtICB7bWl4ZWR9ICB0YXJnZXQgICAgVGhlIHRhcmdldCBpdGVtIHRvIHNlYXJjaCBmb3IuXG4gKiBAcGFyYW0gIHtOdW1iZXJ9IGZyb21JbmRleCBUaGUgcG9zaXRpb24gdG8gc3RhcnQgc2VhcmNoaW5nIGZyb20sIGlmIGtub3duLlxuICogQHJldHVybiB7TnVtYmVyfSAgICAgICAgICAgVGhlIHBvc2l0aW9uIG9mIHRoZSB0YXJnZXQgaW4gdGhlIHN1YmplY3QsIG9yIC0xIGlmIGl0IGRvZXMgbm90IGV4aXN0LlxuICovXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIGZhc3RJbmRleE9mIChzdWJqZWN0LCB0YXJnZXQsIGZyb21JbmRleCkge1xuICB2YXIgbGVuZ3RoID0gc3ViamVjdC5sZW5ndGgsXG4gICAgICBpID0gMDtcblxuICBpZiAodHlwZW9mIGZyb21JbmRleCA9PT0gJ251bWJlcicpIHtcbiAgICBpID0gZnJvbUluZGV4O1xuICAgIGlmIChpIDwgMCkge1xuICAgICAgaSArPSBsZW5ndGg7XG4gICAgICBpZiAoaSA8IDApIHtcbiAgICAgICAgaSA9IDA7XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgZm9yICg7IGkgPCBsZW5ndGg7IGkrKykge1xuICAgIGlmIChzdWJqZWN0W2ldID09PSB0YXJnZXQpIHtcbiAgICAgIHJldHVybiBpO1xuICAgIH1cbiAgfVxuICByZXR1cm4gLTE7XG59O1xuIiwiJ3VzZSBzdHJpY3QnO1xuXG4vKipcbiAqICMgTGFzdCBJbmRleCBPZlxuICpcbiAqIEEgZmFzdGVyIGBBcnJheS5wcm90b3R5cGUubGFzdEluZGV4T2YoKWAgaW1wbGVtZW50YXRpb24uXG4gKlxuICogQHBhcmFtICB7QXJyYXl9ICBzdWJqZWN0IFRoZSBhcnJheSAob3IgYXJyYXktbGlrZSkgdG8gc2VhcmNoIHdpdGhpbi5cbiAqIEBwYXJhbSAge21peGVkfSAgdGFyZ2V0ICBUaGUgdGFyZ2V0IGl0ZW0gdG8gc2VhcmNoIGZvci5cbiAqIEBwYXJhbSAge051bWJlcn0gZnJvbUluZGV4IFRoZSBwb3NpdGlvbiB0byBzdGFydCBzZWFyY2hpbmcgYmFja3dhcmRzIGZyb20sIGlmIGtub3duLlxuICogQHJldHVybiB7TnVtYmVyfSAgICAgICAgIFRoZSBsYXN0IHBvc2l0aW9uIG9mIHRoZSB0YXJnZXQgaW4gdGhlIHN1YmplY3QsIG9yIC0xIGlmIGl0IGRvZXMgbm90IGV4aXN0LlxuICovXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIGZhc3RMYXN0SW5kZXhPZiAoc3ViamVjdCwgdGFyZ2V0LCBmcm9tSW5kZXgpIHtcbiAgdmFyIGxlbmd0aCA9IHN1YmplY3QubGVuZ3RoLFxuICAgICAgaSA9IGxlbmd0aCAtIDE7XG5cbiAgaWYgKHR5cGVvZiBmcm9tSW5kZXggPT09ICdudW1iZXInKSB7XG4gICAgaSA9IGZyb21JbmRleDtcbiAgICBpZiAoaSA8IDApIHtcbiAgICAgIGkgKz0gbGVuZ3RoO1xuICAgIH1cbiAgfVxuICBmb3IgKDsgaSA+PSAwOyBpLS0pIHtcbiAgICBpZiAoc3ViamVjdFtpXSA9PT0gdGFyZ2V0KSB7XG4gICAgICByZXR1cm4gaTtcbiAgICB9XG4gIH1cbiAgcmV0dXJuIC0xO1xufTtcbiIsIid1c2Ugc3RyaWN0JztcblxudmFyIGJpbmRJbnRlcm5hbDMgPSByZXF1aXJlKCcuLi9mdW5jdGlvbi9iaW5kSW50ZXJuYWwzJyk7XG5cbi8qKlxuICogIyBNYXBcbiAqXG4gKiBBIGZhc3QgYC5tYXAoKWAgaW1wbGVtZW50YXRpb24uXG4gKlxuICogQHBhcmFtICB7QXJyYXl9ICAgIHN1YmplY3QgICAgIFRoZSBhcnJheSAob3IgYXJyYXktbGlrZSkgdG8gbWFwIG92ZXIuXG4gKiBAcGFyYW0gIHtGdW5jdGlvbn0gZm4gICAgICAgICAgVGhlIG1hcHBlciBmdW5jdGlvbi5cbiAqIEBwYXJhbSAge09iamVjdH0gICB0aGlzQ29udGV4dCBUaGUgY29udGV4dCBmb3IgdGhlIG1hcHBlci5cbiAqIEByZXR1cm4ge0FycmF5fSAgICAgICAgICAgICAgICBUaGUgYXJyYXkgY29udGFpbmluZyB0aGUgcmVzdWx0cy5cbiAqL1xubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiBmYXN0TWFwIChzdWJqZWN0LCBmbiwgdGhpc0NvbnRleHQpIHtcbiAgdmFyIGxlbmd0aCA9IHN1YmplY3QubGVuZ3RoLFxuICAgICAgcmVzdWx0ID0gbmV3IEFycmF5KGxlbmd0aCksXG4gICAgICBpdGVyYXRvciA9IHRoaXNDb250ZXh0ICE9PSB1bmRlZmluZWQgPyBiaW5kSW50ZXJuYWwzKGZuLCB0aGlzQ29udGV4dCkgOiBmbixcbiAgICAgIGk7XG4gIGZvciAoaSA9IDA7IGkgPCBsZW5ndGg7IGkrKykge1xuICAgIHJlc3VsdFtpXSA9IGl0ZXJhdG9yKHN1YmplY3RbaV0sIGksIHN1YmplY3QpO1xuICB9XG4gIHJldHVybiByZXN1bHQ7XG59O1xuIiwiJ3VzZSBzdHJpY3QnO1xuXG4vKipcbiAqICMgUGx1Y2tcbiAqIFBsdWNrIHRoZSBwcm9wZXJ0eSB3aXRoIHRoZSBnaXZlbiBuYW1lIGZyb20gYW4gYXJyYXkgb2Ygb2JqZWN0cy5cbiAqXG4gKiBAcGFyYW0gIHtBcnJheX0gIGlucHV0IFRoZSB2YWx1ZXMgdG8gcGx1Y2sgZnJvbS5cbiAqIEBwYXJhbSAge1N0cmluZ30gZmllbGQgVGhlIG5hbWUgb2YgdGhlIGZpZWxkIHRvIHBsdWNrLlxuICogQHJldHVybiB7QXJyYXl9ICAgICAgICBUaGUgcGx1Y2tlZCBhcnJheSBvZiB2YWx1ZXMuXG4gKi9cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gZmFzdFBsdWNrIChpbnB1dCwgZmllbGQpIHtcbiAgdmFyIGxlbmd0aCA9IGlucHV0Lmxlbmd0aCxcbiAgICAgIHBsdWNrZWQgPSBbXSxcbiAgICAgIGNvdW50ID0gMCxcbiAgICAgIHZhbHVlLCBpO1xuXG4gIGZvciAoaSA9IDA7IGkgPCBsZW5ndGg7IGkrKykge1xuICAgIHZhbHVlID0gaW5wdXRbaV07XG4gICAgaWYgKHZhbHVlICE9IG51bGwgJiYgdmFsdWVbZmllbGRdICE9PSB1bmRlZmluZWQpIHtcbiAgICAgIHBsdWNrZWRbY291bnQrK10gPSB2YWx1ZVtmaWVsZF07XG4gICAgfVxuICB9XG4gIHJldHVybiBwbHVja2VkO1xufTsiLCIndXNlIHN0cmljdCc7XG5cbnZhciBiaW5kSW50ZXJuYWw0ID0gcmVxdWlyZSgnLi4vZnVuY3Rpb24vYmluZEludGVybmFsNCcpO1xuXG4vKipcbiAqICMgUmVkdWNlXG4gKlxuICogQSBmYXN0IGAucmVkdWNlKClgIGltcGxlbWVudGF0aW9uLlxuICpcbiAqIEBwYXJhbSAge0FycmF5fSAgICBzdWJqZWN0ICAgICAgVGhlIGFycmF5IChvciBhcnJheS1saWtlKSB0byByZWR1Y2UuXG4gKiBAcGFyYW0gIHtGdW5jdGlvbn0gZm4gICAgICAgICAgIFRoZSByZWR1Y2VyIGZ1bmN0aW9uLlxuICogQHBhcmFtICB7bWl4ZWR9ICAgIGluaXRpYWxWYWx1ZSBUaGUgaW5pdGlhbCB2YWx1ZSBmb3IgdGhlIHJlZHVjZXIsIGRlZmF1bHRzIHRvIHN1YmplY3RbMF0uXG4gKiBAcGFyYW0gIHtPYmplY3R9ICAgdGhpc0NvbnRleHQgIFRoZSBjb250ZXh0IGZvciB0aGUgcmVkdWNlci5cbiAqIEByZXR1cm4ge21peGVkfSAgICAgICAgICAgICAgICAgVGhlIGZpbmFsIHJlc3VsdC5cbiAqL1xubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiBmYXN0UmVkdWNlIChzdWJqZWN0LCBmbiwgaW5pdGlhbFZhbHVlLCB0aGlzQ29udGV4dCkge1xuICB2YXIgbGVuZ3RoID0gc3ViamVjdC5sZW5ndGgsXG4gICAgICBpdGVyYXRvciA9IHRoaXNDb250ZXh0ICE9PSB1bmRlZmluZWQgPyBiaW5kSW50ZXJuYWw0KGZuLCB0aGlzQ29udGV4dCkgOiBmbixcbiAgICAgIGksIHJlc3VsdDtcblxuICBpZiAoaW5pdGlhbFZhbHVlID09PSB1bmRlZmluZWQpIHtcbiAgICBpID0gMTtcbiAgICByZXN1bHQgPSBzdWJqZWN0WzBdO1xuICB9XG4gIGVsc2Uge1xuICAgIGkgPSAwO1xuICAgIHJlc3VsdCA9IGluaXRpYWxWYWx1ZTtcbiAgfVxuXG4gIGZvciAoOyBpIDwgbGVuZ3RoOyBpKyspIHtcbiAgICByZXN1bHQgPSBpdGVyYXRvcihyZXN1bHQsIHN1YmplY3RbaV0sIGksIHN1YmplY3QpO1xuICB9XG5cbiAgcmV0dXJuIHJlc3VsdDtcbn07XG4iLCIndXNlIHN0cmljdCc7XG5cbnZhciBiaW5kSW50ZXJuYWw0ID0gcmVxdWlyZSgnLi4vZnVuY3Rpb24vYmluZEludGVybmFsNCcpO1xuXG4vKipcbiAqICMgUmVkdWNlIFJpZ2h0XG4gKlxuICogQSBmYXN0IGAucmVkdWNlUmlnaHQoKWAgaW1wbGVtZW50YXRpb24uXG4gKlxuICogQHBhcmFtICB7QXJyYXl9ICAgIHN1YmplY3QgICAgICBUaGUgYXJyYXkgKG9yIGFycmF5LWxpa2UpIHRvIHJlZHVjZS5cbiAqIEBwYXJhbSAge0Z1bmN0aW9ufSBmbiAgICAgICAgICAgVGhlIHJlZHVjZXIgZnVuY3Rpb24uXG4gKiBAcGFyYW0gIHttaXhlZH0gICAgaW5pdGlhbFZhbHVlIFRoZSBpbml0aWFsIHZhbHVlIGZvciB0aGUgcmVkdWNlciwgZGVmYXVsdHMgdG8gc3ViamVjdFswXS5cbiAqIEBwYXJhbSAge09iamVjdH0gICB0aGlzQ29udGV4dCAgVGhlIGNvbnRleHQgZm9yIHRoZSByZWR1Y2VyLlxuICogQHJldHVybiB7bWl4ZWR9ICAgICAgICAgICAgICAgICBUaGUgZmluYWwgcmVzdWx0LlxuICovXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIGZhc3RSZWR1Y2UgKHN1YmplY3QsIGZuLCBpbml0aWFsVmFsdWUsIHRoaXNDb250ZXh0KSB7XG4gIHZhciBsZW5ndGggPSBzdWJqZWN0Lmxlbmd0aCxcbiAgICAgIGl0ZXJhdG9yID0gdGhpc0NvbnRleHQgIT09IHVuZGVmaW5lZCA/IGJpbmRJbnRlcm5hbDQoZm4sIHRoaXNDb250ZXh0KSA6IGZuLFxuICAgICAgaSwgcmVzdWx0O1xuXG4gIGlmIChpbml0aWFsVmFsdWUgPT09IHVuZGVmaW5lZCkge1xuICAgIGkgPSBsZW5ndGggLSAyO1xuICAgIHJlc3VsdCA9IHN1YmplY3RbbGVuZ3RoIC0gMV07XG4gIH1cbiAgZWxzZSB7XG4gICAgaSA9IGxlbmd0aCAtIDE7XG4gICAgcmVzdWx0ID0gaW5pdGlhbFZhbHVlO1xuICB9XG5cbiAgZm9yICg7IGkgPj0gMDsgaS0tKSB7XG4gICAgcmVzdWx0ID0gaXRlcmF0b3IocmVzdWx0LCBzdWJqZWN0W2ldLCBpLCBzdWJqZWN0KTtcbiAgfVxuXG4gIHJldHVybiByZXN1bHQ7XG59O1xuIiwiJ3VzZSBzdHJpY3QnO1xuXG52YXIgYmluZEludGVybmFsMyA9IHJlcXVpcmUoJy4uL2Z1bmN0aW9uL2JpbmRJbnRlcm5hbDMnKTtcblxuLyoqXG4gKiAjIFNvbWVcbiAqXG4gKiBBIGZhc3QgYC5zb21lKClgIGltcGxlbWVudGF0aW9uLlxuICpcbiAqIEBwYXJhbSAge0FycmF5fSAgICBzdWJqZWN0ICAgICBUaGUgYXJyYXkgKG9yIGFycmF5LWxpa2UpIHRvIGl0ZXJhdGUgb3Zlci5cbiAqIEBwYXJhbSAge0Z1bmN0aW9ufSBmbiAgICAgICAgICBUaGUgdmlzaXRvciBmdW5jdGlvbi5cbiAqIEBwYXJhbSAge09iamVjdH0gICB0aGlzQ29udGV4dCBUaGUgY29udGV4dCBmb3IgdGhlIHZpc2l0b3IuXG4gKiBAcmV0dXJuIHtCb29sZWFufSAgICAgICAgICAgICAgdHJ1ZSBpZiBhdCBsZWFzdCBvbmUgaXRlbSBpbiB0aGUgYXJyYXkgcGFzc2VzIHRoZSB0cnV0aCB0ZXN0LlxuICovXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIGZhc3RTb21lIChzdWJqZWN0LCBmbiwgdGhpc0NvbnRleHQpIHtcbiAgdmFyIGxlbmd0aCA9IHN1YmplY3QubGVuZ3RoLFxuICAgICAgaXRlcmF0b3IgPSB0aGlzQ29udGV4dCAhPT0gdW5kZWZpbmVkID8gYmluZEludGVybmFsMyhmbiwgdGhpc0NvbnRleHQpIDogZm4sXG4gICAgICBpO1xuICBmb3IgKGkgPSAwOyBpIDwgbGVuZ3RoOyBpKyspIHtcbiAgICBpZiAoaXRlcmF0b3Ioc3ViamVjdFtpXSwgaSwgc3ViamVjdCkpIHtcbiAgICAgIHJldHVybiB0cnVlO1xuICAgIH1cbiAgfVxuICByZXR1cm4gZmFsc2U7XG59O1xuIiwiJ3VzZSBzdHJpY3QnO1xuXG52YXIgY2xvbmVBcnJheSA9IHJlcXVpcmUoJy4vYXJyYXkvY2xvbmUnKTtcbnZhciBjbG9uZU9iamVjdCA9IHJlcXVpcmUoJy4vb2JqZWN0L2Nsb25lJyk7XG5cbi8qKlxuICogIyBDbG9uZVxuICpcbiAqIENsb25lIGFuIGl0ZW0uIFByaW1pdGl2ZSB2YWx1ZXMgd2lsbCBiZSByZXR1cm5lZCBkaXJlY3RseSxcbiAqIGFycmF5cyBhbmQgb2JqZWN0cyB3aWxsIGJlIHNoYWxsb3cgY2xvbmVkLiBJZiB5b3Uga25vdyB0aGVcbiAqIHR5cGUgb2YgaW5wdXQgeW91J3JlIGRlYWxpbmcgd2l0aCwgY2FsbCBgLmNsb25lQXJyYXkoKWAgb3IgYC5jbG9uZU9iamVjdCgpYFxuICogaW5zdGVhZC5cbiAqXG4gKiBAcGFyYW0gIHttaXhlZH0gaW5wdXQgVGhlIGlucHV0IHRvIGNsb25lLlxuICogQHJldHVybiB7bWl4ZWR9ICAgICAgIFRoZSBjbG9uZWQgaW5wdXQuXG4gKi9cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gY2xvbmUgKGlucHV0KSB7XG4gIGlmICghaW5wdXQgfHwgdHlwZW9mIGlucHV0ICE9PSAnb2JqZWN0Jykge1xuICAgIHJldHVybiBpbnB1dDtcbiAgfVxuICBlbHNlIGlmIChBcnJheS5pc0FycmF5KGlucHV0KSkge1xuICAgIHJldHVybiBjbG9uZUFycmF5KGlucHV0KTtcbiAgfVxuICBlbHNlIHtcbiAgICByZXR1cm4gY2xvbmVPYmplY3QoaW5wdXQpO1xuICB9XG59O1xuIiwiJ3VzZSBzdHJpY3QnO1xuXG52YXIgZmlsdGVyQXJyYXkgPSByZXF1aXJlKCcuL2FycmF5L2ZpbHRlcicpLFxuICAgIGZpbHRlck9iamVjdCA9IHJlcXVpcmUoJy4vb2JqZWN0L2ZpbHRlcicpO1xuXG4vKipcbiAqICMgRmlsdGVyXG4gKlxuICogQSBmYXN0IGAuZmlsdGVyKClgIGltcGxlbWVudGF0aW9uLlxuICpcbiAqIEBwYXJhbSAge0FycmF5fE9iamVjdH0gc3ViamVjdCAgICAgVGhlIGFycmF5IG9yIG9iamVjdCB0byBmaWx0ZXIuXG4gKiBAcGFyYW0gIHtGdW5jdGlvbn0gICAgIGZuICAgICAgICAgIFRoZSBmaWx0ZXIgZnVuY3Rpb24uXG4gKiBAcGFyYW0gIHtPYmplY3R9ICAgICAgIHRoaXNDb250ZXh0IFRoZSBjb250ZXh0IGZvciB0aGUgZmlsdGVyLlxuICogQHJldHVybiB7QXJyYXl8T2JqZWN0fSAgICAgICAgICAgICBUaGUgYXJyYXkgb3Igb2JqZWN0IGNvbnRhaW5pbmcgdGhlIGZpbHRlcmVkIHJlc3VsdHMuXG4gKi9cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gZmFzdEZpbHRlciAoc3ViamVjdCwgZm4sIHRoaXNDb250ZXh0KSB7XG4gIGlmIChzdWJqZWN0IGluc3RhbmNlb2YgQXJyYXkpIHtcbiAgICByZXR1cm4gZmlsdGVyQXJyYXkoc3ViamVjdCwgZm4sIHRoaXNDb250ZXh0KTtcbiAgfVxuICBlbHNlIHtcbiAgICByZXR1cm4gZmlsdGVyT2JqZWN0KHN1YmplY3QsIGZuLCB0aGlzQ29udGV4dCk7XG4gIH1cbn07IiwiJ3VzZSBzdHJpY3QnO1xuXG52YXIgZm9yRWFjaEFycmF5ID0gcmVxdWlyZSgnLi9hcnJheS9mb3JFYWNoJyksXG4gICAgZm9yRWFjaE9iamVjdCA9IHJlcXVpcmUoJy4vb2JqZWN0L2ZvckVhY2gnKTtcblxuLyoqXG4gKiAjIEZvckVhY2hcbiAqXG4gKiBBIGZhc3QgYC5mb3JFYWNoKClgIGltcGxlbWVudGF0aW9uLlxuICpcbiAqIEBwYXJhbSAge0FycmF5fE9iamVjdH0gc3ViamVjdCAgICAgVGhlIGFycmF5IG9yIG9iamVjdCB0byBpdGVyYXRlIG92ZXIuXG4gKiBAcGFyYW0gIHtGdW5jdGlvbn0gICAgIGZuICAgICAgICAgIFRoZSB2aXNpdG9yIGZ1bmN0aW9uLlxuICogQHBhcmFtICB7T2JqZWN0fSAgICAgICB0aGlzQ29udGV4dCBUaGUgY29udGV4dCBmb3IgdGhlIHZpc2l0b3IuXG4gKi9cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gZmFzdEZvckVhY2ggKHN1YmplY3QsIGZuLCB0aGlzQ29udGV4dCkge1xuICBpZiAoc3ViamVjdCBpbnN0YW5jZW9mIEFycmF5KSB7XG4gICAgcmV0dXJuIGZvckVhY2hBcnJheShzdWJqZWN0LCBmbiwgdGhpc0NvbnRleHQpO1xuICB9XG4gIGVsc2Uge1xuICAgIHJldHVybiBmb3JFYWNoT2JqZWN0KHN1YmplY3QsIGZuLCB0aGlzQ29udGV4dCk7XG4gIH1cbn07IiwiJ3VzZSBzdHJpY3QnO1xuXG52YXIgYXBwbHlXaXRoQ29udGV4dCA9IHJlcXVpcmUoJy4vYXBwbHlXaXRoQ29udGV4dCcpO1xudmFyIGFwcGx5Tm9Db250ZXh0ID0gcmVxdWlyZSgnLi9hcHBseU5vQ29udGV4dCcpO1xuXG4vKipcbiAqICMgQXBwbHlcbiAqXG4gKiBGYXN0ZXIgdmVyc2lvbiBvZiBgRnVuY3Rpb246OmFwcGx5KClgLCBvcHRpbWlzZWQgZm9yIDggYXJndW1lbnRzIG9yIGZld2VyLlxuICpcbiAqXG4gKiBAcGFyYW0gIHtGdW5jdGlvbn0gc3ViamVjdCAgIFRoZSBmdW5jdGlvbiB0byBhcHBseS5cbiAqIEBwYXJhbSAge09iamVjdH0gdGhpc0NvbnRleHQgVGhlIGNvbnRleHQgZm9yIHRoZSBmdW5jdGlvbiwgc2V0IHRvIHVuZGVmaW5lZCBvciBudWxsIGlmIG5vIGNvbnRleHQgaXMgcmVxdWlyZWQuXG4gKiBAcGFyYW0gIHtBcnJheX0gYXJncyAgICAgICAgIFRoZSBhcmd1bWVudHMgZm9yIHRoZSBmdW5jdGlvbi5cbiAqIEByZXR1cm4ge21peGVkfSAgICAgICAgICAgICAgVGhlIHJlc3VsdCBvZiB0aGUgZnVuY3Rpb24gaW52b2NhdGlvbi5cbiAqL1xubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiBmYXN0QXBwbHkgKHN1YmplY3QsIHRoaXNDb250ZXh0LCBhcmdzKSB7XG4gIHJldHVybiB0aGlzQ29udGV4dCAhPT0gdW5kZWZpbmVkID8gYXBwbHlXaXRoQ29udGV4dChzdWJqZWN0LCB0aGlzQ29udGV4dCwgYXJncykgOiBhcHBseU5vQ29udGV4dChzdWJqZWN0LCBhcmdzKTtcbn07XG4iLCIndXNlIHN0cmljdCc7XG5cbi8qKlxuICogSW50ZXJuYWwgaGVscGVyIGZvciBhcHBseWluZyBhIGZ1bmN0aW9uIHdpdGhvdXQgYSBjb250ZXh0LlxuICovXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIGFwcGx5Tm9Db250ZXh0IChzdWJqZWN0LCBhcmdzKSB7XG4gIHN3aXRjaCAoYXJncy5sZW5ndGgpIHtcbiAgICBjYXNlIDA6XG4gICAgICByZXR1cm4gc3ViamVjdCgpO1xuICAgIGNhc2UgMTpcbiAgICAgIHJldHVybiBzdWJqZWN0KGFyZ3NbMF0pO1xuICAgIGNhc2UgMjpcbiAgICAgIHJldHVybiBzdWJqZWN0KGFyZ3NbMF0sIGFyZ3NbMV0pO1xuICAgIGNhc2UgMzpcbiAgICAgIHJldHVybiBzdWJqZWN0KGFyZ3NbMF0sIGFyZ3NbMV0sIGFyZ3NbMl0pO1xuICAgIGNhc2UgNDpcbiAgICAgIHJldHVybiBzdWJqZWN0KGFyZ3NbMF0sIGFyZ3NbMV0sIGFyZ3NbMl0sIGFyZ3NbM10pO1xuICAgIGNhc2UgNTpcbiAgICAgIHJldHVybiBzdWJqZWN0KGFyZ3NbMF0sIGFyZ3NbMV0sIGFyZ3NbMl0sIGFyZ3NbM10sIGFyZ3NbNF0pO1xuICAgIGNhc2UgNjpcbiAgICAgIHJldHVybiBzdWJqZWN0KGFyZ3NbMF0sIGFyZ3NbMV0sIGFyZ3NbMl0sIGFyZ3NbM10sIGFyZ3NbNF0sIGFyZ3NbNV0pO1xuICAgIGNhc2UgNzpcbiAgICAgIHJldHVybiBzdWJqZWN0KGFyZ3NbMF0sIGFyZ3NbMV0sIGFyZ3NbMl0sIGFyZ3NbM10sIGFyZ3NbNF0sIGFyZ3NbNV0sIGFyZ3NbNl0pO1xuICAgIGNhc2UgODpcbiAgICAgIHJldHVybiBzdWJqZWN0KGFyZ3NbMF0sIGFyZ3NbMV0sIGFyZ3NbMl0sIGFyZ3NbM10sIGFyZ3NbNF0sIGFyZ3NbNV0sIGFyZ3NbNl0sIGFyZ3NbN10pO1xuICAgIGRlZmF1bHQ6XG4gICAgICByZXR1cm4gc3ViamVjdC5hcHBseSh1bmRlZmluZWQsIGFyZ3MpO1xuICB9XG59O1xuIiwiJ3VzZSBzdHJpY3QnO1xuXG4vKipcbiAqIEludGVybmFsIGhlbHBlciBmb3IgYXBwbHlpbmcgYSBmdW5jdGlvbiB3aXRoIGEgY29udGV4dC5cbiAqL1xubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiBhcHBseVdpdGhDb250ZXh0IChzdWJqZWN0LCB0aGlzQ29udGV4dCwgYXJncykge1xuICBzd2l0Y2ggKGFyZ3MubGVuZ3RoKSB7XG4gICAgY2FzZSAwOlxuICAgICAgcmV0dXJuIHN1YmplY3QuY2FsbCh0aGlzQ29udGV4dCk7XG4gICAgY2FzZSAxOlxuICAgICAgcmV0dXJuIHN1YmplY3QuY2FsbCh0aGlzQ29udGV4dCwgYXJnc1swXSk7XG4gICAgY2FzZSAyOlxuICAgICAgcmV0dXJuIHN1YmplY3QuY2FsbCh0aGlzQ29udGV4dCwgYXJnc1swXSwgYXJnc1sxXSk7XG4gICAgY2FzZSAzOlxuICAgICAgcmV0dXJuIHN1YmplY3QuY2FsbCh0aGlzQ29udGV4dCwgYXJnc1swXSwgYXJnc1sxXSwgYXJnc1syXSk7XG4gICAgY2FzZSA0OlxuICAgICAgcmV0dXJuIHN1YmplY3QuY2FsbCh0aGlzQ29udGV4dCwgYXJnc1swXSwgYXJnc1sxXSwgYXJnc1syXSwgYXJnc1szXSk7XG4gICAgY2FzZSA1OlxuICAgICAgcmV0dXJuIHN1YmplY3QuY2FsbCh0aGlzQ29udGV4dCwgYXJnc1swXSwgYXJnc1sxXSwgYXJnc1syXSwgYXJnc1szXSwgYXJnc1s0XSk7XG4gICAgY2FzZSA2OlxuICAgICAgcmV0dXJuIHN1YmplY3QuY2FsbCh0aGlzQ29udGV4dCwgYXJnc1swXSwgYXJnc1sxXSwgYXJnc1syXSwgYXJnc1szXSwgYXJnc1s0XSwgYXJnc1s1XSk7XG4gICAgY2FzZSA3OlxuICAgICAgcmV0dXJuIHN1YmplY3QuY2FsbCh0aGlzQ29udGV4dCwgYXJnc1swXSwgYXJnc1sxXSwgYXJnc1syXSwgYXJnc1szXSwgYXJnc1s0XSwgYXJnc1s1XSwgYXJnc1s2XSk7XG4gICAgY2FzZSA4OlxuICAgICAgcmV0dXJuIHN1YmplY3QuY2FsbCh0aGlzQ29udGV4dCwgYXJnc1swXSwgYXJnc1sxXSwgYXJnc1syXSwgYXJnc1szXSwgYXJnc1s0XSwgYXJnc1s1XSwgYXJnc1s2XSwgYXJnc1s3XSk7XG4gICAgZGVmYXVsdDpcbiAgICAgIHJldHVybiBzdWJqZWN0LmFwcGx5KHRoaXNDb250ZXh0LCBhcmdzKTtcbiAgfVxufTtcbiIsIid1c2Ugc3RyaWN0JztcblxudmFyIGFwcGx5V2l0aENvbnRleHQgPSByZXF1aXJlKCcuL2FwcGx5V2l0aENvbnRleHQnKTtcbnZhciBhcHBseU5vQ29udGV4dCA9IHJlcXVpcmUoJy4vYXBwbHlOb0NvbnRleHQnKTtcblxuLyoqXG4gKiAjIEJpbmRcbiAqIEFuYWxvZ3VlIG9mIGBGdW5jdGlvbjo6YmluZCgpYC5cbiAqXG4gKiBgYGBqc1xuICogdmFyIGJpbmQgPSByZXF1aXJlKCdmYXN0LmpzJykuYmluZDtcbiAqIHZhciBib3VuZCA9IGJpbmQobXlmdW5jLCB0aGlzLCAxLCAyLCAzKTtcbiAqXG4gKiBib3VuZCg0KTtcbiAqIGBgYFxuICpcbiAqXG4gKiBAcGFyYW0gIHtGdW5jdGlvbn0gZm4gICAgICAgICAgVGhlIGZ1bmN0aW9uIHdoaWNoIHNob3VsZCBiZSBib3VuZC5cbiAqIEBwYXJhbSAge09iamVjdH0gICB0aGlzQ29udGV4dCBUaGUgY29udGV4dCB0byBiaW5kIHRoZSBmdW5jdGlvbiB0by5cbiAqIEBwYXJhbSAge21peGVkfSAgICBhcmdzLCAuLi4gICBBZGRpdGlvbmFsIGFyZ3VtZW50cyB0byBwcmUtYmluZC5cbiAqIEByZXR1cm4ge0Z1bmN0aW9ufSAgICAgICAgICAgICBUaGUgYm91bmQgZnVuY3Rpb24uXG4gKi9cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gZmFzdEJpbmQgKGZuLCB0aGlzQ29udGV4dCkge1xuICB2YXIgYm91bmRMZW5ndGggPSBhcmd1bWVudHMubGVuZ3RoIC0gMixcbiAgICAgIGJvdW5kQXJncztcblxuICBpZiAoYm91bmRMZW5ndGggPiAwKSB7XG4gICAgYm91bmRBcmdzID0gbmV3IEFycmF5KGJvdW5kTGVuZ3RoKTtcbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IGJvdW5kTGVuZ3RoOyBpKyspIHtcbiAgICAgIGJvdW5kQXJnc1tpXSA9IGFyZ3VtZW50c1tpICsgMl07XG4gICAgfVxuICAgIGlmICh0aGlzQ29udGV4dCAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICByZXR1cm4gZnVuY3Rpb24gKCkge1xuICAgICAgICB2YXIgbGVuZ3RoID0gYXJndW1lbnRzLmxlbmd0aCxcbiAgICAgICAgICAgIGFyZ3MgPSBuZXcgQXJyYXkoYm91bmRMZW5ndGggKyBsZW5ndGgpLFxuICAgICAgICAgICAgaTtcbiAgICAgICAgZm9yIChpID0gMDsgaSA8IGJvdW5kTGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICBhcmdzW2ldID0gYm91bmRBcmdzW2ldO1xuICAgICAgICB9XG4gICAgICAgIGZvciAoaSA9IDA7IGkgPCBsZW5ndGg7IGkrKykge1xuICAgICAgICAgIGFyZ3NbYm91bmRMZW5ndGggKyBpXSA9IGFyZ3VtZW50c1tpXTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gYXBwbHlXaXRoQ29udGV4dChmbiwgdGhpc0NvbnRleHQsIGFyZ3MpO1xuICAgICAgfTtcbiAgICB9XG4gICAgZWxzZSB7XG4gICAgICByZXR1cm4gZnVuY3Rpb24gKCkge1xuICAgICAgICB2YXIgbGVuZ3RoID0gYXJndW1lbnRzLmxlbmd0aCxcbiAgICAgICAgICAgIGFyZ3MgPSBuZXcgQXJyYXkoYm91bmRMZW5ndGggKyBsZW5ndGgpLFxuICAgICAgICAgICAgaTtcbiAgICAgICAgZm9yIChpID0gMDsgaSA8IGJvdW5kTGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICBhcmdzW2ldID0gYm91bmRBcmdzW2ldO1xuICAgICAgICB9XG4gICAgICAgIGZvciAoaSA9IDA7IGkgPCBsZW5ndGg7IGkrKykge1xuICAgICAgICAgIGFyZ3NbYm91bmRMZW5ndGggKyBpXSA9IGFyZ3VtZW50c1tpXTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gYXBwbHlOb0NvbnRleHQoZm4sIGFyZ3MpO1xuICAgICAgfTtcbiAgICB9XG4gIH1cbiAgaWYgKHRoaXNDb250ZXh0ICE9PSB1bmRlZmluZWQpIHtcbiAgICByZXR1cm4gZnVuY3Rpb24gKCkge1xuICAgICAgcmV0dXJuIGFwcGx5V2l0aENvbnRleHQoZm4sIHRoaXNDb250ZXh0LCBhcmd1bWVudHMpO1xuICAgIH07XG4gIH1cbiAgZWxzZSB7XG4gICAgcmV0dXJuIGZ1bmN0aW9uICgpIHtcbiAgICAgIHJldHVybiBhcHBseU5vQ29udGV4dChmbiwgYXJndW1lbnRzKTtcbiAgICB9O1xuICB9XG59O1xuIiwiJ3VzZSBzdHJpY3QnO1xuXG4vKipcbiAqIEludGVybmFsIGhlbHBlciB0byBiaW5kIGEgZnVuY3Rpb24ga25vd24gdG8gaGF2ZSAzIGFyZ3VtZW50c1xuICogdG8gYSBnaXZlbiBjb250ZXh0LlxuICovXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIGJpbmRJbnRlcm5hbDMgKGZ1bmMsIHRoaXNDb250ZXh0KSB7XG4gIHJldHVybiBmdW5jdGlvbiAoYSwgYiwgYykge1xuICAgIHJldHVybiBmdW5jLmNhbGwodGhpc0NvbnRleHQsIGEsIGIsIGMpO1xuICB9O1xufTtcbiIsIid1c2Ugc3RyaWN0JztcblxuLyoqXG4gKiBJbnRlcm5hbCBoZWxwZXIgdG8gYmluZCBhIGZ1bmN0aW9uIGtub3duIHRvIGhhdmUgNCBhcmd1bWVudHNcbiAqIHRvIGEgZ2l2ZW4gY29udGV4dC5cbiAqL1xubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiBiaW5kSW50ZXJuYWw0IChmdW5jLCB0aGlzQ29udGV4dCkge1xuICByZXR1cm4gZnVuY3Rpb24gKGEsIGIsIGMsIGQpIHtcbiAgICByZXR1cm4gZnVuYy5jYWxsKHRoaXNDb250ZXh0LCBhLCBiLCBjLCBkKTtcbiAgfTtcbn07XG4iLCIndXNlIHN0cmljdCc7XG5cbmV4cG9ydHMuYXBwbHkgPSByZXF1aXJlKCcuL2FwcGx5Jyk7XG5leHBvcnRzLmJpbmQgPSByZXF1aXJlKCcuL2JpbmQnKTtcbmV4cG9ydHMucGFydGlhbCA9IHJlcXVpcmUoJy4vcGFydGlhbCcpO1xuZXhwb3J0cy5wYXJ0aWFsQ29uc3RydWN0b3IgPSByZXF1aXJlKCcuL3BhcnRpYWxDb25zdHJ1Y3RvcicpO1xuZXhwb3J0cy50cnkgPSByZXF1aXJlKCcuL3RyeScpO1xuIiwiJ3VzZSBzdHJpY3QnO1xuXG52YXIgYXBwbHlXaXRoQ29udGV4dCA9IHJlcXVpcmUoJy4vYXBwbHlXaXRoQ29udGV4dCcpO1xuXG4vKipcbiAqICMgUGFydGlhbCBBcHBsaWNhdGlvblxuICpcbiAqIFBhcnRpYWxseSBhcHBseSBhIGZ1bmN0aW9uLiBUaGlzIGlzIHNpbWlsYXIgdG8gYC5iaW5kKClgLFxuICogYnV0IHdpdGggb25lIGltcG9ydGFudCBkaWZmZXJlbmNlIC0gdGhlIHJldHVybmVkIGZ1bmN0aW9uIGlzIG5vdCBib3VuZFxuICogdG8gYSBwYXJ0aWN1bGFyIGNvbnRleHQuIFRoaXMgbWFrZXMgaXQgZWFzeSB0byBhZGQgcGFydGlhbGx5XG4gKiBhcHBsaWVkIG1ldGhvZHMgdG8gb2JqZWN0cy4gSWYgeW91IG5lZWQgdG8gYmluZCB0byBhIGNvbnRleHQsXG4gKiB1c2UgYC5iaW5kKClgIGluc3RlYWQuXG4gKlxuICogPiBOb3RlOiBUaGlzIGZ1bmN0aW9uIGRvZXMgbm90IHN1cHBvcnQgcGFydGlhbCBhcHBsaWNhdGlvbiBmb3JcbiAqIGNvbnN0cnVjdG9ycywgZm9yIHRoYXQgc2VlIGBwYXJ0aWFsQ29uc3RydWN0b3IoKWBcbiAqXG4gKlxuICogQHBhcmFtICB7RnVuY3Rpb259IGZuICAgICAgICAgIFRoZSBmdW5jdGlvbiB0byBwYXJ0aWFsbHkgYXBwbHkuXG4gKiBAcGFyYW0gIHttaXhlZH0gICAgYXJncywgLi4uICAgQXJndW1lbnRzIHRvIHByZS1iaW5kLlxuICogQHJldHVybiB7RnVuY3Rpb259ICAgICAgICAgICAgIFRoZSBwYXJ0aWFsbHkgYXBwbGllZCBmdW5jdGlvbi5cbiAqL1xubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiBmYXN0UGFydGlhbCAoZm4pIHtcbiAgdmFyIGJvdW5kTGVuZ3RoID0gYXJndW1lbnRzLmxlbmd0aCAtIDEsXG4gICAgICBib3VuZEFyZ3M7XG5cbiAgYm91bmRBcmdzID0gbmV3IEFycmF5KGJvdW5kTGVuZ3RoKTtcbiAgZm9yICh2YXIgaSA9IDA7IGkgPCBib3VuZExlbmd0aDsgaSsrKSB7XG4gICAgYm91bmRBcmdzW2ldID0gYXJndW1lbnRzW2kgKyAxXTtcbiAgfVxuICByZXR1cm4gZnVuY3Rpb24gKCkge1xuICAgIHZhciBsZW5ndGggPSBhcmd1bWVudHMubGVuZ3RoLFxuICAgICAgICBhcmdzID0gbmV3IEFycmF5KGJvdW5kTGVuZ3RoICsgbGVuZ3RoKSxcbiAgICAgICAgaTtcbiAgICBmb3IgKGkgPSAwOyBpIDwgYm91bmRMZW5ndGg7IGkrKykge1xuICAgICAgYXJnc1tpXSA9IGJvdW5kQXJnc1tpXTtcbiAgICB9XG4gICAgZm9yIChpID0gMDsgaSA8IGxlbmd0aDsgaSsrKSB7XG4gICAgICBhcmdzW2JvdW5kTGVuZ3RoICsgaV0gPSBhcmd1bWVudHNbaV07XG4gICAgfVxuICAgIHJldHVybiBhcHBseVdpdGhDb250ZXh0KGZuLCB0aGlzLCBhcmdzKTtcbiAgfTtcbn07XG4iLCIndXNlIHN0cmljdCc7XG5cbnZhciBhcHBseVdpdGhDb250ZXh0ID0gcmVxdWlyZSgnLi9hcHBseVdpdGhDb250ZXh0Jyk7XG5cbi8qKlxuICogIyBQYXJ0aWFsIENvbnN0cnVjdG9yXG4gKlxuICogUGFydGlhbGx5IGFwcGx5IGEgY29uc3RydWN0b3IgZnVuY3Rpb24uIFRoZSByZXR1cm5lZCBmdW5jdGlvblxuICogd2lsbCB3b3JrIHdpdGggb3Igd2l0aG91dCB0aGUgYG5ld2Aga2V5d29yZC5cbiAqXG4gKlxuICogQHBhcmFtICB7RnVuY3Rpb259IGZuICAgICAgICAgIFRoZSBjb25zdHJ1Y3RvciBmdW5jdGlvbiB0byBwYXJ0aWFsbHkgYXBwbHkuXG4gKiBAcGFyYW0gIHttaXhlZH0gICAgYXJncywgLi4uICAgQXJndW1lbnRzIHRvIHByZS1iaW5kLlxuICogQHJldHVybiB7RnVuY3Rpb259ICAgICAgICAgICAgIFRoZSBwYXJ0aWFsbHkgYXBwbGllZCBjb25zdHJ1Y3Rvci5cbiAqL1xubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiBmYXN0UGFydGlhbENvbnN0cnVjdG9yIChmbikge1xuICB2YXIgYm91bmRMZW5ndGggPSBhcmd1bWVudHMubGVuZ3RoIC0gMSxcbiAgICAgIGJvdW5kQXJncztcblxuICBib3VuZEFyZ3MgPSBuZXcgQXJyYXkoYm91bmRMZW5ndGgpO1xuICBmb3IgKHZhciBpID0gMDsgaSA8IGJvdW5kTGVuZ3RoOyBpKyspIHtcbiAgICBib3VuZEFyZ3NbaV0gPSBhcmd1bWVudHNbaSArIDFdO1xuICB9XG4gIHJldHVybiBmdW5jdGlvbiBwYXJ0aWFsZWQgKCkge1xuICAgIHZhciBsZW5ndGggPSBhcmd1bWVudHMubGVuZ3RoLFxuICAgICAgICBhcmdzID0gbmV3IEFycmF5KGJvdW5kTGVuZ3RoICsgbGVuZ3RoKSxcbiAgICAgICAgaTtcbiAgICBmb3IgKGkgPSAwOyBpIDwgYm91bmRMZW5ndGg7IGkrKykge1xuICAgICAgYXJnc1tpXSA9IGJvdW5kQXJnc1tpXTtcbiAgICB9XG4gICAgZm9yIChpID0gMDsgaSA8IGxlbmd0aDsgaSsrKSB7XG4gICAgICBhcmdzW2JvdW5kTGVuZ3RoICsgaV0gPSBhcmd1bWVudHNbaV07XG4gICAgfVxuXG4gICAgdmFyIHRoaXNDb250ZXh0ID0gT2JqZWN0LmNyZWF0ZShmbi5wcm90b3R5cGUpLFxuICAgICAgICByZXN1bHQgPSBhcHBseVdpdGhDb250ZXh0KGZuLCB0aGlzQ29udGV4dCwgYXJncyk7XG5cbiAgICBpZiAocmVzdWx0ICE9IG51bGwgJiYgKHR5cGVvZiByZXN1bHQgPT09ICdvYmplY3QnIHx8IHR5cGVvZiByZXN1bHQgPT09ICdmdW5jdGlvbicpKSB7XG4gICAgICByZXR1cm4gcmVzdWx0O1xuICAgIH1cbiAgICBlbHNlIHtcbiAgICAgIHJldHVybiB0aGlzQ29udGV4dDtcbiAgICB9XG4gIH07XG59O1xuIiwiJ3VzZSBzdHJpY3QnO1xuXG4vKipcbiAqICMgVHJ5XG4gKlxuICogQWxsb3dzIGZ1bmN0aW9ucyB0byBiZSBvcHRpbWlzZWQgYnkgaXNvbGF0aW5nIGB0cnkge30gY2F0Y2ggKGUpIHt9YCBibG9ja3NcbiAqIG91dHNpZGUgdGhlIGZ1bmN0aW9uIGRlY2xhcmF0aW9uLiBSZXR1cm5zIGVpdGhlciB0aGUgcmVzdWx0IG9mIHRoZSBmdW5jdGlvbiBvciBhbiBFcnJvclxuICogb2JqZWN0IGlmIG9uZSB3YXMgdGhyb3duLiBUaGUgY2FsbGVyIHNob3VsZCB0aGVuIGNoZWNrIGZvciBgcmVzdWx0IGluc3RhbmNlb2YgRXJyb3JgLlxuICpcbiAqIGBgYGpzXG4gKiB2YXIgcmVzdWx0ID0gZmFzdC50cnkobXlGdW5jdGlvbik7XG4gKiBpZiAocmVzdWx0IGluc3RhbmNlb2YgRXJyb3IpIHtcbiAqICAgIGNvbnNvbGUubG9nKCdzb21ldGhpbmcgd2VudCB3cm9uZycpO1xuICogfVxuICogZWxzZSB7XG4gKiAgIGNvbnNvbGUubG9nKCdyZXN1bHQ6JywgcmVzdWx0KTtcbiAqIH1cbiAqIGBgYFxuICpcbiAqIEBwYXJhbSAge0Z1bmN0aW9ufSBmbiBUaGUgZnVuY3Rpb24gdG8gaW52b2tlLlxuICogQHJldHVybiB7bWl4ZWR9ICAgICAgIFRoZSByZXN1bHQgb2YgdGhlIGZ1bmN0aW9uLCBvciBhbiBgRXJyb3JgIG9iamVjdC5cbiAqL1xubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiBmYXN0VHJ5IChmbikge1xuICB0cnkge1xuICAgIHJldHVybiBmbigpO1xuICB9XG4gIGNhdGNoIChlKSB7XG4gICAgaWYgKCEoZSBpbnN0YW5jZW9mIEVycm9yKSkge1xuICAgICAgcmV0dXJuIG5ldyBFcnJvcihlKTtcbiAgICB9XG4gICAgZWxzZSB7XG4gICAgICByZXR1cm4gZTtcbiAgICB9XG4gIH1cbn07XG4iLCIndXNlIHN0cmljdCc7XG5cbi8qKlxuICogIyBDb25zdHJ1Y3RvclxuICpcbiAqIFByb3ZpZGVkIGFzIGEgY29udmVuaWVudCB3cmFwcGVyIGFyb3VuZCBGYXN0IGZ1bmN0aW9ucy5cbiAqXG4gKiBgYGBqc1xuICogdmFyIGFyciA9IGZhc3QoWzEsMiwzLDQsNSw2XSk7XG4gKlxuICogdmFyIHJlc3VsdCA9IGFyci5maWx0ZXIoZnVuY3Rpb24gKGl0ZW0pIHtcbiAqICAgcmV0dXJuIGl0ZW0gJSAyID09PSAwO1xuICogfSk7XG4gKlxuICogcmVzdWx0IGluc3RhbmNlb2YgRmFzdDsgLy8gdHJ1ZVxuICogcmVzdWx0Lmxlbmd0aDsgLy8gM1xuICogYGBgXG4gKlxuICpcbiAqIEBwYXJhbSB7QXJyYXl9IHZhbHVlIFRoZSB2YWx1ZSB0byB3cmFwLlxuICovXG5mdW5jdGlvbiBGYXN0ICh2YWx1ZSkge1xuICBpZiAoISh0aGlzIGluc3RhbmNlb2YgRmFzdCkpIHtcbiAgICByZXR1cm4gbmV3IEZhc3QodmFsdWUpO1xuICB9XG4gIHRoaXMudmFsdWUgPSB2YWx1ZSB8fCBbXTtcbn1cblxubW9kdWxlLmV4cG9ydHMgPSBleHBvcnRzID0gRmFzdDtcblxuRmFzdC5hcnJheSA9IHJlcXVpcmUoJy4vYXJyYXknKTtcbkZhc3RbJ2Z1bmN0aW9uJ10gPSBGYXN0LmZuID0gcmVxdWlyZSgnLi9mdW5jdGlvbicpO1xuRmFzdC5vYmplY3QgPSByZXF1aXJlKCcuL29iamVjdCcpO1xuRmFzdC5zdHJpbmcgPSByZXF1aXJlKCcuL3N0cmluZycpO1xuXG5cbkZhc3QuYXBwbHkgPSBGYXN0WydmdW5jdGlvbiddLmFwcGx5O1xuRmFzdC5iaW5kID0gRmFzdFsnZnVuY3Rpb24nXS5iaW5kO1xuRmFzdC5wYXJ0aWFsID0gRmFzdFsnZnVuY3Rpb24nXS5wYXJ0aWFsO1xuRmFzdC5wYXJ0aWFsQ29uc3RydWN0b3IgPSBGYXN0WydmdW5jdGlvbiddLnBhcnRpYWxDb25zdHJ1Y3RvcjtcbkZhc3RbJ3RyeSddID0gRmFzdC5hdHRlbXB0ID0gRmFzdFsnZnVuY3Rpb24nXVsndHJ5J107XG5cbkZhc3QuYXNzaWduID0gRmFzdC5vYmplY3QuYXNzaWduO1xuRmFzdC5jbG9uZU9iamVjdCA9IEZhc3Qub2JqZWN0LmNsb25lOyAvLyBAZGVwcmVjYXRlZCB1c2UgZmFzdC5vYmplY3QuY2xvbmUoKVxuRmFzdC5rZXlzID0gRmFzdC5vYmplY3Qua2V5cztcbkZhc3QudmFsdWVzID0gRmFzdC5vYmplY3QudmFsdWVzO1xuXG5cbkZhc3QuY2xvbmUgPSByZXF1aXJlKCcuL2Nsb25lJyk7XG5GYXN0Lm1hcCA9IHJlcXVpcmUoJy4vbWFwJyk7XG5GYXN0LmZpbHRlciA9IHJlcXVpcmUoJy4vZmlsdGVyJyk7XG5GYXN0LmZvckVhY2ggPSByZXF1aXJlKCcuL2ZvckVhY2gnKTtcbkZhc3QucmVkdWNlID0gcmVxdWlyZSgnLi9yZWR1Y2UnKTtcbkZhc3QucmVkdWNlUmlnaHQgPSByZXF1aXJlKCcuL3JlZHVjZVJpZ2h0Jyk7XG5cblxuRmFzdC5jbG9uZUFycmF5ID0gRmFzdC5hcnJheS5jbG9uZTsgLy8gQGRlcHJlY2F0ZWQgdXNlIGZhc3QuYXJyYXkuY2xvbmUoKVxuXG5GYXN0LmNvbmNhdCA9IEZhc3QuYXJyYXkuY29uY2F0O1xuRmFzdC5zb21lID0gRmFzdC5hcnJheS5zb21lO1xuRmFzdC5ldmVyeSA9IEZhc3QuYXJyYXkuZXZlcnk7XG5GYXN0LmluZGV4T2YgPSBGYXN0LmFycmF5LmluZGV4T2Y7XG5GYXN0Lmxhc3RJbmRleE9mID0gRmFzdC5hcnJheS5sYXN0SW5kZXhPZjtcbkZhc3QucGx1Y2sgPSBGYXN0LmFycmF5LnBsdWNrO1xuRmFzdC5maWxsID0gRmFzdC5hcnJheS5maWxsO1xuXG5GYXN0LmludGVybiA9IEZhc3Quc3RyaW5nLmludGVybjtcblxuXG4vKipcbiAqICMgQ29uY2F0XG4gKlxuICogQ29uY2F0ZW5hdGUgbXVsdGlwbGUgYXJyYXlzLlxuICpcbiAqIEBwYXJhbSAge0FycmF5fG1peGVkfSBpdGVtLCAuLi4gVGhlIGl0ZW0ocykgdG8gY29uY2F0ZW5hdGUuXG4gKiBAcmV0dXJuIHtGYXN0fSAgICAgICAgICAgICAgICAgIEEgbmV3IEZhc3Qgb2JqZWN0LCBjb250YWluaW5nIHRoZSByZXN1bHRzLlxuICovXG5GYXN0LnByb3RvdHlwZS5jb25jYXQgPSBmdW5jdGlvbiBGYXN0JGNvbmNhdCAoKSB7XG4gIHZhciBsZW5ndGggPSB0aGlzLnZhbHVlLmxlbmd0aCxcbiAgICAgIGFyciA9IG5ldyBBcnJheShsZW5ndGgpLFxuICAgICAgaSwgaXRlbSwgY2hpbGRMZW5ndGgsIGo7XG5cbiAgZm9yIChpID0gMDsgaSA8IGxlbmd0aDsgaSsrKSB7XG4gICAgYXJyW2ldID0gdGhpcy52YWx1ZVtpXTtcbiAgfVxuXG4gIGxlbmd0aCA9IGFyZ3VtZW50cy5sZW5ndGg7XG4gIGZvciAoaSA9IDA7IGkgPCBsZW5ndGg7IGkrKykge1xuICAgIGl0ZW0gPSBhcmd1bWVudHNbaV07XG4gICAgaWYgKEFycmF5LmlzQXJyYXkoaXRlbSkpIHtcbiAgICAgIGNoaWxkTGVuZ3RoID0gaXRlbS5sZW5ndGg7XG4gICAgICBmb3IgKGogPSAwOyBqIDwgY2hpbGRMZW5ndGg7IGorKykge1xuICAgICAgICBhcnIucHVzaChpdGVtW2pdKTtcbiAgICAgIH1cbiAgICB9XG4gICAgZWxzZSB7XG4gICAgICBhcnIucHVzaChpdGVtKTtcbiAgICB9XG4gIH1cbiAgcmV0dXJuIG5ldyBGYXN0KGFycik7XG59O1xuXG4vKipcbiAqIEZhc3QgTWFwXG4gKlxuICogQHBhcmFtICB7RnVuY3Rpb259IGZuICAgICAgICAgIFRoZSB2aXNpdG9yIGZ1bmN0aW9uLlxuICogQHBhcmFtICB7T2JqZWN0fSAgIHRoaXNDb250ZXh0IFRoZSBjb250ZXh0IGZvciB0aGUgdmlzaXRvciwgaWYgYW55LlxuICogQHJldHVybiB7RmFzdH0gICAgICAgICAgICAgICAgIEEgbmV3IEZhc3Qgb2JqZWN0LCBjb250YWluaW5nIHRoZSByZXN1bHRzLlxuICovXG5GYXN0LnByb3RvdHlwZS5tYXAgPSBmdW5jdGlvbiBGYXN0JG1hcCAoZm4sIHRoaXNDb250ZXh0KSB7XG4gIHJldHVybiBuZXcgRmFzdChGYXN0Lm1hcCh0aGlzLnZhbHVlLCBmbiwgdGhpc0NvbnRleHQpKTtcbn07XG5cbi8qKlxuICogRmFzdCBGaWx0ZXJcbiAqXG4gKiBAcGFyYW0gIHtGdW5jdGlvbn0gZm4gICAgICAgICAgVGhlIGZpbHRlciBmdW5jdGlvbi5cbiAqIEBwYXJhbSAge09iamVjdH0gICB0aGlzQ29udGV4dCBUaGUgY29udGV4dCBmb3IgdGhlIGZpbHRlciBmdW5jdGlvbiwgaWYgYW55LlxuICogQHJldHVybiB7RmFzdH0gICAgICAgICAgICAgICAgIEEgbmV3IEZhc3Qgb2JqZWN0LCBjb250YWluaW5nIHRoZSByZXN1bHRzLlxuICovXG5GYXN0LnByb3RvdHlwZS5maWx0ZXIgPSBmdW5jdGlvbiBGYXN0JGZpbHRlciAoZm4sIHRoaXNDb250ZXh0KSB7XG4gIHJldHVybiBuZXcgRmFzdChGYXN0LmZpbHRlcih0aGlzLnZhbHVlLCBmbiwgdGhpc0NvbnRleHQpKTtcbn07XG5cbi8qKlxuICogRmFzdCBSZWR1Y2VcbiAqXG4gKiBAcGFyYW0gIHtGdW5jdGlvbn0gZm4gICAgICAgICAgIFRoZSByZWR1Y2VyIGZ1bmN0aW9uLlxuICogQHBhcmFtICB7bWl4ZWR9ICAgIGluaXRpYWxWYWx1ZSBUaGUgaW5pdGlhbCB2YWx1ZSwgaWYgYW55LlxuICogQHBhcmFtICB7T2JqZWN0fSAgIHRoaXNDb250ZXh0ICBUaGUgY29udGV4dCBmb3IgdGhlIHJlZHVjZXIsIGlmIGFueS5cbiAqIEByZXR1cm4ge21peGVkfSAgICAgICAgICAgICAgICAgVGhlIGZpbmFsIHJlc3VsdC5cbiAqL1xuRmFzdC5wcm90b3R5cGUucmVkdWNlID0gZnVuY3Rpb24gRmFzdCRyZWR1Y2UgKGZuLCBpbml0aWFsVmFsdWUsIHRoaXNDb250ZXh0KSB7XG4gIHJldHVybiBGYXN0LnJlZHVjZSh0aGlzLnZhbHVlLCBmbiwgaW5pdGlhbFZhbHVlLCB0aGlzQ29udGV4dCk7XG59O1xuXG5cbi8qKlxuICogRmFzdCBSZWR1Y2UgUmlnaHRcbiAqXG4gKiBAcGFyYW0gIHtGdW5jdGlvbn0gZm4gICAgICAgICAgIFRoZSByZWR1Y2VyIGZ1bmN0aW9uLlxuICogQHBhcmFtICB7bWl4ZWR9ICAgIGluaXRpYWxWYWx1ZSBUaGUgaW5pdGlhbCB2YWx1ZSwgaWYgYW55LlxuICogQHBhcmFtICB7T2JqZWN0fSAgIHRoaXNDb250ZXh0ICBUaGUgY29udGV4dCBmb3IgdGhlIHJlZHVjZXIsIGlmIGFueS5cbiAqIEByZXR1cm4ge21peGVkfSAgICAgICAgICAgICAgICAgVGhlIGZpbmFsIHJlc3VsdC5cbiAqL1xuRmFzdC5wcm90b3R5cGUucmVkdWNlUmlnaHQgPSBmdW5jdGlvbiBGYXN0JHJlZHVjZVJpZ2h0IChmbiwgaW5pdGlhbFZhbHVlLCB0aGlzQ29udGV4dCkge1xuICByZXR1cm4gRmFzdC5yZWR1Y2VSaWdodCh0aGlzLnZhbHVlLCBmbiwgaW5pdGlhbFZhbHVlLCB0aGlzQ29udGV4dCk7XG59O1xuXG4vKipcbiAqIEZhc3QgRm9yIEVhY2hcbiAqXG4gKiBAcGFyYW0gIHtGdW5jdGlvbn0gZm4gICAgICAgICAgVGhlIHZpc2l0b3IgZnVuY3Rpb24uXG4gKiBAcGFyYW0gIHtPYmplY3R9ICAgdGhpc0NvbnRleHQgVGhlIGNvbnRleHQgZm9yIHRoZSB2aXNpdG9yLCBpZiBhbnkuXG4gKiBAcmV0dXJuIHtGYXN0fSAgICAgICAgICAgICAgICAgVGhlIEZhc3QgaW5zdGFuY2UuXG4gKi9cbkZhc3QucHJvdG90eXBlLmZvckVhY2ggPSBmdW5jdGlvbiBGYXN0JGZvckVhY2ggKGZuLCB0aGlzQ29udGV4dCkge1xuICBGYXN0LmZvckVhY2godGhpcy52YWx1ZSwgZm4sIHRoaXNDb250ZXh0KTtcbiAgcmV0dXJuIHRoaXM7XG59O1xuXG4vKipcbiAqIEZhc3QgU29tZVxuICpcbiAqIEBwYXJhbSAge0Z1bmN0aW9ufSBmbiAgICAgICAgICBUaGUgbWF0Y2hlciBwcmVkaWNhdGUuXG4gKiBAcGFyYW0gIHtPYmplY3R9ICAgdGhpc0NvbnRleHQgVGhlIGNvbnRleHQgZm9yIHRoZSBtYXRjaGVyLCBpZiBhbnkuXG4gKiBAcmV0dXJuIHtCb29sZWFufSAgICAgICAgICAgICAgVHJ1ZSBpZiBhdCBsZWFzdCBvbmUgZWxlbWVudCBtYXRjaGVzLlxuICovXG5GYXN0LnByb3RvdHlwZS5zb21lID0gZnVuY3Rpb24gRmFzdCRzb21lIChmbiwgdGhpc0NvbnRleHQpIHtcbiAgcmV0dXJuIEZhc3Quc29tZSh0aGlzLnZhbHVlLCBmbiwgdGhpc0NvbnRleHQpO1xufTtcblxuLyoqXG4gKiBGYXN0IEV2ZXJ5XG4gKlxuICogQHBhcmFtICB7RnVuY3Rpb259IGZuICAgICAgICAgIFRoZSBtYXRjaGVyIHByZWRpY2F0ZS5cbiAqIEBwYXJhbSAge09iamVjdH0gICB0aGlzQ29udGV4dCBUaGUgY29udGV4dCBmb3IgdGhlIG1hdGNoZXIsIGlmIGFueS5cbiAqIEByZXR1cm4ge0Jvb2xlYW59ICAgICAgICAgICAgICBUcnVlIGlmIGF0IGFsbCBlbGVtZW50cyBtYXRjaC5cbiAqL1xuRmFzdC5wcm90b3R5cGUuZXZlcnkgPSBmdW5jdGlvbiBGYXN0JGV2ZXJ5IChmbiwgdGhpc0NvbnRleHQpIHtcbiAgcmV0dXJuIEZhc3Quc29tZSh0aGlzLnZhbHVlLCBmbiwgdGhpc0NvbnRleHQpO1xufTtcblxuLyoqXG4gKiBGYXN0IEluZGV4IE9mXG4gKlxuICogQHBhcmFtICB7bWl4ZWR9ICB0YXJnZXQgICAgVGhlIHRhcmdldCB0byBsb29rdXAuXG4gKiBAcGFyYW0gIHtOdW1iZXJ9IGZyb21JbmRleCBUaGUgaW5kZXggdG8gc3RhcnQgc2VhcmNoaW5nIGZyb20sIGlmIGtub3duLlxuICogQHJldHVybiB7TnVtYmVyfSAgICAgICAgICAgVGhlIGluZGV4IG9mIHRoZSBpdGVtLCBvciAtMSBpZiBubyBtYXRjaCBmb3VuZC5cbiAqL1xuRmFzdC5wcm90b3R5cGUuaW5kZXhPZiA9IGZ1bmN0aW9uIEZhc3QkaW5kZXhPZiAodGFyZ2V0LCBmcm9tSW5kZXgpIHtcbiAgcmV0dXJuIEZhc3QuaW5kZXhPZih0aGlzLnZhbHVlLCB0YXJnZXQsIGZyb21JbmRleCk7XG59O1xuXG5cbi8qKlxuICogRmFzdCBMYXN0IEluZGV4IE9mXG4gKlxuICogQHBhcmFtICB7bWl4ZWR9ICB0YXJnZXQgICAgVGhlIHRhcmdldCB0byBsb29rdXAuXG4gKiBAcGFyYW0gIHtOdW1iZXJ9IGZyb21JbmRleCBUaGUgaW5kZXggdG8gc3RhcnQgc2VhcmNoaW5nIGZyb20sIGlmIGtub3duLlxuICogQHJldHVybiB7TnVtYmVyfSAgICAgICAgICAgVGhlIGxhc3QgaW5kZXggb2YgdGhlIGl0ZW0sIG9yIC0xIGlmIG5vIG1hdGNoIGZvdW5kLlxuICovXG5GYXN0LnByb3RvdHlwZS5sYXN0SW5kZXhPZiA9IGZ1bmN0aW9uIEZhc3QkbGFzdEluZGV4T2YgKHRhcmdldCwgZnJvbUluZGV4KSB7XG4gIHJldHVybiBGYXN0Lmxhc3RJbmRleE9mKHRoaXMudmFsdWUsIHRhcmdldCwgZnJvbUluZGV4KTtcbn07XG5cbi8qKlxuICogUmV2ZXJzZVxuICpcbiAqIEByZXR1cm4ge0Zhc3R9IEEgbmV3IEZhc3QgaW5zdGFuY2UsIHdpdGggdGhlIGNvbnRlbnRzIHJldmVyc2VkLlxuICovXG5GYXN0LnByb3RvdHlwZS5yZXZlcnNlID0gZnVuY3Rpb24gRmFzdCRyZXZlcnNlICgpIHtcbiAgcmV0dXJuIG5ldyBGYXN0KHRoaXMudmFsdWUucmV2ZXJzZSgpKTtcbn07XG5cbi8qKlxuICogVmFsdWUgT2ZcbiAqXG4gKiBAcmV0dXJuIHtBcnJheX0gVGhlIHdyYXBwZWQgdmFsdWUuXG4gKi9cbkZhc3QucHJvdG90eXBlLnZhbHVlT2YgPSBmdW5jdGlvbiBGYXN0JHZhbHVlT2YgKCkge1xuICByZXR1cm4gdGhpcy52YWx1ZTtcbn07XG5cbi8qKlxuICogVG8gSlNPTlxuICpcbiAqIEByZXR1cm4ge0FycmF5fSBUaGUgd3JhcHBlZCB2YWx1ZS5cbiAqL1xuRmFzdC5wcm90b3R5cGUudG9KU09OID0gZnVuY3Rpb24gRmFzdCR0b0pTT04gKCkge1xuICByZXR1cm4gdGhpcy52YWx1ZTtcbn07XG5cbi8qKlxuICogSXRlbSBMZW5ndGhcbiAqL1xuT2JqZWN0LmRlZmluZVByb3BlcnR5KEZhc3QucHJvdG90eXBlLCAnbGVuZ3RoJywge1xuICBnZXQ6IGZ1bmN0aW9uICgpIHtcbiAgICByZXR1cm4gdGhpcy52YWx1ZS5sZW5ndGg7XG4gIH1cbn0pO1xuIiwiJ3VzZSBzdHJpY3QnO1xuXG52YXIgbWFwQXJyYXkgPSByZXF1aXJlKCcuL2FycmF5L21hcCcpLFxuICAgIG1hcE9iamVjdCA9IHJlcXVpcmUoJy4vb2JqZWN0L21hcCcpO1xuXG4vKipcbiAqICMgTWFwXG4gKlxuICogQSBmYXN0IGAubWFwKClgIGltcGxlbWVudGF0aW9uLlxuICpcbiAqIEBwYXJhbSAge0FycmF5fE9iamVjdH0gc3ViamVjdCAgICAgVGhlIGFycmF5IG9yIG9iamVjdCB0byBtYXAgb3Zlci5cbiAqIEBwYXJhbSAge0Z1bmN0aW9ufSAgICAgZm4gICAgICAgICAgVGhlIG1hcHBlciBmdW5jdGlvbi5cbiAqIEBwYXJhbSAge09iamVjdH0gICAgICAgdGhpc0NvbnRleHQgVGhlIGNvbnRleHQgZm9yIHRoZSBtYXBwZXIuXG4gKiBAcmV0dXJuIHtBcnJheXxPYmplY3R9ICAgICAgICAgICAgIFRoZSBhcnJheSBvciBvYmplY3QgY29udGFpbmluZyB0aGUgcmVzdWx0cy5cbiAqL1xubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiBmYXN0TWFwIChzdWJqZWN0LCBmbiwgdGhpc0NvbnRleHQpIHtcbiAgaWYgKHN1YmplY3QgaW5zdGFuY2VvZiBBcnJheSkge1xuICAgIHJldHVybiBtYXBBcnJheShzdWJqZWN0LCBmbiwgdGhpc0NvbnRleHQpO1xuICB9XG4gIGVsc2Uge1xuICAgIHJldHVybiBtYXBPYmplY3Qoc3ViamVjdCwgZm4sIHRoaXNDb250ZXh0KTtcbiAgfVxufTsiLCIndXNlIHN0cmljdCc7XG5cbi8qKlxuICogQW5hbG9ndWUgb2YgT2JqZWN0LmFzc2lnbigpLlxuICogQ29waWVzIHByb3BlcnRpZXMgZnJvbSBvbmUgb3IgbW9yZSBzb3VyY2Ugb2JqZWN0cyB0b1xuICogYSB0YXJnZXQgb2JqZWN0LiBFeGlzdGluZyBrZXlzIG9uIHRoZSB0YXJnZXQgb2JqZWN0IHdpbGwgYmUgb3ZlcndyaXR0ZW4uXG4gKlxuICogPiBOb3RlOiBUaGlzIGRpZmZlcnMgZnJvbSBzcGVjIGluIHNvbWUgaW1wb3J0YW50IHdheXM6XG4gKiA+IDEuIFdpbGwgdGhyb3cgaWYgcGFzc2VkIG5vbi1vYmplY3RzLCBpbmNsdWRpbmcgYHVuZGVmaW5lZGAgb3IgYG51bGxgIHZhbHVlcy5cbiAqID4gMi4gRG9lcyBub3Qgc3VwcG9ydCB0aGUgY3VyaW91cyBFeGNlcHRpb24gaGFuZGxpbmcgYmVoYXZpb3IsIGV4Y2VwdGlvbnMgYXJlIHRocm93biBpbW1lZGlhdGVseS5cbiAqID4gRm9yIG1vcmUgZGV0YWlscywgc2VlOlxuICogPiBodHRwczovL2RldmVsb3Blci5tb3ppbGxhLm9yZy9lbi1VUy9kb2NzL1dlYi9KYXZhU2NyaXB0L1JlZmVyZW5jZS9HbG9iYWxfT2JqZWN0cy9PYmplY3QvYXNzaWduXG4gKlxuICpcbiAqXG4gKiBAcGFyYW0gIHtPYmplY3R9IHRhcmdldCAgICAgIFRoZSB0YXJnZXQgb2JqZWN0IHRvIGNvcHkgcHJvcGVydGllcyB0by5cbiAqIEBwYXJhbSAge09iamVjdH0gc291cmNlLCAuLi4gVGhlIHNvdXJjZShzKSB0byBjb3B5IHByb3BlcnRpZXMgZnJvbS5cbiAqIEByZXR1cm4ge09iamVjdH0gICAgICAgICAgICAgVGhlIHVwZGF0ZWQgdGFyZ2V0IG9iamVjdC5cbiAqL1xubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiBmYXN0QXNzaWduICh0YXJnZXQpIHtcbiAgdmFyIHRvdGFsQXJncyA9IGFyZ3VtZW50cy5sZW5ndGgsXG4gICAgICBzb3VyY2UsIGksIHRvdGFsS2V5cywga2V5cywga2V5LCBqO1xuXG4gIGZvciAoaSA9IDE7IGkgPCB0b3RhbEFyZ3M7IGkrKykge1xuICAgIHNvdXJjZSA9IGFyZ3VtZW50c1tpXTtcbiAgICBrZXlzID0gT2JqZWN0LmtleXMoc291cmNlKTtcbiAgICB0b3RhbEtleXMgPSBrZXlzLmxlbmd0aDtcbiAgICBmb3IgKGogPSAwOyBqIDwgdG90YWxLZXlzOyBqKyspIHtcbiAgICAgIGtleSA9IGtleXNbal07XG4gICAgICB0YXJnZXRba2V5XSA9IHNvdXJjZVtrZXldO1xuICAgIH1cbiAgfVxuICByZXR1cm4gdGFyZ2V0O1xufTtcbiIsIid1c2Ugc3RyaWN0JztcblxuLyoqXG4gKiAjIENsb25lIE9iamVjdFxuICpcbiAqIFNoYWxsb3cgY2xvbmUgYSBzaW1wbGUgb2JqZWN0LlxuICpcbiAqID4gTm90ZTogUHJvdG90eXBlcyBhbmQgbm9uLWVudW1lcmFibGUgcHJvcGVydGllcyB3aWxsIG5vdCBiZSBjb3BpZWQhXG4gKlxuICogQHBhcmFtICB7T2JqZWN0fSBpbnB1dCBUaGUgb2JqZWN0IHRvIGNsb25lLlxuICogQHJldHVybiB7T2JqZWN0fSAgICAgICBUaGUgY2xvbmVkIG9iamVjdC5cbiAqL1xubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiBmYXN0Q2xvbmVPYmplY3QgKGlucHV0KSB7XG4gIHZhciBrZXlzID0gT2JqZWN0LmtleXMoaW5wdXQpLFxuICAgICAgdG90YWwgPSBrZXlzLmxlbmd0aCxcbiAgICAgIGNsb25lZCA9IHt9LFxuICAgICAgaSwga2V5O1xuXG4gIGZvciAoaSA9IDA7IGkgPCB0b3RhbDsgaSsrKSB7XG4gICAga2V5ID0ga2V5c1tpXTtcbiAgICBjbG9uZWRba2V5XSA9IGlucHV0W2tleV07XG4gIH1cblxuICByZXR1cm4gY2xvbmVkO1xufTtcbiIsIid1c2Ugc3RyaWN0JztcblxudmFyIGJpbmRJbnRlcm5hbDMgPSByZXF1aXJlKCcuLi9mdW5jdGlvbi9iaW5kSW50ZXJuYWwzJyk7XG5cbi8qKlxuICogIyBGaWx0ZXJcbiAqXG4gKiBBIGZhc3Qgb2JqZWN0IGAuZmlsdGVyKClgIGltcGxlbWVudGF0aW9uLlxuICpcbiAqIEBwYXJhbSAge09iamVjdH0gICBzdWJqZWN0ICAgICBUaGUgb2JqZWN0IHRvIGZpbHRlci5cbiAqIEBwYXJhbSAge0Z1bmN0aW9ufSBmbiAgICAgICAgICBUaGUgZmlsdGVyIGZ1bmN0aW9uLlxuICogQHBhcmFtICB7T2JqZWN0fSAgIHRoaXNDb250ZXh0IFRoZSBjb250ZXh0IGZvciB0aGUgZmlsdGVyLlxuICogQHJldHVybiB7T2JqZWN0fSAgICAgICAgICAgICAgIFRoZSBuZXcgb2JqZWN0IGNvbnRhaW5pbmcgdGhlIGZpbHRlcmVkIHJlc3VsdHMuXG4gKi9cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gZmFzdEZpbHRlck9iamVjdCAoc3ViamVjdCwgZm4sIHRoaXNDb250ZXh0KSB7XG4gIHZhciBrZXlzID0gT2JqZWN0LmtleXMoc3ViamVjdCksXG4gICAgICBsZW5ndGggPSBrZXlzLmxlbmd0aCxcbiAgICAgIHJlc3VsdCA9IHt9LFxuICAgICAgaXRlcmF0b3IgPSB0aGlzQ29udGV4dCAhPT0gdW5kZWZpbmVkID8gYmluZEludGVybmFsMyhmbiwgdGhpc0NvbnRleHQpIDogZm4sXG4gICAgICBpLCBrZXk7XG4gIGZvciAoaSA9IDA7IGkgPCBsZW5ndGg7IGkrKykge1xuICAgIGtleSA9IGtleXNbaV07XG4gICAgaWYgKGl0ZXJhdG9yKHN1YmplY3Rba2V5XSwga2V5LCBzdWJqZWN0KSkge1xuICAgICAgcmVzdWx0W2tleV0gPSBzdWJqZWN0W2tleV07XG4gICAgfVxuICB9XG4gIHJldHVybiByZXN1bHQ7XG59O1xuIiwiJ3VzZSBzdHJpY3QnO1xuXG52YXIgYmluZEludGVybmFsMyA9IHJlcXVpcmUoJy4uL2Z1bmN0aW9uL2JpbmRJbnRlcm5hbDMnKTtcblxuLyoqXG4gKiAjIEZvciBFYWNoXG4gKlxuICogQSBmYXN0IG9iamVjdCBgLmZvckVhY2goKWAgaW1wbGVtZW50YXRpb24uXG4gKlxuICogQHBhcmFtICB7T2JqZWN0fSAgIHN1YmplY3QgICAgIFRoZSBvYmplY3QgdG8gaXRlcmF0ZSBvdmVyLlxuICogQHBhcmFtICB7RnVuY3Rpb259IGZuICAgICAgICAgIFRoZSB2aXNpdG9yIGZ1bmN0aW9uLlxuICogQHBhcmFtICB7T2JqZWN0fSAgIHRoaXNDb250ZXh0IFRoZSBjb250ZXh0IGZvciB0aGUgdmlzaXRvci5cbiAqL1xubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiBmYXN0Rm9yRWFjaE9iamVjdCAoc3ViamVjdCwgZm4sIHRoaXNDb250ZXh0KSB7XG4gIHZhciBrZXlzID0gT2JqZWN0LmtleXMoc3ViamVjdCksXG4gICAgICBsZW5ndGggPSBrZXlzLmxlbmd0aCxcbiAgICAgIGl0ZXJhdG9yID0gdGhpc0NvbnRleHQgIT09IHVuZGVmaW5lZCA/IGJpbmRJbnRlcm5hbDMoZm4sIHRoaXNDb250ZXh0KSA6IGZuLFxuICAgICAga2V5LCBpO1xuICBmb3IgKGkgPSAwOyBpIDwgbGVuZ3RoOyBpKyspIHtcbiAgICBrZXkgPSBrZXlzW2ldO1xuICAgIGl0ZXJhdG9yKHN1YmplY3Rba2V5XSwga2V5LCBzdWJqZWN0KTtcbiAgfVxufTtcbiIsIid1c2Ugc3RyaWN0JztcblxuZXhwb3J0cy5hc3NpZ24gPSByZXF1aXJlKCcuL2Fzc2lnbicpO1xuZXhwb3J0cy5jbG9uZSA9IHJlcXVpcmUoJy4vY2xvbmUnKTtcbmV4cG9ydHMuZmlsdGVyID0gcmVxdWlyZSgnLi9maWx0ZXInKTtcbmV4cG9ydHMuZm9yRWFjaCA9IHJlcXVpcmUoJy4vZm9yRWFjaCcpO1xuZXhwb3J0cy5tYXAgPSByZXF1aXJlKCcuL21hcCcpO1xuZXhwb3J0cy5yZWR1Y2UgPSByZXF1aXJlKCcuL3JlZHVjZScpO1xuZXhwb3J0cy5yZWR1Y2VSaWdodCA9IHJlcXVpcmUoJy4vcmVkdWNlUmlnaHQnKTtcbmV4cG9ydHMua2V5cyA9IHJlcXVpcmUoJy4va2V5cycpO1xuZXhwb3J0cy52YWx1ZXMgPSByZXF1aXJlKCcuL3ZhbHVlcycpOyIsIid1c2Ugc3RyaWN0JztcblxuLyoqXG4gKiBPYmplY3Qua2V5cygpIHNoaW0gZm9yIEVTMyBlbnZpcm9ubWVudHMuXG4gKlxuICogQHBhcmFtICB7T2JqZWN0fSBvYmogVGhlIG9iamVjdCB0byBnZXQga2V5cyBmb3IuXG4gKiBAcmV0dXJuIHtBcnJheX0gICAgICBUaGUgYXJyYXkgb2Yga2V5cy5cbiAqL1xubW9kdWxlLmV4cG9ydHMgPSB0eXBlb2YgT2JqZWN0LmtleXMgPT09IFwiZnVuY3Rpb25cIiA/IE9iamVjdC5rZXlzIDogLyogaXN0YW5idWwgaWdub3JlIG5leHQgKi8gZnVuY3Rpb24gZmFzdEtleXMgKG9iaikge1xuICB2YXIga2V5cyA9IFtdO1xuICBmb3IgKHZhciBrZXkgaW4gb2JqKSB7XG4gICAgaWYgKE9iamVjdC5wcm90b3R5cGUuaGFzT3duUHJvcGVydHkuY2FsbChvYmosIGtleSkpIHtcbiAgICAgIGtleXMucHVzaChrZXkpO1xuICAgIH1cbiAgfVxuICByZXR1cm4ga2V5cztcbn07IiwiJ3VzZSBzdHJpY3QnO1xuXG52YXIgYmluZEludGVybmFsMyA9IHJlcXVpcmUoJy4uL2Z1bmN0aW9uL2JpbmRJbnRlcm5hbDMnKTtcblxuLyoqXG4gKiAjIE1hcFxuICpcbiAqIEEgZmFzdCBvYmplY3QgYC5tYXAoKWAgaW1wbGVtZW50YXRpb24uXG4gKlxuICogQHBhcmFtICB7T2JqZWN0fSAgIHN1YmplY3QgICAgIFRoZSBvYmplY3QgdG8gbWFwIG92ZXIuXG4gKiBAcGFyYW0gIHtGdW5jdGlvbn0gZm4gICAgICAgICAgVGhlIG1hcHBlciBmdW5jdGlvbi5cbiAqIEBwYXJhbSAge09iamVjdH0gICB0aGlzQ29udGV4dCBUaGUgY29udGV4dCBmb3IgdGhlIG1hcHBlci5cbiAqIEByZXR1cm4ge09iamVjdH0gICAgICAgICAgICAgICBUaGUgbmV3IG9iamVjdCBjb250YWluaW5nIHRoZSByZXN1bHRzLlxuICovXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIGZhc3RNYXBPYmplY3QgKHN1YmplY3QsIGZuLCB0aGlzQ29udGV4dCkge1xuICB2YXIga2V5cyA9IE9iamVjdC5rZXlzKHN1YmplY3QpLFxuICAgICAgbGVuZ3RoID0ga2V5cy5sZW5ndGgsXG4gICAgICByZXN1bHQgPSB7fSxcbiAgICAgIGl0ZXJhdG9yID0gdGhpc0NvbnRleHQgIT09IHVuZGVmaW5lZCA/IGJpbmRJbnRlcm5hbDMoZm4sIHRoaXNDb250ZXh0KSA6IGZuLFxuICAgICAgaSwga2V5O1xuICBmb3IgKGkgPSAwOyBpIDwgbGVuZ3RoOyBpKyspIHtcbiAgICBrZXkgPSBrZXlzW2ldO1xuICAgIHJlc3VsdFtrZXldID0gaXRlcmF0b3Ioc3ViamVjdFtrZXldLCBrZXksIHN1YmplY3QpO1xuICB9XG4gIHJldHVybiByZXN1bHQ7XG59O1xuIiwiJ3VzZSBzdHJpY3QnO1xuXG52YXIgYmluZEludGVybmFsNCA9IHJlcXVpcmUoJy4uL2Z1bmN0aW9uL2JpbmRJbnRlcm5hbDQnKTtcblxuLyoqXG4gKiAjIFJlZHVjZVxuICpcbiAqIEEgZmFzdCBvYmplY3QgYC5yZWR1Y2UoKWAgaW1wbGVtZW50YXRpb24uXG4gKlxuICogQHBhcmFtICB7T2JqZWN0fSAgIHN1YmplY3QgICAgICBUaGUgb2JqZWN0IHRvIHJlZHVjZSBvdmVyLlxuICogQHBhcmFtICB7RnVuY3Rpb259IGZuICAgICAgICAgICBUaGUgcmVkdWNlciBmdW5jdGlvbi5cbiAqIEBwYXJhbSAge21peGVkfSAgICBpbml0aWFsVmFsdWUgVGhlIGluaXRpYWwgdmFsdWUgZm9yIHRoZSByZWR1Y2VyLCBkZWZhdWx0cyB0byBzdWJqZWN0WzBdLlxuICogQHBhcmFtICB7T2JqZWN0fSAgIHRoaXNDb250ZXh0ICBUaGUgY29udGV4dCBmb3IgdGhlIHJlZHVjZXIuXG4gKiBAcmV0dXJuIHttaXhlZH0gICAgICAgICAgICAgICAgIFRoZSBmaW5hbCByZXN1bHQuXG4gKi9cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gZmFzdFJlZHVjZU9iamVjdCAoc3ViamVjdCwgZm4sIGluaXRpYWxWYWx1ZSwgdGhpc0NvbnRleHQpIHtcbiAgdmFyIGtleXMgPSBPYmplY3Qua2V5cyhzdWJqZWN0KSxcbiAgICAgIGxlbmd0aCA9IGtleXMubGVuZ3RoLFxuICAgICAgaXRlcmF0b3IgPSB0aGlzQ29udGV4dCAhPT0gdW5kZWZpbmVkID8gYmluZEludGVybmFsNChmbiwgdGhpc0NvbnRleHQpIDogZm4sXG4gICAgICBpLCBrZXksIHJlc3VsdDtcblxuICBpZiAoaW5pdGlhbFZhbHVlID09PSB1bmRlZmluZWQpIHtcbiAgICBpID0gMTtcbiAgICByZXN1bHQgPSBzdWJqZWN0W2tleXNbMF1dO1xuICB9XG4gIGVsc2Uge1xuICAgIGkgPSAwO1xuICAgIHJlc3VsdCA9IGluaXRpYWxWYWx1ZTtcbiAgfVxuXG4gIGZvciAoOyBpIDwgbGVuZ3RoOyBpKyspIHtcbiAgICBrZXkgPSBrZXlzW2ldO1xuICAgIHJlc3VsdCA9IGl0ZXJhdG9yKHJlc3VsdCwgc3ViamVjdFtrZXldLCBrZXksIHN1YmplY3QpO1xuICB9XG5cbiAgcmV0dXJuIHJlc3VsdDtcbn07XG4iLCIndXNlIHN0cmljdCc7XG5cbnZhciBiaW5kSW50ZXJuYWw0ID0gcmVxdWlyZSgnLi4vZnVuY3Rpb24vYmluZEludGVybmFsNCcpO1xuXG4vKipcbiAqICMgUmVkdWNlXG4gKlxuICogQSBmYXN0IG9iamVjdCBgLnJlZHVjZSgpYCBpbXBsZW1lbnRhdGlvbi5cbiAqXG4gKiBAcGFyYW0gIHtPYmplY3R9ICAgc3ViamVjdCAgICAgIFRoZSBvYmplY3QgdG8gcmVkdWNlIG92ZXIuXG4gKiBAcGFyYW0gIHtGdW5jdGlvbn0gZm4gICAgICAgICAgIFRoZSByZWR1Y2VyIGZ1bmN0aW9uLlxuICogQHBhcmFtICB7bWl4ZWR9ICAgIGluaXRpYWxWYWx1ZSBUaGUgaW5pdGlhbCB2YWx1ZSBmb3IgdGhlIHJlZHVjZXIsIGRlZmF1bHRzIHRvIHN1YmplY3RbMF0uXG4gKiBAcGFyYW0gIHtPYmplY3R9ICAgdGhpc0NvbnRleHQgIFRoZSBjb250ZXh0IGZvciB0aGUgcmVkdWNlci5cbiAqIEByZXR1cm4ge21peGVkfSAgICAgICAgICAgICAgICAgVGhlIGZpbmFsIHJlc3VsdC5cbiAqL1xubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiBmYXN0UmVkdWNlUmlnaHRPYmplY3QgKHN1YmplY3QsIGZuLCBpbml0aWFsVmFsdWUsIHRoaXNDb250ZXh0KSB7XG4gIHZhciBrZXlzID0gT2JqZWN0LmtleXMoc3ViamVjdCksXG4gICAgICBsZW5ndGggPSBrZXlzLmxlbmd0aCxcbiAgICAgIGl0ZXJhdG9yID0gdGhpc0NvbnRleHQgIT09IHVuZGVmaW5lZCA/IGJpbmRJbnRlcm5hbDQoZm4sIHRoaXNDb250ZXh0KSA6IGZuLFxuICAgICAgaSwga2V5LCByZXN1bHQ7XG5cbiAgaWYgKGluaXRpYWxWYWx1ZSA9PT0gdW5kZWZpbmVkKSB7XG4gICAgaSA9IGxlbmd0aCAtIDI7XG4gICAgcmVzdWx0ID0gc3ViamVjdFtrZXlzW2xlbmd0aCAtIDFdXTtcbiAgfVxuICBlbHNlIHtcbiAgICBpID0gbGVuZ3RoIC0gMTtcbiAgICByZXN1bHQgPSBpbml0aWFsVmFsdWU7XG4gIH1cblxuICBmb3IgKDsgaSA+PSAwOyBpLS0pIHtcbiAgICBrZXkgPSBrZXlzW2ldO1xuICAgIHJlc3VsdCA9IGl0ZXJhdG9yKHJlc3VsdCwgc3ViamVjdFtrZXldLCBrZXksIHN1YmplY3QpO1xuICB9XG5cbiAgcmV0dXJuIHJlc3VsdDtcbn07XG4iLCIndXNlIHN0cmljdCc7XG5cbi8qKlxuICogIyBWYWx1ZXNcbiAqIFJldHVybiBhbGwgdGhlIChlbnVtZXJhYmxlKSBwcm9wZXJ0eSB2YWx1ZXMgZm9yIGFuIG9iamVjdC5cbiAqIExpa2UgT2JqZWN0LmtleXMoKSBidXQgZm9yIHZhbHVlcy5cbiAqXG4gKiBAcGFyYW0gIHtPYmplY3R9IG9iaiBUaGUgb2JqZWN0IHRvIHJldHJpZXZlIHZhbHVlcyBmcm9tLlxuICogQHJldHVybiB7QXJyYXl9ICAgICAgQW4gYXJyYXkgY29udGFpbmluZyBwcm9wZXJ0eSB2YWx1ZXMuXG4gKi9cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gZmFzdFZhbHVlcyAob2JqKSB7XG4gIHZhciBrZXlzID0gT2JqZWN0LmtleXMob2JqKSxcbiAgICAgIGxlbmd0aCA9IGtleXMubGVuZ3RoLFxuICAgICAgdmFsdWVzID0gbmV3IEFycmF5KGxlbmd0aCk7XG5cbiAgZm9yICh2YXIgaSA9IDA7IGkgPCBsZW5ndGg7IGkrKykge1xuICAgIHZhbHVlc1tpXSA9IG9ialtrZXlzW2ldXTtcbiAgfVxuICByZXR1cm4gdmFsdWVzO1xufTsiLCIndXNlIHN0cmljdCc7XG5cbnZhciByZWR1Y2VBcnJheSA9IHJlcXVpcmUoJy4vYXJyYXkvcmVkdWNlJyksXG4gICAgcmVkdWNlT2JqZWN0ID0gcmVxdWlyZSgnLi9vYmplY3QvcmVkdWNlJyk7XG5cbi8qKlxuICogIyBSZWR1Y2VcbiAqXG4gKiBBIGZhc3QgYC5yZWR1Y2UoKWAgaW1wbGVtZW50YXRpb24uXG4gKlxuICogQHBhcmFtICB7QXJyYXl8T2JqZWN0fSBzdWJqZWN0ICAgICAgVGhlIGFycmF5IG9yIG9iamVjdCB0byByZWR1Y2Ugb3Zlci5cbiAqIEBwYXJhbSAge0Z1bmN0aW9ufSAgICAgZm4gICAgICAgICAgIFRoZSByZWR1Y2VyIGZ1bmN0aW9uLlxuICogQHBhcmFtICB7bWl4ZWR9ICAgICAgICBpbml0aWFsVmFsdWUgVGhlIGluaXRpYWwgdmFsdWUgZm9yIHRoZSByZWR1Y2VyLCBkZWZhdWx0cyB0byBzdWJqZWN0WzBdLlxuICogQHBhcmFtICB7T2JqZWN0fSAgICAgICB0aGlzQ29udGV4dCAgVGhlIGNvbnRleHQgZm9yIHRoZSByZWR1Y2VyLlxuICogQHJldHVybiB7QXJyYXl8T2JqZWN0fSAgICAgICAgICAgICAgVGhlIGFycmF5IG9yIG9iamVjdCBjb250YWluaW5nIHRoZSByZXN1bHRzLlxuICovXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIGZhc3RSZWR1Y2UgKHN1YmplY3QsIGZuLCBpbml0aWFsVmFsdWUsIHRoaXNDb250ZXh0KSB7XG4gIGlmIChzdWJqZWN0IGluc3RhbmNlb2YgQXJyYXkpIHtcbiAgICByZXR1cm4gcmVkdWNlQXJyYXkoc3ViamVjdCwgZm4sIGluaXRpYWxWYWx1ZSwgdGhpc0NvbnRleHQpO1xuICB9XG4gIGVsc2Uge1xuICAgIHJldHVybiByZWR1Y2VPYmplY3Qoc3ViamVjdCwgZm4sIGluaXRpYWxWYWx1ZSwgdGhpc0NvbnRleHQpO1xuICB9XG59OyIsIid1c2Ugc3RyaWN0JztcblxudmFyIHJlZHVjZVJpZ2h0QXJyYXkgPSByZXF1aXJlKCcuL2FycmF5L3JlZHVjZVJpZ2h0JyksXG4gICAgcmVkdWNlUmlnaHRPYmplY3QgPSByZXF1aXJlKCcuL29iamVjdC9yZWR1Y2VSaWdodCcpO1xuXG4vKipcbiAqICMgUmVkdWNlIFJpZ2h0XG4gKlxuICogQSBmYXN0IGAucmVkdWNlUmlnaHQoKWAgaW1wbGVtZW50YXRpb24uXG4gKlxuICogQHBhcmFtICB7QXJyYXl8T2JqZWN0fSBzdWJqZWN0ICAgICAgVGhlIGFycmF5IG9yIG9iamVjdCB0byByZWR1Y2Ugb3Zlci5cbiAqIEBwYXJhbSAge0Z1bmN0aW9ufSAgICAgZm4gICAgICAgICAgIFRoZSByZWR1Y2VyIGZ1bmN0aW9uLlxuICogQHBhcmFtICB7bWl4ZWR9ICAgICAgICBpbml0aWFsVmFsdWUgVGhlIGluaXRpYWwgdmFsdWUgZm9yIHRoZSByZWR1Y2VyLCBkZWZhdWx0cyB0byBzdWJqZWN0WzBdLlxuICogQHBhcmFtICB7T2JqZWN0fSAgICAgICB0aGlzQ29udGV4dCAgVGhlIGNvbnRleHQgZm9yIHRoZSByZWR1Y2VyLlxuICogQHJldHVybiB7QXJyYXl8T2JqZWN0fSAgICAgICAgICAgICAgVGhlIGFycmF5IG9yIG9iamVjdCBjb250YWluaW5nIHRoZSByZXN1bHRzLlxuICovXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIGZhc3RSZWR1Y2VSaWdodCAoc3ViamVjdCwgZm4sIGluaXRpYWxWYWx1ZSwgdGhpc0NvbnRleHQpIHtcbiAgaWYgKHN1YmplY3QgaW5zdGFuY2VvZiBBcnJheSkge1xuICAgIHJldHVybiByZWR1Y2VSaWdodEFycmF5KHN1YmplY3QsIGZuLCBpbml0aWFsVmFsdWUsIHRoaXNDb250ZXh0KTtcbiAgfVxuICBlbHNlIHtcbiAgICByZXR1cm4gcmVkdWNlUmlnaHRPYmplY3Qoc3ViamVjdCwgZm4sIGluaXRpYWxWYWx1ZSwgdGhpc0NvbnRleHQpO1xuICB9XG59OyIsIid1c2Ugc3RyaWN0JztcblxuZXhwb3J0cy5pbnRlcm4gPSByZXF1aXJlKCcuL2ludGVybicpOyIsIid1c2Ugc3RyaWN0JztcblxuLy8gQ29tcGlsZXJzIHN1Y2ggYXMgVjggdXNlIHN0cmluZyBpbnRlcm5pbmcgdG8gbWFrZSBzdHJpbmcgY29tcGFyaXNvbiB2ZXJ5IGZhc3QgYW5kIGVmZmljaWVudCxcbi8vIGFzIGVmZmljaWVudCBhcyBjb21wYXJpbmcgdHdvIHJlZmVyZW5jZXMgdG8gdGhlIHNhbWUgb2JqZWN0LlxuLy9cbi8vXG4vLyBWOCBkb2VzIGl0cyBiZXN0IHRvIGludGVybiBzdHJpbmdzIGF1dG9tYXRpY2FsbHkgd2hlcmUgaXQgY2FuLCBmb3IgaW5zdGFuY2U6XG4vLyBgYGBqc1xuLy8gICB2YXIgZ3JlZXRpbmcgPSBcImhlbGxvIHdvcmxkXCI7XG4vLyBgYGBcbi8vIFdpdGggdGhpcywgY29tcGFyaXNvbiB3aWxsIGJlIHZlcnkgZmFzdDpcbi8vIGBgYGpzXG4vLyAgIGlmIChncmVldGluZyA9PT0gXCJoZWxsbyB3b3JsZFwiKSB7fVxuLy8gYGBgXG4vLyBIb3dldmVyLCB0aGVyZSBhcmUgc2V2ZXJhbCBjYXNlcyB3aGVyZSBWOCBjYW5ub3QgaW50ZXJuIHRoZSBzdHJpbmcsIGFuZCBpbnN0ZWFkXG4vLyBtdXN0IHJlc29ydCB0byBieXRlLXdpc2UgY29tcGFyaXNvbi4gVGhpcyBjYW4gYmUgc2lnbmZpY2FudGx5IHNsb3dlciBmb3IgbG9uZyBzdHJpbmdzLlxuLy8gVGhlIG1vc3QgY29tbW9uIGV4YW1wbGUgaXMgc3RyaW5nIGNvbmNhdGVuYXRpb246XG4vLyBgYGBqc1xuLy8gICBmdW5jdGlvbiBzdWJqZWN0ICgpIHsgcmV0dXJuIFwid29ybGRcIjsgfTtcbi8vICAgdmFyIGdyZWV0aW5nID0gXCJoZWxsbyBcIiArIHN1YmplY3QoKTtcbi8vIGBgYFxuLy8gSW4gdGhpcyBjYXNlLCBWOCBjYW5ub3QgaW50ZXJuIHRoZSBzdHJpbmcuIFNvIHRoaXMgY29tcGFyaXNvbiBpcyAqbXVjaCogc2xvd2VyOlxuLy8gYGBganNcbi8vICBpZiAoZ3JlZXRpbmcgPT09IFwiaGVsbG8gd29ybGRcIikge31cbi8vIGBgYFxuXG5cblxuLy8gQXQgdGhlIG1vbWVudCwgdGhlIGZhc3Rlc3QsIHNhZmUgd2F5IG9mIGludGVybmluZyBhIHN0cmluZyBpcyB0b1xuLy8gdXNlIGl0IGFzIGEga2V5IGluIGFuIG9iamVjdCwgYW5kIHRoZW4gdXNlIHRoYXQga2V5LlxuLy9cbi8vIE5vdGU6IFRoaXMgdGVjaG5pcXVlIGNvbWVzIGNvdXJ0ZXN5IG9mIFBldGthIEFudG9ub3YgLSBodHRwOi8vanNwZXJmLmNvbS9pc3Rybi8xMVxuLy9cbi8vIFdlIGNyZWF0ZSBhIGNvbnRhaW5lciBvYmplY3QgaW4gaGFzaCBtb2RlLlxuLy8gTW9zdCBzdHJpbmdzIGJlaW5nIGludGVybmVkIHdpbGwgbm90IGJlIHZhbGlkIGZhc3QgcHJvcGVydHkgbmFtZXMsXG4vLyBzbyB3ZSBlbnN1cmUgaGFzaCBtb2RlIG5vdyB0byBhdm9pZCB0cmFuc2l0aW9uaW5nIHRoZSBvYmplY3QgbW9kZSBhdCBydW50aW1lLlxudmFyIGNvbnRhaW5lciA9IHsnLSAnOiB0cnVlfTtcbmRlbGV0ZSBjb250YWluZXJbJy0gJ107XG5cblxuLyoqXG4gKiBJbnRlcm4gYSBzdHJpbmcgdG8gbWFrZSBjb21wYXJpc29ucyBmYXN0ZXIuXG4gKlxuICogPiBOb3RlOiBUaGlzIGlzIGEgcmVsYXRpdmVseSBleHBlbnNpdmUgb3BlcmF0aW9uLCB5b3VcbiAqIHNob3VsZG4ndCB1c3VhbGx5IGRvIHRoZSBhY3R1YWwgaW50ZXJuaW5nIGF0IHJ1bnRpbWUsIGluc3RlYWRcbiAqIHVzZSB0aGlzIGF0IGNvbXBpbGUgdGltZSB0byBtYWtlIGZ1dHVyZSB3b3JrIGZhc3Rlci5cbiAqXG4gKiBAcGFyYW0gIHtTdHJpbmd9IHN0cmluZyBUaGUgc3RyaW5nIHRvIGludGVybi5cbiAqIEByZXR1cm4ge1N0cmluZ30gICAgICAgIFRoZSBpbnRlcm5lZCBzdHJpbmcuXG4gKi9cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gZmFzdEludGVybiAoc3RyaW5nKSB7XG4gIGNvbnRhaW5lcltzdHJpbmddID0gdHJ1ZTtcbiAgdmFyIGludGVybmVkID0gT2JqZWN0LmtleXMoY29udGFpbmVyKVswXTtcbiAgZGVsZXRlIGNvbnRhaW5lcltpbnRlcm5lZF07XG4gIHJldHVybiBpbnRlcm5lZDtcbn07IiwiLyoqIGdlbmVyYXRlIHVuaXF1ZSBpZCBmb3Igc2VsZWN0b3IgKi9cclxudmFyIGNvdW50ZXIgPSBEYXRlLm5vdygpICUgMWU5O1xyXG5cclxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiBnZXRVaWQoKXtcclxuXHRyZXR1cm4gKE1hdGgucmFuZG9tKCkgKiAxZTkgPj4+IDApICsgKGNvdW50ZXIrKyk7XHJcbn07IiwiLypnbG9iYWwgd2luZG93Ki9cblxuLyoqXG4gKiBDaGVjayBpZiBvYmplY3QgaXMgZG9tIG5vZGUuXG4gKlxuICogQHBhcmFtIHtPYmplY3R9IHZhbFxuICogQHJldHVybiB7Qm9vbGVhbn1cbiAqIEBhcGkgcHVibGljXG4gKi9cblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiBpc05vZGUodmFsKXtcbiAgaWYgKCF2YWwgfHwgdHlwZW9mIHZhbCAhPT0gJ29iamVjdCcpIHJldHVybiBmYWxzZTtcbiAgaWYgKHdpbmRvdyAmJiAnb2JqZWN0JyA9PSB0eXBlb2Ygd2luZG93Lk5vZGUpIHJldHVybiB2YWwgaW5zdGFuY2VvZiB3aW5kb3cuTm9kZTtcbiAgcmV0dXJuICdudW1iZXInID09IHR5cGVvZiB2YWwubm9kZVR5cGUgJiYgJ3N0cmluZycgPT0gdHlwZW9mIHZhbC5ub2RlTmFtZTtcbn1cbiIsIihmdW5jdGlvbiAocm9vdCwgZmFjdG9yeSl7XG4gICd1c2Ugc3RyaWN0JztcblxuICAvKmlzdGFuYnVsIGlnbm9yZSBuZXh0OmNhbnQgdGVzdCovXG4gIGlmICh0eXBlb2YgbW9kdWxlID09PSAnb2JqZWN0JyAmJiB0eXBlb2YgbW9kdWxlLmV4cG9ydHMgPT09ICdvYmplY3QnKSB7XG4gICAgbW9kdWxlLmV4cG9ydHMgPSBmYWN0b3J5KCk7XG4gIH0gZWxzZSBpZiAodHlwZW9mIGRlZmluZSA9PT0gJ2Z1bmN0aW9uJyAmJiBkZWZpbmUuYW1kKSB7XG4gICAgLy8gQU1ELiBSZWdpc3RlciBhcyBhbiBhbm9ueW1vdXMgbW9kdWxlLlxuICAgIGRlZmluZShbXSwgZmFjdG9yeSk7XG4gIH0gZWxzZSB7XG4gICAgLy8gQnJvd3NlciBnbG9iYWxzXG4gICAgcm9vdC5vYmplY3RQYXRoID0gZmFjdG9yeSgpO1xuICB9XG59KSh0aGlzLCBmdW5jdGlvbigpe1xuICAndXNlIHN0cmljdCc7XG5cbiAgdmFyXG4gICAgdG9TdHIgPSBPYmplY3QucHJvdG90eXBlLnRvU3RyaW5nLFxuICAgIF9oYXNPd25Qcm9wZXJ0eSA9IE9iamVjdC5wcm90b3R5cGUuaGFzT3duUHJvcGVydHk7XG5cbiAgZnVuY3Rpb24gaXNFbXB0eSh2YWx1ZSl7XG4gICAgaWYgKCF2YWx1ZSkge1xuICAgICAgcmV0dXJuIHRydWU7XG4gICAgfVxuICAgIGlmIChpc0FycmF5KHZhbHVlKSAmJiB2YWx1ZS5sZW5ndGggPT09IDApIHtcbiAgICAgIHJldHVybiB0cnVlO1xuICAgIH0gZWxzZSB7XG4gICAgICBmb3IgKHZhciBpIGluIHZhbHVlKSB7XG4gICAgICAgIGlmIChfaGFzT3duUHJvcGVydHkuY2FsbCh2YWx1ZSwgaSkpIHtcbiAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIHJldHVybiB0cnVlO1xuICAgIH1cbiAgfVxuXG4gIGZ1bmN0aW9uIHRvU3RyaW5nKHR5cGUpe1xuICAgIHJldHVybiB0b1N0ci5jYWxsKHR5cGUpO1xuICB9XG5cbiAgZnVuY3Rpb24gaXNOdW1iZXIodmFsdWUpe1xuICAgIHJldHVybiB0eXBlb2YgdmFsdWUgPT09ICdudW1iZXInIHx8IHRvU3RyaW5nKHZhbHVlKSA9PT0gXCJbb2JqZWN0IE51bWJlcl1cIjtcbiAgfVxuXG4gIGZ1bmN0aW9uIGlzU3RyaW5nKG9iail7XG4gICAgcmV0dXJuIHR5cGVvZiBvYmogPT09ICdzdHJpbmcnIHx8IHRvU3RyaW5nKG9iaikgPT09IFwiW29iamVjdCBTdHJpbmddXCI7XG4gIH1cblxuICBmdW5jdGlvbiBpc09iamVjdChvYmope1xuICAgIHJldHVybiB0eXBlb2Ygb2JqID09PSAnb2JqZWN0JyAmJiB0b1N0cmluZyhvYmopID09PSBcIltvYmplY3QgT2JqZWN0XVwiO1xuICB9XG5cbiAgZnVuY3Rpb24gaXNBcnJheShvYmope1xuICAgIHJldHVybiB0eXBlb2Ygb2JqID09PSAnb2JqZWN0JyAmJiB0eXBlb2Ygb2JqLmxlbmd0aCA9PT0gJ251bWJlcicgJiYgdG9TdHJpbmcob2JqKSA9PT0gJ1tvYmplY3QgQXJyYXldJztcbiAgfVxuXG4gIGZ1bmN0aW9uIGlzQm9vbGVhbihvYmope1xuICAgIHJldHVybiB0eXBlb2Ygb2JqID09PSAnYm9vbGVhbicgfHwgdG9TdHJpbmcob2JqKSA9PT0gJ1tvYmplY3QgQm9vbGVhbl0nO1xuICB9XG5cbiAgZnVuY3Rpb24gZ2V0S2V5KGtleSl7XG4gICAgdmFyIGludEtleSA9IHBhcnNlSW50KGtleSk7XG4gICAgaWYgKGludEtleS50b1N0cmluZygpID09PSBrZXkpIHtcbiAgICAgIHJldHVybiBpbnRLZXk7XG4gICAgfVxuICAgIHJldHVybiBrZXk7XG4gIH1cblxuICBmdW5jdGlvbiBzZXQob2JqLCBwYXRoLCB2YWx1ZSwgZG9Ob3RSZXBsYWNlKXtcbiAgICBpZiAoaXNOdW1iZXIocGF0aCkpIHtcbiAgICAgIHBhdGggPSBbcGF0aF07XG4gICAgfVxuICAgIGlmIChpc0VtcHR5KHBhdGgpKSB7XG4gICAgICByZXR1cm4gb2JqO1xuICAgIH1cbiAgICBpZiAoaXNTdHJpbmcocGF0aCkpIHtcbiAgICAgIHJldHVybiBzZXQob2JqLCBwYXRoLnNwbGl0KCcuJykubWFwKGdldEtleSksIHZhbHVlLCBkb05vdFJlcGxhY2UpO1xuICAgIH1cbiAgICB2YXIgY3VycmVudFBhdGggPSBwYXRoWzBdO1xuXG4gICAgaWYgKHBhdGgubGVuZ3RoID09PSAxKSB7XG4gICAgICB2YXIgb2xkVmFsID0gb2JqW2N1cnJlbnRQYXRoXTtcbiAgICAgIGlmIChvbGRWYWwgPT09IHZvaWQgMCB8fCAhZG9Ob3RSZXBsYWNlKSB7XG4gICAgICAgIG9ialtjdXJyZW50UGF0aF0gPSB2YWx1ZTtcbiAgICAgIH1cbiAgICAgIHJldHVybiBvbGRWYWw7XG4gICAgfVxuXG4gICAgaWYgKG9ialtjdXJyZW50UGF0aF0gPT09IHZvaWQgMCkge1xuICAgICAgLy9jaGVjayBpZiB3ZSBhc3N1bWUgYW4gYXJyYXlcbiAgICAgIGlmKGlzTnVtYmVyKHBhdGhbMV0pKSB7XG4gICAgICAgIG9ialtjdXJyZW50UGF0aF0gPSBbXTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIG9ialtjdXJyZW50UGF0aF0gPSB7fTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICByZXR1cm4gc2V0KG9ialtjdXJyZW50UGF0aF0sIHBhdGguc2xpY2UoMSksIHZhbHVlLCBkb05vdFJlcGxhY2UpO1xuICB9XG5cbiAgZnVuY3Rpb24gZGVsKG9iaiwgcGF0aCkge1xuICAgIGlmIChpc051bWJlcihwYXRoKSkge1xuICAgICAgcGF0aCA9IFtwYXRoXTtcbiAgICB9XG5cbiAgICBpZiAoaXNFbXB0eShvYmopKSB7XG4gICAgICByZXR1cm4gdm9pZCAwO1xuICAgIH1cblxuICAgIGlmIChpc0VtcHR5KHBhdGgpKSB7XG4gICAgICByZXR1cm4gb2JqO1xuICAgIH1cbiAgICBpZihpc1N0cmluZyhwYXRoKSkge1xuICAgICAgcmV0dXJuIGRlbChvYmosIHBhdGguc3BsaXQoJy4nKSk7XG4gICAgfVxuXG4gICAgdmFyIGN1cnJlbnRQYXRoID0gZ2V0S2V5KHBhdGhbMF0pO1xuICAgIHZhciBvbGRWYWwgPSBvYmpbY3VycmVudFBhdGhdO1xuXG4gICAgaWYocGF0aC5sZW5ndGggPT09IDEpIHtcbiAgICAgIGlmIChvbGRWYWwgIT09IHZvaWQgMCkge1xuICAgICAgICBpZiAoaXNBcnJheShvYmopKSB7XG4gICAgICAgICAgb2JqLnNwbGljZShjdXJyZW50UGF0aCwgMSk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgZGVsZXRlIG9ialtjdXJyZW50UGF0aF07XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9IGVsc2Uge1xuICAgICAgaWYgKG9ialtjdXJyZW50UGF0aF0gIT09IHZvaWQgMCkge1xuICAgICAgICByZXR1cm4gZGVsKG9ialtjdXJyZW50UGF0aF0sIHBhdGguc2xpY2UoMSkpO1xuICAgICAgfVxuICAgIH1cblxuICAgIHJldHVybiBvYmo7XG4gIH1cblxuICB2YXIgb2JqZWN0UGF0aCA9IHt9O1xuXG4gIG9iamVjdFBhdGguaGFzID0gZnVuY3Rpb24gKG9iaiwgcGF0aCkge1xuICAgIGlmIChpc0VtcHR5KG9iaikpIHtcbiAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG5cbiAgICBpZiAoaXNOdW1iZXIocGF0aCkpIHtcbiAgICAgIHBhdGggPSBbcGF0aF07XG4gICAgfSBlbHNlIGlmIChpc1N0cmluZyhwYXRoKSkge1xuICAgICAgcGF0aCA9IHBhdGguc3BsaXQoJy4nKTtcbiAgICB9XG5cbiAgICBpZiAoaXNFbXB0eShwYXRoKSB8fCBwYXRoLmxlbmd0aCA9PT0gMCkge1xuICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cblxuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgcGF0aC5sZW5ndGg7IGkrKykge1xuICAgICAgdmFyIGogPSBwYXRoW2ldO1xuICAgICAgaWYgKChpc09iamVjdChvYmopIHx8IGlzQXJyYXkob2JqKSkgJiYgX2hhc093blByb3BlcnR5LmNhbGwob2JqLCBqKSkge1xuICAgICAgICBvYmogPSBvYmpbal07XG4gICAgICB9IGVsc2Uge1xuICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICB9XG4gICAgfVxuXG4gICAgcmV0dXJuIHRydWU7XG4gIH07XG5cbiAgb2JqZWN0UGF0aC5lbnN1cmVFeGlzdHMgPSBmdW5jdGlvbiAob2JqLCBwYXRoLCB2YWx1ZSl7XG4gICAgcmV0dXJuIHNldChvYmosIHBhdGgsIHZhbHVlLCB0cnVlKTtcbiAgfTtcblxuICBvYmplY3RQYXRoLnNldCA9IGZ1bmN0aW9uIChvYmosIHBhdGgsIHZhbHVlLCBkb05vdFJlcGxhY2Upe1xuICAgIHJldHVybiBzZXQob2JqLCBwYXRoLCB2YWx1ZSwgZG9Ob3RSZXBsYWNlKTtcbiAgfTtcblxuICBvYmplY3RQYXRoLmluc2VydCA9IGZ1bmN0aW9uIChvYmosIHBhdGgsIHZhbHVlLCBhdCl7XG4gICAgdmFyIGFyciA9IG9iamVjdFBhdGguZ2V0KG9iaiwgcGF0aCk7XG4gICAgYXQgPSB+fmF0O1xuICAgIGlmICghaXNBcnJheShhcnIpKSB7XG4gICAgICBhcnIgPSBbXTtcbiAgICAgIG9iamVjdFBhdGguc2V0KG9iaiwgcGF0aCwgYXJyKTtcbiAgICB9XG4gICAgYXJyLnNwbGljZShhdCwgMCwgdmFsdWUpO1xuICB9O1xuXG4gIG9iamVjdFBhdGguZW1wdHkgPSBmdW5jdGlvbihvYmosIHBhdGgpIHtcbiAgICBpZiAoaXNFbXB0eShwYXRoKSkge1xuICAgICAgcmV0dXJuIG9iajtcbiAgICB9XG4gICAgaWYgKGlzRW1wdHkob2JqKSkge1xuICAgICAgcmV0dXJuIHZvaWQgMDtcbiAgICB9XG5cbiAgICB2YXIgdmFsdWUsIGk7XG4gICAgaWYgKCEodmFsdWUgPSBvYmplY3RQYXRoLmdldChvYmosIHBhdGgpKSkge1xuICAgICAgcmV0dXJuIG9iajtcbiAgICB9XG5cbiAgICBpZiAoaXNTdHJpbmcodmFsdWUpKSB7XG4gICAgICByZXR1cm4gb2JqZWN0UGF0aC5zZXQob2JqLCBwYXRoLCAnJyk7XG4gICAgfSBlbHNlIGlmIChpc0Jvb2xlYW4odmFsdWUpKSB7XG4gICAgICByZXR1cm4gb2JqZWN0UGF0aC5zZXQob2JqLCBwYXRoLCBmYWxzZSk7XG4gICAgfSBlbHNlIGlmIChpc051bWJlcih2YWx1ZSkpIHtcbiAgICAgIHJldHVybiBvYmplY3RQYXRoLnNldChvYmosIHBhdGgsIDApO1xuICAgIH0gZWxzZSBpZiAoaXNBcnJheSh2YWx1ZSkpIHtcbiAgICAgIHZhbHVlLmxlbmd0aCA9IDA7XG4gICAgfSBlbHNlIGlmIChpc09iamVjdCh2YWx1ZSkpIHtcbiAgICAgIGZvciAoaSBpbiB2YWx1ZSkge1xuICAgICAgICBpZiAoX2hhc093blByb3BlcnR5LmNhbGwodmFsdWUsIGkpKSB7XG4gICAgICAgICAgZGVsZXRlIHZhbHVlW2ldO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfSBlbHNlIHtcbiAgICAgIHJldHVybiBvYmplY3RQYXRoLnNldChvYmosIHBhdGgsIG51bGwpO1xuICAgIH1cbiAgfTtcblxuICBvYmplY3RQYXRoLnB1c2ggPSBmdW5jdGlvbiAob2JqLCBwYXRoIC8qLCB2YWx1ZXMgKi8pe1xuICAgIHZhciBhcnIgPSBvYmplY3RQYXRoLmdldChvYmosIHBhdGgpO1xuICAgIGlmICghaXNBcnJheShhcnIpKSB7XG4gICAgICBhcnIgPSBbXTtcbiAgICAgIG9iamVjdFBhdGguc2V0KG9iaiwgcGF0aCwgYXJyKTtcbiAgICB9XG5cbiAgICBhcnIucHVzaC5hcHBseShhcnIsIEFycmF5LnByb3RvdHlwZS5zbGljZS5jYWxsKGFyZ3VtZW50cywgMikpO1xuICB9O1xuXG4gIG9iamVjdFBhdGguY29hbGVzY2UgPSBmdW5jdGlvbiAob2JqLCBwYXRocywgZGVmYXVsdFZhbHVlKSB7XG4gICAgdmFyIHZhbHVlO1xuXG4gICAgZm9yICh2YXIgaSA9IDAsIGxlbiA9IHBhdGhzLmxlbmd0aDsgaSA8IGxlbjsgaSsrKSB7XG4gICAgICBpZiAoKHZhbHVlID0gb2JqZWN0UGF0aC5nZXQob2JqLCBwYXRoc1tpXSkpICE9PSB2b2lkIDApIHtcbiAgICAgICAgcmV0dXJuIHZhbHVlO1xuICAgICAgfVxuICAgIH1cblxuICAgIHJldHVybiBkZWZhdWx0VmFsdWU7XG4gIH07XG5cbiAgb2JqZWN0UGF0aC5nZXQgPSBmdW5jdGlvbiAob2JqLCBwYXRoLCBkZWZhdWx0VmFsdWUpe1xuICAgIGlmIChpc051bWJlcihwYXRoKSkge1xuICAgICAgcGF0aCA9IFtwYXRoXTtcbiAgICB9XG4gICAgaWYgKGlzRW1wdHkocGF0aCkpIHtcbiAgICAgIHJldHVybiBvYmo7XG4gICAgfVxuICAgIGlmIChpc0VtcHR5KG9iaikpIHtcbiAgICAgIHJldHVybiBkZWZhdWx0VmFsdWU7XG4gICAgfVxuICAgIGlmIChpc1N0cmluZyhwYXRoKSkge1xuICAgICAgcmV0dXJuIG9iamVjdFBhdGguZ2V0KG9iaiwgcGF0aC5zcGxpdCgnLicpLCBkZWZhdWx0VmFsdWUpO1xuICAgIH1cblxuICAgIHZhciBjdXJyZW50UGF0aCA9IGdldEtleShwYXRoWzBdKTtcblxuICAgIGlmIChwYXRoLmxlbmd0aCA9PT0gMSkge1xuICAgICAgaWYgKG9ialtjdXJyZW50UGF0aF0gPT09IHZvaWQgMCkge1xuICAgICAgICByZXR1cm4gZGVmYXVsdFZhbHVlO1xuICAgICAgfVxuICAgICAgcmV0dXJuIG9ialtjdXJyZW50UGF0aF07XG4gICAgfVxuXG4gICAgcmV0dXJuIG9iamVjdFBhdGguZ2V0KG9ialtjdXJyZW50UGF0aF0sIHBhdGguc2xpY2UoMSksIGRlZmF1bHRWYWx1ZSk7XG4gIH07XG5cbiAgb2JqZWN0UGF0aC5kZWwgPSBmdW5jdGlvbihvYmosIHBhdGgpIHtcbiAgICByZXR1cm4gZGVsKG9iaiwgcGF0aCk7XG4gIH07XG5cbiAgcmV0dXJuIG9iamVjdFBhdGg7XG59KTtcbiIsIi8qKlxuICogTW9kdWxlIERlcGVuZGVuY2llcy5cbiAqL1xuXG52YXIgcmFmID0gcmVxdWlyZSgncmFmJyk7XG5cbi8qKlxuICogRXhwb3J0IGB0aHJvdHRsZWAuXG4gKi9cblxubW9kdWxlLmV4cG9ydHMgPSB0aHJvdHRsZTtcblxuLyoqXG4gKiBFeGVjdXRlcyBhIGZ1bmN0aW9uIGF0IG1vc3Qgb25jZSBwZXIgYW5pbWF0aW9uIGZyYW1lLiBLaW5kIG9mIGxpa2VcbiAqIHRocm90dGxlLCBidXQgaXQgdGhyb3R0bGVzIGF0IH42MEh6LlxuICpcbiAqIEBwYXJhbSB7RnVuY3Rpb259IGZuIC0gdGhlIEZ1bmN0aW9uIHRvIHRocm90dGxlIG9uY2UgcGVyIGFuaW1hdGlvbiBmcmFtZVxuICogQHJldHVybiB7RnVuY3Rpb259XG4gKiBAcHVibGljXG4gKi9cblxuZnVuY3Rpb24gdGhyb3R0bGUoZm4pIHtcbiAgdmFyIHJ0bjtcbiAgdmFyIGlnbm9yaW5nID0gZmFsc2U7XG5cbiAgcmV0dXJuIGZ1bmN0aW9uIHF1ZXVlKCkge1xuICAgIGlmIChpZ25vcmluZykgcmV0dXJuIHJ0bjtcbiAgICBpZ25vcmluZyA9IHRydWU7XG5cbiAgICByYWYoZnVuY3Rpb24oKSB7XG4gICAgICBpZ25vcmluZyA9IGZhbHNlO1xuICAgIH0pO1xuXG4gICAgcnRuID0gZm4uYXBwbHkodGhpcywgYXJndW1lbnRzKTtcbiAgICByZXR1cm4gcnRuO1xuICB9O1xufVxuIiwibW9kdWxlLmV4cG9ydHMgPSBleHBvcnRzID0gcmVxdWlyZSgnLi9saWIvc2xpY2VkJyk7XG4iLCJcbi8qKlxuICogQW4gQXJyYXkucHJvdG90eXBlLnNsaWNlLmNhbGwoYXJndW1lbnRzKSBhbHRlcm5hdGl2ZVxuICpcbiAqIEBwYXJhbSB7T2JqZWN0fSBhcmdzIHNvbWV0aGluZyB3aXRoIGEgbGVuZ3RoXG4gKiBAcGFyYW0ge051bWJlcn0gc2xpY2VcbiAqIEBwYXJhbSB7TnVtYmVyfSBzbGljZUVuZFxuICogQGFwaSBwdWJsaWNcbiAqL1xuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIChhcmdzLCBzbGljZSwgc2xpY2VFbmQpIHtcbiAgdmFyIHJldCA9IFtdO1xuICB2YXIgbGVuID0gYXJncy5sZW5ndGg7XG5cbiAgaWYgKDAgPT09IGxlbikgcmV0dXJuIHJldDtcblxuICB2YXIgc3RhcnQgPSBzbGljZSA8IDBcbiAgICA/IE1hdGgubWF4KDAsIHNsaWNlICsgbGVuKVxuICAgIDogc2xpY2UgfHwgMDtcblxuICBpZiAoc2xpY2VFbmQgIT09IHVuZGVmaW5lZCkge1xuICAgIGxlbiA9IHNsaWNlRW5kIDwgMFxuICAgICAgPyBzbGljZUVuZCArIGxlblxuICAgICAgOiBzbGljZUVuZFxuICB9XG5cbiAgd2hpbGUgKGxlbi0tID4gc3RhcnQpIHtcbiAgICByZXRbbGVuIC0gc3RhcnRdID0gYXJnc1tsZW5dO1xuICB9XG5cbiAgcmV0dXJuIHJldDtcbn1cblxuIiwiJ3VzZSBzdHJpY3QnO1xuXG5mdW5jdGlvbiBTb3VuZENsb3VkIChjbGllbnRJZCkge1xuICAgIGlmICghKHRoaXMgaW5zdGFuY2VvZiBTb3VuZENsb3VkKSkge1xuICAgICAgICByZXR1cm4gbmV3IFNvdW5kQ2xvdWQoY2xpZW50SWQpO1xuICAgIH1cblxuICAgIGlmICghY2xpZW50SWQpIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdTb3VuZENsb3VkIEFQSSBjbGllbnRJZCBpcyByZXF1aXJlZCwgZ2V0IGl0IC0gaHR0cHM6Ly9kZXZlbG9wZXJzLnNvdW5kY2xvdWQuY29tLycpO1xuICAgIH1cblxuICAgIHRoaXMuX2V2ZW50cyA9IHt9O1xuXG4gICAgdGhpcy5fY2xpZW50SWQgPSBjbGllbnRJZDtcbiAgICB0aGlzLl9iYXNlVXJsID0gJ2h0dHA6Ly9hcGkuc291bmRjbG91ZC5jb20nO1xuXG4gICAgdGhpcy5wbGF5aW5nID0gZmFsc2U7XG4gICAgdGhpcy5kdXJhdGlvbiA9IDA7XG5cbiAgICB0aGlzLmF1ZGlvID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnYXVkaW8nKTtcbn1cblxuU291bmRDbG91ZC5wcm90b3R5cGUucmVzb2x2ZSA9IGZ1bmN0aW9uICh1cmwsIGNhbGxiYWNrKSB7XG4gICAgaWYgKCF1cmwpIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdTb3VuZENsb3VkIHRyYWNrIG9yIHBsYXlsaXN0IHVybCBpcyByZXF1aXJlZCcpO1xuICAgIH1cblxuICAgIHVybCA9IHRoaXMuX2Jhc2VVcmwrJy9yZXNvbHZlLmpzb24/dXJsPScrdXJsKycmY2xpZW50X2lkPScrdGhpcy5fY2xpZW50SWQ7XG5cbiAgICB0aGlzLl9qc29ucCh1cmwsIGZ1bmN0aW9uIChkYXRhKSB7XG4gICAgICAgIGlmIChkYXRhLnRyYWNrcykge1xuICAgICAgICAgICAgdGhpcy5fcGxheWxpc3QgPSBkYXRhO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgdGhpcy5fdHJhY2sgPSBkYXRhO1xuICAgICAgICB9XG5cbiAgICAgICAgdGhpcy5kdXJhdGlvbiA9IGRhdGEuZHVyYXRpb24vMTAwMDsgLy8gY29udmVydCB0byBzZWNvbmRzXG4gICAgICAgIGNhbGxiYWNrKGRhdGEpO1xuICAgIH0uYmluZCh0aGlzKSk7XG59O1xuXG5Tb3VuZENsb3VkLnByb3RvdHlwZS5fanNvbnAgPSBmdW5jdGlvbiAodXJsLCBjYWxsYmFjaykge1xuICAgIHZhciB0YXJnZXQgPSBkb2N1bWVudC5nZXRFbGVtZW50c0J5VGFnTmFtZSgnc2NyaXB0JylbMF0gfHwgZG9jdW1lbnQuaGVhZDtcbiAgICB2YXIgc2NyaXB0ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnc2NyaXB0Jyk7XG5cbiAgICB2YXIgaWQgPSAnanNvbnBfY2FsbGJhY2tfJytNYXRoLnJvdW5kKDEwMDAwMCpNYXRoLnJhbmRvbSgpKTtcbiAgICB3aW5kb3dbaWRdID0gZnVuY3Rpb24gKGRhdGEpIHtcbiAgICAgICAgaWYgKHNjcmlwdC5wYXJlbnROb2RlKSB7XG4gICAgICAgICAgICBzY3JpcHQucGFyZW50Tm9kZS5yZW1vdmVDaGlsZChzY3JpcHQpO1xuICAgICAgICB9XG4gICAgICAgIHdpbmRvd1tpZF0gPSBmdW5jdGlvbiAoKSB7fTtcbiAgICAgICAgY2FsbGJhY2soZGF0YSk7XG4gICAgfTtcblxuICAgIHNjcmlwdC5zcmMgPSB1cmwgKyAodXJsLmluZGV4T2YoJz8nKSA+PSAwID8gJyYnIDogJz8nKSArICdjYWxsYmFjaz0nICsgaWQ7XG4gICAgdGFyZ2V0LnBhcmVudE5vZGUuaW5zZXJ0QmVmb3JlKHNjcmlwdCwgdGFyZ2V0KTtcbn07XG5cblNvdW5kQ2xvdWQucHJvdG90eXBlLm9uID0gZnVuY3Rpb24gKGUsIGZuKSB7XG4gICAgdGhpcy5fZXZlbnRzW2VdID0gZm47XG4gICAgdGhpcy5hdWRpby5hZGRFdmVudExpc3RlbmVyKGUsIGZuLCBmYWxzZSk7XG59O1xuXG5Tb3VuZENsb3VkLnByb3RvdHlwZS5vZmYgPSBmdW5jdGlvbiAoZSwgZm4pIHtcbiAgICB0aGlzLl9ldmVudHNbZV0gPSBudWxsO1xuICAgIHRoaXMuYXVkaW8ucmVtb3ZlRXZlbnRMaXN0ZW5lcihlLCBmbik7XG59O1xuXG5Tb3VuZENsb3VkLnByb3RvdHlwZS51bmJpbmRBbGwgPSBmdW5jdGlvbiAoKSB7XG4gICAgZm9yICh2YXIgZSBpbiB0aGlzLl9ldmVudHMpIHtcbiAgICAgICAgdmFyIGZuID0gdGhpcy5fZXZlbnRzW2VdO1xuICAgICAgICBpZiAoZm4pIHtcbiAgICAgICAgICAgIHRoaXMub2ZmKGUsIGZuKTtcbiAgICAgICAgfVxuICAgIH1cbn07XG5cblNvdW5kQ2xvdWQucHJvdG90eXBlLnByZWxvYWQgPSBmdW5jdGlvbiAoc3RyZWFtVXJsKSB7XG4gICAgdGhpcy5fdHJhY2sgPSB7c3RyZWFtX3VybDogc3RyZWFtVXJsfTtcbiAgICB0aGlzLmF1ZGlvLnNyYyA9IHN0cmVhbVVybCsnP2NsaWVudF9pZD0nK3RoaXMuX2NsaWVudElkO1xufTtcblxuU291bmRDbG91ZC5wcm90b3R5cGUucGxheSA9IGZ1bmN0aW9uIChvcHRpb25zKSB7XG4gICAgb3B0aW9ucyA9IG9wdGlvbnMgfHwge307XG4gICAgdmFyIHNyYztcblxuICAgIGlmIChvcHRpb25zLnN0cmVhbVVybCkge1xuICAgICAgICBzcmMgPSBvcHRpb25zLnN0cmVhbVVybDtcbiAgICB9IGVsc2UgaWYgKHRoaXMuX3BsYXlsaXN0KSB7XG4gICAgICAgIHZhciBsZW5ndGggPSB0aGlzLl9wbGF5bGlzdC50cmFja3MubGVuZ3RoO1xuICAgICAgICBpZiAobGVuZ3RoKSB7XG4gICAgICAgICAgICB0aGlzLl9wbGF5bGlzdEluZGV4ID0gb3B0aW9ucy5wbGF5bGlzdEluZGV4IHx8IDA7XG5cbiAgICAgICAgICAgIC8vIGJlIHNpbGVudCBpZiBpbmRleCBpcyBvdXQgb2YgcmFuZ2VcbiAgICAgICAgICAgIGlmICh0aGlzLl9wbGF5bGlzdEluZGV4ID49IGxlbmd0aCB8fCB0aGlzLl9wbGF5bGlzdEluZGV4IDwgMCkge1xuICAgICAgICAgICAgICAgIHRoaXMuX3BsYXlsaXN0SW5kZXggPSAwO1xuICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHNyYyA9IHRoaXMuX3BsYXlsaXN0LnRyYWNrc1t0aGlzLl9wbGF5bGlzdEluZGV4XS5zdHJlYW1fdXJsO1xuICAgICAgICB9XG4gICAgfSBlbHNlIGlmICh0aGlzLl90cmFjaykge1xuICAgICAgICBzcmMgPSB0aGlzLl90cmFjay5zdHJlYW1fdXJsO1xuICAgIH1cblxuICAgIGlmICghc3JjKSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcignVGhlcmUgaXMgbm8gdHJhY2tzIHRvIHBsYXksIHVzZSBgc3RyZWFtVXJsYCBvcHRpb24gb3IgYGxvYWRgIG1ldGhvZCcpO1xuICAgIH1cblxuICAgIHNyYyArPSAnP2NsaWVudF9pZD0nK3RoaXMuX2NsaWVudElkO1xuXG4gICAgaWYgKHNyYyAhPT0gdGhpcy5hdWRpby5zcmMpIHtcbiAgICAgICAgdGhpcy5hdWRpby5zcmMgPSBzcmM7XG4gICAgfVxuXG4gICAgdGhpcy5wbGF5aW5nID0gc3JjO1xuICAgIHRoaXMuYXVkaW8ucGxheSgpO1xufTtcblxuU291bmRDbG91ZC5wcm90b3R5cGUucGF1c2UgPSBmdW5jdGlvbiAoKSB7XG4gICAgdGhpcy5hdWRpby5wYXVzZSgpO1xuICAgIHRoaXMucGxheWluZyA9IGZhbHNlO1xufTtcblxuU291bmRDbG91ZC5wcm90b3R5cGUuc3RvcCA9IGZ1bmN0aW9uICgpIHtcbiAgICB0aGlzLmF1ZGlvLnBhdXNlKCk7XG4gICAgdGhpcy5hdWRpby5jdXJyZW50VGltZSA9IDA7XG4gICAgdGhpcy5wbGF5aW5nID0gZmFsc2U7XG59O1xuXG5Tb3VuZENsb3VkLnByb3RvdHlwZS5uZXh0ID0gZnVuY3Rpb24gKCkge1xuICAgIHZhciB0cmFja3NMZW5ndGggPSB0aGlzLl9wbGF5bGlzdC50cmFja3MubGVuZ3RoO1xuICAgIGlmICh0aGlzLl9wbGF5bGlzdEluZGV4ID49IHRyYWNrc0xlbmd0aC0xKSB7XG4gICAgICAgIHJldHVybjtcbiAgICB9XG4gICAgaWYgKHRoaXMuX3BsYXlsaXN0ICYmIHRyYWNrc0xlbmd0aCkge1xuICAgICAgICB0aGlzLnBsYXkoe3BsYXlsaXN0SW5kZXg6ICsrdGhpcy5fcGxheWxpc3RJbmRleH0pO1xuICAgIH1cbn07XG5cblNvdW5kQ2xvdWQucHJvdG90eXBlLnByZXZpb3VzID0gZnVuY3Rpb24gKCkge1xuICAgIGlmICh0aGlzLl9wbGF5bGlzdEluZGV4IDw9IDApIHtcbiAgICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBpZiAodGhpcy5fcGxheWxpc3QgJiYgdGhpcy5fcGxheWxpc3QudHJhY2tzLmxlbmd0aCkge1xuICAgICAgICB0aGlzLnBsYXkoe3BsYXlsaXN0SW5kZXg6IC0tdGhpcy5fcGxheWxpc3RJbmRleH0pO1xuICAgIH1cbn07XG5cblNvdW5kQ2xvdWQucHJvdG90eXBlLnNlZWsgPSBmdW5jdGlvbiAoZSkge1xuICAgIGlmICghdGhpcy5hdWRpby5yZWFkeVN0YXRlKSB7XG4gICAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG4gICAgdmFyIHBlcmNlbnQgPSBlLm9mZnNldFggLyBlLnRhcmdldC5vZmZzZXRXaWR0aCB8fCAoZS5sYXllclggLSBlLnRhcmdldC5vZmZzZXRMZWZ0KSAvIGUudGFyZ2V0Lm9mZnNldFdpZHRoO1xuICAgIHRoaXMuYXVkaW8uY3VycmVudFRpbWUgPSBwZXJjZW50ICogKHRoaXMuYXVkaW8uZHVyYXRpb24gfHwgMCk7XG59O1xuXG5tb2R1bGUuZXhwb3J0cyA9IFNvdW5kQ2xvdWQ7XG4iLCIvKiogQGpzeCBkZWt1LmRvbSAqL1xuXG5pbXBvcnQgZGVrdSBmcm9tICdkZWt1JztcblxuY29uc3QgUGxheUJ1dHRvbiA9IHtcbiAgICBkZWZhdWx0UHJvcHM6IHtcbiAgICAgICAgcGxheWluZzogZmFsc2UsXG4gICAgICAgIHNlZWtpbmc6IGZhbHNlXG4gICAgfSxcblxuICAgIHByb3BUeXBlczoge1xuICAgICAgICBwbGF5aW5nOiB7XG4gICAgICAgICAgICB0eXBlOiAnYm9vbGVhbidcbiAgICAgICAgfSxcbiAgICAgICAgc2Vla2luZzoge1xuICAgICAgICAgICAgdHlwZTogJ2Jvb2xlYW4nXG4gICAgICAgIH1cbiAgICB9LFxuXG4gICAgcmVuZGVyKGNvbXBvbmVudCkge1xuICAgICAgICBjb25zdCB7IHByb3BzIH0gPSBjb21wb25lbnQ7XG5cbiAgICAgICAgZnVuY3Rpb24gaGFuZGxlQ2xpY2sgKGUpIHtcbiAgICAgICAgICAgIGUucHJldmVudERlZmF1bHQoKTtcblxuICAgICAgICAgICAgY29uc3QgeyBwbGF5aW5nLCBzb3VuZENsb3VkQXVkaW8sIG9uVG9nZ2xlUGxheSB9ID0gcHJvcHM7XG5cbiAgICAgICAgICAgIGlmICghcGxheWluZykge1xuICAgICAgICAgICAgICAgIHNvdW5kQ2xvdWRBdWRpbyAmJiBzb3VuZENsb3VkQXVkaW8ucGxheSgpO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBzb3VuZENsb3VkQXVkaW8gJiYgc291bmRDbG91ZEF1ZGlvLnBhdXNlKCk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIG9uVG9nZ2xlUGxheSAmJiBvblRvZ2dsZVBsYXkoZSk7XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gKFxuICAgICAgICAgICAgPGJ1dHRvbiBjbGFzcz1cInNiLXNvdW5kcGxheWVyLXdpZGdldC1wbGF5XCIgb25DbGljaz17aGFuZGxlQ2xpY2t9PlxuICAgICAgICAgICAgICAgIHtwcm9wcy5wbGF5aW5nID8gJ1BhdXNlJyA6ICdQbGF5J31cbiAgICAgICAgICAgIDwvYnV0dG9uPlxuICAgICAgICApO1xuICAgIH1cbn07XG5cbmV4cG9ydCBkZWZhdWx0IFBsYXlCdXR0b247XG4iLCIvKiogQGpzeCBkZWt1LmRvbSAqL1xuXG5pbXBvcnQgZGVrdSBmcm9tICdkZWt1JztcblxuY29uc3QgUHJvZ3Jlc3MgPSB7XG4gICAgZGVmYXVsdFByb3BzOiB7XG4gICAgICAgIHZhbHVlOiAwXG4gICAgfSxcblxuICAgIHByb3BUeXBlczoge1xuICAgICAgICB2YWx1ZToge1xuICAgICAgICAgICAgdHlwZTogJ251bWJlcidcbiAgICAgICAgfVxuICAgIH0sXG5cbiAgICByZW5kZXIoY29tcG9uZW50KSB7XG4gICAgICAgIGxldCB7IHByb3BzIH0gPSBjb21wb25lbnQ7XG4gICAgICAgIGxldCB7IHZhbHVlLCBzb3VuZENsb3VkQXVkaW8gfSA9IHByb3BzO1xuXG4gICAgICAgIGlmICh2YWx1ZSA8IDApIHtcbiAgICAgICAgICAgIHZhbHVlID0gMDtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmICh2YWx1ZSA+IDEwMCkge1xuICAgICAgICAgICAgdmFsdWUgPSAxMDA7XG4gICAgICAgIH1cblxuICAgICAgICBsZXQgc3R5bGUgPSB7d2lkdGg6IGAke3ZhbHVlfSVgfTtcblxuICAgICAgICBmdW5jdGlvbiBoYW5kbGVTZWVrVHJhY2sgKGUpIHtcbiAgICAgICAgICAgIGNvbnN0IHhQb3MgPSAoZS5wYWdlWCAtIGUuY3VycmVudFRhcmdldC5nZXRCb3VuZGluZ0NsaWVudFJlY3QoKS5sZWZ0KSAvIGUuY3VycmVudFRhcmdldC5vZmZzZXRXaWR0aDtcblxuICAgICAgICAgICAgaWYgKHNvdW5kQ2xvdWRBdWRpbyAmJiAhaXNOYU4oc291bmRDbG91ZEF1ZGlvLmF1ZGlvLmR1cmF0aW9uKSkge1xuICAgICAgICAgICAgICAgIHNvdW5kQ2xvdWRBdWRpby5hdWRpby5jdXJyZW50VGltZSA9ICh4UG9zICogc291bmRDbG91ZEF1ZGlvLmF1ZGlvLmR1cmF0aW9uKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiAoXG4gICAgICAgICAgICA8ZGl2IGNsYXNzPVwic2Itc291bmRwbGF5ZXItd2lkZ2V0LXByb2dyZXNzLWNvbnRhaW5lclwiIG9uQ2xpY2s9e2hhbmRsZVNlZWtUcmFja30+XG4gICAgICAgICAgICAgICAgPGRpdiBjbGFzcz1cInNiLXNvdW5kcGxheWVyLXdpZGdldC1wcm9ncmVzcy1pbm5lclwiIHN0eWxlPXtzdHlsZX0gLz5cbiAgICAgICAgICAgIDwvZGl2PlxuICAgICAgICApO1xuICAgIH1cbn07XG5cbmV4cG9ydCBkZWZhdWx0IFByb2dyZXNzO1xuIiwiLyoqIEBqc3ggZGVrdS5kb20gKi9cblxuaW1wb3J0IGRla3UgZnJvbSAnZGVrdSc7XG5cbmZ1bmN0aW9uIHByZXR0eVRpbWUgKHRpbWUpIHtcbiAgICBsZXQgaG91cnMgPSBNYXRoLmZsb29yKHRpbWUgLyAzNjAwKTtcbiAgICBsZXQgbWlucyA9ICcwJyArIE1hdGguZmxvb3IoKHRpbWUgJSAzNjAwKSAvIDYwKTtcbiAgICBsZXQgc2VjcyA9ICcwJyArIE1hdGguZmxvb3IoKHRpbWUgJSA2MCkpO1xuXG4gICAgbWlucyA9IG1pbnMuc3Vic3RyKG1pbnMubGVuZ3RoIC0gMik7XG4gICAgc2VjcyA9IHNlY3Muc3Vic3RyKHNlY3MubGVuZ3RoIC0gMik7XG5cbiAgICBpZiAoIWlzTmFOKHNlY3MpKSB7XG4gICAgICAgIGlmIChob3Vycykge1xuICAgICAgICAgICAgcmV0dXJuIGAke2hvdXJzfToke21pbnN9OiR7c2Vjc31gO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgcmV0dXJuIGAke21pbnN9OiR7c2Vjc31gO1xuICAgICAgICB9XG4gICAgfSBlbHNlIHtcbiAgICAgICAgcmV0dXJuICcwMDowMCc7XG4gICAgfVxufVxuXG5jb25zdCBUaW1lciA9IHtcbiAgICBkZWZhdWx0UHJvcHM6IHtcbiAgICAgICAgZHVyYXRpb246IDAsXG4gICAgICAgIGN1cnJlbnRUaW1lOiAwXG4gICAgfSxcblxuICAgIHByb3BUeXBlczoge1xuICAgICAgICBkdXJhdGlvbjoge1xuICAgICAgICAgICAgdHlwZTogJ251bWJlcidcbiAgICAgICAgfSxcbiAgICAgICAgY3VycmVudFRpbWU6IHtcbiAgICAgICAgICAgIHR5cGU6ICdudW1iZXInXG4gICAgICAgIH1cbiAgICB9LFxuXG4gICAgcmVuZGVyKGNvbXBvbmVudCkge1xuICAgICAgICBjb25zdCB7IHByb3BzIH0gPSBjb21wb25lbnQ7XG5cbiAgICAgICAgcmV0dXJuIChcbiAgICAgICAgICAgIDxkaXYgY2xhc3M9XCJzYi1zb3VuZHBsYXllci13aWRnZXQtdGltZXJcIj5cbiAgICAgICAgICAgICAgICB7cHJldHR5VGltZShwcm9wcy5jdXJyZW50VGltZSl9IC8ge3ByZXR0eVRpbWUocHJvcHMuZHVyYXRpb24pfVxuICAgICAgICAgICAgPC9kaXY+XG4gICAgICAgICk7XG4gICAgfVxufTtcblxuZXhwb3J0IGRlZmF1bHQgVGltZXI7XG4iLCIvLyBoYW5kbGluZyBtdWx0aXBsZSBhdWRpbyBvbiB0aGUgcGFnZSBoZWxwZXJzXG5sZXQgX2F1ZGlvcyA9IFtdO1xuXG5leHBvcnQgZnVuY3Rpb24gc3RvcEFsbE90aGVyIChwbGF5aW5nKSB7XG4gICAgX2F1ZGlvcy5mb3JFYWNoKChzb3VuZENsb3VkQXVkaW8pID0+IHtcbiAgICAgICAgaWYgKHNvdW5kQ2xvdWRBdWRpby5wbGF5aW5nICYmIHNvdW5kQ2xvdWRBdWRpby5wbGF5aW5nICE9PSBwbGF5aW5nKSB7XG4gICAgICAgICAgICBzb3VuZENsb3VkQXVkaW8uc3RvcCgpO1xuICAgICAgICB9XG4gICAgfSk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBhZGRUb1N0b3JlIChzb3VuZENsb3VkQXVkaW8pIHtcbiAgICBsZXQgaXNQcmVzZW50ID0gZmFsc2U7XG5cbiAgICBmb3IgKGxldCBpID0gMCwgbGVuID0gX2F1ZGlvcy5sZW5ndGg7IGkgPCBsZW47IGkrKykge1xuICAgICAgICBsZXQgX3NvdW5kQ2xvdWRBdWRpbyA9IF9hdWRpb3NbaV07XG4gICAgICAgIGlmIChfc291bmRDbG91ZEF1ZGlvLnBsYXlpbmcgPT09IHNvdW5kQ2xvdWRBdWRpby5wbGF5aW5nKSB7XG4gICAgICAgICAgICBpc1ByZXNlbnQgPSB0cnVlO1xuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBpZiAoIWlzUHJlc2VudCkge1xuICAgICAgICBfYXVkaW9zLnB1c2goc291bmRDbG91ZEF1ZGlvKTtcbiAgICB9XG59XG4iLCIvKiogQGpzeCBkZWt1LmRvbSAqL1xuXG5pbXBvcnQgZGVrdSBmcm9tICdkZWt1JztcbmltcG9ydCBTb3VuZENsb3VkQXVkaW8gZnJvbSAnc291bmRjbG91ZC1hdWRpbyc7XG5cbmltcG9ydCBQbGF5QnV0dG9uIGZyb20gJy4vY29tcG9uZW50cy9QbGF5QnV0dG9uJztcbmltcG9ydCBQcm9ncmVzcyBmcm9tICcuL2NvbXBvbmVudHMvUHJvZ3Jlc3MnO1xuaW1wb3J0IFRpbWVyIGZyb20gJy4vY29tcG9uZW50cy9UaW1lcic7XG5cbmltcG9ydCB7IHN0b3BBbGxPdGhlciwgYWRkVG9TdG9yZSB9IGZyb20gJy4vdXRpbHMvYXVkaW9TdG9yZSc7XG5cbmNvbnN0IFdpZGdldCA9IHtcbiAgICBpbml0aWFsU3RhdGUoKSB7XG4gICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICBkdXJhdGlvbjogMCxcbiAgICAgICAgICAgIGN1cnJlbnRUaW1lOiAwLFxuICAgICAgICAgICAgc2Vla2luZzogZmFsc2UsXG4gICAgICAgICAgICBwbGF5aW5nOiBmYWxzZVxuICAgICAgICB9O1xuICAgIH0sXG5cbiAgICBhZnRlck1vdW50KGNvbXBvbmVudCwgZWwsIHNldFN0YXRlKSB7XG4gICAgICAgIGNvbnN0IHsgcHJvcHMgfSA9IGNvbXBvbmVudDtcbiAgICAgICAgY29uc3QgeyBzb3VuZENsb3VkQXVkaW8gfSA9IHByb3BzO1xuXG4gICAgICAgIHNvdW5kQ2xvdWRBdWRpby5yZXNvbHZlKHByb3BzLnVybCwgKGRhdGEpID0+IHtcbiAgICAgICAgICAgIHNldFN0YXRlKHtcbiAgICAgICAgICAgICAgICBbZGF0YS50cmFja3MgPyAncGxheWxpc3QnIDogJ3RyYWNrJ106IGRhdGFcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9KTtcblxuICAgICAgICBmdW5jdGlvbiBvbkF1ZGlvU3RhcnRlZCAoKSB7XG4gICAgICAgICAgICBzZXRTdGF0ZSh7cGxheWluZzogdHJ1ZX0pO1xuXG4gICAgICAgICAgICBzdG9wQWxsT3RoZXIoc291bmRDbG91ZEF1ZGlvLnBsYXlpbmcpO1xuICAgICAgICAgICAgYWRkVG9TdG9yZShzb3VuZENsb3VkQXVkaW8pO1xuICAgICAgICB9XG5cbiAgICAgICAgZnVuY3Rpb24gZ2V0Q3VycmVudFRpbWUgKCkge1xuICAgICAgICAgICAgc2V0U3RhdGUoe2N1cnJlbnRUaW1lOiBzb3VuZENsb3VkQXVkaW8uYXVkaW8uY3VycmVudFRpbWV9KTtcbiAgICAgICAgfVxuXG4gICAgICAgIGZ1bmN0aW9uIGdldER1cmF0aW9uICgpIHtcbiAgICAgICAgICAgIHNldFN0YXRlKHtkdXJhdGlvbjogc291bmRDbG91ZEF1ZGlvLmF1ZGlvLmR1cmF0aW9ufSk7XG4gICAgICAgIH1cblxuICAgICAgICBmdW5jdGlvbiBvblNlZWtpbmdUcmFjayAoKSB7XG4gICAgICAgICAgICBzZXRTdGF0ZSh7c2Vla2luZzogdHJ1ZX0pO1xuICAgICAgICB9XG5cbiAgICAgICAgZnVuY3Rpb24gb25TZWVrZWRUcmFjayAoKSB7XG4gICAgICAgICAgICBzZXRTdGF0ZSh7c2Vla2luZzogZmFsc2V9KTtcbiAgICAgICAgfVxuXG4gICAgICAgIGZ1bmN0aW9uIG9uQXVkaW9FbmRlZCAoKSB7XG4gICAgICAgICAgICBzZXRTdGF0ZSh7cGxheWluZzogZmFsc2V9KTtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIGh0dHBzOi8vZGV2ZWxvcGVyLm1vemlsbGEub3JnL2VuLVVTL2RvY3MvV2ViL0d1aWRlL0V2ZW50cy9NZWRpYV9ldmVudHNcbiAgICAgICAgc291bmRDbG91ZEF1ZGlvLm9uKCdwbGF5aW5nJywgb25BdWRpb1N0YXJ0ZWQpO1xuICAgICAgICBzb3VuZENsb3VkQXVkaW8ub24oJ3RpbWV1cGRhdGUnLCBnZXRDdXJyZW50VGltZSk7XG4gICAgICAgIHNvdW5kQ2xvdWRBdWRpby5vbignbG9hZGVkbWV0YWRhdGEnLCBnZXREdXJhdGlvbik7XG4gICAgICAgIHNvdW5kQ2xvdWRBdWRpby5vbignc2Vla2luZycsIG9uU2Vla2luZ1RyYWNrKTtcbiAgICAgICAgc291bmRDbG91ZEF1ZGlvLm9uKCdzZWVrZWQnLCBvblNlZWtlZFRyYWNrKTtcbiAgICAgICAgc291bmRDbG91ZEF1ZGlvLm9uKCdwYXVzZScsIG9uQXVkaW9FbmRlZCk7XG4gICAgICAgIHNvdW5kQ2xvdWRBdWRpby5vbignZW5kZWQnLCBvbkF1ZGlvRW5kZWQpO1xuICAgIH0sXG5cblxuICAgIGJlZm9yZU1vdW50KGNvbXBvbmVudCkge1xuICAgICAgICBjb25zdCB7IHByb3BzIH0gPSBjb21wb25lbnQ7XG4gICAgICAgIHByb3BzLnNvdW5kQ2xvdWRBdWRpby51bmJpbmRBbGwoKTtcbiAgICB9LFxuXG4gICAgcmVuZGVyKGNvbXBvbmVudCkge1xuICAgICAgICBsZXQgeyBzdGF0ZSwgcHJvcHMgfSA9IGNvbXBvbmVudDtcblxuICAgICAgICBjb25zb2xlLmxvZygncmVuZGVyJyk7XG5cbiAgICAgICAgcmV0dXJuIChcbiAgICAgICAgICAgIDxkaXYgY2xhc3M9XCJzYi1zb3VuZHBsYXllci13aWRnZXQtY292ZXJcIiBzdHlsZT17c3RhdGUudHJhY2sgPyB7XG4gICAgICAgICAgICAgICAgJ2JhY2tncm91bmQtaW1hZ2UnOiBgdXJsKCR7c3RhdGUudHJhY2suYXJ0d29ya191cmwucmVwbGFjZSgnbGFyZ2UnLCAndDUwMHg1MDAnKX0pYFxuICAgICAgICAgICAgfSA6IHtcbiAgICAgICAgICAgICAgICAnYmFja2dyb3VuZC1jb2xvcic6ICcjZjJmMmYyJ1xuICAgICAgICAgICAgfX0+XG4gICAgICAgICAgICAgICAge3N0YXRlLnRyYWNrID8gKFxuICAgICAgICAgICAgICAgICAgICA8ZGl2PlxuICAgICAgICAgICAgICAgICAgICAgICAgPGRpdiBjbGFzcz1cInNiLXNvdW5kcGxheWVyLXdpZGdldC1vdmVybGF5XCIgLz5cbiAgICAgICAgICAgICAgICAgICAgICAgIDxoMiBjbGFzcz1cInNiLXNvdW5kcGxheWVyLXdpZGdldC10aXRsZVwiPntzdGF0ZS50cmFjay50aXRsZX08L2gyPlxuICAgICAgICAgICAgICAgICAgICAgICAgPGRpdiBjbGFzcz1cInNiLXNvdW5kcGxheWVyLXdpZGdldC1jb250cm9sc1wiPlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIDxQbGF5QnV0dG9uXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHBsYXlpbmc9e3N0YXRlLnBsYXlpbmd9XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHNvdW5kQ2xvdWRBdWRpbz17cHJvcHMuc291bmRDbG91ZEF1ZGlvfVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8+XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgPFByb2dyZXNzXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHZhbHVlPXtzdGF0ZS5jdXJyZW50VGltZSAvIHN0YXRlLmR1cmF0aW9uICogMTAwIHx8IDB9XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHNvdW5kQ2xvdWRBdWRpbz17cHJvcHMuc291bmRDbG91ZEF1ZGlvfVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8+XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgPFRpbWVyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGR1cmF0aW9uPXtzdGF0ZS5kdXJhdGlvbn1cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgY3VycmVudFRpbWU9e3N0YXRlLmN1cnJlbnRUaW1lfVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8+XG4gICAgICAgICAgICAgICAgICAgICAgICA8L2Rpdj5cbiAgICAgICAgICAgICAgICAgICAgPC9kaXY+XG4gICAgICAgICAgICAgICAgKSA6IChcbiAgICAgICAgICAgICAgICAgICAgPGRpdj5Mb2FkaW5nLi48L2Rpdj5cbiAgICAgICAgICAgICAgICApfVxuICAgICAgICAgICAgPC9kaXY+XG4gICAgICAgICk7XG4gICAgfVxufTtcblxuZXhwb3J0IGZ1bmN0aW9uIGNyZWF0ZSAoZWwsIG9wdHMpIHtcbiAgICBsZXQgc291bmRDbG91ZEF1ZGlvID0gbmV3IFNvdW5kQ2xvdWRBdWRpbyhvcHRzLmNsaWVudElkKTtcblxuICAgIGxldCBhcHAgPSBkZWt1LnNjZW5lKFxuICAgICAgICA8V2lkZ2V0IHVybD17b3B0cy51cmx9IHNvdW5kQ2xvdWRBdWRpbz17c291bmRDbG91ZEF1ZGlvfSAvPlxuICAgICk7XG5cbiAgICBkZWt1LnJlbmRlcihhcHAsIGVsKTtcbn1cbiJdfQ==
