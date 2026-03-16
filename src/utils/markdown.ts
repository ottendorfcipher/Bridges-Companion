import { marked } from 'marked';

/**
 * Configure marked options for secure HTML output
 */
marked.setOptions({
  breaks: true, // Convert \n to <br>
  gfm: true, // GitHub Flavored Markdown
});

/**
 * Convert markdown to HTML
 * 
 * @param markdown - Markdown string
 * @returns HTML string
 */
export function markdownToHtml(markdown: string): string {
  if (!markdown) return '';
  
  try {
    return marked.parse(markdown, { async: false }) as string;
  } catch (error) {
    console.error('Error parsing markdown:', error);
    return markdown; // Return original on error
  }
}

/**
 * Check if content appears to be markdown (heuristic)
 * 
 * @param content - Content string
 * @returns true if content looks like markdown
 */
export function isMarkdown(content: string): boolean {
  if (!content) return false;
  
  // Check for common markdown patterns
  const markdownPatterns = [
    /^#{1,6}\s+/m, // Headers
    /\*\*[^*]+\*\*/,  // Bold
    /\*[^*]+\*/, // Italic
    /^[-*+]\s+/m, // Unordered lists
    /^\d+\.\s+/m, // Ordered lists
    /\[([^\]]+)\]\(([^)]+)\)/, // Links
    /^>\s+/m, // Blockquotes
  ];
  
  return markdownPatterns.some(pattern => pattern.test(content));
}

/**
 * Strip HTML tags from content (for plain text extraction)
 * 
 * @param html - HTML string
 * @returns Plain text
 */
export function stripHtml(html: string): string {
  if (!html) return '';
  return html.replace(/<[^>]*>/g, '');
}
