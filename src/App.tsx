import { useState, useRef, useCallback, useEffect } from 'react'
import { Chord, Note } from '@tonaljs/tonal'
import './App.css'
import { useAppState } from './state/AppContext'
import { audioManager } from './audio/AudioManager'
import type { SoundState, TrackState, LFOScale } from './types'
import type { NoiseColor } from './audio/AudioEngine'

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
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <button className="icon-btn delete-btn" onClick={onDelete} aria-label="Delete Sound">
            <TrashIcon />
          </button>
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
                  Tones
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
                  <span className="control-label">Adjust</span>
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
                {sound.sourceType === 'tone' && (
                  <div className="control-row">
                    <span className="control-label">Play</span>
                    <div className="segmented-control" style={{ marginTop: 0 }}>
                      <button
                        className={`segment-btn ${sound.playMode !== 'random' ? 'active' : ''}`}
                        onClick={() => update({ playMode: 'chord' })}
                      >
                        All notes
                      </button>
                      <button
                        className={`segment-btn ${sound.playMode === 'random' ? 'active' : ''}`}
                        onClick={() => update({ playMode: 'random' })}
                      >
                        Random note
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </section>

          {sound.sourceType === 'tone' && (
            <section className={`panel-group ${collapsedPanels['TONES'] ? 'collapsed' : ''}`}>
              <h2 className="panel-title" onClick={() => togglePanel('TONES')}>TONES</h2>
              {!collapsedPanels['TONES'] && (
                <>
                  <div className="control-row">
                    <span className="control-label">Step</span>
                    <div className="segmented-control" style={{ marginTop: 0 }}>
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

          <section className={`panel-group ${collapsedPanels['VOLUME'] ? 'collapsed' : ''}`}>
            <h2 className="panel-title" onClick={() => togglePanel('VOLUME')}>VOLUME</h2>
            {!collapsedPanels['VOLUME'] && (
              <>
                <div className="control-row">
                  <div className="slider-wrapper">
                    <input type="range" min="0" max="1" step="0.01" value={sound.volume} onChange={e => update({ volume: parseFloat(e.target.value) })} aria-label="Volume" />
                  </div>
                </div>

                <div className={`sub-panel ${collapsedPanels['VOLUME_LFO'] ? 'collapsed' : ''}`} style={{ marginTop: '12px', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '12px' }}>
                  <h3 className="panel-title" onClick={() => togglePanel('VOLUME_LFO')} >LFO</h3>
                  {!collapsedPanels['VOLUME_LFO'] && (
                    <>
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
                        <span className="control-label">Adjust</span>
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

                <div className={`sub-panel ${collapsedPanels['PAN_LFO'] ? 'collapsed' : ''}`} style={{ marginTop: '12px', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '12px' }}>
                  <h3 className="panel-title" onClick={() => togglePanel('PAN_LFO')} >LFO</h3>
                  {!collapsedPanels['PAN_LFO'] && (
                    <>
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
                        <span className="control-label">Adjust</span>
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

                <div className={`sub-panel ${collapsedPanels['FILTER_LFO'] ? 'collapsed' : ''}`} style={{ marginTop: '12px', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '12px' }}>
                  <h3 className="panel-title" onClick={() => togglePanel('FILTER_LFO')} >LFO</h3>
                  {!collapsedPanels['FILTER_LFO'] && (
                    <>
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
                        <span className="control-label">Adjust</span>
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
                <div className="control-row">
                  <span className="control-label">Chebyshev</span>
                  <div className="slider-wrapper">
                    <input type="range" min="0" max="1" step="0.01" value={sound.chebyshevAmount ?? 0} onChange={e => update({ chebyshevAmount: parseFloat(e.target.value) })} aria-label="Chebyshev" />
                  </div>
                </div>
              </>
            )}
          </section>

          <section className={`panel-group ${collapsedPanels['PITCH'] ? 'collapsed' : ''}`}>
            <h2 className="panel-title" onClick={() => togglePanel('PITCH')}>PITCH</h2>
            {!collapsedPanels['PITCH'] && (
              <div className="control-row">
                <span className="control-label">Detune</span>
                <div className="slider-wrapper">
                  <input type="range" min="-50" max="50" step="1" value={sound.detune ?? 0} onChange={e => update({ detune: parseInt(e.target.value, 10) })} aria-label="Detune" />
                </div>
              </div>
            )}
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
    // ALWAYS ensure the context is running on user interaction to prevent iOS or browser suspending
    await audioManager.resumeContext();

    if (!initialized.current) {
      await audioManager.initialize();
      initialized.current = true;
    }

    // Always connect the stream if not connected, regardless of initialization timing
    if (audioRef.current && !audioRef.current.srcObject) {
      audioRef.current.srcObject = audioManager.getSharedStream();
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

  const handleListTogglePlay = async (e: React.MouseEvent, track: TrackState) => {
    e.stopPropagation();
    await audioManager.resumeContext(); // ensure iOS compliance

    if (!initialized.current) {
      await audioManager.initialize();
      initialized.current = true;
    }

    if (audioRef.current && !audioRef.current.srcObject) {
      audioRef.current.srcObject = audioManager.getSharedStream();
    }

    const isTrackPlaying = state.isPlaying && state.currentTrackId === track.id;

    if (isTrackPlaying) {
      if (audioRef.current) audioRef.current.pause();
      dispatch({ type: 'TOGGLE_PLAY' });
    } else {
      if (state.isPlaying) {
        audioManager.stopAll();
      }
      if (audioRef.current) {
        audioRef.current.play().catch(err => console.log('Background audio play failed:', err));
      }
      dispatch({ type: 'LOAD_AND_PLAY_TRACK', payload: track });
    }
  };

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

  const loadTrack = (track: TrackState) => {
    dispatch({ type: 'LOAD_TRACK', payload: track });
  }

  const handleDuplicateTrack = (e: React.MouseEvent, trackId: string) => {
    e.stopPropagation();
    dispatch({ type: 'DUPLICATE_TRACK', payload: trackId });
  };

  const removeSavedTrack = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    dispatch({ type: 'DELETE_TRACK', payload: id });
  }

  const handleCreateNewTrack = () => {
    dispatch({ type: 'CREATE_TRACK' });
  }

  const handleExportTrack = (e: React.MouseEvent, track: TrackState) => {
    e.stopPropagation();
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(track, null, 2));
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href", dataStr);
    downloadAnchorNode.setAttribute("download", `${track.name.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.json`);
    document.body.appendChild(downloadAnchorNode); // required for firefox
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
  };

  const fileInputRef = useRef<HTMLInputElement>(null);

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
        dispatch({ type: 'IMPORT_TRACK', payload: json });
      } catch (err) {
        console.error("Invalid JSON file", err);
        dispatch({ type: 'SET_TOAST', payload: "Invalid track file." });
      }
    };
    reader.readAsText(file);
    // Reset input so the same file can be selected again
    e.target.value = '';
  };

  return (
    <>
      {state.currentScreen === 'load' ? (
        <div className="app-container load-screen">
          <img src="/doom-logo.png" alt="Doom Loop Logo" className="doom-logo-img" style={{ margin: '20px auto 10px auto' }} />
          <main className="main-content">
            <div className="track-list">
              {state.savedTracks.length === 0 ? (
                <p className="empty-state">No saved tracks yet.</p>
              ) : (
                state.savedTracks.map(track => {
                  const isTrackPlaying = state.isPlaying && state.currentTrackId === track.id;
                  return (
                    <div key={track.id} className="track-list-item" onClick={() => loadTrack(track)}>
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
                        <button className="icon-btn" data-tooltip="Duplicate" onClick={(e) => handleDuplicateTrack(e, track.id)} aria-label="Duplicate Track">
                          <DuplicateIcon />
                        </button>
                        <button className="icon-btn delete-btn" data-tooltip="Delete" onClick={(e) => removeSavedTrack(e, track.id)} aria-label="Delete Track">
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
              <button className="import-track-link" onClick={handleImportClick}>Import track</button>
              <input
                type="file"
                accept=".json"
                style={{ display: 'none' }}
                ref={fileInputRef}
                onChange={handleFileChange}
              />
            </div>
          </main>
        </div>
      ) : (
        <div className="app-container">
          <div className="top-play-area">
            <button
              className="tracks-nav-btn"
              onClick={() => dispatch({ type: 'SET_SCREEN', payload: 'load' })}
              aria-label="Back to Tracks"
            >
              <img src="/grid-icon.png" alt="Back to tracks" className="grid-icon-img" />
            </button>
            <button
              className="play-button"
              onClick={togglePlay}
              aria-label={state.isPlaying ? "Pause" : "Play"}
            >
              {state.isPlaying ? <PauseIcon /> : <PlayIcon />}
            </button>
          </div>

          <header className="track-header">
            <input
              type="text"
              className="track-name-input"
              value={state.currentTrackName}
              onChange={(e) => dispatch({ type: 'SET_TRACK_NAME', payload: e.target.value })}
              aria-label="Track Name"
              placeholder="Name your track..."
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

            <img src="/doom-logo.png" alt="Doom Loop Logo" className="doom-logo-img" />
          </main>
        </div>
      )}
      <audio ref={audioRef} preload="none" playsInline />
    </>
  );
}

export default App
