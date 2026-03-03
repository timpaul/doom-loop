import * as Tone from 'tone';
import { AudioEngine } from './AudioEngine';
import type { SoundState } from '../types';

class AudioManager {
    private static instance: AudioManager;

    public masterChannel: Tone.Channel;
    private engines: Map<string, AudioEngine> = new Map();
    private previousSources: Map<string, string> = new Map();

    private sharedDestination: MediaStreamAudioDestinationNode | null = null;
    private destinationConnected = false;
    private isInitialized = false;

    private constructor() {
        this.masterChannel = new Tone.Channel({ volume: 0, pan: 0 });
        // Removed toDestination() to prevent the native WebAudio output from duplicating 
        // the MediaStream output routed to the visible HTML <audio> element for iOS background play.
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

        if (!this.sharedDestination) {
            this.sharedDestination = Tone.getContext().createMediaStreamDestination();
        }

        if (!this.destinationConnected) {
            this.masterChannel.connect(this.sharedDestination);
            this.destinationConnected = true;
        }
        this.isInitialized = true;
    }

    public async resumeContext() {
        if (Tone.context.state !== 'running') {
            await Tone.start();
        }
    }

    public getSharedStream(): MediaStream | null {
        return this.sharedDestination ? this.sharedDestination.stream : null;
    }

    public getEngine(id: string): AudioEngine {
        let engine = this.engines.get(id);
        if (!engine) {
            engine = new AudioEngine(this.masterChannel);
            this.engines.set(id, engine);
            if (this.isInitialized) {
                engine.initialize();
            }
        }
        return engine;
    }

    public syncSoundState(sound: SoundState, isPlaying: boolean) {
        const engine = this.getEngine(sound.id);

        engine.setVolume(sound.volume);
        engine.setPan(sound.pan);
        engine.setFilter(sound.filterFreq, sound.filterQ);
        // Updated calls to use new LFO properties
        engine.setVolLFO(sound.volLfoRate, sound.volLfoDepth);
        engine.setPanLFO(sound.panLfoRate, sound.panLfoDepth);
        engine.setAutoFilter(sound.autoFilterRate, sound.autoFilterBaseFreq, sound.autoFilterOctaves);

        engine.setReverb(sound.reverbAmount);
        engine.setDelay(sound.delayAmount);
        engine.setChorus(sound.chorusAmount);
        engine.setDistortion(sound.distortionAmount ?? 0);
        engine.setDetune(sound.detune ?? 0);
        engine.setEnvelope({
            attack: sound.envAttack,
            decay: sound.envDecay,
            sustain: sound.envSustain,
            release: sound.envRelease
        });

        if (!isPlaying) {
            engine.stop();
            this.previousSources.delete(sound.id);
            return;
        }

        let sourceConfigStr = '';
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let playArgs: any = null;

        if (sound.sourceType === 'noise') {
            sourceConfigStr = `noise-${sound.noiseColor}`;
            playArgs = {
                color: sound.noiseColor,
                envelope: {
                    attack: sound.envAttack,
                    decay: sound.envDecay,
                    sustain: sound.envSustain,
                    release: sound.envRelease
                }
            };
        } else {
            // Compute sequence events
            // Rate is in seconds directly if scale is second, otherwise it's handled as such
            const totalDuration = sound.seqLengthRate;

            // Collect valid steps and their cumulative ratio
            const validSteps = sound.stepConfigs.map((config, index) => ({ config, ratio: sound.stepRatios[index] })).filter(item => typeof item.ratio === 'number' && item.ratio > 0);

            const totalRatio = validSteps.reduce((sum, item) => sum + (item.ratio as number), 0);

            const events: Array<{ time: number, notes: string[], duration: number }> = [];
            let currentTime = 0;

            if (totalRatio > 0 && validSteps.length > 0) {
                for (const step of validSteps) {
                    const stepDuration = (step.ratio as number) / totalRatio * totalDuration;
                    const notes = step.config.activeNotes.map(n => `${n}${step.config.octave}`);
                    events.push({
                        time: currentTime,
                        notes,
                        duration: stepDuration
                    });
                    currentTime += stepDuration;
                }
            }

            // Build cache key based on EVERYTHING that changes the sequence structurally
            sourceConfigStr = `tone-${totalDuration}-${JSON.stringify(sound.stepRatios)}-${JSON.stringify(sound.stepConfigs)}-${sound.playMode}`;
            playArgs = {
                events,
                loopLength: totalDuration || 1,
                playMode: sound.playMode,
                envelope: {
                    attack: sound.envAttack,
                    decay: sound.envDecay,
                    sustain: sound.envSustain,
                    release: sound.envRelease
                }
            };
        }

        if (this.previousSources.get(sound.id) !== sourceConfigStr) {
            engine.play(sound.sourceType, playArgs);
            this.previousSources.set(sound.id, sourceConfigStr);
        }
    }

    public cleanupEngines(activeIds: string[]) {
        const activeSet = new Set(activeIds);
        for (const [id, engine] of this.engines.entries()) {
            if (!activeSet.has(id)) {
                engine.dispose();
                this.engines.delete(id);
                this.previousSources.delete(id);
            }
        }
    }

    public removeEngine(id: string) {
        const engine = this.engines.get(id);
        if (engine) {
            engine.dispose();
            this.engines.delete(id);
            this.previousSources.delete(id);
        }
    }

    public stopAll() {
        this.engines.forEach(engine => engine.stop());
        this.previousSources.clear();
    }

    public clearAll() {
        this.engines.forEach(engine => engine.dispose());
        this.engines.clear();
    }

    public setMasterVolume(volume: number) {
        if (volume <= 0.01) {
            this.masterChannel.volume.rampTo(-Infinity, 0.1);
        } else {
            const db = Tone.gainToDb(volume);
            this.masterChannel.volume.rampTo(db, 0.1);
        }
    }
}

export const audioManager = AudioManager.getInstance();
