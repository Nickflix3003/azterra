import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import {
  CampaignSettingsModal,
  CharacterSheetModal,
  apiJson,
} from './CampaignShared';
import './CampaignPage.css';
import './CampaignIndexPage.css';

export default function CampaignIndexPage() {
  const navigate = useNavigate();
  const { user, role } = useAuth();
  const { toast } = useToast();
  const canUseCampaigns = Boolean(user) && ['player', 'editor', 'admin'].includes(role);
  const [campaigns, setCampaigns] = useState([]);
  const [discoverableCampaigns, setDiscoverableCampaigns] = useState([]);
  const [playerCharacters, setPlayerCharacters] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreateCampaign, setShowCreateCampaign] = useState(false);
  const [editingCampaign, setEditingCampaign] = useState(null);
  const [sheetState, setSheetState] = useState(null);

  const refreshCampaigns = useCallback(async () => {
    if (!canUseCampaigns) {
      setCampaigns([]);
      setDiscoverableCampaigns([]);
      return;
    }
    const data = await apiJson('/api/campaigns/me');
    setCampaigns(data.campaigns || []);
    setDiscoverableCampaigns(data.discoverableCampaigns || []);
  }, [canUseCampaigns]);

  const refreshCharacters = useCallback(async () => {
    if (!canUseCampaigns) {
      setPlayerCharacters([]);
      return;
    }
    const data = await apiJson('/api/player-characters/me');
    setPlayerCharacters(data.characters || []);
  }, [canUseCampaigns]);

  useEffect(() => {
    let cancelled = false;

    async function loadAll() {
      if (!canUseCampaigns) {
        setLoading(false);
        return;
      }

      setLoading(true);
      try {
        const [campaignData, characterData] = await Promise.all([
          apiJson('/api/campaigns/me'),
          apiJson('/api/player-characters/me'),
        ]);
        if (cancelled) return;
        setCampaigns(campaignData.campaigns || []);
        setDiscoverableCampaigns(campaignData.discoverableCampaigns || []);
        setPlayerCharacters(characterData.characters || []);
      } catch (error) {
        if (!cancelled) {
          toast.error(error.message || 'Unable to load campaigns.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadAll();
    return () => {
      cancelled = true;
    };
  }, [canUseCampaigns, toast]);

  const featuredCampaign = useMemo(() => campaigns[0] || null, [campaigns]);

  const handleCampaignSaved = async (campaign) => {
    setShowCreateCampaign(false);
    setEditingCampaign(null);
    await refreshCampaigns();
    if (campaign?.id) {
      navigate(`/campaign/${campaign.id}`);
    }
  };

  const handleCampaignDeleted = async () => {
    setEditingCampaign(null);
    await refreshCampaigns();
  };

  const handleJoinRequest = async (campaignId) => {
    try {
      await apiJson(`/api/campaigns/${campaignId}/join`, { method: 'POST' });
      toast.success('Join request sent.');
      await refreshCampaigns();
    } catch (error) {
      toast.error(error.message || 'Unable to request campaign access.');
    }
  };

  const handleSheetSaved = async () => {
    setSheetState(null);
    await refreshCharacters();
  };

  if (!canUseCampaigns) {
    return (
      <div className="cp-page cp-page--guest">
        <div className="cp-guest-hero">
          <div className="cp-guest-emblem">⚔️</div>
          <h1 className="cp-guest-title">Campaigns</h1>
          <p className="cp-guest-sub">Sign in to join campaigns, build character rosters, and open the shared campaign sheets.</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="cp-page cp-page--loading">
        <div className="cp-spinner" />
        <p>Loading campaigns…</p>
      </div>
    );
  }

  return (
    <div className="cp-page cp-page--workspace cpi-page">
      {showCreateCampaign && (
        <CampaignSettingsModal
          mode="create"
          onClose={() => setShowCreateCampaign(false)}
          onSaved={handleCampaignSaved}
        />
      )}

      {editingCampaign && (
        <CampaignSettingsModal
          mode="edit"
          campaign={editingCampaign}
          canDelete={editingCampaign.viewerRole === 'owner' || role === 'admin'}
          onClose={() => setEditingCampaign(null)}
          onSaved={handleCampaignSaved}
          onDeleted={handleCampaignDeleted}
        />
      )}

      {sheetState && (
        <CharacterSheetModal
          character={sheetState.character}
          campaignId={null}
          canEdit={sheetState.canEdit}
          onClose={() => setSheetState(null)}
          onSaved={handleSheetSaved}
        />
      )}

      <header className="cp-header cp-header--workspace">
        <div className="cp-header__left">
          <p className="cp-header__eyebrow">Campaigns</p>
          <h1 className="cp-header__title">Campaign Ledger</h1>
          <p className="cp-header__subtitle">Use this page to create campaigns, scan party status, and jump into the shared campaign workspace.</p>
        </div>
        <div className="cp-header__actions">
          <button type="button" className="cp-btn cp-btn--ghost" onClick={() => setSheetState({ character: null, canEdit: true })}>
            + New Character
          </button>
          <button type="button" className="cp-btn cp-btn--primary" onClick={() => setShowCreateCampaign(true)}>
            + New Campaign
          </button>
        </div>
      </header>

      {featuredCampaign && (
        <section className="cpi-featured">
          <div className="cpi-featured__copy">
            <p className="cpi-featured__eyebrow">Most Recent Campaign</p>
            <h2>{featuredCampaign.name}</h2>
            <p>{featuredCampaign.description || 'Jump back into the latest campaign workspace, manage its roster, and keep the shared sheets current.'}</p>
          </div>
          <div className="cpi-featured__meta">
            <span>{featuredCampaign.approvedCount || 0} approved players</span>
            <span>{featuredCampaign.pendingCount || 0} pending requests</span>
            <span>{featuredCampaign.attachedCharacterCount || 0} attached characters</span>
          </div>
          <div className="cpi-featured__actions">
            <button type="button" className="cp-btn cp-btn--primary" onClick={() => navigate(`/campaign/${featuredCampaign.id}`)}>
              Open Campaign
            </button>
            {(featuredCampaign.viewerRole === 'owner' || featuredCampaign.viewerRole === 'co_dm' || role === 'admin') && (
              <button type="button" className="cp-btn cp-btn--ghost" onClick={() => setEditingCampaign(featuredCampaign)}>
                Edit Campaign
              </button>
            )}
          </div>
        </section>
      )}

      <div className="cpi-grid">
        <section className="cp-card cpi-card">
          <div className="cp-card__header">
            <h3>My Campaigns</h3>
            <span>{campaigns.length}</span>
          </div>
          {campaigns.length === 0 ? (
            <p className="cp-empty">You do not have any campaign memberships yet.</p>
          ) : (
            <div className="cpi-list">
              {campaigns.map((campaign) => {
                const canManage = campaign.viewerRole === 'owner' || campaign.viewerRole === 'co_dm' || role === 'admin';
                return (
                  <article
                    key={campaign.id}
                    className="cpi-campaign"
                    role="button"
                    tabIndex={0}
                    onClick={() => navigate(`/campaign/${campaign.id}`)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        navigate(`/campaign/${campaign.id}`);
                      }
                    }}
                  >
                    <div className="cpi-campaign__body">
                      <div className="cpi-campaign__title">
                        <strong>{campaign.name}</strong>
                        <span>{campaign.viewerStatus === 'pending' ? 'Pending approval' : campaign.ownerName}</span>
                      </div>
                      {campaign.description && <p>{campaign.description}</p>}
                      <div className="cpi-campaign__stats">
                        <span>{campaign.approvedCount || 0} players</span>
                        <span>{campaign.attachedCharacterCount || 0} characters</span>
                        <span>{campaign.pendingCount || 0} pending</span>
                      </div>
                    </div>
                    <div className="cpi-campaign__actions">
                      <button type="button" className="cp-chip-btn" onClick={(event) => {
                        event.stopPropagation();
                        navigate(`/campaign/${campaign.id}`);
                      }}>
                        Open
                      </button>
                      {canManage && (
                        <button type="button" className="cp-chip-btn" onClick={(event) => {
                          event.stopPropagation();
                          setEditingCampaign(campaign);
                        }}>
                          Edit
                        </button>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>

        <section className="cp-card cpi-card">
          <div className="cp-card__header">
            <h3>Character Library</h3>
            <span>{playerCharacters.length}</span>
          </div>
          {playerCharacters.length === 0 ? (
            <p className="cp-empty">No reusable characters yet. Create one here, then attach it inside a campaign workspace.</p>
          ) : (
            <div className="cpi-library">
              {playerCharacters.slice(0, 5).map((character) => (
                <button
                  key={character.id}
                  type="button"
                  className="cpi-library__card"
                  onClick={() => setSheetState({ character, canEdit: true })}
                >
                  <strong>{character.name || 'Unnamed Character'}</strong>
                  <span>{[character.race, character.class].filter(Boolean).join(' · ') || 'Character sheet'}</span>
                </button>
              ))}
            </div>
          )}
          <div className="cpi-card__footer">
            <button type="button" className="cp-btn cp-btn--ghost cp-btn--sm" onClick={() => setSheetState({ character: null, canEdit: true })}>
              Create Character
            </button>
          </div>
        </section>

        <section className="cp-card cpi-card">
          <div className="cp-card__header">
            <h3>Discover Campaigns</h3>
            <span>{discoverableCampaigns.length}</span>
          </div>
          {discoverableCampaigns.length === 0 ? (
            <p className="cp-empty">No discoverable campaigns are open right now.</p>
          ) : (
            <div className="cpi-list">
              {discoverableCampaigns.map((campaign) => (
                <article key={campaign.id} className="cpi-discover">
                  <div>
                    <strong>{campaign.name}</strong>
                    <span>{campaign.ownerName}</span>
                    {campaign.description && <p>{campaign.description}</p>}
                  </div>
                  <button type="button" className="cp-chip-btn" onClick={() => handleJoinRequest(campaign.id)}>
                    Request Join
                  </button>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
