import fs from 'fs';

const content = fs.readFileSync('src/App.tsx', 'utf-8');

// 1. imports and interfaces
let updated = content.replace(/import { useState, useEffect, useRef, useCallback } from 'react'[\s\S]*?(?=const PlayIcon)/, 
`import { useRef, useCallback, useEffect } from 'react'
import './App.css'
import { useAppState } from './state/AppContext'
import { audioManager } from './audio/AudioManager'
import type { SoundState, SceneState, NoiseColor } from './types'

`);

// 2. SoundPanel interface and logic
updated = updated.replace(/function SoundPanel\(\{[\s\S]*?className="noise-header">/,
`function SoundPanel({ sound }: { sound: SoundState }) {
  const { state, dispatch } = useAppState();
  const isExpanded = state.expandedId === sound.id;
  
  const noiseColors: NoiseColor[] = ['white', 'pink', 'blue', 'brown', 'green', 'purple'];
  const pitchTypes = ['Low', 'Mid', 'High'] as const;

  const update = (updates: Partial<SoundState>) => dispatch({ type: 'UPDATE_SOUND', payload: { id: sound.id, updates } });
  const onDelete = () => dispatch({ type: 'DELETE_SOUND', payload: sound.id });
  const onToggleExpand = () => dispatch({ type: 'TOGGLE_EXPAND', payload: sound.id });

  return (
    <div className={\`noise-panel \${isExpanded ? 'expanded' : 'collapsed'}\`}>
      <div className="noise-header">`
);

// Fix inner update inside SoundPanel
updated = updated.replace(/onChange=\{\(e\) => update\(\{ name: e.target.value \}\)\}/, `onChange={(e) => update({ name: e.target.value })}`);
updated = updated.replace(/onClick=\{\(\) => onDelete\(sound.id\)\}/, `onClick={onDelete}`);

// 3. App component logic
updated = updated.replace(/function App\(\) \{[\s\S]*?const audioRef = useRef<HTMLAudioElement>\(null\)/,
`function App() {
  const { state, dispatch } = useAppState();
  const audioRef = useRef<HTMLAudioElement>(null)
  const initialized = useRef(false)`);

updated = updated.replace(/await initializeSharedAudio\(\);/, `await audioManager.initialize();`);
updated = updated.replace(/getSharedStream\(\)/, `audioManager.getSharedStream()`);

// handle state.isPlaying replacements inside togglePlay specifically. The togglePlay logic uses isPlaying from local scope currently.
updated = updated.replace(/if \(isPlaying\) \{[\s\S]*?setIsPlaying\(false\)[\s\S]*?if \(audioRef.current\) audioRef.current.pause\(\)[\s\S]*?\} else \{[\s\S]*?setIsPlaying\(true\)[\s\S]*?if \(audioRef.current\) \{[\s\S]*?audioRef.current.play\(\).catch\(e => console.log\('Background audio play failed:', e\)\)[\s\S]*?\}[\s\S]*?\}/,
`if (state.isPlaying) {
      if (audioRef.current) audioRef.current.pause()
    } else {
      if (audioRef.current) {
        audioRef.current.play().catch(e => console.log('Background audio play failed:', e))
      }
    }
    dispatch({ type: 'TOGGLE_PLAY' });`);

updated = updated.replace(/setIsPlaying\(false\)/g, "");
updated = updated.replace(/setIsPlaying\(true\)/g, "");
updated = updated.replace(/isPlaying/g, "state.isPlaying");
updated = updated.replace(/state\.state\.isPlaying/g, "state.isPlaying"); // correct double replacement issue

// Action Handlers
updated = updated.replace(/const addSound = \(\) => \{[\s\S]*?const toggleExpand = \(id: string\) => \{(\s|.)*?\n  \}/,
`const addSound = () => {
    dispatch({ type: 'ADD_SOUND' });
  }

  const loadScene = (scene: SceneState) => {
    dispatch({ type: 'LOAD_SCENE', payload: scene });
  }

  const removeSavedScene = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    dispatch({ type: 'DELETE_SCENE', payload: id });
  }

  const handleCreateNewScene = () => {
    dispatch({ type: 'CREATE_SCENE' });
  }`);

// handle old loadScene logic that is farther down
updated = updated.replace(/const loadScene = \(scene: SceneState\) => \{[\s\S]*?const handleCreateNewScene = \(\) => \{[\s\S]*?  \}/, "");

// currentScreen -> state.currentScreen
updated = updated.replace(/if \(currentScreen === 'load'\) \{/g, `if (state.currentScreen === 'load') {`);
updated = updated.replace(/setCurrentScreen\('main'\)/g, `dispatch({ type: 'SET_SCREEN', payload: 'main' })`);
updated = updated.replace(/setCurrentScreen\('load'\)/g, `dispatch({ type: 'SET_SCREEN', payload: 'load' })`);
updated = updated.replace(/savedScenes\.length === 0/g, `state.savedScenes.length === 0`);
updated = updated.replace(/savedScenes\.map/g, `state.savedScenes.map`);
updated = updated.replace(/setCurrentSceneName\(e\.target\.value\)/g, `dispatch({ type: 'SET_SCENE_NAME', payload: e.target.value })`);
updated = updated.replace(/value=\{currentSceneName\}/g, `value={state.currentSceneName}`);
updated = updated.replace(/sounds\.map/g, `state.sounds.map`);
// Inside the main render map:
updated = updated.replace(/<SoundPanel\n            key=\{sound\.id\}\n            sound=\{sound\}\n            isExpanded=\{expandedId === sound\.id\}\n            state\.isPlaying=\{state\.isPlaying\}\n            onUpdate=\{updateSound\}\n            onDelete=\{deleteSound\}\n            onToggleExpand=\{\(\) => toggleExpand\(sound\.id\)\}\n          \/>/g, 
`<SoundPanel key={sound.id} sound={sound} />`);


fs.writeFileSync('src/App.tsx', updated);
