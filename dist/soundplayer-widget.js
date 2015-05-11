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

},{"deku":2}],66:[function(require,module,exports){
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

var _componentsPlayButton = require('./components/PlayButton');

var _componentsPlayButton2 = _interopRequireDefault(_componentsPlayButton);

var _componentsTimer = require('./components/Timer');

var _componentsTimer2 = _interopRequireDefault(_componentsTimer);

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
            // stop all other
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

        return _deku2['default'].dom(
            'div',
            null,
            state.track ? _deku2['default'].dom(
                'div',
                null,
                _deku2['default'].dom('img', { src: state.track.artwork_url.replace('large', 't500x500') }),
                _deku2['default'].dom(
                    'h2',
                    null,
                    state.track ? state.track.title : 'Loading..'
                )
            ) : _deku2['default'].dom(
                'div',
                null,
                'Loading..'
            ),
            _deku2['default'].dom(_componentsPlayButton2['default'], {
                playing: state.playing,
                soundCloudAudio: props.soundCloudAudio
            }),
            _deku2['default'].dom(_componentsTimer2['default'], {
                duration: state.duration,
                currentTime: state.currentTime
            })
        );
    }
};

function create(el, opts) {
    var app = _deku2['default'].scene(_deku2['default'].dom(Widget, { url: opts.url, soundCloudAudio: opts.soundCloudAudio }));

    _deku2['default'].render(app, el);
}

},{"./components/PlayButton":64,"./components/Timer":65,"deku":2}],67:[function(require,module,exports){
'use strict';

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { 'default': obj }; }

function _interopRequireWildcard(obj) { if (obj && obj.__esModule) { return obj; } else { var newObj = {}; if (obj != null) { for (var key in obj) { if (Object.prototype.hasOwnProperty.call(obj, key)) newObj[key] = obj[key]; } } newObj['default'] = obj; return newObj; } }

// query all elements with class `.soundplayer-widget`
// get `data-url` and `data-layout` attrs of every element
// pass data to constructor function and render deku widget

var _widget = require('./widget');

var SPWidget = _interopRequireWildcard(_widget);

var _soundcloudAudio = require('soundcloud-audio');

var _soundcloudAudio2 = _interopRequireDefault(_soundcloudAudio);

var elements = document.querySelectorAll('.sb-soundplayer-widget');

var audioStore = [];

for (var i = 0, len = elements.length; i < len; i++) {
    var el = elements[i];
    var clientId = el.getAttribute('data-clientid');
    var url = el.getAttribute('data-url');
    var soundCloudAudio = new _soundcloudAudio2['default'](clientId);

    audioStore.push({ url: url, soundCloudAudio: soundCloudAudio });

    SPWidget.create(el, { url: url, soundCloudAudio: soundCloudAudio });
}

},{"./widget":66,"soundcloud-audio":63}]},{},[67])
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm5vZGVfbW9kdWxlcy9icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCJub2RlX21vZHVsZXMvZGVrdS9saWIvYXBwbGljYXRpb24uanMiLCJub2RlX21vZHVsZXMvZGVrdS9saWIvaW5kZXguanMiLCJub2RlX21vZHVsZXMvZGVrdS9saWIvcmVuZGVyLmpzIiwibm9kZV9tb2R1bGVzL2Rla3UvbGliL3N0cmluZ2lmeS5qcyIsIm5vZGVfbW9kdWxlcy9kZWt1L2xpYi9zdmcuanMiLCJub2RlX21vZHVsZXMvZGVrdS9saWIvdXRpbHMuanMiLCJub2RlX21vZHVsZXMvZGVrdS9saWIvdmlydHVhbC5qcyIsIm5vZGVfbW9kdWxlcy9kZWt1L25vZGVfbW9kdWxlcy9hcnJheS1mbGF0dGVuL2FycmF5LWZsYXR0ZW4uanMiLCJub2RlX21vZHVsZXMvZGVrdS9ub2RlX21vZHVsZXMvY29tcG9uZW50LWVtaXR0ZXIvaW5kZXguanMiLCJub2RlX21vZHVsZXMvZGVrdS9ub2RlX21vZHVsZXMvY29tcG9uZW50LXJhZi9pbmRleC5qcyIsIm5vZGVfbW9kdWxlcy9kZWt1L25vZGVfbW9kdWxlcy9jb21wb25lbnQtdHlwZS9pbmRleC5qcyIsIm5vZGVfbW9kdWxlcy9kZWt1L25vZGVfbW9kdWxlcy9kb20tcG9vbC9Qb29sLmpzIiwibm9kZV9tb2R1bGVzL2Rla3Uvbm9kZV9tb2R1bGVzL2RvbS13YWxrL2luZGV4LmpzIiwibm9kZV9tb2R1bGVzL2Rla3Uvbm9kZV9tb2R1bGVzL2Zhc3QuanMvYXJyYXkvY2xvbmUuanMiLCJub2RlX21vZHVsZXMvZGVrdS9ub2RlX21vZHVsZXMvZmFzdC5qcy9hcnJheS9jb25jYXQuanMiLCJub2RlX21vZHVsZXMvZGVrdS9ub2RlX21vZHVsZXMvZmFzdC5qcy9hcnJheS9ldmVyeS5qcyIsIm5vZGVfbW9kdWxlcy9kZWt1L25vZGVfbW9kdWxlcy9mYXN0LmpzL2FycmF5L2ZpbGwuanMiLCJub2RlX21vZHVsZXMvZGVrdS9ub2RlX21vZHVsZXMvZmFzdC5qcy9hcnJheS9maWx0ZXIuanMiLCJub2RlX21vZHVsZXMvZGVrdS9ub2RlX21vZHVsZXMvZmFzdC5qcy9hcnJheS9mb3JFYWNoLmpzIiwibm9kZV9tb2R1bGVzL2Rla3Uvbm9kZV9tb2R1bGVzL2Zhc3QuanMvYXJyYXkvaW5kZXguanMiLCJub2RlX21vZHVsZXMvZGVrdS9ub2RlX21vZHVsZXMvZmFzdC5qcy9hcnJheS9pbmRleE9mLmpzIiwibm9kZV9tb2R1bGVzL2Rla3Uvbm9kZV9tb2R1bGVzL2Zhc3QuanMvYXJyYXkvbGFzdEluZGV4T2YuanMiLCJub2RlX21vZHVsZXMvZGVrdS9ub2RlX21vZHVsZXMvZmFzdC5qcy9hcnJheS9tYXAuanMiLCJub2RlX21vZHVsZXMvZGVrdS9ub2RlX21vZHVsZXMvZmFzdC5qcy9hcnJheS9wbHVjay5qcyIsIm5vZGVfbW9kdWxlcy9kZWt1L25vZGVfbW9kdWxlcy9mYXN0LmpzL2FycmF5L3JlZHVjZS5qcyIsIm5vZGVfbW9kdWxlcy9kZWt1L25vZGVfbW9kdWxlcy9mYXN0LmpzL2FycmF5L3JlZHVjZVJpZ2h0LmpzIiwibm9kZV9tb2R1bGVzL2Rla3Uvbm9kZV9tb2R1bGVzL2Zhc3QuanMvYXJyYXkvc29tZS5qcyIsIm5vZGVfbW9kdWxlcy9kZWt1L25vZGVfbW9kdWxlcy9mYXN0LmpzL2Nsb25lLmpzIiwibm9kZV9tb2R1bGVzL2Rla3Uvbm9kZV9tb2R1bGVzL2Zhc3QuanMvZmlsdGVyLmpzIiwibm9kZV9tb2R1bGVzL2Rla3Uvbm9kZV9tb2R1bGVzL2Zhc3QuanMvZm9yRWFjaC5qcyIsIm5vZGVfbW9kdWxlcy9kZWt1L25vZGVfbW9kdWxlcy9mYXN0LmpzL2Z1bmN0aW9uL2FwcGx5LmpzIiwibm9kZV9tb2R1bGVzL2Rla3Uvbm9kZV9tb2R1bGVzL2Zhc3QuanMvZnVuY3Rpb24vYXBwbHlOb0NvbnRleHQuanMiLCJub2RlX21vZHVsZXMvZGVrdS9ub2RlX21vZHVsZXMvZmFzdC5qcy9mdW5jdGlvbi9hcHBseVdpdGhDb250ZXh0LmpzIiwibm9kZV9tb2R1bGVzL2Rla3Uvbm9kZV9tb2R1bGVzL2Zhc3QuanMvZnVuY3Rpb24vYmluZC5qcyIsIm5vZGVfbW9kdWxlcy9kZWt1L25vZGVfbW9kdWxlcy9mYXN0LmpzL2Z1bmN0aW9uL2JpbmRJbnRlcm5hbDMuanMiLCJub2RlX21vZHVsZXMvZGVrdS9ub2RlX21vZHVsZXMvZmFzdC5qcy9mdW5jdGlvbi9iaW5kSW50ZXJuYWw0LmpzIiwibm9kZV9tb2R1bGVzL2Rla3Uvbm9kZV9tb2R1bGVzL2Zhc3QuanMvZnVuY3Rpb24vaW5kZXguanMiLCJub2RlX21vZHVsZXMvZGVrdS9ub2RlX21vZHVsZXMvZmFzdC5qcy9mdW5jdGlvbi9wYXJ0aWFsLmpzIiwibm9kZV9tb2R1bGVzL2Rla3Uvbm9kZV9tb2R1bGVzL2Zhc3QuanMvZnVuY3Rpb24vcGFydGlhbENvbnN0cnVjdG9yLmpzIiwibm9kZV9tb2R1bGVzL2Rla3Uvbm9kZV9tb2R1bGVzL2Zhc3QuanMvZnVuY3Rpb24vdHJ5LmpzIiwibm9kZV9tb2R1bGVzL2Rla3Uvbm9kZV9tb2R1bGVzL2Zhc3QuanMvaW5kZXguanMiLCJub2RlX21vZHVsZXMvZGVrdS9ub2RlX21vZHVsZXMvZmFzdC5qcy9tYXAuanMiLCJub2RlX21vZHVsZXMvZGVrdS9ub2RlX21vZHVsZXMvZmFzdC5qcy9vYmplY3QvYXNzaWduLmpzIiwibm9kZV9tb2R1bGVzL2Rla3Uvbm9kZV9tb2R1bGVzL2Zhc3QuanMvb2JqZWN0L2Nsb25lLmpzIiwibm9kZV9tb2R1bGVzL2Rla3Uvbm9kZV9tb2R1bGVzL2Zhc3QuanMvb2JqZWN0L2ZpbHRlci5qcyIsIm5vZGVfbW9kdWxlcy9kZWt1L25vZGVfbW9kdWxlcy9mYXN0LmpzL29iamVjdC9mb3JFYWNoLmpzIiwibm9kZV9tb2R1bGVzL2Rla3Uvbm9kZV9tb2R1bGVzL2Zhc3QuanMvb2JqZWN0L2luZGV4LmpzIiwibm9kZV9tb2R1bGVzL2Rla3Uvbm9kZV9tb2R1bGVzL2Zhc3QuanMvb2JqZWN0L2tleXMuanMiLCJub2RlX21vZHVsZXMvZGVrdS9ub2RlX21vZHVsZXMvZmFzdC5qcy9vYmplY3QvbWFwLmpzIiwibm9kZV9tb2R1bGVzL2Rla3Uvbm9kZV9tb2R1bGVzL2Zhc3QuanMvb2JqZWN0L3JlZHVjZS5qcyIsIm5vZGVfbW9kdWxlcy9kZWt1L25vZGVfbW9kdWxlcy9mYXN0LmpzL29iamVjdC9yZWR1Y2VSaWdodC5qcyIsIm5vZGVfbW9kdWxlcy9kZWt1L25vZGVfbW9kdWxlcy9mYXN0LmpzL29iamVjdC92YWx1ZXMuanMiLCJub2RlX21vZHVsZXMvZGVrdS9ub2RlX21vZHVsZXMvZmFzdC5qcy9yZWR1Y2UuanMiLCJub2RlX21vZHVsZXMvZGVrdS9ub2RlX21vZHVsZXMvZmFzdC5qcy9yZWR1Y2VSaWdodC5qcyIsIm5vZGVfbW9kdWxlcy9kZWt1L25vZGVfbW9kdWxlcy9mYXN0LmpzL3N0cmluZy9pbmRleC5qcyIsIm5vZGVfbW9kdWxlcy9kZWt1L25vZGVfbW9kdWxlcy9mYXN0LmpzL3N0cmluZy9pbnRlcm4uanMiLCJub2RlX21vZHVsZXMvZGVrdS9ub2RlX21vZHVsZXMvZ2V0LXVpZC9pbmRleC5qcyIsIm5vZGVfbW9kdWxlcy9kZWt1L25vZGVfbW9kdWxlcy9pcy1kb20vaW5kZXguanMiLCJub2RlX21vZHVsZXMvZGVrdS9ub2RlX21vZHVsZXMvb2JqZWN0LXBhdGgvaW5kZXguanMiLCJub2RlX21vZHVsZXMvZGVrdS9ub2RlX21vZHVsZXMvcGVyLWZyYW1lL2luZGV4LmpzIiwibm9kZV9tb2R1bGVzL2Rla3Uvbm9kZV9tb2R1bGVzL3NsaWNlZC9pbmRleC5qcyIsIm5vZGVfbW9kdWxlcy9kZWt1L25vZGVfbW9kdWxlcy9zbGljZWQvbGliL3NsaWNlZC5qcyIsIm5vZGVfbW9kdWxlcy9zb3VuZGNsb3VkLWF1ZGlvL2luZGV4LmpzIiwiL1VzZXJzL2RtaXRyaS9naXRodWIvc291bmRwbGF5ZXItd2lkZ2V0L3NyYy9jb21wb25lbnRzL1BsYXlCdXR0b24uanMiLCIvVXNlcnMvZG1pdHJpL2dpdGh1Yi9zb3VuZHBsYXllci13aWRnZXQvc3JjL2NvbXBvbmVudHMvVGltZXIuanMiLCIvVXNlcnMvZG1pdHJpL2dpdGh1Yi9zb3VuZHBsYXllci13aWRnZXQvc3JjL3dpZGdldC5qcyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTtBQ0FBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN0RkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUM1QkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDOXZDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN6R0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzNHQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNsQkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN2UEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDOUJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNqS0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNsQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNsQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNwREE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDeEJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3JCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDaENBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDekJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDNUJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUMxQkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDckJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNkQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNqQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzdCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN4QkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3ZCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDbkNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNuQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN6QkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDM0JBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDdEJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3JCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ25CQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDN0JBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUM3QkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3ZFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDWEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ1hBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDUEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDMUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzdDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDbkNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDalBBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDdEJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDbENBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDekJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDNUJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN2QkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNWQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2hCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDMUJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDckNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDckNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDbkJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN2QkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3ZCQTtBQUNBO0FBQ0E7O0FDRkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN2REE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ0xBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2ZBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUM3UUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNyQ0E7QUFDQTs7QUNEQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNqQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7Ozs7Ozs7Ozs7O29CQzNKaUIsTUFBTTs7OztBQUV2QixJQUFNLFVBQVUsR0FBRztBQUNmLGdCQUFZLEVBQUU7QUFDVixlQUFPLEVBQUUsS0FBSztBQUNkLGVBQU8sRUFBRSxLQUFLO0tBQ2pCOztBQUVELGFBQVMsRUFBRTtBQUNQLGVBQU8sRUFBRTtBQUNMLGdCQUFJLEVBQUUsU0FBUztTQUNsQjtBQUNELGVBQU8sRUFBRTtBQUNMLGdCQUFJLEVBQUUsU0FBUztTQUNsQjtLQUNKOztBQUVELFVBQU0sRUFBQSxnQkFBQyxTQUFTLEVBQUU7WUFDTixLQUFLLEdBQUssU0FBUyxDQUFuQixLQUFLOztBQUViLGlCQUFTLFdBQVcsQ0FBRSxDQUFDLEVBQUU7QUFDckIsYUFBQyxDQUFDLGNBQWMsRUFBRSxDQUFDOztnQkFFWCxPQUFPLEdBQW9DLEtBQUssQ0FBaEQsT0FBTztnQkFBRSxlQUFlLEdBQW1CLEtBQUssQ0FBdkMsZUFBZTtnQkFBRSxZQUFZLEdBQUssS0FBSyxDQUF0QixZQUFZOztBQUU5QyxnQkFBSSxDQUFDLE9BQU8sRUFBRTtBQUNWLCtCQUFlLElBQUksZUFBZSxDQUFDLElBQUksRUFBRSxDQUFDO2FBQzdDLE1BQU07QUFDSCwrQkFBZSxJQUFJLGVBQWUsQ0FBQyxLQUFLLEVBQUUsQ0FBQzthQUM5Qzs7QUFFRCx3QkFBWSxJQUFJLFlBQVksQ0FBQyxDQUFDLENBQUMsQ0FBQztTQUNuQzs7QUFFRCxlQUNJOztjQUFRLFNBQU0sNEJBQTRCLEVBQUMsT0FBTyxFQUFFLFdBQVcsQUFBQztZQUMzRCxLQUFLLENBQUMsT0FBTyxHQUFHLE9BQU8sR0FBRyxNQUFNO1NBQzVCLENBQ1g7S0FDTDtDQUNKLENBQUM7O3FCQUVhLFVBQVU7Ozs7Ozs7Ozs7Ozs7O29CQzFDUixNQUFNOzs7O0FBRXZCLFNBQVMsVUFBVSxDQUFFLElBQUksRUFBRTtBQUN2QixRQUFJLEtBQUssR0FBRyxJQUFJLENBQUMsS0FBSyxDQUFDLElBQUksR0FBRyxJQUFJLENBQUMsQ0FBQztBQUNwQyxRQUFJLElBQUksR0FBRyxHQUFHLEdBQUcsSUFBSSxDQUFDLEtBQUssQ0FBQyxBQUFDLElBQUksR0FBRyxJQUFJLEdBQUksRUFBRSxDQUFDLENBQUM7QUFDaEQsUUFBSSxJQUFJLEdBQUcsR0FBRyxHQUFHLElBQUksQ0FBQyxLQUFLLENBQUUsSUFBSSxHQUFHLEVBQUUsQ0FBRSxDQUFDOztBQUV6QyxRQUFJLEdBQUcsSUFBSSxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsTUFBTSxHQUFHLENBQUMsQ0FBQyxDQUFDO0FBQ3BDLFFBQUksR0FBRyxJQUFJLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxNQUFNLEdBQUcsQ0FBQyxDQUFDLENBQUM7O0FBRXBDLFFBQUksQ0FBQyxLQUFLLENBQUMsSUFBSSxDQUFDLEVBQUU7QUFDZCxZQUFJLEtBQUssRUFBRTtBQUNQLHdCQUFVLEtBQUssU0FBSSxJQUFJLFNBQUksSUFBSSxDQUFHO1NBQ3JDLE1BQU07QUFDSCx3QkFBVSxJQUFJLFNBQUksSUFBSSxDQUFHO1NBQzVCO0tBQ0osTUFBTTtBQUNILGVBQU8sT0FBTyxDQUFDO0tBQ2xCO0NBQ0o7O0FBRUQsSUFBTSxLQUFLLEdBQUc7QUFDVixnQkFBWSxFQUFFO0FBQ1YsZ0JBQVEsRUFBRSxDQUFDO0FBQ1gsbUJBQVcsRUFBRSxDQUFDO0tBQ2pCOztBQUVELGFBQVMsRUFBRTtBQUNQLGdCQUFRLEVBQUU7QUFDTixnQkFBSSxFQUFFLFFBQVE7U0FDakI7QUFDRCxtQkFBVyxFQUFFO0FBQ1QsZ0JBQUksRUFBRSxRQUFRO1NBQ2pCO0tBQ0o7O0FBRUQsVUFBTSxFQUFBLGdCQUFDLFNBQVMsRUFBRTtZQUNOLEtBQUssR0FBSyxTQUFTLENBQW5CLEtBQUs7O0FBRWIsZUFDSTs7Y0FBSyxTQUFNLDZCQUE2QjtZQUNuQyxVQUFVLENBQUMsS0FBSyxDQUFDLFdBQVcsQ0FBQzs7WUFBSyxVQUFVLENBQUMsS0FBSyxDQUFDLFFBQVEsQ0FBQztTQUMzRCxDQUNSO0tBQ0w7Q0FDSixDQUFDOztxQkFFYSxLQUFLOzs7Ozs7Ozs7UUM2Q0osTUFBTSxHQUFOLE1BQU07Ozs7Ozs7O29CQTVGTCxNQUFNOzs7O29DQUVBLHlCQUF5Qjs7OzsrQkFDOUIsb0JBQW9COzs7O0FBRXRDLElBQU0sTUFBTSxHQUFHO0FBQ1gsZ0JBQVksRUFBQSx3QkFBRztBQUNYLGVBQU87QUFDSCxvQkFBUSxFQUFFLENBQUM7QUFDWCx1QkFBVyxFQUFFLENBQUM7QUFDZCxtQkFBTyxFQUFFLEtBQUs7QUFDZCxtQkFBTyxFQUFFLEtBQUs7U0FDakIsQ0FBQztLQUNMOztBQUVELGNBQVUsRUFBQSxvQkFBQyxTQUFTLEVBQUUsRUFBRSxFQUFFLFFBQVEsRUFBRTtZQUN4QixLQUFLLEdBQUssU0FBUyxDQUFuQixLQUFLO1lBQ0wsZUFBZSxHQUFLLEtBQUssQ0FBekIsZUFBZTs7QUFFdkIsdUJBQWUsQ0FBQyxPQUFPLENBQUMsS0FBSyxDQUFDLEdBQUcsRUFBRSxVQUFDLElBQUksRUFBSztBQUN6QyxvQkFBUSxxQkFDSCxJQUFJLENBQUMsTUFBTSxHQUFHLFVBQVUsR0FBRyxPQUFPLEVBQUcsSUFBSSxFQUM1QyxDQUFDO1NBQ04sQ0FBQyxDQUFDOztBQUVILGlCQUFTLGNBQWMsR0FBSTtBQUN2QixvQkFBUSxDQUFDLEVBQUMsT0FBTyxFQUFFLElBQUksRUFBQyxDQUFDLENBQUM7O1NBRTdCOztBQUVELGlCQUFTLGNBQWMsR0FBSTtBQUN2QixvQkFBUSxDQUFDLEVBQUMsV0FBVyxFQUFFLGVBQWUsQ0FBQyxLQUFLLENBQUMsV0FBVyxFQUFDLENBQUMsQ0FBQztTQUM5RDs7QUFFRCxpQkFBUyxXQUFXLEdBQUk7QUFDcEIsb0JBQVEsQ0FBQyxFQUFDLFFBQVEsRUFBRSxlQUFlLENBQUMsS0FBSyxDQUFDLFFBQVEsRUFBQyxDQUFDLENBQUM7U0FDeEQ7O0FBRUQsaUJBQVMsY0FBYyxHQUFJO0FBQ3ZCLG9CQUFRLENBQUMsRUFBQyxPQUFPLEVBQUUsSUFBSSxFQUFDLENBQUMsQ0FBQztTQUM3Qjs7QUFFRCxpQkFBUyxhQUFhLEdBQUk7QUFDdEIsb0JBQVEsQ0FBQyxFQUFDLE9BQU8sRUFBRSxLQUFLLEVBQUMsQ0FBQyxDQUFDO1NBQzlCOztBQUVELGlCQUFTLFlBQVksR0FBSTtBQUNyQixvQkFBUSxDQUFDLEVBQUMsT0FBTyxFQUFFLEtBQUssRUFBQyxDQUFDLENBQUM7U0FDOUI7OztBQUdELHVCQUFlLENBQUMsRUFBRSxDQUFDLFNBQVMsRUFBRSxjQUFjLENBQUMsQ0FBQztBQUM5Qyx1QkFBZSxDQUFDLEVBQUUsQ0FBQyxZQUFZLEVBQUUsY0FBYyxDQUFDLENBQUM7QUFDakQsdUJBQWUsQ0FBQyxFQUFFLENBQUMsZ0JBQWdCLEVBQUUsV0FBVyxDQUFDLENBQUM7QUFDbEQsdUJBQWUsQ0FBQyxFQUFFLENBQUMsU0FBUyxFQUFFLGNBQWMsQ0FBQyxDQUFDO0FBQzlDLHVCQUFlLENBQUMsRUFBRSxDQUFDLFFBQVEsRUFBRSxhQUFhLENBQUMsQ0FBQztBQUM1Qyx1QkFBZSxDQUFDLEVBQUUsQ0FBQyxPQUFPLEVBQUUsWUFBWSxDQUFDLENBQUM7QUFDMUMsdUJBQWUsQ0FBQyxFQUFFLENBQUMsT0FBTyxFQUFFLFlBQVksQ0FBQyxDQUFDO0tBQzdDOztBQUdELGVBQVcsRUFBQSxxQkFBQyxTQUFTLEVBQUU7WUFDWCxLQUFLLEdBQUssU0FBUyxDQUFuQixLQUFLOztBQUNiLGFBQUssQ0FBQyxlQUFlLENBQUMsU0FBUyxFQUFFLENBQUM7S0FDckM7O0FBRUQsVUFBTSxFQUFBLGdCQUFDLFNBQVMsRUFBRTtZQUNSLEtBQUssR0FBWSxTQUFTLENBQTFCLEtBQUs7WUFBRSxLQUFLLEdBQUssU0FBUyxDQUFuQixLQUFLOztBQUVsQixlQUNJOzs7WUFDSyxLQUFLLENBQUMsS0FBSyxHQUNSOzs7Z0JBQ0ksK0JBQUssR0FBRyxFQUFFLEtBQUssQ0FBQyxLQUFLLENBQUMsV0FBVyxDQUFDLE9BQU8sQ0FBQyxPQUFPLEVBQUUsVUFBVSxDQUFDLEFBQUMsR0FBRztnQkFDbEU7OztvQkFBSyxLQUFLLENBQUMsS0FBSyxHQUFHLEtBQUssQ0FBQyxLQUFLLENBQUMsS0FBSyxHQUFHLFdBQVc7aUJBQU07YUFDdEQsR0FFTjs7OzthQUFvQixBQUN2QjtZQUNEO0FBQ0ksdUJBQU8sRUFBRSxLQUFLLENBQUMsT0FBTyxBQUFDO0FBQ3ZCLCtCQUFlLEVBQUUsS0FBSyxDQUFDLGVBQWUsQUFBQztjQUN6QztZQUNGO0FBQ0ksd0JBQVEsRUFBRSxLQUFLLENBQUMsUUFBUSxBQUFDO0FBQ3pCLDJCQUFXLEVBQUUsS0FBSyxDQUFDLFdBQVcsQUFBQztjQUNqQztTQUNBLENBQ1I7S0FDTDtDQUNKLENBQUM7O0FBRUssU0FBUyxNQUFNLENBQUUsRUFBRSxFQUFFLElBQUksRUFBRTtBQUM5QixRQUFJLEdBQUcsR0FBRyxrQkFBSyxLQUFLLENBQ2hCLHNCQUFDLE1BQU0sSUFBQyxHQUFHLEVBQUUsSUFBSSxDQUFDLEdBQUcsQUFBQyxFQUFDLGVBQWUsRUFBRSxJQUFJLENBQUMsZUFBZSxBQUFDLEdBQUcsQ0FDbkUsQ0FBQzs7QUFFRixzQkFBSyxNQUFNLENBQUMsR0FBRyxFQUFFLEVBQUUsQ0FBQyxDQUFDO0NBQ3hCIiwiZmlsZSI6ImdlbmVyYXRlZC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzQ29udGVudCI6WyIoZnVuY3Rpb24gZSh0LG4scil7ZnVuY3Rpb24gcyhvLHUpe2lmKCFuW29dKXtpZighdFtvXSl7dmFyIGE9dHlwZW9mIHJlcXVpcmU9PVwiZnVuY3Rpb25cIiYmcmVxdWlyZTtpZighdSYmYSlyZXR1cm4gYShvLCEwKTtpZihpKXJldHVybiBpKG8sITApO3ZhciBmPW5ldyBFcnJvcihcIkNhbm5vdCBmaW5kIG1vZHVsZSAnXCIrbytcIidcIik7dGhyb3cgZi5jb2RlPVwiTU9EVUxFX05PVF9GT1VORFwiLGZ9dmFyIGw9bltvXT17ZXhwb3J0czp7fX07dFtvXVswXS5jYWxsKGwuZXhwb3J0cyxmdW5jdGlvbihlKXt2YXIgbj10W29dWzFdW2VdO3JldHVybiBzKG4/bjplKX0sbCxsLmV4cG9ydHMsZSx0LG4scil9cmV0dXJuIG5bb10uZXhwb3J0c312YXIgaT10eXBlb2YgcmVxdWlyZT09XCJmdW5jdGlvblwiJiZyZXF1aXJlO2Zvcih2YXIgbz0wO288ci5sZW5ndGg7bysrKXMocltvXSk7cmV0dXJuIHN9KSIsIi8qKlxuICogTW9kdWxlIGRlcGVuZGVuY2llcy5cbiAqL1xuXG52YXIgRW1pdHRlciA9IHJlcXVpcmUoJ2NvbXBvbmVudC1lbWl0dGVyJylcblxuLyoqXG4gKiBFeHBvc2UgYHNjZW5lYC5cbiAqL1xuXG5tb2R1bGUuZXhwb3J0cyA9IEFwcGxpY2F0aW9uXG5cbi8qKlxuICogQ3JlYXRlIGEgbmV3IGBBcHBsaWNhdGlvbmAuXG4gKlxuICogQHBhcmFtIHtPYmplY3R9IGVsZW1lbnQgT3B0aW9uYWwgaW5pdGlhbCBlbGVtZW50XG4gKi9cblxuZnVuY3Rpb24gQXBwbGljYXRpb24gKGVsZW1lbnQpIHtcbiAgaWYgKCEodGhpcyBpbnN0YW5jZW9mIEFwcGxpY2F0aW9uKSkgcmV0dXJuIG5ldyBBcHBsaWNhdGlvbihlbGVtZW50KVxuICB0aGlzLm9wdGlvbnMgPSB7fVxuICB0aGlzLnNvdXJjZXMgPSB7fVxuICB0aGlzLmVsZW1lbnQgPSBlbGVtZW50XG59XG5cbi8qKlxuICogTWl4aW4gYEVtaXR0ZXJgLlxuICovXG5cbkVtaXR0ZXIoQXBwbGljYXRpb24ucHJvdG90eXBlKVxuXG4vKipcbiAqIEFkZCBhIHBsdWdpblxuICpcbiAqIEBwYXJhbSB7RnVuY3Rpb259IHBsdWdpblxuICovXG5cbkFwcGxpY2F0aW9uLnByb3RvdHlwZS51c2UgPSBmdW5jdGlvbiAocGx1Z2luKSB7XG4gIHBsdWdpbih0aGlzKVxuICByZXR1cm4gdGhpc1xufVxuXG4vKipcbiAqIFNldCBhbiBvcHRpb25cbiAqXG4gKiBAcGFyYW0ge1N0cmluZ30gbmFtZVxuICovXG5cbkFwcGxpY2F0aW9uLnByb3RvdHlwZS5vcHRpb24gPSBmdW5jdGlvbiAobmFtZSwgdmFsKSB7XG4gIHRoaXMub3B0aW9uc1tuYW1lXSA9IHZhbFxuICByZXR1cm4gdGhpc1xufVxuXG4vKipcbiAqIFNldCB2YWx1ZSB1c2VkIHNvbWV3aGVyZSBpbiB0aGUgSU8gbmV0d29yay5cbiAqL1xuXG5BcHBsaWNhdGlvbi5wcm90b3R5cGUuc2V0ID0gZnVuY3Rpb24gKG5hbWUsIGRhdGEpIHtcbiAgaWYgKHRoaXMuc291cmNlc1tuYW1lXSA9PT0gZGF0YSkgcmV0dXJuXG4gIHRoaXMuc291cmNlc1tuYW1lXSA9IGRhdGFcbiAgdGhpcy5lbWl0KCdzb3VyY2UnLCBuYW1lLCBkYXRhKVxuICByZXR1cm4gdGhpc1xufVxuXG4vKipcbiAqIE1vdW50IGEgdmlydHVhbCBlbGVtZW50LlxuICpcbiAqIEBwYXJhbSB7VmlydHVhbEVsZW1lbnR9IGVsZW1lbnRcbiAqL1xuXG5BcHBsaWNhdGlvbi5wcm90b3R5cGUubW91bnQgPSBmdW5jdGlvbiAoZWxlbWVudCkge1xuICB0aGlzLmVsZW1lbnQgPSBlbGVtZW50XG4gIHRoaXMuZW1pdCgnbW91bnQnLCBlbGVtZW50KVxuICByZXR1cm4gdGhpc1xufVxuXG4vKipcbiAqIFJlbW92ZSB0aGUgd29ybGQuIFVubW91bnQgZXZlcnl0aGluZy5cbiAqL1xuXG5BcHBsaWNhdGlvbi5wcm90b3R5cGUudW5tb3VudCA9IGZ1bmN0aW9uICgpIHtcbiAgaWYgKCF0aGlzLmVsZW1lbnQpIHJldHVyblxuICB0aGlzLmVsZW1lbnQgPSBudWxsXG4gIHRoaXMuZW1pdCgndW5tb3VudCcpXG4gIHJldHVybiB0aGlzXG59XG4iLCIvKipcbiAqIENyZWF0ZSB0aGUgYXBwbGljYXRpb24uXG4gKi9cblxuZXhwb3J0cy50cmVlID1cbmV4cG9ydHMuc2NlbmUgPVxuZXhwb3J0cy5kZWt1ID0gcmVxdWlyZSgnLi9hcHBsaWNhdGlvbicpXG5cbi8qKlxuICogUmVuZGVyIHNjZW5lcyB0byB0aGUgRE9NLlxuICovXG5cbmlmICh0eXBlb2YgZG9jdW1lbnQgIT09ICd1bmRlZmluZWQnKSB7XG4gIGV4cG9ydHMucmVuZGVyID0gcmVxdWlyZSgnLi9yZW5kZXInKVxufVxuXG4vKipcbiAqIFJlbmRlciBzY2VuZXMgdG8gYSBzdHJpbmdcbiAqL1xuXG5leHBvcnRzLnJlbmRlclN0cmluZyA9IHJlcXVpcmUoJy4vc3RyaW5naWZ5JylcblxuLyoqXG4gKiBDcmVhdGUgdmlydHVhbCBlbGVtZW50cy5cbiAqL1xuXG5leHBvcnRzLmVsZW1lbnQgPVxuZXhwb3J0cy5kb20gPSByZXF1aXJlKCcuL3ZpcnR1YWwnKVxuIiwiLyoqXG4gKiBEZXBlbmRlbmNpZXMuXG4gKi9cblxudmFyIHJhZiA9IHJlcXVpcmUoJ2NvbXBvbmVudC1yYWYnKVxudmFyIFBvb2wgPSByZXF1aXJlKCdkb20tcG9vbCcpXG52YXIgd2FsayA9IHJlcXVpcmUoJ2RvbS13YWxrJylcbnZhciBpc0RvbSA9IHJlcXVpcmUoJ2lzLWRvbScpXG52YXIgdWlkID0gcmVxdWlyZSgnZ2V0LXVpZCcpXG52YXIgdGhyb3R0bGUgPSByZXF1aXJlKCdwZXItZnJhbWUnKVxudmFyIGtleXBhdGggPSByZXF1aXJlKCdvYmplY3QtcGF0aCcpXG52YXIgdHlwZSA9IHJlcXVpcmUoJ2NvbXBvbmVudC10eXBlJylcbnZhciBmYXN0ID0gcmVxdWlyZSgnZmFzdC5qcycpXG52YXIgdXRpbHMgPSByZXF1aXJlKCcuL3V0aWxzJylcbnZhciBzdmcgPSByZXF1aXJlKCcuL3N2ZycpXG52YXIgZGVmYXVsdHMgPSB1dGlscy5kZWZhdWx0c1xudmFyIGZvckVhY2ggPSBmYXN0LmZvckVhY2hcbnZhciBhc3NpZ24gPSBmYXN0LmFzc2lnblxudmFyIHJlZHVjZSA9IGZhc3QucmVkdWNlXG5cbi8qKlxuICogQWxsIG9mIHRoZSBldmVudHMgY2FuIGJpbmQgdG9cbiAqL1xuXG52YXIgZXZlbnRzID0ge1xuICBvbkJsdXI6ICdibHVyJyxcbiAgb25DaGFuZ2U6ICdjaGFuZ2UnLFxuICBvbkNsaWNrOiAnY2xpY2snLFxuICBvbkNvbnRleHRNZW51OiAnY29udGV4dG1lbnUnLFxuICBvbkNvcHk6ICdjb3B5JyxcbiAgb25DdXQ6ICdjdXQnLFxuICBvbkRvdWJsZUNsaWNrOiAnZGJsY2xpY2snLFxuICBvbkRyYWc6ICdkcmFnJyxcbiAgb25EcmFnRW5kOiAnZHJhZ2VuZCcsXG4gIG9uRHJhZ0VudGVyOiAnZHJhZ2VudGVyJyxcbiAgb25EcmFnRXhpdDogJ2RyYWdleGl0JyxcbiAgb25EcmFnTGVhdmU6ICdkcmFnbGVhdmUnLFxuICBvbkRyYWdPdmVyOiAnZHJhZ292ZXInLFxuICBvbkRyYWdTdGFydDogJ2RyYWdzdGFydCcsXG4gIG9uRHJvcDogJ2Ryb3AnLFxuICBvbkZvY3VzOiAnZm9jdXMnLFxuICBvbklucHV0OiAnaW5wdXQnLFxuICBvbktleURvd246ICdrZXlkb3duJyxcbiAgb25LZXlVcDogJ2tleXVwJyxcbiAgb25Nb3VzZURvd246ICdtb3VzZWRvd24nLFxuICBvbk1vdXNlTW92ZTogJ21vdXNlbW92ZScsXG4gIG9uTW91c2VPdXQ6ICdtb3VzZW91dCcsXG4gIG9uTW91c2VPdmVyOiAnbW91c2VvdmVyJyxcbiAgb25Nb3VzZVVwOiAnbW91c2V1cCcsXG4gIG9uUGFzdGU6ICdwYXN0ZScsXG4gIG9uU2Nyb2xsOiAnc2Nyb2xsJyxcbiAgb25TdWJtaXQ6ICdzdWJtaXQnLFxuICBvblRvdWNoQ2FuY2VsOiAndG91Y2hjYW5jZWwnLFxuICBvblRvdWNoRW5kOiAndG91Y2hlbmQnLFxuICBvblRvdWNoTW92ZTogJ3RvdWNobW92ZScsXG4gIG9uVG91Y2hTdGFydDogJ3RvdWNoc3RhcnQnXG59XG5cbi8qKlxuICogVGhlc2UgZWxlbWVudHMgd29uJ3QgYmUgcG9vbGVkXG4gKi9cblxudmFyIGF2b2lkUG9vbGluZyA9IFsnaW5wdXQnLCAndGV4dGFyZWEnXTtcblxuLyoqXG4gKiBFeHBvc2UgYGRvbWAuXG4gKi9cblxubW9kdWxlLmV4cG9ydHMgPSByZW5kZXJcblxuLyoqXG4gKiBSZW5kZXIgYW4gYXBwIHRvIHRoZSBET01cbiAqXG4gKiBAcGFyYW0ge0FwcGxpY2F0aW9ufSBhcHBcbiAqIEBwYXJhbSB7SFRNTEVsZW1lbnR9IGNvbnRhaW5lclxuICogQHBhcmFtIHtPYmplY3R9IG9wdHNcbiAqXG4gKiBAcmV0dXJuIHtPYmplY3R9XG4gKi9cblxuZnVuY3Rpb24gcmVuZGVyIChhcHAsIGNvbnRhaW5lciwgb3B0cykge1xuICB2YXIgZnJhbWVJZFxuICB2YXIgaXNSZW5kZXJpbmdcbiAgdmFyIHJvb3RJZCA9ICdyb290J1xuICB2YXIgY3VycmVudEVsZW1lbnRcbiAgdmFyIGN1cnJlbnROYXRpdmVFbGVtZW50XG4gIHZhciBjb25uZWN0aW9ucyA9IHt9XG4gIHZhciBlbnRpdGllcyA9IHt9XG4gIHZhciBwb29scyA9IHt9XG4gIHZhciBoYW5kbGVycyA9IHt9XG4gIHZhciBjaGlsZHJlbiA9IHt9XG4gIGNoaWxkcmVuW3Jvb3RJZF0gPSB7fVxuXG4gIGlmICghaXNEb20oY29udGFpbmVyKSkge1xuICAgIHRocm93IG5ldyBFcnJvcignQ29udGFpbmVyIGVsZW1lbnQgbXVzdCBiZSBhIERPTSBlbGVtZW50JylcbiAgfVxuXG4gIC8qKlxuICAgKiBSZW5kZXJpbmcgb3B0aW9ucy4gQmF0Y2hpbmcgaXMgb25seSBldmVyIHJlYWxseSBkaXNhYmxlZFxuICAgKiB3aGVuIHJ1bm5pbmcgdGVzdHMsIGFuZCBwb29saW5nIGNhbiBiZSBkaXNhYmxlZCBpZiB0aGUgdXNlclxuICAgKiBpcyBkb2luZyBzb21ldGhpbmcgc3R1cGlkIHdpdGggdGhlIERPTSBpbiB0aGVpciBjb21wb25lbnRzLlxuICAgKi9cblxuICB2YXIgb3B0aW9ucyA9IGRlZmF1bHRzKGFzc2lnbih7fSwgYXBwLm9wdGlvbnMgfHwge30sIG9wdHMgfHwge30pLCB7XG4gICAgcG9vbGluZzogdHJ1ZSxcbiAgICBiYXRjaGluZzogdHJ1ZSxcbiAgICB2YWxpZGF0ZVByb3BzOiBmYWxzZVxuICB9KVxuXG4gIC8qKlxuICAgKiBMaXN0ZW4gdG8gRE9NIGV2ZW50c1xuICAgKi9cblxuICBhZGROYXRpdmVFdmVudExpc3RlbmVycygpXG5cbiAgLyoqXG4gICAqIFdhdGNoIGZvciBjaGFuZ2VzIHRvIHRoZSBhcHAgc28gdGhhdCB3ZSBjYW4gdXBkYXRlXG4gICAqIHRoZSBET00gYXMgbmVlZGVkLlxuICAgKi9cblxuICBhcHAub24oJ3VubW91bnQnLCBvbnVubW91bnQpXG4gIGFwcC5vbignbW91bnQnLCBvbm1vdW50KVxuICBhcHAub24oJ3NvdXJjZScsIG9udXBkYXRlKVxuXG4gIC8qKlxuICAgKiBJZiB0aGUgYXBwIGhhcyBhbHJlYWR5IG1vdW50ZWQgYW4gZWxlbWVudCwgd2UgY2FuIGp1c3RcbiAgICogcmVuZGVyIHRoYXQgc3RyYWlnaHQgYXdheS5cbiAgICovXG5cbiAgaWYgKGFwcC5lbGVtZW50KSByZW5kZXIoKVxuXG4gIC8qKlxuICAgKiBUZWFyZG93biB0aGUgRE9NIHJlbmRlcmluZyBzbyB0aGF0IGl0IHN0b3BzXG4gICAqIHJlbmRlcmluZyBhbmQgZXZlcnl0aGluZyBjYW4gYmUgZ2FyYmFnZSBjb2xsZWN0ZWQuXG4gICAqL1xuXG4gIGZ1bmN0aW9uIHRlYXJkb3duICgpIHtcbiAgICByZW1vdmVOYXRpdmVFdmVudExpc3RlbmVycygpXG4gICAgcmVtb3ZlTmF0aXZlRWxlbWVudCgpXG4gICAgYXBwLm9mZigndW5tb3VudCcsIG9udW5tb3VudClcbiAgICBhcHAub2ZmKCdtb3VudCcsIG9ubW91bnQpXG4gICAgYXBwLm9mZignc291cmNlJywgb251cGRhdGUpXG4gIH1cblxuICAvKipcbiAgICogU3dhcCB0aGUgY3VycmVudCByZW5kZXJlZCBub2RlIHdpdGggYSBuZXcgb25lIHRoYXQgaXMgcmVuZGVyZWRcbiAgICogZnJvbSB0aGUgbmV3IHZpcnR1YWwgZWxlbWVudCBtb3VudGVkIG9uIHRoZSBhcHAuXG4gICAqXG4gICAqIEBwYXJhbSB7VmlydHVhbEVsZW1lbnR9IGVsZW1lbnRcbiAgICovXG5cbiAgZnVuY3Rpb24gb25tb3VudCAoKSB7XG4gICAgaW52YWxpZGF0ZSgpXG4gIH1cblxuICAvKipcbiAgICogSWYgdGhlIGFwcCB1bm1vdW50cyBhbiBlbGVtZW50LCB3ZSBzaG91bGQgY2xlYXIgb3V0IHRoZSBjdXJyZW50XG4gICAqIHJlbmRlcmVkIGVsZW1lbnQuIFRoaXMgd2lsbCByZW1vdmUgYWxsIHRoZSBlbnRpdGllcy5cbiAgICovXG5cbiAgZnVuY3Rpb24gb251bm1vdW50ICgpIHtcbiAgICByZW1vdmVOYXRpdmVFbGVtZW50KClcbiAgICBjdXJyZW50RWxlbWVudCA9IG51bGxcbiAgfVxuXG4gIC8qKlxuICAgKiBVcGRhdGUgYWxsIGNvbXBvbmVudHMgdGhhdCBhcmUgYm91bmQgdG8gdGhlIHNvdXJjZVxuICAgKlxuICAgKiBAcGFyYW0ge1N0cmluZ30gbmFtZVxuICAgKiBAcGFyYW0geyp9IGRhdGFcbiAgICovXG5cbiAgZnVuY3Rpb24gb251cGRhdGUgKG5hbWUsIGRhdGEpIHtcbiAgICBjb25uZWN0aW9uc1tuYW1lXShkYXRhKVxuICB9XG5cbiAgLyoqXG4gICAqIFJlbmRlciBhbmQgbW91bnQgYSBjb21wb25lbnQgdG8gdGhlIG5hdGl2ZSBkb20uXG4gICAqXG4gICAqIEBwYXJhbSB7RW50aXR5fSBlbnRpdHlcbiAgICogQHJldHVybiB7SFRNTEVsZW1lbnR9XG4gICAqL1xuXG4gIGZ1bmN0aW9uIG1vdW50RW50aXR5IChlbnRpdHkpIHtcbiAgICByZWdpc3RlcihlbnRpdHkpXG4gICAgc2V0RGVmYXVsdHMoZW50aXR5KVxuICAgIGNoaWxkcmVuW2VudGl0eS5pZF0gPSB7fVxuICAgIGVudGl0aWVzW2VudGl0eS5pZF0gPSBlbnRpdHlcblxuICAgIC8vIGNvbW1pdCBpbml0aWFsIHN0YXRlIGFuZCBwcm9wcy5cbiAgICBjb21taXQoZW50aXR5KVxuXG4gICAgLy8gY2FsbGJhY2sgYmVmb3JlIG1vdW50aW5nLlxuICAgIHRyaWdnZXIoJ2JlZm9yZU1vdW50JywgZW50aXR5LCBbZW50aXR5LmNvbnRleHRdKVxuICAgIHRyaWdnZXIoJ2JlZm9yZVJlbmRlcicsIGVudGl0eSwgW2VudGl0eS5jb250ZXh0XSlcblxuICAgIC8vIHJlbmRlciB2aXJ0dWFsIGVsZW1lbnQuXG4gICAgdmFyIHZpcnR1YWxFbGVtZW50ID0gcmVuZGVyRW50aXR5KGVudGl0eSlcbiAgICAvLyBjcmVhdGUgbmF0aXZlIGVsZW1lbnQuXG4gICAgdmFyIG5hdGl2ZUVsZW1lbnQgPSB0b05hdGl2ZShlbnRpdHkuaWQsICcwJywgdmlydHVhbEVsZW1lbnQpXG5cbiAgICBlbnRpdHkudmlydHVhbEVsZW1lbnQgPSB2aXJ0dWFsRWxlbWVudFxuICAgIGVudGl0eS5uYXRpdmVFbGVtZW50ID0gbmF0aXZlRWxlbWVudFxuXG4gICAgLy8gY2FsbGJhY2sgYWZ0ZXIgbW91bnRpbmcuXG4gICAgdHJpZ2dlcignYWZ0ZXJSZW5kZXInLCBlbnRpdHksIFtlbnRpdHkuY29udGV4dCwgbmF0aXZlRWxlbWVudF0pXG4gICAgdHJpZ2dlcignYWZ0ZXJNb3VudCcsIGVudGl0eSwgW2VudGl0eS5jb250ZXh0LCBuYXRpdmVFbGVtZW50LCBzZXRTdGF0ZShlbnRpdHkpXSlcblxuICAgIHJldHVybiBuYXRpdmVFbGVtZW50XG4gIH1cblxuICAvKipcbiAgICogUmVtb3ZlIGEgY29tcG9uZW50IGZyb20gdGhlIG5hdGl2ZSBkb20uXG4gICAqXG4gICAqIEBwYXJhbSB7RW50aXR5fSBlbnRpdHlcbiAgICovXG5cbiAgZnVuY3Rpb24gdW5tb3VudEVudGl0eSAoZW50aXR5SWQpIHtcbiAgICB2YXIgZW50aXR5ID0gZW50aXRpZXNbZW50aXR5SWRdXG4gICAgaWYgKCFlbnRpdHkpIHJldHVyblxuICAgIHRyaWdnZXIoJ2JlZm9yZVVubW91bnQnLCBlbnRpdHksIFtlbnRpdHkuY29udGV4dCwgZW50aXR5Lm5hdGl2ZUVsZW1lbnRdKVxuICAgIHVubW91bnRDaGlsZHJlbihlbnRpdHlJZClcbiAgICByZW1vdmVBbGxFdmVudHMoZW50aXR5SWQpXG4gICAgZGVsZXRlIGVudGl0aWVzW2VudGl0eUlkXVxuICAgIGRlbGV0ZSBjaGlsZHJlbltlbnRpdHlJZF1cbiAgfVxuXG4gIC8qKlxuICAgKiBSZW5kZXIgdGhlIGVudGl0eSBhbmQgbWFrZSBzdXJlIGl0IHJldHVybnMgYSBub2RlXG4gICAqXG4gICAqIEBwYXJhbSB7RW50aXR5fSBlbnRpdHlcbiAgICpcbiAgICogQHJldHVybiB7VmlydHVhbFRyZWV9XG4gICAqL1xuXG4gIGZ1bmN0aW9uIHJlbmRlckVudGl0eSAoZW50aXR5KSB7XG4gICAgdmFyIGNvbXBvbmVudCA9IGVudGl0eS5jb21wb25lbnRcbiAgICBpZiAoIWNvbXBvbmVudC5yZW5kZXIpIHRocm93IG5ldyBFcnJvcignQ29tcG9uZW50IG5lZWRzIGEgcmVuZGVyIGZ1bmN0aW9uJylcbiAgICB2YXIgcmVzdWx0ID0gY29tcG9uZW50LnJlbmRlcihlbnRpdHkuY29udGV4dCwgc2V0U3RhdGUoZW50aXR5KSlcbiAgICBpZiAoIXJlc3VsdCkgdGhyb3cgbmV3IEVycm9yKCdSZW5kZXIgZnVuY3Rpb24gbXVzdCByZXR1cm4gYW4gZWxlbWVudC4nKVxuICAgIHJldHVybiByZXN1bHRcbiAgfVxuXG4gIC8qKlxuICAgKiBXaGVuZXZlciBzZXRTdGF0ZSBvciBzZXRQcm9wcyBpcyBjYWxsZWQsIHdlIG1hcmsgdGhlIGVudGl0eVxuICAgKiBhcyBkaXJ0eSBpbiB0aGUgcmVuZGVyZXIuIFRoaXMgbGV0cyB1cyBvcHRpbWl6ZSB0aGUgcmUtcmVuZGVyaW5nXG4gICAqIGFuZCBza2lwIGNvbXBvbmVudHMgdGhhdCBkZWZpbml0ZWx5IGhhdmVuJ3QgY2hhbmdlZC5cbiAgICpcbiAgICogQHBhcmFtIHtFbnRpdHl9IGVudGl0eVxuICAgKlxuICAgKiBAcmV0dXJuIHtGdW5jdGlvbn0gQSBjdXJyaWVkIGZ1bmN0aW9uIGZvciB1cGRhdGluZyB0aGUgc3RhdGUgb2YgYW4gZW50aXR5XG4gICAqL1xuXG4gIGZ1bmN0aW9uIHNldFN0YXRlIChlbnRpdHkpIHtcbiAgICByZXR1cm4gZnVuY3Rpb24gKG5leHRTdGF0ZSkge1xuICAgICAgdXBkYXRlRW50aXR5U3RhdGUoZW50aXR5LCBuZXh0U3RhdGUpXG4gICAgfVxuICB9XG5cbiAgLyoqXG4gICAqIFRlbGwgdGhlIGFwcCBpdCdzIGRpcnR5IGFuZCBuZWVkcyB0byByZS1yZW5kZXIuIElmIGJhdGNoaW5nIGlzIGRpc2FibGVkXG4gICAqIHdlIGNhbiBqdXN0IHRyaWdnZXIgYSByZW5kZXIgaW1tZWRpYXRlbHksIG90aGVyd2lzZSB3ZSdsbCB3YWl0IHVudGlsXG4gICAqIHRoZSBuZXh0IGF2YWlsYWJsZSBmcmFtZS5cbiAgICovXG5cbiAgZnVuY3Rpb24gaW52YWxpZGF0ZSAoKSB7XG4gICAgaWYgKCFvcHRpb25zLmJhdGNoaW5nKSB7XG4gICAgICBpZiAoIWlzUmVuZGVyaW5nKSByZW5kZXIoKVxuICAgIH0gZWxzZSB7XG4gICAgICBpZiAoIWZyYW1lSWQpIGZyYW1lSWQgPSByYWYocmVuZGVyKVxuICAgIH1cbiAgfVxuXG4gIC8qKlxuICAgKiBVcGRhdGUgdGhlIERPTS4gSWYgdGhlIHVwZGF0ZSBmYWlscyB3ZSBzdG9wIHRoZSBsb29wXG4gICAqIHNvIHdlIGRvbid0IGdldCBlcnJvcnMgb24gZXZlcnkgZnJhbWUuXG4gICAqXG4gICAqIEBhcGkgcHVibGljXG4gICAqL1xuXG4gIGZ1bmN0aW9uIHJlbmRlciAoKSB7XG4gICAgLy8gSWYgdGhpcyBpcyBjYWxsZWQgc3luY2hyb25vdXNseSB3ZSBuZWVkIHRvXG4gICAgLy8gY2FuY2VsIGFueSBwZW5kaW5nIGZ1dHVyZSB1cGRhdGVzXG4gICAgY2xlYXJGcmFtZSgpXG5cbiAgICAvLyBJZiB0aGUgcmVuZGVyaW5nIGZyb20gdGhlIHByZXZpb3VzIGZyYW1lIGlzIHN0aWxsIGdvaW5nLFxuICAgIC8vIHdlJ2xsIGp1c3Qgd2FpdCB1bnRpbCB0aGUgbmV4dCBmcmFtZS4gSWRlYWxseSByZW5kZXJzIHNob3VsZFxuICAgIC8vIG5vdCB0YWtlIG92ZXIgMTZtcyB0byBzdGF5IHdpdGhpbiBhIHNpbmdsZSBmcmFtZSwgYnV0IHRoaXMgc2hvdWxkXG4gICAgLy8gY2F0Y2ggaXQgaWYgaXQgZG9lcy5cbiAgICBpZiAoaXNSZW5kZXJpbmcpIHtcbiAgICAgIGZyYW1lSWQgPSByYWYocmVuZGVyKVxuICAgICAgcmV0dXJuXG4gICAgfSBlbHNlIHtcbiAgICAgIGlzUmVuZGVyaW5nID0gdHJ1ZVxuICAgIH1cblxuICAgIC8vIDEuIElmIHRoZXJlIGlzbid0IGEgbmF0aXZlIGVsZW1lbnQgcmVuZGVyZWQgZm9yIHRoZSBjdXJyZW50IG1vdW50ZWQgZWxlbWVudFxuICAgIC8vIHRoZW4gd2UgbmVlZCB0byBjcmVhdGUgaXQgZnJvbSBzY3JhdGNoLlxuICAgIC8vIDIuIElmIGEgbmV3IGVsZW1lbnQgaGFzIGJlZW4gbW91bnRlZCwgd2Ugc2hvdWxkIGRpZmYgdGhlbS5cbiAgICAvLyAzLiBXZSBzaG91bGQgdXBkYXRlIGNoZWNrIGFsbCBjaGlsZCBjb21wb25lbnRzIGZvciBjaGFuZ2VzLlxuICAgIGlmICghY3VycmVudE5hdGl2ZUVsZW1lbnQpIHtcbiAgICAgIGN1cnJlbnRFbGVtZW50ID0gYXBwLmVsZW1lbnRcbiAgICAgIGN1cnJlbnROYXRpdmVFbGVtZW50ID0gdG9OYXRpdmUocm9vdElkLCAnMCcsIGN1cnJlbnRFbGVtZW50KVxuICAgICAgY29udGFpbmVyLmFwcGVuZENoaWxkKGN1cnJlbnROYXRpdmVFbGVtZW50KVxuICAgIH0gZWxzZSBpZiAoY3VycmVudEVsZW1lbnQgIT09IGFwcC5lbGVtZW50KSB7XG4gICAgICBjdXJyZW50TmF0aXZlRWxlbWVudCA9IHBhdGNoKHJvb3RJZCwgY3VycmVudEVsZW1lbnQsIGFwcC5lbGVtZW50LCBjdXJyZW50TmF0aXZlRWxlbWVudClcbiAgICAgIGN1cnJlbnRFbGVtZW50ID0gYXBwLmVsZW1lbnRcbiAgICAgIHVwZGF0ZUNoaWxkcmVuKHJvb3RJZClcbiAgICB9IGVsc2Uge1xuICAgICAgdXBkYXRlQ2hpbGRyZW4ocm9vdElkKVxuICAgIH1cblxuICAgIC8vIEFsbG93IHJlbmRlcmluZyBhZ2Fpbi5cbiAgICBpc1JlbmRlcmluZyA9IGZhbHNlXG4gIH1cblxuICAvKipcbiAgICogQ2xlYXIgdGhlIGN1cnJlbnQgc2NoZWR1bGVkIGZyYW1lXG4gICAqL1xuXG4gIGZ1bmN0aW9uIGNsZWFyRnJhbWUgKCkge1xuICAgIGlmICghZnJhbWVJZCkgcmV0dXJuXG4gICAgcmFmLmNhbmNlbChmcmFtZUlkKVxuICAgIGZyYW1lSWQgPSAwXG4gIH1cblxuICAvKipcbiAgICogVXBkYXRlIGEgY29tcG9uZW50LlxuICAgKlxuICAgKiBUaGUgZW50aXR5IGlzIGp1c3QgdGhlIGRhdGEgb2JqZWN0IGZvciBhIGNvbXBvbmVudCBpbnN0YW5jZS5cbiAgICpcbiAgICogQHBhcmFtIHtTdHJpbmd9IGlkIENvbXBvbmVudCBpbnN0YW5jZSBpZC5cbiAgICovXG5cbiAgZnVuY3Rpb24gdXBkYXRlRW50aXR5IChlbnRpdHlJZCkge1xuICAgIHZhciBlbnRpdHkgPSBlbnRpdGllc1tlbnRpdHlJZF1cbiAgICBpZiAoIXNob3VsZFVwZGF0ZShlbnRpdHkpKSByZXR1cm4gdXBkYXRlQ2hpbGRyZW4oZW50aXR5SWQpXG5cbiAgICB2YXIgY3VycmVudFRyZWUgPSBlbnRpdHkudmlydHVhbEVsZW1lbnRcbiAgICB2YXIgbmV4dFByb3BzID0gZW50aXR5LnBlbmRpbmdQcm9wc1xuICAgIHZhciBuZXh0U3RhdGUgPSBlbnRpdHkucGVuZGluZ1N0YXRlXG4gICAgdmFyIHByZXZpb3VzU3RhdGUgPSBlbnRpdHkuY29udGV4dC5zdGF0ZVxuICAgIHZhciBwcmV2aW91c1Byb3BzID0gZW50aXR5LmNvbnRleHQucHJvcHNcblxuICAgIC8vIGhvb2sgYmVmb3JlIHJlbmRlcmluZy4gY291bGQgbW9kaWZ5IHN0YXRlIGp1c3QgYmVmb3JlIHRoZSByZW5kZXIgb2NjdXJzLlxuICAgIHRyaWdnZXIoJ2JlZm9yZVVwZGF0ZScsIGVudGl0eSwgW2VudGl0eS5jb250ZXh0LCBuZXh0UHJvcHMsIG5leHRTdGF0ZV0pXG4gICAgdHJpZ2dlcignYmVmb3JlUmVuZGVyJywgZW50aXR5LCBbZW50aXR5LmNvbnRleHRdKVxuXG4gICAgLy8gY29tbWl0IHN0YXRlIGFuZCBwcm9wcy5cbiAgICBjb21taXQoZW50aXR5KVxuXG4gICAgLy8gcmUtcmVuZGVyLlxuICAgIHZhciBuZXh0VHJlZSA9IHJlbmRlckVudGl0eShlbnRpdHkpXG5cbiAgICAvLyBhcHBseSBuZXcgdmlydHVhbCB0cmVlIHRvIG5hdGl2ZSBkb20uXG4gICAgZW50aXR5Lm5hdGl2ZUVsZW1lbnQgPSBwYXRjaChlbnRpdHlJZCwgY3VycmVudFRyZWUsIG5leHRUcmVlLCBlbnRpdHkubmF0aXZlRWxlbWVudClcbiAgICBlbnRpdHkudmlydHVhbEVsZW1lbnQgPSBuZXh0VHJlZVxuICAgIHVwZGF0ZUNoaWxkcmVuKGVudGl0eUlkKVxuXG4gICAgLy8gdHJpZ2dlciByZW5kZXIgaG9va1xuICAgIHRyaWdnZXIoJ2FmdGVyUmVuZGVyJywgZW50aXR5LCBbZW50aXR5LmNvbnRleHQsIGVudGl0eS5uYXRpdmVFbGVtZW50XSlcblxuICAgIC8vIHRyaWdnZXIgYWZ0ZXJVcGRhdGUgYWZ0ZXIgYWxsIGNoaWxkcmVuIGhhdmUgdXBkYXRlZC5cbiAgICB0cmlnZ2VyKCdhZnRlclVwZGF0ZScsIGVudGl0eSwgW2VudGl0eS5jb250ZXh0LCBwcmV2aW91c1Byb3BzLCBwcmV2aW91c1N0YXRlLCBzZXRTdGF0ZShlbnRpdHkpXSlcbiAgfVxuXG4gIC8qKlxuICAgKiBVcGRhdGUgYWxsIHRoZSBjaGlsZHJlbiBvZiBhbiBlbnRpdHkuXG4gICAqXG4gICAqIEBwYXJhbSB7U3RyaW5nfSBpZCBDb21wb25lbnQgaW5zdGFuY2UgaWQuXG4gICAqL1xuXG4gIGZ1bmN0aW9uIHVwZGF0ZUNoaWxkcmVuIChlbnRpdHlJZCkge1xuICAgIGZvckVhY2goY2hpbGRyZW5bZW50aXR5SWRdLCBmdW5jdGlvbiAoY2hpbGRJZCkge1xuICAgICAgdXBkYXRlRW50aXR5KGNoaWxkSWQpXG4gICAgfSlcbiAgfVxuXG4gIC8qKlxuICAgKiBSZW1vdmUgYWxsIG9mIHRoZSBjaGlsZCBlbnRpdGllcyBvZiBhbiBlbnRpdHlcbiAgICpcbiAgICogQHBhcmFtIHtFbnRpdHl9IGVudGl0eVxuICAgKi9cblxuICBmdW5jdGlvbiB1bm1vdW50Q2hpbGRyZW4gKGVudGl0eUlkKSB7XG4gICAgZm9yRWFjaChjaGlsZHJlbltlbnRpdHlJZF0sIGZ1bmN0aW9uIChjaGlsZElkKSB7XG4gICAgICB1bm1vdW50RW50aXR5KGNoaWxkSWQpXG4gICAgfSlcbiAgfVxuXG4gIC8qKlxuICAgKiBSZW1vdmUgdGhlIHJvb3QgZWxlbWVudC4gSWYgdGhpcyBpcyBjYWxsZWQgc3luY2hyb25vdXNseSB3ZSBuZWVkIHRvXG4gICAqIGNhbmNlbCBhbnkgcGVuZGluZyBmdXR1cmUgdXBkYXRlcy5cbiAgICovXG5cbiAgZnVuY3Rpb24gcmVtb3ZlTmF0aXZlRWxlbWVudCAoKSB7XG4gICAgY2xlYXJGcmFtZSgpXG4gICAgcmVtb3ZlRWxlbWVudChyb290SWQsICcwJywgY3VycmVudE5hdGl2ZUVsZW1lbnQpXG4gICAgY3VycmVudE5hdGl2ZUVsZW1lbnQgPSBudWxsXG4gIH1cblxuICAvKipcbiAgICogQ3JlYXRlIGEgbmF0aXZlIGVsZW1lbnQgZnJvbSBhIHZpcnR1YWwgZWxlbWVudC5cbiAgICpcbiAgICogQHBhcmFtIHtTdHJpbmd9IGVudGl0eUlkXG4gICAqIEBwYXJhbSB7U3RyaW5nfSBwYXRoXG4gICAqIEBwYXJhbSB7T2JqZWN0fSB2bm9kZVxuICAgKlxuICAgKiBAcmV0dXJuIHtIVE1MRG9jdW1lbnRGcmFnbWVudH1cbiAgICovXG5cbiAgZnVuY3Rpb24gdG9OYXRpdmUgKGVudGl0eUlkLCBwYXRoLCB2bm9kZSkge1xuICAgIHN3aXRjaCAodm5vZGUudHlwZSkge1xuICAgICAgY2FzZSAndGV4dCc6IHJldHVybiB0b05hdGl2ZVRleHQodm5vZGUpXG4gICAgICBjYXNlICdlbGVtZW50JzogcmV0dXJuIHRvTmF0aXZlRWxlbWVudChlbnRpdHlJZCwgcGF0aCwgdm5vZGUpXG4gICAgICBjYXNlICdjb21wb25lbnQnOiByZXR1cm4gdG9OYXRpdmVDb21wb25lbnQoZW50aXR5SWQsIHBhdGgsIHZub2RlKVxuICAgIH1cbiAgfVxuXG4gIC8qKlxuICAgKiBDcmVhdGUgYSBuYXRpdmUgdGV4dCBlbGVtZW50IGZyb20gYSB2aXJ0dWFsIGVsZW1lbnQuXG4gICAqXG4gICAqIEBwYXJhbSB7T2JqZWN0fSB2bm9kZVxuICAgKi9cblxuICBmdW5jdGlvbiB0b05hdGl2ZVRleHQgKHZub2RlKSB7XG4gICAgcmV0dXJuIGRvY3VtZW50LmNyZWF0ZVRleHROb2RlKHZub2RlLmRhdGEpXG4gIH1cblxuICAvKipcbiAgICogQ3JlYXRlIGEgbmF0aXZlIGVsZW1lbnQgZnJvbSBhIHZpcnR1YWwgZWxlbWVudC5cbiAgICovXG5cbiAgZnVuY3Rpb24gdG9OYXRpdmVFbGVtZW50IChlbnRpdHlJZCwgcGF0aCwgdm5vZGUpIHtcbiAgICB2YXIgYXR0cmlidXRlcyA9IHZub2RlLmF0dHJpYnV0ZXNcbiAgICB2YXIgY2hpbGRyZW4gPSB2bm9kZS5jaGlsZHJlblxuICAgIHZhciB0YWdOYW1lID0gdm5vZGUudGFnTmFtZVxuICAgIHZhciBlbFxuXG4gICAgLy8gY3JlYXRlIGVsZW1lbnQgZWl0aGVyIGZyb20gcG9vbCBvciBmcmVzaC5cbiAgICBpZiAoIW9wdGlvbnMucG9vbGluZyB8fCAhY2FuUG9vbCh0YWdOYW1lKSkge1xuICAgICAgaWYgKHN2Zy5pc0VsZW1lbnQodGFnTmFtZSkpIHtcbiAgICAgICAgZWwgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50TlMoc3ZnLm5hbWVzcGFjZSwgdGFnTmFtZSlcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGVsID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCh0YWdOYW1lKVxuICAgICAgfVxuICAgIH0gZWxzZSB7XG4gICAgICB2YXIgcG9vbCA9IGdldFBvb2wodGFnTmFtZSlcbiAgICAgIGVsID0gY2xlYW51cChwb29sLnBvcCgpKVxuICAgICAgaWYgKGVsLnBhcmVudE5vZGUpIGVsLnBhcmVudE5vZGUucmVtb3ZlQ2hpbGQoZWwpXG4gICAgfVxuXG4gICAgLy8gc2V0IGF0dHJpYnV0ZXMuXG4gICAgZm9yRWFjaChhdHRyaWJ1dGVzLCBmdW5jdGlvbiAodmFsdWUsIG5hbWUpIHtcbiAgICAgIHNldEF0dHJpYnV0ZShlbnRpdHlJZCwgcGF0aCwgZWwsIG5hbWUsIHZhbHVlKVxuICAgIH0pXG5cbiAgICAvLyBzdG9yZSBrZXlzIG9uIHRoZSBuYXRpdmUgZWxlbWVudCBmb3IgZmFzdCBldmVudCBoYW5kbGluZy5cbiAgICBlbC5fX2VudGl0eV9fID0gZW50aXR5SWRcbiAgICBlbC5fX3BhdGhfXyA9IHBhdGhcblxuICAgIC8vIGFkZCBjaGlsZHJlbi5cbiAgICBmb3JFYWNoKGNoaWxkcmVuLCBmdW5jdGlvbiAoY2hpbGQsIGkpIHtcbiAgICAgIHZhciBjaGlsZEVsID0gdG9OYXRpdmUoZW50aXR5SWQsIHBhdGggKyAnLicgKyBpLCBjaGlsZClcbiAgICAgIGlmICghY2hpbGRFbC5wYXJlbnROb2RlKSBlbC5hcHBlbmRDaGlsZChjaGlsZEVsKVxuICAgIH0pXG5cbiAgICByZXR1cm4gZWxcbiAgfVxuXG4gIC8qKlxuICAgKiBDcmVhdGUgYSBuYXRpdmUgZWxlbWVudCBmcm9tIGEgY29tcG9uZW50LlxuICAgKi9cblxuICBmdW5jdGlvbiB0b05hdGl2ZUNvbXBvbmVudCAoZW50aXR5SWQsIHBhdGgsIHZub2RlKSB7XG4gICAgdmFyIGNoaWxkID0gbmV3IEVudGl0eSh2bm9kZS5jb21wb25lbnQsIHZub2RlLnByb3BzKVxuICAgIGNoaWxkcmVuW2VudGl0eUlkXVtwYXRoXSA9IGNoaWxkLmlkXG4gICAgcmV0dXJuIG1vdW50RW50aXR5KGNoaWxkKVxuICB9XG5cbiAgLyoqXG4gICAqIFBhdGNoIGFuIGVsZW1lbnQgd2l0aCB0aGUgZGlmZiBmcm9tIHR3byB0cmVlcy5cbiAgICovXG5cbiAgZnVuY3Rpb24gcGF0Y2ggKGVudGl0eUlkLCBwcmV2LCBuZXh0LCBlbCkge1xuICAgIHJldHVybiBkaWZmTm9kZSgnMCcsIGVudGl0eUlkLCBwcmV2LCBuZXh0LCBlbClcbiAgfVxuXG4gIC8qKlxuICAgKiBDcmVhdGUgYSBkaWZmIGJldHdlZW4gdHdvIHRyZXNzIG9mIG5vZGVzLlxuICAgKi9cblxuICBmdW5jdGlvbiBkaWZmTm9kZSAocGF0aCwgZW50aXR5SWQsIHByZXYsIG5leHQsIGVsKSB7XG4gICAgLy8gVHlwZSBjaGFuZ2VkLiBUaGlzIGNvdWxkIGJlIGZyb20gZWxlbWVudC0+dGV4dCwgdGV4dC0+Q29tcG9uZW50QSxcbiAgICAvLyBDb21wb25lbnRBLT5Db21wb25lbnRCIGV0Yy4gQnV0IE5PVCBkaXYtPnNwYW4uIFRoZXNlIGFyZSB0aGUgc2FtZSB0eXBlXG4gICAgLy8gKEVsZW1lbnROb2RlKSBidXQgZGlmZmVyZW50IHRhZyBuYW1lLlxuICAgIGlmIChwcmV2LnR5cGUgIT09IG5leHQudHlwZSkgcmV0dXJuIHJlcGxhY2VFbGVtZW50KGVudGl0eUlkLCBwYXRoLCBlbCwgbmV4dClcblxuICAgIHN3aXRjaCAobmV4dC50eXBlKSB7XG4gICAgICBjYXNlICd0ZXh0JzogcmV0dXJuIGRpZmZUZXh0KHByZXYsIG5leHQsIGVsKVxuICAgICAgY2FzZSAnZWxlbWVudCc6IHJldHVybiBkaWZmRWxlbWVudChwYXRoLCBlbnRpdHlJZCwgcHJldiwgbmV4dCwgZWwpXG4gICAgICBjYXNlICdjb21wb25lbnQnOiByZXR1cm4gZGlmZkNvbXBvbmVudChwYXRoLCBlbnRpdHlJZCwgcHJldiwgbmV4dCwgZWwpXG4gICAgfVxuICB9XG5cbiAgLyoqXG4gICAqIERpZmYgdHdvIHRleHQgbm9kZXMgYW5kIHVwZGF0ZSB0aGUgZWxlbWVudC5cbiAgICovXG5cbiAgZnVuY3Rpb24gZGlmZlRleHQgKHByZXZpb3VzLCBjdXJyZW50LCBlbCkge1xuICAgIGlmIChjdXJyZW50LmRhdGEgIT09IHByZXZpb3VzLmRhdGEpIGVsLmRhdGEgPSBjdXJyZW50LmRhdGFcbiAgICByZXR1cm4gZWxcbiAgfVxuXG4gIC8qKlxuICAgKiBEaWZmIHRoZSBjaGlsZHJlbiBvZiBhbiBFbGVtZW50Tm9kZS5cbiAgICovXG5cbiAgZnVuY3Rpb24gZGlmZkNoaWxkcmVuIChwYXRoLCBlbnRpdHlJZCwgcHJldiwgbmV4dCwgZWwpIHtcbiAgICB2YXIgcG9zaXRpb25zID0gW11cbiAgICB2YXIgaGFzS2V5cyA9IGZhbHNlXG4gICAgdmFyIGNoaWxkTm9kZXMgPSBBcnJheS5wcm90b3R5cGUuc2xpY2UuYXBwbHkoZWwuY2hpbGROb2RlcylcbiAgICB2YXIgbGVmdEtleXMgPSByZWR1Y2UocHJldi5jaGlsZHJlbiwga2V5TWFwUmVkdWNlciwge30pXG4gICAgdmFyIHJpZ2h0S2V5cyA9IHJlZHVjZShuZXh0LmNoaWxkcmVuLCBrZXlNYXBSZWR1Y2VyLCB7fSlcbiAgICB2YXIgY3VycmVudENoaWxkcmVuID0gYXNzaWduKHt9LCBjaGlsZHJlbltlbnRpdHlJZF0pXG5cbiAgICBmdW5jdGlvbiBrZXlNYXBSZWR1Y2VyIChhY2MsIGNoaWxkKSB7XG4gICAgICBpZiAoY2hpbGQua2V5ICE9IG51bGwpIHtcbiAgICAgICAgYWNjW2NoaWxkLmtleV0gPSBjaGlsZFxuICAgICAgICBoYXNLZXlzID0gdHJ1ZVxuICAgICAgfVxuICAgICAgcmV0dXJuIGFjY1xuICAgIH1cblxuICAgIC8vIERpZmYgYWxsIG9mIHRoZSBub2RlcyB0aGF0IGhhdmUga2V5cy4gVGhpcyBsZXRzIHVzIHJlLXVzZWQgZWxlbWVudHNcbiAgICAvLyBpbnN0ZWFkIG9mIG92ZXJyaWRpbmcgdGhlbSBhbmQgbGV0cyB1cyBtb3ZlIHRoZW0gYXJvdW5kLlxuICAgIGlmIChoYXNLZXlzKSB7XG5cbiAgICAgIC8vIFJlbW92YWxzXG4gICAgICBmb3JFYWNoKGxlZnRLZXlzLCBmdW5jdGlvbiAobGVmdE5vZGUsIGtleSkge1xuICAgICAgICBpZiAocmlnaHRLZXlzW2tleV0gPT0gbnVsbCkge1xuICAgICAgICAgIHZhciBsZWZ0UGF0aCA9IHBhdGggKyAnLicgKyBsZWZ0Tm9kZS5pbmRleFxuICAgICAgICAgIHJlbW92ZUVsZW1lbnQoXG4gICAgICAgICAgICBlbnRpdHlJZCxcbiAgICAgICAgICAgIGxlZnRQYXRoLFxuICAgICAgICAgICAgY2hpbGROb2Rlc1tsZWZ0Tm9kZS5pbmRleF1cbiAgICAgICAgICApXG4gICAgICAgIH1cbiAgICAgIH0pXG5cbiAgICAgIC8vIFVwZGF0ZSBub2Rlc1xuICAgICAgZm9yRWFjaChyaWdodEtleXMsIGZ1bmN0aW9uIChyaWdodE5vZGUsIGtleSkge1xuICAgICAgICB2YXIgbGVmdE5vZGUgPSBsZWZ0S2V5c1trZXldXG5cbiAgICAgICAgLy8gV2Ugb25seSB3YW50IHVwZGF0ZXMgZm9yIG5vd1xuICAgICAgICBpZiAobGVmdE5vZGUgPT0gbnVsbCkgcmV0dXJuXG5cbiAgICAgICAgdmFyIGxlZnRQYXRoID0gcGF0aCArICcuJyArIGxlZnROb2RlLmluZGV4XG5cbiAgICAgICAgLy8gVXBkYXRlZFxuICAgICAgICBwb3NpdGlvbnNbcmlnaHROb2RlLmluZGV4XSA9IGRpZmZOb2RlKFxuICAgICAgICAgIGxlZnRQYXRoLFxuICAgICAgICAgIGVudGl0eUlkLFxuICAgICAgICAgIGxlZnROb2RlLFxuICAgICAgICAgIHJpZ2h0Tm9kZSxcbiAgICAgICAgICBjaGlsZE5vZGVzW2xlZnROb2RlLmluZGV4XVxuICAgICAgICApXG4gICAgICB9KVxuXG4gICAgICAvLyBVcGRhdGUgdGhlIHBvc2l0aW9ucyBvZiBhbGwgY2hpbGQgY29tcG9uZW50cyBhbmQgZXZlbnQgaGFuZGxlcnNcbiAgICAgIGZvckVhY2gocmlnaHRLZXlzLCBmdW5jdGlvbiAocmlnaHROb2RlLCBrZXkpIHtcbiAgICAgICAgdmFyIGxlZnROb2RlID0gbGVmdEtleXNba2V5XVxuXG4gICAgICAgIC8vIFdlIGp1c3Qgd2FudCBlbGVtZW50cyB0aGF0IGhhdmUgbW92ZWQgYXJvdW5kXG4gICAgICAgIGlmIChsZWZ0Tm9kZSA9PSBudWxsIHx8IGxlZnROb2RlLmluZGV4ID09PSByaWdodE5vZGUuaW5kZXgpIHJldHVyblxuXG4gICAgICAgIHZhciByaWdodFBhdGggPSBwYXRoICsgJy4nICsgcmlnaHROb2RlLmluZGV4XG4gICAgICAgIHZhciBsZWZ0UGF0aCA9IHBhdGggKyAnLicgKyBsZWZ0Tm9kZS5pbmRleFxuXG4gICAgICAgIC8vIFVwZGF0ZSBhbGwgdGhlIGNoaWxkIGNvbXBvbmVudCBwYXRoIHBvc2l0aW9ucyB0byBtYXRjaFxuICAgICAgICAvLyB0aGUgbGF0ZXN0IHBvc2l0aW9ucyBpZiB0aGV5J3ZlIGNoYW5nZWQuIFRoaXMgaXMgYSBiaXQgaGFja3kuXG4gICAgICAgIGZvckVhY2goY3VycmVudENoaWxkcmVuLCBmdW5jdGlvbiAoY2hpbGRJZCwgY2hpbGRQYXRoKSB7XG4gICAgICAgICAgaWYgKGxlZnRQYXRoID09PSBjaGlsZFBhdGgpIHtcbiAgICAgICAgICAgIGRlbGV0ZSBjaGlsZHJlbltlbnRpdHlJZF1bY2hpbGRQYXRoXVxuICAgICAgICAgICAgY2hpbGRyZW5bZW50aXR5SWRdW3JpZ2h0UGF0aF0gPSBjaGlsZElkXG4gICAgICAgICAgfVxuICAgICAgICB9KVxuICAgICAgfSlcblxuICAgICAgLy8gTm93IGFkZCBhbGwgb2YgdGhlIG5ldyBub2RlcyBsYXN0IGluIGNhc2UgdGhlaXIgcGF0aFxuICAgICAgLy8gd291bGQgaGF2ZSBjb25mbGljdGVkIHdpdGggb25lIG9mIHRoZSBwcmV2aW91cyBwYXRocy5cbiAgICAgIGZvckVhY2gocmlnaHRLZXlzLCBmdW5jdGlvbiAocmlnaHROb2RlLCBrZXkpIHtcbiAgICAgICAgdmFyIHJpZ2h0UGF0aCA9IHBhdGggKyAnLicgKyByaWdodE5vZGUuaW5kZXhcbiAgICAgICAgaWYgKGxlZnRLZXlzW2tleV0gPT0gbnVsbCkge1xuICAgICAgICAgIHBvc2l0aW9uc1tyaWdodE5vZGUuaW5kZXhdID0gdG9OYXRpdmUoXG4gICAgICAgICAgICBlbnRpdHlJZCxcbiAgICAgICAgICAgIHJpZ2h0UGF0aCxcbiAgICAgICAgICAgIHJpZ2h0Tm9kZVxuICAgICAgICAgIClcbiAgICAgICAgfVxuICAgICAgfSlcblxuICAgIH0gZWxzZSB7XG4gICAgICB2YXIgbWF4TGVuZ3RoID0gTWF0aC5tYXgocHJldi5jaGlsZHJlbi5sZW5ndGgsIG5leHQuY2hpbGRyZW4ubGVuZ3RoKVxuXG4gICAgICAvLyBOb3cgZGlmZiBhbGwgb2YgdGhlIG5vZGVzIHRoYXQgZG9uJ3QgaGF2ZSBrZXlzXG4gICAgICBmb3IgKHZhciBpID0gMDsgaSA8IG1heExlbmd0aDsgaSsrKSB7XG4gICAgICAgIHZhciBsZWZ0Tm9kZSA9IHByZXYuY2hpbGRyZW5baV1cbiAgICAgICAgdmFyIHJpZ2h0Tm9kZSA9IG5leHQuY2hpbGRyZW5baV1cblxuICAgICAgICAvLyBSZW1vdmFsc1xuICAgICAgICBpZiAocmlnaHROb2RlID09IG51bGwpIHtcbiAgICAgICAgICByZW1vdmVFbGVtZW50KFxuICAgICAgICAgICAgZW50aXR5SWQsXG4gICAgICAgICAgICBwYXRoICsgJy4nICsgbGVmdE5vZGUuaW5kZXgsXG4gICAgICAgICAgICBjaGlsZE5vZGVzW2xlZnROb2RlLmluZGV4XVxuICAgICAgICAgIClcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIE5ldyBOb2RlXG4gICAgICAgIGlmIChsZWZ0Tm9kZSA9PSBudWxsKSB7XG4gICAgICAgICAgcG9zaXRpb25zW3JpZ2h0Tm9kZS5pbmRleF0gPSB0b05hdGl2ZShcbiAgICAgICAgICAgIGVudGl0eUlkLFxuICAgICAgICAgICAgcGF0aCArICcuJyArIHJpZ2h0Tm9kZS5pbmRleCxcbiAgICAgICAgICAgIHJpZ2h0Tm9kZVxuICAgICAgICAgIClcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIFVwZGF0ZWRcbiAgICAgICAgaWYgKGxlZnROb2RlICYmIHJpZ2h0Tm9kZSkge1xuICAgICAgICAgIHBvc2l0aW9uc1tsZWZ0Tm9kZS5pbmRleF0gPSBkaWZmTm9kZShcbiAgICAgICAgICAgIHBhdGggKyAnLicgKyBsZWZ0Tm9kZS5pbmRleCxcbiAgICAgICAgICAgIGVudGl0eUlkLFxuICAgICAgICAgICAgbGVmdE5vZGUsXG4gICAgICAgICAgICByaWdodE5vZGUsXG4gICAgICAgICAgICBjaGlsZE5vZGVzW2xlZnROb2RlLmluZGV4XVxuICAgICAgICAgIClcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cblxuICAgIC8vIFJlcG9zaXRpb24gYWxsIHRoZSBlbGVtZW50c1xuICAgIGZvckVhY2gocG9zaXRpb25zLCBmdW5jdGlvbiAoY2hpbGRFbCwgbmV3UG9zaXRpb24pIHtcbiAgICAgIHZhciB0YXJnZXQgPSBlbC5jaGlsZE5vZGVzW25ld1Bvc2l0aW9uXVxuICAgICAgaWYgKGNoaWxkRWwgIT09IHRhcmdldCkge1xuICAgICAgICBpZiAodGFyZ2V0KSB7XG4gICAgICAgICAgZWwuaW5zZXJ0QmVmb3JlKGNoaWxkRWwsIHRhcmdldClcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBlbC5hcHBlbmRDaGlsZChjaGlsZEVsKVxuICAgICAgICB9XG4gICAgICB9XG4gICAgfSlcbiAgfVxuXG4gIC8qKlxuICAgKiBEaWZmIHRoZSBhdHRyaWJ1dGVzIGFuZCBhZGQvcmVtb3ZlIHRoZW0uXG4gICAqL1xuXG4gIGZ1bmN0aW9uIGRpZmZBdHRyaWJ1dGVzIChwcmV2LCBuZXh0LCBlbCwgZW50aXR5SWQsIHBhdGgpIHtcbiAgICB2YXIgbmV4dEF0dHJzID0gbmV4dC5hdHRyaWJ1dGVzXG4gICAgdmFyIHByZXZBdHRycyA9IHByZXYuYXR0cmlidXRlc1xuXG4gICAgLy8gYWRkIG5ldyBhdHRyc1xuICAgIGZvckVhY2gobmV4dEF0dHJzLCBmdW5jdGlvbiAodmFsdWUsIG5hbWUpIHtcbiAgICAgIGlmIChldmVudHNbbmFtZV0gfHwgIShuYW1lIGluIHByZXZBdHRycykgfHwgcHJldkF0dHJzW25hbWVdICE9PSB2YWx1ZSkge1xuICAgICAgICBzZXRBdHRyaWJ1dGUoZW50aXR5SWQsIHBhdGgsIGVsLCBuYW1lLCB2YWx1ZSlcbiAgICAgIH1cbiAgICB9KVxuXG4gICAgLy8gcmVtb3ZlIG9sZCBhdHRyc1xuICAgIGZvckVhY2gocHJldkF0dHJzLCBmdW5jdGlvbiAodmFsdWUsIG5hbWUpIHtcbiAgICAgIGlmICghKG5hbWUgaW4gbmV4dEF0dHJzKSkge1xuICAgICAgICByZW1vdmVBdHRyaWJ1dGUoZW50aXR5SWQsIHBhdGgsIGVsLCBuYW1lKVxuICAgICAgfVxuICAgIH0pXG4gIH1cblxuICAvKipcbiAgICogVXBkYXRlIGEgY29tcG9uZW50IHdpdGggdGhlIHByb3BzIGZyb20gdGhlIG5leHQgbm9kZS4gSWZcbiAgICogdGhlIGNvbXBvbmVudCB0eXBlIGhhcyBjaGFuZ2VkLCB3ZSdsbCBqdXN0IHJlbW92ZSB0aGUgb2xkIG9uZVxuICAgKiBhbmQgcmVwbGFjZSBpdCB3aXRoIHRoZSBuZXcgY29tcG9uZW50LlxuICAgKi9cblxuICBmdW5jdGlvbiBkaWZmQ29tcG9uZW50IChwYXRoLCBlbnRpdHlJZCwgcHJldiwgbmV4dCwgZWwpIHtcbiAgICBpZiAobmV4dC5jb21wb25lbnQgIT09IHByZXYuY29tcG9uZW50KSB7XG4gICAgICByZXR1cm4gcmVwbGFjZUVsZW1lbnQoZW50aXR5SWQsIHBhdGgsIGVsLCBuZXh0KVxuICAgIH0gZWxzZSB7XG4gICAgICB2YXIgdGFyZ2V0SWQgPSBjaGlsZHJlbltlbnRpdHlJZF1bcGF0aF1cblxuICAgICAgLy8gVGhpcyBpcyBhIGhhY2sgZm9yIG5vd1xuICAgICAgaWYgKHRhcmdldElkKSB7XG4gICAgICAgIHVwZGF0ZUVudGl0eVByb3BzKHRhcmdldElkLCBuZXh0LnByb3BzKVxuICAgICAgfVxuXG4gICAgICByZXR1cm4gZWxcbiAgICB9XG4gIH1cblxuICAvKipcbiAgICogRGlmZiB0d28gZWxlbWVudCBub2Rlcy5cbiAgICovXG5cbiAgZnVuY3Rpb24gZGlmZkVsZW1lbnQgKHBhdGgsIGVudGl0eUlkLCBwcmV2LCBuZXh0LCBlbCkge1xuICAgIGlmIChuZXh0LnRhZ05hbWUgIT09IHByZXYudGFnTmFtZSkgcmV0dXJuIHJlcGxhY2VFbGVtZW50KGVudGl0eUlkLCBwYXRoLCBlbCwgbmV4dClcbiAgICBkaWZmQXR0cmlidXRlcyhwcmV2LCBuZXh0LCBlbCwgZW50aXR5SWQsIHBhdGgpXG4gICAgZGlmZkNoaWxkcmVuKHBhdGgsIGVudGl0eUlkLCBwcmV2LCBuZXh0LCBlbClcbiAgICByZXR1cm4gZWxcbiAgfVxuXG4gIC8qKlxuICAgKiBSZW1vdmVzIGFuIGVsZW1lbnQgZnJvbSB0aGUgRE9NIGFuZCB1bm1vdW50cyBhbmQgY29tcG9uZW50c1xuICAgKiB0aGF0IGFyZSB3aXRoaW4gdGhhdCBicmFuY2hcbiAgICpcbiAgICogc2lkZSBlZmZlY3RzOlxuICAgKiAgIC0gcmVtb3ZlcyBlbGVtZW50IGZyb20gdGhlIERPTVxuICAgKiAgIC0gcmVtb3ZlcyBpbnRlcm5hbCByZWZlcmVuY2VzXG4gICAqXG4gICAqIEBwYXJhbSB7U3RyaW5nfSBlbnRpdHlJZFxuICAgKiBAcGFyYW0ge1N0cmluZ30gcGF0aFxuICAgKiBAcGFyYW0ge0hUTUxFbGVtZW50fSBlbFxuICAgKi9cblxuICBmdW5jdGlvbiByZW1vdmVFbGVtZW50IChlbnRpdHlJZCwgcGF0aCwgZWwpIHtcbiAgICB2YXIgY2hpbGRyZW5CeVBhdGggPSBjaGlsZHJlbltlbnRpdHlJZF1cbiAgICB2YXIgY2hpbGRJZCA9IGNoaWxkcmVuQnlQYXRoW3BhdGhdXG4gICAgdmFyIHJlbW92YWxzID0gW11cblxuICAgIC8vIElmIHRoZSBwYXRoIHBvaW50cyB0byBhIGNvbXBvbmVudCB3ZSBzaG91bGQgdXNlIHRoYXRcbiAgICAvLyBjb21wb25lbnRzIGVsZW1lbnQgaW5zdGVhZCwgYmVjYXVzZSBpdCBtaWdodCBoYXZlIG1vdmVkIGl0LlxuICAgIGlmIChjaGlsZElkKSB7XG4gICAgICB2YXIgY2hpbGQgPSBlbnRpdGllc1tjaGlsZElkXVxuICAgICAgZWwgPSBjaGlsZC5uYXRpdmVFbGVtZW50XG4gICAgICB1bm1vdW50RW50aXR5KGNoaWxkSWQpXG4gICAgICByZW1vdmFscy5wdXNoKHBhdGgpXG4gICAgfSBlbHNlIHtcblxuICAgICAgLy8gSnVzdCByZW1vdmUgdGhlIHRleHQgbm9kZVxuICAgICAgaWYgKCFpc0VsZW1lbnQoZWwpKSByZXR1cm4gZWwucGFyZW50Tm9kZS5yZW1vdmVDaGlsZChlbClcblxuICAgICAgLy8gVGhlbiB3ZSBuZWVkIHRvIGZpbmQgYW55IGNvbXBvbmVudHMgd2l0aGluIHRoaXNcbiAgICAgIC8vIGJyYW5jaCBhbmQgdW5tb3VudCB0aGVtLlxuICAgICAgZm9yRWFjaChjaGlsZHJlbkJ5UGF0aCwgZnVuY3Rpb24gKGNoaWxkSWQsIGNoaWxkUGF0aCkge1xuICAgICAgICBpZiAoY2hpbGRQYXRoID09PSBwYXRoIHx8IGlzV2l0aGluUGF0aChwYXRoLCBjaGlsZFBhdGgpKSB7XG4gICAgICAgICAgdW5tb3VudEVudGl0eShjaGlsZElkKVxuICAgICAgICAgIHJlbW92YWxzLnB1c2goY2hpbGRQYXRoKVxuICAgICAgICB9XG4gICAgICB9KVxuICAgIH1cblxuICAgIC8vIFJlbW92ZSB0aGUgcGF0aHMgZnJvbSB0aGUgb2JqZWN0IHdpdGhvdXQgdG91Y2hpbmcgdGhlXG4gICAgLy8gb2xkIG9iamVjdC4gVGhpcyBrZWVwcyB0aGUgb2JqZWN0IHVzaW5nIGZhc3QgcHJvcGVydGllcy5cbiAgICBmb3JFYWNoKHJlbW92YWxzLCBmdW5jdGlvbiAocGF0aCkge1xuICAgICAgZGVsZXRlIGNoaWxkcmVuW2VudGl0eUlkXVtwYXRoXVxuICAgIH0pXG5cbiAgICAvLyBSZW1vdmUgaXQgZnJvbSB0aGUgRE9NXG4gICAgZWwucGFyZW50Tm9kZS5yZW1vdmVDaGlsZChlbClcblxuICAgIC8vIFJldHVybiBhbGwgb2YgdGhlIGVsZW1lbnRzIGluIHRoaXMgbm9kZSB0cmVlIHRvIHRoZSBwb29sXG4gICAgLy8gc28gdGhhdCB0aGUgZWxlbWVudHMgY2FuIGJlIHJlLXVzZWQuXG4gICAgaWYgKG9wdGlvbnMucG9vbGluZykge1xuICAgICAgd2FsayhlbCwgZnVuY3Rpb24gKG5vZGUpIHtcbiAgICAgICAgaWYgKCFpc0VsZW1lbnQobm9kZSkgfHwgIWNhblBvb2wobm9kZS50YWdOYW1lKSkgcmV0dXJuXG4gICAgICAgIGdldFBvb2wobm9kZS50YWdOYW1lLnRvTG93ZXJDYXNlKCkpLnB1c2gobm9kZSlcbiAgICAgIH0pXG4gICAgfVxuICB9XG5cbiAgLyoqXG4gICAqIFJlcGxhY2UgYW4gZWxlbWVudCBpbiB0aGUgRE9NLiBSZW1vdmluZyBhbGwgY29tcG9uZW50c1xuICAgKiB3aXRoaW4gdGhhdCBlbGVtZW50IGFuZCByZS1yZW5kZXJpbmcgdGhlIG5ldyB2aXJ0dWFsIG5vZGUuXG4gICAqXG4gICAqIEBwYXJhbSB7RW50aXR5fSBlbnRpdHlcbiAgICogQHBhcmFtIHtTdHJpbmd9IHBhdGhcbiAgICogQHBhcmFtIHtIVE1MRWxlbWVudH0gZWxcbiAgICogQHBhcmFtIHtPYmplY3R9IHZub2RlXG4gICAqXG4gICAqIEByZXR1cm4ge3ZvaWR9XG4gICAqL1xuXG4gIGZ1bmN0aW9uIHJlcGxhY2VFbGVtZW50IChlbnRpdHlJZCwgcGF0aCwgZWwsIHZub2RlKSB7XG4gICAgdmFyIHBhcmVudCA9IGVsLnBhcmVudE5vZGVcbiAgICB2YXIgaW5kZXggPSBBcnJheS5wcm90b3R5cGUuaW5kZXhPZi5jYWxsKHBhcmVudC5jaGlsZE5vZGVzLCBlbClcblxuICAgIC8vIHJlbW92ZSB0aGUgcHJldmlvdXMgZWxlbWVudCBhbmQgYWxsIG5lc3RlZCBjb21wb25lbnRzLiBUaGlzXG4gICAgLy8gbmVlZHMgdG8gaGFwcGVuIGJlZm9yZSB3ZSBjcmVhdGUgdGhlIG5ldyBlbGVtZW50IHNvIHdlIGRvbid0XG4gICAgLy8gZ2V0IGNsYXNoZXMgb24gdGhlIGNvbXBvbmVudCBwYXRocy5cbiAgICByZW1vdmVFbGVtZW50KGVudGl0eUlkLCBwYXRoLCBlbClcblxuICAgIC8vIHRoZW4gYWRkIHRoZSBuZXcgZWxlbWVudCBpbiB0aGVyZVxuICAgIHZhciBuZXdFbCA9IHRvTmF0aXZlKGVudGl0eUlkLCBwYXRoLCB2bm9kZSlcbiAgICB2YXIgdGFyZ2V0ID0gcGFyZW50LmNoaWxkTm9kZXNbaW5kZXhdXG5cbiAgICBpZiAodGFyZ2V0KSB7XG4gICAgICBwYXJlbnQuaW5zZXJ0QmVmb3JlKG5ld0VsLCB0YXJnZXQpXG4gICAgfSBlbHNlIHtcbiAgICAgIHBhcmVudC5hcHBlbmRDaGlsZChuZXdFbClcbiAgICB9XG5cbiAgICAvLyB1cGRhdGUgYWxsIGBlbnRpdHkubmF0aXZlRWxlbWVudGAgcmVmZXJlbmNlcy5cbiAgICBmb3JFYWNoKGVudGl0aWVzLCBmdW5jdGlvbiAoZW50aXR5KSB7XG4gICAgICBpZiAoZW50aXR5Lm5hdGl2ZUVsZW1lbnQgPT09IGVsKSB7XG4gICAgICAgIGVudGl0eS5uYXRpdmVFbGVtZW50ID0gbmV3RWxcbiAgICAgIH1cbiAgICB9KVxuXG4gICAgcmV0dXJuIG5ld0VsXG4gIH1cblxuICAvKipcbiAgICogU2V0IHRoZSBhdHRyaWJ1dGUgb2YgYW4gZWxlbWVudCwgcGVyZm9ybWluZyBhZGRpdGlvbmFsIHRyYW5zZm9ybWF0aW9uc1xuICAgKiBkZXBlbmRuaW5nIG9uIHRoZSBhdHRyaWJ1dGUgbmFtZVxuICAgKlxuICAgKiBAcGFyYW0ge0hUTUxFbGVtZW50fSBlbFxuICAgKiBAcGFyYW0ge1N0cmluZ30gbmFtZVxuICAgKiBAcGFyYW0ge1N0cmluZ30gdmFsdWVcbiAgICovXG5cbiAgZnVuY3Rpb24gc2V0QXR0cmlidXRlIChlbnRpdHlJZCwgcGF0aCwgZWwsIG5hbWUsIHZhbHVlKSB7XG4gICAgaWYgKGV2ZW50c1tuYW1lXSkge1xuICAgICAgYWRkRXZlbnQoZW50aXR5SWQsIHBhdGgsIGV2ZW50c1tuYW1lXSwgdmFsdWUpXG4gICAgICByZXR1cm5cbiAgICB9XG4gICAgc3dpdGNoIChuYW1lKSB7XG4gICAgICBjYXNlICd2YWx1ZSc6XG4gICAgICAgIGVsLnZhbHVlID0gdmFsdWVcbiAgICAgICAgYnJlYWtcbiAgICAgIGNhc2UgJ2lubmVySFRNTCc6XG4gICAgICAgIGVsLmlubmVySFRNTCA9IHZhbHVlXG4gICAgICAgIGJyZWFrXG4gICAgICBjYXNlIHN2Zy5pc0F0dHJpYnV0ZShuYW1lKTpcbiAgICAgICAgZWwuc2V0QXR0cmlidXRlTlMoc3ZnLm5hbWVzcGFjZSwgbmFtZSwgdmFsdWUpXG4gICAgICAgIGJyZWFrXG4gICAgICBkZWZhdWx0OlxuICAgICAgICBlbC5zZXRBdHRyaWJ1dGUobmFtZSwgdmFsdWUpXG4gICAgICAgIGJyZWFrXG4gICAgfVxuICB9XG5cbiAgLyoqXG4gICAqIFJlbW92ZSBhbiBhdHRyaWJ1dGUsIHBlcmZvcm1pbmcgYWRkaXRpb25hbCB0cmFuc2Zvcm1hdGlvbnNcbiAgICogZGVwZW5kbmluZyBvbiB0aGUgYXR0cmlidXRlIG5hbWVcbiAgICpcbiAgICogQHBhcmFtIHtIVE1MRWxlbWVudH0gZWxcbiAgICogQHBhcmFtIHtTdHJpbmd9IG5hbWVcbiAgICovXG5cbiAgZnVuY3Rpb24gcmVtb3ZlQXR0cmlidXRlIChlbnRpdHlJZCwgcGF0aCwgZWwsIG5hbWUpIHtcbiAgICBpZiAoZXZlbnRzW25hbWVdKSB7XG4gICAgICByZW1vdmVFdmVudChlbnRpdHlJZCwgcGF0aCwgZXZlbnRzW25hbWVdKVxuICAgICAgcmV0dXJuXG4gICAgfVxuICAgIGVsLnJlbW92ZUF0dHJpYnV0ZShuYW1lKVxuICB9XG5cbiAgLyoqXG4gICAqIENoZWNrcyB0byBzZWUgaWYgb25lIHRyZWUgcGF0aCBpcyB3aXRoaW5cbiAgICogYW5vdGhlciB0cmVlIHBhdGguIEV4YW1wbGU6XG4gICAqXG4gICAqIDAuMSB2cyAwLjEuMSA9IHRydWVcbiAgICogMC4yIHZzIDAuMy41ID0gZmFsc2VcbiAgICpcbiAgICogQHBhcmFtIHtTdHJpbmd9IHRhcmdldFxuICAgKiBAcGFyYW0ge1N0cmluZ30gcGF0aFxuICAgKlxuICAgKiBAcmV0dXJuIHtCb29sZWFufVxuICAgKi9cblxuICBmdW5jdGlvbiBpc1dpdGhpblBhdGggKHRhcmdldCwgcGF0aCkge1xuICAgIHJldHVybiBwYXRoLmluZGV4T2YodGFyZ2V0ICsgJy4nKSA9PT0gMFxuICB9XG5cbiAgLyoqXG4gICAqIElzIHRoZSBET00gbm9kZSBhbiBlbGVtZW50IG5vZGVcbiAgICpcbiAgICogQHBhcmFtIHtIVE1MRWxlbWVudH0gZWxcbiAgICpcbiAgICogQHJldHVybiB7Qm9vbGVhbn1cbiAgICovXG5cbiAgZnVuY3Rpb24gaXNFbGVtZW50IChlbCkge1xuICAgIHJldHVybiAhIWVsLnRhZ05hbWVcbiAgfVxuXG4gIC8qKlxuICAgKiBHZXQgdGhlIHBvb2wgZm9yIGEgdGFnTmFtZSwgY3JlYXRpbmcgaXQgaWYgaXRcbiAgICogZG9lc24ndCBleGlzdC5cbiAgICpcbiAgICogQHBhcmFtIHtTdHJpbmd9IHRhZ05hbWVcbiAgICpcbiAgICogQHJldHVybiB7UG9vbH1cbiAgICovXG5cbiAgZnVuY3Rpb24gZ2V0UG9vbCAodGFnTmFtZSkge1xuICAgIHZhciBwb29sID0gcG9vbHNbdGFnTmFtZV1cbiAgICBpZiAoIXBvb2wpIHtcbiAgICAgIHZhciBwb29sT3B0cyA9IHN2Zy5pc0VsZW1lbnQodGFnTmFtZSkgP1xuICAgICAgICB7IG5hbWVzcGFjZTogc3ZnLm5hbWVzcGFjZSwgdGFnTmFtZTogdGFnTmFtZSB9IDpcbiAgICAgICAgeyB0YWdOYW1lOiB0YWdOYW1lIH1cbiAgICAgIHBvb2wgPSBwb29sc1t0YWdOYW1lXSA9IG5ldyBQb29sKHBvb2xPcHRzKVxuICAgIH1cbiAgICByZXR1cm4gcG9vbFxuICB9XG5cbiAgLyoqXG4gICAqIENsZWFuIHVwIHByZXZpb3VzbHkgdXNlZCBuYXRpdmUgZWxlbWVudCBmb3IgcmV1c2UuXG4gICAqXG4gICAqIEBwYXJhbSB7SFRNTEVsZW1lbnR9IGVsXG4gICAqL1xuXG4gIGZ1bmN0aW9uIGNsZWFudXAgKGVsKSB7XG4gICAgcmVtb3ZlQWxsQ2hpbGRyZW4oZWwpXG4gICAgcmVtb3ZlQWxsQXR0cmlidXRlcyhlbClcbiAgICByZXR1cm4gZWxcbiAgfVxuXG4gIC8qKlxuICAgKiBSZW1vdmUgYWxsIHRoZSBhdHRyaWJ1dGVzIGZyb20gYSBub2RlXG4gICAqXG4gICAqIEBwYXJhbSB7SFRNTEVsZW1lbnR9IGVsXG4gICAqL1xuXG4gIGZ1bmN0aW9uIHJlbW92ZUFsbEF0dHJpYnV0ZXMgKGVsKSB7XG4gICAgZm9yICh2YXIgaSA9IGVsLmF0dHJpYnV0ZXMubGVuZ3RoIC0gMTsgaSA+PSAwOyBpLS0pIHtcbiAgICAgIHZhciBuYW1lID0gZWwuYXR0cmlidXRlc1tpXS5uYW1lXG4gICAgICBlbC5yZW1vdmVBdHRyaWJ1dGUobmFtZSlcbiAgICB9XG4gIH1cblxuICAvKipcbiAgICogUmVtb3ZlIGFsbCB0aGUgY2hpbGQgbm9kZXMgZnJvbSBhbiBlbGVtZW50XG4gICAqXG4gICAqIEBwYXJhbSB7SFRNTEVsZW1lbnR9IGVsXG4gICAqL1xuXG4gIGZ1bmN0aW9uIHJlbW92ZUFsbENoaWxkcmVuIChlbCkge1xuICAgIHdoaWxlIChlbC5maXJzdENoaWxkKSBlbC5yZW1vdmVDaGlsZChlbC5maXJzdENoaWxkKVxuICB9XG5cbiAgLyoqXG4gICAqIFRyaWdnZXIgYSBob29rIG9uIGEgY29tcG9uZW50LlxuICAgKlxuICAgKiBAcGFyYW0ge1N0cmluZ30gbmFtZSBOYW1lIG9mIGhvb2suXG4gICAqIEBwYXJhbSB7RW50aXR5fSBlbnRpdHkgVGhlIGNvbXBvbmVudCBpbnN0YW5jZS5cbiAgICogQHBhcmFtIHtBcnJheX0gYXJncyBUbyBwYXNzIGFsb25nIHRvIGhvb2suXG4gICAqL1xuXG4gIGZ1bmN0aW9uIHRyaWdnZXIgKG5hbWUsIGVudGl0eSwgYXJncykge1xuICAgIGlmICh0eXBlb2YgZW50aXR5LmNvbXBvbmVudFtuYW1lXSAhPT0gJ2Z1bmN0aW9uJykgcmV0dXJuXG4gICAgZW50aXR5LmNvbXBvbmVudFtuYW1lXS5hcHBseShudWxsLCBhcmdzKVxuICB9XG5cbiAgLyoqXG4gICAqIFVwZGF0ZSBhbiBlbnRpdHkgdG8gbWF0Y2ggdGhlIGxhdGVzdCByZW5kZXJlZCB2b2RlLiBXZSBhbHdheXNcbiAgICogcmVwbGFjZSB0aGUgcHJvcHMgb24gdGhlIGNvbXBvbmVudCB3aGVuIGNvbXBvc2luZyB0aGVtLiBUaGlzXG4gICAqIHdpbGwgdHJpZ2dlciBhIHJlLXJlbmRlciBvbiBhbGwgY2hpbGRyZW4gYmVsb3cgdGhpcyBwb2ludC5cbiAgICpcbiAgICogQHBhcmFtIHtFbnRpdHl9IGVudGl0eVxuICAgKiBAcGFyYW0ge1N0cmluZ30gcGF0aFxuICAgKiBAcGFyYW0ge09iamVjdH0gdm5vZGVcbiAgICpcbiAgICogQHJldHVybiB7dm9pZH1cbiAgICovXG5cbiAgZnVuY3Rpb24gdXBkYXRlRW50aXR5UHJvcHMgKGVudGl0eUlkLCBuZXh0UHJvcHMpIHtcbiAgICB2YXIgZW50aXR5ID0gZW50aXRpZXNbZW50aXR5SWRdXG4gICAgZW50aXR5LnBlbmRpbmdQcm9wcyA9IG5leHRQcm9wc1xuICAgIGVudGl0eS5kaXJ0eSA9IHRydWVcbiAgICBpbnZhbGlkYXRlKClcbiAgfVxuXG4gIC8qKlxuICAgKiBVcGRhdGUgY29tcG9uZW50IGluc3RhbmNlIHN0YXRlLlxuICAgKi9cblxuICBmdW5jdGlvbiB1cGRhdGVFbnRpdHlTdGF0ZSAoZW50aXR5LCBuZXh0U3RhdGUpIHtcbiAgICBlbnRpdHkucGVuZGluZ1N0YXRlID0gYXNzaWduKGVudGl0eS5wZW5kaW5nU3RhdGUsIG5leHRTdGF0ZSlcbiAgICBlbnRpdHkuZGlydHkgPSB0cnVlXG4gICAgaW52YWxpZGF0ZSgpXG4gIH1cblxuICAvKipcbiAgICogQ29tbWl0IHByb3BzIGFuZCBzdGF0ZSBjaGFuZ2VzIHRvIGFuIGVudGl0eS5cbiAgICovXG5cbiAgZnVuY3Rpb24gY29tbWl0IChlbnRpdHkpIHtcbiAgICBlbnRpdHkuY29udGV4dC5zdGF0ZSA9IGVudGl0eS5wZW5kaW5nU3RhdGVcbiAgICBlbnRpdHkuY29udGV4dC5wcm9wcyA9IGVudGl0eS5wZW5kaW5nUHJvcHNcbiAgICBlbnRpdHkucGVuZGluZ1N0YXRlID0gYXNzaWduKHt9LCBlbnRpdHkuY29udGV4dC5zdGF0ZSlcbiAgICBlbnRpdHkucGVuZGluZ1Byb3BzID0gYXNzaWduKHt9LCBlbnRpdHkuY29udGV4dC5wcm9wcylcbiAgICB2YWxpZGF0ZVByb3BzKGVudGl0eS5jb250ZXh0LnByb3BzLCBlbnRpdHkucHJvcFR5cGVzKVxuICAgIGVudGl0eS5kaXJ0eSA9IGZhbHNlXG4gIH1cblxuICAvKipcbiAgICogVHJ5IHRvIGF2b2lkIGNyZWF0aW5nIG5ldyB2aXJ0dWFsIGRvbSBpZiBwb3NzaWJsZS5cbiAgICpcbiAgICogTGF0ZXIgd2UgbWF5IGV4cG9zZSB0aGlzIHNvIHlvdSBjYW4gb3ZlcnJpZGUsIGJ1dCBub3QgdGhlcmUgeWV0LlxuICAgKi9cblxuICBmdW5jdGlvbiBzaG91bGRVcGRhdGUgKGVudGl0eSkge1xuICAgIGlmICghZW50aXR5LmRpcnR5KSByZXR1cm4gZmFsc2VcbiAgICBpZiAoIWVudGl0eS5jb21wb25lbnQuc2hvdWxkVXBkYXRlKSByZXR1cm4gdHJ1ZVxuICAgIHZhciBuZXh0UHJvcHMgPSBlbnRpdHkucGVuZGluZ1Byb3BzXG4gICAgdmFyIG5leHRTdGF0ZSA9IGVudGl0eS5wZW5kaW5nU3RhdGVcbiAgICB2YXIgYm9vbCA9IGVudGl0eS5jb21wb25lbnQuc2hvdWxkVXBkYXRlKGVudGl0eS5jb250ZXh0LCBuZXh0UHJvcHMsIG5leHRTdGF0ZSlcbiAgICByZXR1cm4gYm9vbFxuICB9XG5cbiAgLyoqXG4gICAqIFJlZ2lzdGVyIGFuIGVudGl0eS5cbiAgICpcbiAgICogVGhpcyBpcyBtb3N0bHkgdG8gcHJlLXByZXByb2Nlc3MgY29tcG9uZW50IHByb3BlcnRpZXMgYW5kIHZhbHVlcyBjaGFpbnMuXG4gICAqXG4gICAqIFRoZSBlbmQgcmVzdWx0IGlzIGZvciBldmVyeSBjb21wb25lbnQgdGhhdCBnZXRzIG1vdW50ZWQsXG4gICAqIHlvdSBjcmVhdGUgYSBzZXQgb2YgSU8gbm9kZXMgaW4gdGhlIG5ldHdvcmsgZnJvbSB0aGUgYHZhbHVlYCBkZWZpbml0aW9ucy5cbiAgICpcbiAgICogQHBhcmFtIHtDb21wb25lbnR9IGNvbXBvbmVudFxuICAgKi9cblxuICBmdW5jdGlvbiByZWdpc3RlciAoZW50aXR5KSB7XG4gICAgdmFyIGNvbXBvbmVudCA9IGVudGl0eS5jb21wb25lbnRcbiAgICAvLyBhbGwgZW50aXRpZXMgZm9yIHRoaXMgY29tcG9uZW50IHR5cGUuXG4gICAgdmFyIGVudGl0aWVzID0gY29tcG9uZW50LmVudGl0aWVzID0gY29tcG9uZW50LmVudGl0aWVzIHx8IHt9XG4gICAgLy8gYWRkIGVudGl0eSB0byBjb21wb25lbnQgbGlzdFxuICAgIGVudGl0aWVzW2VudGl0eS5pZF0gPSBlbnRpdHlcblxuICAgIC8vIGdldCAnY2xhc3MtbGV2ZWwnIHNvdXJjZXMuXG4gICAgdmFyIHNvdXJjZXMgPSBjb21wb25lbnQuc291cmNlc1xuICAgIGlmIChzb3VyY2VzKSByZXR1cm5cblxuICAgIHZhciBtYXAgPSBjb21wb25lbnQuc291cmNlVG9Qcm9wZXJ0eU5hbWUgPSB7fVxuICAgIGNvbXBvbmVudC5zb3VyY2VzID0gc291cmNlcyA9IFtdXG4gICAgdmFyIHByb3BUeXBlcyA9IGNvbXBvbmVudC5wcm9wVHlwZXNcbiAgICBmb3IgKHZhciBuYW1lIGluIHByb3BUeXBlcykge1xuICAgICAgdmFyIGRhdGEgPSBwcm9wVHlwZXNbbmFtZV1cbiAgICAgIGlmICghZGF0YSkgY29udGludWVcbiAgICAgIGlmICghZGF0YS5zb3VyY2UpIGNvbnRpbnVlXG4gICAgICBzb3VyY2VzLnB1c2goZGF0YS5zb3VyY2UpXG4gICAgICBtYXBbZGF0YS5zb3VyY2VdID0gbmFtZVxuICAgIH1cblxuICAgIC8vIHNlbmQgdmFsdWUgdXBkYXRlcyB0byBhbGwgY29tcG9uZW50IGluc3RhbmNlcy5cbiAgICBzb3VyY2VzLmZvckVhY2goZnVuY3Rpb24gKHNvdXJjZSkge1xuICAgICAgY29ubmVjdGlvbnNbc291cmNlXSA9IHVwZGF0ZVxuXG4gICAgICBmdW5jdGlvbiB1cGRhdGUgKGRhdGEpIHtcbiAgICAgICAgdmFyIHByb3AgPSBtYXBbc291cmNlXVxuICAgICAgICBmb3IgKHZhciBlbnRpdHlJZCBpbiBlbnRpdGllcykge1xuICAgICAgICAgIHZhciBlbnRpdHkgPSBlbnRpdGllc1tlbnRpdHlJZF1cbiAgICAgICAgICB2YXIgY2hhbmdlcyA9IHt9XG4gICAgICAgICAgY2hhbmdlc1twcm9wXSA9IGRhdGFcbiAgICAgICAgICB1cGRhdGVFbnRpdHlQcm9wcyhlbnRpdHlJZCwgYXNzaWduKGVudGl0eS5wZW5kaW5nUHJvcHMsIGNoYW5nZXMpKVxuICAgICAgICB9XG4gICAgICB9XG4gICAgfSlcbiAgfVxuXG4gIC8qKlxuICAgKiBTZXQgdGhlIGluaXRpYWwgc291cmNlIHZhbHVlIG9uIHRoZSBlbnRpdHlcbiAgICpcbiAgICogQHBhcmFtIHtFbnRpdHl9IGVudGl0eVxuICAgKi9cblxuICBmdW5jdGlvbiBzZXREZWZhdWx0cyAoZW50aXR5KSB7XG4gICAgdmFyIGNvbXBvbmVudCA9IGVudGl0eS5jb21wb25lbnRcbiAgICB2YXIgbWFwID0gY29tcG9uZW50LnNvdXJjZVRvUHJvcGVydHlOYW1lXG4gICAgdmFyIHNvdXJjZXMgPSBjb21wb25lbnQuc291cmNlc1xuICAgIHNvdXJjZXMuZm9yRWFjaChmdW5jdGlvbiAoc291cmNlKSB7XG4gICAgICB2YXIgbmFtZSA9IG1hcFtzb3VyY2VdXG4gICAgICBpZiAoZW50aXR5LnBlbmRpbmdQcm9wc1tuYW1lXSAhPSBudWxsKSByZXR1cm5cbiAgICAgIGVudGl0eS5wZW5kaW5nUHJvcHNbbmFtZV0gPSBhcHAuc291cmNlc1tzb3VyY2VdIC8vIGdldCBsYXRlc3QgdmFsdWUgcGx1Z2dlZCBpbnRvIGdsb2JhbCBzdG9yZVxuICAgIH0pXG4gIH1cblxuICAvKipcbiAgICogQWRkIGFsbCBvZiB0aGUgRE9NIGV2ZW50IGxpc3RlbmVyc1xuICAgKi9cblxuICBmdW5jdGlvbiBhZGROYXRpdmVFdmVudExpc3RlbmVycyAoKSB7XG4gICAgZm9yRWFjaChldmVudHMsIGZ1bmN0aW9uIChldmVudFR5cGUpIHtcbiAgICAgIGRvY3VtZW50LmJvZHkuYWRkRXZlbnRMaXN0ZW5lcihldmVudFR5cGUsIGhhbmRsZUV2ZW50LCB0cnVlKVxuICAgIH0pXG4gIH1cblxuICAvKipcbiAgICogQWRkIGFsbCBvZiB0aGUgRE9NIGV2ZW50IGxpc3RlbmVyc1xuICAgKi9cblxuICBmdW5jdGlvbiByZW1vdmVOYXRpdmVFdmVudExpc3RlbmVycyAoKSB7XG4gICAgZm9yRWFjaChldmVudHMsIGZ1bmN0aW9uIChldmVudFR5cGUpIHtcbiAgICAgIGRvY3VtZW50LmJvZHkucmVtb3ZlRXZlbnRMaXN0ZW5lcihldmVudFR5cGUsIGhhbmRsZUV2ZW50LCB0cnVlKVxuICAgIH0pXG4gIH1cblxuICAvKipcbiAgICogSGFuZGxlIGFuIGV2ZW50IHRoYXQgaGFzIG9jY3VyZWQgd2l0aGluIHRoZSBjb250YWluZXJcbiAgICpcbiAgICogQHBhcmFtIHtFdmVudH0gZXZlbnRcbiAgICovXG5cbiAgZnVuY3Rpb24gaGFuZGxlRXZlbnQgKGV2ZW50KSB7XG4gICAgdmFyIHRhcmdldCA9IGV2ZW50LnRhcmdldFxuICAgIHZhciBlbnRpdHlJZCA9IHRhcmdldC5fX2VudGl0eV9fXG4gICAgdmFyIGV2ZW50VHlwZSA9IGV2ZW50LnR5cGVcblxuICAgIC8vIFdhbGsgdXAgdGhlIERPTSB0cmVlIGFuZCBzZWUgaWYgdGhlcmUgaXMgYSBoYW5kbGVyXG4gICAgLy8gZm9yIHRoaXMgZXZlbnQgdHlwZSBoaWdoZXIgdXAuXG4gICAgd2hpbGUgKHRhcmdldCAmJiB0YXJnZXQuX19lbnRpdHlfXyA9PT0gZW50aXR5SWQpIHtcbiAgICAgIHZhciBmbiA9IGtleXBhdGguZ2V0KGhhbmRsZXJzLCBbZW50aXR5SWQsIHRhcmdldC5fX3BhdGhfXywgZXZlbnRUeXBlXSlcbiAgICAgIGlmIChmbikge1xuICAgICAgICBldmVudC5kZWxlZ2F0ZVRhcmdldCA9IHRhcmdldFxuICAgICAgICBmbihldmVudClcbiAgICAgICAgYnJlYWtcbiAgICAgIH1cbiAgICAgIHRhcmdldCA9IHRhcmdldC5wYXJlbnROb2RlXG4gICAgfVxuICB9XG5cbiAgLyoqXG4gICAqIEJpbmQgZXZlbnRzIGZvciBhbiBlbGVtZW50LCBhbmQgYWxsIGl0J3MgcmVuZGVyZWQgY2hpbGQgZWxlbWVudHMuXG4gICAqXG4gICAqIEBwYXJhbSB7U3RyaW5nfSBwYXRoXG4gICAqIEBwYXJhbSB7U3RyaW5nfSBldmVudFxuICAgKiBAcGFyYW0ge0Z1bmN0aW9ufSBmblxuICAgKi9cblxuICBmdW5jdGlvbiBhZGRFdmVudCAoZW50aXR5SWQsIHBhdGgsIGV2ZW50VHlwZSwgZm4pIHtcbiAgICBrZXlwYXRoLnNldChoYW5kbGVycywgW2VudGl0eUlkLCBwYXRoLCBldmVudFR5cGVdLCB0aHJvdHRsZShmdW5jdGlvbiAoZSkge1xuICAgICAgdmFyIGVudGl0eSA9IGVudGl0aWVzW2VudGl0eUlkXVxuICAgICAgaWYgKGVudGl0eSkge1xuICAgICAgICBmbi5jYWxsKG51bGwsIGUsIGVudGl0eS5jb250ZXh0LCBzZXRTdGF0ZShlbnRpdHkpKVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgZm4uY2FsbChudWxsLCBlKVxuICAgICAgfVxuICAgIH0pKVxuICB9XG5cbiAgLyoqXG4gICAqIFVuYmluZCBldmVudHMgZm9yIGEgZW50aXR5SWRcbiAgICpcbiAgICogQHBhcmFtIHtTdHJpbmd9IGVudGl0eUlkXG4gICAqL1xuXG4gIGZ1bmN0aW9uIHJlbW92ZUV2ZW50IChlbnRpdHlJZCwgcGF0aCwgZXZlbnRUeXBlKSB7XG4gICAga2V5cGF0aC5kZWwoaGFuZGxlcnMsIFtlbnRpdHlJZCwgcGF0aCwgZXZlbnRUeXBlXSlcbiAgfVxuXG4gIC8qKlxuICAgKiBVbmJpbmQgYWxsIGV2ZW50cyBmcm9tIGFuIGVudGl0eVxuICAgKlxuICAgKiBAcGFyYW0ge0VudGl0eX0gZW50aXR5XG4gICAqL1xuXG4gIGZ1bmN0aW9uIHJlbW92ZUFsbEV2ZW50cyAoZW50aXR5SWQpIHtcbiAgICBrZXlwYXRoLmRlbChoYW5kbGVycywgW2VudGl0eUlkXSlcbiAgfVxuXG4gIC8qKlxuICAgKiBWYWxpZGF0ZSB0aGUgY3VycmVudCBwcm9wZXJ0aWVzLiBUaGVzZSBzaW1wbGUgdmFsaWRhdGlvbnNcbiAgICogbWFrZSBpdCBlYXNpZXIgdG8gZW5zdXJlIHRoZSBjb3JyZWN0IHByb3BzIGFyZSBwYXNzZWQgaW4uXG4gICAqXG4gICAqIEF2YWlsYWJsZSBydWxlcyBpbmNsdWRlOlxuICAgKlxuICAgKiB0eXBlOiBzdHJpbmcgfCBhcnJheSB8IG9iamVjdCB8IGJvb2xlYW4gfCBudW1iZXIgfCBkYXRlIHwgZnVuY3Rpb25cbiAgICogZXhwZWN0czogW10gQW4gYXJyYXkgb2YgdmFsdWVzIHRoaXMgcHJvcCBjb3VsZCBlcXVhbFxuICAgKiBvcHRpb25hbDogQm9vbGVhblxuICAgKi9cblxuICBmdW5jdGlvbiB2YWxpZGF0ZVByb3BzIChwcm9wcywgcnVsZXMpIHtcbiAgICBpZiAoIW9wdGlvbnMudmFsaWRhdGVQcm9wcykgcmV0dXJuXG5cbiAgICAvLyBUT0RPOiBPbmx5IHZhbGlkYXRlIGluIGRldiBtb2RlXG4gICAgZm9yRWFjaChydWxlcywgZnVuY3Rpb24gKG9wdGlvbnMsIG5hbWUpIHtcbiAgICAgIGlmIChuYW1lID09PSAnY2hpbGRyZW4nKSByZXR1cm5cbiAgICAgIHZhciB2YWx1ZSA9IHByb3BzW25hbWVdXG4gICAgICB2YXIgb3B0aW9uYWwgPSAob3B0aW9ucy5vcHRpb25hbCA9PT0gdHJ1ZSlcbiAgICAgIGlmIChvcHRpb25hbCAmJiB2YWx1ZSA9PSBudWxsKSB7XG4gICAgICAgIHJldHVyblxuICAgICAgfVxuICAgICAgaWYgKCFvcHRpb25hbCAmJiB2YWx1ZSA9PSBudWxsKSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcignTWlzc2luZyBwcm9wIG5hbWVkOiAnICsgbmFtZSlcbiAgICAgIH1cbiAgICAgIGlmIChvcHRpb25zLnR5cGUgJiYgdHlwZSh2YWx1ZSkgIT09IG9wdGlvbnMudHlwZSkge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ0ludmFsaWQgdHlwZSBmb3IgcHJvcCBuYW1lZDogJyArIG5hbWUpXG4gICAgICB9XG4gICAgICBpZiAob3B0aW9ucy5leHBlY3RzICYmIG9wdGlvbnMuZXhwZWN0cy5pbmRleE9mKHZhbHVlKSA8IDApIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdJbnZhbGlkIHZhbHVlIGZvciBwcm9wIG5hbWVkOiAnICsgbmFtZSArICcuIE11c3QgYmUgb25lIG9mICcgKyBvcHRpb25zLmV4cGVjdHMudG9TdHJpbmcoKSlcbiAgICAgIH1cbiAgICB9KVxuXG4gICAgLy8gTm93IGNoZWNrIGZvciBwcm9wcyB0aGF0IGhhdmVuJ3QgYmVlbiBkZWZpbmVkXG4gICAgZm9yRWFjaChwcm9wcywgZnVuY3Rpb24gKHZhbHVlLCBrZXkpIHtcbiAgICAgIGlmIChrZXkgPT09ICdjaGlsZHJlbicpIHJldHVyblxuICAgICAgaWYgKCFydWxlc1trZXldKSB0aHJvdyBuZXcgRXJyb3IoJ1VuZXhwZWN0ZWQgcHJvcCBuYW1lZDogJyArIGtleSlcbiAgICB9KVxuICB9XG5cbiAgLyoqXG4gICAqIFVzZWQgZm9yIGRlYnVnZ2luZyB0byBpbnNwZWN0IHRoZSBjdXJyZW50IHN0YXRlIHdpdGhvdXRcbiAgICogdXMgbmVlZGluZyB0byBleHBsaWNpdGx5IG1hbmFnZSBzdG9yaW5nL3VwZGF0aW5nIHJlZmVyZW5jZXMuXG4gICAqXG4gICAqIEByZXR1cm4ge09iamVjdH1cbiAgICovXG5cbiAgZnVuY3Rpb24gaW5zcGVjdCAoKSB7XG4gICAgcmV0dXJuIHtcbiAgICAgIGVudGl0aWVzOiBlbnRpdGllcyxcbiAgICAgIHBvb2xzOiBwb29scyxcbiAgICAgIGhhbmRsZXJzOiBoYW5kbGVycyxcbiAgICAgIGNvbm5lY3Rpb25zOiBjb25uZWN0aW9ucyxcbiAgICAgIGN1cnJlbnRFbGVtZW50OiBjdXJyZW50RWxlbWVudCxcbiAgICAgIG9wdGlvbnM6IG9wdGlvbnMsXG4gICAgICBhcHA6IGFwcCxcbiAgICAgIGNvbnRhaW5lcjogY29udGFpbmVyLFxuICAgICAgY2hpbGRyZW46IGNoaWxkcmVuXG4gICAgfVxuICB9XG5cbiAgLyoqXG4gICAqIFJldHVybiBhbiBvYmplY3QgdGhhdCBsZXRzIHVzIGNvbXBsZXRlbHkgcmVtb3ZlIHRoZSBhdXRvbWF0aWNcbiAgICogRE9NIHJlbmRlcmluZyBhbmQgZXhwb3J0IGRlYnVnZ2luZyB0b29scy5cbiAgICovXG5cbiAgcmV0dXJuIHtcbiAgICByZW1vdmU6IHRlYXJkb3duLFxuICAgIGluc3BlY3Q6IGluc3BlY3RcbiAgfVxufVxuXG4vKipcbiAqIEEgcmVuZGVyZWQgY29tcG9uZW50IGluc3RhbmNlLlxuICpcbiAqIFRoaXMgbWFuYWdlcyB0aGUgbGlmZWN5Y2xlLCBwcm9wcyBhbmQgc3RhdGUgb2YgdGhlIGNvbXBvbmVudC5cbiAqIEl0J3MgYmFzaWNhbGx5IGp1c3QgYSBkYXRhIG9iamVjdCBmb3IgbW9yZSBzdHJhaWdodGZvd2FyZCBsb29rdXAuXG4gKlxuICogQHBhcmFtIHtDb21wb25lbnR9IGNvbXBvbmVudFxuICogQHBhcmFtIHtPYmplY3R9IHByb3BzXG4gKi9cblxuZnVuY3Rpb24gRW50aXR5IChjb21wb25lbnQsIHByb3BzKSB7XG4gIHRoaXMuaWQgPSB1aWQoKVxuICB0aGlzLmNvbXBvbmVudCA9IGNvbXBvbmVudFxuICB0aGlzLnByb3BUeXBlcyA9IGNvbXBvbmVudC5wcm9wVHlwZXMgfHwge31cbiAgdGhpcy5jb250ZXh0ID0ge31cbiAgdGhpcy5jb250ZXh0LmlkID0gdGhpcy5pZDtcbiAgdGhpcy5jb250ZXh0LnByb3BzID0gZGVmYXVsdHMocHJvcHMgfHwge30sIGNvbXBvbmVudC5kZWZhdWx0UHJvcHMgfHwge30pXG4gIHRoaXMuY29udGV4dC5zdGF0ZSA9IHRoaXMuY29tcG9uZW50LmluaXRpYWxTdGF0ZSA/IHRoaXMuY29tcG9uZW50LmluaXRpYWxTdGF0ZSgpIDoge31cbiAgdGhpcy5wZW5kaW5nUHJvcHMgPSBhc3NpZ24oe30sIHRoaXMuY29udGV4dC5wcm9wcylcbiAgdGhpcy5wZW5kaW5nU3RhdGUgPSBhc3NpZ24oe30sIHRoaXMuY29udGV4dC5zdGF0ZSlcbiAgdGhpcy5kaXJ0eSA9IGZhbHNlXG4gIHRoaXMudmlydHVhbEVsZW1lbnQgPSBudWxsXG4gIHRoaXMubmF0aXZlRWxlbWVudCA9IG51bGxcbiAgdGhpcy5kaXNwbGF5TmFtZSA9IGNvbXBvbmVudC5uYW1lIHx8ICdDb21wb25lbnQnXG59XG5cbi8qKlxuICogU2hvdWxkIHdlIHBvb2wgYW4gZWxlbWVudD9cbiAqL1xuXG5mdW5jdGlvbiBjYW5Qb29sKHRhZ05hbWUpIHtcbiAgcmV0dXJuIGF2b2lkUG9vbGluZy5pbmRleE9mKHRhZ05hbWUpIDwgMFxufVxuXG4vKipcbiAqIEdldCBhIG5lc3RlZCBub2RlIHVzaW5nIGEgcGF0aFxuICpcbiAqIEBwYXJhbSB7SFRNTEVsZW1lbnR9IGVsICAgVGhlIHJvb3Qgbm9kZSAnMCdcbiAqIEBwYXJhbSB7U3RyaW5nfSBwYXRoIFRoZSBwYXRoIHN0cmluZyBlZy4gJzAuMi40MydcbiAqL1xuXG5mdW5jdGlvbiBnZXROb2RlQXRQYXRoKGVsLCBwYXRoKSB7XG4gIHZhciBwYXJ0cyA9IHBhdGguc3BsaXQoJy4nKVxuICBwYXJ0cy5zaGlmdCgpXG4gIHdoaWxlIChwYXJ0cy5sZW5ndGgpIHtcbiAgICBlbCA9IGVsLmNoaWxkTm9kZXNbcGFydHMucG9wKCldXG4gIH1cbiAgcmV0dXJuIGVsXG59IiwidmFyIHV0aWxzID0gcmVxdWlyZSgnLi91dGlscycpXG52YXIgZGVmYXVsdHMgPSB1dGlscy5kZWZhdWx0c1xuXG4vKipcbiAqIEV4cG9zZSBgc3RyaW5naWZ5YC5cbiAqL1xuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIChhcHApIHtcbiAgaWYgKCFhcHAuZWxlbWVudCkge1xuICAgIHRocm93IG5ldyBFcnJvcignTm8gZWxlbWVudCBtb3VudGVkJylcbiAgfVxuXG4gIC8qKlxuICAgKiBSZW5kZXIgdG8gc3RyaW5nLlxuICAgKlxuICAgKiBAcGFyYW0ge0NvbXBvbmVudH0gY29tcG9uZW50XG4gICAqIEBwYXJhbSB7T2JqZWN0fSBbcHJvcHNdXG4gICAqIEByZXR1cm4ge1N0cmluZ31cbiAgICovXG5cbiAgZnVuY3Rpb24gc3RyaW5naWZ5IChjb21wb25lbnQsIG9wdFByb3BzKSB7XG4gICAgdmFyIHByb3BUeXBlcyA9IGNvbXBvbmVudC5wcm9wVHlwZXMgfHwge31cbiAgICB2YXIgc3RhdGUgPSBjb21wb25lbnQuaW5pdGlhbFN0YXRlID8gY29tcG9uZW50LmluaXRpYWxTdGF0ZSgpIDoge31cbiAgICB2YXIgcHJvcHMgPSBkZWZhdWx0cyhvcHRQcm9wcywgY29tcG9uZW50LmRlZmF1bHRQcm9wcyB8fCB7fSlcblxuICAgIGZvciAodmFyIG5hbWUgaW4gcHJvcFR5cGVzKSB7XG4gICAgICB2YXIgb3B0aW9ucyA9IHByb3BUeXBlc1tuYW1lXVxuICAgICAgaWYgKG9wdGlvbnMuc291cmNlKSB7XG4gICAgICAgIHByb3BzW25hbWVdID0gYXBwLnNvdXJjZXNbb3B0aW9ucy5zb3VyY2VdXG4gICAgICB9XG4gICAgfVxuXG4gICAgaWYgKGNvbXBvbmVudC5iZWZvcmVNb3VudCkgY29tcG9uZW50LmJlZm9yZU1vdW50KHsgcHJvcHM6IHByb3BzLCBzdGF0ZTogc3RhdGUgfSlcbiAgICBpZiAoY29tcG9uZW50LmJlZm9yZVJlbmRlcikgY29tcG9uZW50LmJlZm9yZVJlbmRlcih7IHByb3BzOiBwcm9wcywgc3RhdGU6IHN0YXRlIH0pXG4gICAgdmFyIG5vZGUgPSBjb21wb25lbnQucmVuZGVyKHsgcHJvcHM6IHByb3BzLCBzdGF0ZTogc3RhdGUgfSlcbiAgICByZXR1cm4gc3RyaW5naWZ5Tm9kZShub2RlLCAnMCcpXG4gIH1cblxuICAvKipcbiAgICogUmVuZGVyIGEgbm9kZSB0byBhIHN0cmluZ1xuICAgKlxuICAgKiBAcGFyYW0ge05vZGV9IG5vZGVcbiAgICogQHBhcmFtIHtUcmVlfSB0cmVlXG4gICAqXG4gICAqIEByZXR1cm4ge1N0cmluZ31cbiAgICovXG5cbiAgZnVuY3Rpb24gc3RyaW5naWZ5Tm9kZSAobm9kZSwgcGF0aCkge1xuICAgIHN3aXRjaCAobm9kZS50eXBlKSB7XG4gICAgICBjYXNlICd0ZXh0JzogcmV0dXJuIG5vZGUuZGF0YVxuICAgICAgY2FzZSAnZWxlbWVudCc6XG4gICAgICAgIHZhciBjaGlsZHJlbiA9IG5vZGUuY2hpbGRyZW5cbiAgICAgICAgdmFyIGF0dHJpYnV0ZXMgPSBub2RlLmF0dHJpYnV0ZXNcbiAgICAgICAgdmFyIHRhZ05hbWUgPSBub2RlLnRhZ05hbWVcbiAgICAgICAgdmFyIGlubmVySFRNTCA9IGF0dHJpYnV0ZXMuaW5uZXJIVE1MXG4gICAgICAgIHZhciBzdHIgPSAnPCcgKyB0YWdOYW1lICsgYXR0cnMoYXR0cmlidXRlcykgKyAnPidcblxuICAgICAgICBpZiAoaW5uZXJIVE1MKSB7XG4gICAgICAgICAgc3RyICs9IGlubmVySFRNTFxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIGZvciAodmFyIGkgPSAwLCBuID0gY2hpbGRyZW4ubGVuZ3RoOyBpIDwgbjsgaSsrKSB7XG4gICAgICAgICAgICBzdHIgKz0gc3RyaW5naWZ5Tm9kZShjaGlsZHJlbltpXSwgcGF0aCArICcuJyArIGkpXG4gICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgc3RyICs9ICc8LycgKyB0YWdOYW1lICsgJz4nXG4gICAgICAgIHJldHVybiBzdHJcbiAgICAgIGNhc2UgJ2NvbXBvbmVudCc6IHJldHVybiBzdHJpbmdpZnkobm9kZS5jb21wb25lbnQsIG5vZGUucHJvcHMpXG4gICAgfVxuXG4gICAgdGhyb3cgbmV3IEVycm9yKCdJbnZhbGlkIHR5cGUnKVxuICB9XG5cbiAgcmV0dXJuIHN0cmluZ2lmeU5vZGUoYXBwLmVsZW1lbnQsICcwJylcbn1cblxuLyoqXG4gKiBIVE1MIGF0dHJpYnV0ZXMgdG8gc3RyaW5nLlxuICpcbiAqIEBwYXJhbSB7T2JqZWN0fSBhdHRyaWJ1dGVzXG4gKiBAcmV0dXJuIHtTdHJpbmd9XG4gKiBAYXBpIHByaXZhdGVcbiAqL1xuXG5mdW5jdGlvbiBhdHRycyAoYXR0cmlidXRlcykge1xuICB2YXIgc3RyID0gJydcbiAgZm9yICh2YXIga2V5IGluIGF0dHJpYnV0ZXMpIHtcbiAgICBpZiAoa2V5ID09PSAnaW5uZXJIVE1MJykgY29udGludWVcbiAgICBzdHIgKz0gYXR0cihrZXksIGF0dHJpYnV0ZXNba2V5XSlcbiAgfVxuICByZXR1cm4gc3RyXG59XG5cbi8qKlxuICogSFRNTCBhdHRyaWJ1dGUgdG8gc3RyaW5nLlxuICpcbiAqIEBwYXJhbSB7U3RyaW5nfSBrZXlcbiAqIEBwYXJhbSB7U3RyaW5nfSB2YWxcbiAqIEByZXR1cm4ge1N0cmluZ31cbiAqIEBhcGkgcHJpdmF0ZVxuICovXG5cbmZ1bmN0aW9uIGF0dHIgKGtleSwgdmFsKSB7XG4gIHJldHVybiAnICcgKyBrZXkgKyAnPVwiJyArIHZhbCArICdcIidcbn1cbiIsInZhciBmYXN0ID0gcmVxdWlyZSgnZmFzdC5qcycpXG52YXIgaW5kZXhPZiA9IGZhc3QuaW5kZXhPZlxuXG4vKipcbiAqIFRoaXMgZmlsZSBsaXN0cyB0aGUgc3VwcG9ydGVkIFNWRyBlbGVtZW50cyB1c2VkIGJ5IHRoZVxuICogcmVuZGVyZXIuIFdlIG1heSBhZGQgYmV0dGVyIFNWRyBzdXBwb3J0IGluIHRoZSBmdXR1cmVcbiAqIHRoYXQgZG9lc24ndCByZXF1aXJlIHdoaXRlbGlzdGluZyBlbGVtZW50cy5cbiAqL1xuXG5leHBvcnRzLm5hbWVzcGFjZSAgPSAnaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmcnXG5cbi8qKlxuICogU3VwcG9ydGVkIFNWRyBlbGVtZW50c1xuICpcbiAqIEB0eXBlIHtBcnJheX1cbiAqL1xuXG5leHBvcnRzLmVsZW1lbnRzID0gW1xuICAnY2lyY2xlJyxcbiAgJ2RlZnMnLFxuICAnZWxsaXBzZScsXG4gICdnJyxcbiAgJ2xpbmUnLFxuICAnbGluZWFyR3JhZGllbnQnLFxuICAnbWFzaycsXG4gICdwYXRoJyxcbiAgJ3BhdHRlcm4nLFxuICAncG9seWdvbicsXG4gICdwb2x5bGluZScsXG4gICdyYWRpYWxHcmFkaWVudCcsXG4gICdyZWN0JyxcbiAgJ3N0b3AnLFxuICAnc3ZnJyxcbiAgJ3RleHQnLFxuICAndHNwYW4nXG5dXG5cbi8qKlxuICogU3VwcG9ydGVkIFNWRyBhdHRyaWJ1dGVzXG4gKi9cblxuZXhwb3J0cy5hdHRyaWJ1dGVzID0gW1xuICAnY3gnLFxuICAnY3knLFxuICAnZCcsXG4gICdkeCcsXG4gICdkeScsXG4gICdmaWxsJyxcbiAgJ2ZpbGxPcGFjaXR5JyxcbiAgJ2ZvbnRGYW1pbHknLFxuICAnZm9udFNpemUnLFxuICAnZngnLFxuICAnZnknLFxuICAnZ3JhZGllbnRUcmFuc2Zvcm0nLFxuICAnZ3JhZGllbnRVbml0cycsXG4gICdtYXJrZXJFbmQnLFxuICAnbWFya2VyTWlkJyxcbiAgJ21hcmtlclN0YXJ0JyxcbiAgJ29mZnNldCcsXG4gICdvcGFjaXR5JyxcbiAgJ3BhdHRlcm5Db250ZW50VW5pdHMnLFxuICAncGF0dGVyblVuaXRzJyxcbiAgJ3BvaW50cycsXG4gICdwcmVzZXJ2ZUFzcGVjdFJhdGlvJyxcbiAgJ3InLFxuICAncngnLFxuICAncnknLFxuICAnc3ByZWFkTWV0aG9kJyxcbiAgJ3N0b3BDb2xvcicsXG4gICdzdG9wT3BhY2l0eScsXG4gICdzdHJva2UnLFxuICAnc3Ryb2tlRGFzaGFycmF5JyxcbiAgJ3N0cm9rZUxpbmVjYXAnLFxuICAnc3Ryb2tlT3BhY2l0eScsXG4gICdzdHJva2VXaWR0aCcsXG4gICd0ZXh0QW5jaG9yJyxcbiAgJ3RyYW5zZm9ybScsXG4gICd2ZXJzaW9uJyxcbiAgJ3ZpZXdCb3gnLFxuICAneDEnLFxuICAneDInLFxuICAneCcsXG4gICd5MScsXG4gICd5MicsXG4gICd5J1xuXVxuXG4vKipcbiAqIElzIGVsZW1lbnQncyBuYW1lc3BhY2UgU1ZHP1xuICpcbiAqIEBwYXJhbSB7U3RyaW5nfSBuYW1lXG4gKi9cblxuZXhwb3J0cy5pc0VsZW1lbnQgPSBmdW5jdGlvbiAobmFtZSkge1xuICByZXR1cm4gaW5kZXhPZihleHBvcnRzLmVsZW1lbnRzLCBuYW1lKSAhPT0gLTFcbn1cblxuLyoqXG4gKiBBcmUgZWxlbWVudCdzIGF0dHJpYnV0ZXMgU1ZHP1xuICpcbiAqIEBwYXJhbSB7U3RyaW5nfSBhdHRyXG4gKi9cblxuZXhwb3J0cy5pc0F0dHJpYnV0ZSA9IGZ1bmN0aW9uIChhdHRyKSB7XG4gIHJldHVybiBpbmRleE9mKGV4cG9ydHMuYXR0cmlidXRlcywgYXR0cikgIT09IC0xXG59XG5cbiIsIi8qKlxuICogVGhlIG5wbSAnZGVmYXVsdHMnIG1vZHVsZSBidXQgd2l0aG91dCBjbG9uZSBiZWNhdXNlXG4gKiBpdCB3YXMgcmVxdWlyaW5nIHRoZSAnQnVmZmVyJyBtb2R1bGUgd2hpY2ggaXMgaHVnZS5cbiAqXG4gKiBAcGFyYW0ge09iamVjdH0gb3B0aW9uc1xuICogQHBhcmFtIHtPYmplY3R9IGRlZmF1bHRzXG4gKlxuICogQHJldHVybiB7T2JqZWN0fVxuICovXG5cbmV4cG9ydHMuZGVmYXVsdHMgPSBmdW5jdGlvbihvcHRpb25zLCBkZWZhdWx0cykge1xuICBPYmplY3Qua2V5cyhkZWZhdWx0cykuZm9yRWFjaChmdW5jdGlvbihrZXkpIHtcbiAgICBpZiAodHlwZW9mIG9wdGlvbnNba2V5XSA9PT0gJ3VuZGVmaW5lZCcpIHtcbiAgICAgIG9wdGlvbnNba2V5XSA9IGRlZmF1bHRzW2tleV1cbiAgICB9XG4gIH0pXG4gIHJldHVybiBvcHRpb25zXG59XG4iLCIvKipcbiAqIE1vZHVsZSBkZXBlbmRlbmNpZXMuXG4gKi9cblxudmFyIHR5cGUgPSByZXF1aXJlKCdjb21wb25lbnQtdHlwZScpXG52YXIgc2xpY2UgPSByZXF1aXJlKCdzbGljZWQnKVxudmFyIGZsYXR0ZW4gPSByZXF1aXJlKCdhcnJheS1mbGF0dGVuJylcblxuLyoqXG4gKiBUaGlzIGZ1bmN0aW9uIGxldHMgdXMgY3JlYXRlIHZpcnR1YWwgbm9kZXMgdXNpbmcgYSBzaW1wbGVcbiAqIHN5bnRheC4gSXQgaXMgY29tcGF0aWJsZSB3aXRoIEpTWCB0cmFuc2Zvcm1zIHNvIHlvdSBjYW4gdXNlXG4gKiBKU1ggdG8gd3JpdGUgbm9kZXMgdGhhdCB3aWxsIGNvbXBpbGUgdG8gdGhpcyBmdW5jdGlvbi5cbiAqXG4gKiBsZXQgbm9kZSA9IHZpcnR1YWwoJ2RpdicsIHsgaWQ6ICdmb28nIH0sIFtcbiAqICAgdmlydHVhbCgnYScsIHsgaHJlZjogJ2h0dHA6Ly9nb29nbGUuY29tJyB9LCAnR29vZ2xlJylcbiAqIF0pXG4gKlxuICogWW91IGNhbiBsZWF2ZSBvdXQgdGhlIGF0dHJpYnV0ZXMgb3IgdGhlIGNoaWxkcmVuIGlmIGVpdGhlclxuICogb2YgdGhlbSBhcmVuJ3QgbmVlZGVkIGFuZCBpdCB3aWxsIGZpZ3VyZSBvdXQgd2hhdCB5b3UncmVcbiAqIHRyeWluZyB0byBkby5cbiAqL1xuXG5tb2R1bGUuZXhwb3J0cyA9IHZpcnR1YWxcblxuLyoqXG4gKiBDcmVhdGUgdmlydHVhbCBET00gdHJlZXMuXG4gKlxuICogVGhpcyBjcmVhdGVzIHRoZSBuaWNlciBBUEkgZm9yIHRoZSB1c2VyLlxuICogSXQgdHJhbnNsYXRlcyB0aGF0IGZyaWVuZGx5IEFQSSBpbnRvIGFuIGFjdHVhbCB0cmVlIG9mIG5vZGVzLlxuICpcbiAqIEBwYXJhbSB7U3RyaW5nfEZ1bmN0aW9ufSB0eXBlXG4gKiBAcGFyYW0ge09iamVjdH0gcHJvcHNcbiAqIEBwYXJhbSB7QXJyYXl9IGNoaWxkcmVuXG4gKiBAcmV0dXJuIHtOb2RlfVxuICogQGFwaSBwdWJsaWNcbiAqL1xuXG5mdW5jdGlvbiB2aXJ0dWFsICh0eXBlLCBwcm9wcywgY2hpbGRyZW4pIHtcbiAgLy8gRGVmYXVsdCB0byBkaXYgd2l0aCBubyBhcmdzXG4gIGlmICghdHlwZSkge1xuICAgIHRocm93IG5ldyBFcnJvcignRWxlbWVudCBuZWVkcyBhIHR5cGUuIGh0dHBzOi8vZ2lzdC5naXRodWIuY29tL2FudGhvbnlzaG9ydC83N2NlZDQzYjVkZWZlMzk5MDhhZicpXG4gIH1cblxuICAvLyBTa2lwcGVkIGFkZGluZyBhdHRyaWJ1dGVzIGFuZCB3ZSdyZSBwYXNzaW5nXG4gIC8vIGluIGNoaWxkcmVuIGluc3RlYWQuXG4gIGlmIChhcmd1bWVudHMubGVuZ3RoID09PSAyICYmICh0eXBlb2YgcHJvcHMgPT09ICdzdHJpbmcnIHx8IEFycmF5LmlzQXJyYXkocHJvcHMpKSkge1xuICAgIGNoaWxkcmVuID0gcHJvcHNcbiAgICBwcm9wcyA9IHt9XG4gIH1cblxuICAvLyBBY2NvdW50IGZvciBKU1ggcHV0dGluZyB0aGUgY2hpbGRyZW4gYXMgbXVsdGlwbGUgYXJndW1lbnRzLlxuICAvLyBUaGlzIGlzIGVzc2VudGlhbGx5IGp1c3QgdGhlIEVTNiByZXN0IHBhcmFtXG4gIGlmIChhcmd1bWVudHMubGVuZ3RoID4gMiAmJiBBcnJheS5pc0FycmF5KGFyZ3VtZW50c1syXSkgPT09IGZhbHNlKSB7XG4gICAgY2hpbGRyZW4gPSBzbGljZShhcmd1bWVudHMsIDIpXG4gIH1cblxuICBjaGlsZHJlbiA9IGNoaWxkcmVuIHx8IFtdXG4gIHByb3BzID0gcHJvcHMgfHwge31cblxuICAvLyBwYXNzaW5nIGluIGEgc2luZ2xlIGNoaWxkLCB5b3UgY2FuIHNraXBcbiAgLy8gdXNpbmcgdGhlIGFycmF5XG4gIGlmICghQXJyYXkuaXNBcnJheShjaGlsZHJlbikpIHtcbiAgICBjaGlsZHJlbiA9IFsgY2hpbGRyZW4gXVxuICB9XG5cbiAgY2hpbGRyZW4gPSBmbGF0dGVuKGNoaWxkcmVuLCAxKS5yZWR1Y2Uobm9ybWFsaXplLCBbXSlcblxuICAvLyBwdWxsIHRoZSBrZXkgb3V0IGZyb20gdGhlIGRhdGEuXG4gIHZhciBrZXkgPSAna2V5JyBpbiBwcm9wcyA/IFN0cmluZyhwcm9wcy5rZXkpIDogbnVsbFxuICBkZWxldGUgcHJvcHNbJ2tleSddXG5cbiAgLy8gaWYgeW91IHBhc3MgaW4gYSBmdW5jdGlvbiwgaXQncyBhIGBDb21wb25lbnRgIGNvbnN0cnVjdG9yLlxuICAvLyBvdGhlcndpc2UgaXQncyBhbiBlbGVtZW50LlxuICB2YXIgbm9kZVxuICBpZiAodHlwZW9mIHR5cGUgPT09ICdzdHJpbmcnKSB7XG4gICAgbm9kZSA9IG5ldyBFbGVtZW50Tm9kZSh0eXBlLCBwcm9wcywga2V5LCBjaGlsZHJlbilcbiAgfSBlbHNlIHtcbiAgICBub2RlID0gbmV3IENvbXBvbmVudE5vZGUodHlwZSwgcHJvcHMsIGtleSwgY2hpbGRyZW4pXG4gIH1cblxuICAvLyBzZXQgdGhlIHVuaXF1ZSBJRFxuICBub2RlLmluZGV4ID0gMFxuXG4gIHJldHVybiBub2RlXG59XG5cbi8qKlxuICogUGFyc2Ugbm9kZXMgaW50byByZWFsIGBOb2RlYCBvYmplY3RzLlxuICpcbiAqIEBwYXJhbSB7TWl4ZWR9IG5vZGVcbiAqIEBwYXJhbSB7SW50ZWdlcn0gaW5kZXhcbiAqIEByZXR1cm4ge05vZGV9XG4gKiBAYXBpIHByaXZhdGVcbiAqL1xuXG5mdW5jdGlvbiBub3JtYWxpemUgKGFjYywgbm9kZSkge1xuICBpZiAobm9kZSA9PSBudWxsKSB7XG4gICAgcmV0dXJuIGFjY1xuICB9XG4gIGlmICh0eXBlb2Ygbm9kZSA9PT0gJ3N0cmluZycgfHwgdHlwZW9mIG5vZGUgPT09ICdudW1iZXInKSB7XG4gICAgdmFyIG5ld05vZGUgPSBuZXcgVGV4dE5vZGUoU3RyaW5nKG5vZGUpKVxuICAgIG5ld05vZGUuaW5kZXggPSBhY2MubGVuZ3RoXG4gICAgYWNjLnB1c2gobmV3Tm9kZSlcbiAgfSBlbHNlIHtcbiAgICBub2RlLmluZGV4ID0gYWNjLmxlbmd0aFxuICAgIGFjYy5wdXNoKG5vZGUpXG4gIH1cbiAgcmV0dXJuIGFjY1xufVxuXG4vKipcbiAqIEluaXRpYWxpemUgYSBuZXcgYENvbXBvbmVudE5vZGVgLlxuICpcbiAqIEBwYXJhbSB7Q29tcG9uZW50fSBjb21wb25lbnRcbiAqIEBwYXJhbSB7T2JqZWN0fSBwcm9wc1xuICogQHBhcmFtIHtTdHJpbmd9IGtleSBVc2VkIGZvciBzb3J0aW5nL3JlcGxhY2luZyBkdXJpbmcgZGlmZmluZy5cbiAqIEBwYXJhbSB7QXJyYXl9IGNoaWxkcmVuIENoaWxkIHZpcnR1YWwgbm9kZXNcbiAqIEBhcGkgcHVibGljXG4gKi9cblxuZnVuY3Rpb24gQ29tcG9uZW50Tm9kZSAoY29tcG9uZW50LCBwcm9wcywga2V5LCBjaGlsZHJlbikge1xuICB0aGlzLmtleSA9IGtleVxuICB0aGlzLnByb3BzID0gcHJvcHNcbiAgdGhpcy50eXBlID0gJ2NvbXBvbmVudCdcbiAgdGhpcy5jb21wb25lbnQgPSBjb21wb25lbnRcbiAgdGhpcy5wcm9wcy5jaGlsZHJlbiA9IGNoaWxkcmVuIHx8IFtdXG59XG5cbi8qKlxuICogSW5pdGlhbGl6ZSBhIG5ldyBgRWxlbWVudE5vZGVgLlxuICpcbiAqIEBwYXJhbSB7U3RyaW5nfSB0YWdOYW1lXG4gKiBAcGFyYW0ge09iamVjdH0gYXR0cmlidXRlc1xuICogQHBhcmFtIHtTdHJpbmd9IGtleSBVc2VkIGZvciBzb3J0aW5nL3JlcGxhY2luZyBkdXJpbmcgZGlmZmluZy5cbiAqIEBwYXJhbSB7QXJyYXl9IGNoaWxkcmVuIENoaWxkIHZpcnR1YWwgZG9tIG5vZGVzLlxuICogQGFwaSBwdWJsaWNcbiAqL1xuXG5mdW5jdGlvbiBFbGVtZW50Tm9kZSAodGFnTmFtZSwgYXR0cmlidXRlcywga2V5LCBjaGlsZHJlbikge1xuICB0aGlzLnR5cGUgPSAnZWxlbWVudCdcbiAgdGhpcy5hdHRyaWJ1dGVzID0gcGFyc2VBdHRyaWJ1dGVzKGF0dHJpYnV0ZXMpXG4gIHRoaXMudGFnTmFtZSA9IHRhZ05hbWVcbiAgdGhpcy5jaGlsZHJlbiA9IGNoaWxkcmVuIHx8IFtdXG4gIHRoaXMua2V5ID0ga2V5XG59XG5cbi8qKlxuICogSW5pdGlhbGl6ZSBhIG5ldyBgVGV4dE5vZGVgLlxuICpcbiAqIFRoaXMgaXMganVzdCBhIHZpcnR1YWwgSFRNTCB0ZXh0IG9iamVjdC5cbiAqXG4gKiBAcGFyYW0ge1N0cmluZ30gdGV4dFxuICogQGFwaSBwdWJsaWNcbiAqL1xuXG5mdW5jdGlvbiBUZXh0Tm9kZSAodGV4dCkge1xuICB0aGlzLnR5cGUgPSAndGV4dCdcbiAgdGhpcy5kYXRhID0gU3RyaW5nKHRleHQpXG59XG5cbi8qKlxuICogUGFyc2UgYXR0cmlidXRlcyBmb3Igc29tZSBzcGVjaWFsIGNhc2VzLlxuICpcbiAqIFRPRE86IFRoaXMgY291bGQgYmUgbW9yZSBmdW5jdGlvbmFsIGFuZCBhbGxvdyBob29rc1xuICogaW50byB0aGUgcHJvY2Vzc2luZyBvZiB0aGUgYXR0cmlidXRlcyBhdCBhIGNvbXBvbmVudC1sZXZlbFxuICpcbiAqIEBwYXJhbSB7T2JqZWN0fSBhdHRyaWJ1dGVzXG4gKlxuICogQHJldHVybiB7T2JqZWN0fVxuICovXG5cbmZ1bmN0aW9uIHBhcnNlQXR0cmlidXRlcyAoYXR0cmlidXRlcykge1xuICAvLyBzdHlsZTogeyAndGV4dC1hbGlnbic6ICdsZWZ0JyB9XG4gIGlmIChhdHRyaWJ1dGVzLnN0eWxlKSB7XG4gICAgYXR0cmlidXRlcy5zdHlsZSA9IHBhcnNlU3R5bGUoYXR0cmlidXRlcy5zdHlsZSlcbiAgfVxuXG4gIC8vIGNsYXNzOiB7IGZvbzogdHJ1ZSwgYmFyOiBmYWxzZSwgYmF6OiB0cnVlIH1cbiAgLy8gY2xhc3M6IFsnZm9vJywgJ2JhcicsICdiYXonXVxuICBpZiAoYXR0cmlidXRlcy5jbGFzcykge1xuICAgIGF0dHJpYnV0ZXMuY2xhc3MgPSBwYXJzZUNsYXNzKGF0dHJpYnV0ZXMuY2xhc3MpXG4gIH1cblxuICAvLyBSZW1vdmUgYXR0cmlidXRlcyB3aXRoIGZhbHNlIHZhbHVlc1xuICB2YXIgZmlsdGVyZWRBdHRyaWJ1dGVzID0ge31cbiAgZm9yICh2YXIga2V5IGluIGF0dHJpYnV0ZXMpIHtcbiAgICB2YXIgdmFsdWUgPSBhdHRyaWJ1dGVzW2tleV1cbiAgICBpZiAodmFsdWUgPT0gbnVsbCB8fCB2YWx1ZSA9PT0gZmFsc2UpIGNvbnRpbnVlXG4gICAgZmlsdGVyZWRBdHRyaWJ1dGVzW2tleV0gPSB2YWx1ZVxuICB9XG5cbiAgcmV0dXJuIGZpbHRlcmVkQXR0cmlidXRlc1xufVxuXG4vKipcbiAqIFBhcnNlIGEgYmxvY2sgb2Ygc3R5bGVzIGludG8gYSBzdHJpbmcuXG4gKlxuICogVE9ETzogdGhpcyBjb3VsZCBkbyBhIGxvdCBtb3JlIHdpdGggdmVuZG9yIHByZWZpeGluZyxcbiAqIG51bWJlciB2YWx1ZXMgZXRjLiBNYXliZSB0aGVyZSdzIGEgd2F5IHRvIGFsbG93IHVzZXJzXG4gKiB0byBob29rIGludG8gdGhpcz9cbiAqXG4gKiBAcGFyYW0ge09iamVjdH0gc3R5bGVzXG4gKlxuICogQHJldHVybiB7U3RyaW5nfVxuICovXG5cbmZ1bmN0aW9uIHBhcnNlU3R5bGUgKHN0eWxlcykge1xuICBpZiAodHlwZShzdHlsZXMpID09PSAnc3RyaW5nJykge1xuICAgIHJldHVybiBzdHlsZXNcbiAgfVxuICB2YXIgc3RyID0gJydcbiAgZm9yICh2YXIgbmFtZSBpbiBzdHlsZXMpIHtcbiAgICB2YXIgdmFsdWUgPSBzdHlsZXNbbmFtZV1cbiAgICBzdHIgPSBzdHIgKyBuYW1lICsgJzonICsgdmFsdWUgKyAnOydcbiAgfVxuICByZXR1cm4gc3RyO1xufVxuXG4vKipcbiAqIFBhcnNlIHRoZSBjbGFzcyBhdHRyaWJ1dGUgc28gaXQncyBhYmxlIHRvIGJlXG4gKiBzZXQgaW4gYSBtb3JlIHVzZXItZnJpZW5kbHkgd2F5XG4gKlxuICogQHBhcmFtIHtTdHJpbmd8T2JqZWN0fEFycmF5fSB2YWx1ZVxuICpcbiAqIEByZXR1cm4ge1N0cmluZ31cbiAqL1xuXG5mdW5jdGlvbiBwYXJzZUNsYXNzICh2YWx1ZSkge1xuICAvLyB7IGZvbzogdHJ1ZSwgYmFyOiBmYWxzZSwgYmF6OiB0cnVlIH1cbiAgaWYgKHR5cGUodmFsdWUpID09PSAnb2JqZWN0Jykge1xuICAgIHZhciBtYXRjaGVkID0gW11cbiAgICBmb3IgKHZhciBrZXkgaW4gdmFsdWUpIHtcbiAgICAgIGlmICh2YWx1ZVtrZXldKSBtYXRjaGVkLnB1c2goa2V5KVxuICAgIH1cbiAgICB2YWx1ZSA9IG1hdGNoZWRcbiAgfVxuXG4gIC8vIFsnZm9vJywgJ2JhcicsICdiYXonXVxuICBpZiAodHlwZSh2YWx1ZSkgPT09ICdhcnJheScpIHtcbiAgICBpZiAodmFsdWUubGVuZ3RoID09PSAwKSB7XG4gICAgICByZXR1cm5cbiAgICB9XG4gICAgdmFsdWUgPSB2YWx1ZS5qb2luKCcgJylcbiAgfVxuXG4gIHJldHVybiB2YWx1ZVxufVxuIiwiLyoqXG4gKiBSZWN1cnNpdmUgZmxhdHRlbiBmdW5jdGlvbi4gRmFzdGVzdCBpbXBsZW1lbnRhdGlvbiBmb3IgYXJyYXkgZmxhdHRlbmluZy5cbiAqXG4gKiBAcGFyYW0gIHtBcnJheX0gIGFycmF5XG4gKiBAcGFyYW0gIHtBcnJheX0gIHJlc3VsdFxuICogQHBhcmFtICB7TnVtYmVyfSBkZXB0aFxuICogQHJldHVybiB7QXJyYXl9XG4gKi9cbmZ1bmN0aW9uIGZsYXR0ZW4gKGFycmF5LCByZXN1bHQsIGRlcHRoKSB7XG4gIGZvciAodmFyIGkgPSAwOyBpIDwgYXJyYXkubGVuZ3RoOyBpKyspIHtcbiAgICBpZiAoZGVwdGggPiAwICYmIEFycmF5LmlzQXJyYXkoYXJyYXlbaV0pKSB7XG4gICAgICBmbGF0dGVuKGFycmF5W2ldLCByZXN1bHQsIGRlcHRoIC0gMSk7XG4gICAgfSBlbHNlIHtcbiAgICAgIHJlc3VsdC5wdXNoKGFycmF5W2ldKTtcbiAgICB9XG4gIH1cblxuICByZXR1cm4gcmVzdWx0O1xufVxuXG4vKipcbiAqIEZsYXR0ZW4gYW4gYXJyYXksIHdpdGggdGhlIGFiaWxpdHkgdG8gZGVmaW5lIGEgZGVwdGguXG4gKlxuICogQHBhcmFtICB7QXJyYXl9ICBhcnJheVxuICogQHBhcmFtICB7TnVtYmVyfSBkZXB0aFxuICogQHJldHVybiB7QXJyYXl9XG4gKi9cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gKGFycmF5LCBkZXB0aCkge1xuICByZXR1cm4gZmxhdHRlbihhcnJheSwgW10sIGRlcHRoIHx8IEluZmluaXR5KTtcbn07XG4iLCJcbi8qKlxuICogRXhwb3NlIGBFbWl0dGVyYC5cbiAqL1xuXG5tb2R1bGUuZXhwb3J0cyA9IEVtaXR0ZXI7XG5cbi8qKlxuICogSW5pdGlhbGl6ZSBhIG5ldyBgRW1pdHRlcmAuXG4gKlxuICogQGFwaSBwdWJsaWNcbiAqL1xuXG5mdW5jdGlvbiBFbWl0dGVyKG9iaikge1xuICBpZiAob2JqKSByZXR1cm4gbWl4aW4ob2JqKTtcbn07XG5cbi8qKlxuICogTWl4aW4gdGhlIGVtaXR0ZXIgcHJvcGVydGllcy5cbiAqXG4gKiBAcGFyYW0ge09iamVjdH0gb2JqXG4gKiBAcmV0dXJuIHtPYmplY3R9XG4gKiBAYXBpIHByaXZhdGVcbiAqL1xuXG5mdW5jdGlvbiBtaXhpbihvYmopIHtcbiAgZm9yICh2YXIga2V5IGluIEVtaXR0ZXIucHJvdG90eXBlKSB7XG4gICAgb2JqW2tleV0gPSBFbWl0dGVyLnByb3RvdHlwZVtrZXldO1xuICB9XG4gIHJldHVybiBvYmo7XG59XG5cbi8qKlxuICogTGlzdGVuIG9uIHRoZSBnaXZlbiBgZXZlbnRgIHdpdGggYGZuYC5cbiAqXG4gKiBAcGFyYW0ge1N0cmluZ30gZXZlbnRcbiAqIEBwYXJhbSB7RnVuY3Rpb259IGZuXG4gKiBAcmV0dXJuIHtFbWl0dGVyfVxuICogQGFwaSBwdWJsaWNcbiAqL1xuXG5FbWl0dGVyLnByb3RvdHlwZS5vbiA9XG5FbWl0dGVyLnByb3RvdHlwZS5hZGRFdmVudExpc3RlbmVyID0gZnVuY3Rpb24oZXZlbnQsIGZuKXtcbiAgdGhpcy5fY2FsbGJhY2tzID0gdGhpcy5fY2FsbGJhY2tzIHx8IHt9O1xuICAodGhpcy5fY2FsbGJhY2tzWyckJyArIGV2ZW50XSA9IHRoaXMuX2NhbGxiYWNrc1snJCcgKyBldmVudF0gfHwgW10pXG4gICAgLnB1c2goZm4pO1xuICByZXR1cm4gdGhpcztcbn07XG5cbi8qKlxuICogQWRkcyBhbiBgZXZlbnRgIGxpc3RlbmVyIHRoYXQgd2lsbCBiZSBpbnZva2VkIGEgc2luZ2xlXG4gKiB0aW1lIHRoZW4gYXV0b21hdGljYWxseSByZW1vdmVkLlxuICpcbiAqIEBwYXJhbSB7U3RyaW5nfSBldmVudFxuICogQHBhcmFtIHtGdW5jdGlvbn0gZm5cbiAqIEByZXR1cm4ge0VtaXR0ZXJ9XG4gKiBAYXBpIHB1YmxpY1xuICovXG5cbkVtaXR0ZXIucHJvdG90eXBlLm9uY2UgPSBmdW5jdGlvbihldmVudCwgZm4pe1xuICBmdW5jdGlvbiBvbigpIHtcbiAgICB0aGlzLm9mZihldmVudCwgb24pO1xuICAgIGZuLmFwcGx5KHRoaXMsIGFyZ3VtZW50cyk7XG4gIH1cblxuICBvbi5mbiA9IGZuO1xuICB0aGlzLm9uKGV2ZW50LCBvbik7XG4gIHJldHVybiB0aGlzO1xufTtcblxuLyoqXG4gKiBSZW1vdmUgdGhlIGdpdmVuIGNhbGxiYWNrIGZvciBgZXZlbnRgIG9yIGFsbFxuICogcmVnaXN0ZXJlZCBjYWxsYmFja3MuXG4gKlxuICogQHBhcmFtIHtTdHJpbmd9IGV2ZW50XG4gKiBAcGFyYW0ge0Z1bmN0aW9ufSBmblxuICogQHJldHVybiB7RW1pdHRlcn1cbiAqIEBhcGkgcHVibGljXG4gKi9cblxuRW1pdHRlci5wcm90b3R5cGUub2ZmID1cbkVtaXR0ZXIucHJvdG90eXBlLnJlbW92ZUxpc3RlbmVyID1cbkVtaXR0ZXIucHJvdG90eXBlLnJlbW92ZUFsbExpc3RlbmVycyA9XG5FbWl0dGVyLnByb3RvdHlwZS5yZW1vdmVFdmVudExpc3RlbmVyID0gZnVuY3Rpb24oZXZlbnQsIGZuKXtcbiAgdGhpcy5fY2FsbGJhY2tzID0gdGhpcy5fY2FsbGJhY2tzIHx8IHt9O1xuXG4gIC8vIGFsbFxuICBpZiAoMCA9PSBhcmd1bWVudHMubGVuZ3RoKSB7XG4gICAgdGhpcy5fY2FsbGJhY2tzID0ge307XG4gICAgcmV0dXJuIHRoaXM7XG4gIH1cblxuICAvLyBzcGVjaWZpYyBldmVudFxuICB2YXIgY2FsbGJhY2tzID0gdGhpcy5fY2FsbGJhY2tzWyckJyArIGV2ZW50XTtcbiAgaWYgKCFjYWxsYmFja3MpIHJldHVybiB0aGlzO1xuXG4gIC8vIHJlbW92ZSBhbGwgaGFuZGxlcnNcbiAgaWYgKDEgPT0gYXJndW1lbnRzLmxlbmd0aCkge1xuICAgIGRlbGV0ZSB0aGlzLl9jYWxsYmFja3NbJyQnICsgZXZlbnRdO1xuICAgIHJldHVybiB0aGlzO1xuICB9XG5cbiAgLy8gcmVtb3ZlIHNwZWNpZmljIGhhbmRsZXJcbiAgdmFyIGNiO1xuICBmb3IgKHZhciBpID0gMDsgaSA8IGNhbGxiYWNrcy5sZW5ndGg7IGkrKykge1xuICAgIGNiID0gY2FsbGJhY2tzW2ldO1xuICAgIGlmIChjYiA9PT0gZm4gfHwgY2IuZm4gPT09IGZuKSB7XG4gICAgICBjYWxsYmFja3Muc3BsaWNlKGksIDEpO1xuICAgICAgYnJlYWs7XG4gICAgfVxuICB9XG4gIHJldHVybiB0aGlzO1xufTtcblxuLyoqXG4gKiBFbWl0IGBldmVudGAgd2l0aCB0aGUgZ2l2ZW4gYXJncy5cbiAqXG4gKiBAcGFyYW0ge1N0cmluZ30gZXZlbnRcbiAqIEBwYXJhbSB7TWl4ZWR9IC4uLlxuICogQHJldHVybiB7RW1pdHRlcn1cbiAqL1xuXG5FbWl0dGVyLnByb3RvdHlwZS5lbWl0ID0gZnVuY3Rpb24oZXZlbnQpe1xuICB0aGlzLl9jYWxsYmFja3MgPSB0aGlzLl9jYWxsYmFja3MgfHwge307XG4gIHZhciBhcmdzID0gW10uc2xpY2UuY2FsbChhcmd1bWVudHMsIDEpXG4gICAgLCBjYWxsYmFja3MgPSB0aGlzLl9jYWxsYmFja3NbJyQnICsgZXZlbnRdO1xuXG4gIGlmIChjYWxsYmFja3MpIHtcbiAgICBjYWxsYmFja3MgPSBjYWxsYmFja3Muc2xpY2UoMCk7XG4gICAgZm9yICh2YXIgaSA9IDAsIGxlbiA9IGNhbGxiYWNrcy5sZW5ndGg7IGkgPCBsZW47ICsraSkge1xuICAgICAgY2FsbGJhY2tzW2ldLmFwcGx5KHRoaXMsIGFyZ3MpO1xuICAgIH1cbiAgfVxuXG4gIHJldHVybiB0aGlzO1xufTtcblxuLyoqXG4gKiBSZXR1cm4gYXJyYXkgb2YgY2FsbGJhY2tzIGZvciBgZXZlbnRgLlxuICpcbiAqIEBwYXJhbSB7U3RyaW5nfSBldmVudFxuICogQHJldHVybiB7QXJyYXl9XG4gKiBAYXBpIHB1YmxpY1xuICovXG5cbkVtaXR0ZXIucHJvdG90eXBlLmxpc3RlbmVycyA9IGZ1bmN0aW9uKGV2ZW50KXtcbiAgdGhpcy5fY2FsbGJhY2tzID0gdGhpcy5fY2FsbGJhY2tzIHx8IHt9O1xuICByZXR1cm4gdGhpcy5fY2FsbGJhY2tzWyckJyArIGV2ZW50XSB8fCBbXTtcbn07XG5cbi8qKlxuICogQ2hlY2sgaWYgdGhpcyBlbWl0dGVyIGhhcyBgZXZlbnRgIGhhbmRsZXJzLlxuICpcbiAqIEBwYXJhbSB7U3RyaW5nfSBldmVudFxuICogQHJldHVybiB7Qm9vbGVhbn1cbiAqIEBhcGkgcHVibGljXG4gKi9cblxuRW1pdHRlci5wcm90b3R5cGUuaGFzTGlzdGVuZXJzID0gZnVuY3Rpb24oZXZlbnQpe1xuICByZXR1cm4gISEgdGhpcy5saXN0ZW5lcnMoZXZlbnQpLmxlbmd0aDtcbn07XG4iLCIvKipcbiAqIEV4cG9zZSBgcmVxdWVzdEFuaW1hdGlvbkZyYW1lKClgLlxuICovXG5cbmV4cG9ydHMgPSBtb2R1bGUuZXhwb3J0cyA9IHdpbmRvdy5yZXF1ZXN0QW5pbWF0aW9uRnJhbWVcbiAgfHwgd2luZG93LndlYmtpdFJlcXVlc3RBbmltYXRpb25GcmFtZVxuICB8fCB3aW5kb3cubW96UmVxdWVzdEFuaW1hdGlvbkZyYW1lXG4gIHx8IGZhbGxiYWNrO1xuXG4vKipcbiAqIEZhbGxiYWNrIGltcGxlbWVudGF0aW9uLlxuICovXG5cbnZhciBwcmV2ID0gbmV3IERhdGUoKS5nZXRUaW1lKCk7XG5mdW5jdGlvbiBmYWxsYmFjayhmbikge1xuICB2YXIgY3VyciA9IG5ldyBEYXRlKCkuZ2V0VGltZSgpO1xuICB2YXIgbXMgPSBNYXRoLm1heCgwLCAxNiAtIChjdXJyIC0gcHJldikpO1xuICB2YXIgcmVxID0gc2V0VGltZW91dChmbiwgbXMpO1xuICBwcmV2ID0gY3VycjtcbiAgcmV0dXJuIHJlcTtcbn1cblxuLyoqXG4gKiBDYW5jZWwuXG4gKi9cblxudmFyIGNhbmNlbCA9IHdpbmRvdy5jYW5jZWxBbmltYXRpb25GcmFtZVxuICB8fCB3aW5kb3cud2Via2l0Q2FuY2VsQW5pbWF0aW9uRnJhbWVcbiAgfHwgd2luZG93Lm1vekNhbmNlbEFuaW1hdGlvbkZyYW1lXG4gIHx8IHdpbmRvdy5jbGVhclRpbWVvdXQ7XG5cbmV4cG9ydHMuY2FuY2VsID0gZnVuY3Rpb24oaWQpe1xuICBjYW5jZWwuY2FsbCh3aW5kb3csIGlkKTtcbn07XG4iLCIvKipcbiAqIHRvU3RyaW5nIHJlZi5cbiAqL1xuXG52YXIgdG9TdHJpbmcgPSBPYmplY3QucHJvdG90eXBlLnRvU3RyaW5nO1xuXG4vKipcbiAqIFJldHVybiB0aGUgdHlwZSBvZiBgdmFsYC5cbiAqXG4gKiBAcGFyYW0ge01peGVkfSB2YWxcbiAqIEByZXR1cm4ge1N0cmluZ31cbiAqIEBhcGkgcHVibGljXG4gKi9cblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbih2YWwpe1xuICBzd2l0Y2ggKHRvU3RyaW5nLmNhbGwodmFsKSkge1xuICAgIGNhc2UgJ1tvYmplY3QgRGF0ZV0nOiByZXR1cm4gJ2RhdGUnO1xuICAgIGNhc2UgJ1tvYmplY3QgUmVnRXhwXSc6IHJldHVybiAncmVnZXhwJztcbiAgICBjYXNlICdbb2JqZWN0IEFyZ3VtZW50c10nOiByZXR1cm4gJ2FyZ3VtZW50cyc7XG4gICAgY2FzZSAnW29iamVjdCBBcnJheV0nOiByZXR1cm4gJ2FycmF5JztcbiAgICBjYXNlICdbb2JqZWN0IEVycm9yXSc6IHJldHVybiAnZXJyb3InO1xuICB9XG5cbiAgaWYgKHZhbCA9PT0gbnVsbCkgcmV0dXJuICdudWxsJztcbiAgaWYgKHZhbCA9PT0gdW5kZWZpbmVkKSByZXR1cm4gJ3VuZGVmaW5lZCc7XG4gIGlmICh2YWwgIT09IHZhbCkgcmV0dXJuICduYW4nO1xuICBpZiAodmFsICYmIHZhbC5ub2RlVHlwZSA9PT0gMSkgcmV0dXJuICdlbGVtZW50JztcblxuICB2YWwgPSB2YWwudmFsdWVPZlxuICAgID8gdmFsLnZhbHVlT2YoKVxuICAgIDogT2JqZWN0LnByb3RvdHlwZS52YWx1ZU9mLmFwcGx5KHZhbClcblxuICByZXR1cm4gdHlwZW9mIHZhbDtcbn07XG4iLCJmdW5jdGlvbiBQb29sKHBhcmFtcykge1xyXG4gICAgaWYgKHR5cGVvZiBwYXJhbXMgIT09ICdvYmplY3QnKSB7XHJcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKFwiUGxlYXNlIHBhc3MgcGFyYW1ldGVycy4gRXhhbXBsZSAtPiBuZXcgUG9vbCh7IHRhZ05hbWU6IFxcXCJkaXZcXFwiIH0pXCIpO1xyXG4gICAgfVxyXG5cclxuICAgIGlmICh0eXBlb2YgcGFyYW1zLnRhZ05hbWUgIT09ICdzdHJpbmcnKSB7XHJcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKFwiUGxlYXNlIHNwZWNpZnkgYSB0YWdOYW1lLiBFeGFtcGxlIC0+IG5ldyBQb29sKHsgdGFnTmFtZTogXFxcImRpdlxcXCIgfSlcIik7XHJcbiAgICB9XHJcblxyXG4gICAgdGhpcy5zdG9yYWdlID0gW107XHJcbiAgICB0aGlzLnRhZ05hbWUgPSBwYXJhbXMudGFnTmFtZS50b0xvd2VyQ2FzZSgpO1xyXG4gICAgdGhpcy5uYW1lc3BhY2UgPSBwYXJhbXMubmFtZXNwYWNlO1xyXG59XHJcblxyXG5Qb29sLnByb3RvdHlwZS5wdXNoID0gZnVuY3Rpb24oZWwpIHtcclxuICAgIGlmIChlbC50YWdOYW1lLnRvTG93ZXJDYXNlKCkgIT09IHRoaXMudGFnTmFtZSkge1xyXG4gICAgICAgIHJldHVybjtcclxuICAgIH1cclxuICAgIFxyXG4gICAgdGhpcy5zdG9yYWdlLnB1c2goZWwpO1xyXG59O1xyXG5cclxuUG9vbC5wcm90b3R5cGUucG9wID0gZnVuY3Rpb24oYXJndW1lbnQpIHtcclxuICAgIGlmICh0aGlzLnN0b3JhZ2UubGVuZ3RoID09PSAwKSB7XHJcbiAgICAgICAgcmV0dXJuIHRoaXMuY3JlYXRlKCk7XHJcbiAgICB9IGVsc2Uge1xyXG4gICAgICAgIHJldHVybiB0aGlzLnN0b3JhZ2UucG9wKCk7XHJcbiAgICB9XHJcbn07XHJcblxyXG5Qb29sLnByb3RvdHlwZS5jcmVhdGUgPSBmdW5jdGlvbigpIHtcclxuICAgIGlmICh0aGlzLm5hbWVzcGFjZSkge1xyXG4gICAgICAgIHJldHVybiBkb2N1bWVudC5jcmVhdGVFbGVtZW50TlModGhpcy5uYW1lc3BhY2UsIHRoaXMudGFnTmFtZSk7XHJcbiAgICB9IGVsc2Uge1xyXG4gICAgICAgIHJldHVybiBkb2N1bWVudC5jcmVhdGVFbGVtZW50KHRoaXMudGFnTmFtZSk7XHJcbiAgICB9XHJcbn07XHJcblxyXG5Qb29sLnByb3RvdHlwZS5hbGxvY2F0ZSA9IGZ1bmN0aW9uKHNpemUpIHtcclxuICAgIGlmICh0aGlzLnN0b3JhZ2UubGVuZ3RoID49IHNpemUpIHtcclxuICAgICAgICByZXR1cm47XHJcbiAgICB9XHJcblxyXG4gICAgdmFyIGRpZmZlcmVuY2UgPSBzaXplIC0gdGhpcy5zdG9yYWdlLmxlbmd0aDtcclxuICAgIGZvciAodmFyIHBvb2xBbGxvY0l0ZXIgPSAwOyBwb29sQWxsb2NJdGVyIDwgZGlmZmVyZW5jZTsgcG9vbEFsbG9jSXRlcisrKSB7XHJcbiAgICAgICAgdGhpcy5zdG9yYWdlLnB1c2godGhpcy5jcmVhdGUoKSk7XHJcbiAgICB9XHJcbn07XHJcblxyXG5pZiAodHlwZW9mIG1vZHVsZSAhPT0gJ3VuZGVmaW5lZCcgJiYgdHlwZW9mIG1vZHVsZS5leHBvcnRzICE9PSAndW5kZWZpbmVkJykge1xyXG4gICAgbW9kdWxlLmV4cG9ydHMgPSBQb29sO1xyXG59XHJcbiIsInZhciBzbGljZSA9IEFycmF5LnByb3RvdHlwZS5zbGljZVxuXG5tb2R1bGUuZXhwb3J0cyA9IGl0ZXJhdGl2ZWx5V2Fsa1xuXG5mdW5jdGlvbiBpdGVyYXRpdmVseVdhbGsobm9kZXMsIGNiKSB7XG4gICAgaWYgKCEoJ2xlbmd0aCcgaW4gbm9kZXMpKSB7XG4gICAgICAgIG5vZGVzID0gW25vZGVzXVxuICAgIH1cbiAgICBcbiAgICBub2RlcyA9IHNsaWNlLmNhbGwobm9kZXMpXG5cbiAgICB3aGlsZShub2Rlcy5sZW5ndGgpIHtcbiAgICAgICAgdmFyIG5vZGUgPSBub2Rlcy5zaGlmdCgpLFxuICAgICAgICAgICAgcmV0ID0gY2Iobm9kZSlcblxuICAgICAgICBpZiAocmV0KSB7XG4gICAgICAgICAgICByZXR1cm4gcmV0XG4gICAgICAgIH1cblxuICAgICAgICBpZiAobm9kZS5jaGlsZE5vZGVzICYmIG5vZGUuY2hpbGROb2Rlcy5sZW5ndGgpIHtcbiAgICAgICAgICAgIG5vZGVzID0gc2xpY2UuY2FsbChub2RlLmNoaWxkTm9kZXMpLmNvbmNhdChub2RlcylcbiAgICAgICAgfVxuICAgIH1cbn1cbiIsIid1c2Ugc3RyaWN0JztcblxuLyoqXG4gKiAjIENsb25lIEFycmF5XG4gKlxuICogQ2xvbmUgYW4gYXJyYXkgb3IgYXJyYXkgbGlrZSBvYmplY3QgKGUuZy4gYGFyZ3VtZW50c2ApLlxuICogVGhpcyBpcyB0aGUgZXF1aXZhbGVudCBvZiBjYWxsaW5nIGBBcnJheS5wcm90b3R5cGUuc2xpY2UuY2FsbChhcmd1bWVudHMpYCwgYnV0XG4gKiBzaWduaWZpY2FudGx5IGZhc3Rlci5cbiAqXG4gKiBAcGFyYW0gIHtBcnJheX0gaW5wdXQgVGhlIGFycmF5IG9yIGFycmF5LWxpa2Ugb2JqZWN0IHRvIGNsb25lLlxuICogQHJldHVybiB7QXJyYXl9ICAgICAgIFRoZSBjbG9uZWQgYXJyYXkuXG4gKi9cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gZmFzdENsb25lQXJyYXkgKGlucHV0KSB7XG4gIHZhciBsZW5ndGggPSBpbnB1dC5sZW5ndGgsXG4gICAgICBzbGljZWQgPSBuZXcgQXJyYXkobGVuZ3RoKSxcbiAgICAgIGk7XG4gIGZvciAoaSA9IDA7IGkgPCBsZW5ndGg7IGkrKykge1xuICAgIHNsaWNlZFtpXSA9IGlucHV0W2ldO1xuICB9XG4gIHJldHVybiBzbGljZWQ7XG59O1xuIiwiJ3VzZSBzdHJpY3QnO1xuXG4vKipcbiAqICMgQ29uY2F0XG4gKlxuICogQ29uY2F0ZW5hdGUgbXVsdGlwbGUgYXJyYXlzLlxuICpcbiAqID4gTm90ZTogVGhpcyBmdW5jdGlvbiBpcyBlZmZlY3RpdmVseSBpZGVudGljYWwgdG8gYEFycmF5LnByb3RvdHlwZS5jb25jYXQoKWAuXG4gKlxuICpcbiAqIEBwYXJhbSAge0FycmF5fG1peGVkfSBpdGVtLCAuLi4gVGhlIGl0ZW0ocykgdG8gY29uY2F0ZW5hdGUuXG4gKiBAcmV0dXJuIHtBcnJheX0gICAgICAgICAgICAgICAgIFRoZSBhcnJheSBjb250YWluaW5nIHRoZSBjb25jYXRlbmF0ZWQgaXRlbXMuXG4gKi9cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gZmFzdENvbmNhdCAoKSB7XG4gIHZhciBsZW5ndGggPSBhcmd1bWVudHMubGVuZ3RoLFxuICAgICAgYXJyID0gW10sXG4gICAgICBpLCBpdGVtLCBjaGlsZExlbmd0aCwgajtcblxuICBmb3IgKGkgPSAwOyBpIDwgbGVuZ3RoOyBpKyspIHtcbiAgICBpdGVtID0gYXJndW1lbnRzW2ldO1xuICAgIGlmIChBcnJheS5pc0FycmF5KGl0ZW0pKSB7XG4gICAgICBjaGlsZExlbmd0aCA9IGl0ZW0ubGVuZ3RoO1xuICAgICAgZm9yIChqID0gMDsgaiA8IGNoaWxkTGVuZ3RoOyBqKyspIHtcbiAgICAgICAgYXJyLnB1c2goaXRlbVtqXSk7XG4gICAgICB9XG4gICAgfVxuICAgIGVsc2Uge1xuICAgICAgYXJyLnB1c2goaXRlbSk7XG4gICAgfVxuICB9XG4gIHJldHVybiBhcnI7XG59O1xuIiwiJ3VzZSBzdHJpY3QnO1xuXG52YXIgYmluZEludGVybmFsMyA9IHJlcXVpcmUoJy4uL2Z1bmN0aW9uL2JpbmRJbnRlcm5hbDMnKTtcblxuLyoqXG4gKiAjIEV2ZXJ5XG4gKlxuICogQSBmYXN0IGAuZXZlcnkoKWAgaW1wbGVtZW50YXRpb24uXG4gKlxuICogQHBhcmFtICB7QXJyYXl9ICAgIHN1YmplY3QgICAgIFRoZSBhcnJheSAob3IgYXJyYXktbGlrZSkgdG8gaXRlcmF0ZSBvdmVyLlxuICogQHBhcmFtICB7RnVuY3Rpb259IGZuICAgICAgICAgIFRoZSB2aXNpdG9yIGZ1bmN0aW9uLlxuICogQHBhcmFtICB7T2JqZWN0fSAgIHRoaXNDb250ZXh0IFRoZSBjb250ZXh0IGZvciB0aGUgdmlzaXRvci5cbiAqIEByZXR1cm4ge0Jvb2xlYW59ICAgICAgICAgICAgICB0cnVlIGlmIGFsbCBpdGVtcyBpbiB0aGUgYXJyYXkgcGFzc2VzIHRoZSB0cnV0aCB0ZXN0LlxuICovXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIGZhc3RFdmVyeSAoc3ViamVjdCwgZm4sIHRoaXNDb250ZXh0KSB7XG4gIHZhciBsZW5ndGggPSBzdWJqZWN0Lmxlbmd0aCxcbiAgICAgIGl0ZXJhdG9yID0gdGhpc0NvbnRleHQgIT09IHVuZGVmaW5lZCA/IGJpbmRJbnRlcm5hbDMoZm4sIHRoaXNDb250ZXh0KSA6IGZuLFxuICAgICAgaTtcbiAgZm9yIChpID0gMDsgaSA8IGxlbmd0aDsgaSsrKSB7XG4gICAgaWYgKCFpdGVyYXRvcihzdWJqZWN0W2ldLCBpLCBzdWJqZWN0KSkge1xuICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cbiAgfVxuICByZXR1cm4gdHJ1ZTtcbn07XG4iLCIndXNlIHN0cmljdCc7XG5cbi8qKlxuICogIyBGaWxsXG4gKiBGaWxsIGFuIGFycmF5IHdpdGggdmFsdWVzLCBvcHRpb25hbGx5IHN0YXJ0aW5nIGFuZCBzdG9wcGluZyBhdCBhIGdpdmVuIGluZGV4LlxuICpcbiAqID4gTm90ZTogdW5saWtlIHRoZSBzcGVjY2VkIEFycmF5LnByb3RvdHlwZS5maWxsKCksIHRoaXMgdmVyc2lvbiBkb2VzIG5vdCBzdXBwb3J0XG4gKiA+IG5lZ2F0aXZlIHN0YXJ0IC8gZW5kIGFyZ3VtZW50cy5cbiAqXG4gKiBAcGFyYW0gIHtBcnJheX0gICBzdWJqZWN0IFRoZSBhcnJheSB0byBmaWxsLlxuICogQHBhcmFtICB7bWl4ZWR9ICAgdmFsdWUgICBUaGUgdmFsdWUgdG8gaW5zZXJ0LlxuICogQHBhcmFtICB7SW50ZWdlcn0gc3RhcnQgICBUaGUgc3RhcnQgcG9zaXRpb24sIGRlZmF1bHRzIHRvIDAuXG4gKiBAcGFyYW0gIHtJbnRlZ2VyfSBlbmQgICAgIFRoZSBlbmQgcG9zaXRpb24sIGRlZmF1bHRzIHRvIHN1YmplY3QubGVuZ3RoXG4gKiBAcmV0dXJuIHtBcnJheX0gICAgICAgICAgIFRoZSBub3cgZmlsbGVkIHN1YmplY3QuXG4gKi9cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gZmFzdEZpbGwgKHN1YmplY3QsIHZhbHVlLCBzdGFydCwgZW5kKSB7XG4gIHZhciBsZW5ndGggPSBzdWJqZWN0Lmxlbmd0aCxcbiAgICAgIGk7XG4gIGlmIChzdGFydCA9PT0gdW5kZWZpbmVkKSB7XG4gICAgc3RhcnQgPSAwO1xuICB9XG4gIGlmIChlbmQgPT09IHVuZGVmaW5lZCkge1xuICAgIGVuZCA9IGxlbmd0aDtcbiAgfVxuICBmb3IgKGkgPSBzdGFydDsgaSA8IGVuZDsgaSsrKSB7XG4gICAgc3ViamVjdFtpXSA9IHZhbHVlO1xuICB9XG4gIHJldHVybiBzdWJqZWN0O1xufTsiLCIndXNlIHN0cmljdCc7XG5cbnZhciBiaW5kSW50ZXJuYWwzID0gcmVxdWlyZSgnLi4vZnVuY3Rpb24vYmluZEludGVybmFsMycpO1xuXG4vKipcbiAqICMgRmlsdGVyXG4gKlxuICogQSBmYXN0IGAuZmlsdGVyKClgIGltcGxlbWVudGF0aW9uLlxuICpcbiAqIEBwYXJhbSAge0FycmF5fSAgICBzdWJqZWN0ICAgICBUaGUgYXJyYXkgKG9yIGFycmF5LWxpa2UpIHRvIGZpbHRlci5cbiAqIEBwYXJhbSAge0Z1bmN0aW9ufSBmbiAgICAgICAgICBUaGUgZmlsdGVyIGZ1bmN0aW9uLlxuICogQHBhcmFtICB7T2JqZWN0fSAgIHRoaXNDb250ZXh0IFRoZSBjb250ZXh0IGZvciB0aGUgZmlsdGVyLlxuICogQHJldHVybiB7QXJyYXl9ICAgICAgICAgICAgICAgIFRoZSBhcnJheSBjb250YWluaW5nIHRoZSByZXN1bHRzLlxuICovXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIGZhc3RGaWx0ZXIgKHN1YmplY3QsIGZuLCB0aGlzQ29udGV4dCkge1xuICB2YXIgbGVuZ3RoID0gc3ViamVjdC5sZW5ndGgsXG4gICAgICByZXN1bHQgPSBbXSxcbiAgICAgIGl0ZXJhdG9yID0gdGhpc0NvbnRleHQgIT09IHVuZGVmaW5lZCA/IGJpbmRJbnRlcm5hbDMoZm4sIHRoaXNDb250ZXh0KSA6IGZuLFxuICAgICAgaTtcbiAgZm9yIChpID0gMDsgaSA8IGxlbmd0aDsgaSsrKSB7XG4gICAgaWYgKGl0ZXJhdG9yKHN1YmplY3RbaV0sIGksIHN1YmplY3QpKSB7XG4gICAgICByZXN1bHQucHVzaChzdWJqZWN0W2ldKTtcbiAgICB9XG4gIH1cbiAgcmV0dXJuIHJlc3VsdDtcbn07XG4iLCIndXNlIHN0cmljdCc7XG5cbnZhciBiaW5kSW50ZXJuYWwzID0gcmVxdWlyZSgnLi4vZnVuY3Rpb24vYmluZEludGVybmFsMycpO1xuXG4vKipcbiAqICMgRm9yIEVhY2hcbiAqXG4gKiBBIGZhc3QgYC5mb3JFYWNoKClgIGltcGxlbWVudGF0aW9uLlxuICpcbiAqIEBwYXJhbSAge0FycmF5fSAgICBzdWJqZWN0ICAgICBUaGUgYXJyYXkgKG9yIGFycmF5LWxpa2UpIHRvIGl0ZXJhdGUgb3Zlci5cbiAqIEBwYXJhbSAge0Z1bmN0aW9ufSBmbiAgICAgICAgICBUaGUgdmlzaXRvciBmdW5jdGlvbi5cbiAqIEBwYXJhbSAge09iamVjdH0gICB0aGlzQ29udGV4dCBUaGUgY29udGV4dCBmb3IgdGhlIHZpc2l0b3IuXG4gKi9cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gZmFzdEZvckVhY2ggKHN1YmplY3QsIGZuLCB0aGlzQ29udGV4dCkge1xuICB2YXIgbGVuZ3RoID0gc3ViamVjdC5sZW5ndGgsXG4gICAgICBpdGVyYXRvciA9IHRoaXNDb250ZXh0ICE9PSB1bmRlZmluZWQgPyBiaW5kSW50ZXJuYWwzKGZuLCB0aGlzQ29udGV4dCkgOiBmbixcbiAgICAgIGk7XG4gIGZvciAoaSA9IDA7IGkgPCBsZW5ndGg7IGkrKykge1xuICAgIGl0ZXJhdG9yKHN1YmplY3RbaV0sIGksIHN1YmplY3QpO1xuICB9XG59O1xuIiwiJ3VzZSBzdHJpY3QnO1xuXG5leHBvcnRzLmNsb25lID0gcmVxdWlyZSgnLi9jbG9uZScpO1xuZXhwb3J0cy5jb25jYXQgPSByZXF1aXJlKCcuL2NvbmNhdCcpO1xuZXhwb3J0cy5ldmVyeSA9IHJlcXVpcmUoJy4vZXZlcnknKTtcbmV4cG9ydHMuZmlsdGVyID0gcmVxdWlyZSgnLi9maWx0ZXInKTtcbmV4cG9ydHMuZm9yRWFjaCA9IHJlcXVpcmUoJy4vZm9yRWFjaCcpO1xuZXhwb3J0cy5pbmRleE9mID0gcmVxdWlyZSgnLi9pbmRleE9mJyk7XG5leHBvcnRzLmxhc3RJbmRleE9mID0gcmVxdWlyZSgnLi9sYXN0SW5kZXhPZicpO1xuZXhwb3J0cy5tYXAgPSByZXF1aXJlKCcuL21hcCcpO1xuZXhwb3J0cy5wbHVjayA9IHJlcXVpcmUoJy4vcGx1Y2snKTtcbmV4cG9ydHMucmVkdWNlID0gcmVxdWlyZSgnLi9yZWR1Y2UnKTtcbmV4cG9ydHMucmVkdWNlUmlnaHQgPSByZXF1aXJlKCcuL3JlZHVjZVJpZ2h0Jyk7XG5leHBvcnRzLnNvbWUgPSByZXF1aXJlKCcuL3NvbWUnKTtcbmV4cG9ydHMuZmlsbCA9IHJlcXVpcmUoJy4vZmlsbCcpOyIsIid1c2Ugc3RyaWN0JztcblxuLyoqXG4gKiAjIEluZGV4IE9mXG4gKlxuICogQSBmYXN0ZXIgYEFycmF5LnByb3RvdHlwZS5pbmRleE9mKClgIGltcGxlbWVudGF0aW9uLlxuICpcbiAqIEBwYXJhbSAge0FycmF5fSAgc3ViamVjdCAgIFRoZSBhcnJheSAob3IgYXJyYXktbGlrZSkgdG8gc2VhcmNoIHdpdGhpbi5cbiAqIEBwYXJhbSAge21peGVkfSAgdGFyZ2V0ICAgIFRoZSB0YXJnZXQgaXRlbSB0byBzZWFyY2ggZm9yLlxuICogQHBhcmFtICB7TnVtYmVyfSBmcm9tSW5kZXggVGhlIHBvc2l0aW9uIHRvIHN0YXJ0IHNlYXJjaGluZyBmcm9tLCBpZiBrbm93bi5cbiAqIEByZXR1cm4ge051bWJlcn0gICAgICAgICAgIFRoZSBwb3NpdGlvbiBvZiB0aGUgdGFyZ2V0IGluIHRoZSBzdWJqZWN0LCBvciAtMSBpZiBpdCBkb2VzIG5vdCBleGlzdC5cbiAqL1xubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiBmYXN0SW5kZXhPZiAoc3ViamVjdCwgdGFyZ2V0LCBmcm9tSW5kZXgpIHtcbiAgdmFyIGxlbmd0aCA9IHN1YmplY3QubGVuZ3RoLFxuICAgICAgaSA9IDA7XG5cbiAgaWYgKHR5cGVvZiBmcm9tSW5kZXggPT09ICdudW1iZXInKSB7XG4gICAgaSA9IGZyb21JbmRleDtcbiAgICBpZiAoaSA8IDApIHtcbiAgICAgIGkgKz0gbGVuZ3RoO1xuICAgICAgaWYgKGkgPCAwKSB7XG4gICAgICAgIGkgPSAwO1xuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIGZvciAoOyBpIDwgbGVuZ3RoOyBpKyspIHtcbiAgICBpZiAoc3ViamVjdFtpXSA9PT0gdGFyZ2V0KSB7XG4gICAgICByZXR1cm4gaTtcbiAgICB9XG4gIH1cbiAgcmV0dXJuIC0xO1xufTtcbiIsIid1c2Ugc3RyaWN0JztcblxuLyoqXG4gKiAjIExhc3QgSW5kZXggT2ZcbiAqXG4gKiBBIGZhc3RlciBgQXJyYXkucHJvdG90eXBlLmxhc3RJbmRleE9mKClgIGltcGxlbWVudGF0aW9uLlxuICpcbiAqIEBwYXJhbSAge0FycmF5fSAgc3ViamVjdCBUaGUgYXJyYXkgKG9yIGFycmF5LWxpa2UpIHRvIHNlYXJjaCB3aXRoaW4uXG4gKiBAcGFyYW0gIHttaXhlZH0gIHRhcmdldCAgVGhlIHRhcmdldCBpdGVtIHRvIHNlYXJjaCBmb3IuXG4gKiBAcGFyYW0gIHtOdW1iZXJ9IGZyb21JbmRleCBUaGUgcG9zaXRpb24gdG8gc3RhcnQgc2VhcmNoaW5nIGJhY2t3YXJkcyBmcm9tLCBpZiBrbm93bi5cbiAqIEByZXR1cm4ge051bWJlcn0gICAgICAgICBUaGUgbGFzdCBwb3NpdGlvbiBvZiB0aGUgdGFyZ2V0IGluIHRoZSBzdWJqZWN0LCBvciAtMSBpZiBpdCBkb2VzIG5vdCBleGlzdC5cbiAqL1xubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiBmYXN0TGFzdEluZGV4T2YgKHN1YmplY3QsIHRhcmdldCwgZnJvbUluZGV4KSB7XG4gIHZhciBsZW5ndGggPSBzdWJqZWN0Lmxlbmd0aCxcbiAgICAgIGkgPSBsZW5ndGggLSAxO1xuXG4gIGlmICh0eXBlb2YgZnJvbUluZGV4ID09PSAnbnVtYmVyJykge1xuICAgIGkgPSBmcm9tSW5kZXg7XG4gICAgaWYgKGkgPCAwKSB7XG4gICAgICBpICs9IGxlbmd0aDtcbiAgICB9XG4gIH1cbiAgZm9yICg7IGkgPj0gMDsgaS0tKSB7XG4gICAgaWYgKHN1YmplY3RbaV0gPT09IHRhcmdldCkge1xuICAgICAgcmV0dXJuIGk7XG4gICAgfVxuICB9XG4gIHJldHVybiAtMTtcbn07XG4iLCIndXNlIHN0cmljdCc7XG5cbnZhciBiaW5kSW50ZXJuYWwzID0gcmVxdWlyZSgnLi4vZnVuY3Rpb24vYmluZEludGVybmFsMycpO1xuXG4vKipcbiAqICMgTWFwXG4gKlxuICogQSBmYXN0IGAubWFwKClgIGltcGxlbWVudGF0aW9uLlxuICpcbiAqIEBwYXJhbSAge0FycmF5fSAgICBzdWJqZWN0ICAgICBUaGUgYXJyYXkgKG9yIGFycmF5LWxpa2UpIHRvIG1hcCBvdmVyLlxuICogQHBhcmFtICB7RnVuY3Rpb259IGZuICAgICAgICAgIFRoZSBtYXBwZXIgZnVuY3Rpb24uXG4gKiBAcGFyYW0gIHtPYmplY3R9ICAgdGhpc0NvbnRleHQgVGhlIGNvbnRleHQgZm9yIHRoZSBtYXBwZXIuXG4gKiBAcmV0dXJuIHtBcnJheX0gICAgICAgICAgICAgICAgVGhlIGFycmF5IGNvbnRhaW5pbmcgdGhlIHJlc3VsdHMuXG4gKi9cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gZmFzdE1hcCAoc3ViamVjdCwgZm4sIHRoaXNDb250ZXh0KSB7XG4gIHZhciBsZW5ndGggPSBzdWJqZWN0Lmxlbmd0aCxcbiAgICAgIHJlc3VsdCA9IG5ldyBBcnJheShsZW5ndGgpLFxuICAgICAgaXRlcmF0b3IgPSB0aGlzQ29udGV4dCAhPT0gdW5kZWZpbmVkID8gYmluZEludGVybmFsMyhmbiwgdGhpc0NvbnRleHQpIDogZm4sXG4gICAgICBpO1xuICBmb3IgKGkgPSAwOyBpIDwgbGVuZ3RoOyBpKyspIHtcbiAgICByZXN1bHRbaV0gPSBpdGVyYXRvcihzdWJqZWN0W2ldLCBpLCBzdWJqZWN0KTtcbiAgfVxuICByZXR1cm4gcmVzdWx0O1xufTtcbiIsIid1c2Ugc3RyaWN0JztcblxuLyoqXG4gKiAjIFBsdWNrXG4gKiBQbHVjayB0aGUgcHJvcGVydHkgd2l0aCB0aGUgZ2l2ZW4gbmFtZSBmcm9tIGFuIGFycmF5IG9mIG9iamVjdHMuXG4gKlxuICogQHBhcmFtICB7QXJyYXl9ICBpbnB1dCBUaGUgdmFsdWVzIHRvIHBsdWNrIGZyb20uXG4gKiBAcGFyYW0gIHtTdHJpbmd9IGZpZWxkIFRoZSBuYW1lIG9mIHRoZSBmaWVsZCB0byBwbHVjay5cbiAqIEByZXR1cm4ge0FycmF5fSAgICAgICAgVGhlIHBsdWNrZWQgYXJyYXkgb2YgdmFsdWVzLlxuICovXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIGZhc3RQbHVjayAoaW5wdXQsIGZpZWxkKSB7XG4gIHZhciBsZW5ndGggPSBpbnB1dC5sZW5ndGgsXG4gICAgICBwbHVja2VkID0gW10sXG4gICAgICBjb3VudCA9IDAsXG4gICAgICB2YWx1ZSwgaTtcblxuICBmb3IgKGkgPSAwOyBpIDwgbGVuZ3RoOyBpKyspIHtcbiAgICB2YWx1ZSA9IGlucHV0W2ldO1xuICAgIGlmICh2YWx1ZSAhPSBudWxsICYmIHZhbHVlW2ZpZWxkXSAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICBwbHVja2VkW2NvdW50KytdID0gdmFsdWVbZmllbGRdO1xuICAgIH1cbiAgfVxuICByZXR1cm4gcGx1Y2tlZDtcbn07IiwiJ3VzZSBzdHJpY3QnO1xuXG52YXIgYmluZEludGVybmFsNCA9IHJlcXVpcmUoJy4uL2Z1bmN0aW9uL2JpbmRJbnRlcm5hbDQnKTtcblxuLyoqXG4gKiAjIFJlZHVjZVxuICpcbiAqIEEgZmFzdCBgLnJlZHVjZSgpYCBpbXBsZW1lbnRhdGlvbi5cbiAqXG4gKiBAcGFyYW0gIHtBcnJheX0gICAgc3ViamVjdCAgICAgIFRoZSBhcnJheSAob3IgYXJyYXktbGlrZSkgdG8gcmVkdWNlLlxuICogQHBhcmFtICB7RnVuY3Rpb259IGZuICAgICAgICAgICBUaGUgcmVkdWNlciBmdW5jdGlvbi5cbiAqIEBwYXJhbSAge21peGVkfSAgICBpbml0aWFsVmFsdWUgVGhlIGluaXRpYWwgdmFsdWUgZm9yIHRoZSByZWR1Y2VyLCBkZWZhdWx0cyB0byBzdWJqZWN0WzBdLlxuICogQHBhcmFtICB7T2JqZWN0fSAgIHRoaXNDb250ZXh0ICBUaGUgY29udGV4dCBmb3IgdGhlIHJlZHVjZXIuXG4gKiBAcmV0dXJuIHttaXhlZH0gICAgICAgICAgICAgICAgIFRoZSBmaW5hbCByZXN1bHQuXG4gKi9cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gZmFzdFJlZHVjZSAoc3ViamVjdCwgZm4sIGluaXRpYWxWYWx1ZSwgdGhpc0NvbnRleHQpIHtcbiAgdmFyIGxlbmd0aCA9IHN1YmplY3QubGVuZ3RoLFxuICAgICAgaXRlcmF0b3IgPSB0aGlzQ29udGV4dCAhPT0gdW5kZWZpbmVkID8gYmluZEludGVybmFsNChmbiwgdGhpc0NvbnRleHQpIDogZm4sXG4gICAgICBpLCByZXN1bHQ7XG5cbiAgaWYgKGluaXRpYWxWYWx1ZSA9PT0gdW5kZWZpbmVkKSB7XG4gICAgaSA9IDE7XG4gICAgcmVzdWx0ID0gc3ViamVjdFswXTtcbiAgfVxuICBlbHNlIHtcbiAgICBpID0gMDtcbiAgICByZXN1bHQgPSBpbml0aWFsVmFsdWU7XG4gIH1cblxuICBmb3IgKDsgaSA8IGxlbmd0aDsgaSsrKSB7XG4gICAgcmVzdWx0ID0gaXRlcmF0b3IocmVzdWx0LCBzdWJqZWN0W2ldLCBpLCBzdWJqZWN0KTtcbiAgfVxuXG4gIHJldHVybiByZXN1bHQ7XG59O1xuIiwiJ3VzZSBzdHJpY3QnO1xuXG52YXIgYmluZEludGVybmFsNCA9IHJlcXVpcmUoJy4uL2Z1bmN0aW9uL2JpbmRJbnRlcm5hbDQnKTtcblxuLyoqXG4gKiAjIFJlZHVjZSBSaWdodFxuICpcbiAqIEEgZmFzdCBgLnJlZHVjZVJpZ2h0KClgIGltcGxlbWVudGF0aW9uLlxuICpcbiAqIEBwYXJhbSAge0FycmF5fSAgICBzdWJqZWN0ICAgICAgVGhlIGFycmF5IChvciBhcnJheS1saWtlKSB0byByZWR1Y2UuXG4gKiBAcGFyYW0gIHtGdW5jdGlvbn0gZm4gICAgICAgICAgIFRoZSByZWR1Y2VyIGZ1bmN0aW9uLlxuICogQHBhcmFtICB7bWl4ZWR9ICAgIGluaXRpYWxWYWx1ZSBUaGUgaW5pdGlhbCB2YWx1ZSBmb3IgdGhlIHJlZHVjZXIsIGRlZmF1bHRzIHRvIHN1YmplY3RbMF0uXG4gKiBAcGFyYW0gIHtPYmplY3R9ICAgdGhpc0NvbnRleHQgIFRoZSBjb250ZXh0IGZvciB0aGUgcmVkdWNlci5cbiAqIEByZXR1cm4ge21peGVkfSAgICAgICAgICAgICAgICAgVGhlIGZpbmFsIHJlc3VsdC5cbiAqL1xubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiBmYXN0UmVkdWNlIChzdWJqZWN0LCBmbiwgaW5pdGlhbFZhbHVlLCB0aGlzQ29udGV4dCkge1xuICB2YXIgbGVuZ3RoID0gc3ViamVjdC5sZW5ndGgsXG4gICAgICBpdGVyYXRvciA9IHRoaXNDb250ZXh0ICE9PSB1bmRlZmluZWQgPyBiaW5kSW50ZXJuYWw0KGZuLCB0aGlzQ29udGV4dCkgOiBmbixcbiAgICAgIGksIHJlc3VsdDtcblxuICBpZiAoaW5pdGlhbFZhbHVlID09PSB1bmRlZmluZWQpIHtcbiAgICBpID0gbGVuZ3RoIC0gMjtcbiAgICByZXN1bHQgPSBzdWJqZWN0W2xlbmd0aCAtIDFdO1xuICB9XG4gIGVsc2Uge1xuICAgIGkgPSBsZW5ndGggLSAxO1xuICAgIHJlc3VsdCA9IGluaXRpYWxWYWx1ZTtcbiAgfVxuXG4gIGZvciAoOyBpID49IDA7IGktLSkge1xuICAgIHJlc3VsdCA9IGl0ZXJhdG9yKHJlc3VsdCwgc3ViamVjdFtpXSwgaSwgc3ViamVjdCk7XG4gIH1cblxuICByZXR1cm4gcmVzdWx0O1xufTtcbiIsIid1c2Ugc3RyaWN0JztcblxudmFyIGJpbmRJbnRlcm5hbDMgPSByZXF1aXJlKCcuLi9mdW5jdGlvbi9iaW5kSW50ZXJuYWwzJyk7XG5cbi8qKlxuICogIyBTb21lXG4gKlxuICogQSBmYXN0IGAuc29tZSgpYCBpbXBsZW1lbnRhdGlvbi5cbiAqXG4gKiBAcGFyYW0gIHtBcnJheX0gICAgc3ViamVjdCAgICAgVGhlIGFycmF5IChvciBhcnJheS1saWtlKSB0byBpdGVyYXRlIG92ZXIuXG4gKiBAcGFyYW0gIHtGdW5jdGlvbn0gZm4gICAgICAgICAgVGhlIHZpc2l0b3IgZnVuY3Rpb24uXG4gKiBAcGFyYW0gIHtPYmplY3R9ICAgdGhpc0NvbnRleHQgVGhlIGNvbnRleHQgZm9yIHRoZSB2aXNpdG9yLlxuICogQHJldHVybiB7Qm9vbGVhbn0gICAgICAgICAgICAgIHRydWUgaWYgYXQgbGVhc3Qgb25lIGl0ZW0gaW4gdGhlIGFycmF5IHBhc3NlcyB0aGUgdHJ1dGggdGVzdC5cbiAqL1xubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiBmYXN0U29tZSAoc3ViamVjdCwgZm4sIHRoaXNDb250ZXh0KSB7XG4gIHZhciBsZW5ndGggPSBzdWJqZWN0Lmxlbmd0aCxcbiAgICAgIGl0ZXJhdG9yID0gdGhpc0NvbnRleHQgIT09IHVuZGVmaW5lZCA/IGJpbmRJbnRlcm5hbDMoZm4sIHRoaXNDb250ZXh0KSA6IGZuLFxuICAgICAgaTtcbiAgZm9yIChpID0gMDsgaSA8IGxlbmd0aDsgaSsrKSB7XG4gICAgaWYgKGl0ZXJhdG9yKHN1YmplY3RbaV0sIGksIHN1YmplY3QpKSB7XG4gICAgICByZXR1cm4gdHJ1ZTtcbiAgICB9XG4gIH1cbiAgcmV0dXJuIGZhbHNlO1xufTtcbiIsIid1c2Ugc3RyaWN0JztcblxudmFyIGNsb25lQXJyYXkgPSByZXF1aXJlKCcuL2FycmF5L2Nsb25lJyk7XG52YXIgY2xvbmVPYmplY3QgPSByZXF1aXJlKCcuL29iamVjdC9jbG9uZScpO1xuXG4vKipcbiAqICMgQ2xvbmVcbiAqXG4gKiBDbG9uZSBhbiBpdGVtLiBQcmltaXRpdmUgdmFsdWVzIHdpbGwgYmUgcmV0dXJuZWQgZGlyZWN0bHksXG4gKiBhcnJheXMgYW5kIG9iamVjdHMgd2lsbCBiZSBzaGFsbG93IGNsb25lZC4gSWYgeW91IGtub3cgdGhlXG4gKiB0eXBlIG9mIGlucHV0IHlvdSdyZSBkZWFsaW5nIHdpdGgsIGNhbGwgYC5jbG9uZUFycmF5KClgIG9yIGAuY2xvbmVPYmplY3QoKWBcbiAqIGluc3RlYWQuXG4gKlxuICogQHBhcmFtICB7bWl4ZWR9IGlucHV0IFRoZSBpbnB1dCB0byBjbG9uZS5cbiAqIEByZXR1cm4ge21peGVkfSAgICAgICBUaGUgY2xvbmVkIGlucHV0LlxuICovXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIGNsb25lIChpbnB1dCkge1xuICBpZiAoIWlucHV0IHx8IHR5cGVvZiBpbnB1dCAhPT0gJ29iamVjdCcpIHtcbiAgICByZXR1cm4gaW5wdXQ7XG4gIH1cbiAgZWxzZSBpZiAoQXJyYXkuaXNBcnJheShpbnB1dCkpIHtcbiAgICByZXR1cm4gY2xvbmVBcnJheShpbnB1dCk7XG4gIH1cbiAgZWxzZSB7XG4gICAgcmV0dXJuIGNsb25lT2JqZWN0KGlucHV0KTtcbiAgfVxufTtcbiIsIid1c2Ugc3RyaWN0JztcblxudmFyIGZpbHRlckFycmF5ID0gcmVxdWlyZSgnLi9hcnJheS9maWx0ZXInKSxcbiAgICBmaWx0ZXJPYmplY3QgPSByZXF1aXJlKCcuL29iamVjdC9maWx0ZXInKTtcblxuLyoqXG4gKiAjIEZpbHRlclxuICpcbiAqIEEgZmFzdCBgLmZpbHRlcigpYCBpbXBsZW1lbnRhdGlvbi5cbiAqXG4gKiBAcGFyYW0gIHtBcnJheXxPYmplY3R9IHN1YmplY3QgICAgIFRoZSBhcnJheSBvciBvYmplY3QgdG8gZmlsdGVyLlxuICogQHBhcmFtICB7RnVuY3Rpb259ICAgICBmbiAgICAgICAgICBUaGUgZmlsdGVyIGZ1bmN0aW9uLlxuICogQHBhcmFtICB7T2JqZWN0fSAgICAgICB0aGlzQ29udGV4dCBUaGUgY29udGV4dCBmb3IgdGhlIGZpbHRlci5cbiAqIEByZXR1cm4ge0FycmF5fE9iamVjdH0gICAgICAgICAgICAgVGhlIGFycmF5IG9yIG9iamVjdCBjb250YWluaW5nIHRoZSBmaWx0ZXJlZCByZXN1bHRzLlxuICovXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIGZhc3RGaWx0ZXIgKHN1YmplY3QsIGZuLCB0aGlzQ29udGV4dCkge1xuICBpZiAoc3ViamVjdCBpbnN0YW5jZW9mIEFycmF5KSB7XG4gICAgcmV0dXJuIGZpbHRlckFycmF5KHN1YmplY3QsIGZuLCB0aGlzQ29udGV4dCk7XG4gIH1cbiAgZWxzZSB7XG4gICAgcmV0dXJuIGZpbHRlck9iamVjdChzdWJqZWN0LCBmbiwgdGhpc0NvbnRleHQpO1xuICB9XG59OyIsIid1c2Ugc3RyaWN0JztcblxudmFyIGZvckVhY2hBcnJheSA9IHJlcXVpcmUoJy4vYXJyYXkvZm9yRWFjaCcpLFxuICAgIGZvckVhY2hPYmplY3QgPSByZXF1aXJlKCcuL29iamVjdC9mb3JFYWNoJyk7XG5cbi8qKlxuICogIyBGb3JFYWNoXG4gKlxuICogQSBmYXN0IGAuZm9yRWFjaCgpYCBpbXBsZW1lbnRhdGlvbi5cbiAqXG4gKiBAcGFyYW0gIHtBcnJheXxPYmplY3R9IHN1YmplY3QgICAgIFRoZSBhcnJheSBvciBvYmplY3QgdG8gaXRlcmF0ZSBvdmVyLlxuICogQHBhcmFtICB7RnVuY3Rpb259ICAgICBmbiAgICAgICAgICBUaGUgdmlzaXRvciBmdW5jdGlvbi5cbiAqIEBwYXJhbSAge09iamVjdH0gICAgICAgdGhpc0NvbnRleHQgVGhlIGNvbnRleHQgZm9yIHRoZSB2aXNpdG9yLlxuICovXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIGZhc3RGb3JFYWNoIChzdWJqZWN0LCBmbiwgdGhpc0NvbnRleHQpIHtcbiAgaWYgKHN1YmplY3QgaW5zdGFuY2VvZiBBcnJheSkge1xuICAgIHJldHVybiBmb3JFYWNoQXJyYXkoc3ViamVjdCwgZm4sIHRoaXNDb250ZXh0KTtcbiAgfVxuICBlbHNlIHtcbiAgICByZXR1cm4gZm9yRWFjaE9iamVjdChzdWJqZWN0LCBmbiwgdGhpc0NvbnRleHQpO1xuICB9XG59OyIsIid1c2Ugc3RyaWN0JztcblxudmFyIGFwcGx5V2l0aENvbnRleHQgPSByZXF1aXJlKCcuL2FwcGx5V2l0aENvbnRleHQnKTtcbnZhciBhcHBseU5vQ29udGV4dCA9IHJlcXVpcmUoJy4vYXBwbHlOb0NvbnRleHQnKTtcblxuLyoqXG4gKiAjIEFwcGx5XG4gKlxuICogRmFzdGVyIHZlcnNpb24gb2YgYEZ1bmN0aW9uOjphcHBseSgpYCwgb3B0aW1pc2VkIGZvciA4IGFyZ3VtZW50cyBvciBmZXdlci5cbiAqXG4gKlxuICogQHBhcmFtICB7RnVuY3Rpb259IHN1YmplY3QgICBUaGUgZnVuY3Rpb24gdG8gYXBwbHkuXG4gKiBAcGFyYW0gIHtPYmplY3R9IHRoaXNDb250ZXh0IFRoZSBjb250ZXh0IGZvciB0aGUgZnVuY3Rpb24sIHNldCB0byB1bmRlZmluZWQgb3IgbnVsbCBpZiBubyBjb250ZXh0IGlzIHJlcXVpcmVkLlxuICogQHBhcmFtICB7QXJyYXl9IGFyZ3MgICAgICAgICBUaGUgYXJndW1lbnRzIGZvciB0aGUgZnVuY3Rpb24uXG4gKiBAcmV0dXJuIHttaXhlZH0gICAgICAgICAgICAgIFRoZSByZXN1bHQgb2YgdGhlIGZ1bmN0aW9uIGludm9jYXRpb24uXG4gKi9cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gZmFzdEFwcGx5IChzdWJqZWN0LCB0aGlzQ29udGV4dCwgYXJncykge1xuICByZXR1cm4gdGhpc0NvbnRleHQgIT09IHVuZGVmaW5lZCA/IGFwcGx5V2l0aENvbnRleHQoc3ViamVjdCwgdGhpc0NvbnRleHQsIGFyZ3MpIDogYXBwbHlOb0NvbnRleHQoc3ViamVjdCwgYXJncyk7XG59O1xuIiwiJ3VzZSBzdHJpY3QnO1xuXG4vKipcbiAqIEludGVybmFsIGhlbHBlciBmb3IgYXBwbHlpbmcgYSBmdW5jdGlvbiB3aXRob3V0IGEgY29udGV4dC5cbiAqL1xubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiBhcHBseU5vQ29udGV4dCAoc3ViamVjdCwgYXJncykge1xuICBzd2l0Y2ggKGFyZ3MubGVuZ3RoKSB7XG4gICAgY2FzZSAwOlxuICAgICAgcmV0dXJuIHN1YmplY3QoKTtcbiAgICBjYXNlIDE6XG4gICAgICByZXR1cm4gc3ViamVjdChhcmdzWzBdKTtcbiAgICBjYXNlIDI6XG4gICAgICByZXR1cm4gc3ViamVjdChhcmdzWzBdLCBhcmdzWzFdKTtcbiAgICBjYXNlIDM6XG4gICAgICByZXR1cm4gc3ViamVjdChhcmdzWzBdLCBhcmdzWzFdLCBhcmdzWzJdKTtcbiAgICBjYXNlIDQ6XG4gICAgICByZXR1cm4gc3ViamVjdChhcmdzWzBdLCBhcmdzWzFdLCBhcmdzWzJdLCBhcmdzWzNdKTtcbiAgICBjYXNlIDU6XG4gICAgICByZXR1cm4gc3ViamVjdChhcmdzWzBdLCBhcmdzWzFdLCBhcmdzWzJdLCBhcmdzWzNdLCBhcmdzWzRdKTtcbiAgICBjYXNlIDY6XG4gICAgICByZXR1cm4gc3ViamVjdChhcmdzWzBdLCBhcmdzWzFdLCBhcmdzWzJdLCBhcmdzWzNdLCBhcmdzWzRdLCBhcmdzWzVdKTtcbiAgICBjYXNlIDc6XG4gICAgICByZXR1cm4gc3ViamVjdChhcmdzWzBdLCBhcmdzWzFdLCBhcmdzWzJdLCBhcmdzWzNdLCBhcmdzWzRdLCBhcmdzWzVdLCBhcmdzWzZdKTtcbiAgICBjYXNlIDg6XG4gICAgICByZXR1cm4gc3ViamVjdChhcmdzWzBdLCBhcmdzWzFdLCBhcmdzWzJdLCBhcmdzWzNdLCBhcmdzWzRdLCBhcmdzWzVdLCBhcmdzWzZdLCBhcmdzWzddKTtcbiAgICBkZWZhdWx0OlxuICAgICAgcmV0dXJuIHN1YmplY3QuYXBwbHkodW5kZWZpbmVkLCBhcmdzKTtcbiAgfVxufTtcbiIsIid1c2Ugc3RyaWN0JztcblxuLyoqXG4gKiBJbnRlcm5hbCBoZWxwZXIgZm9yIGFwcGx5aW5nIGEgZnVuY3Rpb24gd2l0aCBhIGNvbnRleHQuXG4gKi9cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gYXBwbHlXaXRoQ29udGV4dCAoc3ViamVjdCwgdGhpc0NvbnRleHQsIGFyZ3MpIHtcbiAgc3dpdGNoIChhcmdzLmxlbmd0aCkge1xuICAgIGNhc2UgMDpcbiAgICAgIHJldHVybiBzdWJqZWN0LmNhbGwodGhpc0NvbnRleHQpO1xuICAgIGNhc2UgMTpcbiAgICAgIHJldHVybiBzdWJqZWN0LmNhbGwodGhpc0NvbnRleHQsIGFyZ3NbMF0pO1xuICAgIGNhc2UgMjpcbiAgICAgIHJldHVybiBzdWJqZWN0LmNhbGwodGhpc0NvbnRleHQsIGFyZ3NbMF0sIGFyZ3NbMV0pO1xuICAgIGNhc2UgMzpcbiAgICAgIHJldHVybiBzdWJqZWN0LmNhbGwodGhpc0NvbnRleHQsIGFyZ3NbMF0sIGFyZ3NbMV0sIGFyZ3NbMl0pO1xuICAgIGNhc2UgNDpcbiAgICAgIHJldHVybiBzdWJqZWN0LmNhbGwodGhpc0NvbnRleHQsIGFyZ3NbMF0sIGFyZ3NbMV0sIGFyZ3NbMl0sIGFyZ3NbM10pO1xuICAgIGNhc2UgNTpcbiAgICAgIHJldHVybiBzdWJqZWN0LmNhbGwodGhpc0NvbnRleHQsIGFyZ3NbMF0sIGFyZ3NbMV0sIGFyZ3NbMl0sIGFyZ3NbM10sIGFyZ3NbNF0pO1xuICAgIGNhc2UgNjpcbiAgICAgIHJldHVybiBzdWJqZWN0LmNhbGwodGhpc0NvbnRleHQsIGFyZ3NbMF0sIGFyZ3NbMV0sIGFyZ3NbMl0sIGFyZ3NbM10sIGFyZ3NbNF0sIGFyZ3NbNV0pO1xuICAgIGNhc2UgNzpcbiAgICAgIHJldHVybiBzdWJqZWN0LmNhbGwodGhpc0NvbnRleHQsIGFyZ3NbMF0sIGFyZ3NbMV0sIGFyZ3NbMl0sIGFyZ3NbM10sIGFyZ3NbNF0sIGFyZ3NbNV0sIGFyZ3NbNl0pO1xuICAgIGNhc2UgODpcbiAgICAgIHJldHVybiBzdWJqZWN0LmNhbGwodGhpc0NvbnRleHQsIGFyZ3NbMF0sIGFyZ3NbMV0sIGFyZ3NbMl0sIGFyZ3NbM10sIGFyZ3NbNF0sIGFyZ3NbNV0sIGFyZ3NbNl0sIGFyZ3NbN10pO1xuICAgIGRlZmF1bHQ6XG4gICAgICByZXR1cm4gc3ViamVjdC5hcHBseSh0aGlzQ29udGV4dCwgYXJncyk7XG4gIH1cbn07XG4iLCIndXNlIHN0cmljdCc7XG5cbnZhciBhcHBseVdpdGhDb250ZXh0ID0gcmVxdWlyZSgnLi9hcHBseVdpdGhDb250ZXh0Jyk7XG52YXIgYXBwbHlOb0NvbnRleHQgPSByZXF1aXJlKCcuL2FwcGx5Tm9Db250ZXh0Jyk7XG5cbi8qKlxuICogIyBCaW5kXG4gKiBBbmFsb2d1ZSBvZiBgRnVuY3Rpb246OmJpbmQoKWAuXG4gKlxuICogYGBganNcbiAqIHZhciBiaW5kID0gcmVxdWlyZSgnZmFzdC5qcycpLmJpbmQ7XG4gKiB2YXIgYm91bmQgPSBiaW5kKG15ZnVuYywgdGhpcywgMSwgMiwgMyk7XG4gKlxuICogYm91bmQoNCk7XG4gKiBgYGBcbiAqXG4gKlxuICogQHBhcmFtICB7RnVuY3Rpb259IGZuICAgICAgICAgIFRoZSBmdW5jdGlvbiB3aGljaCBzaG91bGQgYmUgYm91bmQuXG4gKiBAcGFyYW0gIHtPYmplY3R9ICAgdGhpc0NvbnRleHQgVGhlIGNvbnRleHQgdG8gYmluZCB0aGUgZnVuY3Rpb24gdG8uXG4gKiBAcGFyYW0gIHttaXhlZH0gICAgYXJncywgLi4uICAgQWRkaXRpb25hbCBhcmd1bWVudHMgdG8gcHJlLWJpbmQuXG4gKiBAcmV0dXJuIHtGdW5jdGlvbn0gICAgICAgICAgICAgVGhlIGJvdW5kIGZ1bmN0aW9uLlxuICovXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIGZhc3RCaW5kIChmbiwgdGhpc0NvbnRleHQpIHtcbiAgdmFyIGJvdW5kTGVuZ3RoID0gYXJndW1lbnRzLmxlbmd0aCAtIDIsXG4gICAgICBib3VuZEFyZ3M7XG5cbiAgaWYgKGJvdW5kTGVuZ3RoID4gMCkge1xuICAgIGJvdW5kQXJncyA9IG5ldyBBcnJheShib3VuZExlbmd0aCk7XG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCBib3VuZExlbmd0aDsgaSsrKSB7XG4gICAgICBib3VuZEFyZ3NbaV0gPSBhcmd1bWVudHNbaSArIDJdO1xuICAgIH1cbiAgICBpZiAodGhpc0NvbnRleHQgIT09IHVuZGVmaW5lZCkge1xuICAgICAgcmV0dXJuIGZ1bmN0aW9uICgpIHtcbiAgICAgICAgdmFyIGxlbmd0aCA9IGFyZ3VtZW50cy5sZW5ndGgsXG4gICAgICAgICAgICBhcmdzID0gbmV3IEFycmF5KGJvdW5kTGVuZ3RoICsgbGVuZ3RoKSxcbiAgICAgICAgICAgIGk7XG4gICAgICAgIGZvciAoaSA9IDA7IGkgPCBib3VuZExlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgYXJnc1tpXSA9IGJvdW5kQXJnc1tpXTtcbiAgICAgICAgfVxuICAgICAgICBmb3IgKGkgPSAwOyBpIDwgbGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICBhcmdzW2JvdW5kTGVuZ3RoICsgaV0gPSBhcmd1bWVudHNbaV07XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIGFwcGx5V2l0aENvbnRleHQoZm4sIHRoaXNDb250ZXh0LCBhcmdzKTtcbiAgICAgIH07XG4gICAgfVxuICAgIGVsc2Uge1xuICAgICAgcmV0dXJuIGZ1bmN0aW9uICgpIHtcbiAgICAgICAgdmFyIGxlbmd0aCA9IGFyZ3VtZW50cy5sZW5ndGgsXG4gICAgICAgICAgICBhcmdzID0gbmV3IEFycmF5KGJvdW5kTGVuZ3RoICsgbGVuZ3RoKSxcbiAgICAgICAgICAgIGk7XG4gICAgICAgIGZvciAoaSA9IDA7IGkgPCBib3VuZExlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgYXJnc1tpXSA9IGJvdW5kQXJnc1tpXTtcbiAgICAgICAgfVxuICAgICAgICBmb3IgKGkgPSAwOyBpIDwgbGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICBhcmdzW2JvdW5kTGVuZ3RoICsgaV0gPSBhcmd1bWVudHNbaV07XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIGFwcGx5Tm9Db250ZXh0KGZuLCBhcmdzKTtcbiAgICAgIH07XG4gICAgfVxuICB9XG4gIGlmICh0aGlzQ29udGV4dCAhPT0gdW5kZWZpbmVkKSB7XG4gICAgcmV0dXJuIGZ1bmN0aW9uICgpIHtcbiAgICAgIHJldHVybiBhcHBseVdpdGhDb250ZXh0KGZuLCB0aGlzQ29udGV4dCwgYXJndW1lbnRzKTtcbiAgICB9O1xuICB9XG4gIGVsc2Uge1xuICAgIHJldHVybiBmdW5jdGlvbiAoKSB7XG4gICAgICByZXR1cm4gYXBwbHlOb0NvbnRleHQoZm4sIGFyZ3VtZW50cyk7XG4gICAgfTtcbiAgfVxufTtcbiIsIid1c2Ugc3RyaWN0JztcblxuLyoqXG4gKiBJbnRlcm5hbCBoZWxwZXIgdG8gYmluZCBhIGZ1bmN0aW9uIGtub3duIHRvIGhhdmUgMyBhcmd1bWVudHNcbiAqIHRvIGEgZ2l2ZW4gY29udGV4dC5cbiAqL1xubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiBiaW5kSW50ZXJuYWwzIChmdW5jLCB0aGlzQ29udGV4dCkge1xuICByZXR1cm4gZnVuY3Rpb24gKGEsIGIsIGMpIHtcbiAgICByZXR1cm4gZnVuYy5jYWxsKHRoaXNDb250ZXh0LCBhLCBiLCBjKTtcbiAgfTtcbn07XG4iLCIndXNlIHN0cmljdCc7XG5cbi8qKlxuICogSW50ZXJuYWwgaGVscGVyIHRvIGJpbmQgYSBmdW5jdGlvbiBrbm93biB0byBoYXZlIDQgYXJndW1lbnRzXG4gKiB0byBhIGdpdmVuIGNvbnRleHQuXG4gKi9cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gYmluZEludGVybmFsNCAoZnVuYywgdGhpc0NvbnRleHQpIHtcbiAgcmV0dXJuIGZ1bmN0aW9uIChhLCBiLCBjLCBkKSB7XG4gICAgcmV0dXJuIGZ1bmMuY2FsbCh0aGlzQ29udGV4dCwgYSwgYiwgYywgZCk7XG4gIH07XG59O1xuIiwiJ3VzZSBzdHJpY3QnO1xuXG5leHBvcnRzLmFwcGx5ID0gcmVxdWlyZSgnLi9hcHBseScpO1xuZXhwb3J0cy5iaW5kID0gcmVxdWlyZSgnLi9iaW5kJyk7XG5leHBvcnRzLnBhcnRpYWwgPSByZXF1aXJlKCcuL3BhcnRpYWwnKTtcbmV4cG9ydHMucGFydGlhbENvbnN0cnVjdG9yID0gcmVxdWlyZSgnLi9wYXJ0aWFsQ29uc3RydWN0b3InKTtcbmV4cG9ydHMudHJ5ID0gcmVxdWlyZSgnLi90cnknKTtcbiIsIid1c2Ugc3RyaWN0JztcblxudmFyIGFwcGx5V2l0aENvbnRleHQgPSByZXF1aXJlKCcuL2FwcGx5V2l0aENvbnRleHQnKTtcblxuLyoqXG4gKiAjIFBhcnRpYWwgQXBwbGljYXRpb25cbiAqXG4gKiBQYXJ0aWFsbHkgYXBwbHkgYSBmdW5jdGlvbi4gVGhpcyBpcyBzaW1pbGFyIHRvIGAuYmluZCgpYCxcbiAqIGJ1dCB3aXRoIG9uZSBpbXBvcnRhbnQgZGlmZmVyZW5jZSAtIHRoZSByZXR1cm5lZCBmdW5jdGlvbiBpcyBub3QgYm91bmRcbiAqIHRvIGEgcGFydGljdWxhciBjb250ZXh0LiBUaGlzIG1ha2VzIGl0IGVhc3kgdG8gYWRkIHBhcnRpYWxseVxuICogYXBwbGllZCBtZXRob2RzIHRvIG9iamVjdHMuIElmIHlvdSBuZWVkIHRvIGJpbmQgdG8gYSBjb250ZXh0LFxuICogdXNlIGAuYmluZCgpYCBpbnN0ZWFkLlxuICpcbiAqID4gTm90ZTogVGhpcyBmdW5jdGlvbiBkb2VzIG5vdCBzdXBwb3J0IHBhcnRpYWwgYXBwbGljYXRpb24gZm9yXG4gKiBjb25zdHJ1Y3RvcnMsIGZvciB0aGF0IHNlZSBgcGFydGlhbENvbnN0cnVjdG9yKClgXG4gKlxuICpcbiAqIEBwYXJhbSAge0Z1bmN0aW9ufSBmbiAgICAgICAgICBUaGUgZnVuY3Rpb24gdG8gcGFydGlhbGx5IGFwcGx5LlxuICogQHBhcmFtICB7bWl4ZWR9ICAgIGFyZ3MsIC4uLiAgIEFyZ3VtZW50cyB0byBwcmUtYmluZC5cbiAqIEByZXR1cm4ge0Z1bmN0aW9ufSAgICAgICAgICAgICBUaGUgcGFydGlhbGx5IGFwcGxpZWQgZnVuY3Rpb24uXG4gKi9cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gZmFzdFBhcnRpYWwgKGZuKSB7XG4gIHZhciBib3VuZExlbmd0aCA9IGFyZ3VtZW50cy5sZW5ndGggLSAxLFxuICAgICAgYm91bmRBcmdzO1xuXG4gIGJvdW5kQXJncyA9IG5ldyBBcnJheShib3VuZExlbmd0aCk7XG4gIGZvciAodmFyIGkgPSAwOyBpIDwgYm91bmRMZW5ndGg7IGkrKykge1xuICAgIGJvdW5kQXJnc1tpXSA9IGFyZ3VtZW50c1tpICsgMV07XG4gIH1cbiAgcmV0dXJuIGZ1bmN0aW9uICgpIHtcbiAgICB2YXIgbGVuZ3RoID0gYXJndW1lbnRzLmxlbmd0aCxcbiAgICAgICAgYXJncyA9IG5ldyBBcnJheShib3VuZExlbmd0aCArIGxlbmd0aCksXG4gICAgICAgIGk7XG4gICAgZm9yIChpID0gMDsgaSA8IGJvdW5kTGVuZ3RoOyBpKyspIHtcbiAgICAgIGFyZ3NbaV0gPSBib3VuZEFyZ3NbaV07XG4gICAgfVxuICAgIGZvciAoaSA9IDA7IGkgPCBsZW5ndGg7IGkrKykge1xuICAgICAgYXJnc1tib3VuZExlbmd0aCArIGldID0gYXJndW1lbnRzW2ldO1xuICAgIH1cbiAgICByZXR1cm4gYXBwbHlXaXRoQ29udGV4dChmbiwgdGhpcywgYXJncyk7XG4gIH07XG59O1xuIiwiJ3VzZSBzdHJpY3QnO1xuXG52YXIgYXBwbHlXaXRoQ29udGV4dCA9IHJlcXVpcmUoJy4vYXBwbHlXaXRoQ29udGV4dCcpO1xuXG4vKipcbiAqICMgUGFydGlhbCBDb25zdHJ1Y3RvclxuICpcbiAqIFBhcnRpYWxseSBhcHBseSBhIGNvbnN0cnVjdG9yIGZ1bmN0aW9uLiBUaGUgcmV0dXJuZWQgZnVuY3Rpb25cbiAqIHdpbGwgd29yayB3aXRoIG9yIHdpdGhvdXQgdGhlIGBuZXdgIGtleXdvcmQuXG4gKlxuICpcbiAqIEBwYXJhbSAge0Z1bmN0aW9ufSBmbiAgICAgICAgICBUaGUgY29uc3RydWN0b3IgZnVuY3Rpb24gdG8gcGFydGlhbGx5IGFwcGx5LlxuICogQHBhcmFtICB7bWl4ZWR9ICAgIGFyZ3MsIC4uLiAgIEFyZ3VtZW50cyB0byBwcmUtYmluZC5cbiAqIEByZXR1cm4ge0Z1bmN0aW9ufSAgICAgICAgICAgICBUaGUgcGFydGlhbGx5IGFwcGxpZWQgY29uc3RydWN0b3IuXG4gKi9cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gZmFzdFBhcnRpYWxDb25zdHJ1Y3RvciAoZm4pIHtcbiAgdmFyIGJvdW5kTGVuZ3RoID0gYXJndW1lbnRzLmxlbmd0aCAtIDEsXG4gICAgICBib3VuZEFyZ3M7XG5cbiAgYm91bmRBcmdzID0gbmV3IEFycmF5KGJvdW5kTGVuZ3RoKTtcbiAgZm9yICh2YXIgaSA9IDA7IGkgPCBib3VuZExlbmd0aDsgaSsrKSB7XG4gICAgYm91bmRBcmdzW2ldID0gYXJndW1lbnRzW2kgKyAxXTtcbiAgfVxuICByZXR1cm4gZnVuY3Rpb24gcGFydGlhbGVkICgpIHtcbiAgICB2YXIgbGVuZ3RoID0gYXJndW1lbnRzLmxlbmd0aCxcbiAgICAgICAgYXJncyA9IG5ldyBBcnJheShib3VuZExlbmd0aCArIGxlbmd0aCksXG4gICAgICAgIGk7XG4gICAgZm9yIChpID0gMDsgaSA8IGJvdW5kTGVuZ3RoOyBpKyspIHtcbiAgICAgIGFyZ3NbaV0gPSBib3VuZEFyZ3NbaV07XG4gICAgfVxuICAgIGZvciAoaSA9IDA7IGkgPCBsZW5ndGg7IGkrKykge1xuICAgICAgYXJnc1tib3VuZExlbmd0aCArIGldID0gYXJndW1lbnRzW2ldO1xuICAgIH1cblxuICAgIHZhciB0aGlzQ29udGV4dCA9IE9iamVjdC5jcmVhdGUoZm4ucHJvdG90eXBlKSxcbiAgICAgICAgcmVzdWx0ID0gYXBwbHlXaXRoQ29udGV4dChmbiwgdGhpc0NvbnRleHQsIGFyZ3MpO1xuXG4gICAgaWYgKHJlc3VsdCAhPSBudWxsICYmICh0eXBlb2YgcmVzdWx0ID09PSAnb2JqZWN0JyB8fCB0eXBlb2YgcmVzdWx0ID09PSAnZnVuY3Rpb24nKSkge1xuICAgICAgcmV0dXJuIHJlc3VsdDtcbiAgICB9XG4gICAgZWxzZSB7XG4gICAgICByZXR1cm4gdGhpc0NvbnRleHQ7XG4gICAgfVxuICB9O1xufTtcbiIsIid1c2Ugc3RyaWN0JztcblxuLyoqXG4gKiAjIFRyeVxuICpcbiAqIEFsbG93cyBmdW5jdGlvbnMgdG8gYmUgb3B0aW1pc2VkIGJ5IGlzb2xhdGluZyBgdHJ5IHt9IGNhdGNoIChlKSB7fWAgYmxvY2tzXG4gKiBvdXRzaWRlIHRoZSBmdW5jdGlvbiBkZWNsYXJhdGlvbi4gUmV0dXJucyBlaXRoZXIgdGhlIHJlc3VsdCBvZiB0aGUgZnVuY3Rpb24gb3IgYW4gRXJyb3JcbiAqIG9iamVjdCBpZiBvbmUgd2FzIHRocm93bi4gVGhlIGNhbGxlciBzaG91bGQgdGhlbiBjaGVjayBmb3IgYHJlc3VsdCBpbnN0YW5jZW9mIEVycm9yYC5cbiAqXG4gKiBgYGBqc1xuICogdmFyIHJlc3VsdCA9IGZhc3QudHJ5KG15RnVuY3Rpb24pO1xuICogaWYgKHJlc3VsdCBpbnN0YW5jZW9mIEVycm9yKSB7XG4gKiAgICBjb25zb2xlLmxvZygnc29tZXRoaW5nIHdlbnQgd3JvbmcnKTtcbiAqIH1cbiAqIGVsc2Uge1xuICogICBjb25zb2xlLmxvZygncmVzdWx0OicsIHJlc3VsdCk7XG4gKiB9XG4gKiBgYGBcbiAqXG4gKiBAcGFyYW0gIHtGdW5jdGlvbn0gZm4gVGhlIGZ1bmN0aW9uIHRvIGludm9rZS5cbiAqIEByZXR1cm4ge21peGVkfSAgICAgICBUaGUgcmVzdWx0IG9mIHRoZSBmdW5jdGlvbiwgb3IgYW4gYEVycm9yYCBvYmplY3QuXG4gKi9cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gZmFzdFRyeSAoZm4pIHtcbiAgdHJ5IHtcbiAgICByZXR1cm4gZm4oKTtcbiAgfVxuICBjYXRjaCAoZSkge1xuICAgIGlmICghKGUgaW5zdGFuY2VvZiBFcnJvcikpIHtcbiAgICAgIHJldHVybiBuZXcgRXJyb3IoZSk7XG4gICAgfVxuICAgIGVsc2Uge1xuICAgICAgcmV0dXJuIGU7XG4gICAgfVxuICB9XG59O1xuIiwiJ3VzZSBzdHJpY3QnO1xuXG4vKipcbiAqICMgQ29uc3RydWN0b3JcbiAqXG4gKiBQcm92aWRlZCBhcyBhIGNvbnZlbmllbnQgd3JhcHBlciBhcm91bmQgRmFzdCBmdW5jdGlvbnMuXG4gKlxuICogYGBganNcbiAqIHZhciBhcnIgPSBmYXN0KFsxLDIsMyw0LDUsNl0pO1xuICpcbiAqIHZhciByZXN1bHQgPSBhcnIuZmlsdGVyKGZ1bmN0aW9uIChpdGVtKSB7XG4gKiAgIHJldHVybiBpdGVtICUgMiA9PT0gMDtcbiAqIH0pO1xuICpcbiAqIHJlc3VsdCBpbnN0YW5jZW9mIEZhc3Q7IC8vIHRydWVcbiAqIHJlc3VsdC5sZW5ndGg7IC8vIDNcbiAqIGBgYFxuICpcbiAqXG4gKiBAcGFyYW0ge0FycmF5fSB2YWx1ZSBUaGUgdmFsdWUgdG8gd3JhcC5cbiAqL1xuZnVuY3Rpb24gRmFzdCAodmFsdWUpIHtcbiAgaWYgKCEodGhpcyBpbnN0YW5jZW9mIEZhc3QpKSB7XG4gICAgcmV0dXJuIG5ldyBGYXN0KHZhbHVlKTtcbiAgfVxuICB0aGlzLnZhbHVlID0gdmFsdWUgfHwgW107XG59XG5cbm1vZHVsZS5leHBvcnRzID0gZXhwb3J0cyA9IEZhc3Q7XG5cbkZhc3QuYXJyYXkgPSByZXF1aXJlKCcuL2FycmF5Jyk7XG5GYXN0WydmdW5jdGlvbiddID0gRmFzdC5mbiA9IHJlcXVpcmUoJy4vZnVuY3Rpb24nKTtcbkZhc3Qub2JqZWN0ID0gcmVxdWlyZSgnLi9vYmplY3QnKTtcbkZhc3Quc3RyaW5nID0gcmVxdWlyZSgnLi9zdHJpbmcnKTtcblxuXG5GYXN0LmFwcGx5ID0gRmFzdFsnZnVuY3Rpb24nXS5hcHBseTtcbkZhc3QuYmluZCA9IEZhc3RbJ2Z1bmN0aW9uJ10uYmluZDtcbkZhc3QucGFydGlhbCA9IEZhc3RbJ2Z1bmN0aW9uJ10ucGFydGlhbDtcbkZhc3QucGFydGlhbENvbnN0cnVjdG9yID0gRmFzdFsnZnVuY3Rpb24nXS5wYXJ0aWFsQ29uc3RydWN0b3I7XG5GYXN0Wyd0cnknXSA9IEZhc3QuYXR0ZW1wdCA9IEZhc3RbJ2Z1bmN0aW9uJ11bJ3RyeSddO1xuXG5GYXN0LmFzc2lnbiA9IEZhc3Qub2JqZWN0LmFzc2lnbjtcbkZhc3QuY2xvbmVPYmplY3QgPSBGYXN0Lm9iamVjdC5jbG9uZTsgLy8gQGRlcHJlY2F0ZWQgdXNlIGZhc3Qub2JqZWN0LmNsb25lKClcbkZhc3Qua2V5cyA9IEZhc3Qub2JqZWN0LmtleXM7XG5GYXN0LnZhbHVlcyA9IEZhc3Qub2JqZWN0LnZhbHVlcztcblxuXG5GYXN0LmNsb25lID0gcmVxdWlyZSgnLi9jbG9uZScpO1xuRmFzdC5tYXAgPSByZXF1aXJlKCcuL21hcCcpO1xuRmFzdC5maWx0ZXIgPSByZXF1aXJlKCcuL2ZpbHRlcicpO1xuRmFzdC5mb3JFYWNoID0gcmVxdWlyZSgnLi9mb3JFYWNoJyk7XG5GYXN0LnJlZHVjZSA9IHJlcXVpcmUoJy4vcmVkdWNlJyk7XG5GYXN0LnJlZHVjZVJpZ2h0ID0gcmVxdWlyZSgnLi9yZWR1Y2VSaWdodCcpO1xuXG5cbkZhc3QuY2xvbmVBcnJheSA9IEZhc3QuYXJyYXkuY2xvbmU7IC8vIEBkZXByZWNhdGVkIHVzZSBmYXN0LmFycmF5LmNsb25lKClcblxuRmFzdC5jb25jYXQgPSBGYXN0LmFycmF5LmNvbmNhdDtcbkZhc3Quc29tZSA9IEZhc3QuYXJyYXkuc29tZTtcbkZhc3QuZXZlcnkgPSBGYXN0LmFycmF5LmV2ZXJ5O1xuRmFzdC5pbmRleE9mID0gRmFzdC5hcnJheS5pbmRleE9mO1xuRmFzdC5sYXN0SW5kZXhPZiA9IEZhc3QuYXJyYXkubGFzdEluZGV4T2Y7XG5GYXN0LnBsdWNrID0gRmFzdC5hcnJheS5wbHVjaztcbkZhc3QuZmlsbCA9IEZhc3QuYXJyYXkuZmlsbDtcblxuRmFzdC5pbnRlcm4gPSBGYXN0LnN0cmluZy5pbnRlcm47XG5cblxuLyoqXG4gKiAjIENvbmNhdFxuICpcbiAqIENvbmNhdGVuYXRlIG11bHRpcGxlIGFycmF5cy5cbiAqXG4gKiBAcGFyYW0gIHtBcnJheXxtaXhlZH0gaXRlbSwgLi4uIFRoZSBpdGVtKHMpIHRvIGNvbmNhdGVuYXRlLlxuICogQHJldHVybiB7RmFzdH0gICAgICAgICAgICAgICAgICBBIG5ldyBGYXN0IG9iamVjdCwgY29udGFpbmluZyB0aGUgcmVzdWx0cy5cbiAqL1xuRmFzdC5wcm90b3R5cGUuY29uY2F0ID0gZnVuY3Rpb24gRmFzdCRjb25jYXQgKCkge1xuICB2YXIgbGVuZ3RoID0gdGhpcy52YWx1ZS5sZW5ndGgsXG4gICAgICBhcnIgPSBuZXcgQXJyYXkobGVuZ3RoKSxcbiAgICAgIGksIGl0ZW0sIGNoaWxkTGVuZ3RoLCBqO1xuXG4gIGZvciAoaSA9IDA7IGkgPCBsZW5ndGg7IGkrKykge1xuICAgIGFycltpXSA9IHRoaXMudmFsdWVbaV07XG4gIH1cblxuICBsZW5ndGggPSBhcmd1bWVudHMubGVuZ3RoO1xuICBmb3IgKGkgPSAwOyBpIDwgbGVuZ3RoOyBpKyspIHtcbiAgICBpdGVtID0gYXJndW1lbnRzW2ldO1xuICAgIGlmIChBcnJheS5pc0FycmF5KGl0ZW0pKSB7XG4gICAgICBjaGlsZExlbmd0aCA9IGl0ZW0ubGVuZ3RoO1xuICAgICAgZm9yIChqID0gMDsgaiA8IGNoaWxkTGVuZ3RoOyBqKyspIHtcbiAgICAgICAgYXJyLnB1c2goaXRlbVtqXSk7XG4gICAgICB9XG4gICAgfVxuICAgIGVsc2Uge1xuICAgICAgYXJyLnB1c2goaXRlbSk7XG4gICAgfVxuICB9XG4gIHJldHVybiBuZXcgRmFzdChhcnIpO1xufTtcblxuLyoqXG4gKiBGYXN0IE1hcFxuICpcbiAqIEBwYXJhbSAge0Z1bmN0aW9ufSBmbiAgICAgICAgICBUaGUgdmlzaXRvciBmdW5jdGlvbi5cbiAqIEBwYXJhbSAge09iamVjdH0gICB0aGlzQ29udGV4dCBUaGUgY29udGV4dCBmb3IgdGhlIHZpc2l0b3IsIGlmIGFueS5cbiAqIEByZXR1cm4ge0Zhc3R9ICAgICAgICAgICAgICAgICBBIG5ldyBGYXN0IG9iamVjdCwgY29udGFpbmluZyB0aGUgcmVzdWx0cy5cbiAqL1xuRmFzdC5wcm90b3R5cGUubWFwID0gZnVuY3Rpb24gRmFzdCRtYXAgKGZuLCB0aGlzQ29udGV4dCkge1xuICByZXR1cm4gbmV3IEZhc3QoRmFzdC5tYXAodGhpcy52YWx1ZSwgZm4sIHRoaXNDb250ZXh0KSk7XG59O1xuXG4vKipcbiAqIEZhc3QgRmlsdGVyXG4gKlxuICogQHBhcmFtICB7RnVuY3Rpb259IGZuICAgICAgICAgIFRoZSBmaWx0ZXIgZnVuY3Rpb24uXG4gKiBAcGFyYW0gIHtPYmplY3R9ICAgdGhpc0NvbnRleHQgVGhlIGNvbnRleHQgZm9yIHRoZSBmaWx0ZXIgZnVuY3Rpb24sIGlmIGFueS5cbiAqIEByZXR1cm4ge0Zhc3R9ICAgICAgICAgICAgICAgICBBIG5ldyBGYXN0IG9iamVjdCwgY29udGFpbmluZyB0aGUgcmVzdWx0cy5cbiAqL1xuRmFzdC5wcm90b3R5cGUuZmlsdGVyID0gZnVuY3Rpb24gRmFzdCRmaWx0ZXIgKGZuLCB0aGlzQ29udGV4dCkge1xuICByZXR1cm4gbmV3IEZhc3QoRmFzdC5maWx0ZXIodGhpcy52YWx1ZSwgZm4sIHRoaXNDb250ZXh0KSk7XG59O1xuXG4vKipcbiAqIEZhc3QgUmVkdWNlXG4gKlxuICogQHBhcmFtICB7RnVuY3Rpb259IGZuICAgICAgICAgICBUaGUgcmVkdWNlciBmdW5jdGlvbi5cbiAqIEBwYXJhbSAge21peGVkfSAgICBpbml0aWFsVmFsdWUgVGhlIGluaXRpYWwgdmFsdWUsIGlmIGFueS5cbiAqIEBwYXJhbSAge09iamVjdH0gICB0aGlzQ29udGV4dCAgVGhlIGNvbnRleHQgZm9yIHRoZSByZWR1Y2VyLCBpZiBhbnkuXG4gKiBAcmV0dXJuIHttaXhlZH0gICAgICAgICAgICAgICAgIFRoZSBmaW5hbCByZXN1bHQuXG4gKi9cbkZhc3QucHJvdG90eXBlLnJlZHVjZSA9IGZ1bmN0aW9uIEZhc3QkcmVkdWNlIChmbiwgaW5pdGlhbFZhbHVlLCB0aGlzQ29udGV4dCkge1xuICByZXR1cm4gRmFzdC5yZWR1Y2UodGhpcy52YWx1ZSwgZm4sIGluaXRpYWxWYWx1ZSwgdGhpc0NvbnRleHQpO1xufTtcblxuXG4vKipcbiAqIEZhc3QgUmVkdWNlIFJpZ2h0XG4gKlxuICogQHBhcmFtICB7RnVuY3Rpb259IGZuICAgICAgICAgICBUaGUgcmVkdWNlciBmdW5jdGlvbi5cbiAqIEBwYXJhbSAge21peGVkfSAgICBpbml0aWFsVmFsdWUgVGhlIGluaXRpYWwgdmFsdWUsIGlmIGFueS5cbiAqIEBwYXJhbSAge09iamVjdH0gICB0aGlzQ29udGV4dCAgVGhlIGNvbnRleHQgZm9yIHRoZSByZWR1Y2VyLCBpZiBhbnkuXG4gKiBAcmV0dXJuIHttaXhlZH0gICAgICAgICAgICAgICAgIFRoZSBmaW5hbCByZXN1bHQuXG4gKi9cbkZhc3QucHJvdG90eXBlLnJlZHVjZVJpZ2h0ID0gZnVuY3Rpb24gRmFzdCRyZWR1Y2VSaWdodCAoZm4sIGluaXRpYWxWYWx1ZSwgdGhpc0NvbnRleHQpIHtcbiAgcmV0dXJuIEZhc3QucmVkdWNlUmlnaHQodGhpcy52YWx1ZSwgZm4sIGluaXRpYWxWYWx1ZSwgdGhpc0NvbnRleHQpO1xufTtcblxuLyoqXG4gKiBGYXN0IEZvciBFYWNoXG4gKlxuICogQHBhcmFtICB7RnVuY3Rpb259IGZuICAgICAgICAgIFRoZSB2aXNpdG9yIGZ1bmN0aW9uLlxuICogQHBhcmFtICB7T2JqZWN0fSAgIHRoaXNDb250ZXh0IFRoZSBjb250ZXh0IGZvciB0aGUgdmlzaXRvciwgaWYgYW55LlxuICogQHJldHVybiB7RmFzdH0gICAgICAgICAgICAgICAgIFRoZSBGYXN0IGluc3RhbmNlLlxuICovXG5GYXN0LnByb3RvdHlwZS5mb3JFYWNoID0gZnVuY3Rpb24gRmFzdCRmb3JFYWNoIChmbiwgdGhpc0NvbnRleHQpIHtcbiAgRmFzdC5mb3JFYWNoKHRoaXMudmFsdWUsIGZuLCB0aGlzQ29udGV4dCk7XG4gIHJldHVybiB0aGlzO1xufTtcblxuLyoqXG4gKiBGYXN0IFNvbWVcbiAqXG4gKiBAcGFyYW0gIHtGdW5jdGlvbn0gZm4gICAgICAgICAgVGhlIG1hdGNoZXIgcHJlZGljYXRlLlxuICogQHBhcmFtICB7T2JqZWN0fSAgIHRoaXNDb250ZXh0IFRoZSBjb250ZXh0IGZvciB0aGUgbWF0Y2hlciwgaWYgYW55LlxuICogQHJldHVybiB7Qm9vbGVhbn0gICAgICAgICAgICAgIFRydWUgaWYgYXQgbGVhc3Qgb25lIGVsZW1lbnQgbWF0Y2hlcy5cbiAqL1xuRmFzdC5wcm90b3R5cGUuc29tZSA9IGZ1bmN0aW9uIEZhc3Qkc29tZSAoZm4sIHRoaXNDb250ZXh0KSB7XG4gIHJldHVybiBGYXN0LnNvbWUodGhpcy52YWx1ZSwgZm4sIHRoaXNDb250ZXh0KTtcbn07XG5cbi8qKlxuICogRmFzdCBFdmVyeVxuICpcbiAqIEBwYXJhbSAge0Z1bmN0aW9ufSBmbiAgICAgICAgICBUaGUgbWF0Y2hlciBwcmVkaWNhdGUuXG4gKiBAcGFyYW0gIHtPYmplY3R9ICAgdGhpc0NvbnRleHQgVGhlIGNvbnRleHQgZm9yIHRoZSBtYXRjaGVyLCBpZiBhbnkuXG4gKiBAcmV0dXJuIHtCb29sZWFufSAgICAgICAgICAgICAgVHJ1ZSBpZiBhdCBhbGwgZWxlbWVudHMgbWF0Y2guXG4gKi9cbkZhc3QucHJvdG90eXBlLmV2ZXJ5ID0gZnVuY3Rpb24gRmFzdCRldmVyeSAoZm4sIHRoaXNDb250ZXh0KSB7XG4gIHJldHVybiBGYXN0LnNvbWUodGhpcy52YWx1ZSwgZm4sIHRoaXNDb250ZXh0KTtcbn07XG5cbi8qKlxuICogRmFzdCBJbmRleCBPZlxuICpcbiAqIEBwYXJhbSAge21peGVkfSAgdGFyZ2V0ICAgIFRoZSB0YXJnZXQgdG8gbG9va3VwLlxuICogQHBhcmFtICB7TnVtYmVyfSBmcm9tSW5kZXggVGhlIGluZGV4IHRvIHN0YXJ0IHNlYXJjaGluZyBmcm9tLCBpZiBrbm93bi5cbiAqIEByZXR1cm4ge051bWJlcn0gICAgICAgICAgIFRoZSBpbmRleCBvZiB0aGUgaXRlbSwgb3IgLTEgaWYgbm8gbWF0Y2ggZm91bmQuXG4gKi9cbkZhc3QucHJvdG90eXBlLmluZGV4T2YgPSBmdW5jdGlvbiBGYXN0JGluZGV4T2YgKHRhcmdldCwgZnJvbUluZGV4KSB7XG4gIHJldHVybiBGYXN0LmluZGV4T2YodGhpcy52YWx1ZSwgdGFyZ2V0LCBmcm9tSW5kZXgpO1xufTtcblxuXG4vKipcbiAqIEZhc3QgTGFzdCBJbmRleCBPZlxuICpcbiAqIEBwYXJhbSAge21peGVkfSAgdGFyZ2V0ICAgIFRoZSB0YXJnZXQgdG8gbG9va3VwLlxuICogQHBhcmFtICB7TnVtYmVyfSBmcm9tSW5kZXggVGhlIGluZGV4IHRvIHN0YXJ0IHNlYXJjaGluZyBmcm9tLCBpZiBrbm93bi5cbiAqIEByZXR1cm4ge051bWJlcn0gICAgICAgICAgIFRoZSBsYXN0IGluZGV4IG9mIHRoZSBpdGVtLCBvciAtMSBpZiBubyBtYXRjaCBmb3VuZC5cbiAqL1xuRmFzdC5wcm90b3R5cGUubGFzdEluZGV4T2YgPSBmdW5jdGlvbiBGYXN0JGxhc3RJbmRleE9mICh0YXJnZXQsIGZyb21JbmRleCkge1xuICByZXR1cm4gRmFzdC5sYXN0SW5kZXhPZih0aGlzLnZhbHVlLCB0YXJnZXQsIGZyb21JbmRleCk7XG59O1xuXG4vKipcbiAqIFJldmVyc2VcbiAqXG4gKiBAcmV0dXJuIHtGYXN0fSBBIG5ldyBGYXN0IGluc3RhbmNlLCB3aXRoIHRoZSBjb250ZW50cyByZXZlcnNlZC5cbiAqL1xuRmFzdC5wcm90b3R5cGUucmV2ZXJzZSA9IGZ1bmN0aW9uIEZhc3QkcmV2ZXJzZSAoKSB7XG4gIHJldHVybiBuZXcgRmFzdCh0aGlzLnZhbHVlLnJldmVyc2UoKSk7XG59O1xuXG4vKipcbiAqIFZhbHVlIE9mXG4gKlxuICogQHJldHVybiB7QXJyYXl9IFRoZSB3cmFwcGVkIHZhbHVlLlxuICovXG5GYXN0LnByb3RvdHlwZS52YWx1ZU9mID0gZnVuY3Rpb24gRmFzdCR2YWx1ZU9mICgpIHtcbiAgcmV0dXJuIHRoaXMudmFsdWU7XG59O1xuXG4vKipcbiAqIFRvIEpTT05cbiAqXG4gKiBAcmV0dXJuIHtBcnJheX0gVGhlIHdyYXBwZWQgdmFsdWUuXG4gKi9cbkZhc3QucHJvdG90eXBlLnRvSlNPTiA9IGZ1bmN0aW9uIEZhc3QkdG9KU09OICgpIHtcbiAgcmV0dXJuIHRoaXMudmFsdWU7XG59O1xuXG4vKipcbiAqIEl0ZW0gTGVuZ3RoXG4gKi9cbk9iamVjdC5kZWZpbmVQcm9wZXJ0eShGYXN0LnByb3RvdHlwZSwgJ2xlbmd0aCcsIHtcbiAgZ2V0OiBmdW5jdGlvbiAoKSB7XG4gICAgcmV0dXJuIHRoaXMudmFsdWUubGVuZ3RoO1xuICB9XG59KTtcbiIsIid1c2Ugc3RyaWN0JztcblxudmFyIG1hcEFycmF5ID0gcmVxdWlyZSgnLi9hcnJheS9tYXAnKSxcbiAgICBtYXBPYmplY3QgPSByZXF1aXJlKCcuL29iamVjdC9tYXAnKTtcblxuLyoqXG4gKiAjIE1hcFxuICpcbiAqIEEgZmFzdCBgLm1hcCgpYCBpbXBsZW1lbnRhdGlvbi5cbiAqXG4gKiBAcGFyYW0gIHtBcnJheXxPYmplY3R9IHN1YmplY3QgICAgIFRoZSBhcnJheSBvciBvYmplY3QgdG8gbWFwIG92ZXIuXG4gKiBAcGFyYW0gIHtGdW5jdGlvbn0gICAgIGZuICAgICAgICAgIFRoZSBtYXBwZXIgZnVuY3Rpb24uXG4gKiBAcGFyYW0gIHtPYmplY3R9ICAgICAgIHRoaXNDb250ZXh0IFRoZSBjb250ZXh0IGZvciB0aGUgbWFwcGVyLlxuICogQHJldHVybiB7QXJyYXl8T2JqZWN0fSAgICAgICAgICAgICBUaGUgYXJyYXkgb3Igb2JqZWN0IGNvbnRhaW5pbmcgdGhlIHJlc3VsdHMuXG4gKi9cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gZmFzdE1hcCAoc3ViamVjdCwgZm4sIHRoaXNDb250ZXh0KSB7XG4gIGlmIChzdWJqZWN0IGluc3RhbmNlb2YgQXJyYXkpIHtcbiAgICByZXR1cm4gbWFwQXJyYXkoc3ViamVjdCwgZm4sIHRoaXNDb250ZXh0KTtcbiAgfVxuICBlbHNlIHtcbiAgICByZXR1cm4gbWFwT2JqZWN0KHN1YmplY3QsIGZuLCB0aGlzQ29udGV4dCk7XG4gIH1cbn07IiwiJ3VzZSBzdHJpY3QnO1xuXG4vKipcbiAqIEFuYWxvZ3VlIG9mIE9iamVjdC5hc3NpZ24oKS5cbiAqIENvcGllcyBwcm9wZXJ0aWVzIGZyb20gb25lIG9yIG1vcmUgc291cmNlIG9iamVjdHMgdG9cbiAqIGEgdGFyZ2V0IG9iamVjdC4gRXhpc3Rpbmcga2V5cyBvbiB0aGUgdGFyZ2V0IG9iamVjdCB3aWxsIGJlIG92ZXJ3cml0dGVuLlxuICpcbiAqID4gTm90ZTogVGhpcyBkaWZmZXJzIGZyb20gc3BlYyBpbiBzb21lIGltcG9ydGFudCB3YXlzOlxuICogPiAxLiBXaWxsIHRocm93IGlmIHBhc3NlZCBub24tb2JqZWN0cywgaW5jbHVkaW5nIGB1bmRlZmluZWRgIG9yIGBudWxsYCB2YWx1ZXMuXG4gKiA+IDIuIERvZXMgbm90IHN1cHBvcnQgdGhlIGN1cmlvdXMgRXhjZXB0aW9uIGhhbmRsaW5nIGJlaGF2aW9yLCBleGNlcHRpb25zIGFyZSB0aHJvd24gaW1tZWRpYXRlbHkuXG4gKiA+IEZvciBtb3JlIGRldGFpbHMsIHNlZTpcbiAqID4gaHR0cHM6Ly9kZXZlbG9wZXIubW96aWxsYS5vcmcvZW4tVVMvZG9jcy9XZWIvSmF2YVNjcmlwdC9SZWZlcmVuY2UvR2xvYmFsX09iamVjdHMvT2JqZWN0L2Fzc2lnblxuICpcbiAqXG4gKlxuICogQHBhcmFtICB7T2JqZWN0fSB0YXJnZXQgICAgICBUaGUgdGFyZ2V0IG9iamVjdCB0byBjb3B5IHByb3BlcnRpZXMgdG8uXG4gKiBAcGFyYW0gIHtPYmplY3R9IHNvdXJjZSwgLi4uIFRoZSBzb3VyY2UocykgdG8gY29weSBwcm9wZXJ0aWVzIGZyb20uXG4gKiBAcmV0dXJuIHtPYmplY3R9ICAgICAgICAgICAgIFRoZSB1cGRhdGVkIHRhcmdldCBvYmplY3QuXG4gKi9cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gZmFzdEFzc2lnbiAodGFyZ2V0KSB7XG4gIHZhciB0b3RhbEFyZ3MgPSBhcmd1bWVudHMubGVuZ3RoLFxuICAgICAgc291cmNlLCBpLCB0b3RhbEtleXMsIGtleXMsIGtleSwgajtcblxuICBmb3IgKGkgPSAxOyBpIDwgdG90YWxBcmdzOyBpKyspIHtcbiAgICBzb3VyY2UgPSBhcmd1bWVudHNbaV07XG4gICAga2V5cyA9IE9iamVjdC5rZXlzKHNvdXJjZSk7XG4gICAgdG90YWxLZXlzID0ga2V5cy5sZW5ndGg7XG4gICAgZm9yIChqID0gMDsgaiA8IHRvdGFsS2V5czsgaisrKSB7XG4gICAgICBrZXkgPSBrZXlzW2pdO1xuICAgICAgdGFyZ2V0W2tleV0gPSBzb3VyY2Vba2V5XTtcbiAgICB9XG4gIH1cbiAgcmV0dXJuIHRhcmdldDtcbn07XG4iLCIndXNlIHN0cmljdCc7XG5cbi8qKlxuICogIyBDbG9uZSBPYmplY3RcbiAqXG4gKiBTaGFsbG93IGNsb25lIGEgc2ltcGxlIG9iamVjdC5cbiAqXG4gKiA+IE5vdGU6IFByb3RvdHlwZXMgYW5kIG5vbi1lbnVtZXJhYmxlIHByb3BlcnRpZXMgd2lsbCBub3QgYmUgY29waWVkIVxuICpcbiAqIEBwYXJhbSAge09iamVjdH0gaW5wdXQgVGhlIG9iamVjdCB0byBjbG9uZS5cbiAqIEByZXR1cm4ge09iamVjdH0gICAgICAgVGhlIGNsb25lZCBvYmplY3QuXG4gKi9cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gZmFzdENsb25lT2JqZWN0IChpbnB1dCkge1xuICB2YXIga2V5cyA9IE9iamVjdC5rZXlzKGlucHV0KSxcbiAgICAgIHRvdGFsID0ga2V5cy5sZW5ndGgsXG4gICAgICBjbG9uZWQgPSB7fSxcbiAgICAgIGksIGtleTtcblxuICBmb3IgKGkgPSAwOyBpIDwgdG90YWw7IGkrKykge1xuICAgIGtleSA9IGtleXNbaV07XG4gICAgY2xvbmVkW2tleV0gPSBpbnB1dFtrZXldO1xuICB9XG5cbiAgcmV0dXJuIGNsb25lZDtcbn07XG4iLCIndXNlIHN0cmljdCc7XG5cbnZhciBiaW5kSW50ZXJuYWwzID0gcmVxdWlyZSgnLi4vZnVuY3Rpb24vYmluZEludGVybmFsMycpO1xuXG4vKipcbiAqICMgRmlsdGVyXG4gKlxuICogQSBmYXN0IG9iamVjdCBgLmZpbHRlcigpYCBpbXBsZW1lbnRhdGlvbi5cbiAqXG4gKiBAcGFyYW0gIHtPYmplY3R9ICAgc3ViamVjdCAgICAgVGhlIG9iamVjdCB0byBmaWx0ZXIuXG4gKiBAcGFyYW0gIHtGdW5jdGlvbn0gZm4gICAgICAgICAgVGhlIGZpbHRlciBmdW5jdGlvbi5cbiAqIEBwYXJhbSAge09iamVjdH0gICB0aGlzQ29udGV4dCBUaGUgY29udGV4dCBmb3IgdGhlIGZpbHRlci5cbiAqIEByZXR1cm4ge09iamVjdH0gICAgICAgICAgICAgICBUaGUgbmV3IG9iamVjdCBjb250YWluaW5nIHRoZSBmaWx0ZXJlZCByZXN1bHRzLlxuICovXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIGZhc3RGaWx0ZXJPYmplY3QgKHN1YmplY3QsIGZuLCB0aGlzQ29udGV4dCkge1xuICB2YXIga2V5cyA9IE9iamVjdC5rZXlzKHN1YmplY3QpLFxuICAgICAgbGVuZ3RoID0ga2V5cy5sZW5ndGgsXG4gICAgICByZXN1bHQgPSB7fSxcbiAgICAgIGl0ZXJhdG9yID0gdGhpc0NvbnRleHQgIT09IHVuZGVmaW5lZCA/IGJpbmRJbnRlcm5hbDMoZm4sIHRoaXNDb250ZXh0KSA6IGZuLFxuICAgICAgaSwga2V5O1xuICBmb3IgKGkgPSAwOyBpIDwgbGVuZ3RoOyBpKyspIHtcbiAgICBrZXkgPSBrZXlzW2ldO1xuICAgIGlmIChpdGVyYXRvcihzdWJqZWN0W2tleV0sIGtleSwgc3ViamVjdCkpIHtcbiAgICAgIHJlc3VsdFtrZXldID0gc3ViamVjdFtrZXldO1xuICAgIH1cbiAgfVxuICByZXR1cm4gcmVzdWx0O1xufTtcbiIsIid1c2Ugc3RyaWN0JztcblxudmFyIGJpbmRJbnRlcm5hbDMgPSByZXF1aXJlKCcuLi9mdW5jdGlvbi9iaW5kSW50ZXJuYWwzJyk7XG5cbi8qKlxuICogIyBGb3IgRWFjaFxuICpcbiAqIEEgZmFzdCBvYmplY3QgYC5mb3JFYWNoKClgIGltcGxlbWVudGF0aW9uLlxuICpcbiAqIEBwYXJhbSAge09iamVjdH0gICBzdWJqZWN0ICAgICBUaGUgb2JqZWN0IHRvIGl0ZXJhdGUgb3Zlci5cbiAqIEBwYXJhbSAge0Z1bmN0aW9ufSBmbiAgICAgICAgICBUaGUgdmlzaXRvciBmdW5jdGlvbi5cbiAqIEBwYXJhbSAge09iamVjdH0gICB0aGlzQ29udGV4dCBUaGUgY29udGV4dCBmb3IgdGhlIHZpc2l0b3IuXG4gKi9cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gZmFzdEZvckVhY2hPYmplY3QgKHN1YmplY3QsIGZuLCB0aGlzQ29udGV4dCkge1xuICB2YXIga2V5cyA9IE9iamVjdC5rZXlzKHN1YmplY3QpLFxuICAgICAgbGVuZ3RoID0ga2V5cy5sZW5ndGgsXG4gICAgICBpdGVyYXRvciA9IHRoaXNDb250ZXh0ICE9PSB1bmRlZmluZWQgPyBiaW5kSW50ZXJuYWwzKGZuLCB0aGlzQ29udGV4dCkgOiBmbixcbiAgICAgIGtleSwgaTtcbiAgZm9yIChpID0gMDsgaSA8IGxlbmd0aDsgaSsrKSB7XG4gICAga2V5ID0ga2V5c1tpXTtcbiAgICBpdGVyYXRvcihzdWJqZWN0W2tleV0sIGtleSwgc3ViamVjdCk7XG4gIH1cbn07XG4iLCIndXNlIHN0cmljdCc7XG5cbmV4cG9ydHMuYXNzaWduID0gcmVxdWlyZSgnLi9hc3NpZ24nKTtcbmV4cG9ydHMuY2xvbmUgPSByZXF1aXJlKCcuL2Nsb25lJyk7XG5leHBvcnRzLmZpbHRlciA9IHJlcXVpcmUoJy4vZmlsdGVyJyk7XG5leHBvcnRzLmZvckVhY2ggPSByZXF1aXJlKCcuL2ZvckVhY2gnKTtcbmV4cG9ydHMubWFwID0gcmVxdWlyZSgnLi9tYXAnKTtcbmV4cG9ydHMucmVkdWNlID0gcmVxdWlyZSgnLi9yZWR1Y2UnKTtcbmV4cG9ydHMucmVkdWNlUmlnaHQgPSByZXF1aXJlKCcuL3JlZHVjZVJpZ2h0Jyk7XG5leHBvcnRzLmtleXMgPSByZXF1aXJlKCcuL2tleXMnKTtcbmV4cG9ydHMudmFsdWVzID0gcmVxdWlyZSgnLi92YWx1ZXMnKTsiLCIndXNlIHN0cmljdCc7XG5cbi8qKlxuICogT2JqZWN0LmtleXMoKSBzaGltIGZvciBFUzMgZW52aXJvbm1lbnRzLlxuICpcbiAqIEBwYXJhbSAge09iamVjdH0gb2JqIFRoZSBvYmplY3QgdG8gZ2V0IGtleXMgZm9yLlxuICogQHJldHVybiB7QXJyYXl9ICAgICAgVGhlIGFycmF5IG9mIGtleXMuXG4gKi9cbm1vZHVsZS5leHBvcnRzID0gdHlwZW9mIE9iamVjdC5rZXlzID09PSBcImZ1bmN0aW9uXCIgPyBPYmplY3Qua2V5cyA6IC8qIGlzdGFuYnVsIGlnbm9yZSBuZXh0ICovIGZ1bmN0aW9uIGZhc3RLZXlzIChvYmopIHtcbiAgdmFyIGtleXMgPSBbXTtcbiAgZm9yICh2YXIga2V5IGluIG9iaikge1xuICAgIGlmIChPYmplY3QucHJvdG90eXBlLmhhc093blByb3BlcnR5LmNhbGwob2JqLCBrZXkpKSB7XG4gICAgICBrZXlzLnB1c2goa2V5KTtcbiAgICB9XG4gIH1cbiAgcmV0dXJuIGtleXM7XG59OyIsIid1c2Ugc3RyaWN0JztcblxudmFyIGJpbmRJbnRlcm5hbDMgPSByZXF1aXJlKCcuLi9mdW5jdGlvbi9iaW5kSW50ZXJuYWwzJyk7XG5cbi8qKlxuICogIyBNYXBcbiAqXG4gKiBBIGZhc3Qgb2JqZWN0IGAubWFwKClgIGltcGxlbWVudGF0aW9uLlxuICpcbiAqIEBwYXJhbSAge09iamVjdH0gICBzdWJqZWN0ICAgICBUaGUgb2JqZWN0IHRvIG1hcCBvdmVyLlxuICogQHBhcmFtICB7RnVuY3Rpb259IGZuICAgICAgICAgIFRoZSBtYXBwZXIgZnVuY3Rpb24uXG4gKiBAcGFyYW0gIHtPYmplY3R9ICAgdGhpc0NvbnRleHQgVGhlIGNvbnRleHQgZm9yIHRoZSBtYXBwZXIuXG4gKiBAcmV0dXJuIHtPYmplY3R9ICAgICAgICAgICAgICAgVGhlIG5ldyBvYmplY3QgY29udGFpbmluZyB0aGUgcmVzdWx0cy5cbiAqL1xubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiBmYXN0TWFwT2JqZWN0IChzdWJqZWN0LCBmbiwgdGhpc0NvbnRleHQpIHtcbiAgdmFyIGtleXMgPSBPYmplY3Qua2V5cyhzdWJqZWN0KSxcbiAgICAgIGxlbmd0aCA9IGtleXMubGVuZ3RoLFxuICAgICAgcmVzdWx0ID0ge30sXG4gICAgICBpdGVyYXRvciA9IHRoaXNDb250ZXh0ICE9PSB1bmRlZmluZWQgPyBiaW5kSW50ZXJuYWwzKGZuLCB0aGlzQ29udGV4dCkgOiBmbixcbiAgICAgIGksIGtleTtcbiAgZm9yIChpID0gMDsgaSA8IGxlbmd0aDsgaSsrKSB7XG4gICAga2V5ID0ga2V5c1tpXTtcbiAgICByZXN1bHRba2V5XSA9IGl0ZXJhdG9yKHN1YmplY3Rba2V5XSwga2V5LCBzdWJqZWN0KTtcbiAgfVxuICByZXR1cm4gcmVzdWx0O1xufTtcbiIsIid1c2Ugc3RyaWN0JztcblxudmFyIGJpbmRJbnRlcm5hbDQgPSByZXF1aXJlKCcuLi9mdW5jdGlvbi9iaW5kSW50ZXJuYWw0Jyk7XG5cbi8qKlxuICogIyBSZWR1Y2VcbiAqXG4gKiBBIGZhc3Qgb2JqZWN0IGAucmVkdWNlKClgIGltcGxlbWVudGF0aW9uLlxuICpcbiAqIEBwYXJhbSAge09iamVjdH0gICBzdWJqZWN0ICAgICAgVGhlIG9iamVjdCB0byByZWR1Y2Ugb3Zlci5cbiAqIEBwYXJhbSAge0Z1bmN0aW9ufSBmbiAgICAgICAgICAgVGhlIHJlZHVjZXIgZnVuY3Rpb24uXG4gKiBAcGFyYW0gIHttaXhlZH0gICAgaW5pdGlhbFZhbHVlIFRoZSBpbml0aWFsIHZhbHVlIGZvciB0aGUgcmVkdWNlciwgZGVmYXVsdHMgdG8gc3ViamVjdFswXS5cbiAqIEBwYXJhbSAge09iamVjdH0gICB0aGlzQ29udGV4dCAgVGhlIGNvbnRleHQgZm9yIHRoZSByZWR1Y2VyLlxuICogQHJldHVybiB7bWl4ZWR9ICAgICAgICAgICAgICAgICBUaGUgZmluYWwgcmVzdWx0LlxuICovXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIGZhc3RSZWR1Y2VPYmplY3QgKHN1YmplY3QsIGZuLCBpbml0aWFsVmFsdWUsIHRoaXNDb250ZXh0KSB7XG4gIHZhciBrZXlzID0gT2JqZWN0LmtleXMoc3ViamVjdCksXG4gICAgICBsZW5ndGggPSBrZXlzLmxlbmd0aCxcbiAgICAgIGl0ZXJhdG9yID0gdGhpc0NvbnRleHQgIT09IHVuZGVmaW5lZCA/IGJpbmRJbnRlcm5hbDQoZm4sIHRoaXNDb250ZXh0KSA6IGZuLFxuICAgICAgaSwga2V5LCByZXN1bHQ7XG5cbiAgaWYgKGluaXRpYWxWYWx1ZSA9PT0gdW5kZWZpbmVkKSB7XG4gICAgaSA9IDE7XG4gICAgcmVzdWx0ID0gc3ViamVjdFtrZXlzWzBdXTtcbiAgfVxuICBlbHNlIHtcbiAgICBpID0gMDtcbiAgICByZXN1bHQgPSBpbml0aWFsVmFsdWU7XG4gIH1cblxuICBmb3IgKDsgaSA8IGxlbmd0aDsgaSsrKSB7XG4gICAga2V5ID0ga2V5c1tpXTtcbiAgICByZXN1bHQgPSBpdGVyYXRvcihyZXN1bHQsIHN1YmplY3Rba2V5XSwga2V5LCBzdWJqZWN0KTtcbiAgfVxuXG4gIHJldHVybiByZXN1bHQ7XG59O1xuIiwiJ3VzZSBzdHJpY3QnO1xuXG52YXIgYmluZEludGVybmFsNCA9IHJlcXVpcmUoJy4uL2Z1bmN0aW9uL2JpbmRJbnRlcm5hbDQnKTtcblxuLyoqXG4gKiAjIFJlZHVjZVxuICpcbiAqIEEgZmFzdCBvYmplY3QgYC5yZWR1Y2UoKWAgaW1wbGVtZW50YXRpb24uXG4gKlxuICogQHBhcmFtICB7T2JqZWN0fSAgIHN1YmplY3QgICAgICBUaGUgb2JqZWN0IHRvIHJlZHVjZSBvdmVyLlxuICogQHBhcmFtICB7RnVuY3Rpb259IGZuICAgICAgICAgICBUaGUgcmVkdWNlciBmdW5jdGlvbi5cbiAqIEBwYXJhbSAge21peGVkfSAgICBpbml0aWFsVmFsdWUgVGhlIGluaXRpYWwgdmFsdWUgZm9yIHRoZSByZWR1Y2VyLCBkZWZhdWx0cyB0byBzdWJqZWN0WzBdLlxuICogQHBhcmFtICB7T2JqZWN0fSAgIHRoaXNDb250ZXh0ICBUaGUgY29udGV4dCBmb3IgdGhlIHJlZHVjZXIuXG4gKiBAcmV0dXJuIHttaXhlZH0gICAgICAgICAgICAgICAgIFRoZSBmaW5hbCByZXN1bHQuXG4gKi9cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gZmFzdFJlZHVjZVJpZ2h0T2JqZWN0IChzdWJqZWN0LCBmbiwgaW5pdGlhbFZhbHVlLCB0aGlzQ29udGV4dCkge1xuICB2YXIga2V5cyA9IE9iamVjdC5rZXlzKHN1YmplY3QpLFxuICAgICAgbGVuZ3RoID0ga2V5cy5sZW5ndGgsXG4gICAgICBpdGVyYXRvciA9IHRoaXNDb250ZXh0ICE9PSB1bmRlZmluZWQgPyBiaW5kSW50ZXJuYWw0KGZuLCB0aGlzQ29udGV4dCkgOiBmbixcbiAgICAgIGksIGtleSwgcmVzdWx0O1xuXG4gIGlmIChpbml0aWFsVmFsdWUgPT09IHVuZGVmaW5lZCkge1xuICAgIGkgPSBsZW5ndGggLSAyO1xuICAgIHJlc3VsdCA9IHN1YmplY3Rba2V5c1tsZW5ndGggLSAxXV07XG4gIH1cbiAgZWxzZSB7XG4gICAgaSA9IGxlbmd0aCAtIDE7XG4gICAgcmVzdWx0ID0gaW5pdGlhbFZhbHVlO1xuICB9XG5cbiAgZm9yICg7IGkgPj0gMDsgaS0tKSB7XG4gICAga2V5ID0ga2V5c1tpXTtcbiAgICByZXN1bHQgPSBpdGVyYXRvcihyZXN1bHQsIHN1YmplY3Rba2V5XSwga2V5LCBzdWJqZWN0KTtcbiAgfVxuXG4gIHJldHVybiByZXN1bHQ7XG59O1xuIiwiJ3VzZSBzdHJpY3QnO1xuXG4vKipcbiAqICMgVmFsdWVzXG4gKiBSZXR1cm4gYWxsIHRoZSAoZW51bWVyYWJsZSkgcHJvcGVydHkgdmFsdWVzIGZvciBhbiBvYmplY3QuXG4gKiBMaWtlIE9iamVjdC5rZXlzKCkgYnV0IGZvciB2YWx1ZXMuXG4gKlxuICogQHBhcmFtICB7T2JqZWN0fSBvYmogVGhlIG9iamVjdCB0byByZXRyaWV2ZSB2YWx1ZXMgZnJvbS5cbiAqIEByZXR1cm4ge0FycmF5fSAgICAgIEFuIGFycmF5IGNvbnRhaW5pbmcgcHJvcGVydHkgdmFsdWVzLlxuICovXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIGZhc3RWYWx1ZXMgKG9iaikge1xuICB2YXIga2V5cyA9IE9iamVjdC5rZXlzKG9iaiksXG4gICAgICBsZW5ndGggPSBrZXlzLmxlbmd0aCxcbiAgICAgIHZhbHVlcyA9IG5ldyBBcnJheShsZW5ndGgpO1xuXG4gIGZvciAodmFyIGkgPSAwOyBpIDwgbGVuZ3RoOyBpKyspIHtcbiAgICB2YWx1ZXNbaV0gPSBvYmpba2V5c1tpXV07XG4gIH1cbiAgcmV0dXJuIHZhbHVlcztcbn07IiwiJ3VzZSBzdHJpY3QnO1xuXG52YXIgcmVkdWNlQXJyYXkgPSByZXF1aXJlKCcuL2FycmF5L3JlZHVjZScpLFxuICAgIHJlZHVjZU9iamVjdCA9IHJlcXVpcmUoJy4vb2JqZWN0L3JlZHVjZScpO1xuXG4vKipcbiAqICMgUmVkdWNlXG4gKlxuICogQSBmYXN0IGAucmVkdWNlKClgIGltcGxlbWVudGF0aW9uLlxuICpcbiAqIEBwYXJhbSAge0FycmF5fE9iamVjdH0gc3ViamVjdCAgICAgIFRoZSBhcnJheSBvciBvYmplY3QgdG8gcmVkdWNlIG92ZXIuXG4gKiBAcGFyYW0gIHtGdW5jdGlvbn0gICAgIGZuICAgICAgICAgICBUaGUgcmVkdWNlciBmdW5jdGlvbi5cbiAqIEBwYXJhbSAge21peGVkfSAgICAgICAgaW5pdGlhbFZhbHVlIFRoZSBpbml0aWFsIHZhbHVlIGZvciB0aGUgcmVkdWNlciwgZGVmYXVsdHMgdG8gc3ViamVjdFswXS5cbiAqIEBwYXJhbSAge09iamVjdH0gICAgICAgdGhpc0NvbnRleHQgIFRoZSBjb250ZXh0IGZvciB0aGUgcmVkdWNlci5cbiAqIEByZXR1cm4ge0FycmF5fE9iamVjdH0gICAgICAgICAgICAgIFRoZSBhcnJheSBvciBvYmplY3QgY29udGFpbmluZyB0aGUgcmVzdWx0cy5cbiAqL1xubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiBmYXN0UmVkdWNlIChzdWJqZWN0LCBmbiwgaW5pdGlhbFZhbHVlLCB0aGlzQ29udGV4dCkge1xuICBpZiAoc3ViamVjdCBpbnN0YW5jZW9mIEFycmF5KSB7XG4gICAgcmV0dXJuIHJlZHVjZUFycmF5KHN1YmplY3QsIGZuLCBpbml0aWFsVmFsdWUsIHRoaXNDb250ZXh0KTtcbiAgfVxuICBlbHNlIHtcbiAgICByZXR1cm4gcmVkdWNlT2JqZWN0KHN1YmplY3QsIGZuLCBpbml0aWFsVmFsdWUsIHRoaXNDb250ZXh0KTtcbiAgfVxufTsiLCIndXNlIHN0cmljdCc7XG5cbnZhciByZWR1Y2VSaWdodEFycmF5ID0gcmVxdWlyZSgnLi9hcnJheS9yZWR1Y2VSaWdodCcpLFxuICAgIHJlZHVjZVJpZ2h0T2JqZWN0ID0gcmVxdWlyZSgnLi9vYmplY3QvcmVkdWNlUmlnaHQnKTtcblxuLyoqXG4gKiAjIFJlZHVjZSBSaWdodFxuICpcbiAqIEEgZmFzdCBgLnJlZHVjZVJpZ2h0KClgIGltcGxlbWVudGF0aW9uLlxuICpcbiAqIEBwYXJhbSAge0FycmF5fE9iamVjdH0gc3ViamVjdCAgICAgIFRoZSBhcnJheSBvciBvYmplY3QgdG8gcmVkdWNlIG92ZXIuXG4gKiBAcGFyYW0gIHtGdW5jdGlvbn0gICAgIGZuICAgICAgICAgICBUaGUgcmVkdWNlciBmdW5jdGlvbi5cbiAqIEBwYXJhbSAge21peGVkfSAgICAgICAgaW5pdGlhbFZhbHVlIFRoZSBpbml0aWFsIHZhbHVlIGZvciB0aGUgcmVkdWNlciwgZGVmYXVsdHMgdG8gc3ViamVjdFswXS5cbiAqIEBwYXJhbSAge09iamVjdH0gICAgICAgdGhpc0NvbnRleHQgIFRoZSBjb250ZXh0IGZvciB0aGUgcmVkdWNlci5cbiAqIEByZXR1cm4ge0FycmF5fE9iamVjdH0gICAgICAgICAgICAgIFRoZSBhcnJheSBvciBvYmplY3QgY29udGFpbmluZyB0aGUgcmVzdWx0cy5cbiAqL1xubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiBmYXN0UmVkdWNlUmlnaHQgKHN1YmplY3QsIGZuLCBpbml0aWFsVmFsdWUsIHRoaXNDb250ZXh0KSB7XG4gIGlmIChzdWJqZWN0IGluc3RhbmNlb2YgQXJyYXkpIHtcbiAgICByZXR1cm4gcmVkdWNlUmlnaHRBcnJheShzdWJqZWN0LCBmbiwgaW5pdGlhbFZhbHVlLCB0aGlzQ29udGV4dCk7XG4gIH1cbiAgZWxzZSB7XG4gICAgcmV0dXJuIHJlZHVjZVJpZ2h0T2JqZWN0KHN1YmplY3QsIGZuLCBpbml0aWFsVmFsdWUsIHRoaXNDb250ZXh0KTtcbiAgfVxufTsiLCIndXNlIHN0cmljdCc7XG5cbmV4cG9ydHMuaW50ZXJuID0gcmVxdWlyZSgnLi9pbnRlcm4nKTsiLCIndXNlIHN0cmljdCc7XG5cbi8vIENvbXBpbGVycyBzdWNoIGFzIFY4IHVzZSBzdHJpbmcgaW50ZXJuaW5nIHRvIG1ha2Ugc3RyaW5nIGNvbXBhcmlzb24gdmVyeSBmYXN0IGFuZCBlZmZpY2llbnQsXG4vLyBhcyBlZmZpY2llbnQgYXMgY29tcGFyaW5nIHR3byByZWZlcmVuY2VzIHRvIHRoZSBzYW1lIG9iamVjdC5cbi8vXG4vL1xuLy8gVjggZG9lcyBpdHMgYmVzdCB0byBpbnRlcm4gc3RyaW5ncyBhdXRvbWF0aWNhbGx5IHdoZXJlIGl0IGNhbiwgZm9yIGluc3RhbmNlOlxuLy8gYGBganNcbi8vICAgdmFyIGdyZWV0aW5nID0gXCJoZWxsbyB3b3JsZFwiO1xuLy8gYGBgXG4vLyBXaXRoIHRoaXMsIGNvbXBhcmlzb24gd2lsbCBiZSB2ZXJ5IGZhc3Q6XG4vLyBgYGBqc1xuLy8gICBpZiAoZ3JlZXRpbmcgPT09IFwiaGVsbG8gd29ybGRcIikge31cbi8vIGBgYFxuLy8gSG93ZXZlciwgdGhlcmUgYXJlIHNldmVyYWwgY2FzZXMgd2hlcmUgVjggY2Fubm90IGludGVybiB0aGUgc3RyaW5nLCBhbmQgaW5zdGVhZFxuLy8gbXVzdCByZXNvcnQgdG8gYnl0ZS13aXNlIGNvbXBhcmlzb24uIFRoaXMgY2FuIGJlIHNpZ25maWNhbnRseSBzbG93ZXIgZm9yIGxvbmcgc3RyaW5ncy5cbi8vIFRoZSBtb3N0IGNvbW1vbiBleGFtcGxlIGlzIHN0cmluZyBjb25jYXRlbmF0aW9uOlxuLy8gYGBganNcbi8vICAgZnVuY3Rpb24gc3ViamVjdCAoKSB7IHJldHVybiBcIndvcmxkXCI7IH07XG4vLyAgIHZhciBncmVldGluZyA9IFwiaGVsbG8gXCIgKyBzdWJqZWN0KCk7XG4vLyBgYGBcbi8vIEluIHRoaXMgY2FzZSwgVjggY2Fubm90IGludGVybiB0aGUgc3RyaW5nLiBTbyB0aGlzIGNvbXBhcmlzb24gaXMgKm11Y2gqIHNsb3dlcjpcbi8vIGBgYGpzXG4vLyAgaWYgKGdyZWV0aW5nID09PSBcImhlbGxvIHdvcmxkXCIpIHt9XG4vLyBgYGBcblxuXG5cbi8vIEF0IHRoZSBtb21lbnQsIHRoZSBmYXN0ZXN0LCBzYWZlIHdheSBvZiBpbnRlcm5pbmcgYSBzdHJpbmcgaXMgdG9cbi8vIHVzZSBpdCBhcyBhIGtleSBpbiBhbiBvYmplY3QsIGFuZCB0aGVuIHVzZSB0aGF0IGtleS5cbi8vXG4vLyBOb3RlOiBUaGlzIHRlY2huaXF1ZSBjb21lcyBjb3VydGVzeSBvZiBQZXRrYSBBbnRvbm92IC0gaHR0cDovL2pzcGVyZi5jb20vaXN0cm4vMTFcbi8vXG4vLyBXZSBjcmVhdGUgYSBjb250YWluZXIgb2JqZWN0IGluIGhhc2ggbW9kZS5cbi8vIE1vc3Qgc3RyaW5ncyBiZWluZyBpbnRlcm5lZCB3aWxsIG5vdCBiZSB2YWxpZCBmYXN0IHByb3BlcnR5IG5hbWVzLFxuLy8gc28gd2UgZW5zdXJlIGhhc2ggbW9kZSBub3cgdG8gYXZvaWQgdHJhbnNpdGlvbmluZyB0aGUgb2JqZWN0IG1vZGUgYXQgcnVudGltZS5cbnZhciBjb250YWluZXIgPSB7Jy0gJzogdHJ1ZX07XG5kZWxldGUgY29udGFpbmVyWyctICddO1xuXG5cbi8qKlxuICogSW50ZXJuIGEgc3RyaW5nIHRvIG1ha2UgY29tcGFyaXNvbnMgZmFzdGVyLlxuICpcbiAqID4gTm90ZTogVGhpcyBpcyBhIHJlbGF0aXZlbHkgZXhwZW5zaXZlIG9wZXJhdGlvbiwgeW91XG4gKiBzaG91bGRuJ3QgdXN1YWxseSBkbyB0aGUgYWN0dWFsIGludGVybmluZyBhdCBydW50aW1lLCBpbnN0ZWFkXG4gKiB1c2UgdGhpcyBhdCBjb21waWxlIHRpbWUgdG8gbWFrZSBmdXR1cmUgd29yayBmYXN0ZXIuXG4gKlxuICogQHBhcmFtICB7U3RyaW5nfSBzdHJpbmcgVGhlIHN0cmluZyB0byBpbnRlcm4uXG4gKiBAcmV0dXJuIHtTdHJpbmd9ICAgICAgICBUaGUgaW50ZXJuZWQgc3RyaW5nLlxuICovXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIGZhc3RJbnRlcm4gKHN0cmluZykge1xuICBjb250YWluZXJbc3RyaW5nXSA9IHRydWU7XG4gIHZhciBpbnRlcm5lZCA9IE9iamVjdC5rZXlzKGNvbnRhaW5lcilbMF07XG4gIGRlbGV0ZSBjb250YWluZXJbaW50ZXJuZWRdO1xuICByZXR1cm4gaW50ZXJuZWQ7XG59OyIsIi8qKiBnZW5lcmF0ZSB1bmlxdWUgaWQgZm9yIHNlbGVjdG9yICovXHJcbnZhciBjb3VudGVyID0gRGF0ZS5ub3coKSAlIDFlOTtcclxuXHJcbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gZ2V0VWlkKCl7XHJcblx0cmV0dXJuIChNYXRoLnJhbmRvbSgpICogMWU5ID4+PiAwKSArIChjb3VudGVyKyspO1xyXG59OyIsIi8qZ2xvYmFsIHdpbmRvdyovXG5cbi8qKlxuICogQ2hlY2sgaWYgb2JqZWN0IGlzIGRvbSBub2RlLlxuICpcbiAqIEBwYXJhbSB7T2JqZWN0fSB2YWxcbiAqIEByZXR1cm4ge0Jvb2xlYW59XG4gKiBAYXBpIHB1YmxpY1xuICovXG5cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gaXNOb2RlKHZhbCl7XG4gIGlmICghdmFsIHx8IHR5cGVvZiB2YWwgIT09ICdvYmplY3QnKSByZXR1cm4gZmFsc2U7XG4gIGlmICh3aW5kb3cgJiYgJ29iamVjdCcgPT0gdHlwZW9mIHdpbmRvdy5Ob2RlKSByZXR1cm4gdmFsIGluc3RhbmNlb2Ygd2luZG93Lk5vZGU7XG4gIHJldHVybiAnbnVtYmVyJyA9PSB0eXBlb2YgdmFsLm5vZGVUeXBlICYmICdzdHJpbmcnID09IHR5cGVvZiB2YWwubm9kZU5hbWU7XG59XG4iLCIoZnVuY3Rpb24gKHJvb3QsIGZhY3Rvcnkpe1xuICAndXNlIHN0cmljdCc7XG5cbiAgLyppc3RhbmJ1bCBpZ25vcmUgbmV4dDpjYW50IHRlc3QqL1xuICBpZiAodHlwZW9mIG1vZHVsZSA9PT0gJ29iamVjdCcgJiYgdHlwZW9mIG1vZHVsZS5leHBvcnRzID09PSAnb2JqZWN0Jykge1xuICAgIG1vZHVsZS5leHBvcnRzID0gZmFjdG9yeSgpO1xuICB9IGVsc2UgaWYgKHR5cGVvZiBkZWZpbmUgPT09ICdmdW5jdGlvbicgJiYgZGVmaW5lLmFtZCkge1xuICAgIC8vIEFNRC4gUmVnaXN0ZXIgYXMgYW4gYW5vbnltb3VzIG1vZHVsZS5cbiAgICBkZWZpbmUoW10sIGZhY3RvcnkpO1xuICB9IGVsc2Uge1xuICAgIC8vIEJyb3dzZXIgZ2xvYmFsc1xuICAgIHJvb3Qub2JqZWN0UGF0aCA9IGZhY3RvcnkoKTtcbiAgfVxufSkodGhpcywgZnVuY3Rpb24oKXtcbiAgJ3VzZSBzdHJpY3QnO1xuXG4gIHZhclxuICAgIHRvU3RyID0gT2JqZWN0LnByb3RvdHlwZS50b1N0cmluZyxcbiAgICBfaGFzT3duUHJvcGVydHkgPSBPYmplY3QucHJvdG90eXBlLmhhc093blByb3BlcnR5O1xuXG4gIGZ1bmN0aW9uIGlzRW1wdHkodmFsdWUpe1xuICAgIGlmICghdmFsdWUpIHtcbiAgICAgIHJldHVybiB0cnVlO1xuICAgIH1cbiAgICBpZiAoaXNBcnJheSh2YWx1ZSkgJiYgdmFsdWUubGVuZ3RoID09PSAwKSB7XG4gICAgICByZXR1cm4gdHJ1ZTtcbiAgICB9IGVsc2Uge1xuICAgICAgZm9yICh2YXIgaSBpbiB2YWx1ZSkge1xuICAgICAgICBpZiAoX2hhc093blByb3BlcnR5LmNhbGwodmFsdWUsIGkpKSB7XG4gICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgICByZXR1cm4gdHJ1ZTtcbiAgICB9XG4gIH1cblxuICBmdW5jdGlvbiB0b1N0cmluZyh0eXBlKXtcbiAgICByZXR1cm4gdG9TdHIuY2FsbCh0eXBlKTtcbiAgfVxuXG4gIGZ1bmN0aW9uIGlzTnVtYmVyKHZhbHVlKXtcbiAgICByZXR1cm4gdHlwZW9mIHZhbHVlID09PSAnbnVtYmVyJyB8fCB0b1N0cmluZyh2YWx1ZSkgPT09IFwiW29iamVjdCBOdW1iZXJdXCI7XG4gIH1cblxuICBmdW5jdGlvbiBpc1N0cmluZyhvYmope1xuICAgIHJldHVybiB0eXBlb2Ygb2JqID09PSAnc3RyaW5nJyB8fCB0b1N0cmluZyhvYmopID09PSBcIltvYmplY3QgU3RyaW5nXVwiO1xuICB9XG5cbiAgZnVuY3Rpb24gaXNPYmplY3Qob2JqKXtcbiAgICByZXR1cm4gdHlwZW9mIG9iaiA9PT0gJ29iamVjdCcgJiYgdG9TdHJpbmcob2JqKSA9PT0gXCJbb2JqZWN0IE9iamVjdF1cIjtcbiAgfVxuXG4gIGZ1bmN0aW9uIGlzQXJyYXkob2JqKXtcbiAgICByZXR1cm4gdHlwZW9mIG9iaiA9PT0gJ29iamVjdCcgJiYgdHlwZW9mIG9iai5sZW5ndGggPT09ICdudW1iZXInICYmIHRvU3RyaW5nKG9iaikgPT09ICdbb2JqZWN0IEFycmF5XSc7XG4gIH1cblxuICBmdW5jdGlvbiBpc0Jvb2xlYW4ob2JqKXtcbiAgICByZXR1cm4gdHlwZW9mIG9iaiA9PT0gJ2Jvb2xlYW4nIHx8IHRvU3RyaW5nKG9iaikgPT09ICdbb2JqZWN0IEJvb2xlYW5dJztcbiAgfVxuXG4gIGZ1bmN0aW9uIGdldEtleShrZXkpe1xuICAgIHZhciBpbnRLZXkgPSBwYXJzZUludChrZXkpO1xuICAgIGlmIChpbnRLZXkudG9TdHJpbmcoKSA9PT0ga2V5KSB7XG4gICAgICByZXR1cm4gaW50S2V5O1xuICAgIH1cbiAgICByZXR1cm4ga2V5O1xuICB9XG5cbiAgZnVuY3Rpb24gc2V0KG9iaiwgcGF0aCwgdmFsdWUsIGRvTm90UmVwbGFjZSl7XG4gICAgaWYgKGlzTnVtYmVyKHBhdGgpKSB7XG4gICAgICBwYXRoID0gW3BhdGhdO1xuICAgIH1cbiAgICBpZiAoaXNFbXB0eShwYXRoKSkge1xuICAgICAgcmV0dXJuIG9iajtcbiAgICB9XG4gICAgaWYgKGlzU3RyaW5nKHBhdGgpKSB7XG4gICAgICByZXR1cm4gc2V0KG9iaiwgcGF0aC5zcGxpdCgnLicpLm1hcChnZXRLZXkpLCB2YWx1ZSwgZG9Ob3RSZXBsYWNlKTtcbiAgICB9XG4gICAgdmFyIGN1cnJlbnRQYXRoID0gcGF0aFswXTtcblxuICAgIGlmIChwYXRoLmxlbmd0aCA9PT0gMSkge1xuICAgICAgdmFyIG9sZFZhbCA9IG9ialtjdXJyZW50UGF0aF07XG4gICAgICBpZiAob2xkVmFsID09PSB2b2lkIDAgfHwgIWRvTm90UmVwbGFjZSkge1xuICAgICAgICBvYmpbY3VycmVudFBhdGhdID0gdmFsdWU7XG4gICAgICB9XG4gICAgICByZXR1cm4gb2xkVmFsO1xuICAgIH1cblxuICAgIGlmIChvYmpbY3VycmVudFBhdGhdID09PSB2b2lkIDApIHtcbiAgICAgIC8vY2hlY2sgaWYgd2UgYXNzdW1lIGFuIGFycmF5XG4gICAgICBpZihpc051bWJlcihwYXRoWzFdKSkge1xuICAgICAgICBvYmpbY3VycmVudFBhdGhdID0gW107XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBvYmpbY3VycmVudFBhdGhdID0ge307XG4gICAgICB9XG4gICAgfVxuXG4gICAgcmV0dXJuIHNldChvYmpbY3VycmVudFBhdGhdLCBwYXRoLnNsaWNlKDEpLCB2YWx1ZSwgZG9Ob3RSZXBsYWNlKTtcbiAgfVxuXG4gIGZ1bmN0aW9uIGRlbChvYmosIHBhdGgpIHtcbiAgICBpZiAoaXNOdW1iZXIocGF0aCkpIHtcbiAgICAgIHBhdGggPSBbcGF0aF07XG4gICAgfVxuXG4gICAgaWYgKGlzRW1wdHkob2JqKSkge1xuICAgICAgcmV0dXJuIHZvaWQgMDtcbiAgICB9XG5cbiAgICBpZiAoaXNFbXB0eShwYXRoKSkge1xuICAgICAgcmV0dXJuIG9iajtcbiAgICB9XG4gICAgaWYoaXNTdHJpbmcocGF0aCkpIHtcbiAgICAgIHJldHVybiBkZWwob2JqLCBwYXRoLnNwbGl0KCcuJykpO1xuICAgIH1cblxuICAgIHZhciBjdXJyZW50UGF0aCA9IGdldEtleShwYXRoWzBdKTtcbiAgICB2YXIgb2xkVmFsID0gb2JqW2N1cnJlbnRQYXRoXTtcblxuICAgIGlmKHBhdGgubGVuZ3RoID09PSAxKSB7XG4gICAgICBpZiAob2xkVmFsICE9PSB2b2lkIDApIHtcbiAgICAgICAgaWYgKGlzQXJyYXkob2JqKSkge1xuICAgICAgICAgIG9iai5zcGxpY2UoY3VycmVudFBhdGgsIDEpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIGRlbGV0ZSBvYmpbY3VycmVudFBhdGhdO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfSBlbHNlIHtcbiAgICAgIGlmIChvYmpbY3VycmVudFBhdGhdICE9PSB2b2lkIDApIHtcbiAgICAgICAgcmV0dXJuIGRlbChvYmpbY3VycmVudFBhdGhdLCBwYXRoLnNsaWNlKDEpKTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICByZXR1cm4gb2JqO1xuICB9XG5cbiAgdmFyIG9iamVjdFBhdGggPSB7fTtcblxuICBvYmplY3RQYXRoLmhhcyA9IGZ1bmN0aW9uIChvYmosIHBhdGgpIHtcbiAgICBpZiAoaXNFbXB0eShvYmopKSB7XG4gICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuXG4gICAgaWYgKGlzTnVtYmVyKHBhdGgpKSB7XG4gICAgICBwYXRoID0gW3BhdGhdO1xuICAgIH0gZWxzZSBpZiAoaXNTdHJpbmcocGF0aCkpIHtcbiAgICAgIHBhdGggPSBwYXRoLnNwbGl0KCcuJyk7XG4gICAgfVxuXG4gICAgaWYgKGlzRW1wdHkocGF0aCkgfHwgcGF0aC5sZW5ndGggPT09IDApIHtcbiAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG5cbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IHBhdGgubGVuZ3RoOyBpKyspIHtcbiAgICAgIHZhciBqID0gcGF0aFtpXTtcbiAgICAgIGlmICgoaXNPYmplY3Qob2JqKSB8fCBpc0FycmF5KG9iaikpICYmIF9oYXNPd25Qcm9wZXJ0eS5jYWxsKG9iaiwgaikpIHtcbiAgICAgICAgb2JqID0gb2JqW2pdO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgfVxuICAgIH1cblxuICAgIHJldHVybiB0cnVlO1xuICB9O1xuXG4gIG9iamVjdFBhdGguZW5zdXJlRXhpc3RzID0gZnVuY3Rpb24gKG9iaiwgcGF0aCwgdmFsdWUpe1xuICAgIHJldHVybiBzZXQob2JqLCBwYXRoLCB2YWx1ZSwgdHJ1ZSk7XG4gIH07XG5cbiAgb2JqZWN0UGF0aC5zZXQgPSBmdW5jdGlvbiAob2JqLCBwYXRoLCB2YWx1ZSwgZG9Ob3RSZXBsYWNlKXtcbiAgICByZXR1cm4gc2V0KG9iaiwgcGF0aCwgdmFsdWUsIGRvTm90UmVwbGFjZSk7XG4gIH07XG5cbiAgb2JqZWN0UGF0aC5pbnNlcnQgPSBmdW5jdGlvbiAob2JqLCBwYXRoLCB2YWx1ZSwgYXQpe1xuICAgIHZhciBhcnIgPSBvYmplY3RQYXRoLmdldChvYmosIHBhdGgpO1xuICAgIGF0ID0gfn5hdDtcbiAgICBpZiAoIWlzQXJyYXkoYXJyKSkge1xuICAgICAgYXJyID0gW107XG4gICAgICBvYmplY3RQYXRoLnNldChvYmosIHBhdGgsIGFycik7XG4gICAgfVxuICAgIGFyci5zcGxpY2UoYXQsIDAsIHZhbHVlKTtcbiAgfTtcblxuICBvYmplY3RQYXRoLmVtcHR5ID0gZnVuY3Rpb24ob2JqLCBwYXRoKSB7XG4gICAgaWYgKGlzRW1wdHkocGF0aCkpIHtcbiAgICAgIHJldHVybiBvYmo7XG4gICAgfVxuICAgIGlmIChpc0VtcHR5KG9iaikpIHtcbiAgICAgIHJldHVybiB2b2lkIDA7XG4gICAgfVxuXG4gICAgdmFyIHZhbHVlLCBpO1xuICAgIGlmICghKHZhbHVlID0gb2JqZWN0UGF0aC5nZXQob2JqLCBwYXRoKSkpIHtcbiAgICAgIHJldHVybiBvYmo7XG4gICAgfVxuXG4gICAgaWYgKGlzU3RyaW5nKHZhbHVlKSkge1xuICAgICAgcmV0dXJuIG9iamVjdFBhdGguc2V0KG9iaiwgcGF0aCwgJycpO1xuICAgIH0gZWxzZSBpZiAoaXNCb29sZWFuKHZhbHVlKSkge1xuICAgICAgcmV0dXJuIG9iamVjdFBhdGguc2V0KG9iaiwgcGF0aCwgZmFsc2UpO1xuICAgIH0gZWxzZSBpZiAoaXNOdW1iZXIodmFsdWUpKSB7XG4gICAgICByZXR1cm4gb2JqZWN0UGF0aC5zZXQob2JqLCBwYXRoLCAwKTtcbiAgICB9IGVsc2UgaWYgKGlzQXJyYXkodmFsdWUpKSB7XG4gICAgICB2YWx1ZS5sZW5ndGggPSAwO1xuICAgIH0gZWxzZSBpZiAoaXNPYmplY3QodmFsdWUpKSB7XG4gICAgICBmb3IgKGkgaW4gdmFsdWUpIHtcbiAgICAgICAgaWYgKF9oYXNPd25Qcm9wZXJ0eS5jYWxsKHZhbHVlLCBpKSkge1xuICAgICAgICAgIGRlbGV0ZSB2YWx1ZVtpXTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH0gZWxzZSB7XG4gICAgICByZXR1cm4gb2JqZWN0UGF0aC5zZXQob2JqLCBwYXRoLCBudWxsKTtcbiAgICB9XG4gIH07XG5cbiAgb2JqZWN0UGF0aC5wdXNoID0gZnVuY3Rpb24gKG9iaiwgcGF0aCAvKiwgdmFsdWVzICovKXtcbiAgICB2YXIgYXJyID0gb2JqZWN0UGF0aC5nZXQob2JqLCBwYXRoKTtcbiAgICBpZiAoIWlzQXJyYXkoYXJyKSkge1xuICAgICAgYXJyID0gW107XG4gICAgICBvYmplY3RQYXRoLnNldChvYmosIHBhdGgsIGFycik7XG4gICAgfVxuXG4gICAgYXJyLnB1c2guYXBwbHkoYXJyLCBBcnJheS5wcm90b3R5cGUuc2xpY2UuY2FsbChhcmd1bWVudHMsIDIpKTtcbiAgfTtcblxuICBvYmplY3RQYXRoLmNvYWxlc2NlID0gZnVuY3Rpb24gKG9iaiwgcGF0aHMsIGRlZmF1bHRWYWx1ZSkge1xuICAgIHZhciB2YWx1ZTtcblxuICAgIGZvciAodmFyIGkgPSAwLCBsZW4gPSBwYXRocy5sZW5ndGg7IGkgPCBsZW47IGkrKykge1xuICAgICAgaWYgKCh2YWx1ZSA9IG9iamVjdFBhdGguZ2V0KG9iaiwgcGF0aHNbaV0pKSAhPT0gdm9pZCAwKSB7XG4gICAgICAgIHJldHVybiB2YWx1ZTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICByZXR1cm4gZGVmYXVsdFZhbHVlO1xuICB9O1xuXG4gIG9iamVjdFBhdGguZ2V0ID0gZnVuY3Rpb24gKG9iaiwgcGF0aCwgZGVmYXVsdFZhbHVlKXtcbiAgICBpZiAoaXNOdW1iZXIocGF0aCkpIHtcbiAgICAgIHBhdGggPSBbcGF0aF07XG4gICAgfVxuICAgIGlmIChpc0VtcHR5KHBhdGgpKSB7XG4gICAgICByZXR1cm4gb2JqO1xuICAgIH1cbiAgICBpZiAoaXNFbXB0eShvYmopKSB7XG4gICAgICByZXR1cm4gZGVmYXVsdFZhbHVlO1xuICAgIH1cbiAgICBpZiAoaXNTdHJpbmcocGF0aCkpIHtcbiAgICAgIHJldHVybiBvYmplY3RQYXRoLmdldChvYmosIHBhdGguc3BsaXQoJy4nKSwgZGVmYXVsdFZhbHVlKTtcbiAgICB9XG5cbiAgICB2YXIgY3VycmVudFBhdGggPSBnZXRLZXkocGF0aFswXSk7XG5cbiAgICBpZiAocGF0aC5sZW5ndGggPT09IDEpIHtcbiAgICAgIGlmIChvYmpbY3VycmVudFBhdGhdID09PSB2b2lkIDApIHtcbiAgICAgICAgcmV0dXJuIGRlZmF1bHRWYWx1ZTtcbiAgICAgIH1cbiAgICAgIHJldHVybiBvYmpbY3VycmVudFBhdGhdO1xuICAgIH1cblxuICAgIHJldHVybiBvYmplY3RQYXRoLmdldChvYmpbY3VycmVudFBhdGhdLCBwYXRoLnNsaWNlKDEpLCBkZWZhdWx0VmFsdWUpO1xuICB9O1xuXG4gIG9iamVjdFBhdGguZGVsID0gZnVuY3Rpb24ob2JqLCBwYXRoKSB7XG4gICAgcmV0dXJuIGRlbChvYmosIHBhdGgpO1xuICB9O1xuXG4gIHJldHVybiBvYmplY3RQYXRoO1xufSk7XG4iLCIvKipcbiAqIE1vZHVsZSBEZXBlbmRlbmNpZXMuXG4gKi9cblxudmFyIHJhZiA9IHJlcXVpcmUoJ3JhZicpO1xuXG4vKipcbiAqIEV4cG9ydCBgdGhyb3R0bGVgLlxuICovXG5cbm1vZHVsZS5leHBvcnRzID0gdGhyb3R0bGU7XG5cbi8qKlxuICogRXhlY3V0ZXMgYSBmdW5jdGlvbiBhdCBtb3N0IG9uY2UgcGVyIGFuaW1hdGlvbiBmcmFtZS4gS2luZCBvZiBsaWtlXG4gKiB0aHJvdHRsZSwgYnV0IGl0IHRocm90dGxlcyBhdCB+NjBIei5cbiAqXG4gKiBAcGFyYW0ge0Z1bmN0aW9ufSBmbiAtIHRoZSBGdW5jdGlvbiB0byB0aHJvdHRsZSBvbmNlIHBlciBhbmltYXRpb24gZnJhbWVcbiAqIEByZXR1cm4ge0Z1bmN0aW9ufVxuICogQHB1YmxpY1xuICovXG5cbmZ1bmN0aW9uIHRocm90dGxlKGZuKSB7XG4gIHZhciBydG47XG4gIHZhciBpZ25vcmluZyA9IGZhbHNlO1xuXG4gIHJldHVybiBmdW5jdGlvbiBxdWV1ZSgpIHtcbiAgICBpZiAoaWdub3JpbmcpIHJldHVybiBydG47XG4gICAgaWdub3JpbmcgPSB0cnVlO1xuXG4gICAgcmFmKGZ1bmN0aW9uKCkge1xuICAgICAgaWdub3JpbmcgPSBmYWxzZTtcbiAgICB9KTtcblxuICAgIHJ0biA9IGZuLmFwcGx5KHRoaXMsIGFyZ3VtZW50cyk7XG4gICAgcmV0dXJuIHJ0bjtcbiAgfTtcbn1cbiIsIm1vZHVsZS5leHBvcnRzID0gZXhwb3J0cyA9IHJlcXVpcmUoJy4vbGliL3NsaWNlZCcpO1xuIiwiXG4vKipcbiAqIEFuIEFycmF5LnByb3RvdHlwZS5zbGljZS5jYWxsKGFyZ3VtZW50cykgYWx0ZXJuYXRpdmVcbiAqXG4gKiBAcGFyYW0ge09iamVjdH0gYXJncyBzb21ldGhpbmcgd2l0aCBhIGxlbmd0aFxuICogQHBhcmFtIHtOdW1iZXJ9IHNsaWNlXG4gKiBAcGFyYW0ge051bWJlcn0gc2xpY2VFbmRcbiAqIEBhcGkgcHVibGljXG4gKi9cblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiAoYXJncywgc2xpY2UsIHNsaWNlRW5kKSB7XG4gIHZhciByZXQgPSBbXTtcbiAgdmFyIGxlbiA9IGFyZ3MubGVuZ3RoO1xuXG4gIGlmICgwID09PSBsZW4pIHJldHVybiByZXQ7XG5cbiAgdmFyIHN0YXJ0ID0gc2xpY2UgPCAwXG4gICAgPyBNYXRoLm1heCgwLCBzbGljZSArIGxlbilcbiAgICA6IHNsaWNlIHx8IDA7XG5cbiAgaWYgKHNsaWNlRW5kICE9PSB1bmRlZmluZWQpIHtcbiAgICBsZW4gPSBzbGljZUVuZCA8IDBcbiAgICAgID8gc2xpY2VFbmQgKyBsZW5cbiAgICAgIDogc2xpY2VFbmRcbiAgfVxuXG4gIHdoaWxlIChsZW4tLSA+IHN0YXJ0KSB7XG4gICAgcmV0W2xlbiAtIHN0YXJ0XSA9IGFyZ3NbbGVuXTtcbiAgfVxuXG4gIHJldHVybiByZXQ7XG59XG5cbiIsIid1c2Ugc3RyaWN0JztcblxuZnVuY3Rpb24gU291bmRDbG91ZCAoY2xpZW50SWQpIHtcbiAgICBpZiAoISh0aGlzIGluc3RhbmNlb2YgU291bmRDbG91ZCkpIHtcbiAgICAgICAgcmV0dXJuIG5ldyBTb3VuZENsb3VkKGNsaWVudElkKTtcbiAgICB9XG5cbiAgICBpZiAoIWNsaWVudElkKSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcignU291bmRDbG91ZCBBUEkgY2xpZW50SWQgaXMgcmVxdWlyZWQsIGdldCBpdCAtIGh0dHBzOi8vZGV2ZWxvcGVycy5zb3VuZGNsb3VkLmNvbS8nKTtcbiAgICB9XG5cbiAgICB0aGlzLl9ldmVudHMgPSB7fTtcblxuICAgIHRoaXMuX2NsaWVudElkID0gY2xpZW50SWQ7XG4gICAgdGhpcy5fYmFzZVVybCA9ICdodHRwOi8vYXBpLnNvdW5kY2xvdWQuY29tJztcblxuICAgIHRoaXMucGxheWluZyA9IGZhbHNlO1xuICAgIHRoaXMuZHVyYXRpb24gPSAwO1xuXG4gICAgdGhpcy5hdWRpbyA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2F1ZGlvJyk7XG59XG5cblNvdW5kQ2xvdWQucHJvdG90eXBlLnJlc29sdmUgPSBmdW5jdGlvbiAodXJsLCBjYWxsYmFjaykge1xuICAgIGlmICghdXJsKSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcignU291bmRDbG91ZCB0cmFjayBvciBwbGF5bGlzdCB1cmwgaXMgcmVxdWlyZWQnKTtcbiAgICB9XG5cbiAgICB1cmwgPSB0aGlzLl9iYXNlVXJsKycvcmVzb2x2ZS5qc29uP3VybD0nK3VybCsnJmNsaWVudF9pZD0nK3RoaXMuX2NsaWVudElkO1xuXG4gICAgdGhpcy5fanNvbnAodXJsLCBmdW5jdGlvbiAoZGF0YSkge1xuICAgICAgICBpZiAoZGF0YS50cmFja3MpIHtcbiAgICAgICAgICAgIHRoaXMuX3BsYXlsaXN0ID0gZGF0YTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHRoaXMuX3RyYWNrID0gZGF0YTtcbiAgICAgICAgfVxuXG4gICAgICAgIHRoaXMuZHVyYXRpb24gPSBkYXRhLmR1cmF0aW9uLzEwMDA7IC8vIGNvbnZlcnQgdG8gc2Vjb25kc1xuICAgICAgICBjYWxsYmFjayhkYXRhKTtcbiAgICB9LmJpbmQodGhpcykpO1xufTtcblxuU291bmRDbG91ZC5wcm90b3R5cGUuX2pzb25wID0gZnVuY3Rpb24gKHVybCwgY2FsbGJhY2spIHtcbiAgICB2YXIgdGFyZ2V0ID0gZG9jdW1lbnQuZ2V0RWxlbWVudHNCeVRhZ05hbWUoJ3NjcmlwdCcpWzBdIHx8IGRvY3VtZW50LmhlYWQ7XG4gICAgdmFyIHNjcmlwdCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ3NjcmlwdCcpO1xuXG4gICAgdmFyIGlkID0gJ2pzb25wX2NhbGxiYWNrXycrTWF0aC5yb3VuZCgxMDAwMDAqTWF0aC5yYW5kb20oKSk7XG4gICAgd2luZG93W2lkXSA9IGZ1bmN0aW9uIChkYXRhKSB7XG4gICAgICAgIGlmIChzY3JpcHQucGFyZW50Tm9kZSkge1xuICAgICAgICAgICAgc2NyaXB0LnBhcmVudE5vZGUucmVtb3ZlQ2hpbGQoc2NyaXB0KTtcbiAgICAgICAgfVxuICAgICAgICB3aW5kb3dbaWRdID0gZnVuY3Rpb24gKCkge307XG4gICAgICAgIGNhbGxiYWNrKGRhdGEpO1xuICAgIH07XG5cbiAgICBzY3JpcHQuc3JjID0gdXJsICsgKHVybC5pbmRleE9mKCc/JykgPj0gMCA/ICcmJyA6ICc/JykgKyAnY2FsbGJhY2s9JyArIGlkO1xuICAgIHRhcmdldC5wYXJlbnROb2RlLmluc2VydEJlZm9yZShzY3JpcHQsIHRhcmdldCk7XG59O1xuXG5Tb3VuZENsb3VkLnByb3RvdHlwZS5vbiA9IGZ1bmN0aW9uIChlLCBmbikge1xuICAgIHRoaXMuX2V2ZW50c1tlXSA9IGZuO1xuICAgIHRoaXMuYXVkaW8uYWRkRXZlbnRMaXN0ZW5lcihlLCBmbiwgZmFsc2UpO1xufTtcblxuU291bmRDbG91ZC5wcm90b3R5cGUub2ZmID0gZnVuY3Rpb24gKGUsIGZuKSB7XG4gICAgdGhpcy5fZXZlbnRzW2VdID0gbnVsbDtcbiAgICB0aGlzLmF1ZGlvLnJlbW92ZUV2ZW50TGlzdGVuZXIoZSwgZm4pO1xufTtcblxuU291bmRDbG91ZC5wcm90b3R5cGUudW5iaW5kQWxsID0gZnVuY3Rpb24gKCkge1xuICAgIGZvciAodmFyIGUgaW4gdGhpcy5fZXZlbnRzKSB7XG4gICAgICAgIHZhciBmbiA9IHRoaXMuX2V2ZW50c1tlXTtcbiAgICAgICAgaWYgKGZuKSB7XG4gICAgICAgICAgICB0aGlzLm9mZihlLCBmbik7XG4gICAgICAgIH1cbiAgICB9XG59O1xuXG5Tb3VuZENsb3VkLnByb3RvdHlwZS5wcmVsb2FkID0gZnVuY3Rpb24gKHN0cmVhbVVybCkge1xuICAgIHRoaXMuX3RyYWNrID0ge3N0cmVhbV91cmw6IHN0cmVhbVVybH07XG4gICAgdGhpcy5hdWRpby5zcmMgPSBzdHJlYW1VcmwrJz9jbGllbnRfaWQ9Jyt0aGlzLl9jbGllbnRJZDtcbn07XG5cblNvdW5kQ2xvdWQucHJvdG90eXBlLnBsYXkgPSBmdW5jdGlvbiAob3B0aW9ucykge1xuICAgIG9wdGlvbnMgPSBvcHRpb25zIHx8IHt9O1xuICAgIHZhciBzcmM7XG5cbiAgICBpZiAob3B0aW9ucy5zdHJlYW1VcmwpIHtcbiAgICAgICAgc3JjID0gb3B0aW9ucy5zdHJlYW1Vcmw7XG4gICAgfSBlbHNlIGlmICh0aGlzLl9wbGF5bGlzdCkge1xuICAgICAgICB2YXIgbGVuZ3RoID0gdGhpcy5fcGxheWxpc3QudHJhY2tzLmxlbmd0aDtcbiAgICAgICAgaWYgKGxlbmd0aCkge1xuICAgICAgICAgICAgdGhpcy5fcGxheWxpc3RJbmRleCA9IG9wdGlvbnMucGxheWxpc3RJbmRleCB8fCAwO1xuXG4gICAgICAgICAgICAvLyBiZSBzaWxlbnQgaWYgaW5kZXggaXMgb3V0IG9mIHJhbmdlXG4gICAgICAgICAgICBpZiAodGhpcy5fcGxheWxpc3RJbmRleCA+PSBsZW5ndGggfHwgdGhpcy5fcGxheWxpc3RJbmRleCA8IDApIHtcbiAgICAgICAgICAgICAgICB0aGlzLl9wbGF5bGlzdEluZGV4ID0gMDtcbiAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBzcmMgPSB0aGlzLl9wbGF5bGlzdC50cmFja3NbdGhpcy5fcGxheWxpc3RJbmRleF0uc3RyZWFtX3VybDtcbiAgICAgICAgfVxuICAgIH0gZWxzZSBpZiAodGhpcy5fdHJhY2spIHtcbiAgICAgICAgc3JjID0gdGhpcy5fdHJhY2suc3RyZWFtX3VybDtcbiAgICB9XG5cbiAgICBpZiAoIXNyYykge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ1RoZXJlIGlzIG5vIHRyYWNrcyB0byBwbGF5LCB1c2UgYHN0cmVhbVVybGAgb3B0aW9uIG9yIGBsb2FkYCBtZXRob2QnKTtcbiAgICB9XG5cbiAgICBzcmMgKz0gJz9jbGllbnRfaWQ9Jyt0aGlzLl9jbGllbnRJZDtcblxuICAgIGlmIChzcmMgIT09IHRoaXMuYXVkaW8uc3JjKSB7XG4gICAgICAgIHRoaXMuYXVkaW8uc3JjID0gc3JjO1xuICAgIH1cblxuICAgIHRoaXMucGxheWluZyA9IHNyYztcbiAgICB0aGlzLmF1ZGlvLnBsYXkoKTtcbn07XG5cblNvdW5kQ2xvdWQucHJvdG90eXBlLnBhdXNlID0gZnVuY3Rpb24gKCkge1xuICAgIHRoaXMuYXVkaW8ucGF1c2UoKTtcbiAgICB0aGlzLnBsYXlpbmcgPSBmYWxzZTtcbn07XG5cblNvdW5kQ2xvdWQucHJvdG90eXBlLnN0b3AgPSBmdW5jdGlvbiAoKSB7XG4gICAgdGhpcy5hdWRpby5wYXVzZSgpO1xuICAgIHRoaXMuYXVkaW8uY3VycmVudFRpbWUgPSAwO1xuICAgIHRoaXMucGxheWluZyA9IGZhbHNlO1xufTtcblxuU291bmRDbG91ZC5wcm90b3R5cGUubmV4dCA9IGZ1bmN0aW9uICgpIHtcbiAgICB2YXIgdHJhY2tzTGVuZ3RoID0gdGhpcy5fcGxheWxpc3QudHJhY2tzLmxlbmd0aDtcbiAgICBpZiAodGhpcy5fcGxheWxpc3RJbmRleCA+PSB0cmFja3NMZW5ndGgtMSkge1xuICAgICAgICByZXR1cm47XG4gICAgfVxuICAgIGlmICh0aGlzLl9wbGF5bGlzdCAmJiB0cmFja3NMZW5ndGgpIHtcbiAgICAgICAgdGhpcy5wbGF5KHtwbGF5bGlzdEluZGV4OiArK3RoaXMuX3BsYXlsaXN0SW5kZXh9KTtcbiAgICB9XG59O1xuXG5Tb3VuZENsb3VkLnByb3RvdHlwZS5wcmV2aW91cyA9IGZ1bmN0aW9uICgpIHtcbiAgICBpZiAodGhpcy5fcGxheWxpc3RJbmRleCA8PSAwKSB7XG4gICAgICAgIHJldHVybjtcbiAgICB9XG4gICAgaWYgKHRoaXMuX3BsYXlsaXN0ICYmIHRoaXMuX3BsYXlsaXN0LnRyYWNrcy5sZW5ndGgpIHtcbiAgICAgICAgdGhpcy5wbGF5KHtwbGF5bGlzdEluZGV4OiAtLXRoaXMuX3BsYXlsaXN0SW5kZXh9KTtcbiAgICB9XG59O1xuXG5Tb3VuZENsb3VkLnByb3RvdHlwZS5zZWVrID0gZnVuY3Rpb24gKGUpIHtcbiAgICBpZiAoIXRoaXMuYXVkaW8ucmVhZHlTdGF0ZSkge1xuICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuICAgIHZhciBwZXJjZW50ID0gZS5vZmZzZXRYIC8gZS50YXJnZXQub2Zmc2V0V2lkdGggfHwgKGUubGF5ZXJYIC0gZS50YXJnZXQub2Zmc2V0TGVmdCkgLyBlLnRhcmdldC5vZmZzZXRXaWR0aDtcbiAgICB0aGlzLmF1ZGlvLmN1cnJlbnRUaW1lID0gcGVyY2VudCAqICh0aGlzLmF1ZGlvLmR1cmF0aW9uIHx8IDApO1xufTtcblxubW9kdWxlLmV4cG9ydHMgPSBTb3VuZENsb3VkO1xuIiwiLyoqIEBqc3ggZGVrdS5kb20gKi9cblxuaW1wb3J0IGRla3UgZnJvbSAnZGVrdSc7XG5cbmNvbnN0IFBsYXlCdXR0b24gPSB7XG4gICAgZGVmYXVsdFByb3BzOiB7XG4gICAgICAgIHBsYXlpbmc6IGZhbHNlLFxuICAgICAgICBzZWVraW5nOiBmYWxzZVxuICAgIH0sXG5cbiAgICBwcm9wVHlwZXM6IHtcbiAgICAgICAgcGxheWluZzoge1xuICAgICAgICAgICAgdHlwZTogJ2Jvb2xlYW4nXG4gICAgICAgIH0sXG4gICAgICAgIHNlZWtpbmc6IHtcbiAgICAgICAgICAgIHR5cGU6ICdib29sZWFuJ1xuICAgICAgICB9XG4gICAgfSxcblxuICAgIHJlbmRlcihjb21wb25lbnQpIHtcbiAgICAgICAgY29uc3QgeyBwcm9wcyB9ID0gY29tcG9uZW50O1xuXG4gICAgICAgIGZ1bmN0aW9uIGhhbmRsZUNsaWNrIChlKSB7XG4gICAgICAgICAgICBlLnByZXZlbnREZWZhdWx0KCk7XG5cbiAgICAgICAgICAgIGNvbnN0IHsgcGxheWluZywgc291bmRDbG91ZEF1ZGlvLCBvblRvZ2dsZVBsYXkgfSA9IHByb3BzO1xuXG4gICAgICAgICAgICBpZiAoIXBsYXlpbmcpIHtcbiAgICAgICAgICAgICAgICBzb3VuZENsb3VkQXVkaW8gJiYgc291bmRDbG91ZEF1ZGlvLnBsYXkoKTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgc291bmRDbG91ZEF1ZGlvICYmIHNvdW5kQ2xvdWRBdWRpby5wYXVzZSgpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBvblRvZ2dsZVBsYXkgJiYgb25Ub2dnbGVQbGF5KGUpO1xuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIChcbiAgICAgICAgICAgIDxidXR0b24gY2xhc3M9XCJzYi1zb3VuZHBsYXllci13aWRnZXQtcGxheVwiIG9uQ2xpY2s9e2hhbmRsZUNsaWNrfT5cbiAgICAgICAgICAgICAgICB7cHJvcHMucGxheWluZyA/ICdQYXVzZScgOiAnUGxheSd9XG4gICAgICAgICAgICA8L2J1dHRvbj5cbiAgICAgICAgKTtcbiAgICB9XG59O1xuXG5leHBvcnQgZGVmYXVsdCBQbGF5QnV0dG9uO1xuIiwiLyoqIEBqc3ggZGVrdS5kb20gKi9cblxuaW1wb3J0IGRla3UgZnJvbSAnZGVrdSc7XG5cbmZ1bmN0aW9uIHByZXR0eVRpbWUgKHRpbWUpIHtcbiAgICBsZXQgaG91cnMgPSBNYXRoLmZsb29yKHRpbWUgLyAzNjAwKTtcbiAgICBsZXQgbWlucyA9ICcwJyArIE1hdGguZmxvb3IoKHRpbWUgJSAzNjAwKSAvIDYwKTtcbiAgICBsZXQgc2VjcyA9ICcwJyArIE1hdGguZmxvb3IoKHRpbWUgJSA2MCkpO1xuXG4gICAgbWlucyA9IG1pbnMuc3Vic3RyKG1pbnMubGVuZ3RoIC0gMik7XG4gICAgc2VjcyA9IHNlY3Muc3Vic3RyKHNlY3MubGVuZ3RoIC0gMik7XG5cbiAgICBpZiAoIWlzTmFOKHNlY3MpKSB7XG4gICAgICAgIGlmIChob3Vycykge1xuICAgICAgICAgICAgcmV0dXJuIGAke2hvdXJzfToke21pbnN9OiR7c2Vjc31gO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgcmV0dXJuIGAke21pbnN9OiR7c2Vjc31gO1xuICAgICAgICB9XG4gICAgfSBlbHNlIHtcbiAgICAgICAgcmV0dXJuICcwMDowMCc7XG4gICAgfVxufVxuXG5jb25zdCBUaW1lciA9IHtcbiAgICBkZWZhdWx0UHJvcHM6IHtcbiAgICAgICAgZHVyYXRpb246IDAsXG4gICAgICAgIGN1cnJlbnRUaW1lOiAwXG4gICAgfSxcblxuICAgIHByb3BUeXBlczoge1xuICAgICAgICBkdXJhdGlvbjoge1xuICAgICAgICAgICAgdHlwZTogJ251bWJlcidcbiAgICAgICAgfSxcbiAgICAgICAgY3VycmVudFRpbWU6IHtcbiAgICAgICAgICAgIHR5cGU6ICdudW1iZXInXG4gICAgICAgIH1cbiAgICB9LFxuXG4gICAgcmVuZGVyKGNvbXBvbmVudCkge1xuICAgICAgICBjb25zdCB7IHByb3BzIH0gPSBjb21wb25lbnQ7XG5cbiAgICAgICAgcmV0dXJuIChcbiAgICAgICAgICAgIDxkaXYgY2xhc3M9XCJzYi1zb3VuZHBsYXllci13aWRnZXQtdGltZXJcIj5cbiAgICAgICAgICAgICAgICB7cHJldHR5VGltZShwcm9wcy5jdXJyZW50VGltZSl9IC8ge3ByZXR0eVRpbWUocHJvcHMuZHVyYXRpb24pfVxuICAgICAgICAgICAgPC9kaXY+XG4gICAgICAgICk7XG4gICAgfVxufTtcblxuZXhwb3J0IGRlZmF1bHQgVGltZXI7XG4iLCIvKiogQGpzeCBkZWt1LmRvbSAqL1xuXG5pbXBvcnQgZGVrdSBmcm9tICdkZWt1JztcblxuaW1wb3J0IFBsYXlCdXR0b24gZnJvbSAnLi9jb21wb25lbnRzL1BsYXlCdXR0b24nO1xuaW1wb3J0IFRpbWVyIGZyb20gJy4vY29tcG9uZW50cy9UaW1lcic7XG5cbmNvbnN0IFdpZGdldCA9IHtcbiAgICBpbml0aWFsU3RhdGUoKSB7XG4gICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICBkdXJhdGlvbjogMCxcbiAgICAgICAgICAgIGN1cnJlbnRUaW1lOiAwLFxuICAgICAgICAgICAgc2Vla2luZzogZmFsc2UsXG4gICAgICAgICAgICBwbGF5aW5nOiBmYWxzZVxuICAgICAgICB9O1xuICAgIH0sXG5cbiAgICBhZnRlck1vdW50KGNvbXBvbmVudCwgZWwsIHNldFN0YXRlKSB7XG4gICAgICAgIGNvbnN0IHsgcHJvcHMgfSA9IGNvbXBvbmVudDtcbiAgICAgICAgY29uc3QgeyBzb3VuZENsb3VkQXVkaW8gfSA9IHByb3BzO1xuXG4gICAgICAgIHNvdW5kQ2xvdWRBdWRpby5yZXNvbHZlKHByb3BzLnVybCwgKGRhdGEpID0+IHtcbiAgICAgICAgICAgIHNldFN0YXRlKHtcbiAgICAgICAgICAgICAgICBbZGF0YS50cmFja3MgPyAncGxheWxpc3QnIDogJ3RyYWNrJ106IGRhdGFcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9KTtcblxuICAgICAgICBmdW5jdGlvbiBvbkF1ZGlvU3RhcnRlZCAoKSB7XG4gICAgICAgICAgICBzZXRTdGF0ZSh7cGxheWluZzogdHJ1ZX0pO1xuICAgICAgICAgICAgLy8gc3RvcCBhbGwgb3RoZXJcbiAgICAgICAgfVxuXG4gICAgICAgIGZ1bmN0aW9uIGdldEN1cnJlbnRUaW1lICgpIHtcbiAgICAgICAgICAgIHNldFN0YXRlKHtjdXJyZW50VGltZTogc291bmRDbG91ZEF1ZGlvLmF1ZGlvLmN1cnJlbnRUaW1lfSk7XG4gICAgICAgIH1cblxuICAgICAgICBmdW5jdGlvbiBnZXREdXJhdGlvbiAoKSB7XG4gICAgICAgICAgICBzZXRTdGF0ZSh7ZHVyYXRpb246IHNvdW5kQ2xvdWRBdWRpby5hdWRpby5kdXJhdGlvbn0pO1xuICAgICAgICB9XG5cbiAgICAgICAgZnVuY3Rpb24gb25TZWVraW5nVHJhY2sgKCkge1xuICAgICAgICAgICAgc2V0U3RhdGUoe3NlZWtpbmc6IHRydWV9KTtcbiAgICAgICAgfVxuXG4gICAgICAgIGZ1bmN0aW9uIG9uU2Vla2VkVHJhY2sgKCkge1xuICAgICAgICAgICAgc2V0U3RhdGUoe3NlZWtpbmc6IGZhbHNlfSk7XG4gICAgICAgIH1cblxuICAgICAgICBmdW5jdGlvbiBvbkF1ZGlvRW5kZWQgKCkge1xuICAgICAgICAgICAgc2V0U3RhdGUoe3BsYXlpbmc6IGZhbHNlfSk7XG4gICAgICAgIH1cblxuICAgICAgICAvLyBodHRwczovL2RldmVsb3Blci5tb3ppbGxhLm9yZy9lbi1VUy9kb2NzL1dlYi9HdWlkZS9FdmVudHMvTWVkaWFfZXZlbnRzXG4gICAgICAgIHNvdW5kQ2xvdWRBdWRpby5vbigncGxheWluZycsIG9uQXVkaW9TdGFydGVkKTtcbiAgICAgICAgc291bmRDbG91ZEF1ZGlvLm9uKCd0aW1ldXBkYXRlJywgZ2V0Q3VycmVudFRpbWUpO1xuICAgICAgICBzb3VuZENsb3VkQXVkaW8ub24oJ2xvYWRlZG1ldGFkYXRhJywgZ2V0RHVyYXRpb24pO1xuICAgICAgICBzb3VuZENsb3VkQXVkaW8ub24oJ3NlZWtpbmcnLCBvblNlZWtpbmdUcmFjayk7XG4gICAgICAgIHNvdW5kQ2xvdWRBdWRpby5vbignc2Vla2VkJywgb25TZWVrZWRUcmFjayk7XG4gICAgICAgIHNvdW5kQ2xvdWRBdWRpby5vbigncGF1c2UnLCBvbkF1ZGlvRW5kZWQpO1xuICAgICAgICBzb3VuZENsb3VkQXVkaW8ub24oJ2VuZGVkJywgb25BdWRpb0VuZGVkKTtcbiAgICB9LFxuXG5cbiAgICBiZWZvcmVNb3VudChjb21wb25lbnQpIHtcbiAgICAgICAgY29uc3QgeyBwcm9wcyB9ID0gY29tcG9uZW50O1xuICAgICAgICBwcm9wcy5zb3VuZENsb3VkQXVkaW8udW5iaW5kQWxsKCk7XG4gICAgfSxcblxuICAgIHJlbmRlcihjb21wb25lbnQpIHtcbiAgICAgICAgbGV0IHsgc3RhdGUsIHByb3BzIH0gPSBjb21wb25lbnQ7XG5cbiAgICAgICAgcmV0dXJuIChcbiAgICAgICAgICAgIDxkaXY+XG4gICAgICAgICAgICAgICAge3N0YXRlLnRyYWNrID8gKFxuICAgICAgICAgICAgICAgICAgICA8ZGl2PlxuICAgICAgICAgICAgICAgICAgICAgICAgPGltZyBzcmM9e3N0YXRlLnRyYWNrLmFydHdvcmtfdXJsLnJlcGxhY2UoJ2xhcmdlJywgJ3Q1MDB4NTAwJyl9IC8+XG4gICAgICAgICAgICAgICAgICAgICAgICA8aDI+e3N0YXRlLnRyYWNrID8gc3RhdGUudHJhY2sudGl0bGUgOiAnTG9hZGluZy4uJ308L2gyPlxuICAgICAgICAgICAgICAgICAgICA8L2Rpdj5cbiAgICAgICAgICAgICAgICApIDogKFxuICAgICAgICAgICAgICAgICAgICA8ZGl2PkxvYWRpbmcuLjwvZGl2PlxuICAgICAgICAgICAgICAgICl9XG4gICAgICAgICAgICAgICAgPFBsYXlCdXR0b25cbiAgICAgICAgICAgICAgICAgICAgcGxheWluZz17c3RhdGUucGxheWluZ31cbiAgICAgICAgICAgICAgICAgICAgc291bmRDbG91ZEF1ZGlvPXtwcm9wcy5zb3VuZENsb3VkQXVkaW99XG4gICAgICAgICAgICAgICAgLz5cbiAgICAgICAgICAgICAgICA8VGltZXJcbiAgICAgICAgICAgICAgICAgICAgZHVyYXRpb249e3N0YXRlLmR1cmF0aW9ufVxuICAgICAgICAgICAgICAgICAgICBjdXJyZW50VGltZT17c3RhdGUuY3VycmVudFRpbWV9XG4gICAgICAgICAgICAgICAgLz5cbiAgICAgICAgICAgIDwvZGl2PlxuICAgICAgICApO1xuICAgIH1cbn07XG5cbmV4cG9ydCBmdW5jdGlvbiBjcmVhdGUgKGVsLCBvcHRzKSB7XG4gICAgbGV0IGFwcCA9IGRla3Uuc2NlbmUoXG4gICAgICAgIDxXaWRnZXQgdXJsPXtvcHRzLnVybH0gc291bmRDbG91ZEF1ZGlvPXtvcHRzLnNvdW5kQ2xvdWRBdWRpb30gLz5cbiAgICApO1xuXG4gICAgZGVrdS5yZW5kZXIoYXBwLCBlbCk7XG59XG4iXX0=
