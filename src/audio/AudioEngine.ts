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
    private autoFilter: Tone.AutoFilter;
    private volLfoGain: Tone.Gain;
    private volLfo: Tone.LFO;
    private panner: Tone.Panner;
    private panLfo: Tone.LFO;

    private reverb: Tone.Reverb;
    private delay: Tone.FeedbackDelay;
    private chorus: Tone.Chorus;
    private distortion: Tone.Distortion;

    private currentSource: SoundType | null = null;
    private sequencePart: Tone.Part | null = null;
    private isInitialized = false;

    constructor(outputDestination: Tone.ToneAudioNode = Tone.getDestination()) {
        // Create effects
        this.filter = new Tone.Filter({ type: 'lowpass', frequency: 20000 }); // open by default so AutoFilter works
        this.autoFilter = new Tone.AutoFilter({ frequency: 1, depth: 1, baseFrequency: 100, octaves: 4, type: 'sine' }).start();

        this.volLfoGain = new Tone.Gain(0); // Intrinsic gain 0, fully driven by LFO
        this.volLfo = new Tone.LFO({ frequency: 1, min: 1, max: 1 }).start();
        this.volLfo.connect(this.volLfoGain.gain);

        this.panLfo = new Tone.LFO({ frequency: 1, min: 0, max: 0 }).start();

        this.reverb = new Tone.Reverb({ decay: 4, wet: 0 });
        this.delay = new Tone.FeedbackDelay({ delayTime: "8n", feedback: 0.5, wet: 0 });
        this.chorus = new Tone.Chorus({ frequency: 1.5, delayTime: 3.5, depth: 0.7, wet: 0 });
        this.distortion = new Tone.Distortion(0);

        // Channel alternatives for Volume and Pan
        this.channel = new Tone.Channel({ volume: 0, pan: 0 }); // Keeping just for routing volume currently, could be simplified to Gain

        // Dedicated Panner at the end of the chain
        this.panner = new Tone.Panner(0);
        this.panLfo.connect(this.panner.pan);

        // Chain effects - note the panner is LAST before output
        this.channel.chain(this.filter, this.autoFilter, this.volLfoGain, this.chorus, this.distortion, this.delay, this.reverb, this.panner, outputDestination);

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

    private initPromise: Promise<void> | null = null;

    public async initialize() {
        if (this.isInitialized) return;
        if (!this.initPromise) {
            this.initPromise = (async () => {
                await this.reverb.generate();
                this.isInitialized = true;
            })();
        }
        await this.initPromise;
    }

    public dispose() {
        this.stop();
        this.noise.dispose();
        this.noiseFilter.dispose();
        this.polySynth.dispose();
        this.filter.dispose();
        this.autoFilter.dispose();
        this.volLfoGain.dispose();
        this.volLfo.dispose();
        this.panLfo.dispose();

        if (this.sequencePart) {
            this.sequencePart.dispose();
            this.sequencePart = null;
        }

        this.reverb.dispose();
        this.delay.dispose();
        this.chorus.dispose();
        this.distortion.dispose();
        this.panner.dispose();
        this.channel.dispose();
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    public async play(sourceType: SoundType, value: any) {
        if (!this.isInitialized) {
            await this.initialize();
        }

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
            // Expecting value to be: { events: Array<{ time: number, notes: string[], duration: number, detune: number }>, loopLength: number }
            const { events, loopLength } = value as { events: Array<{ time: number, notes: string[], duration: number, detune: number }>, loopLength: number };

            if (events.length > 0) {
                this.sequencePart = new Tone.Part((time, event) => {
                    // Set specific detune for this step
                    this.polySynth.set({ detune: event.detune });

                    if (event.notes.length > 0) {
                        this.polySynth.triggerAttackRelease(event.notes, event.duration, time);
                    }
                }, events).start(0);

                this.sequencePart.loop = true;
                this.sequencePart.loopEnd = loopLength;

                // Ensure transport is running for parts to play
                if (Tone.Transport.state !== 'started') {
                    Tone.Transport.start();
                }
            }
        }
    }

    public stop() {
        if (this.currentSource === 'noise') {
            this.noise.stop();
        } else if (this.currentSource === 'tone') {
            if (this.sequencePart) {
                this.sequencePart.stop();
                this.sequencePart.dispose();
                this.sequencePart = null;
            }
            this.polySynth.releaseAll();
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
        // Only apply if user changes it to something audible, else let it pass
        if (frequency < 19000) {
            this.filter.set({ frequency, Q: q, type: 'bandpass' });
        } else {
            this.filter.set({ frequency: 20000, type: 'lowpass' });
        }
    }

    public setAutoFilter(rate: number, baseFrequency: number, octaves: number) {
        const freq = rate > 0 ? 1 / rate : 0.1;
        this.autoFilter.set({ frequency: freq, baseFrequency: baseFrequency, octaves: octaves, depth: 1 });
    }

    public setVolLFO(rate: number, depth: number) {
        const freq = rate > 0 ? 1 / rate : 0.1;
        this.volLfo.frequency.rampTo(freq, 0.1);
        this.volLfo.min = 1 - depth;
        this.volLfo.max = 1;
    }

    public setPanLFO(rate: number, depth: number) {
        const freq = rate > 0 ? 1 / rate : 0.1;
        this.panLfo.frequency.rampTo(freq, 0.1);
        this.panLfo.min = -depth;
        this.panLfo.max = depth;
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

    public setDistortion(amount: number) {
        this.distortion.distortion = amount;
    }

    public setPan(pan: number) {
        // Disconnect from channel pan and route to explicit panner
        this.panner.pan.rampTo(pan, 0.1);
    }

    public setDetune(cents: number) {
        this.polySynth.set({ detune: cents });
    }
}
