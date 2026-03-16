import { PROHIBITED_TERMS, ProhibitedTerm, ContentValidationResult } from '@/types/layer1';

/**
 * Content Guidelines Validation - Layer 1
 * 
 * Based on content standards documentation
 * 
 * Discouraged Language:
 * - absolute claims without qualification
 * - imperative or prescriptive tone
 * - aggressive or confrontational language
 * - overly commercial or promotional language
 * 
 * Purpose: Ensures content maintains educational focus and professional tone
 */

/**
 * Preferred language replacements for better educational tone
 */
export const APPROVED_REPLACEMENTS: Record<string, string[]> = {
  'must': ['should consider', 'may want to', 'it is recommended'],
  'never': ['rarely', 'infrequently', 'typically not'],
  'always': ['often', 'typically', 'generally'],
  'obviously': ['as shown', 'as demonstrated', 'research indicates'],
  'clearly': ['research shows', 'evidence suggests', 'studies indicate'],
};

/**
 * Validate content against Layer 1 language guardrails
 */
export function validateContent(content: string): ContentValidationResult {
  const lowerContent = content.toLowerCase();
  const foundTerms: ProhibitedTerm[] = [];
  
  // Check for each prohibited term
  for (const term of PROHIBITED_TERMS) {
    // Use word boundaries to avoid false positives (e.g., "emission" shouldn't match "mission")
    const regex = new RegExp(`\\b${term}\\b`, 'i');
    if (regex.test(lowerContent)) {
      foundTerms.push(term);
    }
  }
  
  const isValid = foundTerms.length === 0;
  const suggestions = foundTerms.map(term => 
    `Replace "${term}" with: ${APPROVED_REPLACEMENTS[term]?.join(', ') || 'more neutral language'}`
  );
  
  return {
    isValid,
    prohibitedTermsFound: foundTerms,
    suggestions: isValid ? undefined : suggestions,
  };
}

/**
 * Final quality check before publishing
 * Ensures content maintains educational standards and professional tone
 */
export function performSafetyCheck(content: string, title: string): {
  passed: boolean;
  issues: string[];
} {
  const issues: string[] = [];
  
  // 1. Check for prohibited terms
  const validation = validateContent(content);
  if (!validation.isValid) {
    issues.push(`Found prohibited terms: ${validation.prohibitedTermsFound.join(', ')}`);
  }
  
  // 2. Check for proof language (per 01-language-guardrails.md)
  const proofLanguage = ['this shows', 'this proves', 'clearly demonstrates', 'obviously'];
  for (const phrase of proofLanguage) {
    if (content.toLowerCase().includes(phrase)) {
      issues.push(`Avoid proof language: "${phrase}". Use curiosity framing instead.`);
    }
  }
  
  // 3. Check for absolute claims
  const absoluteLanguage = ['always', 'never', 'must', 'impossible', 'only way'];
  for (const phrase of absoluteLanguage) {
    const regex = new RegExp(`\\b${phrase}\\b`, 'i');
    if (regex.test(content)) {
      issues.push(`Consider softening absolute language: "${phrase}"`);
    }
  }
  
  // 4. Check title for prohibited terms
  const titleValidation = validateContent(title);
  if (!titleValidation.isValid) {
    issues.push(`Title contains prohibited terms: ${titleValidation.prohibitedTermsFound.join(', ')}`);
  }
  
  return {
    passed: issues.length === 0,
    issues,
  };
}

/**
 * Get tone guidance for content type
 */
export function getToneGuidance(pageType: string): string[] {
  const baseGuidance = [
    'Use clear, descriptive language',
    'Support claims with evidence or research',
    'Acknowledge multiple perspectives when appropriate',
    'Avoid absolute claims without qualification',
    'Maintain objective, professional tone',
  ];
  
  const specificGuidance: Record<string, string[]> = {
    'C': [ // Comparison pages
      'Use neutral headers',
      'Acknowledge that multiple interpretations exist',
      'Emphasize respect even in disagreement',
    ],
    'D': [ // Conversation guides
      'Frame as "What you may hear" not "What they will say"',
      'Include "When to Pause" section for sensitive topics',
    ],
  };
  
  return [...baseGuidance, ...(specificGuidance[pageType] || [])];
}

/**
 * Check if content maintains educational tone
 * Returns score from 0 (unprofessional) to 100 (educational)
 */
export function assessEducationalTone(content: string): {
  score: number;
  feedback: string;
} {
  let score = 100;
  const feedback: string[] = [];
  
  // Deduct points for excessive imperative language
  const imperatives = content.match(/\b(you should|you must|you need to)\b/gi);
  if (imperatives && imperatives.length > 3) {
    score -= 15;
    feedback.push('Consider using less prescriptive language');
  }
  
  // Deduct points for promotional language
  const promotionalIndicators = ['buy now', 'limited offer', 'act now', 'don\'t miss'];
  for (const indicator of promotionalIndicators) {
    if (content.toLowerCase().includes(indicator)) {
      score -= 20;
      feedback.push(`Promotional language detected: "${indicator}"`);
    }
  }
  
  // Add points for question-based framing
  const questions = content.match(/\?/g);
  if (questions && questions.length >= 3) {
    score += 10;
    feedback.push('Good use of questions to encourage reflection');
  }
  
  // Add points for comparative language
  const comparisons = ['both traditions', 'different interpretations', 'various perspectives'];
  for (const phrase of comparisons) {
    if (content.toLowerCase().includes(phrase)) {
      score += 5;
      feedback.push(`Good use of comparative framing: "${phrase}"`);
    }
  }
  
  score = Math.max(0, Math.min(100, score));
  
  return {
    score,
    feedback: feedback.join('; ') || 'Content has appropriate educational tone',
  };
}
