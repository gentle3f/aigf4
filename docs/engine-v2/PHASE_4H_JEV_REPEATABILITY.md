# Phase 4H: Jev Repeatability / Measurement Noise

## Purpose

Small single-run factor deltas are not interpretable without measuring Jev's run-to-run variation on an identical input. Phase 4H introduces a fictional repeatability suite only; it does not tune questions, set thresholds, route production traffic, or change Gemma authority.

## Frozen source states

The suite directly reuses 16 selected `JEV_FACTOR_ISOLATION_CASES`: group baseline, NPC tag, envelope, and positive; Cc persona baseline, Traditional Chinese candidate, and positive; replay baseline, explicit incomplete control, envelope, and positive; continuity baseline, duplication, and positive; and two wardrobe anchors.

Each repeatability item holds the exact same frozen `ReviewState` object as its source fixture. No state is rebuilt, normalized, reserialized, or otherwise transformed.

## Execution design

Every source is requested five times, yielding 80 requests. The deterministic order is repeat-major and interleaved: every source at repeat one, then every source at repeat two, through repeat five. This avoids five immediately adjacent duplicates for one source.

## Measurements

For each source, the safe report calculates mean, median, minimum, maximum, range, population and sample standard deviation, first-run deviation, and maximum deviation from the mean. It also groups within-case ranges and population standard deviations by category, and reports average signal by repeat index. These are descriptive calibration measurements, not significance tests or production thresholds.

## Privacy and production boundary

Fixtures are fictional. Safe JSON contains only identifiers, source/repeat metadata, category, expected label, mode, Cc mode, signal, model, latency, token usage, cost, and normalized reason code. It excludes ReviewState, candidate text, history, persona evidence, credentials, headers, and environment data.

Jev remains shadow-only. Gemma remains the sole production authority. The existing maximum of one Jev shadow request per production review is unchanged. The next step is one explicitly authorized live repeatability run after audit.
