/** @jsx deku.dom */

import deku from 'deku';

const PlayButton = {
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

    render(component) {
        const { props } = component;

        function handleClick (e) {
            e.preventDefault();

            const { playing, soundCloudAudio, onTogglePlay } = props;

            if (!playing) {
                soundCloudAudio && soundCloudAudio.play();
            } else {
                soundCloudAudio && soundCloudAudio.pause();
            }

            onTogglePlay && onTogglePlay(e);
        }

        return (
            <button class="sb-soundplayer-widget-play" onClick={handleClick}>
                {props.playing ? 'Pause' : 'Play'}
            </button>
        );
    }
};

export default PlayButton;
