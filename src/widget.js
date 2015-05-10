/** @jsx deku.dom */

import deku from 'deku';

import PlayButton from './components/PlayButton';
import Timer from './components/Timer';

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
                Widget Content!
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
    let app = deku.scene(
        <Widget url={opts.url} soundCloudAudio={opts.soundCloudAudio} />
    );

    deku.render(app, el);
}
