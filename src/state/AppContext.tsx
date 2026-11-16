import React, { createContext, useContext, useReducer, useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { DEFAULT_SOUND, migrateSound, getTrackItems, flattenTrackItems } from '../types';
import type { SoundState, TrackState, SoundGroupState, TrackItem, GroupPlayMode } from '../types';
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
        // Migrate track sounds so they have all current defaults
        const migratedTracks = data.tracks.map((t: any) => ({
            ...t,
            sounds: (t.sounds || []).map(migrateSound)
        }));
        presetTracksList.push(...migratedTracks);
    } else if (data.sounds) {
        presetTracksList.push({
            ...data,
            sounds: data.sounds.map(migrateSound)
        });
    }
});

// Deduplicate tracks by ID
const trackMap = new Map<string, TrackState>();
presetTracksList.forEach(t => trackMap.set(t.id, t));
const DEFAULT_TRACKS: TrackState[] = Array.from(trackMap.values())
    .sort((a, b) => a.name.localeCompare(b.name));

// Load community files
const communityFiles = import.meta.glob('../audio/community/*.json', { eager: true });
const communityMixesList: MixState[] = [];
const communityTracksList: TrackState[] = [];

Object.values(communityFiles).forEach((module: any) => {
    const data = module.default || module;
    if (data.type === 'doom-loop-mix' && data.mix && data.tracks) {
        communityMixesList.push(data.mix);
        const migratedTracks = data.tracks.map((t: any) => ({
            ...t,
            sounds: (t.sounds || []).map(migrateSound)
        }));
        communityTracksList.push(...migratedTracks);
    } else if (data.sounds) {
        communityTracksList.push({
            ...data,
            sounds: data.sounds.map(migrateSound)
        });
    }
});
const commTrackMap = new Map<string, TrackState>();
communityTracksList.forEach(t => commTrackMap.set(t.id, t));
const COMMUNITY_TRACKS: TrackState[] = Array.from(commTrackMap.values()).sort((a, b) => a.name.localeCompare(b.name));


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
    communityTracks: TrackState[];
    communityMixes: MixState[];
    toastMessage: string | null;
    sounds: SoundState[];
    soundGroups: SoundGroupState[];
    activeGroupSoundIds: Record<string, string>;
    activeTrackGroupId: string | null;
    expandedId: string;
    nextId: number;
    playbackMode: 'track' | 'mix';
}

export type Action =
    | { type: 'TOGGLE_PLAY' }
    | { type: 'STOP_PLAYBACK' }
    | { type: 'SET_SCREEN'; payload: 'main' | 'load' | 'mixDetail' }
    | { type: 'SET_LIST_MODE'; payload: 'tracks' | 'mixes' }
    | { type: 'ADD_SOUND' }
    | { type: 'UPDATE_SOUND'; payload: { id: string; updates: Partial<SoundState> } }
    | { type: 'DELETE_SOUND'; payload: string }
    | { type: 'DUPLICATE_SOUND'; payload: string }
    | { type: 'REORDER_SOUNDS'; payload: { sourceIndex: number; destIndex: number } }
    | { type: 'GROUP_SOUNDS'; payload: { sourceSoundId: string; targetSoundId: string } }
    | { type: 'UNGROUP_SOUNDS'; payload: string }
    | { type: 'TOGGLE_MUTE_SOUND_GROUP'; payload: string }
    | { type: 'UPDATE_SOUND_GROUP'; payload: { groupId: string; updates: Partial<SoundGroupState> } }
    | { type: 'SWITCH_GROUP_SOUND'; payload: { groupId: string; targetSoundId: string } }
    | { type: 'SWITCH_TRACK_GROUP'; payload: { targetGroupId: string } }
    | { type: 'MOVE_SOUND_TO_GROUP'; payload: { soundId: string; targetGroupId: string; insertIndex: number } }
    | { type: 'MOVE_SOUND_TO_TOP_LEVEL'; payload: { soundId: string; targetIndex: number } }
    | { type: 'REORDER_TOP_LEVEL_GROUP'; payload: { groupId: string; targetIndex: number } }
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
    | { type: 'ADD_COMMUNITY_TRACK'; payload: string }
    | { type: 'ADD_COMMUNITY_MIX'; payload: string }
    | { type: 'UPDATE_MIX_SETTINGS'; payload: Partial<MixState> }
    | { type: 'ADD_TRACK_TO_MIX'; payload: string }
    | { type: 'REMOVE_MIX_ITEM'; payload: string }
    | { type: 'REORDER_MIX_ITEMS'; payload: { sourceIndex: number, destIndex: number } }
    | { type: 'REROLL_MIX_WEIGHTS'; payload: string }
    | { type: 'SET_TOAST'; payload: string | null };

function computeActiveGroupSoundIds(
    sounds: SoundState[],
    soundGroups: SoundGroupState[],
    prevActive: Record<string, string> = {}
): Record<string, string> {
    const nextActive: Record<string, string> = {};

    for (const group of soundGroups) {
        if (group.isMuted) continue;
        if (group.playMode === 'all') continue;
        const eligible = sounds.filter(s => s.groupId === group.id && !s.isMuted);
        if (eligible.length === 0) continue;

        const currentActiveId = prevActive[group.id];
        const isCurrentStillEligible = eligible.some(s => s.id === currentActiveId);

        if (isCurrentStillEligible) {
            nextActive[group.id] = currentActiveId;
        } else {
            if (group.playMode === 'sequence') {
                nextActive[group.id] = eligible[0].id;
            } else {
                const chosen = eligible[Math.floor(Math.random() * eligible.length)];
                nextActive[group.id] = chosen.id;
            }
        }
    }

    return nextActive;
}

function computeActiveTrackGroupId(
    soundGroups: SoundGroupState[],
    groupPlayMode: GroupPlayMode = 'all',
    prevActiveGroupId: string | null = null
): string | null {
    if (groupPlayMode === 'all') return null;
    const eligible = soundGroups.filter(g => !g.isMuted);
    if (eligible.length === 0) return null;

    if (prevActiveGroupId && eligible.some(g => g.id === prevActiveGroupId)) {
        return prevActiveGroupId;
    }

    if (groupPlayMode === 'sequence') {
        return eligible[0].id;
    } else {
        const chosen = eligible[Math.floor(Math.random() * eligible.length)];
        return chosen.id;
    }
}

// eslint-disable-next-line react-refresh/only-export-components
const getInitialState = (): AppState => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const parseJSON = (key: string, backup: any) => {
        try {
            const val = localStorage.getItem(key);
            if (!val) return backup;
            const parsed = JSON.parse(val);



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
    let soundGroups: SoundGroupState[];
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
            soundGroups = firstTrack.soundGroups ? [...firstTrack.soundGroups] : [];
            expandedId = sounds.length > 0 ? sounds[0].id : '';
        } else {
            currentTrackId = 'track-1';
            currentTrackName = 'Track 1';
            sounds = [];
            soundGroups = [];
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
        const currentSavedTrack = initialTracks.find(t => t.id === currentTrackId);
        soundGroups = currentSavedTrack?.soundGroups ? [...currentSavedTrack.soundGroups] : parseJSON('noisemaker_soundGroups', []);
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
        communityTracks: COMMUNITY_TRACKS,
        communityMixes: communityMixesList,
        currentMixId,
        sounds,
        soundGroups,
        activeGroupSoundIds: {},
        activeTrackGroupId: null,
        toastMessage: null,
        expandedId,
        nextId: parseJSON('noisemaker_nextId', 2),
        playbackMode: 'track'
    };
};

const appReducer = (state: AppState, action: Action): AppState => {
    const newState = { ...state };
    switch (action.type) {
        case 'TOGGLE_PLAY':
            newState.isPlaying = !state.isPlaying;
            break;
        case 'STOP_PLAYBACK':
            newState.isPlaying = false;
            break;
        case 'SET_SCREEN':
            newState.currentScreen = action.payload;
            break;
        case 'SET_LIST_MODE':
            newState.listMode = action.payload;
            break;
        case 'ADD_SOUND': {
            const newId = state.nextId.toString();
            newState.sounds = [...state.sounds, { id: newId, name: `Sound ${newId}`, ...DEFAULT_SOUND, groupId: undefined }];
            newState.expandedId = newId;
            newState.nextId = state.nextId + 1;
            break;
        }
        case 'UPDATE_SOUND':
            newState.sounds = state.sounds.map(s => s.id === action.payload.id ? { ...s, ...action.payload.updates } : s);
            break;
        case 'DELETE_SOUND': {
            const newSounds = state.sounds.filter(s => s.id !== action.payload);
            const remainingGroupIds = new Set(newSounds.map(s => s.groupId).filter(Boolean));
            const newGroups = (state.soundGroups || []).filter(g => remainingGroupIds.has(g.id));
            newState.sounds = newSounds;
            newState.soundGroups = newGroups;
            break;
        }
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
                name: newName,
                groupId: soundToDuplicate.groupId
            };

            const index = state.sounds.findIndex(s => s.id === action.payload);
            newState.sounds = [...state.sounds];
            newState.sounds.splice(index + 1, 0, duplicatedSound);
            newState.expandedId = newId;
            newState.nextId = state.nextId + 1;
            break;
        }
        case 'REORDER_SOUNDS': {
            const { sourceIndex, destIndex } = action.payload;
            const newSounds = [...state.sounds];
            const [removed] = newSounds.splice(sourceIndex, 1);
            newSounds.splice(destIndex, 0, removed);
            newState.sounds = newSounds;
            break;
        }
        case 'GROUP_SOUNDS': {
            const { sourceSoundId, targetSoundId } = action.payload;
            if (sourceSoundId === targetSoundId) break;
            const items = getTrackItems(state.sounds, state.soundGroups);

            let sourceSound: SoundState | null = null;
            for (const item of items) {
                if (item.type === 'sound' && item.sound.id === sourceSoundId) {
                    sourceSound = item.sound;
                    break;
                } else if (item.type === 'group') {
                    const idx = item.sounds.findIndex(s => s.id === sourceSoundId);
                    if (idx !== -1) {
                        sourceSound = item.sounds[idx];
                        item.sounds.splice(idx, 1);
                        break;
                    }
                }
            }
            const cleanItems = items.filter(it => it.type === 'sound' ? it.sound.id !== sourceSoundId : it.sounds.length > 0);
            if (!sourceSound) break;

            const targetIdx = cleanItems.findIndex(it => it.type === 'sound' && it.sound.id === targetSoundId);
            if (targetIdx === -1) break;

            const targetSound = (cleanItems[targetIdx] as { type: 'sound'; sound: SoundState }).sound;
            const newGroupId = `group-${Date.now()}-${Math.random().toString(36).substring(7)}`;
            const newGroup: SoundGroupState = { id: newGroupId, isMuted: false, playMode: 'random', switchProbability: 0 };

            const newGroupItem: TrackItem = {
                type: 'group',
                group: newGroup,
                sounds: [targetSound, sourceSound]
            };

            cleanItems.splice(targetIdx, 1, newGroupItem);
            const flattened = flattenTrackItems(cleanItems);
            newState.sounds = flattened.sounds;
            newState.soundGroups = flattened.soundGroups;
            break;
        }
        case 'UNGROUP_SOUNDS': {
            const items = getTrackItems(state.sounds, state.soundGroups);
            const newItems: TrackItem[] = [];
            for (const it of items) {
                if (it.type === 'group' && it.group.id === action.payload) {
                    for (const s of it.sounds) {
                        newItems.push({ type: 'sound', sound: { ...s, groupId: undefined } });
                    }
                } else {
                    newItems.push(it);
                }
            }
            const flattened = flattenTrackItems(newItems);
            newState.sounds = flattened.sounds;
            newState.soundGroups = flattened.soundGroups;
            break;
        }
        case 'TOGGLE_MUTE_SOUND_GROUP': {
            newState.soundGroups = (state.soundGroups || []).map(g =>
                g.id === action.payload ? { ...g, isMuted: !g.isMuted } : g
            );
            break;
        }
        case 'UPDATE_SOUND_GROUP': {
            const { groupId, updates } = action.payload;
            const prevGroup = (state.soundGroups || []).find(g => g.id === groupId);
            newState.soundGroups = (state.soundGroups || []).map(g =>
                g.id === groupId ? { ...g, ...updates } : g
            );
            if (updates.playMode === 'sequence' && prevGroup?.playMode !== 'sequence') {
                const eligible = newState.sounds.filter(s => s.groupId === groupId && !s.isMuted);
                if (eligible.length > 0) {
                    newState.activeGroupSoundIds = {
                        ...(state.activeGroupSoundIds || {}),
                        [groupId]: eligible[0].id
                    };
                }
            }
            break;
        }
        case 'SWITCH_GROUP_SOUND': {
            newState.activeGroupSoundIds = {
                ...(state.activeGroupSoundIds || {}),
                [action.payload.groupId]: action.payload.targetSoundId
            };
            break;
        }
        case 'SWITCH_TRACK_GROUP': {
            newState.activeTrackGroupId = action.payload.targetGroupId;
            break;
        }
        case 'MOVE_SOUND_TO_GROUP': {
            const { soundId, targetGroupId, insertIndex } = action.payload;
            const items = getTrackItems(state.sounds, state.soundGroups);

            let movedSound: SoundState | null = null;
            for (const it of items) {
                if (it.type === 'sound' && it.sound.id === soundId) {
                    movedSound = it.sound;
                    break;
                } else if (it.type === 'group') {
                    const idx = it.sounds.findIndex(s => s.id === soundId);
                    if (idx !== -1) {
                        movedSound = it.sounds[idx];
                        it.sounds.splice(idx, 1);
                        break;
                    }
                }
            }
            const cleanItems = items.filter(it => it.type === 'sound' ? it.sound.id !== soundId : it.sounds.length > 0);
            if (!movedSound) break;

            const targetGroup = cleanItems.find(it => it.type === 'group' && it.group.id === targetGroupId);
            if (!targetGroup || targetGroup.type !== 'group') break;

            const safeIndex = Math.max(0, Math.min(insertIndex, targetGroup.sounds.length));
            targetGroup.sounds.splice(safeIndex, 0, movedSound);

            const flattened = flattenTrackItems(cleanItems);
            newState.sounds = flattened.sounds;
            newState.soundGroups = flattened.soundGroups;
            break;
        }
        case 'MOVE_SOUND_TO_TOP_LEVEL': {
            const { soundId, targetIndex } = action.payload;
            const items = getTrackItems(state.sounds, state.soundGroups);

            let movedSound: SoundState | null = null;
            for (const it of items) {
                if (it.type === 'sound' && it.sound.id === soundId) {
                    movedSound = it.sound;
                    break;
                } else if (it.type === 'group') {
                    const idx = it.sounds.findIndex(s => s.id === soundId);
                    if (idx !== -1) {
                        movedSound = it.sounds[idx];
                        it.sounds.splice(idx, 1);
                        break;
                    }
                }
            }
            const cleanItems = items.filter(it => it.type === 'sound' ? it.sound.id !== soundId : it.sounds.length > 0);
            if (!movedSound) break;

            const safeIndex = Math.max(0, Math.min(targetIndex, cleanItems.length));
            cleanItems.splice(safeIndex, 0, { type: 'sound', sound: { ...movedSound, groupId: undefined } });

            const flattened = flattenTrackItems(cleanItems);
            newState.sounds = flattened.sounds;
            newState.soundGroups = flattened.soundGroups;
            break;
        }
        case 'REORDER_TOP_LEVEL_GROUP': {
            const { groupId, targetIndex } = action.payload;
            const items = getTrackItems(state.sounds, state.soundGroups);
            const currentIdx = items.findIndex(it => it.type === 'group' && it.group.id === groupId);
            if (currentIdx === -1) break;

            const [removed] = items.splice(currentIdx, 1);
            const destIdx = targetIndex > currentIdx ? targetIndex - 1 : targetIndex;
            const safeIndex = Math.max(0, Math.min(destIdx, items.length));
            items.splice(safeIndex, 0, removed);

            const flattened = flattenTrackItems(items);
            newState.sounds = flattened.sounds;
            newState.soundGroups = flattened.soundGroups;
            break;
        }
        case 'TOGGLE_EXPAND':
            newState.expandedId = state.expandedId === action.payload ? '' : action.payload;
            break;
        case 'SET_TRACK_NAME':
            newState.currentTrackName = action.payload;
            break;
        case 'UPDATE_TRACK_META': {
            const currentTrack = state.savedTracks.find(t => t.id === state.currentTrackId);
            const prevMode = currentTrack?.groupPlayMode ?? 'all';

            const existingIdx = state.savedTracks.findIndex(t => t.id === state.currentTrackId);
            if (existingIdx >= 0) {
                newState.savedTracks = state.savedTracks.map(t =>
                    t.id === state.currentTrackId ? { ...t, ...action.payload } : t
                );
            } else {
                newState.savedTracks = [...state.savedTracks, {
                    id: state.currentTrackId,
                    name: state.currentTrackName,
                    transpose: 0,
                    spatialize: 1,
                    glue: 0,
                    drift: 0,
                    fog: 0,
                    fripp: 0,
                    reverbDecay: 4,
                    sounds: state.sounds,
                    soundGroups: state.soundGroups,
                    groupPlayMode: 'all',
                    groupSwitchProbability: 0,
                    ...action.payload
                }];
            }

            if (action.payload.groupPlayMode && action.payload.groupPlayMode !== prevMode) {
                if (action.payload.groupPlayMode === 'all') {
                    newState.activeTrackGroupId = null;
                } else {
                    newState.activeTrackGroupId = computeActiveTrackGroupId(
                        newState.soundGroups,
                        action.payload.groupPlayMode,
                        null
                    );
                }
            }
            break;
        }
        case 'LOAD_TRACK':
            // Only stop playback if loading a fundamentally different track
            if (state.currentTrackId !== action.payload.id) {
                newState.isPlaying = false;
            }
            newState.currentTrackId = action.payload.id;
            newState.currentTrackName = action.payload.name;
            newState.sounds = action.payload.sounds;
            newState.soundGroups = action.payload.soundGroups || [];
            newState.currentScreen = 'main';
            newState.expandedId = action.payload.sounds.length > 0 ? action.payload.sounds[0].id : '';
            newState.playbackMode = 'track';
            break;
        case 'LOAD_AND_PLAY_TRACK':
            newState.currentTrackId = action.payload.id;
            newState.currentTrackName = action.payload.name;
            newState.sounds = action.payload.sounds;
            newState.soundGroups = action.payload.soundGroups || [];
            newState.isPlaying = true;
            newState.expandedId = action.payload.sounds.length > 0 ? action.payload.sounds[0].id : '';
            newState.playbackMode = 'track';
            break;
        case 'CREATE_TRACK': {
            const newId = `track-${Date.now()}`;
            const newName = `Track ${state.savedTracks.length + 1}`;
            const initialSound = { id: '1', name: 'Sound 1', ...DEFAULT_SOUND };
            newState.currentTrackId = newId;
            newState.currentTrackName = newName;
            newState.sounds = [initialSound];
            newState.soundGroups = [];
            newState.expandedId = '1';
            newState.currentScreen = 'main';
            newState.isPlaying = true;
            newState.playbackMode = 'track';
            break;
        }
        case 'DELETE_TRACK':
            newState.savedTracks = state.savedTracks.filter(s => s.id !== action.payload);
            newState.savedMixes = state.savedMixes.map(mix => ({
                ...mix,
                items: mix.items.filter(item => item.trackId !== action.payload)
            }));
            if (state.currentTrackId === action.payload && state.isPlaying && state.playbackMode === 'track') {
                newState.isPlaying = false;
            }
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

            const groupIdMap = new Map<string, string>();
            const duplicatedSoundGroups: SoundGroupState[] = (trackToDuplicate.soundGroups || []).map((g, gIdx) => {
                const newGId = `group-${Date.now()}-${gIdx}`;
                groupIdMap.set(g.id, newGId);
                return { ...g, id: newGId };
            });

            const duplicatedTrack: TrackState = {
                id: `track-${Date.now()}`,
                name: newName,
                author: trackToDuplicate.author,
                notes: trackToDuplicate.notes,
                transpose: trackToDuplicate.transpose ?? 0,
                spatialize: trackToDuplicate.spatialize ?? trackToDuplicate.stereoWidth ?? 1,
                glue: trackToDuplicate.glue ?? 0,
                drift: trackToDuplicate.drift ?? 0,
                fog: trackToDuplicate.fog ?? 0,
                fripp: trackToDuplicate.fripp ?? 0,
                reverbDecay: trackToDuplicate.reverbDecay ?? 4,
                reverbPreDelay: trackToDuplicate.reverbPreDelay ?? 0.01,
                reverbLowCut: trackToDuplicate.reverbLowCut ?? 20,
                reverbHighCut: trackToDuplicate.reverbHighCut ?? 20000,
                groupPlayMode: trackToDuplicate.groupPlayMode ?? 'all',
                groupSwitchProbability: trackToDuplicate.groupSwitchProbability ?? 0,
                sounds: trackToDuplicate.sounds.map((s, index) => ({
                    ...s,
                    id: `${Date.now()}-${index}`,
                    groupId: s.groupId ? (groupIdMap.get(s.groupId) || s.groupId) : undefined
                })),
                soundGroups: duplicatedSoundGroups
            };

            // Insert after the original track
            const index = state.savedTracks.findIndex(t => t.id === action.payload);
            newState.savedTracks = [...state.savedTracks];
            newState.savedTracks.splice(index + 1, 0, duplicatedTrack);
            break;
        }
        case 'IMPORT_TRACK': {
            try {
                const importData = action.payload;

                const importedSounds = Array.isArray(importData.sounds)
                    ? importData.sounds.map(migrateSound)
                    : [];

                const newTrack: TrackState = {
                    id: `track-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
                    name: importData.name || `Imported Track ${state.savedTracks.length + 1}`,
                    author: importData.author,
                    notes: importData.notes,
                    transpose: typeof importData.transpose === 'number' ? importData.transpose : 0,
                    spatialize: typeof importData.spatialize === 'number' ? importData.spatialize : (typeof importData.stereoWidth === 'number' ? importData.stereoWidth : 1),
                    glue: typeof importData.glue === 'number' ? importData.glue : 0,
                    drift: typeof importData.drift === 'number' ? importData.drift : 0,
                    fog: typeof importData.fog === 'number' ? importData.fog : 0,
                    fripp: typeof importData.fripp === 'number' ? importData.fripp : 0,
                    reverbDecay: typeof importData.reverbDecay === 'number' ? importData.reverbDecay : 4,
                    reverbPreDelay: typeof importData.reverbPreDelay === 'number' ? importData.reverbPreDelay : 0.01,
                    reverbLowCut: typeof importData.reverbLowCut === 'number' ? importData.reverbLowCut : 20,
                    reverbHighCut: typeof importData.reverbHighCut === 'number' ? importData.reverbHighCut : 20000,
                    groupPlayMode: importData.groupPlayMode ?? 'all',
                    groupSwitchProbability: typeof importData.groupSwitchProbability === 'number' ? importData.groupSwitchProbability : 0,
                    sounds: importedSounds,
                    soundGroups: Array.isArray(importData.soundGroups) ? importData.soundGroups : []
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
                if (state.isPlaying && state.playbackMode === 'mix') {
                    newState.isPlaying = false;
                }
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
            newState.playbackMode = 'mix';
            break;
        case 'LOAD_AND_PLAY_MIX':
            newState.currentMixId = action.payload;
            newState.isPlaying = true;
            newState.playbackMode = 'mix';
            break;
        case 'UPDATE_MIX_SETTINGS':
            if (state.currentMixId) {
                newState.savedMixes = state.savedMixes.map(m => {
                    if (m.id === state.currentMixId) {
                        const newSettings = { ...m, ...action.payload };
                        if (action.payload.spread !== undefined && action.payload.spread !== m.spread) {
                            newSettings.items = m.items.map(item => ({
                                ...item,
                                weight: 1 + Math.random() * (9 * action.payload.spread!)
                            }));
                        }
                        return newSettings;
                    }
                    return m;
                });
            }
            break;
        case 'ADD_COMMUNITY_TRACK': {
            const trackToAdd = state.communityTracks.find(t => t.id === action.payload);
            if (trackToAdd && !state.savedTracks.some(t => t.id === trackToAdd.id)) {
                newState.savedTracks = [...state.savedTracks, trackToAdd];
                newState.toastMessage = "Track added to library";
            } else {
                newState.toastMessage = "Track already in library";
            }
            break;
        }
        case 'ADD_COMMUNITY_MIX': {
            const mixToAdd = state.communityMixes.find(m => m.id === action.payload);
            if (mixToAdd) {
                let mixAdded = false;
                let newTracksAdded = 0;
                
                if (!state.savedMixes.some(m => m.id === mixToAdd.id)) {
                    newState.savedMixes = [...state.savedMixes, mixToAdd];
                    mixAdded = true;
                }
                
                const trackIdsNeeded = new Set(mixToAdd.items.map(i => i.trackId));
                const newTracks = state.communityTracks.filter(t => trackIdsNeeded.has(t.id) && !state.savedTracks.some(st => st.id === t.id));
                
                if (newTracks.length > 0) {
                    newState.savedTracks = [...state.savedTracks, ...newTracks];
                    newTracksAdded = newTracks.length;
                }
                
                if (mixAdded || newTracksAdded > 0) {
                    newState.toastMessage = `Added mix to library${newTracksAdded > 0 ? ` (and ${newTracksAdded} new tracks)` : ''}`;
                } else {
                    newState.toastMessage = "Mix already in library";
                }
            }
            break;
        }
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
                newState.savedMixes = state.savedMixes.map(m => {
                    if (m.id === state.currentMixId) {
                        const newItems = m.items.filter(item => item.id !== action.payload);
                        const newStopAfter = m.stopAfter !== undefined ? Math.min(m.stopAfter, Math.max(1, newItems.length)) : undefined;
                        return { ...m, items: newItems, stopAfter: newStopAfter };
                    }
                    return m;
                });
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
        case 'REROLL_MIX_WEIGHTS':
            newState.savedMixes = state.savedMixes.map(m => {
                if (m.id === action.payload) {
                    return {
                        ...m,
                        items: m.items.map(item => ({
                            ...item,
                            weight: 1 + Math.random() * (9 * (m.spread || 0))
                        }))
                    };
                }
                return m;
            });
            break;
        case 'SET_TOAST':
            newState.toastMessage = action.payload;
            break;
    }

    // AUTO-SAVE LOGIC
    if (action.type === 'UPDATE_SOUND' || action.type === 'ADD_SOUND' || action.type === 'DELETE_SOUND' || action.type === 'DUPLICATE_SOUND' || action.type === 'REORDER_SOUNDS' || action.type === 'GROUP_SOUNDS' || action.type === 'UNGROUP_SOUNDS' || action.type === 'TOGGLE_MUTE_SOUND_GROUP' || action.type === 'UPDATE_SOUND_GROUP' || action.type === 'MOVE_SOUND_TO_GROUP' || action.type === 'MOVE_SOUND_TO_TOP_LEVEL' || action.type === 'REORDER_TOP_LEVEL_GROUP' || action.type === 'SET_TRACK_NAME' || action.type === 'CREATE_TRACK' || action.type === 'LOAD_TRACK' || action.type === 'LOAD_AND_PLAY_TRACK' || action.type === 'DUPLICATE_TRACK') {
        const existingIdx = newState.savedTracks.findIndex(s => s.id === newState.currentTrackId);
        const updatedTracks = [...newState.savedTracks];
        if (existingIdx >= 0) {
            updatedTracks[existingIdx] = { ...updatedTracks[existingIdx], id: newState.currentTrackId, name: newState.currentTrackName, sounds: newState.sounds, soundGroups: newState.soundGroups };
        } else {
            updatedTracks.push({ id: newState.currentTrackId, name: newState.currentTrackName, sounds: newState.sounds, soundGroups: newState.soundGroups });
        }
        newState.savedTracks = updatedTracks;
    }

    // Update activeGroupSoundIds and activeTrackGroupId
    if (action.type !== 'SWITCH_GROUP_SOUND' && action.type !== 'SWITCH_TRACK_GROUP') {
        if (newState.isPlaying && newState.playbackMode === 'track') {
            const isFreshPlay = !state.isPlaying || state.playbackMode !== 'track' || state.currentTrackId !== newState.currentTrackId;
            const currentTrack = newState.savedTracks.find(t => t.id === newState.currentTrackId) || newState.communityTracks.find(t => t.id === newState.currentTrackId);
            const groupPlayMode = currentTrack?.groupPlayMode ?? 'all';
            newState.activeTrackGroupId = computeActiveTrackGroupId(
                newState.soundGroups,
                groupPlayMode,
                isFreshPlay ? null : (newState.activeTrackGroupId ?? null)
            );
            newState.activeGroupSoundIds = computeActiveGroupSoundIds(
                newState.sounds,
                newState.soundGroups,
                isFreshPlay ? {} : (newState.activeGroupSoundIds || {})
            );
        } else {
            newState.activeGroupSoundIds = {};
            newState.activeTrackGroupId = null;
        }
    }

    return newState;
};

const AppContext = createContext<{ state: AppState; dispatch: React.Dispatch<Action> } | undefined>(undefined);

export const AppProvider = ({ children }: { children: ReactNode }) => {
    const [state, dispatch] = useReducer(appReducer, getInitialState());
    const stateRef = useRef(state);
    stateRef.current = state;
    const prevTrackIdRef = useRef(state.currentTrackId);
    const prevMixIdRef = useRef(state.currentMixId);
    const prevPlaybackModeRef = useRef(state.playbackMode);
    const prevIsPlayingRef = useRef(state.isPlaying);
    const probMutedSoundIdsRef = useRef<Set<string>>(new Set());

    // LocalStorage Syncing
    useEffect(() => { localStorage.setItem('noisemaker_listMode', state.listMode); }, [state.listMode]);
    useEffect(() => { localStorage.setItem('noisemaker_currentTrackId', state.currentTrackId); }, [state.currentTrackId]);
    useEffect(() => { localStorage.setItem('noisemaker_currentTrackName', state.currentTrackName); }, [state.currentTrackName]);
    useEffect(() => { localStorage.setItem('noisemaker_sounds', JSON.stringify(state.sounds)); }, [state.sounds]);
    useEffect(() => { localStorage.setItem('noisemaker_soundGroups', JSON.stringify(state.soundGroups)); }, [state.soundGroups]);
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

    // Global Event Listeners
    useEffect(() => {
        const handleMixRepeat = (e: Event) => {
            const customEvent = e as CustomEvent;
            if (customEvent.detail?.mixId) {
                dispatch({ type: 'REROLL_MIX_WEIGHTS', payload: customEvent.detail.mixId });
            }
        };
        const handleMixEnded = () => dispatch({ type: 'STOP_PLAYBACK' });
        window.addEventListener('mix-repeat', handleMixRepeat);
        window.addEventListener('mix-ended', handleMixEnded);
        return () => {
            window.removeEventListener('mix-repeat', handleMixRepeat);
            window.removeEventListener('mix-ended', handleMixEnded);
        };
    }, []);

    // Audio Manager Syncing
    useEffect(() => {
        if (state.isPlaying) {
            audioManager.resumeContext().then(() => audioManager.initialize()).then(() => {
                const modeChanged = prevPlaybackModeRef.current !== state.playbackMode;

                if (state.playbackMode === 'mix' && state.currentMixId) {

                    if (modeChanged || prevMixIdRef.current !== state.currentMixId) {
                        // Only stop and re-initialize mix when mode or mix actually changed
                        audioManager.stopAll();
                        const mix = state.savedMixes.find(m => m.id === state.currentMixId) 
                                 || state.communityMixes.find(m => m.id === state.currentMixId);
                        if (mix) {
                            mixPlayer.updateMix(mix, [...state.savedTracks, ...state.communityTracks]);
                            if (mixPlayer.pendingSeekItemId) {
                                mixPlayer.seekToItem(mixPlayer.pendingSeekItemId);
                                mixPlayer.pendingSeekItemId = null;
                            }
                            mixPlayer.play();
                        }
                    } else if (!prevIsPlayingRef.current && state.isPlaying) {
                        // Resuming from pause
                        if (mixPlayer.pendingSeekItemId) {
                            mixPlayer.seekToItem(mixPlayer.pendingSeekItemId);
                            mixPlayer.pendingSeekItemId = null;
                        }
                        mixPlayer.play();
                    } else {
                        // Mix is playing and state/settings changed
                        const mix = state.savedMixes.find(m => m.id === state.currentMixId) 
                                 || state.communityMixes.find(m => m.id === state.currentMixId);
                        if (mix) {
                            mixPlayer.updateMix(mix, [...state.savedTracks, ...state.communityTracks]);
                        }
                    }
                } else {
                    // Playing a track
                    if (modeChanged) {
                        mixPlayer.stop();
                    }

                    if (modeChanged || prevTrackIdRef.current !== state.currentTrackId) {
                        audioManager.clearAll();
                    }

                    const currentTrack = state.savedTracks.find(t => t.id === state.currentTrackId) || state.communityTracks.find(t => t.id === state.currentTrackId);
                    const trackGroupPlayMode = currentTrack?.groupPlayMode ?? 'all';
                    audioManager.setTrackTranspose(currentTrack?.transpose ?? 0);
                    audioManager.setTrackSpatialize(currentTrack?.spatialize ?? currentTrack?.stereoWidth ?? 1);
                    audioManager.setTrackGlue(currentTrack?.glue ?? 0);
                    audioManager.setTrackDrift(currentTrack?.drift ?? 0);
                    audioManager.setTrackFog(currentTrack?.fog ?? 0);
                    audioManager.setTrackFripp(currentTrack?.fripp ?? 0);
                    audioManager.setTrackReverb({
                        decay: currentTrack?.reverbDecay ?? 4,
                        preDelay: currentTrack?.reverbPreDelay ?? 0.01,
                        lowCut: currentTrack?.reverbLowCut ?? 20,
                        highCut: currentTrack?.reverbHighCut ?? 20000
                    });

                    const isFreshPlay = !prevIsPlayingRef.current || modeChanged || prevTrackIdRef.current !== state.currentTrackId;

                    if (isFreshPlay) {
                        const newMutes = new Set<string>();
                        state.sounds.forEach(sound => {
                            const prob = sound.probability ?? 1.0;
                            if (prob < 1.0 && (prob <= 0 || Math.random() >= prob)) {
                                newMutes.add(sound.id);
                            }
                        });
                        probMutedSoundIdsRef.current = newMutes;
                    }

                    state.sounds.forEach(sound => {
                        let isGroupMuted = false;
                        let isGroupStandby = false;
                        if (sound.groupId) {
                            const group = (state.soundGroups || []).find(g => g.id === sound.groupId);
                            if (!group || group.isMuted) {
                                isGroupMuted = true;
                            } else if (trackGroupPlayMode !== 'all' && state.activeTrackGroupId && state.activeTrackGroupId !== sound.groupId) {
                                isGroupStandby = true;
                            } else if (group.playMode !== 'all') {
                                const activeId = state.activeGroupSoundIds ? state.activeGroupSoundIds[group.id] : undefined;
                                if (sound.id !== activeId) {
                                    isGroupStandby = true;
                                }
                            }
                        }

                        const prob = sound.probability ?? 1.0;
                        const isProbMuted = prob <= 0 ? true : (prob >= 1.0 ? false : probMutedSoundIdsRef.current.has(sound.id));
                        const effectiveIsMuted = sound.isMuted || isGroupMuted || isProbMuted;
                        const effectiveSound = effectiveIsMuted !== sound.isMuted ? { ...sound, isMuted: effectiveIsMuted } : sound;
                        audioManager.syncSoundState(effectiveSound, true, undefined, isGroupStandby);
                    });
                    audioManager.cleanupEngines(state.sounds.map(s => s.id));

                    // Set up sequence end listeners for active sounds in groups
                    state.sounds.forEach(sound => {
                        audioManager.setOnSequenceEnd(sound.id, null);
                    });

                    if (state.playbackMode === 'track') {
                        const triggerGroupSoundSwitch = (groupId: string) => {
                            const curr = stateRef.current;
                            if (!curr.isPlaying || curr.playbackMode !== 'track') return;
                            const currGroup = (curr.soundGroups || []).find(g => g.id === groupId);
                            if (!currGroup || currGroup.isMuted || currGroup.playMode === 'all') return;
                            const switchProb = currGroup.switchProbability ?? 0;
                            if (switchProb <= 0 || Math.random() >= switchProb) return;

                            const currActiveId = curr.activeGroupSoundIds?.[groupId];
                            const eligible = curr.sounds.filter(s =>
                                s.groupId === groupId && !s.isMuted
                            );
                            if (eligible.length <= 1) return;
                            let nextSound: SoundState;
                            if (currGroup.playMode === 'sequence') {
                                const currentIndex = eligible.findIndex(s => s.id === currActiveId);
                                const nextIndex = currentIndex === -1 ? 0 : (currentIndex + 1) % eligible.length;
                                nextSound = eligible[nextIndex];
                            } else {
                                const otherSounds = eligible.filter(s => s.id !== currActiveId);
                                const candidates = otherSounds.length > 0 ? otherSounds : eligible;
                                nextSound = candidates[Math.floor(Math.random() * candidates.length)];
                            }
                            dispatch({
                                type: 'SWITCH_GROUP_SOUND',
                                payload: { groupId, targetSoundId: nextSound.id }
                            });
                        };

                        const triggerTrackGroupSwitch = (): boolean => {
                            const curr = stateRef.current;
                            if (!curr.isPlaying || curr.playbackMode !== 'track') return false;
                            const currTrack = curr.savedTracks.find(t => t.id === curr.currentTrackId) || curr.communityTracks.find(t => t.id === curr.currentTrackId);
                            const mode = currTrack?.groupPlayMode ?? 'all';
                            if (mode === 'all') return false;
                            const switchProb = currTrack?.groupSwitchProbability ?? 0;
                            if (switchProb <= 0 || Math.random() >= switchProb) return false;

                            const eligibleGroups = (curr.soundGroups || []).filter(g => !g.isMuted);
                            if (eligibleGroups.length <= 1) return false;

                            const currentActiveGroupId = curr.activeTrackGroupId;
                            let nextGroup: SoundGroupState;
                            if (mode === 'sequence') {
                                const currIdx = eligibleGroups.findIndex(g => g.id === currentActiveGroupId);
                                const nextIdx = currIdx === -1 ? 0 : (currIdx + 1) % eligibleGroups.length;
                                nextGroup = eligibleGroups[nextIdx];
                            } else {
                                const otherGroups = eligibleGroups.filter(g => g.id !== currentActiveGroupId);
                                const candidates = otherGroups.length > 0 ? otherGroups : eligibleGroups;
                                nextGroup = candidates[Math.floor(Math.random() * candidates.length)];
                            }

                            dispatch({
                                type: 'SWITCH_TRACK_GROUP',
                                payload: { targetGroupId: nextGroup.id }
                            });
                            return true;
                        };

                        if (trackGroupPlayMode === 'all') {
                            (state.soundGroups || []).forEach(group => {
                                if (group.isMuted || group.playMode === 'all') return;
                                const activeId = state.activeGroupSoundIds?.[group.id];
                                if (!activeId) return;

                                audioManager.setOnSequenceEnd(activeId, () => {
                                    triggerGroupSoundSwitch(group.id);
                                });
                            });
                        } else {
                            const activeGroupId = state.activeTrackGroupId;
                            if (activeGroupId) {
                                const activeGroup = (state.soundGroups || []).find(g => g.id === activeGroupId);
                                if (activeGroup && !activeGroup.isMuted) {
                                    const groupSounds = state.sounds.filter(s => s.groupId === activeGroupId && !s.isMuted);
                                    if (groupSounds.length > 0) {
                                        // Find the sound with the LONGEST sequencer length in this group
                                        let longestSound = groupSounds[0];
                                        for (const s of groupSounds) {
                                            if ((s.seqLengthRate ?? 0) > (longestSound.seqLengthRate ?? 0)) {
                                                longestSound = s;
                                            }
                                        }

                                        if (activeGroup.playMode === 'all') {
                                            audioManager.setOnSequenceEnd(longestSound.id, () => {
                                                triggerTrackGroupSwitch();
                                            });
                                        } else {
                                            const activeSoundId = state.activeGroupSoundIds?.[activeGroupId];
                                            const triggerSoundId = activeSoundId || longestSound.id;
                                            audioManager.setOnSequenceEnd(triggerSoundId, () => {
                                                const didSwitchTrackGroup = triggerTrackGroupSwitch();
                                                if (!didSwitchTrackGroup) {
                                                    triggerGroupSoundSwitch(activeGroupId);
                                                }
                                            });
                                        }
                                    }
                                }
                            }
                        }
                    }
                }

                // Update refs for next check
                prevPlaybackModeRef.current = state.playbackMode;
                prevMixIdRef.current = state.currentMixId;
                prevTrackIdRef.current = state.currentTrackId;
                prevIsPlayingRef.current = state.isPlaying;
            });
        } else {
            state.sounds.forEach(sound => {
                audioManager.setOnSequenceEnd(sound.id, null);
            });
            audioManager.stopAll();
            mixPlayer.pause();
            prevIsPlayingRef.current = false;
            probMutedSoundIdsRef.current.clear();
        }
    }, [state.isPlaying, state.playbackMode, state.currentTrackId, state.currentMixId, state.sounds, state.soundGroups, state.activeGroupSoundIds, state.activeTrackGroupId, state.savedTracks, state.savedMixes, state.communityTracks, state.communityMixes]);

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
