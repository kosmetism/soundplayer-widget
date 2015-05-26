/** @jsx deku.dom */

import deku from 'deku';
import SoundCloudAudio from 'soundcloud-audio';

import { PlayIconSVG, PauseIconSVG } from './Icons';

export default {
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
        soundCloudAudio: function (prop) {
            return (prop instanceof SoundCloudAudio);
        }
    },

    render(component) {
        const { props } = component;

        function handleClick (e) {
            e.preventDefault();

            const { playing, soundCloudAudio } = props;

            if (!playing) {
                soundCloudAudio && soundCloudAudio.play();
            } else {
                soundCloudAudio && soundCloudAudio.pause();
            }
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
