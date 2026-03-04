import React, { createContext, useContext, useReducer, useEffect } from 'react';
import type { ReactNode } from 'react';
import { DEFAULT_SOUND } from '../types';
import type { SoundState, TrackState } from '../types';
import { audioManager } from '../audio/AudioManager';

export interface AppState {
    isPlaying: boolean;
    currentScreen: 'main' | 'load';
    currentTrackId: string;
    currentTrackName: string;
    savedTracks: TrackState[];
    toastMessage: string | null;
    sounds: SoundState[];
    expandedId: string;
    nextId: number;
}

export type Action =
    | { type: 'TOGGLE_PLAY' }
    | { type: 'SET_SCREEN'; payload: 'main' | 'load' }
    | { type: 'ADD_SOUND' }
    | { type: 'UPDATE_SOUND'; payload: { id: string; updates: Partial<SoundState> } }
    | { type: 'DELETE_SOUND'; payload: string }
    | { type: 'TOGGLE_EXPAND'; payload: string }
    | { type: 'SET_TRACK_NAME'; payload: string }
    | { type: 'LOAD_TRACK'; payload: TrackState }
    | { type: 'CREATE_TRACK' }
    | { type: 'DELETE_TRACK'; payload: string }
    | { type: 'IMPORT_TRACK'; payload: any }
    | { type: 'SET_TOAST'; payload: string | null };

// eslint-disable-next-line react-refresh/only-export-components
const getInitialState = (): AppState => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const parseJSON = (key: string, backup: any) => {
        try {
            const val = localStorage.getItem(key);
            if (!val) return backup;
            const parsed = JSON.parse(val);

            // Migration logic for old sounds without sequencer config
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const migrateSound = (sound: any) => {
                if (!sound.stepConfigs) {
                    const defaultNotes = sound.activeNotes || ['C', 'Eb', 'G', 'Bb'];
                    const defaultOctave = sound.octave ?? 3;
                    const defaultDetune = sound.detune ?? 0;
                    return {
                        ...sound,
                        stepConfigs: [
                            { activeNotes: defaultNotes, octave: defaultOctave, detune: defaultDetune },
                            { activeNotes: defaultNotes, octave: defaultOctave, detune: defaultDetune },
                            { activeNotes: defaultNotes, octave: defaultOctave, detune: defaultDetune },
                            { activeNotes: defaultNotes, octave: defaultOctave, detune: defaultDetune },
                            { activeNotes: defaultNotes, octave: defaultOctave, detune: defaultDetune },
                            { activeNotes: defaultNotes, octave: defaultOctave, detune: defaultDetune },
                            { activeNotes: defaultNotes, octave: defaultOctave, detune: defaultDetune },
                            { activeNotes: defaultNotes, octave: defaultOctave, detune: defaultDetune },
                        ],
                        stepRatios: [1, null, null, null, null, null, null, null],
                        seqLengthScale: 'minute',
                        seqLengthRate: 30,
                        envAttack: 0.5,
                        envDecay: 0.1,
                        envSustain: 1.0,
                        envRelease: 2.0
                    };
                }
                // Migration for legacy sounds without ADRS config
                if (sound.envAttack === undefined) {
                    return {
                        ...sound,
                        envAttack: 0.5,
                        envDecay: 0.1,
                        envSustain: 1.0,
                        envRelease: 2.0
                    };
                }
                return sound;
            };

            if (key === 'noisemaker_sounds') {
                return Array.isArray(parsed) ? parsed.map(migrateSound) : backup;
            } else if (key === 'noisemaker_tracks' || key === 'noisemaker_scenes') {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                return Array.isArray(parsed) ? parsed.map((track: any) => ({
                    ...track,
                    sounds: Array.isArray(track.sounds) ? track.sounds.map(migrateSound) : []
                })) : backup;
            }
            return parsed;
        } catch { return backup; }
    };

    const savedTracks = parseJSON('noisemaker_tracks', parseJSON('noisemaker_scenes', [
        { id: 'track-1', name: 'Track 1', sounds: [{ id: '1', name: 'Sound 1', ...DEFAULT_SOUND }] }
    ]));

    return {
        isPlaying: false,
        currentScreen: 'load',
        currentTrackId: localStorage.getItem('noisemaker_currentTrackId') || localStorage.getItem('noisemaker_currentSceneId') || 'track-1',
        currentTrackName: localStorage.getItem('noisemaker_currentTrackName') || localStorage.getItem('noisemaker_currentSceneName') || 'Track 1',
        savedTracks,
        sounds: parseJSON('noisemaker_sounds', [{ id: '1', name: 'Sound 1', ...DEFAULT_SOUND }]),
        toastMessage: null,
        expandedId: localStorage.getItem('noisemaker_expandedId') || '1',
        nextId: parseJSON('noisemaker_nextId', 2)
    };
};

const appReducer = (state: AppState, action: Action): AppState => {
    const newState = { ...state };
    switch (action.type) {
        case 'TOGGLE_PLAY':
            newState.isPlaying = !state.isPlaying;
            break;
        case 'SET_SCREEN':
            newState.currentScreen = action.payload;
            break;
        case 'ADD_SOUND': {
            const newId = state.nextId.toString();
            newState.sounds = [...state.sounds, { id: newId, name: `Sound ${newId}`, ...DEFAULT_SOUND }];
            newState.expandedId = newId;
            newState.nextId = state.nextId + 1;
            break;
        }
        case 'UPDATE_SOUND':
            newState.sounds = state.sounds.map(s => s.id === action.payload.id ? { ...s, ...action.payload.updates } : s);
            break;
        case 'DELETE_SOUND':
            newState.sounds = state.sounds.filter(s => s.id !== action.payload);
            break;
        case 'TOGGLE_EXPAND':
            newState.expandedId = state.expandedId === action.payload ? '' : action.payload;
            break;
        case 'SET_TRACK_NAME':
            newState.currentTrackName = action.payload;
            break;
        case 'LOAD_TRACK':
            // Only stop playback if loading a fundamentally different track
            if (state.currentTrackId !== action.payload.id) {
                newState.isPlaying = false;
            }
            newState.currentTrackId = action.payload.id;
            newState.currentTrackName = action.payload.name;
            newState.sounds = action.payload.sounds;
            newState.currentScreen = 'main';
            newState.expandedId = action.payload.sounds.length > 0 ? action.payload.sounds[0].id : '';
            break;
        case 'CREATE_TRACK': {
            const newId = `track-${Date.now()}`;
            const newName = `Track ${state.savedTracks.length + 1}`;
            const initialSound = { id: '1', name: 'Sound 1', ...DEFAULT_SOUND };
            newState.currentTrackId = newId;
            newState.currentTrackName = newName;
            newState.sounds = [initialSound];
            newState.expandedId = '1';
            newState.currentScreen = 'main';
            newState.isPlaying = false;
            break;
        }
        case 'DELETE_TRACK':
            newState.savedTracks = state.savedTracks.filter(s => s.id !== action.payload);
            break;
        case 'IMPORT_TRACK': {
            try {
                // Ensure array of sounds and apply migrations
                const importData = action.payload;
                const migrateSound = (sound: any) => {
                    if (!sound.stepConfigs) {
                        const defaultNotes = sound.activeNotes || ['C', 'Eb', 'G', 'Bb'];
                        const defaultOctave = sound.octave ?? 3;
                        const defaultDetune = sound.detune ?? 0;
                        return {
                            ...sound,
                            stepConfigs: [
                                { activeNotes: defaultNotes, octave: defaultOctave, detune: defaultDetune },
                                { activeNotes: defaultNotes, octave: defaultOctave, detune: defaultDetune },
                                { activeNotes: defaultNotes, octave: defaultOctave, detune: defaultDetune },
                                { activeNotes: defaultNotes, octave: defaultOctave, detune: defaultDetune },
                                { activeNotes: defaultNotes, octave: defaultOctave, detune: defaultDetune },
                                { activeNotes: defaultNotes, octave: defaultOctave, detune: defaultDetune },
                                { activeNotes: defaultNotes, octave: defaultOctave, detune: defaultDetune },
                                { activeNotes: defaultNotes, octave: defaultOctave, detune: defaultDetune },
                            ],
                            stepRatios: [1, null, null, null, null, null, null, null],
                            seqLengthScale: 'minute',
                            seqLengthRate: 30,
                            envAttack: 0.5,
                            envDecay: 0.1,
                            envSustain: 1.0,
                            envRelease: 2.0
                        };
                    }
                    if (sound.envAttack === undefined) {
                        return {
                            ...sound,
                            envAttack: 0.5,
                            envDecay: 0.1,
                            envSustain: 1.0,
                            envRelease: 2.0
                        };
                    }
                    return sound;
                };

                const importedSounds = Array.isArray(importData.sounds)
                    ? importData.sounds.map(migrateSound)
                    : [];

                const newTrack: TrackState = {
                    id: `track-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
                    name: importData.name || `Imported Track ${state.savedTracks.length + 1}`,
                    sounds: importedSounds
                };

                newState.savedTracks = [...state.savedTracks, newTrack];
                newState.toastMessage = "Track imported successfully";
            } catch (e) {
                console.error("Failed to import track", e);
                newState.toastMessage = "Failed to import track";
            }
            break;
        }
        case 'SET_TOAST':
            newState.toastMessage = action.payload;
            break;
    }

    // AUTO-SAVE LOGIC
    if (action.type === 'UPDATE_SOUND' || action.type === 'ADD_SOUND' || action.type === 'DELETE_SOUND' || action.type === 'SET_TRACK_NAME' || action.type === 'CREATE_TRACK' || action.type === 'LOAD_TRACK') {
        const existingIdx = newState.savedTracks.findIndex(s => s.id === newState.currentTrackId);
        const updatedTracks = [...newState.savedTracks];
        if (existingIdx >= 0) {
            updatedTracks[existingIdx] = { id: newState.currentTrackId, name: newState.currentTrackName, sounds: newState.sounds };
        } else {
            updatedTracks.push({ id: newState.currentTrackId, name: newState.currentTrackName, sounds: newState.sounds });
        }
        newState.savedTracks = updatedTracks;
    }
    return newState;
};

const AppContext = createContext<{ state: AppState; dispatch: React.Dispatch<Action> } | undefined>(undefined);

export const AppProvider = ({ children }: { children: ReactNode }) => {
    const [state, dispatch] = useReducer(appReducer, getInitialState());

    // LocalStorage Syncing
    useEffect(() => { localStorage.setItem('noisemaker_currentTrackId', state.currentTrackId); }, [state.currentTrackId]);
    useEffect(() => { localStorage.setItem('noisemaker_currentTrackName', state.currentTrackName); }, [state.currentTrackName]);
    useEffect(() => { localStorage.setItem('noisemaker_sounds', JSON.stringify(state.sounds)); }, [state.sounds]);
    useEffect(() => { localStorage.setItem('noisemaker_expandedId', state.expandedId); }, [state.expandedId]);
    useEffect(() => { localStorage.setItem('noisemaker_nextId', state.nextId.toString()); }, [state.nextId]);
    useEffect(() => { localStorage.setItem('noisemaker_tracks', JSON.stringify(state.savedTracks)); }, [state.savedTracks]);

    // Audio Manager Syncing
    useEffect(() => {
        if (state.isPlaying) {
            audioManager.initialize().then(() => {
                state.sounds.forEach(sound => {
                    audioManager.syncSoundState(sound, true);
                });
                audioManager.cleanupEngines(state.sounds.map(s => s.id));
            });
        } else {
            audioManager.stopAll();
        }
    }, [state.isPlaying, state.sounds]);

    return (
        <AppContext.Provider value={{ state, dispatch }}>
            {children}
        </AppContext.Provider>
    );
};

// eslint-disable-next-line react-refresh/only-export-components
export const useAppState = () => {
    const context = useContext(AppContext);
    if (context === undefined) {
        throw new Error('useAppState must be used within an AppProvider');
    }
    return context;
};
