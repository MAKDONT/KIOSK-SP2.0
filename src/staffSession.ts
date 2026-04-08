import { safeGetItem } from "./utils/storageUtils";

const STAFF_ROLE_KEY = "staff_user_role";
const STAFF_ID_KEY = "staff_user_id";
const LEGACY_ROLE_KEY = "user_role";
const LEGACY_ID_KEY = "user_id";

const migrateLegacyStaffSession = () => {
  if (safeGetItem(LEGACY_ROLE_KEY) !== "staff") {
    return;
  }

  const legacyId = safeGetItem(LEGACY_ID_KEY);
  if (legacyId) {
    sessionStorage.setItem(STAFF_ROLE_KEY, "staff");
    sessionStorage.setItem(STAFF_ID_KEY, legacyId);
  }

  localStorage.removeItem(LEGACY_ROLE_KEY);
  localStorage.removeItem(LEGACY_ID_KEY);
};

export const getStaffSessionUserId = () => {
  migrateLegacyStaffSession();

  if (sessionStorage.getItem(STAFF_ROLE_KEY) !== "staff") {
    return null;
  }

  return sessionStorage.getItem(STAFF_ID_KEY);
};

export const isStaffAuthenticated = () => Boolean(getStaffSessionUserId());

export const setStaffSession = (facultyId: string) => {
  sessionStorage.setItem(STAFF_ROLE_KEY, "staff");
  sessionStorage.setItem(STAFF_ID_KEY, facultyId);
};

export const clearStaffSession = () => {
  sessionStorage.removeItem(STAFF_ROLE_KEY);
  sessionStorage.removeItem(STAFF_ID_KEY);

  if (safeGetItem(LEGACY_ROLE_KEY) === "staff") {
    localStorage.removeItem(LEGACY_ROLE_KEY);
    localStorage.removeItem(LEGACY_ID_KEY);
  }
};
