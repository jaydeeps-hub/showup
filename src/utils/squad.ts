/** "1 friend", "0 friends", "3 friends": the count under "My squad". */
export function friendsText(count: number): string {
  return `${count} ${count === 1 ? 'friend' : 'friends'}`
}

/** "1 showup", "128 showups": the first chip on a squad-mate's row. */
export function showupsText(count: number): string {
  return `${count} ${count === 1 ? 'showup' : 'showups'}`
}

/** "1 week in a row", "12 weeks in a row": the second chip. */
export function weeksInARowText(count: number): string {
  return `${count} ${count === 1 ? 'week' : 'weeks'} in a row`
}
