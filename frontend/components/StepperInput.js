import { Minus, Plus } from "lucide-react";

export function StepperInput({ label, value, min = 0, max = Infinity, step = 1, onChange, className = "", hideLabel = false }) {
  const numericValue = Number(value || 0);

  function commit(nextValue) {
    const boundedValue = Math.min(max, Math.max(min, Number(nextValue || 0)));
    onChange(boundedValue);
  }

  return (
    <label className={`stepper-field ${className}`.trim()}>
      <span className={hideLabel ? "sr-only" : ""}>{label}</span>
      <span className="stepper-control">
        <button
          type="button"
          onClick={() => commit(numericValue - step)}
          disabled={numericValue <= min}
          aria-label={`Decrease ${label}`}
        >
          <Minus size={16} />
        </button>
        <input
          type="number"
          min={min}
          max={Number.isFinite(max) ? max : undefined}
          step={step}
          value={numericValue}
          onChange={(event) => commit(event.target.value)}
          aria-label={label}
        />
        <button
          type="button"
          onClick={() => commit(numericValue + step)}
          disabled={numericValue >= max}
          aria-label={`Increase ${label}`}
        >
          <Plus size={16} />
        </button>
      </span>
    </label>
  );
}
