"use client";

import { loadSensitivity, saveSensitivity, SENSITIVITY_MAX, SENSITIVITY_MIN } from "./look-sensitivity";
import { useEffect, useState } from "react";

/** Gear in the bottom-right corner, hidden until hovered or focused: opens the mouse sensitivity slider */
export const SettingsPanel = () => {
  const [value, setValue] = useState(1);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setValue(loadSensitivity());
  }, []);

  return (
    <div className="settings" data-open={open}>
      {open && (
        <label className="settings-slider">
          <span>
            Sensibilité souris :
            {value.toFixed(1)}
            x
          </span>
          <input
            type="range"
            min={SENSITIVITY_MIN}
            max={SENSITIVITY_MAX}
            step={0.1}
            value={value}
            onChange={(event) => {
              setValue(Number(event.target.value));
              saveSensitivity(Number(event.target.value));
            }}
          />
        </label>
      )}
      <button type="button" className="settings-gear" aria-label="Réglages" aria-expanded={open} onClick={() => setOpen(!open)}>⚙</button>
    </div>
  );
};
