import type { SoundType, NoiseColor, OscillatorType } from './audio/AudioEngine';

export type LFOScale = 'second' | 'minute' | 'hour';
export type LFOType = 'sine' | 'random';

export interface StepConfig {
    activeNotes: string[];
    octave: number;
}

export type PlayMode = 'chord' | 'random';

export interface SoundState {
    id: string;
    name: string;
    sourceType: SoundType;
    oscillatorType?: OscillatorType;
    fmHarmonicity?: number;
    fmModulationIndex?: number;
    metalHarmonicity?: number;
    metalResonance?: number;
    pluckAttackNoise?: number;
    pluckResonance?: number;
    pluckDampening?: number;
    noiseColor: NoiseColor;
    stepConfigs: StepConfig[];
    stepRatios: (number | string | null)[];
    seqLengthScale: LFOScale;
    seqLengthRate: number;
    slack?: number;
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
    volLfoType?: LFOType;
    volLfoScale: LFOScale;
    volLfoRate: number; // rate is duration in UI confusingly
    volLfoDepth: number;
    panLfoType?: LFOType;
    panLfoScale: LFOScale;
    panLfoRate: number;
    panLfoDepth: number;
    autoFilterType?: LFOType;
    autoFilterRate: number;
    autoFilterScale: LFOScale;
    autoFilterBaseFreq: number;
    autoFilterOctaves: number;
    detuneLfoType?: LFOType;
    detuneLfoScale?: LFOScale;
    detuneLfoRate?: number;
    detuneLfoDepth?: number;
    reverbAmount: number;
    delayAmount: number;
    delayTime?: number;
    delayFeedback?: number;
    chorusAmount: number;
    distortionAmount: number;
    chebyshevAmount: number;
}

export interface TrackState {
    id: string;
    name: string;
    author?: string;
    notes?: string;
    sounds: SoundState[];
}

export interface MixItem {
    id: string; // unique ID for this instance in the mix
    trackId: string;
    weight?: number; // Spread ratio fraction
}

export interface MixState {
    id: string;
    name: string;
    items: MixItem[];
    lengthMinutes: number;
    shuffle: boolean;
    repeat: boolean;
    fadeInMinutes: number;
    fadeOutMinutes: number;
    crossFadeMinutes: number;
    spread?: number;
}

export const DEFAULT_MIX: Omit<MixState, 'id' | 'name' | 'items'> = {
    lengthMinutes: 5,
    shuffle: false,
    repeat: false,
    fadeInMinutes: 0,
    fadeOutMinutes: 0,
    crossFadeMinutes: 0,
    spread: 0
};


export const DEFAULT_SOUND: Omit<SoundState, 'id' | 'name'> = {
    sourceType: 'tone',
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
    stepRatios: [null, null, null, null, null, null, null, null],
    seqLengthScale: 'minute',
    seqLengthRate: 30,
    slack: 0,
    oscillatorType: 'sine',
    fmHarmonicity: 1,
    fmModulationIndex: 10,
    metalHarmonicity: 5.1,
    metalResonance: 4000,
    pluckAttackNoise: 0.1,
    pluckResonance: 0.9,
    pluckDampening: 4000,
    envAttack: 0.5,
    envDecay: 0.1,
    envSustain: 1.0,
    envRelease: 2.0,
    noteLengthRatio: 1.0,
    volume: 0.25,
    pan: 0,
    filterMinFreq: 20,
    filterMaxFreq: 20000,
    filterFreq: 20000,
    filterQ: 1,
    volLfoType: 'sine',
    volLfoScale: 'minute',
    volLfoRate: 30,
    volLfoDepth: 0,
    panLfoType: 'sine',
    panLfoScale: 'minute',
    panLfoRate: 30,
    panLfoDepth: 0,
    autoFilterType: 'sine',
    autoFilterRate: 0,
    autoFilterScale: 'minute',
    autoFilterBaseFreq: 20000,
    autoFilterOctaves: 0,
    detuneLfoType: 'sine',
    detuneLfoScale: 'minute',
    detuneLfoRate: 30,
    detuneLfoDepth: 0,
    reverbAmount: 0,
    delayAmount: 0,
    delayTime: 0.25,
    delayFeedback: 0.5,
    chorusAmount: 0,
    distortionAmount: 0,
    chebyshevAmount: 0
};

/**
 * Migrates legacy sound data to the current SoundState schema.
 * Handles three generations of legacy formats:
 * 1. Pre-sequencer: no stepConfigs at all
 * 2. Pre-envelope: no ADSR fields
 * 3. Pre-LFO types: missing LFO type/detune LFO fields
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function migrateSound(sound: any): SoundState {
    const base = { ...DEFAULT_SOUND };

    // If no stepConfigs, it's a very old format or a minimal AI generation
    if (!sound.stepConfigs) {
        const defaultNotes = sound.activeNotes || ['C', 'Eb', 'G', 'Bb'];
        const defaultOctave = sound.octave ?? 3;
        const defaultDetune = sound.detune ?? 0;

        return {
            ...base,
            ...sound,
            id: sound.id || `s-${Date.now()}-${Math.random().toString(36).substring(7)}`,
            name: sound.name || "Untitled Sound",
            stepConfigs: Array.from({ length: 8 }, () => ({
                activeNotes: defaultNotes,
                octave: defaultOctave,
                detune: defaultDetune
            })),
            stepRatios: [1, null, null, null, null, null, null, null]
        };
    }

    // Modern format migration
    return {
        ...base,
        ...sound
    };
}
