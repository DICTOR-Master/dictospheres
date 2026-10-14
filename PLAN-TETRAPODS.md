# Tetrapods: "drop us a tetrapod" (DICTO, 2026-10-14)

A page on dictospheres.com (its own page, linked from the home page) where a visitor who likes the site drops a seaside-style tetrapod,
and it falls and settles on the shared heap that every earlier visitor's tetrapods have made: a guestbook as a breakwater.

## Decided (DICTO)

- **Pieces, seaside style:** chunky tapered legs from a centre, like concrete breakwater tetrapods, in four symmetry families:
  tetrahedral (4 legs), octahedral (6 legs, 3 + 3), cube corners (8 legs), icosahedral (12 legs). Pieces of different families
  stack on each other.
- **Use:** "drop us a tetrapod" if you like the site; it lands on everyone else's.
- **Algae:** the older a tetrapod, the greener it grows, so the heap shows its history (the first visitors' at the bottom, mossy).
- **Place:** its own page (e.g. /tetrapods), with a card on the home page.

## The coast (DICTO, 2026-10-14)

- A real stretch of **Osaka Bay** coast, its land and shore copied from Japan's official elevation data (GSI elevation tiles, free with
  credit, "出典：国土地理院"), softly styled: sand, rocks, green slopes, a moving sea. **No tetrapods in the scene to begin with**: the
  visitors place them.
- Proposed stretch: the natural southern coast around **Misaki and Tannowa** (Sennan), rocky points, small beaches, wooded hills, and
  breakwaters that in real life are lined with tetrapods. Alternative: Suma (Kobe).
- **One standard block drops in with each visit; a visitor may add up to 3 more** of any family.

## How it works

- The visitor's device simulates the fall (rigid bodies, gravity, collisions; a small physics library from a CDN). When the piece
  comes to rest, only its family, position, turn and date are saved. Everyone loads the saved poses as a still heap; a new drop is
  simulated against it.
- No personal data: just a tetrapod and a date. One drop per visitor per day (checked on the server) against spam.
- Works on iPad and phone (big buttons, touch to turn the view).

## Open (DICTO's choice)

- **Storage:** Supabase, a new project (DICTO creates it and sends the project URL and anon key).

## Stages

1. The four piece shapes (legs, proportions) as a quick preview for DICTO.
2. The page with local physics and dropping (no sharing yet), algae by age.
3. Shared heap once storage is set up; daily limit; a soft cap on heap size (old pieces sink into the "seabed").
4. Home-page card; tests on dicto-node (phone and iPad).

DICTO · dictospheres.com
