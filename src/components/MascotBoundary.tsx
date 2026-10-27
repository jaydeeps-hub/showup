import { Component, type ReactNode } from 'react'

/**
 * Keeps the mascot from ever breaking the screen it sits on. The mascot is decoration: if anything in it
 * throws (a bad row from the database, a browser quirk), this removes just the mascot and logs the
 * problem, and Home carries on. React only supports this as a class component.
 */
export class MascotBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true }
  }

  componentDidCatch(error: unknown): void {
    console.error('The mascot failed and was hidden', error)
  }

  render(): ReactNode {
    return this.state.failed ? null : this.props.children
  }
}
