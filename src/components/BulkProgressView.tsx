import { useEffect, useState } from 'react';
import { ProgressBar } from '@primer/react';
import type { BulkProgress } from '../utils/pool';
import { formatDuration } from '../utils/format';

interface Props {
  progress: BulkProgress;
  /** Epoch ms when the run started, used to derive rate and ETA. */
  startedAt: number;
  /** Whether the run is actively processing (drives the live ETA ticker). */
  active: boolean;
}

/**
 * Live progress for a long-running bulk operation: a progress bar, done/total
 * counts, success/failure tallies, observed throughput and an estimated time
 * remaining. The ETA ticks once a second so it keeps updating even while the
 * client is backing off and no items are completing.
 */
export function BulkProgressView({ progress, startedAt, active }: Props) {
  const { done, ok, failed, total } = progress;
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!active) return;
    const handle = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(handle);
  }, [active]);

  const pct = total > 0 ? (done / total) * 100 : 0;
  const elapsedSec = Math.max(0.001, (now - startedAt) / 1000);
  const rate = done / elapsedSec; // items/sec
  const remaining = Math.max(0, total - done);
  const etaMs = rate > 0 ? (remaining / rate) * 1000 : NaN;

  return (
    <div className="bulk-progress">
      <ProgressBar progress={pct} aria-label="Progress" />
      <div className="bulk-progress__stats">
        <span>
          <strong>{done}</strong> / {total}
        </span>
        <span className="bulk-progress__ok">{ok} done</span>
        {failed > 0 && <span className="bulk-progress__failed">{failed} failed</span>}
        <span className="bulk-progress__spacer" />
        {active && done > 0 && (
          <span className="muted">
            {rate >= 1
              ? `${rate.toFixed(1)}/s`
              : `${(rate * 60).toFixed(0)}/min`}
            {remaining > 0 && ` · ~${formatDuration(etaMs)} left`}
          </span>
        )}
      </div>
    </div>
  );
}
