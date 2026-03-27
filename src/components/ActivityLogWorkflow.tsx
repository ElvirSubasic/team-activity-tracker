import { useEffect, useMemo, useState } from "react";
import { FeedbackNotice } from "./FeedbackNotice";
import type {
  ActivityLogDetail,
  ActivityLogItemEntryInput,
  ActivityLogListFilters,
  ActivityLogListItem,
  ActivityScorePreview,
  Person,
  ScoreConfigGroup
} from "../types";

type Props = {
  normalizeError: (error: unknown) => Error;
};

type EntryRow = {
  client_id: string;
  parent_activity_type_id: number;
  activity_type_id: number;
  quantity: number;
  notes: string;
};

const DEFAULT_PAGE_SIZE = 10;

function makeRow(): EntryRow {
  return {
    client_id: `row-${Math.random().toString(36).slice(2, 10)}`,
    parent_activity_type_id: 0,
    activity_type_id: 0,
    quantity: 1,
    notes: ""
  };
}

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

export function ActivityLogWorkflow({ normalizeError }: Props) {
  const [persons, setPersons] = useState<Person[]>([]);
  const [groups, setGroups] = useState<ScoreConfigGroup[]>([]);
  const [configName, setConfigName] = useState<string>("");

  const [personId, setPersonId] = useState<number>(0);
  const [activityDate, setActivityDate] = useState<string>(todayIsoDate());
  const [groupId, setGroupId] = useState<number>(0);
  const [notes, setNotes] = useState<string>("");
  const [rows, setRows] = useState<EntryRow[]>([makeRow()]);

  const [batchMode, setBatchMode] = useState(false);
  const [batchPersonIds, setBatchPersonIds] = useState<number[]>([]);

  const [preview, setPreview] = useState<ActivityScorePreview | null>(null);
  const [editingLogId, setEditingLogId] = useState<number | null>(null);
  const [selectedLogDetail, setSelectedLogDetail] = useState<ActivityLogDetail | null>(null);
  const [selectedLogId, setSelectedLogId] = useState<number | null>(null);

  const [logs, setLogs] = useState<ActivityLogListItem[]>([]);
  const [logFilters, setLogFilters] = useState<ActivityLogListFilters>({
    page: 1,
    pageSize: DEFAULT_PAGE_SIZE
  });
  const [totalLogs, setTotalLogs] = useState(0);
  const [totalPages, setTotalPages] = useState(0);

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  const selectedGroup = useMemo(
    () => groups.find((group) => group.id === groupId) ?? null,
    [groups, groupId]
  );

  const availableTypes = useMemo(
    () => (selectedGroup ? selectedGroup.activity_types : []),
    [selectedGroup]
  );

  const typeById = useMemo(() => new Map(availableTypes.map((activityType) => [activityType.id, activityType])), [availableTypes]);
  const topLevelTypes = useMemo(
    () => availableTypes.filter((activityType) => activityType.parent_activity_type_id === null),
    [availableTypes]
  );

  const childTypesByParent = useMemo(() => {
    const map = new Map<number, typeof availableTypes>();
    for (const activityType of availableTypes) {
      if (activityType.parent_activity_type_id === null) {
        continue;
      }

      const current = map.get(activityType.parent_activity_type_id) ?? [];
      current.push(activityType);
      map.set(activityType.parent_activity_type_id, current);
    }

    return map;
  }, [availableTypes]);

  const resolveParentTypeId = (activityTypeId: number): number => {
    if (!activityTypeId) {
      return 0;
    }

    const activityType = typeById.get(activityTypeId);
    if (!activityType) {
      return 0;
    }

    return activityType.parent_activity_type_id ?? activityType.id;
  };

  const rowsAsPayload = (): ActivityLogItemEntryInput[] => {
    return rows
      .filter((row) => row.activity_type_id > 0)
      .map((row) => ({
        activity_type_id: row.activity_type_id,
        quantity: row.quantity,
        notes: row.notes || null
      }));
  };

  const validItems = rowsAsPayload();
  const canSaveSingle = personId > 0 && groupId > 0 && validItems.length > 0;
  const canSaveBatch = groupId > 0 && batchPersonIds.length > 0 && validItems.length > 0;

  const loadLogs = async (filters: ActivityLogListFilters = logFilters) => {
    const response = await window.desktop.activity.list(filters);
    setLogs(response.items);
    setTotalLogs(response.total);
    setTotalPages(response.totalPages);
  };

  useEffect(() => {
    void (async () => {
      setIsLoading(true);
      setError(null);

      try {
        const allPersons: Person[] = [];
        let personPage = 1;
        let hasMorePersons = true;
        while (hasMorePersons) {
          const response = await window.desktop.person.list({ page: personPage, pageSize: 100 });
          allPersons.push(...response.items);
          hasMorePersons = personPage < response.totalPages;
          personPage += 1;
        }

        const catalog = await window.desktop.activity.getCatalog();
        const logsResponse = await window.desktop.activity.list(logFilters);

        setPersons(allPersons);
        if (allPersons.length > 0 && personId === 0) {
          setPersonId(allPersons[0].id);
        }

        setConfigName(catalog.config_version_name);
        setGroups(catalog.groups);
        if (catalog.groups.length > 0 && groupId === 0) {
          setGroupId(catalog.groups[0].id);
        }

        setLogs(logsResponse.items);
        setTotalLogs(logsResponse.total);
        setTotalPages(logsResponse.totalPages);
      } catch (err) {
        setError(normalizeError(err).message);
      } finally {
        setIsLoading(false);
      }
    })();
    // mount-only initialization
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const resetEntry = () => {
    setEditingLogId(null);
    setActivityDate(todayIsoDate());
    setNotes("");
    setRows([makeRow()]);
    setPreview(null);
    setStatus(null);
  };

  const loadLogDetail = async (id: number) => {
    setError(null);

    try {
      const detail = await window.desktop.activity.get(id);
      if (!detail) {
        setError("Activity log not found.");
        return;
      }

      setSelectedLogId(id);
      setSelectedLogDetail(detail);
    } catch (err) {
      setError(normalizeError(err).message);
    }
  };

  const addRow = () => {
    setRows((prev) => [...prev, makeRow()]);
  };

  const removeRow = (clientId: string) => {
    setRows((prev) => (prev.length <= 1 ? prev : prev.filter((row) => row.client_id !== clientId)));
  };

  const updateRow = (clientId: string, patch: Partial<EntryRow>) => {
    setRows((prev) => prev.map((row) => (row.client_id === clientId ? { ...row, ...patch } : row)));
  };

  const previewScore = async () => {
    setError(null);
    setStatus(null);

    try {
      const nextPreview = await window.desktop.activity.preview({
        group_id: groupId,
        items: rowsAsPayload()
      });

      setPreview(nextPreview);
    } catch (err) {
      setError(normalizeError(err).message);
    }
  };

  const duplicatePrevious = async () => {
    if (!personId) {
      return;
    }

    setError(null);
    setStatus(null);

    try {
      const template = await window.desktop.activity.duplicateTemplate({
        person_id: personId,
        activity_date: activityDate
      });

      if (!template) {
        setStatus("No previous log found for this person.");
        return;
      }

      setGroupId(template.group_id);
      setNotes(template.notes ?? "");
      setRows(
        template.items.length > 0
          ? template.items.map((item) => ({
              client_id: `row-${Math.random().toString(36).slice(2, 10)}`,
              parent_activity_type_id: resolveParentTypeId(item.activity_type_id),
              activity_type_id: item.activity_type_id,
              quantity: item.quantity ?? 1,
              notes: item.notes ?? ""
            }))
          : [makeRow()]
      );

      setStatus("Loaded previous log template.");
      setPreview(null);
    } catch (err) {
      setError(normalizeError(err).message);
    }
  };

  const saveEntry = async () => {
    setError(null);
    setStatus(null);

    const items = rowsAsPayload();

    if (!groupId) {
      setError("Group is required.");
      return;
    }

    if (batchMode) {
      if (batchPersonIds.length === 0) {
        setError("Select at least one person in batch mode.");
        return;
      }
    } else if (!personId) {
      setError("Person is required.");
      return;
    }

    if (items.length === 0) {
      setError("Add at least one activity row before saving.");
      return;
    }

    try {
      const payload = {
        person_id: personId,
        activity_date: activityDate,
        group_id: groupId,
        notes: notes || null,
        items
      };

      if (editingLogId) {
        await window.desktop.activity.update({ id: editingLogId, ...payload });
        setStatus(`Updated log #${editingLogId}.`);
      } else if (batchMode && batchPersonIds.length > 0) {
        const result = await window.desktop.activity.createBatch({
          person_ids: batchPersonIds,
          activity_date: activityDate,
          group_id: groupId,
          notes: notes || null,
          items
        });

        setStatus(`Created ${result.created} logs in batch mode.`);
      } else {
        const created = await window.desktop.activity.create(payload);
        setStatus(`Created log #${created.log.id}.`);
      }

      await loadLogs(logFilters);
      resetEntry();
    } catch (err) {
      setError(normalizeError(err).message);
    }
  };

  const editLog = async (id: number) => {
    setError(null);
    setStatus(null);

    try {
      const detail: ActivityLogDetail | null = await window.desktop.activity.get(id);
      if (!detail) {
        setError("Activity log not found.");
        return;
      }

      setEditingLogId(detail.log.id);
      setPersonId(detail.log.person_id);
      setActivityDate(detail.log.activity_date);
      setGroupId(detail.log.group_id);
      setNotes(detail.log.notes ?? "");
      setRows(
        detail.items.length > 0
          ? detail.items.map((item) => ({
              client_id: `row-${Math.random().toString(36).slice(2, 10)}`,
              parent_activity_type_id: resolveParentTypeId(item.activity_type_id),
              activity_type_id: item.activity_type_id,
              quantity: item.quantity,
              notes: item.notes ?? ""
            }))
          : [makeRow()]
      );
      setPreview(null);
      setSelectedLogId(detail.log.id);
      setSelectedLogDetail(detail);
    } catch (err) {
      setError(normalizeError(err).message);
    }
  };

  const deleteLog = async (id: number) => {
    if (!window.confirm("Delete this activity log? This cannot be undone.")) {
      return;
    }

    setError(null);
    setStatus(null);

    try {
      await window.desktop.activity.delete(id);
      setStatus(`Deleted log #${id}.`);
      await loadLogs(logFilters);
      if (selectedLogId === id) {
        setSelectedLogId(null);
        setSelectedLogDetail(null);
      }
    } catch (err) {
      setError(normalizeError(err).message);
    }
  };

  const applyFilters = async (filters: ActivityLogListFilters) => {
    setLogFilters(filters);
    await loadLogs(filters);
  };

  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <h2>Activity Log Workflow</h2>
          <p className="hint">Quick entry with score preview · config: {configName || "N/A"}</p>
        </div>
      </div>

      <FeedbackNotice message={error} variant="error" />
      <FeedbackNotice message={status} variant="success" />

      <div
        onKeyDown={(event) => {
          if (event.ctrlKey && event.key === "Enter") {
            event.preventDefault();
            void saveEntry();
          }
        }}
      >
        <div className="grid-form">
          <label>
            Person
            <select value={personId} onChange={(event) => setPersonId(Number(event.target.value))}>
              {persons.map((person) => (
                <option key={person.id} value={person.id}>
                  {person.index_num} · {person.name}
                </option>
              ))}
            </select>
          </label>

          <label>
            <span className="label-with-info">
              Activity Date
              <span className="info-badge" tabIndex={0} aria-label="What is activity date?">
                i
                <span className="info-popup" role="tooltip">
                  You can create the log later and still save the real date when the activity happened.
                </span>
              </span>
            </span>
            <input type="date" value={activityDate} onChange={(event) => setActivityDate(event.target.value)} />
          </label>

          <label>
            Group
            <select className="aligned-control" value={groupId} onChange={(event) => setGroupId(Number(event.target.value))}>
              {groups.map((group) => (
                <option key={group.id} value={group.id}>
                  {group.name}
                </option>
              ))}
            </select>
          </label>

          <label>
            Notes
            <input
              type="text"
              className="aligned-control"
              value={notes}
              onChange={(event) => setNotes(event.target.value ?? "")}
              placeholder="Optional notes"
            />
          </label>
        </div>

        <div className="form-row">
          <button className="ghost" type="button" onClick={() => setActivityDate(todayIsoDate())}>
            Set Today
          </button>
          <button
            className="ghost"
            type="button"
            onClick={() => {
              const yesterday = new Date();
              yesterday.setDate(yesterday.getDate() - 1);
              setActivityDate(yesterday.toISOString().slice(0, 10));
            }}
          >
            Set Yesterday
          </button>

          <label>
            <input
              type="checkbox"
              checked={batchMode}
              onChange={(event) => setBatchMode(event.target.checked)}
            />
            Batch mode
          </label>

          <button className="ghost" onClick={duplicatePrevious} disabled={isLoading || !personId}>
            Duplicate previous for person
          </button>

          <button className="ghost" onClick={previewScore} disabled={isLoading || !groupId}>
            Score preview
          </button>

          <button onClick={saveEntry} disabled={isLoading || (batchMode ? !canSaveBatch : !canSaveSingle)}>
            {editingLogId ? "Update log" : batchMode ? "Save batch logs" : "Save log"}
          </button>

          <button className="ghost" onClick={resetEntry} disabled={isLoading}>
            Clear
          </button>
        </div>

        {batchMode ? (
          <div className="batch-box">
            <p className="hint">Select persons to apply the same activity set:</p>
            <div className="batch-person-grid">
              {persons.map((person) => {
                const checked = batchPersonIds.includes(person.id);
                return (
                  <label key={person.id}>
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(event) => {
                        setBatchPersonIds((prev) =>
                          event.target.checked ? [...prev, person.id] : prev.filter((id) => id !== person.id)
                        );
                      }}
                    />
                    {person.name}
                  </label>
                );
              })}
            </div>
          </div>
        ) : null}

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Activity Type</th>
                <th>Quantity</th>
                <th>Notes</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.client_id}>
                  <td>
                    {(() => {
                      const parentTypeId = row.parent_activity_type_id || resolveParentTypeId(row.activity_type_id);
                      const childTypes = parentTypeId ? childTypesByParent.get(parentTypeId) ?? [] : [];
                      const hasChildren = childTypes.length > 0;

                      return (
                        <div className="stack-layout">
                          <select
                            value={parentTypeId}
                            onChange={(event) => {
                              const nextParentTypeId = Number(event.target.value);
                              const nextChildren = nextParentTypeId ? childTypesByParent.get(nextParentTypeId) ?? [] : [];
                              const hasNextChildren = nextChildren.length > 0;

                              updateRow(row.client_id, {
                                parent_activity_type_id: nextParentTypeId,
                                activity_type_id: hasNextChildren ? 0 : nextParentTypeId
                              });
                            }}
                          >
                            <option value={0}>Select activity type</option>
                            {topLevelTypes.map((activityType) => (
                              <option key={activityType.id} value={activityType.id}>
                                {activityType.name}
                              </option>
                            ))}
                          </select>

                          {hasChildren ? (
                            <select
                              value={row.activity_type_id}
                              onChange={(event) =>
                                updateRow(row.client_id, { activity_type_id: Number(event.target.value) })
                              }
                            >
                              <option value={0}>Select subtype</option>
                              {childTypes.map((activityType) => (
                                <option key={activityType.id} value={activityType.id}>
                                  {activityType.name}
                                </option>
                              ))}
                            </select>
                          ) : null}
                        </div>
                      );
                    })()}
                  </td>
                  <td>
                    <input
                      type="number"
                      min={0.01}
                      step={0.01}
                      value={row.quantity}
                      onChange={(event) => updateRow(row.client_id, { quantity: Number(event.target.value) })}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          addRow();
                        }
                      }}
                    />
                  </td>
                  <td>
                    <input
                      className="aligned-control"
                      value={row.notes}
                      onChange={(event) => updateRow(row.client_id, { notes: event.target.value })}
                    />
                  </td>
                  <td>
                    <button className="danger" onClick={() => removeRow(row.client_id)}>
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="form-row action-row">
          <button className="ghost" onClick={addRow}>
            Add activity row
            <span className="info-badge" aria-label="Activity row entry tips">
              i
              <span className="info-popup" role="tooltip">
                Press Enter in quantity to append a new row. Press Ctrl+Enter to save.
              </span>
            </span>
          </button>
        </div>

        {preview ? (
          <div className="preview-box">
            <h3>Score Preview</h3>
            <p className="hint">Total points: {preview.total_points}</p>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Type ID</th>
                    <th>Qty</th>
                    <th>Points/Unit</th>
                    <th>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.items.map((item) => (
                    <tr key={item.activity_type_id}>
                      <td>{item.activity_type_id}</td>
                      <td>{item.quantity}</td>
                      <td>{item.points_per_unit}</td>
                      <td>{item.total_points}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}
      </div>

      <hr />

      <h3>Activity Logs</h3>
      <div className="grid-form">
        <label>
          Person Filter
          <select
            value={logFilters.person_id ?? ""}
            onChange={(event) =>
              void applyFilters({
                ...logFilters,
                person_id: event.target.value ? Number(event.target.value) : undefined,
                page: 1,
                pageSize: DEFAULT_PAGE_SIZE
              })
            }
          >
            <option value="">All</option>
            {persons.map((person) => (
              <option key={person.id} value={person.id}>
                {person.name}
              </option>
            ))}
          </select>
        </label>

        <label>
          Group Filter
          <select
            value={logFilters.group_id ?? ""}
            onChange={(event) =>
              void applyFilters({
                ...logFilters,
                group_id: event.target.value ? Number(event.target.value) : undefined,
                page: 1,
                pageSize: DEFAULT_PAGE_SIZE
              })
            }
          >
            <option value="">All</option>
            {groups.map((group) => (
              <option key={group.id} value={group.id}>
                {group.name}
              </option>
            ))}
          </select>
        </label>

        <label>
          Type Filter
          <select
            value={logFilters.activity_type_id ?? ""}
            onChange={(event) =>
              void applyFilters({
                ...logFilters,
                activity_type_id: event.target.value ? Number(event.target.value) : undefined,
                page: 1,
                pageSize: DEFAULT_PAGE_SIZE
              })
            }
          >
            <option value="">All</option>
            {groups.flatMap((group) => group.activity_types).map((activityType) => (
              <option key={activityType.id} value={activityType.id}>
                {activityType.code}
              </option>
            ))}
          </select>
        </label>

        <label>
          Start Date
          <input
            type="date"
            value={logFilters.start_date ?? ""}
            onChange={(event) =>
              void applyFilters({
                ...logFilters,
                start_date: event.target.value || undefined,
                page: 1,
                pageSize: DEFAULT_PAGE_SIZE
              })
            }
          />
        </label>

        <label>
          End Date
          <input
            type="date"
            value={logFilters.end_date ?? ""}
            onChange={(event) =>
              void applyFilters({
                ...logFilters,
                end_date: event.target.value || undefined,
                page: 1,
                pageSize: DEFAULT_PAGE_SIZE
              })
            }
          />
        </label>
      </div>

      <div className="table-wrap activity-log-list-wrap">
        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>Person</th>
              <th>Date</th>
              <th>Group</th>
              <th>Activity Types</th>
              <th>Total Points</th>
              <th>Notes</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {logs.map((log) => (
              <tr key={log.id}>
                <td>{log.id}</td>
                <td>{log.person_name}</td>
                <td>{log.activity_date}</td>
                <td>{log.group_name}</td>
                <td>{log.activity_types_summary || "-"}</td>
                <td>{log.total_points}</td>
                <td>{log.notes || "-"}</td>
                <td>
                  <div className="row-actions">
                    <button className="ghost" onClick={() => void loadLogDetail(log.id)}>
                      View
                    </button>
                    <button className="ghost" onClick={() => void editLog(log.id)}>
                      Edit
                    </button>
                    <button className="danger" onClick={() => void deleteLog(log.id)}>
                      Delete
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="form-row activity-log-pagination-row">
        <span className="hint">
          Page {logFilters.page ?? 1} / {Math.max(totalPages, 1)} · {totalLogs} logs
        </span>
        <button
          className="ghost"
          onClick={() =>
            void applyFilters({
              ...logFilters,
              page: Math.max(1, (logFilters.page ?? 1) - 1),
              pageSize: DEFAULT_PAGE_SIZE
            })
          }
          disabled={(logFilters.page ?? 1) <= 1}
        >
          Previous
        </button>
        <button
          className="ghost"
          onClick={() =>
            void applyFilters({
              ...logFilters,
              page: Math.min(Math.max(totalPages, 1), (logFilters.page ?? 1) + 1),
              pageSize: DEFAULT_PAGE_SIZE
            })
          }
          disabled={(logFilters.page ?? 1) >= totalPages}
        >
          Next
        </button>
      </div>

      {selectedLogDetail && selectedLogId ? (
        <div className="preview-box">
          <h3>Selected Log Details</h3>
          <p className="hint">
            Log #{selectedLogId} · Total points: {selectedLogDetail.total_points}
          </p>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Activity Type</th>
                  <th>Quantity</th>
                  <th>Points/Unit</th>
                  <th>Total Points</th>
                  <th>Notes</th>
                </tr>
              </thead>
              <tbody>
                {selectedLogDetail.items.map((item) => (
                  <tr key={item.id}>
                    <td>{item.activity_type_name}</td>
                    <td>{item.quantity}</td>
                    <td>{item.points_per_unit}</td>
                    <td>{item.total_points}</td>
                    <td>{item.notes || "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </section>
  );
}
