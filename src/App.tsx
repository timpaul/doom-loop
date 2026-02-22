import { useRef, useCallback, useEffect } from 'react'
import './App.css'
import { useAppState } from './state/AppContext'
import { audioManager } from './audio/AudioManager'
import type { SoundState, SceneState } from './types'
import type { NoiseColor } from './audio/AudioEngine'

const PlayIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
)

const PauseIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" /></svg>
)

const TrashIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"></path><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"></path><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
)

const HamburgerIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="18" x2="21" y2="18"></line></svg>
)

function SoundPanel({ sound }: { sound: SoundState }) {
  const { state, dispatch } = useAppState();
  const isExpanded = state.expandedId === sound.id;

  const noiseColors: NoiseColor[] = ['white', 'pink', 'blue', 'brown', 'green', 'purple'];
  const pitchTypes = ['Low', 'Mid', 'High'] as const;

  const update = (updates: Partial<SoundState>) => dispatch({ type: 'UPDATE_SOUND', payload: { id: sound.id, updates } });
  const onDelete = () => dispatch({ type: 'DELETE_SOUND', payload: sound.id });
  const onToggleExpand = () => dispatch({ type: 'TOGGLE_EXPAND', payload: sound.id });

  return (
    <div className={`noise-panel ${isExpanded ? 'expanded' : 'collapsed'}`}>
      <div className="noise-header">
        <button className="icon-btn hamburger-btn" onClick={onToggleExpand} aria-label="Toggle Panel">
          <HamburgerIcon />
        </button>
        <input
          type="text"
          className="noise-name-input"
          value={sound.name}
          onChange={(e) => update({ name: e.target.value })}
          aria-label="Sound Name"
        />
        <button className="icon-btn delete-btn" onClick={onDelete} aria-label="Delete Sound">
          <TrashIcon />
        </button>
      </div>

      {isExpanded && (
        <div className="noise-controls">

          <section className="panel-group">
            <h2 className="panel-title">TYPE</h2>
            <div className="segmented-control" role="group" aria-label="Select Source Type">
              <button
                className={`segment-btn ${sound.sourceType === 'noise' ? 'active' : ''}`}
                onClick={() => update({ sourceType: 'noise' })}
              >
                Noise
              </button>
              <button
                className={`segment-btn ${sound.sourceType === 'tone' ? 'active' : ''}`}
                onClick={() => update({ sourceType: 'tone' })}
              >
                Tone
              </button>
            </div>
          </section>

          {sound.sourceType === 'noise' ? (
            <section className="panel-group">
              <h2 className="panel-title">NOISE</h2>
              <div className="colour-picker-grid" role="group" aria-label="Select noise color">
                {noiseColors.map(c => (
                  <button
                    key={c}
                    className={`color-btn ${sound.noiseColor === c ? 'active' : ''}`}
                    onClick={() => update({ noiseColor: c })}
                    aria-pressed={sound.noiseColor === c}
                    aria-label={c}
                  >
                    {c.charAt(0).toUpperCase() + c.slice(1)}
                  </button>
                ))}
              </div>
            </section>
          ) : (
            <section className="panel-group">
              <h2 className="panel-title">TONE</h2>
              <div className="segmented-control" role="group" aria-label="Select Tone Mode">
                <button
                  className={`segment-btn ${sound.toneMode === 'note' ? 'active' : ''}`}
                  onClick={() => update({ toneMode: 'note' })}
                >
                  Note
                </button>
                <button
                  className={`segment-btn ${sound.toneMode === 'chord' ? 'active' : ''}`}
                  onClick={() => update({ toneMode: 'chord' })}
                >
                  Chord
                </button>
              </div>
              <div className="colour-picker-grid" style={{ marginTop: '12px' }} role="group" aria-label="Select tone pitch">
                {pitchTypes.map(p => (
                  <button
                    key={p}
                    className={`color-btn ${sound.tonePitch === p ? 'active' : ''}`}
                    onClick={() => update({ tonePitch: p })}
                    aria-pressed={sound.tonePitch === p}
                    aria-label={p}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </section>
          )}

          <section className="panel-group">
            <h2 className="panel-title">MIX</h2>
            <div className="control-row">
              <span className="control-label">Volume</span>
              <div className="slider-wrapper">
                <input type="range" min="0" max="1" step="0.01" value={sound.volume} onChange={e => update({ volume: parseFloat(e.target.value) })} aria-label="Volume" />
              </div>
            </div>
            <div className="control-row">
              <span className="control-label">Pan</span>
              <div className="slider-wrapper">
                <input type="range" min="-1" max="1" step="0.01" value={sound.pan} onChange={e => update({ pan: parseFloat(e.target.value) })} aria-label="Pan" />
              </div>
            </div>
          </section>

          <section className="panel-group">
            <h2 className="panel-title">FILTER</h2>
            <div className="control-row">
              <span className="control-label">Frequency</span>
              <div className="slider-wrapper">
                <input type="range" min="100" max="10000" step="10" value={sound.filterFreq} onChange={e => update({ filterFreq: parseFloat(e.target.value) })} aria-label="Filter Frequency" />
              </div>
            </div>
            <div className="control-row">
              <span className="control-label">Sharpness</span>
              <div className="slider-wrapper">
                <input type="range" min="0.1" max="10" step="0.1" value={sound.filterQ} onChange={e => update({ filterQ: parseFloat(e.target.value) })} aria-label="Filter Sharpness" />
              </div>
            </div>
          </section>

          <section className="panel-group">
            <h2 className="panel-title">LFO</h2>
            <div className="control-row">
              <span className="control-label">Intensity</span>
              <div className="slider-wrapper">
                <input type="range" min="0" max="1" step="0.01" value={sound.intensity} onChange={e => update({ intensity: parseFloat(e.target.value) })} aria-label="LFO Intensity" />
              </div>
            </div>
            <div className="control-row">
              <span className="control-label">Duration</span>
              <div className="slider-wrapper">
                <input type="range" min="0.01" max="10" step="0.01" value={sound.duration} onChange={e => update({ duration: parseFloat(e.target.value) })} aria-label="LFO Duration" />
              </div>
            </div>
          </section>

          <section className="panel-group">
            <h2 className="panel-title">EFFECTS</h2>
            <div className="control-row">
              <span className="control-label">Reverb</span>
              <div className="slider-wrapper">
                <input type="range" min="0" max="1" step="0.01" value={sound.reverbAmount} onChange={e => update({ reverbAmount: parseFloat(e.target.value) })} aria-label="Reverb" />
              </div>
            </div>
            <div className="control-row">
              <span className="control-label">Delay</span>
              <div className="slider-wrapper">
                <input type="range" min="0" max="1" step="0.01" value={sound.delayAmount} onChange={e => update({ delayAmount: parseFloat(e.target.value) })} aria-label="Delay" />
              </div>
            </div>
            <div className="control-row">
              <span className="control-label">Chorus</span>
              <div className="slider-wrapper">
                <input type="range" min="0" max="1" step="0.01" value={sound.chorusAmount} onChange={e => update({ chorusAmount: parseFloat(e.target.value) })} aria-label="Chorus" />
              </div>
            </div>
          </section>
        </div>
      )}
    </div>
  )
}

function App() {
  const { state, dispatch } = useAppState();
  const audioRef = useRef<HTMLAudioElement>(null)
  const initialized = useRef(false)

  const togglePlay = useCallback(async () => {
    if (!initialized.current) {
      await audioManager.initialize();
      initialized.current = true;
      if (audioRef.current && !audioRef.current.srcObject) {
        audioRef.current.srcObject = audioManager.getSharedStream();
      }
    }

    if (state.isPlaying) {
      if (audioRef.current) audioRef.current.pause()
    } else {
      if (audioRef.current) {
        audioRef.current.play().catch(e => console.log('Background audio play failed:', e))
      }
    }
    dispatch({ type: 'TOGGLE_PLAY' });
  }, [state.isPlaying, dispatch])

  useEffect(() => {
    if ('mediaSession' in navigator) {
      navigator.mediaSession.setActionHandler('play', () => { if (!state.isPlaying) togglePlay() });
      navigator.mediaSession.setActionHandler('pause', () => { if (state.isPlaying) togglePlay() });
      if (state.isPlaying) {
        navigator.mediaSession.metadata = new MediaMetadata({
          title: 'Playing Sounds',
          artist: 'Noisemaker',
          album: 'Focus & Tinnitus Relief',
          artwork: [
            { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
            { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' }
          ]
        });
      }
    }
  }, [state.isPlaying, togglePlay]);

  const addSound = () => {
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
  }

  if (state.currentScreen === 'load') {
    return (
      <div className="app-container load-screen">
        <img src="/doom-logo.png" alt="Doom Loop Logo" className="doom-logo-img" style={{ margin: '20px auto 10px auto' }} />
        <main className="main-content">
          <div className="scene-list">
            {state.savedScenes.length === 0 ? (
              <p className="empty-state">No saved scenes yet.</p>
            ) : (
              state.savedScenes.map(scene => (
                <div key={scene.id} className="scene-list-item" onClick={() => loadScene(scene)}>
                  <span className="scene-item-name">{scene.name}</span>
                  <button className="icon-btn delete-btn" onClick={(e) => removeSavedScene(e, scene.id)}>
                    <TrashIcon />
                  </button>
                </div>
              ))
            )}
          </div>
          <div className="create-scene-container">
            <button className="create-scene-btn" onClick={handleCreateNewScene}>Create new scene</button>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="app-container">
      <div className="top-play-area">
        <button
          className="scenes-nav-btn"
          onClick={() => dispatch({ type: 'SET_SCREEN', payload: 'load' })}
          aria-label="Back to Scenes"
        >
          <img src="/grid-icon.png" alt="Back to scenes" className="grid-icon-img" />
        </button>
        <button
          className="play-button"
          onClick={togglePlay}
          aria-label={state.isPlaying ? "Pause" : "Play"}
        >
          {state.isPlaying ? <PauseIcon /> : <PlayIcon />}
        </button>
      </div>

      <header className="scene-header">
        <input
          type="text"
          className="scene-name-input"
          value={state.currentSceneName}
          onChange={(e) => dispatch({ type: 'SET_SCENE_NAME', payload: e.target.value })}
          aria-label="Scene Name"
          placeholder="Name your scene..."
        />
      </header>

      <main className="main-content">
        {state.sounds.map(sound => (
          <SoundPanel
            key={sound.id}
            sound={sound}
          />
        ))}

        <div className="add-noise-container">
          <button className="add-noise-btn" onClick={addSound}>Add a sound</button>
        </div>
      </main>

      <audio ref={audioRef} preload="none" playsInline />
    </div>
  )
}

export default App
