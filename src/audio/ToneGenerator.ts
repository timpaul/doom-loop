export type ToneType = 'Low note' | 'Mid note' | 'High note' | 'Low chord' | 'Mid chord' | 'High chord';

export class ToneGenerator {
    private context: AudioContext;
    private gainNode: GainNode;
    private oscillators: OscillatorNode[] = [];

    // Frequencies
    // C2 = 65.41Hz, C3 = 130.81Hz, C4 = 261.63Hz
    private readonly ROOT_FREQ = {
        'Low': 65.41,
        'Mid': 130.81,
        'High': 261.63
    };

    // Minor 7th chord intervals (Root, Minor 3rd, Perfect 5th, Minor 7th)
    // Ratios based on 12-TET
    private readonly CHORD_RATIOS = [
        1,                     // Root
        Math.pow(2, 3 / 12),     // Minor 3rd (+3 semitones)
        Math.pow(2, 7 / 12),     // Perfect 5th (+7 semitones)
        Math.pow(2, 10 / 12)     // Minor 7th (+10 semitones)
    ];

    constructor(context: AudioContext) {
        this.context = context;
        this.gainNode = this.context.createGain();
    }

    public getOutputNode(): GainNode {
        return this.gainNode;
    }

    public setVolume(volume: number) {
        this.gainNode.gain.setValueAtTime(volume, this.context.currentTime);
    }

    public play(tone: ToneType = 'Mid note') {
        this.stop();

        let baseFreq = this.ROOT_FREQ['Mid'];
        let isChord = tone.includes('chord');

        if (tone.includes('Low')) baseFreq = this.ROOT_FREQ['Low'];
        if (tone.includes('High')) baseFreq = this.ROOT_FREQ['High'];

        const frequencies = isChord
            ? this.CHORD_RATIOS.map(ratio => baseFreq * ratio)
            : [baseFreq];

        // Lower individual oscillator gain if multiple are playing (chords)
        const oscGain = 1.0 / frequencies.length;

        frequencies.forEach(freq => {
            const osc = this.context.createOscillator();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(freq, this.context.currentTime);

            const oscGainNode = this.context.createGain();
            // apply a very slight envelope to avoid clicks
            oscGainNode.gain.setValueAtTime(0, this.context.currentTime);
            oscGainNode.gain.linearRampToValueAtTime(oscGain, this.context.currentTime + 0.05);

            osc.connect(oscGainNode);
            oscGainNode.connect(this.gainNode);

            osc.start(0);
            this.oscillators.push(osc);
        });
    }

    public stop() {
        this.oscillators.forEach(osc => {
            try {
                // gentle fade out to avoid pop
                osc.stop(this.context.currentTime + 0.05);
            } catch (e) {
                // Already stopped
            }
            // Disconnect happens automatically after stop, but we just clear the array
        });
        this.oscillators = [];
    }
}
