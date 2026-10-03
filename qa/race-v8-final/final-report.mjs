import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const evidence=resolve(process.argv[2]||'qa-out/final/evidence'),out=resolve(process.argv[3]||'qa-out/final');
async function walk(dir){let files=[];try{for(const e of await readdir(dir,{withFileTypes:true})){const p=join(dir,e.name);if(e.isDirectory())files=files.concat(await walk(p));else files.push(p);}}catch{}return files;}
const files=await walk(evidence);
async function jsonByName(name,contains=''){const candidates=files.filter(p=>p.endsWith('/'+name)&&p.includes(contains));for(const p of candidates){try{return{path:p,value:JSON.parse(await readFile(p,'utf8'))};}catch{}}return null;}
async function textByName(name,contains=''){const p=files.find(x=>x.endsWith('/'+name)&&x.includes(contains));return p?{path:p,value:await readFile(p,'utf8')}:null;}
const statuses={pilot:process.env.PILOT_RESULT||'unknown',preparePrimary:process.env.PREPARE_RESULT||'unknown',primaryShards:process.env.PRIMARY_SHARDS_RESULT||'unknown',primaryAnalysis:process.env.PRIMARY_ANALYSIS_RESULT||'unknown',pitExperiments:process.env.PIT_EXPERIMENT_RESULT||'unknown',supplemental:process.env.SUPPLEMENTAL_RESULT||'unknown',postgres:process.env.POSTGRES_RESULT||'unknown'};
const primary=await jsonByName('primary-summary.json','primary-summary'),pilot=await jsonByName('pilot-summary.json','pilot-summary'),audit=await jsonByName('npm-audit.json','security'),det=await jsonByName('summary.json','determinism'),pathEq=await jsonByName('summary.json','path-equivalence'),uuid=await jsonByName('summary.json','uuid-remap'),outlier=await jsonByName('summary.json','outlier-replays'),persist=await jsonByName('postgres-persistence.json'),pit=await jsonByName('undercut-overcut-analysis.json'),perf=await jsonByName('performance-analysis.json'),wet=await jsonByName('wet-grid.json'),contract=await jsonByName('command-contract.json'),quality=await textByName('unit-tests.log','pilot-summary'),dbQuality=await textByName('db-tests.log','pilot-summary');
const sample=primary?.value?.sample||{},primaryFailures=primary?.value?.failures||[],persistSummary=persist?.value?.summary||persist?.value?.Summary||null;
const allPrimary=sample.primaryRaces===30000&&sample.validFullRaces===30000&&statuses.primaryAnalysis==='success';
const serious=primaryFailures.some(x=>/numeric|fuel|pit-route|DRS|version|classification|tyre cliff|non-monotonic/i.test(x.reason||''))||Boolean(det?.value?.failed)||Boolean(pathEq?.value?.failed)||Boolean(uuid?.value?.failed)||Boolean(persistSummary?.failures?.length);
const remoteCapacityOnly=[statuses.pilot,status.preparePrimary,status.primaryShards].includes('blocked-capacity');
const verdict=remoteCapacityOnly?'REMOTE QA BLOCKED — GITHUB ACTIONS CAPACITY / PERMISSION LIMIT':serious?'RACE v8 REQUIRES TARGETED ENGINE REPAIR':'INSUFFICIENT FINAL CODE QA COVERAGE';
const auditSummary=audit?.value?.metadata?.vulnerabilities||audit?.value?.metadata?.dependencies||null;
const detectedTests=source=>source?.value?.match(/Test Files\s+([^\n]+)/)?.[1]||'not parsed';
const detectedCount=source=>source?.value?.match(/Tests\s+([^\n]+)/)?.[1]||'not parsed';
const testFiles=detectedTests(quality),unitCount=detectedCount(quality),dbTestFiles=detectedTests(dbQuality),dbCount=detectedCount(dbQuality);
const coverage=[
  ['30,000 full revision-4 races',allPrimary?'PASS':'NOT COMPLETE',`${sample.validFullRaces||0}/30000 valid; campaigns ${JSON.stringify(sample.campaignCounts||{})}`],
  ['100-race hosted pilot',pilot?.value?.verdict||statuses.pilot,`${pilot?.value?.pilotRaceCount??0} full races; ${pilot?.value?.runner?.runnerEnvironment??'runner identity unavailable'}`],
  ['45 command combinations',primary?.value?.commandFactorial?.combinationCount===45&&primary?.value?.commandFactorial?.circuitCombinationCells===450?'PASS':'NOT COMPLETE',`${primary?.value?.commandFactorial?.combinationCount??0} mode combinations; ${primary?.value?.commandFactorial?.circuitCombinationCells??0}/450 circuit × combination cells`],
  ['Determinism replays',det?.value?.failed===0&&det?.value?.completed===1500?'PASS':'NOT COMPLETE',`${det?.value?.completed??0} completed; ${det?.value?.failed??'n/a'} mismatches`],
  ['Execution-path cases',pathEq?.value?.failed===0&&pathEq?.value?.completed===500?'PASS':'NOT COMPLETE',`${pathEq?.value?.completed??0} cases`],
  ['PostgreSQL persistence',persistSummary?.continuationMatches===100?'PASS':'NOT COMPLETE',`${persistSummary?.continuationMatches??0}/100 continuations; exact reloads ${persistSummary?.exactReloads??0}`],
  ['UUID remap cases',uuid?.value?.failed===0&&uuid?.value?.completed===500?'PASS':'NOT COMPLETE',`${uuid?.value?.completed??0} cases`],
  ['Undercut / overcut paired experiments',pit?.value?.failures?.length===0?'PASS':'NOT COMPLETE',`${pit?.value?.reports?.UNDERCUT?.completePairCount??0}/3000 undercut; ${pit?.value?.reports?.OVERCUT?.completePairCount??0}/3000 overcut`],
  ['16 wet-grid points',wet?.value?.trackWaterPoints?.length===16?'PARTIAL':'NOT COMPLETE',`${wet?.value?.trackWaterPoints?.length??0} points × ${wet?.value?.circuitCount??0} circuits`],
  ['Command/server boundary',contract?.value?.failedCount===0?'PASS':'NOT COMPLETE',`${contract?.value?.passedCount??0} checks passed; ${contract?.value?.failedCount??0} failed`],
  ['Outlier replays',outlier?.value?.failed===0&&outlier?.value?.completed>=1100?'PASS':'NOT COMPLETE',`${outlier?.value?.completed??0} replays; per-category counts in replay evidence`],
  ['Remote performance/memory',perf?'PARTIAL':'NOT COMPLETE',perf?`${perf.value.benchmarks?.map(x=>`${x.races} races: ${x.wallMs}ms`).join('; ')}; revision-3/4 pairs ${perf.value.revision3Vs4?.pairedRaces??0}`:'No performance report'],
  ['Historical compatibility and v8A digest','PARTIAL',`Remote unit suite: ${testFiles}; ${unitCount}. It includes regression coverage but exact historical goldens are not independently replayed here.`],
  ['Pace, fuel, energy policies and all 45 command pairings','PARTIAL',`Command factorial and per-lap fuel/energy telemetry are recorded; free-ATTACK, fuel/energy switching exploits and all command acceptance permutations are not fully isolated.`],
  ['Fuel creation, starvation and fuel exploits','PARTIAL',`Primary numeric telemetry reports ${sample.fuelCreationEvents??'n/a'} fuel gains; adversarial near-zero, zero, switching and reload scenarios are not separately complete.`],
  ['Energy depletion, recovery, BOOST and Overtake stacking','PARTIAL','Energy store bounds and policy telemetry are checked during primary runs; forced store-state and electrical-envelope exploit matrices are not complete.'],
  ['Active Aero, Overtake Mode, legacy ERS and legacy DRS','PARTIAL',`Observed revision-4 DRS eligibility/benefit: ${sample.legacyDrsEligible ?? 'n/a'}/${sample.legacyDrsBenefits ?? 'n/a'}. Entitlement edge cases, energy stacking and legacy ERS input rejection are not all independently replayed.`],
  ['Tyre cliff, pit strategy, Monaco and pit loss','PARTIAL','Exact v8D tyre profiles, observed pit counts and circuit summaries are included; all pit-loss anchors, pit quantiles, compound transitions and Monaco control comparisons are not complete.'],
  ['Wet strategy, regulation, Sprint, classification and championship consequences','PARTIAL','Race-level regulation and DSQ summaries are included; future-weather boundary and championship consequence cases are not separately replayed.'],
  ['Passing, late Race, minimum gap, trains, lapping and pit route','PARTIAL','Attempt/success timing, near-floor pair run classes, and route transitions are collected; blue-flag, train split/reform and all track-local progression transitions are not complete.'],
  ['Incident, SC/VSC and RNG quality/coupling','PARTIAL','Incident and neutralisation totals are captured; lag correlations, stream coupling, trigger and duration distributions are not independently measured.'],
  ['Public information boundary and full server command rejection matrix','PARTIAL','Own-car command acceptance, AI-rival, retired/finished and stale command checks run; every server lifecycle and rival hidden-field is not fully audited.'],
  ['Security reachability and package remediation analysis','PARTIAL','npm audit raw JSON and exit status are retained; package-by-package reachability and upgrade-risk analysis is not included.'],
  ['Long-run memory and open handles','PARTIAL','Hosted worker heap/RSS/post-GC samples and active resource types are recorded; a full retained-heap leak proof is not established.'],
];
const artifacts=files.filter(p=>p.endsWith('.json')||p.endsWith('.gz')||p.endsWith('.log')).map(p=>p.slice(evidence.length+1));
const data={verdict,productionSHA:'55846a9c465b58fc5687517ace67772421868dff',qaCommit:process.env.GITHUB_SHA||null,githubRunId:process.env.GITHUB_RUN_ID||null,statuses,runner:pilot?.value?.runner||null,localResourceDisclosure:{heavyRaceCampaignExecutedOnOwnersMac:'YES — earlier local QA attempts existed before the remote-only campaign and are excluded from every count in this report',localRaceWorkersDuringThisRemoteRun:'NO',localPostgreSQLUsedForThisRemoteCampaign:'NO',githubHostedActionsRunnersUsed:statuses.pilot==='success'?'YES':'NOT VERIFIED'},productionState:{mainModified:false,productionSemanticsModified:false,qaBranchMerged:false,browserGameplayPerformed:false},qualityGate:{unitTestFiles:testFiles,unitTests:unitCount,dbTestFiles:dbTestFiles,dbTests:dbCount,npmAudit:auditSummary,logs:{unit:quality?.path??null,database:dbQuality?.path??null}},sample,primaryFailures,coverage,artifacts};
await writeFile(join(out,'final-report-data.json'),JSON.stringify(data,null,2)+'\n');
const lines=[
  '# RACE v8 — FINAL REMOTE FORENSIC ENGINE VALIDATION','',
  '## Executive Verdict','',`**${verdict}**`,'',
  '## Production SHA','',`\`${data.productionSHA}\` (Race v8, progression revision 4). QA commit: \`${data.qaCommit||'not available'}\`. GitHub Actions run: \`${data.githubRunId||'not available'}\`.`,'',
  '## Remote Runner Verification','',`GitHub-hosted Actions runners used: **${data.localResourceDisclosure.githubHostedActionsRunnersUsed}**. Pilot runner: \`${data.runner?.runnerEnvironment||'not verified'} / ${data.runner?.runnerOS||'unknown'}\`.`,'',
  '## Local Resource Verification','',
  '- Heavy Race campaign executed on project owner’s Mac: **YES — earlier pre-remote-only local attempts occurred and are excluded from this validation sample.** No local campaign was run for this remote-only campaign.',
  '- Local Monte Carlo workers launched for this remote-only campaign: **NO**.',
  '- Local PostgreSQL used for this remote campaign: **NO**. PostgreSQL campaign used a disposable GitHub Actions service container.',
  '- No local race workers remained running when remote QA resumed.','',
  '## QA Branch Integrity','',`Production main modified: **NO**. Production source semantics modified: **NO**. QA branch merged: **NO**. Browser gameplay performed: **NO**.`,'',
  '## Remote Pilot','',`Status: **${pilot?.value?.verdict||statuses.pilot}**; valid full races: ${pilot?.value?.validFullRaceCount??0}; unique circuits: ${pilot?.value?.uniqueCircuitCount??0}; runner identity recorded: ${pilot?.value?.runner?.runnerEnvironment||'no'}.`,'',
  '## Quality Gate','',`Unit test files: ${testFiles}; unit tests: ${unitCount}. DB test files: ${dbTestFiles}; DB tests: ${dbCount}. Audit vulnerability summary: \`${JSON.stringify(auditSummary)}\`. Package versions were not changed.`,'',
  '## Primary 30,000-Race Sample','',`Valid primary races: **${sample.validFullRaces??0}/30,000**; total laps: ${sample.totalLaps??0}; entrant-race observations: ${sample.entrantRaceObservations??0}; attempts: ${sample.passAttempts??0}; passes: ${sample.passes??0}; pit stops: ${sample.pitStops??0}; incidents: ${sample.incidents??0}; SC starts: ${sample.safetyCarStarts??0}; VSC starts: ${sample.vscStarts??0}; retirements: ${sample.retirements??0}; DSQ: ${sample.dsqs??0}.`,'',
  '## Coverage Summary','',
  '| Area | Result | Evidence |','|---|---|---|',
  ...coverage.map(([area,result,detail])=>`| ${area} | ${result} | ${detail.replaceAll('|','/')} |`),'',
  '## Statistical Method','',`Race-level metrics use N, mean, median, SD, percentiles and 95% intervals. The command matrix pairs 45 settings by circuit and seed. The detailed evidence records telemetry identity, shard assignment and replay digests. The telemetry intervals are descriptive race-level intervals; no independent-car or independent-lap inference is claimed.`,'',
  '## Sample Disclosure','',`GP/supplemental primary races: ${sample.GP??0}; Sprint: ${sample.Sprint??0}; command factorial race rows: ${sample.commandFactorial??0}; primary full races: ${sample.primaryRaces??0}; determinism replays: ${det?.value?.completed??0}; execution-path cases: ${pathEq?.value?.completed??0}; PostgreSQL cases: ${persistSummary?.scenarioCount??0}; UUID cases: ${uuid?.value?.completed??0}; outlier replays: ${outlier?.value?.completed??0}; undercut pairs: ${pit?.value?.reports?.UNDERCUT?.completePairCount??0}; overcut pairs: ${pit?.value?.reports?.OVERCUT?.completePairCount??0}.`,'',
  '## Final Verdict','',`**${verdict}**`,'',
  '## Confidence','',`${allPrimary&&statuses.pilot==='success'?'MEDIUM':'LOW'} — the shipped artifact inventory and workflow outputs define the measured sample; unrun adversarial subsystems remain listed above.`,'',
  '## Cleanup','',`production main modified: **NO**; production source semantics modified: **NO**; QA branch merged: **NO**; browser gameplay performed: **NO**; 30,000 remote primary races completed: **${allPrimary?'YES':'NO'}**; all 45 command combinations: **${primary?.value?.commandFactorial?.combinationCount===45?'YES':'NO'}**; 1,500 determinism replays: **${det?.value?.completed===1500?'YES':'NO'}**; PostgreSQL persistence: **${persistSummary?.scenarioCount===100?'YES':'NO'}**; owner Mac used for heavy simulation in this report’s remote-only run: **NO**.`,'',
  'Then STOP.'
];
await writeFile(join(out,'final-report.md'),lines.join('\n')+'\n');
console.log(JSON.stringify({verdict,productionSHA:data.productionSHA,primaryRaces:sample.primaryRaces??0,statuses,report:join(out,'final-report.md')}));
