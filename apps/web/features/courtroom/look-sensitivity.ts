import { readStored, writeStored } from "@/lib/local-storage";

export const SENSITIVITY_MIN = 0.2;
export const SENSITIVITY_MAX = 3;
export const SENSITIVITY_DEFAULT = 1;
const STORAGE_KEY = "tribunal-look-sensitivity";

/** Multiplier of the free camera look (yaw and pitch), read by the player controller on every mouse move. Per viewer, kept in localStorage. */
export const lookSensitivity = { value: SENSITIVITY_DEFAULT };

const clamp = (value: number) => (Number.isFinite(value) ? Math.min(SENSITIVITY_MAX, Math.max(SENSITIVITY_MIN, value)) : SENSITIVITY_DEFAULT);

/** Loads the stored value into `lookSensitivity` and returns it */
export const loadSensitivity = () => {
  lookSensitivity.value = clamp(Number(readStored(STORAGE_KEY, String(SENSITIVITY_DEFAULT))));
  return lookSensitivity.value;
};

export const saveSensitivity = (value: number) => {
  lookSensitivity.value = clamp(value);
  writeStored(STORAGE_KEY, String(lookSensitivity.value));
};
