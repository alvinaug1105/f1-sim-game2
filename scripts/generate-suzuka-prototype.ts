/** Offline fixture generator only. No route imports this script or authoritative Race state. */
import { writeFile } from 'node:fs/promises';
import { v8eRace } from '../tests/helpers/v8e';
import { viewerData, view } from '../tests/helpers/viewer';
import { advanceRace } from '../src/simulation/race/engine';
import { timingRows } from '../src/features/race/viewer/model';
import { developmentContent } from '../src/data/seed/content-development';
import type { RaceSimulationState } from '../src/simulation/race/types';
const circuit = '00000000-0000-4000-8000-000000000301', base = viewerData(22);
const labels = base.labels.map((l, i) => { const driver = developmentContent.drivers[i], entry = developmentContent.driverEntries[i], team = developmentContent.teams.find(t => t.id === entry.teamId)!; return { ...l, driverName: `${driver.firstName} ${driver.lastName}`, abbreviation: driver.abbreviation, teamName: team.name, teamColor: team.color }; });
const initial = v8eRace({ circuit, count: 22, players: 2, laps: 53, quiet: true });
const frame = (state: RaceSimulationState) => ({ lap: state.lap, rows: timingRows(view({ ...base, state, labels, circuit: { ...base.circuit, sourceCircuitId: circuit } })).map(r => ({ id: r.id, progress: r.progress, status: r.status, name: r.name, team: r.team, player: r.player, color: r.color, abbreviation: r.abbreviation, pitting: r.pitting, lapsDown: r.lapsDown, entrant: { position: r.entrant.position }, route: r.route, routeHistory: r.routeHistory })) });
const frames = []; let state = advanceRace(initial, 16);
for (let i = 0; i < 12; i++) { frames.push(frame(state)); if (i < 11) state = advanceRace(state, 1); }
const first = frames[0], own = first.rows.filter(r => r.player), pit = initial.input.progression!.pit;
// Explicit stress variants of PUBLIC presentation data; not simulated outcomes and never persisted.
const cases = {
    dense: { ...first, rows: first.rows.map((r, i) => ({ ...r, progress: 16.22 + i * .0017, route: 'TRACK', routeHistory: [], pitting: false })) },
    apart: { ...first, rows: first.rows.map(r => r.id === own[0].id ? { ...r, progress: 16.15, routeHistory: [] } : r.id === own[1].id ? { ...r, progress: 16.71, routeHistory: [] } : r) },
    pit: { ...first, rows: first.rows.map(r => r.id === own[0].id ? { ...r, progress: 16 + pit.service / 1e6, route: 'SERVICE', routeHistory: [], pitting: true } : r) },
    critical: { ...first, critical: own[1].id },
    retired: { ...first, rows: first.rows.map((r, i) => i === 5 ? { ...r, status: 'RETIRED' } : r) },
    lapped: { ...first, rows: first.rows.map((r, i) => i === 5 ? { ...r, progress: r.progress - 2, lapsDown: 2, routeHistory: [] } : r) },
};
await writeFile('src/features/race/prototype/replay.json', JSON.stringify({ visibility: 'PUBLIC', pitAnchors: { entry: pit.entry, service: pit.service, exit: pit.exit }, frames, cases }));
console.log(`Exported ${frames.length} public checkpoints and ${Object.keys(cases).length} labelled presentation variants.`);
