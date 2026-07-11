// The editor's one wayfinding voice: a quiet uppercase, letterspaced
// label. Used by the sidebar's dimension headers, the _meta form's
// sections, and the frontmatter form groups — ONE primitive so the three
// surfaces can't drift apart.
import type { ReactNode } from "react";
import { Text } from "@radix-ui/themes";

export function EyebrowLabel({ children }: { children: ReactNode }) {
  return (
    <Text
      as="div"
      size="1"
      weight="bold"
      color="gray"
      style={{ letterSpacing: "0.05em", textTransform: "uppercase" }}
    >
      {children}
    </Text>
  );
}
