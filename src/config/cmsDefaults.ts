import type { CmsContent, CmsItem } from '../types'

/**
 * What the landing carousel and the Quick Start show when the database cannot be reached AND nothing was
 * ever saved from an earlier visit. These are the 8 starting rows from docs/backend/phase9a_cms_and_config.sql,
 * copied exactly: category, position, slug, heading, subheading, image_alt.
 *
 * They have no picture addresses (the starting rows have none), so a screen built from them shows its
 * mascot picture instead. Ids are negative so they can never clash with a real database row (those are positive).
 *
 * They are used ONLY when a lookup fails and nothing is saved. A lookup that SUCCEEDS but leaves a category out
 * means that category is switched off, and these are not used for it.
 */
function item(id: number, position: number, slug: string, heading: string, subheading: string, imageAlt: string): CmsItem {
  return { id, slug, position, heading, subheading, image_url: '', image_alt: imageAlt, v: 0 }
}

export const DEFAULT_CMS_CONTENT: CmsContent = {
  version: 'bundled',
  categories: {
    landing_carousel: [
      item(-1, 10, 'biggest-step',
        'Getting to the gym is the biggest step.',
        'Everything good starts with turning up. Showup helps you take that step again and again.',
        'Showup mascot waving'),
      item(-2, 20, 'accountability',
        'Keep the promise you made to yourself.',
        'Every visit is confirmed, counted against your weekly goal and added to your calendar.',
        'Showup mascot cheering'),
      item(-3, 30, 'fifteen-minute-rule',
        'Fifteen minutes is enough to count.',
        'Stay for 15 minutes and your visit counts. A short session still beats staying home.',
        'Showup mascot focused on a workout'),
      item(-4, 40, 'rest-days',
        'Rest days are part of the plan.',
        'Set a goal that fits your week. Pause passes protect your weeks in a row when life gets in the way.',
        'Showup mascot resting'),
    ],
    quick_start: [
      item(-5, 10, 'add-gym',
        'Add your gym',
        'Search by gym name or area, pick yours and save. You can switch gyms later in Profile.',
        'Gym search with one gym selected'),
      item(-6, 20, 'set-goal',
        'Set your weekly goal',
        'Choose 1 to 7 days a week. Rest days are part of the plan, so pick a number you can keep.',
        'Weekly goal picker set to 3 days'),
      item(-7, 30, 'show-up',
        'Tap Show up, then stay 15 minutes',
        'Tap the blue button when you arrive. Your phone’s location confirms you’re really at your gym. Stay 15 minutes and the visit counts.',
        'Show up button, a timer ring and a note that location confirms you are at your gym'),
      item(-8, 40, 'watch-week',
        'Watch your week fill in',
        'Each visit fills your calendar. Hit your goal and the week turns green. Need a break? The Pause tab has you covered.',
        'Calendar with a week goal achieved'),
    ],
  },
}
