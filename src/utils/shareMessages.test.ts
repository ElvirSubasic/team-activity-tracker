import { describe, expect, it } from "vitest";
import { buildLeaderboardShareMessage, buildScoringUpdateSummaryMessage } from "./shareMessages";

describe("shareMessages", () => {
  it("builds leaderboard messages sorted high to low", () => {
    const message = buildLeaderboardShareMessage([
      {
        person_id: 2,
        index_num: "B-2",
        name: "Beta",
        role: "Member",
        total_points: 80,
        log_count: 2,
        participation_percent: 40,
        last_activity_date: "2026-03-10"
      },
      {
        person_id: 1,
        index_num: "A-1",
        name: "Alpha",
        role: "Lead",
        total_points: 120,
        log_count: 4,
        participation_percent: 60,
        last_activity_date: "2026-03-11"
      }
    ]);

    expect(message).toContain("1. Alpha - 60.00% - 120 pts");
    expect(message).toContain("2. Beta - 40.00% - 80 pts");
  });

  it("builds scoring update summaries", () => {
    const message = buildScoringUpdateSummaryMessage("Activated scoring version", {
      version: {
        id: 7,
        name: "Semester v2",
        is_active: 1,
        created_at: "2026-03-26",
        activated_at: "2026-03-26",
        notes: null
      },
      groups: [
        {
          id: 1,
          config_version_id: 7,
          code: "CONTENT",
          name: "Content",
          base_xp: 100,
          sort_order: 0,
          is_active: 1,
          activity_types: [
            {
              id: 1,
              group_id: 1,
              code: "POST",
              name: "Post",
              percent_of_group_base: 50,
              fixed_points: null,
              is_active: 1,
              sort_order: 0
            }
          ]
        }
      ]
    });

    expect(message).toContain("Action: Activated scoring version");
    expect(message).toContain("Version: Semester v2 (#7)");
    expect(message).toContain("Groups: 1");
    expect(message).toContain("Activity Types: 1");
  });
});
