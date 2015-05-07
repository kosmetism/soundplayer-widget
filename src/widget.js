/** @jsx deku.dom */

import deku from 'deku';

import PlayButton from './components/PlayButton';

const Widget = {
    initialState() {
        return {
            playing: false
        };
    },

    render(component, setState) {
        let { props, state } = component;

        console.log(props);

        function handleClick () {
            setState({playing: !!!state.playing});
        }

        return (
            <div>
                Widget Content!
                <PlayButton playing={state.playing} onTogglePlay={handleClick} />
            </div>
        );
    }
};

export function create (el, opts) {
    let app = deku.scene(
        <Widget url={opts.url} />
    );

    deku.render(app, el);
}
