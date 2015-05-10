/** @jsx deku.dom */

import deku from 'deku';

function prettyTime (time) {
    let hours = Math.floor(time / 3600);
    let mins = '0' + Math.floor((time % 3600) / 60);
    let secs = '0' + Math.floor((time % 60));

    mins = mins.substr(mins.length - 2);
    secs = secs.substr(secs.length - 2);

    if (!isNaN(secs)) {
        if (hours) {
            return `${hours}:${mins}:${secs}`;
        } else {
            return `${mins}:${secs}`;
        }
    } else {
        return '00:00';
    }
}

const Timer = {
    defaultProps: {
        duration: 0,
        currentTime: 0
    },

    propTypes: {
        duration: {
            type: 'number'
        },
        currentTime: {
            type: 'number'
        }
    },

    render(component) {
        const { props } = component;

        return (
            <div class="sb-soundplayer-widget-timer">
                {prettyTime(props.currentTime)} / {prettyTime(props.duration)}
            </div>
        );
    }
};

export default Timer;
