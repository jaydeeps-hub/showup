# Product overview

## The concept

Showup is a gym attendance tracker that only counts a visit when you are physically at your gym. You save your gym's location once. Each time you arrive, you press one big **SHOW UP** button. The app checks your device's location, and if you're close enough, adds one to your count.

The idea behind it: *showing up is the habit*. Manual workout logs make it easy to round up, and location verification adds a little honesty and a small, satisfying moment of proof.

## Intended user

Someone who wants to build a consistent gym habit and values a simple, honest record over detailed workout logging. They have a smartphone, go to one regular gym, and want an interaction that takes about two seconds.

## Core user journey (v0.1.0)

1. **First open:** enter a username and temporary password → **Continue**.
2. **"Where do you work out?":** search for the gym with Google Maps, pick it from the suggestions, check the name and address, then **Save as Gym 1**.
3. **Home:** shows the gym, the SHOW UP button and the total count.
4. **At the gym:** press SHOW UP → the app gets the location → within 100 m: "You showed up!", and the count goes up by one.
5. **Not at the gym:** "You're not at your saved gym. Please go to Gym 1 and try again." The count does not change.
6. **Next time:** the app opens straight to Home with the count intact.

## MVP scope

### Included now

- Temporary local profile (username only; password discarded)
- Google Maps gym search and a single saved gym ("Gym 1")
- Location check with a 100 m geofence and an accuracy safeguard
- Total Showups counter backed by a timestamped event history
- Persistence in the browser (`localStorage`)
- Change gym (from the Profile page), and sign out
- Dark, mobile-first interface

### Not included now (future ideas)

These are ideas only. None of them exist in v0.1.0.

- Weekly workout targets, rest days and streak rules
- Monthly streak freezes; current and longest streaks
- Monthly and annual attendance reports
- Friend accountability and shared streaks
- QR-code check-in at partner gyms
- Multiple gyms
- Backend storage and real accounts
- Gym partnerships
- Other real-world activities (pool, climbing wall, running club)

## Current assumptions

- One person uses one browser. Data does not need to sync across devices yet.
- A 100 m radius is a reasonable balance between GPS error and preventing check-ins from nearby.
- Google's single coordinate for a gym is close enough to where people actually are.
- Users accept granting location permission each time the browser asks.
- Spoofing isn't worth defending against yet: the app is for self-accountability, not rewards.
- Every press inside the geofence counts. Once-per-day rules are a product decision for later.

## What Showup does *not* claim

Showup verifies that the device *reported* a location near the gym. It does not prove the person exercised, and it cannot detect faked locations.
