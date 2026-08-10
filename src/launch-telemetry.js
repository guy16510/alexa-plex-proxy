function deviceSummary(requestEnvelope = {}) {
  const device = requestEnvelope?.context?.System?.device ?? {};
  const viewport = requestEnvelope?.context?.Viewport ?? {};
  const deviceId = String(device.deviceId || '');
  return {
    deviceIdSuffix: deviceId ? deviceId.slice(-8) : 'unknown',
    interfaces: Object.keys(device.supportedInterfaces || {}).sort().join(',') || 'none',
    viewport: viewport.pixelWidth && viewport.pixelHeight
      ? `${viewport.pixelWidth}x${viewport.pixelHeight}`
      : 'unknown'
  };
}

export function recordVisualLaunchTelemetry({
  requestEnvelope,
  latencyMs,
  success,
  fallback,
  reason = 'none',
  snapshotUpdatedAt = null
}) {
  const requestId = requestEnvelope?.request?.requestId || 'unknown';
  const device = deviceSummary(requestEnvelope);
  const now = Date.now();
  const snapshotAgeMs = snapshotUpdatedAt ? Math.max(0, now - snapshotUpdatedAt) : null;
  const outcome = success ? (fallback ? 'fallback' : 'snapshot') : 'failure';

  console.log(JSON.stringify({
    _aws: {
      Timestamp: now,
      CloudWatchMetrics: [{
        Namespace: 'BurnsJukebox',
        Dimensions: [['Path', 'Outcome']],
        Metrics: [
          { Name: 'LaunchSuccess', Unit: 'Count' },
          { Name: 'LaunchFallback', Unit: 'Count' },
          { Name: 'LaunchFailure', Unit: 'Count' },
          { Name: 'LaunchLatency', Unit: 'Milliseconds' }
        ]
      }]
    },
    Path: 'VisualLaunch',
    Outcome: outcome,
    LaunchSuccess: success ? 1 : 0,
    LaunchFallback: fallback ? 1 : 0,
    LaunchFailure: success ? 0 : 1,
    LaunchLatency: Math.max(0, Number(latencyMs) || 0),
    requestId,
    reason,
    snapshotAgeMs,
    ...device
  }));
}
