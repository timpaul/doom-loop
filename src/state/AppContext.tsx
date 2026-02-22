import React, { createContext, useContext, useReducer, useEffect } from 'react';
import type { ReactNode } from 'react';
import { DEFAULT_SOUND } from '../types';
import type { SoundState, SceneState } from '../types';
import { audioManager } from '../audio/AudioManager';

export interface AppState {
    isPlaying: boolean;
    currentScreen: 'main' | 'load';
    currentSceneId: string;
    currentSceneName: string;
    savedScenes: SceneState[];
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
    | { type: 'SET_SCENE_NAME'; payload: string }
    | { type: 'LOAD_SCENE'; payload: SceneState }
    | { type: 'CREATE_SCENE' }
    | { type: 'DELETE_SCENE'; payload: string }
    | { type: 'SET_TOAST'; payload: string | null };

const getInitialState = (): AppState => {
    const parseJSON = (key: string, backup: any) => {
        try {
            const val = localStorage.getItem(key);
            return val ? JSON.parse(val) : backup;
        } catch { return backup; }
    };

    const savedScenes = parseJSON('noisemaker_scenes', [
        { id: 'scene-1', name: 'Scene 1', sounds: [{ id: '1', name: 'Sound 1', ...DEFAULT_SOUND }] }
    ]);

    return {
        isPlaying: false,
        currentScreen: 'load',
        currentSceneId: localStorage.getItem('noisemaker_currentSceneId') || 'scene-1',
        currentSceneName: localStorage.getItem('noisemaker_currentSceneName') || 'Scene 1',
        savedScenes,
        sounds: parseJSON('noisemaker_sounds', [{ id: '1', name: 'Sound 1', ...DEFAULT_SOUND }]),
        toastMessage: null,
        expandedId: localStorage.getItem('noisemaker_expandedId') || '1',
        nextId: parseJSON('noisemaker_nextId', 2)
    };
};

const appReducer = (state: AppState, action: Action): AppState => {
    let newState = { ...state };
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
        case 'SET_SCENE_NAME':
            newState.currentSceneName = action.payload;
            break;
        case 'LOAD_SCENE':
            // Only stop playback if loading a fundamentally different scene
            if (state.currentSceneId !== action.payload.id) {
                newState.isPlaying = false;
            }
            newState.currentSceneId = action.payload.id;
            newState.currentSceneName = action.payload.name;
            newState.sounds = action.payload.sounds;
            newState.currentScreen = 'main';
            newState.expandedId = action.payload.sounds.length > 0 ? action.payload.sounds[0].id : '';
            break;
        case 'CREATE_SCENE': {
            const newId = `scene-${Date.now()}`;
            const newName = `Scene ${state.savedScenes.length + 1}`;
            const initialSound = { id: '1', name: 'Sound 1', ...DEFAULT_SOUND };
            newState.currentSceneId = newId;
            newState.currentSceneName = newName;
            newState.sounds = [initialSound];
            newState.expandedId = '1';
            newState.currentScreen = 'main';
            newState.isPlaying = false;
            break;
        }
        case 'DELETE_SCENE':
            newState.savedScenes = state.savedScenes.filter(s => s.id !== action.payload);
            break;
        case 'SET_TOAST':
            newState.toastMessage = action.payload;
            break;
    }

    // AUTO-SAVE LOGIC
    if (action.type === 'UPDATE_SOUND' || action.type === 'ADD_SOUND' || action.type === 'DELETE_SOUND' || action.type === 'SET_SCENE_NAME' || action.type === 'CREATE_SCENE' || action.type === 'LOAD_SCENE') {
        const existingIdx = newState.savedScenes.findIndex(s => s.id === newState.currentSceneId);
        const updatedScenes = [...newState.savedScenes];
        if (existingIdx >= 0) {
            updatedScenes[existingIdx] = { id: newState.currentSceneId, name: newState.currentSceneName, sounds: newState.sounds };
        } else {
            updatedScenes.push({ id: newState.currentSceneId, name: newState.currentSceneName, sounds: newState.sounds });
        }
        newState.savedScenes = updatedScenes;
    }
    return newState;
};

const AppContext = createContext<{ state: AppState; dispatch: React.Dispatch<Action> } | undefined>(undefined);

export const AppProvider = ({ children }: { children: ReactNode }) => {
    const [state, dispatch] = useReducer(appReducer, getInitialState());

    // LocalStorage Syncing
    useEffect(() => { localStorage.setItem('noisemaker_currentSceneId', state.currentSceneId); }, [state.currentSceneId]);
    useEffect(() => { localStorage.setItem('noisemaker_currentSceneName', state.currentSceneName); }, [state.currentSceneName]);
    useEffect(() => { localStorage.setItem('noisemaker_sounds', JSON.stringify(state.sounds)); }, [state.sounds]);
    useEffect(() => { localStorage.setItem('noisemaker_expandedId', state.expandedId); }, [state.expandedId]);
    useEffect(() => { localStorage.setItem('noisemaker_nextId', state.nextId.toString()); }, [state.nextId]);
    useEffect(() => { localStorage.setItem('noisemaker_scenes', JSON.stringify(state.savedScenes)); }, [state.savedScenes]);

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

export const useAppState = () => {
    const context = useContext(AppContext);
    if (context === undefined) {
        throw new Error('useAppState must be used within an AppProvider');
    }
    return context;
};
