/** @jsx deku.dom */

const env = process.env.NODE_ENV || 'development';

import deku from 'deku';
import SoundCloudAudio from 'soundcloud-audio';
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

    const soundCloudAudio = new SoundCloudAudio(clientId);

    const app = deku.tree(
        <Player url={opts.url} soundCloudAudio={soundCloudAudio} />
    );

    if (env === 'development') {
        app.option('validateProps', true);
    }

    deku.render(app, el);
}
