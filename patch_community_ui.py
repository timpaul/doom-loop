import os

filepath = 'src/App.tsx'
with open(filepath, 'r') as f:
    content = f.read()

community_screen_code = """
function CommunityListScreen({ listMode }: { listMode: 'tracks' | 'mixes' }) {
  const { state, dispatch } = useAppState();
  const navigate = useNavigate();

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

  return (
    <div className="app-container load-screen community-mode">
      <img src={`${import.meta.env.BASE_URL}doom-logo.png`} alt="Doom Loop Logo" className="doom-logo-img community-logo" />
      <span className="community-pill">community</span>
      <div className="segmented-control community-segmented-control">
        <button
          className={`segment-btn ${listMode === 'tracks' ? 'active' : ''}`}
          onClick={() => navigate('/community/tracks')}
        >
          Tracks
        </button>
        <button
          className={`segment-btn ${listMode === 'mixes' ? 'active' : ''}`}
          onClick={() => navigate('/community/mixes')}
        >
          Mixes
        </button>
      </div>

      <div className="quick-create-panel community-quick-panel">
        <span className="quick-create-count" style={{ color: '#000', fontWeight: 500 }}>
          {listMode === 'tracks'
            ? `${state.communityTracks.length} tracks`
            : `${state.communityMixes.length} mixes`
          }
        </span>
        <button
          className="quick-create-btn"
          onClick={() => window.open('https://github.com/timpaul/doom-loop/tree/main/src/audio/community', '_blank')}
        >
          Submit {listMode === 'tracks' ? 'track' : 'mix'}
        </button>
      </div>

      <main className="main-content">
        {listMode === 'tracks' ? (
          <div className="track-list">
            {state.communityTracks.length === 0 ? (
              <p className="empty-state" style={{ color: '#111' }}>No community tracks yet.</p>
            ) : (
              state.communityTracks.map(track => {
                const isTrackPlaying = state.isPlaying && state.playbackMode === 'track' && state.currentTrackId === track.id;
                return (
                  <div key={track.id} className="track-list-item community-list-item">
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
                      <button className="add-library-btn" onClick={(e) => { e.stopPropagation(); dispatch({ type: 'ADD_COMMUNITY_TRACK', payload: track.id }); }}>
                        Add to library
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        ) : (
          <div className="track-list">
            {state.communityMixes.length === 0 ? (
              <p className="empty-state" style={{ color: '#111' }}>No community mixes yet.</p>
            ) : (
              state.communityMixes.map(mix => {
                const isMixPlaying = state.isPlaying && state.playbackMode === 'mix' && state.currentMixId === mix.id;
                
                return (
                  <div key={mix.id} className="track-list-item community-list-item">
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
        )}
      </main>
    </div>
  );
}
"""

content = content.replace("function RouteSync() {", community_screen_code + "\nfunction RouteSync() {")

# Add Routes
routes_injection = """
        <Route path="/community/tracks" element={<CommunityListScreen listMode="tracks" />} />
        <Route path="/community/mixes" element={<CommunityListScreen listMode="mixes" />} />
"""
content = content.replace('<Route path="/mixes/:id" element={<MixDetailScreen />} />', '<Route path="/mixes/:id" element={<MixDetailScreen />} />\n' + routes_injection)

# Add link to footer
footer_orig = "&copy; 2026 <a href=\"https://www.timpaul.co.uk\" target=\"_blank\" rel=\"noopener noreferrer\">Tim Paul</a> &middot; <button className=\"text-btn\" onClick={() => navigate('/about')}>What <em>is</em> this?</button>"
footer_new = "&copy; 2026 <a href=\"https://www.timpaul.co.uk\" target=\"_blank\" rel=\"noopener noreferrer\">Tim Paul</a> &middot; <button className=\"text-btn\" onClick={() => navigate('/community/tracks')}>Community</button> &middot; <button className=\"text-btn\" onClick={() => navigate('/about')}>What <em>is</em> this?</button>"
content = content.replace(footer_orig, footer_new)

with open(filepath, 'w') as f:
    f.write(content)

# Update CSS
css_path = 'src/App.css'
with open(css_path, 'r') as f:
    css_content = f.read()

community_css = """
/* Community Mode Styles */
body:has(.community-mode) {
    background-color: #5EB4A5;
}

.community-mode {
    background-color: transparent;
}

.community-logo {
    filter: invert(1);
}

.community-pill {
    font-family: 'Questrial', 'Century Gothic', 'Futura', sans-serif;
    background: #333333;
    color: #5EB4A5;
    border-radius: 100px;
    padding: 5px 14px;
    font-size: 0.95rem;
    font-weight: 500;
    width: 105px;
    margin: -40px auto 30px auto;
    letter-spacing: 0.5px;
    display: inline-block;
    text-align: center;
}

.community-segmented-control {
    background-color: #333333;
}

.community-segmented-control .segment-btn {
    color: #ffffff;
}

.community-segmented-control .segment-btn.active {
    background-color: #5EB4A5;
    color: #000;
}

.community-quick-panel {
    background-color: #333333;
    border: none;
}

.community-quick-panel .quick-create-count {
    color: #ffffff !important;
}

.add-library-btn {
    background-color: #333333;
    color: var(--text-primary);
    padding: 6px 14px;
    border-radius: 20px;
    font-size: 0.85rem;
    font-weight: 500;
    transition: all 0.2s ease;
    border: none;
    cursor: pointer;
}

.add-library-btn:hover {
    background-color: #444444;
}

.community-list-item {
    background-color: #171717;
    border-color: #171717;
}

.community-list-item:hover {
    background-color: #222222;
    border-color: #222222;
}

.community-list-item .track-play-icon-circle {
    background-color: #333;
}
"""

if "/* Community Mode Styles */" not in css_content:
    with open(css_path, 'a') as f:
        f.write(community_css)

print("Patch applied to App.tsx and App.css.")
