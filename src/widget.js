/** @jsx deku.dom */

const env = process.env.NODE_ENV || 'development';

import deku from 'deku';
import SoundCloudAudio from 'soundcloud-audio';

import PlayButton from './components/PlayButton';
import Progress from './components/Progress';
import Timer from './components/Timer';
import { SoundCloudLogoSVG } from './components/Icons';

import { stopAllOther, addToStore } from './utils/audioStore';

const Widget = {
    propTypes: {
        url: {
            type: 'string'
        },
        soundCloudAudio: {
            type: 'object'
        }
    },

    initialState() {
        return {
            duration: 0,
            currentTime: 0,
            seeking: false,
            playing: false
        };
    },

    afterMount(component, el, setState) {
        const { props } = component;
        const { soundCloudAudio } = props;

        soundCloudAudio.resolve(props.url, (data) => {
            setState({
                [data.tracks ? 'playlist' : 'track']: data
            });
        });

        function onAudioStarted () {
            setState({playing: true});

            stopAllOther(soundCloudAudio.playing);
            addToStore(soundCloudAudio);
        }

        function getCurrentTime () {
            setState({currentTime: soundCloudAudio.audio.currentTime});
        }

        function getDuration () {
            setState({duration: soundCloudAudio.audio.duration});
        }

        function onSeekingTrack () {
            setState({seeking: true});
        }

        function onSeekedTrack () {
            setState({seeking: false});
        }

        function onAudioEnded () {
            setState({playing: false});
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


    beforeMount(component) {
        const { props } = component;
        props.soundCloudAudio.unbindAll();
    },

    render(component) {
        const { state, props } = component;

        if (!state.track) {
            return <span />;
        }

        console.log(state.track);

        return (
            <div class="sb-soundplayer-widget-cover" style={{
                'background-image': `url(${state.track.artwork_url.replace('large', 't500x500')})`
            }}>
                <div class="sb-soundplayer-widget-overlay" />
                <h2 class="sb-soundplayer-widget-title">{state.track.title}</h2>
                <a href={state.track.permalink_url} target="_blank">
                    <SoundCloudLogoSVG />
                </a>
                <div class="sb-soundplayer-widget-controls">
                    <PlayButton
                        playing={state.playing}
                        soundCloudAudio={props.soundCloudAudio}
                    />
                    <Progress
                        value={state.currentTime / state.duration * 100 || 0}
                        soundCloudAudio={props.soundCloudAudio}
                    />
                    <Timer
                        duration={state.track.duration / 1000}
                        currentTime={state.currentTime}
                    />
                </div>
            </div>
        );
    }
};

export function create (el, opts) {
    const clientId = opts.clientId || window.sb_soundplayer_client_id;
    if (!clientId) {
        console.log('Please get SoundCloud clientId from https://developers.soundcloud.com/');
        return;
    }

    let soundCloudAudio = new SoundCloudAudio(clientId);

    let app = deku.tree(
        <Widget url={opts.url} soundCloudAudio={soundCloudAudio} />
    );

    if (env === 'development') {
        app.option('validateProps', true);
    }

    deku.render(app, el);
}
