/**
 * milliseconds per second conversion constant
 * @description used for converting timestamps between seconds and milliseconds
 */
export const MS_PER_SECOND = 1000;

/**
 * seconds per minute
 * @description standard time conversion constant
 */
export const SECONDS_PER_MINUTE = 60;

/**
 * minutes per hour
 * @description standard time conversion constant
 */
export const MINUTES_PER_HOUR = 60;

/**
 * hours per day
 * @description standard time conversion constant
 */
export const HOURS_PER_DAY = 24;

/**
 * days in a month (approximate)
 * @description approximate days in a month for general calculations
 */
export const DAYS_IN_MONTH = 30;

/**
 * minutes to milliseconds conversion
 * @description derived constant for converting minutes to milliseconds
 */
export const MINUTES_TO_MS = SECONDS_PER_MINUTE * MS_PER_SECOND;

/**
 * hours to milliseconds conversion
 * @description derived constant for converting hours to milliseconds
 */
export const HOURS_TO_MS = MINUTES_PER_HOUR * MINUTES_TO_MS;

/**
 * days to milliseconds conversion
 * @description derived constant for converting days to milliseconds
 */
export const DAYS_TO_MS = HOURS_PER_DAY * HOURS_TO_MS;
