import { useCallback, useEffect, useMemo, useState } from "react";
import { FeedbackNotice } from "./FeedbackNotice";
import type {
  ScoreConfigActivityTypeInput,
  ScoreConfigGroupInput,
  ScoreConfigJsonImportResult,
  ScoreConfigSnapshot,
  ScoreConfigSnapshotCreateInput,
  ScoreConfigVersion
} from "../types";
import { buildScoringUpdateSummaryMessage } from "../utils/shareMessages";

type Props = {
  normalizeError: (error: unknown) => Error;
};

type ActivityTypeDraft = ScoreConfigActivityTypeInput & { client_id: string };
type GroupDraft = Omit<ScoreConfigGroupInput, "activity_types"> & {
  client_id: string;
  activity_types: ActivityTypeDraft[];
};

type Draft = {
  source_version_id?: number | null;
  name: string;
  notes: string;
  activate: boolean;
  apply_to_historical_logs: boolean;
  groups: GroupDraft[];
};

function createClientId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

function createEmptyDraft(): Draft {
  return {
    source_version_id: null,
    name: "",
    notes: "",
    activate: false,
    apply_to_historical_logs: false,
    groups: []
  };
}

function snapshotToDraft(snapshot: ScoreConfigSnapshot): Draft {
  return {
    source_version_id: snapshot.version.id,
    name: `${snapshot.version.name} Copy`,
    notes: snapshot.version.notes ?? "",
    activate: false,
    apply_to_historical_logs: false,
    groups: snapshot.groups.map((group) => ({
      client_id: createClientId("group"),
      code: group.code,
      name: group.name,
      base_xp: group.base_xp,
      sort_order: group.sort_order,
      is_active: group.is_active === 1,
      activity_types: group.activity_types.map((activityType) => ({
        client_id: createClientId("type"),
        code: activityType.code,
        name: activityType.name,
        percent_of_group_base: activityType.percent_of_group_base,
        parent_activity_type_code:
          activityType.parent_activity_type_id === null
            ? null
            : group.activity_types.find((candidate) => candidate.id === activityType.parent_activity_type_id)?.code ?? null,
        percent_of_parent_type: activityType.percent_of_parent_type ?? undefined,
        fixed_points: activityType.fixed_points,
        is_active: activityType.is_active === 1,
        sort_order: activityType.sort_order
      }))
    }))
  };
}

function draftToPayload(draft: Draft): ScoreConfigSnapshotCreateInput {
  return {
    source_version_id: draft.source_version_id ?? null,
    name: draft.name,
    notes: draft.notes || null,
    activate: draft.activate,
    apply_to_historical_logs: draft.activate ? draft.apply_to_historical_logs : false,
    groups: draft.groups.map((groupDraft, groupIndex) => {
      const { activity_types, ...group } = groupDraft;
      return {
        ...group,
        sort_order: group.sort_order ?? groupIndex,
        activity_types: activity_types.map((activityTypeDraft, typeIndex) => {
          const { ...activityType } = activityTypeDraft;
          return {
            ...activityType,
            sort_order: activityType.sort_order ?? typeIndex,
            fixed_points:
              activityType.fixed_points === undefined || activityType.fixed_points === null
                ? null
                : Number(activityType.fixed_points)
          };
        })
      };
    })
  };
}

function validateDraft(draft: Draft): string | null {
  if (!draft.name.trim()) {
    return "Version name is required.";
  }

  const groupCodes = new Set<string>();
  const groupNames = new Set<string>();

  for (const group of draft.groups) {
    const code = group.code.trim().toUpperCase();
    const name = group.name.trim().toLowerCase();

    if (!code || !group.name.trim()) {
      return "Every group must have a code and name.";
    }

    if (groupCodes.has(code) || groupNames.has(name)) {
      return `Duplicate group detected: ${group.code || group.name}`;
    }

    groupCodes.add(code);
    groupNames.add(name);

    const activityCodes = new Set<string>();
    const activityNames = new Set<string>();
    for (const activityType of group.activity_types) {
      const activityCode = activityType.code.trim().toUpperCase();
      const activityName = activityType.name.trim().toLowerCase();
      const percent = Number(
        activityType.parent_activity_type_code ? activityType.percent_of_parent_type ?? 0 : activityType.percent_of_group_base ?? 0
      );
      const fixedPoints =
        activityType.fixed_points === undefined || activityType.fixed_points === null
          ? null
          : Number(activityType.fixed_points);

      if (!activityCode || !activityType.name.trim()) {
        return `Every activity in ${group.code} must have a code and name.`;
      }

      if (activityCodes.has(activityCode) || activityNames.has(activityName)) {
        return `Duplicate activity detected in ${group.code}: ${activityType.code || activityType.name}`;
      }

      if (!Number.isFinite(percent) || percent < 0 || percent > 100) {
        return `Invalid percent for ${activityType.code}. Allowed range is 0 to 100.`;
      }

      if (fixedPoints !== null && (!Number.isFinite(fixedPoints) || fixedPoints < 0)) {
        return `Invalid fixed points for ${activityType.code}.`;
      }

      if (fixedPoints === null && percent <= 0) {
        return `Activity ${activityType.code} must use either percent > 0 or fixed points.`;
      }

      if (activityType.parent_activity_type_code) {
        const parentCode = activityType.parent_activity_type_code.trim().toUpperCase();
        if (!activityCodes.has(parentCode)) {
          return `Parent activity ${parentCode} must appear before ${activityType.code}.`;
        }
      }

      activityCodes.add(activityCode);
      activityNames.add(activityName);
    }
  }

  return null;
}

export function ScoreConfigAdmin({ normalizeError }: Props) {
  const [versions, setVersions] = useState<ScoreConfigVersion[]>([]);
  const [selectedVersionId, setSelectedVersionId] = useState<number | null>(null);
  const [selectedSnapshot, setSelectedSnapshot] = useState<ScoreConfigSnapshot | null>(null);
  const [draft, setDraft] = useState<Draft>(createEmptyDraft());
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [shareSummaryMessage, setShareSummaryMessage] = useState<string | null>(null);

  const selectedVersion = useMemo(
    () => versions.find((version) => version.id === selectedVersionId) ?? null,
    [selectedVersionId, versions]
  );

  const effectiveShareSummaryMessage = useMemo(() => {
    if (shareSummaryMessage) {
      return shareSummaryMessage;
    }

    if (selectedSnapshot) {
      return buildScoringUpdateSummaryMessage("Current scoring version", selectedSnapshot);
    }

    return null;
  }, [selectedSnapshot, shareSummaryMessage]);

  const loadVersions = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const nextVersions = await window.desktop.scoreConfig.listVersions();
      setVersions(nextVersions);

      if (!selectedVersionId && nextVersions.length > 0) {
        setSelectedVersionId(nextVersions[0].id);
      }
    } catch (err) {
      setError(normalizeError(err).message);
    } finally {
      setIsLoading(false);
    }
  }, [normalizeError, selectedVersionId]);

  const loadSnapshot = useCallback(async (versionId: number) => {
    setIsLoading(true);
    setError(null);

    try {
      const snapshot = await window.desktop.scoreConfig.getSnapshot(versionId);
      setSelectedSnapshot(snapshot);
      setShareSummaryMessage(null);
      if (snapshot) {
        setDraft(snapshotToDraft(snapshot));
      }
    } catch (err) {
      setError(normalizeError(err).message);
    } finally {
      setIsLoading(false);
    }
  }, [normalizeError]);

  useEffect(() => {
    void loadVersions();
  }, [loadVersions]);

  useEffect(() => {
    if (selectedVersionId !== null) {
      void loadSnapshot(selectedVersionId);
    }
  }, [selectedVersionId, loadSnapshot]);

  const refresh = async (versionId?: number | null) => {
    await loadVersions();
    if (versionId ?? selectedVersionId) {
      setSelectedVersionId(versionId ?? selectedVersionId);
    }
  };

  const shareScoringUpdateSummary = async () => {
    if (!effectiveShareSummaryMessage) {
      return;
    }

    setError(null);
    setStatus(null);
    try {
      await window.desktop.share.openWhatsApp(effectiveShareSummaryMessage);
      setStatus("Opened WhatsApp share for scoring update summary.");
    } catch (err) {
      setError(normalizeError(err).message);
    }
  };

  const copyScoringUpdateSummary = async () => {
    if (!effectiveShareSummaryMessage) {
      return;
    }

    setError(null);
    setStatus(null);
    try {
      await window.desktop.share.copyText(effectiveShareSummaryMessage);
      setStatus("Scoring update summary copied to clipboard.");
    } catch (err) {
      setError(normalizeError(err).message);
    }
  };

  const addGroup = () => {
    setDraft((prev) => ({
      ...prev,
      groups: [
        ...prev.groups,
        {
          client_id: createClientId("group"),
          code: "",
          name: "",
          base_xp: 0,
          sort_order: prev.groups.length,
          is_active: true,
          activity_types: []
        }
      ]
    }));
  };

  const updateGroup = (clientId: string, field: keyof ScoreConfigGroupInput, value: string | number | boolean) => {
    setDraft((prev) => ({
      ...prev,
      groups: prev.groups.map((group) =>
        group.client_id === clientId ? { ...group, [field]: value } : group
      )
    }));
  };

  const removeGroup = (clientId: string) => {
    setDraft((prev) => ({
      ...prev,
      groups: prev.groups.filter((group) => group.client_id !== clientId)
    }));
  };

  const addActivityType = (groupClientId: string) => {
    setDraft((prev) => ({
      ...prev,
      groups: prev.groups.map((group) =>
        group.client_id === groupClientId
          ? {
              ...group,
              activity_types: [
                ...group.activity_types,
                {
                  client_id: createClientId("type"),
                  code: "",
                  name: "",
                  percent_of_group_base: 0,
                  parent_activity_type_code: null,
                  percent_of_parent_type: undefined,
                  fixed_points: null,
                  sort_order: group.activity_types.length,
                  is_active: true
                }
              ]
            }
          : group
      )
    }));
  };

  const updateActivityType = (
    groupClientId: string,
    typeClientId: string,
    field: keyof ScoreConfigActivityTypeInput,
    value: string | number | boolean | null
  ) => {
    setDraft((prev) => ({
      ...prev,
      groups: prev.groups.map((group) =>
        group.client_id === groupClientId
          ? {
              ...group,
              activity_types: group.activity_types.map((activityType) =>
                activityType.client_id === typeClientId ? { ...activityType, [field]: value } : activityType
              )
            }
          : group
      )
    }));
  };

  const removeActivityType = (groupClientId: string, typeClientId: string) => {
    setDraft((prev) => ({
      ...prev,
      groups: prev.groups.map((group) =>
        group.client_id === groupClientId
          ? {
              ...group,
              activity_types: group.activity_types.filter((activityType) => activityType.client_id !== typeClientId)
            }
          : group
      )
    }));
  };

  const saveDraft = async () => {
    setError(null);
    setStatus(null);

    const validationError = validateDraft(draft);
    if (validationError) {
      setError(validationError);
      return;
    }

    try {
      const created = await window.desktop.scoreConfig.createSnapshot(draftToPayload(draft));
      setStatus(`Created version ${created.version.name} (#${created.version.id}).`);
      setShareSummaryMessage(buildScoringUpdateSummaryMessage("Created new scoring version", created));
      setSelectedVersionId(created.version.id);
      await refresh(created.version.id);
    } catch (err) {
      setError(normalizeError(err).message);
    }
  };

  const activateSelected = async () => {
    if (!selectedVersionId) {
      return;
    }

    setError(null);
    setStatus(null);

    try {
      const activated = await window.desktop.scoreConfig.activate(selectedVersionId);
      setStatus(`Activated version ${activated.name}.`);
      const activatedSnapshot = await window.desktop.scoreConfig.getSnapshot(selectedVersionId);
      if (activatedSnapshot) {
        setShareSummaryMessage(buildScoringUpdateSummaryMessage("Activated scoring version", activatedSnapshot));
      }
      await refresh(selectedVersionId);
    } catch (err) {
      setError(normalizeError(err).message);
    }
  };

  const deactivateVersion = async (id: number) => {
    setError(null);
    setStatus(null);

    try {
      const deactivated = await window.desktop.scoreConfig.deactivate(id);
      setStatus(`Deactivated version ${deactivated.name}.`);
      await refresh(id);
    } catch (err) {
      setError(normalizeError(err).message);
    }
  };

  const deleteVersion = async (id: number) => {
    if (!window.confirm("Delete this scoring version? This works only for inactive unused versions.")) {
      return;
    }

    setError(null);
    setStatus(null);

    try {
      await window.desktop.scoreConfig.delete(id);
      setStatus(`Deleted score config version #${id}.`);
      if (selectedVersionId === id) {
        setSelectedVersionId(null);
        setSelectedSnapshot(null);
      }
      await refresh();
    } catch (err) {
      setError(normalizeError(err).message);
    }
  };

  const exportJson = async () => {
    if (!selectedVersionId) {
      return;
    }

    setError(null);
    setStatus(null);

    try {
      const result = await window.desktop.scoreConfig.exportJson(selectedVersionId);
      if (result.ok) {
        setStatus(`JSON exported to ${result.path}`);
      }
    } catch (err) {
      setError(normalizeError(err).message);
    }
  };

  const importJson = async () => {
    setError(null);
    setStatus(null);

    try {
      const result: ScoreConfigJsonImportResult = await window.desktop.scoreConfig.importJson();
      if (result.ok) {
        setStatus(`Imported score config ${result.version_name} (#${result.version_id}).`);
        if (result.version_id) {
          const importedSnapshot = await window.desktop.scoreConfig.getSnapshot(result.version_id);
          if (importedSnapshot) {
            setShareSummaryMessage(buildScoringUpdateSummaryMessage("Imported scoring version", importedSnapshot));
          }
          setSelectedVersionId(result.version_id);
          await refresh(result.version_id);
        } else {
          await refresh();
        }
      }
    } catch (err) {
      setError(normalizeError(err).message);
    }
  };

  const resetToBlank = () => {
    setDraft(createEmptyDraft());
    setSelectedSnapshot(null);
    setSelectedVersionId(null);
    setShareSummaryMessage(null);
    setStatus("Started a new blank score config draft.");
    setError(null);
  };

  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <h2>Scoring Config Admin</h2>
          <p className="hint">Manage groups, activity types, versioning, activation, and JSON import/export.</p>
        </div>
      </div>

      <div className="form-section">
        <div className="row-actions action-wrap">
          <button className="ghost btn-sm" onClick={resetToBlank} disabled={isLoading}>
            New Blank Draft
          </button>
          <button className="ghost btn-sm" onClick={importJson} disabled={isLoading}>
            Import JSON
          </button>
          <button className="ghost btn-sm" onClick={exportJson} disabled={isLoading || !selectedVersionId}>
            Export JSON
          </button>
          <button className="btn-sm" onClick={saveDraft} disabled={isLoading}>
            Save as New Version
          </button>
          {selectedVersion && selectedVersion.is_active !== 1 ? (
            <button className="ghost btn-sm" onClick={activateSelected} disabled={isLoading}>
              Activate Selected
            </button>
          ) : null}
          {effectiveShareSummaryMessage ? (
            <>
              <button className="ghost btn-sm" onClick={shareScoringUpdateSummary} disabled={isLoading}>
                Share scoring update summary
              </button>
              <button className="ghost btn-sm" onClick={copyScoringUpdateSummary} disabled={isLoading}>
                Copy summary
              </button>
            </>
          ) : null}
        </div>
      </div>

      <FeedbackNotice message={error} variant="error" />
      <FeedbackNotice message={status} variant="success" />

      <div className="admin-grid">
        <div>
          <h3>Versions</h3>
          <div className="version-list">
            {versions.map((version) => (
              <div key={version.id} className={`version-item ${selectedVersionId === version.id ? "selected" : ""}`}>
                <button className="ghost btn-sm version-open-btn" onClick={() => setSelectedVersionId(version.id)} type="button">
                  Open
                </button>
                <strong>{version.name}</strong>
                <span className="hint">#{version.id}</span>
                <span className="hint">{version.is_active === 1 ? "Active" : "Inactive"}</span>
                <span className="hint">{version.created_at}</span>
                <div className="row-actions version-actions">
                  {version.is_active === 1 ? (
                    <button className="ghost btn-sm" type="button" onClick={() => void deactivateVersion(version.id)}>
                      Deactivate
                    </button>
                  ) : (
                    <button className="danger btn-sm" type="button" onClick={() => void deleteVersion(version.id)}>
                      Delete
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div>
          <h3>Draft Editor</h3>
          <p className="hint">Use percentage + base XP for automatic scoring. Fixed points are optional overrides for one-off cases.</p>
          <div className="grid-form">
            <label>
              New Version Name
              <input
                value={draft.name}
                onChange={(event) => setDraft((prev) => ({ ...prev, name: event.target.value }))}
                placeholder="Marketing Semester v2"
              />
            </label>
            <label>
              Based On Version ID
              <input value={draft.source_version_id ?? ""} disabled />
            </label>
            <label>
              Activate After Save
              <select
                value={draft.activate ? "1" : "0"}
                onChange={(event) => {
                  const nextActivate = event.target.value === "1";
                  setDraft((prev) => ({
                    ...prev,
                    activate: nextActivate,
                    apply_to_historical_logs: nextActivate ? prev.apply_to_historical_logs : false
                  }));
                }}
              >
                <option value="0">No</option>
                <option value="1">Yes</option>
              </select>
            </label>
            <label>
              Apply To Historical Logs
              <select
                value={draft.apply_to_historical_logs ? "1" : "0"}
                onChange={(event) =>
                  setDraft((prev) => ({ ...prev, apply_to_historical_logs: event.target.value === "1" }))
                }
                disabled={!draft.activate}
              >
                <option value="0">No</option>
                <option value="1">Yes</option>
              </select>
            </label>
            <label className="editor-span-2">
              Notes
              <input
                value={draft.notes}
                onChange={(event) => setDraft((prev) => ({ ...prev, notes: event.target.value }))}
                placeholder="Describe what changed in this version"
              />
            </label>
          </div>

          {selectedSnapshot ? (
            <p className="hint">
              Loaded from version #{selectedSnapshot.version.id} {selectedSnapshot.version.name}
            </p>
          ) : (
            <p className="hint">No source version selected. Build a new configuration from scratch.</p>
          )}

          <div className="form-row">
            <button className="ghost btn-sm" onClick={addGroup} type="button">
              Add Group
            </button>
          </div>

          <div className="score-config-groups">
            {draft.groups.map((group, groupIndex) => (
              <div key={group.client_id} className="score-group-card">
                <div className="panel-header">
                  <h3>Group {groupIndex + 1}</h3>
                  <div className="row-actions">
                    <button className="ghost btn-sm" onClick={() => addActivityType(group.client_id)} type="button">
                      Add Activity Type
                    </button>
                    <button className="danger btn-sm" onClick={() => removeGroup(group.client_id)} type="button">
                      Remove Group
                    </button>
                  </div>
                </div>

                <div className="grid-form">
                  <label>
                    Code
                    <input
                      value={group.code}
                      onChange={(event) => updateGroup(group.client_id, "code", event.target.value)}
                    />
                  </label>
                  <label>
                    Name
                    <input
                      value={group.name}
                      onChange={(event) => updateGroup(group.client_id, "name", event.target.value)}
                    />
                  </label>
                  <label className="compact-field">
                    Base XP
                    <input
                      className="input-compact"
                      type="number"
                      value={group.base_xp}
                      onChange={(event) => updateGroup(group.client_id, "base_xp", Number(event.target.value))}
                    />
                  </label>
                  <label className="compact-field">
                    Sort Order
                    <input
                      className="input-compact"
                      type="number"
                      value={group.sort_order ?? groupIndex}
                      onChange={(event) => updateGroup(group.client_id, "sort_order", Number(event.target.value))}
                    />
                  </label>
                  <label className="compact-field">
                    Active
                    <select
                      className="input-compact"
                      value={group.is_active === false ? "0" : "1"}
                      onChange={(event) => updateGroup(group.client_id, "is_active", event.target.value === "1")}
                    >
                      <option value="1">Active</option>
                      <option value="0">Inactive</option>
                    </select>
                  </label>
                </div>

                <div className="activity-type-list">
                  {group.activity_types.map((activityType, activityIndex) => (
                    <div key={activityType.client_id} className="activity-type-row">
                      {(() => {
                        const parentCandidates = group.activity_types.filter(
                          (candidate) =>
                            candidate.client_id !== activityType.client_id &&
                            !candidate.parent_activity_type_code
                        );
                        const isSubgroup = Boolean(activityType.parent_activity_type_code);

                        return (
                      <div className="activity-type-grid">
                        <label className="compact-field">
                          Code
                          <input
                            value={activityType.code}
                            onChange={(event) =>
                              updateActivityType(group.client_id, activityType.client_id, "code", event.target.value)
                            }
                          />
                        </label>
                        <label className="activity-name-field">
                          Name
                          <input
                            value={activityType.name}
                            onChange={(event) =>
                              updateActivityType(group.client_id, activityType.client_id, "name", event.target.value)
                            }
                          />
                        </label>
                        <label>
                          Parent Activity
                          <select
                            value={activityType.parent_activity_type_code ?? ""}
                            onChange={(event) => {
                              const parentCode = event.target.value || null;
                              updateActivityType(
                                group.client_id,
                                activityType.client_id,
                                "parent_activity_type_code",
                                parentCode
                              );

                              if (parentCode) {
                                updateActivityType(
                                  group.client_id,
                                  activityType.client_id,
                                  "percent_of_group_base",
                                  0
                                );
                              }
                            }}
                          >
                            <option value="">None (top-level activity)</option>
                            {parentCandidates.map((candidate) => (
                              <option key={candidate.client_id} value={candidate.code}>
                                {candidate.name || candidate.code}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="compact-field">
                          {isSubgroup ? "Percent of Parent" : "Percent of Group"}
                          <input
                            className="input-compact"
                            type="number"
                            step="0.01"
                            value={
                              activityType.parent_activity_type_code
                                ? activityType.percent_of_parent_type ?? 0
                                : activityType.percent_of_group_base ?? 0
                            }
                            onChange={(event) =>
                              updateActivityType(
                                group.client_id,
                                activityType.client_id,
                                activityType.parent_activity_type_code
                                  ? "percent_of_parent_type"
                                  : "percent_of_group_base",
                                Number(event.target.value)
                              )
                            }
                          />
                        </label>
                        <label className="compact-field">
                          Fixed Points Override
                          <input
                            className="input-compact"
                            type="number"
                            step="0.01"
                            value={activityType.fixed_points ?? ""}
                            onChange={(event) =>
                              updateActivityType(
                                group.client_id,
                                activityType.client_id,
                                "fixed_points",
                                event.target.value === "" ? null : Number(event.target.value)
                              )
                            }
                          />
                        </label>
                        <label className="compact-field">
                          Sort
                          <input
                            className="input-compact"
                            type="number"
                            value={activityType.sort_order ?? activityIndex}
                            onChange={(event) =>
                              updateActivityType(
                                group.client_id,
                                activityType.client_id,
                                "sort_order",
                                Number(event.target.value)
                              )
                            }
                          />
                        </label>
                        <label className="compact-field">
                          Active
                          <select
                            className="input-compact"
                            value={activityType.is_active === false ? "0" : "1"}
                            onChange={(event) =>
                              updateActivityType(
                                group.client_id,
                                activityType.client_id,
                                "is_active",
                                event.target.value === "1"
                              )
                            }
                          >
                            <option value="1">Active</option>
                            <option value="0">Inactive</option>
                          </select>
                        </label>
                      </div>
                        );
                      })()}
                      <div className="activity-type-actions">
                        <button
                          className="danger btn-sm"
                          onClick={() => removeActivityType(group.client_id, activityType.client_id)}
                          type="button"
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
