# Doom Loop

A browser-based generative music environment for creating, sequencing, and mixing ambient, drone, and experimental electronic music. Built with [Tone.js](https://tonejs.github.io/), React, and TypeScript.

**Live at [doomloop.cc](https://doomloop.cc)**

## Getting Started

```bash
npm install
npm run dev          # Start dev server
npm run build        # Production build
npm run deploy       # Deploy to GitHub Pages
```

## Architecture

```
src/
├── App.tsx              # All UI components (SoundPanel, MixDetailScreen, App)
├── App.css              # App-specific styles
├── index.css            # Base styles & CSS custom properties
├── types.ts             # Data types, defaults, and migration logic
├── AboutContent.ts      # In-app help text (rendered as markdown)
├── state/
│   └── AppContext.tsx    # React context + reducer for all app state
└── audio/
    ├── AudioEngine.ts   # Single sound source: oscillators, filters, LFOs, effects
    ├── AudioManager.ts  # Manages multiple AudioEngines, routing, and lifecycle
    ├── MixPlayer.ts     # Schedules multi-track mixes with fading and crossfading
    └── presets/          # Built-in track JSON files
```

### Audio Pipeline

Each sound gets its own `AudioEngine` instance with this signal chain:

```
Source (Noise or PolySynth)
  → Filter (bandpass/lowpass)
    → AutoFilter (LFO-modulated filter sweep)
      → Volume LFO Gain
        → Chorus → Chebyshev → Distortion → Delay → Reverb
          → Vibrato (detune LFO)
            → Panner (with optional pan LFO)
              → Output
```

`AudioManager` maps sound IDs to engine instances and syncs their parameters from the app state. `MixPlayer` sits above this, scheduling which tracks play when during a mix.

### State Management

All state lives in a single React reducer (`AppContext.tsx`). Changes auto-save to `localStorage`. The reducer handles tracks, mixes, sounds, and playback. Audio syncing happens in a `useEffect` that responds to state changes.

## Data Formats

Doom Loop stores tracks and mixes as JSON. You can export them from the app and re-import them — or write them by hand / generate them with AI.

### Track Format

A track is a collection of layered sounds:

```jsonc
{
  "id": "track-1234567890",       // Unique ID (typically "track-" + timestamp)
  "name": "My Track",
  "author": "",                    // Optional
  "notes": "",                     // Optional
  "sounds": [ /* array of Sound objects */ ]
}
```

### Sound Object

Each sound is either a noise generator or a tone synthesizer with sequencing, effects, and modulation:

```jsonc
{
  // --- Identity ---
  "id": "1",                       // Unique within the track
  "name": "Drone",
  "sourceType": "tone",            // "tone" or "noise"
  "noiseColor": "brown",           // Only used when sourceType is "noise"
                                   // Options: "white", "pink", "brown", "blue", "purple", "green"
  "isMuted": false,

  // --- Sequencer ---
  // 8 steps, each with its own notes and octave.
  // Only steps with a numeric ratio in stepRatios are played.
  // Steps with null ratios are skipped. A "-" ratio creates a rest.
  "stepConfigs": [
    { "activeNotes": ["C", "Eb", "G"], "octave": 3 },
    { "activeNotes": ["C", "Eb", "G"], "octave": 3 },
    // ... (8 total)
  ],
  "stepRatios": [1, 1, 2, null, null, null, null, null],
    // Integer ratios defining relative step lengths.
    // Example: [1, 1, 2] = 3 steps where the last is twice as long.
    // All nulls = continuous (no sequencing, step 1 plays forever).
    // A "-" value = a silent rest with ratio 1.
  "seqLengthScale": "minute",      // "second", "minute", or "hour" (UI scale only)
  "seqLengthRate": 30,             // Total loop length in seconds
  "playMode": "chord",             // "chord" (all notes) or "random" (one random note per step)

  // --- Envelope (ADSR) ---
  "envAttack": 0.5,                // 0–10 seconds
  "envDecay": 0.1,                 // 0–10 seconds
  "envSustain": 1.0,               // 0–1
  "envRelease": 2.0,               // 0–10 seconds
  "noteLengthRatio": 1.0,          // 0.1–1.0, percentage of step duration to play

  // --- Volume & Pan ---
  "volume": 0.5,                   // 0–1
  "pan": 0,                        // -1 (left) to 1 (right)

  // --- Filter ---
  "filterFreq": 1000,              // Static filter frequency (Hz)
  "filterQ": 1,                    // Filter resonance

  // --- Volume LFO ---
  "volLfoType": "sine",            // "sine" or "random"
  "volLfoScale": "minute",         // UI scale: "second", "minute", "hour"
  "volLfoRate": 30,                // LFO cycle duration in seconds
  "volLfoDepth": 0,                // 0–1

  // --- Pan LFO ---
  "panLfoType": "sine",
  "panLfoScale": "minute",
  "panLfoRate": 30,
  "panLfoDepth": 0,                // 0–1

  // --- Filter LFO (AutoFilter) ---
  "autoFilterType": "sine",        // "sine" or "random"
  "autoFilterScale": "minute",
  "autoFilterRate": 45,            // Cycle duration in seconds
  "autoFilterBaseFreq": 8000,      // Base frequency (Hz)
  "autoFilterOctaves": 1,          // Sweep range in octaves (0.1–10)

  // --- Detune LFO (Vibrato) ---
  "detuneLfoType": "sine",
  "detuneLfoScale": "minute",
  "detuneLfoRate": 30,
  "detuneLfoDepth": 0,             // 0–1

  // --- Effects ---
  "reverbAmount": 0,               // 0–1 (wet/dry mix)
  "delayAmount": 0,                // 0–1
  "chorusAmount": 0,               // 0–1
  "distortionAmount": 0,           // 0–1
  "chebyshevAmount": 0,            // 0–1

  // --- Pitch ---
  "detune": 0                      // -50 to +50 cents
}
```

#### Notes Format

Notes use standard pitch class names: `C`, `C#`, `D`, `Eb`, `E`, `F`, `F#`, `G`, `G#`, `A`, `Bb`, `B`. Octave range is 1–5 (set per step in `stepConfigs`).

#### Sequencer Logic

The sequencer distributes time across active steps based on their ratios:

- `[1, 1, 1, 1]` → 4 equal steps
- `[1, 2]` → 2 steps, second is twice as long
- `[1, "-", 1]` → step, rest, step (rest has ratio 1)
- `[null, null, ...]` → all nulls = continuous sound (no looping)

### Mix Format

Mixes reference tracks by ID and play them sequentially (or shuffled):

```jsonc
{
  "id": "mix-1234567890",
  "name": "Sleep Mix",
  "items": [
    { "id": "item-abc", "trackId": "track-1234567890" },
    { "id": "item-def", "trackId": "track-9876543210" }
  ],
  "lengthMinutes": 60,             // Total mix duration, split evenly across tracks
  "shuffle": false,                // Randomize track order
  "repeat": false,                 // Loop when finished
  "fadeInMinutes": 2,              // Fade in at start (0–10)
  "fadeOutMinutes": 2,             // Fade out at end (0–10)
  "crossFadeMinutes": 1            // Crossfade between tracks (0–10)
}
```

#### Exported Mix Format

When exported, mixes bundle their referenced tracks for portability:

```jsonc
{
  "type": "doom-loop-mix",
  "mix": { /* MixState object */ },
  "tracks": [ /* array of TrackState objects */ ]
}
```

## Tech Stack

- **[Tone.js](https://tonejs.github.io/)** — Web Audio synthesis, sequencing, and effects
- **[React](https://react.dev/)** 19 — UI
- **[Vite](https://vite.dev/)** — Build tool with PWA plugin for offline support
- **[@tonaljs/tonal](https://github.com/tonaljs/tonal)** — Music theory (chord detection/parsing)

## Contributing

Fork the repo at [github.com/timpaul/doom-loop](https://github.com/timpaul/doom-loop) and submit a pull request. Track and mix contributions welcome!
