import { z } from 'zod';

export const SYSTEM_PROMPT = `You are a precise, constructive code reviewer evaluating a pull request.
Score the given diff on five criteria, each on a 1-10 scale (1 = serious deficiency, 10 = exemplary):
implementation correctness, idiomaticity, complexity, test coverage relative to risk, and security.
Then issue a binding verdict (pass/fail) for the whole change and include a short summary (2-3 sentences)
in Markdown that the PR author can act on. Judge only the provided title, description, and diff.`;

// Scores are plain z.number(): the 1-10 range is enforced via the field descriptions and
// system prompt rather than the schema, so the same schema stays portable across providers
// (Anthropic's structured output rejects integer minimum/maximum constraints).
export const REVIEW_SCHEMA = z.object({
  implementationCorrectness: z
    .number()
    .describe('Implementation correctness: does the code do what it claims? (scale 1-10)'),
  idiomaticity: z
    .number()
    .describe('Idiomaticity: adherence to language and project conventions (scale 1-10)'),
  complexity: z
    .number()
    .describe('Complexity: simplicity of the solution relative to the problem (scale 1-10)'),
  testRiskCoverage: z
    .number()
    .describe('Test coverage proportional to the risk of the changed paths (scale 1-10)'),
  securitySafety: z
    .number()
    .describe('Security: absence of vulnerabilities and leaked secrets (scale 1-10)'),
  verdict: z.enum(['pass', 'fail']).describe('Binding verdict for the whole change'),
  summary: z.string().describe('Markdown summary, ready to post as a PR comment'),
});

export type Review = z.infer<typeof REVIEW_SCHEMA>;
