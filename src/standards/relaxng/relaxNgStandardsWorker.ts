/// <reference lib="webworker" />

import { validateWithProductionRelaxNg } from './productionValidator';
import {
  buildRelaxNgSemanticModel,
  deriveStandaloneRelaxNgSourceFileId,
} from '../../schema/relaxng';
import {
  isRelaxNgWorkerRequestMessage,
  type RelaxNgWorkerResultMessage,
} from './workerProtocol';

const workerScope = self as DedicatedWorkerGlobalScope;
let terminal = false;

function terminate(): void {
  terminal = true;
  workerScope.close();
}

workerScope.addEventListener('message', (event: MessageEvent<unknown>) => {
  if (terminal) return;
  if (!isRelaxNgWorkerRequestMessage(event.data)) {
    terminate();
    return;
  }

  const request = event.data.request;
  void validateWithProductionRelaxNg(request)
    .then((standardsResult) => {
      if (terminal) return;
      let result = standardsResult;
      if (standardsResult.status === 'valid') {
        try {
          const entry = request.files.find(
            ({ path }) => path === request.entryPath,
          );
          if (entry) {
            const sourceText = new TextDecoder('utf-8', { fatal: true }).decode(
              entry.bytes,
            );
            const semantic = buildRelaxNgSemanticModel({
              sources: [
                {
                  sourceFileId: deriveStandaloneRelaxNgSourceFileId(
                    request.entryPath,
                  ),
                  path: request.entryPath,
                  sourceText,
                },
              ],
            });
            result = {
              ...standardsResult,
              ...(semantic.model === undefined
                ? {}
                : { semanticModel: semantic.model }),
              semanticFindings: semantic.findings,
            };
          }
        } catch {
          result = {
            ...standardsResult,
            semanticFindings: [
              {
                id: 'rng-semantic:finding:worker',
                code: 'semantic-extractor-internal',
                message:
                  'Semantic extraction failed after standards validation; the standards result remains authoritative.',
              },
            ],
          };
        }
      }
      const message: RelaxNgWorkerResultMessage = {
        type: 'relaxng:result',
        result,
      };
      workerScope.postMessage(message);
      terminate();
    })
    .catch(() => {
      if (terminal) return;
      const message: RelaxNgWorkerResultMessage = {
        type: 'relaxng:result',
        result: {
          attemptId: request.attemptId,
          engine: { name: 'libxml2 RELAX NG', version: '2.15.3' },
          status: 'internal-error',
          diagnostics: [
            {
              stage: 'standards',
              code: 'relaxng:worker-failure',
              severity: 'error',
              message:
                "XML Carousel's RELAX NG standards checker could not complete the check, so this schema was not checked.",
              category: 'engine-internal',
              source: 'project',
            },
          ],
          dependencyRequests: [],
          metrics: {
            elapsedMs: 0,
            fileCount: request.files.length,
            inputBytes: request.files.reduce(
              (total, file) => total + file.bytes.length,
              0,
            ),
          },
        },
      };
      workerScope.postMessage(message);
      terminate();
    });
});
