export const loadingPlannerData = "Loading players and fixtures…";
export const restoringTeam = "Restoring your team…";
export const importingSquad = "Importing the latest published squad…";
export const comparingPlans =
  "Loading recent matches and comparing transfer plans…";
export const checkTeamSettings = "Please check your team settings.";
export const priceConfirmed =
  "Selling price confirmed. The shortlist has been recalculated; unaffordable moves have been removed.";

export type Notice =
  | "restored"
  | "settings-invalid"
  | "storage-unavailable"
  | "settings-not-saved"
  | "import-caveat"
  | "free-hit";

export const noticeText: Record<Notice, string> = {
  restored:
    "Saved settings restored. Check your current bank and remaining transfers. Selling prices will be checked only for shortlisted moves.",
  "settings-invalid":
    "Saved settings are outdated or invalid. Import your team again.",
  "storage-unavailable":
    "Browser storage is unavailable or unreadable. You can still plan in this session.",
  "settings-not-saved":
    "Your settings could not be saved in this browser. Results are still available for this session.",
  "import-caveat":
    "Bank is from the last deadline. Free transfers default to 1. Update these to your current FPL balances.",
  "free-hit":
    "This is a Free Hit squad. Restore your permanent squad below before continuing.",
};
