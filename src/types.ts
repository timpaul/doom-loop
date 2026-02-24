import type { SoundType, NoiseColor } from './audio/AudioEngine';

export type LFOScale = 'second' | 'minute' | 'hour';

export interface SoundState {
    id: string;
    name: string;
    sourceType: SoundType;
    noiseColor: NoiseColor;
    activeNotes: string[];
    octave: number;
    volume: number;
    pan: number;
    filterFreq: number;
    filterQ: number;
    volLfoScale: LFOScale;
    volLfoRate: number; // rate is duration in UI confusingly
    volLfoDepth: number;
    panLfoScale: LFOScale;
    panLfoRate: number;
    panLfoDepth: number;
    autoFilterRate: number;
    autoFilterScale: LFOScale;
    autoFilterBaseFreq: number;
    autoFilterOctaves: number;
    reverbAmount: number;
    delayAmount: number;
    chorusAmount: number;
    distortionAmount: number;
    detune: number;
}

export interface SceneState {
    id: string;
    name: string;
    sounds: SoundState[];
}

export const DEFAULT_SOUND: Omit<SoundState, 'id' | 'name'> = {
    sourceType: 'noise',
    noiseColor: 'brown',
    activeNotes: ['C', 'Eb', 'G', 'Bb'],
    octave: 3,
    volume: 0.5,
    pan: 0,
    filterFreq: 1000,
    filterQ: 1,
    volLfoScale: 'minute',
    volLfoRate: 30,
    volLfoDepth: 0,
    panLfoScale: 'minute',
    panLfoRate: 30,
    panLfoDepth: 0,
    autoFilterRate: 45,
    autoFilterScale: 'minute',
    autoFilterBaseFreq: 8000,
    autoFilterOctaves: 1,
    reverbAmount: 0,
    delayAmount: 0,
    chorusAmount: 0,
    distortionAmount: 0,
    detune: 0
};
