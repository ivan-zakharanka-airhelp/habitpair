# habitpair - MVP ideas

### Main issue 
Today there are no truly simple and free applications for tracking habits, both positive and negative ones, with a convenient way to add habits and meaningful statistics for each habit.

Most existing apps are either overloaded with features, focused only on “good habits,” hidden behind subscriptions, or do not provide useful insights into user behavior patterns.

Users should be able to:
- easily create and track habits
- mark daily or weekly progress
- see streaks and statistics
- identify behavioral patterns over time

For example, users could notice that failures happen more frequently on specific days of the week, after poor sleep, during stressful periods, and so on.

---

### Minimal functionality
- login via email and password

- ability to create habits:
  - positive habits (e.g. going to the gym, reading books, meditation)
  - negative habits to avoid (e.g. no fast food, no smoking, no doomscrolling)

- each habit should support a tracking frequency:
  - daily habits
  - weekly habits with configurable target count (e.g. gym 2 times per week)
  - monthly

- ability to mark whether the habit was completed successfully

- for daily habits:
  - progress is calculated by successful days
  - streaks are based on consecutive successful days

- for weekly habits:
  - progress is calculated against the weekly target
  - empty days are not treated as failures
  - the week is considered successful when the target count is reached
  - streaks are based on consecutive successful weeks

- ability to open a habit details page with:
  - monthly calendar view
    - 7 columns representing days of the week
    - 5–6 rows representing weeks in the selected month
    - each day can show habit status:
      - completed
      - missed
      - neutral / not applicable
      - today
  - current streak
  - longest streak
  - success percentage
  - total completed days/weeks

- ability to manually import previous progress/history from other apps or Excel sheets

---

### What is not in MVP
- sign in with Google or Apple
- AI habit analyzer that evaluates user behavior and suggests improvements
- AI chat related to habits, discipline, or self-improvement
- motivational or encouraging messages
- neuroscience-based recommendations or dopamine-related insights
- advanced charts and analytics
- social features
- reminders and notifications

---

### Success criteria
- users are able to create and track habits within less than 1 minute after registration
- users regularly interact with the calendar/streak statistics
- at least 70% of users continue using the app after 2 weeks