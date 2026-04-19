/**
 * migrate-to-supabase.js
 * One-time script to import all existing JSON data into Supabase.
 * Usage: node server/migrate-to-supabase.js
 */

import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

config({ path: path.join(__dirname, '..', '.env') });
config({ path: path.join(__dirname, '.env') });

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE;

if (!url || !key) {
  console.error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env');
  process.exit(1);
}

const supabase = createClient(url, key, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const DATA_DIR = path.join(__dirname, 'data');

async function readJson(filename, fallback) {
  const p = path.join(DATA_DIR, filename);
  if (!existsSync(p)) {
    console.log('  SKIP ' + filename + ' not found');
    return fallback !== undefined ? fallback : null;
  }
  const raw = await fs.readFile(p, 'utf-8');
  return JSON.parse(raw);
}

function chunk(arr, size) {
  const chunks = [];
  for (let i = 0; i < arr.length; i += size) chunks.push(arr.slice(i, i + size));
  return chunks;
}

async function upsert(table, rows, batchSize) {
  batchSize = batchSize || 100;
  if (!rows.length) { console.log('  INFO ' + table + ': nothing to import'); return; }
  let inserted = 0;
  for (const batch of chunk(rows, batchSize)) {
    const { error } = await supabase.from(table).upsert(batch, { onConflict: 'id' });
    if (error) {
      console.error('  ERROR ' + table + ': ' + error.message);
      throw error;
    }
    inserted += batch.length;
  }
  console.log('  OK ' + table + ': ' + inserted + ' rows imported');
}

async function migrateLocations() {
  console.log('\nMigrating locations...');
  const data = await readJson('locations.json');
  if (!data) return;
  const raw = Array.isArray(data) ? data : (data.locations || []);
  const rows = raw.map(function(loc) {
    return {
      id: String(loc.id),
      name: loc.name || 'Unnamed',
      type: loc.type || '',
      icon_key: loc.iconKey || loc.icon_key || '',
      lat: loc.lat != null ? loc.lat : (loc.x || 0),
      lng: loc.lng != null ? loc.lng : (loc.y || 0),
      lore: loc.lore || '',
      description: loc.description || '',
      category: loc.category || '',
      tags: Array.isArray(loc.tags) ? loc.tags : [],
      region_id: loc.regionId || loc.region_id || null,
      glow_color: loc.glowColor || loc.glow_color || '#F7B267',
      gallery: Array.isArray(loc.gallery) ? loc.gallery : [],
      created_by: loc.createdBy || loc.created_by || null,
      updated_by: loc.updatedBy || loc.updated_by || null,
    };
  });
  await upsert('locations', rows);
}

async function migrateRegions() {
  console.log('\nMigrating regions...');
  const data = await readJson('regions.json');
  if (!data) return;
  const raw = Array.isArray(data) ? data : (data.regions || []);
  const rows = raw.map(function(r) {
    return {
      id: r.id,
      name: r.name || 'Unnamed Region',
      color: r.color || '#304ddf',
      border_color: r.borderColor || r.border_color || '#ea580c',
      opacity: r.opacity != null ? r.opacity : 0.35,
      points: Array.isArray(r.points) ? r.points : [],
      category: r.category || '',
      label_enabled: r.labelEnabled != null ? r.labelEnabled : (r.label_enabled != null ? r.label_enabled : true),
      label_size: r.labelSize != null ? r.labelSize : (r.label_size != null ? r.label_size : 0.75),
      label_offset_x: String(r.labelOffsetX != null ? r.labelOffsetX : (r.label_offset_x != null ? r.label_offset_x : '0')),
      label_offset_y: String(r.labelOffsetY != null ? r.labelOffsetY : (r.label_offset_y != null ? r.label_offset_y : '0')),
      label_width: r.labelWidth != null ? r.labelWidth : (r.label_width != null ? r.label_width : 0.9),
      description: r.description || '',
      lore: r.lore || '',
      emblem: r.emblem || '',
      banner_image: r.bannerImage || r.banner_image || '',
    };
  });
  await upsert('regions', rows);
}

async function migrateHeroes() {
  console.log('\nMigrating heroes...');
  const raw = await readJson('heroes.json');
  if (!raw) return;
  const heroes = Array.isArray(raw) ? raw : [];
  const rows = heroes.map(function(h, idx) {
    return {
      id: String(h.id),
      name: h.name || 'Unnamed',
      title: h.title || '',
      race: h.race || '',
      class: h.class || '',
      subclass: h.subclass || '',
      level: Number(h.level) || 1,
      alignment: h.alignment || '',
      background: h.background || '',
      hp: Number(h.hp) || 0,
      ac: Number(h.ac) || 10,
      speed: Number(h.speed) || 30,
      stats: h.stats || { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
      passive_perception: h.passivePerception != null ? h.passivePerception : 10,
      inspiration: h.inspiration || false,
      prof_bonus: h.profBonus != null ? h.profBonus : (h.prof_bonus != null ? h.prof_bonus : 2),
      skills: Array.isArray(h.skills) ? h.skills : [],
      abilities: Array.isArray(h.abilities) ? h.abilities : [],
      spells: Array.isArray(h.spells) ? h.spells : [],
      equipment: Array.isArray(h.equipment) ? h.equipment : [],
      notes: h.notes || '',
      lore: h.lore || '',
      color: h.color || '#cfaa68',
      sheet: h.sheet || {},
      visible: h.visible !== false,
      sort_order: h.sortOrder != null ? h.sortOrder : idx,
      created_by: h.createdBy || null,
      updated_by: h.updatedBy || null,
    };
  });
  await upsert('heroes', rows);
}

async function migrateNpcs() {
  console.log('\nMigrating NPCs...');
  const raw = await readJson('npcs.json');
  if (!raw) return;
  const npcs = Array.isArray(raw) ? raw : [];
  const rows = npcs.map(function(n) {
    return {
      id: String(n.id),
      name: n.name || 'Unknown NPC',
      description: n.description || n.blurb || '',
      type: n.type || 'Unknown',
      campaign: n.campaign || 'Main',
      region_id: n.regionId || n.region_id || null,
      marker_id: n.markerId || n.marker_id || null,
      location_id: n.locationId ? String(n.locationId) : null,
      secret_id: n.secretId || n.secret_id || null,
      image: n.image || '',
      visible: n.visible !== false,
      role: n.role || 'NPC',
      blurb: n.blurb || '',
      created_by: n.createdBy || null,
      updated_by: n.updatedBy || null,
    };
  });
  await upsert('npcs', rows);
}

async function migrateSecrets() {
  console.log('\nMigrating secrets...');
  const raw = await readJson('secrets.json');
  const DEFAULT_SECRETS = [
    { id: 'aurora-ember', title: 'Aurora Ember', description: 'A faint ember reveals a hidden stanza in the night sky.', keyword: 'light the northern flame' },
    { id: 'silent-archive', title: 'Silent Archive', description: 'You have located a sealed folio in the Archivists stacks.', keyword: 'quiet books speak' },
    { id: 'gilded-horizon', title: 'Gilded Horizon', description: 'A map pin now glows faint gold at the edge of the world.', keyword: 'beyond the western gold' },
    { id: 'amber-archive', title: 'Amber Archive', description: 'An amber seal cracks to reveal forgotten correspondence.', keyword: 'amber light endures' },
    { id: 'shadow-court', title: 'Shadow Court', description: 'Whispers from the Shadow Court mark a new allegiance.', keyword: 'the court waits in dusk' },
  ];
  const secrets = Array.isArray(raw) ? raw : DEFAULT_SECRETS;
  const rows = secrets.map(function(s) {
    return { id: s.id, title: s.title, description: s.description || '', keyword: s.keyword };
  });
  await upsert('secrets', rows);
}

async function migrateContent() {
  console.log('\nMigrating content entries (this may take a moment)...');
  const raw = await readJson('content.json');
  if (!raw) return;
  const entries = Array.isArray(raw) ? raw : (raw.entries || []);
  console.log('  Found ' + entries.length + ' entries');

  // Deduplicate by id
  const seen = new Map();
  entries.forEach(function(e) { seen.set(e.id, e); });
  const deduped = Array.from(seen.values());
  if (deduped.length !== entries.length) {
    console.log('  Deduplicated ' + (entries.length - deduped.length) + ' duplicate ids');
  }

  const rows = deduped.map(function(e) {
    return {
      id: e.id,
      type: e.type || '',
      title: e.title || 'Untitled',
      status: e.status || 'draft',
      category: e.category || '',
      unlockable: e.unlockable || false,
      secret_key: e.secretKey || e.secret_key || '',
      requires: Array.isArray(e.requires) ? e.requires : [],
      region_id: e.regionId || e.region_id || null,
      map_location_id: e.mapLocationId ? String(e.mapLocationId) : null,
      related_characters: Array.isArray(e.relatedCharacters) ? e.relatedCharacters : [],
      related_events: Array.isArray(e.relatedEvents) ? e.relatedEvents : [],
      related_items: Array.isArray(e.relatedItems) ? e.relatedItems : [],
      related_factions: Array.isArray(e.relatedFactions) ? e.relatedFactions : [],
      summary: e.summary || '',
      body: e.body || '',
      tags: Array.isArray(e.tags) ? e.tags : [],
      obsidian_path: e.obsidianPath || null,
      folder: e.folder || null,
      meta: e.meta || {},
    };
  });
  await upsert('content_entries', rows, 50);
}

async function main() {
  console.log('Azterra -> Supabase migration starting...');
  console.log('Project: ' + url);
  console.log('');

  try {
    await migrateLocations();
    await migrateRegions();
    await migrateHeroes();
    await migrateNpcs();
    await migrateSecrets();
    await migrateContent();

    console.log('\nMigration complete!');
    console.log('');
    console.log('Next steps:');
    console.log('  1. Verify data in the Supabase Table Editor');
    console.log('  2. Promote yourself to admin via Supabase SQL editor:');
    console.log("     UPDATE profiles SET role = 'admin' WHERE email = 'your@email.com';");
    console.log('  3. Start the server: node server/server.js');
  } catch (err) {
    console.error('\nMigration failed: ' + err.message);
    process.exit(1);
  }
}

main();
