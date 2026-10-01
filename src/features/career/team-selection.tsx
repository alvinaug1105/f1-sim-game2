"use client";
import type { CareerCreationOptions } from "../../game/domain/career";
import { useI18n } from "../../i18n/provider";
const dimensions = [
  ["lowSpeed", "car.lowSpeed"], ["mediumSpeed", "car.mediumSpeed"], ["highSpeed", "car.highSpeed"],
  ["dragReduction", "car.dragReduction"], ["drsEfficiency", "car.drsEfficiency"],
] as const;
type Team = CareerCreationOptions["databases"][number]["seasons"][number]["teams"][number];
export function TeamSelection({ teams, selectedId, onSelect, disabled }: {
  teams: readonly Team[]; selectedId: string; onSelect: (id: string) => void; disabled: boolean;
}) {
  const { t, format } = useI18n();
  return <fieldset className="team-picker" disabled={disabled}>
    <legend>{t("career.team")}</legend>
    {teams.length > 0 && <p className="team-picker-hint">{t("career.teamPickerHint", { count: format.number(teams.length - 1) })}</p>}
    <div className="team-grid">
      {teams.map(team => <label key={team.id} className={`team-card${selectedId === team.id ? " selected" : ""}`}
        style={{ ["--team" as string]: team.color ?? "#a0a6af" }}>
        <input type="radio" name="playerTeamId" value={team.id} required checked={selectedId === team.id}
          aria-labelledby={`team-name-${team.id}`} aria-describedby={`team-ratings-${team.id} team-drivers-${team.id}`}
          onChange={() => onSelect(team.id)} />
        <span className="team-card-name" id={`team-name-${team.id}`}>{team.name}</span>
        <dl className="team-card-ratings" id={`team-ratings-${team.id}`}>
          <div className="team-card-overall"><dt>{t("car.overall")}</dt><dd>{format.number(team.overallPerformance)}</dd></div>
          {dimensions.map(([dimension, key]) => <div key={dimension}><dt>{t(key)}</dt><dd>{format.number(team.stats[dimension])}</dd></div>)}
        </dl>
        <span className="team-card-drivers" id={`team-drivers-${team.id}`}>
          {team.drivers?.map(driver => <span key={driver.abbreviation}><strong>{driver.abbreviation}</strong> {driver.name}</span>)}
        </span>
      </label>)}
    </div>
  </fieldset>;
}
