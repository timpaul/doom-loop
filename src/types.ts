import type { SoundType, NoiseColor } from './audio/AudioEngine';

export type LFOScale = 'second' | 'minute' | 'hour';

export interface StepConfig {
    activeNotes: string[];
    octave: number;
}

export type PlayMode = 'chord' | 'random';

export interface SoundState {
    id: string;
    name: string;
    sourceType: SoundType;
    noiseColor: NoiseColor;
    stepConfigs: StepConfig[];
    stepRatios: (number | null)[];
    seqLengthScale: LFOScale;
    seqLengthRate: number;
    playMode: PlayMode;
    isMuted?: boolean;
    // Legacy properties maintained for backwards compatibility loading
    activeNotes?: string[];
    octave?: number;
    detune?: number;
    envAttack: number;
    envDecay: number;
    envSustain: number;
    envRelease: number;
    noteLengthRatio?: number;
    volume: number;
    pan: number;
    filterMinFreq: number;
    filterMaxFreq: number;
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
}

export interface TrackState {
    id: string;
    name: string;
    sounds: SoundState[];
}

export const DEFAULT_SOUND: Omit<SoundState, 'id' | 'name'> = {
    sourceType: 'noise',
    noiseColor: 'brown',
    playMode: 'chord',
    isMuted: false,
    stepConfigs: [
        { activeNotes: ['C', 'Eb', 'G', 'Bb'], octave: 3 },
        { activeNotes: ['C', 'Eb', 'G', 'Bb'], octave: 3 },
        { activeNotes: ['C', 'Eb', 'G', 'Bb'], octave: 3 },
        { activeNotes: ['C', 'Eb', 'G', 'Bb'], octave: 3 },
        { activeNotes: ['C', 'Eb', 'G', 'Bb'], octave: 3 },
        { activeNotes: ['C', 'Eb', 'G', 'Bb'], octave: 3 },
        { activeNotes: ['C', 'Eb', 'G', 'Bb'], octave: 3 },
        { activeNotes: ['C', 'Eb', 'G', 'Bb'], octave: 3 },
    ],
    stepRatios: [1, null, null, null, null, null, null, null],
    seqLengthScale: 'minute',
    seqLengthRate: 30, // 30 seconds default
    envAttack: 0.5,
    envDecay: 0.1,
    envSustain: 1.0,
    envRelease: 2.0,
    noteLengthRatio: 1.0,
    volume: 0.5,
    pan: 0,
    filterMinFreq: 200,
    filterMaxFreq: 20000,
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
    distortionAmount: 0
};
