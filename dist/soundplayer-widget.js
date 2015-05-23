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
"use strict";

Object.defineProperty(exports, "__esModule", {
    value: true
});

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { "default": obj }; }

/** @jsx deku.dom */

var _deku = require("deku");

var _deku2 = _interopRequireDefault(_deku);

// SoundCloud Logo
var SoundCloudLogoSVG = {
    shouldUpdate: function shouldUpdate() {
        return false;
    },

    render: function render() {
        return _deku2["default"].dom(
            "svg",
            {
                "class": "sb-soundplayer-widget-cover-logo",
                xmlns: "http://www.w3.org/2000/svg",
                fill: "currentColor"
            },
            _deku2["default"].dom("path", { d: "M10.517 3.742c-.323 0-.49.363-.49.582 0 0-.244 3.591-.244 4.641 0 1.602.15 2.621.15 2.621 0 .222.261.401.584.401.321 0 .519-.179.519-.401 0 0 .398-1.038.398-2.639 0-1.837-.153-4.127-.284-4.592-.112-.395-.313-.613-.633-.613zm-1.996.268c-.323 0-.49.363-.49.582 0 0-.244 3.322-.244 4.372 0 1.602.119 2.621.119 2.621 0 .222.26.401.584.401.321 0 .581-.179.581-.401 0 0 .081-1.007.081-2.608 0-1.837-.206-4.386-.206-4.386 0-.218-.104-.581-.425-.581zm-2.021 1.729c-.324 0-.49.362-.49.582 0 0-.272 1.594-.272 2.644 0 1.602.179 2.559.179 2.559 0 .222.229.463.552.463.321 0 .519-.241.519-.463 0 0 .19-.944.19-2.546 0-1.837-.253-2.657-.253-2.657 0-.22-.104-.582-.425-.582zm-2.046-.358c-.323 0-.49.363-.49.582 0 0-.162 1.92-.162 2.97 0 1.602.069 2.496.069 2.496 0 .222.26.557.584.557.321 0 .581-.304.581-.526 0 0 .143-.936.143-2.538 0-1.837-.206-2.96-.206-2.96 0-.218-.198-.581-.519-.581zm-2.169 1.482c-.272 0-.232.218-.232.218v3.982s-.04.335.232.335c.351 0 .716-.832.716-2.348 0-1.245-.436-2.187-.716-2.187zm18.715-.976c-.289 0-.567.042-.832.116-.417-2.266-2.806-3.989-5.263-3.989-1.127 0-2.095.705-2.931 1.316v8.16s0 .484.5.484h8.526c1.655 0 3-1.55 3-3.155 0-1.607-1.346-2.932-3-2.932zm10.17.857c-1.077-.253-1.368-.389-1.368-.815 0-.3.242-.611.97-.611.621 0 1.106.253 1.542.699l.981-.951c-.641-.669-1.417-1.067-2.474-1.067-1.339 0-2.425.757-2.425 1.99 0 1.338.873 1.736 2.124 2.026 1.281.291 1.513.486 1.513.923 0 .514-.379.738-1.184.738-.65 0-1.26-.223-1.736-.777l-.98.873c.514.757 1.504 1.232 2.639 1.232 1.853 0 2.668-.873 2.668-2.163 0-1.477-1.193-1.845-2.27-2.097zm6.803-2.745c-1.853 0-2.949 1.435-2.949 3.502s1.096 3.501 2.949 3.501c1.852 0 2.949-1.434 2.949-3.501s-1.096-3.502-2.949-3.502zm0 5.655c-1.097 0-1.553-.941-1.553-2.153 0-1.213.456-2.153 1.553-2.153 1.096 0 1.551.94 1.551 2.153.001 1.213-.454 2.153-1.551 2.153zm8.939-1.736c0 1.086-.533 1.756-1.396 1.756-.864 0-1.388-.689-1.388-1.775v-3.897h-1.358v3.916c0 1.978 1.106 3.084 2.746 3.084 1.726 0 2.754-1.136 2.754-3.103v-3.897h-1.358v3.916zm8.142-.89l.019 1.485c-.087-.174-.31-.515-.475-.768l-2.703-3.692h-1.362v6.894h1.401v-2.988l-.02-1.484c.088.175.311.514.475.767l2.79 3.705h1.213v-6.894h-1.339v2.975zm5.895-2.923h-2.124v6.791h2.027c1.746 0 3.474-1.01 3.474-3.395 0-2.484-1.437-3.396-3.377-3.396zm-.097 5.472h-.67v-4.152h.719c1.436 0 2.028.688 2.028 2.076 0 1.242-.651 2.076-2.077 2.076zm7.909-4.229c.611 0 1 .271 1.242.737l1.26-.582c-.426-.883-1.202-1.503-2.483-1.503-1.775 0-3.016 1.435-3.016 3.502 0 2.143 1.191 3.501 2.968 3.501 1.232 0 2.047-.572 2.513-1.533l-1.145-.68c-.358.602-.718.864-1.329.864-1.019 0-1.611-.932-1.611-2.153-.001-1.261.583-2.153 1.601-2.153zm5.17-1.192h-1.359v6.791h4.083v-1.338h-2.724v-5.453zm6.396-.157c-1.854 0-2.949 1.435-2.949 3.502s1.095 3.501 2.949 3.501c1.853 0 2.95-1.434 2.95-3.501s-1.097-3.502-2.95-3.502zm0 5.655c-1.097 0-1.553-.941-1.553-2.153 0-1.213.456-2.153 1.553-2.153 1.095 0 1.55.94 1.55 2.153.001 1.213-.454 2.153-1.55 2.153zm8.557-1.736c0 1.086-.532 1.756-1.396 1.756-.864 0-1.388-.689-1.388-1.775v-3.794h-1.358v3.813c0 1.978 1.106 3.084 2.746 3.084 1.726 0 2.755-1.136 2.755-3.103v-3.794h-1.36v3.813zm5.449-3.907h-2.318v6.978h2.211c1.908 0 3.789-1.037 3.789-3.489 0-2.552-1.565-3.489-3.682-3.489zm-.108 5.623h-.729v-4.266h.783c1.565 0 2.21.706 2.21 2.133.001 1.276-.707 2.133-2.264 2.133z" })
        );
    }
};

// Player Button Icons
var ButtonIconSVG = {
    render: function render(component) {
        var props = component.props;

        return _deku2["default"].dom(
            "svg",
            {
                "class": "sb-soundplayer-widget-button-icon",
                xmlns: "http://www.w3.org/2000/svg",
                viewBox: "0 0 32 32",
                fill: "currentColor"
            },
            props.children
        );
    }
};

// |> Play
var PlayIconSVG = {
    shouldUpdate: function shouldUpdate() {
        return false;
    },

    render: function render() {
        return _deku2["default"].dom(
            ButtonIconSVG,
            null,
            _deku2["default"].dom("path", { d: "M0 0 L32 16 L0 32 z" })
        );
    }
};

// || Pause
var PauseIconSVG = {
    shouldUpdate: function shouldUpdate() {
        return false;
    },

    render: function render() {
        return _deku2["default"].dom(
            ButtonIconSVG,
            null,
            _deku2["default"].dom("path", { d: "M0 0 H12 V32 H0 z M20 0 H32 V32 H20 z" })
        );
    }
};

// |>| Next
var NextIconSVG = {
    shouldUpdate: function shouldUpdate() {
        return false;
    },

    render: function render() {
        return _deku2["default"].dom(
            ButtonIconSVG,
            null,
            _deku2["default"].dom("path", { d: "M4 4 L24 14 V4 H28 V28 H24 V18 L4 28 z " })
        );
    }
};

// |<| Prev
var PrevIconSVG = {
    shouldUpdate: function shouldUpdate() {
        return false;
    },

    render: function render() {
        return _deku2["default"].dom(
            ButtonIconSVG,
            null,
            _deku2["default"].dom("path", { d: "M4 4 H8 V14 L28 4 V28 L8 18 V28 H4 z " })
        );
    }
};

exports["default"] = {
    SoundCloudLogoSVG: SoundCloudLogoSVG,
    PlayIconSVG: PlayIconSVG,
    PauseIconSVG: PauseIconSVG,
    NextIconSVG: NextIconSVG,
    PrevIconSVG: PrevIconSVG
};
module.exports = exports["default"];

},{"deku":2}],65:[function(require,module,exports){
'use strict';

Object.defineProperty(exports, '__esModule', {
    value: true
});

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { 'default': obj }; }

/** @jsx deku.dom */

var _deku = require('deku');

var _deku2 = _interopRequireDefault(_deku);

var _Icons = require('./Icons');

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
            !props.playing ? _deku2['default'].dom(_Icons.PlayIconSVG, null) : _deku2['default'].dom(_Icons.PauseIconSVG, null)
        );
    }
};

exports['default'] = PlayButton;
module.exports = exports['default'];

},{"./Icons":64,"deku":2}],66:[function(require,module,exports){
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

},{"deku":2}],67:[function(require,module,exports){
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

},{"deku":2}],68:[function(require,module,exports){
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

},{}],69:[function(require,module,exports){
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
    var clientId = opts.clientId || window.sb_soundplayer_client_id;
    if (!clientId) {
        console.log('Please get SoundCloud clientId from https://developers.soundcloud.com/');
        return;
    }

    var soundCloudAudio = new _soundcloudAudio2['default'](clientId);

    var app = _deku2['default'].tree(_deku2['default'].dom(Widget, { url: opts.url, soundCloudAudio: soundCloudAudio }));

    _deku2['default'].render(app, el);
}

},{"./components/PlayButton":65,"./components/Progress":66,"./components/Timer":67,"./utils/audioStore":68,"deku":2,"soundcloud-audio":63}],70:[function(require,module,exports){
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
    var layout = el.getAttribute('data-layout');

    SPWidget.create(el, { url: url, layout: layout });
}

},{"./widget":69}]},{},[70])
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm5vZGVfbW9kdWxlcy9icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCJub2RlX21vZHVsZXMvZGVrdS9saWIvYXBwbGljYXRpb24uanMiLCJub2RlX21vZHVsZXMvZGVrdS9saWIvaW5kZXguanMiLCJub2RlX21vZHVsZXMvZGVrdS9saWIvcmVuZGVyLmpzIiwibm9kZV9tb2R1bGVzL2Rla3UvbGliL3N0cmluZ2lmeS5qcyIsIm5vZGVfbW9kdWxlcy9kZWt1L2xpYi9zdmcuanMiLCJub2RlX21vZHVsZXMvZGVrdS9saWIvdXRpbHMuanMiLCJub2RlX21vZHVsZXMvZGVrdS9saWIvdmlydHVhbC5qcyIsIm5vZGVfbW9kdWxlcy9kZWt1L25vZGVfbW9kdWxlcy9hcnJheS1mbGF0dGVuL2FycmF5LWZsYXR0ZW4uanMiLCJub2RlX21vZHVsZXMvZGVrdS9ub2RlX21vZHVsZXMvY29tcG9uZW50LWVtaXR0ZXIvaW5kZXguanMiLCJub2RlX21vZHVsZXMvZGVrdS9ub2RlX21vZHVsZXMvY29tcG9uZW50LXJhZi9pbmRleC5qcyIsIm5vZGVfbW9kdWxlcy9kZWt1L25vZGVfbW9kdWxlcy9jb21wb25lbnQtdHlwZS9pbmRleC5qcyIsIm5vZGVfbW9kdWxlcy9kZWt1L25vZGVfbW9kdWxlcy9kb20tcG9vbC9Qb29sLmpzIiwibm9kZV9tb2R1bGVzL2Rla3Uvbm9kZV9tb2R1bGVzL2RvbS13YWxrL2luZGV4LmpzIiwibm9kZV9tb2R1bGVzL2Rla3Uvbm9kZV9tb2R1bGVzL2Zhc3QuanMvYXJyYXkvY2xvbmUuanMiLCJub2RlX21vZHVsZXMvZGVrdS9ub2RlX21vZHVsZXMvZmFzdC5qcy9hcnJheS9jb25jYXQuanMiLCJub2RlX21vZHVsZXMvZGVrdS9ub2RlX21vZHVsZXMvZmFzdC5qcy9hcnJheS9ldmVyeS5qcyIsIm5vZGVfbW9kdWxlcy9kZWt1L25vZGVfbW9kdWxlcy9mYXN0LmpzL2FycmF5L2ZpbGwuanMiLCJub2RlX21vZHVsZXMvZGVrdS9ub2RlX21vZHVsZXMvZmFzdC5qcy9hcnJheS9maWx0ZXIuanMiLCJub2RlX21vZHVsZXMvZGVrdS9ub2RlX21vZHVsZXMvZmFzdC5qcy9hcnJheS9mb3JFYWNoLmpzIiwibm9kZV9tb2R1bGVzL2Rla3Uvbm9kZV9tb2R1bGVzL2Zhc3QuanMvYXJyYXkvaW5kZXguanMiLCJub2RlX21vZHVsZXMvZGVrdS9ub2RlX21vZHVsZXMvZmFzdC5qcy9hcnJheS9pbmRleE9mLmpzIiwibm9kZV9tb2R1bGVzL2Rla3Uvbm9kZV9tb2R1bGVzL2Zhc3QuanMvYXJyYXkvbGFzdEluZGV4T2YuanMiLCJub2RlX21vZHVsZXMvZGVrdS9ub2RlX21vZHVsZXMvZmFzdC5qcy9hcnJheS9tYXAuanMiLCJub2RlX21vZHVsZXMvZGVrdS9ub2RlX21vZHVsZXMvZmFzdC5qcy9hcnJheS9wbHVjay5qcyIsIm5vZGVfbW9kdWxlcy9kZWt1L25vZGVfbW9kdWxlcy9mYXN0LmpzL2FycmF5L3JlZHVjZS5qcyIsIm5vZGVfbW9kdWxlcy9kZWt1L25vZGVfbW9kdWxlcy9mYXN0LmpzL2FycmF5L3JlZHVjZVJpZ2h0LmpzIiwibm9kZV9tb2R1bGVzL2Rla3Uvbm9kZV9tb2R1bGVzL2Zhc3QuanMvYXJyYXkvc29tZS5qcyIsIm5vZGVfbW9kdWxlcy9kZWt1L25vZGVfbW9kdWxlcy9mYXN0LmpzL2Nsb25lLmpzIiwibm9kZV9tb2R1bGVzL2Rla3Uvbm9kZV9tb2R1bGVzL2Zhc3QuanMvZmlsdGVyLmpzIiwibm9kZV9tb2R1bGVzL2Rla3Uvbm9kZV9tb2R1bGVzL2Zhc3QuanMvZm9yRWFjaC5qcyIsIm5vZGVfbW9kdWxlcy9kZWt1L25vZGVfbW9kdWxlcy9mYXN0LmpzL2Z1bmN0aW9uL2FwcGx5LmpzIiwibm9kZV9tb2R1bGVzL2Rla3Uvbm9kZV9tb2R1bGVzL2Zhc3QuanMvZnVuY3Rpb24vYXBwbHlOb0NvbnRleHQuanMiLCJub2RlX21vZHVsZXMvZGVrdS9ub2RlX21vZHVsZXMvZmFzdC5qcy9mdW5jdGlvbi9hcHBseVdpdGhDb250ZXh0LmpzIiwibm9kZV9tb2R1bGVzL2Rla3Uvbm9kZV9tb2R1bGVzL2Zhc3QuanMvZnVuY3Rpb24vYmluZC5qcyIsIm5vZGVfbW9kdWxlcy9kZWt1L25vZGVfbW9kdWxlcy9mYXN0LmpzL2Z1bmN0aW9uL2JpbmRJbnRlcm5hbDMuanMiLCJub2RlX21vZHVsZXMvZGVrdS9ub2RlX21vZHVsZXMvZmFzdC5qcy9mdW5jdGlvbi9iaW5kSW50ZXJuYWw0LmpzIiwibm9kZV9tb2R1bGVzL2Rla3Uvbm9kZV9tb2R1bGVzL2Zhc3QuanMvZnVuY3Rpb24vaW5kZXguanMiLCJub2RlX21vZHVsZXMvZGVrdS9ub2RlX21vZHVsZXMvZmFzdC5qcy9mdW5jdGlvbi9wYXJ0aWFsLmpzIiwibm9kZV9tb2R1bGVzL2Rla3Uvbm9kZV9tb2R1bGVzL2Zhc3QuanMvZnVuY3Rpb24vcGFydGlhbENvbnN0cnVjdG9yLmpzIiwibm9kZV9tb2R1bGVzL2Rla3Uvbm9kZV9tb2R1bGVzL2Zhc3QuanMvZnVuY3Rpb24vdHJ5LmpzIiwibm9kZV9tb2R1bGVzL2Rla3Uvbm9kZV9tb2R1bGVzL2Zhc3QuanMvaW5kZXguanMiLCJub2RlX21vZHVsZXMvZGVrdS9ub2RlX21vZHVsZXMvZmFzdC5qcy9tYXAuanMiLCJub2RlX21vZHVsZXMvZGVrdS9ub2RlX21vZHVsZXMvZmFzdC5qcy9vYmplY3QvYXNzaWduLmpzIiwibm9kZV9tb2R1bGVzL2Rla3Uvbm9kZV9tb2R1bGVzL2Zhc3QuanMvb2JqZWN0L2Nsb25lLmpzIiwibm9kZV9tb2R1bGVzL2Rla3Uvbm9kZV9tb2R1bGVzL2Zhc3QuanMvb2JqZWN0L2ZpbHRlci5qcyIsIm5vZGVfbW9kdWxlcy9kZWt1L25vZGVfbW9kdWxlcy9mYXN0LmpzL29iamVjdC9mb3JFYWNoLmpzIiwibm9kZV9tb2R1bGVzL2Rla3Uvbm9kZV9tb2R1bGVzL2Zhc3QuanMvb2JqZWN0L2luZGV4LmpzIiwibm9kZV9tb2R1bGVzL2Rla3Uvbm9kZV9tb2R1bGVzL2Zhc3QuanMvb2JqZWN0L2tleXMuanMiLCJub2RlX21vZHVsZXMvZGVrdS9ub2RlX21vZHVsZXMvZmFzdC5qcy9vYmplY3QvbWFwLmpzIiwibm9kZV9tb2R1bGVzL2Rla3Uvbm9kZV9tb2R1bGVzL2Zhc3QuanMvb2JqZWN0L3JlZHVjZS5qcyIsIm5vZGVfbW9kdWxlcy9kZWt1L25vZGVfbW9kdWxlcy9mYXN0LmpzL29iamVjdC9yZWR1Y2VSaWdodC5qcyIsIm5vZGVfbW9kdWxlcy9kZWt1L25vZGVfbW9kdWxlcy9mYXN0LmpzL29iamVjdC92YWx1ZXMuanMiLCJub2RlX21vZHVsZXMvZGVrdS9ub2RlX21vZHVsZXMvZmFzdC5qcy9yZWR1Y2UuanMiLCJub2RlX21vZHVsZXMvZGVrdS9ub2RlX21vZHVsZXMvZmFzdC5qcy9yZWR1Y2VSaWdodC5qcyIsIm5vZGVfbW9kdWxlcy9kZWt1L25vZGVfbW9kdWxlcy9mYXN0LmpzL3N0cmluZy9pbmRleC5qcyIsIm5vZGVfbW9kdWxlcy9kZWt1L25vZGVfbW9kdWxlcy9mYXN0LmpzL3N0cmluZy9pbnRlcm4uanMiLCJub2RlX21vZHVsZXMvZGVrdS9ub2RlX21vZHVsZXMvZ2V0LXVpZC9pbmRleC5qcyIsIm5vZGVfbW9kdWxlcy9kZWt1L25vZGVfbW9kdWxlcy9pcy1kb20vaW5kZXguanMiLCJub2RlX21vZHVsZXMvZGVrdS9ub2RlX21vZHVsZXMvb2JqZWN0LXBhdGgvaW5kZXguanMiLCJub2RlX21vZHVsZXMvZGVrdS9ub2RlX21vZHVsZXMvcGVyLWZyYW1lL2luZGV4LmpzIiwibm9kZV9tb2R1bGVzL2Rla3Uvbm9kZV9tb2R1bGVzL3NsaWNlZC9pbmRleC5qcyIsIm5vZGVfbW9kdWxlcy9kZWt1L25vZGVfbW9kdWxlcy9zbGljZWQvbGliL3NsaWNlZC5qcyIsIm5vZGVfbW9kdWxlcy9zb3VuZGNsb3VkLWF1ZGlvL2luZGV4LmpzIiwiL1VzZXJzL2RtaXRyaS9naXRodWIvc291bmRwbGF5ZXItd2lkZ2V0L3NyYy9jb21wb25lbnRzL0ljb25zLmpzIiwiL1VzZXJzL2RtaXRyaS9naXRodWIvc291bmRwbGF5ZXItd2lkZ2V0L3NyYy9jb21wb25lbnRzL1BsYXlCdXR0b24uanMiLCIvVXNlcnMvZG1pdHJpL2dpdGh1Yi9zb3VuZHBsYXllci13aWRnZXQvc3JjL2NvbXBvbmVudHMvUHJvZ3Jlc3MuanMiLCIvVXNlcnMvZG1pdHJpL2dpdGh1Yi9zb3VuZHBsYXllci13aWRnZXQvc3JjL2NvbXBvbmVudHMvVGltZXIuanMiLCIvVXNlcnMvZG1pdHJpL2dpdGh1Yi9zb3VuZHBsYXllci13aWRnZXQvc3JjL3V0aWxzL2F1ZGlvU3RvcmUuanMiLCIvVXNlcnMvZG1pdHJpL2dpdGh1Yi9zb3VuZHBsYXllci13aWRnZXQvc3JjL3dpZGdldC5qcyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTtBQ0FBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDckZBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDNUJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDcHhDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN6R0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzNHQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNsQkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN2UEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDekRBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNqS0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNsQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNsQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNwREE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDeEJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3JCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDaENBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDekJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDNUJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUMxQkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDckJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNkQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNqQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzdCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN4QkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3ZCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDbkNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNuQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN6QkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDM0JBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDdEJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3JCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ25CQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDN0JBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUM3QkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3ZFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDWEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ1hBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDUEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDMUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzdDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDbkNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDalBBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDdEJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDbENBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDekJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDNUJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN2QkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNWQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2hCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDMUJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDckNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDckNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDbkJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN2QkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3ZCQTtBQUNBO0FBQ0E7O0FDRkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN2REE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ0xBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2ZBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUM3UUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNyQ0E7QUFDQTs7QUNEQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNqQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7Ozs7Ozs7Ozs7O29CQzNKaUIsTUFBTTs7Ozs7QUFHdkIsSUFBTSxpQkFBaUIsR0FBRztBQUN0QixnQkFBWSxFQUFBLHdCQUFHO0FBQ1gsZUFBTyxLQUFLLENBQUM7S0FDaEI7O0FBRUQsVUFBTSxFQUFBLGtCQUFHO0FBQ0wsZUFDSTs7O0FBQ0kseUJBQU0sa0NBQWtDO0FBQ3hDLHFCQUFLLEVBQUMsNEJBQTRCO0FBQ2xDLG9CQUFJLEVBQUMsY0FBYzs7WUFFbkIsZ0NBQU0sQ0FBQyxFQUFDLG11R0FBbXVHLEdBQUc7U0FDNXVHLENBQ1I7S0FDTDtDQUNKLENBQUM7OztBQUdGLElBQU0sYUFBYSxHQUFHO0FBQ2xCLFVBQU0sRUFBQSxnQkFBQyxTQUFTLEVBQUU7WUFDTixLQUFLLEdBQUssU0FBUyxDQUFuQixLQUFLOztBQUViLGVBQ0k7OztBQUNJLHlCQUFNLG1DQUFtQztBQUN6QyxxQkFBSyxFQUFDLDRCQUE0QjtBQUNsQyx1QkFBTyxFQUFDLFdBQVc7QUFDbkIsb0JBQUksRUFBQyxjQUFjOztZQUVsQixLQUFLLENBQUMsUUFBUTtTQUNiLENBQ1I7S0FDTDtDQUNKLENBQUM7OztBQUdGLElBQU0sV0FBVyxHQUFHO0FBQ2hCLGdCQUFZLEVBQUEsd0JBQUc7QUFDWCxlQUFPLEtBQUssQ0FBQztLQUNoQjs7QUFFRCxVQUFNLEVBQUEsa0JBQUc7QUFDTCxlQUNJO0FBQUMseUJBQWE7O1lBQ1YsZ0NBQU0sQ0FBQyxFQUFDLHFCQUFxQixHQUFHO1NBQ3BCLENBQ2xCO0tBQ0w7Q0FDSixDQUFDOzs7QUFHRixJQUFNLFlBQVksR0FBRztBQUNqQixnQkFBWSxFQUFBLHdCQUFHO0FBQ1gsZUFBTyxLQUFLLENBQUM7S0FDaEI7O0FBRUQsVUFBTSxFQUFBLGtCQUFHO0FBQ0wsZUFDSTtBQUFDLHlCQUFhOztZQUNWLGdDQUFNLENBQUMsRUFBQyx1Q0FBdUMsR0FBRztTQUN0QyxDQUNsQjtLQUNMO0NBQ0osQ0FBQzs7O0FBR0YsSUFBTSxXQUFXLEdBQUc7QUFDaEIsZ0JBQVksRUFBQSx3QkFBRztBQUNYLGVBQU8sS0FBSyxDQUFDO0tBQ2hCOztBQUVELFVBQU0sRUFBQSxrQkFBRztBQUNMLGVBQ0k7QUFBQyx5QkFBYTs7WUFDVixnQ0FBTSxDQUFDLEVBQUMseUNBQXlDLEdBQUc7U0FDeEMsQ0FDbEI7S0FDTDtDQUNKLENBQUM7OztBQUdGLElBQU0sV0FBVyxHQUFHO0FBQ2hCLGdCQUFZLEVBQUEsd0JBQUc7QUFDWCxlQUFPLEtBQUssQ0FBQztLQUNoQjs7QUFFRCxVQUFNLEVBQUEsa0JBQUc7QUFDTCxlQUNJO0FBQUMseUJBQWE7O1lBQ1YsZ0NBQU0sQ0FBQyxFQUFDLHVDQUF1QyxHQUFHO1NBQ3RDLENBQ2xCO0tBQ0w7Q0FDSixDQUFDOztxQkFFYTtBQUNYLHFCQUFpQixFQUFqQixpQkFBaUI7QUFDakIsZUFBVyxFQUFYLFdBQVc7QUFDWCxnQkFBWSxFQUFaLFlBQVk7QUFDWixlQUFXLEVBQVgsV0FBVztBQUNYLGVBQVcsRUFBWCxXQUFXO0NBQ2Q7Ozs7Ozs7Ozs7Ozs7O29CQ3pHZ0IsTUFBTTs7OztxQkFFbUIsU0FBUzs7QUFFbkQsSUFBTSxVQUFVLEdBQUc7QUFDZixnQkFBWSxFQUFFO0FBQ1YsZUFBTyxFQUFFLEtBQUs7QUFDZCxlQUFPLEVBQUUsS0FBSztLQUNqQjs7QUFFRCxhQUFTLEVBQUU7QUFDUCxlQUFPLEVBQUU7QUFDTCxnQkFBSSxFQUFFLFNBQVM7U0FDbEI7QUFDRCxlQUFPLEVBQUU7QUFDTCxnQkFBSSxFQUFFLFNBQVM7U0FDbEI7S0FDSjs7QUFFRCxVQUFNLEVBQUEsZ0JBQUMsU0FBUyxFQUFFO1lBQ04sS0FBSyxHQUFLLFNBQVMsQ0FBbkIsS0FBSzs7QUFFYixpQkFBUyxXQUFXLENBQUUsQ0FBQyxFQUFFO0FBQ3JCLGFBQUMsQ0FBQyxjQUFjLEVBQUUsQ0FBQzs7Z0JBRVgsT0FBTyxHQUFvQyxLQUFLLENBQWhELE9BQU87Z0JBQUUsZUFBZSxHQUFtQixLQUFLLENBQXZDLGVBQWU7Z0JBQUUsWUFBWSxHQUFLLEtBQUssQ0FBdEIsWUFBWTs7QUFFOUMsZ0JBQUksQ0FBQyxPQUFPLEVBQUU7QUFDViwrQkFBZSxJQUFJLGVBQWUsQ0FBQyxJQUFJLEVBQUUsQ0FBQzthQUM3QyxNQUFNO0FBQ0gsK0JBQWUsSUFBSSxlQUFlLENBQUMsS0FBSyxFQUFFLENBQUM7YUFDOUM7O0FBRUQsd0JBQVksSUFBSSxZQUFZLENBQUMsQ0FBQyxDQUFDLENBQUM7U0FDbkM7O0FBRUQsZUFDSTs7Y0FBUSxTQUFNLDRCQUE0QixFQUFDLE9BQU8sRUFBRSxXQUFXLEFBQUM7WUFDM0QsQ0FBQyxLQUFLLENBQUMsT0FBTyxHQUNYLDZCQXJDWCxXQUFXLE9BcUNlLEdBRWYsNkJBdkNFLFlBQVksT0F1Q0UsQUFDbkI7U0FDSSxDQUNYO0tBQ0w7Q0FDSixDQUFDOztxQkFFYSxVQUFVOzs7Ozs7Ozs7Ozs7OztvQkNoRFIsTUFBTTs7OztBQUV2QixJQUFNLFFBQVEsR0FBRztBQUNiLGdCQUFZLEVBQUU7QUFDVixhQUFLLEVBQUUsQ0FBQztLQUNYOztBQUVELGFBQVMsRUFBRTtBQUNQLGFBQUssRUFBRTtBQUNILGdCQUFJLEVBQUUsUUFBUTtTQUNqQjtLQUNKOztBQUVELFVBQU0sRUFBQSxnQkFBQyxTQUFTLEVBQUU7WUFDUixLQUFLLEdBQUssU0FBUyxDQUFuQixLQUFLO1lBQ0wsS0FBSyxHQUFzQixLQUFLLENBQWhDLEtBQUs7WUFBRSxlQUFlLEdBQUssS0FBSyxDQUF6QixlQUFlOztBQUU1QixZQUFJLEtBQUssR0FBRyxDQUFDLEVBQUU7QUFDWCxpQkFBSyxHQUFHLENBQUMsQ0FBQztTQUNiOztBQUVELFlBQUksS0FBSyxHQUFHLEdBQUcsRUFBRTtBQUNiLGlCQUFLLEdBQUcsR0FBRyxDQUFDO1NBQ2Y7O0FBRUQsWUFBSSxLQUFLLEdBQUcsRUFBQyxLQUFLLE9BQUssS0FBSyxNQUFHLEVBQUMsQ0FBQzs7QUFFakMsaUJBQVMsZUFBZSxDQUFFLENBQUMsRUFBRTtBQUN6QixnQkFBTSxJQUFJLEdBQUcsQ0FBQyxDQUFDLENBQUMsS0FBSyxHQUFHLENBQUMsQ0FBQyxhQUFhLENBQUMscUJBQXFCLEVBQUUsQ0FBQyxJQUFJLENBQUEsR0FBSSxDQUFDLENBQUMsYUFBYSxDQUFDLFdBQVcsQ0FBQzs7QUFFcEcsZ0JBQUksZUFBZSxJQUFJLENBQUMsS0FBSyxDQUFDLGVBQWUsQ0FBQyxLQUFLLENBQUMsUUFBUSxDQUFDLEVBQUU7QUFDM0QsK0JBQWUsQ0FBQyxLQUFLLENBQUMsV0FBVyxHQUFJLElBQUksR0FBRyxlQUFlLENBQUMsS0FBSyxDQUFDLFFBQVEsQUFBQyxDQUFDO2FBQy9FO1NBQ0o7O0FBRUQsZUFDSTs7Y0FBSyxTQUFNLDBDQUEwQyxFQUFDLE9BQU8sRUFBRSxlQUFlLEFBQUM7WUFDM0UsK0JBQUssU0FBTSxzQ0FBc0MsRUFBQyxLQUFLLEVBQUUsS0FBSyxBQUFDLEdBQUc7U0FDaEUsQ0FDUjtLQUNMO0NBQ0osQ0FBQzs7cUJBRWEsUUFBUTs7Ozs7Ozs7Ozs7Ozs7b0JDM0NOLE1BQU07Ozs7QUFFdkIsU0FBUyxVQUFVLENBQUUsSUFBSSxFQUFFO0FBQ3ZCLFFBQUksS0FBSyxHQUFHLElBQUksQ0FBQyxLQUFLLENBQUMsSUFBSSxHQUFHLElBQUksQ0FBQyxDQUFDO0FBQ3BDLFFBQUksSUFBSSxHQUFHLEdBQUcsR0FBRyxJQUFJLENBQUMsS0FBSyxDQUFDLEFBQUMsSUFBSSxHQUFHLElBQUksR0FBSSxFQUFFLENBQUMsQ0FBQztBQUNoRCxRQUFJLElBQUksR0FBRyxHQUFHLEdBQUcsSUFBSSxDQUFDLEtBQUssQ0FBRSxJQUFJLEdBQUcsRUFBRSxDQUFFLENBQUM7O0FBRXpDLFFBQUksR0FBRyxJQUFJLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxNQUFNLEdBQUcsQ0FBQyxDQUFDLENBQUM7QUFDcEMsUUFBSSxHQUFHLElBQUksQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLE1BQU0sR0FBRyxDQUFDLENBQUMsQ0FBQzs7QUFFcEMsUUFBSSxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsRUFBRTtBQUNkLFlBQUksS0FBSyxFQUFFO0FBQ1Asd0JBQVUsS0FBSyxTQUFJLElBQUksU0FBSSxJQUFJLENBQUc7U0FDckMsTUFBTTtBQUNILHdCQUFVLElBQUksU0FBSSxJQUFJLENBQUc7U0FDNUI7S0FDSixNQUFNO0FBQ0gsZUFBTyxPQUFPLENBQUM7S0FDbEI7Q0FDSjs7QUFFRCxJQUFNLEtBQUssR0FBRztBQUNWLGdCQUFZLEVBQUU7QUFDVixnQkFBUSxFQUFFLENBQUM7QUFDWCxtQkFBVyxFQUFFLENBQUM7S0FDakI7O0FBRUQsYUFBUyxFQUFFO0FBQ1AsZ0JBQVEsRUFBRTtBQUNOLGdCQUFJLEVBQUUsUUFBUTtTQUNqQjtBQUNELG1CQUFXLEVBQUU7QUFDVCxnQkFBSSxFQUFFLFFBQVE7U0FDakI7S0FDSjs7QUFFRCxVQUFNLEVBQUEsZ0JBQUMsU0FBUyxFQUFFO1lBQ04sS0FBSyxHQUFLLFNBQVMsQ0FBbkIsS0FBSzs7QUFFYixlQUNJOztjQUFLLFNBQU0sNkJBQTZCO1lBQ25DLFVBQVUsQ0FBQyxLQUFLLENBQUMsV0FBVyxDQUFDOztZQUFLLFVBQVUsQ0FBQyxLQUFLLENBQUMsUUFBUSxDQUFDO1NBQzNELENBQ1I7S0FDTDtDQUNKLENBQUM7O3FCQUVhLEtBQUs7Ozs7Ozs7OztRQzlDSixZQUFZLEdBQVosWUFBWTtRQVFaLFVBQVUsR0FBVixVQUFVOztBQVYxQixJQUFJLE9BQU8sR0FBRyxFQUFFLENBQUM7O0FBRVYsU0FBUyxZQUFZLENBQUUsT0FBTyxFQUFFO0FBQ25DLFdBQU8sQ0FBQyxPQUFPLENBQUMsVUFBQyxlQUFlLEVBQUs7QUFDakMsWUFBSSxlQUFlLENBQUMsT0FBTyxJQUFJLGVBQWUsQ0FBQyxPQUFPLEtBQUssT0FBTyxFQUFFO0FBQ2hFLDJCQUFlLENBQUMsSUFBSSxFQUFFLENBQUM7U0FDMUI7S0FDSixDQUFDLENBQUM7Q0FDTjs7QUFFTSxTQUFTLFVBQVUsQ0FBRSxlQUFlLEVBQUU7QUFDekMsUUFBSSxTQUFTLEdBQUcsS0FBSyxDQUFDOztBQUV0QixTQUFLLElBQUksQ0FBQyxHQUFHLENBQUMsRUFBRSxHQUFHLEdBQUcsT0FBTyxDQUFDLE1BQU0sRUFBRSxDQUFDLEdBQUcsR0FBRyxFQUFFLENBQUMsRUFBRSxFQUFFO0FBQ2hELFlBQUksZ0JBQWdCLEdBQUcsT0FBTyxDQUFDLENBQUMsQ0FBQyxDQUFDO0FBQ2xDLFlBQUksZ0JBQWdCLENBQUMsT0FBTyxLQUFLLGVBQWUsQ0FBQyxPQUFPLEVBQUU7QUFDdEQscUJBQVMsR0FBRyxJQUFJLENBQUM7QUFDakIsa0JBQU07U0FDVDtLQUNKOztBQUVELFFBQUksQ0FBQyxTQUFTLEVBQUU7QUFDWixlQUFPLENBQUMsSUFBSSxDQUFDLGVBQWUsQ0FBQyxDQUFDO0tBQ2pDO0NBQ0o7Ozs7Ozs7O1FDcUZlLE1BQU0sR0FBTixNQUFNOzs7Ozs7OztvQkE1R0wsTUFBTTs7OzsrQkFDSyxrQkFBa0I7Ozs7b0NBRXZCLHlCQUF5Qjs7OztrQ0FDM0IsdUJBQXVCOzs7OytCQUMxQixvQkFBb0I7Ozs7K0JBRUcsb0JBQW9COztBQUU3RCxJQUFNLE1BQU0sR0FBRztBQUNYLGdCQUFZLEVBQUEsd0JBQUc7QUFDWCxlQUFPO0FBQ0gsb0JBQVEsRUFBRSxDQUFDO0FBQ1gsdUJBQVcsRUFBRSxDQUFDO0FBQ2QsbUJBQU8sRUFBRSxLQUFLO0FBQ2QsbUJBQU8sRUFBRSxLQUFLO1NBQ2pCLENBQUM7S0FDTDs7QUFFRCxjQUFVLEVBQUEsb0JBQUMsU0FBUyxFQUFFLEVBQUUsRUFBRSxRQUFRLEVBQUU7WUFDeEIsS0FBSyxHQUFLLFNBQVMsQ0FBbkIsS0FBSztZQUNMLGVBQWUsR0FBSyxLQUFLLENBQXpCLGVBQWU7O0FBRXZCLHVCQUFlLENBQUMsT0FBTyxDQUFDLEtBQUssQ0FBQyxHQUFHLEVBQUUsVUFBQyxJQUFJLEVBQUs7QUFDekMsb0JBQVEscUJBQ0gsSUFBSSxDQUFDLE1BQU0sR0FBRyxVQUFVLEdBQUcsT0FBTyxFQUFHLElBQUksRUFDNUMsQ0FBQztTQUNOLENBQUMsQ0FBQzs7QUFFSCxpQkFBUyxjQUFjLEdBQUk7QUFDdkIsb0JBQVEsQ0FBQyxFQUFDLE9BQU8sRUFBRSxJQUFJLEVBQUMsQ0FBQyxDQUFDOztBQUUxQiw2QkF6QkgsWUFBWSxDQXlCSSxlQUFlLENBQUMsT0FBTyxDQUFDLENBQUM7QUFDdEMsNkJBMUJXLFVBQVUsQ0EwQlYsZUFBZSxDQUFDLENBQUM7U0FDL0I7O0FBRUQsaUJBQVMsY0FBYyxHQUFJO0FBQ3ZCLG9CQUFRLENBQUMsRUFBQyxXQUFXLEVBQUUsZUFBZSxDQUFDLEtBQUssQ0FBQyxXQUFXLEVBQUMsQ0FBQyxDQUFDO1NBQzlEOztBQUVELGlCQUFTLFdBQVcsR0FBSTtBQUNwQixvQkFBUSxDQUFDLEVBQUMsUUFBUSxFQUFFLGVBQWUsQ0FBQyxLQUFLLENBQUMsUUFBUSxFQUFDLENBQUMsQ0FBQztTQUN4RDs7QUFFRCxpQkFBUyxjQUFjLEdBQUk7QUFDdkIsb0JBQVEsQ0FBQyxFQUFDLE9BQU8sRUFBRSxJQUFJLEVBQUMsQ0FBQyxDQUFDO1NBQzdCOztBQUVELGlCQUFTLGFBQWEsR0FBSTtBQUN0QixvQkFBUSxDQUFDLEVBQUMsT0FBTyxFQUFFLEtBQUssRUFBQyxDQUFDLENBQUM7U0FDOUI7O0FBRUQsaUJBQVMsWUFBWSxHQUFJO0FBQ3JCLG9CQUFRLENBQUMsRUFBQyxPQUFPLEVBQUUsS0FBSyxFQUFDLENBQUMsQ0FBQztTQUM5Qjs7O0FBR0QsdUJBQWUsQ0FBQyxFQUFFLENBQUMsU0FBUyxFQUFFLGNBQWMsQ0FBQyxDQUFDO0FBQzlDLHVCQUFlLENBQUMsRUFBRSxDQUFDLFlBQVksRUFBRSxjQUFjLENBQUMsQ0FBQztBQUNqRCx1QkFBZSxDQUFDLEVBQUUsQ0FBQyxnQkFBZ0IsRUFBRSxXQUFXLENBQUMsQ0FBQztBQUNsRCx1QkFBZSxDQUFDLEVBQUUsQ0FBQyxTQUFTLEVBQUUsY0FBYyxDQUFDLENBQUM7QUFDOUMsdUJBQWUsQ0FBQyxFQUFFLENBQUMsUUFBUSxFQUFFLGFBQWEsQ0FBQyxDQUFDO0FBQzVDLHVCQUFlLENBQUMsRUFBRSxDQUFDLE9BQU8sRUFBRSxZQUFZLENBQUMsQ0FBQztBQUMxQyx1QkFBZSxDQUFDLEVBQUUsQ0FBQyxPQUFPLEVBQUUsWUFBWSxDQUFDLENBQUM7S0FDN0M7O0FBR0QsZUFBVyxFQUFBLHFCQUFDLFNBQVMsRUFBRTtZQUNYLEtBQUssR0FBSyxTQUFTLENBQW5CLEtBQUs7O0FBQ2IsYUFBSyxDQUFDLGVBQWUsQ0FBQyxTQUFTLEVBQUUsQ0FBQztLQUNyQzs7QUFFRCxVQUFNLEVBQUEsZ0JBQUMsU0FBUyxFQUFFO1lBQ1IsS0FBSyxHQUFZLFNBQVMsQ0FBMUIsS0FBSztZQUFFLEtBQUssR0FBSyxTQUFTLENBQW5CLEtBQUs7O0FBRWxCLGVBQ0k7O2NBQUssU0FBTSw2QkFBNkIsRUFBQyxLQUFLLEVBQUUsS0FBSyxDQUFDLEtBQUssR0FBRztBQUMxRCxzQ0FBa0IsV0FBUyxLQUFLLENBQUMsS0FBSyxDQUFDLFdBQVcsQ0FBQyxPQUFPLENBQUMsT0FBTyxFQUFFLFVBQVUsQ0FBQyxNQUFHO2lCQUNyRixHQUFHO0FBQ0Esc0NBQWtCLEVBQUUsU0FBUztpQkFDaEMsQUFBQztZQUNHLEtBQUssQ0FBQyxLQUFLLEdBQ1I7OztnQkFDSSwrQkFBSyxTQUFNLCtCQUErQixHQUFHO2dCQUM3Qzs7c0JBQUksU0FBTSw2QkFBNkI7b0JBQUUsS0FBSyxDQUFDLEtBQUssQ0FBQyxLQUFLO2lCQUFNO2dCQUNoRTs7c0JBQUssU0FBTSxnQ0FBZ0M7b0JBQ3ZDO0FBQ0ksK0JBQU8sRUFBRSxLQUFLLENBQUMsT0FBTyxBQUFDO0FBQ3ZCLHVDQUFlLEVBQUUsS0FBSyxDQUFDLGVBQWUsQUFBQztzQkFDekM7b0JBQ0Y7QUFDSSw2QkFBSyxFQUFFLEtBQUssQ0FBQyxXQUFXLEdBQUcsS0FBSyxDQUFDLFFBQVEsR0FBRyxHQUFHLElBQUksQ0FBQyxBQUFDO0FBQ3JELHVDQUFlLEVBQUUsS0FBSyxDQUFDLGVBQWUsQUFBQztzQkFDekM7b0JBQ0Y7QUFDSSxnQ0FBUSxFQUFFLEtBQUssQ0FBQyxRQUFRLEFBQUM7QUFDekIsbUNBQVcsRUFBRSxLQUFLLENBQUMsV0FBVyxBQUFDO3NCQUNqQztpQkFDQTthQUNKLEdBRU47Ozs7YUFBb0IsQUFDdkI7U0FDQyxDQUNSO0tBQ0w7Q0FDSixDQUFDOztBQUVLLFNBQVMsTUFBTSxDQUFFLEVBQUUsRUFBRSxJQUFJLEVBQUU7QUFDOUIsUUFBTSxRQUFRLEdBQUcsSUFBSSxDQUFDLFFBQVEsSUFBSSxNQUFNLENBQUMsd0JBQXdCLENBQUM7QUFDbEUsUUFBSSxDQUFDLFFBQVEsRUFBRTtBQUNYLGVBQU8sQ0FBQyxHQUFHLENBQUMsd0VBQXdFLENBQUMsQ0FBQztBQUN0RixlQUFPO0tBQ1Y7O0FBRUQsUUFBSSxlQUFlLEdBQUcsaUNBQW9CLFFBQVEsQ0FBQyxDQUFDOztBQUVwRCxRQUFJLEdBQUcsR0FBRyxrQkFBSyxJQUFJLENBQ2Ysc0JBQUMsTUFBTSxJQUFDLEdBQUcsRUFBRSxJQUFJLENBQUMsR0FBRyxBQUFDLEVBQUMsZUFBZSxFQUFFLGVBQWUsQUFBQyxHQUFHLENBQzlELENBQUM7O0FBRUYsc0JBQUssTUFBTSxDQUFDLEdBQUcsRUFBRSxFQUFFLENBQUMsQ0FBQztDQUN4QiIsImZpbGUiOiJnZW5lcmF0ZWQuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlc0NvbnRlbnQiOlsiKGZ1bmN0aW9uIGUodCxuLHIpe2Z1bmN0aW9uIHMobyx1KXtpZighbltvXSl7aWYoIXRbb10pe3ZhciBhPXR5cGVvZiByZXF1aXJlPT1cImZ1bmN0aW9uXCImJnJlcXVpcmU7aWYoIXUmJmEpcmV0dXJuIGEobywhMCk7aWYoaSlyZXR1cm4gaShvLCEwKTt2YXIgZj1uZXcgRXJyb3IoXCJDYW5ub3QgZmluZCBtb2R1bGUgJ1wiK28rXCInXCIpO3Rocm93IGYuY29kZT1cIk1PRFVMRV9OT1RfRk9VTkRcIixmfXZhciBsPW5bb109e2V4cG9ydHM6e319O3Rbb11bMF0uY2FsbChsLmV4cG9ydHMsZnVuY3Rpb24oZSl7dmFyIG49dFtvXVsxXVtlXTtyZXR1cm4gcyhuP246ZSl9LGwsbC5leHBvcnRzLGUsdCxuLHIpfXJldHVybiBuW29dLmV4cG9ydHN9dmFyIGk9dHlwZW9mIHJlcXVpcmU9PVwiZnVuY3Rpb25cIiYmcmVxdWlyZTtmb3IodmFyIG89MDtvPHIubGVuZ3RoO28rKylzKHJbb10pO3JldHVybiBzfSkiLCIvKipcbiAqIE1vZHVsZSBkZXBlbmRlbmNpZXMuXG4gKi9cblxudmFyIEVtaXR0ZXIgPSByZXF1aXJlKCdjb21wb25lbnQtZW1pdHRlcicpXG5cbi8qKlxuICogRXhwb3NlIGBzY2VuZWAuXG4gKi9cblxubW9kdWxlLmV4cG9ydHMgPSBBcHBsaWNhdGlvblxuXG4vKipcbiAqIENyZWF0ZSBhIG5ldyBgQXBwbGljYXRpb25gLlxuICpcbiAqIEBwYXJhbSB7T2JqZWN0fSBlbGVtZW50IE9wdGlvbmFsIGluaXRpYWwgZWxlbWVudFxuICovXG5cbmZ1bmN0aW9uIEFwcGxpY2F0aW9uIChlbGVtZW50KSB7XG4gIGlmICghKHRoaXMgaW5zdGFuY2VvZiBBcHBsaWNhdGlvbikpIHJldHVybiBuZXcgQXBwbGljYXRpb24oZWxlbWVudClcbiAgdGhpcy5vcHRpb25zID0ge31cbiAgdGhpcy5zb3VyY2VzID0ge31cbiAgdGhpcy5lbGVtZW50ID0gZWxlbWVudFxufVxuXG4vKipcbiAqIE1peGluIGBFbWl0dGVyYC5cbiAqL1xuXG5FbWl0dGVyKEFwcGxpY2F0aW9uLnByb3RvdHlwZSlcblxuLyoqXG4gKiBBZGQgYSBwbHVnaW5cbiAqXG4gKiBAcGFyYW0ge0Z1bmN0aW9ufSBwbHVnaW5cbiAqL1xuXG5BcHBsaWNhdGlvbi5wcm90b3R5cGUudXNlID0gZnVuY3Rpb24gKHBsdWdpbikge1xuICBwbHVnaW4odGhpcylcbiAgcmV0dXJuIHRoaXNcbn1cblxuLyoqXG4gKiBTZXQgYW4gb3B0aW9uXG4gKlxuICogQHBhcmFtIHtTdHJpbmd9IG5hbWVcbiAqL1xuXG5BcHBsaWNhdGlvbi5wcm90b3R5cGUub3B0aW9uID0gZnVuY3Rpb24gKG5hbWUsIHZhbCkge1xuICB0aGlzLm9wdGlvbnNbbmFtZV0gPSB2YWxcbiAgcmV0dXJuIHRoaXNcbn1cblxuLyoqXG4gKiBTZXQgdmFsdWUgdXNlZCBzb21ld2hlcmUgaW4gdGhlIElPIG5ldHdvcmsuXG4gKi9cblxuQXBwbGljYXRpb24ucHJvdG90eXBlLnNldCA9IGZ1bmN0aW9uIChuYW1lLCBkYXRhKSB7XG4gIHRoaXMuc291cmNlc1tuYW1lXSA9IGRhdGFcbiAgdGhpcy5lbWl0KCdzb3VyY2UnLCBuYW1lLCBkYXRhKVxuICByZXR1cm4gdGhpc1xufVxuXG4vKipcbiAqIE1vdW50IGEgdmlydHVhbCBlbGVtZW50LlxuICpcbiAqIEBwYXJhbSB7VmlydHVhbEVsZW1lbnR9IGVsZW1lbnRcbiAqL1xuXG5BcHBsaWNhdGlvbi5wcm90b3R5cGUubW91bnQgPSBmdW5jdGlvbiAoZWxlbWVudCkge1xuICB0aGlzLmVsZW1lbnQgPSBlbGVtZW50XG4gIHRoaXMuZW1pdCgnbW91bnQnLCBlbGVtZW50KVxuICByZXR1cm4gdGhpc1xufVxuXG4vKipcbiAqIFJlbW92ZSB0aGUgd29ybGQuIFVubW91bnQgZXZlcnl0aGluZy5cbiAqL1xuXG5BcHBsaWNhdGlvbi5wcm90b3R5cGUudW5tb3VudCA9IGZ1bmN0aW9uICgpIHtcbiAgaWYgKCF0aGlzLmVsZW1lbnQpIHJldHVyblxuICB0aGlzLmVsZW1lbnQgPSBudWxsXG4gIHRoaXMuZW1pdCgndW5tb3VudCcpXG4gIHJldHVybiB0aGlzXG59XG4iLCIvKipcbiAqIENyZWF0ZSB0aGUgYXBwbGljYXRpb24uXG4gKi9cblxuZXhwb3J0cy50cmVlID1cbmV4cG9ydHMuc2NlbmUgPVxuZXhwb3J0cy5kZWt1ID0gcmVxdWlyZSgnLi9hcHBsaWNhdGlvbicpXG5cbi8qKlxuICogUmVuZGVyIHNjZW5lcyB0byB0aGUgRE9NLlxuICovXG5cbmlmICh0eXBlb2YgZG9jdW1lbnQgIT09ICd1bmRlZmluZWQnKSB7XG4gIGV4cG9ydHMucmVuZGVyID0gcmVxdWlyZSgnLi9yZW5kZXInKVxufVxuXG4vKipcbiAqIFJlbmRlciBzY2VuZXMgdG8gYSBzdHJpbmdcbiAqL1xuXG5leHBvcnRzLnJlbmRlclN0cmluZyA9IHJlcXVpcmUoJy4vc3RyaW5naWZ5JylcblxuLyoqXG4gKiBDcmVhdGUgdmlydHVhbCBlbGVtZW50cy5cbiAqL1xuXG5leHBvcnRzLmVsZW1lbnQgPVxuZXhwb3J0cy5kb20gPSByZXF1aXJlKCcuL3ZpcnR1YWwnKVxuIiwiLyoqXG4gKiBEZXBlbmRlbmNpZXMuXG4gKi9cblxudmFyIHJhZiA9IHJlcXVpcmUoJ2NvbXBvbmVudC1yYWYnKVxudmFyIFBvb2wgPSByZXF1aXJlKCdkb20tcG9vbCcpXG52YXIgd2FsayA9IHJlcXVpcmUoJ2RvbS13YWxrJylcbnZhciBpc0RvbSA9IHJlcXVpcmUoJ2lzLWRvbScpXG52YXIgdWlkID0gcmVxdWlyZSgnZ2V0LXVpZCcpXG52YXIgdGhyb3R0bGUgPSByZXF1aXJlKCdwZXItZnJhbWUnKVxudmFyIGtleXBhdGggPSByZXF1aXJlKCdvYmplY3QtcGF0aCcpXG52YXIgdHlwZSA9IHJlcXVpcmUoJ2NvbXBvbmVudC10eXBlJylcbnZhciBmYXN0ID0gcmVxdWlyZSgnZmFzdC5qcycpXG52YXIgdXRpbHMgPSByZXF1aXJlKCcuL3V0aWxzJylcbnZhciBzdmcgPSByZXF1aXJlKCcuL3N2ZycpXG52YXIgZGVmYXVsdHMgPSB1dGlscy5kZWZhdWx0c1xudmFyIGZvckVhY2ggPSBmYXN0LmZvckVhY2hcbnZhciBhc3NpZ24gPSBmYXN0LmFzc2lnblxudmFyIHJlZHVjZSA9IGZhc3QucmVkdWNlXG5cbi8qKlxuICogQWxsIG9mIHRoZSBldmVudHMgY2FuIGJpbmQgdG9cbiAqL1xuXG52YXIgZXZlbnRzID0ge1xuICBvbkJsdXI6ICdibHVyJyxcbiAgb25DaGFuZ2U6ICdjaGFuZ2UnLFxuICBvbkNsaWNrOiAnY2xpY2snLFxuICBvbkNvbnRleHRNZW51OiAnY29udGV4dG1lbnUnLFxuICBvbkNvcHk6ICdjb3B5JyxcbiAgb25DdXQ6ICdjdXQnLFxuICBvbkRvdWJsZUNsaWNrOiAnZGJsY2xpY2snLFxuICBvbkRyYWc6ICdkcmFnJyxcbiAgb25EcmFnRW5kOiAnZHJhZ2VuZCcsXG4gIG9uRHJhZ0VudGVyOiAnZHJhZ2VudGVyJyxcbiAgb25EcmFnRXhpdDogJ2RyYWdleGl0JyxcbiAgb25EcmFnTGVhdmU6ICdkcmFnbGVhdmUnLFxuICBvbkRyYWdPdmVyOiAnZHJhZ292ZXInLFxuICBvbkRyYWdTdGFydDogJ2RyYWdzdGFydCcsXG4gIG9uRHJvcDogJ2Ryb3AnLFxuICBvbkZvY3VzOiAnZm9jdXMnLFxuICBvbklucHV0OiAnaW5wdXQnLFxuICBvbktleURvd246ICdrZXlkb3duJyxcbiAgb25LZXlVcDogJ2tleXVwJyxcbiAgb25Nb3VzZURvd246ICdtb3VzZWRvd24nLFxuICBvbk1vdXNlTW92ZTogJ21vdXNlbW92ZScsXG4gIG9uTW91c2VPdXQ6ICdtb3VzZW91dCcsXG4gIG9uTW91c2VPdmVyOiAnbW91c2VvdmVyJyxcbiAgb25Nb3VzZVVwOiAnbW91c2V1cCcsXG4gIG9uUGFzdGU6ICdwYXN0ZScsXG4gIG9uU2Nyb2xsOiAnc2Nyb2xsJyxcbiAgb25TdWJtaXQ6ICdzdWJtaXQnLFxuICBvblRvdWNoQ2FuY2VsOiAndG91Y2hjYW5jZWwnLFxuICBvblRvdWNoRW5kOiAndG91Y2hlbmQnLFxuICBvblRvdWNoTW92ZTogJ3RvdWNobW92ZScsXG4gIG9uVG91Y2hTdGFydDogJ3RvdWNoc3RhcnQnXG59XG5cbi8qKlxuICogVGhlc2UgZWxlbWVudHMgd29uJ3QgYmUgcG9vbGVkXG4gKi9cblxudmFyIGF2b2lkUG9vbGluZyA9IFsnaW5wdXQnLCAndGV4dGFyZWEnXTtcblxuLyoqXG4gKiBFeHBvc2UgYGRvbWAuXG4gKi9cblxubW9kdWxlLmV4cG9ydHMgPSByZW5kZXJcblxuLyoqXG4gKiBSZW5kZXIgYW4gYXBwIHRvIHRoZSBET01cbiAqXG4gKiBAcGFyYW0ge0FwcGxpY2F0aW9ufSBhcHBcbiAqIEBwYXJhbSB7SFRNTEVsZW1lbnR9IGNvbnRhaW5lclxuICogQHBhcmFtIHtPYmplY3R9IG9wdHNcbiAqXG4gKiBAcmV0dXJuIHtPYmplY3R9XG4gKi9cblxuZnVuY3Rpb24gcmVuZGVyIChhcHAsIGNvbnRhaW5lciwgb3B0cykge1xuICB2YXIgZnJhbWVJZFxuICB2YXIgaXNSZW5kZXJpbmdcbiAgdmFyIHJvb3RJZCA9ICdyb290J1xuICB2YXIgY3VycmVudEVsZW1lbnRcbiAgdmFyIGN1cnJlbnROYXRpdmVFbGVtZW50XG4gIHZhciBjb25uZWN0aW9ucyA9IHt9XG4gIHZhciBlbnRpdGllcyA9IHt9XG4gIHZhciBwb29scyA9IHt9XG4gIHZhciBoYW5kbGVycyA9IHt9XG4gIHZhciBjaGlsZHJlbiA9IHt9XG4gIGNoaWxkcmVuW3Jvb3RJZF0gPSB7fVxuXG4gIGlmICghaXNEb20oY29udGFpbmVyKSkge1xuICAgIHRocm93IG5ldyBFcnJvcignQ29udGFpbmVyIGVsZW1lbnQgbXVzdCBiZSBhIERPTSBlbGVtZW50JylcbiAgfVxuXG4gIC8qKlxuICAgKiBSZW5kZXJpbmcgb3B0aW9ucy4gQmF0Y2hpbmcgaXMgb25seSBldmVyIHJlYWxseSBkaXNhYmxlZFxuICAgKiB3aGVuIHJ1bm5pbmcgdGVzdHMsIGFuZCBwb29saW5nIGNhbiBiZSBkaXNhYmxlZCBpZiB0aGUgdXNlclxuICAgKiBpcyBkb2luZyBzb21ldGhpbmcgc3R1cGlkIHdpdGggdGhlIERPTSBpbiB0aGVpciBjb21wb25lbnRzLlxuICAgKi9cblxuICB2YXIgb3B0aW9ucyA9IGRlZmF1bHRzKGFzc2lnbih7fSwgYXBwLm9wdGlvbnMgfHwge30sIG9wdHMgfHwge30pLCB7XG4gICAgcG9vbGluZzogdHJ1ZSxcbiAgICBiYXRjaGluZzogdHJ1ZSxcbiAgICB2YWxpZGF0ZVByb3BzOiBmYWxzZVxuICB9KVxuXG4gIC8qKlxuICAgKiBMaXN0ZW4gdG8gRE9NIGV2ZW50c1xuICAgKi9cblxuICBhZGROYXRpdmVFdmVudExpc3RlbmVycygpXG5cbiAgLyoqXG4gICAqIFdhdGNoIGZvciBjaGFuZ2VzIHRvIHRoZSBhcHAgc28gdGhhdCB3ZSBjYW4gdXBkYXRlXG4gICAqIHRoZSBET00gYXMgbmVlZGVkLlxuICAgKi9cblxuICBhcHAub24oJ3VubW91bnQnLCBvbnVubW91bnQpXG4gIGFwcC5vbignbW91bnQnLCBvbm1vdW50KVxuICBhcHAub24oJ3NvdXJjZScsIG9udXBkYXRlKVxuXG4gIC8qKlxuICAgKiBJZiB0aGUgYXBwIGhhcyBhbHJlYWR5IG1vdW50ZWQgYW4gZWxlbWVudCwgd2UgY2FuIGp1c3RcbiAgICogcmVuZGVyIHRoYXQgc3RyYWlnaHQgYXdheS5cbiAgICovXG5cbiAgaWYgKGFwcC5lbGVtZW50KSByZW5kZXIoKVxuXG4gIC8qKlxuICAgKiBUZWFyZG93biB0aGUgRE9NIHJlbmRlcmluZyBzbyB0aGF0IGl0IHN0b3BzXG4gICAqIHJlbmRlcmluZyBhbmQgZXZlcnl0aGluZyBjYW4gYmUgZ2FyYmFnZSBjb2xsZWN0ZWQuXG4gICAqL1xuXG4gIGZ1bmN0aW9uIHRlYXJkb3duICgpIHtcbiAgICByZW1vdmVOYXRpdmVFdmVudExpc3RlbmVycygpXG4gICAgcmVtb3ZlTmF0aXZlRWxlbWVudCgpXG4gICAgYXBwLm9mZigndW5tb3VudCcsIG9udW5tb3VudClcbiAgICBhcHAub2ZmKCdtb3VudCcsIG9ubW91bnQpXG4gICAgYXBwLm9mZignc291cmNlJywgb251cGRhdGUpXG4gIH1cblxuICAvKipcbiAgICogU3dhcCB0aGUgY3VycmVudCByZW5kZXJlZCBub2RlIHdpdGggYSBuZXcgb25lIHRoYXQgaXMgcmVuZGVyZWRcbiAgICogZnJvbSB0aGUgbmV3IHZpcnR1YWwgZWxlbWVudCBtb3VudGVkIG9uIHRoZSBhcHAuXG4gICAqXG4gICAqIEBwYXJhbSB7VmlydHVhbEVsZW1lbnR9IGVsZW1lbnRcbiAgICovXG5cbiAgZnVuY3Rpb24gb25tb3VudCAoKSB7XG4gICAgaW52YWxpZGF0ZSgpXG4gIH1cblxuICAvKipcbiAgICogSWYgdGhlIGFwcCB1bm1vdW50cyBhbiBlbGVtZW50LCB3ZSBzaG91bGQgY2xlYXIgb3V0IHRoZSBjdXJyZW50XG4gICAqIHJlbmRlcmVkIGVsZW1lbnQuIFRoaXMgd2lsbCByZW1vdmUgYWxsIHRoZSBlbnRpdGllcy5cbiAgICovXG5cbiAgZnVuY3Rpb24gb251bm1vdW50ICgpIHtcbiAgICByZW1vdmVOYXRpdmVFbGVtZW50KClcbiAgICBjdXJyZW50RWxlbWVudCA9IG51bGxcbiAgfVxuXG4gIC8qKlxuICAgKiBVcGRhdGUgYWxsIGNvbXBvbmVudHMgdGhhdCBhcmUgYm91bmQgdG8gdGhlIHNvdXJjZVxuICAgKlxuICAgKiBAcGFyYW0ge1N0cmluZ30gbmFtZVxuICAgKiBAcGFyYW0geyp9IGRhdGFcbiAgICovXG5cbiAgZnVuY3Rpb24gb251cGRhdGUgKG5hbWUsIGRhdGEpIHtcbiAgICBjb25uZWN0aW9uc1tuYW1lXShkYXRhKVxuICB9XG5cbiAgLyoqXG4gICAqIFJlbmRlciBhbmQgbW91bnQgYSBjb21wb25lbnQgdG8gdGhlIG5hdGl2ZSBkb20uXG4gICAqXG4gICAqIEBwYXJhbSB7RW50aXR5fSBlbnRpdHlcbiAgICogQHJldHVybiB7SFRNTEVsZW1lbnR9XG4gICAqL1xuXG4gIGZ1bmN0aW9uIG1vdW50RW50aXR5IChlbnRpdHkpIHtcbiAgICByZWdpc3RlcihlbnRpdHkpXG4gICAgc2V0U291cmNlcyhlbnRpdHkpXG4gICAgY2hpbGRyZW5bZW50aXR5LmlkXSA9IHt9XG4gICAgZW50aXRpZXNbZW50aXR5LmlkXSA9IGVudGl0eVxuXG4gICAgLy8gY29tbWl0IGluaXRpYWwgc3RhdGUgYW5kIHByb3BzLlxuICAgIGNvbW1pdChlbnRpdHkpXG5cbiAgICAvLyBjYWxsYmFjayBiZWZvcmUgbW91bnRpbmcuXG4gICAgdHJpZ2dlcignYmVmb3JlTW91bnQnLCBlbnRpdHksIFtlbnRpdHkuY29udGV4dF0pXG4gICAgdHJpZ2dlcignYmVmb3JlUmVuZGVyJywgZW50aXR5LCBbZW50aXR5LmNvbnRleHRdKVxuXG4gICAgLy8gcmVuZGVyIHZpcnR1YWwgZWxlbWVudC5cbiAgICB2YXIgdmlydHVhbEVsZW1lbnQgPSByZW5kZXJFbnRpdHkoZW50aXR5KVxuICAgIC8vIGNyZWF0ZSBuYXRpdmUgZWxlbWVudC5cbiAgICB2YXIgbmF0aXZlRWxlbWVudCA9IHRvTmF0aXZlKGVudGl0eS5pZCwgJzAnLCB2aXJ0dWFsRWxlbWVudClcblxuICAgIGVudGl0eS52aXJ0dWFsRWxlbWVudCA9IHZpcnR1YWxFbGVtZW50XG4gICAgZW50aXR5Lm5hdGl2ZUVsZW1lbnQgPSBuYXRpdmVFbGVtZW50XG5cbiAgICAvLyBjYWxsYmFjayBhZnRlciBtb3VudGluZy5cbiAgICB0cmlnZ2VyKCdhZnRlclJlbmRlcicsIGVudGl0eSwgW2VudGl0eS5jb250ZXh0LCBuYXRpdmVFbGVtZW50XSlcbiAgICB0cmlnZ2VyKCdhZnRlck1vdW50JywgZW50aXR5LCBbZW50aXR5LmNvbnRleHQsIG5hdGl2ZUVsZW1lbnQsIHNldFN0YXRlKGVudGl0eSldKVxuXG4gICAgcmV0dXJuIG5hdGl2ZUVsZW1lbnRcbiAgfVxuXG4gIC8qKlxuICAgKiBSZW1vdmUgYSBjb21wb25lbnQgZnJvbSB0aGUgbmF0aXZlIGRvbS5cbiAgICpcbiAgICogQHBhcmFtIHtFbnRpdHl9IGVudGl0eVxuICAgKi9cblxuICBmdW5jdGlvbiB1bm1vdW50RW50aXR5IChlbnRpdHlJZCkge1xuICAgIHZhciBlbnRpdHkgPSBlbnRpdGllc1tlbnRpdHlJZF1cbiAgICBpZiAoIWVudGl0eSkgcmV0dXJuXG4gICAgdHJpZ2dlcignYmVmb3JlVW5tb3VudCcsIGVudGl0eSwgW2VudGl0eS5jb250ZXh0LCBlbnRpdHkubmF0aXZlRWxlbWVudF0pXG4gICAgdW5tb3VudENoaWxkcmVuKGVudGl0eUlkKVxuICAgIHJlbW92ZUFsbEV2ZW50cyhlbnRpdHlJZClcbiAgICBkZWxldGUgZW50aXRpZXNbZW50aXR5SWRdXG4gICAgZGVsZXRlIGNoaWxkcmVuW2VudGl0eUlkXVxuICB9XG5cbiAgLyoqXG4gICAqIFJlbmRlciB0aGUgZW50aXR5IGFuZCBtYWtlIHN1cmUgaXQgcmV0dXJucyBhIG5vZGVcbiAgICpcbiAgICogQHBhcmFtIHtFbnRpdHl9IGVudGl0eVxuICAgKlxuICAgKiBAcmV0dXJuIHtWaXJ0dWFsVHJlZX1cbiAgICovXG5cbiAgZnVuY3Rpb24gcmVuZGVyRW50aXR5IChlbnRpdHkpIHtcbiAgICB2YXIgY29tcG9uZW50ID0gZW50aXR5LmNvbXBvbmVudFxuICAgIGlmICghY29tcG9uZW50LnJlbmRlcikgdGhyb3cgbmV3IEVycm9yKCdDb21wb25lbnQgbmVlZHMgYSByZW5kZXIgZnVuY3Rpb24nKVxuICAgIHZhciByZXN1bHQgPSBjb21wb25lbnQucmVuZGVyKGVudGl0eS5jb250ZXh0LCBzZXRTdGF0ZShlbnRpdHkpKVxuICAgIGlmICghcmVzdWx0KSB0aHJvdyBuZXcgRXJyb3IoJ1JlbmRlciBmdW5jdGlvbiBtdXN0IHJldHVybiBhbiBlbGVtZW50LicpXG4gICAgcmV0dXJuIHJlc3VsdFxuICB9XG5cbiAgLyoqXG4gICAqIFdoZW5ldmVyIHNldFN0YXRlIG9yIHNldFByb3BzIGlzIGNhbGxlZCwgd2UgbWFyayB0aGUgZW50aXR5XG4gICAqIGFzIGRpcnR5IGluIHRoZSByZW5kZXJlci4gVGhpcyBsZXRzIHVzIG9wdGltaXplIHRoZSByZS1yZW5kZXJpbmdcbiAgICogYW5kIHNraXAgY29tcG9uZW50cyB0aGF0IGRlZmluaXRlbHkgaGF2ZW4ndCBjaGFuZ2VkLlxuICAgKlxuICAgKiBAcGFyYW0ge0VudGl0eX0gZW50aXR5XG4gICAqXG4gICAqIEByZXR1cm4ge0Z1bmN0aW9ufSBBIGN1cnJpZWQgZnVuY3Rpb24gZm9yIHVwZGF0aW5nIHRoZSBzdGF0ZSBvZiBhbiBlbnRpdHlcbiAgICovXG5cbiAgZnVuY3Rpb24gc2V0U3RhdGUgKGVudGl0eSkge1xuICAgIHJldHVybiBmdW5jdGlvbiAobmV4dFN0YXRlKSB7XG4gICAgICB1cGRhdGVFbnRpdHlTdGF0ZShlbnRpdHksIG5leHRTdGF0ZSlcbiAgICB9XG4gIH1cblxuICAvKipcbiAgICogVGVsbCB0aGUgYXBwIGl0J3MgZGlydHkgYW5kIG5lZWRzIHRvIHJlLXJlbmRlci4gSWYgYmF0Y2hpbmcgaXMgZGlzYWJsZWRcbiAgICogd2UgY2FuIGp1c3QgdHJpZ2dlciBhIHJlbmRlciBpbW1lZGlhdGVseSwgb3RoZXJ3aXNlIHdlJ2xsIHdhaXQgdW50aWxcbiAgICogdGhlIG5leHQgYXZhaWxhYmxlIGZyYW1lLlxuICAgKi9cblxuICBmdW5jdGlvbiBpbnZhbGlkYXRlICgpIHtcbiAgICBpZiAoIW9wdGlvbnMuYmF0Y2hpbmcpIHtcbiAgICAgIGlmICghaXNSZW5kZXJpbmcpIHJlbmRlcigpXG4gICAgfSBlbHNlIHtcbiAgICAgIGlmICghZnJhbWVJZCkgZnJhbWVJZCA9IHJhZihyZW5kZXIpXG4gICAgfVxuICB9XG5cbiAgLyoqXG4gICAqIFVwZGF0ZSB0aGUgRE9NLiBJZiB0aGUgdXBkYXRlIGZhaWxzIHdlIHN0b3AgdGhlIGxvb3BcbiAgICogc28gd2UgZG9uJ3QgZ2V0IGVycm9ycyBvbiBldmVyeSBmcmFtZS5cbiAgICpcbiAgICogQGFwaSBwdWJsaWNcbiAgICovXG5cbiAgZnVuY3Rpb24gcmVuZGVyICgpIHtcbiAgICAvLyBJZiB0aGlzIGlzIGNhbGxlZCBzeW5jaHJvbm91c2x5IHdlIG5lZWQgdG9cbiAgICAvLyBjYW5jZWwgYW55IHBlbmRpbmcgZnV0dXJlIHVwZGF0ZXNcbiAgICBjbGVhckZyYW1lKClcblxuICAgIC8vIElmIHRoZSByZW5kZXJpbmcgZnJvbSB0aGUgcHJldmlvdXMgZnJhbWUgaXMgc3RpbGwgZ29pbmcsXG4gICAgLy8gd2UnbGwganVzdCB3YWl0IHVudGlsIHRoZSBuZXh0IGZyYW1lLiBJZGVhbGx5IHJlbmRlcnMgc2hvdWxkXG4gICAgLy8gbm90IHRha2Ugb3ZlciAxNm1zIHRvIHN0YXkgd2l0aGluIGEgc2luZ2xlIGZyYW1lLCBidXQgdGhpcyBzaG91bGRcbiAgICAvLyBjYXRjaCBpdCBpZiBpdCBkb2VzLlxuICAgIGlmIChpc1JlbmRlcmluZykge1xuICAgICAgZnJhbWVJZCA9IHJhZihyZW5kZXIpXG4gICAgICByZXR1cm5cbiAgICB9IGVsc2Uge1xuICAgICAgaXNSZW5kZXJpbmcgPSB0cnVlXG4gICAgfVxuXG4gICAgLy8gMS4gSWYgdGhlcmUgaXNuJ3QgYSBuYXRpdmUgZWxlbWVudCByZW5kZXJlZCBmb3IgdGhlIGN1cnJlbnQgbW91bnRlZCBlbGVtZW50XG4gICAgLy8gdGhlbiB3ZSBuZWVkIHRvIGNyZWF0ZSBpdCBmcm9tIHNjcmF0Y2guXG4gICAgLy8gMi4gSWYgYSBuZXcgZWxlbWVudCBoYXMgYmVlbiBtb3VudGVkLCB3ZSBzaG91bGQgZGlmZiB0aGVtLlxuICAgIC8vIDMuIFdlIHNob3VsZCB1cGRhdGUgY2hlY2sgYWxsIGNoaWxkIGNvbXBvbmVudHMgZm9yIGNoYW5nZXMuXG4gICAgaWYgKCFjdXJyZW50TmF0aXZlRWxlbWVudCkge1xuICAgICAgY3VycmVudEVsZW1lbnQgPSBhcHAuZWxlbWVudFxuICAgICAgY3VycmVudE5hdGl2ZUVsZW1lbnQgPSB0b05hdGl2ZShyb290SWQsICcwJywgY3VycmVudEVsZW1lbnQpXG4gICAgICBjb250YWluZXIuYXBwZW5kQ2hpbGQoY3VycmVudE5hdGl2ZUVsZW1lbnQpXG4gICAgfSBlbHNlIGlmIChjdXJyZW50RWxlbWVudCAhPT0gYXBwLmVsZW1lbnQpIHtcbiAgICAgIGN1cnJlbnROYXRpdmVFbGVtZW50ID0gcGF0Y2gocm9vdElkLCBjdXJyZW50RWxlbWVudCwgYXBwLmVsZW1lbnQsIGN1cnJlbnROYXRpdmVFbGVtZW50KVxuICAgICAgY3VycmVudEVsZW1lbnQgPSBhcHAuZWxlbWVudFxuICAgICAgdXBkYXRlQ2hpbGRyZW4ocm9vdElkKVxuICAgIH0gZWxzZSB7XG4gICAgICB1cGRhdGVDaGlsZHJlbihyb290SWQpXG4gICAgfVxuXG4gICAgLy8gQWxsb3cgcmVuZGVyaW5nIGFnYWluLlxuICAgIGlzUmVuZGVyaW5nID0gZmFsc2VcbiAgfVxuXG4gIC8qKlxuICAgKiBDbGVhciB0aGUgY3VycmVudCBzY2hlZHVsZWQgZnJhbWVcbiAgICovXG5cbiAgZnVuY3Rpb24gY2xlYXJGcmFtZSAoKSB7XG4gICAgaWYgKCFmcmFtZUlkKSByZXR1cm5cbiAgICByYWYuY2FuY2VsKGZyYW1lSWQpXG4gICAgZnJhbWVJZCA9IDBcbiAgfVxuXG4gIC8qKlxuICAgKiBVcGRhdGUgYSBjb21wb25lbnQuXG4gICAqXG4gICAqIFRoZSBlbnRpdHkgaXMganVzdCB0aGUgZGF0YSBvYmplY3QgZm9yIGEgY29tcG9uZW50IGluc3RhbmNlLlxuICAgKlxuICAgKiBAcGFyYW0ge1N0cmluZ30gaWQgQ29tcG9uZW50IGluc3RhbmNlIGlkLlxuICAgKi9cblxuICBmdW5jdGlvbiB1cGRhdGVFbnRpdHkgKGVudGl0eUlkKSB7XG4gICAgdmFyIGVudGl0eSA9IGVudGl0aWVzW2VudGl0eUlkXVxuICAgIHNldFNvdXJjZXMoZW50aXR5KVxuXG4gICAgaWYgKCFzaG91bGRVcGRhdGUoZW50aXR5KSkgcmV0dXJuIHVwZGF0ZUNoaWxkcmVuKGVudGl0eUlkKVxuXG4gICAgdmFyIGN1cnJlbnRUcmVlID0gZW50aXR5LnZpcnR1YWxFbGVtZW50XG4gICAgdmFyIG5leHRQcm9wcyA9IGVudGl0eS5wZW5kaW5nUHJvcHNcbiAgICB2YXIgbmV4dFN0YXRlID0gZW50aXR5LnBlbmRpbmdTdGF0ZVxuICAgIHZhciBwcmV2aW91c1N0YXRlID0gZW50aXR5LmNvbnRleHQuc3RhdGVcbiAgICB2YXIgcHJldmlvdXNQcm9wcyA9IGVudGl0eS5jb250ZXh0LnByb3BzXG5cbiAgICAvLyBob29rIGJlZm9yZSByZW5kZXJpbmcuIGNvdWxkIG1vZGlmeSBzdGF0ZSBqdXN0IGJlZm9yZSB0aGUgcmVuZGVyIG9jY3Vycy5cbiAgICB0cmlnZ2VyKCdiZWZvcmVVcGRhdGUnLCBlbnRpdHksIFtlbnRpdHkuY29udGV4dCwgbmV4dFByb3BzLCBuZXh0U3RhdGVdKVxuICAgIHRyaWdnZXIoJ2JlZm9yZVJlbmRlcicsIGVudGl0eSwgW2VudGl0eS5jb250ZXh0XSlcblxuICAgIC8vIGNvbW1pdCBzdGF0ZSBhbmQgcHJvcHMuXG4gICAgY29tbWl0KGVudGl0eSlcblxuICAgIC8vIHJlLXJlbmRlci5cbiAgICB2YXIgbmV4dFRyZWUgPSByZW5kZXJFbnRpdHkoZW50aXR5KVxuXG4gICAgLy8gaWYgdGhlIHRyZWUgaXMgdGhlIHNhbWUgd2UgY2FuIGp1c3Qgc2tpcCB0aGlzIGNvbXBvbmVudFxuICAgIC8vIGJ1dCB3ZSBzaG91bGQgc3RpbGwgY2hlY2sgdGhlIGNoaWxkcmVuIHRvIHNlZSBpZiB0aGV5J3JlIGRpcnR5LlxuICAgIC8vIFRoaXMgYWxsb3dzIHVzIHRvIG1lbW9pemUgdGhlIHJlbmRlciBmdW5jdGlvbiBvZiBjb21wb25lbnRzLlxuICAgIGlmIChuZXh0VHJlZSA9PT0gY3VycmVudFRyZWUpIHJldHVybiB1cGRhdGVDaGlsZHJlbihlbnRpdHlJZClcblxuICAgIC8vIGFwcGx5IG5ldyB2aXJ0dWFsIHRyZWUgdG8gbmF0aXZlIGRvbS5cbiAgICBlbnRpdHkubmF0aXZlRWxlbWVudCA9IHBhdGNoKGVudGl0eUlkLCBjdXJyZW50VHJlZSwgbmV4dFRyZWUsIGVudGl0eS5uYXRpdmVFbGVtZW50KVxuICAgIGVudGl0eS52aXJ0dWFsRWxlbWVudCA9IG5leHRUcmVlXG4gICAgdXBkYXRlQ2hpbGRyZW4oZW50aXR5SWQpXG5cbiAgICAvLyB0cmlnZ2VyIHJlbmRlciBob29rXG4gICAgdHJpZ2dlcignYWZ0ZXJSZW5kZXInLCBlbnRpdHksIFtlbnRpdHkuY29udGV4dCwgZW50aXR5Lm5hdGl2ZUVsZW1lbnRdKVxuXG4gICAgLy8gdHJpZ2dlciBhZnRlclVwZGF0ZSBhZnRlciBhbGwgY2hpbGRyZW4gaGF2ZSB1cGRhdGVkLlxuICAgIHRyaWdnZXIoJ2FmdGVyVXBkYXRlJywgZW50aXR5LCBbZW50aXR5LmNvbnRleHQsIHByZXZpb3VzUHJvcHMsIHByZXZpb3VzU3RhdGUsIHNldFN0YXRlKGVudGl0eSldKVxuICB9XG5cbiAgLyoqXG4gICAqIFVwZGF0ZSBhbGwgdGhlIGNoaWxkcmVuIG9mIGFuIGVudGl0eS5cbiAgICpcbiAgICogQHBhcmFtIHtTdHJpbmd9IGlkIENvbXBvbmVudCBpbnN0YW5jZSBpZC5cbiAgICovXG5cbiAgZnVuY3Rpb24gdXBkYXRlQ2hpbGRyZW4gKGVudGl0eUlkKSB7XG4gICAgZm9yRWFjaChjaGlsZHJlbltlbnRpdHlJZF0sIGZ1bmN0aW9uIChjaGlsZElkKSB7XG4gICAgICB1cGRhdGVFbnRpdHkoY2hpbGRJZClcbiAgICB9KVxuICB9XG5cbiAgLyoqXG4gICAqIFJlbW92ZSBhbGwgb2YgdGhlIGNoaWxkIGVudGl0aWVzIG9mIGFuIGVudGl0eVxuICAgKlxuICAgKiBAcGFyYW0ge0VudGl0eX0gZW50aXR5XG4gICAqL1xuXG4gIGZ1bmN0aW9uIHVubW91bnRDaGlsZHJlbiAoZW50aXR5SWQpIHtcbiAgICBmb3JFYWNoKGNoaWxkcmVuW2VudGl0eUlkXSwgZnVuY3Rpb24gKGNoaWxkSWQpIHtcbiAgICAgIHVubW91bnRFbnRpdHkoY2hpbGRJZClcbiAgICB9KVxuICB9XG5cbiAgLyoqXG4gICAqIFJlbW92ZSB0aGUgcm9vdCBlbGVtZW50LiBJZiB0aGlzIGlzIGNhbGxlZCBzeW5jaHJvbm91c2x5IHdlIG5lZWQgdG9cbiAgICogY2FuY2VsIGFueSBwZW5kaW5nIGZ1dHVyZSB1cGRhdGVzLlxuICAgKi9cblxuICBmdW5jdGlvbiByZW1vdmVOYXRpdmVFbGVtZW50ICgpIHtcbiAgICBjbGVhckZyYW1lKClcbiAgICByZW1vdmVFbGVtZW50KHJvb3RJZCwgJzAnLCBjdXJyZW50TmF0aXZlRWxlbWVudClcbiAgICBjdXJyZW50TmF0aXZlRWxlbWVudCA9IG51bGxcbiAgfVxuXG4gIC8qKlxuICAgKiBDcmVhdGUgYSBuYXRpdmUgZWxlbWVudCBmcm9tIGEgdmlydHVhbCBlbGVtZW50LlxuICAgKlxuICAgKiBAcGFyYW0ge1N0cmluZ30gZW50aXR5SWRcbiAgICogQHBhcmFtIHtTdHJpbmd9IHBhdGhcbiAgICogQHBhcmFtIHtPYmplY3R9IHZub2RlXG4gICAqXG4gICAqIEByZXR1cm4ge0hUTUxEb2N1bWVudEZyYWdtZW50fVxuICAgKi9cblxuICBmdW5jdGlvbiB0b05hdGl2ZSAoZW50aXR5SWQsIHBhdGgsIHZub2RlKSB7XG4gICAgc3dpdGNoICh2bm9kZS50eXBlKSB7XG4gICAgICBjYXNlICd0ZXh0JzogcmV0dXJuIHRvTmF0aXZlVGV4dCh2bm9kZSlcbiAgICAgIGNhc2UgJ2VsZW1lbnQnOiByZXR1cm4gdG9OYXRpdmVFbGVtZW50KGVudGl0eUlkLCBwYXRoLCB2bm9kZSlcbiAgICAgIGNhc2UgJ2NvbXBvbmVudCc6IHJldHVybiB0b05hdGl2ZUNvbXBvbmVudChlbnRpdHlJZCwgcGF0aCwgdm5vZGUpXG4gICAgfVxuICB9XG5cbiAgLyoqXG4gICAqIENyZWF0ZSBhIG5hdGl2ZSB0ZXh0IGVsZW1lbnQgZnJvbSBhIHZpcnR1YWwgZWxlbWVudC5cbiAgICpcbiAgICogQHBhcmFtIHtPYmplY3R9IHZub2RlXG4gICAqL1xuXG4gIGZ1bmN0aW9uIHRvTmF0aXZlVGV4dCAodm5vZGUpIHtcbiAgICByZXR1cm4gZG9jdW1lbnQuY3JlYXRlVGV4dE5vZGUodm5vZGUuZGF0YSlcbiAgfVxuXG4gIC8qKlxuICAgKiBDcmVhdGUgYSBuYXRpdmUgZWxlbWVudCBmcm9tIGEgdmlydHVhbCBlbGVtZW50LlxuICAgKi9cblxuICBmdW5jdGlvbiB0b05hdGl2ZUVsZW1lbnQgKGVudGl0eUlkLCBwYXRoLCB2bm9kZSkge1xuICAgIHZhciBhdHRyaWJ1dGVzID0gdm5vZGUuYXR0cmlidXRlc1xuICAgIHZhciBjaGlsZHJlbiA9IHZub2RlLmNoaWxkcmVuXG4gICAgdmFyIHRhZ05hbWUgPSB2bm9kZS50YWdOYW1lXG4gICAgdmFyIGVsXG5cbiAgICAvLyBjcmVhdGUgZWxlbWVudCBlaXRoZXIgZnJvbSBwb29sIG9yIGZyZXNoLlxuICAgIGlmICghb3B0aW9ucy5wb29saW5nIHx8ICFjYW5Qb29sKHRhZ05hbWUpKSB7XG4gICAgICBpZiAoc3ZnLmlzRWxlbWVudCh0YWdOYW1lKSkge1xuICAgICAgICBlbCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnROUyhzdmcubmFtZXNwYWNlLCB0YWdOYW1lKVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgZWwgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KHRhZ05hbWUpXG4gICAgICB9XG4gICAgfSBlbHNlIHtcbiAgICAgIHZhciBwb29sID0gZ2V0UG9vbCh0YWdOYW1lKVxuICAgICAgZWwgPSBjbGVhbnVwKHBvb2wucG9wKCkpXG4gICAgICBpZiAoZWwucGFyZW50Tm9kZSkgZWwucGFyZW50Tm9kZS5yZW1vdmVDaGlsZChlbClcbiAgICB9XG5cbiAgICAvLyBzZXQgYXR0cmlidXRlcy5cbiAgICBmb3JFYWNoKGF0dHJpYnV0ZXMsIGZ1bmN0aW9uICh2YWx1ZSwgbmFtZSkge1xuICAgICAgc2V0QXR0cmlidXRlKGVudGl0eUlkLCBwYXRoLCBlbCwgbmFtZSwgdmFsdWUpXG4gICAgfSlcblxuICAgIC8vIHN0b3JlIGtleXMgb24gdGhlIG5hdGl2ZSBlbGVtZW50IGZvciBmYXN0IGV2ZW50IGhhbmRsaW5nLlxuICAgIGVsLl9fZW50aXR5X18gPSBlbnRpdHlJZFxuICAgIGVsLl9fcGF0aF9fID0gcGF0aFxuXG4gICAgLy8gYWRkIGNoaWxkcmVuLlxuICAgIGZvckVhY2goY2hpbGRyZW4sIGZ1bmN0aW9uIChjaGlsZCwgaSkge1xuICAgICAgdmFyIGNoaWxkRWwgPSB0b05hdGl2ZShlbnRpdHlJZCwgcGF0aCArICcuJyArIGksIGNoaWxkKVxuICAgICAgaWYgKCFjaGlsZEVsLnBhcmVudE5vZGUpIGVsLmFwcGVuZENoaWxkKGNoaWxkRWwpXG4gICAgfSlcblxuICAgIHJldHVybiBlbFxuICB9XG5cbiAgLyoqXG4gICAqIENyZWF0ZSBhIG5hdGl2ZSBlbGVtZW50IGZyb20gYSBjb21wb25lbnQuXG4gICAqL1xuXG4gIGZ1bmN0aW9uIHRvTmF0aXZlQ29tcG9uZW50IChlbnRpdHlJZCwgcGF0aCwgdm5vZGUpIHtcbiAgICB2YXIgY2hpbGQgPSBuZXcgRW50aXR5KHZub2RlLmNvbXBvbmVudCwgdm5vZGUucHJvcHMpXG4gICAgY2hpbGRyZW5bZW50aXR5SWRdW3BhdGhdID0gY2hpbGQuaWRcbiAgICByZXR1cm4gbW91bnRFbnRpdHkoY2hpbGQpXG4gIH1cblxuICAvKipcbiAgICogUGF0Y2ggYW4gZWxlbWVudCB3aXRoIHRoZSBkaWZmIGZyb20gdHdvIHRyZWVzLlxuICAgKi9cblxuICBmdW5jdGlvbiBwYXRjaCAoZW50aXR5SWQsIHByZXYsIG5leHQsIGVsKSB7XG4gICAgcmV0dXJuIGRpZmZOb2RlKCcwJywgZW50aXR5SWQsIHByZXYsIG5leHQsIGVsKVxuICB9XG5cbiAgLyoqXG4gICAqIENyZWF0ZSBhIGRpZmYgYmV0d2VlbiB0d28gdHJlc3Mgb2Ygbm9kZXMuXG4gICAqL1xuXG4gIGZ1bmN0aW9uIGRpZmZOb2RlIChwYXRoLCBlbnRpdHlJZCwgcHJldiwgbmV4dCwgZWwpIHtcbiAgICAvLyBUeXBlIGNoYW5nZWQuIFRoaXMgY291bGQgYmUgZnJvbSBlbGVtZW50LT50ZXh0LCB0ZXh0LT5Db21wb25lbnRBLFxuICAgIC8vIENvbXBvbmVudEEtPkNvbXBvbmVudEIgZXRjLiBCdXQgTk9UIGRpdi0+c3Bhbi4gVGhlc2UgYXJlIHRoZSBzYW1lIHR5cGVcbiAgICAvLyAoRWxlbWVudE5vZGUpIGJ1dCBkaWZmZXJlbnQgdGFnIG5hbWUuXG4gICAgaWYgKHByZXYudHlwZSAhPT0gbmV4dC50eXBlKSByZXR1cm4gcmVwbGFjZUVsZW1lbnQoZW50aXR5SWQsIHBhdGgsIGVsLCBuZXh0KVxuXG4gICAgc3dpdGNoIChuZXh0LnR5cGUpIHtcbiAgICAgIGNhc2UgJ3RleHQnOiByZXR1cm4gZGlmZlRleHQocHJldiwgbmV4dCwgZWwpXG4gICAgICBjYXNlICdlbGVtZW50JzogcmV0dXJuIGRpZmZFbGVtZW50KHBhdGgsIGVudGl0eUlkLCBwcmV2LCBuZXh0LCBlbClcbiAgICAgIGNhc2UgJ2NvbXBvbmVudCc6IHJldHVybiBkaWZmQ29tcG9uZW50KHBhdGgsIGVudGl0eUlkLCBwcmV2LCBuZXh0LCBlbClcbiAgICB9XG4gIH1cblxuICAvKipcbiAgICogRGlmZiB0d28gdGV4dCBub2RlcyBhbmQgdXBkYXRlIHRoZSBlbGVtZW50LlxuICAgKi9cblxuICBmdW5jdGlvbiBkaWZmVGV4dCAocHJldmlvdXMsIGN1cnJlbnQsIGVsKSB7XG4gICAgaWYgKGN1cnJlbnQuZGF0YSAhPT0gcHJldmlvdXMuZGF0YSkgZWwuZGF0YSA9IGN1cnJlbnQuZGF0YVxuICAgIHJldHVybiBlbFxuICB9XG5cbiAgLyoqXG4gICAqIERpZmYgdGhlIGNoaWxkcmVuIG9mIGFuIEVsZW1lbnROb2RlLlxuICAgKi9cblxuICBmdW5jdGlvbiBkaWZmQ2hpbGRyZW4gKHBhdGgsIGVudGl0eUlkLCBwcmV2LCBuZXh0LCBlbCkge1xuICAgIHZhciBwb3NpdGlvbnMgPSBbXVxuICAgIHZhciBoYXNLZXlzID0gZmFsc2VcbiAgICB2YXIgY2hpbGROb2RlcyA9IEFycmF5LnByb3RvdHlwZS5zbGljZS5hcHBseShlbC5jaGlsZE5vZGVzKVxuICAgIHZhciBsZWZ0S2V5cyA9IHJlZHVjZShwcmV2LmNoaWxkcmVuLCBrZXlNYXBSZWR1Y2VyLCB7fSlcbiAgICB2YXIgcmlnaHRLZXlzID0gcmVkdWNlKG5leHQuY2hpbGRyZW4sIGtleU1hcFJlZHVjZXIsIHt9KVxuICAgIHZhciBjdXJyZW50Q2hpbGRyZW4gPSBhc3NpZ24oe30sIGNoaWxkcmVuW2VudGl0eUlkXSlcblxuICAgIGZ1bmN0aW9uIGtleU1hcFJlZHVjZXIgKGFjYywgY2hpbGQpIHtcbiAgICAgIGlmIChjaGlsZC5rZXkgIT0gbnVsbCkge1xuICAgICAgICBhY2NbY2hpbGQua2V5XSA9IGNoaWxkXG4gICAgICAgIGhhc0tleXMgPSB0cnVlXG4gICAgICB9XG4gICAgICByZXR1cm4gYWNjXG4gICAgfVxuXG4gICAgLy8gRGlmZiBhbGwgb2YgdGhlIG5vZGVzIHRoYXQgaGF2ZSBrZXlzLiBUaGlzIGxldHMgdXMgcmUtdXNlZCBlbGVtZW50c1xuICAgIC8vIGluc3RlYWQgb2Ygb3ZlcnJpZGluZyB0aGVtIGFuZCBsZXRzIHVzIG1vdmUgdGhlbSBhcm91bmQuXG4gICAgaWYgKGhhc0tleXMpIHtcblxuICAgICAgLy8gUmVtb3ZhbHNcbiAgICAgIGZvckVhY2gobGVmdEtleXMsIGZ1bmN0aW9uIChsZWZ0Tm9kZSwga2V5KSB7XG4gICAgICAgIGlmIChyaWdodEtleXNba2V5XSA9PSBudWxsKSB7XG4gICAgICAgICAgdmFyIGxlZnRQYXRoID0gcGF0aCArICcuJyArIGxlZnROb2RlLmluZGV4XG4gICAgICAgICAgcmVtb3ZlRWxlbWVudChcbiAgICAgICAgICAgIGVudGl0eUlkLFxuICAgICAgICAgICAgbGVmdFBhdGgsXG4gICAgICAgICAgICBjaGlsZE5vZGVzW2xlZnROb2RlLmluZGV4XVxuICAgICAgICAgIClcbiAgICAgICAgfVxuICAgICAgfSlcblxuICAgICAgLy8gVXBkYXRlIG5vZGVzXG4gICAgICBmb3JFYWNoKHJpZ2h0S2V5cywgZnVuY3Rpb24gKHJpZ2h0Tm9kZSwga2V5KSB7XG4gICAgICAgIHZhciBsZWZ0Tm9kZSA9IGxlZnRLZXlzW2tleV1cblxuICAgICAgICAvLyBXZSBvbmx5IHdhbnQgdXBkYXRlcyBmb3Igbm93XG4gICAgICAgIGlmIChsZWZ0Tm9kZSA9PSBudWxsKSByZXR1cm5cblxuICAgICAgICB2YXIgbGVmdFBhdGggPSBwYXRoICsgJy4nICsgbGVmdE5vZGUuaW5kZXhcblxuICAgICAgICAvLyBVcGRhdGVkXG4gICAgICAgIHBvc2l0aW9uc1tyaWdodE5vZGUuaW5kZXhdID0gZGlmZk5vZGUoXG4gICAgICAgICAgbGVmdFBhdGgsXG4gICAgICAgICAgZW50aXR5SWQsXG4gICAgICAgICAgbGVmdE5vZGUsXG4gICAgICAgICAgcmlnaHROb2RlLFxuICAgICAgICAgIGNoaWxkTm9kZXNbbGVmdE5vZGUuaW5kZXhdXG4gICAgICAgIClcbiAgICAgIH0pXG5cbiAgICAgIC8vIFVwZGF0ZSB0aGUgcG9zaXRpb25zIG9mIGFsbCBjaGlsZCBjb21wb25lbnRzIGFuZCBldmVudCBoYW5kbGVyc1xuICAgICAgZm9yRWFjaChyaWdodEtleXMsIGZ1bmN0aW9uIChyaWdodE5vZGUsIGtleSkge1xuICAgICAgICB2YXIgbGVmdE5vZGUgPSBsZWZ0S2V5c1trZXldXG5cbiAgICAgICAgLy8gV2UganVzdCB3YW50IGVsZW1lbnRzIHRoYXQgaGF2ZSBtb3ZlZCBhcm91bmRcbiAgICAgICAgaWYgKGxlZnROb2RlID09IG51bGwgfHwgbGVmdE5vZGUuaW5kZXggPT09IHJpZ2h0Tm9kZS5pbmRleCkgcmV0dXJuXG5cbiAgICAgICAgdmFyIHJpZ2h0UGF0aCA9IHBhdGggKyAnLicgKyByaWdodE5vZGUuaW5kZXhcbiAgICAgICAgdmFyIGxlZnRQYXRoID0gcGF0aCArICcuJyArIGxlZnROb2RlLmluZGV4XG5cbiAgICAgICAgLy8gVXBkYXRlIGFsbCB0aGUgY2hpbGQgY29tcG9uZW50IHBhdGggcG9zaXRpb25zIHRvIG1hdGNoXG4gICAgICAgIC8vIHRoZSBsYXRlc3QgcG9zaXRpb25zIGlmIHRoZXkndmUgY2hhbmdlZC4gVGhpcyBpcyBhIGJpdCBoYWNreS5cbiAgICAgICAgZm9yRWFjaChjdXJyZW50Q2hpbGRyZW4sIGZ1bmN0aW9uIChjaGlsZElkLCBjaGlsZFBhdGgpIHtcbiAgICAgICAgICBpZiAobGVmdFBhdGggPT09IGNoaWxkUGF0aCkge1xuICAgICAgICAgICAgZGVsZXRlIGNoaWxkcmVuW2VudGl0eUlkXVtjaGlsZFBhdGhdXG4gICAgICAgICAgICBjaGlsZHJlbltlbnRpdHlJZF1bcmlnaHRQYXRoXSA9IGNoaWxkSWRcbiAgICAgICAgICB9XG4gICAgICAgIH0pXG4gICAgICB9KVxuXG4gICAgICAvLyBOb3cgYWRkIGFsbCBvZiB0aGUgbmV3IG5vZGVzIGxhc3QgaW4gY2FzZSB0aGVpciBwYXRoXG4gICAgICAvLyB3b3VsZCBoYXZlIGNvbmZsaWN0ZWQgd2l0aCBvbmUgb2YgdGhlIHByZXZpb3VzIHBhdGhzLlxuICAgICAgZm9yRWFjaChyaWdodEtleXMsIGZ1bmN0aW9uIChyaWdodE5vZGUsIGtleSkge1xuICAgICAgICB2YXIgcmlnaHRQYXRoID0gcGF0aCArICcuJyArIHJpZ2h0Tm9kZS5pbmRleFxuICAgICAgICBpZiAobGVmdEtleXNba2V5XSA9PSBudWxsKSB7XG4gICAgICAgICAgcG9zaXRpb25zW3JpZ2h0Tm9kZS5pbmRleF0gPSB0b05hdGl2ZShcbiAgICAgICAgICAgIGVudGl0eUlkLFxuICAgICAgICAgICAgcmlnaHRQYXRoLFxuICAgICAgICAgICAgcmlnaHROb2RlXG4gICAgICAgICAgKVxuICAgICAgICB9XG4gICAgICB9KVxuXG4gICAgfSBlbHNlIHtcbiAgICAgIHZhciBtYXhMZW5ndGggPSBNYXRoLm1heChwcmV2LmNoaWxkcmVuLmxlbmd0aCwgbmV4dC5jaGlsZHJlbi5sZW5ndGgpXG5cbiAgICAgIC8vIE5vdyBkaWZmIGFsbCBvZiB0aGUgbm9kZXMgdGhhdCBkb24ndCBoYXZlIGtleXNcbiAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgbWF4TGVuZ3RoOyBpKyspIHtcbiAgICAgICAgdmFyIGxlZnROb2RlID0gcHJldi5jaGlsZHJlbltpXVxuICAgICAgICB2YXIgcmlnaHROb2RlID0gbmV4dC5jaGlsZHJlbltpXVxuXG4gICAgICAgIC8vIFJlbW92YWxzXG4gICAgICAgIGlmIChyaWdodE5vZGUgPT0gbnVsbCkge1xuICAgICAgICAgIHJlbW92ZUVsZW1lbnQoXG4gICAgICAgICAgICBlbnRpdHlJZCxcbiAgICAgICAgICAgIHBhdGggKyAnLicgKyBsZWZ0Tm9kZS5pbmRleCxcbiAgICAgICAgICAgIGNoaWxkTm9kZXNbbGVmdE5vZGUuaW5kZXhdXG4gICAgICAgICAgKVxuICAgICAgICB9XG5cbiAgICAgICAgLy8gTmV3IE5vZGVcbiAgICAgICAgaWYgKGxlZnROb2RlID09IG51bGwpIHtcbiAgICAgICAgICBwb3NpdGlvbnNbcmlnaHROb2RlLmluZGV4XSA9IHRvTmF0aXZlKFxuICAgICAgICAgICAgZW50aXR5SWQsXG4gICAgICAgICAgICBwYXRoICsgJy4nICsgcmlnaHROb2RlLmluZGV4LFxuICAgICAgICAgICAgcmlnaHROb2RlXG4gICAgICAgICAgKVxuICAgICAgICB9XG5cbiAgICAgICAgLy8gVXBkYXRlZFxuICAgICAgICBpZiAobGVmdE5vZGUgJiYgcmlnaHROb2RlKSB7XG4gICAgICAgICAgcG9zaXRpb25zW2xlZnROb2RlLmluZGV4XSA9IGRpZmZOb2RlKFxuICAgICAgICAgICAgcGF0aCArICcuJyArIGxlZnROb2RlLmluZGV4LFxuICAgICAgICAgICAgZW50aXR5SWQsXG4gICAgICAgICAgICBsZWZ0Tm9kZSxcbiAgICAgICAgICAgIHJpZ2h0Tm9kZSxcbiAgICAgICAgICAgIGNoaWxkTm9kZXNbbGVmdE5vZGUuaW5kZXhdXG4gICAgICAgICAgKVxuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuXG4gICAgLy8gUmVwb3NpdGlvbiBhbGwgdGhlIGVsZW1lbnRzXG4gICAgZm9yRWFjaChwb3NpdGlvbnMsIGZ1bmN0aW9uIChjaGlsZEVsLCBuZXdQb3NpdGlvbikge1xuICAgICAgdmFyIHRhcmdldCA9IGVsLmNoaWxkTm9kZXNbbmV3UG9zaXRpb25dXG4gICAgICBpZiAoY2hpbGRFbCAhPT0gdGFyZ2V0KSB7XG4gICAgICAgIGlmICh0YXJnZXQpIHtcbiAgICAgICAgICBlbC5pbnNlcnRCZWZvcmUoY2hpbGRFbCwgdGFyZ2V0KVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIGVsLmFwcGVuZENoaWxkKGNoaWxkRWwpXG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9KVxuICB9XG5cbiAgLyoqXG4gICAqIERpZmYgdGhlIGF0dHJpYnV0ZXMgYW5kIGFkZC9yZW1vdmUgdGhlbS5cbiAgICovXG5cbiAgZnVuY3Rpb24gZGlmZkF0dHJpYnV0ZXMgKHByZXYsIG5leHQsIGVsLCBlbnRpdHlJZCwgcGF0aCkge1xuICAgIHZhciBuZXh0QXR0cnMgPSBuZXh0LmF0dHJpYnV0ZXNcbiAgICB2YXIgcHJldkF0dHJzID0gcHJldi5hdHRyaWJ1dGVzXG5cbiAgICAvLyBhZGQgbmV3IGF0dHJzXG4gICAgZm9yRWFjaChuZXh0QXR0cnMsIGZ1bmN0aW9uICh2YWx1ZSwgbmFtZSkge1xuICAgICAgaWYgKGV2ZW50c1tuYW1lXSB8fCAhKG5hbWUgaW4gcHJldkF0dHJzKSB8fCBwcmV2QXR0cnNbbmFtZV0gIT09IHZhbHVlKSB7XG4gICAgICAgIHNldEF0dHJpYnV0ZShlbnRpdHlJZCwgcGF0aCwgZWwsIG5hbWUsIHZhbHVlKVxuICAgICAgfVxuICAgIH0pXG5cbiAgICAvLyByZW1vdmUgb2xkIGF0dHJzXG4gICAgZm9yRWFjaChwcmV2QXR0cnMsIGZ1bmN0aW9uICh2YWx1ZSwgbmFtZSkge1xuICAgICAgaWYgKCEobmFtZSBpbiBuZXh0QXR0cnMpKSB7XG4gICAgICAgIHJlbW92ZUF0dHJpYnV0ZShlbnRpdHlJZCwgcGF0aCwgZWwsIG5hbWUpXG4gICAgICB9XG4gICAgfSlcbiAgfVxuXG4gIC8qKlxuICAgKiBVcGRhdGUgYSBjb21wb25lbnQgd2l0aCB0aGUgcHJvcHMgZnJvbSB0aGUgbmV4dCBub2RlLiBJZlxuICAgKiB0aGUgY29tcG9uZW50IHR5cGUgaGFzIGNoYW5nZWQsIHdlJ2xsIGp1c3QgcmVtb3ZlIHRoZSBvbGQgb25lXG4gICAqIGFuZCByZXBsYWNlIGl0IHdpdGggdGhlIG5ldyBjb21wb25lbnQuXG4gICAqL1xuXG4gIGZ1bmN0aW9uIGRpZmZDb21wb25lbnQgKHBhdGgsIGVudGl0eUlkLCBwcmV2LCBuZXh0LCBlbCkge1xuICAgIGlmIChuZXh0LmNvbXBvbmVudCAhPT0gcHJldi5jb21wb25lbnQpIHtcbiAgICAgIHJldHVybiByZXBsYWNlRWxlbWVudChlbnRpdHlJZCwgcGF0aCwgZWwsIG5leHQpXG4gICAgfSBlbHNlIHtcbiAgICAgIHZhciB0YXJnZXRJZCA9IGNoaWxkcmVuW2VudGl0eUlkXVtwYXRoXVxuXG4gICAgICAvLyBUaGlzIGlzIGEgaGFjayBmb3Igbm93XG4gICAgICBpZiAodGFyZ2V0SWQpIHtcbiAgICAgICAgdXBkYXRlRW50aXR5UHJvcHModGFyZ2V0SWQsIG5leHQucHJvcHMpXG4gICAgICB9XG5cbiAgICAgIHJldHVybiBlbFxuICAgIH1cbiAgfVxuXG4gIC8qKlxuICAgKiBEaWZmIHR3byBlbGVtZW50IG5vZGVzLlxuICAgKi9cblxuICBmdW5jdGlvbiBkaWZmRWxlbWVudCAocGF0aCwgZW50aXR5SWQsIHByZXYsIG5leHQsIGVsKSB7XG4gICAgaWYgKG5leHQudGFnTmFtZSAhPT0gcHJldi50YWdOYW1lKSByZXR1cm4gcmVwbGFjZUVsZW1lbnQoZW50aXR5SWQsIHBhdGgsIGVsLCBuZXh0KVxuICAgIGRpZmZBdHRyaWJ1dGVzKHByZXYsIG5leHQsIGVsLCBlbnRpdHlJZCwgcGF0aClcbiAgICBkaWZmQ2hpbGRyZW4ocGF0aCwgZW50aXR5SWQsIHByZXYsIG5leHQsIGVsKVxuICAgIHJldHVybiBlbFxuICB9XG5cbiAgLyoqXG4gICAqIFJlbW92ZXMgYW4gZWxlbWVudCBmcm9tIHRoZSBET00gYW5kIHVubW91bnRzIGFuZCBjb21wb25lbnRzXG4gICAqIHRoYXQgYXJlIHdpdGhpbiB0aGF0IGJyYW5jaFxuICAgKlxuICAgKiBzaWRlIGVmZmVjdHM6XG4gICAqICAgLSByZW1vdmVzIGVsZW1lbnQgZnJvbSB0aGUgRE9NXG4gICAqICAgLSByZW1vdmVzIGludGVybmFsIHJlZmVyZW5jZXNcbiAgICpcbiAgICogQHBhcmFtIHtTdHJpbmd9IGVudGl0eUlkXG4gICAqIEBwYXJhbSB7U3RyaW5nfSBwYXRoXG4gICAqIEBwYXJhbSB7SFRNTEVsZW1lbnR9IGVsXG4gICAqL1xuXG4gIGZ1bmN0aW9uIHJlbW92ZUVsZW1lbnQgKGVudGl0eUlkLCBwYXRoLCBlbCkge1xuICAgIHZhciBjaGlsZHJlbkJ5UGF0aCA9IGNoaWxkcmVuW2VudGl0eUlkXVxuICAgIHZhciBjaGlsZElkID0gY2hpbGRyZW5CeVBhdGhbcGF0aF1cbiAgICB2YXIgZW50aXR5SGFuZGxlcnMgPSBoYW5kbGVyc1tlbnRpdHlJZF0gfHwge31cbiAgICB2YXIgcmVtb3ZhbHMgPSBbXVxuXG4gICAgLy8gSWYgdGhlIHBhdGggcG9pbnRzIHRvIGEgY29tcG9uZW50IHdlIHNob3VsZCB1c2UgdGhhdFxuICAgIC8vIGNvbXBvbmVudHMgZWxlbWVudCBpbnN0ZWFkLCBiZWNhdXNlIGl0IG1pZ2h0IGhhdmUgbW92ZWQgaXQuXG4gICAgaWYgKGNoaWxkSWQpIHtcbiAgICAgIHZhciBjaGlsZCA9IGVudGl0aWVzW2NoaWxkSWRdXG4gICAgICBlbCA9IGNoaWxkLm5hdGl2ZUVsZW1lbnRcbiAgICAgIHVubW91bnRFbnRpdHkoY2hpbGRJZClcbiAgICAgIHJlbW92YWxzLnB1c2gocGF0aClcbiAgICB9IGVsc2Uge1xuXG4gICAgICAvLyBKdXN0IHJlbW92ZSB0aGUgdGV4dCBub2RlXG4gICAgICBpZiAoIWlzRWxlbWVudChlbCkpIHJldHVybiBlbC5wYXJlbnROb2RlLnJlbW92ZUNoaWxkKGVsKVxuXG4gICAgICAvLyBUaGVuIHdlIG5lZWQgdG8gZmluZCBhbnkgY29tcG9uZW50cyB3aXRoaW4gdGhpc1xuICAgICAgLy8gYnJhbmNoIGFuZCB1bm1vdW50IHRoZW0uXG4gICAgICBmb3JFYWNoKGNoaWxkcmVuQnlQYXRoLCBmdW5jdGlvbiAoY2hpbGRJZCwgY2hpbGRQYXRoKSB7XG4gICAgICAgIGlmIChjaGlsZFBhdGggPT09IHBhdGggfHwgaXNXaXRoaW5QYXRoKHBhdGgsIGNoaWxkUGF0aCkpIHtcbiAgICAgICAgICB1bm1vdW50RW50aXR5KGNoaWxkSWQpXG4gICAgICAgICAgcmVtb3ZhbHMucHVzaChjaGlsZFBhdGgpXG4gICAgICAgIH1cbiAgICAgIH0pXG5cbiAgICAgIC8vIFJlbW92ZSBhbGwgZXZlbnRzIGF0IHRoaXMgcGF0aCBvciBiZWxvdyBpdFxuICAgICAgZm9yRWFjaChlbnRpdHlIYW5kbGVycywgZnVuY3Rpb24gKGZuLCBoYW5kbGVyUGF0aCkge1xuICAgICAgICBpZiAoaGFuZGxlclBhdGggPT09IHBhdGggfHwgaXNXaXRoaW5QYXRoKHBhdGgsIGhhbmRsZXJQYXRoKSkge1xuICAgICAgICAgIHJlbW92ZUV2ZW50KGVudGl0eUlkLCBoYW5kbGVyUGF0aClcbiAgICAgICAgfVxuICAgICAgfSlcbiAgICB9XG5cbiAgICAvLyBSZW1vdmUgdGhlIHBhdGhzIGZyb20gdGhlIG9iamVjdCB3aXRob3V0IHRvdWNoaW5nIHRoZVxuICAgIC8vIG9sZCBvYmplY3QuIFRoaXMga2VlcHMgdGhlIG9iamVjdCB1c2luZyBmYXN0IHByb3BlcnRpZXMuXG4gICAgZm9yRWFjaChyZW1vdmFscywgZnVuY3Rpb24gKHBhdGgpIHtcbiAgICAgIGRlbGV0ZSBjaGlsZHJlbltlbnRpdHlJZF1bcGF0aF1cbiAgICB9KVxuXG4gICAgLy8gUmVtb3ZlIGl0IGZyb20gdGhlIERPTVxuICAgIGVsLnBhcmVudE5vZGUucmVtb3ZlQ2hpbGQoZWwpXG5cbiAgICAvLyBSZXR1cm4gYWxsIG9mIHRoZSBlbGVtZW50cyBpbiB0aGlzIG5vZGUgdHJlZSB0byB0aGUgcG9vbFxuICAgIC8vIHNvIHRoYXQgdGhlIGVsZW1lbnRzIGNhbiBiZSByZS11c2VkLlxuICAgIGlmIChvcHRpb25zLnBvb2xpbmcpIHtcbiAgICAgIHdhbGsoZWwsIGZ1bmN0aW9uIChub2RlKSB7XG4gICAgICAgIGlmICghaXNFbGVtZW50KG5vZGUpIHx8ICFjYW5Qb29sKG5vZGUudGFnTmFtZSkpIHJldHVyblxuICAgICAgICBnZXRQb29sKG5vZGUudGFnTmFtZS50b0xvd2VyQ2FzZSgpKS5wdXNoKG5vZGUpXG4gICAgICB9KVxuICAgIH1cbiAgfVxuXG4gIC8qKlxuICAgKiBSZXBsYWNlIGFuIGVsZW1lbnQgaW4gdGhlIERPTS4gUmVtb3ZpbmcgYWxsIGNvbXBvbmVudHNcbiAgICogd2l0aGluIHRoYXQgZWxlbWVudCBhbmQgcmUtcmVuZGVyaW5nIHRoZSBuZXcgdmlydHVhbCBub2RlLlxuICAgKlxuICAgKiBAcGFyYW0ge0VudGl0eX0gZW50aXR5XG4gICAqIEBwYXJhbSB7U3RyaW5nfSBwYXRoXG4gICAqIEBwYXJhbSB7SFRNTEVsZW1lbnR9IGVsXG4gICAqIEBwYXJhbSB7T2JqZWN0fSB2bm9kZVxuICAgKlxuICAgKiBAcmV0dXJuIHt2b2lkfVxuICAgKi9cblxuICBmdW5jdGlvbiByZXBsYWNlRWxlbWVudCAoZW50aXR5SWQsIHBhdGgsIGVsLCB2bm9kZSkge1xuICAgIHZhciBwYXJlbnQgPSBlbC5wYXJlbnROb2RlXG4gICAgdmFyIGluZGV4ID0gQXJyYXkucHJvdG90eXBlLmluZGV4T2YuY2FsbChwYXJlbnQuY2hpbGROb2RlcywgZWwpXG5cbiAgICAvLyByZW1vdmUgdGhlIHByZXZpb3VzIGVsZW1lbnQgYW5kIGFsbCBuZXN0ZWQgY29tcG9uZW50cy4gVGhpc1xuICAgIC8vIG5lZWRzIHRvIGhhcHBlbiBiZWZvcmUgd2UgY3JlYXRlIHRoZSBuZXcgZWxlbWVudCBzbyB3ZSBkb24ndFxuICAgIC8vIGdldCBjbGFzaGVzIG9uIHRoZSBjb21wb25lbnQgcGF0aHMuXG4gICAgcmVtb3ZlRWxlbWVudChlbnRpdHlJZCwgcGF0aCwgZWwpXG5cbiAgICAvLyB0aGVuIGFkZCB0aGUgbmV3IGVsZW1lbnQgaW4gdGhlcmVcbiAgICB2YXIgbmV3RWwgPSB0b05hdGl2ZShlbnRpdHlJZCwgcGF0aCwgdm5vZGUpXG4gICAgdmFyIHRhcmdldCA9IHBhcmVudC5jaGlsZE5vZGVzW2luZGV4XVxuXG4gICAgaWYgKHRhcmdldCkge1xuICAgICAgcGFyZW50Lmluc2VydEJlZm9yZShuZXdFbCwgdGFyZ2V0KVxuICAgIH0gZWxzZSB7XG4gICAgICBwYXJlbnQuYXBwZW5kQ2hpbGQobmV3RWwpXG4gICAgfVxuXG4gICAgLy8gdXBkYXRlIGFsbCBgZW50aXR5Lm5hdGl2ZUVsZW1lbnRgIHJlZmVyZW5jZXMuXG4gICAgZm9yRWFjaChlbnRpdGllcywgZnVuY3Rpb24gKGVudGl0eSkge1xuICAgICAgaWYgKGVudGl0eS5uYXRpdmVFbGVtZW50ID09PSBlbCkge1xuICAgICAgICBlbnRpdHkubmF0aXZlRWxlbWVudCA9IG5ld0VsXG4gICAgICB9XG4gICAgfSlcblxuICAgIHJldHVybiBuZXdFbFxuICB9XG5cbiAgLyoqXG4gICAqIFNldCB0aGUgYXR0cmlidXRlIG9mIGFuIGVsZW1lbnQsIHBlcmZvcm1pbmcgYWRkaXRpb25hbCB0cmFuc2Zvcm1hdGlvbnNcbiAgICogZGVwZW5kbmluZyBvbiB0aGUgYXR0cmlidXRlIG5hbWVcbiAgICpcbiAgICogQHBhcmFtIHtIVE1MRWxlbWVudH0gZWxcbiAgICogQHBhcmFtIHtTdHJpbmd9IG5hbWVcbiAgICogQHBhcmFtIHtTdHJpbmd9IHZhbHVlXG4gICAqL1xuXG4gIGZ1bmN0aW9uIHNldEF0dHJpYnV0ZSAoZW50aXR5SWQsIHBhdGgsIGVsLCBuYW1lLCB2YWx1ZSkge1xuICAgIGlmIChldmVudHNbbmFtZV0pIHtcbiAgICAgIGFkZEV2ZW50KGVudGl0eUlkLCBwYXRoLCBldmVudHNbbmFtZV0sIHZhbHVlKVxuICAgICAgcmV0dXJuXG4gICAgfVxuICAgIHN3aXRjaCAobmFtZSkge1xuICAgICAgY2FzZSAndmFsdWUnOlxuICAgICAgICBlbC52YWx1ZSA9IHZhbHVlXG4gICAgICAgIGJyZWFrXG4gICAgICBjYXNlICdpbm5lckhUTUwnOlxuICAgICAgICBlbC5pbm5lckhUTUwgPSB2YWx1ZVxuICAgICAgICBicmVha1xuICAgICAgY2FzZSBzdmcuaXNBdHRyaWJ1dGUobmFtZSk6XG4gICAgICAgIGVsLnNldEF0dHJpYnV0ZU5TKHN2Zy5uYW1lc3BhY2UsIG5hbWUsIHZhbHVlKVxuICAgICAgICBicmVha1xuICAgICAgZGVmYXVsdDpcbiAgICAgICAgZWwuc2V0QXR0cmlidXRlKG5hbWUsIHZhbHVlKVxuICAgICAgICBicmVha1xuICAgIH1cbiAgfVxuXG4gIC8qKlxuICAgKiBSZW1vdmUgYW4gYXR0cmlidXRlLCBwZXJmb3JtaW5nIGFkZGl0aW9uYWwgdHJhbnNmb3JtYXRpb25zXG4gICAqIGRlcGVuZG5pbmcgb24gdGhlIGF0dHJpYnV0ZSBuYW1lXG4gICAqXG4gICAqIEBwYXJhbSB7SFRNTEVsZW1lbnR9IGVsXG4gICAqIEBwYXJhbSB7U3RyaW5nfSBuYW1lXG4gICAqL1xuXG4gIGZ1bmN0aW9uIHJlbW92ZUF0dHJpYnV0ZSAoZW50aXR5SWQsIHBhdGgsIGVsLCBuYW1lKSB7XG4gICAgaWYgKGV2ZW50c1tuYW1lXSkge1xuICAgICAgcmVtb3ZlRXZlbnQoZW50aXR5SWQsIHBhdGgsIGV2ZW50c1tuYW1lXSlcbiAgICAgIHJldHVyblxuICAgIH1cbiAgICBlbC5yZW1vdmVBdHRyaWJ1dGUobmFtZSlcbiAgfVxuXG4gIC8qKlxuICAgKiBDaGVja3MgdG8gc2VlIGlmIG9uZSB0cmVlIHBhdGggaXMgd2l0aGluXG4gICAqIGFub3RoZXIgdHJlZSBwYXRoLiBFeGFtcGxlOlxuICAgKlxuICAgKiAwLjEgdnMgMC4xLjEgPSB0cnVlXG4gICAqIDAuMiB2cyAwLjMuNSA9IGZhbHNlXG4gICAqXG4gICAqIEBwYXJhbSB7U3RyaW5nfSB0YXJnZXRcbiAgICogQHBhcmFtIHtTdHJpbmd9IHBhdGhcbiAgICpcbiAgICogQHJldHVybiB7Qm9vbGVhbn1cbiAgICovXG5cbiAgZnVuY3Rpb24gaXNXaXRoaW5QYXRoICh0YXJnZXQsIHBhdGgpIHtcbiAgICByZXR1cm4gcGF0aC5pbmRleE9mKHRhcmdldCArICcuJykgPT09IDBcbiAgfVxuXG4gIC8qKlxuICAgKiBJcyB0aGUgRE9NIG5vZGUgYW4gZWxlbWVudCBub2RlXG4gICAqXG4gICAqIEBwYXJhbSB7SFRNTEVsZW1lbnR9IGVsXG4gICAqXG4gICAqIEByZXR1cm4ge0Jvb2xlYW59XG4gICAqL1xuXG4gIGZ1bmN0aW9uIGlzRWxlbWVudCAoZWwpIHtcbiAgICByZXR1cm4gISFlbC50YWdOYW1lXG4gIH1cblxuICAvKipcbiAgICogR2V0IHRoZSBwb29sIGZvciBhIHRhZ05hbWUsIGNyZWF0aW5nIGl0IGlmIGl0XG4gICAqIGRvZXNuJ3QgZXhpc3QuXG4gICAqXG4gICAqIEBwYXJhbSB7U3RyaW5nfSB0YWdOYW1lXG4gICAqXG4gICAqIEByZXR1cm4ge1Bvb2x9XG4gICAqL1xuXG4gIGZ1bmN0aW9uIGdldFBvb2wgKHRhZ05hbWUpIHtcbiAgICB2YXIgcG9vbCA9IHBvb2xzW3RhZ05hbWVdXG4gICAgaWYgKCFwb29sKSB7XG4gICAgICB2YXIgcG9vbE9wdHMgPSBzdmcuaXNFbGVtZW50KHRhZ05hbWUpID9cbiAgICAgICAgeyBuYW1lc3BhY2U6IHN2Zy5uYW1lc3BhY2UsIHRhZ05hbWU6IHRhZ05hbWUgfSA6XG4gICAgICAgIHsgdGFnTmFtZTogdGFnTmFtZSB9XG4gICAgICBwb29sID0gcG9vbHNbdGFnTmFtZV0gPSBuZXcgUG9vbChwb29sT3B0cylcbiAgICB9XG4gICAgcmV0dXJuIHBvb2xcbiAgfVxuXG4gIC8qKlxuICAgKiBDbGVhbiB1cCBwcmV2aW91c2x5IHVzZWQgbmF0aXZlIGVsZW1lbnQgZm9yIHJldXNlLlxuICAgKlxuICAgKiBAcGFyYW0ge0hUTUxFbGVtZW50fSBlbFxuICAgKi9cblxuICBmdW5jdGlvbiBjbGVhbnVwIChlbCkge1xuICAgIHJlbW92ZUFsbENoaWxkcmVuKGVsKVxuICAgIHJlbW92ZUFsbEF0dHJpYnV0ZXMoZWwpXG4gICAgcmV0dXJuIGVsXG4gIH1cblxuICAvKipcbiAgICogUmVtb3ZlIGFsbCB0aGUgYXR0cmlidXRlcyBmcm9tIGEgbm9kZVxuICAgKlxuICAgKiBAcGFyYW0ge0hUTUxFbGVtZW50fSBlbFxuICAgKi9cblxuICBmdW5jdGlvbiByZW1vdmVBbGxBdHRyaWJ1dGVzIChlbCkge1xuICAgIGZvciAodmFyIGkgPSBlbC5hdHRyaWJ1dGVzLmxlbmd0aCAtIDE7IGkgPj0gMDsgaS0tKSB7XG4gICAgICB2YXIgbmFtZSA9IGVsLmF0dHJpYnV0ZXNbaV0ubmFtZVxuICAgICAgZWwucmVtb3ZlQXR0cmlidXRlKG5hbWUpXG4gICAgfVxuICB9XG5cbiAgLyoqXG4gICAqIFJlbW92ZSBhbGwgdGhlIGNoaWxkIG5vZGVzIGZyb20gYW4gZWxlbWVudFxuICAgKlxuICAgKiBAcGFyYW0ge0hUTUxFbGVtZW50fSBlbFxuICAgKi9cblxuICBmdW5jdGlvbiByZW1vdmVBbGxDaGlsZHJlbiAoZWwpIHtcbiAgICB3aGlsZSAoZWwuZmlyc3RDaGlsZCkgZWwucmVtb3ZlQ2hpbGQoZWwuZmlyc3RDaGlsZClcbiAgfVxuXG4gIC8qKlxuICAgKiBUcmlnZ2VyIGEgaG9vayBvbiBhIGNvbXBvbmVudC5cbiAgICpcbiAgICogQHBhcmFtIHtTdHJpbmd9IG5hbWUgTmFtZSBvZiBob29rLlxuICAgKiBAcGFyYW0ge0VudGl0eX0gZW50aXR5IFRoZSBjb21wb25lbnQgaW5zdGFuY2UuXG4gICAqIEBwYXJhbSB7QXJyYXl9IGFyZ3MgVG8gcGFzcyBhbG9uZyB0byBob29rLlxuICAgKi9cblxuICBmdW5jdGlvbiB0cmlnZ2VyIChuYW1lLCBlbnRpdHksIGFyZ3MpIHtcbiAgICBpZiAodHlwZW9mIGVudGl0eS5jb21wb25lbnRbbmFtZV0gIT09ICdmdW5jdGlvbicpIHJldHVyblxuICAgIGVudGl0eS5jb21wb25lbnRbbmFtZV0uYXBwbHkobnVsbCwgYXJncylcbiAgfVxuXG4gIC8qKlxuICAgKiBVcGRhdGUgYW4gZW50aXR5IHRvIG1hdGNoIHRoZSBsYXRlc3QgcmVuZGVyZWQgdm9kZS4gV2UgYWx3YXlzXG4gICAqIHJlcGxhY2UgdGhlIHByb3BzIG9uIHRoZSBjb21wb25lbnQgd2hlbiBjb21wb3NpbmcgdGhlbS4gVGhpc1xuICAgKiB3aWxsIHRyaWdnZXIgYSByZS1yZW5kZXIgb24gYWxsIGNoaWxkcmVuIGJlbG93IHRoaXMgcG9pbnQuXG4gICAqXG4gICAqIEBwYXJhbSB7RW50aXR5fSBlbnRpdHlcbiAgICogQHBhcmFtIHtTdHJpbmd9IHBhdGhcbiAgICogQHBhcmFtIHtPYmplY3R9IHZub2RlXG4gICAqXG4gICAqIEByZXR1cm4ge3ZvaWR9XG4gICAqL1xuXG4gIGZ1bmN0aW9uIHVwZGF0ZUVudGl0eVByb3BzIChlbnRpdHlJZCwgbmV4dFByb3BzKSB7XG4gICAgdmFyIGVudGl0eSA9IGVudGl0aWVzW2VudGl0eUlkXVxuICAgIGVudGl0eS5wZW5kaW5nUHJvcHMgPSBuZXh0UHJvcHNcbiAgICBlbnRpdHkuZGlydHkgPSB0cnVlXG4gICAgaW52YWxpZGF0ZSgpXG4gIH1cblxuICAvKipcbiAgICogVXBkYXRlIGNvbXBvbmVudCBpbnN0YW5jZSBzdGF0ZS5cbiAgICovXG5cbiAgZnVuY3Rpb24gdXBkYXRlRW50aXR5U3RhdGUgKGVudGl0eSwgbmV4dFN0YXRlKSB7XG4gICAgZW50aXR5LnBlbmRpbmdTdGF0ZSA9IGFzc2lnbihlbnRpdHkucGVuZGluZ1N0YXRlLCBuZXh0U3RhdGUpXG4gICAgZW50aXR5LmRpcnR5ID0gdHJ1ZVxuICAgIGludmFsaWRhdGUoKVxuICB9XG5cbiAgLyoqXG4gICAqIENvbW1pdCBwcm9wcyBhbmQgc3RhdGUgY2hhbmdlcyB0byBhbiBlbnRpdHkuXG4gICAqL1xuXG4gIGZ1bmN0aW9uIGNvbW1pdCAoZW50aXR5KSB7XG4gICAgZW50aXR5LmNvbnRleHQgPSB7XG4gICAgICBzdGF0ZTogZW50aXR5LnBlbmRpbmdTdGF0ZSxcbiAgICAgIHByb3BzOiBlbnRpdHkucGVuZGluZ1Byb3BzLFxuICAgICAgaWQ6IGVudGl0eS5pZFxuICAgIH1cbiAgICBlbnRpdHkucGVuZGluZ1N0YXRlID0gYXNzaWduKHt9LCBlbnRpdHkuY29udGV4dC5zdGF0ZSlcbiAgICBlbnRpdHkucGVuZGluZ1Byb3BzID0gYXNzaWduKHt9LCBlbnRpdHkuY29udGV4dC5wcm9wcylcbiAgICB2YWxpZGF0ZVByb3BzKGVudGl0eS5jb250ZXh0LnByb3BzLCBlbnRpdHkucHJvcFR5cGVzKVxuICAgIGVudGl0eS5kaXJ0eSA9IGZhbHNlXG4gIH1cblxuICAvKipcbiAgICogVHJ5IHRvIGF2b2lkIGNyZWF0aW5nIG5ldyB2aXJ0dWFsIGRvbSBpZiBwb3NzaWJsZS5cbiAgICpcbiAgICogTGF0ZXIgd2UgbWF5IGV4cG9zZSB0aGlzIHNvIHlvdSBjYW4gb3ZlcnJpZGUsIGJ1dCBub3QgdGhlcmUgeWV0LlxuICAgKi9cblxuICBmdW5jdGlvbiBzaG91bGRVcGRhdGUgKGVudGl0eSkge1xuICAgIGlmICghZW50aXR5LmRpcnR5KSByZXR1cm4gZmFsc2VcbiAgICBpZiAoIWVudGl0eS5jb21wb25lbnQuc2hvdWxkVXBkYXRlKSByZXR1cm4gdHJ1ZVxuICAgIHZhciBuZXh0UHJvcHMgPSBlbnRpdHkucGVuZGluZ1Byb3BzXG4gICAgdmFyIG5leHRTdGF0ZSA9IGVudGl0eS5wZW5kaW5nU3RhdGVcbiAgICB2YXIgYm9vbCA9IGVudGl0eS5jb21wb25lbnQuc2hvdWxkVXBkYXRlKGVudGl0eS5jb250ZXh0LCBuZXh0UHJvcHMsIG5leHRTdGF0ZSlcbiAgICByZXR1cm4gYm9vbFxuICB9XG5cbiAgLyoqXG4gICAqIFJlZ2lzdGVyIGFuIGVudGl0eS5cbiAgICpcbiAgICogVGhpcyBpcyBtb3N0bHkgdG8gcHJlLXByZXByb2Nlc3MgY29tcG9uZW50IHByb3BlcnRpZXMgYW5kIHZhbHVlcyBjaGFpbnMuXG4gICAqXG4gICAqIFRoZSBlbmQgcmVzdWx0IGlzIGZvciBldmVyeSBjb21wb25lbnQgdGhhdCBnZXRzIG1vdW50ZWQsXG4gICAqIHlvdSBjcmVhdGUgYSBzZXQgb2YgSU8gbm9kZXMgaW4gdGhlIG5ldHdvcmsgZnJvbSB0aGUgYHZhbHVlYCBkZWZpbml0aW9ucy5cbiAgICpcbiAgICogQHBhcmFtIHtDb21wb25lbnR9IGNvbXBvbmVudFxuICAgKi9cblxuICBmdW5jdGlvbiByZWdpc3RlciAoZW50aXR5KSB7XG4gICAgdmFyIGNvbXBvbmVudCA9IGVudGl0eS5jb21wb25lbnRcbiAgICAvLyBhbGwgZW50aXRpZXMgZm9yIHRoaXMgY29tcG9uZW50IHR5cGUuXG4gICAgdmFyIGVudGl0aWVzID0gY29tcG9uZW50LmVudGl0aWVzID0gY29tcG9uZW50LmVudGl0aWVzIHx8IHt9XG4gICAgLy8gYWRkIGVudGl0eSB0byBjb21wb25lbnQgbGlzdFxuICAgIGVudGl0aWVzW2VudGl0eS5pZF0gPSBlbnRpdHlcblxuICAgIC8vIGdldCAnY2xhc3MtbGV2ZWwnIHNvdXJjZXMuXG4gICAgdmFyIHNvdXJjZXMgPSBjb21wb25lbnQuc291cmNlc1xuICAgIGlmIChzb3VyY2VzKSByZXR1cm5cblxuICAgIHZhciBtYXAgPSBjb21wb25lbnQuc291cmNlVG9Qcm9wZXJ0eU5hbWUgPSB7fVxuICAgIGNvbXBvbmVudC5zb3VyY2VzID0gc291cmNlcyA9IFtdXG4gICAgdmFyIHByb3BUeXBlcyA9IGNvbXBvbmVudC5wcm9wVHlwZXNcbiAgICBmb3IgKHZhciBuYW1lIGluIHByb3BUeXBlcykge1xuICAgICAgdmFyIGRhdGEgPSBwcm9wVHlwZXNbbmFtZV1cbiAgICAgIGlmICghZGF0YSkgY29udGludWVcbiAgICAgIGlmICghZGF0YS5zb3VyY2UpIGNvbnRpbnVlXG4gICAgICBzb3VyY2VzLnB1c2goZGF0YS5zb3VyY2UpXG4gICAgICBtYXBbZGF0YS5zb3VyY2VdID0gbmFtZVxuICAgIH1cblxuICAgIC8vIHNlbmQgdmFsdWUgdXBkYXRlcyB0byBhbGwgY29tcG9uZW50IGluc3RhbmNlcy5cbiAgICBzb3VyY2VzLmZvckVhY2goZnVuY3Rpb24gKHNvdXJjZSkge1xuICAgICAgY29ubmVjdGlvbnNbc291cmNlXSA9IHVwZGF0ZVxuXG4gICAgICBmdW5jdGlvbiB1cGRhdGUgKGRhdGEpIHtcbiAgICAgICAgdmFyIHByb3AgPSBtYXBbc291cmNlXVxuICAgICAgICBmb3IgKHZhciBlbnRpdHlJZCBpbiBlbnRpdGllcykge1xuICAgICAgICAgIHZhciBlbnRpdHkgPSBlbnRpdGllc1tlbnRpdHlJZF1cbiAgICAgICAgICB2YXIgY2hhbmdlcyA9IHt9XG4gICAgICAgICAgY2hhbmdlc1twcm9wXSA9IGRhdGFcbiAgICAgICAgICB1cGRhdGVFbnRpdHlQcm9wcyhlbnRpdHlJZCwgYXNzaWduKGVudGl0eS5wZW5kaW5nUHJvcHMsIGNoYW5nZXMpKVxuICAgICAgICB9XG4gICAgICB9XG4gICAgfSlcbiAgfVxuXG4gIC8qKlxuICAgKiBTZXQgdGhlIGluaXRpYWwgc291cmNlIHZhbHVlIG9uIHRoZSBlbnRpdHlcbiAgICpcbiAgICogQHBhcmFtIHtFbnRpdHl9IGVudGl0eVxuICAgKi9cblxuICBmdW5jdGlvbiBzZXRTb3VyY2VzIChlbnRpdHkpIHtcbiAgICB2YXIgY29tcG9uZW50ID0gZW50aXR5LmNvbXBvbmVudFxuICAgIHZhciBtYXAgPSBjb21wb25lbnQuc291cmNlVG9Qcm9wZXJ0eU5hbWVcbiAgICB2YXIgc291cmNlcyA9IGNvbXBvbmVudC5zb3VyY2VzXG4gICAgc291cmNlcy5mb3JFYWNoKGZ1bmN0aW9uIChzb3VyY2UpIHtcbiAgICAgIHZhciBuYW1lID0gbWFwW3NvdXJjZV1cbiAgICAgIGlmIChlbnRpdHkucGVuZGluZ1Byb3BzW25hbWVdICE9IG51bGwpIHJldHVyblxuICAgICAgZW50aXR5LnBlbmRpbmdQcm9wc1tuYW1lXSA9IGFwcC5zb3VyY2VzW3NvdXJjZV0gLy8gZ2V0IGxhdGVzdCB2YWx1ZSBwbHVnZ2VkIGludG8gZ2xvYmFsIHN0b3JlXG4gICAgfSlcbiAgfVxuXG4gIC8qKlxuICAgKiBBZGQgYWxsIG9mIHRoZSBET00gZXZlbnQgbGlzdGVuZXJzXG4gICAqL1xuXG4gIGZ1bmN0aW9uIGFkZE5hdGl2ZUV2ZW50TGlzdGVuZXJzICgpIHtcbiAgICBmb3JFYWNoKGV2ZW50cywgZnVuY3Rpb24gKGV2ZW50VHlwZSkge1xuICAgICAgZG9jdW1lbnQuYm9keS5hZGRFdmVudExpc3RlbmVyKGV2ZW50VHlwZSwgaGFuZGxlRXZlbnQsIHRydWUpXG4gICAgfSlcbiAgfVxuXG4gIC8qKlxuICAgKiBBZGQgYWxsIG9mIHRoZSBET00gZXZlbnQgbGlzdGVuZXJzXG4gICAqL1xuXG4gIGZ1bmN0aW9uIHJlbW92ZU5hdGl2ZUV2ZW50TGlzdGVuZXJzICgpIHtcbiAgICBmb3JFYWNoKGV2ZW50cywgZnVuY3Rpb24gKGV2ZW50VHlwZSkge1xuICAgICAgZG9jdW1lbnQuYm9keS5yZW1vdmVFdmVudExpc3RlbmVyKGV2ZW50VHlwZSwgaGFuZGxlRXZlbnQsIHRydWUpXG4gICAgfSlcbiAgfVxuXG4gIC8qKlxuICAgKiBIYW5kbGUgYW4gZXZlbnQgdGhhdCBoYXMgb2NjdXJlZCB3aXRoaW4gdGhlIGNvbnRhaW5lclxuICAgKlxuICAgKiBAcGFyYW0ge0V2ZW50fSBldmVudFxuICAgKi9cblxuICBmdW5jdGlvbiBoYW5kbGVFdmVudCAoZXZlbnQpIHtcbiAgICB2YXIgdGFyZ2V0ID0gZXZlbnQudGFyZ2V0XG4gICAgdmFyIGVudGl0eUlkID0gdGFyZ2V0Ll9fZW50aXR5X19cbiAgICB2YXIgZXZlbnRUeXBlID0gZXZlbnQudHlwZVxuXG4gICAgLy8gV2FsayB1cCB0aGUgRE9NIHRyZWUgYW5kIHNlZSBpZiB0aGVyZSBpcyBhIGhhbmRsZXJcbiAgICAvLyBmb3IgdGhpcyBldmVudCB0eXBlIGhpZ2hlciB1cC5cbiAgICB3aGlsZSAodGFyZ2V0ICYmIHRhcmdldC5fX2VudGl0eV9fID09PSBlbnRpdHlJZCkge1xuICAgICAgdmFyIGZuID0ga2V5cGF0aC5nZXQoaGFuZGxlcnMsIFtlbnRpdHlJZCwgdGFyZ2V0Ll9fcGF0aF9fLCBldmVudFR5cGVdKVxuICAgICAgaWYgKGZuKSB7XG4gICAgICAgIGV2ZW50LmRlbGVnYXRlVGFyZ2V0ID0gdGFyZ2V0XG4gICAgICAgIGZuKGV2ZW50KVxuICAgICAgICBicmVha1xuICAgICAgfVxuICAgICAgdGFyZ2V0ID0gdGFyZ2V0LnBhcmVudE5vZGVcbiAgICB9XG4gIH1cblxuICAvKipcbiAgICogQmluZCBldmVudHMgZm9yIGFuIGVsZW1lbnQsIGFuZCBhbGwgaXQncyByZW5kZXJlZCBjaGlsZCBlbGVtZW50cy5cbiAgICpcbiAgICogQHBhcmFtIHtTdHJpbmd9IHBhdGhcbiAgICogQHBhcmFtIHtTdHJpbmd9IGV2ZW50XG4gICAqIEBwYXJhbSB7RnVuY3Rpb259IGZuXG4gICAqL1xuXG4gIGZ1bmN0aW9uIGFkZEV2ZW50IChlbnRpdHlJZCwgcGF0aCwgZXZlbnRUeXBlLCBmbikge1xuICAgIGtleXBhdGguc2V0KGhhbmRsZXJzLCBbZW50aXR5SWQsIHBhdGgsIGV2ZW50VHlwZV0sIHRocm90dGxlKGZ1bmN0aW9uIChlKSB7XG4gICAgICB2YXIgZW50aXR5ID0gZW50aXRpZXNbZW50aXR5SWRdXG4gICAgICBpZiAoZW50aXR5KSB7XG4gICAgICAgIGZuLmNhbGwobnVsbCwgZSwgZW50aXR5LmNvbnRleHQsIHNldFN0YXRlKGVudGl0eSkpXG4gICAgICB9IGVsc2Uge1xuICAgICAgICBmbi5jYWxsKG51bGwsIGUpXG4gICAgICB9XG4gICAgfSkpXG4gIH1cblxuICAvKipcbiAgICogVW5iaW5kIGV2ZW50cyBmb3IgYSBlbnRpdHlJZFxuICAgKlxuICAgKiBAcGFyYW0ge1N0cmluZ30gZW50aXR5SWRcbiAgICovXG5cbiAgZnVuY3Rpb24gcmVtb3ZlRXZlbnQgKGVudGl0eUlkLCBwYXRoLCBldmVudFR5cGUpIHtcbiAgICB2YXIgYXJncyA9IFtlbnRpdHlJZF1cbiAgICBpZiAocGF0aCkgYXJncy5wdXNoKHBhdGgpXG4gICAgaWYgKGV2ZW50VHlwZSkgYXJncy5wdXNoKGV2ZW50VHlwZSlcbiAgICBrZXlwYXRoLmRlbChoYW5kbGVycywgYXJncylcbiAgfVxuXG4gIC8qKlxuICAgKiBVbmJpbmQgYWxsIGV2ZW50cyBmcm9tIGFuIGVudGl0eVxuICAgKlxuICAgKiBAcGFyYW0ge0VudGl0eX0gZW50aXR5XG4gICAqL1xuXG4gIGZ1bmN0aW9uIHJlbW92ZUFsbEV2ZW50cyAoZW50aXR5SWQpIHtcbiAgICBrZXlwYXRoLmRlbChoYW5kbGVycywgW2VudGl0eUlkXSlcbiAgfVxuXG4gIC8qKlxuICAgKiBWYWxpZGF0ZSB0aGUgY3VycmVudCBwcm9wZXJ0aWVzLiBUaGVzZSBzaW1wbGUgdmFsaWRhdGlvbnNcbiAgICogbWFrZSBpdCBlYXNpZXIgdG8gZW5zdXJlIHRoZSBjb3JyZWN0IHByb3BzIGFyZSBwYXNzZWQgaW4uXG4gICAqXG4gICAqIEF2YWlsYWJsZSBydWxlcyBpbmNsdWRlOlxuICAgKlxuICAgKiB0eXBlOiBzdHJpbmcgfCBhcnJheSB8IG9iamVjdCB8IGJvb2xlYW4gfCBudW1iZXIgfCBkYXRlIHwgZnVuY3Rpb25cbiAgICogZXhwZWN0czogW10gQW4gYXJyYXkgb2YgdmFsdWVzIHRoaXMgcHJvcCBjb3VsZCBlcXVhbFxuICAgKiBvcHRpb25hbDogQm9vbGVhblxuICAgKi9cblxuICBmdW5jdGlvbiB2YWxpZGF0ZVByb3BzIChwcm9wcywgcnVsZXMpIHtcbiAgICBpZiAoIW9wdGlvbnMudmFsaWRhdGVQcm9wcykgcmV0dXJuXG5cbiAgICAvLyBUT0RPOiBPbmx5IHZhbGlkYXRlIGluIGRldiBtb2RlXG4gICAgZm9yRWFjaChydWxlcywgZnVuY3Rpb24gKG9wdGlvbnMsIG5hbWUpIHtcbiAgICAgIGlmIChuYW1lID09PSAnY2hpbGRyZW4nKSByZXR1cm5cbiAgICAgIHZhciB2YWx1ZSA9IHByb3BzW25hbWVdXG4gICAgICB2YXIgb3B0aW9uYWwgPSAob3B0aW9ucy5vcHRpb25hbCA9PT0gdHJ1ZSlcbiAgICAgIGlmIChvcHRpb25hbCAmJiB2YWx1ZSA9PSBudWxsKSB7XG4gICAgICAgIHJldHVyblxuICAgICAgfVxuICAgICAgaWYgKCFvcHRpb25hbCAmJiB2YWx1ZSA9PSBudWxsKSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcignTWlzc2luZyBwcm9wIG5hbWVkOiAnICsgbmFtZSlcbiAgICAgIH1cbiAgICAgIGlmIChvcHRpb25zLnR5cGUgJiYgdHlwZSh2YWx1ZSkgIT09IG9wdGlvbnMudHlwZSkge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ0ludmFsaWQgdHlwZSBmb3IgcHJvcCBuYW1lZDogJyArIG5hbWUpXG4gICAgICB9XG4gICAgICBpZiAob3B0aW9ucy5leHBlY3RzICYmIG9wdGlvbnMuZXhwZWN0cy5pbmRleE9mKHZhbHVlKSA8IDApIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdJbnZhbGlkIHZhbHVlIGZvciBwcm9wIG5hbWVkOiAnICsgbmFtZSArICcuIE11c3QgYmUgb25lIG9mICcgKyBvcHRpb25zLmV4cGVjdHMudG9TdHJpbmcoKSlcbiAgICAgIH1cbiAgICB9KVxuXG4gICAgLy8gTm93IGNoZWNrIGZvciBwcm9wcyB0aGF0IGhhdmVuJ3QgYmVlbiBkZWZpbmVkXG4gICAgZm9yRWFjaChwcm9wcywgZnVuY3Rpb24gKHZhbHVlLCBrZXkpIHtcbiAgICAgIGlmIChrZXkgPT09ICdjaGlsZHJlbicpIHJldHVyblxuICAgICAgaWYgKCFydWxlc1trZXldKSB0aHJvdyBuZXcgRXJyb3IoJ1VuZXhwZWN0ZWQgcHJvcCBuYW1lZDogJyArIGtleSlcbiAgICB9KVxuICB9XG5cbiAgLyoqXG4gICAqIFVzZWQgZm9yIGRlYnVnZ2luZyB0byBpbnNwZWN0IHRoZSBjdXJyZW50IHN0YXRlIHdpdGhvdXRcbiAgICogdXMgbmVlZGluZyB0byBleHBsaWNpdGx5IG1hbmFnZSBzdG9yaW5nL3VwZGF0aW5nIHJlZmVyZW5jZXMuXG4gICAqXG4gICAqIEByZXR1cm4ge09iamVjdH1cbiAgICovXG5cbiAgZnVuY3Rpb24gaW5zcGVjdCAoKSB7XG4gICAgcmV0dXJuIHtcbiAgICAgIGVudGl0aWVzOiBlbnRpdGllcyxcbiAgICAgIHBvb2xzOiBwb29scyxcbiAgICAgIGhhbmRsZXJzOiBoYW5kbGVycyxcbiAgICAgIGNvbm5lY3Rpb25zOiBjb25uZWN0aW9ucyxcbiAgICAgIGN1cnJlbnRFbGVtZW50OiBjdXJyZW50RWxlbWVudCxcbiAgICAgIG9wdGlvbnM6IG9wdGlvbnMsXG4gICAgICBhcHA6IGFwcCxcbiAgICAgIGNvbnRhaW5lcjogY29udGFpbmVyLFxuICAgICAgY2hpbGRyZW46IGNoaWxkcmVuXG4gICAgfVxuICB9XG5cbiAgLyoqXG4gICAqIFJldHVybiBhbiBvYmplY3QgdGhhdCBsZXRzIHVzIGNvbXBsZXRlbHkgcmVtb3ZlIHRoZSBhdXRvbWF0aWNcbiAgICogRE9NIHJlbmRlcmluZyBhbmQgZXhwb3J0IGRlYnVnZ2luZyB0b29scy5cbiAgICovXG5cbiAgcmV0dXJuIHtcbiAgICByZW1vdmU6IHRlYXJkb3duLFxuICAgIGluc3BlY3Q6IGluc3BlY3RcbiAgfVxufVxuXG4vKipcbiAqIEEgcmVuZGVyZWQgY29tcG9uZW50IGluc3RhbmNlLlxuICpcbiAqIFRoaXMgbWFuYWdlcyB0aGUgbGlmZWN5Y2xlLCBwcm9wcyBhbmQgc3RhdGUgb2YgdGhlIGNvbXBvbmVudC5cbiAqIEl0J3MgYmFzaWNhbGx5IGp1c3QgYSBkYXRhIG9iamVjdCBmb3IgbW9yZSBzdHJhaWdodGZvd2FyZCBsb29rdXAuXG4gKlxuICogQHBhcmFtIHtDb21wb25lbnR9IGNvbXBvbmVudFxuICogQHBhcmFtIHtPYmplY3R9IHByb3BzXG4gKi9cblxuZnVuY3Rpb24gRW50aXR5IChjb21wb25lbnQsIHByb3BzKSB7XG4gIHRoaXMuaWQgPSB1aWQoKVxuICB0aGlzLmNvbXBvbmVudCA9IGNvbXBvbmVudFxuICB0aGlzLnByb3BUeXBlcyA9IGNvbXBvbmVudC5wcm9wVHlwZXMgfHwge31cbiAgdGhpcy5jb250ZXh0ID0ge31cbiAgdGhpcy5jb250ZXh0LmlkID0gdGhpcy5pZDtcbiAgdGhpcy5jb250ZXh0LnByb3BzID0gZGVmYXVsdHMocHJvcHMgfHwge30sIGNvbXBvbmVudC5kZWZhdWx0UHJvcHMgfHwge30pXG4gIHRoaXMuY29udGV4dC5zdGF0ZSA9IHRoaXMuY29tcG9uZW50LmluaXRpYWxTdGF0ZSA/IHRoaXMuY29tcG9uZW50LmluaXRpYWxTdGF0ZSgpIDoge31cbiAgdGhpcy5wZW5kaW5nUHJvcHMgPSBhc3NpZ24oe30sIHRoaXMuY29udGV4dC5wcm9wcylcbiAgdGhpcy5wZW5kaW5nU3RhdGUgPSBhc3NpZ24oe30sIHRoaXMuY29udGV4dC5zdGF0ZSlcbiAgdGhpcy5kaXJ0eSA9IGZhbHNlXG4gIHRoaXMudmlydHVhbEVsZW1lbnQgPSBudWxsXG4gIHRoaXMubmF0aXZlRWxlbWVudCA9IG51bGxcbiAgdGhpcy5kaXNwbGF5TmFtZSA9IGNvbXBvbmVudC5uYW1lIHx8ICdDb21wb25lbnQnXG59XG5cbi8qKlxuICogU2hvdWxkIHdlIHBvb2wgYW4gZWxlbWVudD9cbiAqL1xuXG5mdW5jdGlvbiBjYW5Qb29sKHRhZ05hbWUpIHtcbiAgcmV0dXJuIGF2b2lkUG9vbGluZy5pbmRleE9mKHRhZ05hbWUpIDwgMFxufVxuXG4vKipcbiAqIEdldCBhIG5lc3RlZCBub2RlIHVzaW5nIGEgcGF0aFxuICpcbiAqIEBwYXJhbSB7SFRNTEVsZW1lbnR9IGVsICAgVGhlIHJvb3Qgbm9kZSAnMCdcbiAqIEBwYXJhbSB7U3RyaW5nfSBwYXRoIFRoZSBwYXRoIHN0cmluZyBlZy4gJzAuMi40MydcbiAqL1xuXG5mdW5jdGlvbiBnZXROb2RlQXRQYXRoKGVsLCBwYXRoKSB7XG4gIHZhciBwYXJ0cyA9IHBhdGguc3BsaXQoJy4nKVxuICBwYXJ0cy5zaGlmdCgpXG4gIHdoaWxlIChwYXJ0cy5sZW5ndGgpIHtcbiAgICBlbCA9IGVsLmNoaWxkTm9kZXNbcGFydHMucG9wKCldXG4gIH1cbiAgcmV0dXJuIGVsXG59XG4iLCJ2YXIgdXRpbHMgPSByZXF1aXJlKCcuL3V0aWxzJylcbnZhciBkZWZhdWx0cyA9IHV0aWxzLmRlZmF1bHRzXG5cbi8qKlxuICogRXhwb3NlIGBzdHJpbmdpZnlgLlxuICovXG5cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gKGFwcCkge1xuICBpZiAoIWFwcC5lbGVtZW50KSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKCdObyBlbGVtZW50IG1vdW50ZWQnKVxuICB9XG5cbiAgLyoqXG4gICAqIFJlbmRlciB0byBzdHJpbmcuXG4gICAqXG4gICAqIEBwYXJhbSB7Q29tcG9uZW50fSBjb21wb25lbnRcbiAgICogQHBhcmFtIHtPYmplY3R9IFtwcm9wc11cbiAgICogQHJldHVybiB7U3RyaW5nfVxuICAgKi9cblxuICBmdW5jdGlvbiBzdHJpbmdpZnkgKGNvbXBvbmVudCwgb3B0UHJvcHMpIHtcbiAgICB2YXIgcHJvcFR5cGVzID0gY29tcG9uZW50LnByb3BUeXBlcyB8fCB7fVxuICAgIHZhciBzdGF0ZSA9IGNvbXBvbmVudC5pbml0aWFsU3RhdGUgPyBjb21wb25lbnQuaW5pdGlhbFN0YXRlKCkgOiB7fVxuICAgIHZhciBwcm9wcyA9IGRlZmF1bHRzKG9wdFByb3BzLCBjb21wb25lbnQuZGVmYXVsdFByb3BzIHx8IHt9KVxuXG4gICAgZm9yICh2YXIgbmFtZSBpbiBwcm9wVHlwZXMpIHtcbiAgICAgIHZhciBvcHRpb25zID0gcHJvcFR5cGVzW25hbWVdXG4gICAgICBpZiAob3B0aW9ucy5zb3VyY2UpIHtcbiAgICAgICAgcHJvcHNbbmFtZV0gPSBhcHAuc291cmNlc1tvcHRpb25zLnNvdXJjZV1cbiAgICAgIH1cbiAgICB9XG5cbiAgICBpZiAoY29tcG9uZW50LmJlZm9yZU1vdW50KSBjb21wb25lbnQuYmVmb3JlTW91bnQoeyBwcm9wczogcHJvcHMsIHN0YXRlOiBzdGF0ZSB9KVxuICAgIGlmIChjb21wb25lbnQuYmVmb3JlUmVuZGVyKSBjb21wb25lbnQuYmVmb3JlUmVuZGVyKHsgcHJvcHM6IHByb3BzLCBzdGF0ZTogc3RhdGUgfSlcbiAgICB2YXIgbm9kZSA9IGNvbXBvbmVudC5yZW5kZXIoeyBwcm9wczogcHJvcHMsIHN0YXRlOiBzdGF0ZSB9KVxuICAgIHJldHVybiBzdHJpbmdpZnlOb2RlKG5vZGUsICcwJylcbiAgfVxuXG4gIC8qKlxuICAgKiBSZW5kZXIgYSBub2RlIHRvIGEgc3RyaW5nXG4gICAqXG4gICAqIEBwYXJhbSB7Tm9kZX0gbm9kZVxuICAgKiBAcGFyYW0ge1RyZWV9IHRyZWVcbiAgICpcbiAgICogQHJldHVybiB7U3RyaW5nfVxuICAgKi9cblxuICBmdW5jdGlvbiBzdHJpbmdpZnlOb2RlIChub2RlLCBwYXRoKSB7XG4gICAgc3dpdGNoIChub2RlLnR5cGUpIHtcbiAgICAgIGNhc2UgJ3RleHQnOiByZXR1cm4gbm9kZS5kYXRhXG4gICAgICBjYXNlICdlbGVtZW50JzpcbiAgICAgICAgdmFyIGNoaWxkcmVuID0gbm9kZS5jaGlsZHJlblxuICAgICAgICB2YXIgYXR0cmlidXRlcyA9IG5vZGUuYXR0cmlidXRlc1xuICAgICAgICB2YXIgdGFnTmFtZSA9IG5vZGUudGFnTmFtZVxuICAgICAgICB2YXIgaW5uZXJIVE1MID0gYXR0cmlidXRlcy5pbm5lckhUTUxcbiAgICAgICAgdmFyIHN0ciA9ICc8JyArIHRhZ05hbWUgKyBhdHRycyhhdHRyaWJ1dGVzKSArICc+J1xuXG4gICAgICAgIGlmIChpbm5lckhUTUwpIHtcbiAgICAgICAgICBzdHIgKz0gaW5uZXJIVE1MXG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgZm9yICh2YXIgaSA9IDAsIG4gPSBjaGlsZHJlbi5sZW5ndGg7IGkgPCBuOyBpKyspIHtcbiAgICAgICAgICAgIHN0ciArPSBzdHJpbmdpZnlOb2RlKGNoaWxkcmVuW2ldLCBwYXRoICsgJy4nICsgaSlcbiAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICBzdHIgKz0gJzwvJyArIHRhZ05hbWUgKyAnPidcbiAgICAgICAgcmV0dXJuIHN0clxuICAgICAgY2FzZSAnY29tcG9uZW50JzogcmV0dXJuIHN0cmluZ2lmeShub2RlLmNvbXBvbmVudCwgbm9kZS5wcm9wcylcbiAgICB9XG5cbiAgICB0aHJvdyBuZXcgRXJyb3IoJ0ludmFsaWQgdHlwZScpXG4gIH1cblxuICByZXR1cm4gc3RyaW5naWZ5Tm9kZShhcHAuZWxlbWVudCwgJzAnKVxufVxuXG4vKipcbiAqIEhUTUwgYXR0cmlidXRlcyB0byBzdHJpbmcuXG4gKlxuICogQHBhcmFtIHtPYmplY3R9IGF0dHJpYnV0ZXNcbiAqIEByZXR1cm4ge1N0cmluZ31cbiAqIEBhcGkgcHJpdmF0ZVxuICovXG5cbmZ1bmN0aW9uIGF0dHJzIChhdHRyaWJ1dGVzKSB7XG4gIHZhciBzdHIgPSAnJ1xuICBmb3IgKHZhciBrZXkgaW4gYXR0cmlidXRlcykge1xuICAgIGlmIChrZXkgPT09ICdpbm5lckhUTUwnKSBjb250aW51ZVxuICAgIHN0ciArPSBhdHRyKGtleSwgYXR0cmlidXRlc1trZXldKVxuICB9XG4gIHJldHVybiBzdHJcbn1cblxuLyoqXG4gKiBIVE1MIGF0dHJpYnV0ZSB0byBzdHJpbmcuXG4gKlxuICogQHBhcmFtIHtTdHJpbmd9IGtleVxuICogQHBhcmFtIHtTdHJpbmd9IHZhbFxuICogQHJldHVybiB7U3RyaW5nfVxuICogQGFwaSBwcml2YXRlXG4gKi9cblxuZnVuY3Rpb24gYXR0ciAoa2V5LCB2YWwpIHtcbiAgcmV0dXJuICcgJyArIGtleSArICc9XCInICsgdmFsICsgJ1wiJ1xufVxuIiwidmFyIGZhc3QgPSByZXF1aXJlKCdmYXN0LmpzJylcbnZhciBpbmRleE9mID0gZmFzdC5pbmRleE9mXG5cbi8qKlxuICogVGhpcyBmaWxlIGxpc3RzIHRoZSBzdXBwb3J0ZWQgU1ZHIGVsZW1lbnRzIHVzZWQgYnkgdGhlXG4gKiByZW5kZXJlci4gV2UgbWF5IGFkZCBiZXR0ZXIgU1ZHIHN1cHBvcnQgaW4gdGhlIGZ1dHVyZVxuICogdGhhdCBkb2Vzbid0IHJlcXVpcmUgd2hpdGVsaXN0aW5nIGVsZW1lbnRzLlxuICovXG5cbmV4cG9ydHMubmFtZXNwYWNlICA9ICdodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZydcblxuLyoqXG4gKiBTdXBwb3J0ZWQgU1ZHIGVsZW1lbnRzXG4gKlxuICogQHR5cGUge0FycmF5fVxuICovXG5cbmV4cG9ydHMuZWxlbWVudHMgPSBbXG4gICdjaXJjbGUnLFxuICAnZGVmcycsXG4gICdlbGxpcHNlJyxcbiAgJ2cnLFxuICAnbGluZScsXG4gICdsaW5lYXJHcmFkaWVudCcsXG4gICdtYXNrJyxcbiAgJ3BhdGgnLFxuICAncGF0dGVybicsXG4gICdwb2x5Z29uJyxcbiAgJ3BvbHlsaW5lJyxcbiAgJ3JhZGlhbEdyYWRpZW50JyxcbiAgJ3JlY3QnLFxuICAnc3RvcCcsXG4gICdzdmcnLFxuICAndGV4dCcsXG4gICd0c3Bhbidcbl1cblxuLyoqXG4gKiBTdXBwb3J0ZWQgU1ZHIGF0dHJpYnV0ZXNcbiAqL1xuXG5leHBvcnRzLmF0dHJpYnV0ZXMgPSBbXG4gICdjeCcsXG4gICdjeScsXG4gICdkJyxcbiAgJ2R4JyxcbiAgJ2R5JyxcbiAgJ2ZpbGwnLFxuICAnZmlsbE9wYWNpdHknLFxuICAnZm9udEZhbWlseScsXG4gICdmb250U2l6ZScsXG4gICdmeCcsXG4gICdmeScsXG4gICdncmFkaWVudFRyYW5zZm9ybScsXG4gICdncmFkaWVudFVuaXRzJyxcbiAgJ21hcmtlckVuZCcsXG4gICdtYXJrZXJNaWQnLFxuICAnbWFya2VyU3RhcnQnLFxuICAnb2Zmc2V0JyxcbiAgJ29wYWNpdHknLFxuICAncGF0dGVybkNvbnRlbnRVbml0cycsXG4gICdwYXR0ZXJuVW5pdHMnLFxuICAncG9pbnRzJyxcbiAgJ3ByZXNlcnZlQXNwZWN0UmF0aW8nLFxuICAncicsXG4gICdyeCcsXG4gICdyeScsXG4gICdzcHJlYWRNZXRob2QnLFxuICAnc3RvcENvbG9yJyxcbiAgJ3N0b3BPcGFjaXR5JyxcbiAgJ3N0cm9rZScsXG4gICdzdHJva2VEYXNoYXJyYXknLFxuICAnc3Ryb2tlTGluZWNhcCcsXG4gICdzdHJva2VPcGFjaXR5JyxcbiAgJ3N0cm9rZVdpZHRoJyxcbiAgJ3RleHRBbmNob3InLFxuICAndHJhbnNmb3JtJyxcbiAgJ3ZlcnNpb24nLFxuICAndmlld0JveCcsXG4gICd4MScsXG4gICd4MicsXG4gICd4JyxcbiAgJ3kxJyxcbiAgJ3kyJyxcbiAgJ3knXG5dXG5cbi8qKlxuICogSXMgZWxlbWVudCdzIG5hbWVzcGFjZSBTVkc/XG4gKlxuICogQHBhcmFtIHtTdHJpbmd9IG5hbWVcbiAqL1xuXG5leHBvcnRzLmlzRWxlbWVudCA9IGZ1bmN0aW9uIChuYW1lKSB7XG4gIHJldHVybiBpbmRleE9mKGV4cG9ydHMuZWxlbWVudHMsIG5hbWUpICE9PSAtMVxufVxuXG4vKipcbiAqIEFyZSBlbGVtZW50J3MgYXR0cmlidXRlcyBTVkc/XG4gKlxuICogQHBhcmFtIHtTdHJpbmd9IGF0dHJcbiAqL1xuXG5leHBvcnRzLmlzQXR0cmlidXRlID0gZnVuY3Rpb24gKGF0dHIpIHtcbiAgcmV0dXJuIGluZGV4T2YoZXhwb3J0cy5hdHRyaWJ1dGVzLCBhdHRyKSAhPT0gLTFcbn1cblxuIiwiLyoqXG4gKiBUaGUgbnBtICdkZWZhdWx0cycgbW9kdWxlIGJ1dCB3aXRob3V0IGNsb25lIGJlY2F1c2VcbiAqIGl0IHdhcyByZXF1aXJpbmcgdGhlICdCdWZmZXInIG1vZHVsZSB3aGljaCBpcyBodWdlLlxuICpcbiAqIEBwYXJhbSB7T2JqZWN0fSBvcHRpb25zXG4gKiBAcGFyYW0ge09iamVjdH0gZGVmYXVsdHNcbiAqXG4gKiBAcmV0dXJuIHtPYmplY3R9XG4gKi9cblxuZXhwb3J0cy5kZWZhdWx0cyA9IGZ1bmN0aW9uKG9wdGlvbnMsIGRlZmF1bHRzKSB7XG4gIE9iamVjdC5rZXlzKGRlZmF1bHRzKS5mb3JFYWNoKGZ1bmN0aW9uKGtleSkge1xuICAgIGlmICh0eXBlb2Ygb3B0aW9uc1trZXldID09PSAndW5kZWZpbmVkJykge1xuICAgICAgb3B0aW9uc1trZXldID0gZGVmYXVsdHNba2V5XVxuICAgIH1cbiAgfSlcbiAgcmV0dXJuIG9wdGlvbnNcbn1cbiIsIi8qKlxuICogTW9kdWxlIGRlcGVuZGVuY2llcy5cbiAqL1xuXG52YXIgdHlwZSA9IHJlcXVpcmUoJ2NvbXBvbmVudC10eXBlJylcbnZhciBzbGljZSA9IHJlcXVpcmUoJ3NsaWNlZCcpXG52YXIgZmxhdHRlbiA9IHJlcXVpcmUoJ2FycmF5LWZsYXR0ZW4nKVxuXG4vKipcbiAqIFRoaXMgZnVuY3Rpb24gbGV0cyB1cyBjcmVhdGUgdmlydHVhbCBub2RlcyB1c2luZyBhIHNpbXBsZVxuICogc3ludGF4LiBJdCBpcyBjb21wYXRpYmxlIHdpdGggSlNYIHRyYW5zZm9ybXMgc28geW91IGNhbiB1c2VcbiAqIEpTWCB0byB3cml0ZSBub2RlcyB0aGF0IHdpbGwgY29tcGlsZSB0byB0aGlzIGZ1bmN0aW9uLlxuICpcbiAqIGxldCBub2RlID0gdmlydHVhbCgnZGl2JywgeyBpZDogJ2ZvbycgfSwgW1xuICogICB2aXJ0dWFsKCdhJywgeyBocmVmOiAnaHR0cDovL2dvb2dsZS5jb20nIH0sICdHb29nbGUnKVxuICogXSlcbiAqXG4gKiBZb3UgY2FuIGxlYXZlIG91dCB0aGUgYXR0cmlidXRlcyBvciB0aGUgY2hpbGRyZW4gaWYgZWl0aGVyXG4gKiBvZiB0aGVtIGFyZW4ndCBuZWVkZWQgYW5kIGl0IHdpbGwgZmlndXJlIG91dCB3aGF0IHlvdSdyZVxuICogdHJ5aW5nIHRvIGRvLlxuICovXG5cbm1vZHVsZS5leHBvcnRzID0gdmlydHVhbFxuXG4vKipcbiAqIENyZWF0ZSB2aXJ0dWFsIERPTSB0cmVlcy5cbiAqXG4gKiBUaGlzIGNyZWF0ZXMgdGhlIG5pY2VyIEFQSSBmb3IgdGhlIHVzZXIuXG4gKiBJdCB0cmFuc2xhdGVzIHRoYXQgZnJpZW5kbHkgQVBJIGludG8gYW4gYWN0dWFsIHRyZWUgb2Ygbm9kZXMuXG4gKlxuICogQHBhcmFtIHtTdHJpbmd8RnVuY3Rpb259IHR5cGVcbiAqIEBwYXJhbSB7T2JqZWN0fSBwcm9wc1xuICogQHBhcmFtIHtBcnJheX0gY2hpbGRyZW5cbiAqIEByZXR1cm4ge05vZGV9XG4gKiBAYXBpIHB1YmxpY1xuICovXG5cbmZ1bmN0aW9uIHZpcnR1YWwgKHR5cGUsIHByb3BzLCBjaGlsZHJlbikge1xuICAvLyBEZWZhdWx0IHRvIGRpdiB3aXRoIG5vIGFyZ3NcbiAgaWYgKCF0eXBlKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKCdFbGVtZW50IG5lZWRzIGEgdHlwZS4gaHR0cHM6Ly9naXN0LmdpdGh1Yi5jb20vYW50aG9ueXNob3J0Lzc3Y2VkNDNiNWRlZmUzOTkwOGFmJylcbiAgfVxuXG4gIC8vIFNraXBwZWQgYWRkaW5nIGF0dHJpYnV0ZXMgYW5kIHdlJ3JlIHBhc3NpbmdcbiAgLy8gaW4gY2hpbGRyZW4gaW5zdGVhZC5cbiAgaWYgKGFyZ3VtZW50cy5sZW5ndGggPT09IDIgJiYgKHR5cGVvZiBwcm9wcyA9PT0gJ3N0cmluZycgfHwgQXJyYXkuaXNBcnJheShwcm9wcykpKSB7XG4gICAgY2hpbGRyZW4gPSBwcm9wc1xuICAgIHByb3BzID0ge31cbiAgfVxuXG4gIC8vIEFjY291bnQgZm9yIEpTWCBwdXR0aW5nIHRoZSBjaGlsZHJlbiBhcyBtdWx0aXBsZSBhcmd1bWVudHMuXG4gIC8vIFRoaXMgaXMgZXNzZW50aWFsbHkganVzdCB0aGUgRVM2IHJlc3QgcGFyYW1cbiAgaWYgKGFyZ3VtZW50cy5sZW5ndGggPiAyICYmIEFycmF5LmlzQXJyYXkoYXJndW1lbnRzWzJdKSA9PT0gZmFsc2UpIHtcbiAgICBjaGlsZHJlbiA9IHNsaWNlKGFyZ3VtZW50cywgMilcbiAgfVxuXG4gIGNoaWxkcmVuID0gY2hpbGRyZW4gfHwgW11cbiAgcHJvcHMgPSBwcm9wcyB8fCB7fVxuXG4gIC8vIHBhc3NpbmcgaW4gYSBzaW5nbGUgY2hpbGQsIHlvdSBjYW4gc2tpcFxuICAvLyB1c2luZyB0aGUgYXJyYXlcbiAgaWYgKCFBcnJheS5pc0FycmF5KGNoaWxkcmVuKSkge1xuICAgIGNoaWxkcmVuID0gWyBjaGlsZHJlbiBdXG4gIH1cblxuICBjaGlsZHJlbiA9IGZsYXR0ZW4oY2hpbGRyZW4sIDEpLnJlZHVjZShub3JtYWxpemUsIFtdKVxuXG4gIC8vIHB1bGwgdGhlIGtleSBvdXQgZnJvbSB0aGUgZGF0YS5cbiAgdmFyIGtleSA9ICdrZXknIGluIHByb3BzID8gU3RyaW5nKHByb3BzLmtleSkgOiBudWxsXG4gIGRlbGV0ZSBwcm9wc1sna2V5J11cblxuICAvLyBpZiB5b3UgcGFzcyBpbiBhIGZ1bmN0aW9uLCBpdCdzIGEgYENvbXBvbmVudGAgY29uc3RydWN0b3IuXG4gIC8vIG90aGVyd2lzZSBpdCdzIGFuIGVsZW1lbnQuXG4gIHZhciBub2RlXG4gIGlmICh0eXBlb2YgdHlwZSA9PT0gJ3N0cmluZycpIHtcbiAgICBub2RlID0gbmV3IEVsZW1lbnROb2RlKHR5cGUsIHByb3BzLCBrZXksIGNoaWxkcmVuKVxuICB9IGVsc2Uge1xuICAgIG5vZGUgPSBuZXcgQ29tcG9uZW50Tm9kZSh0eXBlLCBwcm9wcywga2V5LCBjaGlsZHJlbilcbiAgfVxuXG4gIC8vIHNldCB0aGUgdW5pcXVlIElEXG4gIG5vZGUuaW5kZXggPSAwXG5cbiAgcmV0dXJuIG5vZGVcbn1cblxuLyoqXG4gKiBQYXJzZSBub2RlcyBpbnRvIHJlYWwgYE5vZGVgIG9iamVjdHMuXG4gKlxuICogQHBhcmFtIHtNaXhlZH0gbm9kZVxuICogQHBhcmFtIHtJbnRlZ2VyfSBpbmRleFxuICogQHJldHVybiB7Tm9kZX1cbiAqIEBhcGkgcHJpdmF0ZVxuICovXG5cbmZ1bmN0aW9uIG5vcm1hbGl6ZSAoYWNjLCBub2RlKSB7XG4gIGlmIChub2RlID09IG51bGwpIHtcbiAgICByZXR1cm4gYWNjXG4gIH1cbiAgaWYgKHR5cGVvZiBub2RlID09PSAnc3RyaW5nJyB8fCB0eXBlb2Ygbm9kZSA9PT0gJ251bWJlcicpIHtcbiAgICB2YXIgbmV3Tm9kZSA9IG5ldyBUZXh0Tm9kZShTdHJpbmcobm9kZSkpXG4gICAgbmV3Tm9kZS5pbmRleCA9IGFjYy5sZW5ndGhcbiAgICBhY2MucHVzaChuZXdOb2RlKVxuICB9IGVsc2Uge1xuICAgIG5vZGUuaW5kZXggPSBhY2MubGVuZ3RoXG4gICAgYWNjLnB1c2gobm9kZSlcbiAgfVxuICByZXR1cm4gYWNjXG59XG5cbi8qKlxuICogSW5pdGlhbGl6ZSBhIG5ldyBgQ29tcG9uZW50Tm9kZWAuXG4gKlxuICogQHBhcmFtIHtDb21wb25lbnR9IGNvbXBvbmVudFxuICogQHBhcmFtIHtPYmplY3R9IHByb3BzXG4gKiBAcGFyYW0ge1N0cmluZ30ga2V5IFVzZWQgZm9yIHNvcnRpbmcvcmVwbGFjaW5nIGR1cmluZyBkaWZmaW5nLlxuICogQHBhcmFtIHtBcnJheX0gY2hpbGRyZW4gQ2hpbGQgdmlydHVhbCBub2Rlc1xuICogQGFwaSBwdWJsaWNcbiAqL1xuXG5mdW5jdGlvbiBDb21wb25lbnROb2RlIChjb21wb25lbnQsIHByb3BzLCBrZXksIGNoaWxkcmVuKSB7XG4gIHRoaXMua2V5ID0ga2V5XG4gIHRoaXMucHJvcHMgPSBwcm9wc1xuICB0aGlzLnR5cGUgPSAnY29tcG9uZW50J1xuICB0aGlzLmNvbXBvbmVudCA9IGNvbXBvbmVudFxuICB0aGlzLnByb3BzLmNoaWxkcmVuID0gY2hpbGRyZW4gfHwgW11cbn1cblxuLyoqXG4gKiBJbml0aWFsaXplIGEgbmV3IGBFbGVtZW50Tm9kZWAuXG4gKlxuICogQHBhcmFtIHtTdHJpbmd9IHRhZ05hbWVcbiAqIEBwYXJhbSB7T2JqZWN0fSBhdHRyaWJ1dGVzXG4gKiBAcGFyYW0ge1N0cmluZ30ga2V5IFVzZWQgZm9yIHNvcnRpbmcvcmVwbGFjaW5nIGR1cmluZyBkaWZmaW5nLlxuICogQHBhcmFtIHtBcnJheX0gY2hpbGRyZW4gQ2hpbGQgdmlydHVhbCBkb20gbm9kZXMuXG4gKiBAYXBpIHB1YmxpY1xuICovXG5cbmZ1bmN0aW9uIEVsZW1lbnROb2RlICh0YWdOYW1lLCBhdHRyaWJ1dGVzLCBrZXksIGNoaWxkcmVuKSB7XG4gIHRoaXMudHlwZSA9ICdlbGVtZW50J1xuICB0aGlzLmF0dHJpYnV0ZXMgPSBwYXJzZUF0dHJpYnV0ZXMoYXR0cmlidXRlcylcbiAgdGhpcy50YWdOYW1lID0gdGFnTmFtZVxuICB0aGlzLmNoaWxkcmVuID0gY2hpbGRyZW4gfHwgW11cbiAgdGhpcy5rZXkgPSBrZXlcbn1cblxuLyoqXG4gKiBJbml0aWFsaXplIGEgbmV3IGBUZXh0Tm9kZWAuXG4gKlxuICogVGhpcyBpcyBqdXN0IGEgdmlydHVhbCBIVE1MIHRleHQgb2JqZWN0LlxuICpcbiAqIEBwYXJhbSB7U3RyaW5nfSB0ZXh0XG4gKiBAYXBpIHB1YmxpY1xuICovXG5cbmZ1bmN0aW9uIFRleHROb2RlICh0ZXh0KSB7XG4gIHRoaXMudHlwZSA9ICd0ZXh0J1xuICB0aGlzLmRhdGEgPSBTdHJpbmcodGV4dClcbn1cblxuLyoqXG4gKiBQYXJzZSBhdHRyaWJ1dGVzIGZvciBzb21lIHNwZWNpYWwgY2FzZXMuXG4gKlxuICogVE9ETzogVGhpcyBjb3VsZCBiZSBtb3JlIGZ1bmN0aW9uYWwgYW5kIGFsbG93IGhvb2tzXG4gKiBpbnRvIHRoZSBwcm9jZXNzaW5nIG9mIHRoZSBhdHRyaWJ1dGVzIGF0IGEgY29tcG9uZW50LWxldmVsXG4gKlxuICogQHBhcmFtIHtPYmplY3R9IGF0dHJpYnV0ZXNcbiAqXG4gKiBAcmV0dXJuIHtPYmplY3R9XG4gKi9cblxuZnVuY3Rpb24gcGFyc2VBdHRyaWJ1dGVzIChhdHRyaWJ1dGVzKSB7XG4gIC8vIHN0eWxlOiB7ICd0ZXh0LWFsaWduJzogJ2xlZnQnIH1cbiAgaWYgKGF0dHJpYnV0ZXMuc3R5bGUpIHtcbiAgICBhdHRyaWJ1dGVzLnN0eWxlID0gcGFyc2VTdHlsZShhdHRyaWJ1dGVzLnN0eWxlKVxuICB9XG5cbiAgLy8gY2xhc3M6IHsgZm9vOiB0cnVlLCBiYXI6IGZhbHNlLCBiYXo6IHRydWUgfVxuICAvLyBjbGFzczogWydmb28nLCAnYmFyJywgJ2JheiddXG4gIGlmIChhdHRyaWJ1dGVzLmNsYXNzKSB7XG4gICAgYXR0cmlidXRlcy5jbGFzcyA9IHBhcnNlQ2xhc3MoYXR0cmlidXRlcy5jbGFzcylcbiAgfVxuXG4gIC8vIFJlbW92ZSBhdHRyaWJ1dGVzIHdpdGggZmFsc2UgdmFsdWVzXG4gIHZhciBmaWx0ZXJlZEF0dHJpYnV0ZXMgPSB7fVxuICBmb3IgKHZhciBrZXkgaW4gYXR0cmlidXRlcykge1xuICAgIHZhciB2YWx1ZSA9IGF0dHJpYnV0ZXNba2V5XVxuICAgIGlmICh2YWx1ZSA9PSBudWxsIHx8IHZhbHVlID09PSBmYWxzZSkgY29udGludWVcbiAgICBmaWx0ZXJlZEF0dHJpYnV0ZXNba2V5XSA9IHZhbHVlXG4gIH1cblxuICByZXR1cm4gZmlsdGVyZWRBdHRyaWJ1dGVzXG59XG5cbi8qKlxuICogUGFyc2UgYSBibG9jayBvZiBzdHlsZXMgaW50byBhIHN0cmluZy5cbiAqXG4gKiBUT0RPOiB0aGlzIGNvdWxkIGRvIGEgbG90IG1vcmUgd2l0aCB2ZW5kb3IgcHJlZml4aW5nLFxuICogbnVtYmVyIHZhbHVlcyBldGMuIE1heWJlIHRoZXJlJ3MgYSB3YXkgdG8gYWxsb3cgdXNlcnNcbiAqIHRvIGhvb2sgaW50byB0aGlzP1xuICpcbiAqIEBwYXJhbSB7T2JqZWN0fSBzdHlsZXNcbiAqXG4gKiBAcmV0dXJuIHtTdHJpbmd9XG4gKi9cblxuZnVuY3Rpb24gcGFyc2VTdHlsZSAoc3R5bGVzKSB7XG4gIGlmICh0eXBlKHN0eWxlcykgPT09ICdzdHJpbmcnKSB7XG4gICAgcmV0dXJuIHN0eWxlc1xuICB9XG4gIHZhciBzdHIgPSAnJ1xuICBmb3IgKHZhciBuYW1lIGluIHN0eWxlcykge1xuICAgIHZhciB2YWx1ZSA9IHN0eWxlc1tuYW1lXVxuICAgIHN0ciA9IHN0ciArIG5hbWUgKyAnOicgKyB2YWx1ZSArICc7J1xuICB9XG4gIHJldHVybiBzdHI7XG59XG5cbi8qKlxuICogUGFyc2UgdGhlIGNsYXNzIGF0dHJpYnV0ZSBzbyBpdCdzIGFibGUgdG8gYmVcbiAqIHNldCBpbiBhIG1vcmUgdXNlci1mcmllbmRseSB3YXlcbiAqXG4gKiBAcGFyYW0ge1N0cmluZ3xPYmplY3R8QXJyYXl9IHZhbHVlXG4gKlxuICogQHJldHVybiB7U3RyaW5nfVxuICovXG5cbmZ1bmN0aW9uIHBhcnNlQ2xhc3MgKHZhbHVlKSB7XG4gIC8vIHsgZm9vOiB0cnVlLCBiYXI6IGZhbHNlLCBiYXo6IHRydWUgfVxuICBpZiAodHlwZSh2YWx1ZSkgPT09ICdvYmplY3QnKSB7XG4gICAgdmFyIG1hdGNoZWQgPSBbXVxuICAgIGZvciAodmFyIGtleSBpbiB2YWx1ZSkge1xuICAgICAgaWYgKHZhbHVlW2tleV0pIG1hdGNoZWQucHVzaChrZXkpXG4gICAgfVxuICAgIHZhbHVlID0gbWF0Y2hlZFxuICB9XG5cbiAgLy8gWydmb28nLCAnYmFyJywgJ2JheiddXG4gIGlmICh0eXBlKHZhbHVlKSA9PT0gJ2FycmF5Jykge1xuICAgIGlmICh2YWx1ZS5sZW5ndGggPT09IDApIHtcbiAgICAgIHJldHVyblxuICAgIH1cbiAgICB2YWx1ZSA9IHZhbHVlLmpvaW4oJyAnKVxuICB9XG5cbiAgcmV0dXJuIHZhbHVlXG59XG4iLCIvKipcbiAqIFJlY3Vyc2l2ZSBmbGF0dGVuIGZ1bmN0aW9uIHdpdGggZGVwdGguXG4gKlxuICogQHBhcmFtICB7QXJyYXl9ICBhcnJheVxuICogQHBhcmFtICB7QXJyYXl9ICByZXN1bHRcbiAqIEBwYXJhbSAge051bWJlcn0gZGVwdGhcbiAqIEByZXR1cm4ge0FycmF5fVxuICovXG5mdW5jdGlvbiBmbGF0dGVuRGVwdGggKGFycmF5LCByZXN1bHQsIGRlcHRoKSB7XG4gIGZvciAodmFyIGkgPSAwOyBpIDwgYXJyYXkubGVuZ3RoOyBpKyspIHtcbiAgICB2YXIgdmFsdWUgPSBhcnJheVtpXVxuXG4gICAgaWYgKGRlcHRoID4gMCAmJiBBcnJheS5pc0FycmF5KHZhbHVlKSkge1xuICAgICAgZmxhdHRlbkRlcHRoKHZhbHVlLCByZXN1bHQsIGRlcHRoIC0gMSlcbiAgICB9IGVsc2Uge1xuICAgICAgcmVzdWx0LnB1c2godmFsdWUpXG4gICAgfVxuICB9XG5cbiAgcmV0dXJuIHJlc3VsdFxufVxuXG4vKipcbiAqIFJlY3Vyc2l2ZSBmbGF0dGVuIGZ1bmN0aW9uLiBPbWl0dGluZyBkZXB0aCBpcyBzbGlnaHRseSBmYXN0ZXIuXG4gKlxuICogQHBhcmFtICB7QXJyYXl9IGFycmF5XG4gKiBAcGFyYW0gIHtBcnJheX0gcmVzdWx0XG4gKiBAcmV0dXJuIHtBcnJheX1cbiAqL1xuZnVuY3Rpb24gZmxhdHRlbkZvcmV2ZXIgKGFycmF5LCByZXN1bHQpIHtcbiAgZm9yICh2YXIgaSA9IDA7IGkgPCBhcnJheS5sZW5ndGg7IGkrKykge1xuICAgIHZhciB2YWx1ZSA9IGFycmF5W2ldXG5cbiAgICBpZiAoQXJyYXkuaXNBcnJheSh2YWx1ZSkpIHtcbiAgICAgIGZsYXR0ZW5Gb3JldmVyKHZhbHVlLCByZXN1bHQpXG4gICAgfSBlbHNlIHtcbiAgICAgIHJlc3VsdC5wdXNoKHZhbHVlKVxuICAgIH1cbiAgfVxuXG4gIHJldHVybiByZXN1bHRcbn1cblxuLyoqXG4gKiBGbGF0dGVuIGFuIGFycmF5LCB3aXRoIHRoZSBhYmlsaXR5IHRvIGRlZmluZSBhIGRlcHRoLlxuICpcbiAqIEBwYXJhbSAge0FycmF5fSAgYXJyYXlcbiAqIEBwYXJhbSAge051bWJlcn0gZGVwdGhcbiAqIEByZXR1cm4ge0FycmF5fVxuICovXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIChhcnJheSwgZGVwdGgpIHtcbiAgaWYgKGRlcHRoID09IG51bGwpIHtcbiAgICByZXR1cm4gZmxhdHRlbkZvcmV2ZXIoYXJyYXksIFtdKVxuICB9XG5cbiAgcmV0dXJuIGZsYXR0ZW5EZXB0aChhcnJheSwgW10sIGRlcHRoKVxufVxuIiwiXG4vKipcbiAqIEV4cG9zZSBgRW1pdHRlcmAuXG4gKi9cblxubW9kdWxlLmV4cG9ydHMgPSBFbWl0dGVyO1xuXG4vKipcbiAqIEluaXRpYWxpemUgYSBuZXcgYEVtaXR0ZXJgLlxuICpcbiAqIEBhcGkgcHVibGljXG4gKi9cblxuZnVuY3Rpb24gRW1pdHRlcihvYmopIHtcbiAgaWYgKG9iaikgcmV0dXJuIG1peGluKG9iaik7XG59O1xuXG4vKipcbiAqIE1peGluIHRoZSBlbWl0dGVyIHByb3BlcnRpZXMuXG4gKlxuICogQHBhcmFtIHtPYmplY3R9IG9ialxuICogQHJldHVybiB7T2JqZWN0fVxuICogQGFwaSBwcml2YXRlXG4gKi9cblxuZnVuY3Rpb24gbWl4aW4ob2JqKSB7XG4gIGZvciAodmFyIGtleSBpbiBFbWl0dGVyLnByb3RvdHlwZSkge1xuICAgIG9ialtrZXldID0gRW1pdHRlci5wcm90b3R5cGVba2V5XTtcbiAgfVxuICByZXR1cm4gb2JqO1xufVxuXG4vKipcbiAqIExpc3RlbiBvbiB0aGUgZ2l2ZW4gYGV2ZW50YCB3aXRoIGBmbmAuXG4gKlxuICogQHBhcmFtIHtTdHJpbmd9IGV2ZW50XG4gKiBAcGFyYW0ge0Z1bmN0aW9ufSBmblxuICogQHJldHVybiB7RW1pdHRlcn1cbiAqIEBhcGkgcHVibGljXG4gKi9cblxuRW1pdHRlci5wcm90b3R5cGUub24gPVxuRW1pdHRlci5wcm90b3R5cGUuYWRkRXZlbnRMaXN0ZW5lciA9IGZ1bmN0aW9uKGV2ZW50LCBmbil7XG4gIHRoaXMuX2NhbGxiYWNrcyA9IHRoaXMuX2NhbGxiYWNrcyB8fCB7fTtcbiAgKHRoaXMuX2NhbGxiYWNrc1snJCcgKyBldmVudF0gPSB0aGlzLl9jYWxsYmFja3NbJyQnICsgZXZlbnRdIHx8IFtdKVxuICAgIC5wdXNoKGZuKTtcbiAgcmV0dXJuIHRoaXM7XG59O1xuXG4vKipcbiAqIEFkZHMgYW4gYGV2ZW50YCBsaXN0ZW5lciB0aGF0IHdpbGwgYmUgaW52b2tlZCBhIHNpbmdsZVxuICogdGltZSB0aGVuIGF1dG9tYXRpY2FsbHkgcmVtb3ZlZC5cbiAqXG4gKiBAcGFyYW0ge1N0cmluZ30gZXZlbnRcbiAqIEBwYXJhbSB7RnVuY3Rpb259IGZuXG4gKiBAcmV0dXJuIHtFbWl0dGVyfVxuICogQGFwaSBwdWJsaWNcbiAqL1xuXG5FbWl0dGVyLnByb3RvdHlwZS5vbmNlID0gZnVuY3Rpb24oZXZlbnQsIGZuKXtcbiAgZnVuY3Rpb24gb24oKSB7XG4gICAgdGhpcy5vZmYoZXZlbnQsIG9uKTtcbiAgICBmbi5hcHBseSh0aGlzLCBhcmd1bWVudHMpO1xuICB9XG5cbiAgb24uZm4gPSBmbjtcbiAgdGhpcy5vbihldmVudCwgb24pO1xuICByZXR1cm4gdGhpcztcbn07XG5cbi8qKlxuICogUmVtb3ZlIHRoZSBnaXZlbiBjYWxsYmFjayBmb3IgYGV2ZW50YCBvciBhbGxcbiAqIHJlZ2lzdGVyZWQgY2FsbGJhY2tzLlxuICpcbiAqIEBwYXJhbSB7U3RyaW5nfSBldmVudFxuICogQHBhcmFtIHtGdW5jdGlvbn0gZm5cbiAqIEByZXR1cm4ge0VtaXR0ZXJ9XG4gKiBAYXBpIHB1YmxpY1xuICovXG5cbkVtaXR0ZXIucHJvdG90eXBlLm9mZiA9XG5FbWl0dGVyLnByb3RvdHlwZS5yZW1vdmVMaXN0ZW5lciA9XG5FbWl0dGVyLnByb3RvdHlwZS5yZW1vdmVBbGxMaXN0ZW5lcnMgPVxuRW1pdHRlci5wcm90b3R5cGUucmVtb3ZlRXZlbnRMaXN0ZW5lciA9IGZ1bmN0aW9uKGV2ZW50LCBmbil7XG4gIHRoaXMuX2NhbGxiYWNrcyA9IHRoaXMuX2NhbGxiYWNrcyB8fCB7fTtcblxuICAvLyBhbGxcbiAgaWYgKDAgPT0gYXJndW1lbnRzLmxlbmd0aCkge1xuICAgIHRoaXMuX2NhbGxiYWNrcyA9IHt9O1xuICAgIHJldHVybiB0aGlzO1xuICB9XG5cbiAgLy8gc3BlY2lmaWMgZXZlbnRcbiAgdmFyIGNhbGxiYWNrcyA9IHRoaXMuX2NhbGxiYWNrc1snJCcgKyBldmVudF07XG4gIGlmICghY2FsbGJhY2tzKSByZXR1cm4gdGhpcztcblxuICAvLyByZW1vdmUgYWxsIGhhbmRsZXJzXG4gIGlmICgxID09IGFyZ3VtZW50cy5sZW5ndGgpIHtcbiAgICBkZWxldGUgdGhpcy5fY2FsbGJhY2tzWyckJyArIGV2ZW50XTtcbiAgICByZXR1cm4gdGhpcztcbiAgfVxuXG4gIC8vIHJlbW92ZSBzcGVjaWZpYyBoYW5kbGVyXG4gIHZhciBjYjtcbiAgZm9yICh2YXIgaSA9IDA7IGkgPCBjYWxsYmFja3MubGVuZ3RoOyBpKyspIHtcbiAgICBjYiA9IGNhbGxiYWNrc1tpXTtcbiAgICBpZiAoY2IgPT09IGZuIHx8IGNiLmZuID09PSBmbikge1xuICAgICAgY2FsbGJhY2tzLnNwbGljZShpLCAxKTtcbiAgICAgIGJyZWFrO1xuICAgIH1cbiAgfVxuICByZXR1cm4gdGhpcztcbn07XG5cbi8qKlxuICogRW1pdCBgZXZlbnRgIHdpdGggdGhlIGdpdmVuIGFyZ3MuXG4gKlxuICogQHBhcmFtIHtTdHJpbmd9IGV2ZW50XG4gKiBAcGFyYW0ge01peGVkfSAuLi5cbiAqIEByZXR1cm4ge0VtaXR0ZXJ9XG4gKi9cblxuRW1pdHRlci5wcm90b3R5cGUuZW1pdCA9IGZ1bmN0aW9uKGV2ZW50KXtcbiAgdGhpcy5fY2FsbGJhY2tzID0gdGhpcy5fY2FsbGJhY2tzIHx8IHt9O1xuICB2YXIgYXJncyA9IFtdLnNsaWNlLmNhbGwoYXJndW1lbnRzLCAxKVxuICAgICwgY2FsbGJhY2tzID0gdGhpcy5fY2FsbGJhY2tzWyckJyArIGV2ZW50XTtcblxuICBpZiAoY2FsbGJhY2tzKSB7XG4gICAgY2FsbGJhY2tzID0gY2FsbGJhY2tzLnNsaWNlKDApO1xuICAgIGZvciAodmFyIGkgPSAwLCBsZW4gPSBjYWxsYmFja3MubGVuZ3RoOyBpIDwgbGVuOyArK2kpIHtcbiAgICAgIGNhbGxiYWNrc1tpXS5hcHBseSh0aGlzLCBhcmdzKTtcbiAgICB9XG4gIH1cblxuICByZXR1cm4gdGhpcztcbn07XG5cbi8qKlxuICogUmV0dXJuIGFycmF5IG9mIGNhbGxiYWNrcyBmb3IgYGV2ZW50YC5cbiAqXG4gKiBAcGFyYW0ge1N0cmluZ30gZXZlbnRcbiAqIEByZXR1cm4ge0FycmF5fVxuICogQGFwaSBwdWJsaWNcbiAqL1xuXG5FbWl0dGVyLnByb3RvdHlwZS5saXN0ZW5lcnMgPSBmdW5jdGlvbihldmVudCl7XG4gIHRoaXMuX2NhbGxiYWNrcyA9IHRoaXMuX2NhbGxiYWNrcyB8fCB7fTtcbiAgcmV0dXJuIHRoaXMuX2NhbGxiYWNrc1snJCcgKyBldmVudF0gfHwgW107XG59O1xuXG4vKipcbiAqIENoZWNrIGlmIHRoaXMgZW1pdHRlciBoYXMgYGV2ZW50YCBoYW5kbGVycy5cbiAqXG4gKiBAcGFyYW0ge1N0cmluZ30gZXZlbnRcbiAqIEByZXR1cm4ge0Jvb2xlYW59XG4gKiBAYXBpIHB1YmxpY1xuICovXG5cbkVtaXR0ZXIucHJvdG90eXBlLmhhc0xpc3RlbmVycyA9IGZ1bmN0aW9uKGV2ZW50KXtcbiAgcmV0dXJuICEhIHRoaXMubGlzdGVuZXJzKGV2ZW50KS5sZW5ndGg7XG59O1xuIiwiLyoqXG4gKiBFeHBvc2UgYHJlcXVlc3RBbmltYXRpb25GcmFtZSgpYC5cbiAqL1xuXG5leHBvcnRzID0gbW9kdWxlLmV4cG9ydHMgPSB3aW5kb3cucmVxdWVzdEFuaW1hdGlvbkZyYW1lXG4gIHx8IHdpbmRvdy53ZWJraXRSZXF1ZXN0QW5pbWF0aW9uRnJhbWVcbiAgfHwgd2luZG93Lm1velJlcXVlc3RBbmltYXRpb25GcmFtZVxuICB8fCBmYWxsYmFjaztcblxuLyoqXG4gKiBGYWxsYmFjayBpbXBsZW1lbnRhdGlvbi5cbiAqL1xuXG52YXIgcHJldiA9IG5ldyBEYXRlKCkuZ2V0VGltZSgpO1xuZnVuY3Rpb24gZmFsbGJhY2soZm4pIHtcbiAgdmFyIGN1cnIgPSBuZXcgRGF0ZSgpLmdldFRpbWUoKTtcbiAgdmFyIG1zID0gTWF0aC5tYXgoMCwgMTYgLSAoY3VyciAtIHByZXYpKTtcbiAgdmFyIHJlcSA9IHNldFRpbWVvdXQoZm4sIG1zKTtcbiAgcHJldiA9IGN1cnI7XG4gIHJldHVybiByZXE7XG59XG5cbi8qKlxuICogQ2FuY2VsLlxuICovXG5cbnZhciBjYW5jZWwgPSB3aW5kb3cuY2FuY2VsQW5pbWF0aW9uRnJhbWVcbiAgfHwgd2luZG93LndlYmtpdENhbmNlbEFuaW1hdGlvbkZyYW1lXG4gIHx8IHdpbmRvdy5tb3pDYW5jZWxBbmltYXRpb25GcmFtZVxuICB8fCB3aW5kb3cuY2xlYXJUaW1lb3V0O1xuXG5leHBvcnRzLmNhbmNlbCA9IGZ1bmN0aW9uKGlkKXtcbiAgY2FuY2VsLmNhbGwod2luZG93LCBpZCk7XG59O1xuIiwiLyoqXG4gKiB0b1N0cmluZyByZWYuXG4gKi9cblxudmFyIHRvU3RyaW5nID0gT2JqZWN0LnByb3RvdHlwZS50b1N0cmluZztcblxuLyoqXG4gKiBSZXR1cm4gdGhlIHR5cGUgb2YgYHZhbGAuXG4gKlxuICogQHBhcmFtIHtNaXhlZH0gdmFsXG4gKiBAcmV0dXJuIHtTdHJpbmd9XG4gKiBAYXBpIHB1YmxpY1xuICovXG5cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24odmFsKXtcbiAgc3dpdGNoICh0b1N0cmluZy5jYWxsKHZhbCkpIHtcbiAgICBjYXNlICdbb2JqZWN0IERhdGVdJzogcmV0dXJuICdkYXRlJztcbiAgICBjYXNlICdbb2JqZWN0IFJlZ0V4cF0nOiByZXR1cm4gJ3JlZ2V4cCc7XG4gICAgY2FzZSAnW29iamVjdCBBcmd1bWVudHNdJzogcmV0dXJuICdhcmd1bWVudHMnO1xuICAgIGNhc2UgJ1tvYmplY3QgQXJyYXldJzogcmV0dXJuICdhcnJheSc7XG4gICAgY2FzZSAnW29iamVjdCBFcnJvcl0nOiByZXR1cm4gJ2Vycm9yJztcbiAgfVxuXG4gIGlmICh2YWwgPT09IG51bGwpIHJldHVybiAnbnVsbCc7XG4gIGlmICh2YWwgPT09IHVuZGVmaW5lZCkgcmV0dXJuICd1bmRlZmluZWQnO1xuICBpZiAodmFsICE9PSB2YWwpIHJldHVybiAnbmFuJztcbiAgaWYgKHZhbCAmJiB2YWwubm9kZVR5cGUgPT09IDEpIHJldHVybiAnZWxlbWVudCc7XG5cbiAgdmFsID0gdmFsLnZhbHVlT2ZcbiAgICA/IHZhbC52YWx1ZU9mKClcbiAgICA6IE9iamVjdC5wcm90b3R5cGUudmFsdWVPZi5hcHBseSh2YWwpXG5cbiAgcmV0dXJuIHR5cGVvZiB2YWw7XG59O1xuIiwiZnVuY3Rpb24gUG9vbChwYXJhbXMpIHtcclxuICAgIGlmICh0eXBlb2YgcGFyYW1zICE9PSAnb2JqZWN0Jykge1xyXG4gICAgICAgIHRocm93IG5ldyBFcnJvcihcIlBsZWFzZSBwYXNzIHBhcmFtZXRlcnMuIEV4YW1wbGUgLT4gbmV3IFBvb2woeyB0YWdOYW1lOiBcXFwiZGl2XFxcIiB9KVwiKTtcclxuICAgIH1cclxuXHJcbiAgICBpZiAodHlwZW9mIHBhcmFtcy50YWdOYW1lICE9PSAnc3RyaW5nJykge1xyXG4gICAgICAgIHRocm93IG5ldyBFcnJvcihcIlBsZWFzZSBzcGVjaWZ5IGEgdGFnTmFtZS4gRXhhbXBsZSAtPiBuZXcgUG9vbCh7IHRhZ05hbWU6IFxcXCJkaXZcXFwiIH0pXCIpO1xyXG4gICAgfVxyXG5cclxuICAgIHRoaXMuc3RvcmFnZSA9IFtdO1xyXG4gICAgdGhpcy50YWdOYW1lID0gcGFyYW1zLnRhZ05hbWUudG9Mb3dlckNhc2UoKTtcclxuICAgIHRoaXMubmFtZXNwYWNlID0gcGFyYW1zLm5hbWVzcGFjZTtcclxufVxyXG5cclxuUG9vbC5wcm90b3R5cGUucHVzaCA9IGZ1bmN0aW9uKGVsKSB7XHJcbiAgICBpZiAoZWwudGFnTmFtZS50b0xvd2VyQ2FzZSgpICE9PSB0aGlzLnRhZ05hbWUpIHtcclxuICAgICAgICByZXR1cm47XHJcbiAgICB9XHJcbiAgICBcclxuICAgIHRoaXMuc3RvcmFnZS5wdXNoKGVsKTtcclxufTtcclxuXHJcblBvb2wucHJvdG90eXBlLnBvcCA9IGZ1bmN0aW9uKGFyZ3VtZW50KSB7XHJcbiAgICBpZiAodGhpcy5zdG9yYWdlLmxlbmd0aCA9PT0gMCkge1xyXG4gICAgICAgIHJldHVybiB0aGlzLmNyZWF0ZSgpO1xyXG4gICAgfSBlbHNlIHtcclxuICAgICAgICByZXR1cm4gdGhpcy5zdG9yYWdlLnBvcCgpO1xyXG4gICAgfVxyXG59O1xyXG5cclxuUG9vbC5wcm90b3R5cGUuY3JlYXRlID0gZnVuY3Rpb24oKSB7XHJcbiAgICBpZiAodGhpcy5uYW1lc3BhY2UpIHtcclxuICAgICAgICByZXR1cm4gZG9jdW1lbnQuY3JlYXRlRWxlbWVudE5TKHRoaXMubmFtZXNwYWNlLCB0aGlzLnRhZ05hbWUpO1xyXG4gICAgfSBlbHNlIHtcclxuICAgICAgICByZXR1cm4gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCh0aGlzLnRhZ05hbWUpO1xyXG4gICAgfVxyXG59O1xyXG5cclxuUG9vbC5wcm90b3R5cGUuYWxsb2NhdGUgPSBmdW5jdGlvbihzaXplKSB7XHJcbiAgICBpZiAodGhpcy5zdG9yYWdlLmxlbmd0aCA+PSBzaXplKSB7XHJcbiAgICAgICAgcmV0dXJuO1xyXG4gICAgfVxyXG5cclxuICAgIHZhciBkaWZmZXJlbmNlID0gc2l6ZSAtIHRoaXMuc3RvcmFnZS5sZW5ndGg7XHJcbiAgICBmb3IgKHZhciBwb29sQWxsb2NJdGVyID0gMDsgcG9vbEFsbG9jSXRlciA8IGRpZmZlcmVuY2U7IHBvb2xBbGxvY0l0ZXIrKykge1xyXG4gICAgICAgIHRoaXMuc3RvcmFnZS5wdXNoKHRoaXMuY3JlYXRlKCkpO1xyXG4gICAgfVxyXG59O1xyXG5cclxuaWYgKHR5cGVvZiBtb2R1bGUgIT09ICd1bmRlZmluZWQnICYmIHR5cGVvZiBtb2R1bGUuZXhwb3J0cyAhPT0gJ3VuZGVmaW5lZCcpIHtcclxuICAgIG1vZHVsZS5leHBvcnRzID0gUG9vbDtcclxufVxyXG4iLCJ2YXIgc2xpY2UgPSBBcnJheS5wcm90b3R5cGUuc2xpY2VcblxubW9kdWxlLmV4cG9ydHMgPSBpdGVyYXRpdmVseVdhbGtcblxuZnVuY3Rpb24gaXRlcmF0aXZlbHlXYWxrKG5vZGVzLCBjYikge1xuICAgIGlmICghKCdsZW5ndGgnIGluIG5vZGVzKSkge1xuICAgICAgICBub2RlcyA9IFtub2Rlc11cbiAgICB9XG4gICAgXG4gICAgbm9kZXMgPSBzbGljZS5jYWxsKG5vZGVzKVxuXG4gICAgd2hpbGUobm9kZXMubGVuZ3RoKSB7XG4gICAgICAgIHZhciBub2RlID0gbm9kZXMuc2hpZnQoKSxcbiAgICAgICAgICAgIHJldCA9IGNiKG5vZGUpXG5cbiAgICAgICAgaWYgKHJldCkge1xuICAgICAgICAgICAgcmV0dXJuIHJldFxuICAgICAgICB9XG5cbiAgICAgICAgaWYgKG5vZGUuY2hpbGROb2RlcyAmJiBub2RlLmNoaWxkTm9kZXMubGVuZ3RoKSB7XG4gICAgICAgICAgICBub2RlcyA9IHNsaWNlLmNhbGwobm9kZS5jaGlsZE5vZGVzKS5jb25jYXQobm9kZXMpXG4gICAgICAgIH1cbiAgICB9XG59XG4iLCIndXNlIHN0cmljdCc7XG5cbi8qKlxuICogIyBDbG9uZSBBcnJheVxuICpcbiAqIENsb25lIGFuIGFycmF5IG9yIGFycmF5IGxpa2Ugb2JqZWN0IChlLmcuIGBhcmd1bWVudHNgKS5cbiAqIFRoaXMgaXMgdGhlIGVxdWl2YWxlbnQgb2YgY2FsbGluZyBgQXJyYXkucHJvdG90eXBlLnNsaWNlLmNhbGwoYXJndW1lbnRzKWAsIGJ1dFxuICogc2lnbmlmaWNhbnRseSBmYXN0ZXIuXG4gKlxuICogQHBhcmFtICB7QXJyYXl9IGlucHV0IFRoZSBhcnJheSBvciBhcnJheS1saWtlIG9iamVjdCB0byBjbG9uZS5cbiAqIEByZXR1cm4ge0FycmF5fSAgICAgICBUaGUgY2xvbmVkIGFycmF5LlxuICovXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIGZhc3RDbG9uZUFycmF5IChpbnB1dCkge1xuICB2YXIgbGVuZ3RoID0gaW5wdXQubGVuZ3RoLFxuICAgICAgc2xpY2VkID0gbmV3IEFycmF5KGxlbmd0aCksXG4gICAgICBpO1xuICBmb3IgKGkgPSAwOyBpIDwgbGVuZ3RoOyBpKyspIHtcbiAgICBzbGljZWRbaV0gPSBpbnB1dFtpXTtcbiAgfVxuICByZXR1cm4gc2xpY2VkO1xufTtcbiIsIid1c2Ugc3RyaWN0JztcblxuLyoqXG4gKiAjIENvbmNhdFxuICpcbiAqIENvbmNhdGVuYXRlIG11bHRpcGxlIGFycmF5cy5cbiAqXG4gKiA+IE5vdGU6IFRoaXMgZnVuY3Rpb24gaXMgZWZmZWN0aXZlbHkgaWRlbnRpY2FsIHRvIGBBcnJheS5wcm90b3R5cGUuY29uY2F0KClgLlxuICpcbiAqXG4gKiBAcGFyYW0gIHtBcnJheXxtaXhlZH0gaXRlbSwgLi4uIFRoZSBpdGVtKHMpIHRvIGNvbmNhdGVuYXRlLlxuICogQHJldHVybiB7QXJyYXl9ICAgICAgICAgICAgICAgICBUaGUgYXJyYXkgY29udGFpbmluZyB0aGUgY29uY2F0ZW5hdGVkIGl0ZW1zLlxuICovXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIGZhc3RDb25jYXQgKCkge1xuICB2YXIgbGVuZ3RoID0gYXJndW1lbnRzLmxlbmd0aCxcbiAgICAgIGFyciA9IFtdLFxuICAgICAgaSwgaXRlbSwgY2hpbGRMZW5ndGgsIGo7XG5cbiAgZm9yIChpID0gMDsgaSA8IGxlbmd0aDsgaSsrKSB7XG4gICAgaXRlbSA9IGFyZ3VtZW50c1tpXTtcbiAgICBpZiAoQXJyYXkuaXNBcnJheShpdGVtKSkge1xuICAgICAgY2hpbGRMZW5ndGggPSBpdGVtLmxlbmd0aDtcbiAgICAgIGZvciAoaiA9IDA7IGogPCBjaGlsZExlbmd0aDsgaisrKSB7XG4gICAgICAgIGFyci5wdXNoKGl0ZW1bal0pO1xuICAgICAgfVxuICAgIH1cbiAgICBlbHNlIHtcbiAgICAgIGFyci5wdXNoKGl0ZW0pO1xuICAgIH1cbiAgfVxuICByZXR1cm4gYXJyO1xufTtcbiIsIid1c2Ugc3RyaWN0JztcblxudmFyIGJpbmRJbnRlcm5hbDMgPSByZXF1aXJlKCcuLi9mdW5jdGlvbi9iaW5kSW50ZXJuYWwzJyk7XG5cbi8qKlxuICogIyBFdmVyeVxuICpcbiAqIEEgZmFzdCBgLmV2ZXJ5KClgIGltcGxlbWVudGF0aW9uLlxuICpcbiAqIEBwYXJhbSAge0FycmF5fSAgICBzdWJqZWN0ICAgICBUaGUgYXJyYXkgKG9yIGFycmF5LWxpa2UpIHRvIGl0ZXJhdGUgb3Zlci5cbiAqIEBwYXJhbSAge0Z1bmN0aW9ufSBmbiAgICAgICAgICBUaGUgdmlzaXRvciBmdW5jdGlvbi5cbiAqIEBwYXJhbSAge09iamVjdH0gICB0aGlzQ29udGV4dCBUaGUgY29udGV4dCBmb3IgdGhlIHZpc2l0b3IuXG4gKiBAcmV0dXJuIHtCb29sZWFufSAgICAgICAgICAgICAgdHJ1ZSBpZiBhbGwgaXRlbXMgaW4gdGhlIGFycmF5IHBhc3NlcyB0aGUgdHJ1dGggdGVzdC5cbiAqL1xubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiBmYXN0RXZlcnkgKHN1YmplY3QsIGZuLCB0aGlzQ29udGV4dCkge1xuICB2YXIgbGVuZ3RoID0gc3ViamVjdC5sZW5ndGgsXG4gICAgICBpdGVyYXRvciA9IHRoaXNDb250ZXh0ICE9PSB1bmRlZmluZWQgPyBiaW5kSW50ZXJuYWwzKGZuLCB0aGlzQ29udGV4dCkgOiBmbixcbiAgICAgIGk7XG4gIGZvciAoaSA9IDA7IGkgPCBsZW5ndGg7IGkrKykge1xuICAgIGlmICghaXRlcmF0b3Ioc3ViamVjdFtpXSwgaSwgc3ViamVjdCkpIHtcbiAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG4gIH1cbiAgcmV0dXJuIHRydWU7XG59O1xuIiwiJ3VzZSBzdHJpY3QnO1xuXG4vKipcbiAqICMgRmlsbFxuICogRmlsbCBhbiBhcnJheSB3aXRoIHZhbHVlcywgb3B0aW9uYWxseSBzdGFydGluZyBhbmQgc3RvcHBpbmcgYXQgYSBnaXZlbiBpbmRleC5cbiAqXG4gKiA+IE5vdGU6IHVubGlrZSB0aGUgc3BlY2NlZCBBcnJheS5wcm90b3R5cGUuZmlsbCgpLCB0aGlzIHZlcnNpb24gZG9lcyBub3Qgc3VwcG9ydFxuICogPiBuZWdhdGl2ZSBzdGFydCAvIGVuZCBhcmd1bWVudHMuXG4gKlxuICogQHBhcmFtICB7QXJyYXl9ICAgc3ViamVjdCBUaGUgYXJyYXkgdG8gZmlsbC5cbiAqIEBwYXJhbSAge21peGVkfSAgIHZhbHVlICAgVGhlIHZhbHVlIHRvIGluc2VydC5cbiAqIEBwYXJhbSAge0ludGVnZXJ9IHN0YXJ0ICAgVGhlIHN0YXJ0IHBvc2l0aW9uLCBkZWZhdWx0cyB0byAwLlxuICogQHBhcmFtICB7SW50ZWdlcn0gZW5kICAgICBUaGUgZW5kIHBvc2l0aW9uLCBkZWZhdWx0cyB0byBzdWJqZWN0Lmxlbmd0aFxuICogQHJldHVybiB7QXJyYXl9ICAgICAgICAgICBUaGUgbm93IGZpbGxlZCBzdWJqZWN0LlxuICovXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIGZhc3RGaWxsIChzdWJqZWN0LCB2YWx1ZSwgc3RhcnQsIGVuZCkge1xuICB2YXIgbGVuZ3RoID0gc3ViamVjdC5sZW5ndGgsXG4gICAgICBpO1xuICBpZiAoc3RhcnQgPT09IHVuZGVmaW5lZCkge1xuICAgIHN0YXJ0ID0gMDtcbiAgfVxuICBpZiAoZW5kID09PSB1bmRlZmluZWQpIHtcbiAgICBlbmQgPSBsZW5ndGg7XG4gIH1cbiAgZm9yIChpID0gc3RhcnQ7IGkgPCBlbmQ7IGkrKykge1xuICAgIHN1YmplY3RbaV0gPSB2YWx1ZTtcbiAgfVxuICByZXR1cm4gc3ViamVjdDtcbn07IiwiJ3VzZSBzdHJpY3QnO1xuXG52YXIgYmluZEludGVybmFsMyA9IHJlcXVpcmUoJy4uL2Z1bmN0aW9uL2JpbmRJbnRlcm5hbDMnKTtcblxuLyoqXG4gKiAjIEZpbHRlclxuICpcbiAqIEEgZmFzdCBgLmZpbHRlcigpYCBpbXBsZW1lbnRhdGlvbi5cbiAqXG4gKiBAcGFyYW0gIHtBcnJheX0gICAgc3ViamVjdCAgICAgVGhlIGFycmF5IChvciBhcnJheS1saWtlKSB0byBmaWx0ZXIuXG4gKiBAcGFyYW0gIHtGdW5jdGlvbn0gZm4gICAgICAgICAgVGhlIGZpbHRlciBmdW5jdGlvbi5cbiAqIEBwYXJhbSAge09iamVjdH0gICB0aGlzQ29udGV4dCBUaGUgY29udGV4dCBmb3IgdGhlIGZpbHRlci5cbiAqIEByZXR1cm4ge0FycmF5fSAgICAgICAgICAgICAgICBUaGUgYXJyYXkgY29udGFpbmluZyB0aGUgcmVzdWx0cy5cbiAqL1xubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiBmYXN0RmlsdGVyIChzdWJqZWN0LCBmbiwgdGhpc0NvbnRleHQpIHtcbiAgdmFyIGxlbmd0aCA9IHN1YmplY3QubGVuZ3RoLFxuICAgICAgcmVzdWx0ID0gW10sXG4gICAgICBpdGVyYXRvciA9IHRoaXNDb250ZXh0ICE9PSB1bmRlZmluZWQgPyBiaW5kSW50ZXJuYWwzKGZuLCB0aGlzQ29udGV4dCkgOiBmbixcbiAgICAgIGk7XG4gIGZvciAoaSA9IDA7IGkgPCBsZW5ndGg7IGkrKykge1xuICAgIGlmIChpdGVyYXRvcihzdWJqZWN0W2ldLCBpLCBzdWJqZWN0KSkge1xuICAgICAgcmVzdWx0LnB1c2goc3ViamVjdFtpXSk7XG4gICAgfVxuICB9XG4gIHJldHVybiByZXN1bHQ7XG59O1xuIiwiJ3VzZSBzdHJpY3QnO1xuXG52YXIgYmluZEludGVybmFsMyA9IHJlcXVpcmUoJy4uL2Z1bmN0aW9uL2JpbmRJbnRlcm5hbDMnKTtcblxuLyoqXG4gKiAjIEZvciBFYWNoXG4gKlxuICogQSBmYXN0IGAuZm9yRWFjaCgpYCBpbXBsZW1lbnRhdGlvbi5cbiAqXG4gKiBAcGFyYW0gIHtBcnJheX0gICAgc3ViamVjdCAgICAgVGhlIGFycmF5IChvciBhcnJheS1saWtlKSB0byBpdGVyYXRlIG92ZXIuXG4gKiBAcGFyYW0gIHtGdW5jdGlvbn0gZm4gICAgICAgICAgVGhlIHZpc2l0b3IgZnVuY3Rpb24uXG4gKiBAcGFyYW0gIHtPYmplY3R9ICAgdGhpc0NvbnRleHQgVGhlIGNvbnRleHQgZm9yIHRoZSB2aXNpdG9yLlxuICovXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIGZhc3RGb3JFYWNoIChzdWJqZWN0LCBmbiwgdGhpc0NvbnRleHQpIHtcbiAgdmFyIGxlbmd0aCA9IHN1YmplY3QubGVuZ3RoLFxuICAgICAgaXRlcmF0b3IgPSB0aGlzQ29udGV4dCAhPT0gdW5kZWZpbmVkID8gYmluZEludGVybmFsMyhmbiwgdGhpc0NvbnRleHQpIDogZm4sXG4gICAgICBpO1xuICBmb3IgKGkgPSAwOyBpIDwgbGVuZ3RoOyBpKyspIHtcbiAgICBpdGVyYXRvcihzdWJqZWN0W2ldLCBpLCBzdWJqZWN0KTtcbiAgfVxufTtcbiIsIid1c2Ugc3RyaWN0JztcblxuZXhwb3J0cy5jbG9uZSA9IHJlcXVpcmUoJy4vY2xvbmUnKTtcbmV4cG9ydHMuY29uY2F0ID0gcmVxdWlyZSgnLi9jb25jYXQnKTtcbmV4cG9ydHMuZXZlcnkgPSByZXF1aXJlKCcuL2V2ZXJ5Jyk7XG5leHBvcnRzLmZpbHRlciA9IHJlcXVpcmUoJy4vZmlsdGVyJyk7XG5leHBvcnRzLmZvckVhY2ggPSByZXF1aXJlKCcuL2ZvckVhY2gnKTtcbmV4cG9ydHMuaW5kZXhPZiA9IHJlcXVpcmUoJy4vaW5kZXhPZicpO1xuZXhwb3J0cy5sYXN0SW5kZXhPZiA9IHJlcXVpcmUoJy4vbGFzdEluZGV4T2YnKTtcbmV4cG9ydHMubWFwID0gcmVxdWlyZSgnLi9tYXAnKTtcbmV4cG9ydHMucGx1Y2sgPSByZXF1aXJlKCcuL3BsdWNrJyk7XG5leHBvcnRzLnJlZHVjZSA9IHJlcXVpcmUoJy4vcmVkdWNlJyk7XG5leHBvcnRzLnJlZHVjZVJpZ2h0ID0gcmVxdWlyZSgnLi9yZWR1Y2VSaWdodCcpO1xuZXhwb3J0cy5zb21lID0gcmVxdWlyZSgnLi9zb21lJyk7XG5leHBvcnRzLmZpbGwgPSByZXF1aXJlKCcuL2ZpbGwnKTsiLCIndXNlIHN0cmljdCc7XG5cbi8qKlxuICogIyBJbmRleCBPZlxuICpcbiAqIEEgZmFzdGVyIGBBcnJheS5wcm90b3R5cGUuaW5kZXhPZigpYCBpbXBsZW1lbnRhdGlvbi5cbiAqXG4gKiBAcGFyYW0gIHtBcnJheX0gIHN1YmplY3QgICBUaGUgYXJyYXkgKG9yIGFycmF5LWxpa2UpIHRvIHNlYXJjaCB3aXRoaW4uXG4gKiBAcGFyYW0gIHttaXhlZH0gIHRhcmdldCAgICBUaGUgdGFyZ2V0IGl0ZW0gdG8gc2VhcmNoIGZvci5cbiAqIEBwYXJhbSAge051bWJlcn0gZnJvbUluZGV4IFRoZSBwb3NpdGlvbiB0byBzdGFydCBzZWFyY2hpbmcgZnJvbSwgaWYga25vd24uXG4gKiBAcmV0dXJuIHtOdW1iZXJ9ICAgICAgICAgICBUaGUgcG9zaXRpb24gb2YgdGhlIHRhcmdldCBpbiB0aGUgc3ViamVjdCwgb3IgLTEgaWYgaXQgZG9lcyBub3QgZXhpc3QuXG4gKi9cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gZmFzdEluZGV4T2YgKHN1YmplY3QsIHRhcmdldCwgZnJvbUluZGV4KSB7XG4gIHZhciBsZW5ndGggPSBzdWJqZWN0Lmxlbmd0aCxcbiAgICAgIGkgPSAwO1xuXG4gIGlmICh0eXBlb2YgZnJvbUluZGV4ID09PSAnbnVtYmVyJykge1xuICAgIGkgPSBmcm9tSW5kZXg7XG4gICAgaWYgKGkgPCAwKSB7XG4gICAgICBpICs9IGxlbmd0aDtcbiAgICAgIGlmIChpIDwgMCkge1xuICAgICAgICBpID0gMDtcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICBmb3IgKDsgaSA8IGxlbmd0aDsgaSsrKSB7XG4gICAgaWYgKHN1YmplY3RbaV0gPT09IHRhcmdldCkge1xuICAgICAgcmV0dXJuIGk7XG4gICAgfVxuICB9XG4gIHJldHVybiAtMTtcbn07XG4iLCIndXNlIHN0cmljdCc7XG5cbi8qKlxuICogIyBMYXN0IEluZGV4IE9mXG4gKlxuICogQSBmYXN0ZXIgYEFycmF5LnByb3RvdHlwZS5sYXN0SW5kZXhPZigpYCBpbXBsZW1lbnRhdGlvbi5cbiAqXG4gKiBAcGFyYW0gIHtBcnJheX0gIHN1YmplY3QgVGhlIGFycmF5IChvciBhcnJheS1saWtlKSB0byBzZWFyY2ggd2l0aGluLlxuICogQHBhcmFtICB7bWl4ZWR9ICB0YXJnZXQgIFRoZSB0YXJnZXQgaXRlbSB0byBzZWFyY2ggZm9yLlxuICogQHBhcmFtICB7TnVtYmVyfSBmcm9tSW5kZXggVGhlIHBvc2l0aW9uIHRvIHN0YXJ0IHNlYXJjaGluZyBiYWNrd2FyZHMgZnJvbSwgaWYga25vd24uXG4gKiBAcmV0dXJuIHtOdW1iZXJ9ICAgICAgICAgVGhlIGxhc3QgcG9zaXRpb24gb2YgdGhlIHRhcmdldCBpbiB0aGUgc3ViamVjdCwgb3IgLTEgaWYgaXQgZG9lcyBub3QgZXhpc3QuXG4gKi9cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gZmFzdExhc3RJbmRleE9mIChzdWJqZWN0LCB0YXJnZXQsIGZyb21JbmRleCkge1xuICB2YXIgbGVuZ3RoID0gc3ViamVjdC5sZW5ndGgsXG4gICAgICBpID0gbGVuZ3RoIC0gMTtcblxuICBpZiAodHlwZW9mIGZyb21JbmRleCA9PT0gJ251bWJlcicpIHtcbiAgICBpID0gZnJvbUluZGV4O1xuICAgIGlmIChpIDwgMCkge1xuICAgICAgaSArPSBsZW5ndGg7XG4gICAgfVxuICB9XG4gIGZvciAoOyBpID49IDA7IGktLSkge1xuICAgIGlmIChzdWJqZWN0W2ldID09PSB0YXJnZXQpIHtcbiAgICAgIHJldHVybiBpO1xuICAgIH1cbiAgfVxuICByZXR1cm4gLTE7XG59O1xuIiwiJ3VzZSBzdHJpY3QnO1xuXG52YXIgYmluZEludGVybmFsMyA9IHJlcXVpcmUoJy4uL2Z1bmN0aW9uL2JpbmRJbnRlcm5hbDMnKTtcblxuLyoqXG4gKiAjIE1hcFxuICpcbiAqIEEgZmFzdCBgLm1hcCgpYCBpbXBsZW1lbnRhdGlvbi5cbiAqXG4gKiBAcGFyYW0gIHtBcnJheX0gICAgc3ViamVjdCAgICAgVGhlIGFycmF5IChvciBhcnJheS1saWtlKSB0byBtYXAgb3Zlci5cbiAqIEBwYXJhbSAge0Z1bmN0aW9ufSBmbiAgICAgICAgICBUaGUgbWFwcGVyIGZ1bmN0aW9uLlxuICogQHBhcmFtICB7T2JqZWN0fSAgIHRoaXNDb250ZXh0IFRoZSBjb250ZXh0IGZvciB0aGUgbWFwcGVyLlxuICogQHJldHVybiB7QXJyYXl9ICAgICAgICAgICAgICAgIFRoZSBhcnJheSBjb250YWluaW5nIHRoZSByZXN1bHRzLlxuICovXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIGZhc3RNYXAgKHN1YmplY3QsIGZuLCB0aGlzQ29udGV4dCkge1xuICB2YXIgbGVuZ3RoID0gc3ViamVjdC5sZW5ndGgsXG4gICAgICByZXN1bHQgPSBuZXcgQXJyYXkobGVuZ3RoKSxcbiAgICAgIGl0ZXJhdG9yID0gdGhpc0NvbnRleHQgIT09IHVuZGVmaW5lZCA/IGJpbmRJbnRlcm5hbDMoZm4sIHRoaXNDb250ZXh0KSA6IGZuLFxuICAgICAgaTtcbiAgZm9yIChpID0gMDsgaSA8IGxlbmd0aDsgaSsrKSB7XG4gICAgcmVzdWx0W2ldID0gaXRlcmF0b3Ioc3ViamVjdFtpXSwgaSwgc3ViamVjdCk7XG4gIH1cbiAgcmV0dXJuIHJlc3VsdDtcbn07XG4iLCIndXNlIHN0cmljdCc7XG5cbi8qKlxuICogIyBQbHVja1xuICogUGx1Y2sgdGhlIHByb3BlcnR5IHdpdGggdGhlIGdpdmVuIG5hbWUgZnJvbSBhbiBhcnJheSBvZiBvYmplY3RzLlxuICpcbiAqIEBwYXJhbSAge0FycmF5fSAgaW5wdXQgVGhlIHZhbHVlcyB0byBwbHVjayBmcm9tLlxuICogQHBhcmFtICB7U3RyaW5nfSBmaWVsZCBUaGUgbmFtZSBvZiB0aGUgZmllbGQgdG8gcGx1Y2suXG4gKiBAcmV0dXJuIHtBcnJheX0gICAgICAgIFRoZSBwbHVja2VkIGFycmF5IG9mIHZhbHVlcy5cbiAqL1xubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiBmYXN0UGx1Y2sgKGlucHV0LCBmaWVsZCkge1xuICB2YXIgbGVuZ3RoID0gaW5wdXQubGVuZ3RoLFxuICAgICAgcGx1Y2tlZCA9IFtdLFxuICAgICAgY291bnQgPSAwLFxuICAgICAgdmFsdWUsIGk7XG5cbiAgZm9yIChpID0gMDsgaSA8IGxlbmd0aDsgaSsrKSB7XG4gICAgdmFsdWUgPSBpbnB1dFtpXTtcbiAgICBpZiAodmFsdWUgIT0gbnVsbCAmJiB2YWx1ZVtmaWVsZF0gIT09IHVuZGVmaW5lZCkge1xuICAgICAgcGx1Y2tlZFtjb3VudCsrXSA9IHZhbHVlW2ZpZWxkXTtcbiAgICB9XG4gIH1cbiAgcmV0dXJuIHBsdWNrZWQ7XG59OyIsIid1c2Ugc3RyaWN0JztcblxudmFyIGJpbmRJbnRlcm5hbDQgPSByZXF1aXJlKCcuLi9mdW5jdGlvbi9iaW5kSW50ZXJuYWw0Jyk7XG5cbi8qKlxuICogIyBSZWR1Y2VcbiAqXG4gKiBBIGZhc3QgYC5yZWR1Y2UoKWAgaW1wbGVtZW50YXRpb24uXG4gKlxuICogQHBhcmFtICB7QXJyYXl9ICAgIHN1YmplY3QgICAgICBUaGUgYXJyYXkgKG9yIGFycmF5LWxpa2UpIHRvIHJlZHVjZS5cbiAqIEBwYXJhbSAge0Z1bmN0aW9ufSBmbiAgICAgICAgICAgVGhlIHJlZHVjZXIgZnVuY3Rpb24uXG4gKiBAcGFyYW0gIHttaXhlZH0gICAgaW5pdGlhbFZhbHVlIFRoZSBpbml0aWFsIHZhbHVlIGZvciB0aGUgcmVkdWNlciwgZGVmYXVsdHMgdG8gc3ViamVjdFswXS5cbiAqIEBwYXJhbSAge09iamVjdH0gICB0aGlzQ29udGV4dCAgVGhlIGNvbnRleHQgZm9yIHRoZSByZWR1Y2VyLlxuICogQHJldHVybiB7bWl4ZWR9ICAgICAgICAgICAgICAgICBUaGUgZmluYWwgcmVzdWx0LlxuICovXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIGZhc3RSZWR1Y2UgKHN1YmplY3QsIGZuLCBpbml0aWFsVmFsdWUsIHRoaXNDb250ZXh0KSB7XG4gIHZhciBsZW5ndGggPSBzdWJqZWN0Lmxlbmd0aCxcbiAgICAgIGl0ZXJhdG9yID0gdGhpc0NvbnRleHQgIT09IHVuZGVmaW5lZCA/IGJpbmRJbnRlcm5hbDQoZm4sIHRoaXNDb250ZXh0KSA6IGZuLFxuICAgICAgaSwgcmVzdWx0O1xuXG4gIGlmIChpbml0aWFsVmFsdWUgPT09IHVuZGVmaW5lZCkge1xuICAgIGkgPSAxO1xuICAgIHJlc3VsdCA9IHN1YmplY3RbMF07XG4gIH1cbiAgZWxzZSB7XG4gICAgaSA9IDA7XG4gICAgcmVzdWx0ID0gaW5pdGlhbFZhbHVlO1xuICB9XG5cbiAgZm9yICg7IGkgPCBsZW5ndGg7IGkrKykge1xuICAgIHJlc3VsdCA9IGl0ZXJhdG9yKHJlc3VsdCwgc3ViamVjdFtpXSwgaSwgc3ViamVjdCk7XG4gIH1cblxuICByZXR1cm4gcmVzdWx0O1xufTtcbiIsIid1c2Ugc3RyaWN0JztcblxudmFyIGJpbmRJbnRlcm5hbDQgPSByZXF1aXJlKCcuLi9mdW5jdGlvbi9iaW5kSW50ZXJuYWw0Jyk7XG5cbi8qKlxuICogIyBSZWR1Y2UgUmlnaHRcbiAqXG4gKiBBIGZhc3QgYC5yZWR1Y2VSaWdodCgpYCBpbXBsZW1lbnRhdGlvbi5cbiAqXG4gKiBAcGFyYW0gIHtBcnJheX0gICAgc3ViamVjdCAgICAgIFRoZSBhcnJheSAob3IgYXJyYXktbGlrZSkgdG8gcmVkdWNlLlxuICogQHBhcmFtICB7RnVuY3Rpb259IGZuICAgICAgICAgICBUaGUgcmVkdWNlciBmdW5jdGlvbi5cbiAqIEBwYXJhbSAge21peGVkfSAgICBpbml0aWFsVmFsdWUgVGhlIGluaXRpYWwgdmFsdWUgZm9yIHRoZSByZWR1Y2VyLCBkZWZhdWx0cyB0byBzdWJqZWN0WzBdLlxuICogQHBhcmFtICB7T2JqZWN0fSAgIHRoaXNDb250ZXh0ICBUaGUgY29udGV4dCBmb3IgdGhlIHJlZHVjZXIuXG4gKiBAcmV0dXJuIHttaXhlZH0gICAgICAgICAgICAgICAgIFRoZSBmaW5hbCByZXN1bHQuXG4gKi9cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gZmFzdFJlZHVjZSAoc3ViamVjdCwgZm4sIGluaXRpYWxWYWx1ZSwgdGhpc0NvbnRleHQpIHtcbiAgdmFyIGxlbmd0aCA9IHN1YmplY3QubGVuZ3RoLFxuICAgICAgaXRlcmF0b3IgPSB0aGlzQ29udGV4dCAhPT0gdW5kZWZpbmVkID8gYmluZEludGVybmFsNChmbiwgdGhpc0NvbnRleHQpIDogZm4sXG4gICAgICBpLCByZXN1bHQ7XG5cbiAgaWYgKGluaXRpYWxWYWx1ZSA9PT0gdW5kZWZpbmVkKSB7XG4gICAgaSA9IGxlbmd0aCAtIDI7XG4gICAgcmVzdWx0ID0gc3ViamVjdFtsZW5ndGggLSAxXTtcbiAgfVxuICBlbHNlIHtcbiAgICBpID0gbGVuZ3RoIC0gMTtcbiAgICByZXN1bHQgPSBpbml0aWFsVmFsdWU7XG4gIH1cblxuICBmb3IgKDsgaSA+PSAwOyBpLS0pIHtcbiAgICByZXN1bHQgPSBpdGVyYXRvcihyZXN1bHQsIHN1YmplY3RbaV0sIGksIHN1YmplY3QpO1xuICB9XG5cbiAgcmV0dXJuIHJlc3VsdDtcbn07XG4iLCIndXNlIHN0cmljdCc7XG5cbnZhciBiaW5kSW50ZXJuYWwzID0gcmVxdWlyZSgnLi4vZnVuY3Rpb24vYmluZEludGVybmFsMycpO1xuXG4vKipcbiAqICMgU29tZVxuICpcbiAqIEEgZmFzdCBgLnNvbWUoKWAgaW1wbGVtZW50YXRpb24uXG4gKlxuICogQHBhcmFtICB7QXJyYXl9ICAgIHN1YmplY3QgICAgIFRoZSBhcnJheSAob3IgYXJyYXktbGlrZSkgdG8gaXRlcmF0ZSBvdmVyLlxuICogQHBhcmFtICB7RnVuY3Rpb259IGZuICAgICAgICAgIFRoZSB2aXNpdG9yIGZ1bmN0aW9uLlxuICogQHBhcmFtICB7T2JqZWN0fSAgIHRoaXNDb250ZXh0IFRoZSBjb250ZXh0IGZvciB0aGUgdmlzaXRvci5cbiAqIEByZXR1cm4ge0Jvb2xlYW59ICAgICAgICAgICAgICB0cnVlIGlmIGF0IGxlYXN0IG9uZSBpdGVtIGluIHRoZSBhcnJheSBwYXNzZXMgdGhlIHRydXRoIHRlc3QuXG4gKi9cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gZmFzdFNvbWUgKHN1YmplY3QsIGZuLCB0aGlzQ29udGV4dCkge1xuICB2YXIgbGVuZ3RoID0gc3ViamVjdC5sZW5ndGgsXG4gICAgICBpdGVyYXRvciA9IHRoaXNDb250ZXh0ICE9PSB1bmRlZmluZWQgPyBiaW5kSW50ZXJuYWwzKGZuLCB0aGlzQ29udGV4dCkgOiBmbixcbiAgICAgIGk7XG4gIGZvciAoaSA9IDA7IGkgPCBsZW5ndGg7IGkrKykge1xuICAgIGlmIChpdGVyYXRvcihzdWJqZWN0W2ldLCBpLCBzdWJqZWN0KSkge1xuICAgICAgcmV0dXJuIHRydWU7XG4gICAgfVxuICB9XG4gIHJldHVybiBmYWxzZTtcbn07XG4iLCIndXNlIHN0cmljdCc7XG5cbnZhciBjbG9uZUFycmF5ID0gcmVxdWlyZSgnLi9hcnJheS9jbG9uZScpO1xudmFyIGNsb25lT2JqZWN0ID0gcmVxdWlyZSgnLi9vYmplY3QvY2xvbmUnKTtcblxuLyoqXG4gKiAjIENsb25lXG4gKlxuICogQ2xvbmUgYW4gaXRlbS4gUHJpbWl0aXZlIHZhbHVlcyB3aWxsIGJlIHJldHVybmVkIGRpcmVjdGx5LFxuICogYXJyYXlzIGFuZCBvYmplY3RzIHdpbGwgYmUgc2hhbGxvdyBjbG9uZWQuIElmIHlvdSBrbm93IHRoZVxuICogdHlwZSBvZiBpbnB1dCB5b3UncmUgZGVhbGluZyB3aXRoLCBjYWxsIGAuY2xvbmVBcnJheSgpYCBvciBgLmNsb25lT2JqZWN0KClgXG4gKiBpbnN0ZWFkLlxuICpcbiAqIEBwYXJhbSAge21peGVkfSBpbnB1dCBUaGUgaW5wdXQgdG8gY2xvbmUuXG4gKiBAcmV0dXJuIHttaXhlZH0gICAgICAgVGhlIGNsb25lZCBpbnB1dC5cbiAqL1xubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiBjbG9uZSAoaW5wdXQpIHtcbiAgaWYgKCFpbnB1dCB8fCB0eXBlb2YgaW5wdXQgIT09ICdvYmplY3QnKSB7XG4gICAgcmV0dXJuIGlucHV0O1xuICB9XG4gIGVsc2UgaWYgKEFycmF5LmlzQXJyYXkoaW5wdXQpKSB7XG4gICAgcmV0dXJuIGNsb25lQXJyYXkoaW5wdXQpO1xuICB9XG4gIGVsc2Uge1xuICAgIHJldHVybiBjbG9uZU9iamVjdChpbnB1dCk7XG4gIH1cbn07XG4iLCIndXNlIHN0cmljdCc7XG5cbnZhciBmaWx0ZXJBcnJheSA9IHJlcXVpcmUoJy4vYXJyYXkvZmlsdGVyJyksXG4gICAgZmlsdGVyT2JqZWN0ID0gcmVxdWlyZSgnLi9vYmplY3QvZmlsdGVyJyk7XG5cbi8qKlxuICogIyBGaWx0ZXJcbiAqXG4gKiBBIGZhc3QgYC5maWx0ZXIoKWAgaW1wbGVtZW50YXRpb24uXG4gKlxuICogQHBhcmFtICB7QXJyYXl8T2JqZWN0fSBzdWJqZWN0ICAgICBUaGUgYXJyYXkgb3Igb2JqZWN0IHRvIGZpbHRlci5cbiAqIEBwYXJhbSAge0Z1bmN0aW9ufSAgICAgZm4gICAgICAgICAgVGhlIGZpbHRlciBmdW5jdGlvbi5cbiAqIEBwYXJhbSAge09iamVjdH0gICAgICAgdGhpc0NvbnRleHQgVGhlIGNvbnRleHQgZm9yIHRoZSBmaWx0ZXIuXG4gKiBAcmV0dXJuIHtBcnJheXxPYmplY3R9ICAgICAgICAgICAgIFRoZSBhcnJheSBvciBvYmplY3QgY29udGFpbmluZyB0aGUgZmlsdGVyZWQgcmVzdWx0cy5cbiAqL1xubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiBmYXN0RmlsdGVyIChzdWJqZWN0LCBmbiwgdGhpc0NvbnRleHQpIHtcbiAgaWYgKHN1YmplY3QgaW5zdGFuY2VvZiBBcnJheSkge1xuICAgIHJldHVybiBmaWx0ZXJBcnJheShzdWJqZWN0LCBmbiwgdGhpc0NvbnRleHQpO1xuICB9XG4gIGVsc2Uge1xuICAgIHJldHVybiBmaWx0ZXJPYmplY3Qoc3ViamVjdCwgZm4sIHRoaXNDb250ZXh0KTtcbiAgfVxufTsiLCIndXNlIHN0cmljdCc7XG5cbnZhciBmb3JFYWNoQXJyYXkgPSByZXF1aXJlKCcuL2FycmF5L2ZvckVhY2gnKSxcbiAgICBmb3JFYWNoT2JqZWN0ID0gcmVxdWlyZSgnLi9vYmplY3QvZm9yRWFjaCcpO1xuXG4vKipcbiAqICMgRm9yRWFjaFxuICpcbiAqIEEgZmFzdCBgLmZvckVhY2goKWAgaW1wbGVtZW50YXRpb24uXG4gKlxuICogQHBhcmFtICB7QXJyYXl8T2JqZWN0fSBzdWJqZWN0ICAgICBUaGUgYXJyYXkgb3Igb2JqZWN0IHRvIGl0ZXJhdGUgb3Zlci5cbiAqIEBwYXJhbSAge0Z1bmN0aW9ufSAgICAgZm4gICAgICAgICAgVGhlIHZpc2l0b3IgZnVuY3Rpb24uXG4gKiBAcGFyYW0gIHtPYmplY3R9ICAgICAgIHRoaXNDb250ZXh0IFRoZSBjb250ZXh0IGZvciB0aGUgdmlzaXRvci5cbiAqL1xubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiBmYXN0Rm9yRWFjaCAoc3ViamVjdCwgZm4sIHRoaXNDb250ZXh0KSB7XG4gIGlmIChzdWJqZWN0IGluc3RhbmNlb2YgQXJyYXkpIHtcbiAgICByZXR1cm4gZm9yRWFjaEFycmF5KHN1YmplY3QsIGZuLCB0aGlzQ29udGV4dCk7XG4gIH1cbiAgZWxzZSB7XG4gICAgcmV0dXJuIGZvckVhY2hPYmplY3Qoc3ViamVjdCwgZm4sIHRoaXNDb250ZXh0KTtcbiAgfVxufTsiLCIndXNlIHN0cmljdCc7XG5cbnZhciBhcHBseVdpdGhDb250ZXh0ID0gcmVxdWlyZSgnLi9hcHBseVdpdGhDb250ZXh0Jyk7XG52YXIgYXBwbHlOb0NvbnRleHQgPSByZXF1aXJlKCcuL2FwcGx5Tm9Db250ZXh0Jyk7XG5cbi8qKlxuICogIyBBcHBseVxuICpcbiAqIEZhc3RlciB2ZXJzaW9uIG9mIGBGdW5jdGlvbjo6YXBwbHkoKWAsIG9wdGltaXNlZCBmb3IgOCBhcmd1bWVudHMgb3IgZmV3ZXIuXG4gKlxuICpcbiAqIEBwYXJhbSAge0Z1bmN0aW9ufSBzdWJqZWN0ICAgVGhlIGZ1bmN0aW9uIHRvIGFwcGx5LlxuICogQHBhcmFtICB7T2JqZWN0fSB0aGlzQ29udGV4dCBUaGUgY29udGV4dCBmb3IgdGhlIGZ1bmN0aW9uLCBzZXQgdG8gdW5kZWZpbmVkIG9yIG51bGwgaWYgbm8gY29udGV4dCBpcyByZXF1aXJlZC5cbiAqIEBwYXJhbSAge0FycmF5fSBhcmdzICAgICAgICAgVGhlIGFyZ3VtZW50cyBmb3IgdGhlIGZ1bmN0aW9uLlxuICogQHJldHVybiB7bWl4ZWR9ICAgICAgICAgICAgICBUaGUgcmVzdWx0IG9mIHRoZSBmdW5jdGlvbiBpbnZvY2F0aW9uLlxuICovXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIGZhc3RBcHBseSAoc3ViamVjdCwgdGhpc0NvbnRleHQsIGFyZ3MpIHtcbiAgcmV0dXJuIHRoaXNDb250ZXh0ICE9PSB1bmRlZmluZWQgPyBhcHBseVdpdGhDb250ZXh0KHN1YmplY3QsIHRoaXNDb250ZXh0LCBhcmdzKSA6IGFwcGx5Tm9Db250ZXh0KHN1YmplY3QsIGFyZ3MpO1xufTtcbiIsIid1c2Ugc3RyaWN0JztcblxuLyoqXG4gKiBJbnRlcm5hbCBoZWxwZXIgZm9yIGFwcGx5aW5nIGEgZnVuY3Rpb24gd2l0aG91dCBhIGNvbnRleHQuXG4gKi9cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gYXBwbHlOb0NvbnRleHQgKHN1YmplY3QsIGFyZ3MpIHtcbiAgc3dpdGNoIChhcmdzLmxlbmd0aCkge1xuICAgIGNhc2UgMDpcbiAgICAgIHJldHVybiBzdWJqZWN0KCk7XG4gICAgY2FzZSAxOlxuICAgICAgcmV0dXJuIHN1YmplY3QoYXJnc1swXSk7XG4gICAgY2FzZSAyOlxuICAgICAgcmV0dXJuIHN1YmplY3QoYXJnc1swXSwgYXJnc1sxXSk7XG4gICAgY2FzZSAzOlxuICAgICAgcmV0dXJuIHN1YmplY3QoYXJnc1swXSwgYXJnc1sxXSwgYXJnc1syXSk7XG4gICAgY2FzZSA0OlxuICAgICAgcmV0dXJuIHN1YmplY3QoYXJnc1swXSwgYXJnc1sxXSwgYXJnc1syXSwgYXJnc1szXSk7XG4gICAgY2FzZSA1OlxuICAgICAgcmV0dXJuIHN1YmplY3QoYXJnc1swXSwgYXJnc1sxXSwgYXJnc1syXSwgYXJnc1szXSwgYXJnc1s0XSk7XG4gICAgY2FzZSA2OlxuICAgICAgcmV0dXJuIHN1YmplY3QoYXJnc1swXSwgYXJnc1sxXSwgYXJnc1syXSwgYXJnc1szXSwgYXJnc1s0XSwgYXJnc1s1XSk7XG4gICAgY2FzZSA3OlxuICAgICAgcmV0dXJuIHN1YmplY3QoYXJnc1swXSwgYXJnc1sxXSwgYXJnc1syXSwgYXJnc1szXSwgYXJnc1s0XSwgYXJnc1s1XSwgYXJnc1s2XSk7XG4gICAgY2FzZSA4OlxuICAgICAgcmV0dXJuIHN1YmplY3QoYXJnc1swXSwgYXJnc1sxXSwgYXJnc1syXSwgYXJnc1szXSwgYXJnc1s0XSwgYXJnc1s1XSwgYXJnc1s2XSwgYXJnc1s3XSk7XG4gICAgZGVmYXVsdDpcbiAgICAgIHJldHVybiBzdWJqZWN0LmFwcGx5KHVuZGVmaW5lZCwgYXJncyk7XG4gIH1cbn07XG4iLCIndXNlIHN0cmljdCc7XG5cbi8qKlxuICogSW50ZXJuYWwgaGVscGVyIGZvciBhcHBseWluZyBhIGZ1bmN0aW9uIHdpdGggYSBjb250ZXh0LlxuICovXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIGFwcGx5V2l0aENvbnRleHQgKHN1YmplY3QsIHRoaXNDb250ZXh0LCBhcmdzKSB7XG4gIHN3aXRjaCAoYXJncy5sZW5ndGgpIHtcbiAgICBjYXNlIDA6XG4gICAgICByZXR1cm4gc3ViamVjdC5jYWxsKHRoaXNDb250ZXh0KTtcbiAgICBjYXNlIDE6XG4gICAgICByZXR1cm4gc3ViamVjdC5jYWxsKHRoaXNDb250ZXh0LCBhcmdzWzBdKTtcbiAgICBjYXNlIDI6XG4gICAgICByZXR1cm4gc3ViamVjdC5jYWxsKHRoaXNDb250ZXh0LCBhcmdzWzBdLCBhcmdzWzFdKTtcbiAgICBjYXNlIDM6XG4gICAgICByZXR1cm4gc3ViamVjdC5jYWxsKHRoaXNDb250ZXh0LCBhcmdzWzBdLCBhcmdzWzFdLCBhcmdzWzJdKTtcbiAgICBjYXNlIDQ6XG4gICAgICByZXR1cm4gc3ViamVjdC5jYWxsKHRoaXNDb250ZXh0LCBhcmdzWzBdLCBhcmdzWzFdLCBhcmdzWzJdLCBhcmdzWzNdKTtcbiAgICBjYXNlIDU6XG4gICAgICByZXR1cm4gc3ViamVjdC5jYWxsKHRoaXNDb250ZXh0LCBhcmdzWzBdLCBhcmdzWzFdLCBhcmdzWzJdLCBhcmdzWzNdLCBhcmdzWzRdKTtcbiAgICBjYXNlIDY6XG4gICAgICByZXR1cm4gc3ViamVjdC5jYWxsKHRoaXNDb250ZXh0LCBhcmdzWzBdLCBhcmdzWzFdLCBhcmdzWzJdLCBhcmdzWzNdLCBhcmdzWzRdLCBhcmdzWzVdKTtcbiAgICBjYXNlIDc6XG4gICAgICByZXR1cm4gc3ViamVjdC5jYWxsKHRoaXNDb250ZXh0LCBhcmdzWzBdLCBhcmdzWzFdLCBhcmdzWzJdLCBhcmdzWzNdLCBhcmdzWzRdLCBhcmdzWzVdLCBhcmdzWzZdKTtcbiAgICBjYXNlIDg6XG4gICAgICByZXR1cm4gc3ViamVjdC5jYWxsKHRoaXNDb250ZXh0LCBhcmdzWzBdLCBhcmdzWzFdLCBhcmdzWzJdLCBhcmdzWzNdLCBhcmdzWzRdLCBhcmdzWzVdLCBhcmdzWzZdLCBhcmdzWzddKTtcbiAgICBkZWZhdWx0OlxuICAgICAgcmV0dXJuIHN1YmplY3QuYXBwbHkodGhpc0NvbnRleHQsIGFyZ3MpO1xuICB9XG59O1xuIiwiJ3VzZSBzdHJpY3QnO1xuXG52YXIgYXBwbHlXaXRoQ29udGV4dCA9IHJlcXVpcmUoJy4vYXBwbHlXaXRoQ29udGV4dCcpO1xudmFyIGFwcGx5Tm9Db250ZXh0ID0gcmVxdWlyZSgnLi9hcHBseU5vQ29udGV4dCcpO1xuXG4vKipcbiAqICMgQmluZFxuICogQW5hbG9ndWUgb2YgYEZ1bmN0aW9uOjpiaW5kKClgLlxuICpcbiAqIGBgYGpzXG4gKiB2YXIgYmluZCA9IHJlcXVpcmUoJ2Zhc3QuanMnKS5iaW5kO1xuICogdmFyIGJvdW5kID0gYmluZChteWZ1bmMsIHRoaXMsIDEsIDIsIDMpO1xuICpcbiAqIGJvdW5kKDQpO1xuICogYGBgXG4gKlxuICpcbiAqIEBwYXJhbSAge0Z1bmN0aW9ufSBmbiAgICAgICAgICBUaGUgZnVuY3Rpb24gd2hpY2ggc2hvdWxkIGJlIGJvdW5kLlxuICogQHBhcmFtICB7T2JqZWN0fSAgIHRoaXNDb250ZXh0IFRoZSBjb250ZXh0IHRvIGJpbmQgdGhlIGZ1bmN0aW9uIHRvLlxuICogQHBhcmFtICB7bWl4ZWR9ICAgIGFyZ3MsIC4uLiAgIEFkZGl0aW9uYWwgYXJndW1lbnRzIHRvIHByZS1iaW5kLlxuICogQHJldHVybiB7RnVuY3Rpb259ICAgICAgICAgICAgIFRoZSBib3VuZCBmdW5jdGlvbi5cbiAqL1xubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiBmYXN0QmluZCAoZm4sIHRoaXNDb250ZXh0KSB7XG4gIHZhciBib3VuZExlbmd0aCA9IGFyZ3VtZW50cy5sZW5ndGggLSAyLFxuICAgICAgYm91bmRBcmdzO1xuXG4gIGlmIChib3VuZExlbmd0aCA+IDApIHtcbiAgICBib3VuZEFyZ3MgPSBuZXcgQXJyYXkoYm91bmRMZW5ndGgpO1xuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgYm91bmRMZW5ndGg7IGkrKykge1xuICAgICAgYm91bmRBcmdzW2ldID0gYXJndW1lbnRzW2kgKyAyXTtcbiAgICB9XG4gICAgaWYgKHRoaXNDb250ZXh0ICE9PSB1bmRlZmluZWQpIHtcbiAgICAgIHJldHVybiBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHZhciBsZW5ndGggPSBhcmd1bWVudHMubGVuZ3RoLFxuICAgICAgICAgICAgYXJncyA9IG5ldyBBcnJheShib3VuZExlbmd0aCArIGxlbmd0aCksXG4gICAgICAgICAgICBpO1xuICAgICAgICBmb3IgKGkgPSAwOyBpIDwgYm91bmRMZW5ndGg7IGkrKykge1xuICAgICAgICAgIGFyZ3NbaV0gPSBib3VuZEFyZ3NbaV07XG4gICAgICAgIH1cbiAgICAgICAgZm9yIChpID0gMDsgaSA8IGxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgYXJnc1tib3VuZExlbmd0aCArIGldID0gYXJndW1lbnRzW2ldO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBhcHBseVdpdGhDb250ZXh0KGZuLCB0aGlzQ29udGV4dCwgYXJncyk7XG4gICAgICB9O1xuICAgIH1cbiAgICBlbHNlIHtcbiAgICAgIHJldHVybiBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHZhciBsZW5ndGggPSBhcmd1bWVudHMubGVuZ3RoLFxuICAgICAgICAgICAgYXJncyA9IG5ldyBBcnJheShib3VuZExlbmd0aCArIGxlbmd0aCksXG4gICAgICAgICAgICBpO1xuICAgICAgICBmb3IgKGkgPSAwOyBpIDwgYm91bmRMZW5ndGg7IGkrKykge1xuICAgICAgICAgIGFyZ3NbaV0gPSBib3VuZEFyZ3NbaV07XG4gICAgICAgIH1cbiAgICAgICAgZm9yIChpID0gMDsgaSA8IGxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgYXJnc1tib3VuZExlbmd0aCArIGldID0gYXJndW1lbnRzW2ldO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBhcHBseU5vQ29udGV4dChmbiwgYXJncyk7XG4gICAgICB9O1xuICAgIH1cbiAgfVxuICBpZiAodGhpc0NvbnRleHQgIT09IHVuZGVmaW5lZCkge1xuICAgIHJldHVybiBmdW5jdGlvbiAoKSB7XG4gICAgICByZXR1cm4gYXBwbHlXaXRoQ29udGV4dChmbiwgdGhpc0NvbnRleHQsIGFyZ3VtZW50cyk7XG4gICAgfTtcbiAgfVxuICBlbHNlIHtcbiAgICByZXR1cm4gZnVuY3Rpb24gKCkge1xuICAgICAgcmV0dXJuIGFwcGx5Tm9Db250ZXh0KGZuLCBhcmd1bWVudHMpO1xuICAgIH07XG4gIH1cbn07XG4iLCIndXNlIHN0cmljdCc7XG5cbi8qKlxuICogSW50ZXJuYWwgaGVscGVyIHRvIGJpbmQgYSBmdW5jdGlvbiBrbm93biB0byBoYXZlIDMgYXJndW1lbnRzXG4gKiB0byBhIGdpdmVuIGNvbnRleHQuXG4gKi9cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gYmluZEludGVybmFsMyAoZnVuYywgdGhpc0NvbnRleHQpIHtcbiAgcmV0dXJuIGZ1bmN0aW9uIChhLCBiLCBjKSB7XG4gICAgcmV0dXJuIGZ1bmMuY2FsbCh0aGlzQ29udGV4dCwgYSwgYiwgYyk7XG4gIH07XG59O1xuIiwiJ3VzZSBzdHJpY3QnO1xuXG4vKipcbiAqIEludGVybmFsIGhlbHBlciB0byBiaW5kIGEgZnVuY3Rpb24ga25vd24gdG8gaGF2ZSA0IGFyZ3VtZW50c1xuICogdG8gYSBnaXZlbiBjb250ZXh0LlxuICovXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIGJpbmRJbnRlcm5hbDQgKGZ1bmMsIHRoaXNDb250ZXh0KSB7XG4gIHJldHVybiBmdW5jdGlvbiAoYSwgYiwgYywgZCkge1xuICAgIHJldHVybiBmdW5jLmNhbGwodGhpc0NvbnRleHQsIGEsIGIsIGMsIGQpO1xuICB9O1xufTtcbiIsIid1c2Ugc3RyaWN0JztcblxuZXhwb3J0cy5hcHBseSA9IHJlcXVpcmUoJy4vYXBwbHknKTtcbmV4cG9ydHMuYmluZCA9IHJlcXVpcmUoJy4vYmluZCcpO1xuZXhwb3J0cy5wYXJ0aWFsID0gcmVxdWlyZSgnLi9wYXJ0aWFsJyk7XG5leHBvcnRzLnBhcnRpYWxDb25zdHJ1Y3RvciA9IHJlcXVpcmUoJy4vcGFydGlhbENvbnN0cnVjdG9yJyk7XG5leHBvcnRzLnRyeSA9IHJlcXVpcmUoJy4vdHJ5Jyk7XG4iLCIndXNlIHN0cmljdCc7XG5cbnZhciBhcHBseVdpdGhDb250ZXh0ID0gcmVxdWlyZSgnLi9hcHBseVdpdGhDb250ZXh0Jyk7XG5cbi8qKlxuICogIyBQYXJ0aWFsIEFwcGxpY2F0aW9uXG4gKlxuICogUGFydGlhbGx5IGFwcGx5IGEgZnVuY3Rpb24uIFRoaXMgaXMgc2ltaWxhciB0byBgLmJpbmQoKWAsXG4gKiBidXQgd2l0aCBvbmUgaW1wb3J0YW50IGRpZmZlcmVuY2UgLSB0aGUgcmV0dXJuZWQgZnVuY3Rpb24gaXMgbm90IGJvdW5kXG4gKiB0byBhIHBhcnRpY3VsYXIgY29udGV4dC4gVGhpcyBtYWtlcyBpdCBlYXN5IHRvIGFkZCBwYXJ0aWFsbHlcbiAqIGFwcGxpZWQgbWV0aG9kcyB0byBvYmplY3RzLiBJZiB5b3UgbmVlZCB0byBiaW5kIHRvIGEgY29udGV4dCxcbiAqIHVzZSBgLmJpbmQoKWAgaW5zdGVhZC5cbiAqXG4gKiA+IE5vdGU6IFRoaXMgZnVuY3Rpb24gZG9lcyBub3Qgc3VwcG9ydCBwYXJ0aWFsIGFwcGxpY2F0aW9uIGZvclxuICogY29uc3RydWN0b3JzLCBmb3IgdGhhdCBzZWUgYHBhcnRpYWxDb25zdHJ1Y3RvcigpYFxuICpcbiAqXG4gKiBAcGFyYW0gIHtGdW5jdGlvbn0gZm4gICAgICAgICAgVGhlIGZ1bmN0aW9uIHRvIHBhcnRpYWxseSBhcHBseS5cbiAqIEBwYXJhbSAge21peGVkfSAgICBhcmdzLCAuLi4gICBBcmd1bWVudHMgdG8gcHJlLWJpbmQuXG4gKiBAcmV0dXJuIHtGdW5jdGlvbn0gICAgICAgICAgICAgVGhlIHBhcnRpYWxseSBhcHBsaWVkIGZ1bmN0aW9uLlxuICovXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIGZhc3RQYXJ0aWFsIChmbikge1xuICB2YXIgYm91bmRMZW5ndGggPSBhcmd1bWVudHMubGVuZ3RoIC0gMSxcbiAgICAgIGJvdW5kQXJncztcblxuICBib3VuZEFyZ3MgPSBuZXcgQXJyYXkoYm91bmRMZW5ndGgpO1xuICBmb3IgKHZhciBpID0gMDsgaSA8IGJvdW5kTGVuZ3RoOyBpKyspIHtcbiAgICBib3VuZEFyZ3NbaV0gPSBhcmd1bWVudHNbaSArIDFdO1xuICB9XG4gIHJldHVybiBmdW5jdGlvbiAoKSB7XG4gICAgdmFyIGxlbmd0aCA9IGFyZ3VtZW50cy5sZW5ndGgsXG4gICAgICAgIGFyZ3MgPSBuZXcgQXJyYXkoYm91bmRMZW5ndGggKyBsZW5ndGgpLFxuICAgICAgICBpO1xuICAgIGZvciAoaSA9IDA7IGkgPCBib3VuZExlbmd0aDsgaSsrKSB7XG4gICAgICBhcmdzW2ldID0gYm91bmRBcmdzW2ldO1xuICAgIH1cbiAgICBmb3IgKGkgPSAwOyBpIDwgbGVuZ3RoOyBpKyspIHtcbiAgICAgIGFyZ3NbYm91bmRMZW5ndGggKyBpXSA9IGFyZ3VtZW50c1tpXTtcbiAgICB9XG4gICAgcmV0dXJuIGFwcGx5V2l0aENvbnRleHQoZm4sIHRoaXMsIGFyZ3MpO1xuICB9O1xufTtcbiIsIid1c2Ugc3RyaWN0JztcblxudmFyIGFwcGx5V2l0aENvbnRleHQgPSByZXF1aXJlKCcuL2FwcGx5V2l0aENvbnRleHQnKTtcblxuLyoqXG4gKiAjIFBhcnRpYWwgQ29uc3RydWN0b3JcbiAqXG4gKiBQYXJ0aWFsbHkgYXBwbHkgYSBjb25zdHJ1Y3RvciBmdW5jdGlvbi4gVGhlIHJldHVybmVkIGZ1bmN0aW9uXG4gKiB3aWxsIHdvcmsgd2l0aCBvciB3aXRob3V0IHRoZSBgbmV3YCBrZXl3b3JkLlxuICpcbiAqXG4gKiBAcGFyYW0gIHtGdW5jdGlvbn0gZm4gICAgICAgICAgVGhlIGNvbnN0cnVjdG9yIGZ1bmN0aW9uIHRvIHBhcnRpYWxseSBhcHBseS5cbiAqIEBwYXJhbSAge21peGVkfSAgICBhcmdzLCAuLi4gICBBcmd1bWVudHMgdG8gcHJlLWJpbmQuXG4gKiBAcmV0dXJuIHtGdW5jdGlvbn0gICAgICAgICAgICAgVGhlIHBhcnRpYWxseSBhcHBsaWVkIGNvbnN0cnVjdG9yLlxuICovXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIGZhc3RQYXJ0aWFsQ29uc3RydWN0b3IgKGZuKSB7XG4gIHZhciBib3VuZExlbmd0aCA9IGFyZ3VtZW50cy5sZW5ndGggLSAxLFxuICAgICAgYm91bmRBcmdzO1xuXG4gIGJvdW5kQXJncyA9IG5ldyBBcnJheShib3VuZExlbmd0aCk7XG4gIGZvciAodmFyIGkgPSAwOyBpIDwgYm91bmRMZW5ndGg7IGkrKykge1xuICAgIGJvdW5kQXJnc1tpXSA9IGFyZ3VtZW50c1tpICsgMV07XG4gIH1cbiAgcmV0dXJuIGZ1bmN0aW9uIHBhcnRpYWxlZCAoKSB7XG4gICAgdmFyIGxlbmd0aCA9IGFyZ3VtZW50cy5sZW5ndGgsXG4gICAgICAgIGFyZ3MgPSBuZXcgQXJyYXkoYm91bmRMZW5ndGggKyBsZW5ndGgpLFxuICAgICAgICBpO1xuICAgIGZvciAoaSA9IDA7IGkgPCBib3VuZExlbmd0aDsgaSsrKSB7XG4gICAgICBhcmdzW2ldID0gYm91bmRBcmdzW2ldO1xuICAgIH1cbiAgICBmb3IgKGkgPSAwOyBpIDwgbGVuZ3RoOyBpKyspIHtcbiAgICAgIGFyZ3NbYm91bmRMZW5ndGggKyBpXSA9IGFyZ3VtZW50c1tpXTtcbiAgICB9XG5cbiAgICB2YXIgdGhpc0NvbnRleHQgPSBPYmplY3QuY3JlYXRlKGZuLnByb3RvdHlwZSksXG4gICAgICAgIHJlc3VsdCA9IGFwcGx5V2l0aENvbnRleHQoZm4sIHRoaXNDb250ZXh0LCBhcmdzKTtcblxuICAgIGlmIChyZXN1bHQgIT0gbnVsbCAmJiAodHlwZW9mIHJlc3VsdCA9PT0gJ29iamVjdCcgfHwgdHlwZW9mIHJlc3VsdCA9PT0gJ2Z1bmN0aW9uJykpIHtcbiAgICAgIHJldHVybiByZXN1bHQ7XG4gICAgfVxuICAgIGVsc2Uge1xuICAgICAgcmV0dXJuIHRoaXNDb250ZXh0O1xuICAgIH1cbiAgfTtcbn07XG4iLCIndXNlIHN0cmljdCc7XG5cbi8qKlxuICogIyBUcnlcbiAqXG4gKiBBbGxvd3MgZnVuY3Rpb25zIHRvIGJlIG9wdGltaXNlZCBieSBpc29sYXRpbmcgYHRyeSB7fSBjYXRjaCAoZSkge31gIGJsb2Nrc1xuICogb3V0c2lkZSB0aGUgZnVuY3Rpb24gZGVjbGFyYXRpb24uIFJldHVybnMgZWl0aGVyIHRoZSByZXN1bHQgb2YgdGhlIGZ1bmN0aW9uIG9yIGFuIEVycm9yXG4gKiBvYmplY3QgaWYgb25lIHdhcyB0aHJvd24uIFRoZSBjYWxsZXIgc2hvdWxkIHRoZW4gY2hlY2sgZm9yIGByZXN1bHQgaW5zdGFuY2VvZiBFcnJvcmAuXG4gKlxuICogYGBganNcbiAqIHZhciByZXN1bHQgPSBmYXN0LnRyeShteUZ1bmN0aW9uKTtcbiAqIGlmIChyZXN1bHQgaW5zdGFuY2VvZiBFcnJvcikge1xuICogICAgY29uc29sZS5sb2coJ3NvbWV0aGluZyB3ZW50IHdyb25nJyk7XG4gKiB9XG4gKiBlbHNlIHtcbiAqICAgY29uc29sZS5sb2coJ3Jlc3VsdDonLCByZXN1bHQpO1xuICogfVxuICogYGBgXG4gKlxuICogQHBhcmFtICB7RnVuY3Rpb259IGZuIFRoZSBmdW5jdGlvbiB0byBpbnZva2UuXG4gKiBAcmV0dXJuIHttaXhlZH0gICAgICAgVGhlIHJlc3VsdCBvZiB0aGUgZnVuY3Rpb24sIG9yIGFuIGBFcnJvcmAgb2JqZWN0LlxuICovXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIGZhc3RUcnkgKGZuKSB7XG4gIHRyeSB7XG4gICAgcmV0dXJuIGZuKCk7XG4gIH1cbiAgY2F0Y2ggKGUpIHtcbiAgICBpZiAoIShlIGluc3RhbmNlb2YgRXJyb3IpKSB7XG4gICAgICByZXR1cm4gbmV3IEVycm9yKGUpO1xuICAgIH1cbiAgICBlbHNlIHtcbiAgICAgIHJldHVybiBlO1xuICAgIH1cbiAgfVxufTtcbiIsIid1c2Ugc3RyaWN0JztcblxuLyoqXG4gKiAjIENvbnN0cnVjdG9yXG4gKlxuICogUHJvdmlkZWQgYXMgYSBjb252ZW5pZW50IHdyYXBwZXIgYXJvdW5kIEZhc3QgZnVuY3Rpb25zLlxuICpcbiAqIGBgYGpzXG4gKiB2YXIgYXJyID0gZmFzdChbMSwyLDMsNCw1LDZdKTtcbiAqXG4gKiB2YXIgcmVzdWx0ID0gYXJyLmZpbHRlcihmdW5jdGlvbiAoaXRlbSkge1xuICogICByZXR1cm4gaXRlbSAlIDIgPT09IDA7XG4gKiB9KTtcbiAqXG4gKiByZXN1bHQgaW5zdGFuY2VvZiBGYXN0OyAvLyB0cnVlXG4gKiByZXN1bHQubGVuZ3RoOyAvLyAzXG4gKiBgYGBcbiAqXG4gKlxuICogQHBhcmFtIHtBcnJheX0gdmFsdWUgVGhlIHZhbHVlIHRvIHdyYXAuXG4gKi9cbmZ1bmN0aW9uIEZhc3QgKHZhbHVlKSB7XG4gIGlmICghKHRoaXMgaW5zdGFuY2VvZiBGYXN0KSkge1xuICAgIHJldHVybiBuZXcgRmFzdCh2YWx1ZSk7XG4gIH1cbiAgdGhpcy52YWx1ZSA9IHZhbHVlIHx8IFtdO1xufVxuXG5tb2R1bGUuZXhwb3J0cyA9IGV4cG9ydHMgPSBGYXN0O1xuXG5GYXN0LmFycmF5ID0gcmVxdWlyZSgnLi9hcnJheScpO1xuRmFzdFsnZnVuY3Rpb24nXSA9IEZhc3QuZm4gPSByZXF1aXJlKCcuL2Z1bmN0aW9uJyk7XG5GYXN0Lm9iamVjdCA9IHJlcXVpcmUoJy4vb2JqZWN0Jyk7XG5GYXN0LnN0cmluZyA9IHJlcXVpcmUoJy4vc3RyaW5nJyk7XG5cblxuRmFzdC5hcHBseSA9IEZhc3RbJ2Z1bmN0aW9uJ10uYXBwbHk7XG5GYXN0LmJpbmQgPSBGYXN0WydmdW5jdGlvbiddLmJpbmQ7XG5GYXN0LnBhcnRpYWwgPSBGYXN0WydmdW5jdGlvbiddLnBhcnRpYWw7XG5GYXN0LnBhcnRpYWxDb25zdHJ1Y3RvciA9IEZhc3RbJ2Z1bmN0aW9uJ10ucGFydGlhbENvbnN0cnVjdG9yO1xuRmFzdFsndHJ5J10gPSBGYXN0LmF0dGVtcHQgPSBGYXN0WydmdW5jdGlvbiddWyd0cnknXTtcblxuRmFzdC5hc3NpZ24gPSBGYXN0Lm9iamVjdC5hc3NpZ247XG5GYXN0LmNsb25lT2JqZWN0ID0gRmFzdC5vYmplY3QuY2xvbmU7IC8vIEBkZXByZWNhdGVkIHVzZSBmYXN0Lm9iamVjdC5jbG9uZSgpXG5GYXN0LmtleXMgPSBGYXN0Lm9iamVjdC5rZXlzO1xuRmFzdC52YWx1ZXMgPSBGYXN0Lm9iamVjdC52YWx1ZXM7XG5cblxuRmFzdC5jbG9uZSA9IHJlcXVpcmUoJy4vY2xvbmUnKTtcbkZhc3QubWFwID0gcmVxdWlyZSgnLi9tYXAnKTtcbkZhc3QuZmlsdGVyID0gcmVxdWlyZSgnLi9maWx0ZXInKTtcbkZhc3QuZm9yRWFjaCA9IHJlcXVpcmUoJy4vZm9yRWFjaCcpO1xuRmFzdC5yZWR1Y2UgPSByZXF1aXJlKCcuL3JlZHVjZScpO1xuRmFzdC5yZWR1Y2VSaWdodCA9IHJlcXVpcmUoJy4vcmVkdWNlUmlnaHQnKTtcblxuXG5GYXN0LmNsb25lQXJyYXkgPSBGYXN0LmFycmF5LmNsb25lOyAvLyBAZGVwcmVjYXRlZCB1c2UgZmFzdC5hcnJheS5jbG9uZSgpXG5cbkZhc3QuY29uY2F0ID0gRmFzdC5hcnJheS5jb25jYXQ7XG5GYXN0LnNvbWUgPSBGYXN0LmFycmF5LnNvbWU7XG5GYXN0LmV2ZXJ5ID0gRmFzdC5hcnJheS5ldmVyeTtcbkZhc3QuaW5kZXhPZiA9IEZhc3QuYXJyYXkuaW5kZXhPZjtcbkZhc3QubGFzdEluZGV4T2YgPSBGYXN0LmFycmF5Lmxhc3RJbmRleE9mO1xuRmFzdC5wbHVjayA9IEZhc3QuYXJyYXkucGx1Y2s7XG5GYXN0LmZpbGwgPSBGYXN0LmFycmF5LmZpbGw7XG5cbkZhc3QuaW50ZXJuID0gRmFzdC5zdHJpbmcuaW50ZXJuO1xuXG5cbi8qKlxuICogIyBDb25jYXRcbiAqXG4gKiBDb25jYXRlbmF0ZSBtdWx0aXBsZSBhcnJheXMuXG4gKlxuICogQHBhcmFtICB7QXJyYXl8bWl4ZWR9IGl0ZW0sIC4uLiBUaGUgaXRlbShzKSB0byBjb25jYXRlbmF0ZS5cbiAqIEByZXR1cm4ge0Zhc3R9ICAgICAgICAgICAgICAgICAgQSBuZXcgRmFzdCBvYmplY3QsIGNvbnRhaW5pbmcgdGhlIHJlc3VsdHMuXG4gKi9cbkZhc3QucHJvdG90eXBlLmNvbmNhdCA9IGZ1bmN0aW9uIEZhc3QkY29uY2F0ICgpIHtcbiAgdmFyIGxlbmd0aCA9IHRoaXMudmFsdWUubGVuZ3RoLFxuICAgICAgYXJyID0gbmV3IEFycmF5KGxlbmd0aCksXG4gICAgICBpLCBpdGVtLCBjaGlsZExlbmd0aCwgajtcblxuICBmb3IgKGkgPSAwOyBpIDwgbGVuZ3RoOyBpKyspIHtcbiAgICBhcnJbaV0gPSB0aGlzLnZhbHVlW2ldO1xuICB9XG5cbiAgbGVuZ3RoID0gYXJndW1lbnRzLmxlbmd0aDtcbiAgZm9yIChpID0gMDsgaSA8IGxlbmd0aDsgaSsrKSB7XG4gICAgaXRlbSA9IGFyZ3VtZW50c1tpXTtcbiAgICBpZiAoQXJyYXkuaXNBcnJheShpdGVtKSkge1xuICAgICAgY2hpbGRMZW5ndGggPSBpdGVtLmxlbmd0aDtcbiAgICAgIGZvciAoaiA9IDA7IGogPCBjaGlsZExlbmd0aDsgaisrKSB7XG4gICAgICAgIGFyci5wdXNoKGl0ZW1bal0pO1xuICAgICAgfVxuICAgIH1cbiAgICBlbHNlIHtcbiAgICAgIGFyci5wdXNoKGl0ZW0pO1xuICAgIH1cbiAgfVxuICByZXR1cm4gbmV3IEZhc3QoYXJyKTtcbn07XG5cbi8qKlxuICogRmFzdCBNYXBcbiAqXG4gKiBAcGFyYW0gIHtGdW5jdGlvbn0gZm4gICAgICAgICAgVGhlIHZpc2l0b3IgZnVuY3Rpb24uXG4gKiBAcGFyYW0gIHtPYmplY3R9ICAgdGhpc0NvbnRleHQgVGhlIGNvbnRleHQgZm9yIHRoZSB2aXNpdG9yLCBpZiBhbnkuXG4gKiBAcmV0dXJuIHtGYXN0fSAgICAgICAgICAgICAgICAgQSBuZXcgRmFzdCBvYmplY3QsIGNvbnRhaW5pbmcgdGhlIHJlc3VsdHMuXG4gKi9cbkZhc3QucHJvdG90eXBlLm1hcCA9IGZ1bmN0aW9uIEZhc3QkbWFwIChmbiwgdGhpc0NvbnRleHQpIHtcbiAgcmV0dXJuIG5ldyBGYXN0KEZhc3QubWFwKHRoaXMudmFsdWUsIGZuLCB0aGlzQ29udGV4dCkpO1xufTtcblxuLyoqXG4gKiBGYXN0IEZpbHRlclxuICpcbiAqIEBwYXJhbSAge0Z1bmN0aW9ufSBmbiAgICAgICAgICBUaGUgZmlsdGVyIGZ1bmN0aW9uLlxuICogQHBhcmFtICB7T2JqZWN0fSAgIHRoaXNDb250ZXh0IFRoZSBjb250ZXh0IGZvciB0aGUgZmlsdGVyIGZ1bmN0aW9uLCBpZiBhbnkuXG4gKiBAcmV0dXJuIHtGYXN0fSAgICAgICAgICAgICAgICAgQSBuZXcgRmFzdCBvYmplY3QsIGNvbnRhaW5pbmcgdGhlIHJlc3VsdHMuXG4gKi9cbkZhc3QucHJvdG90eXBlLmZpbHRlciA9IGZ1bmN0aW9uIEZhc3QkZmlsdGVyIChmbiwgdGhpc0NvbnRleHQpIHtcbiAgcmV0dXJuIG5ldyBGYXN0KEZhc3QuZmlsdGVyKHRoaXMudmFsdWUsIGZuLCB0aGlzQ29udGV4dCkpO1xufTtcblxuLyoqXG4gKiBGYXN0IFJlZHVjZVxuICpcbiAqIEBwYXJhbSAge0Z1bmN0aW9ufSBmbiAgICAgICAgICAgVGhlIHJlZHVjZXIgZnVuY3Rpb24uXG4gKiBAcGFyYW0gIHttaXhlZH0gICAgaW5pdGlhbFZhbHVlIFRoZSBpbml0aWFsIHZhbHVlLCBpZiBhbnkuXG4gKiBAcGFyYW0gIHtPYmplY3R9ICAgdGhpc0NvbnRleHQgIFRoZSBjb250ZXh0IGZvciB0aGUgcmVkdWNlciwgaWYgYW55LlxuICogQHJldHVybiB7bWl4ZWR9ICAgICAgICAgICAgICAgICBUaGUgZmluYWwgcmVzdWx0LlxuICovXG5GYXN0LnByb3RvdHlwZS5yZWR1Y2UgPSBmdW5jdGlvbiBGYXN0JHJlZHVjZSAoZm4sIGluaXRpYWxWYWx1ZSwgdGhpc0NvbnRleHQpIHtcbiAgcmV0dXJuIEZhc3QucmVkdWNlKHRoaXMudmFsdWUsIGZuLCBpbml0aWFsVmFsdWUsIHRoaXNDb250ZXh0KTtcbn07XG5cblxuLyoqXG4gKiBGYXN0IFJlZHVjZSBSaWdodFxuICpcbiAqIEBwYXJhbSAge0Z1bmN0aW9ufSBmbiAgICAgICAgICAgVGhlIHJlZHVjZXIgZnVuY3Rpb24uXG4gKiBAcGFyYW0gIHttaXhlZH0gICAgaW5pdGlhbFZhbHVlIFRoZSBpbml0aWFsIHZhbHVlLCBpZiBhbnkuXG4gKiBAcGFyYW0gIHtPYmplY3R9ICAgdGhpc0NvbnRleHQgIFRoZSBjb250ZXh0IGZvciB0aGUgcmVkdWNlciwgaWYgYW55LlxuICogQHJldHVybiB7bWl4ZWR9ICAgICAgICAgICAgICAgICBUaGUgZmluYWwgcmVzdWx0LlxuICovXG5GYXN0LnByb3RvdHlwZS5yZWR1Y2VSaWdodCA9IGZ1bmN0aW9uIEZhc3QkcmVkdWNlUmlnaHQgKGZuLCBpbml0aWFsVmFsdWUsIHRoaXNDb250ZXh0KSB7XG4gIHJldHVybiBGYXN0LnJlZHVjZVJpZ2h0KHRoaXMudmFsdWUsIGZuLCBpbml0aWFsVmFsdWUsIHRoaXNDb250ZXh0KTtcbn07XG5cbi8qKlxuICogRmFzdCBGb3IgRWFjaFxuICpcbiAqIEBwYXJhbSAge0Z1bmN0aW9ufSBmbiAgICAgICAgICBUaGUgdmlzaXRvciBmdW5jdGlvbi5cbiAqIEBwYXJhbSAge09iamVjdH0gICB0aGlzQ29udGV4dCBUaGUgY29udGV4dCBmb3IgdGhlIHZpc2l0b3IsIGlmIGFueS5cbiAqIEByZXR1cm4ge0Zhc3R9ICAgICAgICAgICAgICAgICBUaGUgRmFzdCBpbnN0YW5jZS5cbiAqL1xuRmFzdC5wcm90b3R5cGUuZm9yRWFjaCA9IGZ1bmN0aW9uIEZhc3QkZm9yRWFjaCAoZm4sIHRoaXNDb250ZXh0KSB7XG4gIEZhc3QuZm9yRWFjaCh0aGlzLnZhbHVlLCBmbiwgdGhpc0NvbnRleHQpO1xuICByZXR1cm4gdGhpcztcbn07XG5cbi8qKlxuICogRmFzdCBTb21lXG4gKlxuICogQHBhcmFtICB7RnVuY3Rpb259IGZuICAgICAgICAgIFRoZSBtYXRjaGVyIHByZWRpY2F0ZS5cbiAqIEBwYXJhbSAge09iamVjdH0gICB0aGlzQ29udGV4dCBUaGUgY29udGV4dCBmb3IgdGhlIG1hdGNoZXIsIGlmIGFueS5cbiAqIEByZXR1cm4ge0Jvb2xlYW59ICAgICAgICAgICAgICBUcnVlIGlmIGF0IGxlYXN0IG9uZSBlbGVtZW50IG1hdGNoZXMuXG4gKi9cbkZhc3QucHJvdG90eXBlLnNvbWUgPSBmdW5jdGlvbiBGYXN0JHNvbWUgKGZuLCB0aGlzQ29udGV4dCkge1xuICByZXR1cm4gRmFzdC5zb21lKHRoaXMudmFsdWUsIGZuLCB0aGlzQ29udGV4dCk7XG59O1xuXG4vKipcbiAqIEZhc3QgRXZlcnlcbiAqXG4gKiBAcGFyYW0gIHtGdW5jdGlvbn0gZm4gICAgICAgICAgVGhlIG1hdGNoZXIgcHJlZGljYXRlLlxuICogQHBhcmFtICB7T2JqZWN0fSAgIHRoaXNDb250ZXh0IFRoZSBjb250ZXh0IGZvciB0aGUgbWF0Y2hlciwgaWYgYW55LlxuICogQHJldHVybiB7Qm9vbGVhbn0gICAgICAgICAgICAgIFRydWUgaWYgYXQgYWxsIGVsZW1lbnRzIG1hdGNoLlxuICovXG5GYXN0LnByb3RvdHlwZS5ldmVyeSA9IGZ1bmN0aW9uIEZhc3QkZXZlcnkgKGZuLCB0aGlzQ29udGV4dCkge1xuICByZXR1cm4gRmFzdC5zb21lKHRoaXMudmFsdWUsIGZuLCB0aGlzQ29udGV4dCk7XG59O1xuXG4vKipcbiAqIEZhc3QgSW5kZXggT2ZcbiAqXG4gKiBAcGFyYW0gIHttaXhlZH0gIHRhcmdldCAgICBUaGUgdGFyZ2V0IHRvIGxvb2t1cC5cbiAqIEBwYXJhbSAge051bWJlcn0gZnJvbUluZGV4IFRoZSBpbmRleCB0byBzdGFydCBzZWFyY2hpbmcgZnJvbSwgaWYga25vd24uXG4gKiBAcmV0dXJuIHtOdW1iZXJ9ICAgICAgICAgICBUaGUgaW5kZXggb2YgdGhlIGl0ZW0sIG9yIC0xIGlmIG5vIG1hdGNoIGZvdW5kLlxuICovXG5GYXN0LnByb3RvdHlwZS5pbmRleE9mID0gZnVuY3Rpb24gRmFzdCRpbmRleE9mICh0YXJnZXQsIGZyb21JbmRleCkge1xuICByZXR1cm4gRmFzdC5pbmRleE9mKHRoaXMudmFsdWUsIHRhcmdldCwgZnJvbUluZGV4KTtcbn07XG5cblxuLyoqXG4gKiBGYXN0IExhc3QgSW5kZXggT2ZcbiAqXG4gKiBAcGFyYW0gIHttaXhlZH0gIHRhcmdldCAgICBUaGUgdGFyZ2V0IHRvIGxvb2t1cC5cbiAqIEBwYXJhbSAge051bWJlcn0gZnJvbUluZGV4IFRoZSBpbmRleCB0byBzdGFydCBzZWFyY2hpbmcgZnJvbSwgaWYga25vd24uXG4gKiBAcmV0dXJuIHtOdW1iZXJ9ICAgICAgICAgICBUaGUgbGFzdCBpbmRleCBvZiB0aGUgaXRlbSwgb3IgLTEgaWYgbm8gbWF0Y2ggZm91bmQuXG4gKi9cbkZhc3QucHJvdG90eXBlLmxhc3RJbmRleE9mID0gZnVuY3Rpb24gRmFzdCRsYXN0SW5kZXhPZiAodGFyZ2V0LCBmcm9tSW5kZXgpIHtcbiAgcmV0dXJuIEZhc3QubGFzdEluZGV4T2YodGhpcy52YWx1ZSwgdGFyZ2V0LCBmcm9tSW5kZXgpO1xufTtcblxuLyoqXG4gKiBSZXZlcnNlXG4gKlxuICogQHJldHVybiB7RmFzdH0gQSBuZXcgRmFzdCBpbnN0YW5jZSwgd2l0aCB0aGUgY29udGVudHMgcmV2ZXJzZWQuXG4gKi9cbkZhc3QucHJvdG90eXBlLnJldmVyc2UgPSBmdW5jdGlvbiBGYXN0JHJldmVyc2UgKCkge1xuICByZXR1cm4gbmV3IEZhc3QodGhpcy52YWx1ZS5yZXZlcnNlKCkpO1xufTtcblxuLyoqXG4gKiBWYWx1ZSBPZlxuICpcbiAqIEByZXR1cm4ge0FycmF5fSBUaGUgd3JhcHBlZCB2YWx1ZS5cbiAqL1xuRmFzdC5wcm90b3R5cGUudmFsdWVPZiA9IGZ1bmN0aW9uIEZhc3QkdmFsdWVPZiAoKSB7XG4gIHJldHVybiB0aGlzLnZhbHVlO1xufTtcblxuLyoqXG4gKiBUbyBKU09OXG4gKlxuICogQHJldHVybiB7QXJyYXl9IFRoZSB3cmFwcGVkIHZhbHVlLlxuICovXG5GYXN0LnByb3RvdHlwZS50b0pTT04gPSBmdW5jdGlvbiBGYXN0JHRvSlNPTiAoKSB7XG4gIHJldHVybiB0aGlzLnZhbHVlO1xufTtcblxuLyoqXG4gKiBJdGVtIExlbmd0aFxuICovXG5PYmplY3QuZGVmaW5lUHJvcGVydHkoRmFzdC5wcm90b3R5cGUsICdsZW5ndGgnLCB7XG4gIGdldDogZnVuY3Rpb24gKCkge1xuICAgIHJldHVybiB0aGlzLnZhbHVlLmxlbmd0aDtcbiAgfVxufSk7XG4iLCIndXNlIHN0cmljdCc7XG5cbnZhciBtYXBBcnJheSA9IHJlcXVpcmUoJy4vYXJyYXkvbWFwJyksXG4gICAgbWFwT2JqZWN0ID0gcmVxdWlyZSgnLi9vYmplY3QvbWFwJyk7XG5cbi8qKlxuICogIyBNYXBcbiAqXG4gKiBBIGZhc3QgYC5tYXAoKWAgaW1wbGVtZW50YXRpb24uXG4gKlxuICogQHBhcmFtICB7QXJyYXl8T2JqZWN0fSBzdWJqZWN0ICAgICBUaGUgYXJyYXkgb3Igb2JqZWN0IHRvIG1hcCBvdmVyLlxuICogQHBhcmFtICB7RnVuY3Rpb259ICAgICBmbiAgICAgICAgICBUaGUgbWFwcGVyIGZ1bmN0aW9uLlxuICogQHBhcmFtICB7T2JqZWN0fSAgICAgICB0aGlzQ29udGV4dCBUaGUgY29udGV4dCBmb3IgdGhlIG1hcHBlci5cbiAqIEByZXR1cm4ge0FycmF5fE9iamVjdH0gICAgICAgICAgICAgVGhlIGFycmF5IG9yIG9iamVjdCBjb250YWluaW5nIHRoZSByZXN1bHRzLlxuICovXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIGZhc3RNYXAgKHN1YmplY3QsIGZuLCB0aGlzQ29udGV4dCkge1xuICBpZiAoc3ViamVjdCBpbnN0YW5jZW9mIEFycmF5KSB7XG4gICAgcmV0dXJuIG1hcEFycmF5KHN1YmplY3QsIGZuLCB0aGlzQ29udGV4dCk7XG4gIH1cbiAgZWxzZSB7XG4gICAgcmV0dXJuIG1hcE9iamVjdChzdWJqZWN0LCBmbiwgdGhpc0NvbnRleHQpO1xuICB9XG59OyIsIid1c2Ugc3RyaWN0JztcblxuLyoqXG4gKiBBbmFsb2d1ZSBvZiBPYmplY3QuYXNzaWduKCkuXG4gKiBDb3BpZXMgcHJvcGVydGllcyBmcm9tIG9uZSBvciBtb3JlIHNvdXJjZSBvYmplY3RzIHRvXG4gKiBhIHRhcmdldCBvYmplY3QuIEV4aXN0aW5nIGtleXMgb24gdGhlIHRhcmdldCBvYmplY3Qgd2lsbCBiZSBvdmVyd3JpdHRlbi5cbiAqXG4gKiA+IE5vdGU6IFRoaXMgZGlmZmVycyBmcm9tIHNwZWMgaW4gc29tZSBpbXBvcnRhbnQgd2F5czpcbiAqID4gMS4gV2lsbCB0aHJvdyBpZiBwYXNzZWQgbm9uLW9iamVjdHMsIGluY2x1ZGluZyBgdW5kZWZpbmVkYCBvciBgbnVsbGAgdmFsdWVzLlxuICogPiAyLiBEb2VzIG5vdCBzdXBwb3J0IHRoZSBjdXJpb3VzIEV4Y2VwdGlvbiBoYW5kbGluZyBiZWhhdmlvciwgZXhjZXB0aW9ucyBhcmUgdGhyb3duIGltbWVkaWF0ZWx5LlxuICogPiBGb3IgbW9yZSBkZXRhaWxzLCBzZWU6XG4gKiA+IGh0dHBzOi8vZGV2ZWxvcGVyLm1vemlsbGEub3JnL2VuLVVTL2RvY3MvV2ViL0phdmFTY3JpcHQvUmVmZXJlbmNlL0dsb2JhbF9PYmplY3RzL09iamVjdC9hc3NpZ25cbiAqXG4gKlxuICpcbiAqIEBwYXJhbSAge09iamVjdH0gdGFyZ2V0ICAgICAgVGhlIHRhcmdldCBvYmplY3QgdG8gY29weSBwcm9wZXJ0aWVzIHRvLlxuICogQHBhcmFtICB7T2JqZWN0fSBzb3VyY2UsIC4uLiBUaGUgc291cmNlKHMpIHRvIGNvcHkgcHJvcGVydGllcyBmcm9tLlxuICogQHJldHVybiB7T2JqZWN0fSAgICAgICAgICAgICBUaGUgdXBkYXRlZCB0YXJnZXQgb2JqZWN0LlxuICovXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIGZhc3RBc3NpZ24gKHRhcmdldCkge1xuICB2YXIgdG90YWxBcmdzID0gYXJndW1lbnRzLmxlbmd0aCxcbiAgICAgIHNvdXJjZSwgaSwgdG90YWxLZXlzLCBrZXlzLCBrZXksIGo7XG5cbiAgZm9yIChpID0gMTsgaSA8IHRvdGFsQXJnczsgaSsrKSB7XG4gICAgc291cmNlID0gYXJndW1lbnRzW2ldO1xuICAgIGtleXMgPSBPYmplY3Qua2V5cyhzb3VyY2UpO1xuICAgIHRvdGFsS2V5cyA9IGtleXMubGVuZ3RoO1xuICAgIGZvciAoaiA9IDA7IGogPCB0b3RhbEtleXM7IGorKykge1xuICAgICAga2V5ID0ga2V5c1tqXTtcbiAgICAgIHRhcmdldFtrZXldID0gc291cmNlW2tleV07XG4gICAgfVxuICB9XG4gIHJldHVybiB0YXJnZXQ7XG59O1xuIiwiJ3VzZSBzdHJpY3QnO1xuXG4vKipcbiAqICMgQ2xvbmUgT2JqZWN0XG4gKlxuICogU2hhbGxvdyBjbG9uZSBhIHNpbXBsZSBvYmplY3QuXG4gKlxuICogPiBOb3RlOiBQcm90b3R5cGVzIGFuZCBub24tZW51bWVyYWJsZSBwcm9wZXJ0aWVzIHdpbGwgbm90IGJlIGNvcGllZCFcbiAqXG4gKiBAcGFyYW0gIHtPYmplY3R9IGlucHV0IFRoZSBvYmplY3QgdG8gY2xvbmUuXG4gKiBAcmV0dXJuIHtPYmplY3R9ICAgICAgIFRoZSBjbG9uZWQgb2JqZWN0LlxuICovXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIGZhc3RDbG9uZU9iamVjdCAoaW5wdXQpIHtcbiAgdmFyIGtleXMgPSBPYmplY3Qua2V5cyhpbnB1dCksXG4gICAgICB0b3RhbCA9IGtleXMubGVuZ3RoLFxuICAgICAgY2xvbmVkID0ge30sXG4gICAgICBpLCBrZXk7XG5cbiAgZm9yIChpID0gMDsgaSA8IHRvdGFsOyBpKyspIHtcbiAgICBrZXkgPSBrZXlzW2ldO1xuICAgIGNsb25lZFtrZXldID0gaW5wdXRba2V5XTtcbiAgfVxuXG4gIHJldHVybiBjbG9uZWQ7XG59O1xuIiwiJ3VzZSBzdHJpY3QnO1xuXG52YXIgYmluZEludGVybmFsMyA9IHJlcXVpcmUoJy4uL2Z1bmN0aW9uL2JpbmRJbnRlcm5hbDMnKTtcblxuLyoqXG4gKiAjIEZpbHRlclxuICpcbiAqIEEgZmFzdCBvYmplY3QgYC5maWx0ZXIoKWAgaW1wbGVtZW50YXRpb24uXG4gKlxuICogQHBhcmFtICB7T2JqZWN0fSAgIHN1YmplY3QgICAgIFRoZSBvYmplY3QgdG8gZmlsdGVyLlxuICogQHBhcmFtICB7RnVuY3Rpb259IGZuICAgICAgICAgIFRoZSBmaWx0ZXIgZnVuY3Rpb24uXG4gKiBAcGFyYW0gIHtPYmplY3R9ICAgdGhpc0NvbnRleHQgVGhlIGNvbnRleHQgZm9yIHRoZSBmaWx0ZXIuXG4gKiBAcmV0dXJuIHtPYmplY3R9ICAgICAgICAgICAgICAgVGhlIG5ldyBvYmplY3QgY29udGFpbmluZyB0aGUgZmlsdGVyZWQgcmVzdWx0cy5cbiAqL1xubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiBmYXN0RmlsdGVyT2JqZWN0IChzdWJqZWN0LCBmbiwgdGhpc0NvbnRleHQpIHtcbiAgdmFyIGtleXMgPSBPYmplY3Qua2V5cyhzdWJqZWN0KSxcbiAgICAgIGxlbmd0aCA9IGtleXMubGVuZ3RoLFxuICAgICAgcmVzdWx0ID0ge30sXG4gICAgICBpdGVyYXRvciA9IHRoaXNDb250ZXh0ICE9PSB1bmRlZmluZWQgPyBiaW5kSW50ZXJuYWwzKGZuLCB0aGlzQ29udGV4dCkgOiBmbixcbiAgICAgIGksIGtleTtcbiAgZm9yIChpID0gMDsgaSA8IGxlbmd0aDsgaSsrKSB7XG4gICAga2V5ID0ga2V5c1tpXTtcbiAgICBpZiAoaXRlcmF0b3Ioc3ViamVjdFtrZXldLCBrZXksIHN1YmplY3QpKSB7XG4gICAgICByZXN1bHRba2V5XSA9IHN1YmplY3Rba2V5XTtcbiAgICB9XG4gIH1cbiAgcmV0dXJuIHJlc3VsdDtcbn07XG4iLCIndXNlIHN0cmljdCc7XG5cbnZhciBiaW5kSW50ZXJuYWwzID0gcmVxdWlyZSgnLi4vZnVuY3Rpb24vYmluZEludGVybmFsMycpO1xuXG4vKipcbiAqICMgRm9yIEVhY2hcbiAqXG4gKiBBIGZhc3Qgb2JqZWN0IGAuZm9yRWFjaCgpYCBpbXBsZW1lbnRhdGlvbi5cbiAqXG4gKiBAcGFyYW0gIHtPYmplY3R9ICAgc3ViamVjdCAgICAgVGhlIG9iamVjdCB0byBpdGVyYXRlIG92ZXIuXG4gKiBAcGFyYW0gIHtGdW5jdGlvbn0gZm4gICAgICAgICAgVGhlIHZpc2l0b3IgZnVuY3Rpb24uXG4gKiBAcGFyYW0gIHtPYmplY3R9ICAgdGhpc0NvbnRleHQgVGhlIGNvbnRleHQgZm9yIHRoZSB2aXNpdG9yLlxuICovXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIGZhc3RGb3JFYWNoT2JqZWN0IChzdWJqZWN0LCBmbiwgdGhpc0NvbnRleHQpIHtcbiAgdmFyIGtleXMgPSBPYmplY3Qua2V5cyhzdWJqZWN0KSxcbiAgICAgIGxlbmd0aCA9IGtleXMubGVuZ3RoLFxuICAgICAgaXRlcmF0b3IgPSB0aGlzQ29udGV4dCAhPT0gdW5kZWZpbmVkID8gYmluZEludGVybmFsMyhmbiwgdGhpc0NvbnRleHQpIDogZm4sXG4gICAgICBrZXksIGk7XG4gIGZvciAoaSA9IDA7IGkgPCBsZW5ndGg7IGkrKykge1xuICAgIGtleSA9IGtleXNbaV07XG4gICAgaXRlcmF0b3Ioc3ViamVjdFtrZXldLCBrZXksIHN1YmplY3QpO1xuICB9XG59O1xuIiwiJ3VzZSBzdHJpY3QnO1xuXG5leHBvcnRzLmFzc2lnbiA9IHJlcXVpcmUoJy4vYXNzaWduJyk7XG5leHBvcnRzLmNsb25lID0gcmVxdWlyZSgnLi9jbG9uZScpO1xuZXhwb3J0cy5maWx0ZXIgPSByZXF1aXJlKCcuL2ZpbHRlcicpO1xuZXhwb3J0cy5mb3JFYWNoID0gcmVxdWlyZSgnLi9mb3JFYWNoJyk7XG5leHBvcnRzLm1hcCA9IHJlcXVpcmUoJy4vbWFwJyk7XG5leHBvcnRzLnJlZHVjZSA9IHJlcXVpcmUoJy4vcmVkdWNlJyk7XG5leHBvcnRzLnJlZHVjZVJpZ2h0ID0gcmVxdWlyZSgnLi9yZWR1Y2VSaWdodCcpO1xuZXhwb3J0cy5rZXlzID0gcmVxdWlyZSgnLi9rZXlzJyk7XG5leHBvcnRzLnZhbHVlcyA9IHJlcXVpcmUoJy4vdmFsdWVzJyk7IiwiJ3VzZSBzdHJpY3QnO1xuXG4vKipcbiAqIE9iamVjdC5rZXlzKCkgc2hpbSBmb3IgRVMzIGVudmlyb25tZW50cy5cbiAqXG4gKiBAcGFyYW0gIHtPYmplY3R9IG9iaiBUaGUgb2JqZWN0IHRvIGdldCBrZXlzIGZvci5cbiAqIEByZXR1cm4ge0FycmF5fSAgICAgIFRoZSBhcnJheSBvZiBrZXlzLlxuICovXG5tb2R1bGUuZXhwb3J0cyA9IHR5cGVvZiBPYmplY3Qua2V5cyA9PT0gXCJmdW5jdGlvblwiID8gT2JqZWN0LmtleXMgOiAvKiBpc3RhbmJ1bCBpZ25vcmUgbmV4dCAqLyBmdW5jdGlvbiBmYXN0S2V5cyAob2JqKSB7XG4gIHZhciBrZXlzID0gW107XG4gIGZvciAodmFyIGtleSBpbiBvYmopIHtcbiAgICBpZiAoT2JqZWN0LnByb3RvdHlwZS5oYXNPd25Qcm9wZXJ0eS5jYWxsKG9iaiwga2V5KSkge1xuICAgICAga2V5cy5wdXNoKGtleSk7XG4gICAgfVxuICB9XG4gIHJldHVybiBrZXlzO1xufTsiLCIndXNlIHN0cmljdCc7XG5cbnZhciBiaW5kSW50ZXJuYWwzID0gcmVxdWlyZSgnLi4vZnVuY3Rpb24vYmluZEludGVybmFsMycpO1xuXG4vKipcbiAqICMgTWFwXG4gKlxuICogQSBmYXN0IG9iamVjdCBgLm1hcCgpYCBpbXBsZW1lbnRhdGlvbi5cbiAqXG4gKiBAcGFyYW0gIHtPYmplY3R9ICAgc3ViamVjdCAgICAgVGhlIG9iamVjdCB0byBtYXAgb3Zlci5cbiAqIEBwYXJhbSAge0Z1bmN0aW9ufSBmbiAgICAgICAgICBUaGUgbWFwcGVyIGZ1bmN0aW9uLlxuICogQHBhcmFtICB7T2JqZWN0fSAgIHRoaXNDb250ZXh0IFRoZSBjb250ZXh0IGZvciB0aGUgbWFwcGVyLlxuICogQHJldHVybiB7T2JqZWN0fSAgICAgICAgICAgICAgIFRoZSBuZXcgb2JqZWN0IGNvbnRhaW5pbmcgdGhlIHJlc3VsdHMuXG4gKi9cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gZmFzdE1hcE9iamVjdCAoc3ViamVjdCwgZm4sIHRoaXNDb250ZXh0KSB7XG4gIHZhciBrZXlzID0gT2JqZWN0LmtleXMoc3ViamVjdCksXG4gICAgICBsZW5ndGggPSBrZXlzLmxlbmd0aCxcbiAgICAgIHJlc3VsdCA9IHt9LFxuICAgICAgaXRlcmF0b3IgPSB0aGlzQ29udGV4dCAhPT0gdW5kZWZpbmVkID8gYmluZEludGVybmFsMyhmbiwgdGhpc0NvbnRleHQpIDogZm4sXG4gICAgICBpLCBrZXk7XG4gIGZvciAoaSA9IDA7IGkgPCBsZW5ndGg7IGkrKykge1xuICAgIGtleSA9IGtleXNbaV07XG4gICAgcmVzdWx0W2tleV0gPSBpdGVyYXRvcihzdWJqZWN0W2tleV0sIGtleSwgc3ViamVjdCk7XG4gIH1cbiAgcmV0dXJuIHJlc3VsdDtcbn07XG4iLCIndXNlIHN0cmljdCc7XG5cbnZhciBiaW5kSW50ZXJuYWw0ID0gcmVxdWlyZSgnLi4vZnVuY3Rpb24vYmluZEludGVybmFsNCcpO1xuXG4vKipcbiAqICMgUmVkdWNlXG4gKlxuICogQSBmYXN0IG9iamVjdCBgLnJlZHVjZSgpYCBpbXBsZW1lbnRhdGlvbi5cbiAqXG4gKiBAcGFyYW0gIHtPYmplY3R9ICAgc3ViamVjdCAgICAgIFRoZSBvYmplY3QgdG8gcmVkdWNlIG92ZXIuXG4gKiBAcGFyYW0gIHtGdW5jdGlvbn0gZm4gICAgICAgICAgIFRoZSByZWR1Y2VyIGZ1bmN0aW9uLlxuICogQHBhcmFtICB7bWl4ZWR9ICAgIGluaXRpYWxWYWx1ZSBUaGUgaW5pdGlhbCB2YWx1ZSBmb3IgdGhlIHJlZHVjZXIsIGRlZmF1bHRzIHRvIHN1YmplY3RbMF0uXG4gKiBAcGFyYW0gIHtPYmplY3R9ICAgdGhpc0NvbnRleHQgIFRoZSBjb250ZXh0IGZvciB0aGUgcmVkdWNlci5cbiAqIEByZXR1cm4ge21peGVkfSAgICAgICAgICAgICAgICAgVGhlIGZpbmFsIHJlc3VsdC5cbiAqL1xubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiBmYXN0UmVkdWNlT2JqZWN0IChzdWJqZWN0LCBmbiwgaW5pdGlhbFZhbHVlLCB0aGlzQ29udGV4dCkge1xuICB2YXIga2V5cyA9IE9iamVjdC5rZXlzKHN1YmplY3QpLFxuICAgICAgbGVuZ3RoID0ga2V5cy5sZW5ndGgsXG4gICAgICBpdGVyYXRvciA9IHRoaXNDb250ZXh0ICE9PSB1bmRlZmluZWQgPyBiaW5kSW50ZXJuYWw0KGZuLCB0aGlzQ29udGV4dCkgOiBmbixcbiAgICAgIGksIGtleSwgcmVzdWx0O1xuXG4gIGlmIChpbml0aWFsVmFsdWUgPT09IHVuZGVmaW5lZCkge1xuICAgIGkgPSAxO1xuICAgIHJlc3VsdCA9IHN1YmplY3Rba2V5c1swXV07XG4gIH1cbiAgZWxzZSB7XG4gICAgaSA9IDA7XG4gICAgcmVzdWx0ID0gaW5pdGlhbFZhbHVlO1xuICB9XG5cbiAgZm9yICg7IGkgPCBsZW5ndGg7IGkrKykge1xuICAgIGtleSA9IGtleXNbaV07XG4gICAgcmVzdWx0ID0gaXRlcmF0b3IocmVzdWx0LCBzdWJqZWN0W2tleV0sIGtleSwgc3ViamVjdCk7XG4gIH1cblxuICByZXR1cm4gcmVzdWx0O1xufTtcbiIsIid1c2Ugc3RyaWN0JztcblxudmFyIGJpbmRJbnRlcm5hbDQgPSByZXF1aXJlKCcuLi9mdW5jdGlvbi9iaW5kSW50ZXJuYWw0Jyk7XG5cbi8qKlxuICogIyBSZWR1Y2VcbiAqXG4gKiBBIGZhc3Qgb2JqZWN0IGAucmVkdWNlKClgIGltcGxlbWVudGF0aW9uLlxuICpcbiAqIEBwYXJhbSAge09iamVjdH0gICBzdWJqZWN0ICAgICAgVGhlIG9iamVjdCB0byByZWR1Y2Ugb3Zlci5cbiAqIEBwYXJhbSAge0Z1bmN0aW9ufSBmbiAgICAgICAgICAgVGhlIHJlZHVjZXIgZnVuY3Rpb24uXG4gKiBAcGFyYW0gIHttaXhlZH0gICAgaW5pdGlhbFZhbHVlIFRoZSBpbml0aWFsIHZhbHVlIGZvciB0aGUgcmVkdWNlciwgZGVmYXVsdHMgdG8gc3ViamVjdFswXS5cbiAqIEBwYXJhbSAge09iamVjdH0gICB0aGlzQ29udGV4dCAgVGhlIGNvbnRleHQgZm9yIHRoZSByZWR1Y2VyLlxuICogQHJldHVybiB7bWl4ZWR9ICAgICAgICAgICAgICAgICBUaGUgZmluYWwgcmVzdWx0LlxuICovXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIGZhc3RSZWR1Y2VSaWdodE9iamVjdCAoc3ViamVjdCwgZm4sIGluaXRpYWxWYWx1ZSwgdGhpc0NvbnRleHQpIHtcbiAgdmFyIGtleXMgPSBPYmplY3Qua2V5cyhzdWJqZWN0KSxcbiAgICAgIGxlbmd0aCA9IGtleXMubGVuZ3RoLFxuICAgICAgaXRlcmF0b3IgPSB0aGlzQ29udGV4dCAhPT0gdW5kZWZpbmVkID8gYmluZEludGVybmFsNChmbiwgdGhpc0NvbnRleHQpIDogZm4sXG4gICAgICBpLCBrZXksIHJlc3VsdDtcblxuICBpZiAoaW5pdGlhbFZhbHVlID09PSB1bmRlZmluZWQpIHtcbiAgICBpID0gbGVuZ3RoIC0gMjtcbiAgICByZXN1bHQgPSBzdWJqZWN0W2tleXNbbGVuZ3RoIC0gMV1dO1xuICB9XG4gIGVsc2Uge1xuICAgIGkgPSBsZW5ndGggLSAxO1xuICAgIHJlc3VsdCA9IGluaXRpYWxWYWx1ZTtcbiAgfVxuXG4gIGZvciAoOyBpID49IDA7IGktLSkge1xuICAgIGtleSA9IGtleXNbaV07XG4gICAgcmVzdWx0ID0gaXRlcmF0b3IocmVzdWx0LCBzdWJqZWN0W2tleV0sIGtleSwgc3ViamVjdCk7XG4gIH1cblxuICByZXR1cm4gcmVzdWx0O1xufTtcbiIsIid1c2Ugc3RyaWN0JztcblxuLyoqXG4gKiAjIFZhbHVlc1xuICogUmV0dXJuIGFsbCB0aGUgKGVudW1lcmFibGUpIHByb3BlcnR5IHZhbHVlcyBmb3IgYW4gb2JqZWN0LlxuICogTGlrZSBPYmplY3Qua2V5cygpIGJ1dCBmb3IgdmFsdWVzLlxuICpcbiAqIEBwYXJhbSAge09iamVjdH0gb2JqIFRoZSBvYmplY3QgdG8gcmV0cmlldmUgdmFsdWVzIGZyb20uXG4gKiBAcmV0dXJuIHtBcnJheX0gICAgICBBbiBhcnJheSBjb250YWluaW5nIHByb3BlcnR5IHZhbHVlcy5cbiAqL1xubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiBmYXN0VmFsdWVzIChvYmopIHtcbiAgdmFyIGtleXMgPSBPYmplY3Qua2V5cyhvYmopLFxuICAgICAgbGVuZ3RoID0ga2V5cy5sZW5ndGgsXG4gICAgICB2YWx1ZXMgPSBuZXcgQXJyYXkobGVuZ3RoKTtcblxuICBmb3IgKHZhciBpID0gMDsgaSA8IGxlbmd0aDsgaSsrKSB7XG4gICAgdmFsdWVzW2ldID0gb2JqW2tleXNbaV1dO1xuICB9XG4gIHJldHVybiB2YWx1ZXM7XG59OyIsIid1c2Ugc3RyaWN0JztcblxudmFyIHJlZHVjZUFycmF5ID0gcmVxdWlyZSgnLi9hcnJheS9yZWR1Y2UnKSxcbiAgICByZWR1Y2VPYmplY3QgPSByZXF1aXJlKCcuL29iamVjdC9yZWR1Y2UnKTtcblxuLyoqXG4gKiAjIFJlZHVjZVxuICpcbiAqIEEgZmFzdCBgLnJlZHVjZSgpYCBpbXBsZW1lbnRhdGlvbi5cbiAqXG4gKiBAcGFyYW0gIHtBcnJheXxPYmplY3R9IHN1YmplY3QgICAgICBUaGUgYXJyYXkgb3Igb2JqZWN0IHRvIHJlZHVjZSBvdmVyLlxuICogQHBhcmFtICB7RnVuY3Rpb259ICAgICBmbiAgICAgICAgICAgVGhlIHJlZHVjZXIgZnVuY3Rpb24uXG4gKiBAcGFyYW0gIHttaXhlZH0gICAgICAgIGluaXRpYWxWYWx1ZSBUaGUgaW5pdGlhbCB2YWx1ZSBmb3IgdGhlIHJlZHVjZXIsIGRlZmF1bHRzIHRvIHN1YmplY3RbMF0uXG4gKiBAcGFyYW0gIHtPYmplY3R9ICAgICAgIHRoaXNDb250ZXh0ICBUaGUgY29udGV4dCBmb3IgdGhlIHJlZHVjZXIuXG4gKiBAcmV0dXJuIHtBcnJheXxPYmplY3R9ICAgICAgICAgICAgICBUaGUgYXJyYXkgb3Igb2JqZWN0IGNvbnRhaW5pbmcgdGhlIHJlc3VsdHMuXG4gKi9cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gZmFzdFJlZHVjZSAoc3ViamVjdCwgZm4sIGluaXRpYWxWYWx1ZSwgdGhpc0NvbnRleHQpIHtcbiAgaWYgKHN1YmplY3QgaW5zdGFuY2VvZiBBcnJheSkge1xuICAgIHJldHVybiByZWR1Y2VBcnJheShzdWJqZWN0LCBmbiwgaW5pdGlhbFZhbHVlLCB0aGlzQ29udGV4dCk7XG4gIH1cbiAgZWxzZSB7XG4gICAgcmV0dXJuIHJlZHVjZU9iamVjdChzdWJqZWN0LCBmbiwgaW5pdGlhbFZhbHVlLCB0aGlzQ29udGV4dCk7XG4gIH1cbn07IiwiJ3VzZSBzdHJpY3QnO1xuXG52YXIgcmVkdWNlUmlnaHRBcnJheSA9IHJlcXVpcmUoJy4vYXJyYXkvcmVkdWNlUmlnaHQnKSxcbiAgICByZWR1Y2VSaWdodE9iamVjdCA9IHJlcXVpcmUoJy4vb2JqZWN0L3JlZHVjZVJpZ2h0Jyk7XG5cbi8qKlxuICogIyBSZWR1Y2UgUmlnaHRcbiAqXG4gKiBBIGZhc3QgYC5yZWR1Y2VSaWdodCgpYCBpbXBsZW1lbnRhdGlvbi5cbiAqXG4gKiBAcGFyYW0gIHtBcnJheXxPYmplY3R9IHN1YmplY3QgICAgICBUaGUgYXJyYXkgb3Igb2JqZWN0IHRvIHJlZHVjZSBvdmVyLlxuICogQHBhcmFtICB7RnVuY3Rpb259ICAgICBmbiAgICAgICAgICAgVGhlIHJlZHVjZXIgZnVuY3Rpb24uXG4gKiBAcGFyYW0gIHttaXhlZH0gICAgICAgIGluaXRpYWxWYWx1ZSBUaGUgaW5pdGlhbCB2YWx1ZSBmb3IgdGhlIHJlZHVjZXIsIGRlZmF1bHRzIHRvIHN1YmplY3RbMF0uXG4gKiBAcGFyYW0gIHtPYmplY3R9ICAgICAgIHRoaXNDb250ZXh0ICBUaGUgY29udGV4dCBmb3IgdGhlIHJlZHVjZXIuXG4gKiBAcmV0dXJuIHtBcnJheXxPYmplY3R9ICAgICAgICAgICAgICBUaGUgYXJyYXkgb3Igb2JqZWN0IGNvbnRhaW5pbmcgdGhlIHJlc3VsdHMuXG4gKi9cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gZmFzdFJlZHVjZVJpZ2h0IChzdWJqZWN0LCBmbiwgaW5pdGlhbFZhbHVlLCB0aGlzQ29udGV4dCkge1xuICBpZiAoc3ViamVjdCBpbnN0YW5jZW9mIEFycmF5KSB7XG4gICAgcmV0dXJuIHJlZHVjZVJpZ2h0QXJyYXkoc3ViamVjdCwgZm4sIGluaXRpYWxWYWx1ZSwgdGhpc0NvbnRleHQpO1xuICB9XG4gIGVsc2Uge1xuICAgIHJldHVybiByZWR1Y2VSaWdodE9iamVjdChzdWJqZWN0LCBmbiwgaW5pdGlhbFZhbHVlLCB0aGlzQ29udGV4dCk7XG4gIH1cbn07IiwiJ3VzZSBzdHJpY3QnO1xuXG5leHBvcnRzLmludGVybiA9IHJlcXVpcmUoJy4vaW50ZXJuJyk7IiwiJ3VzZSBzdHJpY3QnO1xuXG4vLyBDb21waWxlcnMgc3VjaCBhcyBWOCB1c2Ugc3RyaW5nIGludGVybmluZyB0byBtYWtlIHN0cmluZyBjb21wYXJpc29uIHZlcnkgZmFzdCBhbmQgZWZmaWNpZW50LFxuLy8gYXMgZWZmaWNpZW50IGFzIGNvbXBhcmluZyB0d28gcmVmZXJlbmNlcyB0byB0aGUgc2FtZSBvYmplY3QuXG4vL1xuLy9cbi8vIFY4IGRvZXMgaXRzIGJlc3QgdG8gaW50ZXJuIHN0cmluZ3MgYXV0b21hdGljYWxseSB3aGVyZSBpdCBjYW4sIGZvciBpbnN0YW5jZTpcbi8vIGBgYGpzXG4vLyAgIHZhciBncmVldGluZyA9IFwiaGVsbG8gd29ybGRcIjtcbi8vIGBgYFxuLy8gV2l0aCB0aGlzLCBjb21wYXJpc29uIHdpbGwgYmUgdmVyeSBmYXN0OlxuLy8gYGBganNcbi8vICAgaWYgKGdyZWV0aW5nID09PSBcImhlbGxvIHdvcmxkXCIpIHt9XG4vLyBgYGBcbi8vIEhvd2V2ZXIsIHRoZXJlIGFyZSBzZXZlcmFsIGNhc2VzIHdoZXJlIFY4IGNhbm5vdCBpbnRlcm4gdGhlIHN0cmluZywgYW5kIGluc3RlYWRcbi8vIG11c3QgcmVzb3J0IHRvIGJ5dGUtd2lzZSBjb21wYXJpc29uLiBUaGlzIGNhbiBiZSBzaWduZmljYW50bHkgc2xvd2VyIGZvciBsb25nIHN0cmluZ3MuXG4vLyBUaGUgbW9zdCBjb21tb24gZXhhbXBsZSBpcyBzdHJpbmcgY29uY2F0ZW5hdGlvbjpcbi8vIGBgYGpzXG4vLyAgIGZ1bmN0aW9uIHN1YmplY3QgKCkgeyByZXR1cm4gXCJ3b3JsZFwiOyB9O1xuLy8gICB2YXIgZ3JlZXRpbmcgPSBcImhlbGxvIFwiICsgc3ViamVjdCgpO1xuLy8gYGBgXG4vLyBJbiB0aGlzIGNhc2UsIFY4IGNhbm5vdCBpbnRlcm4gdGhlIHN0cmluZy4gU28gdGhpcyBjb21wYXJpc29uIGlzICptdWNoKiBzbG93ZXI6XG4vLyBgYGBqc1xuLy8gIGlmIChncmVldGluZyA9PT0gXCJoZWxsbyB3b3JsZFwiKSB7fVxuLy8gYGBgXG5cblxuXG4vLyBBdCB0aGUgbW9tZW50LCB0aGUgZmFzdGVzdCwgc2FmZSB3YXkgb2YgaW50ZXJuaW5nIGEgc3RyaW5nIGlzIHRvXG4vLyB1c2UgaXQgYXMgYSBrZXkgaW4gYW4gb2JqZWN0LCBhbmQgdGhlbiB1c2UgdGhhdCBrZXkuXG4vL1xuLy8gTm90ZTogVGhpcyB0ZWNobmlxdWUgY29tZXMgY291cnRlc3kgb2YgUGV0a2EgQW50b25vdiAtIGh0dHA6Ly9qc3BlcmYuY29tL2lzdHJuLzExXG4vL1xuLy8gV2UgY3JlYXRlIGEgY29udGFpbmVyIG9iamVjdCBpbiBoYXNoIG1vZGUuXG4vLyBNb3N0IHN0cmluZ3MgYmVpbmcgaW50ZXJuZWQgd2lsbCBub3QgYmUgdmFsaWQgZmFzdCBwcm9wZXJ0eSBuYW1lcyxcbi8vIHNvIHdlIGVuc3VyZSBoYXNoIG1vZGUgbm93IHRvIGF2b2lkIHRyYW5zaXRpb25pbmcgdGhlIG9iamVjdCBtb2RlIGF0IHJ1bnRpbWUuXG52YXIgY29udGFpbmVyID0geyctICc6IHRydWV9O1xuZGVsZXRlIGNvbnRhaW5lclsnLSAnXTtcblxuXG4vKipcbiAqIEludGVybiBhIHN0cmluZyB0byBtYWtlIGNvbXBhcmlzb25zIGZhc3Rlci5cbiAqXG4gKiA+IE5vdGU6IFRoaXMgaXMgYSByZWxhdGl2ZWx5IGV4cGVuc2l2ZSBvcGVyYXRpb24sIHlvdVxuICogc2hvdWxkbid0IHVzdWFsbHkgZG8gdGhlIGFjdHVhbCBpbnRlcm5pbmcgYXQgcnVudGltZSwgaW5zdGVhZFxuICogdXNlIHRoaXMgYXQgY29tcGlsZSB0aW1lIHRvIG1ha2UgZnV0dXJlIHdvcmsgZmFzdGVyLlxuICpcbiAqIEBwYXJhbSAge1N0cmluZ30gc3RyaW5nIFRoZSBzdHJpbmcgdG8gaW50ZXJuLlxuICogQHJldHVybiB7U3RyaW5nfSAgICAgICAgVGhlIGludGVybmVkIHN0cmluZy5cbiAqL1xubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiBmYXN0SW50ZXJuIChzdHJpbmcpIHtcbiAgY29udGFpbmVyW3N0cmluZ10gPSB0cnVlO1xuICB2YXIgaW50ZXJuZWQgPSBPYmplY3Qua2V5cyhjb250YWluZXIpWzBdO1xuICBkZWxldGUgY29udGFpbmVyW2ludGVybmVkXTtcbiAgcmV0dXJuIGludGVybmVkO1xufTsiLCIvKiogZ2VuZXJhdGUgdW5pcXVlIGlkIGZvciBzZWxlY3RvciAqL1xyXG52YXIgY291bnRlciA9IERhdGUubm93KCkgJSAxZTk7XHJcblxyXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIGdldFVpZCgpe1xyXG5cdHJldHVybiAoTWF0aC5yYW5kb20oKSAqIDFlOSA+Pj4gMCkgKyAoY291bnRlcisrKTtcclxufTsiLCIvKmdsb2JhbCB3aW5kb3cqL1xuXG4vKipcbiAqIENoZWNrIGlmIG9iamVjdCBpcyBkb20gbm9kZS5cbiAqXG4gKiBAcGFyYW0ge09iamVjdH0gdmFsXG4gKiBAcmV0dXJuIHtCb29sZWFufVxuICogQGFwaSBwdWJsaWNcbiAqL1xuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIGlzTm9kZSh2YWwpe1xuICBpZiAoIXZhbCB8fCB0eXBlb2YgdmFsICE9PSAnb2JqZWN0JykgcmV0dXJuIGZhbHNlO1xuICBpZiAod2luZG93ICYmICdvYmplY3QnID09IHR5cGVvZiB3aW5kb3cuTm9kZSkgcmV0dXJuIHZhbCBpbnN0YW5jZW9mIHdpbmRvdy5Ob2RlO1xuICByZXR1cm4gJ251bWJlcicgPT0gdHlwZW9mIHZhbC5ub2RlVHlwZSAmJiAnc3RyaW5nJyA9PSB0eXBlb2YgdmFsLm5vZGVOYW1lO1xufVxuIiwiKGZ1bmN0aW9uIChyb290LCBmYWN0b3J5KXtcbiAgJ3VzZSBzdHJpY3QnO1xuXG4gIC8qaXN0YW5idWwgaWdub3JlIG5leHQ6Y2FudCB0ZXN0Ki9cbiAgaWYgKHR5cGVvZiBtb2R1bGUgPT09ICdvYmplY3QnICYmIHR5cGVvZiBtb2R1bGUuZXhwb3J0cyA9PT0gJ29iamVjdCcpIHtcbiAgICBtb2R1bGUuZXhwb3J0cyA9IGZhY3RvcnkoKTtcbiAgfSBlbHNlIGlmICh0eXBlb2YgZGVmaW5lID09PSAnZnVuY3Rpb24nICYmIGRlZmluZS5hbWQpIHtcbiAgICAvLyBBTUQuIFJlZ2lzdGVyIGFzIGFuIGFub255bW91cyBtb2R1bGUuXG4gICAgZGVmaW5lKFtdLCBmYWN0b3J5KTtcbiAgfSBlbHNlIHtcbiAgICAvLyBCcm93c2VyIGdsb2JhbHNcbiAgICByb290Lm9iamVjdFBhdGggPSBmYWN0b3J5KCk7XG4gIH1cbn0pKHRoaXMsIGZ1bmN0aW9uKCl7XG4gICd1c2Ugc3RyaWN0JztcblxuICB2YXJcbiAgICB0b1N0ciA9IE9iamVjdC5wcm90b3R5cGUudG9TdHJpbmcsXG4gICAgX2hhc093blByb3BlcnR5ID0gT2JqZWN0LnByb3RvdHlwZS5oYXNPd25Qcm9wZXJ0eTtcblxuICBmdW5jdGlvbiBpc0VtcHR5KHZhbHVlKXtcbiAgICBpZiAoIXZhbHVlKSB7XG4gICAgICByZXR1cm4gdHJ1ZTtcbiAgICB9XG4gICAgaWYgKGlzQXJyYXkodmFsdWUpICYmIHZhbHVlLmxlbmd0aCA9PT0gMCkge1xuICAgICAgcmV0dXJuIHRydWU7XG4gICAgfSBlbHNlIHtcbiAgICAgIGZvciAodmFyIGkgaW4gdmFsdWUpIHtcbiAgICAgICAgaWYgKF9oYXNPd25Qcm9wZXJ0eS5jYWxsKHZhbHVlLCBpKSkge1xuICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgcmV0dXJuIHRydWU7XG4gICAgfVxuICB9XG5cbiAgZnVuY3Rpb24gdG9TdHJpbmcodHlwZSl7XG4gICAgcmV0dXJuIHRvU3RyLmNhbGwodHlwZSk7XG4gIH1cblxuICBmdW5jdGlvbiBpc051bWJlcih2YWx1ZSl7XG4gICAgcmV0dXJuIHR5cGVvZiB2YWx1ZSA9PT0gJ251bWJlcicgfHwgdG9TdHJpbmcodmFsdWUpID09PSBcIltvYmplY3QgTnVtYmVyXVwiO1xuICB9XG5cbiAgZnVuY3Rpb24gaXNTdHJpbmcob2JqKXtcbiAgICByZXR1cm4gdHlwZW9mIG9iaiA9PT0gJ3N0cmluZycgfHwgdG9TdHJpbmcob2JqKSA9PT0gXCJbb2JqZWN0IFN0cmluZ11cIjtcbiAgfVxuXG4gIGZ1bmN0aW9uIGlzT2JqZWN0KG9iail7XG4gICAgcmV0dXJuIHR5cGVvZiBvYmogPT09ICdvYmplY3QnICYmIHRvU3RyaW5nKG9iaikgPT09IFwiW29iamVjdCBPYmplY3RdXCI7XG4gIH1cblxuICBmdW5jdGlvbiBpc0FycmF5KG9iail7XG4gICAgcmV0dXJuIHR5cGVvZiBvYmogPT09ICdvYmplY3QnICYmIHR5cGVvZiBvYmoubGVuZ3RoID09PSAnbnVtYmVyJyAmJiB0b1N0cmluZyhvYmopID09PSAnW29iamVjdCBBcnJheV0nO1xuICB9XG5cbiAgZnVuY3Rpb24gaXNCb29sZWFuKG9iail7XG4gICAgcmV0dXJuIHR5cGVvZiBvYmogPT09ICdib29sZWFuJyB8fCB0b1N0cmluZyhvYmopID09PSAnW29iamVjdCBCb29sZWFuXSc7XG4gIH1cblxuICBmdW5jdGlvbiBnZXRLZXkoa2V5KXtcbiAgICB2YXIgaW50S2V5ID0gcGFyc2VJbnQoa2V5KTtcbiAgICBpZiAoaW50S2V5LnRvU3RyaW5nKCkgPT09IGtleSkge1xuICAgICAgcmV0dXJuIGludEtleTtcbiAgICB9XG4gICAgcmV0dXJuIGtleTtcbiAgfVxuXG4gIGZ1bmN0aW9uIHNldChvYmosIHBhdGgsIHZhbHVlLCBkb05vdFJlcGxhY2Upe1xuICAgIGlmIChpc051bWJlcihwYXRoKSkge1xuICAgICAgcGF0aCA9IFtwYXRoXTtcbiAgICB9XG4gICAgaWYgKGlzRW1wdHkocGF0aCkpIHtcbiAgICAgIHJldHVybiBvYmo7XG4gICAgfVxuICAgIGlmIChpc1N0cmluZyhwYXRoKSkge1xuICAgICAgcmV0dXJuIHNldChvYmosIHBhdGguc3BsaXQoJy4nKS5tYXAoZ2V0S2V5KSwgdmFsdWUsIGRvTm90UmVwbGFjZSk7XG4gICAgfVxuICAgIHZhciBjdXJyZW50UGF0aCA9IHBhdGhbMF07XG5cbiAgICBpZiAocGF0aC5sZW5ndGggPT09IDEpIHtcbiAgICAgIHZhciBvbGRWYWwgPSBvYmpbY3VycmVudFBhdGhdO1xuICAgICAgaWYgKG9sZFZhbCA9PT0gdm9pZCAwIHx8ICFkb05vdFJlcGxhY2UpIHtcbiAgICAgICAgb2JqW2N1cnJlbnRQYXRoXSA9IHZhbHVlO1xuICAgICAgfVxuICAgICAgcmV0dXJuIG9sZFZhbDtcbiAgICB9XG5cbiAgICBpZiAob2JqW2N1cnJlbnRQYXRoXSA9PT0gdm9pZCAwKSB7XG4gICAgICAvL2NoZWNrIGlmIHdlIGFzc3VtZSBhbiBhcnJheVxuICAgICAgaWYoaXNOdW1iZXIocGF0aFsxXSkpIHtcbiAgICAgICAgb2JqW2N1cnJlbnRQYXRoXSA9IFtdO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgb2JqW2N1cnJlbnRQYXRoXSA9IHt9O1xuICAgICAgfVxuICAgIH1cblxuICAgIHJldHVybiBzZXQob2JqW2N1cnJlbnRQYXRoXSwgcGF0aC5zbGljZSgxKSwgdmFsdWUsIGRvTm90UmVwbGFjZSk7XG4gIH1cblxuICBmdW5jdGlvbiBkZWwob2JqLCBwYXRoKSB7XG4gICAgaWYgKGlzTnVtYmVyKHBhdGgpKSB7XG4gICAgICBwYXRoID0gW3BhdGhdO1xuICAgIH1cblxuICAgIGlmIChpc0VtcHR5KG9iaikpIHtcbiAgICAgIHJldHVybiB2b2lkIDA7XG4gICAgfVxuXG4gICAgaWYgKGlzRW1wdHkocGF0aCkpIHtcbiAgICAgIHJldHVybiBvYmo7XG4gICAgfVxuICAgIGlmKGlzU3RyaW5nKHBhdGgpKSB7XG4gICAgICByZXR1cm4gZGVsKG9iaiwgcGF0aC5zcGxpdCgnLicpKTtcbiAgICB9XG5cbiAgICB2YXIgY3VycmVudFBhdGggPSBnZXRLZXkocGF0aFswXSk7XG4gICAgdmFyIG9sZFZhbCA9IG9ialtjdXJyZW50UGF0aF07XG5cbiAgICBpZihwYXRoLmxlbmd0aCA9PT0gMSkge1xuICAgICAgaWYgKG9sZFZhbCAhPT0gdm9pZCAwKSB7XG4gICAgICAgIGlmIChpc0FycmF5KG9iaikpIHtcbiAgICAgICAgICBvYmouc3BsaWNlKGN1cnJlbnRQYXRoLCAxKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBkZWxldGUgb2JqW2N1cnJlbnRQYXRoXTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH0gZWxzZSB7XG4gICAgICBpZiAob2JqW2N1cnJlbnRQYXRoXSAhPT0gdm9pZCAwKSB7XG4gICAgICAgIHJldHVybiBkZWwob2JqW2N1cnJlbnRQYXRoXSwgcGF0aC5zbGljZSgxKSk7XG4gICAgICB9XG4gICAgfVxuXG4gICAgcmV0dXJuIG9iajtcbiAgfVxuXG4gIHZhciBvYmplY3RQYXRoID0ge307XG5cbiAgb2JqZWN0UGF0aC5oYXMgPSBmdW5jdGlvbiAob2JqLCBwYXRoKSB7XG4gICAgaWYgKGlzRW1wdHkob2JqKSkge1xuICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cblxuICAgIGlmIChpc051bWJlcihwYXRoKSkge1xuICAgICAgcGF0aCA9IFtwYXRoXTtcbiAgICB9IGVsc2UgaWYgKGlzU3RyaW5nKHBhdGgpKSB7XG4gICAgICBwYXRoID0gcGF0aC5zcGxpdCgnLicpO1xuICAgIH1cblxuICAgIGlmIChpc0VtcHR5KHBhdGgpIHx8IHBhdGgubGVuZ3RoID09PSAwKSB7XG4gICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuXG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCBwYXRoLmxlbmd0aDsgaSsrKSB7XG4gICAgICB2YXIgaiA9IHBhdGhbaV07XG4gICAgICBpZiAoKGlzT2JqZWN0KG9iaikgfHwgaXNBcnJheShvYmopKSAmJiBfaGFzT3duUHJvcGVydHkuY2FsbChvYmosIGopKSB7XG4gICAgICAgIG9iaiA9IG9ialtqXTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICByZXR1cm4gdHJ1ZTtcbiAgfTtcblxuICBvYmplY3RQYXRoLmVuc3VyZUV4aXN0cyA9IGZ1bmN0aW9uIChvYmosIHBhdGgsIHZhbHVlKXtcbiAgICByZXR1cm4gc2V0KG9iaiwgcGF0aCwgdmFsdWUsIHRydWUpO1xuICB9O1xuXG4gIG9iamVjdFBhdGguc2V0ID0gZnVuY3Rpb24gKG9iaiwgcGF0aCwgdmFsdWUsIGRvTm90UmVwbGFjZSl7XG4gICAgcmV0dXJuIHNldChvYmosIHBhdGgsIHZhbHVlLCBkb05vdFJlcGxhY2UpO1xuICB9O1xuXG4gIG9iamVjdFBhdGguaW5zZXJ0ID0gZnVuY3Rpb24gKG9iaiwgcGF0aCwgdmFsdWUsIGF0KXtcbiAgICB2YXIgYXJyID0gb2JqZWN0UGF0aC5nZXQob2JqLCBwYXRoKTtcbiAgICBhdCA9IH5+YXQ7XG4gICAgaWYgKCFpc0FycmF5KGFycikpIHtcbiAgICAgIGFyciA9IFtdO1xuICAgICAgb2JqZWN0UGF0aC5zZXQob2JqLCBwYXRoLCBhcnIpO1xuICAgIH1cbiAgICBhcnIuc3BsaWNlKGF0LCAwLCB2YWx1ZSk7XG4gIH07XG5cbiAgb2JqZWN0UGF0aC5lbXB0eSA9IGZ1bmN0aW9uKG9iaiwgcGF0aCkge1xuICAgIGlmIChpc0VtcHR5KHBhdGgpKSB7XG4gICAgICByZXR1cm4gb2JqO1xuICAgIH1cbiAgICBpZiAoaXNFbXB0eShvYmopKSB7XG4gICAgICByZXR1cm4gdm9pZCAwO1xuICAgIH1cblxuICAgIHZhciB2YWx1ZSwgaTtcbiAgICBpZiAoISh2YWx1ZSA9IG9iamVjdFBhdGguZ2V0KG9iaiwgcGF0aCkpKSB7XG4gICAgICByZXR1cm4gb2JqO1xuICAgIH1cblxuICAgIGlmIChpc1N0cmluZyh2YWx1ZSkpIHtcbiAgICAgIHJldHVybiBvYmplY3RQYXRoLnNldChvYmosIHBhdGgsICcnKTtcbiAgICB9IGVsc2UgaWYgKGlzQm9vbGVhbih2YWx1ZSkpIHtcbiAgICAgIHJldHVybiBvYmplY3RQYXRoLnNldChvYmosIHBhdGgsIGZhbHNlKTtcbiAgICB9IGVsc2UgaWYgKGlzTnVtYmVyKHZhbHVlKSkge1xuICAgICAgcmV0dXJuIG9iamVjdFBhdGguc2V0KG9iaiwgcGF0aCwgMCk7XG4gICAgfSBlbHNlIGlmIChpc0FycmF5KHZhbHVlKSkge1xuICAgICAgdmFsdWUubGVuZ3RoID0gMDtcbiAgICB9IGVsc2UgaWYgKGlzT2JqZWN0KHZhbHVlKSkge1xuICAgICAgZm9yIChpIGluIHZhbHVlKSB7XG4gICAgICAgIGlmIChfaGFzT3duUHJvcGVydHkuY2FsbCh2YWx1ZSwgaSkpIHtcbiAgICAgICAgICBkZWxldGUgdmFsdWVbaV07XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9IGVsc2Uge1xuICAgICAgcmV0dXJuIG9iamVjdFBhdGguc2V0KG9iaiwgcGF0aCwgbnVsbCk7XG4gICAgfVxuICB9O1xuXG4gIG9iamVjdFBhdGgucHVzaCA9IGZ1bmN0aW9uIChvYmosIHBhdGggLyosIHZhbHVlcyAqLyl7XG4gICAgdmFyIGFyciA9IG9iamVjdFBhdGguZ2V0KG9iaiwgcGF0aCk7XG4gICAgaWYgKCFpc0FycmF5KGFycikpIHtcbiAgICAgIGFyciA9IFtdO1xuICAgICAgb2JqZWN0UGF0aC5zZXQob2JqLCBwYXRoLCBhcnIpO1xuICAgIH1cblxuICAgIGFyci5wdXNoLmFwcGx5KGFyciwgQXJyYXkucHJvdG90eXBlLnNsaWNlLmNhbGwoYXJndW1lbnRzLCAyKSk7XG4gIH07XG5cbiAgb2JqZWN0UGF0aC5jb2FsZXNjZSA9IGZ1bmN0aW9uIChvYmosIHBhdGhzLCBkZWZhdWx0VmFsdWUpIHtcbiAgICB2YXIgdmFsdWU7XG5cbiAgICBmb3IgKHZhciBpID0gMCwgbGVuID0gcGF0aHMubGVuZ3RoOyBpIDwgbGVuOyBpKyspIHtcbiAgICAgIGlmICgodmFsdWUgPSBvYmplY3RQYXRoLmdldChvYmosIHBhdGhzW2ldKSkgIT09IHZvaWQgMCkge1xuICAgICAgICByZXR1cm4gdmFsdWU7XG4gICAgICB9XG4gICAgfVxuXG4gICAgcmV0dXJuIGRlZmF1bHRWYWx1ZTtcbiAgfTtcblxuICBvYmplY3RQYXRoLmdldCA9IGZ1bmN0aW9uIChvYmosIHBhdGgsIGRlZmF1bHRWYWx1ZSl7XG4gICAgaWYgKGlzTnVtYmVyKHBhdGgpKSB7XG4gICAgICBwYXRoID0gW3BhdGhdO1xuICAgIH1cbiAgICBpZiAoaXNFbXB0eShwYXRoKSkge1xuICAgICAgcmV0dXJuIG9iajtcbiAgICB9XG4gICAgaWYgKGlzRW1wdHkob2JqKSkge1xuICAgICAgcmV0dXJuIGRlZmF1bHRWYWx1ZTtcbiAgICB9XG4gICAgaWYgKGlzU3RyaW5nKHBhdGgpKSB7XG4gICAgICByZXR1cm4gb2JqZWN0UGF0aC5nZXQob2JqLCBwYXRoLnNwbGl0KCcuJyksIGRlZmF1bHRWYWx1ZSk7XG4gICAgfVxuXG4gICAgdmFyIGN1cnJlbnRQYXRoID0gZ2V0S2V5KHBhdGhbMF0pO1xuXG4gICAgaWYgKHBhdGgubGVuZ3RoID09PSAxKSB7XG4gICAgICBpZiAob2JqW2N1cnJlbnRQYXRoXSA9PT0gdm9pZCAwKSB7XG4gICAgICAgIHJldHVybiBkZWZhdWx0VmFsdWU7XG4gICAgICB9XG4gICAgICByZXR1cm4gb2JqW2N1cnJlbnRQYXRoXTtcbiAgICB9XG5cbiAgICByZXR1cm4gb2JqZWN0UGF0aC5nZXQob2JqW2N1cnJlbnRQYXRoXSwgcGF0aC5zbGljZSgxKSwgZGVmYXVsdFZhbHVlKTtcbiAgfTtcblxuICBvYmplY3RQYXRoLmRlbCA9IGZ1bmN0aW9uKG9iaiwgcGF0aCkge1xuICAgIHJldHVybiBkZWwob2JqLCBwYXRoKTtcbiAgfTtcblxuICByZXR1cm4gb2JqZWN0UGF0aDtcbn0pO1xuIiwiLyoqXG4gKiBNb2R1bGUgRGVwZW5kZW5jaWVzLlxuICovXG5cbnZhciByYWYgPSByZXF1aXJlKCdyYWYnKTtcblxuLyoqXG4gKiBFeHBvcnQgYHRocm90dGxlYC5cbiAqL1xuXG5tb2R1bGUuZXhwb3J0cyA9IHRocm90dGxlO1xuXG4vKipcbiAqIEV4ZWN1dGVzIGEgZnVuY3Rpb24gYXQgbW9zdCBvbmNlIHBlciBhbmltYXRpb24gZnJhbWUuIEtpbmQgb2YgbGlrZVxuICogdGhyb3R0bGUsIGJ1dCBpdCB0aHJvdHRsZXMgYXQgfjYwSHouXG4gKlxuICogQHBhcmFtIHtGdW5jdGlvbn0gZm4gLSB0aGUgRnVuY3Rpb24gdG8gdGhyb3R0bGUgb25jZSBwZXIgYW5pbWF0aW9uIGZyYW1lXG4gKiBAcmV0dXJuIHtGdW5jdGlvbn1cbiAqIEBwdWJsaWNcbiAqL1xuXG5mdW5jdGlvbiB0aHJvdHRsZShmbikge1xuICB2YXIgcnRuO1xuICB2YXIgaWdub3JpbmcgPSBmYWxzZTtcblxuICByZXR1cm4gZnVuY3Rpb24gcXVldWUoKSB7XG4gICAgaWYgKGlnbm9yaW5nKSByZXR1cm4gcnRuO1xuICAgIGlnbm9yaW5nID0gdHJ1ZTtcblxuICAgIHJhZihmdW5jdGlvbigpIHtcbiAgICAgIGlnbm9yaW5nID0gZmFsc2U7XG4gICAgfSk7XG5cbiAgICBydG4gPSBmbi5hcHBseSh0aGlzLCBhcmd1bWVudHMpO1xuICAgIHJldHVybiBydG47XG4gIH07XG59XG4iLCJtb2R1bGUuZXhwb3J0cyA9IGV4cG9ydHMgPSByZXF1aXJlKCcuL2xpYi9zbGljZWQnKTtcbiIsIlxuLyoqXG4gKiBBbiBBcnJheS5wcm90b3R5cGUuc2xpY2UuY2FsbChhcmd1bWVudHMpIGFsdGVybmF0aXZlXG4gKlxuICogQHBhcmFtIHtPYmplY3R9IGFyZ3Mgc29tZXRoaW5nIHdpdGggYSBsZW5ndGhcbiAqIEBwYXJhbSB7TnVtYmVyfSBzbGljZVxuICogQHBhcmFtIHtOdW1iZXJ9IHNsaWNlRW5kXG4gKiBAYXBpIHB1YmxpY1xuICovXG5cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gKGFyZ3MsIHNsaWNlLCBzbGljZUVuZCkge1xuICB2YXIgcmV0ID0gW107XG4gIHZhciBsZW4gPSBhcmdzLmxlbmd0aDtcblxuICBpZiAoMCA9PT0gbGVuKSByZXR1cm4gcmV0O1xuXG4gIHZhciBzdGFydCA9IHNsaWNlIDwgMFxuICAgID8gTWF0aC5tYXgoMCwgc2xpY2UgKyBsZW4pXG4gICAgOiBzbGljZSB8fCAwO1xuXG4gIGlmIChzbGljZUVuZCAhPT0gdW5kZWZpbmVkKSB7XG4gICAgbGVuID0gc2xpY2VFbmQgPCAwXG4gICAgICA/IHNsaWNlRW5kICsgbGVuXG4gICAgICA6IHNsaWNlRW5kXG4gIH1cblxuICB3aGlsZSAobGVuLS0gPiBzdGFydCkge1xuICAgIHJldFtsZW4gLSBzdGFydF0gPSBhcmdzW2xlbl07XG4gIH1cblxuICByZXR1cm4gcmV0O1xufVxuXG4iLCIndXNlIHN0cmljdCc7XG5cbmZ1bmN0aW9uIFNvdW5kQ2xvdWQgKGNsaWVudElkKSB7XG4gICAgaWYgKCEodGhpcyBpbnN0YW5jZW9mIFNvdW5kQ2xvdWQpKSB7XG4gICAgICAgIHJldHVybiBuZXcgU291bmRDbG91ZChjbGllbnRJZCk7XG4gICAgfVxuXG4gICAgaWYgKCFjbGllbnRJZCkge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ1NvdW5kQ2xvdWQgQVBJIGNsaWVudElkIGlzIHJlcXVpcmVkLCBnZXQgaXQgLSBodHRwczovL2RldmVsb3BlcnMuc291bmRjbG91ZC5jb20vJyk7XG4gICAgfVxuXG4gICAgdGhpcy5fZXZlbnRzID0ge307XG5cbiAgICB0aGlzLl9jbGllbnRJZCA9IGNsaWVudElkO1xuICAgIHRoaXMuX2Jhc2VVcmwgPSAnaHR0cDovL2FwaS5zb3VuZGNsb3VkLmNvbSc7XG5cbiAgICB0aGlzLnBsYXlpbmcgPSBmYWxzZTtcbiAgICB0aGlzLmR1cmF0aW9uID0gMDtcblxuICAgIHRoaXMuYXVkaW8gPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdhdWRpbycpO1xufVxuXG5Tb3VuZENsb3VkLnByb3RvdHlwZS5yZXNvbHZlID0gZnVuY3Rpb24gKHVybCwgY2FsbGJhY2spIHtcbiAgICBpZiAoIXVybCkge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ1NvdW5kQ2xvdWQgdHJhY2sgb3IgcGxheWxpc3QgdXJsIGlzIHJlcXVpcmVkJyk7XG4gICAgfVxuXG4gICAgdXJsID0gdGhpcy5fYmFzZVVybCsnL3Jlc29sdmUuanNvbj91cmw9Jyt1cmwrJyZjbGllbnRfaWQ9Jyt0aGlzLl9jbGllbnRJZDtcblxuICAgIHRoaXMuX2pzb25wKHVybCwgZnVuY3Rpb24gKGRhdGEpIHtcbiAgICAgICAgaWYgKGRhdGEudHJhY2tzKSB7XG4gICAgICAgICAgICB0aGlzLl9wbGF5bGlzdCA9IGRhdGE7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICB0aGlzLl90cmFjayA9IGRhdGE7XG4gICAgICAgIH1cblxuICAgICAgICB0aGlzLmR1cmF0aW9uID0gZGF0YS5kdXJhdGlvbi8xMDAwOyAvLyBjb252ZXJ0IHRvIHNlY29uZHNcbiAgICAgICAgY2FsbGJhY2soZGF0YSk7XG4gICAgfS5iaW5kKHRoaXMpKTtcbn07XG5cblNvdW5kQ2xvdWQucHJvdG90eXBlLl9qc29ucCA9IGZ1bmN0aW9uICh1cmwsIGNhbGxiYWNrKSB7XG4gICAgdmFyIHRhcmdldCA9IGRvY3VtZW50LmdldEVsZW1lbnRzQnlUYWdOYW1lKCdzY3JpcHQnKVswXSB8fCBkb2N1bWVudC5oZWFkO1xuICAgIHZhciBzY3JpcHQgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdzY3JpcHQnKTtcblxuICAgIHZhciBpZCA9ICdqc29ucF9jYWxsYmFja18nK01hdGgucm91bmQoMTAwMDAwKk1hdGgucmFuZG9tKCkpO1xuICAgIHdpbmRvd1tpZF0gPSBmdW5jdGlvbiAoZGF0YSkge1xuICAgICAgICBpZiAoc2NyaXB0LnBhcmVudE5vZGUpIHtcbiAgICAgICAgICAgIHNjcmlwdC5wYXJlbnROb2RlLnJlbW92ZUNoaWxkKHNjcmlwdCk7XG4gICAgICAgIH1cbiAgICAgICAgd2luZG93W2lkXSA9IGZ1bmN0aW9uICgpIHt9O1xuICAgICAgICBjYWxsYmFjayhkYXRhKTtcbiAgICB9O1xuXG4gICAgc2NyaXB0LnNyYyA9IHVybCArICh1cmwuaW5kZXhPZignPycpID49IDAgPyAnJicgOiAnPycpICsgJ2NhbGxiYWNrPScgKyBpZDtcbiAgICB0YXJnZXQucGFyZW50Tm9kZS5pbnNlcnRCZWZvcmUoc2NyaXB0LCB0YXJnZXQpO1xufTtcblxuU291bmRDbG91ZC5wcm90b3R5cGUub24gPSBmdW5jdGlvbiAoZSwgZm4pIHtcbiAgICB0aGlzLl9ldmVudHNbZV0gPSBmbjtcbiAgICB0aGlzLmF1ZGlvLmFkZEV2ZW50TGlzdGVuZXIoZSwgZm4sIGZhbHNlKTtcbn07XG5cblNvdW5kQ2xvdWQucHJvdG90eXBlLm9mZiA9IGZ1bmN0aW9uIChlLCBmbikge1xuICAgIHRoaXMuX2V2ZW50c1tlXSA9IG51bGw7XG4gICAgdGhpcy5hdWRpby5yZW1vdmVFdmVudExpc3RlbmVyKGUsIGZuKTtcbn07XG5cblNvdW5kQ2xvdWQucHJvdG90eXBlLnVuYmluZEFsbCA9IGZ1bmN0aW9uICgpIHtcbiAgICBmb3IgKHZhciBlIGluIHRoaXMuX2V2ZW50cykge1xuICAgICAgICB2YXIgZm4gPSB0aGlzLl9ldmVudHNbZV07XG4gICAgICAgIGlmIChmbikge1xuICAgICAgICAgICAgdGhpcy5vZmYoZSwgZm4pO1xuICAgICAgICB9XG4gICAgfVxufTtcblxuU291bmRDbG91ZC5wcm90b3R5cGUucHJlbG9hZCA9IGZ1bmN0aW9uIChzdHJlYW1VcmwpIHtcbiAgICB0aGlzLl90cmFjayA9IHtzdHJlYW1fdXJsOiBzdHJlYW1Vcmx9O1xuICAgIHRoaXMuYXVkaW8uc3JjID0gc3RyZWFtVXJsKyc/Y2xpZW50X2lkPScrdGhpcy5fY2xpZW50SWQ7XG59O1xuXG5Tb3VuZENsb3VkLnByb3RvdHlwZS5wbGF5ID0gZnVuY3Rpb24gKG9wdGlvbnMpIHtcbiAgICBvcHRpb25zID0gb3B0aW9ucyB8fCB7fTtcbiAgICB2YXIgc3JjO1xuXG4gICAgaWYgKG9wdGlvbnMuc3RyZWFtVXJsKSB7XG4gICAgICAgIHNyYyA9IG9wdGlvbnMuc3RyZWFtVXJsO1xuICAgIH0gZWxzZSBpZiAodGhpcy5fcGxheWxpc3QpIHtcbiAgICAgICAgdmFyIGxlbmd0aCA9IHRoaXMuX3BsYXlsaXN0LnRyYWNrcy5sZW5ndGg7XG4gICAgICAgIGlmIChsZW5ndGgpIHtcbiAgICAgICAgICAgIHRoaXMuX3BsYXlsaXN0SW5kZXggPSBvcHRpb25zLnBsYXlsaXN0SW5kZXggfHwgMDtcblxuICAgICAgICAgICAgLy8gYmUgc2lsZW50IGlmIGluZGV4IGlzIG91dCBvZiByYW5nZVxuICAgICAgICAgICAgaWYgKHRoaXMuX3BsYXlsaXN0SW5kZXggPj0gbGVuZ3RoIHx8IHRoaXMuX3BsYXlsaXN0SW5kZXggPCAwKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5fcGxheWxpc3RJbmRleCA9IDA7XG4gICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgc3JjID0gdGhpcy5fcGxheWxpc3QudHJhY2tzW3RoaXMuX3BsYXlsaXN0SW5kZXhdLnN0cmVhbV91cmw7XG4gICAgICAgIH1cbiAgICB9IGVsc2UgaWYgKHRoaXMuX3RyYWNrKSB7XG4gICAgICAgIHNyYyA9IHRoaXMuX3RyYWNrLnN0cmVhbV91cmw7XG4gICAgfVxuXG4gICAgaWYgKCFzcmMpIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdUaGVyZSBpcyBubyB0cmFja3MgdG8gcGxheSwgdXNlIGBzdHJlYW1VcmxgIG9wdGlvbiBvciBgbG9hZGAgbWV0aG9kJyk7XG4gICAgfVxuXG4gICAgc3JjICs9ICc/Y2xpZW50X2lkPScrdGhpcy5fY2xpZW50SWQ7XG5cbiAgICBpZiAoc3JjICE9PSB0aGlzLmF1ZGlvLnNyYykge1xuICAgICAgICB0aGlzLmF1ZGlvLnNyYyA9IHNyYztcbiAgICB9XG5cbiAgICB0aGlzLnBsYXlpbmcgPSBzcmM7XG4gICAgdGhpcy5hdWRpby5wbGF5KCk7XG59O1xuXG5Tb3VuZENsb3VkLnByb3RvdHlwZS5wYXVzZSA9IGZ1bmN0aW9uICgpIHtcbiAgICB0aGlzLmF1ZGlvLnBhdXNlKCk7XG4gICAgdGhpcy5wbGF5aW5nID0gZmFsc2U7XG59O1xuXG5Tb3VuZENsb3VkLnByb3RvdHlwZS5zdG9wID0gZnVuY3Rpb24gKCkge1xuICAgIHRoaXMuYXVkaW8ucGF1c2UoKTtcbiAgICB0aGlzLmF1ZGlvLmN1cnJlbnRUaW1lID0gMDtcbiAgICB0aGlzLnBsYXlpbmcgPSBmYWxzZTtcbn07XG5cblNvdW5kQ2xvdWQucHJvdG90eXBlLm5leHQgPSBmdW5jdGlvbiAoKSB7XG4gICAgdmFyIHRyYWNrc0xlbmd0aCA9IHRoaXMuX3BsYXlsaXN0LnRyYWNrcy5sZW5ndGg7XG4gICAgaWYgKHRoaXMuX3BsYXlsaXN0SW5kZXggPj0gdHJhY2tzTGVuZ3RoLTEpIHtcbiAgICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBpZiAodGhpcy5fcGxheWxpc3QgJiYgdHJhY2tzTGVuZ3RoKSB7XG4gICAgICAgIHRoaXMucGxheSh7cGxheWxpc3RJbmRleDogKyt0aGlzLl9wbGF5bGlzdEluZGV4fSk7XG4gICAgfVxufTtcblxuU291bmRDbG91ZC5wcm90b3R5cGUucHJldmlvdXMgPSBmdW5jdGlvbiAoKSB7XG4gICAgaWYgKHRoaXMuX3BsYXlsaXN0SW5kZXggPD0gMCkge1xuICAgICAgICByZXR1cm47XG4gICAgfVxuICAgIGlmICh0aGlzLl9wbGF5bGlzdCAmJiB0aGlzLl9wbGF5bGlzdC50cmFja3MubGVuZ3RoKSB7XG4gICAgICAgIHRoaXMucGxheSh7cGxheWxpc3RJbmRleDogLS10aGlzLl9wbGF5bGlzdEluZGV4fSk7XG4gICAgfVxufTtcblxuU291bmRDbG91ZC5wcm90b3R5cGUuc2VlayA9IGZ1bmN0aW9uIChlKSB7XG4gICAgaWYgKCF0aGlzLmF1ZGlvLnJlYWR5U3RhdGUpIHtcbiAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cbiAgICB2YXIgcGVyY2VudCA9IGUub2Zmc2V0WCAvIGUudGFyZ2V0Lm9mZnNldFdpZHRoIHx8IChlLmxheWVyWCAtIGUudGFyZ2V0Lm9mZnNldExlZnQpIC8gZS50YXJnZXQub2Zmc2V0V2lkdGg7XG4gICAgdGhpcy5hdWRpby5jdXJyZW50VGltZSA9IHBlcmNlbnQgKiAodGhpcy5hdWRpby5kdXJhdGlvbiB8fCAwKTtcbn07XG5cbm1vZHVsZS5leHBvcnRzID0gU291bmRDbG91ZDtcbiIsIi8qKiBAanN4IGRla3UuZG9tICovXG5cbmltcG9ydCBkZWt1IGZyb20gJ2Rla3UnO1xuXG4vLyBTb3VuZENsb3VkIExvZ29cbmNvbnN0IFNvdW5kQ2xvdWRMb2dvU1ZHID0ge1xuICAgIHNob3VsZFVwZGF0ZSgpIHtcbiAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH0sXG5cbiAgICByZW5kZXIoKSB7XG4gICAgICAgIHJldHVybiAoXG4gICAgICAgICAgICA8c3ZnXG4gICAgICAgICAgICAgICAgY2xhc3M9XCJzYi1zb3VuZHBsYXllci13aWRnZXQtY292ZXItbG9nb1wiXG4gICAgICAgICAgICAgICAgeG1sbnM9XCJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2Z1wiXG4gICAgICAgICAgICAgICAgZmlsbD1cImN1cnJlbnRDb2xvclwiXG4gICAgICAgICAgICA+XG4gICAgICAgICAgICAgICAgPHBhdGggZD1cIk0xMC41MTcgMy43NDJjLS4zMjMgMC0uNDkuMzYzLS40OS41ODIgMCAwLS4yNDQgMy41OTEtLjI0NCA0LjY0MSAwIDEuNjAyLjE1IDIuNjIxLjE1IDIuNjIxIDAgLjIyMi4yNjEuNDAxLjU4NC40MDEuMzIxIDAgLjUxOS0uMTc5LjUxOS0uNDAxIDAgMCAuMzk4LTEuMDM4LjM5OC0yLjYzOSAwLTEuODM3LS4xNTMtNC4xMjctLjI4NC00LjU5Mi0uMTEyLS4zOTUtLjMxMy0uNjEzLS42MzMtLjYxM3ptLTEuOTk2LjI2OGMtLjMyMyAwLS40OS4zNjMtLjQ5LjU4MiAwIDAtLjI0NCAzLjMyMi0uMjQ0IDQuMzcyIDAgMS42MDIuMTE5IDIuNjIxLjExOSAyLjYyMSAwIC4yMjIuMjYuNDAxLjU4NC40MDEuMzIxIDAgLjU4MS0uMTc5LjU4MS0uNDAxIDAgMCAuMDgxLTEuMDA3LjA4MS0yLjYwOCAwLTEuODM3LS4yMDYtNC4zODYtLjIwNi00LjM4NiAwLS4yMTgtLjEwNC0uNTgxLS40MjUtLjU4MXptLTIuMDIxIDEuNzI5Yy0uMzI0IDAtLjQ5LjM2Mi0uNDkuNTgyIDAgMC0uMjcyIDEuNTk0LS4yNzIgMi42NDQgMCAxLjYwMi4xNzkgMi41NTkuMTc5IDIuNTU5IDAgLjIyMi4yMjkuNDYzLjU1Mi40NjMuMzIxIDAgLjUxOS0uMjQxLjUxOS0uNDYzIDAgMCAuMTktLjk0NC4xOS0yLjU0NiAwLTEuODM3LS4yNTMtMi42NTctLjI1My0yLjY1NyAwLS4yMi0uMTA0LS41ODItLjQyNS0uNTgyem0tMi4wNDYtLjM1OGMtLjMyMyAwLS40OS4zNjMtLjQ5LjU4MiAwIDAtLjE2MiAxLjkyLS4xNjIgMi45NyAwIDEuNjAyLjA2OSAyLjQ5Ni4wNjkgMi40OTYgMCAuMjIyLjI2LjU1Ny41ODQuNTU3LjMyMSAwIC41ODEtLjMwNC41ODEtLjUyNiAwIDAgLjE0My0uOTM2LjE0My0yLjUzOCAwLTEuODM3LS4yMDYtMi45Ni0uMjA2LTIuOTYgMC0uMjE4LS4xOTgtLjU4MS0uNTE5LS41ODF6bS0yLjE2OSAxLjQ4MmMtLjI3MiAwLS4yMzIuMjE4LS4yMzIuMjE4djMuOTgycy0uMDQuMzM1LjIzMi4zMzVjLjM1MSAwIC43MTYtLjgzMi43MTYtMi4zNDggMC0xLjI0NS0uNDM2LTIuMTg3LS43MTYtMi4xODd6bTE4LjcxNS0uOTc2Yy0uMjg5IDAtLjU2Ny4wNDItLjgzMi4xMTYtLjQxNy0yLjI2Ni0yLjgwNi0zLjk4OS01LjI2My0zLjk4OS0xLjEyNyAwLTIuMDk1LjcwNS0yLjkzMSAxLjMxNnY4LjE2czAgLjQ4NC41LjQ4NGg4LjUyNmMxLjY1NSAwIDMtMS41NSAzLTMuMTU1IDAtMS42MDctMS4zNDYtMi45MzItMy0yLjkzMnptMTAuMTcuODU3Yy0xLjA3Ny0uMjUzLTEuMzY4LS4zODktMS4zNjgtLjgxNSAwLS4zLjI0Mi0uNjExLjk3LS42MTEuNjIxIDAgMS4xMDYuMjUzIDEuNTQyLjY5OWwuOTgxLS45NTFjLS42NDEtLjY2OS0xLjQxNy0xLjA2Ny0yLjQ3NC0xLjA2Ny0xLjMzOSAwLTIuNDI1Ljc1Ny0yLjQyNSAxLjk5IDAgMS4zMzguODczIDEuNzM2IDIuMTI0IDIuMDI2IDEuMjgxLjI5MSAxLjUxMy40ODYgMS41MTMuOTIzIDAgLjUxNC0uMzc5LjczOC0xLjE4NC43MzgtLjY1IDAtMS4yNi0uMjIzLTEuNzM2LS43NzdsLS45OC44NzNjLjUxNC43NTcgMS41MDQgMS4yMzIgMi42MzkgMS4yMzIgMS44NTMgMCAyLjY2OC0uODczIDIuNjY4LTIuMTYzIDAtMS40NzctMS4xOTMtMS44NDUtMi4yNy0yLjA5N3ptNi44MDMtMi43NDVjLTEuODUzIDAtMi45NDkgMS40MzUtMi45NDkgMy41MDJzMS4wOTYgMy41MDEgMi45NDkgMy41MDFjMS44NTIgMCAyLjk0OS0xLjQzNCAyLjk0OS0zLjUwMXMtMS4wOTYtMy41MDItMi45NDktMy41MDJ6bTAgNS42NTVjLTEuMDk3IDAtMS41NTMtLjk0MS0xLjU1My0yLjE1MyAwLTEuMjEzLjQ1Ni0yLjE1MyAxLjU1My0yLjE1MyAxLjA5NiAwIDEuNTUxLjk0IDEuNTUxIDIuMTUzLjAwMSAxLjIxMy0uNDU0IDIuMTUzLTEuNTUxIDIuMTUzem04LjkzOS0xLjczNmMwIDEuMDg2LS41MzMgMS43NTYtMS4zOTYgMS43NTYtLjg2NCAwLTEuMzg4LS42ODktMS4zODgtMS43NzV2LTMuODk3aC0xLjM1OHYzLjkxNmMwIDEuOTc4IDEuMTA2IDMuMDg0IDIuNzQ2IDMuMDg0IDEuNzI2IDAgMi43NTQtMS4xMzYgMi43NTQtMy4xMDN2LTMuODk3aC0xLjM1OHYzLjkxNnptOC4xNDItLjg5bC4wMTkgMS40ODVjLS4wODctLjE3NC0uMzEtLjUxNS0uNDc1LS43NjhsLTIuNzAzLTMuNjkyaC0xLjM2MnY2Ljg5NGgxLjQwMXYtMi45ODhsLS4wMi0xLjQ4NGMuMDg4LjE3NS4zMTEuNTE0LjQ3NS43NjdsMi43OSAzLjcwNWgxLjIxM3YtNi44OTRoLTEuMzM5djIuOTc1em01Ljg5NS0yLjkyM2gtMi4xMjR2Ni43OTFoMi4wMjdjMS43NDYgMCAzLjQ3NC0xLjAxIDMuNDc0LTMuMzk1IDAtMi40ODQtMS40MzctMy4zOTYtMy4zNzctMy4zOTZ6bS0uMDk3IDUuNDcyaC0uNjd2LTQuMTUyaC43MTljMS40MzYgMCAyLjAyOC42ODggMi4wMjggMi4wNzYgMCAxLjI0Mi0uNjUxIDIuMDc2LTIuMDc3IDIuMDc2em03LjkwOS00LjIyOWMuNjExIDAgMSAuMjcxIDEuMjQyLjczN2wxLjI2LS41ODJjLS40MjYtLjg4My0xLjIwMi0xLjUwMy0yLjQ4My0xLjUwMy0xLjc3NSAwLTMuMDE2IDEuNDM1LTMuMDE2IDMuNTAyIDAgMi4xNDMgMS4xOTEgMy41MDEgMi45NjggMy41MDEgMS4yMzIgMCAyLjA0Ny0uNTcyIDIuNTEzLTEuNTMzbC0xLjE0NS0uNjhjLS4zNTguNjAyLS43MTguODY0LTEuMzI5Ljg2NC0xLjAxOSAwLTEuNjExLS45MzItMS42MTEtMi4xNTMtLjAwMS0xLjI2MS41ODMtMi4xNTMgMS42MDEtMi4xNTN6bTUuMTctMS4xOTJoLTEuMzU5djYuNzkxaDQuMDgzdi0xLjMzOGgtMi43MjR2LTUuNDUzem02LjM5Ni0uMTU3Yy0xLjg1NCAwLTIuOTQ5IDEuNDM1LTIuOTQ5IDMuNTAyczEuMDk1IDMuNTAxIDIuOTQ5IDMuNTAxYzEuODUzIDAgMi45NS0xLjQzNCAyLjk1LTMuNTAxcy0xLjA5Ny0zLjUwMi0yLjk1LTMuNTAyem0wIDUuNjU1Yy0xLjA5NyAwLTEuNTUzLS45NDEtMS41NTMtMi4xNTMgMC0xLjIxMy40NTYtMi4xNTMgMS41NTMtMi4xNTMgMS4wOTUgMCAxLjU1Ljk0IDEuNTUgMi4xNTMuMDAxIDEuMjEzLS40NTQgMi4xNTMtMS41NSAyLjE1M3ptOC41NTctMS43MzZjMCAxLjA4Ni0uNTMyIDEuNzU2LTEuMzk2IDEuNzU2LS44NjQgMC0xLjM4OC0uNjg5LTEuMzg4LTEuNzc1di0zLjc5NGgtMS4zNTh2My44MTNjMCAxLjk3OCAxLjEwNiAzLjA4NCAyLjc0NiAzLjA4NCAxLjcyNiAwIDIuNzU1LTEuMTM2IDIuNzU1LTMuMTAzdi0zLjc5NGgtMS4zNnYzLjgxM3ptNS40NDktMy45MDdoLTIuMzE4djYuOTc4aDIuMjExYzEuOTA4IDAgMy43ODktMS4wMzcgMy43ODktMy40ODkgMC0yLjU1Mi0xLjU2NS0zLjQ4OS0zLjY4Mi0zLjQ4OXptLS4xMDggNS42MjNoLS43Mjl2LTQuMjY2aC43ODNjMS41NjUgMCAyLjIxLjcwNiAyLjIxIDIuMTMzLjAwMSAxLjI3Ni0uNzA3IDIuMTMzLTIuMjY0IDIuMTMzelwiIC8+XG4gICAgICAgICAgICA8L3N2Zz5cbiAgICAgICAgKTtcbiAgICB9XG59O1xuXG4vLyBQbGF5ZXIgQnV0dG9uIEljb25zXG5jb25zdCBCdXR0b25JY29uU1ZHID0ge1xuICAgIHJlbmRlcihjb21wb25lbnQpIHtcbiAgICAgICAgY29uc3QgeyBwcm9wcyB9ID0gY29tcG9uZW50O1xuXG4gICAgICAgIHJldHVybiAoXG4gICAgICAgICAgICA8c3ZnXG4gICAgICAgICAgICAgICAgY2xhc3M9XCJzYi1zb3VuZHBsYXllci13aWRnZXQtYnV0dG9uLWljb25cIlxuICAgICAgICAgICAgICAgIHhtbG5zPVwiaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmdcIlxuICAgICAgICAgICAgICAgIHZpZXdCb3g9XCIwIDAgMzIgMzJcIlxuICAgICAgICAgICAgICAgIGZpbGw9XCJjdXJyZW50Q29sb3JcIlxuICAgICAgICAgICAgPlxuICAgICAgICAgICAgICAgIHtwcm9wcy5jaGlsZHJlbn1cbiAgICAgICAgICAgIDwvc3ZnPlxuICAgICAgICApO1xuICAgIH1cbn07XG5cbi8vIHw+IFBsYXlcbmNvbnN0IFBsYXlJY29uU1ZHID0ge1xuICAgIHNob3VsZFVwZGF0ZSgpIHtcbiAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH0sXG5cbiAgICByZW5kZXIoKSB7XG4gICAgICAgIHJldHVybiAoXG4gICAgICAgICAgICA8QnV0dG9uSWNvblNWRz5cbiAgICAgICAgICAgICAgICA8cGF0aCBkPVwiTTAgMCBMMzIgMTYgTDAgMzIgelwiIC8+XG4gICAgICAgICAgICA8L0J1dHRvbkljb25TVkc+XG4gICAgICAgICk7XG4gICAgfVxufTtcblxuLy8gfHwgUGF1c2VcbmNvbnN0IFBhdXNlSWNvblNWRyA9IHtcbiAgICBzaG91bGRVcGRhdGUoKSB7XG4gICAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9LFxuXG4gICAgcmVuZGVyKCkge1xuICAgICAgICByZXR1cm4gKFxuICAgICAgICAgICAgPEJ1dHRvbkljb25TVkc+XG4gICAgICAgICAgICAgICAgPHBhdGggZD1cIk0wIDAgSDEyIFYzMiBIMCB6IE0yMCAwIEgzMiBWMzIgSDIwIHpcIiAvPlxuICAgICAgICAgICAgPC9CdXR0b25JY29uU1ZHPlxuICAgICAgICApO1xuICAgIH1cbn07XG5cbi8vIHw+fCBOZXh0XG5jb25zdCBOZXh0SWNvblNWRyA9IHtcbiAgICBzaG91bGRVcGRhdGUoKSB7XG4gICAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9LFxuXG4gICAgcmVuZGVyKCkge1xuICAgICAgICByZXR1cm4gKFxuICAgICAgICAgICAgPEJ1dHRvbkljb25TVkc+XG4gICAgICAgICAgICAgICAgPHBhdGggZD1cIk00IDQgTDI0IDE0IFY0IEgyOCBWMjggSDI0IFYxOCBMNCAyOCB6IFwiIC8+XG4gICAgICAgICAgICA8L0J1dHRvbkljb25TVkc+XG4gICAgICAgICk7XG4gICAgfVxufTtcblxuLy8gfDx8IFByZXZcbmNvbnN0IFByZXZJY29uU1ZHID0ge1xuICAgIHNob3VsZFVwZGF0ZSgpIHtcbiAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH0sXG5cbiAgICByZW5kZXIoKSB7XG4gICAgICAgIHJldHVybiAoXG4gICAgICAgICAgICA8QnV0dG9uSWNvblNWRz5cbiAgICAgICAgICAgICAgICA8cGF0aCBkPVwiTTQgNCBIOCBWMTQgTDI4IDQgVjI4IEw4IDE4IFYyOCBINCB6IFwiIC8+XG4gICAgICAgICAgICA8L0J1dHRvbkljb25TVkc+XG4gICAgICAgICk7XG4gICAgfVxufTtcblxuZXhwb3J0IGRlZmF1bHQge1xuICAgIFNvdW5kQ2xvdWRMb2dvU1ZHLFxuICAgIFBsYXlJY29uU1ZHLFxuICAgIFBhdXNlSWNvblNWRyxcbiAgICBOZXh0SWNvblNWRyxcbiAgICBQcmV2SWNvblNWR1xufTtcbiIsIi8qKiBAanN4IGRla3UuZG9tICovXG5cbmltcG9ydCBkZWt1IGZyb20gJ2Rla3UnO1xuXG5pbXBvcnQgeyBQbGF5SWNvblNWRywgUGF1c2VJY29uU1ZHIH0gZnJvbSAnLi9JY29ucyc7XG5cbmNvbnN0IFBsYXlCdXR0b24gPSB7XG4gICAgZGVmYXVsdFByb3BzOiB7XG4gICAgICAgIHBsYXlpbmc6IGZhbHNlLFxuICAgICAgICBzZWVraW5nOiBmYWxzZVxuICAgIH0sXG5cbiAgICBwcm9wVHlwZXM6IHtcbiAgICAgICAgcGxheWluZzoge1xuICAgICAgICAgICAgdHlwZTogJ2Jvb2xlYW4nXG4gICAgICAgIH0sXG4gICAgICAgIHNlZWtpbmc6IHtcbiAgICAgICAgICAgIHR5cGU6ICdib29sZWFuJ1xuICAgICAgICB9XG4gICAgfSxcblxuICAgIHJlbmRlcihjb21wb25lbnQpIHtcbiAgICAgICAgY29uc3QgeyBwcm9wcyB9ID0gY29tcG9uZW50O1xuXG4gICAgICAgIGZ1bmN0aW9uIGhhbmRsZUNsaWNrIChlKSB7XG4gICAgICAgICAgICBlLnByZXZlbnREZWZhdWx0KCk7XG5cbiAgICAgICAgICAgIGNvbnN0IHsgcGxheWluZywgc291bmRDbG91ZEF1ZGlvLCBvblRvZ2dsZVBsYXkgfSA9IHByb3BzO1xuXG4gICAgICAgICAgICBpZiAoIXBsYXlpbmcpIHtcbiAgICAgICAgICAgICAgICBzb3VuZENsb3VkQXVkaW8gJiYgc291bmRDbG91ZEF1ZGlvLnBsYXkoKTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgc291bmRDbG91ZEF1ZGlvICYmIHNvdW5kQ2xvdWRBdWRpby5wYXVzZSgpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBvblRvZ2dsZVBsYXkgJiYgb25Ub2dnbGVQbGF5KGUpO1xuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIChcbiAgICAgICAgICAgIDxidXR0b24gY2xhc3M9XCJzYi1zb3VuZHBsYXllci13aWRnZXQtcGxheVwiIG9uQ2xpY2s9e2hhbmRsZUNsaWNrfT5cbiAgICAgICAgICAgICAgICB7IXByb3BzLnBsYXlpbmcgPyAoXG4gICAgICAgICAgICAgICAgICAgIDxQbGF5SWNvblNWRyAvPlxuICAgICAgICAgICAgICAgICkgOiAoXG4gICAgICAgICAgICAgICAgICAgIDxQYXVzZUljb25TVkcgLz5cbiAgICAgICAgICAgICAgICApfVxuICAgICAgICAgICAgPC9idXR0b24+XG4gICAgICAgICk7XG4gICAgfVxufTtcblxuZXhwb3J0IGRlZmF1bHQgUGxheUJ1dHRvbjtcbiIsIi8qKiBAanN4IGRla3UuZG9tICovXG5cbmltcG9ydCBkZWt1IGZyb20gJ2Rla3UnO1xuXG5jb25zdCBQcm9ncmVzcyA9IHtcbiAgICBkZWZhdWx0UHJvcHM6IHtcbiAgICAgICAgdmFsdWU6IDBcbiAgICB9LFxuXG4gICAgcHJvcFR5cGVzOiB7XG4gICAgICAgIHZhbHVlOiB7XG4gICAgICAgICAgICB0eXBlOiAnbnVtYmVyJ1xuICAgICAgICB9XG4gICAgfSxcblxuICAgIHJlbmRlcihjb21wb25lbnQpIHtcbiAgICAgICAgbGV0IHsgcHJvcHMgfSA9IGNvbXBvbmVudDtcbiAgICAgICAgbGV0IHsgdmFsdWUsIHNvdW5kQ2xvdWRBdWRpbyB9ID0gcHJvcHM7XG5cbiAgICAgICAgaWYgKHZhbHVlIDwgMCkge1xuICAgICAgICAgICAgdmFsdWUgPSAwO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKHZhbHVlID4gMTAwKSB7XG4gICAgICAgICAgICB2YWx1ZSA9IDEwMDtcbiAgICAgICAgfVxuXG4gICAgICAgIGxldCBzdHlsZSA9IHt3aWR0aDogYCR7dmFsdWV9JWB9O1xuXG4gICAgICAgIGZ1bmN0aW9uIGhhbmRsZVNlZWtUcmFjayAoZSkge1xuICAgICAgICAgICAgY29uc3QgeFBvcyA9IChlLnBhZ2VYIC0gZS5jdXJyZW50VGFyZ2V0LmdldEJvdW5kaW5nQ2xpZW50UmVjdCgpLmxlZnQpIC8gZS5jdXJyZW50VGFyZ2V0Lm9mZnNldFdpZHRoO1xuXG4gICAgICAgICAgICBpZiAoc291bmRDbG91ZEF1ZGlvICYmICFpc05hTihzb3VuZENsb3VkQXVkaW8uYXVkaW8uZHVyYXRpb24pKSB7XG4gICAgICAgICAgICAgICAgc291bmRDbG91ZEF1ZGlvLmF1ZGlvLmN1cnJlbnRUaW1lID0gKHhQb3MgKiBzb3VuZENsb3VkQXVkaW8uYXVkaW8uZHVyYXRpb24pO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIChcbiAgICAgICAgICAgIDxkaXYgY2xhc3M9XCJzYi1zb3VuZHBsYXllci13aWRnZXQtcHJvZ3Jlc3MtY29udGFpbmVyXCIgb25DbGljaz17aGFuZGxlU2Vla1RyYWNrfT5cbiAgICAgICAgICAgICAgICA8ZGl2IGNsYXNzPVwic2Itc291bmRwbGF5ZXItd2lkZ2V0LXByb2dyZXNzLWlubmVyXCIgc3R5bGU9e3N0eWxlfSAvPlxuICAgICAgICAgICAgPC9kaXY+XG4gICAgICAgICk7XG4gICAgfVxufTtcblxuZXhwb3J0IGRlZmF1bHQgUHJvZ3Jlc3M7XG4iLCIvKiogQGpzeCBkZWt1LmRvbSAqL1xuXG5pbXBvcnQgZGVrdSBmcm9tICdkZWt1JztcblxuZnVuY3Rpb24gcHJldHR5VGltZSAodGltZSkge1xuICAgIGxldCBob3VycyA9IE1hdGguZmxvb3IodGltZSAvIDM2MDApO1xuICAgIGxldCBtaW5zID0gJzAnICsgTWF0aC5mbG9vcigodGltZSAlIDM2MDApIC8gNjApO1xuICAgIGxldCBzZWNzID0gJzAnICsgTWF0aC5mbG9vcigodGltZSAlIDYwKSk7XG5cbiAgICBtaW5zID0gbWlucy5zdWJzdHIobWlucy5sZW5ndGggLSAyKTtcbiAgICBzZWNzID0gc2Vjcy5zdWJzdHIoc2Vjcy5sZW5ndGggLSAyKTtcblxuICAgIGlmICghaXNOYU4oc2VjcykpIHtcbiAgICAgICAgaWYgKGhvdXJzKSB7XG4gICAgICAgICAgICByZXR1cm4gYCR7aG91cnN9OiR7bWluc306JHtzZWNzfWA7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICByZXR1cm4gYCR7bWluc306JHtzZWNzfWA7XG4gICAgICAgIH1cbiAgICB9IGVsc2Uge1xuICAgICAgICByZXR1cm4gJzAwOjAwJztcbiAgICB9XG59XG5cbmNvbnN0IFRpbWVyID0ge1xuICAgIGRlZmF1bHRQcm9wczoge1xuICAgICAgICBkdXJhdGlvbjogMCxcbiAgICAgICAgY3VycmVudFRpbWU6IDBcbiAgICB9LFxuXG4gICAgcHJvcFR5cGVzOiB7XG4gICAgICAgIGR1cmF0aW9uOiB7XG4gICAgICAgICAgICB0eXBlOiAnbnVtYmVyJ1xuICAgICAgICB9LFxuICAgICAgICBjdXJyZW50VGltZToge1xuICAgICAgICAgICAgdHlwZTogJ251bWJlcidcbiAgICAgICAgfVxuICAgIH0sXG5cbiAgICByZW5kZXIoY29tcG9uZW50KSB7XG4gICAgICAgIGNvbnN0IHsgcHJvcHMgfSA9IGNvbXBvbmVudDtcblxuICAgICAgICByZXR1cm4gKFxuICAgICAgICAgICAgPGRpdiBjbGFzcz1cInNiLXNvdW5kcGxheWVyLXdpZGdldC10aW1lclwiPlxuICAgICAgICAgICAgICAgIHtwcmV0dHlUaW1lKHByb3BzLmN1cnJlbnRUaW1lKX0gLyB7cHJldHR5VGltZShwcm9wcy5kdXJhdGlvbil9XG4gICAgICAgICAgICA8L2Rpdj5cbiAgICAgICAgKTtcbiAgICB9XG59O1xuXG5leHBvcnQgZGVmYXVsdCBUaW1lcjtcbiIsIi8vIGhhbmRsaW5nIG11bHRpcGxlIGF1ZGlvIG9uIHRoZSBwYWdlIGhlbHBlcnNcbmxldCBfYXVkaW9zID0gW107XG5cbmV4cG9ydCBmdW5jdGlvbiBzdG9wQWxsT3RoZXIgKHBsYXlpbmcpIHtcbiAgICBfYXVkaW9zLmZvckVhY2goKHNvdW5kQ2xvdWRBdWRpbykgPT4ge1xuICAgICAgICBpZiAoc291bmRDbG91ZEF1ZGlvLnBsYXlpbmcgJiYgc291bmRDbG91ZEF1ZGlvLnBsYXlpbmcgIT09IHBsYXlpbmcpIHtcbiAgICAgICAgICAgIHNvdW5kQ2xvdWRBdWRpby5zdG9wKCk7XG4gICAgICAgIH1cbiAgICB9KTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGFkZFRvU3RvcmUgKHNvdW5kQ2xvdWRBdWRpbykge1xuICAgIGxldCBpc1ByZXNlbnQgPSBmYWxzZTtcblxuICAgIGZvciAobGV0IGkgPSAwLCBsZW4gPSBfYXVkaW9zLmxlbmd0aDsgaSA8IGxlbjsgaSsrKSB7XG4gICAgICAgIGxldCBfc291bmRDbG91ZEF1ZGlvID0gX2F1ZGlvc1tpXTtcbiAgICAgICAgaWYgKF9zb3VuZENsb3VkQXVkaW8ucGxheWluZyA9PT0gc291bmRDbG91ZEF1ZGlvLnBsYXlpbmcpIHtcbiAgICAgICAgICAgIGlzUHJlc2VudCA9IHRydWU7XG4gICAgICAgICAgICBicmVhaztcbiAgICAgICAgfVxuICAgIH1cblxuICAgIGlmICghaXNQcmVzZW50KSB7XG4gICAgICAgIF9hdWRpb3MucHVzaChzb3VuZENsb3VkQXVkaW8pO1xuICAgIH1cbn1cbiIsIi8qKiBAanN4IGRla3UuZG9tICovXG5cbmltcG9ydCBkZWt1IGZyb20gJ2Rla3UnO1xuaW1wb3J0IFNvdW5kQ2xvdWRBdWRpbyBmcm9tICdzb3VuZGNsb3VkLWF1ZGlvJztcblxuaW1wb3J0IFBsYXlCdXR0b24gZnJvbSAnLi9jb21wb25lbnRzL1BsYXlCdXR0b24nO1xuaW1wb3J0IFByb2dyZXNzIGZyb20gJy4vY29tcG9uZW50cy9Qcm9ncmVzcyc7XG5pbXBvcnQgVGltZXIgZnJvbSAnLi9jb21wb25lbnRzL1RpbWVyJztcblxuaW1wb3J0IHsgc3RvcEFsbE90aGVyLCBhZGRUb1N0b3JlIH0gZnJvbSAnLi91dGlscy9hdWRpb1N0b3JlJztcblxuY29uc3QgV2lkZ2V0ID0ge1xuICAgIGluaXRpYWxTdGF0ZSgpIHtcbiAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgIGR1cmF0aW9uOiAwLFxuICAgICAgICAgICAgY3VycmVudFRpbWU6IDAsXG4gICAgICAgICAgICBzZWVraW5nOiBmYWxzZSxcbiAgICAgICAgICAgIHBsYXlpbmc6IGZhbHNlXG4gICAgICAgIH07XG4gICAgfSxcblxuICAgIGFmdGVyTW91bnQoY29tcG9uZW50LCBlbCwgc2V0U3RhdGUpIHtcbiAgICAgICAgY29uc3QgeyBwcm9wcyB9ID0gY29tcG9uZW50O1xuICAgICAgICBjb25zdCB7IHNvdW5kQ2xvdWRBdWRpbyB9ID0gcHJvcHM7XG5cbiAgICAgICAgc291bmRDbG91ZEF1ZGlvLnJlc29sdmUocHJvcHMudXJsLCAoZGF0YSkgPT4ge1xuICAgICAgICAgICAgc2V0U3RhdGUoe1xuICAgICAgICAgICAgICAgIFtkYXRhLnRyYWNrcyA/ICdwbGF5bGlzdCcgOiAndHJhY2snXTogZGF0YVxuICAgICAgICAgICAgfSk7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIGZ1bmN0aW9uIG9uQXVkaW9TdGFydGVkICgpIHtcbiAgICAgICAgICAgIHNldFN0YXRlKHtwbGF5aW5nOiB0cnVlfSk7XG5cbiAgICAgICAgICAgIHN0b3BBbGxPdGhlcihzb3VuZENsb3VkQXVkaW8ucGxheWluZyk7XG4gICAgICAgICAgICBhZGRUb1N0b3JlKHNvdW5kQ2xvdWRBdWRpbyk7XG4gICAgICAgIH1cblxuICAgICAgICBmdW5jdGlvbiBnZXRDdXJyZW50VGltZSAoKSB7XG4gICAgICAgICAgICBzZXRTdGF0ZSh7Y3VycmVudFRpbWU6IHNvdW5kQ2xvdWRBdWRpby5hdWRpby5jdXJyZW50VGltZX0pO1xuICAgICAgICB9XG5cbiAgICAgICAgZnVuY3Rpb24gZ2V0RHVyYXRpb24gKCkge1xuICAgICAgICAgICAgc2V0U3RhdGUoe2R1cmF0aW9uOiBzb3VuZENsb3VkQXVkaW8uYXVkaW8uZHVyYXRpb259KTtcbiAgICAgICAgfVxuXG4gICAgICAgIGZ1bmN0aW9uIG9uU2Vla2luZ1RyYWNrICgpIHtcbiAgICAgICAgICAgIHNldFN0YXRlKHtzZWVraW5nOiB0cnVlfSk7XG4gICAgICAgIH1cblxuICAgICAgICBmdW5jdGlvbiBvblNlZWtlZFRyYWNrICgpIHtcbiAgICAgICAgICAgIHNldFN0YXRlKHtzZWVraW5nOiBmYWxzZX0pO1xuICAgICAgICB9XG5cbiAgICAgICAgZnVuY3Rpb24gb25BdWRpb0VuZGVkICgpIHtcbiAgICAgICAgICAgIHNldFN0YXRlKHtwbGF5aW5nOiBmYWxzZX0pO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gaHR0cHM6Ly9kZXZlbG9wZXIubW96aWxsYS5vcmcvZW4tVVMvZG9jcy9XZWIvR3VpZGUvRXZlbnRzL01lZGlhX2V2ZW50c1xuICAgICAgICBzb3VuZENsb3VkQXVkaW8ub24oJ3BsYXlpbmcnLCBvbkF1ZGlvU3RhcnRlZCk7XG4gICAgICAgIHNvdW5kQ2xvdWRBdWRpby5vbigndGltZXVwZGF0ZScsIGdldEN1cnJlbnRUaW1lKTtcbiAgICAgICAgc291bmRDbG91ZEF1ZGlvLm9uKCdsb2FkZWRtZXRhZGF0YScsIGdldER1cmF0aW9uKTtcbiAgICAgICAgc291bmRDbG91ZEF1ZGlvLm9uKCdzZWVraW5nJywgb25TZWVraW5nVHJhY2spO1xuICAgICAgICBzb3VuZENsb3VkQXVkaW8ub24oJ3NlZWtlZCcsIG9uU2Vla2VkVHJhY2spO1xuICAgICAgICBzb3VuZENsb3VkQXVkaW8ub24oJ3BhdXNlJywgb25BdWRpb0VuZGVkKTtcbiAgICAgICAgc291bmRDbG91ZEF1ZGlvLm9uKCdlbmRlZCcsIG9uQXVkaW9FbmRlZCk7XG4gICAgfSxcblxuXG4gICAgYmVmb3JlTW91bnQoY29tcG9uZW50KSB7XG4gICAgICAgIGNvbnN0IHsgcHJvcHMgfSA9IGNvbXBvbmVudDtcbiAgICAgICAgcHJvcHMuc291bmRDbG91ZEF1ZGlvLnVuYmluZEFsbCgpO1xuICAgIH0sXG5cbiAgICByZW5kZXIoY29tcG9uZW50KSB7XG4gICAgICAgIGxldCB7IHN0YXRlLCBwcm9wcyB9ID0gY29tcG9uZW50O1xuXG4gICAgICAgIHJldHVybiAoXG4gICAgICAgICAgICA8ZGl2IGNsYXNzPVwic2Itc291bmRwbGF5ZXItd2lkZ2V0LWNvdmVyXCIgc3R5bGU9e3N0YXRlLnRyYWNrID8ge1xuICAgICAgICAgICAgICAgICdiYWNrZ3JvdW5kLWltYWdlJzogYHVybCgke3N0YXRlLnRyYWNrLmFydHdvcmtfdXJsLnJlcGxhY2UoJ2xhcmdlJywgJ3Q1MDB4NTAwJyl9KWBcbiAgICAgICAgICAgIH0gOiB7XG4gICAgICAgICAgICAgICAgJ2JhY2tncm91bmQtY29sb3InOiAnI2YyZjJmMidcbiAgICAgICAgICAgIH19PlxuICAgICAgICAgICAgICAgIHtzdGF0ZS50cmFjayA/IChcbiAgICAgICAgICAgICAgICAgICAgPGRpdj5cbiAgICAgICAgICAgICAgICAgICAgICAgIDxkaXYgY2xhc3M9XCJzYi1zb3VuZHBsYXllci13aWRnZXQtb3ZlcmxheVwiIC8+XG4gICAgICAgICAgICAgICAgICAgICAgICA8aDIgY2xhc3M9XCJzYi1zb3VuZHBsYXllci13aWRnZXQtdGl0bGVcIj57c3RhdGUudHJhY2sudGl0bGV9PC9oMj5cbiAgICAgICAgICAgICAgICAgICAgICAgIDxkaXYgY2xhc3M9XCJzYi1zb3VuZHBsYXllci13aWRnZXQtY29udHJvbHNcIj5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICA8UGxheUJ1dHRvblxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBwbGF5aW5nPXtzdGF0ZS5wbGF5aW5nfVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBzb3VuZENsb3VkQXVkaW89e3Byb3BzLnNvdW5kQ2xvdWRBdWRpb31cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAvPlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIDxQcm9ncmVzc1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB2YWx1ZT17c3RhdGUuY3VycmVudFRpbWUgLyBzdGF0ZS5kdXJhdGlvbiAqIDEwMCB8fCAwfVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBzb3VuZENsb3VkQXVkaW89e3Byb3BzLnNvdW5kQ2xvdWRBdWRpb31cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAvPlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIDxUaW1lclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBkdXJhdGlvbj17c3RhdGUuZHVyYXRpb259XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGN1cnJlbnRUaW1lPXtzdGF0ZS5jdXJyZW50VGltZX1cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAvPlxuICAgICAgICAgICAgICAgICAgICAgICAgPC9kaXY+XG4gICAgICAgICAgICAgICAgICAgIDwvZGl2PlxuICAgICAgICAgICAgICAgICkgOiAoXG4gICAgICAgICAgICAgICAgICAgIDxkaXY+TG9hZGluZy4uPC9kaXY+XG4gICAgICAgICAgICAgICAgKX1cbiAgICAgICAgICAgIDwvZGl2PlxuICAgICAgICApO1xuICAgIH1cbn07XG5cbmV4cG9ydCBmdW5jdGlvbiBjcmVhdGUgKGVsLCBvcHRzKSB7XG4gICAgY29uc3QgY2xpZW50SWQgPSBvcHRzLmNsaWVudElkIHx8IHdpbmRvdy5zYl9zb3VuZHBsYXllcl9jbGllbnRfaWQ7XG4gICAgaWYgKCFjbGllbnRJZCkge1xuICAgICAgICBjb25zb2xlLmxvZygnUGxlYXNlIGdldCBTb3VuZENsb3VkIGNsaWVudElkIGZyb20gaHR0cHM6Ly9kZXZlbG9wZXJzLnNvdW5kY2xvdWQuY29tLycpO1xuICAgICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgbGV0IHNvdW5kQ2xvdWRBdWRpbyA9IG5ldyBTb3VuZENsb3VkQXVkaW8oY2xpZW50SWQpO1xuXG4gICAgbGV0IGFwcCA9IGRla3UudHJlZShcbiAgICAgICAgPFdpZGdldCB1cmw9e29wdHMudXJsfSBzb3VuZENsb3VkQXVkaW89e3NvdW5kQ2xvdWRBdWRpb30gLz5cbiAgICApO1xuXG4gICAgZGVrdS5yZW5kZXIoYXBwLCBlbCk7XG59XG4iXX0=
