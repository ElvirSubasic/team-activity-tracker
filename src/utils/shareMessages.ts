import type { ScoreConfigSnapshot, TeamLeaderboardRow } from "../types";

export function buildLeaderboardShareMessage(rows: TeamLeaderboardRow[]): string {
  const totalPoints = rows.reduce((sum, row) => sum + row.total_points, 0);
  const percentFromPoints = (points: number): number => {
    if (totalPoints <= 0) {
      return 0;
    }

    return (points / totalPoints) * 100;
  };

  const ordered = [...rows].sort(
    (a, b) =>
      percentFromPoints(b.total_points) - percentFromPoints(a.total_points) ||
      b.total_points - a.total_points ||
      a.name.localeCompare(b.name)
  );

  const formatPoints = (value: number): string => {
    if (Number.isInteger(value)) {
      return String(value);
    }

    return value.toFixed(2).replace(/\.00$/, "").replace(/(\.\d)0$/, "$1");
  };

  const labels = ordered.map((row) => `${row.index_num} - ${row.name}`);
  const percentages = ordered.map((row) => `${Math.round(percentFromPoints(row.total_points))}%`);
  const points = ordered.map((row) => formatPoints(row.total_points));

  const labelWidth = labels.reduce((max, value) => Math.max(max, value.length), 0);
  const percentageWidth = percentages.reduce((max, value) => Math.max(max, value.length), 0);
  const pointsWidth = points.reduce((max, value) => Math.max(max, value.length), 0);

  return [
    "🏆 Team Leaderboard",
    ...ordered.map(
      (row, index) =>
        `${index + 1}. ${labels[index].padEnd(labelWidth)} - ${percentages[index].padStart(percentageWidth)} - ${points[index].padStart(pointsWidth)} points`
    )
  ].join("\n");
}

export function buildScoringUpdateSummaryMessage(action: string, snapshot: ScoreConfigSnapshot): string {
  const formatPoints = (value: number): string => {
    if (Number.isInteger(value)) {
      return `${value} points`;
    }

    return `${value.toFixed(2).replace(/\.00$/, "").replace(/(\.\d)0$/, "$1")} points`;
  };

  const computePoints = (
    activityTypeId: number,
    groupBaseXp: number,
    allTypes: ScoreConfigSnapshot["groups"][number]["activity_types"]
  ): number => {
    const activityType = allTypes.find((candidate) => candidate.id === activityTypeId);
    if (!activityType) {
      return 0;
    }

    if (activityType.fixed_points !== null) {
      return activityType.fixed_points;
    }

    if (activityType.parent_activity_type_id !== null) {
      const parentPoints = computePoints(activityType.parent_activity_type_id, groupBaseXp, allTypes);
      return (parentPoints * (activityType.percent_of_parent_type ?? 0)) / 100;
    }

    return (groupBaseXp * activityType.percent_of_group_base) / 100;
  };

  const orderedGroups = [...snapshot.groups]
    .filter((group) => group.is_active === 1)
    .sort((a, b) => a.sort_order - b.sort_order || a.id - b.id);

  const sections = orderedGroups.flatMap((group) => {
    const orderedTypes = [...group.activity_types]
      .filter((activityType) => activityType.is_active === 1)
      .sort((a, b) => a.sort_order - b.sort_order || a.id - b.id);

    const topLevel = orderedTypes.filter((activityType) => activityType.parent_activity_type_id === null);

    const lines = topLevel.flatMap((activityType) => {
      const children = orderedTypes.filter((candidate) => candidate.parent_activity_type_id === activityType.id);

      if (children.length > 0) {
        return [
          `- ${activityType.name}`,
          ...children.map(
            (child) => `    - ${child.name}: ${formatPoints(computePoints(child.id, group.base_xp, orderedTypes))}`
          )
        ];
      }

      return [`- ${activityType.name}: ${formatPoints(computePoints(activityType.id, group.base_xp, orderedTypes))}`];
    });

    if (lines.length === 0) {
      return [];
    }

    return [`${group.name}:`, ...lines, ""];
  });

  return [
    "📣 Scoring Update",
    `Action: ${action}`,
    `Version: ${snapshot.version.name} (#${snapshot.version.id})`,
    `Active: ${snapshot.version.is_active === 1 ? "Yes" : "No"}`,
    ...(snapshot.version.notes?.trim() ? [`Note: ${snapshot.version.notes.trim()}`] : []),
    "",
    ...sections
  ]
    .filter((line, index, lines) => !(line === "" && (index === lines.length - 1 || lines[index + 1] === "")))
    .join("\n");
}
