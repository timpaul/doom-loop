import React, { createContext, useContext, useReducer, useEffect } from 'react';
import type { ReactNode } from 'react';
import { DEFAULT_SOUND } from '../types';
import type { SoundState, TrackState } from '../types';
import { audioManager } from '../audio/AudioManager';
import { mixPlayer } from '../audio/MixPlayer';

// Pre-load all preset JSONs synchronously using Vite's import.meta.glob
const presetFiles = import.meta.glob('../audio/presets/*.json', { eager: true });

const DEFAULT_MIXES: MixState[] = [];
const presetTracksList: TrackState[] = [];

Object.values(presetFiles).forEach((module: any) => {
    const data = module.default || module;
    if (data.type === 'doom-loop-mix' && data.mix && data.tracks) {
        DEFAULT_MIXES.push(data.mix);
        presetTracksList.push(...data.tracks);
    } else if (data.sounds) {
        presetTracksList.push(data);
    }
});

// Deduplicate tracks by ID
const trackMap = new Map<string, TrackState>();
presetTracksList.forEach(t => trackMap.set(t.id, t));
const DEFAULT_TRACKS: TrackState[] = Array.from(trackMap.values())
    .sort((a, b) => a.name.localeCompare(b.name));

import { DEFAULT_MIX } from '../types';
import type { MixState, MixItem } from '../types';

export interface AppState {
    isPlaying: boolean;
    currentScreen: 'main' | 'load' | 'mixDetail';
    listMode: 'tracks' | 'mixes';
    currentTrackId: string;
    currentTrackName: string;
    savedTracks: TrackState[];
    savedMixes: MixState[];
    currentMixId: string | null;
    toastMessage: string | null;
    sounds: SoundState[];
    expandedId: string;
    nextId: number;
}

export type Action =
    | { type: 'TOGGLE_PLAY' }
    | { type: 'SET_SCREEN'; payload: 'main' | 'load' | 'mixDetail' }
    | { type: 'SET_LIST_MODE'; payload: 'tracks' | 'mixes' }
    | { type: 'ADD_SOUND' }
    | { type: 'UPDATE_SOUND'; payload: { id: string; updates: Partial<SoundState> } }
    | { type: 'DELETE_SOUND'; payload: string }
    | { type: 'DUPLICATE_SOUND'; payload: string }
    | { type: 'TOGGLE_EXPAND'; payload: string }
    | { type: 'SET_TRACK_NAME'; payload: string }
    | { type: 'UPDATE_TRACK_META'; payload: Partial<TrackState> }
    | { type: 'LOAD_TRACK'; payload: TrackState }
    | { type: 'LOAD_AND_PLAY_TRACK'; payload: TrackState }
    | { type: 'CREATE_TRACK' }
    | { type: 'DELETE_TRACK'; payload: string }
    | { type: 'DUPLICATE_TRACK'; payload: string }
    | { type: 'IMPORT_TRACK'; payload: any }
    | { type: 'CREATE_MIX' }
    | { type: 'DELETE_MIX'; payload: string }
    | { type: 'DUPLICATE_MIX'; payload: string }
    | { type: 'LOAD_MIX'; payload: string }
    | { type: 'LOAD_AND_PLAY_MIX'; payload: string }
    | { type: 'IMPORT_MIX'; payload: { mix: Omit<MixState, 'items'> & { items: any[] }, tracks: TrackState[] } }
    | { type: 'UPDATE_MIX_SETTINGS'; payload: Partial<MixState> }
    | { type: 'ADD_TRACK_TO_MIX'; payload: string }
    | { type: 'REMOVE_MIX_ITEM'; payload: string }
    | { type: 'REORDER_MIX_ITEMS'; payload: { sourceIndex: number, destIndex: number } }
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
                // Ensure LFO type and detune LFO defaults exist
                const migrated = { ...sound };
                if (migrated.volLfoType === undefined) migrated.volLfoType = 'sine';
                if (migrated.panLfoType === undefined) migrated.panLfoType = 'sine';
                if (migrated.autoFilterType === undefined) migrated.autoFilterType = 'sine';
                if (migrated.detuneLfoType === undefined) migrated.detuneLfoType = 'sine';
                if (migrated.detuneLfoScale === undefined) migrated.detuneLfoScale = 'minute';
                if (migrated.detuneLfoRate === undefined) migrated.detuneLfoRate = 30;
                if (migrated.detuneLfoDepth === undefined) migrated.detuneLfoDepth = 0;
                return migrated;
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

    // Check if we've already loaded the defaults on this device
    const hasLoadedDefaults = localStorage.getItem('noisemaker_hasLoadedDefaults');

    let initialTracks: TrackState[];
    let currentTrackId: string;
    let currentTrackName: string;
    let sounds: SoundState[];
    let expandedId: string;

    if (!hasLoadedDefaults && (DEFAULT_TRACKS.length > 0 || DEFAULT_MIXES.length > 0)) {
        // First time visit: Load default tracks and mixes
        initialTracks = [...DEFAULT_TRACKS];

        // Select the first track by default
        const firstTrack = initialTracks[0];
        if (firstTrack) {
            currentTrackId = firstTrack.id;
            currentTrackName = firstTrack.name;
            sounds = [...firstTrack.sounds];
            expandedId = sounds.length > 0 ? sounds[0].id : '';
        } else {
            currentTrackId = 'track-1';
            currentTrackName = 'Track 1';
            sounds = [];
            expandedId = '';
        }

        // Mark defaults as loaded so we don't overwrite user edits later
        localStorage.setItem('noisemaker_hasLoadedDefaults', 'true');
        // Persist the default tracks and mixes immediately so they show up consistently
        localStorage.setItem('noisemaker_tracks', JSON.stringify(initialTracks));
        localStorage.setItem('noisemaker_mixes', JSON.stringify(DEFAULT_MIXES));
    } else {
        // Normal initialization from localStorage or backup
        initialTracks = parseJSON('noisemaker_tracks', parseJSON('noisemaker_scenes', [
            { id: 'track-1', name: 'Track 1', sounds: [{ id: '1', name: 'Sound 1', ...DEFAULT_SOUND }] }
        ]));

        currentTrackId = localStorage.getItem('noisemaker_currentTrackId') || localStorage.getItem('noisemaker_currentSceneId') || 'track-1';
        currentTrackName = localStorage.getItem('noisemaker_currentTrackName') || localStorage.getItem('noisemaker_currentSceneName') || 'Track 1';
        sounds = parseJSON('noisemaker_sounds', [{ id: '1', name: 'Sound 1', ...DEFAULT_SOUND }]);
        expandedId = localStorage.getItem('noisemaker_expandedId') || '1';
    }

    const savedMixes = parseJSON('noisemaker_mixes', []);
    const currentMixId = localStorage.getItem('noisemaker_currentMixId') || null;
    const listMode = (localStorage.getItem('noisemaker_listMode') as 'tracks' | 'mixes') || 'tracks';

    return {
        isPlaying: false,
        currentScreen: 'load',
        listMode,
        currentTrackId,
        currentTrackName,
        savedTracks: initialTracks,
        savedMixes,
        currentMixId,
        sounds,
        toastMessage: null,
        expandedId,
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
        case 'SET_LIST_MODE':
            newState.listMode = action.payload;
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
        case 'DUPLICATE_SOUND': {
            const soundToDuplicate = state.sounds.find(s => s.id === action.payload);
            if (!soundToDuplicate) break;

            const existingNames = new Set(state.sounds.map(s => s.name));
            let baseName = soundToDuplicate.name;
            let counter = 1;
            const match = soundToDuplicate.name.match(/^(.*?)(?:\s\((\d+)\))?$/);
            if (match) {
                baseName = match[1].trim();
                if (match[2]) counter = parseInt(match[2], 10);
            }
            let newName = '';
            do {
                newName = `${baseName} (${counter})`;
                counter++;
            } while (existingNames.has(newName));

            const newId = state.nextId.toString();
            const duplicatedSound = {
                ...soundToDuplicate,
                id: newId,
                name: newName
            };

            const index = state.sounds.findIndex(s => s.id === action.payload);
            newState.sounds = [...state.sounds];
            newState.sounds.splice(index + 1, 0, duplicatedSound);
            newState.expandedId = newId;
            newState.nextId = state.nextId + 1;
            break;
        }
        case 'TOGGLE_EXPAND':
            newState.expandedId = state.expandedId === action.payload ? '' : action.payload;
            break;
        case 'SET_TRACK_NAME':
            newState.currentTrackName = action.payload;
            break;
        case 'UPDATE_TRACK_META':
            newState.savedTracks = state.savedTracks.map(t =>
                t.id === state.currentTrackId ? { ...t, ...action.payload } : t
            );
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
        case 'LOAD_AND_PLAY_TRACK':
            newState.currentTrackId = action.payload.id;
            newState.currentTrackName = action.payload.name;
            newState.sounds = action.payload.sounds;
            newState.isPlaying = true;
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
            newState.savedMixes = state.savedMixes.map(mix => ({
                ...mix,
                items: mix.items.filter(item => item.trackId !== action.payload)
            }));
            break;
        case 'DUPLICATE_TRACK': {
            const trackToDuplicate = state.savedTracks.find(t => t.id === action.payload);
            if (!trackToDuplicate) break;

            const existingNames = new Set(state.savedTracks.map(t => t.name));

            // Extract base name and counter if it exists (e.g. "Track 1 (2)" -> base="Track 1", counter=2)
            let baseName = trackToDuplicate.name;
            let counter = 1;

            const match = trackToDuplicate.name.match(/^(.*?)(?:\s\((\d+)\))?$/);
            if (match) {
                baseName = match[1].trim();
                // We start incrementing from whatever number it had, or 1
                if (match[2]) {
                    counter = parseInt(match[2], 10);
                }
            }

            // Keep incrementing until we find a unique name
            let newName = '';
            do {
                newName = `${baseName} (${counter})`;
                counter++;
            } while (existingNames.has(newName));

            const duplicatedTrack: TrackState = {
                id: `track-${Date.now()}`,
                name: newName,
                sounds: trackToDuplicate.sounds.map((s, index) => ({
                    ...s,
                    id: `${Date.now()}-${index}`
                }))
            };

            // Insert after the original track
            const index = state.savedTracks.findIndex(t => t.id === action.payload);
            newState.savedTracks = [...state.savedTracks];
            newState.savedTracks.splice(index + 1, 0, duplicatedTrack);
            break;
        }
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
                    const migrated = { ...sound };
                    if (migrated.volLfoType === undefined) migrated.volLfoType = 'sine';
                    if (migrated.panLfoType === undefined) migrated.panLfoType = 'sine';
                    if (migrated.autoFilterType === undefined) migrated.autoFilterType = 'sine';
                    if (migrated.detuneLfoType === undefined) migrated.detuneLfoType = 'sine';
                    if (migrated.detuneLfoScale === undefined) migrated.detuneLfoScale = 'minute';
                    if (migrated.detuneLfoRate === undefined) migrated.detuneLfoRate = 30;
                    if (migrated.detuneLfoDepth === undefined) migrated.detuneLfoDepth = 0;
                    return migrated;
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
        case 'IMPORT_MIX': {
            try {
                const { mix, tracks } = action.payload;

                // Helper to safely parse sounds with backward compat
                const migrateSound = (sound: any) => {
                    if (!sound.stepConfigs) {
                        const defaultNotes = sound.activeNotes || ['C', 'Eb', 'G', 'Bb'];
                        const defaultOctave = sound.octave ?? 3;
                        const defaultDetune = sound.detune ?? 0;
                        return {
                            ...sound,
                            stepConfigs: Array(8).fill({ activeNotes: defaultNotes, octave: defaultOctave, detune: defaultDetune }),
                            stepRatios: [1, ...Array(7).fill(null)],
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
                    const migrated = { ...sound };
                    if (migrated.volLfoType === undefined) migrated.volLfoType = 'sine';
                    if (migrated.panLfoType === undefined) migrated.panLfoType = 'sine';
                    if (migrated.autoFilterType === undefined) migrated.autoFilterType = 'sine';
                    if (migrated.detuneLfoType === undefined) migrated.detuneLfoType = 'sine';
                    if (migrated.detuneLfoScale === undefined) migrated.detuneLfoScale = 'minute';
                    if (migrated.detuneLfoRate === undefined) migrated.detuneLfoRate = 30;
                    if (migrated.detuneLfoDepth === undefined) migrated.detuneLfoDepth = 0;
                    return migrated;
                };

                const localTrackIds = new Set(state.savedTracks.map(t => t.id));
                const newTracksToSave: TrackState[] = [];

                // Compare bundled tracks against local
                if (Array.isArray(tracks)) {
                    for (const track of tracks) {
                        if (!localTrackIds.has(track.id)) {
                            // Run migration to be safe
                            const importedSounds = Array.isArray(track.sounds) ? track.sounds.map(migrateSound) : [];
                            newTracksToSave.push({
                                ...track,
                                sounds: importedSounds
                            });
                        }
                    }
                }

                // Create the newly imported mix with generic ID to allow duplicate imports
                const newMixId = `mix-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
                const newMixName = mix.name || `Imported Mix ${state.savedMixes.length + 1}`;

                // Keep the exact same mix item IDs so tracks hook up properly
                const newItems = Array.isArray(mix.items) ? mix.items : [];

                const newMix: MixState = {
                    ...DEFAULT_MIX,
                    ...mix,
                    id: newMixId,
                    name: newMixName,
                    items: newItems
                };

                newState.savedTracks = [...state.savedTracks, ...newTracksToSave];
                newState.savedMixes = [...state.savedMixes, newMix];
                newState.toastMessage = "Mix imported successfully";
            } catch (e) {
                console.error("Failed to import mix", e);
                newState.toastMessage = "Failed to import mix";
            }
            break;
        }
        case 'CREATE_MIX': {
            const newId = `mix-${Date.now()}`;
            const newMix: MixState = {
                id: newId,
                name: `Mix ${state.savedMixes.length + 1}`,
                items: [],
                ...DEFAULT_MIX
            };
            newState.savedMixes = [...state.savedMixes, newMix];
            newState.currentMixId = newId;
            newState.currentScreen = 'mixDetail';
            newState.isPlaying = false;
            break;
        }
        case 'DELETE_MIX':
            newState.savedMixes = state.savedMixes.filter(m => m.id !== action.payload);
            if (newState.currentMixId === action.payload) {
                newState.currentMixId = null;
                newState.currentScreen = 'load';
            }
            break;
        case 'DUPLICATE_MIX': {
            const mixToDuplicate = state.savedMixes.find(m => m.id === action.payload);
            if (!mixToDuplicate) break;

            const existingNames = new Set(state.savedMixes.map(m => m.name));
            let baseName = mixToDuplicate.name;
            let counter = 1;
            const match = mixToDuplicate.name.match(/^(.*?)(?:\s\((\d+)\))?$/);
            if (match) {
                baseName = match[1].trim();
                if (match[2]) counter = parseInt(match[2], 10);
            }
            let newName = '';
            do {
                newName = `${baseName} (${counter})`;
                counter++;
            } while (existingNames.has(newName));

            const duplicatedMix: MixState = {
                ...mixToDuplicate,
                id: `mix-${Date.now()}`,
                name: newName,
                items: mixToDuplicate.items.map(item => ({ ...item, id: `${Date.now()}-${Math.random().toString(36).substring(7)}` }))
            };

            const index = state.savedMixes.findIndex(m => m.id === action.payload);
            newState.savedMixes = [...state.savedMixes];
            newState.savedMixes.splice(index + 1, 0, duplicatedMix);
            break;
        }
        case 'LOAD_MIX':
            if (state.currentMixId !== action.payload) {
                newState.isPlaying = false;
            }
            newState.currentMixId = action.payload;
            newState.currentScreen = 'mixDetail';
            break;
        case 'LOAD_AND_PLAY_MIX':
            newState.currentMixId = action.payload;
            newState.isPlaying = true;
            break;
        case 'UPDATE_MIX_SETTINGS':
            if (state.currentMixId) {
                newState.savedMixes = state.savedMixes.map(m =>
                    m.id === state.currentMixId ? { ...m, ...action.payload } : m
                );
            }
            break;
        case 'ADD_TRACK_TO_MIX':
            if (state.currentMixId) {
                const newMixItem: MixItem = {
                    id: `item-${Date.now()}-${Math.random().toString(36).substring(7)}`,
                    trackId: action.payload
                };
                newState.savedMixes = state.savedMixes.map(m =>
                    m.id === state.currentMixId ? { ...m, items: [...m.items, newMixItem] } : m
                );
            }
            break;
        case 'REMOVE_MIX_ITEM':
            if (state.currentMixId) {
                newState.savedMixes = state.savedMixes.map(m =>
                    m.id === state.currentMixId ? { ...m, items: m.items.filter(item => item.id !== action.payload) } : m
                );
            }
            break;
        case 'REORDER_MIX_ITEMS':
            if (state.currentMixId) {
                const { sourceIndex, destIndex } = action.payload;
                newState.savedMixes = state.savedMixes.map(m => {
                    if (m.id === state.currentMixId) {
                        const newItems = [...m.items];
                        const [removed] = newItems.splice(sourceIndex, 1);
                        newItems.splice(destIndex, 0, removed);
                        return { ...m, items: newItems };
                    }
                    return m;
                });
            }
            break;
        case 'SET_TOAST':
            newState.toastMessage = action.payload;
            break;
    }

    // AUTO-SAVE LOGIC
    if (action.type === 'UPDATE_SOUND' || action.type === 'ADD_SOUND' || action.type === 'DELETE_SOUND' || action.type === 'DUPLICATE_SOUND' || action.type === 'SET_TRACK_NAME' || action.type === 'CREATE_TRACK' || action.type === 'LOAD_TRACK' || action.type === 'LOAD_AND_PLAY_TRACK' || action.type === 'DUPLICATE_TRACK') {
        const existingIdx = newState.savedTracks.findIndex(s => s.id === newState.currentTrackId);
        const updatedTracks = [...newState.savedTracks];
        if (existingIdx >= 0) {
            updatedTracks[existingIdx] = { ...updatedTracks[existingIdx], id: newState.currentTrackId, name: newState.currentTrackName, sounds: newState.sounds };
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
    useEffect(() => { localStorage.setItem('noisemaker_listMode', state.listMode); }, [state.listMode]);
    useEffect(() => { localStorage.setItem('noisemaker_currentTrackId', state.currentTrackId); }, [state.currentTrackId]);
    useEffect(() => { localStorage.setItem('noisemaker_currentTrackName', state.currentTrackName); }, [state.currentTrackName]);
    useEffect(() => { localStorage.setItem('noisemaker_sounds', JSON.stringify(state.sounds)); }, [state.sounds]);
    useEffect(() => { localStorage.setItem('noisemaker_expandedId', state.expandedId); }, [state.expandedId]);
    useEffect(() => { localStorage.setItem('noisemaker_nextId', state.nextId.toString()); }, [state.nextId]);
    useEffect(() => { localStorage.setItem('noisemaker_tracks', JSON.stringify(state.savedTracks)); }, [state.savedTracks]);
    useEffect(() => { localStorage.setItem('noisemaker_mixes', JSON.stringify(state.savedMixes)); }, [state.savedMixes]);
    useEffect(() => {
        if (state.currentMixId) {
            localStorage.setItem('noisemaker_currentMixId', state.currentMixId);
        } else {
            localStorage.removeItem('noisemaker_currentMixId');
        }
    }, [state.currentMixId]);

    // Audio Manager Syncing
    useEffect(() => {
        if (state.isPlaying) {
            audioManager.resumeContext().then(() => audioManager.initialize()).then(() => {
                if (state.currentScreen === 'mixDetail' || (state.currentScreen === 'load' && state.listMode === 'mixes' && state.currentMixId)) {
                    const mix = state.savedMixes.find(m => m.id === state.currentMixId);
                    if (mix) {
                        mixPlayer.updateMix(mix, state.savedTracks);
                        mixPlayer.play();
                    }
                } else {
                    mixPlayer.stop();
                    state.sounds.forEach(sound => {
                        audioManager.syncSoundState(sound, true);
                    });
                    audioManager.cleanupEngines(state.sounds.map(s => s.id));
                }
            });
        } else {
            audioManager.stopAll();
            mixPlayer.pause();
        }
    }, [state.isPlaying, state.sounds, state.currentScreen, state.listMode, state.currentMixId, state.savedMixes, state.savedTracks]);

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
