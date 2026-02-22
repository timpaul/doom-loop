import type { SoundType, NoiseColor } from './audio/AudioEngine';

export interface SoundState {
    id: string;
    name: string;
    sourceType: SoundType;
    noiseColor: NoiseColor;
    toneMode: 'note' | 'chord';
    tonePitch: 'Low' | 'Mid' | 'High';
    volume: number;
    pan: number;
    filterFreq: number;
    filterQ: number;
    intensity: number;
    duration: number;
    reverbAmount: number;
    delayAmount: number;
    chorusAmount: number;
}

export interface SceneState {
    id: string;
    name: string;
    sounds: SoundState[];
}

export const DEFAULT_SOUND: Omit<SoundState, 'id' | 'name'> = {
    sourceType: 'noise',
    noiseColor: 'brown',
    toneMode: 'note',
    tonePitch: 'Low',
    volume: 0.5,
    pan: 0,
    filterFreq: 1000,
    filterQ: 1,
    intensity: 0,
    duration: 0.2,
    reverbAmount: 0,
    delayAmount: 0,
    chorusAmount: 0
};
