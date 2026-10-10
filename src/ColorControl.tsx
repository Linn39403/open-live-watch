import { useEffect, useState } from "react";
import { isHexColor } from "./colors";
export function ColorControl({
  label,
  value,
  onCommit,
}: {
  label: string;
  value: string;
  onCommit: (color: string) => void;
}) {
  const [draft, setDraft] = useState(value);
  const [invalid, setInvalid] = useState(false);
  useEffect(() => {
    setDraft(value);
    setInvalid(false);
  }, [value]);
  function update(color: string) {
    setDraft(color);
    setInvalid(false);
    if (isHexColor(color)) onCommit(color);
  }
  return (
    <div className="color-control">
      <input
        aria-label={label + " color"}
        type="color"
        value={value}
        onInput={(e) => update(e.currentTarget.value)}
      />
      <input
        aria-label={label + " hex"}
        type="text"
        value={draft}
        spellCheck={false}
        maxLength={7}
        aria-invalid={invalid}
        placeholder="#RRGGBB"
        onChange={(e) => update(e.target.value)}
        onBlur={() => {
          if (!isHexColor(draft)) {
            setDraft(value);
            setInvalid(true);
          }
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            if (isHexColor(draft)) onCommit(draft);
            else setInvalid(true);
          }
        }}
      />
      {invalid && (
        <span className="color-error" role="alert">
          Use #RRGGBB
        </span>
      )}
    </div>
  );
}
