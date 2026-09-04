// Read-only view of one captured page recipe.
//
// Read-only by decision, not by omission. Editing a recipe means the Class C
// JSON widget the RefusalBanner still names as unbuilt, and painting the
// skeleton means the plugin's render-node.js. What a reviewer needs before
// either is the prose, and every field shown here was already parsed off disk
// by loadRecipes and then dropped on the floor: the table had room for a slug
// and 42 characters of surface.
//
// The panel READS app-context/dist/recipes (derived, validated, already in
// memory) and points a correction at app-context/src/recipes. That split is
// stated on screen rather than assumed, because a reviewer sent to the dist
// would edit a file CI overwrites.

import { useEffect, useRef } from "react";
import {
  Badge,
  Box,
  Button,
  Card,
  Flex,
  Heading,
  Link,
  Separator,
  Text,
} from "@radix-ui/themes";
import { DEFAULT_COORDS } from "../config/coords";
import {
  RECIPES_DIR,
  recipeSrcPath,
  type PatternRecipe,
} from "../lib/patternIndex";
import {
  countOutlineNodes,
  toSkeletonOutline,
  type OutlineNode,
} from "../lib/recipeSkeleton";

export interface RecipePanelProps {
  recipe: PatternRecipe;
  onClose: () => void;
}

function sourceUrl(slug: string): string {
  const { owner, repo } = DEFAULT_COORDS;
  return `https://github.com/${owner}/${repo}/blob/main/${recipeSrcPath(slug)}`;
}

/** One line of the outline. Indentation carries the depth, as an outline does. */
function OutlineRow({ node, depth }: { node: OutlineNode; depth: number }) {
  return (
    <>
      <Flex gap="2" align="baseline" style={{ paddingLeft: depth * 14 }}>
        <Text size="1" color="gray" style={{ fontFamily: "var(--code-font-family)" }}>
          {node.type}
        </Text>
        {node.name ? <Text size="1">{node.name}</Text> : null}
        {/* An INSTANCE carries no name, only the component it instantiates.
            Without these two an instance row is a bare repeated type word, and
            73 of the nodes across the four captures are instances. */}
        {node.ref ? (
          <Text size="1" weight="medium">
            {node.ref}
          </Text>
        ) : null}
        {node.variant ? (
          <Text size="1" color="gray">
            {node.variant}
          </Text>
        ) : null}
        {node.size ? (
          <Text size="1" color="gray">
            {node.size}
          </Text>
        ) : null}
        {/* An instance keeps the page's words here the way a TEXT node keeps
            its string in `content`: 49 of the 73 instance nodes across the
            captures carry props, and without them those rows read mute. */}
        {node.props.map((prop) => (
          <Text key={prop.name} size="1" color="gray">
            {prop.name}: “{prop.value}”
          </Text>
        ))}
        {node.text ? (
          <Text size="1" color="gray">
            “{node.text}”
          </Text>
        ) : null}
      </Flex>
      {node.children.map((child, i) => (
        <OutlineRow key={`${child.type}-${child.name ?? i}-${i}`} node={child} depth={depth + 1} />
      ))}
    </>
  );
}

/** A labelled block that renders nothing at all when it has nothing to say. */
function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Box>
      <Text size="1" color="gray" weight="bold">
        {title}
      </Text>
      <Box mt="1">{children}</Box>
    </Box>
  );
}

export function RecipePanel({ recipe, onClose }: RecipePanelProps) {
  const outline = toSkeletonOutline(recipe.skeleton?.content);
  const nodeCount = countOutlineNodes(outline);
  const ref = useRef<HTMLElement | null>(null);

  // The panel renders above the tables and a chip can sit far down a page of
  // three app blocks, so without this the reader clicks and sees nothing move.
  // Keyed on the slug, so picking a second capture while the first is open
  // scrolls again rather than leaving the reader looking at the old one.
  useEffect(() => {
    ref.current?.scrollIntoView({ block: "start", behavior: "smooth" });
  }, [recipe.slug]);

  return (
    // A labelled region, not a bare box: the panel is a distinct landmark on a
    // page that is otherwise one long table, and a screen reader arriving here
    // needs to know which capture it landed in.
    <Card size="2" asChild>
      <section ref={ref} aria-label={`Recipe: ${recipe.label ?? recipe.slug}`}>
        <Flex direction="column" gap="3">
          <Flex justify="between" align="start" gap="3">
            <Box>
              <Heading as="h2" size="4">
                {recipe.label ?? recipe.slug}
              </Heading>
              {/* Provenance leads: a capture's credibility is where and when it
                  was taken, and prose without it invites a reviewer to correct a
                  page that no longer exists. */}
              <Text size="1" color="gray" as="p">
                {recipe.surface ?? "No surface recorded"}
              </Text>
              <Text size="1" color="gray" as="p">
                {recipe.capturedOn
                  ? `Captured ${recipe.capturedOn}`
                  : "No capture date recorded"}
                {recipe.productVersion ? ` · ${recipe.productVersion}` : ""}
              </Text>
            </Box>
            <Button variant="soft" size="1" onClick={onClose}>
              Close
            </Button>
          </Flex>

          {recipe.tags.length > 0 ? (
            <Flex gap="1" wrap="wrap">
              {recipe.tags.map((t) => (
                <Badge key={t} variant="soft" size="1">
                  {t}
                </Badge>
              ))}
            </Flex>
          ) : null}

          <Separator size="4" />

          {recipe.description ? (
            <Section title="Description">
              <Text size="2" as="p">
                {recipe.description}
              </Text>
            </Section>
          ) : null}

          {/* In full. The table truncates to 42 characters, and the when clause
              is the longest prose in the substrate: 294 to 1588 characters across
              the four captures. Making it readable is most of the point. */}
          {recipe.when ? (
            <Section title="When to use it">
              <Text size="2" as="p">
                {recipe.when}
              </Text>
            </Section>
          ) : null}

          {recipe.slots.length > 0 ? (
            <Section title={`Slots (${recipe.slots.length})`}>
              <Flex direction="column" gap="2">
                {recipe.slots.map((slot) => (
                  <Box key={slot.name}>
                    <Text size="1" weight="bold">
                      {slot.name}
                    </Text>
                    <Text size="2" as="p" color="gray">
                      {slot.description}
                    </Text>
                  </Box>
                ))}
              </Flex>
            </Section>
          ) : null}

          {/* Nothing else in the editor shows these, and they carry the sharpest
              findings in the file: which renderers are stubs, and what the real
              page did that the render cannot. */}
          {recipe.renderNotes.length > 0 ? (
            <Section title={`Render notes (${recipe.renderNotes.length})`}>
              <Flex direction="column" gap="1" asChild>
                <ul style={{ margin: 0, paddingLeft: "1.1rem" }}>
                  {recipe.renderNotes.map((note, i) => (
                    <li key={i}>
                      <Text size="2">{note}</Text>
                    </li>
                  ))}
                </ul>
              </Flex>
            </Section>
          ) : null}

          {/* Collapsed. An outline, not a render: the captures run 30 to 142
              nodes at depth 7, so expanding by default would bury the prose
              above. Painting this tree is render-node.js and a separate
              decision. */}
          {/* A skeleton the walker could read nothing from is a FINDING, not an
            absence: the schema constrains `skeleton` only to "object", the
            walker swallows every shape it cannot read, and a reader opens a
            capture because it may be incomplete. Saying nothing here makes an
            unreadable skeleton identical to a missing one. */}
        {recipe.skeleton && nodeCount === 0 ? (
          <Section title="Skeleton outline">
            <Text size="1" color="amber">
              This capture records a skeleton, but no nodes could be read from
              it.
            </Text>
          </Section>
        ) : null}

        {nodeCount > 0 ? (
            <details>
              <summary style={{ cursor: "pointer" }}>
                <Text size="1" color="gray" weight="bold">
                  Skeleton outline · {nodeCount} nodes
                </Text>
              </summary>
              <Box mt="2">
                {outline.map((node, i) => (
                  <OutlineRow key={`${node.name ?? "node"}-${i}`} node={node} depth={0} />
                ))}
              </Box>
            </details>
          ) : null}

          <Separator size="4" />

          <Text size="1" color="gray">
            Read from <code>{RECIPES_DIR}</code>, which CI generates.{" "}
            <Link href={sourceUrl(recipe.slug)} target="_blank" rel="noreferrer">
              Edit the source on GitHub
            </Link>
            .
          </Text>
        </Flex>
      </section>
    </Card>
  );
}
