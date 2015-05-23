/** @jsx deku.dom */

import deku from 'deku';

const Progress = {
    defaultProps: {
        value: 0
    },

    propTypes: {
        value: {
            type: 'number'
        },
        soundCloudAudio: {
            type: 'object'
        }
    },

    render(component) {
        let { props } = component;
        let { value, soundCloudAudio } = props;

        if (value < 0) {
            value = 0;
        }

        if (value > 100) {
            value = 100;
        }

        let style = {width: `${value}%`};

        function handleSeekTrack (e) {
            const xPos = (e.pageX - e.delegateTarget.getBoundingClientRect().left) / e.delegateTarget.offsetWidth;

            if (soundCloudAudio && !isNaN(soundCloudAudio.audio.duration)) {
                soundCloudAudio.audio.currentTime = (xPos * soundCloudAudio.audio.duration);
            }
        }

        return (
            <div class="sb-soundplayer-widget-progress-container" onClick={handleSeekTrack}>
                <div class="sb-soundplayer-widget-progress-inner" style={style} />
            </div>
        );
    }
};

export default Progress;
