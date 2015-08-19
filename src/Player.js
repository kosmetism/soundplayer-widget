/** @jsx dom */
import dom from 'magic-virtual-element'; // eslint-disable-line no-unused-vars
import SoundCloudAudio from 'soundcloud-audio';
import {
    Cover,
    Timer,
    Progress,
    PlayButton,
    Icons
} from 'deku-soundplayer/components';
import { SoundPlayerContainer } from 'deku-soundplayer/addons';

const { SoundCloudLogoSVG } = Icons;

const Player = {
    propTypes: {
        duration: {
            type: 'number',
            optional: true
        },

        currentTime: {
            type: 'number',
            optional: true
        },

        playing: {
            type: 'boolean',
            optional: true
        },

        seeking: {
            type: 'boolean',
            optional: true
        },

        track: {
            type: 'object',
            optional: true
        },

        soundCloudAudio: function (prop) {
            return (prop instanceof SoundCloudAudio);
        }
    },

    defaultProps: {
        duration: 0,
        currentTime: 0,
        seeking: false,
        playing: false
    },

    render(component) {
        const { props } = component;

        if (!props.track) {
            return <span />;
        }

        if (props.track && !props.track.streamable) {
            return (
                <div class="sb-soundplayer-widget-message">
                    <a href={props.track.permalink_url} target="_blank">{props.track.title}</a> is not streamable!
                </div>
            );
        }

        const { artwork_url } = props.track;

        return (
            <Cover artworkUrl={artwork_url && artwork_url.replace('large', 't500x500')}>
                <div class="sb-soundplayer-widget-overlay" />
                <div class="sb-soundplayer-widget-track-info">
                    <h3 class="sb-soundplayer-widget-user">{props.track.user.username}</h3>
                    <h2 class="sb-soundplayer-widget-title">{props.track.title}</h2>
                </div>
                <a href={props.track.permalink_url} target="_blank">
                    <SoundCloudLogoSVG />
                </a>
                <div class="sb-soundplayer-widget-controls">
                    <PlayButton
                        playing={props.playing}
                        soundCloudAudio={props.soundCloudAudio}
                    />
                    <Progress
                        value={props.currentTime / props.duration * 100 || 0}
                        soundCloudAudio={props.soundCloudAudio}
                    />
                    <Timer
                        duration={props.track.duration / 1000}
                        currentTime={props.currentTime}
                    />
                </div>
            </Cover>
        );
    }
};

export default {
    propTypes: {
        resolveUrl: {
            type: 'string'
        },

        clientId: {
            type: 'string'
        }
    },

    render(component) {
        const { props } = component;

        return (
            <SoundPlayerContainer {...props}>
                <Player />
            </SoundPlayerContainer>
        );
    }
};
