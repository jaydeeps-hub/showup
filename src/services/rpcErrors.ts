/** A message a user can act on, for any failed call to a database function. Details go to the console. */
export function describeServiceError(error: { message?: string }): string {
  if (/failed to fetch|network|load failed|timed? ?out/i.test(error.message ?? '')) {
    return "We couldn't reach the server. Check your connection and try again."
  }
  return 'Something went wrong while talking to the server. Please try again.'
}
