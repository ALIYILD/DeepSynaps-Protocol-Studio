/** WinEEG-fidelity patient card — nested JSON merges via PATCH (deep merge server-side). */

import { useCallback, useMemo, useState } from "react";
import type { CSSProperties } from "react";

import type { PatientCardResponse } from "./databaseApi";
import { icdSuggestions, patchPatientProfile } from "./databaseApi";

type Props = {
  patientId: string;
  data: PatientCardResponse | null;
  onSaved: () => void;
};

function nest(path: string[], value: unknown): Record<string, unknown> {
  if (path.length === 0) return {};
  if (path.length === 1) return { [path[0]!]: value };
  return { [path[0]!]: nest(path.slice(1), value) };
}

export function PatientCard({ patientId, data, onSaved }: Props) {
  const profile = useMemo(() => (data?.profile ?? {}) as Record<string, unknown>, [data]);
  const [icdOpts, setIcdOpts] = useState<{ code: string; label: string }[]>([]);

  const mergePatch = useCallback(
    (fragment: Record<string, unknown>) =>
      patchPatientProfile(patientId, fragment).then(() => onSaved()),
    [patientId, onSaved],
  );

  const updatePath = useCallback(
    (path: string[], value: unknown) => {
      void mergePatch(nest(path, value));
    },
    [mergePatch],
  );

  const onIcdInput = async (v: string) => {
    try {
      const r = await icdSuggestions(v);
      setIcdOpts(r.items ?? []);
    } catch {
      setIcdOpts([]);
    }
  };

  if (!data) return <div style={{ padding: 12 }}>Loading patient…</div>;

  const ident = (profile.identification as Record<string, string>) ?? {};
  const clin = (profile.clinical as Record<string, unknown>) ?? {};
  const meds = (clin.medications as Array<Record<string, string>>) ?? [];
  const anth = (profile.anthropometric as Record<string, number | null>) ?? {};
  const demo = (profile.demographic as Record<string, string>) ?? {};
  const recDef = (profile.recordingDefaults as Record<string, unknown>) ?? {};

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, fontSize: 12 }}>
      <fieldset style={fs}>
        <legend>Identification</legend>
        <label>
          First name
          <input
            style={inp}
            value={ident.firstName ?? ""}
            onChange={(e) => updatePath(["identification", "firstName"], e.target.value)}
          />
        </label>
        <label>
          Last name
          <input
            style={inp}
            value={ident.lastName ?? ""}
            onChange={(e) => updatePath(["identification", "lastName"], e.target.value)}
          />
        </label>
        <label>
          Patronymic
          <input
            style={inp}
            value={ident.patronymic ?? ""}
            onChange={(e) => updatePath(["identification", "patronymic"], e.target.value)}
          />
        </label>
        <label>
          Patient ID (external)
          <input
            style={inp}
            value={ident.externalPatientId ?? ""}
            onChange={(e) =>
              updatePath(["identification", "externalPatientId"], e.target.value)
            }
          />
        </label>
        <label>
          DOB
          <input
            style={inp}
            placeholder="YYYY-MM-DD"
            value={ident.dateOfBirth ?? ""}
            onChange={(e) => updatePath(["identification", "dateOfBirth"], e.target.value)}
          />
        </label>
        <label>
          Sex
          <select
            style={inp}
            value={ident.sex ?? ""}
            onChange={(e) => updatePath(["identification", "sex"], e.target.value)}
          >
            <option value="">—</option>
            <option value="female">Female</option>
            <option value="male">Male</option>
            <option value="other">Other</option>
          </select>
        </label>
        <label>
          Handedness
          <select
            style={inp}
            value={ident.handedness ?? ""}
            onChange={(e) => updatePath(["identification", "handedness"], e.target.value)}
          >
            <option value="">—</option>
            <option value="R">Right</option>
            <option value="L">Left</option>
            <option value="Ambi">Ambidextrous</option>
          </select>
        </label>
      </fieldset>

      <fieldset style={fs}>
        <legend>Clinical</legend>
        <label>
          ICD-10/11 code (search)
          <input
            style={inp}
            list="icd-list"
            value={(clin.diagnosisIcdCode as string) ?? ""}
            onChange={(e) => {
              void onIcdInput(e.target.value);
              updatePath(["clinical", "diagnosisIcdCode"], e.target.value);
            }}
          />
          <datalist id="icd-list">
            {icdOpts.map((o) => (
              <option key={o.code} value={o.code}>
                {o.label}
              </option>
            ))}
          </datalist>
        </label>
        <label>
          Diagnosis label
          <input
            style={inp}
            value={(clin.diagnosisLabel as string) ?? ""}
            onChange={(e) => updatePath(["clinical", "diagnosisLabel"], e.target.value)}
          />
        </label>
        <label>
          Referring physician
          <input
            style={inp}
            value={(clin.referringPhysician as string) ?? ""}
            onChange={(e) => updatePath(["clinical", "referringPhysician"], e.target.value)}
          />
        </label>
        <label>
          Referring department
          <input
            style={inp}
            value={(clin.referringDepartment as string) ?? ""}
            onChange={(e) => updatePath(["clinical", "referringDepartment"], e.target.value)}
          />
        </label>
        <label>
          Reason for examination
          <textarea
            style={{ ...inp, width: "100%", minHeight: 52 }}
            value={(clin.reasonForExamination as string) ?? ""}
            onChange={(e) =>
              updatePath(["clinical", "reasonForExamination"], e.target.value)
            }
          />
        </label>
        <div>Medications</div>
        <table style={{ width: "100%", fontSize: 11 }}>
          <thead>
            <tr>
              <th>Drug</th>
              <th>Dose</th>
              <th>Schedule</th>
              <th>Last taken</th>
            </tr>
          </thead>
          <tbody>
            {meds.map((m, i) => (
              <tr key={i}>
                <td>
                  <input
                    value={m.drug ?? ""}
                    onChange={(e) => {
                      const copy = [...meds];
                      copy[i] = { ...copy[i], drug: e.target.value };
                      updatePath(["clinical", "medications"], copy);
                    }}
                  />
                </td>
                <td>
                  <input
                    value={m.dose ?? ""}
                    onChange={(e) => {
                      const copy = [...meds];
                      copy[i] = { ...copy[i], dose: e.target.value };
                      updatePath(["clinical", "medications"], copy);
                    }}
                  />
                </td>
                <td>
                  <input
                    value={m.schedule ?? ""}
                    onChange={(e) => {
                      const copy = [...meds];
                      copy[i] = { ...copy[i], schedule: e.target.value };
                      updatePath(["clinical", "medications"], copy);
                    }}
                  />
                </td>
                <td>
                  <input
                    value={m.lastTaken ?? ""}
                    onChange={(e) => {
                      const copy = [...meds];
                      copy[i] = { ...copy[i], lastTaken: e.target.value };
                      updatePath(["clinical", "medications"], copy);
                    }}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <button
          type="button"
          onClick={() =>
            updatePath(["clinical", "medications"], [
              ...meds,
              { drug: "", dose: "", schedule: "", lastTaken: "" },
            ])
          }
        >
          + Row
        </button>
        <label>
          Sleep last night (h)
          <input
            type="number"
            style={inp}
            value={typeof clin.sleepLastNightHours === "number" ? clin.sleepLastNightHours : ""}
            onChange={(e) =>
              updatePath(
                ["clinical", "sleepLastNightHours"],
                e.target.value === "" ? null : Number(e.target.value),
              )
            }
          />
        </label>
        <label>
          Caffeine
          <select
            style={inp}
            value={
              clin.caffeineYN === null || clin.caffeineYN === undefined ?
                ""
              : String(clin.caffeineYN)
            }
            onChange={(e) =>
              updatePath(
                ["clinical", "caffeineYN"],
                e.target.value === "" ? null : e.target.value === "true",
              )
            }
          >
            <option value="">—</option>
            <option value="true">Yes</option>
            <option value="false">No</option>
          </select>
        </label>
        <label>
          Notes
          <textarea
            style={{ ...inp, width: "100%", minHeight: 64 }}
            value={(clin.clinicalNotes as string) ?? ""}
            onChange={(e) => updatePath(["clinical", "clinicalNotes"], e.target.value)}
          />
        </label>
      </fieldset>

      <fieldset style={fs}>
        <legend>Recording defaults</legend>
        <label>
          Operator
          <input
            style={inp}
            value={(recDef.operator as string) ?? ""}
            onChange={(e) => updatePath(["recordingDefaults", "operator"], e.target.value)}
          />
        </label>
        <label>
          Equipment
          <select
            style={inp}
            value={(recDef.equipment as string) ?? ""}
            onChange={(e) => updatePath(["recordingDefaults", "equipment"], e.target.value)}
          >
            <option value="">—</option>
            <option>Mitsar-201</option>
            <option>Mitsar-202</option>
            <option>SmartBCI 32</option>
            <option>SmartBCI 64</option>
          </select>
        </label>
        <label>
          Sampling rate (Hz)
          <input
            type="number"
            style={inp}
            value={typeof recDef.samplingRateHz === "number" ? recDef.samplingRateHz : ""}
            onChange={(e) =>
              updatePath(
                ["recordingDefaults", "samplingRateHz"],
                e.target.value === "" ? null : Number(e.target.value),
              )
            }
          />
        </label>
        <label>
          Calibration file
          <input
            style={inp}
            value={(recDef.calibrationFile as string) ?? ""}
            onChange={(e) => updatePath(["recordingDefaults", "calibrationFile"], e.target.value)}
          />
        </label>
        <label>
          Electrode cap
          <input
            style={inp}
            value={(recDef.electrodeCapModel as string) ?? ""}
            onChange={(e) =>
              updatePath(["recordingDefaults", "electrodeCapModel"], e.target.value)
            }
          />
        </label>
      </fieldset>

      <fieldset style={fs}>
        <legend>Anthropometric</legend>
        {(
          [
            ["heightCm", "Height (cm)"],
            ["weightKg", "Weight (kg)"],
            ["headCircumferenceCm", "Head circumference (cm)"],
            ["inionNasionMm", "Inion–nasion (mm)"],
            ["earToEarMm", "Ear–ear (mm)"],
          ] as const
        ).map(([k, lab]) => (
          <label key={k}>
            {lab}
            <input
              type="number"
              style={inp}
              value={anth[k] ?? ""}
              onChange={(e) =>
                updatePath(
                  ["anthropometric", k],
                  e.target.value === "" ? null : Number(e.target.value),
                )
              }
            />
          </label>
        ))}
      </fieldset>

      <fieldset style={fs}>
        <legend>Demographic</legend>
        <label>
          Education
          <input
            style={inp}
            value={demo.education ?? ""}
            onChange={(e) => updatePath(["demographic", "education"], e.target.value)}
          />
        </label>
        <label>
          Occupation
          <input
            style={inp}
            value={demo.occupation ?? ""}
            onChange={(e) => updatePath(["demographic", "occupation"], e.target.value)}
          />
        </label>
        <label>
          Native language
          <input
            style={inp}
            value={demo.nativeLanguage ?? ""}
            onChange={(e) => updatePath(["demographic", "nativeLanguage"], e.target.value)}
          />
        </label>
      </fieldset>

      <div style={{ opacity: 0.75 }}>
        Last updated {data.updatedAt?.slice(0, 19) ?? "—"} · revisions stored server-side
      </div>
    </div>
  );
}

const fs: CSSProperties = {
  border: "1px solid var(--ds-line, #ccc)",
  borderRadius: 6,
  padding: 10,
  display: "grid",
  gap: 6,
};
const inp: CSSProperties = { display: "block", width: "100%", marginTop: 2 };
