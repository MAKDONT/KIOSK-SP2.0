/**
 * Utility functions for safe localStorage access with error handling
 * Handles private browsing mode and other cases where localStorage is unavailable
 */

const isStorageAvailable = (type: "localStorage" | "sessionStorage"): boolean => {
  try {
    const storage = type === "localStorage" ? window.localStorage : window.sessionStorage;
    const testKey = "__storage_test__";
    storage.setItem(testKey, "test");
    storage.removeItem(testKey);
    return true;
  } catch {
    return false;
  }
};

/**
 * Safely get an item from localStorage
 * @param key - The storage key
 * @param defaultValue - Value to return if key doesn't exist or storage is unavailable
 * @returns The stored value or default value
 */
export const safeGetItem = (key: string, defaultValue: string = ""): string => {
  try {
    if (!isStorageAvailable("localStorage")) {
      return defaultValue;
    }
    return window.localStorage.getItem(key) || defaultValue;
  } catch (error) {
    console.warn(`Failed to get localStorage item "${key}":`, error);
    return defaultValue;
  }
};

/**
 * Safely set an item in localStorage
 * @param key - The storage key
 * @param value - The value to store
 * @returns true if successful, false otherwise
 */
export const safeSetItem = (key: string, value: string): boolean => {
  try {
    if (!isStorageAvailable("localStorage")) {
      console.warn("localStorage is not available (possibly private browsing mode)");
      return false;
    }
    window.localStorage.setItem(key, value);
    return true;
  } catch (error) {
    console.warn(`Failed to set localStorage item "${key}":`, error);
    return false;
  }
};

/**
 * Safely remove an item from localStorage
 * @param key - The storage key
 * @returns true if successful, false otherwise
 */
export const safeRemoveItem = (key: string): boolean => {
  try {
    if (!isStorageAvailable("localStorage")) {
      return false;
    }
    window.localStorage.removeItem(key);
    return true;
  } catch (error) {
    console.warn(`Failed to remove localStorage item "${key}":`, error);
    return false;
  }
};

/**
 * Safely clear all localStorage items
 * @returns true if successful, false otherwise
 */
export const safeClearStorage = (): boolean => {
  try {
    if (!isStorageAvailable("localStorage")) {
      return false;
    }
    window.localStorage.clear();
    return true;
  } catch (error) {
    console.warn("Failed to clear localStorage:", error);
    return false;
  }
};
