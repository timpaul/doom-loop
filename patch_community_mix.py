import re
import os

filepath = 'src/App.tsx'
with open(filepath, 'r') as f:
    content = f.read()


new_community_list_screen = """
function CommunityListScreen() {
  const { state, dispatch } = useAppState();
  const navigate = useNavigate();

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

      <div className="quick-create-panel community-quick-panel" style={{ marginTop: '24px' }}>
        <span className="quick-create-count" style={{ color: '#000', fontWeight: 500 }}>
          {state.communityMixes.length} mixes
        </span>
        <button
          className="quick-create-btn"
          onClick={() => window.open('https://github.com/timpaul/doom-loop/tree/main/src/audio/community', '_blank')}
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
      </main>
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
          <img src={`${import.meta.env.BASE_URL}grid-icon.png`} alt="Back to mixes" className="grid-icon-img community-logo" />
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
          {mix.items.length > 0 && ` \u00B7 ${formatLengthFullWords(mix.lengthMinutes + (mix.items.length > 1 ? (mix.items.length - 1) * mix.crossFadeMinutes : 0))}`}
        </div>
        <button className="add-library-btn" style={{ marginTop: '16px', backgroundColor: '#333', color: '#eee' }} onClick={(e) => { e.stopPropagation(); dispatch({ type: 'ADD_COMMUNITY_MIX', payload: mix.id }); }}>
          Add mix to library
        </button>
      </header>

      <main className="main-content">
        <div className="track-list" style={{ marginTop: '0' }}>
          {mix.items.map((item, index) => {
            const allTracks = [...state.savedTracks, ...state.communityTracks];
            const track = allTracks.find(t => t.id === item.trackId);
            if (!track) return null;
            const isTrackPlaying = state.isPlaying && mixPlayer.isTrackPlaying(item.id);

            const N = mix.items.length;
            const totalLengthSec = mix.lengthMinutes * 60;
            const crossfadeSec = mix.crossFadeMinutes * 60;
            let itemLengthSec = totalLengthSec;
            if (N > 1) {
              itemLengthSec = (totalLengthSec + (N - 1) * crossfadeSec) / N;
            }
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
                        if (mixPlayer.currentMixId !== mix.id) {
                          mixPlayer.loadMix(mix, allTracks);
                        }
                        mixPlayer.seekToItem(item.id);
                        if (!state.isPlaying) {
                          togglePlay();
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
"""

# Regex substitution
pattern = r"function CommunityListScreen\(\{ listMode \}: \{ listMode: 'tracks' \| 'mixes' \}\) \{[\s\S]*?(?=function RouteSync\(\) \{)"
content = re.sub(pattern, new_community_list_screen + "\n", content)

# Route updates
content = content.replace(
    '<Route path="/community/tracks" element={<CommunityListScreen listMode="tracks" />} />\n        <Route path="/community/mixes" element={<CommunityListScreen listMode="mixes" />} />',
    '<Route path="/community/mixes" element={<CommunityListScreen />} />\n        <Route path="/community/mixes/:id" element={<CommunityMixDetailScreen />} />'
)

# Footer updates
# We already changed it to `/community/tracks` previously, now it needs to be `/community/mixes`
content = content.replace("navigate('/community/tracks')", "navigate('/community/mixes')")

with open(filepath, 'w') as f:
    f.write(content)

print("Patch complete.")
