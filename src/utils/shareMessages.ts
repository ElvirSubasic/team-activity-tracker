import type { ScoreConfigSnapshot, TeamLeaderboardRow } from "../types";

export function buildLeaderboardShareMessage(rows: TeamLeaderboardRow[]): string {
  const ordered = [...rows].sort(
    (a, b) =>
      b.participation_percent - a.participation_percent ||
      b.total_points - a.total_points ||
      a.name.localeCompare(b.name)
  );

  return [
    "🏆 Team Leaderboard",
    ...ordered.map(
      (row, index) =>
        `${index + 1}. ${row.name} - ${row.participation_percent.toFixed(2)}% - ${row.total_points} pts`
    )
  ].join("\n");
}

export function buildScoringUpdateSummaryMessage(action: string, snapshot: ScoreConfigSnapshot): string {
  const activityCount = snapshot.groups.reduce((sum, group) => sum + group.activity_types.length, 0);

  return [
    "📣 Scoring Update",
    `Action: ${action}`,
    `Version: ${snapshot.version.name} (#${snapshot.version.id})`,
    `Active: ${snapshot.version.is_active === 1 ? "Yes" : "No"}`,
    `Groups: ${snapshot.groups.length}`,
    `Activity Types: ${activityCount}`
  ].join("\n");
}
