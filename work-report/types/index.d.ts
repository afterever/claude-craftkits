/** The six kinds a finished task is sorted into, by the tools it used. */
export type Kind = 'emails' | 'images' | 'code' | 'documents' | 'research' | 'other'

/** One calendar day: how many tasks of each kind, and how many each model did. */
export type DayRecord = {
  kinds: Partial<Record<Kind, number>>
  /** By the model's short name ("Sonnet 5.5"), never by an id. */
  models: Record<string, number>
  /**
   * Prompts typed that day, by repo name (the folder of the repo's top level).
   * Left out of a record that has none, so a day from before 0.5.0 reads back as it was.
   */
  repos?: Record<string, number>
}

/** What the estimate is worked out from. */
export type Settings = {
  /** What an hour is worth, in dollars. */
  rate: number
  /** Minutes one finished task of each kind saved. */
  minutes: Record<Kind, number>
  /** Whether the "Work report" chip is drawn above the prompt. */
  band: boolean
}

export type Tab = 'today' | 'week' | 'month' | 'year'

declare module 'claude-code' {
  interface PluginState {
    'work-report': {
      /** Day records by local date ("2026-10-13"); mirrors the mod's store. */
      days: Record<string, DayRecord>
      settings: Settings
      /** The tab the pane is on. */
      tab: Tab
      /** Whether a backfill has ever finished; until it has, the pane points to it. Mirrors the store's `backfilled`. */
      backfilled: boolean
    }
  }
}
