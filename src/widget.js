/** @jsx deku.dom */

import deku from 'deku';
import SoundCloudAudio from 'soundcloud-audio';

import PlayButton from './components/PlayButton';
import Timer from './components/Timer';

import { stopAllOther, addToStore } from './utils/audioStore';

const Widget = {
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
        let { state, props } = component;

        return (
            <div>
                {state.track ? (
                    <div>
                        <img src={state.track.artwork_url.replace('large', 't500x500')} />
                        <h2>{state.track ? state.track.title : 'Loading..'}</h2>
                    </div>
                ) : (
                    <div>Loading..</div>
                )}
                <PlayButton
                    playing={state.playing}
                    soundCloudAudio={props.soundCloudAudio}
                />
                <Timer
                    duration={state.duration}
                    currentTime={state.currentTime}
                />
            </div>
        );
    }
};

export function create (el, opts) {
    let soundCloudAudio = new SoundCloudAudio(opts.clientId);

    let app = deku.scene(
        <Widget url={opts.url} soundCloudAudio={soundCloudAudio} />
    );

    deku.render(app, el);
}
