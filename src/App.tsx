import { useState, useRef, useEffect, useCallback } from 'react'
import { Routes, Route, Navigate, useNavigate, useParams, useLocation } from 'react-router-dom';
import ReactMarkdown from 'react-markdown'
import { Chord, Note } from '@tonaljs/tonal'
import './App.css'
import { useAppState } from './state/AppContext'
import { audioManager } from './audio/AudioManager'
import { mixPlayer } from './audio/MixPlayer'
import type { SoundState, TrackState, LFOScale, LFOType, MixState } from './types'
import type { NoiseColor, OscillatorType } from './audio/AudioEngine'
import { aboutMarkdown } from './AboutContent'

const PlayIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
)

const PauseIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" /></svg>
)

const TrashIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 6h18" />
    <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
    <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
    <line x1="10" y1="11" x2="10" y2="17" />
    <line x1="14" y1="11" x2="14" y2="17" />
  </svg>
)

const DuplicateIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    <line x1="12" y1="15" x2="18" y2="15" />
    <line x1="15" y1="12" x2="15" y2="18" />
  </svg>
)

const ExportIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 4v12" />
    <path d="M16 8l-4-4-4 4" />
    <path d="M4 16v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4" />
  </svg>
)

const ChevronRightIcon = ({ isExpanded }: { isExpanded?: boolean }) => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.2s ease' }}>
    <polyline points="9 18 15 12 9 6"></polyline>
  </svg>
)

const myKeys = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'G#', 'A', 'Bb', 'B'];

function SoundPanel({ sound }: { sound: SoundState }) {
  const { state, dispatch } = useAppState();
  const isExpanded = state.expandedId === sound.id;

  const [chordInput, setChordInput] = useState('');
  const [selectedStep, setSelectedStep] = useState(0);
  const [collapsedPanels, setCollapsedPanels] = useState<Record<string, boolean>>({
    'SEQUENCER': false,
    'ENVELOPE': false,
    'VOLUME_LFO': true,
    'PAN_LFO': true,
    'FILTER_LFO': true,
    'PITCH': false
  });

  const togglePanel = (panelName: string) => {
    setCollapsedPanels(prev => ({ ...prev, [panelName]: !prev[panelName] }));
  };

  const noiseColors: NoiseColor[] = ['white', 'pink', 'blue', 'brown', 'green', 'purple'];

  const update = (updates: Partial<SoundState>) => dispatch({ type: 'UPDATE_SOUND', payload: { id: sound.id, updates } });
  const onDelete = () => dispatch({ type: 'DELETE_SOUND', payload: sound.id });
  const onToggleExpand = () => dispatch({ type: 'TOGGLE_EXPAND', payload: sound.id });

  // Update input text when external notes sequence changes (bi-directional sync)
  useEffect(() => {
    const currentConfig = sound.stepConfigs ? sound.stepConfigs[selectedStep] : null;
    const notes = currentConfig?.activeNotes;

    if (sound.sourceType === 'tone' && notes && notes.length > 0) {
      const detected = Chord.detect(notes);
      if (detected.length > 0) {
        // Tonal returns multiple options, pick the primary one
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setChordInput(detected[0]);
      } else {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setChordInput('');
      }
    } else {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setChordInput('');
    }
  }, [sound.stepConfigs, selectedStep, sound.sourceType]);

  const handleChordCommit = () => {
    if (!chordInput.trim() || !sound.stepConfigs) return;

    const updateStepNotes = (newNotes: string[]) => {
      const newConfigs = [...sound.stepConfigs];
      newConfigs[selectedStep] = { ...newConfigs[selectedStep], activeNotes: newNotes };
      update({ stepConfigs: newConfigs });
    }

    // Parse the input via Tonal
    const c = Chord.get(chordInput);
    if (!c.empty) {
      // Valid chord, map tonal's potentially weird accidentals (like F##) back to our explicit key array
      const mappedNotes = c.notes.map(n => {
        const pc = Note.pitchClass(n);
        const midi = Note.midi(pc + '4')! % 12;
        return myKeys[midi];
      });
      // De-duplicate in case of weird mappings
      const uniqueNotes = Array.from(new Set(mappedNotes));
      updateStepNotes(uniqueNotes);
    } else {
      // Invalid chord text, revert to whatever the active notes currently yield
      const currentConfig = sound.stepConfigs[selectedStep];
      const detected = Chord.detect(currentConfig.activeNotes || []);
      setChordInput(detected.length > 0 ? detected[0] : '');
    }
  };

  // --- Filter Logarithmic Slider Math ---
  const filterMinFreq = 10;
  const filterMaxFreq = sound.sourceType === 'noise' ? 10000 : ((sound.octave ?? 3) * 500) + 1000;
  const filterMinLog = Math.log10(filterMinFreq);
  const filterMaxLog = Math.log10(filterMaxFreq);
  const filterClampedFreq = Math.max(filterMinFreq, Math.min(sound.autoFilterBaseFreq || 8000, filterMaxFreq));

  // Calculate value (0-100) for the input slider
  const filterSliderVal = ((Math.log10(filterClampedFreq) - filterMinLog) / (filterMaxLog - filterMinLog)) * 100;

  const handleFilterBaseFreqChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const sliderPercent = parseFloat(e.target.value) / 100;
    const newLog = filterMinLog + (sliderPercent * (filterMaxLog - filterMinLog));
    const newFreq = Math.pow(10, newLog);
    update({ autoFilterBaseFreq: newFreq });
  };

  return (
    <div className={`noise-panel ${isExpanded ? 'expanded' : 'collapsed'}`}>
      <div className="noise-header">
        <button className="icon-btn expand-btn" onClick={onToggleExpand} aria-label="Toggle Panel">
          <ChevronRightIcon isExpanded={isExpanded} />
        </button>
        <input
          type="text"
          className="noise-name-input"
          value={sound.name}
          onChange={(e) => update({ name: e.target.value })}
          aria-label="Sound Name"
        />
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div className="noise-header-actions">
            <button className="icon-btn" data-tooltip="Duplicate" onClick={() => dispatch({ type: 'DUPLICATE_SOUND', payload: sound.id })} aria-label="Duplicate Sound">
              <DuplicateIcon />
            </button>
            <button className="icon-btn delete-btn" data-tooltip="Remove" onClick={onDelete} aria-label="Delete Sound">
              <TrashIcon />
            </button>
          </div>
          <button
            className={`mute-toggle-btn ${!sound.isMuted ? 'active' : ''}`}
            onClick={() => update({ isMuted: !sound.isMuted })}
            aria-label={sound.isMuted ? "Unmute Sound" : "Mute Sound"}
          />
        </div>
      </div>

      {isExpanded && (
        <div className="noise-controls">

          <section className={`panel-group ${collapsedPanels['TYPE'] ? 'collapsed' : ''}`}>
            <h2 className="panel-title" onClick={() => togglePanel('TYPE')}>TYPE</h2>
            {!collapsedPanels['TYPE'] && (
              <div className="colour-picker-grid" role="group" aria-label="Select Source Type">
                <button
                  className={`color-btn ${sound.sourceType === 'noise' ? 'active' : ''}`}
                  onClick={() => update({ sourceType: 'noise' })}
                >
                  Noise
                </button>
                <button
                  className={`color-btn ${sound.sourceType === 'tone' ? 'active' : ''}`}
                  onClick={() => update({ sourceType: 'tone' })}
                >
                  Synth
                </button>
                <button
                  className={`color-btn ${sound.sourceType === 'fm' ? 'active' : ''}`}
                  onClick={() => update({ sourceType: 'fm' })}
                >
                  FM Synth
                </button>
                <button
                  className={`color-btn ${sound.sourceType === 'metal' ? 'active' : ''}`}
                  onClick={() => update({ sourceType: 'metal' })}
                >
                  Metal
                </button>
                <button
                  className={`color-btn ${sound.sourceType === 'pluck' ? 'active' : ''}`}
                  onClick={() => update({ sourceType: 'pluck' })}
                >
                  Pluck
                </button>
                <button
                  className={`color-btn ${sound.sourceType === 'kick' ? 'active' : ''}`}
                  onClick={() => update({ sourceType: 'kick' })}
                >
                  Kick
                </button>
              </div>
            )}
          </section>

          {sound.sourceType === 'noise' && (
            <section className={`panel-group ${collapsedPanels['NOISE'] ? 'collapsed' : ''}`}>
              <h2 className="panel-title" onClick={() => togglePanel('NOISE')}>NOISE</h2>
              {!collapsedPanels['NOISE'] && (
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
              )}
            </section>
          )}

          {sound.sourceType === 'tone' && (
            <section className={`panel-group ${collapsedPanels['SYNTH'] ? 'collapsed' : ''}`}>
              <h2 className="panel-title" onClick={() => togglePanel('SYNTH')}>SYNTH</h2>
              {!collapsedPanels['SYNTH'] && (
                <div className="colour-picker-grid" role="group" aria-label="Select oscillator type" style={{ gap: '8px' }}>
                  {['sine', 'square', 'sawtooth', 'triangle', 'pulse', 'fatsine', 'fatsquare', 'fatsawtooth', 'fattriangle'].map(osc => (
                    <button
                      key={osc}
                      className={`color-btn ${sound.oscillatorType === osc ? 'active' : ''}`}
                      onClick={() => update({ oscillatorType: osc as OscillatorType })}
                      aria-pressed={sound.oscillatorType === osc}
                      style={{ padding: '6px 8px', fontSize: '0.8rem', flexBasis: 'calc(33.333% - 8px)' }}
                    >
                      {osc === 'fatsine' ? 'Fat Sine' : osc === 'fatsquare' ? 'Fat Square' : osc === 'fatsawtooth' ? 'Fat Saw' : osc === 'fattriangle' ? 'Fat Tri' : osc.charAt(0).toUpperCase() + osc.slice(1)}
                    </button>
                  ))}
                </div>
              )}
            </section>
          )}

          {sound.sourceType === 'fm' && (
            <section className={`panel-group ${collapsedPanels['FM_SYNTH'] ? 'collapsed' : ''}`}>
              <h2 className="panel-title" onClick={() => togglePanel('FM_SYNTH')}>FM SYNTH</h2>
              {!collapsedPanels['FM_SYNTH'] && (
                <>
                  <div className="control-row">
                    <span className="control-label">Ratio / Harm</span>
                    <div className="slider-wrapper">
                      <input
                        type="range"
                        min="0.1" max="10" step="0.1"
                        value={sound.fmHarmonicity ?? 1}
                        onChange={(e) => update({ fmHarmonicity: parseFloat(e.target.value) })}
                      />
                    </div>
                  </div>
                  <div className="control-row">
                    <span className="control-label">Index</span>
                    <div className="slider-wrapper">
                      <input
                        type="range"
                        min="0" max="100" step="1"
                        value={sound.fmModulationIndex ?? 10}
                        onChange={(e) => update({ fmModulationIndex: parseFloat(e.target.value) })}
                      />
                    </div>
                  </div>
                </>
              )}
            </section>
          )}

          {sound.sourceType === 'metal' && (
            <section className={`panel-group ${collapsedPanels['METAL'] ? 'collapsed' : ''}`}>
              <h2 className="panel-title" onClick={() => togglePanel('METAL')}>METAL</h2>
              {!collapsedPanels['METAL'] && (
                <>
                  <div className="control-row">
                    <span className="control-label">Harmonicity</span>
                    <div className="slider-wrapper">
                      <input
                        type="range"
                        min="0.1" max="20" step="0.1"
                        value={sound.metalHarmonicity ?? 5.1}
                        onChange={(e) => update({ metalHarmonicity: parseFloat(e.target.value) })}
                      />
                    </div>
                  </div>
                  <div className="control-row">
                    <span className="control-label">Resonance</span>
                    <div className="slider-wrapper">
                      <input
                        type="range"
                        min="100" max="8000" step="100"
                        value={sound.metalResonance ?? 4000}
                        onChange={(e) => update({ metalResonance: parseFloat(e.target.value) })}
                      />
                    </div>
                  </div>
                </>
              )}
            </section>
          )}

          {sound.sourceType === 'pluck' && (
            <section className={`panel-group ${collapsedPanels['PLUCK'] ? 'collapsed' : ''}`}>
              <h2 className="panel-title" onClick={() => togglePanel('PLUCK')}>PLUCK</h2>
              {!collapsedPanels['PLUCK'] && (
                <>
                  <div className="control-row">
                    <span className="control-label">Attack</span>
                    <div className="slider-wrapper">
                      <input
                        type="range"
                        min="0.01" max="0.5" step="0.01"
                        value={sound.pluckAttackNoise ?? 0.1}
                        onChange={(e) => update({ pluckAttackNoise: parseFloat(e.target.value) })}
                      />
                    </div>
                  </div>
                  <div className="control-row">
                    <span className="control-label">Resonance</span>
                    <div className="slider-wrapper">
                      <input
                        type="range"
                        min="0" max="0.99" step="0.01"
                        value={sound.pluckResonance ?? 0.7}
                        onChange={(e) => update({ pluckResonance: parseFloat(e.target.value) })}
                      />
                    </div>
                  </div>
                  <div className="control-row">
                    <span className="control-label">Dampen</span>
                    <div className="slider-wrapper">
                      <input
                        type="range"
                        min="100" max="8000" step="100"
                        value={sound.pluckDampening ?? 4000}
                        onChange={(e) => update({ pluckDampening: parseFloat(e.target.value) })}
                      />
                    </div>
                  </div>
                </>
              )}
            </section>
          )}

          {sound.sourceType === 'kick' && (
            <section className={`panel-group ${collapsedPanels['KICK'] ? 'collapsed' : ''}`}>
              <h2 className="panel-title" onClick={() => togglePanel('KICK')}>KICK</h2>
              {!collapsedPanels['KICK'] && (
                <>
                  <div className="control-row">
                    <span className="control-label">Pitch Decay</span>
                    <div className="slider-wrapper">
                      <input
                        type="range"
                        min="0.01" max="0.5" step="0.01"
                        value={sound.kickPitchDecay ?? 0.05}
                        onChange={(e) => update({ kickPitchDecay: parseFloat(e.target.value) })}
                      />
                    </div>
                  </div>
                  <div className="control-row">
                    <span className="control-label">Octaves</span>
                    <div className="slider-wrapper">
                      <input
                        type="range"
                        min="0.1" max="10" step="0.1"
                        value={sound.kickOctaves ?? 10}
                        onChange={(e) => update({ kickOctaves: parseFloat(e.target.value) })}
                      />
                    </div>
                  </div>
                </>
              )}
            </section>
          )}

          <section className={`panel-group ${collapsedPanels['SEQUENCER'] ? 'collapsed' : ''}`}>
            <h2 className="panel-title" onClick={() => togglePanel('SEQUENCER')}>SEQUENCER</h2>
            {!collapsedPanels['SEQUENCER'] && sound.stepConfigs && sound.stepRatios && (
              <>
                <div className="control-row sequencer-ratios-row">
                  <span className="control-label">Ratios</span>
                  <div className="ratios-container">
                    {[0, 1, 2, 3, 4, 5, 6, 7].map(step => (
                      <input
                        key={step}
                        type="text"
                        className="ratio-input"
                        value={sound.stepRatios[step] === null ? '' : sound.stepRatios[step]}
                        onChange={(e) => {
                          const val = e.target.value;
                          const newRatios = [...sound.stepRatios];
                          if (val === '') {
                            newRatios[step] = null;
                          } else if (val === '-') {
                            newRatios[step] = '-';
                          } else {
                            const num = parseInt(val, 10);
                            if (!isNaN(num) && num >= 0) {
                              newRatios[step] = num;
                            }
                          }
                          update({ stepRatios: newRatios });
                        }}
                      />
                    ))}
                  </div>
                </div>
                <div className="control-row">
                  <span className="control-label">Length</span>
                  <div className="segmented-control" style={{ marginTop: 0 }}>
                    {(['second', 'minute', 'hour'] as LFOScale[]).map(scale => (
                      <button
                        key={scale}
                        className={`segment-btn ${sound.seqLengthScale === scale ? 'active' : ''}`}
                        onClick={() => {
                          let newRate = sound.seqLengthRate;
                          if (scale === 'second') newRate = Math.min(Math.max(newRate, 0.01), 1);
                          else if (scale === 'minute') newRate = Math.min(Math.max(newRate, 1), 60);
                          else if (scale === 'hour') newRate = Math.min(Math.max(newRate, 60), 3600);
                          update({ seqLengthScale: scale, seqLengthRate: newRate });
                        }}
                      >
                        {scale === 'second' ? 'Short' : scale === 'minute' ? 'Med' : 'Long'}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="control-row">
                  <span className="control-label">Rate</span>
                  <div className="slider-wrapper">
                    <input
                      type="range"
                      min={sound.seqLengthScale === 'hour' ? 60 : sound.seqLengthScale === 'minute' ? 1 : 0.01}
                      max={sound.seqLengthScale === 'hour' ? 3600 : sound.seqLengthScale === 'minute' ? 60 : 1}
                      step={sound.seqLengthScale === 'second' ? 0.01 : 1}
                      value={sound.seqLengthRate}
                      onChange={e => update({ seqLengthRate: parseFloat(e.target.value) })}
                    />
                  </div>
                </div>
                <div className="control-row">
                  <div className="slider-wrapper">
                    <span className="control-label">Timing</span>
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.01"
                      value={sound.slack || 0}
                      onChange={e => update({ slack: parseFloat(e.target.value) })}
                      aria-label="Sequencer Timing"
                    />
                  </div>
                </div>
                {sound.sourceType !== 'noise' && (
                  <div className="control-row">
                    <span className="control-label">Play</span>
                    <div className="segmented-control" style={{ marginTop: 0 }}>
                      <button
                        className={`segment-btn ${sound.playMode !== 'random' ? 'active' : ''}`}
                        onClick={() => update({ playMode: 'chord' })}
                      >
                        All<span className="hide-on-mobile"> notes</span>
                      </button>
                      <button
                        className={`segment-btn ${sound.playMode === 'random' ? 'active' : ''}`}
                        onClick={() => update({ playMode: 'random' })}
                      >
                        Random<span className="hide-on-mobile"> note</span>
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </section>

          {sound.sourceType !== 'noise' && (
            <section className={`panel-group ${collapsedPanels['TONES'] ? 'collapsed' : ''}`}>
              <h2 className="panel-title" onClick={() => togglePanel('TONES')}>TONES</h2>
              {!collapsedPanels['TONES'] && (
                <>
                  <div className="control-row">
                    <span className="control-label">Step</span>
                    <div className="segmented-control step-sequencer-control" style={{ marginTop: 0 }}>
                      {[0, 1, 2, 3, 4, 5, 6, 7].map(step => (
                        <button
                          key={step}
                          className={`segment-btn ${selectedStep === step ? 'active' : ''}`}
                          onClick={() => setSelectedStep(step)}
                        >
                          {step + 1}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="control-row">
                    <span className="control-label">Octave</span>
                    <div className="slider-wrapper">
                      <input type="range" min="1" max="5" step="1" value={sound.stepConfigs?.[selectedStep]?.octave ?? 3} onChange={e => {
                        if (!sound.stepConfigs) return;
                        const newConfigs = [...sound.stepConfigs];
                        newConfigs[selectedStep] = { ...newConfigs[selectedStep], octave: parseInt(e.target.value, 10) };
                        update({ stepConfigs: newConfigs });
                      }} aria-label="Octave" />
                    </div>
                  </div>

                  <div className="control-row">
                    <span className="control-label">Chord</span>
                    <div className="slider-wrapper">
                      <input
                        type="text"
                        className="chord-input"
                        value={chordInput}
                        onChange={(e) => setChordInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleChordCommit();
                        }}
                        onBlur={handleChordCommit}
                        style={{ width: '100%', backgroundColor: 'var(--bg-color)' }}
                        spellCheck={false}
                        aria-label="Chord Notation"
                      />
                    </div>
                  </div>

                  <div className="keyboard-container" style={{ marginTop: '21px' }} role="group" aria-label="Select notes">
                    <div className="keyboard-row black-keys">
                      {['C#', 'Eb', 'F#', 'G#', 'Bb'].map(note => (
                        <button
                          key={note}
                          className={`key-btn black-key ${sound.stepConfigs?.[selectedStep]?.activeNotes?.includes(note) ? 'active' : ''}`}
                          onClick={() => {
                            if (!sound.stepConfigs) return;
                            const notes = sound.stepConfigs[selectedStep].activeNotes || [];
                            const newNotes = notes.includes(note) ? notes.filter(n => n !== note) : [...notes, note];
                            const newConfigs = [...sound.stepConfigs];
                            newConfigs[selectedStep] = { ...newConfigs[selectedStep], activeNotes: newNotes };
                            update({ stepConfigs: newConfigs });
                          }}
                          aria-pressed={sound.stepConfigs?.[selectedStep]?.activeNotes?.includes(note)}
                          aria-label={note}
                        />
                      ))}
                    </div>
                    <div className="keyboard-row white-keys">
                      {['C', 'D', 'E', 'F', 'G', 'A', 'B'].map(note => (
                        <button
                          key={note}
                          className={`key-btn white-key ${sound.stepConfigs?.[selectedStep]?.activeNotes?.includes(note) ? 'active' : ''}`}
                          onClick={() => {
                            if (!sound.stepConfigs) return;
                            const notes = sound.stepConfigs[selectedStep].activeNotes || [];
                            const newNotes = notes.includes(note) ? notes.filter(n => n !== note) : [...notes, note];
                            const newConfigs = [...sound.stepConfigs];
                            newConfigs[selectedStep] = { ...newConfigs[selectedStep], activeNotes: newNotes };
                            update({ stepConfigs: newConfigs });
                          }}
                          aria-pressed={sound.stepConfigs?.[selectedStep]?.activeNotes?.includes(note)}
                          aria-label={note}
                        />
                      ))}
                    </div>
                  </div>
                </>
              )}
            </section>
          )}

          {sound.sourceType !== 'pluck' && (
            <section className={`panel-group ${collapsedPanels['ENVELOPE'] ? 'collapsed' : ''}`}>
              <h2 className="panel-title" onClick={() => togglePanel('ENVELOPE')}>ENVELOPE</h2>
              {!collapsedPanels['ENVELOPE'] && (
              <>
                <div className="control-row">
                  <span className="control-label">Attack</span>
                  <div className="slider-wrapper">
                    <input type="range" min="0" max="1" step="0.01" value={Math.pow(sound.envAttack / 10, 1 / 3) || 0} onChange={e => update({ envAttack: Math.pow(parseFloat(e.target.value), 3) * 10 })} aria-label="Attack" />
                  </div>
                </div>
                <div className="control-row">
                  <span className="control-label">Decay</span>
                  <div className="slider-wrapper">
                    <input type="range" min="0" max="1" step="0.01" value={Math.pow(sound.envDecay / 10, 1 / 3) || 0} onChange={e => update({ envDecay: Math.pow(parseFloat(e.target.value), 3) * 10 })} aria-label="Decay" />
                  </div>
                </div>
                <div className="control-row">
                  <span className="control-label">Sustain</span>
                  <div className="slider-wrapper">
                    <input type="range" min="0" max="1" step="0.01" value={sound.envSustain || 0} onChange={e => update({ envSustain: parseFloat(e.target.value) })} aria-label="Sustain" />
                  </div>
                </div>
                <div className="control-row">
                  <span className="control-label">Release</span>
                  <div className="slider-wrapper">
                    <input type="range" min="0" max="1" step="0.01" value={Math.pow(sound.envRelease / 10, 1 / 3) || 0} onChange={e => update({ envRelease: Math.pow(parseFloat(e.target.value), 3) * 10 })} aria-label="Release" />
                  </div>
                </div>
                <div className="control-row" style={{ marginTop: '8px', borderTop: '1px solid var(--border-color)', paddingTop: '8px' }}>
                  <span className="control-label">Length</span>
                  <div className="slider-wrapper">
                    <input
                      type="range"
                      min="0.1"
                      max="1"
                      step="0.05"
                      value={sound.noteLengthRatio ?? 1.0}
                      onChange={e => update({ noteLengthRatio: parseFloat(e.target.value) })}
                      aria-label="Note Length Ratio"
                    />
                  </div>
                </div>
              </>
            )}
            </section>
          )}

          <section className={`panel-group ${collapsedPanels['VOLUME'] ? 'collapsed' : ''}`}>
            <h2 className="panel-title" onClick={() => togglePanel('VOLUME')}>VOLUME</h2>
            {!collapsedPanels['VOLUME'] && (
              <>
                <div className="control-row">
                  <div className="slider-wrapper">
                    <input type="range" min="0" max="1" step="0.01" value={sound.volume} onChange={e => update({ volume: parseFloat(e.target.value) })} aria-label="Volume" />
                  </div>
                </div>

                <div className={`sub - panel ${collapsedPanels['VOLUME_LFO'] ? 'collapsed' : ''}`} style={{ marginTop: '12px', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '12px' }}>
                  <h3 className="panel-title" onClick={() => togglePanel('VOLUME_LFO')} >LFO</h3>
                  {!collapsedPanels['VOLUME_LFO'] && (
                    <>
                      <div className="control-row">
                        <span className="control-label">Type</span>
                        <div className="segmented-control">
                          {(['sine', 'random'] as LFOType[]).map(t => (
                            <button key={t} className={`segment-btn ${(sound.volLfoType || 'sine') === t ? 'active' : ''}`}
                              onClick={() => update({ volLfoType: t })}>
                              {t === 'sine' ? 'Sine' : 'Random'}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div className="control-row">
                        <span className="control-label">Speed</span>
                        <div className="segmented-control">
                          {(['hour', 'minute', 'second'] as LFOScale[]).map(scale => (
                            <button
                              key={scale}
                              className={`segment-btn ${sound.volLfoScale === scale ? 'active' : ''}`}
                              onClick={() => {
                                let newDuration = sound.volLfoRate;
                                if (scale === 'second') newDuration = Math.min(Math.max(newDuration, 0.01), 1);
                                else if (scale === 'minute') newDuration = Math.min(Math.max(newDuration, 1), 60);
                                else if (scale === 'hour') newDuration = Math.min(Math.max(newDuration, 60), 3600);
                                update({ volLfoScale: scale, volLfoRate: newDuration });
                              }}
                            >
                              {scale === 'hour' ? 'Slow' : scale === 'minute' ? 'Med' : 'Fast'}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div className="control-row" style={{ marginTop: '5px' }}>
                        <span className="control-label">Rate</span>
                        <div className="slider-wrapper">
                          <input
                            type="range"
                            min={sound.volLfoScale === 'hour' ? 60 : sound.volLfoScale === 'minute' ? 1 : 0.01}
                            max={sound.volLfoScale === 'hour' ? 3600 : sound.volLfoScale === 'minute' ? 60 : 1}
                            step={sound.volLfoScale === 'second' ? 0.01 : 1}
                            value={sound.volLfoRate}
                            onChange={e => update({ volLfoRate: parseFloat(e.target.value) })}
                            aria-label="Volume LFO Rate"
                          />
                        </div>
                      </div>
                      <div className="control-row">
                        <span className="control-label">Depth</span>
                        <div className="slider-wrapper">
                          <input type="range" min="0" max="1" step="0.01" value={sound.volLfoDepth ?? 0} onChange={e => update({ volLfoDepth: parseFloat(e.target.value) })} aria-label="Volume LFO Depth" />
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </>
            )}
          </section>

          <section className={`panel-group ${collapsedPanels['PAN'] ? 'collapsed' : ''}`}>
            <h2 className="panel-title" onClick={() => togglePanel('PAN')}>PAN</h2>
            {!collapsedPanels['PAN'] && (
              <>
                <div className="control-row">
                  <div className="slider-wrapper">
                    <input type="range" min="-1" max="1" step="0.01" value={sound.pan} onChange={e => update({ pan: parseFloat(e.target.value) })} aria-label="Pan" />
                  </div>
                </div>

                <div className={`sub - panel ${collapsedPanels['PAN_LFO'] ? 'collapsed' : ''}`} style={{ marginTop: '12px', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '12px' }}>
                  <h3 className="panel-title" onClick={() => togglePanel('PAN_LFO')} >LFO</h3>
                  {!collapsedPanels['PAN_LFO'] && (
                    <>
                      <div className="control-row">
                        <span className="control-label">Type</span>
                        <div className="segmented-control">
                          {(['sine', 'random'] as LFOType[]).map(t => (
                            <button key={t} className={`segment-btn ${(sound.panLfoType || 'sine') === t ? 'active' : ''}`}
                              onClick={() => update({ panLfoType: t })}>
                              {t === 'sine' ? 'Sine' : 'Random'}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div className="control-row">
                        <span className="control-label">Speed</span>
                        <div className="segmented-control">
                          {(['hour', 'minute', 'second'] as LFOScale[]).map(scale => (
                            <button
                              key={scale}
                              className={`segment-btn ${sound.panLfoScale === scale ? 'active' : ''}`}
                              onClick={() => {
                                let newDuration = sound.panLfoRate || 1;
                                if (scale === 'second') newDuration = Math.min(Math.max(newDuration, 0.01), 1);
                                else if (scale === 'minute') newDuration = Math.min(Math.max(newDuration, 1), 60);
                                else if (scale === 'hour') newDuration = Math.min(Math.max(newDuration, 60), 3600);
                                update({ panLfoScale: scale, panLfoRate: newDuration });
                              }}
                            >
                              {scale === 'hour' ? 'Slow' : scale === 'minute' ? 'Med' : 'Fast'}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div className="control-row" style={{ marginTop: '5px' }}>
                        <span className="control-label">Rate</span>
                        <div className="slider-wrapper">
                          <input
                            type="range"
                            min={sound.panLfoScale === 'hour' ? 60 : sound.panLfoScale === 'minute' ? 1 : 0.01}
                            max={sound.panLfoScale === 'hour' ? 3600 : sound.panLfoScale === 'minute' ? 60 : 1}
                            step={sound.panLfoScale === 'second' ? 0.01 : 1}
                            value={sound.panLfoRate || 1}
                            onChange={e => update({ panLfoRate: parseFloat(e.target.value) })}
                            aria-label="Pan LFO Rate"
                          />
                        </div>
                      </div>
                      <div className="control-row">
                        <span className="control-label">Depth</span>
                        <div className="slider-wrapper">
                          <input type="range" min="0" max="1" step="0.01" value={sound.panLfoDepth || 0} onChange={e => update({ panLfoDepth: parseFloat(e.target.value) })} aria-label="Pan LFO Depth" />
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </>
            )}
          </section>

          <section className={`panel-group ${collapsedPanels['FILTER'] ? 'collapsed' : ''}`}>
            <h2 className="panel-title" onClick={() => togglePanel('FILTER')}>FILTER</h2>
            {!collapsedPanels['FILTER'] && (
              <>
                <div className="control-row">
                  <div className="slider-wrapper">
                    <input type="range" min="0" max="100" step="0.1" value={filterSliderVal} onChange={handleFilterBaseFreqChange} aria-label="Filter Base Freq" />
                  </div>
                </div>

                <div className={`sub - panel ${collapsedPanels['FILTER_LFO'] ? 'collapsed' : ''}`} style={{ marginTop: '12px', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '12px' }}>
                  <h3 className="panel-title" onClick={() => togglePanel('FILTER_LFO')} >LFO</h3>
                  {!collapsedPanels['FILTER_LFO'] && (
                    <>
                      <div className="control-row">
                        <span className="control-label">Type</span>
                        <div className="segmented-control">
                          {(['sine', 'random'] as LFOType[]).map(t => (
                            <button key={t} className={`segment-btn ${(sound.autoFilterType || 'sine') === t ? 'active' : ''}`}
                              onClick={() => update({ autoFilterType: t })}>
                              {t === 'sine' ? 'Sine' : 'Random'}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div className="control-row">
                        <span className="control-label">Speed</span>
                        <div className="segmented-control">
                          {(['hour', 'minute', 'second'] as LFOScale[]).map(scale => (
                            <button
                              key={scale}
                              className={`segment-btn ${sound.autoFilterScale === scale ? 'active' : ''}`}
                              onClick={() => {
                                let newDuration = sound.autoFilterRate || 1;
                                if (scale === 'second') newDuration = Math.min(Math.max(newDuration, 0.01), 1);
                                else if (scale === 'minute') newDuration = Math.min(Math.max(newDuration, 1), 60);
                                else if (scale === 'hour') newDuration = Math.min(Math.max(newDuration, 60), 3600);
                                update({ autoFilterScale: scale, autoFilterRate: newDuration });
                              }}
                            >
                              {scale === 'hour' ? 'Slow' : scale === 'minute' ? 'Med' : 'Fast'}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div className="control-row" style={{ marginTop: '5px' }}>
                        <span className="control-label">Rate</span>
                        <div className="slider-wrapper">
                          <input
                            type="range"
                            min={sound.autoFilterScale === 'hour' ? 60 : sound.autoFilterScale === 'minute' ? 1 : 0.01}
                            max={sound.autoFilterScale === 'hour' ? 3600 : sound.autoFilterScale === 'minute' ? 60 : 1}
                            step={sound.autoFilterScale === 'second' ? 0.01 : 1}
                            value={sound.autoFilterRate || 1}
                            onChange={e => update({ autoFilterRate: parseFloat(e.target.value) })}
                            aria-label="Filter LFO Rate"
                          />
                        </div>
                      </div>
                      <div className="control-row">
                        <span className="control-label">Depth</span>
                        <div className="slider-wrapper">
                          <input type="range" min="0.1" max="10" step="0.1" value={sound.autoFilterOctaves || 4} onChange={e => update({ autoFilterOctaves: parseFloat(e.target.value) })} aria-label="Filter LFO Depth" />
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </>
            )}
          </section>

          <section className={`panel-group ${collapsedPanels['EFFECTS'] ? 'collapsed' : ''}`}>
            <h2 className="panel-title" onClick={() => togglePanel('EFFECTS')}>EFFECTS</h2>
            {!collapsedPanels['EFFECTS'] && (
              <>
                <div className="control-row">
                  <span className="control-label">Reverb</span>
                  <div className="slider-wrapper">
                    <input type="range" min="0" max="1" step="0.01" value={sound.reverbAmount} onChange={e => update({ reverbAmount: parseFloat(e.target.value) })} aria-label="Reverb" />
                  </div>
                </div>
                <div className="control-row">
                  <span className="control-label">Distortion</span>
                  <div className="slider-wrapper">
                    <input type="range" min="0" max="1" step="0.01" value={sound.distortionAmount ?? 0} onChange={e => update({ distortionAmount: parseFloat(e.target.value) })} aria-label="Distortion" />
                  </div>
                </div>

                <div className="control-row">
                  <span className="control-label">Chorus</span>
                  <div className="slider-wrapper">
                    <input type="range" min="0" max="1" step="0.01" value={sound.chorusAmount} onChange={e => update({ chorusAmount: parseFloat(e.target.value) })} aria-label="Chorus" />
                  </div>
                </div>
                <div className="control-row">
                  <span className="control-label">Chebyshev</span>
                  <div className="slider-wrapper">
                    <input type="range" min="0" max="1" step="0.01" value={sound.chebyshevAmount ?? 0} onChange={e => update({ chebyshevAmount: parseFloat(e.target.value) })} aria-label="Chebyshev" />
                  </div>
                </div>
              </>
            )}
          </section>

          <section className={`panel-group ${collapsedPanels['DELAY'] ? 'collapsed' : ''}`}>
            <h2 className="panel-title" onClick={() => togglePanel('DELAY')}>DELAY</h2>
            {!collapsedPanels['DELAY'] && (
              <>
                <div className="control-row">
                  <span className="control-label">Amount</span>
                  <div className="slider-wrapper">
                    <input type="range" min="0" max="1" step="0.01" value={sound.delayAmount} onChange={e => update({ delayAmount: parseFloat(e.target.value) })} aria-label="Delay Amount" />
                  </div>
                </div>
                <div className="control-row">
                  <span className="control-label">Time</span>
                  <div className="slider-wrapper">
                    <input type="range" min="0.1" max="5" step="0.01" value={sound.delayTime ?? 0.25} onChange={e => update({ delayTime: parseFloat(e.target.value) })} aria-label="Delay Time" />
                  </div>
                </div>
                <div className="control-row">
                  <span className="control-label">Feedback</span>
                  <div className="slider-wrapper">
                    <input type="range" min="0.1" max="0.9" step="0.01" value={sound.delayFeedback ?? 0.5} onChange={e => update({ delayFeedback: parseFloat(e.target.value) })} aria-label="Delay Feedback" />
                  </div>
                </div>
              </>
            )}
          </section>

          <section className={`panel-group ${collapsedPanels['PITCH'] ? 'collapsed' : ''}`}>
            <h2 className="panel-title" onClick={() => togglePanel('PITCH')}>PITCH</h2>
            {!collapsedPanels['PITCH'] && (
              <>
                <div className="control-row">
                  <span className="control-label">Detune</span>
                  <div className="slider-wrapper">
                    <input type="range" min="-50" max="50" step="1" value={sound.detune ?? 0} onChange={e => update({ detune: parseInt(e.target.value, 10) })} aria-label="Detune" />
                  </div>
                </div>

                <div className={`sub - panel ${collapsedPanels['DETUNE_LFO'] ? 'collapsed' : ''}`} style={{ marginTop: '12px', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '12px' }}>
                  <h3 className="panel-title" onClick={() => togglePanel('DETUNE_LFO')} >LFO</h3>
                  {!collapsedPanels['DETUNE_LFO'] && (
                    <>
                      <div className="control-row">
                        <span className="control-label">Type</span>
                        <div className="segmented-control">
                          {(['sine', 'random'] as LFOType[]).map(t => (
                            <button key={t} className={`segment-btn ${(sound.detuneLfoType || 'sine') === t ? 'active' : ''}`}
                              onClick={() => update({ detuneLfoType: t })}>
                              {t === 'sine' ? 'Sine' : 'Random'}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div className="control-row">
                        <span className="control-label">Speed</span>
                        <div className="segmented-control">
                          {(['hour', 'minute', 'second'] as LFOScale[]).map(scale => (
                            <button
                              key={scale}
                              className={`segment-btn ${(sound.detuneLfoScale || 'minute') === scale ? 'active' : ''}`}
                              onClick={() => {
                                let newDuration = sound.detuneLfoRate || 30;
                                if (scale === 'second') newDuration = Math.min(Math.max(newDuration, 0.01), 1);
                                else if (scale === 'minute') newDuration = Math.min(Math.max(newDuration, 1), 60);
                                else if (scale === 'hour') newDuration = Math.min(Math.max(newDuration, 60), 3600);
                                update({ detuneLfoScale: scale, detuneLfoRate: newDuration });
                              }}
                            >
                              {scale === 'hour' ? 'Slow' : scale === 'minute' ? 'Med' : 'Fast'}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div className="control-row" style={{ marginTop: '5px' }}>
                        <span className="control-label">Rate</span>
                        <div className="slider-wrapper">
                          <input
                            type="range"
                            min={(sound.detuneLfoScale || 'minute') === 'hour' ? 60 : (sound.detuneLfoScale || 'minute') === 'minute' ? 1 : 0.01}
                            max={(sound.detuneLfoScale || 'minute') === 'hour' ? 3600 : (sound.detuneLfoScale || 'minute') === 'minute' ? 60 : 1}
                            step={(sound.detuneLfoScale || 'minute') === 'second' ? 0.01 : 1}
                            value={sound.detuneLfoRate || 30}
                            onChange={e => update({ detuneLfoRate: parseFloat(e.target.value) })}
                            aria-label="Detune LFO Rate"
                          />
                        </div>
                      </div>
                      <div className="control-row">
                        <span className="control-label">Depth</span>
                        <div className="slider-wrapper">
                          <input type="range" min="0" max="1" step="0.01" value={sound.detuneLfoDepth ?? 0} onChange={e => update({ detuneLfoDepth: parseFloat(e.target.value) })} aria-label="Detune LFO Depth" />
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </>
            )}
          </section>
        </div>
      )}
    </div>
  )
}

function formatLength(minutes: number) {
  if (minutes < 60) return `${Math.round(minutes)} m`;
  const hrs = Math.floor(minutes / 60);
  const mins = Math.round(minutes % 60);
  return mins > 0 ? `${hrs}h ${mins} m` : `${hrs} h`;
}

function formatLengthFullWords(minutes: number) {
  const roundedMinutes = Math.round(minutes);
  if (roundedMinutes < 60) return `${roundedMinutes} minute${roundedMinutes !== 1 ? 's' : ''}`;
  const hrs = Math.floor(roundedMinutes / 60);
  const mins = roundedMinutes % 60;
  return mins > 0 ? `${hrs} hour${hrs !== 1 ? 's' : ''} ${mins} minute${mins !== 1 ? 's' : ''}` : `${hrs} hour${hrs !== 1 ? 's' : ''}`;
}

function formatSeconds(seconds: number) {
  const rounded = Math.round(seconds);
  if (rounded < 60) return `${rounded} s`;
  const m = Math.floor(rounded / 60);
  const s = rounded % 60;
  return s > 0 ? `${m}m ${s} s` : `${m} m`;
}

function MixDetailScreen() {
  const { togglePlay } = useAudioActions();
  const { state, dispatch } = useAppState();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [isSettingsExpanded, setIsSettingsExpanded] = useState(false);
  const [isAddTrackOpen, setIsAddTrackOpen] = useState(false);
  const [selectedTracksToAdd, setSelectedTracksToAdd] = useState<string[]>([]);
  const [, setTick] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => setTick(t => t + 1), 500);
    return () => clearInterval(interval);
  }, []);

  const mix = state.savedMixes.find(m => m.id === id);

  const [draggedIdx, setDraggedIdx] = useState<number | null>(null);

  useEffect(() => {
    if (mix && state.currentMixId !== mix.id) {
      dispatch({ type: 'LOAD_MIX', payload: mix.id });
    }
  }, [mix, dispatch, state.currentMixId]);

  if (!mix) return <NotFoundScreen type="Mix" />;

  const updateSettings = (updates: Partial<MixState>) => {
    dispatch({ type: 'UPDATE_MIX_SETTINGS', payload: updates });
  };

  const onDragStart = (e: React.DragEvent, index: number) => {
    setDraggedIdx(index);
    e.dataTransfer.effectAllowed = 'move';
  };

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const onDrop = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedIdx !== null && draggedIdx !== index) {
      dispatch({ type: 'REORDER_MIX_ITEMS', payload: { sourceIndex: draggedIdx, destIndex: index } });
    }
    setDraggedIdx(null);
  };

  return (
    <div className="app-container">
      <div className="top-play-area">
        <button
          className="tracks-nav-btn"
          onClick={() => navigate('/mixes')}
          aria-label="Back to Tracks"
        >
          <img src={`${import.meta.env.BASE_URL}grid-icon.png`} alt="Back to mixes" className="grid-icon-img" />
        </button>
        <button
          className="play-button"
          onClick={togglePlay}
          aria-label={state.isPlaying && state.playbackMode === 'mix' ? "Pause" : "Play"}
        >
          {state.isPlaying && state.playbackMode === 'mix' ? <PauseIcon /> : <PlayIcon />}
        </button>
      </div>

      <header className="track-header" style={{ marginBottom: '24px', flexDirection: 'column', gap: '8px' }}>
        <input
          type="text"
          className="track-name-input"
          value={mix.name}
          onChange={(e) => updateSettings({ name: e.target.value })}
          aria-label="Mix Name"
          placeholder="Name your mix..."
          style={{ textAlign: 'center' }}
        />
        <div style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', opacity: 0.8, letterSpacing: '0.5px' }}>
          {mix.items.length} track{mix.items.length !== 1 ? 's' : ''}
          {mix.items.length > 0 && ` \u00B7 ${formatLengthFullWords(mix.lengthMinutes + (mix.items.length > 1 ? (mix.items.length - 1) * mix.crossFadeMinutes : 0))}`}
        </div>
      </header>

      <main className="main-content">
        <section className={`panel-group ${!isSettingsExpanded ? 'collapsed' : ''}`} style={{ marginBottom: '24px' }}>
          <h2 className="panel-title" onClick={() => setIsSettingsExpanded(!isSettingsExpanded)} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: 0 }}>
            MIX SETTINGS
            <div className="icon-btn" style={{ width: '20px', height: '20px', marginLeft: 'auto', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <ChevronRightIcon isExpanded={isSettingsExpanded} />
            </div>
          </h2>
          {isSettingsExpanded && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '16px' }}>
              <div className="control-row" style={{ marginTop: '0' }}>
                <span className="control-label">Length</span>
                <div className="slider-wrapper" style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <input
                    type="range"
                    min={Math.log10(5)}
                    max={Math.log10(480)}
                    step="0.01"
                    value={Math.log10(mix.lengthMinutes)}
                    onChange={e => updateSettings({ lengthMinutes: Math.pow(10, parseFloat(e.target.value)) })}
                  />
                  <span style={{ minWidth: '54px', fontSize: '0.9rem', opacity: 0.8 }}>{formatLength(mix.lengthMinutes + (mix.items.length > 1 ? (mix.items.length - 1) * mix.crossFadeMinutes : 0))}</span>
                </div>
              </div>
              <div className="control-row">
                <span className="control-label">Timing</span>
                <div className="slider-wrapper" style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.01"
                    value={mix.spread || 0}
                    onChange={e => updateSettings({ spread: parseFloat(e.target.value) })}
                    aria-label="Mix Timing"
                  />
                </div>
              </div>
              <div className="control-row">
                <span className="control-label">Shuffle</span>
                <div className="segmented-control" style={{ marginTop: '0', width: '50%' }}>
                  <button className={`segment-btn ${!mix.shuffle ? 'active' : ''}`} onClick={() => updateSettings({ shuffle: false })}>Off</button>
                  <button className={`segment-btn ${mix.shuffle ? 'active' : ''}`} onClick={() => updateSettings({ shuffle: true })}>On</button>
                </div>
              </div>
              <div className="control-row">
                <span className="control-label">Repeat</span>
                <div className="segmented-control" style={{ marginTop: '0', width: '50%' }}>
                  <button className={`segment-btn ${!mix.repeat ? 'active' : ''}`} onClick={() => updateSettings({ repeat: false })}>Off</button>
                  <button className={`segment-btn ${mix.repeat ? 'active' : ''}`} onClick={() => updateSettings({ repeat: true })}>On</button>
                </div>
              </div>
              <div className="control-row">
                <span className="control-label">Fade in</span>
                <div className="slider-wrapper" style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <input type="range" min="0" max="600" step="5" value={Math.round(mix.fadeInMinutes * 60)} onChange={e => updateSettings({ fadeInMinutes: parseInt(e.target.value) / 60 })} />
                  <span style={{ minWidth: '54px', fontSize: '0.9rem', opacity: 0.8 }}>{formatSeconds(mix.fadeInMinutes * 60)}</span>
                </div>
              </div>
              <div className="control-row">
                <span className="control-label">Fade out</span>
                <div className="slider-wrapper" style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <input type="range" min="0" max="600" step="5" value={Math.round(mix.fadeOutMinutes * 60)} onChange={e => updateSettings({ fadeOutMinutes: parseInt(e.target.value) / 60 })} />
                  <span style={{ minWidth: '54px', fontSize: '0.9rem', opacity: 0.8 }}>{formatSeconds(mix.fadeOutMinutes * 60)}</span>
                </div>
              </div>
              <div className="control-row">
                <span className="control-label">X fade</span>
                <div className="slider-wrapper" style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <input type="range" min="0" max="600" step="5" value={Math.round(mix.crossFadeMinutes * 60)} onChange={e => updateSettings({ crossFadeMinutes: parseInt(e.target.value) / 60 })} />
                  <span style={{ minWidth: '54px', fontSize: '0.9rem', opacity: 0.8 }}>{formatSeconds(mix.crossFadeMinutes * 60)}</span>
                </div>
              </div>
            </div>
          )}
        </section>

        <div className="track-list" style={{ marginTop: '0' }}>
          {mix.items.map((item, index) => {
            const track = state.savedTracks.find(t => t.id === item.trackId);
            if (!track) return null;
            const isTrackPlaying = state.isPlaying && mixPlayer.isTrackPlaying(item.id);

            const N = mix.items.length;
            const totalLengthSec = mix.lengthMinutes * 60;
            const crossfadeSec = mix.crossFadeMinutes * 60;
            const totalTargetDuration = totalLengthSec + (N > 1 ? (N - 1) * crossfadeSec : 0);
            const totalWeight = mix.items.reduce((sum, it) => sum + (it.weight || 1), 0);
            const itemWeight = item.weight || 1;
            const itemLengthSec = (itemWeight / totalWeight) * totalTargetDuration;
            let itemTimeString = '';
            if (itemLengthSec >= 3600) {
              itemTimeString = formatLength(itemLengthSec / 60);
            } else {
              const m = Math.floor(itemLengthSec / 60);
              const s = Math.floor(itemLengthSec % 60).toString().padStart(2, '0');
              itemTimeString = `${m}:${s}`;
            }
            return (
              <div
                key={item.id}
                className="track-list-item"
                draggable
                onDragStart={(e) => onDragStart(e, index)}
                onDragOver={(e) => onDragOver(e)}
                onDrop={(e) => onDrop(e, index)}
                style={{ opacity: draggedIdx === index ? 0.5 : 1, cursor: 'grab' }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flex: 1, minWidth: 0 }}>
                  <button
                    className={`track-play-btn ${isTrackPlaying ? 'active' : ''}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (isTrackPlaying) {
                        togglePlay();
                      } else {
                        mixPlayer.pendingSeekItemId = item.id;
                        if (!state.isPlaying || state.playbackMode !== 'mix' || state.currentMixId !== mix.id) {
                          dispatch({ type: 'LOAD_AND_PLAY_MIX', payload: mix.id });
                        } else {
                          mixPlayer.seekToItem(item.id);
                          mixPlayer.pendingSeekItemId = null;
                        }
                      }
                      setTick(t => t + 1);
                    }}
                  >
                    <div className="track-play-icon-circle">
                      {isTrackPlaying ? <PauseIcon /> : <PlayIcon />}
                    </div>
                  </button>
                  <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                    <span className="track-item-name" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{track.name}</span>
                    <span className="track-item-time-mobile" style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', opacity: 0.8, fontVariantNumeric: 'tabular-nums' }}>
                      {itemTimeString}
                    </span>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                  <div className="track-list-item-actions">
                    <button className="icon-btn" data-tooltip="Duplicate" onClick={() => dispatch({ type: 'ADD_TRACK_TO_MIX', payload: item.trackId })} aria-label="Duplicate Track">
                      <DuplicateIcon />
                    </button>
                    <button className="icon-btn delete-btn" data-tooltip="Remove" onClick={() => dispatch({ type: 'REMOVE_MIX_ITEM', payload: item.id })} aria-label="Remove Track">
                      <TrashIcon />
                    </button>
                  </div>
                  <span className="track-item-time-desktop" style={{ fontSize: '0.95rem', color: 'var(--text-secondary)', opacity: 0.8, fontVariantNumeric: 'tabular-nums', paddingRight: '10px' }}>
                    {itemTimeString}
                  </span>
                </div>
              </div>
            )
          })}
        </div>

        <div className="create-track-container" style={{ marginTop: '20px' }}>
          <button className="create-track-btn" onClick={() => {
            setSelectedTracksToAdd([]);
            setIsAddTrackOpen(true);
          }}>Add tracks</button>
        </div>

      </main>

      {isAddTrackOpen && (
        <div className="modal-overlay">
          <div className="modal-track-list">
            <div className="modal-header">
              <div style={{ width: '40px' }} /> {/* Spacer to align title */}
              <h2 className="modal-title">Select tracks</h2>
              <button className="modal-close-btn" onClick={() => setIsAddTrackOpen(false)} aria-label="Close modal">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18"></line>
                  <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
              </button>
            </div>
            {state.savedTracks.map(t => {
              const isSelected = selectedTracksToAdd.includes(t.id);
              return (
                <div
                  key={t.id}
                  className={`modal-track-item ${isSelected ? 'selected' : ''}`}
                  onClick={() => {
                    if (isSelected) {
                      setSelectedTracksToAdd(prev => prev.filter(id => id !== t.id));
                    } else {
                      setSelectedTracksToAdd(prev => [...prev, t.id]);
                    }
                  }}
                >
                  <div className="custom-checkbox" />
                  <span style={{ fontSize: '1.1rem' }}>{t.name}</span>
                </div>
              );
            })}

            <div className="modal-actions">
              <button
                className="create-track-btn"
                onClick={() => {
                  selectedTracksToAdd.forEach(id => {
                    dispatch({ type: 'ADD_TRACK_TO_MIX', payload: id });
                  });
                  setIsAddTrackOpen(false);
                  setSelectedTracksToAdd([]);
                }}
                disabled={selectedTracksToAdd.length === 0}
                style={{ opacity: selectedTracksToAdd.length === 0 ? 0.5 : 1 }}
              >
                Add tracks to mix
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


const useAudioActions = () => {
  const { dispatch } = useAppState();
  return {
    togglePlay: useCallback(async () => {
      await audioManager.initialize();
      dispatch({ type: 'TOGGLE_PLAY' });
    }, [dispatch])
  };
};

function NotFoundScreen({ type }: { type?: string }) {
  const navigate = useNavigate();
  return (
    <div className="app-container load-screen">
      <div style={{ textAlign: 'center', marginTop: '100px' }}>
        <h2>{type ? `${type} not found` : '404 - Page not found'}</h2>
        <button className="create-track-btn" onClick={() => navigate('/tracks')} style={{ marginTop: '20px' }}>
          Back to home
        </button>
      </div>
    </div>
  );
}

function AboutScreen() {
  const navigate = useNavigate();
  return (
    <div className="app-container load-screen">
      <div className="modal-track-list" style={{ maxWidth: '800px', backgroundColor: 'transparent', margin: '40px auto' }}>
        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <img src={`${import.meta.env.BASE_URL}doom-logo.png`} alt="Doom Loop Logo" style={{ width: '50%', height: 'auto', opacity: 0.8 }} />
        </div>
        <div className="markdown-content">
          <ReactMarkdown>{aboutMarkdown}</ReactMarkdown>
        </div>
        <div className="modal-actions" style={{ marginTop: '48px' }}>
          <button className="create-track-btn" onClick={() => navigate(-1)}>
            Go Back
          </button>
        </div>
      </div>
    </div>
  );
}

function TrackDetailScreen() {
  const { state, dispatch } = useAppState();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { togglePlay } = useAudioActions();
  const [isMetaExpanded, setIsMetaExpanded] = useState(false);

  const currentTrack = state.savedTracks.find(t => t.id === id);

  useEffect(() => {
    if (currentTrack && state.currentTrackId !== currentTrack.id) {
      dispatch({ type: 'LOAD_TRACK', payload: currentTrack });
    }
  }, [currentTrack, dispatch, state.currentTrackId]);

  if (!currentTrack) return <NotFoundScreen type="Track" />;

  const addSound = () => {
    dispatch({ type: 'ADD_SOUND' });
  };

  return (
    <div className="app-container">
      <div className="top-play-area">
        <button
          className="tracks-nav-btn"
          onClick={() => navigate('/tracks')}
          aria-label="Back to Tracks"
        >
          <img src={`${import.meta.env.BASE_URL}grid-icon.png`} alt="Back to tracks" className="grid-icon-img" />
        </button>
        <button
          className="play-button"
          onClick={togglePlay}
          aria-label={state.isPlaying && state.playbackMode === 'track' ? "Pause" : "Play"}
        >
          {state.isPlaying && state.playbackMode === 'track' ? <PauseIcon /> : <PlayIcon />}
        </button>
      </div>

      <header className="track-header">
        <input
          type="text"
          className="track-name-input"
          value={currentTrack.name}
          onChange={(e) => {
            dispatch({ type: 'SET_TRACK_NAME', payload: e.target.value });
          }}
          onBlur={() => dispatch({ type: 'UPDATE_TRACK_META', payload: { name: currentTrack.name } })}
          aria-label="Track Name"
          placeholder="Name your track..."
        />
      </header>

      <main className="main-content">
        <section className={`panel-group ${!isMetaExpanded ? 'collapsed' : ''}`} >
          <h2 className="panel-title" onClick={() => setIsMetaExpanded(!isMetaExpanded)} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: 0 }}>
            TRACK INFO
            <div className="icon-btn" style={{ width: '20px', height: '20px', marginLeft: 'auto', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <ChevronRightIcon isExpanded={isMetaExpanded} />
            </div>
          </h2>
          {isMetaExpanded && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '16px' }}>
              <div className="control-row" style={{ marginTop: '0' }}>
                <span className="control-label">Author</span>
                <div className="slider-wrapper">
                  <input
                    type="text"
                    style={{
                      width: '100%', height: '36px', backgroundColor: '#111111', border: '1px solid transparent',
                      borderRadius: '16px', color: 'var(--text-primary)', fontSize: '0.95rem', fontWeight: 500,
                      padding: '0 14px', textAlign: 'left', transition: 'all 0.2s ease', boxSizing: 'border-box',
                      fontFamily: 'inherit'
                    }}
                    value={currentTrack?.author || ''}
                    onChange={(e) => dispatch({ type: 'UPDATE_TRACK_META', payload: { author: e.target.value } })}
                    placeholder=""
                    aria-label="Track Author"
                  />
                </div>
              </div>
              <div className="control-row" style={{ marginTop: '0', alignItems: 'flex-start' }}>
                <span className="control-label" style={{ paddingTop: '10px' }}>Notes</span>
                <div className="slider-wrapper">
                  <textarea
                    style={{
                      width: '100%', backgroundColor: '#111111', border: '1px solid transparent', borderRadius: '16px',
                      color: 'var(--text-primary)', fontSize: '0.95rem', fontWeight: 500, padding: '10px 14px',
                      textAlign: 'left', minHeight: '120px', resize: 'vertical', lineHeight: '1.5',
                      transition: 'all 0.2s ease', boxSizing: 'border-box', fontFamily: 'inherit'
                    }}
                    value={currentTrack?.notes || ''}
                    onChange={(e) => dispatch({ type: 'UPDATE_TRACK_META', payload: { notes: e.target.value } })}
                    placeholder=""
                    aria-label="Track Notes"
                  />
                </div>
              </div>
            </div>
          )}
        </section>

        {state.sounds.map(sound => (
          <SoundPanel key={sound.id} sound={sound} />
        ))}

        <div className="add-noise-container">
          <button className="add-noise-btn" onClick={addSound}>Add a sound</button>
        </div>

        <img src={`${import.meta.env.BASE_URL}doom-logo.png`} alt="Doom Loop Logo" className="doom-logo-img" />
      </main>
    </div>
  );
}

function ListScreen({ listMode }: { listMode: 'tracks' | 'mixes' }) {
  const { state, dispatch } = useAppState();
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (state.listMode !== listMode) {
      dispatch({ type: 'SET_LIST_MODE', payload: listMode });
    }
  }, [listMode, state.listMode, dispatch]);

  const handleListTogglePlay = async (e: React.MouseEvent, track: TrackState) => {
    e.stopPropagation();
    await audioManager.initialize();

    const isTrackPlaying = state.isPlaying && state.playbackMode === 'track' && state.currentTrackId === track.id;
    if (isTrackPlaying) {
      dispatch({ type: 'TOGGLE_PLAY' });
    } else {
      dispatch({ type: 'LOAD_AND_PLAY_TRACK', payload: track });
    }
  };

  const handleMixListTogglePlay = async (e: React.MouseEvent, mix: MixState) => {
    e.stopPropagation();
    await audioManager.initialize();

    const isMixPlaying = state.isPlaying && state.playbackMode === 'mix' && state.currentMixId === mix.id;
    if (isMixPlaying) {
      dispatch({ type: 'TOGGLE_PLAY' });
    } else {
      dispatch({ type: 'LOAD_AND_PLAY_MIX', payload: mix.id });
    }
  };

  const handleCreateNewTrack = () => {
    dispatch({ type: 'CREATE_TRACK' });
  }

  const handleCreateNewMix = () => {
    dispatch({ type: 'CREATE_MIX' });
  }

  const handleImportClick = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const json = JSON.parse(event.target?.result as string);
        if (json.type === 'doom-loop-mix' && json.mix) {
          dispatch({ type: 'IMPORT_MIX', payload: { mix: json.mix, tracks: json.tracks || [] } });
        } else {
          dispatch({ type: 'IMPORT_TRACK', payload: json });
        }
      } catch (err) {
        console.error("Invalid JSON file", err);
        dispatch({ type: 'SET_TOAST', payload: "Invalid file." });
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleExportTrack = (e: React.MouseEvent, track: TrackState) => {
    e.stopPropagation();
    const { id, name, author, notes, ...rest } = track;
    const ordered = { id, name, author: author || '', notes: notes || '', ...rest };
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(ordered, null, 2));
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href", dataStr);
    downloadAnchorNode.setAttribute("download", `${track.name.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.json`);
    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
  };

  const handleExportMix = (e: React.MouseEvent, mix: MixState) => {
    e.stopPropagation();
    const trackIdsInMix = new Set(mix.items.map(item => item.trackId));
    const bundledTracks = state.savedTracks.filter(track => trackIdsInMix.has(track.id));
    const exportPayload = { type: 'doom-loop-mix', mix: mix, tracks: bundledTracks };
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(exportPayload, null, 2));
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href", dataStr);
    downloadAnchorNode.setAttribute("download", `${mix.name.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.json`);
    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
  };

  return (
    <div className="app-container load-screen">
      <img src={`${import.meta.env.BASE_URL}doom-logo.png`} alt="Doom Loop Logo" className="doom-logo-img" />
      <button className="alpha-sticker" onClick={() => navigate('/about')}>alpha</button>
      <div className="segmented-control">
        <button
          className={`segment-btn ${listMode === 'tracks' ? 'active' : ''}`}
          onClick={() => navigate('/tracks')}
        >
          Tracks
        </button>
        <button
          className={`segment-btn ${listMode === 'mixes' ? 'active' : ''}`}
          onClick={() => navigate('/mixes')}
        >
          Mixes
        </button>
      </div>

      <div className="quick-create-panel">
        <span className="quick-create-count">
          {listMode === 'tracks'
            ? `${state.savedTracks.length} ${state.savedTracks.length === 1 ? 'track' : 'tracks'}`
            : `${state.savedMixes.length} ${state.savedMixes.length === 1 ? 'mix' : 'mixes'}`
          }
        </span>
        <button
          className="quick-create-btn"
          onClick={listMode === 'tracks' ? handleCreateNewTrack : handleCreateNewMix}
        >
          {listMode === 'tracks' ? 'Create new track' : 'Create new mix'}
        </button>
      </div>

      <main className="main-content">
        {listMode === 'tracks' ? (
          <>
            <div className="track-list">
              {state.savedTracks.length === 0 ? (
                <p className="empty-state">No saved tracks yet.</p>
              ) : (
                state.savedTracks.map(track => {
                  const isTrackPlaying = state.isPlaying && state.playbackMode === 'track' && state.currentTrackId === track.id;
                  return (
                    <div key={track.id} className="track-list-item" onClick={() => navigate(`/tracks/${track.id}`)}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                        <button
                          className={`track-play-btn ${isTrackPlaying ? 'active' : ''}`}
                          onClick={(e) => handleListTogglePlay(e, track)}
                          aria-label={isTrackPlaying ? "Pause Track" : "Play Track"}
                        >
                          <div className="track-play-icon-circle">
                            {isTrackPlaying ? <PauseIcon /> : <PlayIcon />}
                          </div>
                        </button>
                        <span className="track-item-name">{track.name}</span>
                      </div>
                      <div className="track-list-item-actions">
                        <button className="icon-btn" data-tooltip="Export" onClick={(e) => handleExportTrack(e, track)} aria-label="Export Track">
                          <ExportIcon />
                        </button>
                        <button className="icon-btn" data-tooltip="Duplicate" onClick={(e) => { e.stopPropagation(); dispatch({ type: 'DUPLICATE_TRACK', payload: track.id }); }} aria-label="Duplicate Track">
                          <DuplicateIcon />
                        </button>
                        <button className="icon-btn delete-btn" data-tooltip="Delete" onClick={(e) => { e.stopPropagation(); dispatch({ type: 'DELETE_TRACK', payload: track.id }); }} aria-label="Delete Track">
                          <TrashIcon />
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
            <div className="create-track-container">
              <button className="create-track-btn" onClick={handleCreateNewTrack}>Create new track</button>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center', justifyContent: 'center' }}>
                <button className="import-track-link" onClick={handleImportClick}>Import track</button>
                <span style={{ color: 'var(--text-secondary)', opacity: 0.5 }}>&middot;</span>
                <button className="import-track-link" onClick={() => navigate('/community/mixes')}>Browse community mixes</button>
              </div>
              <input
                type="file"
                accept=".json"
                style={{ display: 'none' }}
                ref={fileInputRef}
                onChange={handleFileChange}
              />
            </div>
          </>
        ) : (
          <>
            <div className="track-list">
              {state.savedMixes.length === 0 ? (
                <p className="empty-state">No saved mixes yet.</p>
              ) : (
                state.savedMixes.map(mix => {
                  const isMixPlaying = state.isPlaying && state.playbackMode === 'mix' && state.currentMixId === mix.id;

                  const totalLengthMin = mix.lengthMinutes + (mix.items.length > 1 ? (mix.items.length - 1) * mix.crossFadeMinutes : 0);
                  const totalLengthSec = totalLengthMin * 60;
                  let mixTimeString = '';
                  if (totalLengthSec >= 3600) {
                    mixTimeString = formatLength(totalLengthMin);
                  } else {
                    const m = Math.floor(totalLengthSec / 60);
                    const s = Math.floor(totalLengthSec % 60).toString().padStart(2, '0');
                    mixTimeString = `${m}:${s}`;
                  }

                  return (
                    <div key={mix.id} className="track-list-item" onClick={() => navigate(`/mixes/${mix.id}`)}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flex: 1, minWidth: 0 }}>
                        <button
                          className={`track-play-btn ${isMixPlaying ? 'active' : ''}`}
                          onClick={(e) => handleMixListTogglePlay(e, mix)}
                          aria-label={isMixPlaying ? "Pause Mix" : "Play Mix"}
                        >
                          <div className="track-play-icon-circle">
                            {isMixPlaying ? <PauseIcon /> : <PlayIcon />}
                          </div>
                        </button>
                        <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                          <span className="track-item-name" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{mix.name}</span>
                          {mix.items.length > 0 && (
                            <span className="track-item-time-mobile" style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', opacity: 0.8, fontVariantNumeric: 'tabular-nums' }}>
                              {mixTimeString}
                            </span>
                          )}
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                        <div className="track-list-item-actions">
                          <button className="icon-btn" data-tooltip="Export" onClick={(e) => handleExportMix(e, mix)} aria-label="Export Mix">
                            <ExportIcon />
                          </button>
                          <button className="icon-btn" data-tooltip="Duplicate" onClick={(e) => { e.stopPropagation(); dispatch({ type: 'DUPLICATE_MIX', payload: mix.id }); }} aria-label="Duplicate Mix">
                            <DuplicateIcon />
                          </button>
                          <button className="icon-btn delete-btn" data-tooltip="Delete" onClick={(e) => { e.stopPropagation(); dispatch({ type: 'DELETE_MIX', payload: mix.id }); }} aria-label="Delete Mix">
                            <TrashIcon />
                          </button>
                        </div>
                        {mix.items.length > 0 && (
                          <span className="track-item-time-desktop" style={{ fontSize: '0.95rem', color: 'var(--text-secondary)', opacity: 0.8, fontVariantNumeric: 'tabular-nums', paddingRight: '10px' }}>
                            {mixTimeString}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
            <div className="create-track-container">
              <button className="create-track-btn" onClick={handleCreateNewMix}>Create new mix</button>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center', justifyContent: 'center' }}>
                <button className="import-track-link" onClick={handleImportClick}>Import mix</button>
                <span style={{ color: 'var(--text-secondary)', opacity: 0.5 }}>&middot;</span>
                <button className="import-track-link" onClick={() => navigate('/community/mixes')}>Browse community mixes</button>
              </div>
              <input
                type="file"
                accept=".json"
                style={{ display: 'none' }}
                ref={fileInputRef}
                onChange={handleFileChange}
              />
            </div>
          </>
        )}
      </main>
    </div>
  );
}



function CommunityListScreen() {
  const { state, dispatch } = useAppState();
  const navigate = useNavigate();
  const [isSubmitMixOpen, setIsSubmitMixOpen] = useState(false);
  const [selectedMixToSubmit, setSelectedMixToSubmit] = useState<string | null>(null);

  const handleSubmitMix = () => {
    if (!selectedMixToSubmit) return;
    const mix = state.savedMixes.find(m => m.id === selectedMixToSubmit);
    if (!mix) return;

    const trackIdsInMix = new Set(mix.items.map(item => item.trackId));
    const bundledTracks = state.savedTracks.filter(track => trackIdsInMix.has(track.id));
    const payload = { type: 'doom-loop-mix', mix, tracks: bundledTracks };
    const jsonStr = JSON.stringify(payload, null, 2);

    navigator.clipboard.writeText(jsonStr)
      .then(() => {
        dispatch({ type: 'SET_TOAST', payload: "Mix copied to clipboard! Please paste into the issue body." });
      })
      .catch(err => console.error("Clipboard failed", err));

    const title = encodeURIComponent(`Mix Submission: ${mix.name}`);
    const body = encodeURIComponent(`Please review my mix submission!\n\n*(Your mix JSON has been copied to your clipboard. Please paste it below!)*\n\n\`\`\`json\n[ PASTE JSON HERE ]\n\`\`\``);
    const issueUrl = `https://github.com/timpaul/doom-loop/issues/new?title=${title}&body=${body}`;
    window.open(issueUrl, '_blank');

    setIsSubmitMixOpen(false);
    setSelectedMixToSubmit(null);
  };

  useEffect(() => {
    if (state.listMode !== 'mixes') {
      dispatch({ type: 'SET_LIST_MODE', payload: 'mixes' });
    }
  }, [state.listMode, dispatch]);

  const handleMixListTogglePlay = async (e: React.MouseEvent, mix: MixState) => {
    e.stopPropagation();
    await audioManager.initialize();

    const isMixPlaying = state.isPlaying && state.playbackMode === 'mix' && state.currentMixId === mix.id;
    if (isMixPlaying) {
      dispatch({ type: 'TOGGLE_PLAY' });
    } else {
      dispatch({ type: 'LOAD_AND_PLAY_MIX', payload: mix.id });
    }
  };

  return (
    <div className="app-container load-screen community-mode">
      <img src={`${import.meta.env.BASE_URL}doom-logo-community.png`} alt="Doom Loop Logo" className="doom-logo-img community-logo" />
      <span className="community-pill">community mixes</span>

      <div className="quick-create-panel community-quick-panel">
        <span className="quick-create-count" style={{ color: '#000', fontWeight: 500 }}>
          {state.communityMixes.length} mixes
        </span>
        <button
          className="quick-create-btn"
          onClick={() => {
            setSelectedMixToSubmit(null);
            setIsSubmitMixOpen(true);
          }}
        >
          Submit mix
        </button>
      </div>

      <main className="main-content">
        <div className="track-list">
          {state.communityMixes.length === 0 ? (
            <p className="empty-state" style={{ color: '#111' }}>No community mixes yet.</p>
          ) : (
            state.communityMixes.map(mix => {
              const isMixPlaying = state.isPlaying && state.playbackMode === 'mix' && state.currentMixId === mix.id;

              return (
                <div key={mix.id} className="track-list-item community-list-item" onClick={() => navigate(`/community/mixes/${mix.id}`)}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flex: 1, minWidth: 0 }}>
                    <button
                      className={`track-play-btn ${isMixPlaying ? 'active' : ''}`}
                      onClick={(e) => handleMixListTogglePlay(e, mix)}
                      aria-label={isMixPlaying ? "Pause Mix" : "Play Mix"}
                    >
                      <div className="track-play-icon-circle">
                        {isMixPlaying ? <PauseIcon /> : <PlayIcon />}
                      </div>
                    </button>
                    <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                      <span className="track-item-name" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{mix.name}</span>
                      {mix.items.length > 0 && (
                        <span style={{ fontSize: '0.9rem', color: '#888888', opacity: 0.8, fontVariantNumeric: 'tabular-nums' }}>
                          {mix.items.length} track{mix.items.length !== 1 ? 's' : ''} &middot; {formatLengthFullWords(mix.lengthMinutes + (mix.items.length > 1 ? (mix.items.length - 1) * mix.crossFadeMinutes : 0))}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="track-list-item-actions">
                    <button className="add-library-btn" onClick={(e) => { e.stopPropagation(); dispatch({ type: 'ADD_COMMUNITY_MIX', payload: mix.id }); }}>
                      Add to library
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
        <div className="create-track-container" style={{ marginTop: '20px' }}>
          <button className="quick-create-btn" onClick={() => navigate('/mixes')}>Back to my library</button>
        </div>
      </main>

      {isSubmitMixOpen && (
        <div className="modal-overlay">
          <div className="modal-track-list">
            <div className="modal-header">
              <div style={{ width: '40px' }} />
              <h2 className="modal-title">Select mix to submit via GitHub</h2>
              <button className="modal-close-btn" onClick={() => setIsSubmitMixOpen(false)} aria-label="Close modal">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18"></line>
                  <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
              </button>
            </div>

            {state.savedMixes.length === 0 ? (
              <p className="empty-state" style={{ padding: '20px', color: '#888' }}>No saved mixes to submit.</p>
            ) : (
              state.savedMixes.map(m => {
                const isSelected = selectedMixToSubmit === m.id;
                return (
                  <div
                    key={m.id}
                    className={`modal-track-item ${isSelected ? 'selected' : ''}`}
                    onClick={() => setSelectedMixToSubmit(isSelected ? null : m.id)}
                  >
                    <div className="custom-checkbox" />
                    <span style={{ fontSize: '1.1rem' }}>{m.name}</span>
                  </div>
                );
              })
            )}

            <div className="modal-actions">
              <button
                className="create-track-btn"
                onClick={handleSubmitMix}
                disabled={!selectedMixToSubmit}
                style={{ opacity: !selectedMixToSubmit ? 0.5 : 1 }}
              >
                Create submission request
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function CommunityMixDetailScreen() {
  const { togglePlay } = useAudioActions();
  const { state, dispatch } = useAppState();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [, setTick] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => setTick(t => t + 1), 500);
    return () => clearInterval(interval);
  }, []);

  const mix = state.communityMixes.find(m => m.id === id);

  useEffect(() => {
    if (mix && state.currentMixId !== mix.id) {
      dispatch({ type: 'LOAD_MIX', payload: mix.id });
    }
  }, [mix, dispatch, state.currentMixId]);

  if (!mix) return <NotFoundScreen type="Mix" />;

  const isMixPlaying = state.isPlaying && state.playbackMode === 'mix' && state.currentMixId === mix.id;

  return (
    <div className="app-container community-mode">
      <div className="top-play-area">
        <button
          className="tracks-nav-btn"
          onClick={() => navigate('/community/mixes')}
          aria-label="Back to Community"
        >
          <img src={`${import.meta.env.BASE_URL}grid-icon-community.png`} alt="Back to mixes" className="grid-icon-img community-logo" />
        </button>
        <button
          className="play-button"
          onClick={togglePlay}
          aria-label={isMixPlaying ? "Pause" : "Play"}
        >
          {isMixPlaying ? <PauseIcon /> : <PlayIcon />}
        </button>
      </div>

      <header className="track-header" style={{ marginBottom: '24px', flexDirection: 'column', gap: '8px', position: 'relative' }}>
        <div style={{ fontSize: '2rem', fontWeight: 500, textAlign: 'center', color: '#111', marginBottom: '8px', letterSpacing: '-0.5px' }}>
          {mix.name}
        </div>
        <div style={{ fontSize: '0.9rem', color: '#333', opacity: 0.8, letterSpacing: '0.5px' }}>
          {mix.items.length} track{mix.items.length !== 1 ? 's' : ''}
          {mix.items.length > 0 && ` · ${formatLengthFullWords(mix.lengthMinutes + (mix.items.length > 1 ? (mix.items.length - 1) * mix.crossFadeMinutes : 0))}`}
        </div>
        <button className="add-library-btn" style={{ marginTop: '16px', backgroundColor: '#333', color: '#eee' }} onClick={(e) => { e.stopPropagation(); dispatch({ type: 'ADD_COMMUNITY_MIX', payload: mix.id }); }}>
          Add mix to library
        </button>
      </header>

      <main className="main-content">
        <div className="track-list" style={{ marginTop: '0' }}>
          {mix.items.map((item) => {
            const allTracks = [...state.savedTracks, ...state.communityTracks];
            const track = allTracks.find(t => t.id === item.trackId);
            if (!track) return null;
            const isTrackPlaying = state.isPlaying && mixPlayer.isTrackPlaying(item.id);

            const N = mix.items.length;
            const totalLengthSec = mix.lengthMinutes * 60;
            const crossfadeSec = mix.crossFadeMinutes * 60;
            const totalTargetDuration = totalLengthSec + (N > 1 ? (N - 1) * crossfadeSec : 0);
            const totalWeight = mix.items.reduce((sum, it) => sum + (it.weight || 1), 0);
            const itemWeight = item.weight || 1;
            const itemLengthSec = (itemWeight / totalWeight) * totalTargetDuration;
            let itemTimeString = '';
            if (itemLengthSec >= 3600) {
              itemTimeString = formatLength(itemLengthSec / 60);
            } else {
              const m = Math.floor(itemLengthSec / 60);
              const s = Math.floor(itemLengthSec % 60).toString().padStart(2, '0');
              itemTimeString = `${m}:${s}`;
            }
            return (
              <div
                key={item.id}
                className="track-list-item community-list-item"
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flex: 1, minWidth: 0 }}>
                  <button
                    className={`track-play-btn ${isTrackPlaying ? 'active' : ''}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (isTrackPlaying) {
                        togglePlay();
                      } else {
                        mixPlayer.pendingSeekItemId = item.id;
                        if (!state.isPlaying || state.playbackMode !== 'mix' || state.currentMixId !== mix.id) {
                          dispatch({ type: 'LOAD_AND_PLAY_MIX', payload: mix.id });
                        } else {
                          mixPlayer.seekToItem(item.id);
                          mixPlayer.pendingSeekItemId = null;
                        }
                      }
                      setTick(t => t + 1);
                    }}
                    aria-label={isTrackPlaying ? "Pause Track" : "Play Track"}
                  >
                    <div className="track-play-icon-circle">
                      {isTrackPlaying ? <PauseIcon /> : <PlayIcon />}
                    </div>
                  </button>
                  <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0, gap: '4px' }}>
                    <span className="track-item-name" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{track.name}</span>
                    <span style={{ fontSize: '0.85rem', color: '#888888', fontVariantNumeric: 'tabular-nums' }}>{itemTimeString}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </main>
    </div>
  );
}

function RouteSync() {
  const { state, dispatch } = useAppState();
  const navigate = useNavigate();
  const location = useLocation();
  const currentPath = location.pathname;

  const prevTrackId = useRef(state.currentTrackId);
  const prevMixId = useRef(state.currentMixId);
  const prevScreen = useRef(state.currentScreen);

  useEffect(() => {
    // Sync URL -> State
    const isMixDetail = currentPath.startsWith('/mixes/') || currentPath.startsWith('/community/mixes/') && currentPath.length > 17;
    const isTrackDetail = currentPath.startsWith('/tracks/');

    if (isTrackDetail && state.currentScreen !== 'main') {
      dispatch({ type: 'SET_SCREEN', payload: 'main' });
    } else if (isMixDetail && state.currentScreen !== 'mixDetail') {
      dispatch({ type: 'SET_SCREEN', payload: 'mixDetail' });
    } else if (!isTrackDetail && !isMixDetail && state.currentScreen !== 'load') {
      dispatch({ type: 'SET_SCREEN', payload: 'load' });
    }

    // Sync State -> URL
    if (state.currentScreen === 'main' && prevScreen.current === 'load' && state.currentTrackId !== prevTrackId.current) {
      if (!currentPath.startsWith('/tracks/')) navigate(`/tracks/${state.currentTrackId}`);
    } else if (state.currentScreen === 'mixDetail' && prevScreen.current === 'load' && state.currentMixId !== prevMixId.current) {
      // Only force navigate to /mixes/ if we aren't already on the community mix screen.
      if (!currentPath.startsWith('/mixes/') && !currentPath.startsWith('/community/mixes/')) {
        navigate(`/mixes/${state.currentMixId}`);
      }
    }

    prevTrackId.current = state.currentTrackId;
    prevMixId.current = state.currentMixId;
    prevScreen.current = state.currentScreen;
  }, [state.currentScreen, state.currentTrackId, state.currentMixId, currentPath, navigate, dispatch]);

  return null;
}

function App() {
  const { state, dispatch } = useAppState();
  const location = useLocation();

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [location.pathname]);

  useEffect(() => {
    if (state.toastMessage) {
      const timer = setTimeout(() => {
        dispatch({ type: 'SET_TOAST', payload: null });
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [state.toastMessage, dispatch]);

  const navigate = useNavigate();

  return (
    <>
      <RouteSync />
      <Routes>
        <Route path="/" element={<Navigate to="/tracks" replace />} />
        <Route path="/tracks" element={<ListScreen listMode="tracks" />} />
        <Route path="/tracks/:id" element={<TrackDetailScreen />} />
        <Route path="/mixes" element={<ListScreen listMode="mixes" />} />
        <Route path="/mixes/:id" element={<MixDetailScreen />} />

        <Route path="/community/mixes" element={<CommunityListScreen />} />
        <Route path="/community/mixes/:id" element={<CommunityMixDetailScreen />} />

        <Route path="/about" element={<AboutScreen />} />
        <Route path="*" element={<NotFoundScreen />} />
      </Routes>

      <footer className="app-footer">
        &copy; 2026 <a href="https://www.timpaul.co.uk" target="_blank" rel="noopener noreferrer">Tim Paul</a> &middot; <button className="text-btn" onClick={() => navigate('/about')}>What <em>is</em> this?</button>
      </footer>

      {state.toastMessage && (
        <div className="toast-notification">
          {state.toastMessage}
        </div>
      )}
    </>
  );
}

export default App;
