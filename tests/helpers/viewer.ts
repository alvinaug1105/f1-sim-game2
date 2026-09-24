import type { CareerRaceData } from '../../src/game/domain/race-repository';
import { quietRace } from './incidents';
import { audit } from './memory-career';
export function viewerData(count=4):CareerRaceData {
 const state=quietRace(count),team=state.input.entrants[0].teamId;
 return {state,eventId:'event',sessionId:'session',circuit:{sourceCircuitId:'00000000-0000-4000-8000-000000000300',lengthMeters:5200,defaultLapCount:58},roster:[],labels:state.input.entrants.map((e,i)=>({entrantId:e.entrantId,driverName:`Driver ${i+1}`,abbreviation:`D${i+1}`,teamName:`Team ${Math.floor(i/2)+1}`,teamColor:i<2?'#bddd74':'#6c9aff'})),progress:{career:{...audit,id:'career',name:'Viewer fixture',sourceGameDatabaseId:'db',sourceGameDatabaseVersion:'1',sourceSeasonId:'season',playerTeamId:team,currentSeasonId:'season',currentDate:'2026-03-01',status:'ACTIVE'},events:[{id:'event',careerId:'career',careerSeasonId:'season',careerCircuitId:'circuit',sourceCalendarEventId:null,round:1,name:'Viewer fixture',circuitName:'Original schematic',startDate:'2026-03-01',endDate:'2026-03-03',status:'CURRENT',weekend:null}]}};
}
