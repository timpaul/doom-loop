import os
import json

# 1. Create directory and dummy tracks
os.makedirs("src/audio/community", exist_ok=True)

sample_mix = {
  "type": "doom-loop-mix",
  "mix": {
    "id": "comm-mix-1",
    "name": "Ornstein-Uhlenbeck Device",
    "items": [
      {
        "id": "item-1",
        "trackId": "comm-track-1",
        "delayMinutes": 0,
        "volume": 1
      }
    ],
    "lengthMinutes": 10,
    "crossFadeMinutes": 0.5,
    "sequential": False
  },
  "tracks": [
    {
      "id": "comm-track-1",
      "name": "Barkhan Song",
      "sounds": [
        {
          "id": "1",
          "name": "Drone 1",
          "type": "noise",
          "color": "pink",
          "volume": 0.5,
          "isPlaying": True,
          "lfo": "none",
          "lfoRate": 0.1,
          "lfoDepth": 0.5
        }
      ]
    }
  ]
}

with open("src/audio/community/ornstein.json", "w") as f:
    json.dump(sample_mix, f, indent=2)


sample_track = {
    "id": "comm-track-2",
    "name": "Gigabaud",
    "author": "Community User",
    "sounds": [
        {
          "id": "1",
          "name": "Sine",
          "type": "oscillator",
          "color": "sine",
          "volume": 0.8,
          "isPlaying": True,
          "lfo": "none",
          "lfoRate": 0.1,
          "lfoDepth": 0.5
        }
    ]
}

with open("src/audio/community/gigabaud.json", "w") as f:
    json.dump(sample_track, f, indent=2)


# 2. Patch AppContext.tsx
filepath = "src/state/AppContext.tsx"
with open(filepath, "r") as f:
    content = f.read()

community_loading_code = """
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
"""

# Inject after trackMap
content = content.replace(
    "const DEFAULT_TRACKS: TrackState[] = Array.from(trackMap.values())\n    .sort((a, b) => a.name.localeCompare(b.name));",
    "const DEFAULT_TRACKS: TrackState[] = Array.from(trackMap.values())\n    .sort((a, b) => a.name.localeCompare(b.name));\n" + community_loading_code
)

# AppState interface
content = content.replace(
    "currentMixId: string | null;",
    "currentMixId: string | null;\n    communityTracks: TrackState[];\n    communityMixes: MixState[];"
)

# Action type
content = content.replace(
    "| { type: 'IMPORT_MIX'; payload: { mix: Omit<MixState, 'items'> & { items: any[] }, tracks: TrackState[] } }",
    "| { type: 'IMPORT_MIX'; payload: { mix: Omit<MixState, 'items'> & { items: any[] }, tracks: TrackState[] } }\n    | { type: 'ADD_COMMUNITY_TRACK'; payload: string }\n    | { type: 'ADD_COMMUNITY_MIX'; payload: string }"
)

# getInitialState return
content = content.replace(
    "savedMixes,",
    "savedMixes,\n        communityTracks: COMMUNITY_TRACKS,\n        communityMixes: communityMixesList,"
)


# appReducer actions
reducer_actions = """
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
"""

content = content.replace(
    "        case 'ADD_TRACK_TO_MIX': {",
    reducer_actions + "\n        case 'ADD_TRACK_TO_MIX': {"
)

with open(filepath, "w") as f:
    f.write(content)

print("App context patched and dummy files created.")
