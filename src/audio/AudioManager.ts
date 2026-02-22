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
        this.masterChannel.toDestination();
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
        engine.setLFO(sound.duration, sound.intensity);
        engine.setTremolo(sound.tremoloRate, sound.tremoloDepth);
        engine.setReverb(sound.reverbAmount);
        engine.setDelay(sound.delayAmount);
        engine.setChorus(sound.chorusAmount);
        engine.setDetune(sound.detune ?? 0);

        if (!isPlaying) {
            engine.stop();
            this.previousSources.delete(sound.id);
            return;
        }

        const sourceConfigStr = `${sound.sourceType}-${sound.sourceType === 'noise' ? sound.noiseColor : [...sound.activeNotes].sort().join('') + sound.octave}`;

        if (this.previousSources.get(sound.id) !== sourceConfigStr) {
            engine.play(sound.sourceType, sound.sourceType === 'noise' ? sound.noiseColor : { activeNotes: sound.activeNotes, octave: sound.octave });
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
