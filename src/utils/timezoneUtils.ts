/**
 * Timezone Utilities - Ensures all dates use PHT (Asia/Manila, UTC+8)
 * regardless of server deployment location (e.g., Render)
 */

const PHT_TIMEZONE = "Asia/Manila"; // UTC+8

/**
 * Format a date/time in PHT (Asia/Manila) timezone
 * @param date - Date to format
 * @param format - Format options (same as Intl.DateTimeFormat options)
 * @returns Formatted string in PHT
 */
export function formatInPHT(
  date: Date = new Date(),
  format: Intl.DateTimeFormatOptions = {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }
): string {
  return new Intl.DateTimeFormat("en-PH", {
    timeZone: PHT_TIMEZONE,
    ...format,
  }).format(date);
}

/**
 * Get current time in PHT
 * @returns Current date in PHT timezone
 */
export function getNowInPHT(): Date {
  // Get current date in PHT string format, then parse it back
  const phtString = formatInPHT(new Date(), {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });

  // Parse "YYYY-MM-DD HH:MM:SS" format
  const parts = phtString.split(" ");
  const [year, month, day] = parts[0].split("-").map(Number);
  const [hour, minute, second] = parts[1].split(":").map(Number);

  const date = new Date();
  date.setUTCFullYear(year);
  date.setUTCMonth(month - 1);
  date.setUTCDate(day);
  date.setUTCHours(hour - 8); // Subtract 8 hours to convert back to UTC
  date.setUTCMinutes(minute);
  date.setUTCSeconds(second);

  return date;
}

/**
 * Format time in 12-hour format (HH:MM AM/PM) in PHT
 * @param date - Date to format
 * @returns Time string like "2:30 PM"
 */
export function formatTime12HourPHT(date: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-PH", {
    timeZone: PHT_TIMEZONE,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(date);
}

/**
 * Format time in 24-hour format (HH:MM) in PHT
 * @param date - Date to format
 * @returns Time string like "14:30"
 */
export function formatTime24HourPHT(date: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-PH", {
    timeZone: PHT_TIMEZONE,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

/**
 * Format date in short format (MM/DD/YYYY) in PHT
 * @param date - Date to format
 * @returns Date string like "12/25/2026"
 */
export function formatDateShortPHT(date: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: PHT_TIMEZONE,
    month: "2-digit",
    day: "2-digit",
    year: "numeric",
  }).format(date);
}

/**
 * Format date in long format (Month Day, Year) in PHT
 * @param date - Date to format
 * @returns Date string like "December 25, 2026"
 */
export function formatDateLongPHT(date: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: PHT_TIMEZONE,
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

/**
 * Get day of week in PHT
 * @param date - Date to get day for
 * @returns Day name like "Monday"
 */
export function getDayNamePHT(date: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: PHT_TIMEZONE,
    weekday: "long",
  }).format(date);
}

/**
 * Check if two dates are the same day in PHT
 * @param date1 - First date
 * @param date2 - Second date
 * @returns True if both dates are the same day in PHT
 */
export function isSameDayPHT(date1: Date, date2: Date): boolean {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: PHT_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  return formatter.format(date1) === formatter.format(date2);
}

/**
 * Get date in YYYY-MM-DD format in PHT
 * @param date - Date to format
 * @returns Date string like "2026-12-25"
 */
export function getDateStringPHT(date: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: PHT_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

/**
 * Get current date string in PHT (YYYY-MM-DD)
 * @returns Today's date in PHT as "YYYY-MM-DD"
 */
export function getTodayStringPHT(): string {
  return getDateStringPHT(new Date());
}
