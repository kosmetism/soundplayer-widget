/** @jsx deku.dom */

import deku from 'deku';

import { PlayIconSVG, PauseIconSVG } from './Icons';

const PlayButton = {
    defaultProps: {
        playing: false,
        seeking: false
    },

    propTypes: {
        playing: {
            type: 'boolean',
            optional: true
        },
        seeking: {
            type: 'boolean',
            optional: true
        },
        soundCloudAudio: {
            type: 'object'
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
                {!props.playing ? (
                    <PlayIconSVG onClick={handleClick} />
                ) : (
                    <PauseIconSVG onClick={handleClick} />
                )}
            </button>
        );
    }
};

export default PlayButton;
