import React, { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import characters from '../../data/characters_heroes';

const API_BASE_URL = '/api';

function PlayerPublicPage() {
  const { id } = useParams();
  const [player, setPlayer] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const charMap = useMemo(() => {
    const map = new Map();
    characters.forEach((c) => map.set(c.id, c));
    return map;
  }, []);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError('');
      try {
        const res = await fetch(`${API_BASE_URL}/characters/player-view`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Unable to load player.');
        const found = (data.users || []).find((u) => String(u.id) === String(id));
        if (!found) {
          setError('Player not found.');
        } else {
          setPlayer(found);
        }
      } catch (err) {
        setError(err.message || 'Unable to load player.');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [id]);

  if (loading) {
    return (
      <div className="page-container">
        <p className="progression__muted">Loading player...</p>
      </div>
    );
  }

  if (error || !player) {
    return (
      <div className="page-container">
        <p className="account-error">{error || 'Player not found.'}</p>
      </div>
    );
  }

  const featured = player.featuredCharacter ? charMap.get(player.featuredCharacter) : null;

  return (
    <div className="page-container">
      <div className="dashboard-hero">
        <div className="dashboard-avatar">
          {player.profilePicture ? <img src={player.profilePicture} alt="" /> : <span>{(player.username || player.name || '?')[0]}</span>}
        </div>
        <div>
          <p className="account-card__eyebrow">Player</p>
          <h1>{player.name}</h1>
          {player.username && <p className="player-username">@{player.username}</p>}
        </div>
      </div>

      <div className="dashboard-grid">
        <section className="dashboard-card">
          <header>
            <h3>Favorites</h3>
          </header>
          {player.favorites && player.favorites.length ? (
            <ul className="simple-list">
              {player.favorites.map((idVal) => {
                const fav = charMap.get(idVal);
                return <li key={`${player.id}-${idVal}`}>{fav ? fav.name : `Character ${idVal}`}</li>;
              })}
            </ul>
          ) : (
            <p className="account-muted">No favorites shared.</p>
          )}
        </section>
        <section className="dashboard-card">
          <header>
            <h3>Featured</h3>
          </header>
          {featured ? <p>{featured.name}</p> : <p className="account-muted">No featured character.</p>}
        </section>
      </div>
    </div>
  );
}

export default PlayerPublicPage;
