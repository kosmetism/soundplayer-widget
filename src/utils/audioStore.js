// handling multiple audio on the page helpers
let _audios = [];

export function stopAllOther (playing) {
    _audios.forEach((soundCloudAudio) => {
        if (soundCloudAudio.playing && soundCloudAudio.playing !== playing) {
            soundCloudAudio.stop();
        }
    });
}

export function addToStore (soundCloudAudio) {
    let isPresent = false;

    for (let i = 0, len = _audios.length; i < len; i++) {
        let _soundCloudAudio = _audios[i];
        if (_soundCloudAudio.playing === soundCloudAudio.playing) {
            isPresent = true;
            break;
        }
    }

    if (!isPresent) {
        _audios.push(soundCloudAudio);
    }
}
