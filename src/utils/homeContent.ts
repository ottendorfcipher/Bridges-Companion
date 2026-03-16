export const HOME_EDUCATIONAL_JOURNEY_PAGE_ID = -100000;
export const HOME_EDUCATIONAL_JOURNEY_MODULE_SLUG = 'home';
export const HOME_EDUCATIONAL_JOURNEY_PAGE_SLUG = 'educational-journey';

export const DEFAULT_EDUCATIONAL_JOURNEY_TITLE = 'Educational Journey';
export const DEFAULT_EDUCATIONAL_JOURNEY_CONTENT =
  'This companion is designed to equip you for meaningful conversations and\n' +
  'deeper understanding. Every section has been crafted with care,\n' +
  'cultural sensitivity, and respect for diverse perspectives.';

export function getDefaultEducationalJourney() {
  return {
    id: HOME_EDUCATIONAL_JOURNEY_PAGE_ID,
    title: DEFAULT_EDUCATIONAL_JOURNEY_TITLE,
    content: DEFAULT_EDUCATIONAL_JOURNEY_CONTENT,
  };
}
