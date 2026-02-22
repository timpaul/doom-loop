import * as Tone from 'tone';

export type NoiseColor = 'white' | 'pink' | 'brown' | 'blue' | 'purple' | 'green';
export type ToneType = 'Low note' | 'Mid note' | 'High note' | 'Low chord' | 'Mid chord' | 'High chord';
export type SoundType = 'noise' | 'tone';


export class AudioEngine {
    public channel: Tone.Channel;

    // Generators
    private noise: Tone.Noise;
    private noiseFilter: Tone.Filter; // For custom noise colors
    private polySynth: Tone.PolySynth;

    // Effects
    private filter: Tone.Filter;
    private autoFilter: Tone.AutoFilter; // LFO
    private reverb: Tone.Reverb;
    private delay: Tone.FeedbackDelay;
    private chorus: Tone.Chorus;

    private currentSource: SoundType | null = null;
    private currentToneValues: string[] = [];
    private isInitialized = false;

    constructor(outputDestination: Tone.ToneAudioNode = Tone.getDestination()) {
        // Create effects
        this.filter = new Tone.Filter({ type: 'bandpass', Q: 1, frequency: 1000 });
        this.autoFilter = new Tone.AutoFilter({ frequency: 1, depth: 0, baseFrequency: 1000, octaves: 4, type: 'sine' }).start();
        this.reverb = new Tone.Reverb({ decay: 4, wet: 0 });
        this.delay = new Tone.FeedbackDelay({ delayTime: "8n", feedback: 0.5, wet: 0 });
        this.chorus = new Tone.Chorus({ frequency: 1.5, delayTime: 3.5, depth: 0.7, wet: 0 });

        // Channel for Volume and Pan
        this.channel = new Tone.Channel({ volume: 0, pan: 0 });

        // Chain effects
        this.channel.chain(this.filter, this.autoFilter, this.chorus, this.delay, this.reverb, outputDestination);

        // Setup Noise
        this.noiseFilter = new Tone.Filter({ type: 'allpass' });
        this.noise = new Tone.Noise("brown");
        this.noise.chain(this.noiseFilter, this.channel);

        // Setup Synth
        this.polySynth = new Tone.PolySynth(Tone.Synth, {
            oscillator: { type: 'sine' },
            envelope: { attack: 0.5, decay: 0.1, sustain: 1, release: 2 }
        });
        this.polySynth.connect(this.channel);
    }

    public async initialize() {
        if (this.isInitialized) return;
        // Initialization of Tone context is now handled centrally by AudioManager
        await this.reverb.generate();
        this.isInitialized = true;
    }

    public dispose() {
        this.stop();
        this.noise.dispose();
        this.noiseFilter.dispose();
        this.polySynth.dispose();
        this.filter.dispose();
        this.autoFilter.dispose();
        this.reverb.dispose();
        this.delay.dispose();
        this.chorus.dispose();
        this.channel.dispose();
    }

    public play(sourceType: SoundType, value: string) {
        if (!this.isInitialized) return;

        this.stop(); // Stop current playing

        this.currentSource = sourceType;

        if (sourceType === 'noise') {
            const color = value as NoiseColor;
            // Native Tone.js noise types
            if (color === 'white' || color === 'pink' || color === 'brown') {
                this.noise.type = color;
                this.noiseFilter.type = 'allpass'; // No filtering needed
            } else {
                // Approximate custom colors
                this.noise.type = 'white';
                if (color === 'blue') {
                    this.noiseFilter.set({ type: 'highpass', frequency: 1000, rolloff: -12 });
                } else if (color === 'purple') {
                    this.noiseFilter.set({ type: 'highpass', frequency: 2000, rolloff: -24 });
                } else if (color === 'green') {
                    this.noiseFilter.set({ type: 'bandpass', frequency: 500, Q: 2 });
                }
            }
            this.noise.start();
        } else if (sourceType === 'tone') {
            const toneType = value as ToneType;
            let notes: string[] = [];

            // Map tone string to musical notes
            const octave = toneType.includes('Low') ? 2 : toneType.includes('High') ? 4 : 3;

            if (toneType.includes('chord')) {
                // Minor 7th chord: C, Eb, G, Bb
                notes = [`C${octave}`, `Eb${octave}`, `G${octave}`, `Bb${octave}`];
            } else {
                notes = [`C${octave}`];
            }

            this.currentToneValues = notes;
            // Trigger notes with a gentle attack
            this.polySynth.triggerAttack(notes);
        }
    }

    public stop() {
        if (this.currentSource === 'noise') {
            this.noise.stop();
        } else if (this.currentSource === 'tone' && this.currentToneValues.length > 0) {
            this.polySynth.triggerRelease(this.currentToneValues);
            this.currentToneValues = [];
        }
        this.currentSource = null;
    }

    public setVolume(volume: number) {
        // Map 0-1 linear volume to decibels for Tone.js
        // If volume is 0, practically mute it
        if (volume <= 0.01) {
            this.channel.volume.rampTo(-Infinity, 0.1);
        } else {
            // log scale for human hearing
            const db = Tone.gainToDb(volume);
            this.channel.volume.rampTo(db, 0.1);
        }
    }

    public setFilter(frequency: number, q: number = 1) {
        this.filter.set({ frequency, Q: q });
        // Update AutoFilter base frequency to match
        this.autoFilter.baseFrequency = frequency;
    }

    public setLFO(rate: number, depth: number) {
        // Rate from UI is duration (0.01 to 10 seconds), UI label says "Duration" so lower freq = longer duration
        // We'll calculate frequency as 1 / duration
        const freq = rate > 0 ? 1 / rate : 0.1;
        this.autoFilter.set({ frequency: freq, depth: depth });
    }

    public setReverb(amount: number) {
        this.reverb.wet.rampTo(amount, 0.1);
    }

    public setDelay(amount: number) {
        this.delay.wet.rampTo(amount, 0.1);
    }

    public setChorus(amount: number) {
        this.chorus.wet.rampTo(amount, 0.1);
    }

    public setPan(pan: number) {
        this.channel.pan.rampTo(pan, 0.1);
    }

    public setDetune(cents: number) {
        this.polySynth.set({ detune: cents });
    }
}
