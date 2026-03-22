import * as Tone from 'tone';
import { AudioEngine } from './AudioEngine';
import type { SoundState } from '../types';

class AudioManager {
    private static instance: AudioManager;

    public masterChannel: Tone.Volume;
    private masterLimiter: Tone.Limiter;
    private engines: Map<string, AudioEngine> = new Map();
    private previousSources: Map<string, string> = new Map();
    private trackGains: Map<string, Tone.Gain> = new Map();

    private isInitialized = false;

    private constructor() {
        this.masterChannel = new Tone.Volume(0);
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
    }

    public async resumeContext() {
        if (Tone.context.state !== 'running') {
            await Tone.start();
        }
    }

    public getSharedStream(): MediaStream | null {
        return null;
    }

    public getTrackChannel(mixItemId: string): Tone.Gain {
        if (!this.trackGains.has(mixItemId)) {
            const gainNode = new Tone.Gain(0).connect(this.masterChannel);
            this.trackGains.set(mixItemId, gainNode);
        }
        return this.trackGains.get(mixItemId)!;
    }

    public getEngine(id: string, mixItemId?: string): AudioEngine {
        const engineId = mixItemId ? `${mixItemId}-${id}` : id;
        let engine = this.engines.get(engineId);
        if (!engine) {
            const dest = mixItemId ? this.getTrackChannel(mixItemId) : this.masterChannel;
            engine = new AudioEngine(dest);
            this.engines.set(engineId, engine);
            if (this.isInitialized) {
                engine.initialize();
            }
        }
        return engine;
    }

    public syncSoundState(sound: SoundState, isPlaying: boolean, mixItemId?: string) {
        const engineId = mixItemId ? `${mixItemId}-${sound.id}` : sound.id;
        const engine = this.getEngine(sound.id, mixItemId);

        engine.setVolume(sound.isMuted ? 0 : sound.volume);
        engine.setPan(sound.pan);
        engine.setFilter(sound.filterFreq, sound.filterQ);
        // Updated calls to use new LFO properties
        engine.setVolLFO(sound.volLfoRate, sound.volLfoDepth, sound.volLfoType || 'sine');
        engine.setPanLFO(sound.panLfoRate, sound.panLfoDepth, sound.panLfoType || 'sine');
        engine.setAutoFilter(sound.autoFilterRate, sound.autoFilterBaseFreq, sound.autoFilterOctaves, sound.autoFilterType || 'sine');
        engine.setDetuneLFO(sound.detuneLfoRate ?? 30, sound.detuneLfoDepth ?? 0, sound.detuneLfoType || 'sine');

        engine.setReverb(sound.reverbAmount);
        engine.setDelay(sound.delayAmount);
        engine.setChorus(sound.chorusAmount);
        engine.setDistortion(sound.distortionAmount ?? 0);
        engine.setChebyshev(sound.chebyshevAmount ?? 0);
        engine.setDetune(sound.detune ?? 0);
        engine.setEnvelope({
            attack: sound.envAttack,
            decay: sound.envDecay,
            sustain: sound.envSustain,
            release: sound.envRelease
        });

        if (!isPlaying) {
            engine.stop();
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

        if (this.previousSources.get(engineId) !== sourceConfigStr) {
            engine.play(sound.sourceType, playArgs);
            this.previousSources.set(engineId, sourceConfigStr);
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
        this.previousSources.clear();
        this.trackGains.forEach(gainNode => gainNode.dispose());
        this.trackGains.clear();
    }

    public setTrackVolume(mixItemId: string, volume: number) {
        const gainNode = this.getTrackChannel(mixItemId);
        gainNode.gain.cancelScheduledValues(Tone.now());
        gainNode.gain.value = volume;
        gainNode.gain.setValueAtTime(volume, Tone.now());
    }

    public fadeTrack(mixItemId: string, targetVolume: number, transitionTime: number) {
        const gainNode = this.getTrackChannel(mixItemId);
        const now = Tone.now();
        const currentVol = gainNode.gain.value;

        gainNode.gain.cancelScheduledValues(now);
        gainNode.gain.setValueAtTime(currentVol, now);
        gainNode.gain.linearRampToValueAtTime(targetVolume, now + Math.max(0.01, transitionTime));
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
