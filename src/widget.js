/** @jsx dom */

const env = process.env.NODE_ENV || 'development';

import dom from 'magic-virtual-element'; // eslint-disable-line no-unused-vars
import deku from 'deku';
import Player from './Player';

export function create (el, opts) {
    const clientId = opts.clientId || window.sb_soundplayer_client_id;
    if (!clientId) {
        console.error([
            'You must provide SoundCloud clientId for SoundPlayer widget',
            '',
            'Example:',
            '<script>',
            'var sb_soundplayer_client_id = "YOUR_CLIENT_ID";',
            '</script>',
            '',
            'Register for an app and get clientId at https://developers.soundcloud.com/'
        ].join('\n'));
        return;
    }

    const app = deku.tree(
        <Player resolveUrl={opts.url} clientId={clientId} />
    );

    if (env === 'development') {
        app.option('validateProps', true);
    }

    deku.render(app, el);
}
