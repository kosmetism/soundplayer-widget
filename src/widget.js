/** @jsx deku.dom */

import deku from 'deku';

export function create (el, opts) {
    let app = deku.scene();

    app.mount(
        <div>
            Widget Content!
        </div>
    );

    deku.render(app, el);
}
