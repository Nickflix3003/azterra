import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import characters from '../../data/characters_heroes';
import { Link } from 'react-router-dom';

const API_BASE_URL = '/api';
const normalizeIds = (list) => (Array.isArray(list) ? list.map((val) => Number(val)).filter((val) => Number.isFinite(val)) : []);
const parseJsonResponse = async (res) => {
  const text = await res.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    throw new Error('Unexpected response from server. Is the API running?');
  }
};

function PlayersPage() {
  const { user } = useAuth();
  const [players, setPlayers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState('players');
  const [friendsLoading, setFriendsLoading] = useState(false);
  const [friendsError, setFriendsError] = useState('');
  const [friends, setFriends] = useState({ friends: [], incoming: [], outgoing: [] });
  const [search, setSearch] = useState('');
  const [inviteSelections, setInviteSelections] = useState({});

  const charMap = useMemo(() => {
    const map = new Map();
    characters.forEach((c) => map.set(c.id, c));
    return map;
  }, []);

  const playerMap = useMemo(() => {
    const map = new Map();
    players.forEach((p) => map.set(p.id, p));
    return map;
  }, [players]);

  useEffect(() => {
    const fetchPlayers = async () => {
      if (!user) {
        setPlayers([]);
        setLoading(false);
        return;
      }
      setLoading(true);
      setError('');
      try {
        const res = await fetch(`${API_BASE_URL}/characters/player-view`, { credentials: 'include' });
        const data = await parseJsonResponse(res);
        if (!res.ok) {
          throw new Error(data.error || 'Unable to load players.');
        }
        setPlayers(data.users || []);
      } catch (err) {
        setError(err.message || 'Unable to load players.');
      } finally {
        setLoading(false);
      }
    };
    fetchPlayers();
  }, [user]);

  const applyFriendData = useCallback((data) => {
    setFriends({
      friends: normalizeIds(data?.friends),
      incoming: normalizeIds(data?.incoming),
      outgoing: normalizeIds(data?.outgoing),
    });
  }, []);

  const refreshFriends = useCallback(async () => {
    if (!user) {
      setFriends({ friends: [], incoming: [], outgoing: [] });
      return;
    }
    setFriendsLoading(true);
    setFriendsError('');
    try {
      const res = await fetch(`${API_BASE_URL}/users/friends`, { credentials: 'include' });
      const data = await parseJsonResponse(res);
      if (!res.ok) {
        throw new Error(data.error || 'Unable to load friends.');
      }
      applyFriendData(data);
    } catch (err) {
      setFriendsError(err.message || 'Unable to load friends.');
    } finally {
      setFriendsLoading(false);
    }
  }, [applyFriendData, user]);

  useEffect(() => {
    refreshFriends();
    setInviteSelections({});
  }, [refreshFriends, user]);

  const sendRequest = async (targetId) => {
    if (!user || !targetId) return;
    setFriendsLoading(true);
    setFriendsError('');
    try {
      const res = await fetch(`${API_BASE_URL}/users/friends/request`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({ targetId }),
      });
      const data = await parseJsonResponse(res);
      if (!res.ok) {
        throw new Error(data.error || 'Unable to send request.');
      }
      applyFriendData(data);
    } catch (err) {
      setFriendsError(err.message || 'Unable to send request.');
    } finally {
      setFriendsLoading(false);
    }
  };

  const respondToRequest = async (requesterId, accept) => {
    if (!user || !requesterId) return;
    setFriendsLoading(true);
    setFriendsError('');
    try {
      const res = await fetch(`${API_BASE_URL}/users/friends/respond`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({ requesterId, accept }),
      });
      const data = await parseJsonResponse(res);
      if (!res.ok) {
        throw new Error(data.error || 'Unable to update request.');
      }
      applyFriendData(data);
    } catch (err) {
      setFriendsError(err.message || 'Unable to update request.');
    } finally {
      setFriendsLoading(false);
    }
  };

  const removeFriend = async (targetId) => {
    if (!user || !targetId) return;
    setFriendsLoading(true);
    setFriendsError('');
    try {
      const res = await fetch(`${API_BASE_URL}/users/friends/remove`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({ targetId }),
      });
      const data = await parseJsonResponse(res);
      if (!res.ok) {
        throw new Error(data.error || 'Unable to update friends.');
      }
      applyFriendData(data);
      setInviteSelections((prev) => {
        const next = { ...prev };
        delete next[targetId];
        return next;
      });
    } catch (err) {
      setFriendsError(err.message || 'Unable to update friends.');
    } finally {
      setFriendsLoading(false);
    }
  };

  const statusFor = (id) => {
    if (friends.friends.includes(id)) return 'friends';
    if (friends.incoming.includes(id)) return 'incoming';
    if (friends.outgoing.includes(id)) return 'outgoing';
    return 'none';
  };

  const candidateCharacters = (player) => {
    const ids = [];
    if (player?.featuredCharacter) ids.push(player.featuredCharacter);
    (player?.favorites || []).forEach((id) => {
      if (!ids.includes(id)) ids.push(id);
    });
    return ids;
  };

  if (!user) {
    return (
      <div className="page-container">
        <h1>Players</h1>
        <p>Please log in to view player info.</p>
      </div>
    );
  }

  const incomingDetails = friends.incoming.map((id) => playerMap.get(id)).filter(Boolean);
  const friendDetails = friends.friends.map((id) => playerMap.get(id)).filter(Boolean);
  const searchValue = search.toLowerCase();
  const candidates = players
    .filter((p) => p.id !== user?.id)
    .filter((p) => !friendDetails.find((f) => f.id === p.id))
    .filter((p) => (searchValue ? (p.name || '').toLowerCase().includes(searchValue) || (p.username || '').toLowerCase().includes(searchValue) : true));

  return (
    <div className="page-container">
      <div className="players-page__header">
        <div>
          <h1>Players</h1>
          <p className="progression__muted">Visible profiles, favorites, and featured characters. Secrets stay hidden.</p>
        </div>
        <div className="players-tabs">
          <button
            type="button"
            className={`players-tab ${activeTab === 'players' ? 'players-tab--active' : ''}`}
            onClick={() => setActiveTab('players')}
          >
            Community
          </button>
          <button
            type="button"
            className={`players-tab ${activeTab === 'friends' ? 'players-tab--active' : ''}`}
            onClick={() => setActiveTab('friends')}
          >
            Friends
          </button>
        </div>
      </div>

      {loading && <p className="progression__muted">Loading players...</p>}
      {error && <p className="account-error">{error}</p>}
      {friendsError && <p className="account-error">{friendsError}</p>}

      {activeTab === 'players' && (
        <div className="players-grid">
          {players.map((player) => {
            const featured = player.featuredCharacter ? charMap.get(player.featuredCharacter) : null;
            return (
              <div key={player.id} className="player-card">
                <div className="player-card__header">
                  <div className="player-avatar">
                    {player.profilePicture ? <img src={player.profilePicture} alt="" /> : <span>{(player.username || player.name || '?')[0]}</span>}
                  </div>
                  <div>
                    <p className="player-eyebrow">{player.role}</p>
                    <h3>{player.name}</h3>
                    {player.username && <p className="player-username">@{player.username}</p>}
                  </div>
                </div>
                <div className="player-actions">
                  <Link to={`/players/${player.id}`} className="lore-locked__link">
                    View profile
                  </Link>
                </div>
                {featured && (
                  <div className="player-featured">
                    <span>Featured</span>
                    <strong>{featured.name}</strong>
                  </div>
                )}
                <div>
                  <p className="player-eyebrow">Favorites</p>
                  {player.favorites && player.favorites.length ? (
                    <ul className="simple-list">
                      {player.favorites.map((id) => {
                        const fav = charMap.get(id);
                        return <li key={`${player.id}-${id}`}>{fav ? fav.name : `Character ${id}`}</li>;
                      })}
                    </ul>
                  ) : (
                    <p className="progression__muted">No favorites yet.</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {activeTab === 'friends' && (
        <div className="friends-layout">
          <div className="friends-panel">
            <div className="friends-panel__header">
              <div>
                <p className="player-eyebrow">Roster</p>
                <h2>Friends & Invites</h2>
                <p className="progression__muted">
                  Add trusted players so you can share characters, hand out edit access, and drop campaign invites without slowing down table time.
                </p>
              </div>
              <div className="friend-actions">
                <button type="button" onClick={refreshFriends} disabled={friendsLoading}>
                  {friendsLoading ? 'Syncing...' : 'Refresh'}
                </button>
              </div>
            </div>

            {incomingDetails.length > 0 && (
              <div className="friend-requests">
                <p className="player-eyebrow">Awaiting your approval</p>
                <div className="friend-chip-row">
                  {incomingDetails.map((req) => (
                    <div key={req.id} className="friend-chip">
                      <div>
                        <strong>{req.name}</strong>
                        {req.username && <span className="player-username">@{req.username}</span>}
                      </div>
                      <div className="friend-chip__actions">
                        <button type="button" onClick={() => respondToRequest(req.id, true)} disabled={friendsLoading}>
                          Accept
                        </button>
                        <button type="button" onClick={() => respondToRequest(req.id, false)} disabled={friendsLoading}>
                          Decline
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="friends-panel__section">
              <div className="friends-panel__subheader">
                <h3>Your table</h3>
                <span className="pill">{friendDetails.length} friends</span>
              </div>
              {friendDetails.length === 0 && <p className="progression__muted">No friends yet. Add players you trust to start sharing characters.</p>}
              <div className="friends-grid">
                {friendDetails.map((friend) => {
                  const featured = friend.featuredCharacter ? charMap.get(friend.featuredCharacter) : null;
                  const options = candidateCharacters(friend);
                  const selection = inviteSelections[friend.id];
                  return (
                    <div key={friend.id} className="friend-card">
                      <div className="player-card__header">
                        <div className="player-avatar">
                          {friend.profilePicture ? <img src={friend.profilePicture} alt="" /> : <span>{(friend.username || friend.name || '?')[0]}</span>}
                        </div>
                        <div>
                          <p className="player-eyebrow">{friend.role}</p>
                          <h3>{friend.name}</h3>
                          {friend.username && <p className="player-username">@{friend.username}</p>}
                        </div>
                      </div>
                      {featured && (
                        <div className="player-featured">
                          <span>Featured</span>
                          <strong>{featured.name}</strong>
                        </div>
                      )}

                      <div className="friend-characters">
                        <p className="player-eyebrow">Shareable characters</p>
                        {options.length === 0 && <p className="progression__muted">No shared characters yet.</p>}
                        <div className="friend-character-row">
                          {options.map((charId) => {
                            const char = charMap.get(charId);
                            const isActive = selection === charId;
                            return (
                              <button
                                key={`${friend.id}-${charId}`}
                                type="button"
                                className={`friend-character-btn ${isActive ? 'friend-character-btn--active' : ''}`}
                                onClick={() =>
                                  setInviteSelections((prev) => ({
                                    ...prev,
                                    [friend.id]: charId,
                                  }))
                                }
                              >
                                {char ? char.name : `Character ${charId}`}
                                {isActive && <span className="friend-character-tag">Selected for invite</span>}
                              </button>
                            );
                          })}
                        </div>
                        <p className="friend-invite-note">
                          Pick who you plan to invite and grant edit access to. Keep this circle to players you trust.
                        </p>
                      </div>

                      <div className="friend-card__actions">
                        <Link to={`/players/${friend.id}`} className="lore-locked__link">
                          View profile
                        </Link>
                        <button type="button" onClick={() => removeFriend(friend.id)} disabled={friendsLoading}>
                          Remove
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="friends-panel__section">
              <div className="friends-panel__subheader">
                <div>
                  <h3>Add friends</h3>
                  <p className="progression__muted">Invite fellow players so you can see their characters and loop them into campaigns.</p>
                </div>
                <input
                  type="search"
                  placeholder="Search by name or @handle"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="friend-search"
                />
              </div>
              <div className="players-grid">
                {candidates.map((player) => {
                  const featured = player.featuredCharacter ? charMap.get(player.featuredCharacter) : null;
                  const status = statusFor(player.id);
                  const disabled = status === 'friends' || status === 'outgoing';
                  const actionLabel =
                    status === 'friends' ? 'Friends' : status === 'incoming' ? 'Accept request' : status === 'outgoing' ? 'Requested' : 'Add friend';
                  const action = () => {
                    if (status === 'incoming') return respondToRequest(player.id, true);
                    if (status === 'friends') return null;
                    return sendRequest(player.id);
                  };
                  return (
                    <div key={player.id} className="player-card">
                      <div className="player-card__header">
                        <div className="player-avatar">
                          {player.profilePicture ? <img src={player.profilePicture} alt="" /> : <span>{(player.username || player.name || '?')[0]}</span>}
                        </div>
                        <div>
                          <p className="player-eyebrow">{player.role}</p>
                          <h3>{player.name}</h3>
                          {player.username && <p className="player-username">@{player.username}</p>}
                        </div>
                      </div>
                      {featured && (
                        <div className="player-featured">
                          <span>Featured</span>
                          <strong>{featured.name}</strong>
                        </div>
                      )}
                      <div className="player-actions">
                        <button type="button" onClick={action} disabled={friendsLoading || disabled}>
                          {actionLabel}
                        </button>
                      </div>
                      <div>
                        <p className="player-eyebrow">Favorites</p>
                        {player.favorites && player.favorites.length ? (
                          <ul className="simple-list">
                            {player.favorites.slice(0, 3).map((id) => {
                              const fav = charMap.get(id);
                              return <li key={`${player.id}-${id}`}>{fav ? fav.name : `Character ${id}`}</li>;
                            })}
                          </ul>
                        ) : (
                          <p className="progression__muted">No favorites yet.</p>
                        )}
                      </div>
                      {status === 'outgoing' && <p className="progression__muted">Waiting for them to confirm.</p>}
                      {status === 'incoming' && <p className="progression__muted">They want to connect.</p>}
                    </div>
                  );
                })}
                {candidates.length === 0 && <p className="progression__muted">No other players available to add right now.</p>}
              </div>
            </div>

            {Object.keys(inviteSelections).length > 0 && (
              <div className="friend-invite-summary">
                <p className="player-eyebrow">Invite queue</p>
                <div className="friend-chip-row">
                  {Object.entries(inviteSelections).map(([friendId, charId]) => {
                    const friend = playerMap.get(Number(friendId));
                    const character = charMap.get(charId);
                    if (!friend) return null;
                    return (
                      <div key={friendId} className="friend-chip">
                        <div>
                          <strong>{friend.name}</strong>
                          <p className="progression__muted">
                            {character ? character.name : `Character ${charId}`} selected for campaign invite.
                          </p>
                        </div>
                        <button
                          type="button"
                          className="friend-chip__remove"
                          onClick={() =>
                            setInviteSelections((prev) => {
                              const next = { ...prev };
                              delete next[friendId];
                              return next;
                            })
                          }
                        >
                          Clear
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default PlayersPage;
