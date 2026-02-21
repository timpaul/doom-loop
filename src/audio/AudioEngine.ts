import { NoiseGenerator } from './NoiseGenerator';
import type { NoiseColor } from './NoiseGenerator';
import { ToneGenerator } from './ToneGenerator';
import type { ToneType } from './ToneGenerator';
import { Effects } from './Effects';

export type SoundType = 'noise' | 'tone';

let sharedContext: AudioContext | null = null;
let sharedDestination: MediaStreamAudioDestinationNode | null = null;

export async function initializeSharedAudio() {
    if (!sharedContext) {
        sharedContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    if (sharedContext.state === 'suspended') {
        await sharedContext.resume();
    }
    if (!sharedDestination) {
        sharedDestination = sharedContext.createMediaStreamDestination();
    }
}

export class AudioEngine {
    private context: AudioContext | null = null;
    public noiseGenerator: NoiseGenerator | null = null;
    public toneGenerator: ToneGenerator | null = null;
    public effects: Effects | null = null;
    private isInitialized = false;
    public streamDestination: MediaStreamAudioDestinationNode | null = null;

    public async initialize() {
        if (this.isInitialized) return;

        // Must be called from a user interaction
        if (!sharedContext) {
            sharedContext = new (window.AudioContext || (window as any).webkitAudioContext)();
        }
        this.context = sharedContext;

        if (this.context.state === 'suspended') {
            await this.context.resume();
        }

        this.noiseGenerator = new NoiseGenerator(this.context);
        this.toneGenerator = new ToneGenerator(this.context);
        this.effects = new Effects(this.context);

        if (!sharedDestination) {
            sharedDestination = this.context.createMediaStreamDestination();
        }
        this.streamDestination = sharedDestination;

        // Route: Noise Generator & Tone Generator -> Effects -> MediaStreamDestination
        const noiseOutput = this.noiseGenerator.getOutputNode();
        const toneOutput = this.toneGenerator.getOutputNode();

        // Create a summing node before effects
        const sumNode = this.context.createGain();
        noiseOutput.connect(sumNode);
        toneOutput.connect(sumNode);

        this.effects.connectPath(sumNode, this.streamDestination);

        this.isInitialized = true;
    }

    public play(sourceType: SoundType, value: string) {
        if (!this.isInitialized || !this.context) return;
        if (this.context.state === 'suspended') {
            this.context.resume();
        }

        this.stop(); // stop whichever is playing

        if (sourceType === 'noise' && this.noiseGenerator) {
            this.noiseGenerator.play(value as NoiseColor);
        } else if (sourceType === 'tone' && this.toneGenerator) {
            this.toneGenerator.play(value as ToneType);
        }
    }

    public stop() {
        if (this.noiseGenerator) this.noiseGenerator.stop();
        if (this.toneGenerator) this.toneGenerator.stop();
    }

    public setVolume(volume: number) {
        // Both generators can share the volume setting so they crossfade/switch gracefully
        if (this.noiseGenerator) this.noiseGenerator.setVolume(volume);
        if (this.toneGenerator) this.toneGenerator.setVolume(volume);
    }

    public setFilter(frequency: number, q: number = 1) {
        if (!this.effects) return;
        this.effects.setBandpass(frequency, q);
    }

    public setLFO(rate: number, depth: number) {
        if (!this.effects) return;
        this.effects.setLFO(rate, depth);
    }

    public setReverb(amount: number) {
        if (!this.effects) return;
        this.effects.setReverb(amount);
    }

    public setDelay(amount: number) {
        if (!this.effects) return;
        this.effects.setDelay(amount);
    }

    public setChorus(amount: number) {
        if (!this.effects) return;
        this.effects.setChorus(amount);
    }

    public setPan(pan: number) {
        if (!this.effects) return;
        this.effects.setPan(pan);
    }

    public suspend() {
        if (this.context && this.context.state === 'running') {
            this.context.suspend();
        }
    }

    public resume() {
        if (this.context && this.context.state === 'suspended') {
            this.context.resume();
        }
    }

    public getStream(): MediaStream | null {
        return this.streamDestination ? this.streamDestination.stream : null;
    }
}

// Helper to get the shared stream globally without creating an engine if not needed
export function getSharedStream(): MediaStream | null {
    return sharedDestination ? sharedDestination.stream : null;
}

