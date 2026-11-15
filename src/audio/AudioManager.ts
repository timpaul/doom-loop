import * as Tone from 'tone';
import { AudioEngine } from './AudioEngine';
import type { SoundState } from '../types';

export class TrackBus {
    public dryGain: Tone.Gain;
    public reverb: Tone.Reverb;
    public lowCutFilter: Tone.Filter;
    public highCutFilter: Tone.Filter;
    public summingGain: Tone.Gain;
    public midSideSplit: Tone.MidSideSplit;
    public midSideMerge: Tone.MidSideMerge;
    public midGain: Tone.Gain;
    public sideGain: Tone.Gain;
    public glueBypassGain: Tone.Gain;
    public glueWetGain: Tone.Gain;
    public compressor: Tone.Compressor;
    public makeupGain: Tone.Gain;
    public vibrato: Tone.Vibrato;
    public fogFilter: Tone.Filter;
    public outputGain: Tone.Gain;

    public frippSendGain: Tone.Gain;
    public frippReturnGain: Tone.Gain;
    public frippDelayL: Tone.Delay;
    public frippDelayR: Tone.Delay;
    public frippFilterL: Tone.Filter;
    public frippFilterR: Tone.Filter;
    public frippFeedbackL: Tone.Gain;
    public frippFeedbackR: Tone.Gain;
    public frippCrossL: Tone.Gain;
    public frippCrossR: Tone.Gain;
    public frippSplit: Tone.Split;
    public frippMerge: Tone.Merge;

    public transpose: number = 0;
    public spatialize: number = 1.0;
    public glue: number = 0;
    public drift: number = 0;
    public fog: number = 0;
    public fripp: number = 0;

    private currentDecay: number;
    private currentPreDelay: number;
    private regenerateTimer: ReturnType<typeof setTimeout> | null = null;
    private frippResetTimer: ReturnType<typeof setTimeout> | null = null;
    private isDisposed = false;

    constructor(
        destination: Tone.ToneAudioNode,
        initialDecay = 4,
        initialPreDelay = 0.01,
        initialLowCut = 20,
        initialHighCut = 20000,
        initialSpatialize = 1.0,
        initialTranspose = 0,
        initialGlue = 0,
        initialDrift = 0,
        initialFog = 0,
        initialFripp = 0,
        initialVolume = 1
    ) {
        this.outputGain = new Tone.Gain(initialVolume);
        this.outputGain.connect(destination);

        this.transpose = initialTranspose;
        this.spatialize = initialSpatialize;
        this.glue = initialGlue;
        this.drift = initialDrift;
        this.fog = initialFog;
        this.fripp = initialFripp;

        this.midSideSplit = new Tone.MidSideSplit();
        this.midSideMerge = new Tone.MidSideMerge();
        this.midGain = new Tone.Gain(1.0);
        this.sideGain = new Tone.Gain(Math.max(0, initialSpatialize));

        this.midSideSplit.mid.connect(this.midGain);
        this.midSideSplit.side.connect(this.sideGain);
        this.midGain.connect(this.midSideMerge.mid);
        this.sideGain.connect(this.midSideMerge.side);

        this.compressor = new Tone.Compressor({
            threshold: -24,
            ratio: 2,
            attack: 0.03,
            release: 0.35,
            knee: 30
        });
        this.makeupGain = new Tone.Gain(1.0);
        this.glueBypassGain = new Tone.Gain(initialGlue === 0 ? 1 : Math.cos(initialGlue * Math.PI / 2));
        this.glueWetGain = new Tone.Gain(initialGlue === 0 ? 0 : Math.sin(initialGlue * Math.PI / 2));

        this.vibrato = new Tone.Vibrato({
            frequency: 0.35,
            depth: 0,
            maxDelay: 0.008,
            type: 'sine'
        });
        this.vibrato.wet.value = initialDrift === 0 ? 0 : 1.0;

        this.fogFilter = new Tone.Filter({
            type: 'lowpass',
            frequency: 20000,
            rolloff: -12,
            Q: 0.5
        });
        this.vibrato.connect(this.fogFilter);
        this.fogFilter.connect(this.outputGain);

        // Dry bypass path -> Vibrato
        this.midSideMerge.connect(this.glueBypassGain);
        this.glueBypassGain.connect(this.vibrato);

        // Wet compressed path -> Vibrato
        this.midSideMerge.connect(this.compressor);
        this.compressor.connect(this.makeupGain);
        this.makeupGain.connect(this.glueWetGain);
        this.glueWetGain.connect(this.vibrato);

        if (initialGlue > 0) {
            this.applyGlue(initialGlue, 0);
        }
        if (initialDrift > 0) {
            this.applyDrift(initialDrift, 0);
        }
        if (initialFog > 0) {
            this.applyFog(initialFog, 0);
        }

        this.summingGain = new Tone.Gain(1);
        this.summingGain.connect(this.midSideSplit);

        // Frippertronics dual sound-on-sound tape loop
        this.frippSendGain = new Tone.Gain(0);
        this.frippReturnGain = new Tone.Gain(0);

        this.frippSplit = new Tone.Split();
        this.frippMerge = new Tone.Merge();

        // 3.2s on Left, 3.8s on Right for polymetric tape delay
        this.frippDelayL = new Tone.Delay({ delayTime: 3.2, maxDelay: 10 });
        this.frippDelayR = new Tone.Delay({ delayTime: 3.8, maxDelay: 10 });

        // Tape head lowpass filtering (4.5 kHz) so each repeat gently warms and softens
        this.frippFilterL = new Tone.Filter({ type: 'lowpass', frequency: 4500, rolloff: -12, Q: 0.5 });
        this.frippFilterR = new Tone.Filter({ type: 'lowpass', frequency: 4500, rolloff: -12, Q: 0.5 });

        // Direct feedback and cross-channel bleed
        this.frippFeedbackL = new Tone.Gain(0.72);
        this.frippFeedbackR = new Tone.Gain(0.72);
        this.frippCrossL = new Tone.Gain(0.08);
        this.frippCrossR = new Tone.Gain(0.08);

        // Send: summingGain -> frippSendGain -> frippSplit
        this.summingGain.connect(this.frippSendGain);
        this.frippSendGain.connect(this.frippSplit);

        // Left tape loop
        this.frippSplit.connect(this.frippDelayL, 0);
        this.frippDelayL.connect(this.frippFilterL);
        this.frippFilterL.connect(this.frippFeedbackL);
        this.frippFeedbackL.connect(this.frippDelayL);
        this.frippFilterL.connect(this.frippCrossL);
        this.frippCrossL.connect(this.frippDelayR);
        this.frippFilterL.connect(this.frippMerge, 0, 0);

        // Right tape loop
        this.frippSplit.connect(this.frippDelayR, 1);
        this.frippDelayR.connect(this.frippFilterR);
        this.frippFilterR.connect(this.frippFeedbackR);
        this.frippFeedbackR.connect(this.frippDelayR);
        this.frippFilterR.connect(this.frippCrossR);
        this.frippCrossR.connect(this.frippDelayL);
        this.frippFilterR.connect(this.frippMerge, 0, 1);

        // Return: frippMerge -> frippReturnGain -> midSideSplit
        this.frippMerge.connect(this.frippReturnGain);
        this.frippReturnGain.connect(this.midSideSplit);

        if (initialFripp > 0) {
            this.applyFripp(initialFripp, 0);
        }

        this.dryGain = new Tone.Gain(1);
        this.dryGain.connect(this.summingGain);

        this.currentDecay = initialDecay;
        this.currentPreDelay = initialPreDelay;
        this.reverb = new Tone.Reverb({ decay: initialDecay, preDelay: initialPreDelay, wet: 1.0 });

        if (AudioEngine.sharedReverbBuffer && Math.abs(initialDecay - 4) < 0.01 && Math.abs(initialPreDelay - 0.01) < 0.001) {
            try {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                (this.reverb as any)._convolver.buffer = AudioEngine.sharedReverbBuffer;
            } catch {
                // Ignore
            }
        } else if (!AudioEngine.sharedReverbBuffer && Math.abs(initialDecay - 4) < 0.01 && Math.abs(initialPreDelay - 0.01) < 0.001) {
            AudioEngine.warmSharedReverb().then(buf => {
                if (buf && !this.isDisposed && Math.abs(this.currentDecay - 4) < 0.01 && Math.abs(this.currentPreDelay - 0.01) < 0.001) {
                    try {
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        (this.reverb as any)._convolver.buffer = buf;
                    } catch {
                        // Ignore
                    }
                }
            });
        }

        this.lowCutFilter = new Tone.Filter({ type: 'highpass', frequency: initialLowCut });
        this.highCutFilter = new Tone.Filter({ type: 'lowpass', frequency: initialHighCut });

        this.reverb.chain(this.lowCutFilter, this.highCutFilter, this.summingGain);
    }

    public setSpatialize(factor: number) {
        this.spatialize = factor;
        this.sideGain.gain.rampTo(Math.max(0, factor), 0.05);
    }

    public setGlue(glue: number) {
        this.glue = Math.max(0, Math.min(1, glue));
        this.applyGlue(this.glue, 0.05);
    }

    private applyGlue(g: number, rampTime = 0.05) {
        const dry = Math.cos(g * Math.PI / 2);
        const wet = Math.sin(g * Math.PI / 2);

        const ratio = 1.5 + g * 2.5;
        const threshold = -12 - g * 24;
        const makeup = 1 + g * 0.7;

        this.compressor.threshold.value = threshold;
        this.compressor.ratio.value = ratio;

        if (rampTime > 0) {
            this.glueBypassGain.gain.rampTo(dry, rampTime);
            this.glueWetGain.gain.rampTo(wet, rampTime);
            this.makeupGain.gain.rampTo(makeup, rampTime);
        } else {
            this.glueBypassGain.gain.value = dry;
            this.glueWetGain.gain.value = wet;
            this.makeupGain.gain.value = makeup;
        }
    }

    public setDrift(drift: number) {
        this.drift = Math.max(0, Math.min(1, drift));
        this.applyDrift(this.drift, 0.05);
    }

    private applyDrift(d: number, rampTime = 0.05) {
        if (d === 0) {
            if (rampTime > 0) {
                this.vibrato.wet.rampTo(0, rampTime);
                this.vibrato.depth.rampTo(0, rampTime);
            } else {
                this.vibrato.wet.value = 0;
                this.vibrato.depth.value = 0;
            }
        } else {
            const targetDepth = d * 0.7;
            if (rampTime > 0) {
                this.vibrato.wet.rampTo(1.0, rampTime);
                this.vibrato.depth.rampTo(targetDepth, rampTime);
            } else {
                this.vibrato.wet.value = 1.0;
                this.vibrato.depth.value = targetDepth;
            }
        }
    }

    public setFog(fog: number) {
        this.fog = Math.max(0, Math.min(1, fog));
        this.applyFog(this.fog, 0.05);
    }

    private applyFog(f: number, rampTime = 0.05) {
        // At f = 0: 20000 Hz (fully open, clear daylight)
        // At f = 1: 300 Hz (deep submerged ambient fog)
        // Smooth exponential cutoff mapping
        const freq = Math.max(300, Math.min(20000, 20000 * Math.pow(300 / 20000, f)));
        if (rampTime > 0) {
            this.fogFilter.frequency.rampTo(freq, rampTime);
        } else {
            this.fogFilter.frequency.value = freq;
        }
    }

    public setFripp(fripp: number) {
        this.fripp = Math.max(0, Math.min(1, fripp));
        if (this.frippResetTimer) {
            clearTimeout(this.frippResetTimer);
            this.frippResetTimer = null;
            this.clearFripp();
        }
        this.applyFripp(this.fripp, 0.05);
    }

    private applyFripp(f: number, rampTime = 0.05) {
        const level = Math.sin(f * Math.PI / 2) * 0.85;
        const mainFeedback = 0.65 + f * 0.14;
        const crossFeedback = 0.05 + f * 0.04;

        if (rampTime > 0) {
            this.frippSendGain.gain.rampTo(level, rampTime);
            this.frippReturnGain.gain.rampTo(level, rampTime);
            this.frippFeedbackL.gain.rampTo(mainFeedback, rampTime);
            this.frippFeedbackR.gain.rampTo(mainFeedback, rampTime);
            this.frippCrossL.gain.rampTo(crossFeedback, rampTime);
            this.frippCrossR.gain.rampTo(crossFeedback, rampTime);
        } else {
            this.frippSendGain.gain.value = level;
            this.frippReturnGain.gain.value = level;
            this.frippFeedbackL.gain.value = mainFeedback;
            this.frippFeedbackR.gain.value = mainFeedback;
            this.frippCrossL.gain.value = crossFeedback;
            this.frippCrossR.gain.value = crossFeedback;
        }
    }

    public stop() {
        if (this.isDisposed) return;
        const now = Tone.now();
        this.frippReturnGain.gain.cancelScheduledValues(now);
        this.frippReturnGain.gain.rampTo(0, 0.05);
        this.frippSendGain.gain.cancelScheduledValues(now);
        this.frippSendGain.gain.rampTo(0, 0.05);
        this.frippFeedbackL.gain.cancelScheduledValues(now);
        this.frippFeedbackL.gain.rampTo(0, 0.05);
        this.frippFeedbackR.gain.cancelScheduledValues(now);
        this.frippFeedbackR.gain.rampTo(0, 0.05);
        this.frippCrossL.gain.cancelScheduledValues(now);
        this.frippCrossL.gain.rampTo(0, 0.05);
        this.frippCrossR.gain.cancelScheduledValues(now);
        this.frippCrossR.gain.rampTo(0, 0.05);

        if (this.frippResetTimer) {
            clearTimeout(this.frippResetTimer);
        }
        this.frippResetTimer = setTimeout(() => {
            this.frippResetTimer = null;
            if (!this.isDisposed) {
                this.clearFripp();
            }
        }, 60);
    }

    private clearFripp() {
        if (this.isDisposed) return;
        try {
            this.frippSplit.disconnect();
            this.frippFeedbackL.disconnect();
            this.frippCrossR.disconnect();
            this.frippFeedbackR.disconnect();
            this.frippCrossL.disconnect();

            this.frippDelayL.disconnect();
            this.frippDelayR.disconnect();
            this.frippDelayL.dispose();
            this.frippDelayR.dispose();
        } catch {
            // Ignore disconnection errors if nodes are already torn down
        }

        this.frippDelayL = new Tone.Delay({ delayTime: 3.2, maxDelay: 10 });
        this.frippDelayR = new Tone.Delay({ delayTime: 3.8, maxDelay: 10 });

        // Left tape loop
        this.frippSplit.connect(this.frippDelayL, 0);
        this.frippDelayL.connect(this.frippFilterL);
        this.frippFeedbackL.connect(this.frippDelayL);
        this.frippCrossR.connect(this.frippDelayL);

        // Right tape loop
        this.frippSplit.connect(this.frippDelayR, 1);
        this.frippDelayR.connect(this.frippFilterR);
        this.frippFeedbackR.connect(this.frippDelayR);
        this.frippCrossL.connect(this.frippDelayR);
    }

    public setReverbParams(decay: number, preDelay: number) {
        const decayChanged = Math.abs(this.currentDecay - decay) >= 0.01;
        const preDelayChanged = Math.abs(this.currentPreDelay - preDelay) >= 0.001;
        if (!decayChanged && !preDelayChanged) return;

        this.currentDecay = decay;
        this.currentPreDelay = preDelay;

        if (this.regenerateTimer) {
            clearTimeout(this.regenerateTimer);
        }
        this.regenerateTimer = setTimeout(() => {
            if (!this.isDisposed) {
                this.reverb.decay = decay;
                this.reverb.preDelay = preDelay;
            }
        }, 150);
    }

    public setDecay(decay: number) {
        this.setReverbParams(decay, this.currentPreDelay);
    }

    public setFilters(lowCut: number, highCut: number) {
        this.lowCutFilter.frequency.rampTo(Math.max(20, lowCut), 0.05);
        this.highCutFilter.frequency.rampTo(Math.min(20000, highCut), 0.05);
    }

    public setVolume(volume: number, rampTime = 0.02) {
        this.outputGain.gain.rampTo(volume, rampTime);
    }

    public dispose() {
        this.isDisposed = true;
        if (this.regenerateTimer) {
            clearTimeout(this.regenerateTimer);
            this.regenerateTimer = null;
        }
        if (this.frippResetTimer) {
            clearTimeout(this.frippResetTimer);
            this.frippResetTimer = null;
        }
        this.reverb.dispose();
        this.lowCutFilter.dispose();
        this.highCutFilter.dispose();
        this.summingGain.dispose();
        this.midSideSplit.dispose();
        this.midSideMerge.dispose();
        this.midGain.dispose();
        this.sideGain.dispose();
        this.glueBypassGain.dispose();
        this.glueWetGain.dispose();
        this.compressor.dispose();
        this.makeupGain.dispose();
        this.vibrato.dispose();
        this.fogFilter.dispose();
        this.frippSendGain.dispose();
        this.frippReturnGain.dispose();
        this.frippSplit.dispose();
        this.frippMerge.dispose();
        this.frippDelayL.dispose();
        this.frippDelayR.dispose();
        this.frippFilterL.dispose();
        this.frippFilterR.dispose();
        this.frippFeedbackL.dispose();
        this.frippFeedbackR.dispose();
        this.frippCrossL.dispose();
        this.frippCrossR.dispose();
        this.dryGain.dispose();
        this.outputGain.dispose();
    }
}

class AudioManager {
    private static instance: AudioManager;

    public masterChannel: Tone.Volume;
    private masterLimiter: Tone.Limiter;
    private engines: Map<string, AudioEngine> = new Map();
    private soundStates: Map<string, SoundState> = new Map();
    private previousSources: Map<string, string> = new Map();
    private trackBuses: Map<string, TrackBus> = new Map();
    private mainTrackBus: TrackBus | null = null;
    private pendingDisposalEngines: Map<string, { engine: AudioEngine; timer: ReturnType<typeof setTimeout> }> = new Map();

    private isInitialized = false;

    private constructor() {
        this.masterChannel = new Tone.Volume(-4);
        this.masterLimiter = new Tone.Limiter(-0.3);
    }

    public static getInstance(): AudioManager {
        if (!AudioManager.instance) {
            AudioManager.instance = new AudioManager();
        }
        return AudioManager.instance;
    }

    public async initialize() {
        if (this.isInitialized) return;
        await Tone.start();
        this.masterChannel.chain(this.masterLimiter, Tone.Destination);
        this.isInitialized = true;
        AudioEngine.warmSharedReverb();
    }

    public async resumeContext() {
        if (Tone.context.state !== 'running') {
            await Tone.start();
        }
    }

    public getSharedStream(): MediaStream | null {
        return null;
    }

    public getTrackBus(
        mixItemId?: string,
        decay = 4,
        preDelay = 0.01,
        lowCut = 20,
        highCut = 20000,
        spatialize = 1.0,
        transpose = 0,
        glue = 0,
        drift = 0,
        fog = 0,
        fripp = 0
    ): TrackBus {
        if (mixItemId) {
            let bus = this.trackBuses.get(mixItemId);
            if (!bus) {
                bus = new TrackBus(this.masterChannel, decay, preDelay, lowCut, highCut, spatialize, transpose, glue, drift, fog, fripp, 0);
                this.trackBuses.set(mixItemId, bus);
            }
            return bus;
        }
        if (!this.mainTrackBus) {
            this.mainTrackBus = new TrackBus(this.masterChannel, decay, preDelay, lowCut, highCut, spatialize, transpose, glue, drift, fog, fripp, 1);
        }
        return this.mainTrackBus;
    }

    public getTrackChannel(mixItemId: string): Tone.Gain {
        return this.getTrackBus(mixItemId).outputGain;
    }

    public setTrackReverb(
        config: { decay?: number; preDelay?: number; lowCut?: number; highCut?: number },
        mixItemId?: string
    ) {
        const decay = config.decay ?? 4;
        const preDelay = config.preDelay ?? 0.01;
        const lowCut = config.lowCut ?? 20;
        const highCut = config.highCut ?? 20000;

        const bus = mixItemId ? this.trackBuses.get(mixItemId) : this.mainTrackBus;
        if (bus) {
            bus.setReverbParams(decay, preDelay);
            bus.setFilters(lowCut, highCut);
        } else {
            this.getTrackBus(mixItemId, decay, preDelay, lowCut, highCut);
        }
    }

    public setTrackDecay(decay: number, mixItemId?: string) {
        this.setTrackReverb({ decay }, mixItemId);
    }

    public setTrackTranspose(transpose: number, mixItemId?: string) {
        const bus = mixItemId ? this.trackBuses.get(mixItemId) : this.mainTrackBus;
        if (bus) {
            bus.transpose = transpose;
        } else {
            this.getTrackBus(mixItemId).transpose = transpose;
        }

        const prefix = mixItemId ? `${mixItemId}-` : '';
        for (const [engineId, engine] of this.engines.entries()) {
            const matchesTrack = mixItemId ? engineId.startsWith(prefix) : !engineId.includes('-');
            if (matchesTrack) {
                const sound = this.soundStates.get(engineId);
                const soundDetune = sound?.detune ?? 0;
                engine.setDetune(soundDetune + transpose * 100);
            }
        }
    }

    public setTrackSpatialize(spatialize: number, mixItemId?: string) {
        const bus = mixItemId ? this.trackBuses.get(mixItemId) : this.mainTrackBus;
        if (bus) {
            bus.setSpatialize(spatialize);
        } else {
            this.getTrackBus(mixItemId).setSpatialize(spatialize);
        }
    }

    public setTrackGlue(glue: number, mixItemId?: string) {
        const bus = mixItemId ? this.trackBuses.get(mixItemId) : this.mainTrackBus;
        if (bus) {
            bus.setGlue(glue);
        } else {
            this.getTrackBus(mixItemId).setGlue(glue);
        }
    }

    public setTrackDrift(drift: number, mixItemId?: string) {
        const bus = mixItemId ? this.trackBuses.get(mixItemId) : this.mainTrackBus;
        if (bus) {
            bus.setDrift(drift);
        } else {
            this.getTrackBus(mixItemId).setDrift(drift);
        }
    }

    public setTrackFog(fog: number, mixItemId?: string) {
        const bus = mixItemId ? this.trackBuses.get(mixItemId) : this.mainTrackBus;
        if (bus) {
            bus.setFog(fog);
        } else {
            this.getTrackBus(mixItemId).setFog(fog);
        }
    }

    public setTrackFripp(fripp: number, mixItemId?: string) {
        const bus = mixItemId ? this.trackBuses.get(mixItemId) : this.mainTrackBus;
        if (bus) {
            bus.setFripp(fripp);
        } else {
            this.getTrackBus(mixItemId).setFripp(fripp);
        }
    }

    public getEngine(id: string, mixItemId?: string): AudioEngine {
        const engineId = mixItemId ? `${mixItemId}-${id}` : id;

        // If there is an engine pending deferred disposal with this ID, cancel disposal and reuse it
        const pending = this.pendingDisposalEngines.get(engineId);
        if (pending) {
            clearTimeout(pending.timer);
            this.pendingDisposalEngines.delete(engineId);
            this.engines.set(engineId, pending.engine);
            return pending.engine;
        }

        let engine = this.engines.get(engineId);
        if (!engine) {
            const bus = this.getTrackBus(mixItemId);
            engine = new AudioEngine(bus.dryGain, bus.reverb);
            this.engines.set(engineId, engine);
            if (this.isInitialized) {
                engine.initialize();
            }
        }
        return engine;
    }

    public syncSoundState(sound: SoundState, isPlaying: boolean, mixItemId?: string, isGroupStandby?: boolean) {
        const engineId = mixItemId ? `${mixItemId}-${sound.id}` : sound.id;
        const engine = this.getEngine(sound.id, mixItemId);
        this.soundStates.set(engineId, sound);
        const bus = this.getTrackBus(mixItemId);

        engine.setVolume(sound.isMuted ? 0 : sound.volume);
        engine.setPan(sound.pan);
        engine.setFilter(sound.filterFreq, sound.filterQ);
        // Updated calls to use new LFO properties
        engine.setVolLFO(sound.volLfoRate, sound.volLfoDepth, sound.volLfoType || 'sine', sound.volLfoPhaseOffset ?? 0);
        engine.setPanLFO(sound.panLfoRate, sound.panLfoDepth, sound.panLfoType || 'sine', sound.panLfoPhaseOffset ?? 0);
        engine.setAutoFilter(sound.autoFilterRate, sound.autoFilterBaseFreq, sound.autoFilterOctaves, sound.autoFilterType || 'sine', sound.autoFilterPhaseOffset ?? 0);
        engine.setDetuneLFO(sound.detuneLfoRate ?? 30, sound.detuneLfoDepth ?? 0, sound.detuneLfoType || 'sine', sound.detuneLfoPhaseOffset ?? 0);

        engine.setReverb(sound.reverbAmount);
        engine.setDelay(sound.delayAmount, sound.delayTime ?? 0.25, sound.delayFeedback ?? 0.5);
        engine.setChorus(sound.chorusAmount);
        engine.setDistortion(sound.distortionAmount ?? 0);
        engine.setChebyshev(sound.chebyshevAmount ?? 0);
        const synthRecreated = engine.setSynthConfig(sound);
        const totalDetune = (sound.detune ?? 0) + (bus.transpose * 100);
        engine.setDetune(totalDetune);
        engine.setEnvelope({
            attack: sound.envAttack,
            decay: sound.envDecay,
            sustain: sound.envSustain,
            release: sound.envRelease
        });

        if (!isPlaying || sound.isMuted) {
            engine.stop();
            this.previousSources.delete(engineId);
            return;
        }

        if (isGroupStandby) {
            engine.stopSequence();
            this.previousSources.delete(engineId);
            return;
        }

        let sourceConfigStr = '';
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let playArgs: any = null;

        // Compute sequence events for both tone and noise
        const totalDuration = sound.seqLengthRate;
        const validSteps = sound.stepConfigs.map((config, index) => ({ config, ratio: sound.stepRatios[index] }))
            .filter(item => (typeof item.ratio === 'number' && item.ratio > 0) || item.ratio === '-');
        const isContinuous = validSteps.length === 0;
        const totalRatio = validSteps.reduce((sum, item) => {
            const r = item.ratio === '-' ? 1 : (item.ratio as number);
            return sum + r;
        }, 0);

        const events: Array<{ time: number, notes: string[], duration: number }> = [];
        let currentTime = 0;

        if (isContinuous) {
            const notes = sound.stepConfigs[0].activeNotes.map(n => `${n}${sound.stepConfigs[0].octave}`);
            events.push({
                time: 0,
                notes,
                duration: totalDuration || 1
            });
        } else if (totalRatio > 0 && validSteps.length > 0) {
            for (const step of validSteps) {
                const stepRatio = step.ratio === '-' ? 1 : (step.ratio as number);
                const stepDuration = stepRatio / totalRatio * totalDuration;
                const notes = step.ratio === '-' ? [] : step.config.activeNotes.map(n => `${n}${step.config.octave}`);
                events.push({
                    time: currentTime,
                    notes,
                    duration: stepDuration
                });
                currentTime += stepDuration;
            }
        }

        const noteLengthRatio = sound.noteLengthRatio ?? 1.0;

        if (sound.sourceType === 'noise') {
            sourceConfigStr = `noise-${totalDuration}-${JSON.stringify(sound.stepRatios)}-${noteLengthRatio}-${isContinuous}-${sound.slack}`;
            playArgs = {
                color: sound.noiseColor,
                events,
                loopLength: totalDuration || 1,
                noteLengthRatio,
                isContinuous,
                slack: sound.slack || 0,
                envelope: {
                    attack: sound.envAttack,
                    decay: sound.envDecay,
                    sustain: sound.envSustain,
                    release: sound.envRelease
                }
            };
        } else {
            // Build cache key based on EVERYTHING that changes the sequence structurally
            sourceConfigStr = `tone-${totalDuration}-${JSON.stringify(sound.stepRatios)}-${JSON.stringify(sound.stepConfigs)}-${sound.playMode}-${noteLengthRatio}-${isContinuous}-${sound.slack}`;
            playArgs = {
                events,
                loopLength: totalDuration || 1,
                playMode: sound.playMode,
                noteLengthRatio,
                isContinuous,
                slack: sound.slack || 0,
                envelope: {
                    attack: sound.envAttack,
                    decay: sound.envDecay,
                    sustain: sound.envSustain,
                    release: sound.envRelease
                }
            };
        }

        if (synthRecreated || this.previousSources.get(engineId) !== sourceConfigStr) {
            engine.play(sound.sourceType, playArgs);
            this.previousSources.set(engineId, sourceConfigStr);
        }
    }

    public setOnSequenceEnd(soundId: string, callback: (() => void) | null, mixItemId?: string) {
        const engineId = mixItemId ? `${mixItemId}-${soundId}` : soundId;
        const engine = this.engines.get(engineId);
        if (engine) {
            engine.onSequenceEnd = callback;
        }
    }

    /** Stops a mix sound's engine if it exists, without creating (and initialising) one just to stop it. */
    public stopSound(soundId: string, mixItemId: string) {
        const engineId = `${mixItemId}-${soundId}`;
        const engine = this.engines.get(engineId);
        if (engine) engine.stop();
        this.previousSources.delete(engineId);
    }

    public cleanupEngines(activeIds: string[], delayMs = 1000) {
        const activeSet = new Set(activeIds);
        for (const [id] of this.soundStates.entries()) {
            if (!activeSet.has(id)) {
                this.soundStates.delete(id);
            }
        }
        for (const [id, engine] of this.engines.entries()) {
            if (!activeSet.has(id)) {
                this.engines.delete(id);
                this.previousSources.delete(id);
                engine.stop();

                const existing = this.pendingDisposalEngines.get(id);
                if (existing) {
                    clearTimeout(existing.timer);
                    existing.engine.dispose();
                }

                const timer = setTimeout(() => {
                    engine.dispose();
                    this.pendingDisposalEngines.delete(id);
                }, delayMs);

                this.pendingDisposalEngines.set(id, { engine, timer });
            }
        }
    }

    public removeEngine(id: string) {
        this.soundStates.delete(id);
        const pending = this.pendingDisposalEngines.get(id);
        if (pending) {
            clearTimeout(pending.timer);
            pending.engine.dispose();
            this.pendingDisposalEngines.delete(id);
        }
        const engine = this.engines.get(id);
        if (engine) {
            this.engines.delete(id);
            this.previousSources.delete(id);
            engine.stop();
            const timer = setTimeout(() => {
                engine.dispose();
                this.pendingDisposalEngines.delete(id);
            }, 500);
            this.pendingDisposalEngines.set(id, { engine, timer });
        }
    }

    public stopTrack(mixItemId?: string) {
        const bus = mixItemId ? this.trackBuses.get(mixItemId) : this.mainTrackBus;
        if (bus) {
            bus.stop();
        }
    }

    public stopAll() {
        for (const [, pending] of this.pendingDisposalEngines.entries()) {
            pending.engine.stop();
        }
        this.engines.forEach(engine => engine.stop());
        this.previousSources.clear();
        if (this.mainTrackBus) {
            this.mainTrackBus.stop();
        }
        this.trackBuses.forEach(bus => bus.stop());
        if (Tone.Transport.state === 'started') {
            Tone.Transport.stop();
            Tone.Transport.position = 0;
        }
    }

    public clearAll() {
        for (const [, pending] of this.pendingDisposalEngines.entries()) {
            clearTimeout(pending.timer);
            pending.engine.dispose();
        }
        this.pendingDisposalEngines.clear();
        this.engines.forEach(engine => engine.dispose());
        this.engines.clear();
        this.soundStates.clear();
        this.previousSources.clear();
        this.trackBuses.forEach(bus => bus.dispose());
        this.trackBuses.clear();
        if (this.mainTrackBus) {
            this.mainTrackBus.dispose();
            this.mainTrackBus = null;
        }
        if (Tone.Transport.state === 'started') {
            Tone.Transport.stop();
            Tone.Transport.position = 0;
        }
    }

    public cleanupTrackGains(activeMixItemIds: string[]) {
        const activeSet = new Set(activeMixItemIds);
        for (const [id, bus] of this.trackBuses.entries()) {
            if (!activeSet.has(id)) {
                for (const [engineId, pending] of this.pendingDisposalEngines.entries()) {
                    if (engineId.startsWith(`${id}-`)) {
                        clearTimeout(pending.timer);
                        pending.engine.dispose();
                        this.pendingDisposalEngines.delete(engineId);
                    }
                }
                bus.dispose();
                this.trackBuses.delete(id);
            }
        }
    }

    public setTrackVolume(mixItemId: string, volume: number) {
        this.getTrackBus(mixItemId).setVolume(volume);
    }

    public fadeTrack(mixItemId: string, targetVolume: number, transitionTime: number) {
        this.getTrackBus(mixItemId).setVolume(targetVolume, Math.max(0.02, transitionTime));
    }

    public setMasterVolume(volume: number) {
        if (volume <= 0.01) {
            this.masterChannel.volume.rampTo(-Infinity, 0.1);
        } else {
            const db = Tone.gainToDb(volume) - 4;
            this.masterChannel.volume.rampTo(db, 0.1);
        }
    }
}

export const audioManager = AudioManager.getInstance();
