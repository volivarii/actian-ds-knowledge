import { Theme, Container, Heading, Text } from "@radix-ui/themes";
import "@radix-ui/themes/styles.css";
import "./styles/tokens.css";
import "./styles/base.css";

export default function App() {
  return (
    <Theme accentColor="indigo" radius="medium">
      <Container size="3" style={{ padding: "var(--space-6)" }}>
        <Heading>Knowledge Editor</Heading>
        <Text as="p" color="gray">
          Phase 1 scaffold — coming online.
        </Text>
      </Container>
    </Theme>
  );
}
