// #651: React 18 unmounts the whole root when a render throws, and the editor
// had no boundary anywhere, so a 403 on the recipes directory blanked the
// entire app. One boundary, around the screen and inside the shell, so the
// header and the sidebar survive and the reader can go somewhere else.
//
// A class, because that is the only kind of component React lets catch a
// render error. `path` resets the boundary: navigating to another screen must
// not show the last screen's failure.
import { Component, type ReactNode } from "react";
import { Box, Button, Callout, Code, Flex, Text } from "@radix-ui/themes";

interface Props {
  /** What was being drawn, so the failure names its subject. */
  path: string;
  /**
   * Any change clears the failure, so a reader can recover by selecting the
   * SAME screen again (Home again, the same file) or switching an explore
   * tab: the path does not change in those cases, and the tab strip itself
   * sits inside the fallen pane.
   */
  resetKey?: string;
  children: ReactNode;
}

interface State {
  error: Error | null;
  /** The props the error was caught under, so a change AFTER it resets and
   *  the update that threw does not clear its own fallback. */
  at: string | null;
}

const keyOf = (p: Props) => `${p.path}\u0000${p.resetKey ?? ""}`;

export class ScreenErrorBoundary extends Component<Props, State> {
  state: State = { error: null, at: null };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch() {
    this.setState({ at: keyOf(this.props) });
  }

  static getDerivedStateFromProps(props: Props, state: State): Partial<State> | null {
    // Compared with the props at the catch, not the last committed ones:
    // comparing with committed props cleared a fallback the same update had
    // just produced, and the screen threw twice per navigation.
    if (state.error && state.at !== null && state.at !== keyOf(props)) {
      return { error: null, at: null };
    }
    return null;
  }

  render() {
    if (this.state.error) {
      return (
        <Box p="4" data-screen-boundary="">
          <Callout.Root color="red" role="alert" mb="3">
            <Callout.Text>
              This screen could not be drawn: {this.state.error.message}
            </Callout.Text>
          </Callout.Root>
          <Flex align="center" gap="3">
            <Text size="2" color="gray">
              Showing <Code>{this.props.path}</Code>
            </Text>
            <Button
              size="1"
              variant="solid"
              onClick={() => this.setState({ error: null, at: null })}
            >
              Try again
            </Button>
          </Flex>
        </Box>
      );
    }
    // `display: contents` so the marker element takes no part in layout: the
    // screen's own root keeps sizing against the main pane.
    return (
      <div
        data-screen-boundary=""
        data-reset-key={this.props.resetKey ?? ""}
        style={{ display: "contents" }}
      >
        {this.props.children}
      </div>
    );
  }
}
