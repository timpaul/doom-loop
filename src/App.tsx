import { useState, useEffect, useRef, useCallback } from 'react'
import './App.css'
import { AudioEngine, initializeSharedAudio, getSharedStream } from './audio/AudioEngine'
import type { SoundType, NoiseColor } from './audio/AudioEngine'
export const COLOR_MAP: Record<NoiseColor, string> = {
  white: '#ffffff',
  pink: '#ffb6c1',
  brown: '#b8621b',
  blue: '#3b82f6',
  green: '#5cb85c',
  purple: '#673ab7'
};

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

const DEFAULT_SOUND: Omit<SoundState, 'id' | 'name'> = {
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

function SoundPanel({
  sound,
  isExpanded,
  isPlaying,
  onUpdate,
  onDelete,
  onToggleExpand
}: {
  sound: SoundState;
  isExpanded: boolean;
  isPlaying: boolean;
  onUpdate: (id: string, updates: Partial<SoundState>) => void;
  onDelete: (id: string) => void;
  onToggleExpand: () => void;
}) {
  const engineRef = useRef<AudioEngine | null>(null);

  useEffect(() => {
    let mounted = true;
    const initEngine = async () => {
      const engine = new AudioEngine();
      await engine.initialize();
      if (!mounted) return;
      engineRef.current = engine;
      engine.setVolume(sound.volume);
      engine.setPan(sound.pan);
      engine.setFilter(sound.filterFreq, sound.filterQ);
      engine.setLFO(sound.intensity > 0 ? sound.duration : 0, sound.intensity);
      engine.setReverb(sound.reverbAmount);
      engine.setDelay(sound.delayAmount);
      engine.setChorus(sound.chorusAmount);
      if (isPlaying) {
        engine.play(sound.sourceType, sound.sourceType === 'noise' ? sound.noiseColor : `${sound.tonePitch} ${sound.toneMode}`);
      }
    };
    initEngine();
    return () => {
      mounted = false;
      if (engineRef.current) engineRef.current.stop();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Apply updates to the engine
  useEffect(() => {
    if (engineRef.current) {
      engineRef.current.setVolume(sound.volume);
      engineRef.current.setPan(sound.pan);
      engineRef.current.setFilter(sound.filterFreq, sound.filterQ);
      engineRef.current.setLFO(sound.intensity > 0 ? sound.duration : 0, sound.intensity);
      engineRef.current.setReverb(sound.reverbAmount);
      engineRef.current.setDelay(sound.delayAmount);
      engineRef.current.setChorus(sound.chorusAmount);
    }
  }, [sound.volume, sound.pan, sound.filterFreq, sound.filterQ, sound.intensity, sound.duration, sound.reverbAmount, sound.delayAmount, sound.chorusAmount]);

  useEffect(() => {
    if (engineRef.current) {
      if (isPlaying) {
        engineRef.current.play(sound.sourceType, sound.sourceType === 'noise' ? sound.noiseColor : `${sound.tonePitch} ${sound.toneMode}`);
      } else {
        // Just stop playback, don't destroy engine
        engineRef.current.stop();
      }
    }
  }, [isPlaying, sound.sourceType, sound.noiseColor, sound.toneMode, sound.tonePitch]);

  const noiseColors: NoiseColor[] = ['white', 'pink', 'blue', 'brown', 'green', 'purple'];
  const pitchTypes = ['Low', 'Mid', 'High'] as const;

  const update = (updates: Partial<SoundState>) => onUpdate(sound.id, updates);

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
        <button className="icon-btn delete-btn" onClick={() => onDelete(sound.id)} aria-label="Delete Sound">
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
  const [isPlaying, setIsPlaying] = useState(false)

  const [sounds, setSounds] = useState<SoundState[]>(() => {
    const saved = localStorage.getItem('noisemaker_sounds')
    if (saved) {
      try { return JSON.parse(saved) } catch (e) { console.error(e) }
    }
    return [{ id: '1', name: 'Sound 1', ...DEFAULT_SOUND }]
  })

  const [expandedId, setExpandedId] = useState<string>(() => {
    const saved = localStorage.getItem('noisemaker_expandedId')
    return saved !== null ? saved : '1'
  })

  const [nextId, setNextId] = useState(() => {
    const saved = localStorage.getItem('noisemaker_nextId')
    if (saved) {
      try { return parseInt(saved, 10) } catch (e) { console.error(e) }
    }
    return 2
  })

  useEffect(() => {
    localStorage.setItem('noisemaker_sounds', JSON.stringify(sounds))
  }, [sounds])

  useEffect(() => {
    localStorage.setItem('noisemaker_expandedId', expandedId)
  }, [expandedId])

  useEffect(() => {
    localStorage.setItem('noisemaker_nextId', nextId.toString())
  }, [nextId])

  const audioRef = useRef<HTMLAudioElement>(null)
  const initialized = useRef(false)

  const togglePlay = useCallback(async () => {
    if (!initialized.current) {
      await initializeSharedAudio();
      initialized.current = true;
      if (audioRef.current && !audioRef.current.srcObject) {
        audioRef.current.srcObject = getSharedStream();
      }
    }

    if (isPlaying) {
      setIsPlaying(false)
      if (audioRef.current) audioRef.current.pause()
    } else {
      setIsPlaying(true)
      if (audioRef.current) {
        audioRef.current.play().catch(e => console.log('Background audio play failed:', e))
      }
    }
  }, [isPlaying])

  useEffect(() => {
    if ('mediaSession' in navigator) {
      navigator.mediaSession.setActionHandler('play', () => { if (!isPlaying) togglePlay() });
      navigator.mediaSession.setActionHandler('pause', () => { if (isPlaying) togglePlay() });
      if (isPlaying) {
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
  }, [isPlaying, togglePlay]);

  const addSound = () => {
    const id = nextId.toString()
    setNextId(prev => prev + 1)
    setSounds(prev => [...prev, { id, name: `Sound ${id}`, ...DEFAULT_SOUND }])
    setExpandedId(id)
  }

  const updateSound = (id: string, updates: Partial<SoundState>) => {
    setSounds(prev => prev.map(n => n.id === id ? { ...n, ...updates } : n))
  }

  const deleteSound = (id: string) => {
    setSounds(prev => prev.filter(n => n.id !== id))
  }

  const toggleExpand = (id: string) => {
    setExpandedId(prev => prev === id ? '' : id)
  }

  return (
    <div className="app-container">
      <div className="top-play-area">
        <button
          className="play-button"
          onClick={togglePlay}
          aria-label={isPlaying ? "Pause" : "Play"}
        >
          {isPlaying ? <PauseIcon /> : <PlayIcon />}
        </button>
      </div>

      <header>
        {/* H1 was moved, we can keep it inside header or simply omit if the mockup just shows Sound 1 */}
        {/* However mockup actually doesn't say "NOISEMAKER", wait, wait. The previous mock had NOISEMAKER at the top. Let's keep it if we want. Actually the new mockup just has the Play Button. Let's look at the mockup: There is no NOISEMAKER title visible. I'll remove it. */}
      </header>

      <main className="main-content">
        {sounds.map(sound => (
          <SoundPanel
            key={sound.id}
            sound={sound}
            isExpanded={expandedId === sound.id}
            isPlaying={isPlaying}
            onUpdate={updateSound}
            onDelete={deleteSound}
            onToggleExpand={() => toggleExpand(sound.id)}
          />
        ))}

        <div className="add-noise-container">
          <button className="add-noise-btn" onClick={addSound}>Add a sound</button>
        </div>
      </main>

      <img src="/doom-logo.png" alt="Doom Loop Logo" className="doom-logo-img" />

      <audio ref={audioRef} preload="none" playsInline />
    </div>
  )
}

export default App
