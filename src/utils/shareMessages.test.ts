import { describe, expect, it } from "vitest";
import { buildLeaderboardShareMessage, buildScoringUpdateSummaryMessage } from "./shareMessages";

describe("shareMessages", () => {
  it("builds leaderboard messages sorted high to low", () => {
    const message = buildLeaderboardShareMessage([
      {
        person_id: 3,
        index_num: "C-3",
        name: "Gamma",
        role: "Member",
        total_points: 0,
        log_count: 0,
        participation_percent: 0,
        last_activity_date: null
      },
      {
        person_id: 2,
        index_num: "B-2",
        name: "Beta",
        role: "Member",
        total_points: 80,
        log_count: 2,
        participation_percent: 40.4,
        last_activity_date: "2026-03-10"
      },
      {
        person_id: 1,
        index_num: "A-1",
        name: "Alpha",
        role: "Lead",
        total_points: 120,
        log_count: 4,
        participation_percent: 60.2,
        last_activity_date: "2026-03-11"
      }
    ]);

    expect(message).toContain("1. A-1 - Alpha - 60% - 120 points");
    expect(message).toContain("2. B-2 - Beta  - 40% -  80 points");
    expect(message).toContain("3. C-3 - Gamma -  0% -   0 points");
  });

  it("builds scoring update summaries", () => {
    const message = buildScoringUpdateSummaryMessage("Activated scoring version", {
      version: {
        id: 7,
        name: "Semester v2",
        is_active: 1,
        created_at: "2026-03-26",
        activated_at: "2026-03-26",
        notes: "Updated presentation scoring and clarified team expectations"
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
              parent_activity_type_id: null,
              percent_of_parent_type: null,
              fixed_points: null,
              is_active: 1,
              sort_order: 0
            },
            {
              id: 2,
              group_id: 1,
              code: "SKILLS_BASED",
              name: "Skills Based",
              percent_of_group_base: 10,
              parent_activity_type_id: null,
              percent_of_parent_type: null,
              fixed_points: null,
              is_active: 1,
              sort_order: 1
            },
            {
              id: 3,
              group_id: 1,
              code: "SKILL_1",
              name: "Skill 1",
              percent_of_group_base: 0,
              parent_activity_type_id: 2,
              percent_of_parent_type: 20,
              fixed_points: null,
              is_active: 1,
              sort_order: 2
            }
          ]
        }
      ]
    });

    expect(message).toContain("Action: Activated scoring version");
    expect(message).toContain("Version: Semester v2 (#7)");
    expect(message).toContain("Note: Updated presentation scoring and clarified team expectations");
    expect(message).toContain("Content:");
    expect(message).toContain("- Post: 50 points");
    expect(message).toContain("- Skills Based");
    expect(message).toContain("    - Skill 1: 2 points");
  });
});
