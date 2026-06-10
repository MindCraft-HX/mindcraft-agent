// Stub: Full-business APIs removed in Phase 2 refactor
// Float window still references these — provide no-op implementations

/**
 * Get spotup window language list (was: /v1/data/spotup_window_language/)
 */
export const apiSpotupWindowLanguage = async () => {
  return {
    data: {
      data: [
        { label: "简体中文", value: "简体中文" },
        { label: "英文", value: "英文" },
      ],
    },
  };
};

/**
 * Add chat room (was: POST /llm/room_list/ — removed)
 */
export const addRoom = async () => {
  return { data: { id: null, msg: "Room system removed in mindcraft-agent" } };
};
