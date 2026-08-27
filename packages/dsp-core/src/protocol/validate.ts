import { validateGraph, type GraphIssue } from '../graph/validate.js';
import { parseParamAddress } from '../graph/types.js';
import { getParamDescriptor } from '../graph/descriptors.js';
import { SUPPORTED_SAMPLE_RATES } from '../math/constants.js';
import { PROTOCOL_SCHEMA_VERSION, totalDurationSec, type Protocol } from './schema.js';

export interface ProtocolIssue extends GraphIssue {
  stageIndex?: number;
}

export interface ProtocolValidation {
  ok: boolean;
  issues: ProtocolIssue[];
}

export const MIN_STAGE_SECONDS = 5;
export const MAX_SESSION_SECONDS = 4 * 60 * 60;

export function validateProtocol(protocol: Protocol): ProtocolValidation {
  const issues: ProtocolIssue[] = [];

  if (protocol.schemaVersion > PROTOCOL_SCHEMA_VERSION) {
    issues.push({
      severity: 'error',
      code: 'schema-too-new',
      message: `This protocol uses schema version ${protocol.schemaVersion}; this build understands up to ${PROTOCOL_SCHEMA_VERSION}. Update the app to open it.`,
    });
  }

  if (!SUPPORTED_SAMPLE_RATES.includes(protocol.sampleRate as never)) {
    issues.push({
      severity: 'warning',
      code: 'unusual-sample-rate',
      message: `Sample rate ${protocol.sampleRate} Hz is outside the supported set (${SUPPORTED_SAMPLE_RATES.join(', ')}). Playback will resample.`,
    });
  }

  if (protocol.stages.length === 0) {
    issues.push({
      severity: 'error',
      code: 'no-stages',
      message: 'A protocol needs at least one stage.',
    });
  }

  const total = totalDurationSec(protocol);
  if (total > MAX_SESSION_SECONDS) {
    issues.push({
      severity: 'warning',
      code: 'very-long-session',
      message: 'Sessions longer than four hours are unusual. Consider splitting the protocol.',
    });
  }

  if (protocol.master.gain > 1) {
    issues.push({
      severity: 'warning',
      code: 'master-gain-high',
      message: 'Master gain above unity leans on the limiter. Lower it and raise device volume instead.',
    });
  }
  if (!protocol.master.limiter) {
    issues.push({
      severity: 'error',
      code: 'limiter-disabled',
      message: 'The master limiter cannot be disabled.',
    });
  }
  if (protocol.master.fadeInSec < 0.5 || protocol.master.fadeOutSec < 0.5) {
    issues.push({
      severity: 'warning',
      code: 'short-fade',
      message: 'Fades shorter than half a second are audible as a step at the start or end of a session.',
    });
  }

  protocol.stages.forEach((stage, stageIndex) => {
    if (stage.durationSec < MIN_STAGE_SECONDS) {
      issues.push({
        severity: 'error',
        code: 'stage-too-short',
        message: `"${stage.name}" is shorter than ${MIN_STAGE_SECONDS} seconds.`,
        stageIndex,
      });
    }

    for (const issue of validateGraph(stage.graph).issues) {
      issues.push({ ...issue, stageIndex });
    }

    const seenTargets = new Set<string>();
    for (const lane of stage.automation) {
      const parsed = parseParamAddress(lane.target);
      if (!parsed) {
        issues.push({
          severity: 'error',
          code: 'bad-automation-target',
          message: `Automation target "${lane.target}" is malformed.`,
          stageIndex,
        });
        continue;
      }
      const node = stage.graph.nodes.find((candidate) => candidate.id === parsed.nodeId);
      if (!node) {
        issues.push({
          severity: 'error',
          code: 'automation-missing-node',
          message: `Automation targets "${parsed.nodeId}", which is not in this stage.`,
          stageIndex,
        });
        continue;
      }
      const descriptor = getParamDescriptor(node.kind, parsed.paramKey);
      if (!descriptor) {
        issues.push({
          severity: 'error',
          code: 'automation-missing-param',
          message: `"${parsed.paramKey}" is not a parameter of ${node.kind}.`,
          stageIndex,
          nodeId: node.id,
        });
        continue;
      }
      if (!descriptor.automatable) {
        issues.push({
          severity: 'error',
          code: 'param-not-automatable',
          message: `${descriptor.label} cannot be automated.`,
          stageIndex,
          nodeId: node.id,
          paramKey: parsed.paramKey,
        });
      }
      if (seenTargets.has(lane.target)) {
        issues.push({
          severity: 'error',
          code: 'duplicate-automation-lane',
          message: `Two lanes both drive ${descriptor.label} on ${node.id}.`,
          stageIndex,
          nodeId: node.id,
        });
      }
      seenTargets.add(lane.target);

      for (const point of lane.points) {
        if (point.timeSec < 0 || point.timeSec > stage.durationSec + 0.001) {
          issues.push({
            severity: 'warning',
            code: 'automation-point-outside-stage',
            message: `A point on ${descriptor.label} sits outside "${stage.name}" and will be held at the edge.`,
            stageIndex,
            nodeId: node.id,
          });
          break;
        }
      }
    }
  });

  return { ok: !issues.some((issue) => issue.severity === 'error'), issues };
}
